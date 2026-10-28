
import { useEffect, useState, type FormEvent } from 'react'
import { Link, useNavigate, useParams } from 'react-router-dom'
import { useAuth } from '../auth/useAuth'
import {
  getClassSession,
  listActiveClassLinks,
  listClassHandRaises,
  listClassSessions,
  listSessionParticipants,
  type ClassroomSession,
  type HandRaise,
  type SessionParticipant,
  type SharedClassLink,
} from '../lib/classroom'
import { isSupabaseConfigured, supabase } from '../lib/supabase'
import { EmptyState, SetupNotice } from './Shared'
import { ClassroomMediaPanel } from './ClassroomMediaPanel'
import {
  ClassroomChatPanel,
  ClassroomQuestionsPanel,
} from './ClassroomInteractionPanels'
import { DesktopOnly } from './DesktopOnly'
import { ClassStreamInterestPanel } from './ClassStreamInterestPanel'
import { ClassRecordingUploadPanel } from './ClassRecordingUploadPanel'

const dateTime = (value: string) =>
  new Intl.DateTimeFormat(undefined, {
    dateStyle: 'medium',
    timeStyle: 'short',
  }).format(new Date(value))

const errorMessage = (error: unknown, fallback: string) =>
  error instanceof Error ? error.message : fallback

function Panel({
  title,
  eyebrow,
  children,
  count,
}: {
  title: string
  eyebrow?: string
  children: React.ReactNode
  count?: number
}) {
  return (
    <section className="classroom-panel">
      <div className="panel-heading">
        <div>
          {eyebrow && <div className="eyebrow">{eyebrow}</div>}
          <h2>{title}</h2>
        </div>
        {count !== undefined && <span className="panel-count">{count}</span>}
      </div>
      {children}
    </section>
  )
}

