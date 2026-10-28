create extension if not exists pgcrypto with schema extensions;

create table public.profiles (
  id uuid primary key references auth.users (id) on delete cascade,
  display_name text,
  avatar_url text,
  bio text,
  role text not null default 'student' check (role in ('student', 'instructor', 'admin')),
  account_status text not null default 'active' check (account_status in ('active', 'suspended')),
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);

create table public.categories (
  id uuid primary key default extensions.gen_random_uuid(),
  name text not null unique,
  slug text not null unique,
  description text,
  is_published boolean not null default true,
  created_at timestamptz not null default now()
);

create table public.courses (
  id uuid primary key default extensions.gen_random_uuid(),
  instructor_id uuid not null references public.profiles (id) on delete restrict,
  category_id uuid references public.categories (id) on delete set null,
  slug text not null unique check (slug ~ '^[a-z0-9]+(-[a-z0-9]+)*$'),
  title text not null check (length(btrim(title)) between 1 and 160),
  description text not null default '' check (length(description) <= 5000),
  thumbnail_url text,
  level text not null default 'beginner' check (level in ('beginner', 'intermediate', 'advanced')),
  estimated_minutes integer check (estimated_minutes is null or estimated_minutes > 0),
  learning_objectives text[] not null default '{}',
  prerequisites text[] not null default '{}',
  access_level text not null default 'free' check (access_level in ('free', 'enrolled', 'subscription')),
  status text not null default 'draft' check (status in ('draft', 'published', 'archived')),
  published_at timestamptz,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);

create table public.lessons (
  id uuid primary key default extensions.gen_random_uuid(),
  course_id uuid not null references public.courses (id) on delete cascade,
  order_index integer not null check (order_index >= 0),
  title text not null check (length(btrim(title)) between 1 and 180),
  description text check (length(description) <= 3000),
  content_markdown text,
  lesson_type text not null default 'tutorial' check (lesson_type in ('tutorial', 'recorded', 'live', 'exercise')),
  is_preview boolean not null default false,
  status text not null default 'draft' check (status in ('draft', 'published', 'archived')),
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  unique (course_id, order_index)
);

create table public.enrollments (
  id uuid primary key default extensions.gen_random_uuid(),
  user_id uuid not null references public.profiles (id) on delete cascade,
  course_id uuid not null references public.courses (id) on delete cascade,
  status text not null default 'active' check (status in ('active', 'completed', 'cancelled')),
  enrolled_at timestamptz not null default now(),
  completed_at timestamptz,
  unique (user_id, course_id)
);

create table public.lesson_progress (
  id uuid primary key default extensions.gen_random_uuid(),
  user_id uuid not null references public.profiles (id) on delete cascade,
  lesson_id uuid not null references public.lessons (id) on delete cascade,
  started_at timestamptz not null default now(),
  completed_at timestamptz,
  updated_at timestamptz not null default now(),
  unique (user_id, lesson_id)
);

create table public.class_sessions (
  id uuid primary key default extensions.gen_random_uuid(),
  course_id uuid not null references public.courses (id) on delete cascade,
  lesson_id uuid references public.lessons (id) on delete set null,
  instructor_id uuid not null references public.profiles (id) on delete restrict,
  title text not null check (length(btrim(title)) between 1 and 180),
  description text not null default '' check (length(description) <= 5000),
  learning_objectives text[] not null default '{}',
  scheduled_at timestamptz not null,
  expected_duration_minutes integer check (expected_duration_minutes is null or expected_duration_minutes > 0),
  status text not null default 'scheduled' check (status in ('scheduled', 'live', 'ended', 'cancelled')),
  started_at timestamptz,
  ended_at timestamptz,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  check (ended_at is null or started_at is not null)
);

create table public.class_attendance (
  id uuid primary key default extensions.gen_random_uuid(),
  session_id uuid not null references public.class_sessions (id) on delete cascade,
  user_id uuid not null references public.profiles (id) on delete cascade,
  joined_at timestamptz not null default now(),
  left_at timestamptz,
  participant_role text not null check (participant_role in ('student', 'instructor')),
  unique (session_id, user_id, joined_at)
);

create table public.recordings (
  id uuid primary key default extensions.gen_random_uuid(),
  session_id uuid not null unique references public.class_sessions (id) on delete cascade,
  storage_path text,
  provider_reference text,
  status text not null default 'pending' check (status in ('pending', 'processing', 'ready', 'failed')),
  duration_seconds integer check (duration_seconds is null or duration_seconds >= 0),
  transcript_path text,
  published_at timestamptz,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);

