'use strict'

const test = require('node:test')
const assert = require('node:assert/strict')
const fs = require('node:fs')
const path = require('node:path')

const manifest = require('../package.json')
const source = fs.readFileSync(path.join(__dirname, '..', 'extension.js'), 'utf8')

test('every contributed command has an implementation', () => {
  for (const command of manifest.contributes.commands) {
    assert.ok(source.includes(`'${command.command}'`), `Missing command handler: ${command.command}`)
  }
})

test('Secret Shield settings have safe defaults and no token storage setting', () => {
  const properties = manifest.contributes.configuration.properties
  assert.equal(properties['maiCorpCompanion.secretShield.enabled'].default, true)
  assert.deepEqual(properties['maiCorpCompanion.sensitiveNames'].default, [])
  assert.ok(properties['maiCorpCompanion.secretShield.enabled'])
  assert.equal(Object.keys(properties).some((key) => /token|password|credential/i.test(key)), false)
})