export function ClassListPage() {
  const { user } = useAuth()
  const [sessions, setSessions] = useState<ClassroomSession[]>([])
  const [role, setRole] = useState<string | null>(null)
  const [courses, setCourses] = useState<
    { id: string; title: string; instructor_id: string }[]
  >([])
  const [courseId, setCourseId] = useState('')
  const [title, setTitle] = useState('')
  const [description, setDescription] = useState('')
  const [scheduledAt, setScheduledAt] = useState('')
  const [duration, setDuration] = useState('60')
  const [busy, setBusy] = useState(false)
  const [loading, setLoading] = useState(isSupabaseConfigured)
  const [error, setError] = useState('')
  const [notice, setNotice] = useState('')

  async function refresh() {
    setSessions(await listClassSessions())
  }

  useEffect(() => {
    if (!isSupabaseConfigured) return
    let active = true

    void listClassSessions()
      .then((items) => {
        if (active) setSessions(items)
      })
      .catch((cause) => {
        if (active) setError(errorMessage(cause, 'Could not load live classes.'))
      })
      .finally(() => {
        if (active) setLoading(false)
      })

    return () => {
      active = false
    }
  }, [])

  useEffect(() => {
    if (!supabase || !user) return
    const client = supabase
    const userId = user.id
    let active = true

    async function loadCourses() {
      try {
        const { data: profile, error: profileError } = await client
          .from('profiles')
          .select('role')
          .eq('id', userId)
          .maybeSingle()

        if (profileError) throw profileError
        const currentRole = profile?.role ?? null
        if (!active) return

        setRole(currentRole)
        if (currentRole !== 'admin' && currentRole !== 'instructor') return

        let query = client
          .from('courses')
          .select('id, title, instructor_id')
          .eq('status', 'published')
          .order('title')

        if (currentRole === 'instructor') {
          query = query.eq('instructor_id', userId)
        }

        const { data, error: coursesError } = await query
        if (coursesError) throw coursesError
        if (active) setCourses(data ?? [])
      } catch (cause) {
        if (active) {
          setError(errorMessage(cause, 'Could not load class-management access.'))
        }
      }
    }

    void loadCourses()
    return () => {
      active = false
    }
  }, [user])

  async function createSession(event: FormEvent<HTMLFormElement>) {
    event.preventDefault()
    if (!supabase || !user || busy) return

    const course = courses.find((item) => item.id === courseId)
    const date = new Date(scheduledAt)
    const minutes = Number(duration)

    if (!course) {
      setError('Choose a course you are authorized to teach.')
      return
    }
    if (!Number.isFinite(date.getTime()) || date.getTime() <= Date.now()) {
      setError('Choose a valid future class start time.')
      return
    }
    if (!Number.isInteger(minutes) || minutes < 15 || minutes > 360) {
      setError('Class duration must be from 15 to 360 minutes.')
      return
    }
    if (!title.trim()) {
      setError('Enter a class title.')
      return
    }

    setBusy(true)
    setError('')
    setNotice('')

    try {
      const { error: insertError } = await supabase
        .from('class_sessions')
        .insert({
          course_id: course.id,
          lesson_id: null,
          instructor_id: course.instructor_id,
          title: title.trim(),
          description: description.trim(),
          learning_objectives: [],
          scheduled_at: date.toISOString(),
          expected_duration_minutes: minutes,
        })

      if (insertError) throw insertError

      setTitle('')
      setDescription('')
      setScheduledAt('')
      setDuration('60')
      setNotice('Class scheduled successfully.')
      await refresh()
    } catch (cause) {
      setError(errorMessage(cause, 'Could not schedule this class.'))
    } finally {
      setBusy(false)
    }
  }

  if (!isSupabaseConfigured) {
    return <div className="section"><SetupNotice /></div>
  }

  return (
    <div className="page-shell">
      <section className="page-hero collection-hero">
        <div className="eyebrow">
          <span className="eyebrow-dot" /> LEARN TOGETHER
        </div>
        <h1>Live classes<span>.</span></h1>
        <p>Join instructors for practical, instructor-led sessions.</p>
      </section>

      <section className="section collection-content">
        {(role === 'admin' || role === 'instructor') && (
          <Panel title="Schedule a live class" eyebrow="INSTRUCTOR / ADMIN">
            {courses.length === 0 ? (
              <p className="panel-empty">No published courses are available for your account.</p>
            ) : (
              <form className="class-link-form" onSubmit={createSession}>
                <label>
                  Published course
                  <select required value={courseId} onChange={(e) => setCourseId(e.target.value)}>
                    <option value="">Select a course</option>
                    {courses.map((course) => (
                      <option key={course.id} value={course.id}>{course.title}</option>
                    ))}
                  </select>
                </label>

                <label>
                  Class title
                  <input required maxLength={180} value={title} onChange={(e) => setTitle(e.target.value)} />
                </label>

                <label>
                  Description
                  <textarea rows={3} maxLength={5000} value={description} onChange={(e) => setDescription(e.target.value)} />
                </label>

                <div className="form-two-col">
                  <label>
                    Start time
                    <input required type="datetime-local" value={scheduledAt} onChange={(e) => setScheduledAt(e.target.value)} />
                  </label>
                  <label>
                    Duration (minutes)
                    <input required type="number" min="15" max="360" value={duration} onChange={(e) => setDuration(e.target.value)} />
                  </label>
                </div>

                <button className="button button-dark" disabled={busy} type="submit">
                  {busy ? 'Scheduling…' : 'Schedule class'}
                </button>
              </form>
            )}
            {notice && <p className="form-message form-success" role="status">{notice}</p>}
          </Panel>
        )}

        {error && <div className="inline-state error-state" role="alert">{error}</div>}

        {loading ? (
          <div className="inline-state" role="status">Loading scheduled classes…</div>
        ) : sessions.length === 0 ? (
          <EmptyState title="No upcoming classes are published." text="Scheduled classes will appear here." />
        ) : (
          <div className="class-list">
            {sessions.map((session) => (
              <article className="class-card" key={session.id}>
                <div className={session.status === 'live' || session.public_qa_enabled ? 'class-status is-live' : 'class-status'}>
                  {session.public_qa_enabled ? 'PUBLIC LIVE Q&A · $10 / 24 HOURS' : session.status === 'live' ? 'LIVE NOW' : session.status.toUpperCase()}
                </div>
                <div className="class-card-info">
                  <span className="class-course">{session.course?.title ?? 'Mai Corp App Class'}</span>
                  <h2>{session.title}</h2>
                  <p>{session.description}</p>
                  {session.public_qa_enabled && (
                    <p className="qa-pass-disclosure">
                      Public Q&A is advertised at $10 for 24 hours. Checkout is not configured.
                      Streaming requires a live session or an available replay.
                    </p>
                  )}
                  <div className="class-meta">
                    <span>With {session.instructor?.display_name ?? 'Your instructor'}</span>
                    <span>{dateTime(session.scheduled_at)}</span>
                    {session.expected_duration_minutes && <span>{session.expected_duration_minutes} min</span>}
                  </div>
                </div>
                <Link className="button button-dark" to={`/classroom/${session.id}`}>
                  Open class workspace <span aria-hidden="true">↗</span>
                </Link>
              </article>
            ))}
          </div>
        )}
      </section>
    </div>
  )
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
  const [displayName, setDisplayName] = useState<string | null>(null)
  const [accessAllowed, setAccessAllowed] = useState(false)
  const [loading, setLoading] = useState(isSupabaseConfigured)
  const [error, setError] = useState('')
  const [lifecycleError, setLifecycleError] = useState('')
  const [lifecycleBusy, setLifecycleBusy] = useState(false)
  const [passExpiry, setPassExpiry] = useState<string | null>(null)
  const [now, setNow] = useState(Date.now())

  useEffect(() => {
    if (!authLoading && !user) navigate('/sign-in', { replace: true })
  }, [authLoading, navigate, user])

  useEffect(() => {
    if (!supabase || !user || !sessionId) return
    const client = supabase
    const userId = user.id
    let active = true

    async function load() {
      setLoading(true)
      setError('')
      try {
        const [classSession, access, profile] = await Promise.all([
          getClassSession(sessionId),
          client.rpc('can_access_class_session', { target_session_id: sessionId }),
          client.from('profiles')
            .select('role, display_name')
            .eq('id', userId)
            .maybeSingle(),
        ])

        if (access.error) throw access.error
        if (profile.error) throw profile.error

        if (active) {
          setSession(classSession)
          setAccessAllowed(Boolean(access.data))
          setRole(profile.data?.role ?? null)
          setDisplayName(profile.data?.display_name ?? null)
        }
      } catch (cause) {
        if (active) setError(errorMessage(cause, 'Could not load this class.'))
      } finally {
        if (active) setLoading(false)
      }
    }

    void load()

    const channel = client.channel(`classroom-${sessionId}-${user.id}`)
      .on('postgres_changes', {
        event: '*',
        schema: 'public',
        table: 'session_access_restrictions',
        filter: `session_id=eq.${sessionId}`,
      }, () => { void load() })
      .on('postgres_changes', {
        event: 'UPDATE',
        schema: 'public',
        table: 'class_sessions',
        filter: `id=eq.${sessionId}`,
      }, () => { void load() })
      .subscribe((status) => {
        if (active && (status === 'CHANNEL_ERROR' || status === 'TIMED_OUT')) {
          setError('Live access updates disconnected. Refresh to re-check access.')
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

    void supabase.from('public_qa_passes')
      .select('expires_at')
      .eq('session_id', session.id)
      .eq('user_id', user.id)
      .gt('expires_at', new Date().toISOString())
      .order('expires_at', { ascending: false })
      .limit(1)
      .maybeSingle()
      .then(({ data, error: passError }) => {
        if (!active) return
        if (passError) setError(`Could not check your Q&A pass: ${passError.message}`)
        else setPassExpiry(data?.expires_at ?? null)
      })

    return () => { active = false }
  }, [session, role, user])

  useEffect(() => {
    if (session?.status !== 'scheduled') return
    const timer = window.setInterval(() => setNow(Date.now()), 30000)
    return () => window.clearInterval(timer)
  }, [session?.status])

  async function updateLifecycle(action: 'start_class_session' | 'end_class_session' | 'cancel_class_session') {
    if (!supabase || lifecycleBusy) return
    setLifecycleBusy(true)
    setLifecycleError('')

    try {
      const { data, error: actionError } = await supabase.rpc(action, {
        target_session_id: sessionId,
      })
      if (actionError) throw actionError
      if (data) setSession(data as unknown as ClassroomSession)

      const { data: access, error: accessError } = await supabase.rpc(
        'can_access_class_session',
        { target_session_id: sessionId },
      )
      if (accessError) throw accessError
      setAccessAllowed(Boolean(access))
    } catch (cause) {
      setLifecycleError(errorMessage(cause, 'Could not update this class.'))
    } finally {
      setLifecycleBusy(false)
    }
  }

  if (!isSupabaseConfigured) return <div className="section page-state"><SetupNotice /></div>
  if (authLoading || !user || loading) return <div className="section page-state" role="status">Checking class access…</div>
  if (error) return <div className="section page-state"><div className="inline-state error-state" role="alert">{error}</div><Link className="button button-dark" to="/classes">Back to classes</Link></div>
  if (!session) return <div className="section page-state"><EmptyState title="Class unavailable" text="This class may have ended or been moved." /><Link className="button button-dark" to="/classes">Back to classes</Link></div>

  const canModerate = role === 'admin' || (role === 'instructor' && session.instructor_id === user.id)
  if (!accessAllowed && !canModerate) {
    return <div className="section page-state"><EmptyState title="You don’t have access to this class." text="Access depends on enrollment and classroom restrictions." /><Link className="button button-dark" to="/classes">Back to classes</Link></div>
  }

  const canStart = now >= Date.parse(session.scheduled_at) - 15 * 60000 &&
    now <= Date.parse(session.scheduled_at) + 2 * 60 * 60000

  return (
    <div className="classroom-page">
      <header className="classroom-top">
        <div className="section classroom-top-inner">
          <Link className="back-link" to="/classes">← All live classes</Link>
          <div className="classroom-title-row">
            <div>
              <div className="eyebrow">
                <span className={session.status === 'live' ? 'eyebrow-dot live-dot' : 'eyebrow-dot'} />
                {session.status === 'live' ? 'LIVE CLASS' : session.status.toUpperCase()}
              </div>
              <h1>{session.title}</h1>
              <p>{session.course?.title ?? 'Mai Corp App Class'} · {session.instructor?.display_name ?? 'Instructor'}</p>
            </div>
            <span className={session.status === 'live' || session.public_qa_enabled ? 'class-status is-live' : 'class-status'}>
              {session.public_qa_enabled ? 'PUBLIC Q&A · $10' : session.status === 'live' ? 'LIVE NOW' : session.status.toUpperCase()}
            </span>
          </div>
        </div>
      </header>

      <div className="section classroom-layout">
        <main className="classroom-main">
          {session.public_qa_enabled && (
            <Panel title="Public live Q&A" eyebrow="$10 · 24-HOUR PASS">
              <p>Viewing and live questions are included for 24 hours after payment confirmation. Checkout is not configured, and streaming requires a live session or an available replay.</p>
              {passExpiry ? (
                <strong>Pass active until {dateTime(passExpiry)}.</strong>
              ) : role === 'student' && accessAllowed ? (
                <strong>Your course enrollment includes access.</strong>
              ) : (
                <strong>Pass checkout is not configured. No payment can be made here.</strong>
              )}
            </Panel>
          )}

          {canModerate && (
            <>
              <Panel title={session.status === 'scheduled' ? 'Scheduled class' : 'Manage live class'} eyebrow="SESSION CONTROL">
                {session.status === 'scheduled' && (
                  <div className="session-action-row">
                    <button className="button button-dark" disabled={lifecycleBusy || !canStart} onClick={() => void updateLifecycle('start_class_session')} type="button">
                      {lifecycleBusy ? 'Updating…' : 'Start class'}
                    </button>
                    <button className="button button-outline" disabled={lifecycleBusy} onClick={() => void updateLifecycle('cancel_class_session')} type="button">Cancel class</button>
                  </div>
                )}
                {session.status === 'live' && (
                  <button className="button button-outline" disabled={lifecycleBusy} onClick={() => void updateLifecycle('end_class_session')} type="button">
                    {lifecycleBusy ? 'Ending…' : 'End class'}
                  </button>
                )}
                {session.status === 'scheduled' && !canStart && <p className="field-note">Starting is available 15 minutes before class through 2 hours after its scheduled time.</p>}
                {lifecycleError && <p className="form-message form-error" role="alert">{lifecycleError}</p>}
              </Panel>

              <ClassSessionSettingsPanel key={session.id} session={session} onSessionUpdated={setSession} />
              {session.public_stream_enabled && <ClassRecordingUploadPanel sessionId={session.id} />}
            </>
          )}

          {session.public_stream_enabled && (
            <ClassStreamInterestPanel
              sessionId={session.id}
              canModerate={canModerate}
              isStudent={role === 'student'}
              isLive={session.status === 'live'}
            />
          )}

          <Panel title="Session details" eyebrow="YOUR LEARNING SPACE">
            <p className="session-time">{dateTime(session.scheduled_at)}</p>
            <p>{session.description || 'The instructor has not added a description yet.'}</p>
            {session.learning_objectives.length > 0 && (
              <ul className="class-objectives">
                {session.learning_objectives.map((objective) => <li key={objective}>{objective}</li>)}
              </ul>
            )}
            <div className="provider-notice">
              <strong>{session.status === 'live' ? 'Class is live.' : 'Class has not started yet.'}</strong>
              <p>{session.status === 'live'
                ? 'Media access is controlled by your class permissions.'
                : 'Student media, chat, and questions unlock when the class is live.'}</p>
            </div>
          </Panel>

          {session.status === 'live' && (
            <ClassroomMediaPanel
              sessionId={session.id}
              userId={user.id}
              displayName={displayName || (canModerate ? session.instructor?.display_name : 'Student') || 'Participant'}
              canModerate={canModerate}
              allowStudentScreenShare={session.allow_student_screen_share}
              maxParticipants={session.max_participants}
            />
          )}

          {session.status === 'ended' && (
            <>
              <ClassroomChatPanel sessionId={session.id} userId={user.id} roster={[]} isLive={false} />
              <ClassroomQuestionsPanel sessionId={session.id} userId={user.id} canModerate={canModerate} roster={[]} isLive={false} />
            </>
          )}

          <SharedLinksPanel sessionId={session.id} canManage={canModerate} isLive={session.status === 'live'} />
          <HandRaisePanel sessionId={session.id} userId={user.id} canModerate={canModerate} isLive={session.status === 'live'} />
        </main>

        <aside className="classroom-side">
          {role === 'admin' && <ClassModerationPanel sessionId={session.id} />}
          <Panel title="Speaking requests" eyebrow="PARTICIPATION">
            <p>Students can request permission to speak. Approval alone does not activate a microphone; the media provider must support the approved publishing flow.</p>
          </Panel>
          {role === 'admin' && (
            <Panel title="Billing configuration" eyebrow="ADMIN">
              <p>No payment provider or subscription-management system is configured in this classroom.</p>
            </Panel>
          )}
        </aside>
      </div>
    </div>
  )
}

function ClassSessionSettingsPanel({
  session,
  onSessionUpdated,
}: {
  session: ClassroomSession
  onSessionUpdated: (session: ClassroomSession) => void
}) {
  const [publicQa, setPublicQa] = useState(session.public_qa_enabled)
  const [screenShare, setScreenShare] = useState(session.allow_student_screen_share)
  const [maxParticipants, setMaxParticipants] = useState(String(session.max_participants))
  const [busy, setBusy] = useState(false)
  const [error, setError] = useState('')
  const [notice, setNotice] = useState('')

  async function save(event: FormEvent<HTMLFormElement>) {
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
        enable_public_qa: publicQa,
        permit_student_screen_share: screenShare,
        participant_limit: limit,
      })
      if (rpcError) throw rpcError
      if (data) onSessionUpdated(data as unknown as ClassroomSession)
      setNotice('Classroom settings saved.')
    } catch (cause) {
      setError(errorMessage(cause, 'Could not save classroom settings.'))
    } finally {
      setBusy(false)
    }
  }

  return (
    <Panel title="Classroom settings" eyebrow="ACCESS & PARTICIPATION">
      <form className="class-settings-form" onSubmit={save}>
        <label className="class-setting-toggle">
          <input type="checkbox" checked={screenShare} onChange={(e) => setScreenShare(e.target.checked)} />
          <span><strong>Allow student screen sharing</strong><small>Students must approve the browser permission prompt.</small></span>
        </label>
        <label className="class-setting-toggle">
          <input type="checkbox" checked={publicQa} onChange={(e) => setPublicQa(e.target.checked)} />
          <span><strong>Offer $10 public Q&A</strong><small>24-hour pass; checkout must be implemented before sales.</small></span>
        </label>
        <label className="class-setting-limit">
          Maximum participants
          <input type="number" min="2" max="250" required value={maxParticipants} onChange={(e) => setMaxParticipants(e.target.value)} />
        </label>
        <button className="button button-dark" disabled={busy || ['ended', 'cancelled'].includes(session.status)} type="submit">
          {busy ? 'Saving…' : 'Save settings'}
        </button>
      </form>
      {notice && <p className="form-message form-success" role="status">{notice}</p>}
      {error && <p className="form-message form-error" role="alert">{error}</p>}
    </Panel>
  )
}

