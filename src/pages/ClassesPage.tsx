import { useEffect, useState, type FormEvent } from 'react'
import { Link, useNavigate, useParams } from 'react-router-dom'
import { useAuth } from '../auth/useAuth'
import { getClassSession, listActiveClassLinks, listClassHandRaises, listClassSessions, listSessionParticipants, type ClassroomSession, type HandRaise, type SessionParticipant, type SharedClassLink } from '../lib/classroom'
import { isSupabaseConfigured, supabase } from '../lib/supabase'
import { EmptyState, SetupNotice } from './Shared'
import { ClassroomMediaPanel } from './ClassroomMediaPanel'
import { ClassroomChatPanel, ClassroomQuestionsPanel } from './ClassroomInteractionPanels'
import { DesktopOnly } from './DesktopOnly'
import { ClassStreamInterestPanel } from './ClassStreamInterestPanel'
import { ClassRecordingUploadPanel } from './ClassRecordingUploadPanel'

export function ClassListPage() {
  const { user } = useAuth()
  const [sessions, setSessions] = useState<ClassroomSession[]>([])
  const [managerRole, setManagerRole] = useState<string | null>(null)
  const [manageableCourses, setManageableCourses] = useState<{ id: string; title: string; instructor_id: string }[]>([])
  const [courseId, setCourseId] = useState('')
  const [newTitle, setNewTitle] = useState('')
  const [newDescription, setNewDescription] = useState('')
  const [scheduledAt, setScheduledAt] = useState('')
  const [durationMinutes, setDurationMinutes] = useState('60')
  const [scheduleBusy, setScheduleBusy] = useState(false)
  const [scheduleNotice, setScheduleNotice] = useState('')
  const [loading, setLoading] = useState(isSupabaseConfigured)
  const [error, setError] = useState('')

  const refreshSessions = async () => {
    const items = await listClassSessions()
    setSessions(items)
  }

  useEffect(() => {
    if (!isSupabaseConfigured) return
    let active = true
    void listClassSessions()
      .then((items) => { if (active) setSessions(items) })
      .catch((cause: unknown) => {
        if (active) setError(cause instanceof Error ? cause.message : 'Could not load live classes.')
      })
      .finally(() => { if (active) setLoading(false) })
    return () => { active = false }
  }, [])

  useEffect(() => {
    const client = supabase
    if (!client || !user) return
    const authenticatedUserId = user.id
    let active = true
    async function loadManagerCourses(
      client: NonNullable<typeof supabase>,
      authenticatedUserId: string,
    ) {
      try {
        const { data: profile, error: profileError } = await client
          .from('profiles')
          .select('role')
          .eq('id', authenticatedUserId)
          .maybeSingle()
        if (profileError) throw new Error(`Could not check class-management access: ${profileError.message}`)
        const currentRole = profile?.role ?? null
        if (!active) return
        setManagerRole(currentRole)
        if (currentRole !== 'admin' && currentRole !== 'instructor') return

        let query = client
          .from('courses')
          .select('id, title, instructor_id')
          .eq('status', 'published')
          .order('title', { ascending: true })
        if (currentRole === 'instructor') query = query.eq('instructor_id', authenticatedUserId)
        const { data, error: coursesError } = await query
        if (coursesError) throw new Error(`Could not load courses for scheduling: ${coursesError.message}`)
        if (active) setManageableCourses(data ?? [])
      } catch (cause) {
        if (active) setError(cause instanceof Error ? cause.message : 'Could not load class-management access.')
      }
    }
    void loadManagerCourses(client, authenticatedUserId)
    return () => { active = false }
  }, [user])

  async function createClassSession(event: FormEvent<HTMLFormElement>) {
    event.preventDefault()
    if (!supabase || !user || scheduleBusy) return
    const course = manageableCourses.find((item) => item.id === courseId)
    if (!course) {
      setError('Choose a course you are authorized to teach.')
      return
    }
    const scheduleDate = new Date(scheduledAt)
    const minutes = Number(durationMinutes)
    if (Number.isNaN(scheduleDate.getTime()) || scheduleDate.getTime() <= Date.now()) {
      setError('Choose a valid future class start time.')
      return
    }
    if (!Number.isInteger(minutes) || minutes < 15 || minutes > 360) {
      setError('Class duration must be from 15 to 360 minutes.')
      return
    }
    setScheduleBusy(true)
    setError('')
    setScheduleNotice('')
    try {
      const { error: insertError } = await supabase.from('class_sessions').insert({
        course_id: course.id,
        lesson_id: null,
        instructor_id: course.instructor_id,
        title: newTitle.trim(),
        description: newDescription.trim(),
        learning_objectives: [],
        scheduled_at: scheduleDate.toISOString(),
        expected_duration_minutes: minutes,
      })
      if (insertError) throw new Error(`Could not schedule the class: ${insertError.message}`)
      setNewTitle('')
      setNewDescription('')
      setScheduledAt('')
      setDurationMinutes('60')
      setScheduleNotice('Class scheduled. Access is checked against the selected course’s enrollment rules.')
      await refreshSessions()
    } catch (cause) {
      setError(cause instanceof Error ? cause.message : 'Could not schedule this class.')
    } finally {
      setScheduleBusy(false)
    }
  }

  return <div className="page-shell">
    <section className="page-hero collection-hero">
      <div className="eyebrow"><span className="eyebrow-dot" /> LEARN TOGETHER</div>
      <h1>Live classes<span>.</span></h1>
      <p>Join instructors for practical, instructor-led sessions. Class listings are loaded from the platform schedule.</p>
    </section>
    <section className="section collection-content">
      {!isSupabaseConfigured ? <SetupNotice /> : <>{managerRole && (managerRole === 'admin' || managerRole === 'instructor') && <section className="classroom-panel class-scheduler">
        <div className="panel-heading"><div><div className="eyebrow">INSTRUCTOR / ADMIN</div><h2>Schedule a live class</h2></div></div>
        {manageableCourses.length === 0 ? <p className="panel-empty">No published courses are available for your account.</p> : <form className="class-link-form" onSubmit={(event) => void createClassSession(event)}>
          <label>Published course<select onChange={(event) => setCourseId(event.target.value)} required value={courseId}><option value="">Select a course</option>{manageableCourses.map((course) => <option key={course.id} value={course.id}>{course.title}</option>)}</select></label>
          <label>Class title<input maxLength={180} onChange={(event) => setNewTitle(event.target.value)} required value={newTitle} /></label>
          <label>Description<textarea maxLength={5000} onChange={(event) => setNewDescription(event.target.value)} rows={3} value={newDescription} /></label>
          <div className="form-two-col"><label>Start time<input onChange={(event) => setScheduledAt(event.target.value)} required type="datetime-local" value={scheduledAt} /></label><label>Expected duration (minutes)<input max="360" min="15" onChange={(event) => setDurationMinutes(event.target.value)} required type="number" value={durationMinutes} /></label></div>
          <button className="button button-dark" disabled={scheduleBusy || manageableCourses.length === 0} type="submit">{scheduleBusy ? 'Scheduling…' : 'Schedule class'}</button>
        </form>}
        {scheduleNotice && <p className="form-message form-success" role="status">{scheduleNotice}</p>}
      </section>}
      {error && <div className="inline-state error-state" role="alert">{error}</div>}
      {loading ? <div className="inline-state" role="status">Loading scheduled classes…</div> : error ? null : sessions.length === 0 ? <EmptyState title="No upcoming classes are published." text="When instructors schedule a class, the details will appear here." /> : <div className="class-list">
        {sessions.map((session) => <article className="class-card" key={session.id}>
          <div className={session.public_qa_enabled ? 'class-status is-live' : session.status === 'live' ? 'class-status is-live' : 'class-status'}>{session.public_qa_enabled ? 'PUBLIC LIVE Q&A · $10 / 24 HOURS' : session.status === 'live' ? 'LIVE NOW' : 'UPCOMING'}</div>
          <div className="class-card-info">
            <span className="class-course">{session.course?.title ?? 'Mai Corp App Class'}</span>
            <h2>{session.title}</h2>
            <p>{session.description}</p>
            {session.public_qa_enabled && <p className="qa-pass-disclosure">A $10 pass includes viewing and live question submission. Its 24-hour timer starts at payment confirmation, even when the session is offline. Streaming is available only while live unless a replay is configured, so buying without an available live session or replay may provide little or no viewing time. Checkout is not configured yet.</p>}
            <div className="class-meta"><span>With {session.instructor?.display_name ?? 'Your instructor'}</span><span>{new Intl.DateTimeFormat(undefined, { dateStyle: 'medium', timeStyle: 'short' }).format(new Date(session.scheduled_at))}</span>{session.expected_duration_minutes && <span>{session.expected_duration_minutes} min</span>}</div>
          </div>
          <Link className="button button-dark" to={`/classroom/${session.id}`}>Open class workspace <span aria-hidden="true">↗</span></Link>
        </article>)}
      </div>}</>}
    </section>
  </div>
}

