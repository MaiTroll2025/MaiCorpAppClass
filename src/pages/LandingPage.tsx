import { useEffect, useState } from 'react'
import { Link } from 'react-router-dom'
import type { CourseSummary } from '../lib/courses'
import { listPublishedCourses } from '../lib/courses'
import { isSupabaseConfigured } from '../lib/supabase'
import { getPublicLaunchStats, type PublicLaunchStats } from '../lib/launch'
import { CourseCard } from './CoursesPage'
import { PublicRecordingHighlights, PublicStreamHighlights } from './PublicMediaLibrary'
import { EmptyState, SectionHeading, SetupNotice, Step } from './Shared'

export function HomePage() {
  return (
    <>
      <section className="hero-section">
        <div className="hero-grid">
          <div className="hero-copy">
            <div className="eyebrow"><span className="eyebrow-dot" /> YOUR NEXT SKILL STARTS HERE</div>
            <h1>Build the skills<br />to <span>build the future.</span></h1>
            <p className="hero-description">Learn to create websites, apps, and software with practical classes led by people who build them.</p>
            <div className="hero-actions">
              <Link className="button button-lime" to="/courses">Explore courses <span aria-hidden="true">↗</span></Link>
              <Link className="text-link" to="/how-it-works">See how it works <span aria-hidden="true">→</span></Link>
            </div>
            <div className="hero-proof"><span className="proof-star" aria-hidden="true">✳</span><span>Real projects. Clear lessons.<br /><strong>Your pace, your next step.</strong></span></div>
          </div>
          <div className="hero-art" aria-label="Abstract illustration of a software learning workspace" role="img">
            <div className="art-glow" />
            <div className="code-card">
              <div className="code-card-top"><span /><span /><span /><small>your-first-app.tsx</small></div>
              <div className="code-lines" aria-hidden="true">
                <div><i>01</i><b className="code-purple">const</b> <b className="code-blue">idea</b> = <b className="code-yellow">"something great"</b></div>
                <div><i>02</i></div>
                <div><i>03</i><b className="code-purple">function</b> <b className="code-green">buildIt</b>() {'{'}</div>
                <div><i>04</i>&nbsp;&nbsp;<b className="code-purple">return</b> <b className="code-blue">learn</b>() + <b className="code-blue">make</b>()</div>
                <div><i>05</i>{'}'}</div>
                <div><i>06</i></div>
                <div><i>07</i><b className="code-comment">// one lesson at a time</b></div>
              </div>
              <div className="terminal-line"><span>➜</span> Ready when you are<span className="cursor">_</span></div>
            </div>
            <div className="floating-badge badge-top"><span className="badge-icon">✦</span><span><b>Learn by making</b><small>Practical, not passive</small></span></div>
            <div className="floating-badge badge-bottom"><span className="badge-icon badge-icon-dark">↗</span><span><b>Start where you are</b><small>Beginner friendly</small></span></div>
            <div className="orbit orbit-one" /><div className="orbit orbit-two" />
          </div>
        </div>
        <div className="hero-bottom"><span>CURIOUS MINDS WELCOME</span><span className="scroll-cue">SCROLL TO EXPLORE <b aria-hidden="true">↓</b></span></div>
      </section>
      <section className="intro-strip">
        <p>Technology changes fast.<br /><strong>Your ability to learn is what lasts.</strong></p>
        <span className="intro-note">A more human way to get hands-on with software development.</span>
      </section>
      <LaunchTile />
      <PublicStreamHighlights />
      <PublicRecordingHighlights />
      <section className="section courses-preview">
        <SectionHeading eyebrow="FIND YOUR NEXT STEP" title="Learn something you can use." description="Explore practical classes designed to turn curiosity into real-world skills." action={<Link className="text-link" to="/courses">All courses <span aria-hidden="true">→</span></Link>} />
        <CourseHighlights />
      </section>
      <section className="how-section">
        <div className="section how-inner">
          <div className="how-intro"><div className="eyebrow eyebrow-dark"><span className="eyebrow-dot" /> SIMPLE BY DESIGN</div><h2>Small steps.<br />Real momentum.</h2><p>No gatekeeping. No jargon walls. Just clear guidance to help you keep making progress.</p><Link className="button button-dark" to="/how-it-works">How it works <span aria-hidden="true">↗</span></Link></div>
          <div className="step-list">
            <Step number="01" title="Choose what interests you" text="Explore topics and find a course that fits where you want to go." />
            <Step number="02" title="Learn with a builder" text="Follow focused lessons or join live classes to learn alongside others." />
            <Step number="03" title="Make something real" text="Practice as you go, build your confidence, and keep what you create." />
          </div>
        </div>
      </section>
      <section className="section promise-section">
        <div className="promise-card"><div className="promise-symbol" aria-hidden="true">✳</div><div><div className="eyebrow">GOOD LEARNING SHOULD FEEL POSSIBLE</div><h2>Expert guidance.<br />A more accessible path.</h2><p>We’re building a practical home for people who want to understand technology—not just use it. Clear instruction and real projects, without the unnecessary barriers.</p><Link className="text-link" to="/about">Meet Mai Corp App Class <span aria-hidden="true">→</span></Link></div><div className="promise-decoration" aria-hidden="true"><span>LEARN</span><span>MAKE</span><span>GROW</span></div></div>
      </section>
      <section className="cta-section"><div className="section cta-inner"><div><div className="eyebrow"><span className="eyebrow-dot" /> THE FIRST STEP IS YOURS</div><h2>Your next idea<br />is worth building.</h2></div><div><p>Find a course, meet a community of curious builders, and start learning by doing.</p><Link className="button button-lime" to="/courses">Find your first class <span aria-hidden="true">↗</span></Link></div></div></section>
    </>
  )
}

