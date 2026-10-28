import { useCallback, useEffect, useState, type FormEvent, type ReactNode } from 'react'
import { Link, useLocation, useNavigate } from 'react-router-dom'
import type { User } from '@supabase/supabase-js'
import { useAuth } from '../auth/useAuth'
import { supabase } from '../lib/supabase'
import { listClassSessions, type ClassroomSession } from '../lib/classroom'
import { getPublicLaunchStats, setPublicLaunchAt, type PublicLaunchStats } from '../lib/launch'
import { EmptyState, SetupNotice } from './Shared'

interface Profile {
  display_name: string | null
  role: string
  account_status: string
}

interface EnrolledCourse {
  id: string
  status: string
  enrolled_at: string
  completed_at: string | null
  course: {
    id: string
    title: string
    slug: string
    lessons: { id: string; title: string; order_index: number }[]
  } | null
}

interface LessonProgress {
  lesson_id: string
  completed_at: string | null
  updated_at: string
}

interface PlanEntitlement {
  plan_id: string
  included_project_count: number
  support_project_limit: number
  status: string
  purchased_at: string
}

interface AppProject {
  id: string
  project_number: number
  name: string
  description: string
  status: string
  funding_source: 'included' | 'credit'
  created_at: string
  updated_at: string
}

interface CreditTransaction {
  id: string
  credit_delta: number
  transaction_type: string
  reason: string
  created_at: string
}

interface LaunchExclusion {
  user_id: string
}

interface CourseRecord {
  id: string
  title: string
  slug: string
  status: string
  access_level: string
  required_plan_id: string | null
  updated_at: string
}

interface StudentRecord {
  id: string
  display_name: string | null
  account_status: string
  created_at: string
}

interface AdminData {
  students: StudentRecord[]
  courses: CourseRecord[]
  sessions: ClassroomSession[]
  activePlanEntitlements: number
  drafts: number
  publishedCourses: number
  registeredStudents: number
  upcomingClasses: number
  launchStats: PublicLaunchStats
  excludedStudentIds: string[]
  loadedAt: number
}

interface StudentData {
  courses: EnrolledCourse[]
  progress: LessonProgress[]
  attendance: ClassAttendanceRecord[]
  sessions: ClassroomSession[]
  entitlement: PlanEntitlement | null
  projects: AppProject[]
  totalProjectsUsed: number
  creditBalance: number
  creditTransactions: CreditTransaction[]
  loadedAt: number
}

interface ClassAttendanceRecord {
  id: string
  session_id: string
  joined_at: string
  left_at: string | null
  participant_role: 'student' | 'instructor'
  participant?: { display_name: string | null } | null
  session?: { title: string; scheduled_at: string } | null
}

interface InstructorData {
  sessions: ClassroomSession[]
  attendance: ClassAttendanceRecord[]
  loadedAt: number
}

function messageFor(error: unknown) {
  return error instanceof Error ? error.message : 'Something went wrong while loading your dashboard.'
}

function formatDate(value: string | null | undefined) {
  if (!value) return 'Not available'
  const date = new Date(value)
  return Number.isNaN(date.getTime())
    ? 'Not available'
    : new Intl.DateTimeFormat(undefined, { dateStyle: 'medium', timeStyle: 'short' }).format(date)
}

async function loadProfile(user: User) {
  if (!supabase) throw new Error('Supabase is not configured.')
  const { data, error } = await supabase
    .from('profiles')
    .select('display_name, role, account_status')
    .eq('id', user.id)
    .maybeSingle()
  if (error) throw new Error('Could not verify your account permissions. Retry or contact platform support.')
  return data as Profile | null
}

async function loadStudentData(user: User): Promise<StudentData> {
  if (!supabase) throw new Error('Supabase is not configured.')
  const [
    enrollmentResult,
    progressResult,
    attendanceResult,
    sessionResult,
    entitlementResult,
    projectResult,
    projectCountResult,
    creditBalanceResult,
    creditTransactionResult,
  ] = await Promise.all([
    supabase
      .from('enrollments')
      .select('id, status, enrolled_at, completed_at, course:courses!enrollments_course_id_fkey(id, title, slug, lessons(id, title, order_index))')
      .eq('user_id', user.id)
      .in('status', ['active', 'completed'])
      .order('enrolled_at', { ascending: false }),
    supabase
      .from('lesson_progress')
      .select('lesson_id, completed_at, updated_at')
      .eq('user_id', user.id)
      .order('updated_at', { ascending: false })
      .limit(500),
    supabase
      .from('class_attendance')
      .select('id, session_id, joined_at, left_at, participant_role, session:class_sessions(title, scheduled_at)')
      .eq('user_id', user.id)
      .order('joined_at', { ascending: false })
      .limit(100),
    listClassSessions(),
    supabase
      .from('student_plan_entitlements')
      .select('plan_id, included_project_count, support_project_limit, status, purchased_at')
      .eq('user_id', user.id)
      .maybeSingle(),
    supabase
      .from('student_app_projects')
      .select('id, project_number, name, description, status, funding_source, created_at, updated_at')
      .eq('owner_id', user.id)
      .order('project_number', { ascending: false })
      .limit(100),
    supabase.from('student_app_projects').select('id', { count: 'exact', head: true }).eq('owner_id', user.id),
    supabase.rpc('get_my_app_credit_balance'),
    supabase
      .from('app_credit_transactions')
      .select('id, credit_delta, transaction_type, reason, created_at')
      .eq('user_id', user.id)
      .order('created_at', { ascending: false })
      .limit(25),
  ])
  if (
    enrollmentResult.error ||
    progressResult.error ||
    attendanceResult.error ||
    entitlementResult.error ||
    projectResult.error ||
    projectCountResult.error ||
    creditBalanceResult.error ||
    creditTransactionResult.error
  ) {
    throw new Error('Could not load some dashboard information. Retry or contact platform support.')
  }
  const creditBalance = Number(creditBalanceResult.data ?? 0)
  if (!Number.isSafeInteger(creditBalance) || creditBalance < 0) {
    throw new Error('Your App Credit balance could not be verified. Please refresh or contact support.')
  }
  return {
    courses: (enrollmentResult.data ?? []) as unknown as EnrolledCourse[],
    progress: (progressResult.data ?? []) as LessonProgress[],
    attendance: (attendanceResult.data ?? []) as unknown as ClassAttendanceRecord[],
    sessions: sessionResult,
    entitlement: entitlementResult.data as PlanEntitlement | null,
    projects: (projectResult.data ?? []) as AppProject[],
    totalProjectsUsed: projectCountResult.count ?? 0,
    creditBalance,
    creditTransactions: (creditTransactionResult.data ?? []) as CreditTransaction[],
    loadedAt: Date.now(),
  }
}

