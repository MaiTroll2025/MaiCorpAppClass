import { useEffect, useRef, useState, type FormEvent } from 'react'
import { Link, useNavigate, useSearchParams } from 'react-router-dom'
import { useAuth } from '../auth/useAuth'
import { supabase } from '../lib/supabase'
import { DesktopOnly } from './DesktopOnly'
import { SetupNotice } from './Shared'

interface StreamCourse {
  id: string
  title: string
  description: string
  status: string
  instructor_id: string
}

function localDateTimeValue(date: Date) {
  const offset = date.getTimezoneOffset() * 60_000
  return new Date(date.getTime() - offset).toISOString().slice(0, 16)
}

export function AdminStreamSetupPage() {
  const [searchParams] = useSearchParams()
  const courseId = searchParams.get('courseId') ?? ''
  const navigate = useNavigate()
  const { user, loading: authLoading } = useAuth()
  const [course, setCourse] = useState<StreamCourse | null>(null)
  const [role, setRole] = useState<string | null>(null)
  const [title, setTitle] = useState('')
  const [description, setDescription] = useState('')
  const [scheduledAt, setScheduledAt] = useState(() => localDateTimeValue(new Date(Date.now() + 15 * 60_000)))
  const [duration, setDuration] = useState('60')
  const [loading, setLoading] = useState(true)
  const [busy, setBusy] = useState(false)
  const [error, setError] = useState('')
  const [cameraStatus, setCameraStatus] = useState('')
  const [cameraPreviewActive, setCameraPreviewActive] = useState(false)
  const previewRef = useRef<HTMLVideoElement>(null)
  const cameraStreamRef = useRef<MediaStream | null>(null)

  useEffect(() => {
    const client = supabase
    if (!client || !user || !courseId) return

    const setupClient = client
    const authenticatedUserId = user.id
    let active = true
    async function loadSetupData() {
      try {
        const [profileResult, courseResult] = await Promise.all([
          setupClient.from('profiles').select('role').eq('id', authenticatedUserId).maybeSingle(),
          setupClient.from('courses').select('id, title, description, status, instructor_id').eq('id', courseId).maybeSingle(),
        ])
        if (profileResult.error) throw new Error(`Could not verify admin access: ${profileResult.error.message}`)
        if (courseResult.error) throw new Error(`Could not load the course: ${courseResult.error.message}`)
        if (!courseResult.data) throw new Error('The selected course could not be found.')
        if (active) {
          setRole(profileResult.data?.role ?? null)
          setCourse(courseResult.data)
          setTitle(courseResult.data.title)
          setDescription(courseResult.data.description ?? '')
        }
      } catch (cause) {
        if (active) setError(cause instanceof Error ? cause.message : 'Could not load stream setup.')
      } finally {
        if (active) setLoading(false)
      }
    }

    void loadSetupData()
    return () => {
      active = false
      cameraStreamRef.current?.getTracks().forEach((track) => track.stop())
    }
  }, [courseId, user])

  async function testCamera() {
    setCameraStatus('')
    let requestedStream: MediaStream | null = null
    try {
      cameraStreamRef.current?.getTracks().forEach((track) => track.stop())
      const media = await navigator.mediaDevices.getUserMedia({ video: true, audio: true })
      requestedStream = media
      cameraStreamRef.current = media
      setCameraPreviewActive(true)
      if (previewRef.current) {
        previewRef.current.srcObject = media
        await previewRef.current.play()
      }
      setCameraStatus('Camera and microphone are ready. They will only publish after you start the class.')
    } catch (cause) {
      requestedStream?.getTracks().forEach((track) => track.stop())
      cameraStreamRef.current = null
      if (previewRef.current) previewRef.current.srcObject = null
      setCameraStatus(cause instanceof Error ? cause.message : 'Could not access the camera and microphone.')
      setCameraPreviewActive(false)
    }
  }

  function stopCameraTest() {
    cameraStreamRef.current?.getTracks().forEach((track) => track.stop())
    cameraStreamRef.current = null
    setCameraPreviewActive(false)
    if (previewRef.current) previewRef.current.srcObject = null
    setCameraStatus('Camera and microphone preview stopped.')
  }

  async function createStream(event: FormEvent<HTMLFormElement>) {
    event.preventDefault()
    if (!supabase || !user || !course || busy) return
    if (role !== 'admin') {
      setError('Only an administrator can set up this homepage stream.')
      return
    }
    if (course.status !== 'published') {
      setError('Publish this course before creating a stream that can appear on the homepage.')
      return
    }

    const minutes = Number(duration)
    const startTime = new Date(scheduledAt)
    if (!Number.isFinite(startTime.getTime()) || startTime.getTime() <= Date.now()) {
      setError('Choose a valid future start time.')
      return
    }
    if (!Number.isInteger(minutes) || minutes < 15 || minutes > 360) {
      setError('Class duration must be from 15 to 360 minutes.')
      return
    }
    if (!title.trim()) {
      setError('Enter a stream title.')
      return
    }

    setBusy(true)
    setError('')
    stopCameraTest()
    try {
      const sessionId = crypto.randomUUID()
      const { error: insertError } = await supabase
        .from('class_sessions')
        .insert({
          id: sessionId,
          course_id: course.id,
          lesson_id: null,
          instructor_id: course.instructor_id,
          title: title.trim(),
          description: description.trim(),
          learning_objectives: [],
          scheduled_at: startTime.toISOString(),
          expected_duration_minutes: minutes,
          public_stream_enabled: true,
          public_qa_enabled: true,
        })
      if (insertError) throw new Error(`Could not set up the stream: ${insertError.message}`)

      navigate(`/admin/streams/${sessionId}`)
    } catch (cause) {
      setError(cause instanceof Error ? cause.message : 'Could not create the stream.')
      setBusy(false)
    }
  }

  async function publishCourse() {
    if (!supabase || !course || busy) return
    setBusy(true)
    setError('')
    try {
      const { data, error: publishError } = await supabase
        .from('courses')
        .update({ status: 'published', published_at: new Date().toISOString() })
        .eq('id', course.id)
        .eq('status', 'draft')
        .select('id')
        .maybeSingle()
      if (publishError) throw new Error(`Could not publish the course: ${publishError.message}`)
      if (!data) throw new Error('The course was not published. Refresh and verify administrator access.')
      setCourse({ ...course, status: 'published' })
    } catch (cause) {
      setError(cause instanceof Error ? cause.message : 'Could not publish this course.')
    } finally {
      setBusy(false)
    }
  }

  if (!supabase) return <div className="section page-state"><SetupNotice /></div>
  if (authLoading) return <div className="section page-state" role="status">Loading stream setup…</div>
  if (!user) return <div className="section page-state"><h1>Sign in to continue.</h1><Link className="button button-dark" to="/sign-in">Sign in</Link></div>
  if (!courseId) return <div className="section page-state"><h1>Choose a course first.</h1><Link className="button button-dark" to="/admin">Back to dashboard</Link></div>
  if (loading) return <div className="section page-state" role="status">Loading stream setup…</div>
  if (role && role !== 'admin') return <div className="section page-state"><h1>Administrator access required.</h1><p>Only an administrator can configure homepage streams.</p></div>
  if (error && !course) return <div className="section page-state"><p className="form-message form-error" role="alert">{error}</p></div>
  if (!course) return <div className="section page-state"><h1>Choose a course first.</h1><Link className="button button-dark" to="/admin">Back to dashboard</Link></div>

  return <DesktopOnly>
    <div className="page-shell page-state admin-stream-setup">
      <div className="eyebrow"><span className="eyebrow-dot" /> HOMEPAGE STREAM SETUP</div>
      <h1>Set up your live stream<span>.</span></h1>
      <p>Course: <strong>{course.title}</strong>. Test your devices and schedule the class. Start it later from the admin classroom.</p>
      {course.status !== 'published' && <div className="dashboard-notice"><p>Publish this course before its live stream can be listed for homepage viewers.</p><button className="button button-outline" disabled={busy} onClick={() => void publishCourse()} type="button">{busy ? 'Publishing…' : 'Publish course and continue'}</button> <Link to={`/admin/course-editor?id=${course.id}`}>Edit course</Link></div>}
      <section className="classroom-panel stream-device-test">
        <h2>Check your devices</h2>
        <video aria-label="Camera preview" autoPlay className="stream-setup-preview" muted playsInline ref={previewRef} />
        <div className="dashboard-class-setup-actions">
          <button className="button button-outline" disabled={busy} onClick={() => void testCamera()} type="button">Test camera and microphone</button>
          <button className="button button-outline" disabled={!cameraPreviewActive} onClick={stopCameraTest} type="button">Stop preview</button>
        </div>
        {cameraStatus && <p className="form-message" role="status">{cameraStatus}</p>}
      </section>
      <form className="classroom-panel class-link-form" onSubmit={(event) => void createStream(event)}>
        <label>Stream title<input maxLength={180} onChange={(event) => setTitle(event.target.value)} required value={title} /></label>
        <label>Stream description<textarea maxLength={5000} onChange={(event) => setDescription(event.target.value)} rows={3} value={description} /></label>
        <div className="form-two-col">
          <label>Start time<input onChange={(event) => setScheduledAt(event.target.value)} required type="datetime-local" value={scheduledAt} /></label>
          <label>Duration in minutes<input max="360" min="15" onChange={(event) => setDuration(event.target.value)} required type="number" value={duration} /></label>
        </div>
        {error && <p className="form-message form-error" role="alert">{error}</p>}
        <div className="dashboard-class-setup-actions">
          <button className="button button-dark" disabled={busy || course.status !== 'published'} type="submit">{busy ? 'Setting up…' : 'Schedule stream'}</button>
        </div>
      </form>
    </div>
  </DesktopOnly>
}
