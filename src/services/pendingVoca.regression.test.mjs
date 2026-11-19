import assert from 'node:assert/strict'
import { readFileSync } from 'node:fs'
import test from 'node:test'
import vm from 'node:vm'
import ts from 'typescript'

function loadPendingVocaRules() {
  const source = readFileSync(new URL('./pendingVoca.ts', import.meta.url), 'utf8')
  const compiled = ts.transpileModule(source, {
    compilerOptions: { module: ts.ModuleKind.CommonJS, target: ts.ScriptTarget.ES2022 },
  }).outputText
  const module = { exports: {} }
  const context = { module, exports: module.exports }
  vm.createContext(context)
  vm.runInContext(compiled, context)
  return module.exports
}

test('VOCA pending-item rule supports enrollment and linked-service funding', () => {
  const { getPendingVocaReason } = loadPendingVocaRules()
  const vocaId = '11111111-1111-1111-1111-111111111111'

  assert.equal(getPendingVocaReason('VOCA', []), 'program-enrollment')
  assert.equal(getPendingVocaReason(`  ${vocaId.toUpperCase()}  `, [], [vocaId]), 'program-enrollment')
  assert.equal(getPendingVocaReason('OVW', ['Housing', ' voca ']), 'linked-service')
  assert.equal(getPendingVocaReason('OVW', ['Housing', vocaId], [vocaId]), 'linked-service')
  assert.equal(getPendingVocaReason('OVW', ['Housing', 'DES']), null)
})

test('enrollment funding remains the primary pending-item reason', () => {
  const { getPendingVocaReason } = loadPendingVocaRules()
  assert.equal(getPendingVocaReason('VOCA', ['VOCA']), 'program-enrollment')
})