function SharedLinksPanel({
  sessionId,
  canManage,
  isLive,
}: {
  sessionId: string
  canManage: boolean
  isLive: boolean
}) {
  const [links, setLinks] = useState<SharedClassLink[]>([])
  const [now, setNow] = useState(Date.now())
  const [url, setUrl] = useState('')
  const [title, setTitle] = useState('')
  const [description, setDescription] = useState('')
  const [duration, setDuration] = useState('5m')
  const [preview, setPreview] = useState('')
  const [busy, setBusy] = useState(false)
  const [error, setError] = useState('')
  const [notice, setNotice] = useState('')

  useEffect(() => {
    if (!supabase) return
    const client = supabase
    let active = true

    async function refresh() {
      try {
        const result = await listActiveClassLinks(sessionId)
        if (active) {
          setLinks(result)
          setNow(Date.now())
          setError('')
        }
      } catch (cause) {
        if (active) setError(errorMessage(cause, 'Could not load shared links.'))
      }
    }

    void refresh()
    const channel = client.channel(`class-links-${sessionId}`)
      .on('postgres_changes', {
        event: '*',
        schema: 'public',
        table: 'session_shared_links',
        filter: `session_id=eq.${sessionId}`,
      }, () => { void refresh() })
      .subscribe()

    const timer = window.setInterval(() => {
      setNow(Date.now())
      void refresh()
    }, 15000)

    return () => {
      active = false
      window.clearInterval(timer)
      void client.removeChannel(channel)
    }
  }, [sessionId])

  function previewLink() {
    setError('')
    try {
      const parsed = new URL(url.trim())
      if (!['https:', 'http:'].includes(parsed.protocol)) throw new Error('Use an HTTP or HTTPS URL.')
      setPreview(parsed.href)
      setUrl(parsed.href)
    } catch (cause) {
      setPreview('')
      setError(errorMessage(cause, 'Enter a valid URL.'))
    }
  }

  async function publish(event: FormEvent<HTMLFormElement>) {
    event.preventDefault()
    if (!supabase || !preview || preview !== url.trim() || !isLive) {
      setError('Preview the link first. Links can only be shared while live.')
      return
    }

    setBusy(true)
    setError('')
    setNotice('')

    try {
      const { error: rpcError } = await supabase.rpc('publish_classroom_link', {
        target_session_id: sessionId,
        link_url: preview,
        link_title: title.trim() || null,
        link_description: description.trim() || null,
        duration_mode: duration,
      })
      if (rpcError) throw rpcError

      setUrl('')
      setTitle('')
      setDescription('')
      setPreview('')
      setNotice('Link shared with the class.')
    } catch (cause) {
      setError(errorMessage(cause, 'Could not publish this link.'))
    } finally {
      setBusy(false)
    }
  }

  async function revoke(id: string) {
    if (!supabase) return
    setError('')
    const { error: rpcError } = await supabase.rpc('revoke_classroom_link', {
      target_link_id: id,
    })
    if (rpcError) setError(`Could not remove link: ${rpcError.message}`)
  }

  const activeLinks = links.filter((link) => !link.expires_at || Date.parse(link.expires_at) > now)

  return (
    <Panel title="Useful links" eyebrow="SHARED WITH THIS CLASS" count={activeLinks.length}>
      {canManage && (
        <form className="class-link-form" onSubmit={publish}>
          <label>URL<input required type="url" maxLength={2048} value={url} onChange={(e) => { setUrl(e.target.value); setPreview('') }} placeholder="https://example.com/resource" /></label>
          <div className="form-two-col">
            <label>Title (optional)<input maxLength={120} value={title} onChange={(e) => setTitle(e.target.value)} /></label>
            <label>Available for
              <select value={duration} onChange={(e) => setDuration(e.target.value)}>
                <option value="5m">5 minutes</option>
                <option value="10m">10 minutes</option>
                <option value="15m">15 minutes</option>
                <option value="30m">30 minutes</option>
                <option value="60m">60 minutes</option>
                <option value="entire_stream">Entire stream</option>
              </select>
            </label>
          </div>
          <label>Description (optional)<textarea rows={2} maxLength={300} value={description} onChange={(e) => setDescription(e.target.value)} /></label>
          <div className="link-form-actions">
            <button className="button button-outline" type="button" disabled={!url.trim()} onClick={previewLink}>Preview link</button>
            <button className="button button-dark" type="submit" disabled={!isLive || busy || !preview}>{busy ? 'Sharing…' : 'Share with class'}</button>
          </div>
          {preview && <div className="link-preview"><span>PREVIEW</span><a href={preview} target="_blank" rel="noopener noreferrer">{title.trim() || new URL(preview).hostname} ↗</a></div>}
        </form>
      )}

      {error && <p className="form-message form-error" role="alert">{error}</p>}
      {notice && <p className="form-message form-success" role="status">{notice}</p>}

      {activeLinks.length === 0 ? <p className="panel-empty">No active links have been shared yet.</p> : (
        <div className="shared-link-list">
          {activeLinks.map((link) => {
            const seconds = link.expires_at ? Math.max(0, Math.ceil((Date.parse(link.expires_at) - now) / 1000)) : null
            return (
              <article className="shared-link-item" key={link.id}>
                <span className="shared-link-icon" aria-hidden="true">↗</span>
                <div className="shared-link-copy">
                  <a href={link.url} target="_blank" rel="noopener noreferrer">{link.title || link.url} ↗</a>
                  <p>{link.description || link.url}</p>
                  <small>{seconds === null ? 'Until the class ends' : seconds >= 60 ? `Expires in ${Math.ceil(seconds / 60)} min` : 'Expires soon'}</small>
                </div>
                {canManage && <button className="icon-button" type="button" aria-label={`Remove ${link.title || link.url}`} onClick={() => void revoke(link.id)}>×</button>}
              </article>
            )
          })}
        </div>
      )}
    </Panel>
  )
}

