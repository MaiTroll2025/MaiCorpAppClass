import { Link } from 'react-router-dom'

const setupSteps = [
  ['Install VS Code', 'Download Visual Studio Code from its official website and open a project folder with File → Open Folder.'],
  ['Add Kilo if you choose', 'Find Kilo Code in VS Code Extensions and follow its current in-product setup. Provider, model, and usage availability depend on your own account; no paid Mai Corp assistant is required.'],
  ['Use a lesson prompt', 'Open your Mai Corp lesson, copy the exercise prompt, and paste it into Kilo’s supported chat interface. Review every proposed edit before accepting it.'],
  ['Check your work', 'Run the lesson’s tests and build, inspect Source Control and the diff, scan for accidental secrets, then save a Git checkpoint.'],
]

export function DeveloperSetupPage() {
  return <div className="page-shell">
    <section className="page-hero"><div className="eyebrow"><span className="eyebrow-dot" /> YOUR DEVELOPMENT WORKFLOW</div><h1>Learn in class.<br /><span>Build in VS Code.</span></h1><p>Use your own project and tools to practice. Kilo is optional; Mai Corp App Class does not control its private chat or promise that any model or provider is free.</p></section>
    <section className="section developer-setup">
      <div className="developer-steps">{setupSteps.map(([title, text], index) => <article className="developer-step" key={title}><span>{String(index + 1).padStart(2, '0')}</span><div><h2>{title}</h2><p>{text}</p></div></article>)}</div>
      <aside className="developer-safety"><div className="eyebrow"><span className="eyebrow-dot" /> KEEP CREDENTIALS PRIVATE</div><h2>Practice safely from day one.</h2><ul><li>Use placeholder values in examples; never paste real secrets into prompts or lesson files.</li><li>Vite exposes <code>VITE_*</code> variables to browser code. Service-role keys and database passwords stay server-side.</li><li>Use a development Supabase project and review RLS before connecting any client.</li><li>Screen-sharing protection is limited: use a dedicated sanitized VS Code window and check external apps yourself.</li></ul><p>More setup steps and the local companion’s limitations are in the repository’s <code>docs/VS-CODE-KILO-SETUP.md</code> guide. See the <a href="https://marketplace.visualstudio.com/items?itemName=kilocode.Kilo-Code" rel="noreferrer" target="_blank">official Kilo Code Marketplace listing</a> for installation and current setup details.</p><a className="button button-dark" href="https://code.visualstudio.com/" rel="noreferrer" target="_blank">Get Visual Studio Code <span aria-hidden="true">↗</span></a></aside>
    </section>
    <section className="how-callout"><div className="section"><h2>Ready to learn by building?</h2><Link className="button button-lime" to="/courses">Explore courses <span aria-hidden="true">↗</span></Link></div></section>
  </div>
}
