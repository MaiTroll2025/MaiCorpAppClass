create table public.platform_settings (
  singleton boolean primary key default true check (singleton),
  public_launch_at timestamptz,
  updated_at timestamptz not null default now()
);

insert into public.platform_settings (singleton, public_launch_at)
values (true, null)
on conflict (singleton) do nothing;

create table public.launch_metric_exclusions (
  user_id uuid primary key references public.profiles (id) on delete cascade,
  reason text not null check (length(btrim(reason)) between 1 and 500),
  created_by uuid not null references public.profiles (id) on delete restrict,
  created_at timestamptz not null default now()
);

create table public.admin_audit_log (
  id uuid primary key default extensions.gen_random_uuid(),
  actor_id uuid not null references public.profiles (id) on delete restrict,
  action text not null,
  target_user_id uuid references public.profiles (id) on delete set null,
  details jsonb not null default '{}'::jsonb,
  created_at timestamptz not null default now()
);

create index admin_audit_log_created_idx on public.admin_audit_log (created_at desc);
create index admin_audit_log_target_idx on public.admin_audit_log (target_user_id, created_at desc);

create table public.student_plan_entitlements (
  user_id uuid primary key references public.profiles (id) on delete cascade,
  plan_id text not null check (plan_id in ('live-learner', 'personal-builder', 'app-support', 'app-portfolio')),
  included_project_count integer not null check (included_project_count >= 0),
  support_project_limit integer not null check (support_project_limit >= 0),
  status text not null default 'active' check (status in ('active', 'revoked')),
  payment_provider text not null check (length(btrim(payment_provider)) between 1 and 80),
  provider_transaction_id text not null check (length(btrim(provider_transaction_id)) between 1 and 255),
  purchased_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  unique (payment_provider, provider_transaction_id)
);

alter table public.courses
  add column required_plan_id text
  check (required_plan_id is null or required_plan_id in ('live-learner', 'personal-builder', 'app-support', 'app-portfolio'));

alter table public.courses
  add constraint courses_required_plan_access_check
  check (required_plan_id is null or access_level = 'subscription');

create or replace function public.has_active_plan_course_access(target_course_id uuid)
returns boolean
language sql
stable
security definer
set search_path = ''
as $$
  select exists (
    select 1
    from public.courses c
    join public.student_plan_entitlements entitlement
      on entitlement.user_id = (select auth.uid())
      and entitlement.status = 'active'
    where c.id = target_course_id
      and c.required_plan_id is not null
      and array_position(array['live-learner', 'personal-builder', 'app-support', 'app-portfolio'], entitlement.plan_id)
        >= array_position(array['live-learner', 'personal-builder', 'app-support', 'app-portfolio'], c.required_plan_id)
  );
$$;

create or replace function public.has_active_course_enrollment(target_course_id uuid)
returns boolean
language sql
stable
security definer
set search_path = ''
as $$
  select
    exists (
      select 1
      from public.enrollments e
      where e.course_id = target_course_id
        and e.user_id = (select auth.uid())
        and e.status in ('active', 'completed')
    )
    or public.has_active_plan_course_access(target_course_id);
$$;

create or replace function public.enroll_students_with_plan_course_access()
returns trigger
language plpgsql
security definer
set search_path = ''
as $$
begin
  if new.status = 'published' and new.access_level = 'subscription' and new.required_plan_id is not null then
    insert into public.enrollments (user_id, course_id, status)
    select entitlement.user_id, new.id, 'active'
    from public.student_plan_entitlements entitlement
    where entitlement.status = 'active'
      and array_position(array['live-learner', 'personal-builder', 'app-support', 'app-portfolio'], entitlement.plan_id)
        >= array_position(array['live-learner', 'personal-builder', 'app-support', 'app-portfolio'], new.required_plan_id)
    on conflict (user_id, course_id) do update
      set status = 'active'
      where public.enrollments.status = 'cancelled';
  end if;
  return new;
end;
$$;

create trigger courses_enroll_plan_entitlements
after insert or update of status, access_level, required_plan_id on public.courses
for each row execute function public.enroll_students_with_plan_course_access();

