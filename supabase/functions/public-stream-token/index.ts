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

async function hashVisitorIp(ip: string, secret: string) {
  const encoder = new TextEncoder()
  const key = await crypto.subtle.importKey('raw', encoder.encode(secret), { name: 'HMAC', hash: 'SHA-256' }, false, ['sign'])
  const signature = await crypto.subtle.sign('HMAC', key, encoder.encode(ip))
  return Array.from(new Uint8Array(signature), (byte) => byte.toString(16).padStart(2, '0')).join('')
}

serve(async (req) => {
  const origin = req.headers.get('Origin')
  if (req.method === 'OPTIONS') {
    if (!origin || !allowedOrigins.includes(origin)) return respond({ error: 'This origin is not allowed.' }, 403, null)
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
  if (!origin || !allowedOrigins.includes(origin)) return respond({ error: 'This origin is not allowed.' }, 403, null)

  const appId = Deno.env.get('AGORA_APP_ID')
  const appCertificate = Deno.env.get('AGORA_APP_CERTIFICATE')
  const supabaseUrl = Deno.env.get('SUPABASE_URL')
  const anonKey = Deno.env.get('SUPABASE_ANON_KEY')
  const serviceRoleKey = Deno.env.get('SUPABASE_SERVICE_ROLE_KEY')
  const previewSecret = Deno.env.get('STREAM_PREVIEW_HMAC_SECRET')
  if (!appId || !appCertificate || !supabaseUrl || !anonKey || !serviceRoleKey || !previewSecret) {
    console.error('Public stream token service is missing required server configuration.')
    return respond({ error: 'Public stream access is not configured.' }, 503, origin)
  }

  try {
    const body = await req.json()
    const sessionId = typeof body.sessionId === 'string' ? body.sessionId : ''
    if (!/^[0-9a-f]{8}-[0-9a-f]{4}-[1-8][0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$/i.test(sessionId)) {
      return respond({ error: 'A valid live stream is required.' }, 400, origin)
    }

    const serviceClient = createClient(supabaseUrl, serviceRoleKey, {
      auth: { persistSession: false, autoRefreshToken: false },
    })
    let userId: string | null = null
    const bearerToken = req.headers.get('Authorization')?.match(/^Bearer\s+(.+)$/i)?.[1]
    if (bearerToken && bearerToken !== anonKey) {
      const authClient = createClient(supabaseUrl, anonKey, {
        global: { headers: { Authorization: `Bearer ${bearerToken}` } },
        auth: { persistSession: false, autoRefreshToken: false },
      })
      const { data: { user }, error: authError } = await authClient.auth.getUser(bearerToken)
      if (authError || !user) return respond({ error: 'Your sign-in session is invalid or expired.' }, 401, origin)
      userId = user.id
    }

    let entitled = false
    if (userId) {
      const { data, error } = await serviceClient.rpc('can_watch_public_stream', {
        target_session_id: sessionId,
        target_user_id: userId,
      })
      if (error) throw new Error(`Could not verify stream access: ${error.message}`)
      entitled = Boolean(data)
    }

    let preview = false
    let expiresIn = 900
    if (!entitled) {
      const forwardedFor = req.headers.get('x-forwarded-for')?.split(',').pop()?.trim()
      const visitorIp = req.headers.get('cf-connecting-ip')?.trim() || forwardedFor
      if (!visitorIp) return respond({ error: 'A secure preview could not be established. Sign in with an eligible plan or pass.' }, 403, origin)
      const visitorHash = await hashVisitorIp(visitorIp, previewSecret)
      const { data: startedAt, error: previewError } = await serviceClient.rpc('begin_public_media_preview', {
        target_media_type: 'stream',
        target_media_id: sessionId,
        visitor_ip_hash: visitorHash,
      })
      if (previewError) return respond({ error: 'The free preview for this stream has already been used. Sign in to watch with an eligible plan or day pass.' }, 402, origin)

      const remainingSeconds = Math.ceil((Date.parse(startedAt) + 30_000 - Date.now()) / 1000)
      if (!Number.isFinite(remainingSeconds) || remainingSeconds <= 0) {
        return respond({ error: 'The free preview for this stream has ended. Sign in to watch with an eligible plan or day pass.' }, 402, origin)
      }
      expiresIn = Math.min(900, remainingSeconds)
      preview = true
    }

    const guestUid = userId ? `viewer:${userId}` : `guest:${crypto.randomUUID()}`
    const token = RtcTokenBuilder.BuildTokenWithUserAccountAndPrivilege(
      appId,
      appCertificate,
      sessionId,
      guestUid,
      expiresIn,
      expiresIn,
      0,
      0,
      0,
    )
    return respond({ appId, channel: sessionId, uid: guestUid, token, expiresIn, preview }, 200, origin)
  } catch (cause) {
    console.error('Public stream token request failed.', cause)
    return respond({ error: cause instanceof Error ? cause.message : 'Could not authorize the live stream.' }, 500, origin)
  }
})
