alter table public.class_sessions
  add column if not exists public_qa_enabled boolean not null default false,
  add column if not exists allow_student_screen_share boolean not null default false,
  add column if not exists max_participants smallint not null default 50
    check (max_participants between 2 and 250);

create table if not exists public.class_session_join_reservations (
  session_id uuid not null references public.class_sessions (id) on delete cascade,
  user_id uuid not null references public.profiles (id) on delete cascade,
  expires_at timestamptz not null,
  primary key (session_id, user_id)
);
create index if not exists class_session_join_reservations_expiry_idx
  on public.class_session_join_reservations (session_id, expires_at);
alter table public.class_session_join_reservations enable row level security;
revoke all on public.class_session_join_reservations from public, anon, authenticated;

create table if not exists public.public_qa_passes (
  id uuid primary key default extensions.gen_random_uuid(),
  session_id uuid not null references public.class_sessions (id) on delete cascade,
  user_id uuid not null references public.profiles (id) on delete cascade,
  payment_provider text not null check (length(btrim(payment_provider)) between 1 and 80),
  payment_reference text not null check (length(btrim(payment_reference)) between 1 and 200),
  currency text not null default 'USD' check (currency = 'USD'),
  paid_amount_cents integer not null check (paid_amount_cents = 1000),
  purchased_at timestamptz not null default now(),
  expires_at timestamptz not null,
  created_at timestamptz not null default now(),
  unique (payment_provider, payment_reference),
  check (expires_at = purchased_at + interval '24 hours')
);
create index if not exists public_qa_passes_user_session_expiry_idx
  on public.public_qa_passes (user_id, session_id, expires_at desc);
alter table public.public_qa_passes enable row level security;
revoke all on public.public_qa_passes from public, anon, authenticated;
grant select on public.public_qa_passes to authenticated;

create policy "Users see their own public Q&A passes"
on public.public_qa_passes for select to authenticated
using (
  user_id = (select auth.uid())
  or public.can_moderate_class_session(session_id)
);

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
  if auth.role() <> 'service_role' then
    raise exception 'Only a verified payment service can grant public Q&A access.' using errcode = '42501';
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
    select 1 from public.class_sessions s
    where s.id = target_session_id
      and s.public_qa_enabled
      and s.status in ('scheduled', 'live')
  ) then
    raise exception 'This public Q&A event is not accepting pass purchases.' using errcode = '22023';
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
    raise exception 'The payment reference is already assigned to a different attendee or event.' using errcode = '23505';
  end if;
  return granted_pass;
end;
$$;
revoke all on function public.grant_public_qa_pass(uuid, uuid, text, text, integer) from public, anon, authenticated;
grant execute on function public.grant_public_qa_pass(uuid, uuid, text, text, integer) to service_role;

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
        select 1
        from public.session_access_restrictions r
        where r.session_id = s.id
          and r.target_user_id = (select auth.uid())
          and r.revoked_at is null
          and (r.expires_at is null or r.expires_at > now())
      )
  );
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
          or (
            class_sessions.public_qa_enabled
            and (
              status in ('scheduled', 'live')
              or exists (
                select 1 from public.public_qa_passes p
                where p.session_id = class_sessions.id
                  and p.user_id = (select auth.uid())
                  and p.expires_at > now()
                  and public.has_platform_role(array['student'])
              )
            )
          )
        )
    )
  )
  or instructor_id = (select auth.uid())
  or (select public.has_platform_role(array['admin']))
);

create table if not exists public.classroom_messages (
  id uuid primary key default extensions.gen_random_uuid(),
  session_id uuid not null references public.class_sessions (id) on delete cascade,
  user_id uuid not null references public.profiles (id) on delete cascade,
  body text not null check (length(btrim(body)) between 1 and 2000),
  created_at timestamptz not null default now()
);
create index if not exists classroom_messages_session_created_idx
  on public.classroom_messages (session_id, created_at desc);
alter table public.classroom_messages enable row level security;
alter table public.classroom_messages replica identity full;
revoke all on public.classroom_messages from public, anon, authenticated;
grant select on public.classroom_messages to authenticated;

create policy "Authorized class participants read class chat"
on public.classroom_messages for select to authenticated
using (public.can_access_class_session(session_id));

