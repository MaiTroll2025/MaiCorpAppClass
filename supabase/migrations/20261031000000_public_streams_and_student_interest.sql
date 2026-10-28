alter table public.class_sessions
  add column if not exists public_stream_enabled boolean not null default false;

grant insert (public_stream_enabled), update (public_stream_enabled)
on public.class_sessions to authenticated;

create or replace function public.can_access_class_session(target_session_id uuid)
returns boolean
language sql
stable
security definer
set search_path = ''
as $$
  select exists (
    select 1
    from public.class_sessions s
    join public.courses c on c.id = s.course_id
    where s.id = target_session_id
      and s.status in ('scheduled', 'live', 'ended')
      and c.status = 'published'
      and (
        (
          public.has_platform_role(array['student'])
          and (
            c.access_level = 'free'
            or public.has_active_course_enrollment(c.id)
            or (
              s.public_stream_enabled
              and exists (
                select 1 from public.student_plan_entitlements e
                where e.user_id = (select auth.uid())
                  and e.status = 'active'
              )
            )
            or (
              s.public_qa_enabled
              and exists (
                select 1 from public.public_qa_passes p
                where p.session_id = s.id
                  and p.user_id = (select auth.uid())
                  and p.expires_at > now()
              )
            )
          )
        )
        or (
          s.instructor_id = (select auth.uid())
          and public.has_platform_role(array['instructor'])
        )
        or public.has_platform_role(array['admin'])
      )
      and not exists (
        select 1 from public.session_access_restrictions r
        where r.session_id = s.id
          and r.target_user_id = (select auth.uid())
          and r.revoked_at is null
          and (r.expires_at is null or r.expires_at > now())
      )
  )
$$;
revoke all on function public.can_access_class_session(uuid) from public, anon;
grant execute on function public.can_access_class_session(uuid) to authenticated;

drop policy if exists "Class sessions visible to authorized learners" on public.class_sessions;
create policy "Class sessions visible to authorized learners"
on public.class_sessions for select to anon, authenticated
using (
  (
    status in ('scheduled', 'live', 'ended')
    and exists (
      select 1 from public.courses c
      where c.id = class_sessions.course_id
        and c.status = 'published'
        and (
          c.access_level = 'free'
          or public.has_active_course_enrollment(c.id)
          or class_sessions.public_stream_enabled
        )
    )
  )
  or instructor_id = (select auth.uid())
  or (select public.has_platform_role(array['admin']))
);

create table if not exists public.public_stream_previews (
  media_type text not null check (media_type in ('stream', 'recording')),
  media_id uuid not null,
  visitor_ip_hash text not null check (visitor_ip_hash ~ '^[0-9a-f]{64}$'),
  started_at timestamptz not null default now(),
  primary key (media_type, media_id, visitor_ip_hash)
);
alter table public.public_stream_previews enable row level security;
revoke all on public.public_stream_previews from public, anon, authenticated;

create or replace function public.get_public_streams()
returns table (
  session_id uuid,
  title text,
  description text,
  scheduled_at timestamptz,
  status text,
  course_title text,
  instructor_name text
)
language sql
stable
security definer
set search_path = ''
as $$
  select s.id, s.title, s.description, s.scheduled_at, s.status,
    c.title, coalesce(nullif(btrim(p.display_name), ''), 'Instructor')
  from public.class_sessions s
  join public.courses c on c.id = s.course_id
  join public.profiles p on p.id = s.instructor_id
  where s.public_stream_enabled
    and s.status in ('scheduled', 'live')
    and c.status = 'published'
  order by (s.status = 'live') desc, s.scheduled_at asc
  limit 40
$$;
revoke all on function public.get_public_streams() from public;
grant execute on function public.get_public_streams() to anon, authenticated;

create or replace function public.get_public_recordings()
returns table (
  recording_id uuid,
  session_id uuid,
  title text,
  course_title text,
  instructor_name text,
  duration_seconds integer,
  published_at timestamptz
)
language sql
stable
security definer
set search_path = ''
as $$
  select r.id, s.id, s.title, c.title,
    coalesce(nullif(btrim(p.display_name), ''), 'Instructor'),
    r.duration_seconds, r.published_at
  from public.recordings r
  join public.class_sessions s on s.id = r.session_id
  join public.courses c on c.id = s.course_id
  join public.profiles p on p.id = s.instructor_id
  where s.public_stream_enabled
    and c.status = 'published'
    and r.status = 'ready'
    and r.published_at is not null
    and r.storage_path is not null
  order by r.published_at desc
  limit 100
