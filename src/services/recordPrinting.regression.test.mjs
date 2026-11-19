import assert from 'node:assert/strict'
import { readFileSync, existsSync } from 'node:fs'
import { createRequire } from 'node:module'
import test from 'node:test'
import vm from 'node:vm'
import ts from 'typescript'
import React from 'react'
import * as JSX from 'react/jsx-runtime'
import { renderToStaticMarkup } from 'react-dom/server'
const realRequire = createRequire(import.meta.url)
const id = (n) => '11111111-1111-1111-1111-' + String(n).padStart(12, '0')
const cp = id(1), pe = id(2), rowId = id(3)
const options = { module: ts.ModuleKind.CommonJS, target: ts.ScriptTarget.ES2022, jsx: ts.JsxEmit.ReactJSX }
const app = readFileSync(new URL('../App.tsx', import.meta.url), 'utf8')
const ast = ts.createSourceFile('App.tsx', app, ts.ScriptTarget.Latest, true, ts.ScriptKind.TSX)
function functionSource(name) {
  let found
  function visit(node) { if (ts.isFunctionDeclaration(node) && node.name?.text === name) found = node.getText(ast); else ts.forEachChild(node, visit) }
  visit(ast); assert.ok(found, name); return found
}
function evaluate(source, context, expression) {
  const runtime = vm.createContext({ exports: {}, require: realRequire, ...context })
  vm.runInContext(ts.transpileModule(source + '\nglobalThis.result = ' + expression, { compilerOptions: options }).outputText, runtime)
  return runtime.result
}
function harness({ listFailure = '', foreign = false } = {}) {
  const calls = [], cache = new Map()
  let rowForDetail = { id: rowId, recordId: 'FORM-046', values: { cmps_clientid: cp, cmps_cpid: cp, cmps_peid: pe, cmps_programenrollment: pe, cmps_notes: 'Keep all notes' } }
  function load(name) {
    if (cache.has(name)) return cache.get(name)
    const file = './' + name + '.ts'
    const source = readFileSync(new URL(file, import.meta.url), 'utf8').replaceAll('import.meta.env', '({})')
    const module = { exports: {} }; cache.set(name, module.exports)
    vm.runInNewContext(ts.transpileModule(source, { compilerOptions: options }).outputText, {
      module, exports: module.exports, URL, URLSearchParams, Headers,
      require(key) {
        if (key === '@microsoft/power-apps/data') return { getClient: () => ({ executeAsync: () => { throw Error('Printing must use read adapters, never writes') } }) }
        if (key.includes('dataSourcesInfo')) return { dataSourcesInfo: {} }
        if (key === './auth') return { getAuthToken: () => '', ensureAuthToken: async () => '' }
        if (key.endsWith('.json')) return JSON.parse(readFileSync(new URL(key, import.meta.url), 'utf8'))
        if (key === './clientLinkedRecords') return {
          resolveClientLinkedRecordSource: async (value) => value,
          listClientLinkedRecords: async (source, clientId, enrollments = []) => {
            calls.push({ operation: 'list', source, clientId, enrollments })
            assert.equal(clientId, cp)
            if (listFailure && source.tableAlias.includes(listFailure)) throw Error('Read unavailable')
            const ownId = source.tableAlias === 'cmps_programenrollment1s' ? pe : rowId
            return [{ id: ownId, recordId: ownId === pe ? 'PE-046' : 'FORM-046', createdOn: '2026-10-22' }]
          },
        }
        if (key.startsWith('./')) return load(key.slice(2))
        throw Error(key)
      },
    }, { filename: name })
    if (!['recordPrinting', 'appVersion'].includes(name)) {
      for (const key of Object.keys(module.exports)) if (/^load.*DetailRecord$/.test(key)) module.exports[key] = async (requested) => {
        calls.push({ operation: 'detail', name, requested })
        return { ...rowForDetail, id: requested, values: { ...rowForDetail.values, ...(foreign ? { cmps_clientid: id(9), cmps_cpid: id(9), cmps_peid: id(9), cmps_programenrollment: id(9) } : {}) } }
      }
      if (name === 'clientConsentForms') module.exports.loadClientConsentFormRecord = async (kind, requested, clientId, enrollments) => {
        calls.push({ operation: 'consent', kind, requested, clientId, enrollments }); assert.equal(clientId, cp); assert.ok(enrollments.includes(pe))
        return { ...rowForDetail, id: requested }
      }
      if (name === 'householdHistory') module.exports.listHouseholdHistoriesForClient = async (clientId) => { assert.equal(clientId, cp); return [{ householdRowId: rowId }] }
      if (name === 'household') module.exports.listHouseholdsByIds = async (ids) => ids.map((id) => ({ id, recordId: 'HH-046' }))
    }
    return module.exports
  }
  return { calls, api: load('recordPrinting'), load, setDetail: (value) => { rowForDetail = value } }
}
test('print catalog is client-scoped, permission filtered, sorted by form, includes the profile, and excludes global/Event tables', async () => {
  const h = harness()
  const catalog = await h.api.listClientPrintCatalog(cp, 'CP-046', (name) => ['Client Profile', 'Services', 'Medical Consent Form'].includes(name))
  assert.equal(catalog.groups[0].kind, 'client-profile')
  assert.deepEqual(Array.from(catalog.groups, (group) => group.formName), ['Client Profile', 'Medical Consent Form', 'Services'])
  assert.deepEqual(Array.from(catalog.enrollmentIds), [pe])
  assert.ok(h.calls.filter((call) => call.operation === 'list').every((call) => call.clientId === cp))
  assert.equal(h.calls.filter((call) => call.source?.tableAlias === 'cmps_serviceses')[0].source.enrollmentLookup, 'cmps_programenrollment')
  assert.ok(!catalog.groups.some((group) => /event|funder|contract/i.test(group.formName)))
  const denied = harness(); await assert.rejects(denied.api.listClientPrintCatalog(cp, 'CP-046', () => false), /cannot print/); assert.equal(denied.calls.length, 0)
})
test('all developed client-linked forms use their current aliases; errors are visible without claiming zero records', async () => {
  const h = harness({ listFailure: 'medicalconsent' })
  const catalog = await h.api.listClientPrintCatalog(cp, 'CP-046', () => true)
  assert.equal(catalog.groups.length, 27)
  assert.ok(catalog.groups.find((group) => group.formName === 'Medical Consent Form').error)
  for (const alias of ['cmps_acknowledgementandconsentforms', 'cmps_animalagreements', 'cmps_financialassistances', 'cmps_shelterprogramguidelineses']) assert.ok(h.calls.some((call) => call.source?.tableAlias === alias), alias)
})
test('print detail loading preserves IDs and parent links, refuses foreign/unselected records and rechecks View permissions', async () => {
  const h = harness(), canView = () => true
  const catalog = await h.api.listClientPrintCatalog(cp, 'CP-046', canView)
  for (const kind of ['services', 'program-enrollment', 'medical-consent', 'voca-form', 'household']) {
    const ref = catalog.groups.find((group) => group.kind === kind).records[0]
    const detail = await h.api.loadClientPrintRecord(ref, catalog, canView)
    assert.equal(detail.id, ref.id); assert.equal(detail.values.cmps_notes, 'Keep all notes')
    await assert.rejects(h.api.loadClientPrintRecord(ref, catalog, () => false), /not available/)
  }
  const ref = catalog.groups.find((group) => group.kind === 'services').records[0]
  await assert.rejects(h.api.loadClientPrintRecord({ ...ref, key: 'foreign', id: id(9) }, catalog, canView), /not available/)
  await assert.rejects(h.api.loadClientPrintRecord({ ...ref, formName: 'Client Profile' }, catalog, canView), /not available/)
  const foreign = harness({ foreign: true }), foreignCatalog = await foreign.api.listClientPrintCatalog(cp, 'CP-046', canView)
  await assert.rejects(foreign.api.loadClientPrintRecord(foreignCatalog.groups.find((group) => group.kind === 'services').records[0], foreignCatalog, canView), /no longer linked/)
})
test('Program Enrollment print ownership uses the retained lookup GUID, not its hydrated CP display ID', async () => {
  const h = harness(), canView = () => true
  const catalog = await h.api.listClientPrintCatalog(cp, 'CP-046', canView)
  const ref = catalog.groups.find((group) => group.kind === 'program-enrollment').records[0]
  h.setDetail({ id: pe, recordId: 'PE-044479', clientRowId: cp, values: { cmps_clientid: 'CP-046', cmps_notes: 'Enrollment notes' } })
  const detail = await h.api.loadClientPrintRecord(ref, catalog, canView)
  assert.equal(detail.id, pe); assert.equal(detail.values.cmps_clientid, 'CP-046')
  h.setDetail({ id: pe, recordId: 'PE-044479', clientRowId: id(9), values: { cmps_clientid: 'CP-046' } })
  await assert.rejects(h.api.loadClientPrintRecord(ref, catalog, canView), /no longer linked/)
  h.setDetail({ id: pe, recordId: 'PE-044479', values: { cmps_clientid: 'CP-046' } })
  await assert.rejects(h.api.loadClientPrintRecord(ref, catalog, canView), /no longer linked/)
})

