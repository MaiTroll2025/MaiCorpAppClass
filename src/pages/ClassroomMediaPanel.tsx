import { useCallback, useEffect, useRef, useState } from 'react'
import type {
  IAgoraRTCClient,
  IAgoraRTCRemoteUser,
  ILocalAudioTrack,
  ILocalVideoTrack,
  IRemoteVideoTrack,
} from 'agora-rtc-sdk-ng'
import { requestClassroomRtcToken } from '../lib/agoraClassroom'
import { listClassroomRoster, type ClassroomRosterMember } from '../lib/classroom'
import { supabase } from '../lib/supabase'
import { ClassroomChatPanel, ClassroomQuestionsPanel } from './ClassroomInteractionPanels'

function messageFrom(error: unknown, fallback: string) {
  return error instanceof Error ? error.message : fallback
}

function VideoSurface({ track, label, featured = false }: { track: ILocalVideoTrack | IRemoteVideoTrack; label: string; featured?: boolean }) {
  const element = useRef<HTMLDivElement>(null)

  useEffect(() => {
    const target = element.current
    if (!target) return
    track.play(target)
    return () => {
      track.stop()
    }
  }, [track])

  return <div className={featured ? 'rtc-video rtc-video-featured' : 'rtc-video'}>
    <div aria-label={label} className="rtc-video-surface" ref={element} role="img" />
    <span className="rtc-video-label">{label}</span>
  </div>
}

