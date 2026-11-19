import assert from 'node:assert/strict'
import { readFileSync } from 'node:fs'
import test from 'node:test'
import vm from 'node:vm'
import ts from 'typescript'
import * as jsx from 'react/jsx-runtime'
import { renderToStaticMarkup } from 'react-dom/server'

const rowId = '11111111-1111-1111-1111-111111111111'
const annotation = '@OData.Community.Display.V1.FormattedValue'
function service(runtime = false) {
  const state = { row: {}, saved: {} }, calls = [], module = { exports: {} }
  const source = readFileSync(new URL('./programEnrollment.ts', import.meta.url), 'utf8').replaceAll('import.meta.env', '({})')
  const row = () => ({ cmps_programenrollment1id: rowId, cmps_recordid: 'PE-046', ...state.row, ...state.saved })
  vm.runInNewContext(ts.transpileModule(source, { compilerOptions: { module: ts.ModuleKind.CommonJS, target: ts.ScriptTarget.ES2022 } }).outputText, {
    module, exports: module.exports, Headers, URL, URLSearchParams,
    window: { location: { hostname: runtime ? 'apps.powerapps.com' : 'localhost' } },
    fetch: async (url, init = {}) => {
      calls.push({ url, method: init.method || 'GET' })
      if (init.body) state.saved = JSON.parse(init.body)
      return { ok: true, json: async () => url.includes('EntityDefinitions') ? { value: [] } : { ...row(), value: [row()] } }
    },
    require(name) {
      if (name === '@microsoft/power-apps/data') return { getClient: () => ({ executeAsync: async ({ connectorOperation: operation }) => {
        assert.equal(runtime, true, 'Local tests must not call connector operations')
        calls.push(operation)
        assert.match(operation.operationName, /^(GetRecord|ListRecords|CreateRecord|UpdateRecord)(WithOrganization)?$/)
        if (operation.parameters.item) state.saved = JSON.parse(JSON.stringify(operation.parameters.item))
        return { success: true, data: { ...row(), value: [row()] } }
      } }) }
      if (name.includes('dataSourcesInfo')) return { dataSourcesInfo: {} }
      if (name === './auth') return { getAuthToken: () => 'test-token', ensureAuthToken: async () => 'test-token' }
      if (name === './archive') return { excludeArchived: (filter) => filter || 'cmps_isarchived ne 125570000' }
      if (name === './serviceSiteLabels') return { formatServiceSiteLabel: (value) => String(value || '') }
      if (name === './dataverseRecordPages') return { readDataverseRecordPages: () => { throw Error('Unexpected paged query') } }
      throw Error('Unexpected import ' + name)
    },
  })
  return { api: module.exports, state, calls }
}

for (const runtime of [false, true]) {
  const mode = runtime ? 'connector' : 'local'
  test(mode + ': saved IDs override malformed Relationship display labels and resave as integers', async () => {
    const { api, state } = service(runtime)
    state.row = {
      cmps_relationshiptoabuser: '125570004,125570000',
      ['cmps_relationshiptoabuser' + annotation]: 'Relationship; Current or Former Spouse or Intimate Partner',
      cmps_servicestartdate: '2026-03-17T00:00:00Z', cmps_serviceenddate: '2026-10-09T00:00:00Z',
    }
    const record = await api.loadProgramEnrollmentDetailRecord(rowId)
    assert.equal(record.values.cmps_relationshiptoabuser, 'Current or Former Dating Relationship, Current or Former Spouse or Intimate Partner')
    await api.updateProgramEnrollmentResponse(rowId, record.values)
    assert.equal(state.saved.cmps_relationshiptoabuser, '125570004,125570000')
    assert.equal(state.saved.cmps_servicestartdate, '2026-03-17')
    assert.equal(state.saved.cmps_serviceenddate, '2026-10-09')
  })
  test(mode + ': all Program Enrollment checkbox choices round-trip without text in payloads', async () => {
    const { api, state } = service(runtime)
    for (const field of api.PROGRAM_ENROLLMENT_FIELDS.filter((field) => field.input === 'checkbox-group')) {
      const choices = field.options.filter((value) => value !== '--Please Select--')
      const ids = choices.map((_, index) => String(125570000 + index)).join(',')
      await api.createProgramEnrollmentResponse({ [field.field]: choices.join(', ') })
      assert.equal(state.saved[field.field], ids, field.field)
      state.row[field.field + annotation] = 'Stale label that is not a current option'
      const record = await api.loadProgramEnrollmentDetailRecord(rowId)
      assert.equal(record.values[field.field], choices.join(', '), field.field)
      await api.updateProgramEnrollmentResponse(rowId, { [field.field]: record.values[field.field] })
      assert.equal(state.saved[field.field], ids, field.field)
    }
  })
  test(mode + ': invalid choices fail before any request with field-specific guidance on create and update', async () => {
    for (const method of ['create', 'update']) {
      for (const [field, value, label] of [
        ['cmps_relationshiptoabuser', 'Relationship,125570000', 'Relationship to Abuser'],
        ['cmps_victimtype1', 'Unrecognized type, Domestic Violence', 'Victim Type'],
        ['cmps_clienttype', 'Unrecognized type', 'Client Type'],
        ['cmps_relationshiptoabuser', '999999999999999999', 'Relationship to Abuser'],
      ]) {
        const { api, calls } = service(runtime)
        const save = method === 'create' ? api.createProgramEnrollmentResponse({ [field]: value }) : api.updateProgramEnrollmentResponse(rowId, { [field]: value })
        await assert.rejects(save, (error) => error.message.includes(label) && error.message.includes(field) && !error.message.includes('Date Debug'))
        assert.equal(calls.length, 0, 'Do not send a partial payload or guess a replacement')
      }
    }
  })
  test(mode + ': unknown legacy numeric choices are retained, never silently removed or relabeled', async () => {
    const { api, state } = service(runtime)
    state.row = { cmps_relationshiptoabuser: '125570099,125570000', ['cmps_relationshiptoabuser' + annotation]: 'Legacy custom choice; Bad current label' }
    const record = await api.loadProgramEnrollmentDetailRecord(rowId)
    assert.equal(record.values.cmps_relationshiptoabuser, '125570099, Current or Former Spouse or Intimate Partner')
    await api.updateProgramEnrollmentResponse(rowId, record.values)
    assert.equal(state.saved.cmps_relationshiptoabuser, '125570099,125570000')
  })
}