function LaunchTile() {
  const [stats, setStats] = useState<PublicLaunchStats | null>(null)
  const [error, setError] = useState('')
  const [now, setNow] = useState(Date.now())

  useEffect(() => {
    let active = true
    void getPublicLaunchStats()
      .then((result) => {
        if (active) setStats(result)
      })
      .catch((cause: unknown) => {
        if (active) setError(cause instanceof Error ? cause.message : 'Live launch information is unavailable.')
      })
    return () => { active = false }
  }, [])

  useEffect(() => {
    const timer = window.setInterval(() => setNow(Date.now()), 1000)
    return () => window.clearInterval(timer)
  }, [])

  const launchTime = stats?.launchAt ? new Date(stats.launchAt).getTime() : null
  const secondsRemaining = launchTime === null ? null : Math.max(0, Math.floor((launchTime - now) / 1000))
  const countdown = secondsRemaining === null ? null : {
    days: Math.floor(secondsRemaining / 86400),
    hours: Math.floor((secondsRemaining % 86400) / 3600),
    minutes: Math.floor((secondsRemaining % 3600) / 60),
    seconds: secondsRemaining % 60,
  }

  return (
    <section className="section launch-section" aria-labelledby="launch-title">
      <div className="launch-tile">
        <div className="launch-copy">
          <div className="eyebrow"><span className="eyebrow-dot" /> THE REAL LAUNCH STORY</div>
          <h2 id="launch-title">Be part of what we build next.</h2>
          <p>Every student counted here is a real enrollment—not a marketing estimate.</p>
        </div>
        {error ? (
          <p className="launch-state error-state" role="status">{error}</p>
        ) : stats ? (
          <div className="launch-live" aria-live="polite">
            <div className="launch-stat">
              <strong>{stats.enrolledStudents.toLocaleString()}</strong>
              <span>confirmed {stats.enrolledStudents === 1 ? 'student' : 'students'}</span>
            </div>
            <div className="launch-countdown">
              <span className="launch-countdown-label">OFFICIAL LAUNCH</span>
              {countdown === null ? (
                <strong>Launch date coming soon</strong>
              ) : secondsRemaining === 0 ? (
                <strong>We’re live — enrollment is open.</strong>
              ) : (
                <>
                  <strong>{countdown.days}d {countdown.hours}h {countdown.minutes}m {countdown.seconds}s</strong>
                  {launchTime !== null && <span>{new Intl.DateTimeFormat(undefined, { dateStyle: 'medium', timeStyle: 'short' }).format(launchTime)}</span>}
                </>
              )}
            </div>
          </div>
        ) : (
          <p className="launch-state" role="status">Loading confirmed enrollment and launch details…</p>
        )}
        <Link className="button button-lime launch-button" to="/sign-up">Enroll now <span aria-hidden="true">↗</span></Link>
      </div>
    </section>
  )
}

export function CourseHighlights() {
  const [courses, setCourses] = useState<CourseSummary[]>([])
  const [error, setError] = useState('')
  const [loading, setLoading] = useState(isSupabaseConfigured)

  useEffect(() => {
    if (!isSupabaseConfigured) return
    void listPublishedCourses()
      .then((items) => setCourses(items.slice(0, 3)))
      .catch((cause: unknown) => setError(cause instanceof Error ? cause.message : 'Could not load courses.'))
      .finally(() => setLoading(false))
  }, [])

  if (!isSupabaseConfigured) return <SetupNotice />
  if (loading) return <div className="inline-state" role="status">Loading published courses…</div>
  if (error) return <div className="inline-state error-state" role="alert">{error}</div>
  if (courses.length === 0) return <EmptyState title="Your next course is on its way." text="There are no published courses yet. Check back soon to see what’s ready to learn." />
  return <div className="course-grid">{courses.map((course, index) => <CourseCard key={course.id} course={course} index={index} />)}</div>
}
