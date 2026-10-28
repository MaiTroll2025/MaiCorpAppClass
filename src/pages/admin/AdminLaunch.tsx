import { useCallback, useEffect, useState, type FormEvent } from 'react'
import { getPublicLaunchStats, setPublicLaunchAt } from '../../lib/launch'

function formatDate(value: string | null) {
  if (!value) return 'Not set'
  const date = new Date(value)
  return Number.isNaN(date.getTime())
    ? 'Not set'
    : new Intl.DateTimeFormat(undefined, { dateStyle: 'medium', timeStyle: 'short' }).format(date)
}

function localDateTimeValue(value: string | null) {
  if (!value) return ''
  const date = new Date(value)
  if (Number.isNaN(date.getTime())) return ''
  const offset = date.getTimezoneOffset() * 60000
  return new Date(date.getTime() - offset).toISOString().slice(0, 16)
}

export function AdminLaunch() {
  const [launchStats, setLaunchStats] = useState<any>(null)
  const [launchDateValue, setLaunchDateValue] = useState('')
  const [saving, setSaving] = useState(false)
  const [message, setMessage] = useState('')
  const [error, setError] = useState('')

  const load = useCallback(async () => {
    try {
      const stats = await getPublicLaunchStats()
      setLaunchStats(stats)
      setLaunchDateValue(localDateTimeValue(stats.launchAt))
    } catch (cause) {
      setError(cause instanceof Error ? cause.message : 'Failed to load')
    }
  }, [])

  useEffect(() => {
    void load()
  }, [load])

  const save = async (e: FormEvent) => {
    e.preventDefault()
    setSaving(true)
    setError('')
    setMessage('')
    try {
      const launchAt = launchDateValue ? new Date(launchDateValue).toISOString() : null
      await setPublicLaunchAt(launchAt)
      setMessage(launchAt ? 'Launch date saved successfully' : 'Launch date cleared')
      await load()
    } catch (cause) {
      setError(cause instanceof Error ? cause.message : 'Failed to save')
    } finally {
      setSaving(false)
    }
  }

  return (
    <div className="admin-grid">
      <section className="admin-panel">
        <div className="admin-panel-header">
          <h2>Public Launch Settings</h2>
        </div>
        {error && <p className="form-error">{error}</p>}
        {message && <p className="form-success">{message}</p>}
        
        <div className="admin-info-box">
          <p><strong>Current Launch Date:</strong> {formatDate(launchStats?.launchAt)}</p>
          <p><strong>Confirmed Enrolled Students:</strong> {launchStats?.enrolledStudents || 0}</p>
          <p className="admin-note">The public launch count includes distinct active student accounts with confirmed active/completed course enrollments, excludes test accounts, and requires verified plan entitlements for paid courses. Pending checkouts are never counted.</p>
        </div>

        <form onSubmit={save} className="admin-form">
          <label className="admin-form-field">
            <span>Official Launch Date and Time (local time)</span>
            <input type="datetime-local" value={launchDateValue} onChange={(e) => setLaunchDateValue(e.target.value)} />
            <small>Leave empty to clear the launch date</small>
          </label>
          <button className="button button-dark" type="submit" disabled={saving}>
            {saving ? 'Saving...' : launchDateValue ? 'Save Launch Date' : 'Clear Launch Date'}
          </button>
        </form>
      </section>
    </div>
  )
}