create table public.student_app_projects (
  id uuid primary key default extensions.gen_random_uuid(),
  owner_id uuid not null references public.profiles (id) on delete cascade,
  project_number integer not null check (project_number > 0),
  name text not null check (length(btrim(name)) between 1 and 120),
  description text not null default '' check (length(description) <= 2000),
  status text not null default 'planning' check (
    status in ('planning', 'learning', 'in_development', 'testing', 'ready_for_deployment', 'completed', 'paused')
  ),
  funding_source text not null check (funding_source in ('included', 'credit')),
  idempotency_key text not null check (length(btrim(idempotency_key)) between 8 and 120),
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  unique (owner_id, project_number),
  unique (owner_id, idempotency_key)
);

create table public.app_credit_transactions (
  id uuid primary key default extensions.gen_random_uuid(),
  user_id uuid not null references public.profiles (id) on delete cascade,
  project_id uuid references public.student_app_projects (id) on delete set null,
  credit_delta integer not null check (credit_delta <> 0),
  transaction_type text not null check (
    transaction_type in ('purchase', 'project_spend', 'refund', 'admin_adjustment')
  ),
  idempotency_key text not null unique check (length(btrim(idempotency_key)) between 8 and 255),
  payment_provider text,
  provider_transaction_id text,
  reason text not null check (length(btrim(reason)) between 1 and 500),
  created_at timestamptz not null default now(),
  check (
    (transaction_type = 'purchase' and credit_delta > 0 and payment_provider is not null and provider_transaction_id is not null)
    or (transaction_type = 'project_spend' and credit_delta = -1 and project_id is not null)
    or (transaction_type in ('refund', 'admin_adjustment') and payment_provider is null)
  ),
  unique (payment_provider, provider_transaction_id)
);

create index student_app_projects_owner_created_idx on public.student_app_projects (owner_id, created_at desc);
create index app_credit_transactions_user_created_idx on public.app_credit_transactions (user_id, created_at desc);
create index student_plan_entitlements_status_idx on public.student_plan_entitlements (status, plan_id);

create trigger student_plan_entitlements_set_updated_at
before update on public.student_plan_entitlements
for each row execute function public.set_updated_at();

create trigger student_app_projects_set_updated_at
before update on public.student_app_projects
for each row execute function public.set_updated_at();

alter table public.platform_settings enable row level security;
alter table public.launch_metric_exclusions enable row level security;
alter table public.admin_audit_log enable row level security;
alter table public.student_plan_entitlements enable row level security;
alter table public.student_app_projects enable row level security;
alter table public.app_credit_transactions enable row level security;

revoke all on public.platform_settings, public.launch_metric_exclusions, public.admin_audit_log,
  public.student_plan_entitlements, public.student_app_projects, public.app_credit_transactions
  from public, anon, authenticated;

grant select on public.platform_settings to anon, authenticated;
grant select on public.launch_metric_exclusions, public.admin_audit_log to authenticated;
grant select on public.student_plan_entitlements, public.student_app_projects,
  public.app_credit_transactions to authenticated;
grant update (name, description, status) on public.student_app_projects to authenticated;

create policy "Public launch date is readable"
on public.platform_settings for select to anon, authenticated
using (singleton);

create policy "Admins view launch metric exclusions"
on public.launch_metric_exclusions for select to authenticated
using ((select public.has_platform_role(array['admin'])));

create policy "Admins view administrative audit"
on public.admin_audit_log for select to authenticated
using ((select public.has_platform_role(array['admin'])));

create policy "Users view their tier entitlement"
on public.student_plan_entitlements for select to authenticated
using (user_id = (select auth.uid()) or (select public.has_platform_role(array['admin'])));

create policy "Students view their app projects"
on public.student_app_projects for select to authenticated
using (owner_id = (select auth.uid()) or (select public.has_platform_role(array['admin'])));

create policy "Students update their own app projects"
on public.student_app_projects for update to authenticated
using (owner_id = (select auth.uid()) and (select public.has_platform_role(array['student'])))
with check (owner_id = (select auth.uid()) and (select public.has_platform_role(array['student'])));

create policy "Users view their credit transactions"
on public.app_credit_transactions for select to authenticated
using (user_id = (select auth.uid()) or (select public.has_platform_role(array['admin'])));

create or replace function public.get_public_launch_stats()
returns table (enrolled_students bigint, public_launch_at timestamptz)
language sql
stable
security definer
set search_path = ''
as $$
  select
    (
      select count(distinct e.user_id)
      from public.enrollments e
      join public.profiles p
        on p.id = e.user_id
        and p.role = 'student'
        and p.account_status = 'active'
      join public.courses c
        on c.id = e.course_id
      where e.status in ('active', 'completed')
        and (
          c.access_level = 'free'
          or exists (
            select 1
            from public.student_plan_entitlements entitlement
            where entitlement.user_id = e.user_id
              and entitlement.status = 'active'
          )
        )
        and not exists (
          select 1
          from public.launch_metric_exclusions exclusion
          where exclusion.user_id = e.user_id
        )
    ),
    setting.public_launch_at
  from public.platform_settings setting
  where setting.singleton;
