'use strict'

const vscode = require('vscode')
const cp = require('node:child_process')
const fs = require('node:fs/promises')
const path = require('node:path')
const { promisify } = require('node:util')
const { scanSecrets, redactContent } = require('./secretShield')

const execFile = promisify(cp.execFile)
const COLLECTION_NAME = 'Mai Corp Secret Shield'

function activate(context) {
  const diagnostics = vscode.languages.createDiagnosticCollection(COLLECTION_NAME)
  const findingsByUri = new Map()
  const ignored = context.workspaceState.get('ignoredFindings', [])
  const ignoredKeys = new Set(ignored)
  let shieldEnabled = vscode.workspace.getConfiguration('maiCorpCompanion.secretShield').get('enabled', true)
  let demoMode = false
  const status = vscode.window.createStatusBarItem(vscode.StatusBarAlignment.Left, 80)

  const refreshStatus = () => {
    status.text = `$(shield) Secret Shield: ${shieldEnabled ? 'On' : 'Off'}${demoMode ? ' · Demo' : ''}`
    status.tooltip = 'Mai Corp Companion: local project protection (not desktop-wide screen masking)'
    status.command = 'maiCorpCompanion.scanWorkspace'
    status.show()
  }
  refreshStatus()

  const customNames = () => vscode.workspace.getConfiguration('maiCorpCompanion').get('sensitiveNames', [])
  const findingKey = (uri, finding) => `${uri.toString()}|${finding.rule}|${finding.startLine}|${finding.start}`
  function scanDocument(document) {
    if (!shieldEnabled || document.uri.scheme !== 'file' || document.isClosed) return []
    const text = document.getText()
    const findings = scanSecrets(text, customNames()).filter((finding) => !ignoredKeys.has(findingKey(document.uri, finding)))
    findingsByUri.set(document.uri.toString(), findings)
    diagnostics.set(document.uri, findings.map((finding) => {
      const start = document.positionAt(finding.start)
      const end = document.positionAt(finding.end)
      const diagnostic = new vscode.Diagnostic(
        new vscode.Range(start, end),
        `Possible ${finding.rule.toLowerCase()} detected. Keep it out of source control and use a local environment variable instead.`,
        vscode.DiagnosticSeverity.Warning,
      )
      diagnostic.source = 'Mai Corp Secret Shield'
      diagnostic.code = finding.rule
      return diagnostic
    }))
    return findings
  }

  function reportFindings(title, entries) {
    if (!entries.length) {
      vscode.window.showInformationMessage(`${title}: no likely secrets found in the scanned content.`)
      return
    }
    const summary = entries.map(({ uri, finding }) => `${path.basename(uri.fsPath)}:${finding.startLine + 1} — ${finding.rule}`)
    vscode.window.showWarningMessage(`${title}: ${entries.length} possible secret${entries.length === 1 ? '' : 's'} found. Values are not shown; review Problems.`)
    const output = vscode.window.createOutputChannel('Mai Corp Secret Shield')
    output.clear()
    output.appendLine(`${title}: ${entries.length} possible secret(s). Values are intentionally omitted.`)
    for (const item of summary) output.appendLine(item)
    output.show(true)
  }

  async function scanWorkspace() {
    if (!vscode.workspace.workspaceFolders?.length) {
      vscode.window.showWarningMessage('Open a project folder before scanning.')
      return []
    }
    if (!shieldEnabled) {
      vscode.window.showWarningMessage('Secret Shield is disabled. Enable it before scanning.')
      return []
    }
    const config = vscode.workspace.getConfiguration('maiCorpCompanion')
    const excluded = config.get('exclude', [])
    const files = await vscode.workspace.findFiles('**/*', `{${excluded.join(',')}}`, 10000)
    const entries = []
    for (const uri of files) {
      try {
        const document = await vscode.workspace.openTextDocument(uri)
        const findings = scanDocument(document)
        for (const finding of findings) entries.push({ uri, finding })
      } catch (error) {
        vscode.window.showWarningMessage(`Secret Shield could not scan ${path.basename(uri.fsPath)}: ${error instanceof Error ? error.message : 'read failed'}`)
      }
    }
    reportFindings('Workspace scan', entries)
    return entries
  }

  const commands = {
    'maiCorpCompanion.scanCurrentFile': () => {
      const document = vscode.window.activeTextEditor?.document
      if (!document) return vscode.window.showWarningMessage('Open a file before scanning.')
      const findings = scanDocument(document)
      reportFindings('Current-file scan', findings.map((finding) => ({ uri: document.uri, finding })))
    },
    'maiCorpCompanion.scanWorkspace': scanWorkspace,
    'maiCorpCompanion.scanGitChanges': async () => {
      const root = vscode.workspace.workspaceFolders?.[0]?.uri.fsPath
      if (!root) return vscode.window.showWarningMessage('Open a project folder before scanning Git changes.')
      try {
        const { stdout } = await execFile('git', ['diff', '--no-ext-diff', '--unified=0', 'HEAD', '--'], {
          cwd: root,
          windowsHide: true,
          maxBuffer: 8 * 1024 * 1024,
        })
        const findings = scanSecrets(stdout, customNames())
        reportFindings('Git diff scan', findings.map((finding) => ({ uri: vscode.Uri.file(path.join(root, 'Git diff')), finding })))
      } catch (error) {
        vscode.window.showErrorMessage(`Could not scan Git changes: ${error instanceof Error ? error.message : 'Git is unavailable or this is not a repository.'}`)
      }
    },
    'maiCorpCompanion.reviewFindings': async () => {
      const entries = [...findingsByUri.entries()].flatMap(([key, findings]) => findings.map((finding) => ({
        key,
        finding,
        uri: vscode.Uri.parse(key),
      })))
      if (!entries.length) return vscode.window.showInformationMessage('No current Secret Shield findings. Scan a file or workspace first.')
      const selected = await vscode.window.showQuickPick(entries.map((entry) => ({
        label: `${path.basename(entry.uri.fsPath)}:${entry.finding.startLine + 1}`,
        description: entry.finding.rule,
        detail: 'Possible secret value is hidden',
        entry,
      })), { placeHolder: 'Select a finding to inspect or mark as a false positive' })
      if (!selected) return
      const action = await vscode.window.showQuickPick(['Open finding', 'Mark as false positive'], { placeHolder: 'Choose an action' })
      if (action === 'Mark as false positive') {
        ignoredKeys.add(findingKey(selected.entry.uri, selected.entry.finding))
        await context.workspaceState.update('ignoredFindings', [...ignoredKeys])
        const document = await vscode.workspace.openTextDocument(selected.entry.uri)
        scanDocument(document)
      } else if (action === 'Open finding') {
        const document = await vscode.workspace.openTextDocument(selected.entry.uri)
        const editor = await vscode.window.showTextDocument(document)
        editor.selection = new vscode.Selection(selected.entry.finding.startLine, 0, selected.entry.finding.startLine, 0)
        editor.revealRange(new vscode.Range(selected.entry.finding.startLine, 0, selected.entry.finding.startLine, 0))
      }
    },
    'maiCorpCompanion.sanitizeSelection': async () => {
      const editor = vscode.window.activeTextEditor
      if (!editor || editor.selection.isEmpty) return vscode.window.showWarningMessage('Select text to sanitize first.')
      const selected = editor.document.getText(editor.selection)
      const safe = redactContent(selected, scanSecrets(selected, customNames()))
      await vscode.env.clipboard.writeText(safe)
      vscode.window.showInformationMessage('Sanitized copy placed on the clipboard. The source file was not changed.')
    },
    'maiCorpCompanion.previewSanitized': async () => {
      const document = vscode.window.activeTextEditor?.document
      if (!document) return vscode.window.showWarningMessage('Open a file to preview.')
      const safe = redactContent(document.getText(), scanSecrets(document.getText(), customNames()))
      const preview = await vscode.workspace.openTextDocument({ language: document.languageId, content: safe })
      await vscode.window.showTextDocument(preview, { preview: true, viewColumn: vscode.ViewColumn.Beside })
    },
    'maiCorpCompanion.enableShield': async () => {
      await vscode.workspace.getConfiguration('maiCorpCompanion.secretShield').update('enabled', true, vscode.ConfigurationTarget.Workspace)
      shieldEnabled = true
      refreshStatus()
      await scanWorkspace()
    },
    'maiCorpCompanion.disableShield': async () => {
      if (vscode.workspace.getConfiguration('maiCorpCompanion').get('protectedTeachingSession', false)) {
        const confirm = await vscode.window.showWarningMessage('Disabling Secret Shield during a protected teaching session reduces local warnings. This cannot protect other apps or screen capture.', 'Disable anyway')
        if (confirm !== 'Disable anyway') return
      }
      await vscode.workspace.getConfiguration('maiCorpCompanion.secretShield').update('enabled', false, vscode.ConfigurationTarget.Workspace)
      shieldEnabled = false
      diagnostics.clear()
      refreshStatus()
      vscode.window.showWarningMessage('Secret Shield is off. Other applications, terminals, Kilo, and screen capture are not controlled by this extension.')
    },
    'maiCorpCompanion.startDemo': async () => {
      demoMode = true
      await context.workspaceState.update(
        'protectedSessionPrevious',
        vscode.workspace.getConfiguration('maiCorpCompanion').get('protectedTeachingSession', false),
      )
      await vscode.workspace.getConfiguration('maiCorpCompanion').update('protectedTeachingSession', true, vscode.ConfigurationTarget.Workspace)
      refreshStatus()
      await commands['maiCorpCompanion.preClassCheck']()
      vscode.window.showWarningMessage('Demo Mode is a teaching checklist, not desktop masking. Use a dedicated sanitized workspace/window and review all external apps before sharing.')
    },
    'maiCorpCompanion.stopDemo': async () => {
      demoMode = false
      const previousProtectedSession = context.workspaceState.get('protectedSessionPrevious', false)
      await vscode.workspace.getConfiguration('maiCorpCompanion').update('protectedTeachingSession', previousProtectedSession, vscode.ConfigurationTarget.Workspace)
      await context.workspaceState.update('protectedSessionPrevious', undefined)
      const hidden = context.workspaceState.get('teachingHiddenFiles', [])
      if (hidden.length) {
        const exclude = { ...vscode.workspace.getConfiguration('files').get('exclude', {}) }
        for (const item of hidden) {
          if (exclude[item.pattern] === true) {
            if (item.previous === undefined) delete exclude[item.pattern]
            else exclude[item.pattern] = item.previous
          }
        }
        await vscode.workspace.getConfiguration('files').update('exclude', exclude, vscode.ConfigurationTarget.Workspace)
        await context.workspaceState.update('teachingHiddenFiles', [])
      }
      refreshStatus()
      vscode.window.showInformationMessage('Demo Mode checklist stopped. Review screen sharing and external apps yourself.')
    },
    'maiCorpCompanion.preClassCheck': async () => {
      const entries = await scanWorkspace()
      const config = vscode.workspace.getConfiguration('maiCorpCompanion')
      const root = vscode.workspace.workspaceFolders?.[0]?.uri.fsPath
      if (!root) return
      const protectedPatterns = config.get('protectedFiles', [])
      const protectedFiles = await vscode.workspace.findFiles(`{${protectedPatterns.join(',')}}`, `{${config.get('exclude', []).join(',')}}`, 1000)
      const report = [
        `Pre-class check scanned the selected workspace only.`,
        `Possible secrets: ${entries.length}.`,
        `Protected/caution files found: ${protectedFiles.length}.`,
        `A .env.example file ${await fileExists(path.join(root, '.env.example')) ? 'is present' : 'was not found'}.`,
        'External terminals, browser windows, notifications, and screen capture are not inspected or masked.',
      ].join('\n')
      const doc = await vscode.workspace.openTextDocument({ language: 'markdown', content: `# Mai Corp pre-class check\n\n${report}\n\n## Protected file names\n\n${protectedFiles.map((uri) => `- \`${vscode.workspace.asRelativePath(uri)}\``).join('\n') || '- None found'}\n\nSecret values are never included in this report.` })
      await vscode.window.showTextDocument(doc, { preview: true, viewColumn: vscode.ViewColumn.Beside })
    },
    'maiCorpCompanion.hideProtectedFiles': async () => {
      const config = vscode.workspace.getConfiguration('maiCorpCompanion')
      const protectedFiles = await vscode.workspace.findFiles(`{${config.get('protectedFiles', []).join(',')}}`, `{${config.get('exclude', []).join(',')}}`, 1000)
      if (!protectedFiles.length) return vscode.window.showInformationMessage('No configured protected files were found in this workspace.')
      const selected = await vscode.window.showQuickPick(protectedFiles.map((uri) => ({
        label: vscode.workspace.asRelativePath(uri),
        description: 'Hide from the VS Code Explorer only',
        uri,
      })), { canPickMany: true, placeHolder: 'Choose files to hide from Explorer; files are not changed or removed' })
      if (!selected?.length) return
      const answer = await vscode.window.showWarningMessage('Selected files will be hidden from this workspace’s Explorer, not from search, terminals, other apps, or screen capture. Continue?', { modal: true }, 'Hide selected')
      if (answer !== 'Hide selected') return
      const exclude = { ...vscode.workspace.getConfiguration('files').get('exclude', {}) }
      const hidden = context.workspaceState.get('teachingHiddenFiles', [])
      const additions = selected.map(({ uri }) => {
        const pattern = vscode.workspace.asRelativePath(uri)
        return { pattern, previous: Object.prototype.hasOwnProperty.call(exclude, pattern) ? exclude[pattern] : undefined }
      }).filter(({ pattern }) => !hidden.some((item) => item.pattern === pattern))
      for (const item of additions) exclude[item.pattern] = true
      await vscode.workspace.getConfiguration('files').update('exclude', exclude, vscode.ConfigurationTarget.Workspace)
      await context.workspaceState.update('teachingHiddenFiles', [...hidden, ...additions])
      vscode.window.showInformationMessage(`${selected.length} file(s) hidden from Explorer. Stop Demo Mode to restore prior Explorer visibility.`)
    },
    'maiCorpCompanion.envCoach': async () => {
      const root = vscode.workspace.workspaceFolders?.[0]?.uri.fsPath
      if (!root) return vscode.window.showWarningMessage('Open a project folder first.')
      const envFiles = await vscode.workspace.findFiles('{**/.env,**/.env.local,**/.env.development,**/.env.production,**/.env.example}', '**/node_modules/**', 50)
      const sourceFiles = await vscode.workspace.findFiles('**/*.{ts,tsx,js,jsx,vue,svelte}', '**/{node_modules,dist,build}/**', 500)
      const defined = new Set()
      const exampleDefined = new Set()
      const empty = new Set()
      const referenced = new Set()
      for (const uri of envFiles) {
        const doc = await vscode.workspace.openTextDocument(uri)
        const isExample = path.basename(uri.fsPath) === '.env.example'
        for (const line of doc.getText().split(/\r?\n/)) {
          const match = /^\s*(?:export\s+)?([A-Za-z_][A-Za-z0-9_]*)\s*=\s*(.*)$/.exec(line)
          if (!match) continue
          defined.add(match[1])
          if (isExample) exampleDefined.add(match[1])
          if (!match[2].trim()) empty.add(match[1])
        }
      }
      const vite = await fileExists(path.join(root, 'vite.config.ts')) || await fileExists(path.join(root, 'vite.config.js'))
      for (const uri of sourceFiles) {
        const doc = await vscode.workspace.openTextDocument(uri)
        for (const match of doc.getText().matchAll(/(?:import\.meta\.env|process\.env)\.([A-Za-z_][A-Za-z0-9_]*)/g)) referenced.add(match[1])
      }
      const missing = [...referenced].filter((name) => !exampleDefined.has(name))
      const unused = [...exampleDefined].filter((name) => !referenced.has(name))
      const exposed = [...defined].filter((name) => /^VITE_/i.test(name) && /(?:secret|password|token|service[_-]?role|private[_-]?key|database[_-]?url|client[_-]?secret)/i.test(name))
      const details = [
        `Framework hint: ${vite ? 'Vite configuration found.' : 'No Vite config detected; environment loading rules depend on your framework/runtime.'}`,
        vite ? '`VITE_*` variables are included in browser code. Never put server-only secrets in them.' : 'Verify the framework’s public-variable prefix and file precedence before relying on environment files.',
        'Supabase publishable/anon keys can be used in a browser only with correct RLS policies; service-role/secret keys must stay server-side.',
        `Referenced variables missing from .env.example: ${missing.length ? missing.join(', ') : 'none found'}.`,
        `Empty variables found: ${empty.size ? [...empty].join(', ') : 'none found'}.`,
        `.env.example variables with no source reference found: ${unused.length ? unused.join(', ') : 'none found'}.`,
        `Potentially exposed server-only variable names: ${exposed.length ? exposed.join(', ') : 'none found'}. Values are not shown.`,
        '.env.example values should be safe placeholders. Do not copy real values into examples or paste secrets into chat.',
      ]
      const doc = await vscode.workspace.openTextDocument({ language: 'markdown', content: `# Environment Variable Coach\n\n${details.map((item) => `- ${item}`).join('\n')}\n\n## Scanned configuration file names\n\n${envFiles.map((uri) => `- \`${vscode.workspace.asRelativePath(uri)}\``).join('\n') || '- None found'}\n` })
      await vscode.window.showTextDocument(doc, { preview: true, viewColumn: vscode.ViewColumn.Beside })
    },
    'maiCorpCompanion.generateEnvExample': async () => {
      const root = vscode.workspace.workspaceFolders?.[0]?.uri.fsPath
      if (!root) return vscode.window.showWarningMessage('Open a project folder first.')
      const candidates = await vscode.workspace.findFiles('{**/.env,**/.env.local,**/.env.development,**/.env.production}', '**/node_modules/**', 50)
      if (!candidates.length) return vscode.window.showWarningMessage('No local environment file was found. This command does not create an example from process environment variables.')
      const selected = await vscode.window.showQuickPick(candidates.map((uri) => ({ label: vscode.workspace.asRelativePath(uri), uri })), { placeHolder: 'Choose a local template. Its values stay on this computer.' })
      if (!selected) return
      const target = path.join(path.dirname(selected.uri.fsPath), '.env.example')
      if (await fileExists(target)) return vscode.window.showWarningMessage('.env.example already exists; it was not overwritten.')
      const source = await vscode.workspace.fs.readFile(selected.uri)
      const { createEnvExample } = require('./secretShield')
      const safeText = createEnvExample(Buffer.from(source).toString('utf8'))
      const preview = await vscode.workspace.openTextDocument({ language: 'dotenv', content: safeText })
      await vscode.window.showTextDocument(preview, { preview: true, viewColumn: vscode.ViewColumn.Beside })
      const answer = await vscode.window.showWarningMessage('Review the placeholder-only preview. Creating .env.example will not copy the original values.', { modal: true }, 'Create .env.example')
      if (answer !== 'Create .env.example') return
      let handle
      try {
        handle = await fs.open(target, 'wx', 0o600)
        await handle.writeFile(safeText, 'utf8')
      } catch (error) {
        if (error && error.code === 'EEXIST') {
          vscode.window.showWarningMessage('.env.example appeared during review; it was not overwritten.')
          return
        }
        throw error
      } finally {
        await handle?.close()
      }
      vscode.window.showInformationMessage('Created .env.example with placeholder values. The original environment file was not modified.')
    },
    'maiCorpCompanion.inspectSupabase': async () => {
      const migrations = await vscode.workspace.findFiles('supabase/migrations/**/*.sql', '**/node_modules/**', 500)
      const functions = await vscode.workspace.findFiles('supabase/functions/**/index.ts', '**/node_modules/**', 100)
      const config = await vscode.workspace.findFiles('supabase/config.toml', '**/node_modules/**', 10)
      const clientFiles = await vscode.workspace.findFiles('src/**/*.{ts,tsx,js,jsx}', '**/node_modules/**', 1000)
      const candidates = []
      for (const uri of clientFiles) {
        const doc = await vscode.workspace.openTextDocument(uri)
        if (/createClient\s*\(/.test(doc.getText())) candidates.push(uri)
      }
      const lines = [
        '# Local Supabase project inspection',
        '',
        `- Configuration: ${config.length ? config.map((uri) => `\`${vscode.workspace.asRelativePath(uri)}\``).join(', ') : 'not found'}`,
        `- SQL migrations: ${migrations.length}`,
        `- Edge Function entry points: ${functions.length}`,
        `- Client initialization candidates: ${candidates.map((uri) => `\`${vscode.workspace.asRelativePath(uri)}\``).join(', ') || 'not found in src/'}`,
        '',
        'This is a local file inventory only. No Supabase project was contacted and no SQL was executed.',
      ]
      const doc = await vscode.workspace.openTextDocument({ language: 'markdown', content: lines.join('\n') })
      await vscode.window.showTextDocument(doc, { preview: true, viewColumn: vscode.ViewColumn.Beside })
    },
    'maiCorpCompanion.copyLessonPrompt': async () => {
      const objective = await vscode.window.showInputBox({ prompt: 'Learning objective', placeHolder: 'What should the student understand or build?' })
      if (objective === undefined) return
      const task = await vscode.window.showInputBox({ prompt: 'Exercise task', placeHolder: 'Describe the lesson task; do not include credentials.' })
      if (task === undefined) return
      const prompt = [
        '# Mai Corp App Class lesson exercise',
        '',
        '## Learning objective',
        objective,
        '',
        '## Task',
        task,
        '',
        '## Constraints',
        '- Inspect the existing project and explain the plan before editing.',
        '- Preserve unrelated user changes. Do not print or copy environment-variable values.',
        '- Use placeholder credentials only. Never expose server-only secrets in browser code.',
        '- Do not run destructive commands, migrations, commits, or deployments without asking first.',
        '',
        '## Expected output and completion checks',
        '- Summarize changed files and explain the implementation.',
        '- Run the relevant tests/build and report exact outcomes.',
        '- Review the Git diff and scan changes for secrets.',
        '',
        '## Kilo workflow',
        'Paste this prompt into Kilo’s supported chat UI yourself. This extension does not access or control Kilo’s internal chat or requests.',
      ].join('\n')
      await vscode.env.clipboard.writeText(prompt)
      vscode.window.showInformationMessage('Lesson prompt copied. Paste it into Kilo yourself; no Kilo integration is claimed.')
    },
    'maiCorpCompanion.previewCommand': async () => {
      const command = await vscode.window.showInputBox({ prompt: 'Enter the exact command to preview', placeHolder: 'For example: npm test', ignoreFocusOut: true })
      if (!command?.trim()) return
      const trimmed = command.trim()
      const highRisk = /(?:\brm\b|\bdel\b|\brmdir\b|\bRemove-Item\b|\bformat\b|\bgit\s+(?:reset|clean|push\s+--force|push\s+-f)\b|\bsupabase\s+(?:db\s+reset|db\s+push|functions\s+deploy)\b|\bDROP\s+(?:DATABASE|TABLE|SCHEMA)\b|\bnpm\s+(?:install|uninstall)\b|\bpnpm\s+(?:add|remove)\b|\byarn\s+add\b)/i.test(trimmed)
      const warning = highRisk
        ? 'Potentially destructive, modifying, networked, or deployment-related command. This is a heuristic only; it cannot determine all effects.'
        : 'Command effects are not fully analyzed. Review scripts, chaining, substitutions, network access, and working directory.'
      const answer = await vscode.window.showWarningMessage(`Command:\n${trimmed}\n\nWorking directory: ${vscode.workspace.workspaceFolders?.[0]?.uri.fsPath ?? 'no workspace'}\n\n${warning}\n\nThe extension can only preview commands launched here; it cannot intercept Kilo or other terminals.`, { modal: true }, 'Open terminal and run')
      if (answer !== 'Open terminal and run') return
      const terminal = vscode.window.createTerminal({ name: 'Mai Corp approved command', cwd: vscode.workspace.workspaceFolders?.[0]?.uri.fsPath })
      terminal.show()
      terminal.sendText(trimmed, true)
    },
  }

  for (const [command, handler] of Object.entries(commands)) context.subscriptions.push(vscode.commands.registerCommand(command, handler))
  context.subscriptions.push(
    diagnostics,
    status,
    vscode.workspace.onDidOpenTextDocument((document) => { scanDocument(document) }),
    vscode.workspace.onDidChangeTextDocument((event) => { scanDocument(event.document) }),
    vscode.workspace.onDidCloseTextDocument((document) => {
      diagnostics.delete(document.uri)
      findingsByUri.delete(document.uri.toString())
    }),
    vscode.workspace.onDidChangeConfiguration((event) => {
      if (event.affectsConfiguration('maiCorpCompanion.secretShield.enabled')) {
        shieldEnabled = vscode.workspace.getConfiguration('maiCorpCompanion.secretShield').get('enabled', true)
        if (!shieldEnabled) diagnostics.clear()
        refreshStatus()
      }
    }),
  )
  for (const document of vscode.workspace.textDocuments) scanDocument(document)
}

async function fileExists(filePath) {
  try {
    await vscode.workspace.fs.stat(vscode.Uri.file(filePath))
    return true
  } catch (error) {
    if (error instanceof vscode.FileSystemError && error.code === 'FileNotFound') return false
    throw error
  }
}

function deactivate() {}

module.exports = { activate, deactivate }
