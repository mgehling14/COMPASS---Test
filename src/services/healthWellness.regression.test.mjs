import assert from 'node:assert/strict'
import { readFileSync } from 'node:fs'
import test from 'node:test'
import vm from 'node:vm'
import ts from 'typescript'

const rowId = '11111111-1111-1111-1111-111111111111'
const clientId = '22222222-2222-2222-2222-222222222222'
const field = 'cmps_seizureemergencyprotocol1'
const retired = 'cmps_seizureemergencyprotocol'
const options = ['Contact treating physician', 'Call 911 for transport to hospital', 'Notify emergency contact', 'Other']
const app = readFileSync(new URL('../App.tsx', import.meta.url), 'utf8')

function harness(local, handler = () => ({})) {
  const source = readFileSync(new URL('./healthAndWellnessQuestionnaire.ts', import.meta.url), 'utf8').replaceAll('import.meta.env', '({})')
  const js = ts.transpileModule(source, { compilerOptions: { module: ts.ModuleKind.CommonJS, target: ts.ScriptTarget.ES2022 } }).outputText
  const module = { exports: {} }, calls = []
  vm.runInNewContext(js, {
    module, exports: module.exports, Headers,
    window: { location: { hostname: local ? 'localhost' : 'powerapps.example' } },
    fetch: async (url, init) => { const call = { url, init }; calls.push(call); const body = handler(call); return { ok: true, json: async () => body } },
    require(name) {
      if (name === '@microsoft/power-apps/data') return { getClient: () => ({ executeAsync: async ({ connectorOperation: operation }) => { calls.push(operation); return { success: true, data: handler(operation) } } }) }
      if (name.includes('dataSourcesInfo')) return { dataSourcesInfo: {} }
      if (name === './auth') return { getAuthToken: () => 'test-token', ensureAuthToken: async () => 'test-token' }
      if (name === './archive') return { excludeArchived: (filter) => `(${filter}) and (cmps_isarchived ne 125570000 or cmps_isarchived eq null)` }
      throw new Error(`Unexpected dependency ${name}`)
    },
  }, { filename: 'healthAndWellnessQuestionnaire.ts' })
  return { api: module.exports, calls }
}

test('seizure checkbox mapping and physician/Other visibility reference the replacement column only', () => {
  const h = harness(false), fields = h.api.HEALTH_WELLNESS_FIELDS
  const protocol = fields.find((entry) => entry.field === field)
  assert.equal(protocol.input, 'checkbox-group'); assert.equal(protocol.required, true)
  assert.deepEqual(Array.from(protocol.options), options)
  assert.equal(fields.some((entry) => entry.field === retired), false)
  for (const name of ['cmps_physicianname', 'cmps_physicianphone', 'cmps_seizureemergencyprotocolother']) assert.equal(fields.find((entry) => entry.field === name).visibleWhen.field, field)
  assert.doesNotMatch(app, /\bcmps_seizureemergencyprotocol\b/)
  assert.equal((app.match(/\bcmps_seizureemergencyprotocol1\b/g) || []).length, 3)
})

