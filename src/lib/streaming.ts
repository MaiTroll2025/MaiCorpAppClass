import { supabase } from './supabase'

export interface PublicStream {
  session_id: string
  title: string
  description: string
  scheduled_at: string
  status: 'scheduled' | 'live'
  course_title: string
  instructor_name: string
}

export interface PublicRecording {
  recording_id: string
  session_id: string
  title: string
  course_title: string
  instructor_name: string
  duration_seconds: number | null
  published_at: string
}

export interface PublicStreamGrant {
  appId: string
  channel: string
  uid: string
  token: string
  expiresIn: number
  preview: boolean
}

export async function listPublicStreams(): Promise<PublicStream[]> {
  if (!supabase) return []
  const { data, error } = await supabase.rpc('get_public_streams')
  if (error) throw new Error(`Could not load live streams: ${error.message}`)
  return (data ?? []) as PublicStream[]
}

export async function listPublicRecordings(): Promise<PublicRecording[]> {
  if (!supabase) return []
  const { data, error } = await supabase.rpc('get_public_recordings')
  if (error) throw new Error(`Could not load published recordings: ${error.message}`)
  return (data ?? []) as PublicRecording[]
}

export async function requestPublicStreamGrant(sessionId: string): Promise<PublicStreamGrant> {
  if (!supabase) throw new Error('Public stream access is unavailable.')
  const { data, error } = await supabase.functions.invoke<PublicStreamGrant>('public-stream-token', {
    body: { sessionId },
  })
  if (error) throw new Error(error.message)
  if (!data || data.channel !== sessionId || !data.appId || !data.uid || !data.token || !Number.isFinite(data.expiresIn)) {
    throw new Error('The streaming service returned an invalid viewing grant.')
  }
  return data
}

export async function requestPublicRecordingUrl(recordingId: string): Promise<{
  signedUrl: string
  expiresIn: number
  preview: boolean
}> {
  if (!supabase) throw new Error('Recording access is unavailable.')
  const { data, error } = await supabase.functions.invoke<{
    signedUrl: string
    expiresIn: number
    preview: boolean
  }>('public-recording-url', { body: { recordingId } })
  if (error) throw new Error(error.message)
  if (!data?.signedUrl || !Number.isFinite(data.expiresIn)) {
    throw new Error('The recording service returned an invalid viewing link.')
  }
  return data
}
