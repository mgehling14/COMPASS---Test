import assert from 'node:assert/strict'
import { readFileSync } from 'node:fs'
import test from 'node:test'
import vm from 'node:vm'
import ts from 'typescript'

const rowId = '11111111-1111-1111-1111-111111111111'

test('Name Data Quality is required in Client Profile validation and required-field indicators for create and edit', () => {
  const api = loadService().api
  const quality = api.CLIENT_PROFILE_FIELDS.find((field) => field.field === 'cmps_namedataquality')
  assert.equal(quality.requiredByDefault, true); assert.equal(quality.hiddenByDefault, false)
  const source = readFileSync(new URL('../App.tsx', import.meta.url), 'utf8'), tree = ts.createSourceFile('App.tsx', source, ts.ScriptTarget.Latest, true, ts.ScriptKind.TSX)
  const names = new Set(['validateRequiredClientProfileFields', 'getActiveRequiredFields']), snippets = []
  function visit(node) { if (ts.isFunctionDeclaration(node) && names.has(node.name?.text)) snippets.push(node.getText(tree)); ts.forEachChild(node, visit) }
  visit(tree)
  const context = { CLIENT_PROFILE_FIELDS: api.CLIENT_PROFILE_FIELDS, isClientProfileFieldVisible: () => true }
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