test('record preparation preserves selection order and bounds concurrent requests', async () => {
  const { api } = harness(); let inFlight = 0, maximum = 0
  const result = await api.mapPrintItems([1, 2, 3, 4, 5, 6], async (n) => { maximum = Math.max(maximum, ++inFlight); await new Promise((resolve) => setTimeout(resolve, 2)); inFlight--; return n * 2 }, 2)
  assert.equal(maximum, 2); assert.deepEqual(Array.from(result), [2, 4, 6, 8, 10, 12])
})
test('print mode uses static complete values rather than clipped controls and escapes note HTML', () => {
  const render = evaluate(functionSource('ReadOnlyFormSections'), { normalize: (value) => String(value || '').trim().toLowerCase(), FormInput: (props) => React.createElement('input', props) }, 'ReadOnlyFormSections')
  const notes = 'Long narrative <script>unsafe</script>\n' + 'All notes remain readable. '.repeat(120)
  const html = renderToStaticMarkup(React.createElement(render, { printMode: true, fields: [
    { field: 'cmps_notes', label: 'Notes', input: 'textarea', section: 'Main' },
    { field: 'cmps_yes', label: 'Answer', input: 'radio', options: ['Yes', 'No'], section: 'Main' },
    { field: 'cmps_file', label: 'Upload', input: 'file', section: 'Main' },
  ], values: { cmps_notes: notes, cmps_yes: 'Yes', cmps_file: id(4) }, sections: ['Main'], idPrefix: 'test' }))
  assert.equal((html.match(/All notes remain readable\./g) || []).length, 120)
  assert.match(html, /\(x\) Yes/); assert.match(html, /Attached file/)
  assert.match(html, /&lt;script&gt;/); assert.doesNotMatch(html, /<script>|<input|<textarea|<button/)
})
function modalHarness({ fail = false } = {}) {
  const state = [], dependencies = [], effects = [], cleanup = [], calls = []; let index = 0, dirty = false, tree
  const ref = (kind, number) => ({ key: kind + ':' + id(number), id: id(number), recordId: kind === 'client-profile' ? 'CP-046' : 'SV-046', kind, formName: kind === 'client-profile' ? 'Client Profile' : 'Services' })
  const profile = ref('client-profile', 1), service = ref('services', 3)
  const catalog = { clientId: cp, enrollmentIds: [pe], groups: [{ kind: 'client-profile', formName: 'Client Profile', records: [profile] }, { kind: 'services', formName: 'Services', records: [service] }] }
  const module = { exports: {} }
  vm.runInNewContext(ts.transpileModule(readFileSync(new URL('./RecordPrintDialog.tsx', import.meta.url), 'utf8'), { compilerOptions: options }).outputText, {
    module, exports: module.exports, document: { body: {} }, window: { print: () => calls.push('print') },
    require(name) {
      if (name === 'react') return { ...React,
        useState(initial) { const i = index++; if (!(i in state)) state[i] = initial; return [state[i], (value) => { state[i] = typeof value === 'function' ? value(state[i]) : value; dirty = true }] },
        useRef(value) { const i = index++; return state[i] ||= { current: value } },
        useEffect(effect, deps) { const i = index++; if (!dependencies[i] || deps.some((value, k) => !Object.is(value, dependencies[i][k]))) { dependencies[i] = deps; effects.push(() => { cleanup[i]?.(); cleanup[i] = effect() }) } },
      }
      if (name === 'react-dom') return { createPortal: (node) => node }
      if (name === 'react/jsx-runtime') return JSX
      if (name.endsWith('.css')) return {}
      if (name === './recordPrinting') return { mapPrintItems: async (items, task) => Promise.all(items.map(task)) }
      throw Error(name)
    },
  })
  const props = { includeProfile: true, clientLabel: 'CP-046 - Example Client', onClose: () => calls.push('close'), loadCatalog: async () => catalog,
    loadRecord: async (record) => { calls.push(record.kind); if (fail && record.kind === 'services') throw Error('Read denied'); return React.createElement('p', null, 'Saved ' + record.recordId) } }
  return { calls, props, render() { let count = 0; do { dirty = false; index = 0; tree = module.exports.default(props); while (effects.length) effects.shift()(); assert.ok(++count < 15) } while (dirty); return tree }, unmount() { cleanup.forEach((fn) => fn?.()) } }
}
function elements(node, predicate) { const result = []; function visit(value) { if (Array.isArray(value)) value.forEach(visit); else if (React.isValidElement(value)) { if (predicate(value)) result.push(value); visit(value.props.children) } } visit(node); return result }
const text = (node) => typeof node === 'string' || typeof node === 'number' ? String(node) : Array.isArray(node) ? node.map(text).join('') : React.isValidElement(node) ? text(node.props.children) : ''
const btn = (tree, label) => elements(tree, (node) => node.type === 'button' && text(node) === label)[0]
async function settle(h) { let tree; for (let i = 0; i < 4; i++) { tree = h.render(); for (let k = 0; k < 15; k++) await Promise.resolve() } return h.render() }
test('overview modal includes the profile, supports all-record selection, invalidates old preview and prints only on user click', async () => {
  const h = modalHarness(); let tree = await settle(h)
  assert.deepEqual(h.calls, ['client-profile']); assert.equal(btn(tree, 'Print / Save as PDF').props.disabled, false)
  const all = elements(tree, (node) => node.props.label === 'Select all available records')[0]
  all.props.onChange(); tree = h.render()
  assert.equal(btn(tree, 'Print / Save as PDF').props.disabled, true)
  btn(tree, 'Preview selected records (2)').props.onClick(); tree = await settle(h)
  assert.ok(h.calls.includes('services')); assert.equal(h.calls.includes('print'), false)
  btn(tree, 'Print / Save as PDF').props.onClick(); assert.equal(h.calls.at(-1), 'print')
  const allAgain = elements(tree, (node) => node.props.label === 'Select all available records')[0]
  allAgain.props.onChange(); tree = h.render(); assert.ok(btn(tree, 'Preview selected records (1)'), 'Profile cannot be deselected')
  h.unmount()
})
test('failed selected records block partial packet printing and keep the selection for retry', async () => {
  const h = modalHarness({ fail: true }); let tree = await settle(h)
  elements(tree, (node) => node.props.label === 'Select all available records')[0].props.onChange(); tree = h.render()
  btn(tree, 'Preview selected records (2)').props.onClick(); tree = await settle(h)
  assert.match(text(tree), /No partial packet will be printed/); assert.match(text(tree), /Read denied/)
  assert.equal(btn(tree, 'Print / Save as PDF').props.disabled, true); assert.ok(btn(tree, 'Preview selected records (2)')); h.unmount()
})
test('view action integration is permission checked, does not print edits and uses isolated print-only page styles', () => {
  assert.match(functionSource('getViewedRecordForPrint'), /selectedHubPage !== 'search'/)
  assert.match(functionSource('openClientPrint'), /canAccessClientFormAction\('Client Profile', 'view'\)/)
  assert.match(functionSource('renderViewFormActions'), /'edit'/); assert.match(functionSource('renderViewFormActions'), /Print record/)
  assert.match(app, /Print client records/)
  const css = readFileSync(new URL('./RecordPrint.css', import.meta.url), 'utf8')
  assert.match(css, /@page compass-record/); assert.match(css, /break-after: page/); assert.match(css, /white-space: pre-wrap/)
  assert.match(css, /record-print-controls, .record-print-selector \{ display: none !important/)
})
test('Print targets the visible full Client Profile rather than stale child or inline view state', () => {
  const detail = { id: cp, recordId: 'CP-046', values: {} }
  const result = evaluate(functionSource('getViewedRecordForPrint'), {
    recordFormView: null, activeFormSession: null,
    view: 'home', selectedHubPage: 'search', householdView: null, selectedDetailRecord: detail, selectedShowFullDetail: true,
    clientConsentView: { clientId: cp, kind: 'medical-consent', detail: { id: rowId, recordId: 'MC-046', values: {} } },
    recordViewContext: { tableAlias: 'cmps_serviceses', rowId }, printRecordRef: (kind, row) => ({ kind, ...row }),
  }, 'getViewedRecordForPrint()')
  assert.equal(result.ref.kind, 'client-profile'); assert.equal(result.detail.id, cp)
})
