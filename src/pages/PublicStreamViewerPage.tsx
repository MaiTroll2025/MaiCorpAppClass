import { useEffect, useRef, useState } from 'react'
import { Link, useParams } from 'react-router-dom'
import type { IAgoraRTCClient, IAgoraRTCRemoteUser, IRemoteVideoTrack } from 'agora-rtc-sdk-ng'
import { DesktopOnly } from './DesktopOnly'
import { listPublicStreams, requestPublicStreamGrant, type PublicStream } from '../lib/streaming'
import { PayPalCheckoutButton } from './PayPalCheckout'

export function PublicStreamViewerPage() {
  const { sessionId = '' } = useParams()
  const [stream, setStream] = useState<PublicStream | null>(null)
  const [loading, setLoading] = useState(true)
  const [busy, setBusy] = useState(false)
  const [error, setError] = useState('')
  const [previewEnded, setPreviewEnded] = useState(false)
  const [previewSeconds, setPreviewSeconds] = useState<number | null>(null)
  const [watching, setWatching] = useState(false)
  const videoRef = useRef<HTMLDivElement>(null)
  const clientRef = useRef<IAgoraRTCClient | null>(null)
  const videoTrackRef = useRef<IRemoteVideoTrack | null>(null)

  useEffect(() => {
    let active = true
    void listPublicStreams()
      .then((streams) => {
        if (active) setStream(streams.find((item) => item.session_id === sessionId) ?? null)
      })
      .catch((cause) => {
        if (active) setError(cause instanceof Error ? cause.message : 'Could not load this stream.')
      })
      .finally(() => { if (active) setLoading(false) })
    return () => { active = false }
  }, [sessionId])

  useEffect(() => {
    if (previewSeconds === null || previewSeconds <= 0) return
    const timer = window.setTimeout(() => {
      setPreviewSeconds((seconds) => seconds === null ? null : seconds - 1)
    }, 1000)
    return () => window.clearTimeout(timer)
  }, [previewSeconds])

  async function leaveStream() {
    videoTrackRef.current?.stop()
    videoTrackRef.current = null
    const client = clientRef.current
    clientRef.current = null
    if (client) {
      try {
        await client.leave()
      } catch (cause) {
        console.error('Could not leave the public stream cleanly.', cause)
      }
    }
    setWatching(false)
  }

  async function startWatching() {
    if (busy || watching || !stream) return
    setBusy(true)
    setError('')
    setPreviewEnded(false)
    try {
      const grant = await requestPublicStreamGrant(sessionId)
      const { default: AgoraRTC } = await import('agora-rtc-sdk-ng')
      const client = AgoraRTC.createClient({ mode: 'live', codec: 'vp8' })
      clientRef.current = client
      await client.setClientRole('audience')
      client.on('user-published', async (remoteUser: IAgoraRTCRemoteUser, mediaType) => {
        await client.subscribe(remoteUser, mediaType)
        if (mediaType === 'video' && remoteUser.videoTrack && videoRef.current) {
          videoTrackRef.current = remoteUser.videoTrack
          remoteUser.videoTrack.play(videoRef.current)
        }
        if (mediaType === 'audio') remoteUser.audioTrack?.play()
      })
      client.on('user-unpublished', (_remoteUser, mediaType) => {
        if (mediaType === 'video') {
          videoTrackRef.current?.stop()
          videoTrackRef.current = null
          if (videoRef.current) videoRef.current.replaceChildren()
        }
      })
      await client.join(grant.appId, grant.channel, grant.token, grant.uid)
      setWatching(true)
      if (grant.preview) setPreviewSeconds(grant.expiresIn)

      window.setTimeout(() => {
        void leaveStream()
        if (grant.preview) {
          setPreviewEnded(true)
          setPreviewSeconds(0)
        } else {
          setError('Your viewing connection expired. Reconnect to continue watching.')
        }
      }, grant.expiresIn * 1000)
    } catch (cause) {
      await leaveStream()
      setError(cause instanceof Error ? cause.message : 'Could not connect to this stream.')
      if (cause instanceof Error && /preview/i.test(cause.message)) setPreviewEnded(true)
    } finally {
      setBusy(false)
    }
  }

  useEffect(() => () => {
    videoTrackRef.current?.stop()
    const client = clientRef.current
    if (client) void client.leave()
  }, [])

  if (loading) return <div className="section page-state" role="status">Loading stream…</div>
  if (!stream && !error) return <div className="section page-state"><h1>This stream isn’t available.</h1><Link className="button button-dark" to="/">Back to homepage</Link></div>

  return <DesktopOnly>
    <div className="page-shell public-stream-page">
      <div className="eyebrow"><span className={stream?.status === 'live' ? 'eyebrow-dot live-dot' : 'eyebrow-dot'} /> {stream?.status === 'live' ? 'LIVE NOW' : 'UPCOMING STREAM'}</div>
      <h1>{stream?.title ?? 'Live stream'}<span>.</span></h1>
      <p>{stream?.course_title} · with {stream?.instructor_name}</p>
      {stream?.description && <p>{stream.description}</p>}
      <div className="public-stream-player">
        <div aria-label="Live stream video" className="public-stream-video" ref={videoRef} role="img">
          {!watching && <p>{stream?.status === 'live' ? 'Press “Watch live” to connect.' : `Scheduled for ${stream ? new Date(stream.scheduled_at).toLocaleString() : ''}`}</p>}
        </div>
      </div>
      {stream?.status === 'live' && <div className="public-stream-actions">
        {!watching && !previewEnded && <button className="button button-dark" disabled={busy} onClick={() => void startWatching()} type="button">{busy ? 'Connecting…' : 'Watch live'}</button>}
        {watching && <button className="button button-outline" onClick={() => void leaveStream()} type="button">Leave stream</button>}
        {previewSeconds !== null && watching && <p className="dashboard-note">Free preview: {previewSeconds} seconds remaining for this stream on this network.</p>}
        {previewEnded && <div className="stream-paywall"><h2>Your free preview has ended.</h2><p>Get a $10, 24-hour pass for this stream or choose a plan for live-stream access.</p><PayPalCheckoutButton label="Get a 24-hour pass — $10.00" product={{ type: 'pass', sessionId }} /><Link className="button button-outline" to="/pricing">View learning plans</Link></div>}
      </div>}
      {error && <p className="form-message form-error" role="alert">{error}</p>}
      <Link className="back-link" to="/">← Back to homepage</Link>
    </div>
  </DesktopOnly>
}
