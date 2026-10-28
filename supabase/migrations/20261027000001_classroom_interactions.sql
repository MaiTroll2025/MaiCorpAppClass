create table public.session_shared_links (
  id uuid primary key default extensions.gen_random_uuid(),
  session_id uuid not null references public.class_sessions (id) on delete cascade,
  created_by uuid not null references public.profiles (id) on delete restrict,
  url text not null check (length(url) between 8 and 2048),
  title text check (title is null or length(title) <= 120),
  description text check (description is null or length(description) <= 300),
  expiration_mode text not null check (expiration_mode in ('5m', '10m', '15m', '30m', '60m', 'entire_stream')),
  created_at timestamptz not null default now(),
  expires_at timestamptz,
  revoked_at timestamptz,
  revoked_reason text check (revoked_reason is null or revoked_reason in ('creator_removed', 'session_ended', 'session_cancelled')),
  check ((expiration_mode = 'entire_stream' and expires_at is null) or (expiration_mode <> 'entire_stream' and expires_at is not null))
);

create table public.class_hand_raises (
  id uuid primary key default extensions.gen_random_uuid(),
  session_id uuid not null references public.class_sessions (id) on delete cascade,
  student_id uuid not null references public.profiles (id) on delete cascade,
  requested_at timestamptz not null default now(),
  status text not null default 'pending' check (status in ('pending', 'approved', 'denied', 'cancelled')),
  decided_at timestamptz,
  decided_by uuid references public.profiles (id) on delete set null,
  speaking_permission_active boolean not null default false,
  speaking_started_at timestamptz,
  speaking_ended_at timestamptz,
  check (not speaking_permission_active or status = 'approved')
);

create unique index class_hand_raises_one_active_request
  on public.class_hand_raises (session_id, student_id)
  where status = 'pending' or speaking_permission_active;
create index class_hand_raises_session_queue_idx
  on public.class_hand_raises (session_id, requested_at)
  where status = 'pending';

create table public.session_access_restrictions (
  id uuid primary key default extensions.gen_random_uuid(),
  session_id uuid not null references public.class_sessions (id) on delete cascade,
  target_user_id uuid not null references public.profiles (id) on delete cascade,
  moderator_id uuid not null references public.profiles (id) on delete restrict,
  restriction_scope text not null check (restriction_scope in ('remove_session', 'block_rejoin', 'suspend_until')),
  reason text check (reason is null or length(reason) <= 300),
  created_at timestamptz not null default now(),
  expires_at timestamptz,
  revoked_at timestamptz,
  check (restriction_scope <> 'suspend_until' or expires_at is not null)
);

create unique index session_access_restrictions_one_active
  on public.session_access_restrictions (session_id, target_user_id)
  where revoked_at is null;
create index session_access_restrictions_expiry_idx
  on public.session_access_restrictions (session_id, expires_at)
  where revoked_at is null;

create table public.classroom_moderation_events (
  id uuid primary key default extensions.gen_random_uuid(),
  session_id uuid not null references public.class_sessions (id) on delete cascade,
  actor_id uuid references public.profiles (id) on delete set null,
  target_user_id uuid references public.profiles (id) on delete set null,
  event_type text not null check (event_type in (
    'link_published', 'link_revoked', 'hand_raised', 'hand_lowered',
    'speaking_approved', 'speaking_denied', 'speaking_revoked',
    'participant_restricted'
  )),
  target_record_id uuid,
  created_at timestamptz not null default now()
);

create index classroom_moderation_events_session_idx
  on public.classroom_moderation_events (session_id, created_at desc);
create index session_shared_links_active_idx
  on public.session_shared_links (session_id, created_at desc)
  where revoked_at is null;

create or replace function public.can_moderate_class_session(target_session_id uuid)
returns boolean
language sql
stable
security definer
set search_path = ''
as $$
  select exists (
    select 1
    from public.class_sessions s
    where s.id = target_session_id
      and (
        public.has_platform_role(array['admin'])
        or (
          s.instructor_id = (select auth.uid())
          and public.has_platform_role(array['instructor'])
        )
      )
  );
$$;

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
      and s.status in ('scheduled', 'live')
      and c.status = 'published'
      and (
        (
          public.has_platform_role(array['student'])
          and (
            c.access_level = 'free'
            or public.has_active_course_enrollment(c.id)
          )
        )
        or (
          s.instructor_id = (select auth.uid())
          and public.has_platform_role(array['instructor'])
        )
        or public.has_platform_role(array['admin'])
      )
      and not exists (
        select 1
        from public.session_access_restrictions r
        where r.session_id = s.id
          and r.target_user_id = (select auth.uid())
          and r.revoked_at is null
          and (r.expires_at is null or r.expires_at > now())
      )
  );