async function loadInstructorData(user: User): Promise<InstructorData> {
  if (!supabase) throw new Error('Supabase is not configured.')
  const { data: sessionData, error: sessionError } = await supabase
    .from('class_sessions')
    .select('id, course_id, lesson_id, instructor_id, title, description, learning_objectives, scheduled_at, expected_duration_minutes, started_at, ended_at, max_participants, allow_student_screen_share, public_qa_enabled, status, course:courses(title), instructor:profiles!class_sessions_instructor_id_fkey(display_name)')
    .eq('instructor_id', user.id)
    .order('scheduled_at', { ascending: false })
    .limit(100)
  if (sessionError) throw new Error('Could not load your teaching schedule.')
  const sessions = (sessionData ?? []) as unknown as ClassroomSession[]
  if (sessions.length === 0) return { sessions, attendance: [], loadedAt: Date.now() }

  const { data, error } = await supabase
    .from('class_attendance')
    .select('id, session_id, user_id, joined_at, left_at, participant_role, participant:profiles!class_attendance_user_id_fkey(display_name)')
    .in('session_id', sessions.map((session) => session.id))
    .order('joined_at', { ascending: false })
    .limit(500)
  if (error) throw new Error('Could not load attendance for your classes.')
  return {
    sessions,
    attendance: (data ?? []) as unknown as ClassAttendanceRecord[],
    loadedAt: Date.now(),
  }
}

async function loadAdminData(): Promise<AdminData> {
  if (!supabase) throw new Error('Supabase is not configured.')
  const [
    studentsResult,
    coursesResult,
    studentCountResult,
    activePlanEntitlementsResult,
    draftsResult,
    publishedResult,
    classesResult,
    sessions,
    launchStats,
    exclusionsResult,
  ] = await Promise.all([
    supabase.from('profiles').select('id, display_name, account_status, created_at').eq('role', 'student').order('created_at', { ascending: false }).limit(50),
    supabase.from('courses').select('id, title, slug, status, access_level, required_plan_id, updated_at').order('updated_at', { ascending: false }).limit(100),
    supabase.from('profiles').select('id', { count: 'exact', head: true }).eq('role', 'student'),
    supabase.from('student_plan_entitlements').select('user_id', { count: 'exact', head: true }).eq('status', 'active'),
    supabase.from('courses').select('id', { count: 'exact', head: true }).eq('status', 'draft'),
    supabase.from('courses').select('id', { count: 'exact', head: true }).eq('status', 'published'),
    supabase.from('class_sessions').select('id', { count: 'exact', head: true }).in('status', ['scheduled', 'live']).or(`status.eq.live,scheduled_at.gte.${new Date().toISOString()}`),
    listClassSessions(),
    getPublicLaunchStats(),
    supabase.from('launch_metric_exclusions').select('user_id'),
  ])
  const failures = [
    studentsResult.error,
    coursesResult.error,
    studentCountResult.error,
    activePlanEntitlementsResult.error,
    draftsResult.error,
    publishedResult.error,
    classesResult.error,
    exclusionsResult.error,
  ].filter(Boolean)
  if (failures.length) throw new Error('Could not load the administrator dashboard. Retry or contact platform support.')
  return {
    students: (studentsResult.data ?? []) as StudentRecord[],
    courses: (coursesResult.data ?? []) as CourseRecord[],
    sessions,
    activePlanEntitlements: activePlanEntitlementsResult.count ?? 0,
    drafts: draftsResult.count ?? 0,
    publishedCourses: publishedResult.count ?? 0,
    registeredStudents: studentCountResult.count ?? 0,
    upcomingClasses: classesResult.count ?? 0,
    launchStats,
    excludedStudentIds: ((exclusionsResult.data ?? []) as LaunchExclusion[]).map((item) => item.user_id),
    loadedAt: Date.now(),
  }
}