export function ClassroomPage() {
  return <DesktopOnly><ClassroomPageContent /></DesktopOnly>
}

function ClassroomPageContent() {
  const { sessionId = '' } = useParams()
  const navigate = useNavigate()
  const { user, loading: authLoading } = useAuth()
  const [session, setSession] = useState<ClassroomSession | null>(null)
  const [role, setRole] = useState<string | null>(null)
  const [profileDisplayName, setProfileDisplayName] = useState<string | null>(null)
  const [accessAllowed, setAccessAllowed] = useState(false)
  const [loading, setLoading] = useState(isSupabaseConfigured)
  const [error, setError] = useState('')
  const [lifecycleBusy, setLifecycleBusy] = useState(false)
  const [lifecycleError, setLifecycleError] = useState('')
  const [passExpiry, setPassExpiry] = useState<string | null>(null)
  const [clockNow, setClockNow] = useState(Date.now())

  useEffect(() => {
    if (!authLoading && !user) navigate('/sign-in', { replace: true })
  }, [authLoading, navigate, user])

  useEffect(() => {
    const client = supabase
    if (!client || !user) return
    let active = true

    async function loadClassroom(
      client: NonNullable<typeof supabase>,
      authenticatedUser: NonNullable<typeof user>,
    ) {
      setLoading(true)
      setError('')
      try {
        const [classSession, accessResult, profileResult] = await Promise.all([
          getClassSession(sessionId),
          client.rpc('can_access_class_session', { target_session_id: sessionId }),
          client.from('profiles').select('role, display_name').eq('id', authenticatedUser.id).maybeSingle(),
        ])
        if (profileResult.error) throw new Error(`Could not load your account role: ${profileResult.error.message}`)
        if (accessResult.error) throw new Error(`Could not verify class access: ${accessResult.error.message}`)
        if (active) {
          setSession(classSession)
          setRole(profileResult.data?.role ?? null)
          setProfileDisplayName(profileResult.data?.display_name ?? null)
          setAccessAllowed(Boolean(accessResult.data))
        }
      } catch (cause) {
        if (active) setError(cause instanceof Error ? cause.message : 'Could not load this class.')
      } finally {
        if (active) setLoading(false)
      }
    }

    void loadClassroom(client, user)
    const channel = client
      .channel(`classroom-access-${sessionId}-${user.id}`)
      .on('postgres_changes', {
        event: '*',
        schema: 'public',
        table: 'session_access_restrictions',
        filter: `session_id=eq.${sessionId}`,
      }, () => { void loadClassroom(client, user) })
      .on('postgres_changes', {
        event: 'UPDATE',
        schema: 'public',
        table: 'class_sessions',
        filter: `id=eq.${sessionId}`,
      }, () => { void loadClassroom(client, user) })
      .subscribe((status) => {
        if (status === 'CHANNEL_ERROR' || status === 'TIMED_OUT') {
          if (active) setError('Live access updates disconnected. Refresh the page to re-check your access.')
        }
      })

    return () => {
      active = false
      void client.removeChannel(channel)
    }
  }, [sessionId, user])

  useEffect(() => {
    if (!session?.public_qa_enabled || !user || role !== 'student' || !supabase) return
    let active = true
    setPassExpiry(null)
    void supabase
      .from('public_qa_passes')
      .select('expires_at')
      .eq('session_id', session.id)
      .eq('user_id', user.id)
      .gt('expires_at', new Date().toISOString())
      .order('expires_at', { ascending: false })
      .limit(1)
      .maybeSingle()
      .then(({ data, error: passError }) => {
        if (!active) return
        if (passError) setError(`Could not check your Q&A access pass: ${passError.message}`)
        else setPassExpiry(data?.expires_at ?? null)
      })
    return () => { active = false }
  }, [role, session, user])

  useEffect(() => {
    if (session?.status !== 'scheduled') return
    const timer = window.setInterval(() => setClockNow(Date.now()), 30_000)
    return () => window.clearInterval(timer)
  }, [session?.status])

  async function handleSessionLifecycle(action: 'start_class_session' | 'end_class_session' | 'cancel_class_session') {
    if (!supabase || lifecycleBusy) return
    setLifecycleBusy(true)
    setLifecycleError('')
    try {
      const { data, error: rpcError } = await supabase.rpc(action, { target_session_id: sessionId })
      if (rpcError) throw new Error(rpcError.message)
      if (data) setSession(data as unknown as ClassroomSession)
      const { data: access, error: accessError } = await supabase.rpc('can_access_class_session', { target_session_id: sessionId })
      if (accessError) throw new Error(accessError.message)
      setAccessAllowed(Boolean(access))
    } catch (cause) {
      setLifecycleError(cause instanceof Error ? cause.message : 'Could not update this class.')
    } finally {
      setLifecycleBusy(false)
    }
  }

  if (!isSupabaseConfigured) return <div className="section page-state"><SetupNotice /></div>
  if (authLoading || !user || loading) return <div className="section page-state" role="status">Checking your class access…</div>
  if (error) return <div className="section page-state"><div className="inline-state error-state" role="alert">{error}</div><Link className="button button-dark" to="/classes">Back to live classes</Link></div>
  if (!session) return <div className="section page-state"><EmptyState title="This class isn’t available." text="It may have ended, moved, or your account may not have access to it." /><Link className="button button-dark" to="/classes">Back to live classes</Link></div>
  if (!accessAllowed && role !== 'admin' && !(role === 'instructor' && session.instructor_id === user.id)) {
    return <div className="section page-state"><EmptyState title="You don’t have access to this class." text="Class access is checked against your account, course enrollment, and any active classroom restrictions." /><Link className="button button-dark" to="/classes">Back to live classes</Link></div>
  }

  const canModerate = role === 'admin' || (role === 'instructor' && session.instructor_id === user.id)
  const sessionCanStart = clockNow >= Date.parse(session.scheduled_at) - 15 * 60_000
    && clockNow <= Date.parse(session.scheduled_at) + 2 * 60 * 60_000
  return <div className="classroom-page">
    <div className="classroom-top">
      <div className="section classroom-top-inner">
        <Link className="back-link" to="/classes">← All live classes</Link>
        <div className="classroom-title-row">
          <div>
            <div className="eyebrow"><span className={session.status === 'live' ? 'eyebrow-dot live-dot' : 'eyebrow-dot'} /> {session.status === 'live' ? 'LIVE CLASS' : session.status.toUpperCase()}</div>
            <h1>{session.title}</h1>
            <p>{session.course?.title ?? 'Mai Corp App Class'} · {session.instructor?.display_name ?? 'Instructor'}</p>
          </div>
          <span className={session.public_qa_enabled ? 'class-status is-live' : session.status === 'live' ? 'class-status is-live' : 'class-status'}>{session.public_qa_enabled ? 'PUBLIC Q&A · $10' : session.status === 'live' ? 'LIVE NOW' : session.status.toUpperCase()}</span>
        </div>
      </div>
    </div>
    <div className="section classroom-layout">
      <div className="classroom-main">
        {session.public_qa_enabled && <section className="classroom-panel qa-pass-panel">
          <div className="eyebrow">PUBLIC LIVE Q&A · $10 PASS</div>
          <p>Access includes viewing and submitting live questions. The 24-hour timer starts at payment confirmation, even if the session is offline. Streaming is available only while live unless a replay is configured; without a live session or replay, the pass may provide little or no viewing time.</p>
          {passExpiry ? <strong>Your pass is active until {new Intl.DateTimeFormat(undefined, { dateStyle: 'medium', timeStyle: 'short' }).format(new Date(passExpiry))}.</strong> : role === 'student' && accessAllowed ? <strong>Your course enrollment includes access to this Q&A.</strong> : <strong>Pass checkout is not configured. No payment can be made from this page.</strong>}
        </section>}
        {canModerate && <section className="classroom-panel session-lifecycle-panel">
          <div className="panel-heading"><div><div className="eyebrow">SESSION CONTROL</div><h2>{session.status === 'scheduled' ? 'Scheduled class' : 'Manage live class'}</h2></div></div>
          {session.status === 'scheduled' && <div className="session-action-row">
            <button className="button button-dark" disabled={lifecycleBusy || !sessionCanStart} onClick={() => void handleSessionLifecycle('start_class_session')} type="button">{lifecycleBusy ? 'Updating…' : 'Start class'}</button>
            <button className="button button-outline" disabled={lifecycleBusy} onClick={() => void handleSessionLifecycle('cancel_class_session')} type="button">Cancel class</button>
          </div>}
          {session.status === 'live' && <button className="button button-outline" disabled={lifecycleBusy} onClick={() => void handleSessionLifecycle('end_class_session')} type="button">{lifecycleBusy ? 'Ending…' : 'End class'}</button>}
          {session.status === 'scheduled' && !sessionCanStart && <p className="field-note">Class can be started from 15 minutes before its schedule until 2 hours after.</p>}
          {lifecycleError && <p className="form-message form-error" role="alert">{lifecycleError}</p>}
        </section>}
        {canModerate && <ClassSessionSettingsPanel
          key={session.id}
          session={session}
          onSessionUpdated={setSession}
        />}
        {canModerate && session.public_stream_enabled && <ClassRecordingUploadPanel sessionId={session.id} />}
        {session.public_stream_enabled && <ClassStreamInterestPanel
          sessionId={session.id}
          canModerate={canModerate}
          isStudent={role === 'student'}
          isLive={session.status === 'live'}
        />}
        <section className="classroom-panel classroom-session-panel">
          <div className="panel-heading"><div><div className="eyebrow">SESSION DETAILS</div><h2>Today’s learning space</h2></div><span className="session-time">{new Intl.DateTimeFormat(undefined, { dateStyle: 'medium', timeStyle: 'short' }).format(new Date(session.scheduled_at))}</span></div>
          <p>{session.description || 'The instructor has not added a class description yet.'}</p>
          {session.learning_objectives.length > 0 && <ul className="class-objectives">{session.learning_objectives.map((objective) => <li key={objective}><span aria-hidden="true">✓</span>{objective}</li>)}</ul>}
          {session.status === 'live' ? <div className="provider-notice"><strong>Live classroom is available.</strong><p>RTC access is authorized per user and class by Supabase. Turn on media only when you choose to participate.</p></div> : <div className="provider-notice"><strong>This class has not started yet.</strong><p>Instructors can start the class up to 15 minutes early. Student video, audio, chat, and questions unlock when it is live.</p></div>}
        </section>
        {session.status === 'live' && <ClassroomMediaPanel
          sessionId={session.id}
          userId={user.id}
          displayName={profileDisplayName || (canModerate ? session.instructor?.display_name : 'Student') || 'Participant'}
          canModerate={canModerate}
          allowStudentScreenShare={session.allow_student_screen_share}
          maxParticipants={session.max_participants}
        />}
        {session.status === 'ended' && <>
          <ClassroomChatPanel sessionId={session.id} userId={user.id} roster={[]} isLive={false} />
          <ClassroomQuestionsPanel sessionId={session.id} userId={user.id} canModerate={canModerate} roster={[]} isLive={false} />
        </>}
        <SharedLinksPanel sessionId={session.id} canManage={canModerate} isLive={session.status === 'live'} />
        <HandRaisePanel sessionId={session.id} userId={user.id} canModerate={canModerate} isLive={session.status === 'live'} />
      </div>
      <aside className="classroom-side">
        {canModerate && <ClassModerationPanel sessionId={session.id} />}
        <div className="classroom-panel audio-notice">
          <span className="notice-icon" aria-hidden="true">◉</span>
          <h2>Speaking requests</h2>
          <p>Students can request permission in the queue. Microphone publication is disabled in RTC tokens until an instructor approves a request; video and microphone devices are never activated automatically.</p>
        </div>
        {role === 'admin' && <div className="classroom-panel billing-notice">
          <div className="eyebrow">BILLING ACTIONS</div>
          <h2>Subscription cancellation unavailable</h2>
          <p>No payment provider or subscription system is configured. Class restrictions here do not suspend platform accounts or change subscriptions.</p>
        </div>}
      </aside>
    </div>
  </div>
}

