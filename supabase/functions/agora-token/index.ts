import { serve } from 'https://deno.land/std@0.168.0/http/server.ts'
import { createClient } from 'https://esm.sh/@supabase/supabase-js@2'
import { RtcTokenBuilder } from 'https://esm.sh/agora-token@2.0.7?target=deno'

const allowedOrigins = (Deno.env.get('APP_ALLOWED_ORIGINS') ?? '')
  .split(',')
  .map((origin) => origin.trim())
  .filter(Boolean)

function respond(body: Record<string, unknown>, status: number, origin: string | null) {
  const headers = new Headers({ 'Content-Type': 'application/json' })
  if (origin && allowedOrigins.includes(origin)) {
    headers.set('Access-Control-Allow-Origin', origin)
    headers.set('Vary', 'Origin')
  }
  return new Response(JSON.stringify(body), { status, headers })
}

serve(async (req) => {
  const origin = req.headers.get('Origin')
  if (req.method === 'OPTIONS') {
    if (!origin || !allowedOrigins.includes(origin)) {
      return respond({ error: 'This origin is not allowed.' }, 403, null)
    }
    return new Response(null, {
      status: 204,
      headers: {
        'Access-Control-Allow-Origin': origin,
        'Access-Control-Allow-Headers': 'authorization, x-client-info, apikey, content-type',
        'Access-Control-Allow-Methods': 'POST, OPTIONS',
        'Vary': 'Origin',
      },
    })
  }
  if (req.method !== 'POST') return respond({ error: 'Method not allowed.' }, 405, origin)
  if (!origin || !allowedOrigins.includes(origin)) {
    return respond({ error: 'This origin is not allowed.' }, 403, null)
  }

  const authorization = req.headers.get('Authorization')
  const bearerToken = authorization?.match(/^Bearer\s+(.+)$/i)?.[1]
  if (!bearerToken) return respond({ error: 'Sign in to enter this classroom.' }, 401, origin)

  const appId = Deno.env.get('AGORA_APP_ID')
  const appCertificate = Deno.env.get('AGORA_APP_CERTIFICATE')
  const supabaseUrl = Deno.env.get('SUPABASE_URL')
  const supabaseAnonKey = Deno.env.get('SUPABASE_ANON_KEY')
  if (!appId || !appCertificate || !supabaseUrl || !supabaseAnonKey || allowedOrigins.length === 0) {
    console.error('Agora token service is missing required server configuration.')
    return respond({ error: 'Live classroom service is not configured.' }, 503, origin)
  }

  try {
    const body = await req.json()
    const sessionId = typeof body.sessionId === 'string' ? body.sessionId : ''
    const screenShare = body.screenShare === true
    if (!/^[0-9a-f]{8}-[0-9a-f]{4}-[1-8][0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$/i.test(sessionId)) {
      return respond({ error: 'A valid classroom session is required.' }, 400, origin)
    }

    const supabase = createClient(supabaseUrl, supabaseAnonKey, {
      global: { headers: { Authorization: `Bearer ${bearerToken}` } },
      auth: { persistSession: false, autoRefreshToken: false },
    })
    const { data: { user }, error: authError } = await supabase.auth.getUser(bearerToken)
    if (authError || !user) return respond({ error: 'Your sign-in session is invalid or expired.' }, 401, origin)

    const { data: authorizationData, error: authorizationError } = await supabase.rpc(
      'authorize_classroom_join',
      { target_session_id: sessionId, request_screen_share: screenShare },
    )
    if (authorizationError || !authorizationData) {
      console.warn('Classroom token authorization was denied.', authorizationError?.message)
      return respond({ error: authorizationError?.message ?? 'You are not authorized to join this classroom.' }, 403, origin)
    }

    const authz = authorizationData as {
      session_id?: string
      user_id?: string
      can_publish_audio?: boolean
      can_publish_video?: boolean
      expires_in_seconds?: number
      screen_share?: boolean
    }
    if (
      authz.session_id !== sessionId
      || authz.user_id !== user.id
      || authz.screen_share !== screenShare
      || authz.can_publish_video !== true
      || typeof authz.expires_in_seconds !== 'number'
    ) {
      return respond({ error: 'Classroom authorization could not be verified.' }, 403, origin)
    }

    const expiresIn = Math.min(Math.max(authz.expires_in_seconds, 60), 900)
    const rtcAccount = screenShare ? `screen:${user.id}` : user.id
    const token = RtcTokenBuilder.BuildTokenWithUserAccountAndPrivilege(
      appId,
      appCertificate,
      sessionId,
      rtcAccount,
      expiresIn,
      expiresIn,
      screenShare || authz.can_publish_audio !== true ? 0 : expiresIn,
      expiresIn,
      0,
    )

    return respond({
      appId,
      channel: sessionId,
      uid: rtcAccount,
      token,
      expiresIn,
      canPublishAudio: !screenShare && authz.can_publish_audio === true,
      canPublishVideo: authz.can_publish_video === true,
      screenShare,
    }, 200, origin)
  } catch (error) {
    console.error('Agora token request failed.', error)
    return respond({ error: 'Could not authorize the classroom connection.' }, 500, origin)
  }
})