$$;

revoke all on function public.can_moderate_class_session(uuid) from public, anon;
grant execute on function public.can_moderate_class_session(uuid) to authenticated;
revoke all on function public.can_access_class_session(uuid) from public, anon;
grant execute on function public.can_access_class_session(uuid) to authenticated;

create policy "Instructors see profiles for their students"
on public.profiles for select to authenticated
using (
  exists (
    select 1 from public.enrollments e
    where e.user_id = profiles.id and public.owns_course(e.course_id)
  )
  or exists (
    select 1 from public.class_attendance a
    join public.class_sessions s on s.id = a.session_id
    where a.user_id = profiles.id
      and s.instructor_id = (select auth.uid())
      and (select public.has_platform_role(array['instructor']))
  )
  or exists (
    select 1 from public.class_hand_raises h
    join public.class_sessions s on s.id = h.session_id
    where h.student_id = profiles.id
      and s.instructor_id = (select auth.uid())
      and (select public.has_platform_role(array['instructor']))
  )
);

create or replace function public.publish_classroom_link(
  target_session_id uuid,
  link_url text,
  link_title text default null,
  link_description text default null,
  duration_mode text default '5m'
)
returns public.session_shared_links
language plpgsql
security definer
set search_path = ''
as $$
declare
  current_user_id uuid := (select auth.uid());
  current_session public.class_sessions%rowtype;
  created_link public.session_shared_links%rowtype;
  authority text;
  recent_link_count integer;
  expiration_duration interval;
begin
  if current_user_id is null or not public.can_moderate_class_session(target_session_id) then
    raise exception 'You are not authorized to share links in this class.' using errcode = '42501';
  end if;

  select * into current_session
  from public.class_sessions
  where id = target_session_id
  for update;

  if current_session.id is null or current_session.status <> 'live' then
    raise exception 'Links can only be shared during a live class.' using errcode = '22023';
  end if;

  if link_url is null
     or length(link_url) > 2048
     or link_url !~* '^https?://[^[:space:]]+$' then
    raise exception 'Enter a valid HTTP or HTTPS link.' using errcode = '22023';
  end if;

  authority := split_part(
    split_part(
      split_part(regexp_replace(link_url, '^https?://', '', 'i'), '/', 1),
      '?', 1
    ),
    '#', 1
  );
  if authority !~ '^[A-Za-z0-9.-]+(:[0-9]{1,5})?$'
     or authority ~ '(^[.-]|[.-]$|[.-][.-])' then
    raise exception 'Enter a valid HTTP or HTTPS link.' using errcode = '22023';
  end if;
  if position(':' in authority) > 0
     and split_part(authority, ':', 2)::integer not between 1 and 65535 then
    raise exception 'Enter a valid HTTP or HTTPS link.' using errcode = '22023';
  end if;

  if link_title is not null and length(link_title) > 120 then
    raise exception 'Link title must be 120 characters or fewer.' using errcode = '22023';
  end if;
  if link_description is not null and length(link_description) > 300 then
    raise exception 'Link description must be 300 characters or fewer.' using errcode = '22023';
  end if;

  expiration_duration := case duration_mode
    when '5m' then interval '5 minutes'
    when '10m' then interval '10 minutes'
    when '15m' then interval '15 minutes'
    when '30m' then interval '30 minutes'
    when '60m' then interval '60 minutes'
    when 'entire_stream' then null
    else null
  end;
  if duration_mode not in ('5m', '10m', '15m', '30m', '60m', 'entire_stream') then
    raise exception 'Choose a supported link duration.' using errcode = '22023';
  end if;

  select count(*) into recent_link_count
  from public.session_shared_links
  where session_id = target_session_id
    and created_by = current_user_id
    and created_at > now() - interval '1 minute';
  if recent_link_count >= 8 then
    raise exception 'Link sharing is temporarily rate limited.' using errcode = '22023';
  end if;

  insert into public.session_shared_links (
    session_id, created_by, url, title, description, expiration_mode, expires_at
  )
  values (
    target_session_id, current_user_id, link_url, nullif(btrim(link_title), ''),
    nullif(btrim(link_description), ''), duration_mode,
    case when expiration_duration is null then null else now() + expiration_duration end
  )
  returning * into created_link;

  insert into public.classroom_moderation_events (
    session_id, actor_id, event_type, target_record_id
  ) values (target_session_id, current_user_id, 'link_published', created_link.id);

  return created_link;
end;
$$;