export function DashboardPage() {
  const { user, loading: authLoading, configured } = useAuth()
  const location = useLocation()
  const navigate = useNavigate()
  const requestedAdmin = location.pathname === '/admin'
  const [profile, setProfile] = useState<Profile | null>(null)
  const [studentData, setStudentData] = useState<StudentData | null>(null)
  const [instructorData, setInstructorData] = useState<InstructorData | null>(null)
  const [adminData, setAdminData] = useState<AdminData | null>(null)
  const [loading, setLoading] = useState(true)
  const [error, setError] = useState('')
  const [actionMessage, setActionMessage] = useState('')
  const [busyCourse, setBusyCourse] = useState('')
  const [busyLaunchUser, setBusyLaunchUser] = useState('')

  const refresh = useCallback(async () => {
    if (!user || !supabase) return
    setLoading(true)
    setError('')
    try {
      const currentProfile = await loadProfile(user)
      setProfile(currentProfile)
      setStudentData(null)
      setInstructorData(null)
      setAdminData(null)
      if (!currentProfile) {
        setError('Your account profile is not available. Please contact Mai Corp App Class support.')
        return
      }
      if (currentProfile.account_status !== 'active') return
      if (currentProfile.role === 'admin') setAdminData(await loadAdminData())
      else if (currentProfile.role === 'student') setStudentData(await loadStudentData(user))
      else if (currentProfile.role === 'instructor') setInstructorData(await loadInstructorData(user))
    } catch (cause) {
      setError(messageFor(cause))
    } finally {
      setLoading(false)
    }
  }, [user])

  useEffect(() => {
    if (authLoading) return
    if (!user) {
      navigate('/sign-in', { replace: true })
      return
    }
    if (!configured) {
      setLoading(false)
      return
    }
    void refresh()
  }, [authLoading, configured, navigate, refresh, user])

  useEffect(() => {
    if (!user || !supabase) return
    const channel = supabase
      .channel(`dashboard-profile-${user.id}`)
      .on('postgres_changes', {
        event: '*',
        schema: 'public',
        table: 'profiles',
        filter: `id=eq.${user.id}`,
      }, () => { void refresh() })
      .subscribe()
    const onFocus = () => {
      if (document.visibilityState === 'visible') void refresh()
    }
    window.addEventListener('focus', onFocus)
    return () => {
      window.removeEventListener('focus', onFocus)
      void supabase?.removeChannel(channel)
    }
  }, [refresh, user])

  useEffect(() => {
    if (loading || !profile) return
    if (profile.account_status !== 'active') return
    if (profile.role === 'admin' && !requestedAdmin) navigate('/admin', { replace: true })
    else if (profile.role === 'student' && requestedAdmin) navigate('/learn', { replace: true })
  }, [loading, navigate, profile, requestedAdmin])

  async function setCoursePublication(course: CourseRecord) {
    if (!supabase) return
    if (course.status !== 'published' && course.status !== 'draft') {
      setActionMessage('Archived courses cannot be published from this dashboard.')
      return
    }
    const nextStatus = course.status === 'published' ? 'draft' : 'published'
    const confirmation = window.confirm(
      `${nextStatus === 'published' ? 'Publish' : 'Unpublish'} “${course.title}”? This changes the course's public availability.`,
    )
    if (!confirmation) return
    setBusyCourse(course.id)
    setActionMessage('')
    try {
      const { data: updatedCourse, error: updateError } = await supabase
        .from('courses')
        .update({
          status: nextStatus,
          published_at: nextStatus === 'published' ? new Date().toISOString() : null,
        })
        .eq('id', course.id)
        .eq('status', course.status)
        .select('id')
        .maybeSingle()
      if (updateError) throw new Error('Could not update course publication. Confirm your administrator access and try again.')
      if (!updatedCourse) throw new Error('Course status changed elsewhere. Refresh and review the current status.')
      setActionMessage(`“${course.title}” is now ${nextStatus}.`)
      await refresh()
    } catch (cause) {
      setActionMessage(messageFor(cause))
    } finally {
      setBusyCourse('')
    }
  }

  async function setCourseAccess(course: CourseRecord, accessValue: string) {
    if (!supabase) return
    const requiredPlanId = accessValue.startsWith('plan:')
      ? accessValue.slice('plan:'.length)
      : null
    const accessLevel = requiredPlanId ? 'subscription' : accessValue
    if (course.access_level === accessLevel && course.required_plan_id === requiredPlanId) return

    setBusyCourse(course.id)
    setActionMessage('')
    try {
      const { data: updatedCourse, error: updateError } = await supabase
        .from('courses')
        .update({ access_level: accessLevel, required_plan_id: requiredPlanId })
        .eq('id', course.id)
        .select('id')
        .maybeSingle()
      if (updateError) throw new Error('Could not update course access. Confirm your administrator access and try again.')
      if (!updatedCourse) throw new Error('Course access was not updated. Refresh and review the current course.')
      setActionMessage(`Access for “${course.title}” updated. Existing course entitlements are not removed by changing this setting.`)
      await refresh()
    } catch (cause) {
      setActionMessage(messageFor(cause))
    } finally {
      setBusyCourse('')
    }
  }

  async function setLaunchMetricExclusion(student: StudentRecord, exclude: boolean) {
    if (!supabase) return
    const reason = exclude ? window.prompt(`Why should ${student.display_name || 'this account'} be excluded from the public launch count?`, 'Test account') : null
    if (exclude && !reason?.trim()) return

    setBusyLaunchUser(student.id)
    setActionMessage('')
    try {
      const { error: updateError } = await supabase.rpc('set_launch_metric_exclusion', {
        target_user_id: student.id,
        exclude_from_count: exclude,
        exclusion_reason: exclude ? reason?.trim() ?? '' : null,
      })
      if (updateError) throw new Error('Could not update the launch-count exclusion. Confirm your administrator access and try again.')
      setActionMessage(exclude ? 'Student excluded from the public launch count.' : 'Student included in the public launch count.')
      await refresh()
    } catch (cause) {
      setActionMessage(messageFor(cause))
    } finally {
      setBusyLaunchUser('')
    }
  }

  if (authLoading || loading) {
    return <div className="section page-state" role="status" aria-live="polite">Verifying account access and loading your dashboard…</div>
  }
  if (!user) return <div className="section page-state" role="status">Taking you to sign in…</div>
  if (!configured) return <div className="section page-state"><SetupNotice /></div>
  if (error) {
    return (
      <div className="section page-state">
        <div className="inline-state error-state" role="alert">{error}</div>
        <button className="button button-dark" onClick={() => void refresh()} type="button">Try again</button>
      </div>
    )
  }
  if (!profile) return <div className="section page-state" role="alert">Your account profile could not be verified.</div>
  if (profile.account_status !== 'active') {
    return <div className="section page-state"><h1>Account access is unavailable.</h1><p>Your account is not active. Contact Mai Corp App Class support if you believe this is a mistake.</p></div>
  }
  if (profile.role === 'admin') {
    if (!adminData || !requestedAdmin) return <div className="section page-state" role="status">Opening the administrator dashboard…</div>
    return <AdminDashboard
      key={adminData.loadedAt}
      data={adminData}
      busyCourse={busyCourse}
      busyLaunchUser={busyLaunchUser}
      message={actionMessage}
      onRefresh={() => void refresh()}
      onToggleCourse={(course) => void setCoursePublication(course)}
      onSetCourseAccess={(course, accessValue) => void setCourseAccess(course, accessValue)}
      onToggleLaunchExclusion={(student, exclude) => void setLaunchMetricExclusion(student, exclude)}
    />
  }
  if (profile.role === 'student') {
    if (!studentData || requestedAdmin) return <div className="section page-state" role="status">Opening your learning dashboard…</div>
    return <StudentDashboard user={user} profile={profile} data={studentData} onRefresh={() => void refresh()} />
  }
  if (profile.role === 'instructor') {
    if (!instructorData) return <div className="section page-state" role="status">Opening your teaching dashboard…</div>
    return <InstructorDashboard data={instructorData} onRefresh={() => void refresh()} />
  }
  return <div className="section page-state"><h1>Dashboard access unavailable.</h1><p>Your account role could not be recognized. No elevated access was granted.</p></div>
}

