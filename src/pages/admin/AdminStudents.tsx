import { useCallback, useEffect, useState } from 'react'
import { supabase } from '../../lib/supabase'

function formatDate(value: string) {
  const date = new Date(value)
  return Number.isNaN(date.getTime())
    ? 'Not available'
    : new Intl.DateTimeFormat(undefined, { dateStyle: 'medium' }).format(date)
}

export function AdminStudents() {
  const [students, setStudents] = useState<any[]>([])
  const [loading, setLoading] = useState(true)
  const [error, setError] = useState('')
  const [actionMsg, setActionMsg] = useState('')
  const [busy, setBusy] = useState('')
  const [search, setSearch] = useState('')

  const load = useCallback(async () => {
    if (!supabase) return
    setLoading(true)
    try {
      const { data, error } = await supabase
        .from('profiles')
        .select('id, display_name, account_status, role, created_at')
        .eq('role', 'student')
        .order('created_at', { ascending: false })
        .limit(100)
      if (error) throw error
      setStudents(data || [])
    } catch (cause) {
      setError(cause instanceof Error ? cause.message : 'Failed to load students')
    } finally {
      setLoading(false)
    }
  }, [])

  useEffect(() => {
    void load()
  }, [load])

  const toggleStatus = async (student: any) => {
    if (!supabase) return
    const newStatus = student.account_status === 'active' ? 'suspended' : 'active'
    if (!confirm(`${newStatus === 'suspended' ? 'Suspend' : 'Reinstate'}?`)) return
    setBusy(student.id)
    setActionMsg('')
    try {
      const { error } = await supabase
        .from('profiles')
        .update({ account_status: newStatus })
        .eq('id', student.id)
      if (error) throw error
      setActionMsg('Status updated')
      await load()
    } catch (cause) {
      setActionMsg(cause instanceof Error ? cause.message : 'Failed to update')
    } finally {
      setBusy('')
    }
  }

  const filtered = students.filter(s => 
    !search || (s.display_name || '').toLowerCase().includes(search.toLowerCase())
  )

  if (loading) return <div className="admin-panel"><p>Loading students...</p></div>

  return (
    <div className="admin-grid">
      <section className="admin-panel">
        <div className="admin-panel-header">
          <h2>Student Management</h2>
          <input 
            type="search" 
            placeholder="Search students..." 
            value={search} 
            onChange={(e) => setSearch(e.target.value)}
            style={{ padding: '8px 12px', borderRadius: '4px', border: '1px solid var(--line)' }}
          />
        </div>
        {error && <p className="form-error">{error}</p>}
        {actionMsg && <p className="form-success">{actionMsg}</p>}
        
        {filtered.length === 0 ? (
          <p>No students found.</p>
        ) : (
          <div className="admin-table">
            <table>
              <thead>
                <tr>
                  <th>Student</th>
                  <th>Status</th>
                  <th>Joined</th>
                  <th>Actions</th>
                </tr>
              </thead>
              <tbody>
                {filtered.map((student) => (
                  <tr key={student.id}>
                    <td><strong>{student.display_name || 'Unnamed'}</strong></td>
                    <td><span className={`status-badge status-${student.account_status}`}>{student.account_status}</span></td>
                    <td>{formatDate(student.created_at)}</td>
                    <td>
                      <button 
                        className="button button-small"
                        onClick={() => toggleStatus(student)}
                        disabled={busy === student.id}
                      >
                        {busy === student.id ? '...' : student.account_status === 'active' ? 'Suspend' : 'Reinstate'}
                      </button>
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
