
import { Link } from 'react-router-dom'
import { Step } from './Shared'

export function HowItWorksPage() {
  return (
    <div className="page-shell">
      <section className="page-hero how-hero">
        <div className="eyebrow">
          <span className="eyebrow-dot" />
          YOUR APP-BUILDING JOURNEY STARTS HERE
        </div>

        <h1>
          Got an idea?
          <br />
          <span>Let's build it.</span>
        </h1>

        <p>
          You don't need to know how to code before you get started.
          Maybe you have an idea for a business app, a social platform,
          a game, or a tool that could make life easier. Maybe you have
          never opened a code editor and don't know what a database is.
          That's okay. Mai Corp App Class helps you understand the tools,
          learn the process, and work toward building an application
          of your own, one step at a time.
        </p>

        <div className="how-hero-actions">
          <Link className="button button-dark" to="/courses">
            Explore courses <span aria-hidden="true">↗</span>
          </Link>

          <Link className="button button-secondary" to="/pricing">
            View learning plans
          </Link>
        </div>
      </section>

      <section className="section how-intro">
        <div className="eyebrow">
          <span className="eyebrow-dot" />
          NO EXPERIENCE REQUIRED TO BEGIN
        </div>

        <h2>You bring the idea. We'll help you learn how to build it.</h2>

        <p>
          Building an application can sound complicated because there
          are many different parts involved. You might hear words like
          frontend, backend, database, API, hosting, and deployment
          and wonder what any of them actually mean.
        </p>

        <p>
          Think of an application like a house. The frontend is what
          people see when they walk inside. The backend is the system
          working behind the scenes. The database is where information
          is stored, and hosting is the service that makes the application
          available online. Eventually, these parts need to work together.
        </p>

        <p>
          You don't have to learn everything at once. We break the
          process into smaller lessons so you can understand one concept,
          practice it, and then move on to the next.
        </p>
      </section>

      <section className="section how-steps">
        <div className="eyebrow">
          <span className="eyebrow-dot" />
          YOUR JOURNEY, STEP BY STEP
        </div>

        <h2>Here's how it works.</h2>

        <p className="how-section-intro">
          From your first lesson to testing your own application,
          every step helps you build understanding and confidence.
        </p>

        <div className="process-grid">
          <Step
            number="01"
            title="Start with your idea"
            text="Think about what you want to build and who it is for. It could be a business website, a mobile app, a social platform, a game, or a tool that solves a problem. You don't need a perfect plan. Start with what you want your app to do, and learn how to turn that idea into smaller, manageable tasks."
          />

          <Step
            number="02"
            title="Learn the tools"
            text="Get familiar with VS Code, the application where you can write, organize, and manage your project's code. Learn how to use the free Kilo Code extension as an AI coding assistant to help explain code, suggest changes, and work through problems. AI can help, but you will also learn to review what it produces and understand what is changing."
          />

          <Step
            number="03"
            title="Understand the building blocks"
            text="Learn the difference between the frontend people interact with, the backend that handles application logic, and the database that stores information. Discover what APIs do, why environment variables are used for configuration, and how services such as Supabase can provide database and authentication features. Each lesson helps you understand how the pieces fit together."
          />

          <Step
            number="04"
            title="Follow a lesson and practice"
            text="Work through lessons that explain a concept, show you how it works, and give you an opportunity to try it yourself. Instead of simply copying code and hoping it works, learn what the code does, where it belongs, how to test it, and how to recognize common mistakes. You can build your skills gradually, even if this is your first project."
          />

          <Step
            number="05"
            title="Join live classes"
            text="Attend live coding classes where instructors demonstrate development techniques and explain their decisions as they work. Watch the screen-sharing demonstrations, follow along in your own project, and participate using the options available for your class. Class recordings and summaries can help you revisit material when they are provided."
          />

          <Step
            number="06"
            title="Build your first application"
            text="Put what you learn into practice by working on an eligible app project. Start with a small goal, such as creating a page, adding a form, saving information, or setting up user sign-in. Test each feature before moving forward. Your first version does not need every feature you imagined; the goal is to build a working foundation you can improve over time."
          />

          <Step
            number="07"
            title="Learn to find and fix problems"
            text="Every developer encounters errors. A page might not load, a button might not work, or the database might reject a request. Learn how to read error messages, inspect the relevant code, ask useful questions, and test possible fixes. Kilo Code can assist with explanations and debugging, but you should review suggested changes and avoid exposing passwords, API keys, or other secrets."
          />

          <Step
            number="08"
            title="Prepare your app for the real world"
            text="When you're ready, learn how to test your application, protect user information, configure your services, and deploy your project so other people can access it. Deployment means publishing your app to an online environment. Your own domain, hosting, backend usage, paid APIs, and additional AI credits may involve separate costs that are not included in your class payment."
          />
        </div>
      </section>

      <section className="section how-glossary">
        <div className="eyebrow">
          <span className="eyebrow-dot" />
          LET'S MAKE THE TECHNICAL WORDS SIMPLE
        </div>

        <h2>New to app development? Start here.</h2>

        <p className="how-section-intro">
          You will hear these words throughout your learning journey.
          Here is what they mean in everyday language.
        </p>

        <div className="how-glossary-grid">
          <article>
            <h3>VS Code</h3>
            <p>
              A program you install on your computer to open project
              files, edit code, and work on your application.
            </p>
          </article>

          <article>
            <h3>Kilo Code</h3>
            <p>
              An AI coding extension that works with your development
              environment and can help you understand code, plan changes,
              and troubleshoot problems.
            </p>
          </article>

          <article>
            <h3>Frontend</h3>
            <p>
              The part of your app that people see and interact with,
              including pages, menus, forms, and buttons.
            </p>
          </article>

          <article>
            <h3>Backend</h3>
            <p>
              The behind-the-scenes logic that handles tasks such as
              processing requests, applying rules, and connecting services.
            </p>
          </article>

          <article>
            <h3>Database</h3>
            <p>
              An organized place to store information, such as user
              profiles, posts, orders, messages, or application settings.
            </p>
          </article>

          <article>
            <h3>API</h3>
            <p>
              A way for different software systems to communicate and
              exchange information with each other.
            </p>
          </article>

          <article>
            <h3>Environment variables</h3>
            <p>
              Configuration values that help your app connect to services
              without placing sensitive credentials directly in your code.
              Some frontend variables are publicly exposed, so secrets
              must stay on the server.
            </p>
          </article>

          <article>
            <h3>Hosting and deployment</h3>
            <p>
              Hosting provides the environment where your app runs.
              Deployment is the process of publishing a version of your
              app to that environment.
            </p>
          </article>
        </div>
      </section>

      <section className="section how-support">
        <div className="eyebrow">
          <span className="eyebrow-dot" />
          YOU DON'T HAVE TO FIGURE IT ALL OUT ALONE
        </div>

        <h2>Choose the level of guidance that works for you.</h2>

        <p>
          Some people prefer to learn independently, while others want
          an instructor to walk them through a problem or help them
          understand why their application isn't working as expected.
          Mai Corp App Class offers different plan levels for live
          learning, individual training, and application support.
        </p>

        <div className="how-support-grid">
          <article>
            <h3>Learn in live classes</h3>
            <p>
              Follow instructor demonstrations, learn new techniques,
              and practice what you see.
            </p>
          </article>

          <article>
            <h3>Get one-on-one training</h3>
            <p>
              Eligible plans include individual training and in-app
              communication, subject to the plan's session allowance
              and availability.
            </p>
          </article>

          <article>
            <h3>Get help with your app</h3>
            <p>
              Eligible support plans provide guidance for covered
              projects, including troubleshooting and deployment
              questions within the plan's stated scope.
            </p>
          </article>
        </div>

        <p className="how-support-note">
          Training time, support duration, and covered projects depend
          on your purchased plan. Third-party software and infrastructure
          charges are separate unless expressly included.
        </p>

        <Link className="button button-secondary" to="/pricing">
          Compare plans <span aria-hidden="true">↗</span>
        </Link>
      </section>

      <section className="how-callout">
        <div className="section">
          <div className="eyebrow">
            <span className="eyebrow-dot" />
            YOUR FIRST STEP STARTS HERE
          </div>

          <h2>
            You don't need all the answers.
            <br />
            <span>You just need to begin.</span>
          </h2>

          <p>
            Start by exploring what interests you. Learn a new concept,
            practice with the tools, and build your knowledge one step
            at a time. Your first application can begin with a simple idea.
          </p>

          <div className="how-hero-actions">
            <Link className="button button-lime" to="/courses">
              Explore courses <span aria-hidden="true">↗</span>
            </Link>

            <Link className="button button-secondary" to="/pricing">
              View pricing
            </Link>
          </div>
        </div>
      </section>
    </div>
  )
}