function StudentDashboard({ user, profile, data, onRefresh }: {
  user: User
  profile: Profile
  data: StudentData
  onRefresh: () => void
}) {
  const completedLessons = data.progress.filter((item) => item.completed_at)
  const completedIds = new Set(completedLessons.map((item) => item.lesson_id))
  const latestProgress = data.progress[0]
  const latestCourse = latestProgress
    ? data.courses.find((item) => item.course?.lessons.some((lesson) => lesson.id === latestProgress.lesson_id))
    : undefined
  const upcomingSessions = data.sessions
    .filter((session) => session.status === 'live' || new Date(session.scheduled_at).getTime() >= data.loadedAt)
    .slice(0, 5)

  return (
    <div className="page-shell dashboard-page">
      <section className="page-hero learner-hero">
        <div className="eyebrow"><span className="eyebrow-dot" /> YOUR LEARNING SPACE</div>
        <h1>Welcome back, <span>{profile.display_name || 'builder'}.</span></h1>
        <p>{user.email}</p>
        <button className="button button-outline button-small dashboard-refresh" onClick={onRefresh} type="button">Refresh dashboard</button>
      </section>
      <section className="section dashboard-content">
        <div className="dashboard-stat-grid">
          <DashboardStat label="Enrolled courses" value={String(data.courses.length)} />
          <DashboardStat label="Lessons completed" value={String(completedLessons.length)} />
          <DashboardStat label="Upcoming classes" value={String(upcomingSessions.length)} />
        </div>

        <DashboardSection title="Continue learning" eyebrow="YOUR COURSES">
          {data.courses.length ? (
            <div className="dashboard-course-grid">
              {data.courses.map((enrollment) => {
                const course = enrollment.course
                if (!course) return null
                const accessibleLessonIds = new Set(course.lessons.map((lesson) => lesson.id))
                const total = accessibleLessonIds.size
                const complete = [...completedIds].filter((id) => accessibleLessonIds.has(id)).length
                const percent = total ? Math.round((complete / total) * 100) : 0
                const resumeLesson = latestProgress && course.lessons.some((lesson) => lesson.id === latestProgress.lesson_id)
                  ? course.lessons.find((lesson) => lesson.id === latestProgress.lesson_id)
                  : course.lessons[0]
                return (
                  <article className="dashboard-card" key={enrollment.id}>
                    <span className="dashboard-kicker">{enrollment.status === 'completed' ? 'Completed course' : 'Enrolled course'}</span>
                    <h3>{course.title}</h3>
                    <div className="progress-track" role="progressbar" aria-valuenow={percent} aria-valuemin={0} aria-valuemax={100} aria-label={`${course.title} completion`}>
                      <span style={{ width: `${percent}%` }} />
                    </div>
                    <p>{complete} of {total} accessible lessons complete · {percent}%</p>
                    <Link className="button button-dark button-small" to={resumeLesson ? `/courses/${course.slug}` : `/courses/${course.slug}`}>
                      {resumeLesson ? 'Resume course' : 'Open course'} <span aria-hidden="true">↗</span>
                    </Link>
                  </article>
                )
              })}
            </div>
          ) : (
            <EmptyState title="You haven't started a course yet." text="Explore the course library and choose a first project to learn." />
          )}
          <Link className="button button-outline dashboard-section-action" to="/courses">Explore courses</Link>
        </DashboardSection>

        <div className="dashboard-two-column">
          <DashboardSection title="Upcoming classes" eyebrow="LEARN TOGETHER">
            {upcomingSessions.length ? (
              <div className="dashboard-list">
                {upcomingSessions.map((session) => (
                  <article className="dashboard-list-row" key={session.id}>
                    <div><h3>{session.title}</h3><p>{session.course?.title ?? 'Course class'} · {session.instructor?.display_name ?? 'Instructor'}</p><small>{formatDate(session.scheduled_at)}</small></div>
                    <Link className="button button-outline button-small" to={`/classroom/${session.id}`}>{session.status === 'live' ? 'Open class' : 'Class details'}</Link>
                  </article>
                ))}
              </div>
            ) : <EmptyState title="No upcoming classes are scheduled." text="Available live classes will appear here when they are published." />}
            <Link className="button button-outline dashboard-section-action" to="/classes">Browse classes</Link>
          </DashboardSection>
          <DashboardSection title="Your tier access" eyebrow="ONE-TIME ENROLLMENT">
            {data.entitlement?.status === 'active' ? (
              <div className="dashboard-card">
                <h3>{planName(data.entitlement.plan_id)}</h3>
                <p>Purchased {formatDate(data.entitlement.purchased_at)}</p>
                <p>Included app projects: <strong>{data.entitlement.included_project_count}</strong></p>
                <p>App projects covered by support: <strong>{data.entitlement.support_project_limit}</strong></p>
                <small>Your purchased learning access does not expire just because time passes. Training sessions and support are separate tier benefits with their own published terms.</small>
              </div>
            ) : <EmptyState title="No verified tier purchase is connected." text="A verified one-time plan purchase is required to activate tier content and create app projects. No subscription renewal or expiration is implied." />}
            <Link className="button button-outline dashboard-section-action" to="/pricing">Review learning plans</Link>
          </DashboardSection>
        </div>

        <div>
          <DashboardSection title="Messages and support" eyebrow="GET HELP">
            <EmptyState title="Messaging and support are not connected yet." text="No message or support system is configured, so this dashboard will not show simulated conversations or requests." />
          </DashboardSection>
        </div>
        <AppProjectsPanel user={user} data={data} onRefresh={onRefresh} />
        <DashboardSection title="Recent lesson activity" eyebrow="YOUR PROGRESS">
          {data.progress.length ? (
            <div className="dashboard-list">
              {data.progress.slice(0, 5).map((item) => {
                const course = data.courses.find((enrollment) => enrollment.course?.lessons.some((lesson) => lesson.id === item.lesson_id))
                const lesson = course?.course?.lessons.find((candidate) => candidate.id === item.lesson_id)
                return <article className="dashboard-list-row" key={item.lesson_id}><div><h3>{lesson?.title ?? 'Lesson activity'}</h3><p>{course?.course?.title ?? 'Enrolled course'} · {item.completed_at ? 'Completed' : 'In progress'}</p></div><small>{formatDate(item.updated_at)}</small></article>
              })}
            </div>
          ) : <EmptyState title="Your lesson activity will appear here." text="Open an enrolled course and begin a lesson to start tracking progress." />}
          {latestCourse && <p className="dashboard-note">Most recently accessed course: {latestCourse.course?.title ?? 'Course'}</p>}
        </DashboardSection>
        <DashboardSection title="Class attendance" eyebrow="YOUR CLASS HISTORY">
          {data.attendance.length ? <div className="dashboard-list">
            {data.attendance.slice(0, 10).map((record) => <article className="dashboard-list-row" key={record.id}>
              <div><h3>{record.session?.title ?? 'Class session'}</h3><p>{record.left_at ? 'Attended' : 'Joined'} · {record.session?.scheduled_at ? formatDate(record.session.scheduled_at) : 'Class details unavailable'}</p></div>
              <small>{formatDate(record.joined_at)}{record.left_at ? ` – ${formatDate(record.left_at)}` : ' · active'}</small>
            </article>)}
          </div> : <EmptyState title="No class attendance recorded yet." text="After you join a live class, your attendance will appear here." />}
        </DashboardSection>
      </section>
    </div>
  )
}