function HandRaisePanel({
  sessionId,
  userId,
  canModerate,
  isLive,
}: {
  sessionId: string
  userId: string
  canModerate: boolean
  isLive: boolean
}) {
  const [requests, setRequests] = useState<HandRaise[]>([])
  const [busyId, setBusyId] = useState('')
  const [error, setError] = useState('')
  const [notice, setNotice] = useState('')

  useEffect(() => {
    if (!supabase) return
    const client = supabase
    let active = true

    async function refresh() {
      try {
        const result = await listClassHandRaises(sessionId)
        if (active) setRequests(result)
      } catch (cause) {
        if (active) setError(errorMessage(cause, 'Could not load speaking requests.'))
      }
    }

    void refresh()
    const channel = client.channel(`hand-raises-${sessionId}`)
      .on('postgres_changes', {
        event: '*',
        schema: 'public',
        table: 'class_hand_raises',
        filter: `session_id=eq.${sessionId}`,
      }, () => { void refresh() })
      .subscribe()

    return () => {
      active = false
      void client.removeChannel(channel)
    }
  }, [sessionId])

  const mine = requests
    .filter((item) => item.student_id === userId)
    .sort((a, b) => a.requested_at.localeCompare(b.requested_at))
  const latest = mine[mine.length - 1]
  const queue = requests.filter((item) => item.status === 'pending' || item.speaking_permission_active)

  async function act(
    name: 'raise_classroom_hand' | 'lower_classroom_hand' | 'decide_classroom_hand' | 'revoke_classroom_speaking',
    args: Record<string, string>,
  ) {
    if (!supabase || busyId) return
    setBusyId(args.target_request_id ?? sessionId)
    setError('')
    setNotice('')

    try {
      const { error: rpcError } = await supabase.rpc(name, args)
      if (rpcError) throw rpcError
      setNotice(name === 'raise_classroom_hand' ? 'Request sent to the instructor.' : 'Speaking request updated.')
      setRequests(await listClassHandRaises(sessionId))
    } catch (cause) {
      setError(errorMessage(cause, 'Could not update the speaking request.'))
    } finally {
      setBusyId('')
    }
  }

  return (
    <Panel title="Speaking requests" eyebrow="PARTICIPATE" count={canModerate ? queue.length : undefined}>
      {!canModerate ? (
        <>
          {latest && (latest.status === 'pending' || latest.speaking_permission_active) ? (
            <button className="button button-outline" disabled={busyId === latest.id} onClick={() => void act('lower_classroom_hand', { target_request_id: latest.id })} type="button">
              {latest.speaking_permission_active ? 'Stop speaking' : 'Lower hand'}
            </button>
          ) : (
            <button className="button button-dark" disabled={!isLive || Boolean(busyId)} onClick={() => void act('raise_classroom_hand', { target_session_id: sessionId })} type="button">Raise hand ↑</button>
          )}
          {latest && <p className="field-note">{latest.speaking_permission_active ? 'Approved to speak' : latest.status === 'pending' ? 'Waiting for instructor' : `Request ${latest.status}`}</p>}
          {!isLive && <p className="field-note">Hand raising is available while live.</p>}
          {latest?.speaking_permission_active && <p className="provider-notice">Approval does not activate audio; the audio publishing integration must be configured.</p>}
        </>
      ) : (
        <div className="hand-raise-queue">
          {queue.length === 0 ? <p className="panel-empty">No students are waiting to speak.</p> : queue.map((item) => (
            <article className="hand-request" key={item.id}>
              <div className="request-avatar">{(item.student?.display_name || 'S').slice(0, 1).toUpperCase()}</div>
              <div className="request-person">
                <strong>{item.student?.display_name || 'Student'}</strong>
                <small>{dateTime(item.requested_at)}</small>
                <span className="request-state">{item.speaking_permission_active ? 'Approved to speak' : item.status}</span>
              </div>
              {item.status === 'pending' ? (
                <div className="request-actions">
                  <button className="icon-button approve-button" aria-label="Approve student" disabled={!isLive || busyId === item.id} onClick={() => void act('decide_classroom_hand', { target_request_id: item.id, decision: 'approved' })} type="button">✓</button>
                  <button className="icon-button deny-button" aria-label="Deny student" disabled={busyId === item.id} onClick={() => void act('decide_classroom_hand', { target_request_id: item.id, decision: 'denied' })} type="button">×</button>
                </div>
              ) : (
                <button className="button button-outline button-small" disabled={busyId === item.id} onClick={() => void act('revoke_classroom_speaking', { target_request_id: item.id })} type="button">Revoke</button>
              )}
            </article>
          ))}
        </div>
      )}
      {error && <p className="form-message form-error" role="alert">{error}</p>}
      {notice && <p className="form-message form-success" role="status">{notice}</p>}
    </Panel>
  )
}

