import assert from 'node:assert/strict'
import { readFileSync } from 'node:fs'
import test from 'node:test'
import vm from 'node:vm'
import ts from 'typescript'

const rowId = '11111111-1111-1111-1111-111111111111'
const enrollmentId = '22222222-2222-2222-2222-222222222222'
const retired = ['cmps_doesresidentrefusetosign', 'cmps_allergiesdoyouoryourchildrenhaveanyallergiesy', 'cmps_accommodationsdoyouoryourchildrenneedanyaccom', 'cmps_accomodationsdoyouoryourchildrenneedanyaccom']
const definition = { key: 'medical-consent', label: 'Medical Consent Form', tableAlias: 'cmps_medicalconsentforms', primaryIdField: 'cmps_medicalconsentformid' }

function harness(local = false) {
  const calls = [], cache = new Map()
  function load(file) {
    if (cache.has(file)) return cache.get(file)
    const source = readFileSync(new URL(file, import.meta.url), 'utf8').replaceAll('import.meta.env', '({})')
    const js = ts.transpileModule(source, { compilerOptions: { module: ts.ModuleKind.CommonJS, target: ts.ScriptTarget.ES2022 } }).outputText
    const module = { exports: {} }; cache.set(file, module.exports)
    vm.runInNewContext(js, {
      module, exports: module.exports, URLSearchParams,
      window: { location: { hostname: local ? 'localhost' : 'powerapps.example' } },
      fetch: async (url, init) => { calls.push({ url, init }); return { ok: true, json: async () => ({ cmps_medicalconsentformid: rowId }) } },
      require(name) {
        if (name === '@microsoft/power-apps/data') return { getClient: () => ({ executeAsync: async ({ connectorOperation: operation }) => { calls.push(operation); return { success: true, data: { cmps_medicalconsentformid: rowId } } } }) }
        if (name.includes('dataSourcesInfo')) return { dataSourcesInfo: {} }
        if (name === './auth') return { getAuthToken: () => 'test-token', ensureAuthToken: async () => 'test-token' }
        if (name === './archive') return { ARCHIVE_TABLES: [definition] }
        if (name.startsWith('./')) return load(`${name}.ts`)
        throw new Error(`Unexpected dependency ${name}`)
      },
    }, { filename: file })
    return module.exports
  }
  return { load, calls }
}

test('Medical Consent keeps the existing labels and textareas but maps only the replacement columns', () => {
  const { load } = harness(), fields = load('./medicalConsentForm.ts').MEDICAL_CONSENT_FORM_FIELDS
  const allergies = fields.find((field) => field.label.startsWith('Allergies --'))
  const accommodations = fields.find((field) => field.label.startsWith('Accommodations --'))
  assert.equal(allergies.field, 'cmps_pleaselistallergies')
  assert.equal(allergies.label, 'Allergies -- Do you or your children have any allergies you feel we should know about?')
  assert.equal(accommodations.field, 'cmps_pleaselistaccommodations')
  assert.equal(accommodations.label, 'Accommodations -- Do you or your children need any accommodations or assistance?')
  for (const field of [allergies, accommodations]) { assert.equal(field.input, 'textarea'); assert.equal(field.section, 'Medical Information') }
  assert.equal(fields.some((field) => retired.includes(field.field)), false)
  const refusal = fields.find((field) => field.label === 'Does Resident Refuse to Sign?')
  assert.equal(refusal.field, 'cmps_doestheresidentrefusetosign')
  assert.equal(refusal.input, 'radio')
  assert.equal(refusal.required, true)
  assert.deepEqual(Array.from(refusal.options), ['Yes', 'No'])
})