function InstructorDashboard({ data, onRefresh }: { data: InstructorData; onRefresh: () => void }) {
  const upcomingSessions = data.sessions.filter((session) => session.status === 'scheduled' || session.status === 'live')
  const sessionById = new Map(data.sessions.map((session) => [session.id, session]))

  return <div className="page-shell dashboard-page">
    <section className="page-hero learner-hero">
      <div className="eyebrow"><span className="eyebrow-dot" /> INSTRUCTOR WORKSPACE</div>
      <h1>Your classes<span>.</span></h1>
      <p>Schedule and manage your published-course classes, review attendance, and answer classroom questions.</p>
      <button className="button button-outline button-small dashboard-refresh" onClick={onRefresh} type="button">Refresh dashboard</button>
    </section>
    <section className="section dashboard-content">
      <div className="dashboard-stat-grid">
        <DashboardStat label="Upcoming / live classes" value={String(upcomingSessions.length)} />
        <DashboardStat label="Attendance records" value={String(data.attendance.length)} />
      </div>
      <DashboardSection title="Your teaching schedule" eyebrow="LIVE CLASSES">
        {upcomingSessions.length ? <div className="dashboard-list">
          {upcomingSessions.map((session) => <article className="dashboard-list-row" key={session.id}>
            <div><h3>{session.title}</h3><p>{session.course?.title ?? 'Course class'} · {session.status === 'live' ? 'Live now' : 'Scheduled'}</p><small>{formatDate(session.scheduled_at)}</small></div>
            <DashboardClassActions session={session} onRefresh={onRefresh} />
          </article>)}
        </div> : <EmptyState title="No classes are scheduled." text="Schedule a class for one of your published courses from the class setup form below." />}
        <a className="button button-dark dashboard-section-action" href="#class-setup">Schedule or start a class</a>
      </DashboardSection>
      <DashboardClassSetup role="instructor" onScheduled={onRefresh} />
      <DashboardSection title="Attendance" eyebrow="CLASS PARTICIPATION">
        {data.attendance.length ? <div className="dashboard-list">
          {data.attendance.slice(0, 100).map((record) => <article className="dashboard-list-row" key={record.id}>
            <div><h3>{record.participant?.display_name || 'Student'}</h3><p>{sessionById.get(record.session_id)?.title ?? 'Class session'} · {record.left_at ? 'Left class' : 'Currently marked present'}</p></div>
            <small>{formatDate(record.joined_at)}{record.left_at ? ` – ${formatDate(record.left_at)}` : ''}</small>
          </article>)}
        </div> : <EmptyState title="No class attendance recorded." text="Attendance will be listed after students join one of your live classes." />}
      </DashboardSection>
    </section>
  </div>
}

function planName(planId: string) {
  const names: Record<string, string> = {
    'live-learner': 'Live Learner',
    'personal-builder': 'Personal Builder',
    'app-support': 'App Support',
    'app-portfolio': 'App Portfolio',
  }

  return names[planId] ?? planId
}

function DashboardClassActions({ session, onRefresh }: { session: ClassroomSession; onRefresh: () => void }) {
  const navigate = useNavigate()
  const [busy, setBusy] = useState(false)
  const [error, setError] = useState('')
  const [now, setNow] = useState(() => Date.now())

  useEffect(() => {
    if (session.status !== 'scheduled') return
    const timer = window.setInterval(() => setNow(Date.now()), 30_000)
    return () => window.clearInterval(timer)
  }, [session.status])

  const scheduledAt = Date.parse(session.scheduled_at)
  const canStart = session.status === 'scheduled'
    && Number.isFinite(scheduledAt)
    && now >= scheduledAt - 15 * 60_000
    && now <= scheduledAt + 2 * 60 * 60_000

  async function startClass() {
    if (!supabase || busy || !canStart) return
    setBusy(true)
    setError('')
    try {
      const { error: rpcError } = await supabase.rpc('start_class_session', {
        target_session_id: session.id,
      })
      if (rpcError) throw new Error(rpcError.message)
      onRefresh()
      navigate(`/classroom/${session.id}`)
    } catch (cause) {
      setError(messageFor(cause))
      setBusy(false)
    }
  }

  return <div className="dashboard-class-actions">
    {session.status === 'scheduled' && <button
      className="button button-dark button-small"
      disabled={!canStart || busy}
      onClick={() => void startClass()}
      type="button"
    >
      {busy ? 'Starting…' : 'Start class'}
    </button>}
    <Link className="button button-outline button-small" to={`/classroom/${session.id}`}>
      {session.status === 'live' ? 'Open live classroom' : 'Class details'}
    </Link>
    {error && <p className="form-message form-error dashboard-class-error" role="alert">{error}</p>}
    {session.status === 'scheduled' && !canStart && <small className="dashboard-class-hint">Available from 15 minutes before to 2 hours after the scheduled time.</small>}
  </div>
}

