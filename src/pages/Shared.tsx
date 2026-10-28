import type { ReactNode } from 'react'
import { Link } from 'react-router-dom'

export function SectionHeading({ eyebrow, title, description, action }: { eyebrow: string; title: string; description: string; action?: ReactNode }) {
  return <div className="section-heading"><div><div className="eyebrow"><span className="eyebrow-dot" /> {eyebrow}</div><h2>{title}</h2><p>{description}</p></div>{action}</div>
}

export function Step({ number, title, text }: { number: string; title: string; text: string }) {
  return <article className="step"><span className="step-number">{number}</span><div><h3>{title}</h3><p>{text}</p></div><span className="step-arrow" aria-hidden="true">↗</span></article>
}

export function SetupNotice() {
  return <div className="setup-notice"><span className="setup-icon" aria-hidden="true">i</span><div><strong>Course catalog connection needed</strong><p>Published courses will show here once Supabase is configured. Add the public project URL and anon key to your local <code>.env</code> file, then apply the included database migration.</p><Link to="/how-it-works">See how the platform works <span aria-hidden="true">→</span></Link></div></div>
}

export function EmptyState({ title, text }: { title: string; text: string }) {
  return <div className="empty-state"><span className="empty-spark" aria-hidden="true">✳</span><h3>{title}</h3><p>{text}</p></div>
}
