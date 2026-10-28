import { useEffect, useRef, useState } from 'react'
import { Link, useLocation, useSearchParams } from 'react-router-dom'
import { useAuth } from '../auth/useAuth'
import { supabase } from '../lib/supabase'

export type PayPalProduct =
  | { type: 'plan'; planId: string }
  | { type: 'pass'; sessionId: string }

export function PayPalCheckoutButton({
  product,
  label,
  className = 'button button-dark',
}: {
  product: PayPalProduct
  label: string
  className?: string
}) {
  const { user } = useAuth()
  const location = useLocation()
  const [busy, setBusy] = useState(false)
  const [error, setError] = useState('')

  async function beginCheckout() {
    if (busy) return
    if (!supabase) {
      setError('Payment checkout is not configured.')
      return
    }
    setBusy(true)
    setError('')
    try {
      const { data, error: invokeError } = await supabase.functions.invoke<{ approvalUrl: string }>('paypal-checkout', {
        body: { action: 'create', product },
      })
      if (invokeError) throw new Error(invokeError.message)
      const approvalUrl = data?.approvalUrl ? new URL(data.approvalUrl) : null
      if (
        !approvalUrl
        || approvalUrl.protocol !== 'https:'
        || !['www.paypal.com', 'www.sandbox.paypal.com'].includes(approvalUrl.hostname)
        || !approvalUrl.pathname.startsWith('/checkoutnow')
      ) {
        throw new Error('PayPal did not return a valid approval page.')
      }
      window.location.assign(approvalUrl.toString())
    } catch (cause) {
      setError(cause instanceof Error ? cause.message : 'Could not start PayPal checkout.')
      setBusy(false)
    }
  }

  if (!user) {
    return <div className="paypal-checkout-action">
      <Link className={className} state={{ returnTo: `${location.pathname}${location.search}` }} to="/sign-in">Sign in to purchase</Link>
      <p className="pricing-card-footnote">Purchases require an active student account.</p>
    </div>
  }

  return <div className="paypal-checkout-action">
    <button className={className} disabled={busy} onClick={() => void beginCheckout()} type="button">
      {busy ? 'Opening PayPal…' : label}
    </button>
    {error && <p className="form-message form-error" role="alert">{error}</p>}
  </div>
}

export function PayPalReturnPage() {
  const { user, loading } = useAuth()
  const location = useLocation()
  const [searchParams] = useSearchParams()
  const orderId = searchParams.get('token')
  const [state, setState] = useState<'busy' | 'done' | 'error'>('busy')
  const [message, setMessage] = useState('')
  const [destination, setDestination] = useState('/learn')
  const captureStarted = useRef(false)

  useEffect(() => {
    if (loading || !user || !orderId || !supabase || captureStarted.current) return
    captureStarted.current = true
    void supabase.functions.invoke<{
      status: string
      product: 'plan' | 'pass'
      sessionId?: string
    }>('paypal-checkout', { body: { action: 'capture', orderId } })
      .then(({ data, error }) => {
        if (error) throw new Error(error.message)
        if (data?.status !== 'completed') throw new Error('PayPal payment was not completed.')
        setDestination(data.product === 'pass' && data.sessionId ? `/watch/${data.sessionId}` : '/learn')
        setMessage(data.product === 'pass' ? 'Your 24-hour live class pass is active.' : 'Your plan purchase is confirmed and access is active.')
        setState('done')
      })
      .catch((cause: unknown) => {
        setMessage(cause instanceof Error ? cause.message : 'Could not verify the PayPal payment.')
        setState('error')
      })
  }, [loading, orderId, user])

  const returnError = !loading && !user
    ? 'Sign in with the purchasing student account to verify this payment.'
    : !loading && !orderId
      ? 'PayPal did not return an order reference.'
      : !supabase
        ? 'Payment checkout is not configured.'
        : ''
  const visibleState = loading ? 'waiting' : returnError ? 'error' : state
  return <div className="page-shell page-state paypal-return-page">
    <div className="eyebrow"><span className="eyebrow-dot" /> PAYPAL CHECKOUT</div>
    <h1>{visibleState === 'done' ? 'Payment confirmed.' : visibleState === 'error' ? 'Payment needs attention.' : 'Verifying your payment.'}</h1>
    {visibleState === 'busy' || visibleState === 'waiting' ? <p role="status">Confirming the payment directly with PayPal…</p> : <p className={visibleState === 'error' ? 'form-message form-error' : 'form-message form-success'} role={visibleState === 'error' ? 'alert' : 'status'}>{returnError || message}</p>}
    {visibleState === 'done' && <Link className="button button-dark" to={destination}>Continue</Link>}
    {visibleState === 'error' && !user && <Link className="button button-dark" state={{ returnTo: `${location.pathname}${location.search}` }} to="/sign-in">Sign in to verify payment</Link>}
    {visibleState === 'error' && <Link className="button button-outline" to="/pricing">Return to pricing</Link>}
  </div>
}