function DashboardClassSetup({ role, onScheduled }: { role: 'admin' | 'instructor'; onScheduled: () => void }) {
  const navigate = useNavigate()
  const [courses, setCourses] = useState<{ id: string; title: string; instructor_id: string }[]>([])
  const [courseId, setCourseId] = useState('')
  const [title, setTitle] = useState('')
  const [description, setDescription] = useState('')
  const [scheduledAt, setScheduledAt] = useState('')
  const [duration, setDuration] = useState('60')
  const [busy, setBusy] = useState(false)
  const [error, setError] = useState('')
  const [notice, setNotice] = useState('')

  useEffect(() => {
    const client = supabase
    if (!client) return
    let active = true
    async function loadCourses(connectedClient: NonNullable<typeof supabase>) {
      let query = connectedClient
        .from('courses')
        .select('id, title, instructor_id')
        .eq('status', 'published')
        .order('title', { ascending: true })
      if (role === 'instructor') {
        const { data: userResult } = await connectedClient.auth.getUser()
        if (!userResult.user) return
        query = query.eq('instructor_id', userResult.user.id)
      }
      const { data, error: queryError } = await query
      if (!active) return
      if (queryError) setError(`Could not load published courses: ${queryError.message}`)
      else setCourses(data ?? [])
    }
    void loadCourses(client)
    return () => { active = false }
  }, [role])

  async function startClassNow() {
    if (!supabase || busy) return
    const course = courses.find((item) => item.id === courseId)
    const minutes = Number(duration)
    if (!course) {
      setError('Choose a published course before starting a class.')
      return
    }
    if (!title.trim()) {
      setError('Enter a class title before starting.')
      return
    }
    if (!Number.isInteger(minutes) || minutes < 15 || minutes > 360) {
      setError('Class duration must be from 15 to 360 minutes.')
      return
    }

    setBusy(true)
    setError('')
    setNotice('')
    try {
      // Schedule one minute ahead so the session is valid for the same server-authorized
      // start window used by the classroom controls, then use the lifecycle RPC.
      const { data: created, error: insertError } = await supabase
        .from('class_sessions')
        .insert({
          course_id: course.id,
          lesson_id: null,
          instructor_id: course.instructor_id,
          title: title.trim(),
          description: description.trim(),
          learning_objectives: [],
          scheduled_at: new Date(Date.now() + 60_000).toISOString(),
          expected_duration_minutes: minutes,
        })
        .select('id')
        .single()
      if (insertError) throw new Error(`Could not create the class: ${insertError.message}`)
      if (!created?.id) throw new Error('The class was created but its session ID was not returned.')

      const { error: startError } = await supabase.rpc('start_class_session', {
        target_session_id: created.id,
      })
      if (startError) {
        throw new Error(`The class was created, but could not be started: ${startError.message}. It remains scheduled so you can start it from your dashboard.`)
      }
      onScheduled()
      navigate(`/classroom/${created.id}`)
    } catch (cause) {
      setError(messageFor(cause))
      setBusy(false)
    }
  }

  async function scheduleClass(event: FormEvent<HTMLFormElement>) {
    event.preventDefault()
    if (!supabase || busy) return
    const course = courses.find((item) => item.id === courseId)
    const startTime = new Date(scheduledAt)
    const minutes = Number(duration)
    if (!course) {
      setError('Choose a published course for this class.')
      return
    }
    if (Number.isNaN(startTime.getTime()) || startTime.getTime() <= Date.now()) {
      setError('Choose a valid future class start time.')
      return
    }
    if (!Number.isInteger(minutes) || minutes < 15 || minutes > 360) {
      setError('Class duration must be from 15 to 360 minutes.')
      return
    }
    setBusy(true)
    setError('')
    setNotice('')
    try {
      const { error: insertError } = await supabase.from('class_sessions').insert({
        course_id: course.id,
        lesson_id: null,
        instructor_id: course.instructor_id,
        title: title.trim(),
        description: description.trim(),
        learning_objectives: [],
        scheduled_at: startTime.toISOString(),
        expected_duration_minutes: minutes,
      })
      if (insertError) throw new Error(`Could not schedule class: ${insertError.message}`)
      setNotice('Class scheduled. It will appear in your teaching dashboard and class list.')
      setCourseId('')
      setTitle('')
      setDescription('')
      setScheduledAt('')
      setDuration('60')
      onScheduled()
    } catch (cause) {
      setError(messageFor(cause))
    } finally {
      setBusy(false)
    }
  }

  return <DashboardSection id="class-setup" title="Set up a live class" eyebrow="CLASS SETUP">
    <p className="dashboard-note">Schedule a class directly from your dashboard. Start it here when the start window opens.</p>
    {courses.length === 0 ? <div>
      <EmptyState
        title="No courses available."
        text={role === 'admin' ? 'Create a course first, or use the Admin Control Center to manage courses.' : 'You need a published course assigned to you before scheduling a class.'}
      />
      {role === 'admin' && <div style={{ marginTop: '12px' }}><Link className="button button-dark" to="/admin/course-editor">Create Course</Link> <Link className="button button-outline" to="/admin">Manage Courses</Link></div>}
    </div> : <form className="class-link-form dashboard-class-setup-form" onSubmit={(event) => void scheduleClass(event)}>
      <label>Course<select onChange={(event) => setCourseId(event.target.value)} required value={courseId}><option value="">Select a course</option>{courses.map((course) => <option key={course.id} value={course.id}>{course.title}</option>)}</select></label>
      <label>Class title<input maxLength={180} onChange={(event) => setTitle(event.target.value)} required value={title} /></label>
      <label>Description<textarea maxLength={5000} onChange={(event) => setDescription(event.target.value)} rows={3} value={description} /></label>
      <div className="form-two-col"><label>Start time<input onChange={(event) => setScheduledAt(event.target.value)} required type="datetime-local" value={scheduledAt} /></label><label>Expected duration (minutes)<input max="360" min="15" onChange={(event) => setDuration(event.target.value)} required type="number" value={duration} /></label></div>
      <div className="dashboard-class-setup-actions">
        <button className="button button-dark" disabled={busy || courses.length === 0} type="submit">{busy ? 'Working…' : 'Schedule class'}</button>
        <button className="button button-lime" disabled={busy || courses.length === 0} onClick={() => void startClassNow()} type="button">{busy ? 'Starting…' : 'Start class now ↗'}</button>
      </div>
      <p className="dashboard-note">Starting now creates a class session, authorizes the start through Supabase, and opens the Agora classroom. Camera and microphone still require your permission in the classroom.</p>
    </form>}
    {error && <p className="form-message form-error" role="alert">{error}</p>}
    {notice && <p className="form-message form-success" role="status">{notice}</p>}
  </DashboardSection>
}