function ClassSessionSettingsPanel({
  session,
  onSessionUpdated,
}: {
  session: ClassroomSession
  onSessionUpdated: (session: ClassroomSession) => void
}) {
  const [publicQaEnabled, setPublicQaEnabled] = useState(session.public_qa_enabled)
  const [allowStudentScreenShare, setAllowStudentScreenShare] = useState(session.allow_student_screen_share)
  const [maxParticipants, setMaxParticipants] = useState(String(session.max_participants))
  const [busy, setBusy] = useState(false)
  const [error, setError] = useState('')
  const [notice, setNotice] = useState('')

  async function saveSettings(event: FormEvent<HTMLFormElement>) {
    event.preventDefault()
    if (!supabase || busy) return
    const limit = Number(maxParticipants)
    if (!Number.isInteger(limit) || limit < 2 || limit > 250) {
      setError('Participant limit must be from 2 to 250.')
      return
    }
    setBusy(true)
    setError('')
    setNotice('')
    try {
      const { data, error: rpcError } = await supabase.rpc('configure_class_session', {
        target_session_id: session.id,
        enable_public_qa: publicQaEnabled,
        permit_student_screen_share: allowStudentScreenShare,
        participant_limit: limit,
      })
      if (rpcError) throw new Error(rpcError.message)
      if (data) onSessionUpdated(data as unknown as ClassroomSession)
      setNotice('Classroom settings saved.')
    } catch (cause) {
      setError(cause instanceof Error ? cause.message : 'Could not save classroom settings.')
    } finally {
      setBusy(false)
    }
  }

  return <section className="classroom-panel session-settings-panel">
    <div className="panel-heading"><div><div className="eyebrow">ACCESS & PARTICIPATION</div><h2>Classroom settings</h2></div></div>
    <form className="class-settings-form" onSubmit={(event) => void saveSettings(event)}>
      <label className="class-setting-toggle"><input checked={allowStudentScreenShare} onChange={(event) => setAllowStudentScreenShare(event.target.checked)} type="checkbox" /><span><strong>Allow student screen sharing</strong><small>Students still need an explicit browser permission prompt.</small></span></label>
      <label className="class-setting-toggle"><input checked={publicQaEnabled} onChange={(event) => setPublicQaEnabled(event.target.checked)} type="checkbox" /><span><strong>Offer as a $10 public Q&A</strong><small>Passes include viewing and questions for 24 hours from purchase. Checkout is not configured, so no purchases can be made yet.</small></span></label>
      <label className="class-setting-limit">Maximum participants<input max="250" min="2" onChange={(event) => setMaxParticipants(event.target.value)} required type="number" value={maxParticipants} /></label>
      <button className="button button-dark" disabled={busy || session.status === 'ended' || session.status === 'cancelled'} type="submit">{busy ? 'Saving…' : 'Save settings'}</button>
    </form>
    {notice && <p className="form-message form-success" role="status">{notice}</p>}
    {error && <p className="form-message form-error" role="alert">{error}</p>}
  </section>
}