create or replace function public.revoke_classroom_link(target_link_id uuid)
returns boolean
language plpgsql
security definer
set search_path = ''
as $$
declare
  link_row public.session_shared_links%rowtype;
  current_user_id uuid := (select auth.uid());
begin
  select * into link_row
  from public.session_shared_links
  where id = target_link_id
  for update;

  if link_row.id is null
     or current_user_id is null
     or not (
       link_row.created_by = current_user_id
       or public.can_moderate_class_session(link_row.session_id)
     ) then
    raise exception 'You are not authorized to remove this link.' using errcode = '42501';
  end if;
  if link_row.revoked_at is not null then
    return false;
  end if;

  update public.session_shared_links
  set revoked_at = now(), revoked_reason = 'creator_removed'
  where id = target_link_id;
  insert into public.classroom_moderation_events (
    session_id, actor_id, event_type, target_record_id
  ) values (link_row.session_id, current_user_id, 'link_revoked', target_link_id);
  return true;
end;
$$;

create or replace function public.raise_classroom_hand(target_session_id uuid)
returns uuid
language plpgsql
security definer
set search_path = ''
as $$
declare
  current_user_id uuid := (select auth.uid());
  request_id uuid;
  current_session public.class_sessions%rowtype;
  recent_request_count integer;
begin
  if current_user_id is null
     or not public.can_access_class_session(target_session_id)
     or not public.has_platform_role(array['student']) then
    raise exception 'You are not authorized to raise your hand in this class.' using errcode = '42501';
  end if;

  select * into current_session
  from public.class_sessions
  where id = target_session_id
  for update;
  if current_session.id is null or current_session.status <> 'live' then
    raise exception 'Hands can only be raised during a live class.' using errcode = '22023';
  end if;

  select id into request_id
  from public.class_hand_raises
  where session_id = target_session_id
    and student_id = current_user_id
    and (status = 'pending' or speaking_permission_active)
  order by requested_at desc
  limit 1;
  if request_id is not null then
    return request_id;
  end if;

  select count(*) into recent_request_count
  from public.class_hand_raises
  where session_id = target_session_id
    and student_id = current_user_id
    and requested_at > now() - interval '1 minute';
  if recent_request_count >= 5 then
    raise exception 'Hand raising is temporarily rate limited.' using errcode = '22023';
  end if;

  insert into public.class_hand_raises (session_id, student_id)
  values (target_session_id, current_user_id)
  returning id into request_id;

  insert into public.classroom_moderation_events (
    session_id, actor_id, target_user_id, event_type, target_record_id
  ) values (target_session_id, current_user_id, current_user_id, 'hand_raised', request_id);
  return request_id;
end;
$$;

create or replace function public.lower_classroom_hand(target_request_id uuid)
returns boolean
language plpgsql
security definer
set search_path = ''
as $$
declare
  request_row public.class_hand_raises%rowtype;
  current_user_id uuid := (select auth.uid());
begin
  select * into request_row
  from public.class_hand_raises
  where id = target_request_id
  for update;
  if request_row.id is null
     or current_user_id is null
     or request_row.student_id <> current_user_id then
    raise exception 'You are not authorized to lower this hand.' using errcode = '42501';
  end if;
  if request_row.status not in ('pending', 'approved') then
    return false;
  end if;

  update public.class_hand_raises
  set status = 'cancelled',
      speaking_permission_active = false,
      speaking_ended_at = case when speaking_permission_active then now() else speaking_ended_at end
  where id = target_request_id;
  insert into public.classroom_moderation_events (
    session_id, actor_id, target_user_id, event_type, target_record_id
  ) values (request_row.session_id, current_user_id, current_user_id, 'hand_lowered', target_request_id);
  return true;
end;
$$;

create or replace function public.decide_classroom_hand(
  target_request_id uuid,
  decision text
)
returns boolean
language plpgsql
security definer
set search_path = ''
as $$
declare
  request_row public.class_hand_raises%rowtype;
  current_user_id uuid := (select auth.uid());
begin
  if decision is null or decision not in ('approved', 'denied') then
    raise exception 'Choose approve or deny.' using errcode = '22023';
  end if;

  select * into request_row
  from public.class_hand_raises
  where id = target_request_id
  for update;
  if request_row.id is null or not public.can_moderate_class_session(request_row.session_id) then
    raise exception 'You are not authorized to manage this request.' using errcode = '42501';
  end if;
  if request_row.status <> 'pending'
     or not exists (
       select 1 from public.class_sessions s where s.id = request_row.session_id and s.status = 'live'
     ) then
    return false;
  end if;

  update public.class_hand_raises
  set status = decision,
      decided_at = now(),
      decided_by = current_user_id,
      speaking_permission_active = (decision = 'approved'),
      speaking_started_at = case when decision = 'approved' then now() else null end
  where id = target_request_id;
  insert into public.classroom_moderation_events (
    session_id, actor_id, target_user_id, event_type, target_record_id
  ) values (
    request_row.session_id, current_user_id, request_row.student_id,
    case when decision = 'approved' then 'speaking_approved' else 'speaking_denied' end,
    target_request_id
  );
  return true;