$$;
revoke all on function public.get_public_recordings() from public;
grant execute on function public.get_public_recordings() to anon, authenticated;

create or replace function public.can_watch_public_stream(target_session_id uuid, target_user_id uuid)
returns boolean
language sql
stable
security definer
set search_path = ''
as $$
  select exists (
    select 1
    from public.class_sessions s
    join public.courses c on c.id = s.course_id
    join public.profiles p on p.id = target_user_id
    where s.id = target_session_id
      and s.public_stream_enabled
      and s.status = 'live'
      and c.status = 'published'
      and p.role = 'student'
      and p.account_status = 'active'
      and (
        exists (
          select 1 from public.student_plan_entitlements e
          where e.user_id = target_user_id and e.status = 'active'
        )
        or exists (
          select 1 from public.public_qa_passes pass
          where pass.session_id = s.id
            and pass.user_id = target_user_id
            and pass.expires_at > now()
        )
      )
  )
$$;
revoke all on function public.can_watch_public_stream(uuid, uuid) from public, anon, authenticated;
grant execute on function public.can_watch_public_stream(uuid, uuid) to service_role;

create or replace function public.can_watch_public_recording(target_recording_id uuid, target_user_id uuid)
returns boolean
language sql
stable
security definer
set search_path = ''
as $$
  select exists (
    select 1
    from public.recordings r
    join public.class_sessions s on s.id = r.session_id
    join public.courses c on c.id = s.course_id
    join public.profiles p on p.id = target_user_id
    where r.id = target_recording_id
      and r.status = 'ready'
      and r.published_at is not null
      and r.storage_path is not null
      and s.public_stream_enabled
      and c.status = 'published'
      and p.role = 'student'
      and p.account_status = 'active'
      and (
        exists (
          select 1 from public.student_plan_entitlements e
          where e.user_id = target_user_id and e.status = 'active'
        )
        or exists (
          select 1 from public.public_qa_passes pass
          where pass.session_id = s.id
            and pass.user_id = target_user_id
            and pass.expires_at > now()
        )
      )
  )
$$;
revoke all on function public.can_watch_public_recording(uuid, uuid) from public, anon, authenticated;
grant execute on function public.can_watch_public_recording(uuid, uuid) to service_role;

create or replace function public.grant_public_qa_pass(
  target_session_id uuid,
  target_user_id uuid,
  verified_payment_provider text,
  verified_payment_reference text,
  verified_amount_cents integer
)
returns public.public_qa_passes
language plpgsql
security definer
set search_path = ''
as $$
declare
  granted_pass public.public_qa_passes%rowtype;
begin
  if coalesce(auth.role(), '') <> 'service_role' then
    raise exception 'Only a verified payment service can grant class access.' using errcode = '42501';
  end if;
  if target_user_id is null
     or verified_payment_provider is null
     or length(btrim(verified_payment_provider)) not between 1 and 80
     or verified_payment_reference is null
     or length(btrim(verified_payment_reference)) not between 1 and 200
     or verified_amount_cents is distinct from 1000 then
    raise exception 'Valid payment and attendee details are required.' using errcode = '22023';
  end if;
  if not exists (
    select 1 from public.profiles p
    where p.id = target_user_id
      and p.role = 'student'
      and p.account_status = 'active'
  ) then
    raise exception 'An active student account is required.' using errcode = '22023';
  end if;
  if not exists (
    select 1 from public.class_sessions s
    where s.id = target_session_id
      and s.public_qa_enabled
      and s.public_stream_enabled
      and (
        s.status in ('scheduled', 'live')
        or (
          s.status = 'ended'
          and exists (
            select 1 from public.recordings r
            where r.session_id = s.id
              and r.status = 'ready'
              and r.published_at is not null
              and r.storage_path is not null
          )
        )
      )
  ) then
    raise exception 'This class is not accepting pass purchases.' using errcode = '22023';
  end if;

  insert into public.public_qa_passes (
    session_id, user_id, payment_provider, payment_reference, currency, paid_amount_cents, purchased_at, expires_at
  )
  values (
    target_session_id, target_user_id, btrim(verified_payment_provider),
    btrim(verified_payment_reference), 'USD', verified_amount_cents, now(), now() + interval '24 hours'
  )
  on conflict (payment_provider, payment_reference) do nothing;

  select * into granted_pass
  from public.public_qa_passes
  where payment_provider = btrim(verified_payment_provider)
    and payment_reference = btrim(verified_payment_reference);

  if granted_pass.user_id <> target_user_id or granted_pass.session_id <> target_session_id then
    raise exception 'The payment reference is already assigned to a different attendee or class.' using errcode = '23505';
  end if;
  return granted_pass;
