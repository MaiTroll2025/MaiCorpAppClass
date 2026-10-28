import { supabase } from './supabase'

export interface ClassroomRtcToken {
  appId: string
  channel: string
  uid: string
  token: string
  expiresIn: number
  canPublishAudio: boolean
  canPublishVideo: boolean
  screenShare: boolean
}

export async function requestClassroomRtcToken(
  sessionId: string,
  screenShare = false,
): Promise<ClassroomRtcToken> {
  if (!supabase) throw new Error('Supabase is not configured.')
  const { data, error } = await supabase.functions.invoke<ClassroomRtcToken>('agora-token', {
    body: { sessionId, screenShare },
  })
  if (error) {
    throw new Error(`Could not authorize the live classroom connection: ${error.message}`)
  }
  if (
    !data
    || data.channel !== sessionId
    || !data.appId
    || !data.uid
    || !data.token
    || data.screenShare !== screenShare
  ) {
    throw new Error('The live classroom service returned an invalid connection grant.')
  }
  return data
}