$$;

create or replace function public.set_public_launch_at(new_launch_at timestamptz)
returns timestamptz
language plpgsql
security definer
set search_path = ''
as $$
declare
  actor uuid := (select auth.uid());
begin
  if actor is null or not public.has_platform_role(array['admin']) then
    raise exception 'Only active administrators may change the public launch date.'
      using errcode = '42501';
  end if;

  update public.platform_settings
  set public_launch_at = new_launch_at,
      updated_at = now()
  where singleton;

  insert into public.admin_audit_log (actor_id, action, details)
  values (
    actor,
    'public_launch_date_changed',
    jsonb_build_object('launch_at', new_launch_at)
  );

  return new_launch_at;
end;
$$;

create or replace function public.set_launch_metric_exclusion(
  target_user_id uuid,
  exclude_from_count boolean,
  exclusion_reason text default null
)
returns boolean
language plpgsql
security definer
set search_path = ''
as $$
declare
  actor uuid := (select auth.uid());
  target_role text;
begin
  if actor is null or not public.has_platform_role(array['admin']) then
    raise exception 'Only active administrators may manage launch-count exclusions.'
      using errcode = '42501';
  end if;

  select role into target_role
  from public.profiles
  where id = target_user_id;

  if target_role is distinct from 'student' then
    raise exception 'Only student accounts may be excluded from the launch count.'
      using errcode = '22023';
  end if;

  if exclude_from_count then
    if exclusion_reason is null or length(btrim(exclusion_reason)) not between 1 and 500 then
      raise exception 'Provide a reason of 1 to 500 characters.'
        using errcode = '22023';
    end if;

    insert into public.launch_metric_exclusions (user_id, reason, created_by)
    values (target_user_id, btrim(exclusion_reason), actor)
    on conflict (user_id) do update
      set reason = excluded.reason,
          created_by = excluded.created_by,
          created_at = now();
  else
    delete from public.launch_metric_exclusions
    where user_id = target_user_id;
  end if;

  insert into public.admin_audit_log (actor_id, action, target_user_id, details)
  values (
    actor,
    case when exclude_from_count then 'launch_metric_exclusion_added' else 'launch_metric_exclusion_removed' end,
    target_user_id,
    jsonb_build_object('reason', case when exclude_from_count then btrim(exclusion_reason) else null end)
  );

  return exclude_from_count;
end;
$$;

create or replace function public.get_my_app_credit_balance()
returns bigint
language plpgsql
stable
security definer
set search_path = ''
as $$
declare
  actor uuid := (select auth.uid());
begin
  if actor is null or not public.has_platform_role(array['student']) then
    raise exception 'An active student account is required to view App Credits.'
      using errcode = '42501';
  end if;

  return coalesce((
    select sum(transaction.credit_delta)
    from public.app_credit_transactions transaction
    where transaction.user_id = actor
  ), 0);
end;
$$;

create or replace function public.create_student_app_project(
  project_name text,
  project_description text,
  request_idempotency_key text
)
returns public.student_app_projects
language plpgsql
security definer
set search_path = ''
as $$
declare
  actor uuid := (select auth.uid());
  entitlement public.student_plan_entitlements%rowtype;
  existing_project public.student_app_projects%rowtype;
  created_project public.student_app_projects%rowtype;
  projects_used integer;
  available_credits bigint;
  funding text;
