'use strict'

const PLACEHOLDER = /(?:your[-_ ]|replace[-_ ]with|example|sample|placeholder|dummy|changeme|change[-_ ]me|<[^>]+>)/i
const SENSITIVE_NAME = /(?:secret|password|passwd|token|api[_-]?key|private[_-]?key|service[_-]?role|database[_-]?url|connection[_-]?string|client[_-]?secret|webhook|certificate|credential|auth[_-]?key)/i
const PUBLIC_NAME = /(?:anon(?:ymous)?[_-]?key|publishable|public[_-]?key|client[_-]?id)/i
const KNOWN_TOKEN_PATTERNS = [
  { rule: 'OpenRouter API key', regex: /\bsk-or-v1-[A-Za-z0-9_-]{20,}\b/g },
  { rule: 'Provider API key', regex: /\bsk-[A-Za-z0-9_-]{24,}\b/g },
  { rule: 'GitHub token', regex: /\b(?:gh[pousr]_[A-Za-z0-9]{30,}|github_pat_[A-Za-z0-9_]{30,})\b/g },
  { rule: 'Slack token', regex: /\bxox[baprs]-[A-Za-z0-9-]{20,}\b/g },
  { rule: 'AWS access key ID', regex: /\bAKIA[0-9A-Z]{16}\b/g },
  { rule: 'JWT', regex: /\beyJ[A-Za-z0-9_-]{8,}\.[A-Za-z0-9_-]{8,}\.[A-Za-z0-9_-]{8,}\b/g },
  { rule: 'Supabase secret key', regex: /\bsb_secret_[A-Za-z0-9_-]{12,}\b/g },
]

function entropy(value) {
  const counts = new Map()
  for (const char of value) counts.set(char, (counts.get(char) || 0) + 1)
  let result = 0
  for (const count of counts.values()) {
    const probability = count / value.length
    result -= probability * Math.log2(probability)
  }
  return result
}