end;
$$;
revoke all on function public.grant_public_qa_pass(uuid, uuid, text, text, integer) from public, anon, authenticated;
grant execute on function public.grant_public_qa_pass(uuid, uuid, text, text, integer) to service_role;

create or replace function public.begin_public_media_preview(
  target_media_type text,
  target_media_id uuid,
  visitor_ip_hash text
)
returns timestamptz
language plpgsql
security definer
set search_path = ''
as $$
declare
  preview_start timestamptz;
  is_available boolean;
begin
  if coalesce(auth.role(), '') <> 'service_role' then
    raise exception 'Only the trusted media service may create a preview grant.' using errcode = '42501';
  end if;
  if target_media_type not in ('stream', 'recording')
     or visitor_ip_hash is null
     or visitor_ip_hash !~ '^[0-9a-f]{64}$' then
    raise exception 'Valid preview details are required.' using errcode = '22023';
  end if;

  if target_media_type = 'stream' then
    select exists (
      select 1 from public.class_sessions s
      join public.courses c on c.id = s.course_id
      where s.id = target_media_id
        and s.public_stream_enabled
        and s.status = 'live'
        and c.status = 'published'
    ) into is_available;
  else
    select exists (
      select 1 from public.recordings r
      join public.class_sessions s on s.id = r.session_id
      join public.courses c on c.id = s.course_id
      where r.id = target_media_id
        and s.public_stream_enabled
        and c.status = 'published'
        and r.status = 'ready'
        and r.published_at is not null
        and r.storage_path is not null
    ) into is_available;
  end if;

  if not is_available then
    raise exception 'This public media is not available.' using errcode = '22023';
  end if;

  insert into public.public_stream_previews (media_type, media_id, visitor_ip_hash)
  values (target_media_type, target_media_id, visitor_ip_hash)
  on conflict (media_type, media_id, visitor_ip_hash) do nothing;

  select started_at into preview_start
  from public.public_stream_previews
  where media_type = target_media_type
    and media_id = target_media_id
    and public_stream_previews.visitor_ip_hash = begin_public_media_preview.visitor_ip_hash;
  return preview_start;
end;
$$;
revoke all on function public.begin_public_media_preview(text, uuid, text) from public, anon, authenticated;
grant execute on function public.begin_public_media_preview(text, uuid, text) to service_role;

create table if not exists public.class_stream_interests (
  id uuid primary key default extensions.gen_random_uuid(),
  session_id uuid not null references public.class_sessions (id) on delete cascade,
  user_id uuid not null references public.profiles (id) on delete cascade,
  app_interest text not null check (length(btrim(app_interest)) between 1 and 160),
  created_at timestamptz not null default now(),
  unique (session_id, user_id, app_interest)
);
create index if not exists class_stream_interests_session_created_idx
  on public.class_stream_interests (session_id, created_at desc);
alter table public.class_stream_interests enable row level security;
alter table public.class_stream_interests replica identity full;
revoke all on public.class_stream_interests from public, anon, authenticated;
grant select on public.class_stream_interests to authenticated;

create policy "Students and class moderators see stream interests"
on public.class_stream_interests for select to authenticated
using (
  user_id = (select auth.uid())
  or public.can_moderate_class_session(session_id)
);

create or replace function public.submit_class_stream_interest(target_session_id uuid, requested_app text)
returns public.class_stream_interests
language plpgsql
security definer
set search_path = ''
as $$
declare
  actor uuid := (select auth.uid());
  result public.class_stream_interests%rowtype;
