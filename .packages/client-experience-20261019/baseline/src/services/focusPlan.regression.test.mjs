import assert from 'node:assert/strict'
import { readFileSync } from 'node:fs'
import test from 'node:test'
import vm from 'node:vm'
import ts from 'typescript'
import * as React from 'react'
import * as JSX from 'react/jsx-runtime'

const rowId = '11111111-1111-1111-1111-111111111111'
function harness(local = false, row = {}) {
  const calls = [], cache = new Map()
  function load(file) {
    if (cache.has(file)) return cache.get(file)
    const source = readFileSync(new URL(file, import.meta.url), 'utf8').replaceAll('import.meta.env', '({})')
    const module = { exports: {} }; cache.set(file, module.exports)
    vm.runInNewContext(ts.transpileModule(source, { compilerOptions: { target: ts.ScriptTarget.ES2022, module: ts.ModuleKind.CommonJS, jsx: ts.JsxEmit.ReactJSX } }).outputText, {
      module, exports: module.exports, URL, URLSearchParams, Headers, window: { location: { hostname: local ? 'localhost' : 'powerapps.example' } },
      fetch: async (url, init) => { calls.push({ url, init }); return { ok: true, text: async () => '', json: async () => ({ cmps_focusplanid: rowId, ...row }) } },
      require(name) {
        if (name === 'react/jsx-runtime') return JSX
        if (name === '@microsoft/power-apps/data') return { getClient: () => ({ executeAsync: async ({ connectorOperation: op }) => { calls.push(op); return { success: true, data: { cmps_focusplanid: rowId, ...row, value: [{ cmps_focusplanid: rowId, ...row }] } } } }) }
        if (name.includes('dataSourcesInfo')) return { dataSourcesInfo: {} }
        if (name === './auth') return { getAuthToken: () => 'test', ensureAuthToken: async () => 'test' }
        if (name === './archive') return { excludeArchived: (value) => value, ARCHIVE_TABLES: [{ key: 'focus-plan', label: 'FOCUS Plan', tableAlias: 'cmps_focusplans', primaryIdField: 'cmps_focusplanid' }] }
        if (name.startsWith('./')) return load(name + '.ts')
        throw Error('Unexpected dependency: ' + name)
      },
    })
    return module.exports
  }
  return { calls, load }
}
function descendants(node, type) {
  const found = []
  function visit(item) { if (Array.isArray(item)) item.forEach(visit); else if (React.isValidElement(item)) { if (item.type === type) found.push(item); visit(item.props.children) } }
  visit(node); return found
}
const text = (node) => typeof node === 'string' || typeof node === 'number' ? String(node) : Array.isArray(node) ? node.map(text).join('') : React.isValidElement(node) ? text(node.props.children) : ''

function editRenderer(api) {
  const app = readFileSync(new URL('../App.tsx', import.meta.url), 'utf8'), tree = ts.createSourceFile('App.tsx', app, ts.ScriptTarget.Latest, true, ts.ScriptKind.TSX)
  let branch
  function visit(node) { if (ts.isIfStatement(node) && node.expression.getText(tree) === "fieldDef.input === 'goals'") branch = node.thenStatement; ts.forEachChild(node, visit) }
  visit(tree); assert.ok(branch)
  const context = vm.createContext({ ...api, exports: {}, FormInput: 'input', require: (name) => { assert.equal(name, 'react/jsx-runtime'); return JSX } })
  vm.runInContext(ts.transpileModule("function render(values, update) { const fieldDef = { field: 'focus-goals' }; " + branch.getText(tree) + ' }', { compilerOptions: { target: ts.ScriptTarget.ES2022, module: ts.ModuleKind.CommonJS, jsx: ts.JsxEmit.ReactJSX } }).outputText, context)
  return context.render
}

test('FOCUS editor preserves every typed space in identified needs and resources in all six rows', () => {
  const api = harness().load('./focusPlan.ts'), render = editRenderer(api)
  for (const column of [0, 1]) for (const index of [0, 2, 5]) {
    const values = { cmps_numberofidentifiedneeds: '6', cmps_goalstatuses: 'Ongoing, Ongoing, Ongoing, Ongoing, Ongoing, Ongoing' }
    let expected = ''
    for (const char of ' Need  assistance with housing ') {
      const input = descendants(render(values, (field, value) => { values[field] = value }), 'input').filter((item) => !item.props.type)[index * 2 + column]
      assert.equal(input.props.value, expected)
      expected += char
      input.props.onChange({ target: { value: input.props.value + char } })
      const after = descendants(render(values, (field, value) => { values[field] = value }), 'input').filter((item) => !item.props.type)[index * 2 + column]
      assert.equal(after.props.value, expected, 'Space must survive the actual controlled-input rerender')
    }
    assert.equal(api.parseFocusGoalColumn(values[api.GOAL_COLUMNS[column]])[index], expected)
  }
})

