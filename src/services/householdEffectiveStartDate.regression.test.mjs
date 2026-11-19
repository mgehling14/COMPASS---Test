import assert from 'node:assert/strict'
import { readFileSync } from 'node:fs'
import test from 'node:test'

test('Household Effective Start Date is an editable date field', () => {
  const source = readFileSync(new URL('./household.ts', import.meta.url), 'utf8')
  const definition = source.match(/\{ field: 'cmps_effectivestartdate'[^}]*\}/)?.[0] || ''
  assert.match(definition, /input: 'date'/)
  assert.doesNotMatch(definition, /readOnly:\s*true/)
})