create table if not exists public.classroom_questions (
  id uuid primary key default extensions.gen_random_uuid(),
  session_id uuid not null references public.class_sessions (id) on delete cascade,
  user_id uuid not null references public.profiles (id) on delete cascade,
  question text not null check (length(btrim(question)) between 1 and 1200),
  status text not null default 'open' check (status in ('open', 'answered')),
  response text check (response is null or length(btrim(response)) between 1 and 1200),
  answered_by uuid references public.profiles (id) on delete set null,
  answered_at timestamptz,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  check (
    (status = 'open' and response is null and answered_by is null and answered_at is null)
    or (status = 'answered' and response is not null and answered_by is not null and answered_at is not null)
  )
);
create index if not exists classroom_questions_session_created_idx
  on public.classroom_questions (session_id, created_at);
alter table public.classroom_questions enable row level security;
alter table public.classroom_questions replica identity full;
revoke all on public.classroom_questions from public, anon, authenticated;
grant select on public.classroom_questions to authenticated;
create trigger classroom_questions_set_updated_at before update on public.classroom_questions
for each row execute function public.set_updated_at();
alter table public.class_sessions replica identity full;

create policy "Authorized class participants read class questions"
on public.classroom_questions for select to authenticated
using (public.can_access_class_session(session_id));

create or replace function public.send_classroom_message(
  target_session_id uuid,
  message_body text
)
returns public.classroom_messages
language plpgsql
security definer
set search_path = ''
as $$
declare
  current_user_id uuid := (select auth.uid());
  message_row public.classroom_messages%rowtype;
  recent_count integer;
begin
  if current_user_id is null or not public.can_access_class_session(target_session_id) then
    raise exception 'You are not authorized to use this class chat.' using errcode = '42501';
  end if;
  if message_body is null or length(btrim(message_body)) not between 1 and 2000 then
    raise exception 'Messages must contain 1 to 2000 characters.' using errcode = '22023';
  end if;

  perform 1 from public.class_sessions where id = target_session_id for update;
  if not exists (
    select 1 from public.class_sessions
    where id = target_session_id and status = 'live'
  ) then
    raise exception 'Class chat is available only while the class is live.' using errcode = '22023';
  end if;
  select count(*) into recent_count
  from public.classroom_messages
  where session_id = target_session_id
    and user_id = current_user_id
    and created_at > now() - interval '1 minute';
  if recent_count >= 20 then
    raise exception 'Chat is temporarily rate limited. Please wait before sending another message.' using errcode = '22023';
  end if;

  insert into public.classroom_messages (session_id, user_id, body)
  values (target_session_id, current_user_id, btrim(message_body))
  returning * into message_row;
  return message_row;
end;
$$;

create or replace function public.submit_classroom_question(
  target_session_id uuid,
  question_body text
)
returns public.classroom_questions
language plpgsql
security definer
set search_path = ''
as $$
declare
  current_user_id uuid := (select auth.uid());
  question_row public.classroom_questions%rowtype;
  recent_count integer;
begin
  if current_user_id is null or not public.can_access_class_session(target_session_id) then
    raise exception 'You are not authorized to submit a question in this class.' using errcode = '42501';
  end if;
  if question_body is null or length(btrim(question_body)) not between 1 and 1200 then
    raise exception 'Questions must contain 1 to 1200 characters.' using errcode = '22023';
  end if;
  perform 1 from public.class_sessions where id = target_session_id for update;
  if not exists (
    select 1 from public.class_sessions
    where id = target_session_id and status = 'live'
  ) then
    raise exception 'Questions can be submitted only while the class is live.' using errcode = '22023';
  end if;
  select count(*) into recent_count
  from public.classroom_questions
  where session_id = target_session_id
    and user_id = current_user_id
    and created_at > now() - interval '5 minutes';
  if recent_count >= 5 then
    raise exception 'Question submission is temporarily rate limited.' using errcode = '22023';
  end if;

  insert into public.classroom_questions (session_id, user_id, question)
  values (target_session_id, current_user_id, btrim(question_body))
  returning * into question_row;
  return question_row;
end;
$$;

create or replace function public.update_classroom_question(
  target_question_id uuid,
  new_status text,
  instructor_response text default null
)
returns public.classroom_questions
language plpgsql
security definer
set search_path = ''
as $$
declare
  current_user_id uuid := (select auth.uid());
  question_row public.classroom_questions%rowtype;