create table public.class_summaries (
  id uuid primary key default extensions.gen_random_uuid(),
  session_id uuid not null unique references public.class_sessions (id) on delete cascade,
  content jsonb not null default '{}'::jsonb,
  status text not null default 'pending' check (status in ('pending', 'generating', 'review', 'published', 'failed')),
  source_metadata jsonb not null default '{}'::jsonb,
  model_identifier text,
  input_tokens integer check (input_tokens is null or input_tokens >= 0),
  output_tokens integer check (output_tokens is null or output_tokens >= 0),
  generation_error text,
  generated_at timestamptz,
  reviewed_at timestamptz,
  published_at timestamptz,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);

create table public.class_resources (
  id uuid primary key default extensions.gen_random_uuid(),
  session_id uuid not null references public.class_sessions (id) on delete cascade,
  url text not null check (length(url) <= 2048),
  title text,
  description text,
  source_location text not null default 'instructor' check (source_location in ('instructor', 'transcript', 'summary')),
  validation_status text not null default 'unchecked' check (validation_status in ('unchecked', 'valid', 'unavailable', 'invalid')),
  created_at timestamptz not null default now(),
  unique (session_id, url, source_location)
);

create index courses_publication_idx on public.courses (status, published_at desc);
create index courses_category_level_idx on public.courses (category_id, level) where status = 'published';
create index lessons_course_order_idx on public.lessons (course_id, order_index);
create index enrollments_user_status_idx on public.enrollments (user_id, status, course_id);
create index lesson_progress_user_idx on public.lesson_progress (user_id, updated_at desc);
create index class_sessions_schedule_idx on public.class_sessions (scheduled_at) where status in ('scheduled', 'live');
create index class_sessions_course_idx on public.class_sessions (course_id, scheduled_at desc);
create index class_attendance_user_idx on public.class_attendance (user_id, joined_at desc);
create index class_summaries_status_idx on public.class_summaries (status, updated_at);

create or replace function public.set_updated_at()
returns trigger
language plpgsql
set search_path = ''
as $$
begin
  new.updated_at = now();
  return new;
end;
$$;

create trigger profiles_set_updated_at before update on public.profiles
for each row execute function public.set_updated_at();
create trigger courses_set_updated_at before update on public.courses
for each row execute function public.set_updated_at();
create trigger lessons_set_updated_at before update on public.lessons
for each row execute function public.set_updated_at();
create trigger class_sessions_set_updated_at before update on public.class_sessions
for each row execute function public.set_updated_at();
create trigger recordings_set_updated_at before update on public.recordings
for each row execute function public.set_updated_at();
create trigger class_summaries_set_updated_at before update on public.class_summaries
for each row execute function public.set_updated_at();
create trigger lesson_progress_set_updated_at before update on public.lesson_progress
for each row execute function public.set_updated_at();

create or replace function public.create_profile_for_new_user()
returns trigger
language plpgsql
security definer
set search_path = ''
as $$
begin
  insert into public.profiles (id, display_name)
  values (new.id, nullif(btrim(new.raw_user_meta_data ->> 'display_name'), ''))
  on conflict (id) do nothing;
  return new;
end;
$$;

create trigger on_auth_user_created
after insert on auth.users
for each row execute function public.create_profile_for_new_user();

create or replace function public.has_platform_role(allowed_roles text[])
returns boolean
language sql
stable
security definer
set search_path = ''
as $$
  select exists (
    select 1
    from public.profiles p
    where p.id = (select auth.uid())
      and p.account_status = 'active'
      and p.role = any (allowed_roles)
  );
$$;

create or replace function public.has_active_course_enrollment(target_course_id uuid)
returns boolean
language sql
stable
security definer
set search_path = ''
as $$
  select exists (
    select 1
    from public.enrollments e
    where e.course_id = target_course_id
      and e.user_id = (select auth.uid())
      and e.status in ('active', 'completed')
  );
$$;

create or replace function public.owns_course(target_course_id uuid)
returns boolean
language sql
stable
security definer
set search_path = ''
as $$
  select exists (
    select 1
    from public.courses c
    where c.id = target_course_id
      and (
        public.has_platform_role(array['admin'])
        or (
          c.instructor_id = (select auth.uid())
          and public.has_platform_role(array['instructor'])
        )
      )
  );
$$;

revoke all on function public.has_platform_role(text[]) from public, anon;
grant execute on function public.has_platform_role(text[]) to anon, authenticated;
revoke all on function public.has_active_course_enrollment(uuid) from public, anon;
grant execute on function public.has_active_course_enrollment(uuid) to anon, authenticated;
revoke all on function public.owns_course(uuid) from public, anon;
grant execute on function public.owns_course(uuid) to anon, authenticated;
revoke all on function public.create_profile_for_new_user() from public, anon, authenticated;
revoke all on function public.set_updated_at() from public, anon, authenticated;