for (const local of [false, true]) {
  const mode = local ? 'local' : 'runtime'
  const payload = (call) => local ? JSON.parse(call.init.body) : call.parameters.item
  const writing = (call) => local ? ['POST', 'PATCH'].includes(call.init.method) : /^(Create|Update)/.test(call.operationName)

  test(`${mode}: all four choices retain their existing numeric mappings on create and reload`, async () => {
    let saved = {}
    const h = harness(local, (call) => {
      if (writing(call)) saved = { ...payload(call) }
      return { ...saved, cmps_healthandwellnessquestionnaireid: rowId, _cmps_cpid_value: clientId }
    })
    for (let index = 0; index < options.length; index++) {
      const created = await h.api.createHealthWellnessResponse({ cmps_recordid: 'HWQ-046', cmps_cpid: clientId, [field]: options[index] })
      assert.equal(created.id, rowId); assert.equal(created.recordId, 'HWQ-046')
      assert.equal(saved[field], String(125570000 + index))
      assert.equal(saved['cmps_cpid@odata.bind'], `/cmps_clientprofiles(${clientId})`)
      const detail = await h.api.loadHealthWellnessDetailRecord(rowId)
      assert.equal(detail.values[field], options[index]); assert.equal(detail.values.cmps_cpid, clientId)
      const read = h.calls.at(-1), select = local ? new URL(read.url).searchParams.get('$select') : read.parameters.$select
      assert.equal(select.split(',').includes(field), true); assert.equal(select.split(',').includes(retired), false)
    }
  })

  test(`${mode}: multiple checks encode deduplicated backend choices; formatted selections reload as frontend labels`, async () => {
    let saved
    const h = harness(local, (call) => {
      if (writing(call)) saved = payload(call)
      return { ...saved, cmps_healthandwellnessquestionnaireid: rowId, [retired]: 'Old column must not be read', [`${field}@OData.Community.Display.V1.FormattedValue`]: 'Contact treating physician; Notify emergency contact; Other' }
    })
    await h.api.updateHealthWellnessResponse(rowId, { [field]: 'Contact treating physician;125570002;Other;Contact treating physician', [retired]: 'Old column must not be saved' })
    assert.equal(saved[field], '125570000,125570002,125570003')
    assert.equal(Object.hasOwn(saved, retired), false)
    const detail = await h.api.loadHealthWellnessDetailRecord(rowId)
    assert.equal(detail.values[field], 'Contact treating physician, Notify emergency contact, Other')
    assert.equal(Object.hasOwn(detail.values, retired), false)
    await h.api.updateHealthWellnessResponse(rowId, detail.values)
    assert.equal(saved[field], '125570000,125570002,125570003')
  })

  test(`${mode}: explicitly deselecting all protocols clears the column while omitted protocols remain untouched`, async () => {
    const h = harness(local)
    await h.api.updateHealthWellnessResponse(rowId, { [field]: '' })
    assert.equal(payload(h.calls.at(-1))[field], null)
    await h.api.updateHealthWellnessResponse(rowId, { cmps_recordid: 'HWQ-046', [retired]: 'Other' })
    const updated = payload(h.calls.at(-1))
    assert.equal(Object.hasOwn(updated, field), false); assert.equal(Object.hasOwn(updated, retired), false)
  })

  test(`${mode}: unknown labels and unmapped numeric choices fail before any write`, async () => {
    const h = harness(local)
    for (const value of ['Unknown protocol', '125570004', '125569999', '-1', 'Other,125570004']) await assert.rejects(() => h.api.updateHealthWellnessResponse(rowId, { [field]: value }), /Invalid choice for Seizure Emergency Protocol/)
    assert.equal(h.calls.length, 0)
  })
}

test('actual required-field logic uses new selections to show emergency-contact requirements', () => {
  const h = harness(false), marker = "} else if (session.kind === 'health-wellness') {"
  const start = app.indexOf(marker), end = app.indexOf("} else if (session.kind === 'focus-plan') {", start)
  assert.ok(start >= 0 && end > start)
  const branch = app.slice(start + marker.length, end)
  const requiredFor = (selected, oldSelected = '') => {
    const required = new Map()
    vm.runInNewContext(branch, { HEALTH_WELLNESS_FIELDS: h.api.HEALTH_WELLNESS_FIELDS,
      session: { kind: 'health-wellness', values: { cmps_doyouexperienceseizures: 'Yes', [field]: selected, [retired]: oldSelected } },
      normalize: (value) => String(value || '').trim().toLowerCase(), parseMultiValue: (value) => value.split(',').map((entry) => entry.trim()).filter(Boolean),
      add: (name, label) => required.set(name, label),
    })
    return required
  }
  assert.equal(requiredFor('Notify emergency contact').has('cmps_incaseofamedicalemergencydoyouhaveanemergency'), true)
  assert.equal(requiredFor('Other', 'Notify emergency contact').has('cmps_incaseofamedicalemergencydoyouhaveanemergency'), false)
  assert.equal(requiredFor('Notify emergency contact').has(field), true)
})
