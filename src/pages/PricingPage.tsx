
import { isSupabaseConfigured } from '../lib/supabase'
import { SetupNotice } from './Shared'
import { PayPalCheckoutButton } from './PayPalCheckout'

const plans = [
  {
    id: 'live-learner',
    name: 'Live Learner',
    price: '$49.99',
    description:
      'Learn to build apps and websites alongside live instructor-led classes.',
    badge: 'LIVE LEARNING',
    featured: false,
    features: [
      'Live-stream access to eligible classes and public Q&A',
      'Permanent access to course materials you purchase',
      'One eligible app project included',
      'Student dashboard, progress tracking, and project workspace',
      'Classroom chat where enabled',
    ],
  },
  {
    id: 'personal-builder',
    name: 'Personal Builder',
    price: '$99.99',
    description:
      'Get a personal coaching session while developing your own app.',
    badge: 'PERSONAL TRAINING',
    featured: false,
    features: [
      'Everything in Live Learner',
      'One 30-minute one-on-one training session',
      'Request booking subject to instructor availability',
      'Personal guidance on architecture, coding, and debugging',
    ],
  },
  {
    id: 'app-support',
    name: 'App Support',
    price: '$149.99',
    description:
      'Get focused troubleshooting and guidance for one app.',
    badge: 'BUILD WITH SUPPORT',
    featured: true,
    features: [
      'Everything in Personal Builder',
      'Support for one eligible app project',
      'Bug diagnosis, troubleshooting, and improvement guidance',
      'Code review and deployment guidance',
      'Support is guidance, not hands-on development work',
    ],
  },
  {
    id: 'app-portfolio',
    name: 'App Portfolio',
    price: '$249.99',
    description:
      'Build a portfolio of apps with support across up to three projects.',
    badge: 'MULTI-APP SUPPORT',
    featured: false,
    features: [
      'Everything in App Support',
      'One eligible app project included',
      'Two additional App Credits included',
      'Support for up to three eligible apps total',
      'Project-specific troubleshooting and deployment guidance',
      'Support is guidance, not hands-on development work',
    ],
  },
]

