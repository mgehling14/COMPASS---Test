import assert from 'node:assert/strict'
import { readFileSync } from 'node:fs'
import vm from 'node:vm'
import test from 'node:test'
import ts from 'typescript'

const id = (n) => '11111111-1111-1111-1111-' + String(n).padStart(12, '0')
const clientId = id(1), enrollmentId = id(2), otherClient = id(3)
const definitions = [
  ['child-shelter-intake', 'childShelterIntake', 'cmps_childshelterintakes', 'cmps_childshelterintakeid', '', 'cmps_peid'],
  ['medical-consent', 'medicalConsentForm', 'cmps_medicalconsentforms', 'cmps_medicalconsentformid', '', 'cmps_peid'],
  ['shelter-program-guidelines', 'shelterProgramGuidelines', 'cmps_shelterprogramguidelineses', 'cmps_shelterprogramguidelinesid', '', 'cmps_peid'],
  ['animal-agreement', 'animalAgreement', 'cmps_animalagreements', 'cmps_animalagreementid', 'cmps_cpid', ''],
  ['acknowledgement-and-consent', 'acknowledgementAndConsent', 'cmps_acknowledgementandconsentforms', 'cmps_acknowledgementandconsentformid', 'cmps_cpid', 'cmps_peid'],
  ['adult-assessment', 'adultAssessment', 'cmps_adultassessments', 'cmps_adultassessmentid', 'cmps_cpid', 'cmps_peid'],
]
const org = 'https://example.crm.dynamics.com'
const metadata = (lookups = ['cmps_peid']) => ({ value: [
  { LogicalName: 'cmps_shelterprogramguidelines', EntitySetName: 'cmps_shelterprogramguidelineses', PrimaryIdAttribute: 'cmps_shelterprogramguidelinesid', ManyToOneRelationships: lookups.map((name) => ({ ReferencingAttribute: name, ReferencedEntity: 'cmps_programenrollment1' })) },
  { LogicalName: 'cmps_programenrollment1', EntitySetName: 'cmps_programenrollment1s', PrimaryIdAttribute: 'cmps_programenrollment1id' },
  { LogicalName: 'cmps_clientprofile', EntitySetName: 'cmps_clientprofiles', PrimaryIdAttribute: 'cmps_clientprofileid' },
] })
function harness(local, respond = () => ({ value: [] }), schema = () => metadata()) {
  const calls = [], cache = new Map()
  function load(name) {
    if (cache.has(name)) return cache.get(name)
    const source = readFileSync(new URL('./' + name + '.ts', import.meta.url), 'utf8').replaceAll('import.meta.env', '({VITE_DATAVERSE_ORG_URL:"https://example.crm.dynamics.com"})'), module = { exports: {} }
    cache.set(name, module.exports)
    vm.runInNewContext(ts.transpileModule(source, { compilerOptions: { target: ts.ScriptTarget.ES2022, module: ts.ModuleKind.CommonJS } }).outputText, {
      module, exports: module.exports, URL, URLSearchParams, Headers,
      window: { location: { hostname: local ? 'localhost' : 'powerapps.example' } },
      fetch: async (url) => { const uri = new URL(url), call = { table: uri.pathname.split('/').at(-1), query: Object.fromEntries(uri.searchParams) }; calls.push(call); const result = call.table === 'EntityDefinitions' ? schema(call) : respond(call); if (result instanceof Error) return { ok: false, text: async () => result.message }; return { ok: true, json: async () => result } },
      require(key) {
        if (key === '../../power.config.json') return JSON.parse(readFileSync(new URL(key, import.meta.url), 'utf8'))
        if (key === '@microsoft/power-apps/data') return { getClient: () => ({ executeAsync: async ({ connectorOperation: op }) => {
          assert.ok(['ListRecordsWithOrganization', 'GetNextPageWithOrganization'].includes(op.operationName), 'Reads must never write data')
          const call = { table: op.parameters.entityName, query: op.parameters, operation: op.operationName }; calls.push(call); const result = call.table === 'EntityDefinitions' ? schema(call) : respond(call)
          return result instanceof Error ? { success: false, error: { message: result.message } } : { success: true, data: result }
        } }) }
        if (key.includes('dataSourcesInfo')) return { dataSourcesInfo: {} }
        if (key === './auth') return { getAuthToken: () => 'test', ensureAuthToken: async () => 'test' }
        if (key === './archive') return { excludeArchived: (filter) => '(' + filter + ') and (cmps_isarchived ne 125570000 or cmps_isarchived eq null)' }
        if (key.startsWith('./')) return load(key.slice(2))
        throw Error(key)
      },
    })
    return module.exports
  }
  return { load, calls }
}
for (const local of [true, false]) for (const [kind, , alias, primary, clientLookup, enrollmentLookup] of definitions) test(kind + ': ' + (local ? 'local' : 'connector') + ' direct/enrollment links are correctly counted once and archived/foreign records stay excluded', async () => {
  const rows = []
  if (clientLookup) rows.push({ [primary]: id(10), _cmps_cpid_value: clientId, cmps_recordid: 'REC-10' })
  if (enrollmentLookup) rows.push({ [primary]: id(11), _cmps_peid_value: enrollmentId, cmps_recordid: 'REC-11' })
  if (clientLookup && enrollmentLookup) rows.push({ [primary]: id(12), _cmps_cpid_value: clientId, _cmps_peid_value: enrollmentId, cmps_recordid: 'REC-12' })
  rows.push({ [primary]: id(13), _cmps_cpid_value: clientLookup ? otherClient : undefined, _cmps_peid_value: enrollmentLookup ? id(99) : undefined })
  rows.push({ [primary]: id(14), _cmps_cpid_value: clientLookup ? clientId : undefined, _cmps_peid_value: enrollmentLookup ? enrollmentId : undefined, cmps_isarchived: 125570000 })
  if (clientLookup && enrollmentLookup) rows.push({ [primary]: id(15), _cmps_cpid_value: otherClient, _cmps_peid_value: enrollmentId })
  const h = harness(local, () => ({ value: rows })), records = await h.load('clientLinkedRecords').listClientLinkedRecords({ tableAlias: alias, primaryIdField: primary, recordIdField: 'cmps_recordid', ...(clientLookup ? { clientLookup } : {}), ...(enrollmentLookup ? { enrollmentLookup } : {}) }, clientId, [enrollmentId])
  assert.equal(records.length, clientLookup && enrollmentLookup ? 3 : 1)
  assert.equal(new Set(records.map((row) => row.id)).size, records.length)
  for (const call of h.calls) {
    assert.match(call.query.$filter, /cmps_isarchived ne 125570000/)
    assert.equal(call.query.$top, undefined, 'No first-500 or first-200 cap')
    assert.ok((clientLookup && call.query.$filter.includes(clientId)) || (enrollmentLookup && call.query.$filter.includes(enrollmentId)))
  }
})
for (const local of [true, false]) test((local ? 'local' : 'connector') + ' all child pages and all parent enrollment pages are read', async () => {
  const rows = Array.from({ length: 1205 }, (_, n) => ({ cmps_animalagreementid: id(n + 20), _cmps_cpid_value: clientId }))
  const h = harness(local, (call) => call.query.$skiptoken ? { value: rows.slice(1000) } : { value: rows.slice(0, 1000), '@odata.nextLink': org + '/api/data/v9.2/cmps_animalagreements?$skiptoken=second' })
  assert.equal((await h.load('clientLinkedRecords').listClientLinkedRecords({ tableAlias: 'cmps_animalagreements', primaryIdField: 'cmps_animalagreementid' }, clientId)).length, 1205)
  const p = harness(local, (call) => call.query.$skiptoken ? { value: [{ cmps_programenrollment1id: id(22), _cmps_clientid_value: clientId, cmps_serviceenddate: '2020-01-01' }] } : { value: [{ cmps_programenrollment1id: id(21), _cmps_clientid_value: clientId }], '@odata.nextLink': org + '/api/data/v9.2/cmps_programenrollment1s?$skiptoken=next' })
  const enrollments = await p.load('programEnrollment').listProgramEnrollmentsForClientRecord(clientId)
  assert.equal(enrollments.length, 2)
  assert.equal(enrollments[1].serviceEndDate, '2020-01-01', 'Historical ended enrollments remain valid for viewing linked records')
})
for (const local of [true, false]) test((local ? 'local' : 'connector') + ' Adult Assessment includes directly linked legacy rows even without enrollment', async () => {
  const h = harness(local, () => ({ value: [{ cmps_adultassessmentid: id(40), _cmps_cpid_value: clientId, cmps_assessmentdate: '2026-10-14', cmps_recordid: 'AA-040', cmps_isthisaninitialassessment: 125570000 }] }))
  const records = await h.load('adultAssessment').listAdultAssessmentsForProgramEnrollments([], clientId)
  assert.equal(records.length, 1); assert.equal(records[0].assessmentDate, '2026-10-14'); assert.equal(records[0].isInitialAssessment, 'Yes')
})
for (const local of [true, false]) for (const [kind, , alias, primary, direct, parent] of definitions.filter(([kind]) => kind !== 'adult-assessment')) test(kind + ': ' + (local ? 'local' : 'connector') + ' opens the client-owned row through its supported lookup and refuses another client', async () => {
  const row = { [primary]: id(50), cmps_recordid: 'REC-050', ...(direct ? { _cmps_cpid_value: clientId } : {}), ...(parent ? { _cmps_peid_value: enrollmentId } : {}) }
  const h = harness(local, () => ({ value: [row] })), api = h.load('clientConsentForms')
  assert.equal((await api.loadClientConsentFormRecord(kind, id(50), clientId, [enrollmentId])).recordId, 'REC-050')
  assert.equal(h.calls.at(-1).table, alias)
  const denied = harness(local, () => ({ value: [{ ...row, ...(direct ? { _cmps_cpid_value: otherClient } : { _cmps_peid_value: id(99) }) }] }))
  await assert.rejects(denied.load('clientConsentForms').loadClientConsentFormRecord(kind, id(50), clientId, [enrollmentId]), /does not belong/)
})
test('read errors and repeated paging fail visibly instead of falling back to unrelated rows or zero counts', async () => {
  for (const local of [true, false]) {
    const h = harness(local, () => Error('Read forbidden'))
    await assert.rejects(h.load('clientLinkedRecords').listClientLinkedRecords({ tableAlias: 'cmps_animalagreements', primaryIdField: 'cmps_animalagreementid' }, clientId), /Read forbidden/)
    assert.equal(h.calls.length, 1)
    const repeated = harness(local, () => ({ value: [], '@odata.nextLink': org + '/api/data/v9.2/cmps_animalagreements?$skiptoken=same' }))
    await assert.rejects(repeated.load('clientLinkedRecords').listClientLinkedRecords({ tableAlias: 'cmps_animalagreements', primaryIdField: 'cmps_animalagreementid' }, clientId), /repeated/)
  }
})
for (const local of [true, false]) test('Shelter Guidelines: ' + (local ? 'local' : 'connector') + ' verifies all enrollment lookups, includes legacy and current links, and opens alternate links', async () => {
  const primary = 'cmps_shelterprogramguidelinesid', tableAlias = 'cmps_shelterprogramguidelineses', legacyParent = id(80)
  const rows = [
    { [primary]: id(81), _cmps_peid_value: enrollmentId, cmps_recordid: 'SPG-081' },
    { [primary]: id(82), _cmps_programenrollment_value: legacyParent, cmps_recordid: 'SPG-082' },
    { [primary]: id(83), _cmps_peid_value: enrollmentId, _cmps_programenrollment_value: legacyParent, cmps_recordid: 'SPG-083' },
    { [primary]: id(84), _cmps_programenrollment_value: id(99) },
    { [primary]: id(85), _cmps_programenrollment_value: legacyParent, cmps_isarchived: 125570000 },
  ]
  const h = harness(local, () => ({ value: rows }), () => metadata(['cmps_peid', 'cmps_programenrollment']))
  const api = h.load('clientLinkedRecords'), source = { tableAlias, primaryIdField: primary, enrollmentLookup: 'cmps_peid', verifyRelationships: true }
  const records = await api.listClientLinkedRecords(source, clientId, [enrollmentId, legacyParent])
  assert.equal(records.length, 3)
  assert.equal(source.tableAlias, tableAlias, 'Never mutate configured aliases')
  await api.listClientLinkedRecords(source, clientId, [enrollmentId, legacyParent])
  assert.equal(h.calls.filter((call) => call.table === 'EntityDefinitions').length, 1, 'Verified mappings are cached')
  for (const call of h.calls.filter((call) => call.table !== 'EntityDefinitions')) {
    assert.equal(call.table, tableAlias)
    assert.ok(!call.query.$filter.includes('_cmps_cpid_value'), 'Guidelines must remain enrollment-linked')
    assert.match(call.query.$select, /_cmps_programenrollment_value/)
  }
  const open = harness(local, () => ({ value: [rows[1]] }), () => metadata(['cmps_programenrollment']))
  const detail = await open.load('clientConsentForms').loadClientConsentFormRecord('shelter-program-guidelines', id(82), clientId, [legacyParent])
  assert.equal(detail.values.cmps_peid, legacyParent, 'The form displays the verified parent even if the legacy lookup name differs')
  assert.ok(!open.calls.at(-1).query.$select.includes('_cmps_peid_value'), 'Do not select a nonexistent assumed lookup')
})

