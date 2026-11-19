import assert from 'node:assert/strict'
import { readFileSync } from 'node:fs'
import test from 'node:test'
import vm from 'node:vm'
import ts from 'typescript'

const field = 'cmps_calloutcome1', retired = 'cmps_calloutcome'
const rowId = '11111111-1111-1111-1111-111111111111', clientId = '22222222-2222-2222-2222-222222222222'
const choices = ['Disconnected by Staff', 'Dropped Call', 'Provided Information', 'Provided Screening', 'Scheduled Intake', 'Disconnected By Caller', 'Transferred to Crisis', 'Called 911', 'Advocacy Provided', 'Provided Referral']
const schemaText = readFileSync(new URL('../../.power/schemas/appschemas/dataSourcesInfo.ts', import.meta.url), 'utf8')
const schema = JSON.parse(schemaText.slice(schemaText.indexOf('{'), schemaText.lastIndexOf('}') + 1))

for (const local of [false, true]) test(`${local ? 'local' : 'runtime'} client Helpline quick view selects call notes and preserves zero minutes`, async () => {
  const notes = 'Call summary\nSecond line <script>not executable</script>'
  const rows = [{ cmps_helplineid: rowId, cmps_recordid: 'HL-046', _cmps_cpid_value: clientId, cmps_notes: notes, cmps_calllengthminutes: 0 }, { cmps_helplineid: clientId, cmps_notes: null }]
  const h = harness(local, (call) => {
    const parameters = local ? Object.fromEntries(new URL(call.url).searchParams) : call.parameters
    assert.ok(parameters.$select.split(',').includes('cmps_notes'))
    assert.match(parameters.$filter, new RegExp(`_cmps_cpid_value eq ${clientId}`)); assert.match(parameters.$filter, /cmps_isarchived ne 125570000/)
    return { value: rows }
  })
  const result = await h.api.listHelplinesForClient(clientId)
  assert.equal(result[0].callNotes, notes); assert.equal(result[0].callLengthMinutes, '0'); assert.equal(result[1].callNotes, '')
  assert.equal(h.calls.length, 1, 'quick-view columns should not require a full-record read per row')
})

test('Time of Contact and Call Length are required in every Helpline program for new and existing records', () => {
  const api = harness(false, () => { throw new Error('Validation must not access Dataverse') }).api
  const source = readFileSync(new URL('../App.tsx', import.meta.url), 'utf8')
  const tree = ts.createSourceFile('App.tsx', source, ts.ScriptTarget.Latest, true, ts.ScriptKind.TSX)
  const names = new Set(['normalize', 'getHelplineFormSection', 'getHelplineFieldLabel', 'isHelplineFieldVisible', 'validateRequiredHelplineFields', 'getActiveRequiredFields'])
  const snippets = tree.statements.filter((node) => ts.isVariableStatement(node) && node.declarationList.declarations.some((declaration) => ts.isIdentifier(declaration.name) && declaration.name.text.startsWith('HELPLINE_'))).map((node) => node.getText(tree))
  function visit(node) {
    if (ts.isFunctionDeclaration(node) && names.has(node.name?.text)) snippets.push(node.getText(tree))
    ts.forEachChild(node, visit)
  }
  visit(tree)
  const context = { HELPLINE_FIELD_DEFINITIONS: api.HELPLINE_FIELD_DEFINITIONS }
  vm.createContext(context)
  vm.runInContext(ts.transpileModule(snippets.join('\n'), { compilerOptions: { target: ts.ScriptTarget.ES2022 } }).outputText, context)
  for (const program of api.HELPLINE_PROGRAM_OPTIONS) {
    const values = Object.fromEntries(api.HELPLINE_FIELD_DEFINITIONS.map((definition) => [definition.field, definition.options[0] || 'Provided']))
    Object.assign(values, { cmps_program: program, cmps_dateofcontact: '2026-10-09', cmps_timeofcontact: '00:00', cmps_calllengthminutes: '0' })
    assert.equal(context.validateRequiredHelplineFields(values), '', program)
    for (const rowId of ['', 'existing-helpline-row']) {
      const required = context.getActiveRequiredFields({ kind: 'helpline', rowId, values })
      assert.equal(required.get('cmps_timeofcontact'), 'Time Of Contact', program)
      assert.equal(required.get('cmps_calllengthminutes'), 'Call Length (minutes)', program)
    }
    for (const [field, label] of [['cmps_timeofcontact', 'Time Of Contact'], ['cmps_calllengthminutes', 'Call Length (minutes)']]) {
      for (const missing of ['', '   ', undefined]) {
        const message = context.validateRequiredHelplineFields({ ...values, [field]: missing })
        assert.ok(message.includes(label), `${program}: ${label} must block saving when blank`)
      }
    }
    const bothMissing = context.validateRequiredHelplineFields({ ...values, cmps_timeofcontact: '', cmps_calllengthminutes: '' })
    assert.ok(bothMissing.includes('Time Of Contact')); assert.ok(bothMissing.includes('Call Length (minutes)'))
  }
  const saveBranch = source.slice(source.indexOf("if (session.kind === 'helpline') {", source.indexOf('async function saveActiveForm')))
  assert.ok(saveBranch.indexOf('validateRequiredHelplineFields(payload)') < saveBranch.indexOf('await updateHelplineResponse'))
  assert.ok(saveBranch.indexOf('validateRequiredHelplineFields(payload)') < saveBranch.indexOf('await createHelplineResponse'))
})

