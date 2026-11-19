import assert from 'node:assert/strict'
import { readFileSync } from 'node:fs'
import test from 'node:test'
import vm from 'node:vm'
import ts from 'typescript'

function load(file, dependencies = {}, globals = {}) {
  const source = readFileSync(new URL(file, import.meta.url), 'utf8').replaceAll('import.meta.env', '({})')
  const module = { exports: {} }
  vm.runInNewContext(ts.transpileModule(source, { compilerOptions: { module: ts.ModuleKind.CommonJS, target: ts.ScriptTarget.ES2022 } }).outputText, { module, exports: module.exports, Date, Map, Set, URL, URLSearchParams, AbortController, DOMException, ...globals, require: (name) => { if (name in dependencies) return dependencies[name]; throw Error(`Unexpected import ${name}`) } })
  return module.exports
}
const api = load('./desDvReport.ts'), rules = { ...api.DEFAULT_REPORT_RULES }
const client = (changes = {}) => ({ id: 'client-1', recordId: 'CP-001', name: 'Example Client', birthDate: '1990-03-01', tanf: 'No', ...changes })
const enrollment = (changes = {}) => ({ id: 'pe-1', recordId: 'PE-001', clientId: 'client-1', program: 'CAAFA Shelter', start: '2026-09-01', end: '', status: 'Enrolled', clientType: 'Adult', tanf: 'Yes', ...changes })
const stay = (changes = {}) => ({ id: 'be-1', recordId: 'BE-001', enrollmentId: 'pe-1', start: '2026-09-01', end: '2026-10-01', ...changes })
const input = (enrollments = [enrollment()], clients = [client()], stays = []) => ({ enrollments, clients, stays })
const run = (data, start = '2026-09-01', end = '2026-09-30', options = rules, asOf = '2026-10-13') => api.calculateDesDvReport(data, start, end, options, asOf)
const total = (report) => Object.values(report.people).flatMap(Object.values).reduce((sum, count) => sum + count, 0)

