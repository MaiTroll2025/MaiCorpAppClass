import { useEffect, useState, type FormEvent } from 'react'
import {
  Link,
  NavLink,
  Route,
  Routes,
  useLocation,
  useNavigate,
} from 'react-router-dom'
import { useAuth } from './auth/useAuth'
import { isSupabaseConfigured, supabase } from './lib/supabase'
import { AboutPage } from './pages/AboutPage'
import { ClassListPage } from './pages/ClassesPage'
import { ClassroomPage } from './pages/ClassroomPage'
import { CoursePage, CoursesPage } from './pages/CoursesPage'
import { HowItWorksPage } from './pages/HowItWorksPage'
import { HomePage } from './pages/LandingPage'
import { PricingPage } from './pages/PricingPage'
import { RecordedLessonsPage } from './pages/RecordedLessonsPage'
import { DeveloperSetupPage } from './pages/DeveloperSetupPage'
import { DashboardPage } from './pages/DashboardPage'
import { CourseEditor } from './pages/admin/CourseEditor'
import { AdminStreamSetupPage } from './pages/AdminStreamSetupPage'
import { PublicStreamViewerPage } from './pages/PublicStreamViewerPage'
import { PublicRecordingViewerPage } from './pages/PublicRecordingViewerPage'
import { PayPalReturnPage } from './pages/PayPalCheckout'
import './App.css'

const navigation = [
  { label: 'Explore classes', to: '/classes' },
  { label: 'Courses', to: '/courses' },
  { label: 'Recorded lessons', to: '/library' },
  { label: 'How it works', to: '/how-it-works' },
  { label: 'Build with VS Code', to: '/developer-setup' },
  { label: 'Pricing', to: '/pricing' },
  { label: 'About', to: '/about' },
]
const currentYear = new Date().getFullYear()

function Header() {
  const { user, signOut } = useAuth()
  const [menuOpen, setMenuOpen] = useState(false)
  const [signOutError, setSignOutError] = useState('')

  async function handleSignOut() {
    setSignOutError('')
    try {
      await signOut()
      setMenuOpen(false)
    } catch (error) {
      setSignOutError(error instanceof Error ? error.message : 'Sign out failed.')
    }
  }

  return (
    <header className="site-header">
      <div className="header-inner">
        <Link className="brand" to="/" aria-label="Mai Corp App Class home">
          <span className="brand-mark" aria-hidden="true">
            m.
          </span>
          <span>
            <strong>mai corp</strong>
            <small>APP CLASS</small>
          </span>
        </Link>
        <button
          aria-expanded={menuOpen}
          aria-label={menuOpen ? 'Close navigation menu' : 'Open navigation menu'}
          className="menu-toggle"
          onClick={() => setMenuOpen((open) => !open)}
          type="button"
        >
          <span />
          <span />
        </button>
        <nav className={menuOpen ? 'main-nav is-open' : 'main-nav'} aria-label="Main navigation">
          {navigation.map((item) => (
            <NavLink
              key={item.to}
              onClick={() => setMenuOpen(false)}
              to={item.to}
              className={({ isActive }) => (isActive ? 'nav-link active' : 'nav-link')}
            >
              {item.label}
            </NavLink>
          ))}
          <div className="nav-actions">
            {user ? (
              <>
                <Link className="nav-link" onClick={() => setMenuOpen(false)} to="/learn">
                  Dashboard
                </Link>
                <button className="button button-outline button-small" onClick={handleSignOut} type="button">
                  Sign out
                </button>
              </>
            ) : (
              <>
                <Link className="nav-link sign-in-link" onClick={() => setMenuOpen(false)} to="/sign-in">
                  Sign in
                </Link>
                <Link className="button button-dark button-small" onClick={() => setMenuOpen(false)} to="/sign-up">
                  Get started <span aria-hidden="true">↗</span>
                </Link>
              </>
            )}
          </div>
        </nav>
      </div>
      {signOutError && <p className="header-error" role="alert">{signOutError}</p>}
    </header>
  )
}

