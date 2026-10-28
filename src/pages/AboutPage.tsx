
import { Link } from 'react-router-dom'

export function AboutPage() {
  return (
    <div className="page-shell">
      <section className="page-hero about-hero">
        <div className="eyebrow">
          <span className="eyebrow-dot" />
          THE STORY BEHIND MAI CORP APP CLASS
        </div>

        <h1>
          You have an idea.
          <br />
          <span>Let's build it.</span>
        </h1>

        <p>
          Have you ever wanted to create an app but had no idea where
          to begin? Maybe you have a business idea, a project you've
          always dreamed about, or a solution you wish someone would
          build. You shouldn't have to be an experienced programmer
          or spend thousands of dollars just to get started.
        </p>

        <Link className="button button-dark" to="/courses">
          Explore our courses <span aria-hidden="true">↗</span>
        </Link>
      </section>

      <section className="section about-story">
        <div className="eyebrow">
          <span className="eyebrow-dot" />
          WHY WE STARTED
        </div>

        <h2>
          I had an idea. I just needed the right way to build it.
        </h2>

        <p>
          My journey started with a simple goal: I wanted to build
          applications that could bring my ideas to life. Like many
          people starting out, I looked for a platform that claimed
          it could help me do exactly that.
        </p>

        <p>
          I invested in that platform because I believed it would help
          me turn my ideas into working applications. But I ended up
          paying more than I should have, and I learned an important
          lesson: having a great idea is one thing, but understanding
          the tools, technology, and process behind building it is
          something else entirely.
        </p>

        <p>
          I didn't want other people with big ideas to feel like they
          had to keep spending money without truly understanding what
          they were building. I wanted people to have a clearer path,
          better guidance, and the opportunity to learn skills they
          could use long after a single project was finished.
        </p>

        <p>
          That's the idea behind Mai Corp App Class.
        </p>
      </section>

      <section className="section about-mission">
        <div className="eyebrow">
          <span className="eyebrow-dot" />
          OUR MISSION
        </div>

        <h2>
          Help you go from
          <br />
          <span>"I have an idea"</span>
          <br />
          to "I built it."
        </h2>

        <p>
          Mai Corp App Class is designed for people who want to build
          applications but don't know where to start. We help break
          the process into manageable steps, introduce the tools
          developers use, and make complicated concepts easier to
          understand.
        </p>

        <p>
          You don't have to know everything on day one. You just need
          a place to start, the willingness to learn, and guidance
          when you get stuck.
        </p>
      </section>

      <section className="section about-audience">
        <div className="eyebrow">
          <span className="eyebrow-dot" />
          BUILT FOR BEGINNERS AND BUILDERS
        </div>

        <h2>Maybe one of these sounds like you.</h2>

        <div className="about-audience-grid">
          <article>
            <span className="about-number">01</span>
            <h3>You have an app idea.</h3>
            <p>
              You can picture the app in your head, but you're unsure
              which tools to use, where to begin, or how to turn that
              idea into a real product.
            </p>
          </article>

          <article>
            <span className="about-number">02</span>
            <h3>You want to learn without the confusion.</h3>
            <p>
              Programming terms, databases, APIs, hosting, and
              deployments can feel overwhelming. Learn what these
              things do and how they fit together.
            </p>
          </article>

          <article>
            <span className="about-number">03</span>
            <h3>You want to use AI to build apps.</h3>
            <p>
              Learn to work with VS Code and the free Kilo Code
              extension while understanding the code, reviewing
              changes, and protecting your credentials.
            </p>
          </article>

          <article>
            <span className="about-number">04</span>
            <h3>You want help when you get stuck.</h3>
            <p>
              Build your skills through live classes, practical
              exercises, and available instructor training and
              application support, depending on your plan.
            </p>
          </article>
        </div>
      </section>

      <section className="section about-values">
        <article>
          <span>01</span>
          <h2>Learn by doing</h2>
          <p>
            Understand concepts by applying them to real projects.
            The goal isn't just to follow instructions; it's to learn
            how the pieces work together.
          </p>
        </article>

        <article>
          <span>02</span>
          <h2>Understand your tools</h2>
          <p>
            Learn about your editor, AI coding assistant, database,
            APIs, environment variables, and deployment options so
            you can make informed decisions about your projects.
          </p>
        </article>

        <article>
          <span>03</span>
          <h2>Build with confidence</h2>
          <p>
            Learn to recognize errors, ask better questions, review
            code changes, and understand what your application needs
            before launching it.
          </p>
        </article>
      </section>

      <section className="section about-closing">
        <div className="eyebrow">
          <span className="eyebrow-dot" />
          YOUR IDEA IS A PLACE TO START
        </div>

        <h2>
          You don't need to know
          <br />
          <span>everything to begin.</span>
        </h2>

        <p>
          You just need to take the first step. Let Mai Corp App Class
          help you learn the tools, understand the process, and start
          building something of your own.
        </p>

        <div className="about-actions">
          <Link className="button button-dark" to="/courses">
            Explore courses <span aria-hidden="true">↗</span>
          </Link>

          <Link className="button button-secondary" to="/pricing">
            View pricing
          </Link>
        </div>
      </section>
    </div>
  )
}