test('fiscal years are October–September, including September and exact October reset', () => {
  assert.equal(api.reportingYearStart('2026-09-30'), '2025-10-01')
  assert.equal(api.reportingYearStart('2026-10-01'), '2026-10-01')
  assert.equal(api.reportingYearStart('2026-01-01'), '2025-10-01')
  assert.equal(rules.carryOver, true)
})
test('strict date parsing accepts backend timestamps and legacy date strings, rejects invalid calendar dates', () => {
  assert.equal(api.reportDay('9/1/2026'), api.reportDay('2026-09-01T00:00:00Z'))
  for (const invalid of ['', '2026-02-30', '2026-13-01', '2025-02-29', '0001-01-01', 'bad']) assert.equal(api.reportDay(invalid), null)
  assert.notEqual(api.reportDay('2024-02-29'), null)
  assert.throws(() => run(input(), '2026-10-01', '2026-09-01'), /valid start\/end/)
})
test('start/end are inclusive for People Served, with per-client not per-record counts', () => {
  const report = run(input([enrollment(), enrollment({ id: 'pe-2', start: '2026-09-30', clientId: 'client-2' }), enrollment({ id: 'pe-3', start: '2026-09-10' })], [client(), client({ id: 'client-2' })]))
  assert.equal(report.people['TANF Adult']['CAAFA Shelter'], 2)
  assert.match(report.audit.find((row) => row.rowId === 'pe-3').decision, /Already counted/)
})
test('first fiscal-year count before report month suppresses a later enrollment, even across programs', () => {
  const report = run(input([enrollment({ id: 'prior', program: 'Faith House', start: '2026-08-01', end: '2026-08-02' }), enrollment()]))
  assert.equal(total(report), 0)
  assert.match(report.audit.find((row) => row.rowId === 'pe-1').decision, /Already counted for Faith House/)
})
test('history includes non-displayed programs; prior Autumn House or REACH cannot be overridden', () => {
  for (const program of ['Autumn House', 'REACH Center']) assert.equal(total(run(input([enrollment({ id: 'prior', program, start: '2026-08-01' }), enrollment()]))), 0)
})
test('prior DV Outreach allows one later other-program count; re-enrollments/transfers thereafter do not count', () => {
  const report = run(input([enrollment({ id: 'outreach', program: 'DV Outreach', start: '2026-08-01' }), enrollment(), enrollment({ id: 'second-transfer', program: 'Faith House', start: '2026-09-02' }), enrollment({ id: 'third', program: 'DVSTOP', start: '2026-09-03' })]))
  assert.equal(total(report), 1)
  assert.match(report.audit.find((row) => row.rowId === 'pe-1').decision, /DV Outreach transfer exception/)
})
test('repeated DV Outreach and historical CAAFA Outreach remain the same outreach program', () => {
  const report = run(input([enrollment({ id: 'old', program: 'CAAFA Outreach', start: '2026-08-01' }), enrollment({ id: 'again', program: 'DV Outreach', start: '2026-09-01' }), enrollment({ start: '2026-09-02' })]))
  assert.equal(total(report), 1)
})
test('same-day shelter/outreach ties are deterministic regardless of input order', () => {
  const shelter = enrollment(), outreach = enrollment({ id: 'outreach', program: 'DV Outreach' })
  assert.equal(total(run(input([shelter, outreach]))), 1)
  assert.equal(total(run(input([outreach, shelter]))), 1)
})
test('continuing enrollments count at reset; closed-before-reset and old FY-only history do not', () => {
  const ongoing = enrollment({ start: '2025-08-01' })
  assert.equal(total(run(input([ongoing]), '2026-10-01', '2026-10-13')), 1)
  assert.equal(total(run(input([{ ...ongoing, end: '2026-09-30' }]), '2026-10-01', '2026-10-13')), 0)
  assert.equal(total(run(input([ongoing]), '2026-10-02', '2026-10-13')), 0)
  assert.equal(total(run(input([ongoing]), '2026-10-01', '2026-10-13', { ...rules, carryOver: false })), 0)
})
test('multi-fiscal-year range resets the client ledger at each October 1', () => {
  const report = run(input([enrollment({ start: '2024-10-01' })]), '2024-10-01', '2026-10-13')
  assert.equal(total(report), 3)
})
test('age uses linked client birth date at the first count, including exact eighteenth birthday', () => {
  assert.equal(run(input([enrollment()], [client({ birthDate: '2008-09-02' })])).people['TANF Child']['CAAFA Shelter'], 1)
  assert.equal(run(input([enrollment()], [client({ birthDate: '2008-09-01' })])).people['TANF Adult']['CAAFA Shelter'], 1)
  assert.equal(run(input([enrollment({ tanf: 'No' })])).people['non-TANF Adult']['CAAFA Shelter'], 1)
})
test('unknown TANF, unknown/future DOB, and missing client links are flagged rather than guessed', () => {
  for (const data of [input([enrollment({ tanf: 'N/A' })]), input([enrollment()], [client({ birthDate: '' })]), input([enrollment()], [client({ birthDate: '2027-01-01' })]), input([enrollment()], [])]) {
    const report = run(data); assert.equal(total(report), 0); assert.ok(report.audit.some((row) => row.issue))
  }
})
test('non-TANF children are included in their own permanent fourth category, never merged into TANF Child', () => {
  const data = input([enrollment({ tanf: 'No' })], [client({ birthDate: '2020-01-01' })])
  const report = run(data)
  assert.equal(total(report), 1)
  assert.equal(report.people['non-TANF Child']['CAAFA Shelter'], 1)
  assert.equal(report.people['TANF Child']['CAAFA Shelter'], 0)
  assert.deepEqual(Array.from(api.PEOPLE_CATEGORIES), ['TANF Adult', 'TANF Child', 'non-TANF Adult', 'non-TANF Child'])
  assert.equal(report.audit[0].issue, false)
  const empty = run(input([], [], []))
  assert.deepEqual(Object.keys(empty.people), Array.from(api.PEOPLE_CATEGORIES))
  assert.equal(total(empty), 0)
})
test('optional setup can use Client Type / verified client TANF field without changing defaults', () => {
  const report = run(input([enrollment({ clientType: 'Child', tanf: 'No' })]), undefined, undefined, { ...rules, ageSource: 'clientType', tanfSource: 'client' })
  assert.equal(total(report), 1)
  assert.equal(report.people['non-TANF Child']['CAAFA Shelter'], 1)
  assert.equal(run(input([enrollment({ clientType: 'Child' })]), undefined, undefined, { ...rules, ageSource: 'clientType' }).people['TANF Child']['CAAFA Shelter'], 1)
})
test('turnaways and waiting lists cannot consume the client first-count slot; unknown status is flagged', () => {
  const report = run(input([enrollment({ id: 'turnaway', start: '2026-08-01', status: 'Turnaway' }), enrollment({ id: 'wait', start: '2026-08-02', status: 'Waiting List' }), enrollment()]))
  assert.equal(total(report), 1)
  assert.ok(run(input([enrollment({ status: '--Please Select--' })])).audit[0].issue)
})
test('bed nights clip check-in/checkout to report dates (check-in included, checkout excluded)', () => {
  assert.equal(run(input([enrollment()], [client()], [stay()])).nights['CAAFA Shelter'], 30)
  assert.equal(run(input([enrollment()], [client()], [stay({ start: '2026-09-15', end: '2026-09-17' })])).nights['CAAFA Shelter'], 2)
  assert.equal(run(input([enrollment()], [client()], [stay({ start: '2026-09-15', end: '2026-09-15' })])).nights['CAAFA Shelter'], 0)
})
test('ongoing bed stays use current/as-of date and do not count future or unfinished nights', () => {
  const data = input([enrollment({ start: '2026-10-01' })], [client()], [stay({ start: '2026-10-01', end: '' })])
  assert.equal(run(data, '2026-10-01', '2026-10-31').nights['CAAFA Shelter'], 12)
  assert.equal(run(data, '2026-10-01', '2026-10-31', rules, '2026-10-05').nights['CAAFA Shelter'], 4)
  assert.equal(run(input([enrollment({ start: '2026-10-20' })]), '2026-10-01', '2026-10-31').people['TANF Adult']['CAAFA Shelter'], 0)
})
test('bed nights are independent of yearly People Served deduplication', () => {
  const report = run(input([enrollment({ start: '2026-08-01' })], [client()], [stay()]))
  assert.equal(total(report), 0); assert.equal(report.nights['CAAFA Shelter'], 30)
})
test('nights use bed dates, not parent service dates, and orphan/reversed stays produce issues', () => {
  assert.equal(run(input([enrollment({ start: '2026-09-10', end: '2026-09-20' })], [client()], [stay()])).nights['CAAFA Shelter'], 30)
  for (const value of [stay({ enrollmentId: 'missing' }), stay({ start: '', end: '' }), stay({ end: '2026-08-01' })]) assert.ok(run(input([enrollment()], [client()], [value])).audit.some((row) => row.section === 'Shelter Occupancy' && row.issue))
})
test('overlapping stays are flagged and can be deduplicated in setup', () => {
  const data = input([enrollment(), enrollment({ id: 'pe-2', program: 'Faith House' })], [client()], [stay(), stay({ id: 'duplicate' }), stay({ id: 'other', enrollmentId: 'pe-2', start: '2026-09-15', end: '2026-10-01' })])
  assert.equal(Object.values(run(data).nights).reduce((sum, count) => sum + count, 0), 76)
  const report = run(data, undefined, undefined, { ...rules, deduplicateClientNights: true })
  assert.equal(Object.values(report.nights).reduce((sum, count) => sum + count, 0), 30)
  assert.ok(report.audit.some((row) => row.section === 'Shelter Occupancy' && row.issue))
})
test('occupancy has only normal program columns (no separate transitional columns)', () => {
  assert.deepEqual(Array.from(api.OCCUPANCY_PROGRAMS), ['Autumn House', 'CAAFA Shelter', 'DVSTOP', 'Faith House'])
  const report = run(input([enrollment({ program: 'Autumn House' })], [client()], [stay()]))
  assert.equal(report.nights['Autumn House'], 30)
})
test('calculations are read-only and repeatable; exporting guards CSV formulas and quotes', () => {
  const data = input([enrollment()], [client()], [stay()]), before = JSON.stringify(data)
  assert.equal(JSON.stringify(run(data)), JSON.stringify(run(data)))
  assert.equal(JSON.stringify(data), before)
  assert.match(api.reportCsv([[' =SUM(1,2)', 'a"b', '@test']]), /"' =SUM\(1,2\)","a""b","'@test"/)
})