test('FOCUS loads serialized values as plain text and preserves commas, quotes, spaces, and empty slots', () => {
  const api = harness().load('./focusPlan.ts')
  const plain = ['Employment (remote work)', 'Housing', '', 'Transport, benefits and "support" ']
  for (const stored of [JSON.stringify(plain), JSON.stringify(JSON.stringify(plain)), '{' + JSON.stringify(plain) + '}', '{["Employment (remote work)"]}, {["Housing"]}, {[""]}, {["Transport, benefits and \\"support\\" "]}', '{["Employment (remote work)"],["Housing"],[""],["Transport, benefits and \\"support\\" "]}']) {
    assert.deepEqual(Array.from(api.parseFocusGoalColumn(stored)), plain)
  }
  const literal = ['Uses [brackets] and {braces}', 'A comma, inside one need', '"Quoted text"', ' Leading and trailing ']
  assert.deepEqual(Array.from(api.parseFocusGoalColumn(api.serializeFocusGoalColumn(literal))), literal)
  assert.deepEqual(Array.from(api.parseFocusGoalColumn('Unstructured {notes}')), ['Unstructured {notes}'])
})

test('FOCUS editor hides storage syntax and automatically encodes plain edits without splitting commas', () => {
  const api = harness().load('./focusPlan.ts'), render = editRenderer(api)
  const values = { cmps_numberofidentifiedneeds: '3', cmps_identifiedneeds: '{["Employment (remote work)"]}, {["Housing"]}, {["Transport"]}', cmps_resourcesgivenandfrequencyseenbyspecialists: '{["MesaCAN, St. Joseph\'s the Worker"]}, {["Weekly support"]}, {["Bus passes"]}', cmps_goalstatuses: '["Ongoing","Incomplete","Complete"]', cmps_goalcompletiondates: '["","","2026-10-14"]' }
  const update = (field, value) => { values[field] = value }
  const inputs = descendants(render(values, update), 'input').filter((input) => !input.props.type)
  assert.equal(inputs[0].props.value, 'Employment (remote work)')
  assert.equal(inputs[1].props.value, "MesaCAN, St. Joseph's the Worker")
  assert.equal(inputs[2].props.value, 'Housing')
  const next = 'Housing, utilities and "support" '
  inputs[2].props.onChange({ target: { value: next } })
  assert.deepEqual(Array.from(api.parseFocusGoalColumn(values.cmps_identifiedneeds)), ['Employment (remote work)', next, 'Transport'])
  const after = descendants(render(values, update), 'input').filter((input) => !input.props.type)
  assert.equal(after[2].props.value, next)
  assert.equal(after[4].props.value, 'Transport')
})

test('FOCUS validation checks decoded content, not nonempty serialization wrappers', () => {
  const api = harness().load('./focusPlan.ts'), app = readFileSync(new URL('../App.tsx', import.meta.url), 'utf8'), tree = ts.createSourceFile('App.tsx', app, ts.ScriptTarget.Latest, true, ts.ScriptKind.TSX)
  let fn
  function visit(node) { if (ts.isFunctionDeclaration(node) && node.name?.text === 'getFocusPlanRequiredMessage') fn = node; else ts.forEachChild(node, visit) }
  visit(tree); assert.ok(fn)
  const context = vm.createContext({ ...api, getActiveRequiredFields: () => new Map() })
  vm.runInContext(ts.transpileModule(fn.getText(tree), { compilerOptions: { target: ts.ScriptTarget.ES2022, module: ts.ModuleKind.CommonJS } }).outputText, context)
  const empty = context.getFocusPlanRequiredMessage({ values: { cmps_numberofidentifiedneeds: '1', cmps_identifiedneeds: '[""]', cmps_resourcesgivenandfrequencyseenbyspecialists: '[""]', cmps_goalstatuses: '[""]' } })
  assert.match(empty, /Identified Need 1/); assert.match(empty, /Resources Given/); assert.match(empty, /Goal Status 1/)
  const complete = context.getFocusPlanRequiredMessage({ values: { cmps_numberofidentifiedneeds: '1', cmps_identifiedneeds: '["Housing, rental"]', cmps_resourcesgivenandfrequencyseenbyspecialists: '["Weekly support"]', cmps_goalstatuses: '["Complete"]', cmps_goalcompletiondates: '[""]' } })
  assert.match(complete, /Goal Completion Date 1/)
})