function SharedLinksPanel({ sessionId, canManage, isLive }: { sessionId: string; canManage: boolean; isLive: boolean }) {
  const [links, setLinks] = useState<SharedClassLink[]>([])
  const [now, setNow] = useState(0)
  const [url, setUrl] = useState('')
  const [title, setTitle] = useState('')
  const [description, setDescription] = useState('')
  const [duration, setDuration] = useState('5m')
  const [previewUrl, setPreviewUrl] = useState('')
  const [busy, setBusy] = useState(false)
  const [error, setError] = useState('')
  const [message, setMessage] = useState('')

  useEffect(() => {
    const client = supabase
    if (!client) return
    let active = true
    async function refreshLinks() {
      try {
        const result = await listActiveClassLinks(sessionId)
        if (active) {
          setLinks(result)
          setNow(Date.now())
          setError('')
        }
      } catch (cause) {
        if (active) {
          setLinks([])
          setError(cause instanceof Error ? cause.message : 'Could not update shared links.')
        }
      }
    }
    void refreshLinks()
    const channel = client
      .channel(`class-links-${sessionId}`)
      .on('postgres_changes', {
        event: '*',
        schema: 'public',
        table: 'session_shared_links',
        filter: `session_id=eq.${sessionId}`,
      }, () => { void refreshLinks() })
      .subscribe((status) => {
        if (active && (status === 'CHANNEL_ERROR' || status === 'TIMED_OUT')) {
          setLinks([])
          setError('Live link updates disconnected. Refresh to reload active links.')
        }
      })
    const timer = window.setInterval(() => {
      setNow(Date.now())
      void refreshLinks()
    }, 15000)
    return () => {
      active = false
      window.clearInterval(timer)
      void client.removeChannel(channel)
    }
  }, [sessionId])

  function handlePreview() {
    setError('')
    try {
      const parsed = new URL(url.trim())
      if (!['http:', 'https:'].includes(parsed.protocol)) throw new Error('Use an HTTP or HTTPS link.')
      setPreviewUrl(parsed.href)
      setUrl(parsed.href)
    } catch (cause) {
      setPreviewUrl('')
      setError(cause instanceof Error ? cause.message : 'Enter a complete HTTP or HTTPS URL.')
    }
  }

  async function handlePublish(event: FormEvent<HTMLFormElement>) {
    event.preventDefault()
    if (!supabase || !previewUrl || previewUrl !== url.trim()) {
      setError('Preview and verify the link before publishing it.')
      return
    }
    setBusy(true)
    setError('')
    setMessage('')
    try {
      const { error: rpcError } = await supabase.rpc('publish_classroom_link', {
        target_session_id: sessionId,
        link_url: previewUrl,
        link_title: title.trim() || null,
        link_description: description.trim() || null,
        duration_mode: duration,
      })
      if (rpcError) throw new Error(`Could not publish the link: ${rpcError.message}`)
      setUrl('')
      setTitle('')
      setDescription('')
      setPreviewUrl('')
      setMessage('Link shared with the current class.')
    } catch (cause) {
      setError(cause instanceof Error ? cause.message : 'Could not publish this link.')
    } finally {
      setBusy(false)
    }
  }

  async function handleRevoke(linkId: string) {
    if (!supabase) return
    setError('')
    try {
      const { error: rpcError } = await supabase.rpc('revoke_classroom_link', { target_link_id: linkId })
      if (rpcError) throw new Error(rpcError.message)
    } catch (cause) {
      setError(`Could not remove the link: ${cause instanceof Error ? cause.message : 'request failed'}`)
    }
  }

  const activeLinks = links.filter((link) => link.expires_at === null || Date.parse(link.expires_at) > now)
  return <section className="classroom-panel">
    <div className="panel-heading"><div><div className="eyebrow">SHARED WITH THIS CLASS</div><h2>Useful links</h2></div><span className="panel-count">{activeLinks.length}</span></div>
    {canManage && <form className="class-link-form" onSubmit={handlePublish}>
      <label>URL<input autoComplete="url" maxLength={2048} onChange={(event) => { setUrl(event.target.value); setPreviewUrl('') }} placeholder="https://example.com/resource" required type="url" value={url} /></label>
      <div className="form-two-col"><label>Link title <span>(optional)</span><input maxLength={120} onChange={(event) => setTitle(event.target.value)} placeholder="e.g. Project documentation" value={title} /></label><label>Available for<select onChange={(event) => setDuration(event.target.value)} value={duration}><option value="5m">5 minutes</option><option value="10m">10 minutes</option><option value="15m">15 minutes</option><option value="30m">30 minutes</option><option value="60m">60 minutes</option><option value="entire_stream">Entire stream</option></select></label></div>
      <label>Description <span>(optional)</span><textarea maxLength={300} onChange={(event) => setDescription(event.target.value)} placeholder="What should students know about this resource?" rows={2} value={description} /></label>
      <div className="link-form-actions"><button className="button button-outline" disabled={!url.trim()} onClick={handlePreview} type="button">Preview link</button><button className="button button-dark" disabled={!isLive || busy || !previewUrl} type="submit">{busy ? 'Sharing…' : 'Share with class'} <span aria-hidden="true">↗</span></button></div>
      {previewUrl && <div className="link-preview"><span>PREVIEW</span><a href={previewUrl} rel="noopener noreferrer" target="_blank">{title.trim() || new URL(previewUrl).hostname} ↗</a></div>}
      {!isLive && <p className="field-note">Links can only be shared while the class is live.</p>}
    </form>}
    {error && <p className="form-message form-error" role="alert">{error}</p>}
    {message && <p className="form-message form-success" role="status">{message}</p>}
    {activeLinks.length === 0 ? <p className="panel-empty">No active links have been shared yet.</p> : <div className="shared-link-list">{activeLinks.map((link) => {
      const secondsLeft = link.expires_at ? Math.max(0, Math.ceil((Date.parse(link.expires_at) - now) / 1000)) : null
      const timeLabel = secondsLeft === null ? 'Until the class ends' : secondsLeft >= 60 ? `Expires in ${Math.ceil(secondsLeft / 60)} min` : 'Expires soon'
      return <article className="shared-link-item" key={link.id}>
        <span className="shared-link-icon" aria-hidden="true">↗</span>
        <div className="shared-link-copy"><a href={link.url} rel="noopener noreferrer" target="_blank">{link.title || link.url} <span aria-hidden="true">↗</span></a><p>{link.description || link.url}</p><small>{timeLabel}</small></div>
        {canManage && <button className="icon-button" aria-label={`Remove ${link.title || link.url}`} onClick={() => void handleRevoke(link.id)} type="button">×</button>}
      </article>
    })}</div>}
  </section>
}