begin
  if actor is null or not public.has_platform_role(array['student']) then
    raise exception 'An active student account is required to create a project.'
      using errcode = '42501';
  end if;
  if project_name is null or length(btrim(project_name)) not between 1 and 120 then
    raise exception 'Project name must be between 1 and 120 characters.'
      using errcode = '22023';
  end if;
  if project_description is not null and length(project_description) > 2000 then
    raise exception 'Project description must not exceed 2000 characters.'
      using errcode = '22023';
  end if;
  if request_idempotency_key is null or length(btrim(request_idempotency_key)) not between 8 and 120 then
    raise exception 'A valid project request key is required.'
      using errcode = '22023';
  end if;

  select * into existing_project
  from public.student_app_projects
  where owner_id = actor
    and idempotency_key = btrim(request_idempotency_key);
  if found then
    return existing_project;
  end if;

  select * into entitlement
  from public.student_plan_entitlements
  where user_id = actor
    and status = 'active'
  for update;
  if not found then
    raise exception 'A verified, active one-time plan purchase is required before starting an app project.'
      using errcode = 'P1001';
  end if;

  select * into existing_project
  from public.student_app_projects
  where owner_id = actor
    and idempotency_key = btrim(request_idempotency_key);
  if found then
    return existing_project;
  end if;

  select count(*) into projects_used
  from public.student_app_projects
  where owner_id = actor;

  if projects_used < entitlement.included_project_count then
    funding := 'included';
  else
    select coalesce(sum(transaction.credit_delta), 0) into available_credits
    from public.app_credit_transactions transaction
    where transaction.user_id = actor;

    if available_credits < 1 then
      raise exception 'This tier’s included projects have been used. One App Credit is required for each additional app.'
        using errcode = 'P1002';
    end if;
    funding := 'credit';
  end if;

  insert into public.student_app_projects (
    owner_id, project_number, name, description, funding_source, idempotency_key
  )
  values (
    actor,
    projects_used + 1,
    btrim(project_name),
    coalesce(project_description, ''),
    funding,
    btrim(request_idempotency_key)
  )
  returning * into created_project;

  if funding = 'credit' then
    insert into public.app_credit_transactions (
      user_id, project_id, credit_delta, transaction_type, idempotency_key, reason
    )
    values (
      actor,
      created_project.id,
      -1,
      'project_spend',
      'project-spend:' || actor::text || ':' || btrim(request_idempotency_key),
      'One App Credit used to start app project ' || created_project.project_number::text
    );
  end if;

  return created_project;
end;
$$;

create or replace function public.record_verified_plan_purchase(
  target_user_id uuid,
  purchased_plan_id text,
  verified_provider text,
  verified_transaction_id text
)
returns public.student_plan_entitlements
language plpgsql
security definer
set search_path = ''
as $$
declare
  existing_entitlement public.student_plan_entitlements%rowtype;
  result public.student_plan_entitlements%rowtype;
  included_projects integer;
  support_projects integer;
begin
  if coalesce(auth.role(), '') <> 'service_role' then
    raise exception 'Only a trusted payment verification service may grant plan access.'
      using errcode = '42501';
  end if;
  if purchased_plan_id not in ('live-learner', 'personal-builder', 'app-support', 'app-portfolio') then
    raise exception 'Unknown plan.'
      using errcode = '22023';
  end if;
  if verified_provider is null or length(btrim(verified_provider)) not between 1 and 80
      or verified_transaction_id is null or length(btrim(verified_transaction_id)) not between 1 and 255 then
    raise exception 'Verified provider and transaction identifiers are required.'
      using errcode = '22023';
  end if;

  perform pg_advisory_xact_lock(
    hashtextextended(btrim(verified_provider) || ':' || btrim(verified_transaction_id), 0)
  );

  select * into existing_entitlement
  from public.student_plan_entitlements
  where payment_provider = btrim(verified_provider)
    and provider_transaction_id = btrim(verified_transaction_id);
  if found then
    if existing_entitlement.user_id <> target_user_id then
      raise exception 'Verified transaction is already associated with another account.'
        using errcode = '23505';
    end if;
    return existing_entitlement;
  end if;

  perform 1
  from public.profiles
  where id = target_user_id and role = 'student' and account_status = 'active'
  for update;
  if not found then
    raise exception 'An active student account is required.'
      using errcode = '22023';
  end if;

  included_projects := case when purchased_plan_id = 'app-portfolio' then 3 else 1 end;
  support_projects := case
    when purchased_plan_id = 'app-support' then 1
    when purchased_plan_id = 'app-portfolio' then 3
    else 0
  end;

  insert into public.student_plan_entitlements (
    user_id, plan_id, included_project_count, support_project_limit,
    payment_provider, provider_transaction_id, purchased_at, status
  )
  values (
    target_user_id, purchased_plan_id, included_projects, support_projects,
    btrim(verified_provider), btrim(verified_transaction_id), now(), 'active'
  )
  on conflict (user_id) do update
    set plan_id = excluded.plan_id,
        included_project_count = excluded.included_project_count,
        support_project_limit = excluded.support_project_limit,
        payment_provider = excluded.payment_provider,
        provider_transaction_id = excluded.provider_transaction_id,
        purchased_at = excluded.purchased_at,
        status = 'active',
        updated_at = now()
  returning * into result;

  insert into public.enrollments (user_id, course_id, status)
  select target_user_id, c.id, 'active'
  from public.courses c
  where c.status = 'published'
    and c.access_level = 'subscription'
    and c.required_plan_id is not null
    and array_position(array['live-learner', 'personal-builder', 'app-support', 'app-portfolio'], purchased_plan_id)
      >= array_position(array['live-learner', 'personal-builder', 'app-support', 'app-portfolio'], c.required_plan_id)
  on conflict (user_id, course_id) do update
    set status = 'active'
    where public.enrollments.status = 'cancelled';

  return result;