function isPlaceholder(value) {
  const normalized = value.trim().replace(/^['"`]|['"`;,]+$/g, '')
  return !normalized || PLACEHOLDER.test(normalized) || /^(?:true|false|null|undefined|changeme|password|secret|test|12345+)$/i.test(normalized)
}

function lineAt(text, offset) {
  let line = 0
  for (let index = 0; index < offset; index += 1) if (text.charCodeAt(index) === 10) line += 1
  return line
}

function scanSecrets(text, customNames = []) {
  const candidates = []
  const add = (start, end, rule, variableName = '') => {
    if (start < 0 || end <= start) return
    candidates.push({ start, end, rule, variableName })
  }

  const pem = /-----BEGIN (?:RSA |EC |OPENSSH |DSA )?PRIVATE KEY-----[\s\S]*?-----END (?:RSA |EC |OPENSSH |DSA )?PRIVATE KEY-----/g
  for (const match of text.matchAll(pem)) add(match.index, match.index + match[0].length, 'Private key')

  const assignment = /^\s*(?:export\s+)?(?:const\s+|let\s+|var\s+)?([A-Za-z_][A-Za-z0-9_.-]*)\s*[:=]\s*(.+?)\s*$/gm
  for (const match of text.matchAll(assignment)) {
    const name = match[1]
    const key = name.toLowerCase()
    const configured = customNames.some((item) => item.trim().toLowerCase() === key)
    if (!SENSITIVE_NAME.test(name) && !configured) continue
    if (PUBLIC_NAME.test(name)) continue
    const rawValue = match[2]
    const trimmedValue = rawValue.trim()
    const quoted = /^(['"`])([\s\S]*)\1(?:\s*[;,])?$/.exec(trimmedValue)
    const value = quoted ? quoted[2] : trimmedValue.replace(/[;,]$/, '').trimEnd()
    if (isPlaceholder(value)) continue
    const assignmentStart = match[0].search(/[=:]/) + 1
    const valueStart = match[0].indexOf(rawValue, assignmentStart) + (rawValue.length - rawValue.trimStart().length)
    const start = match.index + valueStart + (quoted ? 1 : 0)
    const end = start + value.length
    if (value) add(start, end, 'Sensitive configuration value', name)
  }

  const urlPassword = /\b(?:postgres(?:ql)?|mysql|mongodb(?:\+srv)?|redis):\/\/[^:/\s]+:([^@\s/]+)@/gi
  for (const match of text.matchAll(urlPassword)) {
    const passwordStart = match.index + match[0].lastIndexOf(match[1])
    if (!isPlaceholder(match[1])) add(passwordStart, passwordStart + match[1].length, 'Database URL password')
  }

  for (const { rule, regex } of KNOWN_TOKEN_PATTERNS) {
    for (const match of text.matchAll(regex)) {
      if (!isPlaceholder(match[0])) add(match.index, match.index + match[0].length, rule)
    }
  }

  const generic = /\b[A-Za-z0-9_+/=-]{32,}\b/g
  for (const match of text.matchAll(generic)) {
    if (isPlaceholder(match[0]) || entropy(match[0]) < 3.5) continue
    const lineStart = text.lastIndexOf('\n', match.index) + 1
    const lineEnd = text.indexOf('\n', match.index)
    const line = text.slice(lineStart, lineEnd < 0 ? text.length : lineEnd)
    const assignmentOnLine = /^\s*(?:export\s+)?(?:const\s+|let\s+|var\s+)?([A-Za-z_][A-Za-z0-9_.-]*)\s*[:=]\s*(.*)$/.exec(line)
    if (assignmentOnLine) {
      const name = assignmentOnLine[1]
      const configured = customNames.some((item) => item.trim().toLowerCase() === name.toLowerCase())
      const rawValue = assignmentOnLine[2].trim()
      if (PUBLIC_NAME.test(name) || isPlaceholder(rawValue.replace(/^['"`]|['"`;,]+$/g, ''))) continue
      const delimiterOffset = line.search(/[=:]/) + 1
      const quoted = /^(['"`])([\s\S]*)\1(?:\s*[;,])?$/.exec(rawValue)
      const value = quoted ? quoted[2] : rawValue.replace(/[;,]$/, '').trimEnd()
      const start = lineStart + line.indexOf(rawValue, delimiterOffset) + (quoted ? 1 : 0)
      const end = start + value.length
      if (SENSITIVE_NAME.test(name) || configured) continue
      const overlapStart = Math.max(match.index, start)
      const overlapEnd = Math.min(match.index + match[0].length, end)
      if (overlapEnd > overlapStart) add(overlapStart, overlapEnd, 'High-entropy token', name)
      continue
    }
    add(match.index, match.index + match[0].length, 'High-entropy token')
  }

  candidates.sort((a, b) => a.start - b.start || b.end - a.end)
  const findings = []
  for (const candidate of candidates) {
    const previous = findings[findings.length - 1]
    if (previous && candidate.start < previous.end) {
      if (candidate.end > previous.end) previous.end = candidate.end
      if (!previous.variableName && candidate.variableName) previous.variableName = candidate.variableName
      if (previous.rule === 'High-entropy token') previous.rule = candidate.rule
      continue
    }
    findings.push({ ...candidate, startLine: lineAt(text, candidate.start), endLine: lineAt(text, candidate.end) })
  }
  return findings
}

function redactContent(text, findings = scanSecrets(text)) {
  let result = text
  for (const finding of [...findings].sort((a, b) => b.start - a.start)) {
    result = `${result.slice(0, finding.start)}[REDACTED]${result.slice(finding.end)}`
  }
  return result
}

function createEnvExample(text) {
  return text.split(/\r?\n/).map((line) => {
    const match = /^(\s*(?:export\s+)?)([A-Za-z_][A-Za-z0-9_.-]*)(\s*=\s*)(.*)$/.exec(line)
    if (!match) return line
    const [, prefix, name, separator] = match
    const normalized = name.toLowerCase()
    let placeholder = `replace-with-${normalized.replace(/[^a-z0-9]+/g, '-')}`
    if (/(?:supabase|database)_url$/.test(normalized)) placeholder = 'https://your-project.supabase.co'
    else if (/(?:anon|publishable|public)[_-]?key$/.test(normalized)) placeholder = 'your-public-client-key'
    else if (/(?:^|_)app_id$/.test(normalized)) placeholder = 'your-app-id'
    return `${prefix}${name}${separator}${placeholder}`
  }).join('\n')
}

module.exports = { scanSecrets, redactContent, createEnvExample }
