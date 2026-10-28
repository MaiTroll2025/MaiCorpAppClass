import { useEffect, useState } from 'react'
import { Link } from 'react-router-dom'
import { listPublicRecordings, listPublicStreams, type PublicRecording, type PublicStream } from '../lib/streaming'
import { EmptyState } from './Shared'

export function PublicStreamHighlights() {
  const [streams, setStreams] = useState<PublicStream[]>([])
  const [error, setError] = useState('')

  useEffect(() => {
    let active = true
    void listPublicStreams()
      .then((items) => { if (active) setStreams(items) })
      .catch((cause) => { if (active) setError(cause instanceof Error ? cause.message : 'Could not load live streams.') })
    return () => { active = false }
  }, [])

  if (error) return <section className="section public-media-section"><div className="inline-state error-state" role="alert">{error}</div></section>
  if (streams.length === 0) return null

  return <section className="section public-media-section">
    <div className="section-heading"><div><div className="eyebrow"><span className="eyebrow-dot" /> WATCH LIVE</div><h2>Join a live stream.</h2><p>Preview each stream free for 30 seconds per network, then continue with an eligible plan or 24-hour pass.</p></div></div>
    <div className="public-media-grid">{streams.map((stream) => <article className="public-media-card" key={stream.session_id}>
      <span className={stream.status === 'live' ? 'class-status is-live' : 'class-status'}>{stream.status === 'live' ? 'LIVE NOW' : 'UPCOMING'}</span>
      <h3>{stream.title}</h3>
      <p>{stream.course_title} · {stream.instructor_name}</p>
      {stream.status === 'scheduled' && <small>{new Date(stream.scheduled_at).toLocaleString()}</small>}
      <Link className="button button-dark" to={`/watch/${stream.session_id}`}>{stream.status === 'live' ? 'Watch live' : 'Stream details'}</Link>
    </article>)}</div>
  </section>
}

export function PublicRecordingHighlights({ showEmpty = false }: { showEmpty?: boolean }) {
  const [recordings, setRecordings] = useState<PublicRecording[]>([])
  const [loading, setLoading] = useState(true)
  const [error, setError] = useState('')

  useEffect(() => {
    let active = true
    void listPublicRecordings()
      .then((items) => { if (active) setRecordings(items) })
      .catch((cause) => { if (active) setError(cause instanceof Error ? cause.message : 'Could not load published recordings.') })
      .finally(() => { if (active) setLoading(false) })
    return () => { active = false }
  }, [])

  if (loading) return <div className="inline-state" role="status">Loading published recordings…</div>
  if (error) return <div className="inline-state error-state" role="alert">{error}</div>
  if (recordings.length === 0) {
    return showEmpty ? <EmptyState title="No published recordings yet." text="When a recording is published, it will appear here with a 30-second preview." /> : null
  }

  const cards = <div className="public-media-grid">{recordings.map((recording) => <article className="public-media-card" key={recording.recording_id}>
    <span className="class-status">RECORDING</span>
    <h3>{recording.title}</h3>
    <p>{recording.course_title} · {recording.instructor_name}</p>
    <small>Published {new Date(recording.published_at).toLocaleDateString()}{recording.duration_seconds ? ` · ${Math.round(recording.duration_seconds / 60)} min` : ''}</small>
    <Link className="button button-dark" to={`/watch/recording/${recording.recording_id}`}>Watch preview</Link>
  </article>)}</div>
  if (showEmpty) return cards
  return <section className="section public-media-section">
    <div className="section-heading"><div><div className="eyebrow"><span className="eyebrow-dot" /> WATCH ANYTIME</div><h2>Replay a class.</h2><p>Each published recording includes a free 30-second preview per network.</p></div></div>
    {cards}
  </section>
}
