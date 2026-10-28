import { serve } from 'https://deno.land/std@0.168.0/http/server.ts'
import { createClient } from 'https://esm.sh/@supabase/supabase-js@2'

const allowedOrigins = (Deno.env.get('APP_ALLOWED_ORIGINS') ?? '')
  .split(',')
  .map((origin) => origin.trim())
  .filter(Boolean)

const plans: Record<string, { name: string; amount: string }> = {
  'live-learner': { name: 'Live Learner', amount: '49.99' },
  'personal-builder': { name: 'Personal Builder', amount: '99.99' },
  'app-support': { name: 'App Support', amount: '149.99' },
  'app-portfolio': { name: 'App Portfolio', amount: '249.99' },
}

function respond(body: Record<string, unknown>, status: number, origin: string | null) {
  const headers = new Headers({ 'Content-Type': 'application/json' })
  if (origin && allowedOrigins.includes(origin)) {
    headers.set('Access-Control-Allow-Origin', origin)
    headers.set('Vary', 'Origin')
  }
  return new Response(JSON.stringify(body), { status, headers })
}

function paypalBaseUrl() {
  return Deno.env.get('PAYPAL_ENVIRONMENT') === 'live'
    ? 'https://api-m.paypal.com'
    : 'https://api-m.sandbox.paypal.com'
}

async function getPayPalAccessToken() {
  const clientId = Deno.env.get('PAYPAL_CLIENT_ID')
  const clientSecret = Deno.env.get('PAYPAL_CLIENT_SECRET')
  if (!clientId || !clientSecret) throw new Error('PayPal checkout is not configured.')

  const response = await fetch(`${paypalBaseUrl()}/v1/oauth2/token`, {
    method: 'POST',
    headers: {
      Authorization: `Basic ${btoa(`${clientId}:${clientSecret}`)}`,
      'Content-Type': 'application/x-www-form-urlencoded',
    },
    body: 'grant_type=client_credentials',
  })
  const result = await response.json()
  if (!response.ok || typeof result.access_token !== 'string') {
    console.error('PayPal authentication failed.', result)
    throw new Error('Could not authenticate with PayPal.')
  }
  return result.access_token as string
}

