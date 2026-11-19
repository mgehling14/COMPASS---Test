import assert from 'node:assert/strict'
import { readFileSync } from 'node:fs'
import test from 'node:test'
import vm from 'node:vm'
import ts from 'typescript'
import React from 'react'
import * as JSX from 'react/jsx-runtime'
import { renderToStaticMarkup } from 'react-dom/server'
const id = (n) => '11111111-1111-1111-1111-' + String(n).padStart(12, '0')
const options = { module: ts.ModuleKind.CommonJS, target: ts.ScriptTarget.ES2022, jsx: ts.JsxEmit.ReactJSX }
function loader(deps = {}, globals = {}) {
  const cache = new Map()
  function load(name) {
    if (cache.has(name)) return cache.get(name)
    let source
    try { source = readFileSync(new URL('./' + name + '.ts', import.meta.url), 'utf8') } catch { source = readFileSync(new URL('./' + name + '.tsx', import.meta.url), 'utf8') }
    source = source.replaceAll('import.meta.env', '({})')
    const module = { exports: {} }; cache.set(name, module.exports)
    vm.runInNewContext(ts.transpileModule(source, { compilerOptions: options }).outputText, {
      exports: module.exports, module, URL, URLSearchParams, Headers, AbortController, ...globals,
      require(key) {
        if (key in deps) return deps[key]
        if (key === 'react') return React
        if (key === 'react/jsx-runtime') return JSX
        if (key.startsWith('./')) return load(key.slice(2))
        if (key.includes('dataSourcesInfo')) return { dataSourcesInfo: {} }
        if (key === '@microsoft/power-apps/data') return { getClient: () => ({ executeAsync: () => assert.fail('Unexpected record/file download') }) }
        throw Error(key)
      },
    })
    return module.exports
  }
  return load
}
const load = loader(), files = load('recordAttachments'), Buttons = load('RecordAttachmentButtons').default
const noWrite = () => assert.fail('No edit/save operation should run when viewing files')
test('all implemented file-upload fields have registered file-view slots; invalid/empty IDs never become links', () => {
  const known = [['childSafetyPlan', 'child-safety-plan'], ['electronicDocument', 'electronic-document'], ['personYouAreFleeingProfile', 'person-you-are-fleeing'], ['event', 'event']]
  let count = 0
  for (const [module, key] of known) {
    const source = readFileSync(new URL('./' + module + '.ts', import.meta.url), 'utf8')
    const fields = [...source.matchAll(/field: '(cmps_\w+)'[^\n]+input: 'file'/g)].map((match) => match[1]).sort()
    assert.deepEqual(Array.from(files.recordAttachmentFields(key), (field) => field.field).sort(), fields); count += fields.length
    for (const field of fields) {
      assert.equal(files.recordAttachments(key, { [field]: '{' + id(4).toUpperCase() + '}' })[0].id, id(4))
      for (const bad of ['', null, 'javascript:bad', 'https://example.test/file', 'FILE-046']) assert.equal(files.recordAttachments(key, { [field]: bad }).length, 0)
    }
  }
  assert.equal(count, 5)
  assert.equal(files.recordAttachments('person-you-are-fleeing-profile', { _cmps_fileid1_value: id(5) })[0].id, id(5))
})
test('buttons open the exact saved file slot only on click, distinguish Event slots, and respect disabled/empty states', () => {
  const attachments = files.recordAttachments('event', { _cmps_fileid1_value: id(1), _cmps_fileid2_value: id(2) }), calls = []
  const tree = Buttons({ attachments, onOpenFile: (value) => calls.push(value) })
  assert.equal(calls.length, 0)
  const buttons = React.Children.toArray(tree.props.children)
  assert.equal(buttons.length, 2); buttons.forEach((button) => button.props.onClick())
  assert.deepEqual(calls, [id(1), id(2)])
  const html = renderToStaticMarkup(React.createElement(Buttons, { attachments, onOpenFile: noWrite }))
  assert.match(html, /View Upload File 1/); assert.match(html, /View Upload File 2/)
  assert.equal(renderToStaticMarkup(React.createElement(Buttons, { attachments: [], onOpenFile: noWrite })), '')
  React.Children.toArray(Buttons({ attachments, onOpenFile: noWrite, disabled: true }).props.children).forEach((button) => { assert.equal(button.props.disabled, true); button.props.onClick() })
})
function searchHarness(view = true, withFiles = true) {
  const calls = [], grant = { table: { key: 'event', label: 'Event', tableAlias: 'cmps_events', displayFields: ['cmps_eventtitle'] }, view, ignoreProgramAssignment: true, roleNames: ['Role'] }
  const context = { profiles: [grant], hub: { id: 'program', title: 'Program' } }
  const row = { cmps_eventid: id(3), cmps_recordid: 'EV-046', cmps_eventtitle: 'Event', _cmps_fileid1_value: id(1), _cmps_fileid2_value: id(2) }
  const metadata = { LogicalName: 'cmps_event', EntitySetName: 'cmps_events', PrimaryIdAttribute: 'cmps_eventid', Attributes: [
    { LogicalName: 'cmps_recordid', AttributeType: 'String' }, { LogicalName: 'cmps_eventtitle', AttributeType: 'String' }, { LogicalName: 'cmps_isarchived', AttributeType: 'Picklist' },
    ...(withFiles ? [{ LogicalName: 'cmps_fileid1', AttributeType: 'Lookup' }, { LogicalName: 'cmps_fileid2', AttributeType: 'Lookup' }] : []),
  ], ManyToOneRelationships: [] }
  const catalog = { normalizeSearchName: (v) => String(v).toLowerCase(), programSearchGrants: (profiles) => profiles, programSearchLabels: () => [] }
  const api = loader({ './programSearchCatalog': catalog, './archive': {}, './auth': {}, './advancedSearch': { advancedFieldsFromMetadata: () => [], advancedSearchFetchXml: () => '' } })('programTableSearch')
  const gateway = { metadata: async () => metadata, choices: noWrite, query: async (_meta, xml) => { calls.push(xml); return { value: [row] } } }
  return { calls, grant, context, metadata, row, gateway, api }
}
test('program search reads both file lookup IDs in the existing page request, never file blobs; detail preserves the raw ID separately from display text', async () => {
  const h = searchHarness()
  const fields = [{ field: 'cmps_fileid1', label: 'Upload File 1' }, { field: 'cmps_fileid2', label: 'Upload File 2' }]
  const plan = await h.api.inspectProgramSearch(h.context, 'event', fields, h.gateway, new AbortController().signal)
  const page = await h.api.searchProgramTable(h.context, plan, '', h.gateway, new AbortController().signal)
  assert.equal(h.calls.length, 1); assert.match(h.calls[0], /attribute name="cmps_fileid1"/); assert.match(h.calls[0], /attribute name="cmps_fileid2"/)
  assert.match(h.calls[0], /cmps_isarchived/); assert.equal(page.rows[0].attachments.length, 2)
  const detail = await h.api.loadProgramSearchRecord(h.context, plan, id(3), h.gateway, new AbortController().signal)
  assert.equal(detail[0].fileId, id(1)); assert.equal(detail[1].fileId, id(2))
})
test('Search without View does not select or expose file IDs, and unknown file columns are never added to a query', async () => {
  for (const [view, withFiles] of [[false, true], [true, false]]) {
    const h = searchHarness(view, withFiles)
    const plan = await h.api.inspectProgramSearch(h.context, 'event', [], h.gateway, new AbortController().signal)
    const page = await h.api.searchProgramTable(h.context, plan, '', h.gateway, new AbortController().signal)
    assert.equal(page.rows[0].attachments, undefined)
    assert.doesNotMatch(h.calls[0], /attribute name="cmps_fileid/)
    if (!view) await assert.rejects(h.api.loadProgramSearchRecord(h.context, plan, id(3), h.gateway, new AbortController().signal), /does not allow viewing/)
  }
})
test('program result and read-only detail screens show file controls only with View permission and do not display file GUIDs', () => {
  for (const view of [true, false]) for (const showDetail of [true, false]) {
    const h = searchHarness(view), attachments = files.recordAttachments('event', h.row), row = { id: id(3), recordId: 'EV-046', title: 'Event', modifiedOn: '', attachments }
    let state = 0
    const hooks = { ...React, useMemo: (fn) => fn(), useRef: (value) => ({ current: value }), useEffect: () => {},
      useState(initial) { const n = state++; return [n === 4 ? [row] : n === 11 && showDetail ? { row, values: [{ field: 'cmps_fileid1', label: 'Upload File 1', value: 'file.pdf', fileId: id(1) }] } : initial, noWrite] } }
    const panel = loader({ react: hooks, './RecordSystemFields': { __esModule: true, default: () => null }, './FocusPlanNeedsView': { __esModule: true, default: () => null }, './focusPlan': { GOAL_COLUMNS: [] },
      './DataverseAdvancedSearch': { __esModule: true, default: () => null }, './programSearchCatalog': { programSearchGrants: (profiles) => profiles },
      './programTableSearch': { createProgramSearchGateway: () => ({}) },
    })('ProgramTableSearchPanel').default
    const tree = panel({ hub: h.context.hub, profiles: [h.grant], rolesLoading: false, rolesError: '', fields: {}, refreshSignal: 0, onOpenClientProfile: noWrite, renderArchiveButton: () => null, onOpenFile: noWrite })
    const html = renderToStaticMarkup(tree)
    if (view) assert.match(html, /View (?:attached file|Upload File)/)
    else assert.doesNotMatch(html, /View attached file|View Upload File/)
    assert.doesNotMatch(html, new RegExp(id(1)))
  }
})
test('all four editor upload branches retain an Open button for the saved file even while a new replacement is pending', () => {
  const source = readFileSync(new URL('../App.tsx', import.meta.url), 'utf8'), ast = ts.createSourceFile('App.tsx', source, 99, true, ts.ScriptKind.TSX), branches = []
  function visit(node) { if (ts.isIfStatement(node) && node.expression.getText(ast) === "fieldDef.input === 'file'" && node.getText(ast).includes('<RecordAttachmentButtons')) branches.push(node.getText(ast)); ts.forEachChild(node, visit) }
  visit(ast); assert.equal(branches.length, 4)
  for (const code of branches) for (const pending of [null, { name: 'replacement.pdf', size: 4 }]) {
    const runtime = { exports: {}, fieldDef: { input: 'file', field: 'cmps_fileid1', label: 'Upload File' }, fieldId: 'file-control', label: React.createElement('span', null, 'Upload File'), value: id(1),
      activeFormSession: { kind: code.includes('eventUploadFiles') ? 'event' : code.includes('name={fieldDef.field}') ? 'electronic-document' : 'person-you-are-fleeing-profile' },
      eventUploadFiles: [pending, null], getPendingFormFileUpload: () => pending, isUserPreview: false,
      updatePendingFormFileUpload: noWrite, updateEventUploadFile: noWrite, openCompassFileViewer: noWrite, RecordAttachmentButtons: Buttons, recordAttachments: files.recordAttachments,
      require: () => JSX,
    }
    vm.runInNewContext(ts.transpileModule('function render() { ' + code + ' }\nglobalThis.element = render()', { compilerOptions: options }).outputText, runtime)
    const html = renderToStaticMarkup(runtime.element)
    assert.match(html, /View attached file/)
    if (pending) assert.match(html, /replacement.pdf/)
  }
})