function dataHarness({ duplicate = false, invalidLookup = false, failRead = false, aborted = false, outsideParent = false } = {}) {
  const calls = [], e = 'aaaaaaaa-aaaa-aaaa-aaaa-aaaaaaaaaaaa', c = 'bbbbbbbb-bbbb-bbbb-bbbb-bbbbbbbbbbbb'
  const fields = { cmps_programenrollment1s: { LogicalName: 'cmps_programenrollment1', PrimaryIdAttribute: 'cmps_programenrollment1id', Attributes: [['cmps_servicestartdate', 'DateTime'], ['cmps_serviceenddate', 'DateTime'], ['cmps_clientid', 'Lookup'], ['cmps_recordid', 'String'], ['cmps_program', 'Picklist'], ['cmps_enrollmentstatus', 'Picklist'], ['cmps_clienttype', 'Picklist'], ['cmps_tanfeligible', 'Picklist'], ['cmps_isarchived', 'Picklist']] }, cmps_clientprofiles: { LogicalName: 'cmps_clientprofile', PrimaryIdAttribute: 'cmps_clientprofileid', Attributes: [['cmps_recordid', 'String'], ['cmps_name', 'String'], ['cmps_lastname', 'String'], ['cmps_dateofbirth', 'DateTime'], ['cmps_isarchived', 'Picklist']] }, cmps_bedenrollments: { LogicalName: 'cmps_bedenrollment', PrimaryIdAttribute: 'cmps_bedenrollmentid', Attributes: [['cmps_recordid', 'String'], ['cmps_programenrollment', 'Lookup'], ['cmps_checkindate', 'DateTime'], ['cmps_checkoutdate', 'DateTime'], ['cmps_isarchived', 'Picklist']] } }
  fields.cmps_clientprofiles.Attributes.push(['cmps_excludefromreports', 'Picklist'])
  for (const schema of Object.values(fields)) schema.Attributes = schema.Attributes.map(([LogicalName, AttributeType]) => ({ LogicalName, AttributeType }))
  const options = { cmps_program: ['CAAFA Shelter'], cmps_enrollmentstatus: ['Enrolled'], cmps_clienttype: ['Adult'], cmps_tanfeligible: ['Yes', 'No', 'N/A'] }
  const connector = { getClient: () => ({ executeAsync: async ({ connectorOperation: operation }) => {
    calls.push(operation)
    const p = operation.parameters, table = p.entityName
    assert.ok(['ListRecordsWithOrganization', 'GetNextPageWithOrganization'].includes(operation.operationName))
    assert.equal(p.item, undefined)
    if (table === 'EntityDefinitions') {
      assert.equal(p.$top, undefined); assert.doesNotMatch(p.prefer, /maxpagesize/)
      const alias = p.$filter.match(/'([^']+)'/)[1]
      return { success: true, data: { value: [fields[alias]] } }
    }
    if (table.includes('LookupAttributeMetadata')) return { success: true, data: { value: [{ LogicalName: table.includes("'cmps_bedenrollment'") ? 'cmps_programenrollment' : 'cmps_clientid', Targets: [invalidLookup ? 'wrong' : table.includes("'cmps_bedenrollment'") ? 'cmps_programenrollment1' : 'cmps_clientprofile'] }] } }
    if (table.includes('PicklistAttributeMetadata')) return { success: true, data: { value: Object.entries(options).map(([LogicalName, labels]) => ({ LogicalName, OptionSet: { Options: labels.map((label, index) => ({ Value: 700 + index, Label: { UserLocalizedLabel: { Label: label } } })) } })) } }
    if (failRead) return { success: false, error: { message: 'report read denied' } }
    if (outsideParent && table === 'cmps_programenrollment1s' && p.$filter.includes('cmps_servicestartdate')) return { success: true, data: { value: [] } }
    const data = table === 'cmps_programenrollment1s' ? { cmps_programenrollment1id: e, cmps_recordid: 'PE-1', _cmps_clientid_value: c, cmps_program: 700, cmps_enrollmentstatus: 700, cmps_clienttype: 700, cmps_tanfeligible: 700, cmps_servicestartdate: outsideParent ? '2024-09-01' : '2026-09-01', ...(outsideParent ? { cmps_serviceenddate: '2024-09-02' } : {}) } : table === 'cmps_clientprofiles' ? { cmps_clientprofileid: c, cmps_recordid: 'CP-1', cmps_name: 'Example', cmps_lastname: 'Client', cmps_dateofbirth: '1990-01-01' } : outsideParent ? { cmps_bedenrollmentid: 'cccccccc-cccc-cccc-cccc-cccccccccccc', cmps_recordid: 'BE-1', _cmps_programenrollment_value: e, cmps_checkindate: '2026-09-01', cmps_checkoutdate: '2026-10-01' } : null
    return { success: true, data: { value: data ? duplicate && table === 'cmps_programenrollment1s' ? [data, data] : [data] : [] } }
  } }) }
  const paging = { readDataverseRecordPages: async (_org, _table, query, _runtime, request) => (await request(query, '')).value }
  const data = load('./desDvReportData.ts', { '@microsoft/power-apps/data': connector, '../../.power/schemas/appschemas/dataSourcesInfo': { dataSourcesInfo: {} }, './auth': { getAuthToken: () => 'test' }, './dataverseRecordPages': paging, './desDvReport': api, './reporting/reportEligibility': load('./reporting/reportEligibility.ts') }, { window: { location: { hostname: 'powerapps.example' } } })
  const controller = new AbortController(); if (aborted) controller.abort()
  return { calls, run: () => data.loadDesDvReportInput('2026-09-01', '2026-09-30', rules, controller.signal, () => {}) }
}
test('reader validates lookup metadata and decodes actual choices, not sequential guessed mappings', async () => {
  const h = dataHarness(), records = await h.run()
  assert.equal(records.enrollments[0].program, 'CAAFA Shelter'); assert.equal(records.enrollments[0].tanf, 'Yes')
  const reads = h.calls.filter((call) => !call.parameters.entityName.startsWith('EntityDefinitions'))
  assert.equal(reads.length, 3)
  for (const read of reads) { assert.match(read.parameters.$filter, /cmps_isarchived ne 125570000/); assert.equal(read.parameters.$top, undefined); assert.ok(read.parameters.$select) }
  assert.match(reads[0].parameters.$filter, /2025-10-01/)
  assert.match(reads.find((read) => read.parameters.entityName === 'cmps_clientprofiles').parameters.$filter, /cmps_clientprofileid eq bbbbbbbb/)
})
test('occupancy retrieves linked parents outside the People Served history window by GUID', async () => {
  const h = dataHarness({ outsideParent: true }), records = await h.run()
  const report = run(records)
  assert.equal(report.nights['CAAFA Shelter'], 30)
  assert.equal(total(report), 0)
  const parentReads = h.calls.filter((call) => call.parameters.entityName === 'cmps_programenrollment1s')
  assert.equal(parentReads.length, 2)
  assert.match(parentReads[1].parameters.$filter, /cmps_programenrollment1id eq aaaaaaaa/)
  assert.doesNotMatch(parentReads[1].parameters.$filter, /cmps_servicestartdate/)
})
for (const [options, expected] of [[{ invalidLookup: true }, /not a verified lookup/], [{ duplicate: true }, /repeated row/], [{ failRead: true }, /read denied/], [{ aborted: true }, /abort/i]]) test(`reader stops without partial report for ${Object.keys(options)[0]}`, async () => {
  await assert.rejects(dataHarness(options).run(), expected)
})
test('report UI is test-app wired, admin-only, explicit review, cancellation and full audit export', () => {
  const app = readFileSync(new URL('../App.tsx', import.meta.url), 'utf8'), panel = readFileSync(new URL('./DesDvReportPanel.tsx', import.meta.url), 'utf8')
  assert.match(app, /<DesDvReportPanel canManage=\{canAccessRoleAdmin && !isUserPreview\}/)
  assert.match(panel, /disabled=\{!reviewed \|\| busy\}/)
  assert.match(panel, /if \(!canManage \|\| !reviewed \|\| busy\) return/)
  assert.match(panel, /request\.current\?\.abort\(\)/)
  assert.match(panel, /Download Full Audit/)
  assert.match(panel, /October 1/)
})