async function paypalRequest<T>(path: string, token: string, init?: RequestInit): Promise<T> {
  const response = await fetch(`${paypalBaseUrl()}${path}`, {
    ...init,
    headers: {
      Authorization: `Bearer ${token}`,
      'Content-Type': 'application/json',
      ...(init?.headers ?? {}),
    },
  })
  const result = await response.json()
  if (!response.ok) {
    console.error(`PayPal request ${path} failed.`, result)
    throw new Error('PayPal could not complete this request.')
  }
  return result as T
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
  if (!supabaseUrl || !anonKey || !serviceRoleKey) {
    console.error('PayPal service is missing Supabase server configuration.')
    return respond({ error: 'PayPal checkout is not configured.' }, 503, origin)
  }

  try {
    const bearerToken = req.headers.get('Authorization')?.match(/^Bearer\s+(.+)$/i)?.[1]
    if (!bearerToken || bearerToken === anonKey) return respond({ error: 'Sign in with a student account to purchase access.' }, 401, origin)
    const authClient = createClient(supabaseUrl, anonKey, {
      global: { headers: { Authorization: `Bearer ${bearerToken}` } },
      auth: { persistSession: false, autoRefreshToken: false },
    })
    const { data: { user }, error: authError } = await authClient.auth.getUser(bearerToken)
    if (authError || !user) return respond({ error: 'Your sign-in session is invalid or expired.' }, 401, origin)

    const serviceClient = createClient(supabaseUrl, serviceRoleKey, {
      auth: { persistSession: false, autoRefreshToken: false },
    })
    const { data: profile, error: profileError } = await serviceClient
      .from('profiles')
      .select('role, account_status')
      .eq('id', user.id)
      .maybeSingle()
    if (profileError) throw new Error(`Could not verify the student account: ${profileError.message}`)
    if (profile?.role !== 'student' || profile.account_status !== 'active') {
      return respond({ error: 'An active student account is required to purchase access.' }, 403, origin)
    }

    const body = await req.json()
    if (body.action === 'create') {
      let productName: string
      let amount: string
      let customId: string
      if (body.product?.type === 'plan' && typeof body.product.planId === 'string' && plans[body.product.planId]) {
        const { data: activeEntitlement, error: entitlementError } = await serviceClient
          .from('student_plan_entitlements')
          .select('plan_id')
          .eq('user_id', user.id)
          .eq('status', 'active')
          .maybeSingle()
        if (entitlementError) throw new Error(`Could not check the current learning plan: ${entitlementError.message}`)
        if (activeEntitlement) {
          return respond({ error: `Your ${activeEntitlement.plan_id} plan is already active. Contact support before purchasing another plan.` }, 409, origin)
        }
        const plan = plans[body.product.planId]
        productName = plan.name
        amount = plan.amount
        customId = `plan|${user.id}|${body.product.planId}`
      } else if (body.product?.type === 'pass' && typeof body.product.sessionId === 'string') {
        const sessionId = body.product.sessionId
        if (!/^[0-9a-f]{8}-[0-9a-f]{4}-[1-8][0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$/i.test(sessionId)) {
          return respond({ error: 'A valid live class is required for a day pass.' }, 400, origin)
        }
        const { data: session, error: sessionError } = await serviceClient
          .from('class_sessions')
          .select('id, public_qa_enabled, public_stream_enabled, status')
          .eq('id', sessionId)
          .maybeSingle()
        if (sessionError) throw new Error(`Could not check class pass availability: ${sessionError.message}`)
        if (!session || !session.public_qa_enabled || !session.public_stream_enabled || !['scheduled', 'live', 'ended'].includes(session.status)) {
          return respond({ error: 'A 24-hour pass is not available for this class.' }, 400, origin)
        }
        if (session.status === 'ended') {
          const { data: recording, error: recordingError } = await serviceClient
            .from('recordings')
            .select('id')
            .eq('session_id', sessionId)
            .eq('status', 'ready')
            .not('published_at', 'is', null)
            .not('storage_path', 'is', null)
            .maybeSingle()
          if (recordingError) throw new Error(`Could not check class replay availability: ${recordingError.message}`)
          if (!recording) return respond({ error: 'A 24-hour pass is not available because this class has no published recording.' }, 400, origin)
        }
        productName = '24-hour class access pass'
        amount = '10.00'
        customId = `pass|${user.id}|${sessionId}`
      } else {
        return respond({ error: 'Choose a supported learning plan or class pass.' }, 400, origin)
      }

      const token = await getPayPalAccessToken()
      const order = await paypalRequest<{ id: string; links?: Array<{ rel: string; href: string }> }>('/v2/checkout/orders', token, {
        method: 'POST',
        headers: { 'PayPal-Request-Id': crypto.randomUUID() },
        body: JSON.stringify({
          intent: 'CAPTURE',
          purchase_units: [{
            custom_id: customId,
            description: productName,
            amount: { currency_code: 'USD', value: amount },
          }],
          application_context: {
            brand_name: 'Mai Corp App Class',
            user_action: 'PAY_NOW',
            return_url: `${origin}/paypal/return`,
            cancel_url: `${origin}/pricing?checkout=cancelled`,
          },
        }),
      })
      const approvalUrl = order.links?.find((link) => link.rel === 'approve')?.href
      if (!order.id || !approvalUrl) throw new Error('PayPal did not provide an approval link.')
      return respond({ orderId: order.id, approvalUrl }, 200, origin)
    }

    if (body.action !== 'capture' || typeof body.orderId !== 'string' || !/^[A-Z0-9-]{10,40}$/i.test(body.orderId)) {
      return respond({ error: 'A valid PayPal order is required.' }, 400, origin)
    }
    const token = await getPayPalAccessToken()
    type PayPalOrder = {
      id?: string
      status?: string
      purchase_units?: Array<{
        custom_id?: string
        amount?: { currency_code?: string; value?: string }
        payments?: { captures?: Array<{ id?: string; status?: string; amount?: { currency_code?: string; value?: string } }> }
      }>
    }
    let order = await paypalRequest<PayPalOrder>(`/v2/checkout/orders/${encodeURIComponent(body.orderId)}`, token)
    if (order.status !== 'COMPLETED') {
      order = await paypalRequest<PayPalOrder>(`/v2/checkout/orders/${encodeURIComponent(body.orderId)}/capture`, token, {
        method: 'POST',
        headers: { 'PayPal-Request-Id': `capture-${body.orderId}` },
        body: '{}',
      })
    }

    const purchaseUnit = order.purchase_units?.[0]
    const capture = purchaseUnit?.payments?.captures?.[0]
    const customId = purchaseUnit?.custom_id?.split('|') ?? []
    const expectedAmount = customId[0] === 'plan' ? plans[customId[2]]?.amount : customId[0] === 'pass' ? '10.00' : null
    if (
      order.id !== body.orderId
      || order.status !== 'COMPLETED'
      || !capture?.id
      || capture.status !== 'COMPLETED'
      || capture.amount?.currency_code !== 'USD'
      || capture.amount.value !== expectedAmount
      || customId.length !== 3
      || customId[1] !== user.id
    ) {
      return respond({ error: 'The PayPal payment could not be verified for this account.' }, 402, origin)
    }

    if (customId[0] === 'plan') {
      const { error } = await serviceClient.rpc('record_verified_plan_purchase', {
        target_user_id: user.id,
        purchased_plan_id: customId[2],
        verified_provider: 'paypal',
        verified_transaction_id: capture.id,
      })
      if (error) throw new Error(`Payment was verified, but plan activation failed: ${error.message}`)
      return respond({ status: 'completed', product: 'plan', planId: customId[2] }, 200, origin)
    }

    if (customId[0] === 'pass') {
      const { error } = await serviceClient.rpc('grant_public_qa_pass', {
        target_session_id: customId[2],
        target_user_id: user.id,
        verified_payment_provider: 'paypal',
        verified_payment_reference: capture.id,
        verified_amount_cents: 1000,
      })
      if (error) throw new Error(`Payment was verified, but the class pass could not be activated: ${error.message}`)
      return respond({ status: 'completed', product: 'pass', sessionId: customId[2] }, 200, origin)
    }

    return respond({ error: 'This PayPal purchase type is not supported.' }, 400, origin)
  } catch (cause) {
    console.error('PayPal checkout request failed.', cause)
    return respond({ error: cause instanceof Error ? cause.message : 'Could not complete the PayPal request.' }, 500, origin)
  }
})
