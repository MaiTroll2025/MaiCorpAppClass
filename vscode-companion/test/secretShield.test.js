'use strict'

const test = require('node:test')
const assert = require('node:assert/strict')
const { scanSecrets, redactContent, createEnvExample } = require('../secretShield')

test('detects sensitive assignments without returning or rendering their values', () => {
  const text = 'SUPABASE_SERVICE_ROLE_KEY=super-secret-value\n'
  const findings = scanSecrets(text)
  assert.equal(findings.length, 1)
  assert.equal(findings[0].variableName, 'SUPABASE_SERVICE_ROLE_KEY')
  assert.equal(JSON.stringify(findings).includes('super-secret-value'), false)
  assert.equal(redactContent(text, findings), 'SUPABASE_SERVICE_ROLE_KEY=[REDACTED]\n')
})

test('detects provider tokens, JWTs, URLs, and private-key blocks', () => {
  const providerKey = `sk-or-v1-${'a'.repeat(30)}`
  const jwt = `${'eyJ' + 'a'.repeat(12)}.${'b'.repeat(12)}.${'c'.repeat(12)}`
  const database = 'postgres://learner:secretPass!@db.example.test/app'
  const pem = '-----BEGIN PRIVATE KEY-----\nsynthetic-private-material\n-----END PRIVATE KEY-----'
  const text = `${providerKey}\n${jwt}\n${database}\n${pem}`
  const findings = scanSecrets(text)
  assert.ok(findings.some((finding) => finding.rule === 'OpenRouter API key'))
  assert.ok(findings.some((finding) => finding.rule === 'JWT'))
  assert.ok(findings.some((finding) => finding.rule === 'Database URL password'))
  assert.ok(findings.some((finding) => finding.rule === 'Private key'))
  assert.equal(redactContent(text, findings).includes('secretPass!'), false)
})

test('does not flag common safe examples or public Supabase configuration', () => {
  const text = [
    'SUPABASE_SERVICE_ROLE_KEY=replace-with-server-only-secret',
    'VITE_SUPABASE_ANON_KEY=public-client-key',
    'API_TOKEN=your-example-token',
  ].join('\n')
  assert.deepEqual(scanSecrets(text), [])
})

test('redacts multiple values while leaving the source text untouched', () => {
  const text = 'TOKEN=alpha-secret\nPASSWORD=another-secret'
  const findings = scanSecrets(text)
  const sanitized = redactContent(text, findings)
  assert.equal(text, 'TOKEN=alpha-secret\nPASSWORD=another-secret')
  assert.equal(sanitized, 'TOKEN=[REDACTED]\nPASSWORD=[REDACTED]')
})

test('supports user-defined sensitive names and ignores public names', () => {
  const text = 'CLASSROOM_CODE=secretvalue123\nPUBLIC_KEY=public-value'
  const findings = scanSecrets(text, ['CLASSROOM_CODE'])
  assert.equal(findings.length, 1)
  assert.equal(findings[0].variableName, 'CLASSROOM_CODE')
})

test('creates placeholder-only environment examples without modifying original values', () => {
  const source = 'VITE_SUPABASE_URL=https://private-project.example\nSUPABASE_SERVICE_ROLE_KEY=synthetic-secret-value\nVITE_AGORA_APP_ID=abc123'
  const example = createEnvExample(source)
  assert.equal(example, 'VITE_SUPABASE_URL=https://your-project.supabase.co\nSUPABASE_SERVICE_ROLE_KEY=replace-with-supabase-service-role-key\nVITE_AGORA_APP_ID=your-app-id')
  assert.equal(example.includes('private-project'), false)
  assert.equal(example.includes('synthetic-secret-value'), false)
  assert.equal(source.includes('synthetic-secret-value'), true)
})