begin
  select * into question_row
  from public.classroom_questions
  where id = target_question_id
  for update;
  if question_row.id is null
     or current_user_id is null
     or not public.can_moderate_class_session(question_row.session_id) then
    raise exception 'You are not authorized to update this question.' using errcode = '42501';
  end if;
  if new_status is null or new_status not in ('open', 'answered')
     or (new_status = 'answered' and (
       instructor_response is null
       or length(btrim(instructor_response)) not between 1 and 1200
     )) then
    raise exception 'Provide an answer between 1 and 1200 characters, or reopen the question.' using errcode = '22023';
  end if;
  update public.classroom_questions
  set status = new_status,
      response = case when new_status = 'answered' then btrim(instructor_response) else null end,
      answered_by = case when new_status = 'answered' then current_user_id else null end,
      answered_at = case when new_status = 'answered' then now() else null end
  where id = target_question_id
  returning * into question_row;
  return question_row;
end;
$$;

create or replace function public.record_class_attendance(
  target_session_id uuid,
  attendance_action text
)
returns public.class_attendance
language plpgsql
security definer
set search_path = ''
as $$
declare
  current_user_id uuid := (select auth.uid());
  session_row public.class_sessions%rowtype;
  attendance_row public.class_attendance%rowtype;
  current_role text;
begin
  if current_user_id is null
     or attendance_action is null
     or attendance_action not in ('join', 'leave') then
    raise exception 'Valid attendance action and authenticated account are required.' using errcode = '22023';
  end if;
  select * into session_row
  from public.class_sessions
  where id = target_session_id
  for update;
  if session_row.id is null
     or (attendance_action = 'join' and (
       session_row.status <> 'live'
       or not public.can_access_class_session(target_session_id)
     )) then
    raise exception 'You are not authorized to record attendance for this class.' using errcode = '42501';
  end if;
  select p.role into current_role
  from public.profiles p
  where p.id = current_user_id and p.account_status = 'active';
  if current_role is null then
    raise exception 'An active account is required.' using errcode = '42501';
  end if;

  if attendance_action = 'join' then
    if not exists (
      select 1 from public.class_session_join_reservations r
      where r.session_id = target_session_id
        and r.user_id = current_user_id
        and r.expires_at > now()
    ) and not exists (
      select 1 from public.class_attendance a
      where a.session_id = target_session_id
        and a.user_id = current_user_id
        and a.left_at is null
    ) then
      raise exception 'Re-authorize classroom entry before recording attendance.' using errcode = '42501';
    end if;
    select * into attendance_row
    from public.class_attendance
    where session_id = target_session_id and user_id = current_user_id and left_at is null
    order by joined_at desc
    limit 1;
    if attendance_row.id is null then
      insert into public.class_attendance (session_id, user_id, participant_role)
      values (
        target_session_id, current_user_id,
        case when current_role in ('admin', 'instructor') then 'instructor' else 'student' end
      )
      returning * into attendance_row;
    end if;
    delete from public.class_session_join_reservations
    where session_id = target_session_id and user_id = current_user_id;
    return attendance_row;
  end if;

  update public.class_attendance
  set left_at = now()
  where session_id = target_session_id
    and user_id = current_user_id
    and left_at is null
  returning * into attendance_row;
  delete from public.class_session_join_reservations
  where session_id = target_session_id and user_id = current_user_id;
  return attendance_row;
end;
$$;

create or replace function public.start_class_session(target_session_id uuid)
returns public.class_sessions
language plpgsql
security definer
set search_path = ''
as $$
declare
  session_row public.class_sessions%rowtype;
begin
  select * into session_row
  from public.class_sessions
  where id = target_session_id
  for update;
  if session_row.id is null or not public.can_moderate_class_session(target_session_id) then
    raise exception 'You are not authorized to start this class.' using errcode = '42501';
  end if;
  if session_row.status <> 'scheduled'
     or session_row.scheduled_at > now() + interval '15 minutes'
     or session_row.scheduled_at < now() - interval '2 hours' then
    raise exception 'This class can start from 15 minutes before its schedule until 2 hours after.' using errcode = '22023';
  end if;
  update public.class_sessions
  set status = 'live', started_at = now(), ended_at = null
  where id = target_session_id
  returning * into session_row;
  return session_row;
end;
$$;

create or replace function public.end_class_session(target_session_id uuid)
returns public.class_sessions
language plpgsql
security definer
set search_path = ''
as $$
declare
  session_row public.class_sessions%rowtype;