for (const local of [true, false]) test('Shelter Guidelines: ' + (local ? 'local' : 'connector') + ' never hides mapping failures behind an empty count, and retries failed metadata', async () => {
  let attempts = 0
  const h = harness(local, () => ({ value: [] }), () => ++attempts === 1 ? Error('Schema read failed') : metadata(['cmps_programenrollment']))
  const api = h.load('clientLinkedRecords'), source = { tableAlias: 'cmps_shelterprogramguidelineses', primaryIdField: 'cmps_shelterprogramguidelinesid', enrollmentLookup: 'cmps_peid', verifyRelationships: true }
  await assert.rejects(api.listClientLinkedRecords(source, clientId, [enrollmentId]), /Schema read failed/)
  assert.equal(h.calls.length, 1, 'Never use an unverified or unscoped query')
  assert.equal((await api.listClientLinkedRecords(source, clientId, [enrollmentId])).length, 0)
  const missing = harness(local, () => ({ value: [] }), () => metadata([]))
  await assert.rejects(missing.load('clientLinkedRecords').listClientLinkedRecords(source, clientId, [enrollmentId]), /No verified parent lookup/)
})

test('confirmed aliases are used consistently by forms, lists, archive and migration/search catalog', () => {
  const h = harness(false), archive = readFileSync(new URL('./archive.ts', import.meta.url), 'utf8')
  assert.equal(h.load('acknowledgementAndConsent').ACKNOWLEDGEMENT_AND_CONSENT_TABLE_ALIAS, 'cmps_acknowledgementandconsentforms')
  assert.equal(h.load('animalAgreement').ANIMAL_AGREEMENT_TABLE_ALIAS, 'cmps_animalagreements')
  assert.match(archive, /tableAlias: 'cmps_acknowledgementandconsentforms'/)
  assert.match(archive, /tableAlias: 'cmps_animalagreements'/)
})

