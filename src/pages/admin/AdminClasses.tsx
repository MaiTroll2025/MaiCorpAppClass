import { useCallback, useEffect, useState } from 'react'
import { Link, useNavigate } from 'react-router-dom'
import { supabase } from '../../lib/supabase'
import { listClassSessions } from '../../lib/classroom'

function formatDate(value: string) {
  const date = new Date(value)
  return Number.isNaN(date.getTime())
    ? 'Not available'
    : new Intl.DateTimeFormat(undefined, { dateStyle: 'medium', timeStyle: 'short' }).format(date)
}

export function AdminClasses() {
  const navigate = useNavigate()
  const [sessions, setSessions] = useState<any[]>([])
  const [loading, setLoading] = useState(true)
  const [error, setError] = useState('')
  const [actionMsg, setActionMsg] = useState('')
  const [busy, setBusy] = useState('')

  const load = useCallback(async () => {
    setLoading(true)
    try {
      const data = await listClassSessions()
      // Also load all sessions including ended/cancelled
      if (supabase) {
        const { data: allSessions } = await supabase
          .from('class_sessions')
          .select('id, course_id, lesson_id, instructor_id, title, description, scheduled_at, status, started_at, ended_at, max_participants, allow_student_screen_share, public_qa_enabled, course:courses(title), instructor:profiles!class_sessions_instructor_id_fkey(display_name)')
          .order('scheduled_at', { ascending: false })
          .limit(100)
        setSessions(allSessions || data)
      } else {
        setSessions(data)
      }
    } catch (cause) {
      setError(cause instanceof Error ? cause.message : 'Failed to load classes')
    } finally {
      setLoading(false)
    }
  }, [])

  useEffect(() => {
    void load()
  }, [load])

  const startClass = async (sessionId: string) => {
    if (!supabase) return
    setBusy(sessionId)
    setActionMsg('')
    try {
      const { error } = await supabase.rpc('start_class_session', { target_session_id: sessionId })
      if (error) throw error
      setActionMsg('Class started successfully')
      await load()
      navigate(/classroom/)
    } catch (cause) {
      setActionMsg(cause instanceof Error ? cause.message : 'Failed to start class')
    } finally {
      setBusy('')
    }
  }

  const endClass = async (sessionId: string) => {
    if (!supabase) return
    if (!confirm('End this live class?')) return
    setBusy(sessionId)
    try {
      const { error } = await supabase.rpc('end_class_session', { target_session_id: sessionId })
      if (error) throw error
      setActionMsg('Class ended successfully')
      await load()
    } catch (cause) {
      setActionMsg(cause instanceof Error ? cause.message : 'Failed to end class')
    } finally {
      setBusy('')
    }
  }

  const cancelClass = async (sessionId: string) => {
    if (!supabase) return
    if (!confirm('Cancel this scheduled class?')) return
    setBusy(sessionId)
    try {
      const { error } = await supabase.rpc('cancel_class_session', { target_session_id: sessionId })
      if (error) throw error
      setActionMsg('Class cancelled')
      await load()
    } catch (cause) {
      setActionMsg(cause instanceof Error ? cause.message : 'Failed to cancel class')
    } finally {
      setBusy('')
    }
  }

  if (loading) return <div className="admin-panel"><p>Loading classes...</p></div>

  return (
    <div className="admin-grid">
      <section className="admin-panel">
        <div className="admin-panel-header">
          <h2>Live Classroom Management</h2>
          <Link className="button button-small button-dark" to="/admin">Schedule New Class</Link>
        </div>
        {error && <p className="form-error">{error}</p>}
        {actionMsg && <p className="form-success">{actionMsg}</p>}

        {sessions.length === 0 ? (
          <p>No classes found.</p>
        ) : (
          <div className="admin-table">
            <table>
              <thead>
                <tr>
                  <th>Class</th>
                  <th>Course</th>
                  <th>Instructor</th>
                  <th>Scheduled</th>
                  <th>Status</th>
                  <th>Actions</th>
                </tr>
              </thead>
              <tbody>
                {sessions.map((session) => (
                  <tr key={session.id}>
                    <td><strong>{session.title}</strong></td>
                    <td>{session.course?.title || 'N/A'}</td>
                    <td>{session.instructor?.display_name || 'N/A'}</td>
                    <td>{formatDate(session.scheduled_at)}</td>
                    <td><span className={status-badge status-}>{session.status}</span></td>
                    <td>
                      <div className="admin-table-actions">
                        {session.status === 'scheduled' && (
                          <button className="button button-small button-dark" onClick={() => startClass(session.id)} disabled={busy === session.id}>
                            {busy === session.id ? '...' : 'Start'}
                          </button>
                        )}
                        {session.status === 'live' && (
                          <>
                            <button className="button button-small button-dark" onClick={() => navigate(/classroom/)}>Open</button>
                            <button className="button button-small button-outline" onClick={() => endClass(session.id)} disabled={busy === session.id}>End</button>
                          </>
                        )}
                        {session.status === 'scheduled' && (
                          <button className="button button-small button-danger" onClick={() => cancelClass(session.id)} disabled={busy === session.id}>Cancel</button>
                        )}
                        <Link className="button button-small button-outline" to={/classroom/}>View</Link>
                      </div>
                    </td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        )}
      </section>
    </div>
  )
}
