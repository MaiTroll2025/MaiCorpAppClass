import { useEffect, useState, type FormEvent } from 'react'
import { supabase } from '../lib/supabase'

interface StreamInterest {
  id: string
  user_id: string
  app_interest: string
  created_at: string
  student: { display_name: string | null } | null
}

export function ClassStreamInterestPanel({
  sessionId,
  canModerate,
  isStudent,
  isLive,
}: {
  sessionId: string
  canModerate: boolean
  isStudent: boolean
  isLive: boolean
}) {
  const [appInterest, setAppInterest] = useState('')
  const [interests, setInterests] = useState<StreamInterest[]>([])
  const [message, setMessage] = useState('')
  const [busy, setBusy] = useState(false)

  useEffect(() => {
    const client = supabase
    if (!canModerate || !client) return
    const interestClient = client
    let active = true
    async function loadInterests() {
      const { data, error } = await interestClient
        .from('class_stream_interests')
        .select('id, user_id, app_interest, created_at, student:profiles!class_stream_interests_user_id_fkey(display_name)')
        .eq('session_id', sessionId)
        .order('created_at', { ascending: false })
        .limit(100)
      if (!active) return
      if (error) setMessage(`Could not load student interests: ${error.message}`)
      else setInterests((data ?? []) as unknown as StreamInterest[])
    }

    void Promise.resolve().then(loadInterests)
    const channel = interestClient
      .channel(`class-stream-interests-${sessionId}`)
      .on('postgres_changes', {
        event: '*',
        schema: 'public',
        table: 'class_stream_interests',
        filter: `session_id=eq.${sessionId}`,
      }, () => { void loadInterests() })
      .subscribe((status) => {
        if (status === 'CHANNEL_ERROR' || status === 'TIMED_OUT') {
          setMessage('Live student-interest notifications disconnected. Refresh to check for updates.')
        }
      })
    return () => {
      active = false
      void interestClient.removeChannel(channel)
    }
  }, [canModerate, sessionId])

  async function submitInterest(event: FormEvent<HTMLFormElement>) {
    event.preventDefault()
    if (!supabase || busy || !isLive) return
    setBusy(true)
    setMessage('')
    try {
      const { error } = await supabase.rpc('submit_class_stream_interest', {
        target_session_id: sessionId,
        requested_app: appInterest.trim(),
      })
      if (error) throw new Error(error.message)
      setAppInterest('')
      setMessage('Your interest was shared with the instructor and class administrators.')
    } catch (cause) {
      setMessage(cause instanceof Error ? cause.message : 'Could not share your app interest.')
    } finally {
      setBusy(false)
    }
  }

  if (!isLive || (!canModerate && !isStudent)) return null

  return <section className="classroom-panel stream-interest-panel">
    {isStudent ? <>
      <div className="eyebrow">YOUR APP IDEA</div>
      <h2>Interested in building an app?</h2>
      <p>Tell the instructor what you want to make. This is an explicit notice; your viewing activity is not tracked for interest.</p>
      <form className="class-link-form" onSubmit={(event) => void submitInterest(event)}>
        <label>What are you interested in building?<input maxLength={160} onChange={(event) => setAppInterest(event.target.value)} required value={appInterest} /></label>
        <button className="button button-dark" disabled={busy || !appInterest.trim()} type="submit">{busy ? 'Sending…' : 'I’m interested'}</button>
      </form>
    </> : <>
      <div className="eyebrow">LIVE STUDENT INTEREST</div>
      <h2>Who wants to build what?</h2>
      {interests.length === 0
        ? <p className="panel-empty">Students’ voluntary app-interest notes will appear here during the stream.</p>
        : <div className="dashboard-list">{interests.map((interest) => <article className="dashboard-list-row" key={interest.id}>
          <div><h3>{interest.student?.display_name || 'Student'}</h3><p>Interested in: {interest.app_interest}</p></div>
          <small>{new Intl.DateTimeFormat(undefined, { dateStyle: 'short', timeStyle: 'short' }).format(new Date(interest.created_at))}</small>
        </article>)}</div>}
    </>}
    {message && <p className="form-message" role="status">{message}</p>}
  </section>
}