alter table public.profiles enable row level security;
alter table public.categories enable row level security;
alter table public.courses enable row level security;
alter table public.lessons enable row level security;
alter table public.enrollments enable row level security;
alter table public.lesson_progress enable row level security;
alter table public.class_sessions enable row level security;
alter table public.class_attendance enable row level security;
alter table public.recordings enable row level security;
alter table public.class_summaries enable row level security;
alter table public.class_resources enable row level security;

grant select on public.profiles, public.categories, public.courses, public.lessons to anon, authenticated;
grant select on public.class_sessions to anon;
grant select on public.enrollments, public.lesson_progress, public.class_sessions,
  public.class_attendance, public.recordings, public.class_summaries, public.class_resources to authenticated;
grant update (display_name, avatar_url, bio) on public.profiles to authenticated;
grant insert on public.enrollments to authenticated;
grant insert, update on public.lesson_progress to authenticated;
grant insert, update, delete on public.courses, public.lessons, public.categories,
  public.class_resources to authenticated;
grant insert (course_id, lesson_id, instructor_id, title, description, learning_objectives,
  scheduled_at, expected_duration_minutes) on public.class_sessions to authenticated;
grant update (course_id, lesson_id, title, description, learning_objectives,
  scheduled_at, expected_duration_minutes) on public.class_sessions to authenticated;
grant update (content) on public.class_summaries to authenticated;

create policy "Profiles are visible to their owner and instructors"
on public.profiles for select to anon, authenticated
using (
  id = (select auth.uid())
  or (role = 'instructor' and account_status = 'active')
  or (select public.has_platform_role(array['admin']))
);
create policy "Users update only their profile fields"
on public.profiles for update to authenticated
using (id = (select auth.uid()))
with check (id = (select auth.uid()));

create policy "Published categories are public"
on public.categories for select to anon, authenticated
using (is_published or (select public.has_platform_role(array['admin', 'instructor'])));
create policy "Staff manage categories"
on public.categories for all to authenticated
using ((select public.has_platform_role(array['admin', 'instructor'])))
with check ((select public.has_platform_role(array['admin', 'instructor'])));

create policy "Published courses are visible when access allows"
on public.courses for select to anon, authenticated
using (
  (status = 'published' and (
    access_level = 'free'
    or public.has_active_course_enrollment(courses.id)
  ))
  or instructor_id = (select auth.uid())
  or (select public.has_platform_role(array['admin']))
);
create policy "Instructors create courses for themselves"
on public.courses for insert to authenticated
with check (
  (
    instructor_id = (select auth.uid())
    and (select public.has_platform_role(array['instructor']))
  )
  or (select public.has_platform_role(array['admin']))
);
create policy "Instructors update their courses"
on public.courses for update to authenticated
using (
  public.owns_course(courses.id)
)
with check (
  public.owns_course(courses.id)
  and (
    instructor_id = (select auth.uid())
    or (select public.has_platform_role(array['admin']))
  )
);
create policy "Instructors delete their courses"
on public.courses for delete to authenticated
using (
  public.owns_course(courses.id)
);

create policy "Lessons follow course publication and access"
on public.lessons for select to anon, authenticated
using (
  status = 'published'
  and exists (
    select 1 from public.courses c
    where c.id = lessons.course_id
      and c.status = 'published'
      and (is_preview or c.access_level = 'free' or public.has_active_course_enrollment(c.id))
  )
  or exists (
    select 1 from public.courses c
    where c.id = lessons.course_id
      and (public.owns_course(c.id) or (select public.has_platform_role(array['admin'])))
  )
);
create policy "Instructors manage lessons for their courses"
on public.lessons for all to authenticated
using (
  public.owns_course(lessons.course_id)
)
with check (
  public.owns_course(lessons.course_id)
);

create policy "Users view their enrollments"
on public.enrollments for select to authenticated
using (
  user_id = (select auth.uid())
  or (select public.has_platform_role(array['admin']))
  or public.owns_course(enrollments.course_id)
);
create policy "Users self-enroll only in free published courses"
on public.enrollments for insert to authenticated
with check (
  user_id = (select auth.uid())
  and status = 'active'
  and exists (
    select 1 from public.courses c
    where c.id = enrollments.course_id and c.status = 'published' and c.access_level = 'free'
  )
);

