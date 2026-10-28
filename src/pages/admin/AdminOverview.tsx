import { useCallback, useEffect, useState } from 'react'
import { Link } from 'react-router-dom'
import { useAuth } from '../../auth/useAuth'
import { supabase } from '../../lib/supabase'
import { getPublicLaunchStats } from '../../lib/launch'
import { listClassSessions } from '../../lib/classroom'

function formatDate(value: string | null | undefined) {
  if (!value) return 'Not available'
  const date = new Date(value)
  return Number.isNaN(date.getTime())
    ? 'Not available'
    : new Intl.DateTimeFormat(undefined, { dateStyle: 'medium', timeStyle: 'short' }).format(date)
}

export function AdminOverview() {
  const { user } = useAuth()
  const [loading, setLoading] = useState(true)
  const [error, setError] = useState('')
  const [stats, setStats] = useState({
    registeredStudents: 0,
    publishedCourses: 0,
    drafts: 0,
    upcomingClasses: 0,
    activePlanEntitlements: 0,
    enrolledStudents: 0,
  })
  const [launchStats, setLaunchStats] = useState<any>(null)
  const [recentSessions, setRecentSessions] = useState<any[]>([])

  const load = useCallback(async () => {
    if (!supabase || !user) return
    setLoading(true)
    setError('')
    try {
      const [
        ,
        ,
        studentCountResult,
        activePlanEntitlementsResult,
        draftsResult,
        publishedResult,
        classesResult,
        sessions,
        lStats,
      ] = await Promise.all([
        supabase.from('profiles').select('id', { count: 'exact', head: true }).eq('role', 'student'),
        supabase.from('courses').select('id', { count: 'exact', head: true }),
        supabase.from('profiles').select('id', { count: 'exact', head: true }).eq('role', 'student'),
        supabase.from('student_plan_entitlements').select('user_id', { count: 'exact', head: true }).eq('status', 'active'),
        supabase.from('courses').select('id', { count: 'exact', head: true }).eq('status', 'draft'),
        supabase.from('courses').select('id', { count: 'exact', head: true }).eq('status', 'published'),
        supabase.from('class_sessions').select('id', { count: 'exact', head: true }).in('status', ['scheduled', 'live']),
        listClassSessions(),
        getPublicLaunchStats(),
      ])
      setStats({
        registeredStudents: studentCountResult.count ?? 0,
        publishedCourses: publishedResult.count ?? 0,
        drafts: draftsResult.count ?? 0,
        upcomingClasses: classesResult.count ?? 0,
        activePlanEntitlements: activePlanEntitlementsResult.count ?? 0,
        enrolledStudents: lStats.enrolledStudents ?? 0,
      })
      setLaunchStats(lStats)
      setRecentSessions(sessions.slice(0, 5))
    } catch (cause) {
      setError(cause instanceof Error ? cause.message : 'Failed to load overview')
    } finally {
      setLoading(false)
    }
  }, [user])

  useEffect(() => {
    void load()
  }, [load])

  if (loading) return <div className="admin-panel"><p>Loading overview...</p></div>
  if (error) return <div className="admin-panel"><p className="form-error">{error}</p><button className="button button-dark" onClick={() => void load()}>Retry</button></div>

  return (
    <div className="admin-grid">
      <div className="dashboard-stat-grid admin-stat-grid">
        <article className="dashboard-stat"><span>Registered Students</span><strong>{stats.registeredStudents}</strong></article>
        <article className="dashboard-stat"><span>Published Courses</span><strong>{stats.publishedCourses}</strong></article>
        <article className="dashboard-stat"><span>Draft Courses</span><strong>{stats.drafts}</strong></article>
        <article className="dashboard-stat"><span>Live/Scheduled Classes</span><strong>{stats.upcomingClasses}</strong></article>
        <article className="dashboard-stat"><span>Active Plan Entitlements</span><strong>{stats.activePlanEntitlements}</strong></article>
      </div>

      <section className="admin-panel">
        <div className="admin-panel-header">
          <h2>Quick Actions</h2>
        </div>
        <div className="admin-quick-actions">
          <Link className="button button-dark" to="/admin/course-editor">Create New Course</Link>
          <Link className="button button-outline" to="/admin/classes">Schedule Live Class</Link>
          <Link className="button button-outline" to="/admin/students">Manage Students</Link>
          <Link className="button button-outline" to="/admin/launch">Edit Launch Settings</Link>
        </div>
      </section>

      <section className="admin-panel">
        <div className="admin-panel-header">
          <h2>Public Launch</h2>
        </div>
        <p>Confirmed enrolled students: <strong>{stats.enrolledStudents}</strong></p>
        <p>Launch date: <strong>{formatDate(launchStats?.launchAt)}</strong></p>
        <Link className="button button-small button-outline" to="/admin/launch">Manage Launch Settings</Link>
      </section>

      <section className="admin-panel">
        <div className="admin-panel-header">
          <h2>Upcoming Live Classes</h2>
        </div>
        {recentSessions.length === 0 ? <p>No upcoming classes</p> : (
          <div className="dashboard-list">
            {recentSessions.map((session) => (
              <article className="dashboard-list-row" key={session.id}>
                <div>
                  <h3>{session.title}</h3>
                  <p>{session.course?.title} · {session.status}</p>
                  <small>{formatDate(session.scheduled_at)}</small>
                </div>
                <Link className="button button-small button-outline" to="/classroom/">Open Classroom</Link>
              </article>
            ))}
          </div>
        )}
        <Link className="button button-small button-dark" to="/admin/classes">View All Classes</Link>
      </section>
    </div>
  )
}
