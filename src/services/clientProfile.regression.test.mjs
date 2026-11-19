import assert from 'node:assert/strict'
import { readFileSync } from 'node:fs'
import test from 'node:test'
import vm from 'node:vm'
import ts from 'typescript'

const rowId = '11111111-1111-1111-1111-111111111111'

test('Client Profile 1.4.0 removes the abuser mapping and calculates the multi-racial indicator from Race', async () => {
  const service = loadService()
  const api = service.api
  assert.equal(api.CLIENT_PROFILE_FIELD_NAMES.includes('cmps_isthispersonanabuser'), false)
  assert.equal(api.CLIENT_PROFILE_FIELDS.some((field) => field.field === 'cmps_isthispersonanabuser'), false)

  const indicator = api.CLIENT_PROFILE_FIELDS.find((field) => field.field === 'cmps_isclientmultiracial')
  assert.equal(indicator.input, 'readonly')
  assert.equal(indicator.requiredByDefault, false)
  assert.equal(indicator.reportingByDefault, true)
  assert.equal(indicator.label, 'Multi-racial (calculated from Race)')

  assert.equal(api.deriveClientMultiRacialValue('Asian'), 'No')
  assert.equal(api.deriveClientMultiRacialValue('Asian, Asian'), 'No')
  assert.equal(api.deriveClientMultiRacialValue('Asian, White'), 'Yes')
  assert.equal(api.updateClientProfileDraftValue({}, 'cmps_race', 'Asian').cmps_isclientmultiracial, 'No')
  assert.equal(api.updateClientProfileDraftValue({}, 'cmps_race', 'Asian, White').cmps_isclientmultiracial, 'Yes')

  await api.createClientProfileResponse({ cmps_recordid: 'CP-140', cmps_race: 'Asian, White' })
  const payload = JSON.parse(service.calls[0].init.body)
  assert.equal(payload.cmps_race, '125570001,125570004')
  assert.equal(payload.cmps_isclientmultiracial, '125570000')
  assert.equal(Object.hasOwn(payload, 'cmps_isthispersonanabuser'), false)
  const detail = await api.loadClientProfileDetailRecord(rowId)
  assert.equal(detail.values.cmps_isclientmultiracial, 'Yes')
})

test('HMIS fields are shown only for CAAFA Shelter and remain optional', () => {
  const api = loadService().api
  for (const fieldName of ['cmps_hmisid', 'cmps_hmisaliases']) {
    const field = api.CLIENT_PROFILE_FIELDS.find((entry) => entry.field === fieldName)
    assert.equal(field.visibleWhen.length, 1)
    assert.equal(field.visibleWhen[0].field, 'cmps_assignedprograms')
    assert.deepEqual(Array.from(field.visibleWhen[0].values), ['CAAFA Shelter'])
    assert.equal(field.requiredByDefault, false)
    assert.equal(field.requiredWhen, undefined)
  }
  const source = readFileSync(new URL('../App.tsx', import.meta.url), 'utf8')
  assert.ok(source.includes("cmps_assignedprograms: selectedHub?.title || ''"))

  const tree = ts.createSourceFile('App.tsx', source, ts.ScriptTarget.Latest, true, ts.ScriptKind.TSX)
  const names = new Set(['getClientProfileContextValues', 'isClientProfileFieldVisible'])
  const snippets = []
  function visit(node) { if (ts.isFunctionDeclaration(node) && names.has(node.name?.text)) snippets.push(node.getText(tree)); ts.forEachChild(node, visit) }
  visit(tree); assert.equal(snippets.length, names.size)
  const context = {
    selectedHub: { title: 'CAAFA Shelter' },
    isFieldVisible: (rules, values) => !rules?.length || rules.every((rule) => String(values[rule.field] || '').split(/[;,]+/).some((value) => rule.values.includes(value.trim()))),
  }
  vm.createContext(context)
  vm.runInContext(ts.transpileModule(snippets.join('\n'), { compilerOptions: { target: ts.ScriptTarget.ES2022 } }).outputText, context)
  const hmisId = api.CLIENT_PROFILE_FIELDS.find((entry) => entry.field === 'cmps_hmisid')
  assert.equal(context.isClientProfileFieldVisible(hmisId, { cmps_assignedprograms: 'DV Outreach' }), true, 'active CAAFA Shelter hub shows HMIS on an existing profile')
  context.selectedHub = { title: 'DV Outreach' }
  assert.equal(context.isClientProfileFieldVisible(hmisId, { cmps_assignedprograms: 'DV Outreach' }), false)
})