function HandRaisePanel({ sessionId, userId, canModerate, isLive }: { sessionId: string; userId: string; canModerate: boolean; isLive: boolean }) {
  const [requests, setRequests] = useState<HandRaise[]>([])
  const [busyId, setBusyId] = useState('')
  const [error, setError] = useState('')
  const [notice, setNotice] = useState('')

  useEffect(() => {
    const client = supabase
    if (!client) return
    let active = true
    async function refreshRequests() {
      try {
        const result = await listClassHandRaises(sessionId)
        if (active) setRequests(result)
      } catch (cause) {
        if (active) {
          setRequests([])
          setError(cause instanceof Error ? cause.message : 'Could not load speaking requests.')
        }
      }
    }
    void refreshRequests()
    const channel = client
      .channel(`hand-raises-${sessionId}`)
      .on('postgres_changes', {
        event: '*',
        schema: 'public',
        table: 'class_hand_raises',
        filter: `session_id=eq.${sessionId}`,
      }, () => { void refreshRequests() })
      .subscribe((status) => {
        if (active && (status === 'CHANNEL_ERROR' || status === 'TIMED_OUT')) {
          setRequests([])
          setError('Speaking-request updates disconnected. Refresh the page to reload the queue.')
        }
      })
    return () => {
      active = false
      void client.removeChannel(channel)
    }
  }, [sessionId])

  const myRequests = requests.filter((request) => request.student_id === userId).sort((a, b) => a.requested_at.localeCompare(b.requested_at))
  const myLatestRequest = myRequests[myRequests.length - 1]
  const queue = requests.filter((request) => request.status === 'pending' || request.speaking_permission_active)

  async function callAction(name: 'raise_classroom_hand' | 'lower_classroom_hand' | 'decide_classroom_hand' | 'revoke_classroom_speaking', args: Record<string, string>) {
    if (!supabase) return
    setBusyId(args.target_request_id ?? sessionId)
    setError('')
    setNotice('')
    try {
      const { error: rpcError } = await supabase.rpc(name, args)
      if (rpcError) throw new Error(rpcError.message)
      setNotice(name === 'raise_classroom_hand' ? 'Your request was sent to the instructor.' : 'The speaking request was updated.')
      const result = await listClassHandRaises(sessionId)
      setRequests(result)
    } catch (cause) {
      setError(cause instanceof Error ? cause.message : 'Could not update the speaking request.')
    } finally {
      setBusyId('')
    }
  }

  const activeOwnRequest = myLatestRequest && (myLatestRequest.status === 'pending' || myLatestRequest.speaking_permission_active)
  return <section className="classroom-panel">
    <div className="panel-heading"><div><div className="eyebrow">PARTICIPATE</div><h2>Speaking requests</h2></div>{canModerate && <span className="panel-count">{queue.length}</span>}</div>
    {!canModerate && <div className="raise-hand-actions">
      {activeOwnRequest ? <button className="button button-outline" disabled={busyId === myLatestRequest.id} onClick={() => void callAction('lower_classroom_hand', { target_request_id: myLatestRequest.id })} type="button">{myLatestRequest.speaking_permission_active ? 'Stop speaking' : 'Lower hand'}</button> : <button className="button button-dark" disabled={!isLive || busyId === sessionId} onClick={() => void callAction('raise_classroom_hand', { target_session_id: sessionId })} type="button">Raise hand <span aria-hidden="true">↑</span></button>}
      {myLatestRequest && <span className={`request-state state-${myLatestRequest.status}`}>{myLatestRequest.speaking_permission_active ? 'Approved to speak' : myLatestRequest.status === 'pending' ? 'Waiting for instructor' : myLatestRequest.status === 'denied' ? 'Request was declined' : myLatestRequest.status === 'cancelled' ? 'Request ended' : 'Approved'}</span>}
      {!isLive && <p className="field-note">Hand raising is available while the class is live.</p>}
      {myLatestRequest?.speaking_permission_active && <p className="provider-notice compact-notice">Approval is recorded, but audio-only Agora publishing is not configured. This page will not request a microphone or camera.</p>}
    </div>}
    {canModerate && <div className="hand-raise-queue">{queue.length === 0 ? <p className="panel-empty">No students are waiting to speak.</p> : queue.map((request) => <article className="hand-request" key={request.id}>
      <div className="request-avatar" aria-hidden="true">{(request.student?.display_name || 'S').slice(0, 1).toUpperCase()}</div>
      <div className="request-person"><strong>{request.student?.display_name || 'Student'}</strong><small>Requested {new Intl.DateTimeFormat(undefined, { timeStyle: 'short' }).format(new Date(request.requested_at))}</small><span className={request.speaking_permission_active ? 'request-state state-approved' : 'request-state state-pending'}>{request.speaking_permission_active ? 'Speaking permission approved' : 'Waiting for approval'}</span></div>
      {request.status === 'pending' ? <div className="request-actions"><button aria-label={`Approve ${request.student?.display_name || 'student'}`} className="icon-button approve-button" disabled={!isLive || busyId === request.id} onClick={() => void callAction('decide_classroom_hand', { target_request_id: request.id, decision: 'approved' })} type="button">✓</button><button aria-label={`Deny ${request.student?.display_name || 'student'}`} className="icon-button deny-button" disabled={busyId === request.id} onClick={() => void callAction('decide_classroom_hand', { target_request_id: request.id, decision: 'denied' })} type="button">×</button></div> : <button className="button button-outline button-small" disabled={busyId === request.id} onClick={() => void callAction('revoke_classroom_speaking', { target_request_id: request.id })} type="button">Revoke</button>}
    </article>)}</div>}
    {error && <p className="form-message form-error" role="alert">{error}</p>}
    {notice && <p className="form-message form-success" role="status">{notice}</p>}
  </section>
}