test('all six accordions use real record collections, scoped enrollment ownership, and accurate loading/error badges', () => {
  const source = readFileSync(new URL('../App.tsx', import.meta.url), 'utf8')
  const tree = ts.createSourceFile('App.tsx', source, ts.ScriptTarget.Latest, true, ts.ScriptKind.TSX)
  for (const branch of ['shelterProgramGuidelinesForm', 'medicalConsentForm', 'childShelterIntakeForm', 'animalAgreementForm', 'acknowledgementAndConsentForm']) {
    let content
    function visit(node) {
      if (ts.isConditionalExpression(node) && node.condition.getText(tree) === branch) content = node.whenTrue.getText(tree)
      ts.forEachChild(node, visit)
    }
    visit(tree)
    assert.ok(content, branch)
    assert.match(content, /renderClientLinkedRecordList\(form.formName\)/, branch)
  }
  assert.match(source, /listAdultAssessmentsForProgramEnrollments\(enrollmentIds, clientId\)/)
  assert.match(source, /programEnrollmentsClientId !== clientRowId/)
  assert.match(source, /clientLinkedRecordsClientId !== selectedDetailRecord\?\.id/)
  assert.match(source, /!adultAssessmentsForClientLoading && programEnrollmentsClientId === selectedDetailRecord\?\.id/)
  assert.match(source, /countError \? 'Unavailable'/)
  assert.match(source, /canViewClientLinkedForm\(kind\)/)
  assert.match(source, /'shelter-program-guidelines': \{[^\n]+enrollmentLookup: 'cmps_peid', verifyRelationships: true/)
  assert.match(source, /clientLookupRefreshSignal, roleProfiles, selectedHub, canAccessRoleAdmin/)
})