test("Today's Date stays mapped but hidden; Current Age still uses the actual current date when DOB changes", () => {
  const { api } = loadService()
  const today = api.CLIENT_PROFILE_FIELDS.find((field) => field.field === 'cmps_todaysdate')
  const age = api.CLIENT_PROFILE_FIELDS.find((field) => field.field === 'cmps_currentage')
  assert.equal(today.hiddenByDefault, true)
  assert.equal(today.requiredByDefault, false)
  assert.equal(age.hiddenByDefault, false)
  assert.ok(api.CLIENT_PROFILE_FIELD_NAMES.includes('cmps_todaysdate'))
  const source = readFileSync(new URL('../App.tsx', import.meta.url), 'utf8')
  const tree = ts.createSourceFile('App.tsx', source, ts.ScriptTarget.Latest, true, ts.ScriptKind.TSX)
  const names = new Set(['calculateAgeFromDateOfBirth', 'updateClientProfileValue', 'getClientProfileContextValues', 'isClientProfileFieldVisible'])
  const snippets = []
  function visit(node) { if (ts.isFunctionDeclaration(node) && names.has(node.name?.text)) snippets.push(node.getText(tree)); ts.forEachChild(node, visit) }
  visit(tree); assert.equal(snippets.length, names.size)
  class FixedDate extends Date { constructor(...args) { if (args.length) super(...args); else super('2026-10-20T19:00:00Z') } }
  const context = { Date: FixedDate, selectedHub: null, isFieldVisible: () => true, updateClientProfileDraftValue: api.updateClientProfileDraftValue }
  context.setActiveFormSession = (change) => { context.activeFormSession = change(context.activeFormSession) }
  vm.createContext(context)
  vm.runInContext(ts.transpileModule(snippets.join('\n'), { compilerOptions: { target: ts.ScriptTarget.ES2022 } }).outputText, context)
  for (const editing of [false, true]) {
    context.activeFormSession = { kind: 'client-profile', rowId: editing ? rowId : '', values: { cmps_todaysdate: '1990-01-01' } }
    assert.equal(context.isClientProfileFieldVisible(today, context.activeFormSession.values), false)
    assert.equal(context.isClientProfileFieldVisible(age, context.activeFormSession.values), true)
    context.updateClientProfileValue('cmps_dateofbirth', '2000-06-15')
    assert.equal(context.activeFormSession.values.cmps_currentage, '26')
    assert.equal(context.activeFormSession.values.cmps_todaysdate, '1990-01-01', 'hiding does not clear or rewrite stored values')
    context.updateClientProfileValue('cmps_dateofbirth', '2000-12-15')
    assert.equal(context.activeFormSession.values.cmps_currentage, '25')
    context.updateClientProfileValue('cmps_dateofbirth', '')
    assert.equal(context.activeFormSession.values.cmps_currentage, '')
  }
  assert.ok(source.includes('isClientProfileFieldVisible(fieldDef, activeFormSession.values)'))
  assert.ok(source.includes('isClientProfileFieldVisible(definition, selectedDetailRecord.values)'))
})

test('Name Data Quality is required in Client Profile validation and required-field indicators for create and edit', () => {
  const api = loadService().api
  const quality = api.CLIENT_PROFILE_FIELDS.find((field) => field.field === 'cmps_namedataquality')
  assert.equal(quality.requiredByDefault, true); assert.equal(quality.hiddenByDefault, false)
  const source = readFileSync(new URL('../App.tsx', import.meta.url), 'utf8'), tree = ts.createSourceFile('App.tsx', source, ts.ScriptTarget.Latest, true, ts.ScriptKind.TSX)
  const names = new Set(['getClientProfileContextValues', 'validateRequiredClientProfileFields', 'getActiveRequiredFields']), snippets = []
  function visit(node) { if (ts.isFunctionDeclaration(node) && names.has(node.name?.text)) snippets.push(node.getText(tree)); ts.forEachChild(node, visit) }
  visit(tree)
  const context = { CLIENT_PROFILE_FIELDS: api.CLIENT_PROFILE_FIELDS, selectedHub: null, isClientProfileFieldVisible: () => true }
  vm.createContext(context); vm.runInContext(ts.transpileModule(snippets.join('\n'), { compilerOptions: { target: ts.ScriptTarget.ES2022 } }).outputText, context)
  const values = Object.fromEntries(api.CLIENT_PROFILE_FIELDS.filter((field) => field.requiredByDefault).map((field) => [field.field, field.options[0] || 'Provided']))
  for (const rowId of ['', 'existing-client-profile']) {
    assert.equal(context.getActiveRequiredFields({ kind: 'client-profile', rowId, values }).get('cmps_namedataquality'), 'Name Data Quality')
    for (const missing of ['', '   ', undefined]) assert.ok(context.validateRequiredClientProfileFields({ ...values, cmps_namedataquality: missing }).includes('Name Data Quality'))
    for (const option of quality.options) assert.equal(context.validateRequiredClientProfileFields({ ...values, cmps_namedataquality: option }), '')
  }
})