for (const local of [false, true]) test('FOCUS ' + (local ? 'local' : 'connector') + ' saves combined columns automatically, reloads plain fields, and never double-encodes on another save', async () => {
  const original = { cmps_numberofidentifiedneeds: '3', cmps_identifiedneeds: '{["Employment (remote work)"]}, {["Housing"]}, {["Transport"]}', cmps_resourcesgivenandfrequencyseenbyspecialists: '{["MesaCAN, St. Joseph\'s the Worker"]}, {["Weekly support"]}, {["Bus passes"]}', cmps_goalstatuses: '["Ongoing","Incomplete","Complete"]', cmps_goalcompletiondates: '["","","2026-10-14"]' }
  const h = harness(local), api = h.load('./focusPlan.ts')
  await api.createFocusPlanResponse(original)
  const payload = local ? JSON.parse(h.calls[0].init.body) : h.calls[0].parameters.item
  assert.deepEqual(JSON.parse(payload.cmps_identifiedneeds), ['Employment (remote work)', 'Housing', 'Transport'])
  assert.deepEqual(JSON.parse(payload.cmps_resourcesgivenandfrequencyseenbyspecialists), ["MesaCAN, St. Joseph's the Worker", 'Weekly support', 'Bus passes'])
  const reload = harness(local, payload), detail = await reload.load('./focusPlan.ts').loadFocusPlanDetailRecord(rowId)
  await api.updateFocusPlanResponse(rowId, detail.values)
  const updated = local ? JSON.parse(h.calls[1].init.body) : h.calls[1].parameters.item
  for (const column of api.GOAL_COLUMNS) assert.equal(updated[column], payload[column])
  const render = editRenderer(api), textInputs = descendants(render(detail.values, () => {}), 'input').filter((input) => !input.props.type)
  assert.equal(textInputs[0].props.value, 'Employment (remote work)')
  assert.equal(textInputs[1].props.value, "MesaCAN, St. Joseph's the Worker")
  assert.equal(textInputs[2].props.value, 'Housing')
})

test('FOCUS parsing remains compatible with existing comma-separated values and retains blank slots', () => {
  const api = harness().load('./focusPlan.ts')
  assert.deepEqual(Array.from(api.parseFocusGoalColumn('Need one, Need two, , Need four')), ['Need one', 'Need two', '', 'Need four'])
  assert.deepEqual(Array.from(api.parseFocusGoalColumn('Need one,Need two')), ['Need one', 'Need two'])
  assert.equal(api.getFocusPlanGoalCount({ cmps_numberofidentifiedneeds: '6' }), 6)
  assert.equal(api.getFocusPlanGoalCount({ cmps_identifiedneeds: 'one, two, three' }), 3)
  assert.equal(api.getFocusPlanGoalCount({}), 1)
  assert.equal(api.getFocusPlanGoalCount({ cmps_numberofidentifiedneeds: '99' }), 6)
})

test('FOCUS read-only view renders separate needs/resources/status/completion dates for every goal', () => {
  const h = harness(), module = { exports: {} }, source = readFileSync(new URL('./FocusPlanNeedsView.tsx', import.meta.url), 'utf8')
  vm.runInNewContext(ts.transpileModule(source, { compilerOptions: { target: ts.ScriptTarget.ES2022, module: ts.ModuleKind.CommonJS, jsx: ts.JsxEmit.ReactJSX } }).outputText, { module, exports: module.exports, require: (name) => name === 'react/jsx-runtime' ? JSX : h.load('./focusPlan.ts') })
  const values = { cmps_numberofidentifiedneeds: '6', cmps_identifiedneeds: 'Need 1, Need 2, , Need 4, Need 5, Need 6', cmps_resourcesgivenandfrequencyseenbyspecialists: 'Resource 1, Resource 2, , Resource 4, Resource 5, Resource 6', cmps_goalstatuses: 'Complete, Ongoing, Incomplete, Complete, Ongoing, Complete', cmps_goalcompletiondates: '2026-10-01, , , 2026-10-04, , 2026-10-06' }
  const tree = module.exports.default({ values, idPrefix: 'focus-view' })
  const rows = descendants(tree, 'div').filter((item) => item.props.className === 'focus-goal-row')
  assert.equal(rows.length, 6)
  rows.forEach((row, index) => {
    assert.equal(text(descendants(row, 'h5')[0]), 'Goal ' + (index + 1))
    const inputs = descendants(row, 'input'), texts = inputs.filter((input) => !input.props.type)
    assert.equal(texts[0].props.value, index === 2 ? '' : 'Need ' + (index + 1))
    assert.equal(texts[1].props.value, index === 2 ? '' : 'Resource ' + (index + 1))
    assert.equal(inputs.filter((input) => input.props.type === 'radio' && input.props.checked).length, 1)
    for (const input of inputs) { assert.equal(input.props.disabled, true); assert.equal(input.props.readOnly, true); assert.equal(input.props.onChange, undefined) }
  })
  assert.deepEqual(descendants(tree, 'input').filter((input) => input.props.type === 'date').map((input) => input.props.value), ['2026-10-01', '2026-10-04', '2026-10-06'])
})

