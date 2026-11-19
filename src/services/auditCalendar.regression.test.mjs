import assert from 'node:assert/strict'
import { readFileSync } from 'node:fs'
import test from 'node:test'
import vm from 'node:vm'
import ts from 'typescript'
const source = readFileSync(new URL('../App.tsx', import.meta.url), 'utf8')
const tree = ts.createSourceFile('App.tsx', source, ts.ScriptTarget.Latest, true)
const helpers = []
function visit(node) { if (ts.isFunctionDeclaration(node) && ['localDateValue', 'calculateAgeFromDateOfBirth'].includes(node.name?.text)) helpers.push(node.getText(tree)); ts.forEachChild(node, visit) }
visit(tree)
function clock(instant) {
  class PhoenixDate extends Date {
    constructor(...args) { super(...(args.length ? args : [instant])) }
    getFullYear() { return new Date(this.getTime() - 7 * 3600000).getUTCFullYear() }
    getMonth() { return new Date(this.getTime() - 7 * 3600000).getUTCMonth() }
    getDate() { return new Date(this.getTime() - 7 * 3600000).getUTCDate() }
  }
  const context = { Date: PhoenixDate }
  vm.createContext(context); vm.runInContext(ts.transpileModule(helpers.join('\n'), { compilerOptions: { target: ts.ScriptTarget.ES2022 } }).outputText, context)
  return context
}
test('date-only defaults use the existing local calendar helper, never UTC truncation', () => {
  assert.doesNotMatch(source, /new Date\(\)\.toISOString\(\)\.slice\(0,\s*10\)/)
})
for (const [when, expected] of [['2026-10-30T01:00:00Z', '2026-10-29'], ['2026-10-30T06:59:59Z', '2026-10-29'], ['2026-10-30T07:00:00Z', '2026-10-30'], ['2027-01-01T01:00:00Z', '2026-12-31'], ['2027-01-01T07:00:00Z', '2027-01-01'], ['2026-11-01T06:59:59Z', '2026-10-31']]) test(`Phoenix date at ${when} is ${expected}`, () => {
  assert.equal(clock(when).localDateValue(), expected)
})
for (const [when, dob, age] of [['2026-10-29T19:00:00Z', '2000-10-30', '25'], ['2026-10-30T07:00:00Z', '2000-10-30', '26'], ['2025-02-28T19:00:00Z', '2000-02-29', '24'], ['2025-03-01T07:00:00Z', '2000-02-29', '25'], ['2024-02-29T07:00:00Z', '2000-02-29', '24'], ['2026-01-01T07:00:00Z', '2000-01-01', '26'], ['2026-10-29T19:00:00Z', '2026-10-30', ''], ['2026-10-29T19:00:00Z', '2001-02-29', ''], ['2026-10-29T19:00:00Z', '', '']]) test(`DOB ${dob} at ${when} gives ${age || 'unknown'}`, () => {
  assert.equal(clock(when).calculateAgeFromDateOfBirth(dob), age)
})