function ClassModerationPanel({ sessionId }: { sessionId: string }) {
  const [participants, setParticipants] = useState<SessionParticipant[]>([])
  const [restrictions, setRestrictions] = useState<
    { target_user_id: string; restriction_scope: string; revoked_at: string | null }[]
  >([])
  const [error, setError] = useState('')
  const [busyId, setBusyId] = useState('')

  useEffect(() => {
    if (!supabase) return
    const client = supabase
    let active = true

    async function refresh() {
      try {
        const [attendees, result] = await Promise.all([
          listSessionParticipants(sessionId),
          client.from('session_access_restrictions')
            .select('target_user_id, restriction_scope, revoked_at')
            .eq('session_id', sessionId)
            .is('revoked_at', null),
        ])
        if (result.error) throw result.error
        if (active) {
          setParticipants(attendees)
          setRestrictions(result.data ?? [])
        }
      } catch (cause) {
        if (active) setError(errorMessage(cause, 'Could not load moderation details.'))
      }
    }

    void refresh()
    const channel = client.channel(`moderation-${sessionId}`)
      .on('postgres_changes', { event: '*', schema: 'public', table: 'class_attendance', filter: `session_id=eq.${sessionId}` }, () => { void refresh() })
      .on('postgres_changes', { event: '*', schema: 'public', table: 'session_access_restrictions', filter: `session_id=eq.${sessionId}` }, () => { void refresh() })
      .subscribe()

    return () => {
      active = false
      void client.removeChannel(channel)
    }
  }, [sessionId])

  const unique = [...new Map(participants.map((item) => [item.user_id, item])).values()]

  async function remove(participant: SessionParticipant) {
    const name = participant.participant?.display_name || 'this participant'
    if (!window.confirm(`Block ${name} from rejoining this class? This affects only this session.`) || !supabase) return

    setBusyId(participant.user_id)
    setError('')
    try {
      const { error: rpcError } = await supabase.rpc('restrict_classroom_participant', {
        target_session_id: sessionId,
        p_target_user_id: participant.user_id,
        restriction_kind: 'block_rejoin',
        restriction_reason: 'Removed from this class by a moderator',
      })
      if (rpcError) throw rpcError
    } catch (cause) {
      setError(errorMessage(cause, 'Could not restrict this participant.'))
    } finally {
      setBusyId('')
    }
  }

  return (
    <Panel title="Participants" eyebrow="ADMIN MODERATION" count={unique.length}>
      {unique.length === 0 ? <p className="panel-empty">No attendance records yet.</p> : (
        <div className="participant-list">
          {unique.map((participant) => {
            const restriction = restrictions.find((item) => item.target_user_id === participant.user_id)
            const name = participant.participant?.display_name || 'Student'
            return (
              <article className="participant-row" key={participant.user_id}>
                <div className="request-avatar">{name.slice(0, 1).toUpperCase()}</div>
                <div className="request-person">
                  <strong>{name}</strong>
                  <small>{participant.left_at ? 'Left class' : 'In attendance'}</small>
                  {restriction && <span className="request-state state-denied">Access restricted</span>}
                </div>
                {!restriction && (
                  <button className="button button-outline button-small" disabled={busyId === participant.user_id} onClick={() => void remove(participant)} type="button">
                    Remove
                  </button>
                )}
              </article>
            )
          })}
        </div>
      )}
      <p className="field-note">Restrictions affect this class only. They do not suspend platform accounts or disconnect an RTC client automatically.</p>
      {error && <p className="form-message form-error" role="alert">{error}</p>}
    </Panel>
  )
}
