import assert from 'node:assert/strict'
import { readFileSync } from 'node:fs'
import vm from 'node:vm'
import test from 'node:test'
import ts from 'typescript'
function loader(dependencies = {}) {
  const cache = new Map()
  function load(name) {
    if (cache.has(name)) return cache.get(name)
    const source = readFileSync(new URL('./reporting/' + name + '.ts', import.meta.url), 'utf8').replaceAll('import.meta.env', '({})'), module = { exports: {} }
    cache.set(name, module.exports)
    vm.runInNewContext(ts.transpileModule(source, { compilerOptions: { target: ts.ScriptTarget.ES2022, module: ts.ModuleKind.CommonJS } }).outputText, { module, exports: module.exports, Date, Map, Set, WeakMap, URL, URLSearchParams, AbortController, window: { location: { hostname: 'powerapps.example' } }, require(key) { if (key in dependencies) return dependencies[key]; if (key.startsWith('./')) return load(key.slice(2)); throw Error(key) } })
    return module.exports
  }
  return load
}
const load = loader(), eligibility = load('reportEligibility'), { DEFAULT_REPORT_MAPPINGS: mappings } = load('reportMappings')
const yes = 125570000, no = 125570001, guid = (n) => '00000000-0000-0000-0000-' + String(n).padStart(12, '0')
test('only explicit Yes excludes profiles; No, null and other values are included, without name heuristics', () => {
  for (const value of [yes, String(yes), 'Yes', ' yes ']) assert.equal(eligibility.profileIsExcludedFromReports({ cmps_excludefromreports: value }), true)
  for (const value of [no, String(no), null, undefined, '', 'No', 10]) assert.equal(eligibility.profileIsExcludedFromReports({ cmps_excludefromreports: value, cmps_name: 'Test', cmps_lastname: 'Test' }), false)
})
test('report archive/exclusion metadata must be verified; archive null is active and unknown archive value fails closed', () => {
  assert.throws(() => eligibility.reportArchiveFilter({ Attributes: [] }, 'table'), /cannot verify/)
  assert.throws(() => eligibility.profileReportExclusionFilter({ Attributes: [{ LogicalName: 'cmps_excludefromreports', AttributeType: 'Boolean' }] }, 'CP'), /add the/)
  assert.equal(eligibility.reportRowIsArchived({ cmps_isarchived: yes }), true)
  assert.equal(eligibility.reportRowIsArchived({ cmps_isarchived: String(no) }), false)
  assert.equal(eligibility.reportRowIsArchived({ cmps_isarchived: null }), false)
  assert.throws(() => eligibility.reportRowIsArchived({ cmps_isarchived: 'unknown' }), /Unrecognized/)
})
function snapshotHarness({ missingArchive = '', missingFlag = false } = {}) {
  const calls = [], names = ['Client_Profile', 'ProgramEnrollment', 'Services', 'Helpline', 'VOCAForm', 'BedEnrollment', 'Event'], schemas = {}
  for (const name of names) {
    const mapping = mappings[name], logical = mapping.alias === 'cmps_clientprofiles' ? 'cmps_clientprofile' : 'logical_' + name.toLowerCase()
    schemas[mapping.alias] = { LogicalName: logical, PrimaryIdAttribute: 'id_' + name.toLowerCase(), Attributes: [{ LogicalName: 'cmps_recordid', AttributeType: 'String' }, ...(!missingArchive || missingArchive !== name ? [{ LogicalName: 'cmps_isarchived', AttributeType: 'Picklist' }] : []), ...['clientLookup', 'enrollmentLookup'].filter((key) => mapping[key]).map((key) => ({ LogicalName: mapping[key], AttributeType: 'Lookup' })), ...(name === 'ProgramEnrollment' ? [{ LogicalName: 'cmps_program', AttributeType: 'Picklist' }] : []), ...(name === 'Client_Profile' && !missingFlag ? [{ LogicalName: 'cmps_excludefromreports', AttributeType: 'Picklist' }] : [])] }
  }
  const row = (name, n, fields = {}) => ({ [schemas[mappings[name].alias].PrimaryIdAttribute]: guid(n), cmps_recordid: 'ID-' + n, cmps_isarchived: no, ...fields })
  const parent = (name, cp, pe) => ({ ...(cp === undefined ? {} : { ['_' + mappings[name].clientLookup + '_value']: cp }), ...(pe === undefined ? {} : { ['_' + mappings[name].enrollmentLookup + '_value']: pe }) })
  const records = {
    Client_Profile: [row('Client_Profile', 1, { cmps_excludefromreports: yes }), row('Client_Profile', 2, { cmps_excludefromreports: no, cmps_name: 'Test' }), row('Client_Profile', 3, { cmps_excludefromreports: null }), row('Client_Profile', 4, { cmps_isarchived: yes }), row('Client_Profile', 5)],
    ProgramEnrollment: [row('ProgramEnrollment', 11, { ...parent('ProgramEnrollment', guid(1)), cmps_program: 100 }), row('ProgramEnrollment', 12, { ...parent('ProgramEnrollment', guid(2)), cmps_program: 100 }), row('ProgramEnrollment', 13, { ...parent('ProgramEnrollment', guid(3)), cmps_program: 100, cmps_isarchived: yes }), row('ProgramEnrollment', 14, { ...parent('ProgramEnrollment', guid(4)), cmps_program: 100 })],
    Services: [row('Services', 21, parent('Services', undefined, guid(11))), row('Services', 22, parent('Services', undefined, guid(12))), row('Services', 23, parent('Services', undefined, guid(13))), row('Services', 24, { ...parent('Services', undefined, guid(12)), cmps_isarchived: yes })],
    Helpline: [row('Helpline', 31, parent('Helpline', guid(1))), row('Helpline', 32, parent('Helpline', guid(2))), row('Helpline', 33), row('Helpline', 34, parent('Helpline', guid(4)))],
    VOCAForm: [row('VOCAForm', 41, parent('VOCAForm', guid(1))), row('VOCAForm', 42, parent('VOCAForm', guid(2))), row('VOCAForm', 43, parent('VOCAForm', guid(2), guid(13))), row('VOCAForm', 44, parent('VOCAForm', guid(1), guid(12)))],
    BedEnrollment: [row('BedEnrollment', 51, parent('BedEnrollment', undefined, guid(11))), row('BedEnrollment', 52, parent('BedEnrollment', undefined, guid(12)))],
    Event: [row('Event', 61), row('Event', 62, { cmps_isarchived: yes })],
  }
  const api = loader({ '@microsoft/power-apps/data': { getClient: () => ({ executeAsync: async ({ connectorOperation: op }) => {
    calls.push(op); const p = op.parameters
    assert.equal(op.operationName, 'ListRecordsWithOrganization')
    if (p.entityName === 'EntityDefinitions') return { success: true, data: { value: [schemas[p.$filter.match(/'([^']+)'/)[1]]] } }
    if (p.entityName.includes('LookupAttributeMetadata')) {
      const name = names.find((name) => p.entityName.includes("LogicalName='" + schemas[mappings[name].alias].LogicalName + "'")), field = p.$filter.match(/'([^']+)'/)[1]
      return { success: true, data: { value: [{ LogicalName: field, Targets: [schemas[mappings[field === mappings[name].clientLookup ? 'Client_Profile' : 'ProgramEnrollment'].alias].LogicalName] }] } }
    }
    if (p.entityName.includes('PicklistAttributeMetadata')) return { success: true, data: { value: [{ LogicalName: 'cmps_program', OptionSet: { Options: [{ Value: 100, Label: { UserLocalizedLabel: { Label: 'DV Outreach' } } }] } }] } }
    const name = names.find((name) => mappings[name].alias === p.entityName)
    // Intentionally ignores server filters to verify defensive paging checks.
    return { success: true, data: { value: records[name] } }
  } }) }, '../../../.power/schemas/appschemas/dataSourcesInfo': { dataSourcesInfo: {} }, '../auth': { getAuthToken: () => '' }, '../dataverseRecordPages': { readDataverseRecordPages: async (_org, _alias, query, _runtime, request) => (await request(query)).value } })('reportDataverse')
  return { calls, run: () => api.loadReportSnapshot(Object.fromEntries(names.filter((name) => name !== 'Client_Profile').map((name) => [name, ['RecordID', ...(name === 'ProgramEnrollment' ? ['Program'] : [])]])), mappings, new AbortController().signal, () => {}) }
}
test('archive and explicit exclusion cascade through real CP and PE links, never name-based or anonymous laundering', async () => {
  const h = snapshotHarness(), snapshot = await h.run(), ids = (name, key = 'RecordID') => Array.from(snapshot.tables[name], (row) => row[key])
  assert.deepEqual(ids('Client_Profile', 'document_id'), [guid(2), guid(3), guid(5)])
  assert.deepEqual(ids('ProgramEnrollment'), [guid(12)])
  assert.deepEqual(ids('Services'), [guid(22)])
  assert.deepEqual(ids('BedEnrollment'), [guid(52)])
  assert.deepEqual(ids('VOCAForm'), [guid(42)])
  assert.deepEqual(ids('Helpline'), [guid(32), guid(33)])
  assert.deepEqual(ids('Event'), [guid(61)])
  assert.equal(snapshot.tables.documents.some((row) => row.ParentId === guid(1)), false)
  assert.equal(snapshot.tables.Links.some((row) => row.LinkToId === guid(11)), false)
  assert.equal(snapshot.displayIds[guid(1)], undefined)
  const query = h.calls.find((call) => call.parameters.entityName === 'cmps_clientprofiles').parameters
  assert.match(query.$filter, /cmps_excludefromreports ne 125570000/)
  assert.match(query.$select, /cmps_excludefromreports/)
  assert.ok(snapshot.warnings.some((warning) => /not treated as anonymous/.test(warning)))
})
test('missing CP marker makes all linked sections unavailable, while standalone active Events still load', async () => {
  const snapshot = await snapshotHarness({ missingFlag: true }).run()
  for (const name of ['Client_Profile', 'ProgramEnrollment', 'Services', 'VOCAForm', 'Helpline', 'BedEnrollment']) assert.match(snapshot.unavailable[name], /cmps_excludefromreports/)
  assert.equal(snapshot.tables.Event.length, 1)
})
test('missing archive column never falls back to an unfiltered report scan', async () => {
  const h = snapshotHarness({ missingArchive: 'ProgramEnrollment' }), snapshot = await h.run()
  assert.match(snapshot.unavailable.ProgramEnrollment, /cannot verify.*cmps_isarchived/)
  assert.equal(h.calls.some((call) => call.parameters.entityName === mappings.ProgramEnrollment.alias), false)
  assert.match(snapshot.unavailable.Services, /Cannot verify linked/)
})
function adminHarness({ permission = true, archived = false, changePermission = false } = {}) {
  const calls = [], value = { cmps_clientprofileid: guid(2), cmps_recordid: 'CP-002', cmps_name: 'Example', cmps_lastname: 'Client', cmps_isarchived: archived ? yes : no, cmps_excludefromreports: no }
  const access = { canManage: () => permission, savedBy: 'IT Admin' }, schema = { PrimaryIdAttribute: 'cmps_clientprofileid', Attributes: [{ LogicalName: 'cmps_isarchived', AttributeType: 'Picklist' }, { LogicalName: 'cmps_excludefromreports', AttributeType: 'Picklist' }, { LogicalName: 'cmps_modifiedby', AttributeType: 'String' }] }
  const api = loader({ '@microsoft/power-apps/data': { getClient: () => ({ executeAsync: async ({ connectorOperation: op }) => { calls.push(op); if (op.operationName === 'UpdateRecordWithOrganization') Object.assign(value, op.parameters.item); else if (changePermission) permission = false; return { success: true, data: { value: [value] } } } }) }, '../../../.power/schemas/appschemas/dataSourcesInfo': { dataSourcesInfo: {} }, '../auth': { getAuthToken: () => '' }, './reportDataverse': { readReportSchema: async () => schema } })('clientReportExclusion')
  return { calls, save: (excluded = true) => api.saveClientReportExclusion(guid(2), excluded, access, new AbortController().signal) }
}
test('IT Admin saves only the CP report flag and modified-by, confirms it, and can include again', async () => {
  const h = adminHarness(); assert.equal((await h.save()).excluded, true); assert.equal((await h.save(false)).excluded, false)
  const writes = h.calls.filter((call) => call.operationName === 'UpdateRecordWithOrganization')
  assert.equal(writes.length, 2); assert.deepEqual(JSON.parse(JSON.stringify(writes[0].parameters.item)), { cmps_excludefromreports: yes, cmps_modifiedby: 'IT Admin' })
  assert.equal(writes.every((call) => call.parameters.entityName === 'cmps_clientprofiles'), true)
})
test('non-admin and View as User cannot interact, and permission revocation before write prevents saving', async () => {
  for (const options of [{ permission: false }, { changePermission: true }]) { const h = adminHarness(options); await assert.rejects(h.save(), /Only IT Admin/); assert.equal(h.calls.some((call) => call.operationName.startsWith('Update')), false) }
})
test('archived profile report flags are not changed; UI is hidden outside the IT Admin guard', async () => {
  const h = adminHarness({ archived: true }); await assert.rejects(h.save(), /already excluded/); assert.equal(h.calls.some((call) => call.operationName.startsWith('Update')), false)
  const app = readFileSync(new URL('../App.tsx', import.meta.url), 'utf8'), control = readFileSync(new URL('./reporting/ClientReportExclusionControl.tsx', import.meta.url), 'utf8')
  assert.match(app, /ClientReportExclusionControl[^>]*canManage=\{canAccessRoleAdmin && !isUserPreview\}/)
  assert.match(control, /if \(!canManage\) return null/)
})
