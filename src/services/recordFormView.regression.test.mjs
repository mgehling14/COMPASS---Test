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
const id = (n) => '11111111-1111-1111-1111-' + String(n).padStart(12, '0')
const profile = { id: id(1), recordId: 'CP-046', values: { cmps_name: 'Example' } }
const detail = { id: id(3), recordId: 'FORM-046', values: { cmps_notes: 'Existing notes' } }
function source(name) {
  let found
  function visit(node) { if (ts.isFunctionDeclaration(node) && node.name?.text === name) found = node.getText(ast); else ts.forEachChild(node, visit) }
  visit(ast); assert.ok(found, name); return found
}
function evaluate(code, context, expression) {
  const runtime = vm.createContext({ exports: {}, require, ...context })
  vm.runInContext(ts.transpileModule(code + '\n;globalThis.result = ' + expression, { compilerOptions: options }).outputText, runtime)
  return runtime.result
}
test('all specialized View handlers dispatch the loaded row to the dedicated read-only form screen', async () => {
  const handlers = {
    openProgramEnrollmentDetail: 'program-enrollment', openServicesDetail: 'services', openServicesDetailFromClient: 'services',
    openBedEnrollmentDetail: 'bed-enrollment', openBedEnrollmentDetailFromClient: 'bed-enrollment',
    openChildSafetyPlanDetailFromClient: 'child-safety-plan', openElectronicDocumentDetailFromClient: 'electronic-document',
    openAdultAssessmentDetailFromClient: 'adult-assessment', openHealthWellnessDetailFromClient: 'health-wellness',
    openFocusPlanDetailFromClient: 'focus-plan', openInitialSafetyPlanDetailFromClient: 'initial-safety-plan',
    openGoalDetailFromClient: 'goals', openHelplineDetail: 'helpline', openEventDetail: 'event',
  }
  for (const [name, kind] of Object.entries(handlers)) {
    const calls = [], context = { selectedHub: { id: 'hub' }, selectedDetailRecord: profile }
    const code = source(name)
    for (const match of code.matchAll(/\b(set[A-Z]\w+|load[A-Z]\w+|scrollToTopOfPage)\b/g)) context[match[0]] = match[0].startsWith('load') ? async () => detail : () => {}
    context.openRecordFormView = (...args) => calls.push(args)
    const open = evaluate(code, context, name)
    if (['openProgramEnrollmentDetail', 'openServicesDetail', 'openBedEnrollmentDetail', 'openHelplineDetail', 'openEventDetail'].includes(name)) await open(detail.id, detail.recordId, true)
    else await open({ ...detail, programEnrollmentRowId: id(2), programEnrollmentRecordId: 'PE-046' })
    assert.equal(calls.length, 1, name); assert.equal(calls[0][0], kind, name); assert.equal(calls[0][1].id, detail.id, name)
  }
})
test('generic linked form View, Household View, and full Client Profile use the same dedicated reader', () => {
  assert.match(source('openClientConsentForm'), /openRecordFormView\(kind, detail, clientId\)/)
  assert.match(source('viewHouseholdRecord'), /openRecordFormView\('household', detail, clientId\)/)
  assert.match(source('openFullClientProfileDetail'), /openRecordFormView\('client-profile', selectedDetailRecord\)/)
  assert.match(app, /recordFormView && !activeFormSession \? \(\s*<article className="panel wide hub-card hub-form-editor hub-view-record-editor"/)
  assert.match(app, /renderPrintableRecord\(recordFormView.kind, recordFormView.detail, false\)/)
})
test('reader navigation preserves client origin, requires View permission, and ignores loads after a client/hub change', () => {
  for (const scenario of ['allowed', 'denied', 'different-client', 'different-hub']) {
    const state = {}, context = {
      selectedHub: { id: 'hub' }, selectedDetailRecord: profile, selectedAppNav: 'clients',
      PRINT_FORM_NAMES: { services: 'Services' }, canAccessClientFormAction: (_name, action) => action === 'view' && scenario !== 'denied',
      recordFormLocation: { current: { hubId: scenario === 'different-hub' ? 'other' : 'hub', clientId: scenario === 'different-client' ? id(9) : profile.id } },
      setRecordFormView: (value) => { state.reader = value }, setActiveFormSession: (value) => { state.editor = value },
      setActiveFormError: () => {}, setSelectedHubPages: (update) => { state.pages = update({}) }, scrollToTopOfPage: () => {},
    }
    evaluate(source('openRecordFormView'), context, 'openRecordFormView')('services', detail)
    if (scenario !== 'allowed') { assert.equal(state.reader, undefined, scenario); continue }
    assert.equal(state.reader.client.id, profile.id); assert.equal(state.reader.detail.id, detail.id)
    assert.equal(state.reader.appNav, 'clients'); assert.equal(state.pages.hub, 'forms'); assert.equal(state.editor, null)
  }
})
test('Back clears enrollment and child views together and returns directly to the originating client', () => {
  const state = {}, context = {
    recordFormView: { kind: 'services', detail, hubId: 'hub', client: profile, appNav: 'programs' },
    clientConsentRequest: { current: 0 }, scrollToTopOfPage: () => {},
  }
  for (const match of source('closeRecordFormView').matchAll(/\b(set[A-Z]\w+)\b/g)) context[match[0]] = (value) => { state[match[0]] = typeof value === 'function' ? value({}) : value }
  evaluate(source('closeRecordFormView'), context, 'closeRecordFormView')()
  for (const field of ['setRecordFormView', 'setClientConsentView', 'setHouseholdView', 'setSelectedProgramEnrollmentDetail', 'setSelectedServicesDetail', 'setSelectedBedEnrollmentDetail']) assert.equal(state[field], null, field)
  assert.equal(state.setSelectedAppNav, 'clients'); assert.equal(state.setSelectedHubPages.hub, 'search')
  assert.equal(state.setActiveSearchDetailByHub.hub.id, profile.id)
  assert.equal(state.setShowFullDetailByHub.hub, false)
  assert.match(source('closeViewedRecordActions'), /closeRecordFormView\(\); return/)
})
test('Print and Edit target the dedicated record, even when a parent or old inline detail is still loaded', () => {
  const result = evaluate(source('getViewedRecordForPrint'), {
    recordFormView: { kind: 'services', detail }, activeFormSession: null, selectedHubPage: 'forms',
    printRecordRef: (kind, row) => ({ kind, ...row }),
  }, 'getViewedRecordForPrint()')
  assert.equal(result.ref.kind, 'services'); assert.equal(result.detail.id, detail.id)
  const editing = evaluate(source('getViewedRecordForPrint'), {
    recordFormView: { kind: 'services', detail }, activeFormSession: { kind: 'services' }, selectedHubPage: 'forms', view: 'home',
  }, 'getViewedRecordForPrint()')
  assert.equal(editing, null)
})
test('the shared record layout uses disabled form controls for viewing and static values only when printing', () => {
  const fields = [{ field: 'cmps_notes', label: 'Notes', input: 'textarea', section: 'Main' }]
  const render = evaluate(source('renderPrintableRecord'), {
    ReadOnlyFormSections: ({ printMode }) => React.createElement('div', { 'data-print': String(printMode) }),
    HOUSEHOLD_FIELD_DEFINITIONS: fields,
  }, 'renderPrintableRecord')
  assert.match(renderToStaticMarkup(render('household', detail, false)), /data-print="false"/)
  assert.match(renderToStaticMarkup(render('household', detail)), /data-print="true"/)
  const readonly = evaluate(source('ReadOnlyFormSections'), { normalize: (s) => String(s || '').toLowerCase() }, 'ReadOnlyFormSections')
  const html = renderToStaticMarkup(React.createElement(readonly, { fields, values: detail.values, sections: ['Main'], idPrefix: 'view' }))
  assert.match(html, /<textarea[^>]*disabled/); assert.match(html, /Existing notes/); assert.doesNotMatch(html, /Save Form/)
})