function harness(local, handler) {
  const source = readFileSync(new URL('./helpline.ts', import.meta.url), 'utf8').replaceAll('import.meta.env', '({})')
  const module = { exports: {} }, calls = []
  vm.runInNewContext(ts.transpileModule(source, { compilerOptions: { module: ts.ModuleKind.CommonJS, target: ts.ScriptTarget.ES2022 } }).outputText, {
    module, exports: module.exports, Headers, URL, URLSearchParams,
    window: { location: { hostname: local ? 'localhost' : 'powerapps.example' } },
    fetch: async (url, init) => {
      assert.ok(local, 'published app should use its connector, not direct browser requests')
      const call = { url, init }; calls.push(call)
      const data = handler(call)
      return { ok: true, headers: new Headers(), json: async () => data }
    },
    require(name) {
      if (name === '@microsoft/power-apps/data') return { getClient: () => ({ executeAsync: async ({ connectorOperation: call }) => {
        const api = schema.commondataserviceforapps.apis[call.operationName]
        assert.ok(api, `Unsupported operation: ${call.operationName}`)
        for (const parameter of api.parameters.filter((entry) => entry.required && entry.name !== 'connectionId')) assert.notEqual(call.parameters[parameter.name], undefined, `Missing ${parameter.name}`)
        calls.push(call); return { success: true, data: handler(call) }
      } }) }
      if (name.includes('dataSourcesInfo')) return { dataSourcesInfo: schema }
      if (name === './auth') return { ensureAuthToken: async () => 'test-token', getAuthToken: () => 'test-token' }
      if (name === './archive') return { excludeArchived: (filter) => `(${filter}) and (cmps_isarchived ne 125570000 or cmps_isarchived eq null)` }
      throw new Error(`Unexpected dependency: ${name}`)
    },
  }, { filename: 'helpline.ts' })
  return { api: module.exports, calls }
}
for (const local of [false, true]) {
  const mode = local ? 'local' : 'runtime'
  const writing = (call) => local ? ['POST', 'PATCH'].includes(call.init.method) : /^(Create|Update)/.test(call.operationName)
  const payload = (call) => local ? JSON.parse(call.init.body) : call.parameters.item
  test(`${mode}: all ten replacement-column outcomes retain exact mappings through create, edit and reload`, async () => {
    let saved = {}
    const h = harness(local, (call) => {
      if (writing(call)) saved = { ...saved, ...payload(call) }
      const row = { ...saved, cmps_helplineid: rowId, _cmps_cpid_value: clientId }
      return !local && call.operationName.startsWith('List') ? { value: [row] } : row
    })
    const definition = h.api.HELPLINE_FIELD_DEFINITIONS.find((entry) => entry.field === field)
    assert.equal(definition.input, 'multi-select'); assert.deepEqual(Array.from(definition.options), choices)
    assert.equal(h.api.HELPLINE_FIELD_NAMES.includes(retired), false)
    for (let index = 0; index < choices.length; index++) {
      const created = await h.api.createHelplineResponse({ cmps_recordid: 'HL-046', cmps_cpid: clientId, [field]: choices[index], [retired]: 'Never write this column' })
      assert.equal(created.id, rowId)
      assert.equal(saved[field], String(125570000 + index)); assert.equal(retired in saved, false)
      const detail = await h.api.loadHelplineDetailRecord(rowId)
      assert.equal(detail.values[field], choices[index]); assert.equal(detail.values.cmps_cpid, clientId)
      const read = h.calls.at(-1), select = local ? new URL(read.url).searchParams.get('$select') : read.parameters.$select
      assert.equal(select.split(',').includes(field), true); assert.equal(select.split(',').includes(retired), false)
      assert.equal(select.split(',').includes('cmps_cpid'), false)
      await h.api.updateHelplineResponse(rowId, { [field]: choices[index] })
      assert.equal(saved[field], String(125570000 + index))
    }
  })
  test(`${mode}: multiple outcomes encode as deduplicated choice strings, formatted selections reload, and clearing writes null`, async () => {
    let saved, formatted = false
    const h = harness(local, (call) => {
      if (writing(call)) saved = payload(call)
      const row = { ...saved, cmps_helplineid: rowId, ...(formatted ? { [`${field}@OData.Community.Display.V1.FormattedValue`]: 'Advocacy Provided; Provided Referral' } : {}) }
      return !local && call.operationName.startsWith('List') ? { value: [row] } : row
    })
    await h.api.updateHelplineResponse(rowId, { [field]: 'Advocacy Provided;125570009;Advocacy Provided' })
    assert.equal(saved[field], '125570008,125570009')
    assert.equal((await h.api.loadHelplineDetailRecord(rowId)).values[field], 'Advocacy Provided, Provided Referral')
    formatted = true
    assert.equal((await h.api.loadHelplineDetailRecord(rowId)).values[field], 'Advocacy Provided, Provided Referral')
    await h.api.updateHelplineResponse(rowId, { [field]: '' })
    assert.equal(saved[field], null)
    await h.api.updateHelplineResponse(rowId, { cmps_notes: 'Keep existing outcomes' })
    assert.equal(field in saved, false, 'omitted outcomes must remain untouched')
    const count = h.calls.length
    for (const invalid of ['Unknown', '125570010', '125570008;invalid', '125570008.5']) await assert.rejects(h.api.updateHelplineResponse(rowId, { [field]: invalid }), /Invalid Call Outcome/)
    assert.equal(h.calls.length, count, 'invalid selections must not reach Dataverse')
  })
}

