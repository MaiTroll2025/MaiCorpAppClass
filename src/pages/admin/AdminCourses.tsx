import { useCallback, useEffect, useState } from 'react'
import { Link } from 'react-router-dom'
import { supabase } from '../../lib/supabase'

interface Course {
  id: string
  title: string
  slug: string
  status: string
  access_level: string
  required_plan_id: string | null
  updated_at: string
  instructor_id: string
}

function formatDate(value: string) {
  const date = new Date(value)
  return Number.isNaN(date.getTime())
    ? 'Not available'
    : new Intl.DateTimeFormat(undefined, { dateStyle: 'medium' }).format(date)
}

export function AdminCourses() {
  const [courses, setCourses] = useState<Course[]>([])
  const [loading, setLoading] = useState(true)
  const [error, setError] = useState('')
  const [actionMsg, setActionMsg] = useState('')
  const [busy, setBusy] = useState('')

  const load = useCallback(async () => {
    if (!supabase) return
    setLoading(true)
    try {
      const { data, error } = await supabase
        .from('courses')
        .select('id, title, slug, status, access_level, required_plan_id, updated_at, instructor_id')
        .order('updated_at', { ascending: false })
      if (error) throw error
      setCourses(data || [])
    } catch (cause) {
      setError(cause instanceof Error ? cause.message : 'Failed to load courses')
    } finally {
      setLoading(false)
    }
  }, [])

  useEffect(() => {
    void load()
  }, [load])

  const togglePublish = async (course: Course) => {
    if (!supabase || course.status === 'archived') return
    setBusy(course.id)
    setActionMsg('')
    try {
      const nextStatus = course.status === 'published' ? 'draft' : 'published'
      if (!confirm(`${nextStatus === 'published' ? 'Publish' : 'Unpublish'} "${course.title}"?`)) {
        setBusy('')
        return
      }
      const { error } = await supabase
        .from('courses')
        .update({ 
          status: nextStatus,
          published_at: nextStatus === 'published' ? new Date().toISOString() : null,
        })
        .eq('id', course.id)
      if (error) throw error
      setActionMsg(`${course.title} is now ${nextStatus}`)
      await load()
    } catch (cause) {
      setActionMsg(cause instanceof Error ? cause.message : 'Failed to update')
    } finally {
      setBusy('')
    }
  }

  const deleteCourse = async (course: Course) => {
    if (!supabase) return
    if (!confirm(Delete ""? This will also delete all lessons. This action cannot be undone.)) return
    setBusy(course.id)
    try {
      const { error } = await supabase.from('courses').delete().eq('id', course.id)
      if (error) throw error
      setActionMsg("" deleted)
      await load()
    } catch (cause) {
      setActionMsg(cause instanceof Error ? cause.message : 'Failed to delete')
    } finally {
      setBusy('')
    }
  }

  if (loading) return <div className="admin-panel"><p>Loading courses...</p></div>

  return (
    <div className="admin-grid">
      <section className="admin-panel">
        <div className="admin-panel-header">
          <h2>Course Management</h2>
          <Link className="button button-small button-dark" to="/admin/course-editor">+ Create New Course</Link>
        </div>
        {error && <p className="form-error">{error}</p>}
        {actionMsg && <p className="form-success">{actionMsg}</p>}
        
        {courses.length === 0 ? (
          <p>No courses found. Create your first course to get started.</p>
        ) : (
          <div className="admin-table">
            <table>
              <thead>
                <tr>
                  <th>Title</th>
                  <th>Status</th>
                  <th>Access</th>
                  <th>Updated</th>
                  <th>Actions</th>
                </tr>
              </thead>
              <tbody>
                {courses.map((course) => (
                  <tr key={course.id}>
                    <td>
                      <strong>{course.title}</strong><br/>
                      <small>/{course.slug}</small>
                    </td>
                    <td><span className={`status-badge status-${course.status}`}>{course.status}</span></td>
                    <td>{course.required_plan_id ? `Plan: ${course.required_plan_id}` : course.access_level}</td>
                    <td>{formatDate(course.updated_at)}</td>
                    <td>
                      <div className="admin-table-actions">
                        <Link className="button button-small button-outline" to={`/admin/course-editor?id=${course.id}`}>Edit</Link>
                        <Link className="button button-small button-outline" to={`/courses/${course.slug}`} target="_blank">Preview</Link>
                        {course.status !== 'archived' && (
                          <button 
                            className="button button-small button-dark" 
                            onClick={() => togglePublish(course)}
                            disabled={busy === course.id}
                          >
                            {busy === course.id ? '...' : course.status === 'published' ? 'Unpublish' : 'Publish'}
                          </button>
                        )}
                        <button 
                          className="button button-small button-danger" 
                          onClick={() => deleteCourse(course)}
                          disabled={busy === course.id}
                        >
                          Delete
                        </button>
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