function Footer() {
  return (
    <footer className="site-footer">
      <div className="footer-main">
        <div className="footer-brand">
          <Link className="brand" to="/">
            <span className="brand-mark" aria-hidden="true">m.</span>
            <span><strong>mai corp</strong><small>APP CLASS</small></span>
          </Link>
          <p>Learn to build what’s next.<br />Practical software education, made accessible.</p>
        </div>
        <div className="footer-links">
          <div><strong>Explore</strong><Link to="/courses">Courses</Link><Link to="/classes">Live classes</Link><Link to="/library">Recorded lessons</Link><Link to="/developer-setup">Build with VS Code</Link></div>
          <div><strong>Mai Corp</strong><Link to="/about">About</Link><Link to="/how-it-works">How it works</Link><Link to="/pricing">Pricing</Link></div>
          <div><strong>Your account</strong><Link to="/sign-in">Sign in</Link><Link to="/sign-up">Get started</Link></div>
        </div>
      </div>
      <div className="footer-bottom"><span>© {currentYear} Mai Corp App Class</span><span>Build skills. Build boldly.</span></div>
    </footer>
  )
}

function Layout() {
  return <><Header /><main><Routes>
    <Route path="/" element={<HomePage />} />
    <Route path="/courses" element={<CoursesPage />} />
    <Route path="/courses/:slug" element={<CoursePage />} />
    <Route path="/classes" element={<ClassListPage />} />
    <Route path="/classroom/:sessionId" element={<ClassroomPage />} />
    <Route path="/watch/:sessionId" element={<PublicStreamViewerPage />} />
    <Route path="/watch/recording/:recordingId" element={<PublicRecordingViewerPage />} />
    <Route path="/paypal/return" element={<PayPalReturnPage />} />
    <Route path="/library" element={<RecordedLessonsPage />} />
    <Route path="/how-it-works" element={<HowItWorksPage />} />
    <Route path="/developer-setup" element={<DeveloperSetupPage />} />
    <Route path="/pricing" element={<PricingPage />} />
    <Route path="/about" element={<AboutPage />} />
    <Route path="/sign-in" element={<AuthPage mode="sign-in" />} />
    <Route path="/sign-up" element={<AuthPage mode="sign-up" />} />
    <Route path="/learn" element={<DashboardPage />} />
    <Route path="/admin" element={<DashboardPage />} />
    <Route path="/admin/course-editor" element={<CourseEditor />} />
    <Route path="/admin/streams/setup" element={<AdminStreamSetupPage />} />
    <Route path="/admin/streams/:sessionId" element={<ClassroomPage />} />
    <Route path="*" element={<NotFoundPage />} />
  </Routes></main><Footer /></>
}

function App() {
  return <Layout />
}