function AppProjectsPanel({ user, data, onRefresh }: {
  user: User
  data: StudentData
  onRefresh: () => void
}) {
  const [projectName, setProjectName] = useState('')
  const [projectDescription, setProjectDescription] = useState('')
  const [saving, setSaving] = useState(false)
  const [updatingProject, setUpdatingProject] = useState('')
  const [message, setMessage] = useState('')

  const canCreate = data.entitlement?.status === 'active'

  async function createProject(event: FormEvent<HTMLFormElement>) {
    event.preventDefault()
    if (!supabase || !canCreate || saving) return
    setSaving(true)
    setMessage('')
    try {
      const { error } = await supabase.rpc('create_student_app_project', {
        project_name: projectName,
        project_description: projectDescription,
        request_idempotency_key: crypto.randomUUID(),
      })
      if (error) {
        if (error.code === 'P1001') throw new Error('A verified active plan purchase is required before creating a project.')
        if (error.code === 'P1002') throw new Error('Your included projects have been used. One App Credit is required for this project.')
        throw new Error('The project was not created. Refresh and try again.')
      }
      setProjectName('')
      setProjectDescription('')
      setMessage('Project created. Its tier inclusion or App Credit use is recorded in your account.')
      onRefresh()
    } catch (cause) {
      setMessage(messageFor(cause))
    } finally {
      setSaving(false)
    }
  }

  async function updateProjectStatus(project: AppProject, status: string) {
    if (!supabase || updatingProject) return
    setUpdatingProject(project.id)
    setMessage('')
    try {
      const { data: updated, error } = await supabase
        .from('student_app_projects')
        .update({ status })
        .eq('id', project.id)
        .eq('owner_id', user.id)
        .select('id')
        .maybeSingle()
      if (error || !updated) throw new Error('Could not update project status. Refresh and try again.')
      setMessage(`“${project.name}” status updated.`)
      onRefresh()
    } catch (cause) {
      setMessage(messageFor(cause))
    } finally {
      setUpdatingProject('')
    }
  }

  const includedRemaining = Math.max(0, (data.entitlement?.included_project_count ?? 0) - data.totalProjectsUsed)
  const recentCreditDelta = (delta: number) => `${delta > 0 ? '+' : ''}${delta}`

  return (
    <DashboardSection title="My app projects" eyebrow="PROJECTS AND APP CREDITS">
      <div className="app-wallet-stats">
        <DashboardStat label="Projects used" value={String(data.totalProjectsUsed)} />
        <DashboardStat label="Tier projects remaining" value={String(includedRemaining)} />
        <DashboardStat label="Available App Credits" value={String(data.creditBalance)} />
      </div>
      <p className="dashboard-note">One App Credit starts exactly one additional app project. Credits do not expire automatically. External hosting, domains, paid APIs, and AI usage are separate costs.</p>
      {!canCreate && <p className="dashboard-notice">Project creation is locked until a verified one-time plan purchase is connected to this account.</p>}
      {canCreate && (
        <form className="app-project-form" onSubmit={(event) => void createProject(event)}>
          <label>
            Project name
            <input maxLength={120} required value={projectName} onChange={(event) => setProjectName(event.target.value)} />
          </label>
          <label>
            Description <span>(optional)</span>
            <textarea maxLength={2000} rows={3} value={projectDescription} onChange={(event) => setProjectDescription(event.target.value)} />
          </label>
          <button className="button button-dark" type="submit" disabled={saving || !projectName.trim()}>
            {saving ? 'Creating project…' : includedRemaining > 0 ? 'Start included project' : 'Start project — use 1 App Credit'}
          </button>
        </form>
      )}
      {!data.creditBalance && includedRemaining === 0 && (
        <p className="dashboard-note">You have used your tier-included projects. App Credit purchases will be available after secure checkout is configured; no price or purchase is being represented yet.</p>
      )}
      {message && <p className="form-message" role="status">{message}</p>}

      <h3 className="dashboard-subheading">Project history</h3>
      {data.projects.length ? (
        <div className="dashboard-list">
          {data.projects.map((project) => (
            <article className="dashboard-list-row app-project-row" key={project.id}>
              <div>
                <h3>App {project.project_number}: {project.name}</h3>
                <p>{project.description || 'No description'} · {project.funding_source === 'included' ? 'Tier-included project' : '1 App Credit used'}</p>
                <small>Created {formatDate(project.created_at)}</small>
              </div>
              <label className="project-status">
                Status
                <select
                  aria-label={`Status for ${project.name}`}
                  disabled={updatingProject === project.id}
                  value={project.status}
                  onChange={(event) => void updateProjectStatus(project, event.target.value)}
                >
                  {['planning', 'learning', 'in_development', 'testing', 'ready_for_deployment', 'completed', 'paused'].map((status) => (
                    <option value={status} key={status}>{status.replaceAll('_', ' ')}</option>
                  ))}
                </select>
              </label>
            </article>
          ))}
        </div>
      ) : <EmptyState title="No app projects yet." text="Create the first project included with your plan. Additional projects require exactly one App Credit each." />}

      <h3 className="dashboard-subheading">Recent credit activity</h3>
      {data.creditTransactions.length ? (
        <div className="dashboard-list">
          {data.creditTransactions.map((transaction) => (
            <article className="dashboard-list-row" key={transaction.id}>
              <div><h3>{transaction.transaction_type.replaceAll('_', ' ')}</h3><p>{transaction.reason}</p></div>
              <strong className={transaction.credit_delta < 0 ? 'credit-negative' : 'credit-positive'}>{recentCreditDelta(transaction.credit_delta)}</strong>
            </article>
          ))}
        </div>
      ) : <p className="dashboard-note">No App Credit transactions have been recorded.</p>}
    </DashboardSection>
  )
}

function localDateTimeValue(value: string | null) {
  if (!value) return ''
  const date = new Date(value)
  if (Number.isNaN(date.getTime())) return ''
  const offset = date.getTimezoneOffset() * 60000
  return new Date(date.getTime() - offset).toISOString().slice(0, 16)
}