for (const local of [false, true]) test('FOCUS ' + (local ? 'local' : 'connector') + ' detail/create/update roundtrip all goal columns and preserve spaces', async () => {
  const stored = { cmps_recordid: 'FP-046', cmps_numberofidentifiedneeds: '2', cmps_identifiedneeds: 'Need help with housing , Second need ', cmps_resourcesgivenandfrequencyseenbyspecialists: 'Weekly support , Resource two ', cmps_goalstatuses: 'Complete, Ongoing', cmps_goalcompletiondates: '2026-10-14, ' }
  const h = harness(local, stored), api = h.load('./focusPlan.ts'), detail = await api.loadFocusPlanDetailRecord(rowId)
  for (const column of api.GOAL_COLUMNS) assert.equal(detail.values[column], stored[column])
  const read = h.calls[0], select = local ? new URL(read.url).searchParams.get('$select') : read.parameters.$select
  for (const column of api.GOAL_COLUMNS) assert.ok(select.includes(column))
  await api.createFocusPlanResponse(stored); await api.updateFocusPlanResponse(rowId, detail.values)
  for (const call of h.calls.slice(1)) {
    const item = local ? JSON.parse(call.init.body) : call.parameters.item
    for (const column of api.GOAL_COLUMNS) assert.deepEqual(JSON.parse(item[column]), Array.from(api.parseFocusGoalColumn(stored[column])))
  }
})

test('FOCUS program-search details read every backing goal column through the existing permission-scoped query', async () => {
  const h = harness(), api = h.load('./programTableSearch.ts'), focus = h.load('./focusPlan.ts')
  const fields = [...focus.FOCUS_PLAN_FIELDS, ...focus.FOCUS_PLAN_GOAL_FIELDS]
  const metadata = { LogicalName: 'cmps_focusplan', EntitySetName: 'cmps_focusplans', PrimaryIdAttribute: 'cmps_focusplanid', Attributes: fields.filter((field) => field.field.startsWith('cmps_')).map((field) => ({ LogicalName: field.field, AttributeType: 'String' })), ManyToOneRelationships: [] }
  const context = { hub: { id: 'autumn-house', title: 'Autumn House', roleMatchers: ['autumn house'] }, profiles: [{ roleName: 'Autumn House Manager', entries: [{ formName: 'FOCUS Plan', permissions: { search: true, view: true, ignoreProgramAssignment: true } }] }] }
  const gateway = { metadata: async () => metadata, query: async (_, xml) => { for (const column of focus.GOAL_COLUMNS) assert.ok(xml.includes('<attribute name="' + column + '"/>')); return { value: [{ cmps_focusplanid: rowId, ...Object.fromEntries(focus.GOAL_COLUMNS.map((column) => [column, 'first, second'])) }] } } }
  const plan = await api.inspectProgramSearch(context, 'focus-plan', fields, gateway, new AbortController().signal)
  const result = await api.loadProgramSearchRecord(context, plan, rowId, gateway, new AbortController().signal)
  for (const column of focus.GOAL_COLUMNS) assert.equal(result.find((field) => field.field === column).value, 'first, second')
  const app = readFileSync(new URL('../App.tsx', import.meta.url), 'utf8'), panel = readFileSync(new URL('./ProgramTableSearchPanel.tsx', import.meta.url), 'utf8')
  assert.match(app, /if \(input === 'goals'\) return <FocusPlanNeedsView/)
  assert.match(app, /'focus-plan': \[\.\.\.FOCUS_PLAN_FIELDS, \.\.\.FOCUS_PLAN_GOAL_FIELDS\]/)
  assert.match(panel, /key === 'focus-plan' \? <FocusPlanNeedsView/)
})