end;
$$;

create or replace function public.revoke_classroom_speaking(target_request_id uuid)
returns boolean
language plpgsql
security definer
set search_path = ''
as $$
declare
  request_row public.class_hand_raises%rowtype;
  current_user_id uuid := (select auth.uid());
begin
  select * into request_row
  from public.class_hand_raises
  where id = target_request_id
  for update;
  if request_row.id is null or not public.can_moderate_class_session(request_row.session_id) then
    raise exception 'You are not authorized to revoke speaking permission.' using errcode = '42501';
  end if;
  if not request_row.speaking_permission_active then
    return false;
  end if;

  update public.class_hand_raises
  set status = 'cancelled', speaking_permission_active = false, speaking_ended_at = now()
  where id = target_request_id;
  insert into public.classroom_moderation_events (
    session_id, actor_id, target_user_id, event_type, target_record_id
  ) values (request_row.session_id, current_user_id, request_row.student_id, 'speaking_revoked', target_request_id);
  return true;
end;
$$;

create or replace function public.restrict_classroom_participant(
  target_session_id uuid,
  p_target_user_id uuid,
  restriction_kind text,
  restriction_reason text default null,
  restriction_expires_at timestamptz default null
)
returns uuid
language plpgsql
security definer
set search_path = ''
as $$
declare
  current_user_id uuid := (select auth.uid());
  restriction_id uuid;
begin
  if current_user_id is null
     or p_target_user_id = current_user_id
     or not public.can_moderate_class_session(target_session_id) then
    raise exception 'You are not authorized to restrict this participant.' using errcode = '42501';
  end if;
  if restriction_kind is null or restriction_kind not in ('remove_session', 'block_rejoin', 'suspend_until')
     or (restriction_kind = 'suspend_until' and (
       restriction_expires_at is null
       or restriction_expires_at <= now()
       or restriction_expires_at > now() + interval '24 hours'
     ))
     or (restriction_reason is not null and length(restriction_reason) > 300) then
    raise exception 'Choose a valid restriction and optional reason.' using errcode = '22023';
  end if;
  if not exists (
    select 1 from public.class_attendance a
    where a.session_id = target_session_id and a.user_id = p_target_user_id
  ) and not exists (
    select 1 from public.class_hand_raises h
    where h.session_id = target_session_id and h.student_id = p_target_user_id
  ) then
    raise exception 'The selected user is not associated with this class.' using errcode = '22023';
  end if;

  update public.session_access_restrictions
  set revoked_at = now()
  where session_id = target_session_id
    and session_access_restrictions.target_user_id = p_target_user_id
    and revoked_at is null;

  insert into public.session_access_restrictions (
    session_id, target_user_id, moderator_id, restriction_scope, reason, expires_at
  )
  values (
    target_session_id, p_target_user_id, current_user_id, restriction_kind,
    nullif(btrim(restriction_reason), ''),
    case when restriction_kind = 'suspend_until' then restriction_expires_at else null end
  )
  returning id into restriction_id;

  update public.class_hand_raises
  set status = 'cancelled',
      speaking_permission_active = false,
      speaking_ended_at = case when speaking_permission_active then now() else speaking_ended_at end
  where session_id = target_session_id
    and student_id = p_target_user_id
    and (status = 'pending' or speaking_permission_active);

  insert into public.classroom_moderation_events (
    session_id, actor_id, target_user_id, event_type, target_record_id
  ) values (target_session_id, current_user_id, p_target_user_id, 'participant_restricted', restriction_id);
  return restriction_id;
end;
$$;

revoke all on function public.publish_classroom_link(uuid, text, text, text, text) from public, anon;
revoke all on function public.revoke_classroom_link(uuid) from public, anon;
revoke all on function public.raise_classroom_hand(uuid) from public, anon;
revoke all on function public.lower_classroom_hand(uuid) from public, anon;
revoke all on function public.decide_classroom_hand(uuid, text) from public, anon;
revoke all on function public.revoke_classroom_speaking(uuid) from public, anon;
revoke all on function public.restrict_classroom_participant(uuid, uuid, text, text, timestamptz) from public, anon;
grant execute on function public.publish_classroom_link(uuid, text, text, text, text) to authenticated;
grant execute on function public.revoke_classroom_link(uuid) to authenticated;
grant execute on function public.raise_classroom_hand(uuid) to authenticated;
grant execute on function public.lower_classroom_hand(uuid) to authenticated;
grant execute on function public.decide_classroom_hand(uuid, text) to authenticated;
grant execute on function public.revoke_classroom_speaking(uuid) to authenticated;
grant execute on function public.restrict_classroom_participant(uuid, uuid, text, text, timestamptz) to authenticated;