function AuthPage({ mode }: { mode: 'sign-in' | 'sign-up' }) {
  const navigate = useNavigate()
  const location = useLocation()
  const { user } = useAuth()
  const requestedReturnTo = (location.state as { returnTo?: unknown } | null)?.returnTo
  const returnTo = typeof requestedReturnTo === 'string'
    && requestedReturnTo.startsWith('/')
    && !requestedReturnTo.startsWith('//')
    ? requestedReturnTo
    : '/learn'
  const [email, setEmail] = useState('')
  const [password, setPassword] = useState('')
  const [displayName, setDisplayName] = useState('')
  const [busy, setBusy] = useState(false)
  const [error, setError] = useState('')
  const [message, setMessage] = useState('')
  const isSignUp = mode === 'sign-up'

  useEffect(() => {
    if (user) navigate(returnTo, { replace: true })
  }, [navigate, returnTo, user])

  async function handleSubmit(event: FormEvent<HTMLFormElement>) {
    event.preventDefault()
    setError('')
    setMessage('')
    if (!supabase) {
      setError('Account access is not available yet. Configure Supabase to enable sign in and registration.')
      return
    }
    setBusy(true)
    try {
      if (isSignUp) {
        const { data, error: authError } = await supabase.auth.signUp({
          email: email.trim(),
          password,
          options: { data: { display_name: displayName.trim() } },
        })
        if (authError) throw authError
        if (!data.session) {
          setMessage('Check your email for a verification link to finish creating your account.')
          return
        }
        navigate('/learn', { replace: true })
      } else {
        const { error: authError } = await supabase.auth.signInWithPassword({ email: email.trim(), password })
        if (authError) throw authError
        navigate('/learn', { replace: true })
      }
    } catch (cause) {
      setError(cause instanceof Error ? cause.message : 'We couldn’t complete that request. Please try again.')
    } finally {
      setBusy(false)
    }
  }

  async function handlePasswordReset() {
    setError('')
    setMessage('')
    if (!supabase) {
      setError('Password recovery is not available until Supabase is configured.')
      return
    }
    if (!email.trim()) {
      setError('Enter your email address above, then choose “Reset password”.')
      return
    }
    setBusy(true)
    try {
      const { error: resetError } = await supabase.auth.resetPasswordForEmail(email.trim(), { redirectTo: `${window.location.origin}/sign-in` })
      if (resetError) throw resetError
      setMessage('If an account exists for that address, a password reset email is on its way.')
    } catch (cause) {
      setError(cause instanceof Error ? cause.message : 'We couldn’t send a reset email.')
    } finally {
      setBusy(false)
    }
  }

  return <div className="auth-page"><div className="auth-panel"><div className="auth-aside"><div className="eyebrow eyebrow-dark"><span className="eyebrow-dot" /> YOUR NEXT CHAPTER</div><h1>{isSignUp ? 'A new skill can change everything.' : 'Good to have you back.'}</h1><p>{isSignUp ? 'Create your account and find your first hands-on class.' : 'Pick up where you left off and keep making progress.'}</p><span className="auth-aside-mark" aria-hidden="true">m.</span></div><div className="auth-form-wrap"><Link className="back-link" to="/">← Back to home</Link><h2>{isSignUp ? 'Create your account' : 'Sign in'}</h2><p className="auth-subtitle">{isSignUp ? 'Start learning at your own pace.' : 'Enter your details to continue learning.'}</p>{!isSupabaseConfigured && <div className="inline-callout">Authentication will be available when the Supabase project is configured.</div>}<form className="auth-form" onSubmit={handleSubmit}>{isSignUp && <label>Your name<input autoComplete="name" onChange={(event) => setDisplayName(event.target.value)} required value={displayName} /></label>}<label>Email address<input autoComplete="email" onChange={(event) => setEmail(event.target.value)} required type="email" value={email} /></label><label>Password<input autoComplete={isSignUp ? 'new-password' : 'current-password'} minLength={8} onChange={(event) => setPassword(event.target.value)} required type="password" value={password} /></label>{!isSignUp && <button className="reset-link" disabled={busy} onClick={handlePasswordReset} type="button">Reset password</button>}{error && <p className="form-message form-error" role="alert">{error}</p>}{message && <p className="form-message form-success" role="status">{message}</p>}<button className="button button-dark button-full" disabled={busy} type="submit">{busy ? 'Please wait…' : isSignUp ? 'Create account' : 'Sign in'} <span aria-hidden="true">↗</span></button></form><p className="auth-switch">{isSignUp ? 'Already have an account?' : 'New to Mai Corp App Class?'} <Link to={isSignUp ? '/sign-in' : '/sign-up'}>{isSignUp ? 'Sign in' : 'Get started'}</Link></p></div></div></div>
}

function NotFoundPage() {
  return <div className="section page-state"><div className="eyebrow"><span className="eyebrow-dot" /> LOST YOUR PLACE?</div><h1>Let’s get you<br />back to <span>building.</span></h1><p>That page isn’t here, but your next idea still is.</p><Link className="button button-dark" to="/">Go home <span aria-hidden="true">↗</span></Link></div>
}

export default App
