import assert from 'node:assert/strict'
import { readFileSync } from 'node:fs'
import { createRequire } from 'node:module'
import test from 'node:test'
import vm from 'node:vm'
import ts from 'typescript'
import React from 'react'
import { renderToStaticMarkup } from 'react-dom/server'
const require = createRequire(import.meta.url)
const app = readFileSync(new URL('../App.tsx', import.meta.url), 'utf8')
const ast = ts.createSourceFile('App.tsx', app, ts.ScriptTarget.Latest, true, ts.ScriptKind.TSX)
const options = { module: ts.ModuleKind.CommonJS, target: ts.ScriptTarget.ES2022, jsx: ts.JsxEmit.ReactJSX }
const cp = '11111111-1111-1111-1111-111111111111', other = '22222222-2222-2222-2222-222222222222'
const profile = { id: cp, recordId: 'CP-045133', values: {} }
const normalizeGuidText = (value) => String(value || '').trim().replace(/[{}]/g, '').toLowerCase()
const isGuidText = (value) => /^[a-f\d]{8}(?:-[a-f\d]{4}){3}-[a-f\d]{12}$/i.test(normalizeGuidText(value))
const walk = (node, fn) => { fn(node); ts.forEachChild(node, (child) => walk(child, fn)) }
function source(name) { let found; walk(ast, (n) => { if (ts.isFunctionDeclaration(n) && n.name?.text === name) found = n.getText(ast) }); assert.ok(found, name); return found }
function evaluate(code, context, expression) {
  const runtime = vm.createContext({ exports: {}, require, ...context })
  vm.runInContext(ts.transpileModule(code + '\n;globalThis.result = ' + expression, { compilerOptions: options }).outputText, runtime)
  return runtime.result
}
function context(extra = {}) {
  return { normalize: (value) => String(value || '').trim().toLowerCase(), normalizeGuidText, isGuidText, selectedDetailRecord: profile, formReturnState: null, recordFormView: null,
    programEnrollmentsForClient: [], selectedProgramEnrollmentDetail: null, ...extra }
}
test('client lookup formatter uses the matching in-app ID from the opened, captured, or read-only client; never leaks or substitutes a foreign GUID', () => {
  for (const extra of [{}, { selectedDetailRecord: null, formReturnState: { clientProfileDetail: profile } }, { selectedDetailRecord: null, recordFormView: { client: profile } }]) {
    const format = evaluate(source('formatLookupDisplayValue'), context(extra), 'formatLookupDisplayValue')
    for (const field of ['cmps_cpid', 'cmps_clientid']) {
      assert.equal(format(field, cp), 'CP-045133')
      assert.equal(format(field, '{' + cp.toUpperCase() + '}'), 'CP-045133')
      assert.equal(format(field, 'CP-045133'), 'CP-045133')
      assert.equal(format(field, other), 'Client Profile')
      assert.equal(format(field, ''), '')
    }
    assert.equal(format('cmps_notes', cp), cp, 'Do not rewrite unrelated text')
  }
})
test('the shared Client Profile control displays CP ID, is disabled/read-only, has no change handler, and leaves the stored GUID intact', () => {
  const values = { cmps_cpid: cp }
  const render = evaluate(source('formatLookupDisplayValue') + '\n' + source('renderClientProfileLookupField'), context(), 'renderClientProfileLookupField')
  const element = render({ field: 'cmps_cpid', label: 'Client Profile', required: true }, values.cmps_cpid)
  const html = renderToStaticMarkup(element)
  assert.match(html, /value="CP-045133"/); assert.doesNotMatch(html, new RegExp(cp))
  assert.match(html, /readOnly=""/); assert.match(html, /disabled=""/); assert.equal(values.cmps_cpid, cp)
  const input = React.Children.toArray(element.props.children).find((node) => node.type === 'input')
  assert.equal(input.props.onChange, undefined)
})
test('every Client Profile editor lookup uses the locked display before picklist overrides or editable fallback controls', () => {
  const callbacks = []
  walk(ast, (node) => {
    if (ts.isCallExpression(node) && node.expression.getText(ast).endsWith('.map') && ts.isArrowFunction(node.arguments[0]) && node.arguments[0].parameters[0]?.name.getText(ast) === 'fieldDef' && node.arguments[0].getText(ast).includes('return renderClientProfileLookupField(fieldDef, value)')) callbacks.push(node.arguments[0])
  })
  assert.equal(callbacks.length, 13)
  const fields = { field: 'cmps_cpid', label: 'Client Profile', input: 'lookup', options: [], section: 'Main' }
  for (const callback of callbacks) {
    const values = { cmps_cpid: cp, cmps_clientid: cp }
    const code = source('formatLookupDisplayValue') + '\n' + source('renderClientProfileLookupField')
    const render = evaluate(code, context({ activeFormSession: { values }, values, section: 'Main' }), '(' + callback.getText(ast) + ')')
    for (const field of ['cmps_cpid', 'cmps_clientid']) {
      const html = renderToStaticMarkup(render({ ...fields, field }))
      assert.match(html, /value="CP-045133"/); assert.match(html, /disabled=""/); assert.doesNotMatch(html, new RegExp(cp))
      assert.equal(values[field], cp)
    }
  }
  const personEditor = app.slice(app.indexOf("activeFormSession?.kind === 'person-you-are-fleeing-profile' ? ("), app.indexOf("activeFormSession?.kind === 'medical-consent-form' ? ("))
  assert.match(personEditor, /return renderClientProfileLookupField/)
})
test('Helpline and Adult Assessment show CP IDs in read-only form and print layouts as well', () => {
  const fields = [{ field: 'cmps_cpid', label: 'Client Profile', input: 'readonly', options: [], section: 'Main' }]
  const render = evaluate(source('formatLookupDisplayValue') + '\n' + source('ReadOnlyFormSections') + '\n' + source('renderPrintableRecord'), context({
    FormInput: (props) => React.createElement('input', props), normalize: (v) => String(v || '').toLowerCase(),
    HELPLINE_FIELD_DEFINITIONS: fields, ADULT_ASSESSMENT_FIELDS: fields, isHelplineFieldVisible: () => true, getHelplineFormSection: () => 'Main',
  }), 'renderPrintableRecord')
  for (const kind of ['helpline', 'adult-assessment']) for (const print of [false, true]) {
    const html = renderToStaticMarkup(render(kind, { id: other, recordId: 'FORM-046', values: { cmps_cpid: cp } }, print))
    assert.match(html, /CP-045133/); assert.doesNotMatch(html, new RegExp(cp))
  }
})