begin
  if actor is null or not public.has_platform_role(array['student']) then
    raise exception 'An active student account is required to send an interest notice.' using errcode = '42501';
  end if;
  if requested_app is null or length(btrim(requested_app)) not between 1 and 160 then
    raise exception 'Tell the instructor which app you are interested in building.' using errcode = '22023';
  end if;
  if not exists (
    select 1 from public.class_sessions s
    where s.id = target_session_id
      and s.status = 'live'
      and public.can_access_class_session(s.id)
  ) then
    raise exception 'Join an active class you can access before sending an interest notice.' using errcode = '42501';
  end if;

  insert into public.class_stream_interests (session_id, user_id, app_interest)
  values (target_session_id, actor, btrim(requested_app))
  on conflict (session_id, user_id, app_interest) do update
    set created_at = now()
  returning * into result;
  return result;
end;
$$;
revoke all on function public.submit_class_stream_interest(uuid, text) from public, anon;
grant execute on function public.submit_class_stream_interest(uuid, text) to authenticated;

do $$
begin
  if exists (select 1 from pg_publication where pubname = 'supabase_realtime')
     and not exists (
       select 1 from pg_publication_tables
       where pubname = 'supabase_realtime'
         and schemaname = 'public'
         and tablename = 'class_stream_interests'
     ) then
    alter publication supabase_realtime add table public.class_stream_interests;
  end if;
end;
$$;

create or replace function public.update_app_portfolio_project_allowance()
returns trigger
language plpgsql
security definer
set search_path = ''
as $$
begin
  if new.plan_id = 'app-portfolio' then
    update public.student_plan_entitlements
    set included_project_count = 1
    where user_id = new.user_id and included_project_count <> 1;

    insert into public.app_credit_transactions (
      user_id, credit_delta, transaction_type, idempotency_key,
      payment_provider, provider_transaction_id, reason
    )
    values (
      new.user_id, 2, 'purchase',
      'portfolio-credits:' || md5(new.payment_provider || ':' || new.provider_transaction_id),
      'plan-entitlement',
      new.provider_transaction_id,
      'Two additional App Credits included with the App Portfolio plan.'
    )
    on conflict (idempotency_key) do nothing;
  end if;
  return new;
end;
$$;

create trigger student_plan_portfolio_credits
after insert or update of plan_id, provider_transaction_id on public.student_plan_entitlements
for each row execute function public.update_app_portfolio_project_allowance();

insert into storage.buckets (id, name, public, file_size_limit, allowed_mime_types)
values ('class-recordings', 'class-recordings', false, 50000000, array['video/mp4', 'video/webm'])
on conflict (id) do update
  set public = false,
      file_size_limit = 50000000,
      allowed_mime_types = array['video/mp4', 'video/webm'];

create policy "Class moderators upload private recordings"
on storage.objects for insert to authenticated
with check (
  bucket_id = 'class-recordings'
  and exists (
    select 1 from public.class_sessions s
    where s.id::text = split_part(name, '/', 1)
      and public.can_moderate_class_session(s.id)
  )
);

create policy "Class moderators update private recordings"
on storage.objects for update to authenticated
using (
  bucket_id = 'class-recordings'
  and exists (
    select 1 from public.class_sessions s
    where s.id::text = split_part(name, '/', 1)
      and public.can_moderate_class_session(s.id)
  )
)
with check (
  bucket_id = 'class-recordings'
  and exists (
    select 1 from public.class_sessions s
    where s.id::text = split_part(name, '/', 1)
      and public.can_moderate_class_session(s.id)
  )
);

create policy "Class moderators delete private recordings"
on storage.objects for delete to authenticated
using (
  bucket_id = 'class-recordings'
  and exists (
    select 1 from public.class_sessions s
    where s.id::text = split_part(name, '/', 1)
      and public.can_moderate_class_session(s.id)
  )
);

create policy "Class moderators manage recording metadata"
on public.recordings for all to authenticated
using (
  exists (
    select 1 from public.class_sessions s
    where s.id = recordings.session_id
      and public.can_moderate_class_session(s.id)
  )
)
with check (
  exists (
    select 1 from public.class_sessions s
    where s.id = recordings.session_id
      and public.can_moderate_class_session(s.id)
  )
);
grant insert, update on public.recordings to authenticated;

create policy "Public recording listings expose only published metadata"
on public.recordings for select to anon
using (
  status = 'ready'
  and published_at is not null
  and exists (
    select 1 from public.class_sessions s
    join public.courses c on c.id = s.course_id
    where s.id = recordings.session_id
      and s.public_stream_enabled
      and c.status = 'published'
  )
);
grant select on public.recordings to anon;
