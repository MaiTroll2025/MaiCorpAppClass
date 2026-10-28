import { serve } from 'https://deno.land/std@0.168.0/http/server.ts'
import { createClient } from 'https://esm.sh/@supabase/supabase-js@2'

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

  const supabaseUrl = Deno.env.get('SUPABASE_URL')
  const anonKey = Deno.env.get('SUPABASE_ANON_KEY')
  const serviceRoleKey = Deno.env.get('SUPABASE_SERVICE_ROLE_KEY')
  const previewSecret = Deno.env.get('STREAM_PREVIEW_HMAC_SECRET')
  if (!supabaseUrl || !anonKey || !serviceRoleKey || !previewSecret) {
    console.error('Public recording service is missing required server configuration.')
    return respond({ error: 'Recording access is not configured.' }, 503, origin)
  }

  try {
    const body = await req.json()
    const recordingId = typeof body.recordingId === 'string' ? body.recordingId : ''
    if (!/^[0-9a-f]{8}-[0-9a-f]{4}-[1-8][0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$/i.test(recordingId)) {
      return respond({ error: 'A valid published recording is required.' }, 400, origin)
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

    const { data: recording, error: recordingError } = await serviceClient
      .from('recordings')
      .select('session_id, storage_path, status, published_at')
      .eq('id', recordingId)
      .maybeSingle()
    if (recordingError) throw new Error(`Could not load recording details: ${recordingError.message}`)
    if (!recording || recording.status !== 'ready' || !recording.published_at || !recording.storage_path) {
      return respond({ error: 'This recording is not available.' }, 404, origin)
    }

    let entitled = false
    if (userId) {
      const { data, error } = await serviceClient.rpc('can_watch_public_recording', {
        target_recording_id: recordingId,
        target_user_id: userId,
      })
      if (error) throw new Error(`Could not verify recording access: ${error.message}`)
      entitled = Boolean(data)
    }

    let preview = false
    let expiresIn = 3600
    if (!entitled) {
      const forwardedFor = req.headers.get('x-forwarded-for')?.split(',').pop()?.trim()
      const visitorIp = req.headers.get('cf-connecting-ip')?.trim() || forwardedFor
      if (!visitorIp) return respond({ error: 'Sign in with an eligible plan or pass to watch this recording.' }, 403, origin)
      const visitorHash = await hashVisitorIp(visitorIp, previewSecret)
      const { data: startedAt, error: previewError } = await serviceClient.rpc('begin_public_media_preview', {
        target_media_type: 'recording',
        target_media_id: recordingId,
        visitor_ip_hash: visitorHash,
      })
      if (previewError) return respond({ error: 'The free preview for this recording has already been used. Sign in with an eligible plan or day pass.' }, 402, origin)

      const remainingSeconds = Math.ceil((Date.parse(startedAt) + 30_000 - Date.now()) / 1000)
      if (!Number.isFinite(remainingSeconds) || remainingSeconds <= 0) {
        return respond({ error: 'The free preview for this recording has ended. Sign in with an eligible plan or day pass.' }, 402, origin)
      }
      expiresIn = remainingSeconds
      preview = true
    }

    const { data: signed, error: signedError } = await serviceClient.storage
      .from('class-recordings')
      .createSignedUrl(recording.storage_path, expiresIn)
    if (signedError || !signed?.signedUrl) throw new Error(`Could not create a secure recording link: ${signedError?.message ?? 'No URL returned.'}`)

    return respond({ signedUrl: signed.signedUrl, expiresIn, preview }, 200, origin)
  } catch (cause) {
    console.error('Public recording request failed.', cause)
    return respond({ error: cause instanceof Error ? cause.message : 'Could not authorize this recording.' }, 500, origin)
  }
})