export function PricingPage() {
  return (
    <div className="page-shell">
      <section className="page-hero">
        <div className="eyebrow">
          <span className="eyebrow-dot" />
          SIMPLE, TRANSPARENT PRICING
        </div>

        <h1>
          Learn to build.
          <br />
          <span>Build it with support.</span>
        </h1>

        <p>
          Learn application development through live classes, practical
          projects, and instructor guidance. Choose the level of training
          and app support that fits your goals, with one straightforward
          payment instead of a recurring subscription.
        </p>
      </section>

      <section className="section pricing-content">
        {!isSupabaseConfigured ? (
          <SetupNotice />
        ) : (
          <>
            <div className="pricing-intro">
              <h2>Choose your learning plan</h2>
              <p>
                Every plan includes live-stream access, permanent access to
                purchased course materials, and one eligible app project.
                App Portfolio also includes two App Credits for two more apps.
              </p>
              <p className="pricing-payment-note">
                All listed prices are one-time payments. No monthly
                renewal or time-based access expiration is implied.
                Training and support scheduling are coordinated separately;
                the account dashboard does not yet book those services.
              </p>
            </div>

            <div className="pricing-grid">
              {plans.map((plan) => (
                <article
                  key={plan.id}
                  className={`pricing-card ${
                    plan.featured ? 'pricing-card-featured' : ''
                  }`}
                >
                  <div className="pricing-card-heading">
                    <span className="pricing-plan-badge">
                      {plan.badge}
                    </span>
                    <h3>{plan.name}</h3>
                    <p className="pricing-description">
                      {plan.description}
                    </p>
                  </div>

                  <div className="pricing-price">
                    <strong>{plan.price}</strong>
                    <span>one-time</span>
                  </div>

                  <ul className="pricing-features">
                    {plan.features.map((feature) => (
                      <li key={feature}>
                        <span
                          className="pricing-check"
                          aria-hidden="true"
                        >
                          ✓
                        </span>
                        <span>{feature}</span>
                      </li>
                    ))}
                  </ul>

                  <PayPalCheckoutButton
                    className={
                      plan.featured
                        ? 'button button-primary'
                        : 'button button-secondary'
                    }
                    label={`Get ${plan.name} — ${plan.price}`}
                    product={{ type: 'plan', planId: plan.id }}
                  />

                  <p className="pricing-card-footnote">
                    PayPal checkout requires the secure payment service to be configured. Training and support booking are coordinated separately.
                  </p>
                </article>
              ))}
            </div>

            <section className="pricing-costs app-credit-note">
              <div className="eyebrow">ADDITIONAL APP PROJECTS</div>
              <h2>One App Credit starts one app.</h2>
              <p>
                Your tier-included project(s) do not use credits. Every
                additional project uses exactly one App Credit. Purchased
                credits do not silently expire, and they are separate from
                course access and external hosting, domain, API, or AI costs.
              </p>
              <p className="pricing-cost-disclaimer">
                Secure App Credit checkout is not configured yet, so credits
                cannot currently be purchased and no top-up price is shown.
              </p>
            </section>

            <section className="pricing-costs">
              <div className="eyebrow">
                KNOW YOUR ADDITIONAL COSTS
              </div>

              <h2>Your app. Your accounts. Your choice.</h2>

              <p>
                Your plan includes an eligible app project and the
                instruction or support listed above. It does not mean
                every third-party development, hosting, or AI service
                is free.
              </p>

              <div className="pricing-cost-grid">
                <article className="pricing-cost-item">
                  <h3>Domain registration</h3>
                  <p>
                    Purchase and renew your domain through your chosen
                    domain registrar.
                  </p>
                </article>

                <article className="pricing-cost-item">
                  <h3>Frontend hosting</h3>
                  <p>
                    Services such as Vercel or Render may charge for
                    hosting, bandwidth, or other usage.
                  </p>
                </article>

                <article className="pricing-cost-item">
                  <h3>Backend and database</h3>
                  <p>
                    Your backend provider may charge for database
                    capacity, storage, functions, or usage.
                  </p>
                </article>

                <article className="pricing-cost-item">
                  <h3>AI credits and APIs</h3>
                  <p>
                    Free allowances may be available, but additional
                    AI credits, model usage, and paid APIs are your
                    responsibility.
                  </p>
                </article>
              </div>

              <p className="pricing-cost-disclaimer">
                Students create and control their own third-party
                accounts and billing. Actual costs depend on the
                providers, plans, and usage they choose.
              </p>
            </section>

            <section className="pricing-process">
              <h2>From learning to launching</h2>

              <div className="pricing-process-grid">
                <article>
                  <span className="pricing-step-number">01</span>
                  <h3>Learn</h3>
                  <p>
                    Attend live classes and learn how to use VS Code,
                    Kilo Code, Supabase, APIs, and modern development
                    tools.
                  </p>
                </article>

                <article>
                  <span className="pricing-step-number">02</span>
                  <h3>Build</h3>
                  <p>
                    Apply what you learn to your eligible app project
                    using your own development environment and accounts.
                  </p>
                </article>

                <article>
                  <span className="pricing-step-number">03</span>
                  <h3>Get support</h3>
                  <p>
                    Choose a plan with personal training or app support
                    if you need additional guidance during development.
                  </p>
                </article>
              </div>
            </section>

            <section className="pricing-faq">
              <h2>Frequently asked questions</h2>

              <details>
                <summary>Is this a recurring subscription?</summary>
                <p>
                  No. The listed plans are designed as one-time payments.
                  Any future renewal or additional service charge must be
                  disclosed separately before purchase.
                </p>
              </details>

              <details>
                <summary>Does my one-time course access expire?</summary>
                <p>
                  No. Purchased course access does not expire merely because
                  time passes. Support, one-on-one sessions, and App Credits
                  are tracked separately and follow their own clearly
                  disclosed terms.
                </p>
              </details>

              <details>
                <summary>How do App Credits work?</summary>
                <p>
                  Each additional app project uses exactly one App Credit.
                  Projects included with your plan use no credits. Purchased
                  credits remain in your account until used and are not
                  automatically expired. Credit checkout is not available yet.
                </p>
              </details>

              <details>
                <summary>Does the included app mean everything is free?</summary>
                <p>
                  No. The plan covers an eligible app project under the
                  stated plan benefits. Domain registration, paid hosting,
                  backend usage, extra AI credits, and third-party services
                  are not included unless explicitly stated.
                </p>
              </details>

              <details>
                <summary>What is included in app support?</summary>
                <p>
                  App support is troubleshooting, code review, and
                  configuration or deployment guidance for the covered
                  project. It is not hands-on development. Contact and
                  scheduling are coordinated separately and are not yet
                  available in the account dashboard.
                </p>
              </details>

              <details>
                <summary>How does one-on-one training work?</summary>
                <p>
                  Personal Builder includes one 30-minute one-on-one
                  training session, requested subject to the instructor's
                  availability. Booking and messaging must be connected
                  before this benefit is available for purchase.
                </p>
              </details>

              <details>
                <summary>Does the App Portfolio plan cover three apps?</summary>
                <p>
                  It includes one eligible app project and two additional
                  App Credits. Each credit starts one additional eligible
                  project, for support across up to three apps.
                </p>
              </details>
            </section>

            <div className="pricing-footer">
              <h3>Build something of your own.</h3>
              <p>
                Mai Corp App Class helps you develop practical skills,
                build real projects, and learn how to troubleshoot your
                work. You choose the tools and third-party providers
                that fit your needs and budget.
              </p>
            </div>
          </>
        )}
      </section>
    </div>
  )
}