create policy "Users read their lesson progress"
on public.lesson_progress for select to authenticated
using (user_id = (select auth.uid()) or (select public.has_platform_role(array['admin'])));
create policy "Users record their own accessible lesson progress"
on public.lesson_progress for insert to authenticated
with check (
  user_id = (select auth.uid())
  and exists (
    select 1 from public.lessons l
    join public.courses c on c.id = l.course_id
    where l.id = lesson_progress.lesson_id
      and l.status = 'published'
      and c.status = 'published'
      and (c.access_level = 'free' or public.has_active_course_enrollment(c.id))
  )
);
create policy "Users update their own accessible lesson progress"
on public.lesson_progress for update to authenticated
using (user_id = (select auth.uid()))
with check (
  user_id = (select auth.uid())
  and exists (
    select 1 from public.lessons l
    join public.courses c on c.id = l.course_id
    where l.id = lesson_progress.lesson_id
      and l.status = 'published'
      and c.status = 'published'
      and (c.access_level = 'free' or public.has_active_course_enrollment(c.id))
  )
);

create policy "Class sessions visible to authorized learners"
on public.class_sessions for select to anon, authenticated
using (
  status in ('scheduled', 'live', 'ended')
  and exists (
    select 1 from public.courses c
    where c.id = class_sessions.course_id and c.status = 'published'
      and (c.access_level = 'free' or public.has_active_course_enrollment(c.id))
  )
  or instructor_id = (select auth.uid())
  or (select public.has_platform_role(array['admin']))
);
create policy "Instructors manage their class sessions"
on public.class_sessions for all to authenticated
using (
  (instructor_id = (select auth.uid()) and public.owns_course(course_id))
  or (select public.has_platform_role(array['admin']))
)
with check (
  (
    instructor_id = (select auth.uid())
    and public.owns_course(course_id)
  )
  or (select public.has_platform_role(array['admin']))
);

create policy "Users read their own attendance"
on public.class_attendance for select to authenticated
using (
  user_id = (select auth.uid())
  or exists (
    select 1 from public.class_sessions s
    where s.id = class_attendance.session_id
      and (s.instructor_id = (select auth.uid()) or (select public.has_platform_role(array['admin'])))
  )
);

create policy "Recording metadata follows class access"
on public.recordings for select to authenticated
using (
  exists (
    select 1 from public.class_sessions s
    join public.courses c on c.id = s.course_id
    where s.id = recordings.session_id
      and c.status = 'published'
      and recordings.status = 'ready'
      and recordings.published_at is not null
      and (c.access_level = 'free' or public.has_active_course_enrollment(c.id))
  )
  or exists (
    select 1 from public.class_sessions s where s.id = recordings.session_id
      and (s.instructor_id = (select auth.uid()) or (select public.has_platform_role(array['admin'])))
  )
);

create policy "Published summaries follow class access"
on public.class_summaries for select to authenticated
using (
  exists (
    select 1 from public.class_sessions s
    join public.courses c on c.id = s.course_id
    where s.id = class_summaries.session_id
      and c.status = 'published'
      and class_summaries.status = 'published'
      and (c.access_level = 'free' or public.has_active_course_enrollment(c.id))
  )
  or exists (
    select 1 from public.class_sessions s where s.id = class_summaries.session_id
      and (s.instructor_id = (select auth.uid()) or (select public.has_platform_role(array['admin'])))
  )
);
create policy "Instructors review summaries for their classes"
on public.class_summaries for update to authenticated
using (
  exists (
    select 1 from public.class_sessions s where s.id = class_summaries.session_id
      and s.instructor_id = (select auth.uid())
      and (select public.has_platform_role(array['instructor', 'admin']))
  )
)
with check (
  exists (
    select 1 from public.class_sessions s where s.id = class_summaries.session_id
      and s.instructor_id = (select auth.uid())
      and (select public.has_platform_role(array['instructor', 'admin']))
  )
);

create policy "Resources follow class access"
on public.class_resources for select to authenticated
using (
  exists (
    select 1 from public.class_sessions s
    join public.courses c on c.id = s.course_id
    where s.id = class_resources.session_id
      and c.status = 'published'
      and (c.access_level = 'free' or public.has_active_course_enrollment(c.id))
  )
  or exists (
    select 1 from public.class_sessions s where s.id = class_resources.session_id
      and (s.instructor_id = (select auth.uid()) or (select public.has_platform_role(array['admin'])))
  )
);
create policy "Instructors manage resources for their classes"
on public.class_resources for all to authenticated
using (
  exists (
    select 1 from public.class_sessions s where s.id = class_resources.session_id
      and s.instructor_id = (select auth.uid())
      and (select public.has_platform_role(array['instructor', 'admin']))
  )
)
with check (
  exists (
    select 1 from public.class_sessions s where s.id = class_resources.session_id
      and s.instructor_id = (select auth.uid())
      and (select public.has_platform_role(array['instructor', 'admin']))
  )
);