function ClassModerationPanel({ sessionId }: { sessionId: string }) {
  const [participants, setParticipants] = useState<SessionParticipant[]>([])
  const [restrictions, setRestrictions] = useState<{ target_user_id: string; restriction_scope: string; revoked_at: string | null }[]>([])
  const [error, setError] = useState('')
  const [busyId, setBusyId] = useState('')

  useEffect(() => {
    const client = supabase
    if (!client) return
    let active = true
    async function refreshModerationData(client: NonNullable<typeof supabase>) {
      try {
        const [attendees, restrictionResult] = await Promise.all([
          listSessionParticipants(sessionId),
          client.from('session_access_restrictions')
            .select('target_user_id, restriction_scope, revoked_at')
            .eq('session_id', sessionId)
            .is('revoked_at', null),
        ])
        if (restrictionResult.error) throw new Error(`Could not load class restrictions: ${restrictionResult.error.message}`)
        if (active) {
          setParticipants(attendees)
          setRestrictions(restrictionResult.data ?? [])
        }
      } catch (cause) {
        if (active) {
          setParticipants([])
          setRestrictions([])
          setError(cause instanceof Error ? cause.message : 'Could not load moderation details.')
        }
      }
    }
    void refreshModerationData(client)
    const channel = client
      .channel(`moderation-${sessionId}`)
      .on('postgres_changes', { event: '*', schema: 'public', table: 'class_attendance', filter: `session_id=eq.${sessionId}` }, () => { void refreshModerationData(client) })
      .on('postgres_changes', { event: '*', schema: 'public', table: 'session_access_restrictions', filter: `session_id=eq.${sessionId}` }, () => { void refreshModerationData(client) })
      .subscribe((status) => {
        if (active && (status === 'CHANNEL_ERROR' || status === 'TIMED_OUT')) {
          setParticipants([])
          setRestrictions([])
          setError('Moderation updates disconnected. Refresh to reload the participant list.')
        }
      })
    return () => {
      active = false
      void client.removeChannel(channel)
    }
  }, [sessionId])

  const uniqueParticipants = [...new Map(participants.map((participant) => [participant.user_id, participant])).values()]

  async function removeFromClass(participant: SessionParticipant) {
    const name = participant.participant?.display_name || 'this participant'
    const confirmed = window.confirm(`Block ${name} from rejoining this class? This affects only this class session. It does not suspend their platform account or cancel their subscription.`)
    if (!confirmed || !supabase) return
    setBusyId(participant.user_id)
    setError('')
    try {
      const { error: rpcError } = await supabase.rpc('restrict_classroom_participant', {
        target_session_id: sessionId,
        p_target_user_id: participant.user_id,
        restriction_kind: 'block_rejoin',
        restriction_reason: 'Removed from this class by a moderator',
      })
      if (rpcError) throw new Error(rpcError.message)
    } catch (cause) {
      setError(`Could not restrict this participant: ${cause instanceof Error ? cause.message : 'request failed'}`)
    } finally {
      setBusyId('')
    }
  }

  return <section className="classroom-panel moderation-panel">
    <div className="panel-heading"><div><div className="eyebrow">ADMIN / CEO MODERATION</div><h2>Participants</h2></div><span className="panel-count">{uniqueParticipants.length}</span></div>
    {uniqueParticipants.length === 0 ? <p className="panel-empty">No attendance records have been received for this class.</p> : <div className="participant-list">{uniqueParticipants.map((participant) => {
      const restriction = restrictions.find((item) => item.target_user_id === participant.user_id)
      return <article className="participant-row" key={participant.user_id}>
        <div className="request-avatar" aria-hidden="true">{(participant.participant?.display_name || 'S').slice(0, 1).toUpperCase()}</div>
        <div className="request-person"><strong>{participant.participant?.display_name || 'Student'}</strong><small>{participant.left_at ? 'Left class' : 'In attendance'}</small>{restriction && <span className="request-state state-denied">Access restricted</span>}</div>
        {!restriction && <button className="button button-outline button-small" disabled={busyId === participant.user_id} onClick={() => void removeFromClass(participant)} type="button">Remove from class</button>}
      </article>
    })}</div>}
    <p className="field-note">Removal blocks future access checks for this session; it does not remotely disconnect an Agora client because no Agora connection is configured here.</p>
    {error && <p className="form-message form-error" role="alert">{error}</p>}
  </section>
}