for (const local of [false, true]) test(`${local ? 'local' : 'runtime'} Medical Consent create and edit save replacement columns and never send retired draft fields`, async () => {
  const h = harness(local), api = h.load('./medicalConsentForm.ts')
  const seed = {
    cmps_recordid: 'MCF-046', cmps_peid: enrollmentId, cmps_completiondate: '2026-10-06', cmps_doestheresidentrefusetosign: 'No',
    cmps_pleaselistallergies: 'Peanuts\nPenicillin', cmps_pleaselistaccommodations: 'Accessible room and assistance',
    ...Object.fromEntries(retired.map((column) => [column, 'Retired draft value'])),
  }
  const created = await api.createMedicalConsentFormResponse(seed)
  assert.equal(created.id, rowId); assert.equal(created.recordId, 'MCF-046')
  await api.updateMedicalConsentFormResponse(rowId, { ...seed, cmps_pleaselistallergies: 'Updated allergy', cmps_pleaselistaccommodations: 'Updated accommodation' })
  assert.equal(h.calls.length, 2)
  h.calls.forEach((call, index) => {
    const payload = local ? JSON.parse(call.init.body) : call.parameters.item
    assert.equal(payload.cmps_pleaselistallergies, index ? 'Updated allergy' : 'Peanuts\nPenicillin')
    assert.equal(payload.cmps_pleaselistaccommodations, index ? 'Updated accommodation' : 'Accessible room and assistance')
    for (const column of retired) assert.equal(Object.hasOwn(payload, column), false)
    assert.equal(payload['cmps_peid@odata.bind'], `/cmps_programenrollment1s(${enrollmentId})`)
    assert.equal(payload.cmps_doestheresidentrefusetosign, 125570001)
    assert.equal(payload.cmps_completiondate, '2026-10-06')
    if (local) assert.equal(call.init.method, index ? 'PATCH' : 'POST')
    else assert.equal(call.operationName, index ? 'UpdateRecordWithOrganization' : 'CreateRecordWithOrganization')
  })
  for (const column of retired) assert.equal(seed[column], 'Retired draft value')
})

test('Program search record loading uses the replacement Medical Consent mappings and ignores retired stored values', async () => {
  const h = harness(), fields = h.load('./medicalConsentForm.ts').MEDICAL_CONSENT_FORM_FIELDS, api = h.load('./programTableSearch.ts')
  const context = { hub: { id: 'autumn-house', title: 'Autumn House', roleMatchers: ['autumn house'] }, profiles: [{ roleName: 'Autumn House Manager', entries: [{ formName: 'Medical Consent Form', permissions: { search: true, view: true, ignoreProgramAssignment: true } }] }] }
  const metadata = { LogicalName: 'cmps_medicalconsentform', EntitySetName: definition.tableAlias, PrimaryIdAttribute: definition.primaryIdField,
    Attributes: [...fields.filter((field) => field.input !== 'html').map((field) => ({ LogicalName: field.field, AttributeType: field.input === 'lookup' ? 'Lookup' : 'String' })), ...retired.map((field) => ({ LogicalName: field, AttributeType: 'String' }))], ManyToOneRelationships: [] }
  const gateway = { metadata: async () => metadata, query: async (_, xml) => {
    assert.match(xml, /attribute name="cmps_pleaselistallergies"/)
    assert.match(xml, /attribute name="cmps_pleaselistaccommodations"/)
    assert.match(xml, /attribute name="cmps_doestheresidentrefusetosign"/)
    for (const column of retired) assert.equal(xml.includes(`<attribute name="${column}"`), false)
    return { value: [{ cmps_medicalconsentformid: rowId, cmps_pleaselistallergies: 'Current allergy', cmps_pleaselistaccommodations: 'Current accommodation', ...Object.fromEntries(retired.map((column) => [column, 'Old stored value'])) }] }
  } }
  const signal = new AbortController().signal
  const plan = await api.inspectProgramSearch(context, definition.key, fields, gateway, signal)
  const values = await api.loadProgramSearchRecord(context, plan, rowId, gateway, signal)
  assert.equal(values.find((field) => field.field === 'cmps_pleaselistallergies').value, 'Current allergy')
  assert.equal(values.find((field) => field.field === 'cmps_pleaselistaccommodations').value, 'Current accommodation')
  assert.equal(values.some((field) => retired.includes(field.field)), false)
  const app = readFileSync(new URL('../App.tsx', import.meta.url), 'utf8')
  assert.match(app, /'medical-consent': MEDICAL_CONSENT_FORM_FIELDS/)
  assert.match(app, /MEDICAL_CONSENT_FORM_FIELDS.filter\(\(fieldDef\) => fieldDef.section === section\)/)
})