function loadService() {
  const source = readFileSync(new URL('./clientProfile.ts', import.meta.url), 'utf8').replaceAll('import.meta.env', '({})')
  const javascript = ts.transpileModule(source, { compilerOptions: { module: ts.ModuleKind.CommonJS, target: ts.ScriptTarget.ES2022 } }).outputText
  const service = { exports: {} }
  const calls = []
  let saved = {}
  vm.runInNewContext(javascript, {
    module: service,
    exports: service.exports,
    Headers,
    window: { __APP_ORG_URL: 'https://test.crm.dynamics.com', location: { hostname: 'localhost' } },
    fetch: async (url, init) => {
      calls.push({ url, init })
      if (init.method === 'POST') saved = JSON.parse(init.body)
      if (init.method === 'PATCH') saved = { ...saved, ...JSON.parse(init.body) }
      return { ok: true, headers: new Headers(), json: async () => ({ ...saved, cmps_clientprofileid: rowId }) }
    },
    require(name) {
      if (name === '@microsoft/power-apps/data') return {
        getClient: () => ({ executeAsync: async () => { throw new Error('Unexpected connector fallback') } }),
      }
      if (name.includes('dataSourcesInfo')) return { dataSourcesInfo: {} }
      if (name === './auth') return { getAuthToken: () => 'test-token', ensureAuthToken: async () => 'test-token' }
      if (name === './archive') return { excludeArchived: (filter = '') => filter || 'cmps_isarchived ne 125570000' }
      throw new Error(`Unexpected dependency: ${name}`)
    },
  }, { filename: 'clientProfile.ts' })
  return { api: service.exports, calls }
}

test('Anonymous Profile is a fourth radio choice and saves/reloads as 125570003', async () => {
  const service = loadService()
  const quality = service.api.CLIENT_PROFILE_FIELDS.find((field) => field.field === 'cmps_namedataquality')
  assert.equal(quality.input, 'radio')
  assert.deepEqual(Array.from(quality.options), ['Full Name Reported', 'Partial, street name, or code name reported', 'Unknown/Not Reported', 'Anonymous Profile'])
  const draft = service.api.updateClientProfileDraftValue({ cmps_recordid: 'CP-001' }, 'cmps_namedataquality', 'Anonymous Profile')
  const created = await service.api.createClientProfileResponse(draft)
  assert.equal(created.id, rowId)
  const payload = JSON.parse(service.calls[0].init.body)
  assert.equal(payload.cmps_namedataquality, '125570003')
  assert.equal(payload.cmps_lastname, 'Anonymous')
  assert.equal(payload.cmps_dateofbirthknown, '125570002')
  assert.equal(payload.cmps_race, '125570005')
  assert.equal(payload.cmps_ethnicity, '125570002')
  assert.equal(payload.cmps_gender, '125570005')
  assert.equal(payload.cmps_areyouausmilitaryveteran, '125570002')
  const detail = await service.api.loadClientProfileDetailRecord(rowId)
  assert.equal(detail.values.cmps_namedataquality, 'Anonymous Profile')
  assert.equal(detail.values.cmps_lastname, 'Anonymous')
  assert.equal(service.api.isAnonymousClientProfile(detail.values), true)
})