test('multi-select separators, mixed labels/IDs and duplicates encode safely without changing option IDs', async () => {
  const { api, state } = service()
  await api.createProgramEnrollmentResponse({ cmps_relationshiptoabuser: '125570000; Relationship Unknown,125570000;Parent/Grandparent' })
  assert.equal(state.saved.cmps_relationshiptoabuser, '125570000,125570007,125570001')
})
test('formatted-only legacy records remain reviewable but invalid labels cannot be sent to Dataverse', async () => {
  const { api, state, calls } = service()
  state.row = { ['cmps_relationshiptoabuser' + annotation]: 'Relationship; Current or Former Spouse or Intimate Partner' }
  const record = await api.loadProgramEnrollmentDetailRecord(rowId)
  assert.equal(record.values.cmps_relationshiptoabuser, 'Relationship, Current or Former Spouse or Intimate Partner')
  const before = calls.length
  await assert.rejects(api.updateProgramEnrollmentResponse(rowId, record.values), /Invalid selection for Relationship to Abuser.*"Relationship"/)
  assert.equal(calls.length, before)
})
test('single-select numeric IDs also override stale labels while real empty dates can still be cleared', async () => {
  const { api, state } = service()
  state.row = { cmps_clienttype: 125570000, ['cmps_clienttype' + annotation]: 'Outdated adult label' }
  const record = await api.loadProgramEnrollmentDetailRecord(rowId)
  assert.equal(record.values.cmps_clienttype, 'Adult')
  await api.updateProgramEnrollmentResponse(rowId, { ...record.values, cmps_serviceenddate: '' })
  assert.equal(state.saved.cmps_clienttype, '125570000')
  assert.equal(state.saved.cmps_serviceenddate, null)
})
test('program and nonsequential project choices retain their immutable IDs despite outdated labels', async () => {
  const { api, state } = service()
  state.row = {
    cmps_program: 125570005, ['cmps_program' + annotation]: 'SV',
    cmps_projecttype: 125570011, ['cmps_projecttype' + annotation]: 'Old service project label',
  }
  const record = await api.loadProgramEnrollmentDetailRecord(rowId)
  assert.equal(record.values.cmps_program, 'REACH Center')
  assert.equal(record.values.cmps_projecttype, 'Services Only')
  await api.updateProgramEnrollmentResponse(rowId, record.values)
  assert.equal(state.saved.cmps_program, '125570005')
  assert.equal(state.saved.cmps_projecttype, '125570011')
  state.row.cmps_program = 125570007
  state.saved = {}
  const historical = await api.loadProgramEnrollmentDetailRecord(rowId)
  assert.equal(historical.values.cmps_program, 'DVHEART')
  await api.updateProgramEnrollmentResponse(rowId, historical.values)
  assert.equal(state.saved.cmps_program, '125570007')
})
test('unrecognized saved multi-select options remain visible, checked, and removable in the enrollment editor', () => {
  const source = readFileSync(new URL('../App.tsx', import.meta.url), 'utf8')
  const file = ts.createSourceFile('App.tsx', source, ts.ScriptTarget.Latest, true, ts.ScriptKind.TSX)
  let branch
  function visit(node) {
    if (ts.isIfStatement(node) && node.expression.getText(file) === "effectiveInput === 'checkbox-group'" && node.thenStatement.getText(file).includes('updateProgramEnrollmentMultiSelectValue')) branch = node.thenStatement.getText(file)
    ts.forEachChild(node, visit)
  }
  visit(file)
  assert.ok(branch)
  const events = [], context = {
    value: 'Relationship, Current or Former Spouse or Intimate Partner',
    fieldDef: { field: 'cmps_relationshiptoabuser', label: 'Relationship to Abuser' },
    effectiveOptions: ['Current or Former Spouse or Intimate Partner', 'Relationship Unknown'],
    parseMultiValue: (value) => value.split(',').map((part) => part.trim()).filter(Boolean),
    normalize: (value) => value.trim().toLowerCase(),
    updateProgramEnrollmentMultiSelectValue: (...args) => events.push(args),
    require: (name) => { assert.equal(name, 'react/jsx-runtime'); return jsx },
    module: { exports: {} }, exports: {},
  }
  vm.runInNewContext(ts.transpileModule('function render() ' + branch + '; globalThis.tree = render()', { compilerOptions: { target: ts.ScriptTarget.ES2022, module: ts.ModuleKind.CommonJS, jsx: ts.JsxEmit.ReactJSX } }).outputText, context)
  const html = renderToStaticMarkup(context.tree)
  assert.match(html, /Relationship.*saved choice not in current list/)
  const options = context.tree.props.children[1].props.children
  const saved = options.find((option) => option.props.children[0].props.checked && option.props.children[0].props.onChange && option.key.endsWith('-Relationship'))
  assert.ok(saved)
  saved.props.children[0].props.onChange({ target: { checked: false } })
  assert.deepEqual(events, [['cmps_relationshiptoabuser', 'Relationship', false]])
})