begin
  select * into session_row
  from public.class_sessions
  where id = target_session_id
  for update;
  if session_row.id is null or not public.can_moderate_class_session(target_session_id) then
    raise exception 'You are not authorized to end this class.' using errcode = '42501';
  end if;
  if session_row.status <> 'live' then
    raise exception 'Only a live class can be ended.' using errcode = '22023';
  end if;
  update public.class_sessions
  set status = 'ended', ended_at = now()
  where id = target_session_id
  returning * into session_row;
  update public.class_attendance set left_at = now()
  where session_id = target_session_id and left_at is null;
  update public.class_hand_raises
  set status = 'cancelled', speaking_permission_active = false,
      speaking_ended_at = case when speaking_permission_active then now() else speaking_ended_at end
  where session_id = target_session_id
    and (status = 'pending' or speaking_permission_active);
  update public.session_shared_links
  set revoked_at = now(), revoked_reason = 'session_ended'
  where session_id = target_session_id and revoked_at is null;
  delete from public.class_session_join_reservations where session_id = target_session_id;
  return session_row;
end;
$$;

create or replace function public.cancel_class_session(target_session_id uuid)
returns public.class_sessions
language plpgsql
security definer
set search_path = ''
as $$
declare
  session_row public.class_sessions%rowtype;
begin
  select * into session_row
  from public.class_sessions
  where id = target_session_id
  for update;
  if session_row.id is null or not public.can_moderate_class_session(target_session_id) then
    raise exception 'You are not authorized to cancel this class.' using errcode = '42501';
  end if;
  if session_row.status <> 'scheduled' then
    raise exception 'Only a scheduled class can be cancelled.' using errcode = '22023';
  end if;
  update public.class_sessions
  set status = 'cancelled'
  where id = target_session_id
  returning * into session_row;
  delete from public.class_session_join_reservations where session_id = target_session_id;
  return session_row;
end;
$$;

create or replace function public.configure_class_session(
  target_session_id uuid,
  enable_public_qa boolean,
  permit_student_screen_share boolean,
  participant_limit integer
)
returns public.class_sessions
language plpgsql
security definer
set search_path = ''
as $$
declare
  session_row public.class_sessions%rowtype;
begin
  select * into session_row
  from public.class_sessions
  where id = target_session_id
  for update;
  if session_row.id is null or not public.can_moderate_class_session(target_session_id) then
    raise exception 'You are not authorized to configure this class.' using errcode = '42501';
  end if;
  if session_row.status not in ('scheduled', 'live')
     or participant_limit is null
     or participant_limit not between 2 and 250
     or enable_public_qa is null
     or permit_student_screen_share is null then
    raise exception 'Choose valid class settings for a scheduled or live class.' using errcode = '22023';
  end if;
  update public.class_sessions
  set public_qa_enabled = enable_public_qa,
      allow_student_screen_share = permit_student_screen_share,
      max_participants = participant_limit
  where id = target_session_id
  returning * into session_row;
  return session_row;
end;
$$;

create or replace function public.authorize_classroom_join(
  target_session_id uuid,
  request_screen_share boolean default false
)
returns jsonb
language plpgsql
security definer
set search_path = ''
as $$
declare
  current_user_id uuid := (select auth.uid());
  session_row public.class_sessions%rowtype;
  profile_role text;
  can_publish_audio boolean;
  occupied_count integer;
begin
  if current_user_id is null then
    raise exception 'Sign in to enter this classroom.' using errcode = '42501';
  end if;
  select p.role into profile_role
  from public.profiles p
  where p.id = current_user_id and p.account_status = 'active';
  if profile_role is null or not public.can_access_class_session(target_session_id) then
    raise exception 'You are not authorized to enter this classroom.' using errcode = '42501';
  end if;

  select * into session_row
  from public.class_sessions
  where id = target_session_id
  for update;
  if session_row.id is null or session_row.status <> 'live' then
    raise exception 'The classroom is not live.' using errcode = '22023';
  end if;
  if request_screen_share and profile_role = 'student' and not session_row.allow_student_screen_share then
    raise exception 'Student screen sharing is disabled for this classroom.' using errcode = '42501';
  end if;
  if request_screen_share and not exists (
    select 1 from public.class_attendance a
    where a.session_id = target_session_id
      and a.user_id = current_user_id
      and a.left_at is null
  ) and not exists (
    select 1 from public.class_session_join_reservations r
    where r.session_id = target_session_id
      and r.user_id = current_user_id
      and r.expires_at > now()
  ) then
    raise exception 'Join the classroom before requesting screen sharing.' using errcode = '42501';
  end if;

  delete from public.class_session_join_reservations
  where session_id = target_session_id and expires_at <= now();
  select count(*) into occupied_count
  from (
    select distinct a.user_id
    from public.class_attendance a
    where a.session_id = target_session_id and a.left_at is null
    union
    select r.user_id
    from public.class_session_join_reservations r
    where r.session_id = target_session_id and r.expires_at > now()
  ) occupied;
  if occupied_count >= session_row.max_participants
     and not exists (
       select 1 from public.class_attendance a
       where a.session_id = target_session_id
         and a.user_id = current_user_id
         and a.left_at is null
     )
     and not exists (
       select 1 from public.class_session_join_reservations r
       where r.session_id = target_session_id and r.user_id = current_user_id
     ) then
    raise exception 'This classroom has reached its participant limit.' using errcode = '54000';
  end if;

  if not request_screen_share then
    insert into public.class_session_join_reservations (session_id, user_id, expires_at)
    values (target_session_id, current_user_id, now() + interval '2 minutes')
    on conflict (session_id, user_id)
    do update set expires_at = excluded.expires_at;
  end if;

  select exists (
    select 1 from public.class_hand_raises h
    where h.session_id = target_session_id
      and h.student_id = current_user_id
      and h.status = 'approved'
      and h.speaking_permission_active
  ) into can_publish_audio;
  can_publish_audio := can_publish_audio
    or profile_role = 'admin'
    or (
      profile_role = 'instructor'
      and session_row.instructor_id = current_user_id
    );

  return jsonb_build_object(
    'session_id', session_row.id,
    'user_id', current_user_id,
    'role', profile_role,
    'screen_share', request_screen_share,
    'can_publish_video', true,
    'can_publish_audio', can_publish_audio,
    'expires_in_seconds', 900
  );