alter table public.session_shared_links enable row level security;
alter table public.class_hand_raises enable row level security;
alter table public.session_access_restrictions enable row level security;
alter table public.classroom_moderation_events enable row level security;

grant select on public.session_shared_links, public.class_hand_raises,
  public.session_access_restrictions, public.classroom_moderation_events to authenticated;

create policy "Class members see only active shared links"
on public.session_shared_links for select to authenticated
using (
  (
    revoked_at is null
    and (expires_at is null or expires_at > now())
    and public.can_access_class_session(session_id)
  )
  or public.can_moderate_class_session(session_id)
);

create policy "Students see their own hand requests and moderators see the queue"
on public.class_hand_raises for select to authenticated
using (
  student_id = (select auth.uid())
  or public.can_moderate_class_session(session_id)
);

create policy "Users see their own class restrictions"
on public.session_access_restrictions for select to authenticated
using (
  target_user_id = (select auth.uid())
  or public.can_moderate_class_session(session_id)
);

create policy "Users see safe moderation events about themselves"
on public.classroom_moderation_events for select to authenticated
using (
  target_user_id = (select auth.uid())
  or public.can_moderate_class_session(session_id)
);

create policy "Session access restrictions apply to class reads"
on public.class_sessions as restrictive for select to authenticated
using (
  public.can_access_class_session(id)
  or public.can_moderate_class_session(id)
);

create or replace function public.clear_classroom_state_when_session_ends()
returns trigger
language plpgsql
security definer
set search_path = ''
as $$
begin
  if old.status is distinct from new.status and new.status in ('ended', 'cancelled') then
    update public.session_shared_links
    set revoked_at = coalesce(revoked_at, now()),
        revoked_reason = case when new.status = 'cancelled' then 'session_cancelled' else 'session_ended' end
    where session_id = new.id and revoked_at is null;

    update public.class_hand_raises
    set status = case when status = 'pending' or speaking_permission_active then 'cancelled' else status end,
        speaking_permission_active = false,
        speaking_ended_at = case when speaking_permission_active then now() else speaking_ended_at end
    where session_id = new.id
      and (status = 'pending' or speaking_permission_active);

    update public.session_access_restrictions
    set revoked_at = coalesce(revoked_at, now())
    where session_id = new.id and revoked_at is null;
  end if;
  return new;
end;
$$;

revoke all on function public.clear_classroom_state_when_session_ends() from public, anon, authenticated;

create trigger clear_classroom_state_on_session_end
after update of status on public.class_sessions
for each row execute function public.clear_classroom_state_when_session_ends();

create or replace function public.recover_stale_classroom_sessions()
returns integer
language plpgsql
security definer
set search_path = ''
as $$
declare
  ended_count integer;
begin
  update public.class_sessions
  set status = 'ended',
      started_at = coalesce(started_at, now()),
      ended_at = coalesce(ended_at, now())
  where status = 'live'
    and scheduled_at + make_interval(mins => coalesce(expected_duration_minutes, 60)) + interval '30 minutes' < now();
  get diagnostics ended_count = row_count;
  return ended_count;
end;
$$;

revoke all on function public.recover_stale_classroom_sessions() from public, anon, authenticated;
grant execute on function public.recover_stale_classroom_sessions() to service_role;

alter table public.session_shared_links replica identity full;
alter table public.class_hand_raises replica identity full;
alter table public.session_access_restrictions replica identity full;
alter table public.classroom_moderation_events replica identity full;
alter table public.class_attendance replica identity full;

do $$
declare
  table_name text;
begin
  if exists (select 1 from pg_publication where pubname = 'supabase_realtime') then
    foreach table_name in array array[
      'session_shared_links',
      'class_hand_raises',
      'session_access_restrictions',
      'classroom_moderation_events',
      'class_attendance'
    ]
    loop
      if not exists (
        select 1 from pg_publication_tables
        where pubname = 'supabase_realtime'
          and schemaname = 'public'
          and tablename = table_name
      ) then
        execute format('alter publication supabase_realtime add table public.%I', table_name);
      end if;
    end loop;
  end if;
end;
$$;