test('the dropdown shows selections, allows independent toggles and clear, and remains disabled in preview', () => {
  const source = readFileSync(new URL('./MultiSelectDropdown.tsx', import.meta.url), 'utf8')
  const module = { exports: {} }
  vm.runInNewContext(ts.transpileModule(source, { compilerOptions: { module: ts.ModuleKind.CommonJS, target: ts.ScriptTarget.ES2022, jsx: ts.JsxEmit.React } }).outputText, {
    module, exports: module.exports, require: (name) => { assert.equal(name, './MultiSelectDropdown.css'); return {} },
    React: { createElement: (type, props, ...children) => ({ type, props, children: children.flat(Infinity) }) },
  })
  const changes = [], props = { id: 'outcomes', label: 'Call Outcome', options: choices, value: ['Advocacy Provided'], onChange: (next) => changes.push(Array.from(next)) }
  const tree = module.exports.default(props)
  const details = tree.children.find((node) => node.type === 'details'), summary = details.children[0], group = details.children[1]
  assert.equal(summary.type, 'summary'); assert.equal(summary.children[0].children[0], 'Advocacy Provided')
  const checkboxes = group.children.filter((node) => node.type === 'label').map((node) => node.children[0])
  assert.equal(checkboxes.length, 10); assert.equal(checkboxes[8].props.checked, true)
  checkboxes[9].props.onChange({ target: { checked: true } }); assert.deepEqual(changes.at(-1), ['Advocacy Provided', 'Provided Referral'])
  checkboxes[8].props.onChange({ target: { checked: false } }); assert.deepEqual(changes.at(-1), [])
  group.children.at(-1).props.onClick(); assert.deepEqual(changes.at(-1), [])
  const disabled = module.exports.default({ ...props, disabled: true }).children.find((node) => node.type === 'details')
  assert.equal(disabled.children[0].props['aria-disabled'], true)
  assert.ok(disabled.children[1].children.filter((node) => node.type === 'label').every((node) => node.children[0].props.disabled))
  const app = readFileSync(new URL('../App.tsx', import.meta.url), 'utf8')
  assert.doesNotMatch(app, /\bcmps_calloutcome\b/)
  const editor = app.slice(app.indexOf('key={`${selectedHub.id}-helpline-editor`}'))
  assert.match(editor.slice(0, 5000), /fieldDef.input === 'multi-select'[\s\S]*MultiSelectDropdown[\s\S]*disabled=\{isUserPreview \|\| activeFormSaving\}/)
})

test('runtime Helpline edit identifies the exact row and respects archive filtering', async () => {
  const h = harness(false, () => ({ value: [{ cmps_helplineid: rowId, [field]: '125570008,125570009' }] }))
  await h.api.loadHelplineDetailRecord(rowId)
  assert.equal(h.calls[0].operationName, 'ListRecordsWithOrganization')
  assert.match(h.calls[0].parameters.$filter, new RegExp(`cmps_helplineid eq ${rowId}`))
  assert.match(h.calls[0].parameters.$filter, /cmps_isarchived ne 125570000/)
  await h.api.loadHelplineDetailRecord('', "HL-046'example")
  assert.match(h.calls[1].parameters.$filter, /HL-046''example/)
  const wrong = harness(false, () => ({ value: [{ cmps_helplineid: clientId }] }))
  await assert.rejects(wrong.api.loadHelplineDetailRecord(rowId), /uniquely identified/)
})