export function ClassroomMediaPanel({
  sessionId,
  userId,
  displayName,
  canModerate,
  allowStudentScreenShare,
  maxParticipants,
}: {
  sessionId: string
  userId: string
  displayName: string
  canModerate: boolean
  allowStudentScreenShare: boolean
  maxParticipants: number
}) {
  const clientRef = useRef<IAgoraRTCClient | null>(null)
  const screenClientRef = useRef<IAgoraRTCClient | null>(null)
  const cameraRef = useRef<ILocalVideoTrack | null>(null)
  const microphoneRef = useRef<ILocalAudioTrack | null>(null)
  const screenTrackRef = useRef<ILocalVideoTrack | null>(null)
  const joinedRef = useRef(false)
  const aliveRef = useRef(true)
  const [roster, setRoster] = useState<ClassroomRosterMember[]>([])
  const [remoteVideos, setRemoteVideos] = useState<Record<string, IRemoteVideoTrack>>({})
  const [connected, setConnected] = useState(false)
  const [connectionState, setConnectionState] = useState('Not connected')
  const [canPublishAudio, setCanPublishAudio] = useState(false)
  const [cameraOn, setCameraOn] = useState(false)
  const [microphoneOn, setMicrophoneOn] = useState(false)
  const [screenSharing, setScreenSharing] = useState(false)
  const [cameraVideoTrack, setCameraVideoTrack] = useState<ILocalVideoTrack | null>(null)
  const [screenVideoTrack, setScreenVideoTrack] = useState<ILocalVideoTrack | null>(null)
  const [busy, setBusy] = useState(false)
  const [error, setError] = useState('')
  const [cameraDevices, setCameraDevices] = useState<MediaDeviceInfo[]>([])
  const [microphoneDevices, setMicrophoneDevices] = useState<MediaDeviceInfo[]>([])
  const [cameraId, setCameraId] = useState('')
  const [microphoneId, setMicrophoneId] = useState('')

  const refreshRoster = useCallback(async () => {
    try {
      const members = await listClassroomRoster(sessionId)
      if (aliveRef.current) setRoster(members)
    } catch (cause) {
      if (aliveRef.current) setError(messageFrom(cause, 'Could not load classroom participants.'))
    }
  }, [sessionId])

  const refreshPermission = useCallback(async (client: IAgoraRTCClient) => {
    try {
      const grant = await requestClassroomRtcToken(sessionId)
      await client.renewToken(grant.token)
      if (!aliveRef.current) return
      setCanPublishAudio(grant.canPublishAudio)
      if (!grant.canPublishAudio && microphoneRef.current) {
        await client.unpublish(microphoneRef.current)
        microphoneRef.current.stop()
        microphoneRef.current.close()
        microphoneRef.current = null
        setMicrophoneOn(false)
      }
    } catch (cause) {
      if (aliveRef.current) setError(messageFrom(cause, 'Could not refresh classroom permissions.'))
    }
  }, [sessionId])

  const stopScreenShare = useCallback(async () => {
    const client = screenClientRef.current
    const track = screenTrackRef.current
    screenClientRef.current = null
    screenTrackRef.current = null
    setScreenSharing(false)
    setScreenVideoTrack(null)
    try {
      if (client && track) await client.unpublish(track)
      if (track) {
        track.stop()
        track.close()
      }
      if (client) await client.leave()
    } catch (cause) {
      if (aliveRef.current) setError(messageFrom(cause, 'Could not stop screen sharing cleanly.'))
    }
  }, [])

  const leaveClassroom = useCallback(async (recordLeave: boolean) => {
    const client = clientRef.current
    const screenClient = screenClientRef.current
    const camera = cameraRef.current
    const microphone = microphoneRef.current
    const screenTrack = screenTrackRef.current
    const hadJoined = joinedRef.current
    clientRef.current = null
    screenClientRef.current = null
    cameraRef.current = null
    microphoneRef.current = null
    screenTrackRef.current = null
    joinedRef.current = false
    setConnected(false)
    setCameraOn(false)
    setMicrophoneOn(false)
    setScreenSharing(false)
    setCameraVideoTrack(null)
    setScreenVideoTrack(null)
    setRemoteVideos({})

    for (const track of [camera, microphone, screenTrack]) {
      if (track) {
        track.stop()
        track.close()
      }
    }
    const leaving = [client?.leave(), screenClient?.leave()].filter(Boolean)
    const results = await Promise.allSettled(leaving)
    const failedLeave = results.find((result) => result.status === 'rejected')
    if (failedLeave?.status === 'rejected' && aliveRef.current) {
      setError(messageFrom(failedLeave.reason, 'Could not leave the RTC channel cleanly.'))
    }
    if (recordLeave && hadJoined && supabase) {
      const { error: rpcError } = await supabase.rpc('record_class_attendance', {
        target_session_id: sessionId,
        attendance_action: 'leave',
      })
      if (rpcError && aliveRef.current) setError(`Could not record your departure: ${rpcError.message}`)
    }
  }, [sessionId])

  useEffect(() => {
    aliveRef.current = true
    return () => {
      aliveRef.current = false
      void leaveClassroom(true)
    }
  }, [leaveClassroom])

  useEffect(() => {
    const client = supabase
    if (!client || !connected) return
    let active = true
    const channel = client
      .channel(`classroom-roster-${sessionId}`)
      .on('postgres_changes', {
        event: '*',
        schema: 'public',
        table: 'class_attendance',
        filter: `session_id=eq.${sessionId}`,
      }, () => { void refreshRoster() })
      .on('postgres_changes', {
        event: '*',
        schema: 'public',
        table: 'session_access_restrictions',
        filter: `session_id=eq.${sessionId}`,
      }, () => {
        void requestClassroomRtcToken(sessionId)
          .then(() => undefined)
          .catch((cause: unknown) => {
            if (active) {
              setError(messageFrom(cause, 'Your access to this class has changed.'))
              void leaveClassroom(false)
            }
          })
      })
      .subscribe((status) => {
        if (active && (status === 'CHANNEL_ERROR' || status === 'TIMED_OUT')) {
          setError('Participant updates disconnected. RTC audio/video remains active.')
        }
      })
    void refreshRoster()
    return () => {
      active = false
      void client.removeChannel(channel)
    }
  }, [connected, leaveClassroom, refreshRoster, sessionId])

  useEffect(() => {
    const client = supabase
    if (!client || !connected || canModerate) return
    let active = true
    const channel = client
      .channel(`classroom-speaking-permission-${sessionId}-${userId}`)
      .on('postgres_changes', {
        event: '*',
        schema: 'public',
        table: 'class_hand_raises',
        filter: `student_id=eq.${userId}`,
      }, () => {
        const rtcClient = clientRef.current
        if (rtcClient) void refreshPermission(rtcClient)
      })
      .subscribe((status) => {
        if (active && (status === 'CHANNEL_ERROR' || status === 'TIMED_OUT')) {
          setError('Microphone-permission updates disconnected. Rejoin to refresh speaking access.')
        }
      })
    return () => {
      active = false
      void client.removeChannel(channel)
    }
  }, [canModerate, connected, refreshPermission, sessionId, userId])

  useEffect(() => {
    if (!canModerate && !allowStudentScreenShare && screenSharing) void stopScreenShare()
  }, [allowStudentScreenShare, canModerate, screenSharing, stopScreenShare])

  async function joinClassroom() {
    if (busy) return
    setBusy(true)
    setError('')
    let client: IAgoraRTCClient | null = null
    try {
      const grant = await requestClassroomRtcToken(sessionId)
      const { default: AgoraRTC } = await import('agora-rtc-sdk-ng')
      client = AgoraRTC.createClient({ mode: 'rtc', codec: 'vp8' })
      clientRef.current = client
      client.on('connection-state-change', (currentState) => {
        if (aliveRef.current) setConnectionState(currentState)
      })
      client.on('user-published', async (remoteUser: IAgoraRTCRemoteUser, mediaType) => {
        try {
          await client?.subscribe(remoteUser, mediaType)
          if (mediaType === 'audio') {
            remoteUser.audioTrack?.play()
          } else if (remoteUser.videoTrack && aliveRef.current) {
            setRemoteVideos((current) => ({ ...current, [String(remoteUser.uid)]: remoteUser.videoTrack! }))
          }
        } catch (cause) {
          if (aliveRef.current) setError(messageFrom(cause, 'Could not subscribe to a participant stream.'))
        }
      })
      client.on('user-unpublished', (remoteUser, mediaType) => {
        if (mediaType === 'video' && aliveRef.current) {
          setRemoteVideos((current) => {
            const next = { ...current }
            delete next[String(remoteUser.uid)]
            return next
          })
        }
      })
      client.on('user-left', (remoteUser) => {
        if (aliveRef.current) {
          setRemoteVideos((current) => {
            const next = { ...current }
            delete next[String(remoteUser.uid)]
            return next
          })
        }
      })
      client.on('token-privilege-will-expire', () => {
        const rtcClient = clientRef.current
        if (rtcClient) void refreshPermission(rtcClient)
      })
      await client.join(grant.appId, grant.channel, grant.token, grant.uid)
      if (!aliveRef.current) {
        await client.leave()
        return
      }
      const { error: attendanceError } = await supabase!.rpc('record_class_attendance', {
        target_session_id: sessionId,
        attendance_action: 'join',
      })
      if (attendanceError) throw new Error(`RTC connected, but attendance could not be recorded: ${attendanceError.message}`)
      joinedRef.current = true
      setCanPublishAudio(grant.canPublishAudio)
      setConnected(true)
      setConnectionState('CONNECTED')
      try {
        const [cameras, microphones] = await Promise.all([
          AgoraRTC.getCameras(true),
          AgoraRTC.getMicrophones(true),
        ])
        if (aliveRef.current) {
          setCameraDevices(cameras)
          setMicrophoneDevices(microphones)
        }
      } catch {
        if (aliveRef.current) setError('Device selection is unavailable. You can still enable your default camera or microphone.')
      }
    } catch (cause) {
      if (client) {
        try {
          await client.leave()
        } catch (leaveError) {
          console.error('Could not clean up a failed Agora join.', leaveError)
        }
      }
      if (clientRef.current === client) clientRef.current = null
      if (aliveRef.current) setError(messageFrom(cause, 'Could not join the live classroom.'))
    } finally {
      if (aliveRef.current) setBusy(false)
    }
  }

  async function toggleCamera() {
    const client = clientRef.current
    if (!client || busy) return
    setBusy(true)
    setError('')
    try {
      const { default: AgoraRTC } = await import('agora-rtc-sdk-ng')
      if (cameraRef.current) {
        await client.unpublish(cameraRef.current)
        cameraRef.current.stop()
        cameraRef.current.close()
        cameraRef.current = null
        setCameraOn(false)
        setCameraVideoTrack(null)
      } else {
        const track = await AgoraRTC.createCameraVideoTrack({
          ...(cameraId ? { cameraId } : {}),
          encoderConfig: '720p_1',
        })
        cameraRef.current = track
        try {
          await client.publish(track)
        } catch (cause) {
          cameraRef.current = null
          track.stop()
          track.close()
          throw cause
        }
        setCameraOn(true)
        setCameraVideoTrack(track)
      }
    } catch (cause) {
      setError(messageFrom(cause, 'Camera access failed. Check browser permissions and available devices.'))
    } finally {
      setBusy(false)
    }
  }

  async function toggleMicrophone() {
    const client = clientRef.current
    if (!client || busy) return
    if (!canPublishAudio) {
      setError('Microphone publishing is locked. Raise your hand and wait for an instructor to approve speaking.')
      return
    }
    setBusy(true)
    setError('')
    try {
      if (microphoneRef.current) {
        await client.unpublish(microphoneRef.current)
        microphoneRef.current.stop()
        microphoneRef.current.close()
        microphoneRef.current = null
        setMicrophoneOn(false)
      } else {
        const { default: AgoraRTC } = await import('agora-rtc-sdk-ng')
        const track = await AgoraRTC.createMicrophoneAudioTrack({
          ...(microphoneId ? { microphoneId } : {}),
        })
        microphoneRef.current = track
        try {
          await client.publish(track)
        } catch (cause) {
          microphoneRef.current = null
          track.stop()
          track.close()
          throw cause
        }
        setMicrophoneOn(true)
      }
    } catch (cause) {
      setError(messageFrom(cause, 'Microphone access failed. Check browser permissions and available devices.'))
    } finally {
      setBusy(false)
    }
  }

  async function startScreenShare() {
    if (!clientRef.current || busy || (!canModerate && !allowStudentScreenShare)) return
    setBusy(true)
    setError('')
    let screenClient: IAgoraRTCClient | null = null
    let track: ILocalVideoTrack | null = null
    try {
      const grant = await requestClassroomRtcToken(sessionId, true)
      const { default: AgoraRTC } = await import('agora-rtc-sdk-ng')
      screenClient = AgoraRTC.createClient({ mode: 'rtc', codec: 'vp8' })
      screenClientRef.current = screenClient
      screenClient.on('user-published', async (remoteUser, mediaType) => {
        if (mediaType !== 'video') return
        try {
          await screenClient?.subscribe(remoteUser, mediaType)
        } catch (cause) {
          if (aliveRef.current) setError(messageFrom(cause, 'Could not subscribe to a shared screen.'))
        }
      })
      screenClient.on('token-privilege-will-expire', async () => {
        try {
          const renewedGrant = await requestClassroomRtcToken(sessionId, true)
          await screenClient?.renewToken(renewedGrant.token)
        } catch (cause) {
          if (aliveRef.current) setError(messageFrom(cause, 'Screen-sharing access expired. Stop and restart sharing.'))
        }
      })
      await screenClient.join(grant.appId, grant.channel, grant.token, grant.uid)
      track = await AgoraRTC.createScreenVideoTrack({}, 'disable')
      screenTrackRef.current = track
      track.on('track-ended', () => { void stopScreenShare() })
      await screenClient.publish(track)
      setScreenSharing(true)
      setScreenVideoTrack(track)
    } catch (cause) {
      if (track) {
        track.stop()
        track.close()
      }
      if (screenClient) {
        try {
          await screenClient.leave()
        } catch (leaveError) {
          console.error('Could not clean up a failed screen-share connection.', leaveError)
        }
      }
      screenTrackRef.current = null
      screenClientRef.current = null
      setScreenVideoTrack(null)
      setError(messageFrom(cause, 'Screen sharing could not start. Check browser support and permissions.'))
    } finally {
      setBusy(false)
    }
  }

  const memberNames = new Map(roster.map((member) => [member.user_id, member.display_name]))
  const remoteScreen = Object.entries(remoteVideos).find(([uid]) => uid.startsWith('screen:'))
  const remoteCameras = Object.entries(remoteVideos).filter(([uid]) => !uid.startsWith('screen:'))
  const featuredTrack = screenVideoTrack ?? remoteScreen?.[1] ?? remoteCameras[0]?.[1] ?? cameraVideoTrack
  const featuredUid = screenVideoTrack ? `screen:${userId}` : remoteScreen?.[0] ?? remoteCameras[0]?.[0] ?? userId
  const featuredName = featuredUid.startsWith('screen:')
    ? `${memberNames.get(featuredUid.slice('screen:'.length)) ?? displayName} · screen`
    : memberNames.get(featuredUid) ?? (featuredUid === userId ? displayName : 'Participant')
  const otherTracks = Object.entries(remoteVideos).filter(([uid]) => uid !== featuredUid)
  const canShareScreen = canModerate || allowStudentScreenShare

  return <>
    <section className="classroom-panel rtc-panel" aria-label="Live classroom video and audio">
    <div className="panel-heading">
      <div><div className="eyebrow">LIVE CLASSROOM</div><h2>Video, audio & screen share</h2></div>
      <span className={connected ? 'rtc-connection is-connected' : 'rtc-connection'}>{connectionState}</span>
    </div>
    {!connected ? <div className="rtc-join-state">
      <p>Join to subscribe to class video and audio. Camera and microphone stay off until you turn them on.</p>
      <button className="button button-dark" disabled={busy} onClick={() => void joinClassroom()} type="button">
        {busy ? 'Connecting…' : 'Join live classroom'}
      </button>
    </div> : <>
      <div className="rtc-stage">
        {featuredTrack ? <VideoSurface featured label={featuredName} track={featuredTrack} /> : <div className="rtc-video rtc-video-featured rtc-video-placeholder"><span aria-hidden="true">m.</span><strong>Waiting for a camera or screen share</strong><small>Class video is shown only when a participant explicitly publishes a track.</small></div>}
      </div>
      <div className="rtc-video-grid">
        {cameraVideoTrack && featuredUid !== userId && <VideoSurface key="local-camera" label={`${displayName} · you`} track={cameraVideoTrack} />}
        {otherTracks.map(([uid, track]) => {
          const isScreen = uid.startsWith('screen:')
          const memberId = isScreen ? uid.slice('screen:'.length) : uid
          const label = `${memberNames.get(memberId) ?? 'Participant'}${isScreen ? ' · screen' : ''}`
          return <VideoSurface key={uid} label={label} track={track} />
        })}
      </div>
      <div className="rtc-controls" aria-label="Classroom controls">
        <button className={microphoneOn ? 'rtc-control is-active' : 'rtc-control'} disabled={busy || !canPublishAudio} onClick={() => void toggleMicrophone()} type="button">
          {microphoneOn ? 'Mute microphone' : canPublishAudio ? 'Enable microphone' : 'Microphone locked'}
        </button>
        <button className={cameraOn ? 'rtc-control is-active' : 'rtc-control'} disabled={busy} onClick={() => void toggleCamera()} type="button">
          {cameraOn ? 'Turn camera off' : 'Turn camera on'}
        </button>
        {canShareScreen && <button className={screenSharing ? 'rtc-control is-active' : 'rtc-control'} disabled={busy} onClick={() => void (screenSharing ? stopScreenShare() : startScreenShare())} type="button">
          {screenSharing ? 'Stop sharing' : 'Share screen'}
        </button>}
        <button className="rtc-control rtc-leave" disabled={busy} onClick={() => void leaveClassroom(true)} type="button">Leave class</button>
      </div>
      {!canModerate && !canPublishAudio && <p className="field-note">Your microphone stays locked until an instructor approves a speaking request. Camera and screen sharing remain subject to classroom policy.</p>}
      {canShareScreen && <p className="field-note">Screen sharing depends on browser and operating-system support; some mobile browsers cannot share a screen.</p>}
      {cameraDevices.length > 0 && <div className="rtc-device-selectors">
        <label>Camera<select aria-label="Camera device" onChange={(event) => setCameraId(event.target.value)} value={cameraId}><option value="">Default camera</option>{cameraDevices.map((device, index) => <option key={device.deviceId} value={device.deviceId}>{device.label || `Camera ${index + 1}`}</option>)}</select></label>
        {microphoneDevices.length > 0 && <label>Microphone<select aria-label="Microphone device" onChange={(event) => setMicrophoneId(event.target.value)} value={microphoneId}><option value="">Default microphone</option>{microphoneDevices.map((device, index) => <option key={device.deviceId} value={device.deviceId}>{device.label || `Microphone ${index + 1}`}</option>)}</select></label>}
      </div>}
    </>}
    <div className="rtc-roster">
      <div className="rtc-roster-heading"><strong>Participants</strong><span>{roster.length} / {maxParticipants}</span></div>
      {roster.length === 0 ? <p className="panel-empty">Participants appear after joining the classroom.</p> : roster.map((member) => <div className="rtc-roster-member" key={member.user_id}>
        <span className="request-avatar" aria-hidden="true">{member.display_name.slice(0, 1).toUpperCase()}</span>
        <span>{member.display_name}{member.user_id === userId ? ' · you' : ''}</span>
        <small>{member.participant_role}</small>
      </div>)}
    </div>
      {error && <p className="form-message form-error" role="alert">{error}</p>}
    </section>
    <ClassroomChatPanel sessionId={sessionId} userId={userId} roster={roster} isLive />
    <ClassroomQuestionsPanel sessionId={sessionId} userId={userId} canModerate={canModerate} roster={roster} isLive />
  </>
}
