
import { Link } from 'react-router-dom'
import { isSupabaseConfigured } from '../lib/supabase'
import { SetupNotice } from './Shared'
import { PublicRecordingHighlights } from './PublicMediaLibrary'

export function RecordedLessonsPage() {
  return (
    <div className="page-shell">
      <section className="page-hero collection-hero">
        <div className="eyebrow">
          <span className="eyebrow-dot" />
          LEARN AT YOUR OWN PACE
        </div>

        <h1>
          Learn today.
          <br />
          Build tomorrow<span>.</span>
        </h1>

        <p>
          Can't make a live class? Want to review something you didn't
          quite understand the first time? Recorded lessons help you
          revisit important concepts, follow demonstrations, and learn
          at a pace that works for you. Pause when you need to, replay
          a tricky section, and practice alongside the instructor as
          you develop your app-building skills.
        </p>

        <div className="recorded-hero-actions">
          <Link className="button button-dark" to="/courses">
            Explore courses <span aria-hidden="true">↗</span>
          </Link>

          <Link className="button button-secondary" to="/how-it-works">
            How learning works
          </Link>
        </div>
      </section>

      <section className="section recorded-intro">
        <div className="eyebrow">
          <span className="eyebrow-dot" />
          LEARNING THAT FITS YOUR SCHEDULE
        </div>

        <h2>Go back, replay, and learn at your own speed.</h2>

        <p>
          Learning to build applications takes practice. You might
          need to watch an instructor connect a database, explain a
          piece of code, or demonstrate how to fix an error more than
          once. That's normal.
        </p>

        <p>
          Recorded lessons give you a way to revisit available
          demonstrations without having to remember every detail
          from a live class. Open your development environment,
          follow the steps, try the examples, and take your time
          understanding what each part does.
        </p>
      </section>

      <section className="section recorded-benefits">
        <div className="eyebrow">
          <span className="eyebrow-dot" />
          MAKE EVERY LESSON COUNT
        </div>

        <h2>Learn in a way that works for you.</h2>

        <div className="recorded-benefit-grid">
          <article>
            <span className="recorded-benefit-number">01</span>
            <h3>Pause and practice</h3>
            <p>
              Stop the lesson when you want to try something yourself.
              Work through the example before moving on to the next step.
            </p>
          </article>

          <article>
            <span className="recorded-benefit-number">02</span>
            <h3>Revisit difficult topics</h3>
            <p>
              Return to a concept when you need a refresher. You don't
              have to understand everything perfectly the first time.
            </p>
          </article>

          <article>
            <span className="recorded-benefit-number">03</span>
            <h3>Build real skills</h3>
            <p>
              Use what you learn to practice with VS Code, Kilo Code,
              databases, APIs, and other tools covered in your lessons.
            </p>
          </article>

          <article>
            <span className="recorded-benefit-number">04</span>
            <h3>Keep moving forward</h3>
            <p>
              Build your understanding one topic at a time and use
              lessons as a reference while working on your projects.
            </p>
          </article>
        </div>
      </section>

      <section className="section collection-content" id="recordings">
        <div className="eyebrow">
          <span className="eyebrow-dot" />
          THE RECORDING LIBRARY
        </div>

        <h2>Find a lesson and keep learning.</h2>

        <p className="recorded-library-description">
          Published recordings and lessons will appear here when they
          are available. Access may depend on your account, enrollment,
          and purchased plan.
        </p>

        {!isSupabaseConfigured ? (
          <SetupNotice />
        ) : (
          <PublicRecordingHighlights showEmpty />
        )}

        <div className="recorded-library-actions">
          <Link className="button button-dark" to="/courses">
            Browse the course library <span aria-hidden="true">↗</span>
          </Link>
        </div>
      </section>

      <section className="how-callout recorded-callout">
        <div className="section">
          <div className="eyebrow">
            <span className="eyebrow-dot" />
            EVERY BUILDER STARTS SOMEWHERE
          </div>

          <h2>
            You can learn it.
            <br />
            <span>One lesson at a time.</span>
          </h2>

          <p>
            You don't need to know everything about programming before
            you begin. Start with a topic that interests you, learn the
            basics, and practice as you go. Each new concept can bring
            you one step closer to building your own application.
          </p>

          <Link className="button button-lime" to="/pricing">
            Explore learning plans <span aria-hidden="true">↗</span>
          </Link>
        </div>
      </section>
    </div>
  )
}