test('anonymous defaults cover only unanswered choices that actually have Unknown/Not Reported', () => {
  const service = loadService()
  const before = { cmps_namedataquality: '125570003', cmps_lastname: 'Existing Name', cmps_gender: 'Female', cmps_race: 'Asian', cmps_primarylanguage: 'Spanish' }
  const draft = service.api.applyAnonymousClientProfileDefaults(before)
  assert.equal(draft.cmps_lastname, 'Anonymous')
  assert.equal(draft.cmps_gender, 'Female')
  assert.equal(draft.cmps_race, 'Asian')
  assert.equal(draft.cmps_primarylanguage, 'Spanish')
  for (const field of service.api.CLIENT_PROFILE_FIELDS) {
    if (field.field === 'cmps_namedataquality' || before[field.field]) continue
    const unknown = field.options.find((option) => option === 'Unknown/Not Reported')
    assert.equal(draft[field.field], unknown)
  }
  assert.equal(before.cmps_lastname, 'Existing Name')
  assert.equal(before.cmps_ethnicity, undefined)
  assert.equal(draft.cmps_namedataquality, '125570003')
})

test('anonymous last name stays locked while other unknown defaults remain editable', () => {
  const service = loadService()
  let draft = service.api.updateClientProfileDraftValue({}, 'cmps_namedataquality', 'Anonymous Profile')
  draft = service.api.updateClientProfileDraftValue(draft, 'cmps_lastname', 'Changed Name')
  assert.equal(draft.cmps_lastname, 'Anonymous')
  draft = service.api.updateClientProfileDraftValue(draft, 'cmps_gender', 'Male')
  draft = service.api.updateClientProfileDraftValue(draft, 'cmps_race', 'White')
  draft = service.api.updateClientProfileDraftValue(draft, 'cmps_areyouausmilitaryveteran', 'Yes')
  draft = service.api.updateClientProfileDraftValue(draft, 'cmps_ethnicity', '')
  draft = service.api.updateClientProfileDraftValue(draft, 'cmps_name', 'Updated First Name')
  assert.equal(draft.cmps_gender, 'Male')
  assert.equal(draft.cmps_race, 'White')
  assert.equal(draft.cmps_areyouausmilitaryveteran, 'Yes')
  assert.equal(draft.cmps_ethnicity, '')
  assert.equal(draft.cmps_name, 'Updated First Name')
  assert.equal(draft.cmps_lastname, 'Anonymous')
})

test('changing away from Anonymous Profile unlocks last name and keeps user-selected demographics', () => {
  const service = loadService()
  let draft = service.api.updateClientProfileDraftValue({}, 'cmps_namedataquality', 'Anonymous Profile')
  draft = service.api.updateClientProfileDraftValue(draft, 'cmps_gender', 'Male')
  draft = service.api.updateClientProfileDraftValue(draft, 'cmps_namedataquality', 'Full Name Reported')
  assert.equal(service.api.isAnonymousClientProfile(draft), false)
  draft = service.api.updateClientProfileDraftValue(draft, 'cmps_lastname', 'Reported Name')
  assert.equal(draft.cmps_lastname, 'Reported Name')
  assert.equal(draft.cmps_gender, 'Male')
})

test('save enforces Anonymous last name but does not reapply defaults over changed selections', async () => {
  const service = loadService()
  await service.api.updateClientProfileResponse(rowId, {
    cmps_namedataquality: 'Anonymous Profile',
    cmps_lastname: 'Changed Name',
    cmps_gender: 'Male',
    cmps_race: 'Asian',
  })
  const payload = JSON.parse(service.calls[0].init.body)
  assert.equal(payload.cmps_lastname, 'Anonymous')
  assert.equal(payload.cmps_namedataquality, '125570003')
  assert.equal(payload.cmps_gender, '125570001')
  assert.equal(payload.cmps_race, '125570001')
  assert.equal(Object.hasOwn(payload, 'cmps_dateofbirthknown'), false)
})

test('existing Name Data Quality choice mappings remain unchanged', async () => {
  const service = loadService()
  const options = ['Full Name Reported', 'Partial, street name, or code name reported', 'Unknown/Not Reported']
  for (let index = 0; index < options.length; index += 1) {
    await service.api.updateClientProfileResponse(rowId, { cmps_namedataquality: options[index], cmps_lastname: 'Reported Name' })
    const payload = JSON.parse(service.calls[index].init.body)
    assert.equal(payload.cmps_namedataquality, String(125570000 + index))
    assert.equal(payload.cmps_lastname, 'Reported Name')
  }
})