end;
$$;

create or replace function public.record_verified_app_credit_purchase(
  target_user_id uuid,
  purchased_credits integer,
  verified_provider text,
  verified_transaction_id text
)
returns bigint
language plpgsql
security definer
set search_path = ''
as $$
declare
  existing_transaction public.app_credit_transactions%rowtype;
begin
  if coalesce(auth.role(), '') <> 'service_role' then
    raise exception 'Only a trusted payment verification service may add purchased App Credits.'
      using errcode = '42501';
  end if;
  if purchased_credits is null or purchased_credits < 1 then
    raise exception 'At least one App Credit must be purchased.'
      using errcode = '22023';
  end if;
  if verified_provider is null or length(btrim(verified_provider)) not between 1 and 80
      or verified_transaction_id is null or length(btrim(verified_transaction_id)) not between 1 and 255 then
    raise exception 'Verified provider and transaction identifiers are required.'
      using errcode = '22023';
  end if;
  if not exists (
    select 1 from public.profiles
    where id = target_user_id and role = 'student' and account_status = 'active'
  ) then
    raise exception 'An active student account is required.'
      using errcode = '22023';
  end if;

  perform pg_advisory_xact_lock(
    hashtextextended(btrim(verified_provider) || ':' || btrim(verified_transaction_id), 0)
  );

  select * into existing_transaction
  from public.app_credit_transactions
  where payment_provider = btrim(verified_provider)
    and provider_transaction_id = btrim(verified_transaction_id);
  if found then
    if existing_transaction.user_id <> target_user_id
        or existing_transaction.credit_delta <> purchased_credits
        or existing_transaction.transaction_type <> 'purchase' then
      raise exception 'Verified transaction conflicts with an existing credit ledger entry.'
        using errcode = '23505';
    end if;
  else
    insert into public.app_credit_transactions (
      user_id, credit_delta, transaction_type, idempotency_key,
      payment_provider, provider_transaction_id, reason
    )
    values (
      target_user_id,
      purchased_credits,
      'purchase',
      'credit-purchase:' || md5(btrim(verified_provider) || ':' || btrim(verified_transaction_id)),
      btrim(verified_provider),
      btrim(verified_transaction_id),
      purchased_credits::text || ' App Credit(s) added after payment verification'
    );
  end if;

  return coalesce((
    select sum(transaction.credit_delta)
    from public.app_credit_transactions transaction
    where transaction.user_id = target_user_id
  ), 0);
end;
$$;

revoke all on function public.get_public_launch_stats() from public;
grant execute on function public.get_public_launch_stats() to anon, authenticated;
revoke all on function public.has_active_plan_course_access(uuid) from public, anon;
grant execute on function public.has_active_plan_course_access(uuid) to anon, authenticated;
revoke all on function public.set_public_launch_at(timestamptz) from public, anon;
grant execute on function public.set_public_launch_at(timestamptz) to authenticated;
revoke all on function public.set_launch_metric_exclusion(uuid, boolean, text) from public, anon;
grant execute on function public.set_launch_metric_exclusion(uuid, boolean, text) to authenticated;
revoke all on function public.get_my_app_credit_balance() from public, anon;
grant execute on function public.get_my_app_credit_balance() to authenticated;
revoke all on function public.create_student_app_project(text, text, text) from public, anon;
grant execute on function public.create_student_app_project(text, text, text) to authenticated;
revoke all on function public.record_verified_plan_purchase(uuid, text, text, text) from public, anon, authenticated;
grant execute on function public.record_verified_plan_purchase(uuid, text, text, text) to service_role;
revoke all on function public.record_verified_app_credit_purchase(uuid, integer, text, text) from public, anon, authenticated;
grant execute on function public.record_verified_app_credit_purchase(uuid, integer, text, text) to service_role;