function AdminDashboard({ data, busyCourse, busyLaunchUser, message, onRefresh, onToggleCourse, onSetCourseAccess, onToggleLaunchExclusion }: {
  data: AdminData
  busyCourse: string
  busyLaunchUser: string
  message: string
  onRefresh: () => void
  onToggleCourse: (course: CourseRecord) => void
  onSetCourseAccess: (course: CourseRecord, accessValue: string) => void
  onToggleLaunchExclusion: (student: StudentRecord, exclude: boolean) => void
}) {
  const recentSessions = data.sessions
    .filter((session) => session.status === 'live' || new Date(session.scheduled_at).getTime() >= data.loadedAt)
    .slice(0, 8)
  const [launchDateValue, setLaunchDateValue] = useState(() => localDateTimeValue(data.launchStats.launchAt))
  const [savingLaunchDate, setSavingLaunchDate] = useState(false)
  const [launchDateMessage, setLaunchDateMessage] = useState('')

  async function saveLaunchDate(event: FormEvent<HTMLFormElement>) {
    event.preventDefault()
    setSavingLaunchDate(true)
    setLaunchDateMessage('')
    try {
      const launchAt = launchDateValue ? new Date(launchDateValue).toISOString() : null
      await setPublicLaunchAt(launchAt)
      setLaunchDateMessage(launchAt ? 'Official launch date saved.' : 'Official launch date cleared.')
      onRefresh()
    } catch (cause) {
      setLaunchDateMessage(messageFor(cause))
    } finally {
      setSavingLaunchDate(false)
    }
  }

  return (
    <div className="page-shell dashboard-page">
      <section className="page-hero learner-hero">
        <div className="eyebrow"><span className="eyebrow-dot" /> PLATFORM ADMINISTRATION</div>
        <h1>Administrator <span>dashboard.</span></h1>
        <p>Live data visible to your authorized administrator account.</p>
        <button className="button button-outline button-small dashboard-refresh" onClick={onRefresh} type="button">Refresh dashboard</button>
      </section>
      <section className="section dashboard-content">
        <div className="dashboard-stat-grid admin-stat-grid">
          <DashboardStat label="Registered student accounts" value={String(data.registeredStudents)} />
          <DashboardStat label="Published courses" value={String(data.publishedCourses)} />
          <DashboardStat label="Draft courses" value={String(data.drafts)} />
          <DashboardStat label="Upcoming / live classes" value={String(data.upcomingClasses)} />
          <DashboardStat label="Verified one-time plans" value={String(data.activePlanEntitlements)} />
          <DashboardStat label="Confirmed enrolled students" value={String(data.launchStats.enrolledStudents)} />
        </div>
        <div className="dashboard-notice" role="note">The public launch count includes distinct active student accounts with confirmed active/completed course enrollments, excludes test accounts, and requires verified plan entitlements for paid courses. Pending checkouts are never counted.</div>
        {message && <p className={message.includes('Could not') ? 'form-message form-error' : 'form-message form-success'} role={message.includes('Could not') ? 'alert' : 'status'}>{message}</p>}
        <DashboardSection title="Official launch date" eyebrow="PUBLIC LAUNCH SETTINGS">
          <p>One central timestamp drives the countdown shown to every visitor. Leaving the field empty keeps the public page on “Launch date coming soon.”</p>
          <p className="dashboard-note">Current official date: {formatDate(data.launchStats.launchAt)}</p>
          <form className="launch-date-form" onSubmit={(event) => void saveLaunchDate(event)}>
            <label>
              Launch date and time <span>(your local time; saved as an authoritative timestamp)</span>
              <input type="datetime-local" value={launchDateValue} onChange={(event) => setLaunchDateValue(event.target.value)} />
            </label>
            <button className="button button-dark" type="submit" disabled={savingLaunchDate}>
              {savingLaunchDate ? 'Saving…' : launchDateValue ? 'Save official launch date' : 'Clear launch date'}
            </button>
          </form>
          {launchDateMessage && <p className="form-message" role="status">{launchDateMessage}</p>}
        </DashboardSection>
        <DashboardClassSetup role="admin" onScheduled={onRefresh} />
        <div className="dashboard-two-column">
          <DashboardSection title="Recent student accounts" eyebrow="STUDENT MANAGEMENT">
            {data.students.length ? (
              <div className="dashboard-list">
                {data.students.map((student) => (
                  <article className="dashboard-list-row" key={student.id}>
                    <div><h3>{student.display_name || 'Student account'}</h3><p>{student.account_status}{data.excludedStudentIds.includes(student.id) ? ' · excluded from launch count' : ''}</p><small>Joined {formatDate(student.created_at)}</small></div>
                    <button
                      className="button button-outline button-small"
                      disabled={busyLaunchUser === student.id}
                      onClick={() => onToggleLaunchExclusion(student, !data.excludedStudentIds.includes(student.id))}
                      type="button"
                    >
                      {busyLaunchUser === student.id ? 'Saving…' : data.excludedStudentIds.includes(student.id) ? 'Include in count' : 'Exclude from count'}
                    </button>
                  </article>
                ))}
              </div>
            ) : <EmptyState title="No student accounts found." text="New student profiles will appear here when created." />}
            <p className="dashboard-note">Test-account exclusions are administrator-managed and audited. Email addresses and authentication data are not shown here.</p>
          </DashboardSection>
          <DashboardSection title="Upcoming classes" eyebrow="CLASS OPERATIONS">
            {recentSessions.length ? (
              <div className="dashboard-list">
                {recentSessions.map((session) => (
                  <article className="dashboard-list-row" key={session.id}>
                    <div><h3>{session.title}</h3><p>{session.course?.title ?? 'Course'} · {session.status}</p><small>{formatDate(session.scheduled_at)}</small></div>
                    <DashboardClassActions session={session} onRefresh={onRefresh} />
                  </article>
                ))}
              </div>
            ) : <EmptyState title="No upcoming classes." text="Scheduled or live sessions will appear when present in the database." />}
            <a className="button button-dark dashboard-section-action" href="#class-setup">Schedule or start a class</a>
          </DashboardSection>
        </div>
        <DashboardSection title="Course publication" eyebrow="COURSES AND LESSONS">
          {data.courses.length ? (
            <div className="dashboard-list">
              {data.courses.map((course) => (
                <article className="dashboard-list-row" key={course.id}>
                  <div><h3>{course.title}</h3><p>{course.status} · {course.access_level} access · Updated {formatDate(course.updated_at)}</p></div>
                  <div className="dashboard-course-actions">
                    <label className="course-access-control">
                      Content access
                      <select
                        aria-label={`Content access for ${course.title}`}
                        disabled={busyCourse === course.id}
                        value={course.required_plan_id ? `plan:${course.required_plan_id}` : course.access_level}
                        onChange={(event) => onSetCourseAccess(course, event.target.value)}
                      >
                        <option value="free">Free</option>
                        <option value="enrolled">Existing enrollment</option>
                        <option value="subscription">Verified plan enrollment only</option>
                        <option value="plan:live-learner">Live Learner plan</option>
                        <option value="plan:personal-builder">Personal Builder plan and above</option>
                        <option value="plan:app-support">App Support plan and above</option>
                        <option value="plan:app-portfolio">App Portfolio plan</option>
                      </select>
                    </label>
                    <Link className="button button-outline button-small" to={`/courses/${course.slug}`}>Preview</Link>
                    {course.status !== 'archived' ? (
                      <button className="button button-dark button-small" disabled={busyCourse === course.id} onClick={() => onToggleCourse(course)} type="button">
                        {busyCourse === course.id ? 'Saving…' : course.status === 'published' ? 'Unpublish' : 'Publish'}
                      </button>
                    ) : <span className="dashboard-kicker">Archived · action unavailable</span>}
                  </div>
                </article>
              ))}
            </div>
          ) : <EmptyState title="No courses found." text="Course management is available when course records have been created." />}
        </DashboardSection>
        <DashboardSection title="Not yet integrated" eyebrow="WORKFLOW AVAILABILITY">
          <div className="dashboard-feature-grid">
            <FeatureState title="Payment checkout and webhook" text="Plan and credit grants accept only trusted server-verified payment events. Checkout and provider webhook configuration still need to be connected." />
            <FeatureState title="Support, messaging, and training" text="Support, messaging, and one-on-one scheduling workflows are not configured. Those service terms remain separate from persistent course access." />
            <FeatureState title="Credit top-ups" text="App Credit purchases are not offered until a payment provider is configured; no price or simulated balance is shown." />
          </div>
        </DashboardSection>
      </section>
    </div>
  )
}

function DashboardStat({ label, value }: { label: string; value: string }) {
  return <article className="dashboard-stat"><span>{label}</span><strong>{value}</strong></article>
}

function DashboardSection({ id, title, eyebrow, children }: { id?: string; title: string; eyebrow: string; children: ReactNode }) {
  return <section className="dashboard-section" id={id}><div className="eyebrow"><span className="eyebrow-dot" /> {eyebrow}</div><h2>{title}</h2>{children}</section>
}

function FeatureState({ title, text }: { title: string; text: string }) {
  return <article className="dashboard-card"><h3>{title}</h3><p>{text}</p></article>
}