end;
$$;

create or replace function public.get_classroom_roster(target_session_id uuid)
returns table (
  user_id uuid,
  display_name text,
  participant_role text,
  joined_at timestamptz
)
language sql
stable
security definer
set search_path = ''
as $$
  select distinct on (a.user_id)
    a.user_id,
    coalesce(nullif(btrim(p.display_name), ''), 'Participant'),
    a.participant_role,
    a.joined_at
  from public.class_attendance a
  join public.profiles p on p.id = a.user_id
  where a.session_id = target_session_id
    and a.left_at is null
    and public.can_access_class_session(target_session_id)
  order by a.user_id, a.joined_at desc
$$;

revoke all on function public.send_classroom_message(uuid, text) from public, anon;
revoke all on function public.submit_classroom_question(uuid, text) from public, anon;
revoke all on function public.update_classroom_question(uuid, text, text) from public, anon;
revoke all on function public.record_class_attendance(uuid, text) from public, anon;
revoke all on function public.start_class_session(uuid) from public, anon;
revoke all on function public.end_class_session(uuid) from public, anon;
revoke all on function public.cancel_class_session(uuid) from public, anon;
revoke all on function public.configure_class_session(uuid, boolean, boolean, integer) from public, anon;
revoke all on function public.authorize_classroom_join(uuid, boolean) from public, anon;
revoke all on function public.get_classroom_roster(uuid) from public, anon;
grant execute on function public.send_classroom_message(uuid, text) to authenticated;
grant execute on function public.submit_classroom_question(uuid, text) to authenticated;
grant execute on function public.update_classroom_question(uuid, text, text) to authenticated;
grant execute on function public.record_class_attendance(uuid, text) to authenticated;
grant execute on function public.start_class_session(uuid) to authenticated;
grant execute on function public.end_class_session(uuid) to authenticated;
grant execute on function public.cancel_class_session(uuid) to authenticated;
grant execute on function public.configure_class_session(uuid, boolean, boolean, integer) to authenticated;
grant execute on function public.authorize_classroom_join(uuid, boolean) to authenticated;
grant execute on function public.get_classroom_roster(uuid) to authenticated;

do $$
begin
  if exists (select 1 from pg_publication where pubname = 'supabase_realtime') then
    if not exists (
      select 1 from pg_publication_tables
      where pubname = 'supabase_realtime'
        and schemaname = 'public'
        and tablename = 'classroom_messages'
    ) then
      alter publication supabase_realtime add table public.classroom_messages;
    end if;
    if not exists (
      select 1 from pg_publication_tables
      where pubname = 'supabase_realtime'
        and schemaname = 'public'
        and tablename = 'classroom_questions'
    ) then
      alter publication supabase_realtime add table public.classroom_questions;
    end if;
    if not exists (
      select 1 from pg_publication_tables
      where pubname = 'supabase_realtime'
        and schemaname = 'public'
        and tablename = 'class_sessions'
    ) then
      alter publication supabase_realtime add table public.class_sessions;
    end if;
  end if;
end;
$$;
