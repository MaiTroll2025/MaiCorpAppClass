import { useEffect, useRef, useState } from 'react'
import { Link, useParams } from 'react-router-dom'
import { DesktopOnly } from './DesktopOnly'
import { listPublicRecordings, requestPublicRecordingUrl, type PublicRecording } from '../lib/streaming'
import { PayPalCheckoutButton } from './PayPalCheckout'

export function PublicRecordingViewerPage() {
  const { recordingId = '' } = useParams()
  const [recording, setRecording] = useState<PublicRecording | null>(null)
  const [loading, setLoading] = useState(true)
  const [busy, setBusy] = useState(false)
  const [error, setError] = useState('')
  const [previewEnded, setPreviewEnded] = useState(false)
  const videoRef = useRef<HTMLVideoElement>(null)

  useEffect(() => {
    let active = true
    void listPublicRecordings()
      .then((items) => {
        if (active) setRecording(items.find((item) => item.recording_id === recordingId) ?? null)
      })
      .catch((cause) => {
        if (active) setError(cause instanceof Error ? cause.message : 'Could not load this recording.')
      })
      .finally(() => { if (active) setLoading(false) })
    return () => { active = false }
  }, [recordingId])

  useEffect(() => () => {
    if (videoRef.current) {
      videoRef.current.pause()
      videoRef.current.removeAttribute('src')
      videoRef.current.load()
    }
  }, [])

  async function startWatching() {
    if (busy || !recording) return
    setBusy(true)
    setError('')
    setPreviewEnded(false)
    try {
      const grant = await requestPublicRecordingUrl(recordingId)
      if (!videoRef.current) return
      videoRef.current.src = grant.signedUrl
      await videoRef.current.play()
      if (grant.preview) {
        window.setTimeout(() => {
          if (videoRef.current) {
            videoRef.current.pause()
            videoRef.current.removeAttribute('src')
            videoRef.current.load()
          }
          setPreviewEnded(true)
        }, grant.expiresIn * 1000)
      }
    } catch (cause) {
      const message = cause instanceof Error ? cause.message : 'Could not play this recording.'
      setError(message)
      if (/preview/i.test(message)) setPreviewEnded(true)
    } finally {
      setBusy(false)
    }
  }

  if (loading) return <div className="section page-state" role="status">Loading recording…</div>
  if (!recording && !error) return <div className="section page-state"><h1>This recording isn’t available.</h1><Link className="button button-dark" to="/library">Back to recordings</Link></div>

  return <DesktopOnly>
    <div className="page-shell public-stream-page">
      <div className="eyebrow"><span className="eyebrow-dot" /> RECORDED CLASS</div>
      <h1>{recording?.title ?? 'Class recording'}<span>.</span></h1>
      <p>{recording?.course_title} · with {recording?.instructor_name}</p>
      <div className="public-stream-player">
        <video className="recording-player" controls playsInline ref={videoRef} />
      </div>
      {!previewEnded && <button className="button button-dark" disabled={busy} onClick={() => void startWatching()} type="button">{busy ? 'Loading video…' : 'Watch 30-second preview'}</button>}
      {previewEnded && <div className="stream-paywall"><h2>Your free preview has ended.</h2><p>Choose an eligible plan for permanent access or get a 24-hour pass for this class.</p><PayPalCheckoutButton label="Get a 24-hour pass — $10.00" product={{ type: 'pass', sessionId: recording?.session_id ?? '' }} /><Link className="button button-outline" to="/pricing">View learning plans</Link></div>}
      {error && <p className="form-message form-error" role="alert">{error}</p>}
      <Link className="back-link" to="/library">← All recordings</Link>
    </div>
  </DesktopOnly>
}
