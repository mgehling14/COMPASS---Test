import assert from 'node:assert/strict'
import { readFileSync } from 'node:fs'
import test from 'node:test'
import vm from 'node:vm'
import ts from 'typescript'
import * as React from 'react'
import * as jsx from 'react/jsx-runtime'
import { renderToStaticMarkup } from 'react-dom/server'

function loader(dependencies = {}, globals = {}) {
  const cache = new Map()
  function load(name) {
    if (cache.has(name)) return cache.get(name)
    const prefix = name === '../desDvReport' ? './desDvReport' : name.startsWith('../') ? name : './reporting/' + name
    let source
    try { source = readFileSync(new URL(prefix + '.ts', import.meta.url), 'utf8') } catch { source = readFileSync(new URL(prefix + '.tsx', import.meta.url), 'utf8') }
    source = source.replaceAll('import.meta.env', '({})')
    const module = { exports: {} }; cache.set(name, module.exports)
    vm.runInNewContext(ts.transpileModule(source, { compilerOptions: { module: ts.ModuleKind.CommonJS, target: ts.ScriptTarget.ES2022, jsx: ts.JsxEmit.ReactJSX, esModuleInterop: false } }).outputText, {
      module, exports: module.exports, structuredClone, Date, Map, Set, URL, URLSearchParams, Headers, AbortController, DOMException, setTimeout, clearTimeout,
      require(key) {
        if (key in dependencies) return dependencies[key]
        if (key === 'react') return React
        if (key === 'react/jsx-runtime') return jsx
        if (key.endsWith('.css')) return {}
        if (key.endsWith('.json')) return { default: JSON.parse(readFileSync(new URL('./reporting/' + key.slice(2), import.meta.url), 'utf8')) }
        if (key === '../desDvReport') return load('../desDvReport')
        if (key.startsWith('./')) return load(key.slice(2))
        throw new Error('Unexpected import ' + key)
      }, ...globals,
    }, { filename: name })
    return module.exports
  }
  return load
}
const load = loader({ './reportDataverse': {} }), plan = load('glendalePlan'), api = load('glendaleReport'), exportsApi = load('glendaleExport')
const id = (number) => '22222222-2222-2222-2222-' + String(number).padStart(12, '0')
function fixture() {
  let next = 0
  const snapshot = { tables: { Client_Profile: [], ProgramEnrollment: [], Services: [], BedEnrollment: [], Household: [], HouseholdHistory: [], documents: [], Links: [], HouseholdLinks: [] }, unavailable: {}, displayIds: {}, warnings: [] }
  function client(fields = {}) { const value = id(++next); snapshot.tables.Client_Profile.push({ document_id: value, dob: '1990-01-01', race: 'White', gender: 'Female', ethnicity: 'Hispanic/Latin(a)(o)(x)', disability: '', ...fields }); snapshot.displayIds[value] = 'CP-' + next; return value }
  function enrollment(clientId, fields = {}) { const value = id(++next); snapshot.tables.ProgramEnrollment.push({ RecordID: value, Program: 'Faith House', EnrollmentStatus: 'Enrolled', ServiceStartDate: '2026-07-10', ServiceEndDate: '', ProgramType: 'Residential', ...fields }); snapshot.tables.documents.push({ RecordId: value, ParentId: clientId }); snapshot.displayIds[value] = 'PE-' + next; return value }
  function service(enrollmentId, date, fields = {}) { const value = id(++next); snapshot.tables.Services.push({ RecordID: value, DateofService: date, ...fields }); snapshot.tables.Links.push({ LinkFromId: value, LinkToId: enrollmentId }); snapshot.displayIds[value] = 'SV-' + next; return value }
  function bed(enrollmentId, from, to = '', fields = {}) { const value = id(++next); snapshot.tables.BedEnrollment.push({ RecordID: value, CheckInDate: from, CheckOutDate: to, ...fields }); snapshot.tables.Links.push({ LinkFromId: value, LinkToId: enrollmentId }); snapshot.displayIds[value] = 'BE-' + next; return value }
  function household(members, fields = {}) { const value = id(++next); snapshot.tables.Household.push({ RecordID: value, MemberCount: members.length, ...fields }); snapshot.displayIds[value] = 'HH-' + next; members.forEach(([clientId, relationship], n) => member(value, clientId, relationship || (n ? 'Child of HOH' : 'Self'))); return value }
  function member(householdId, clientId, relationship, fields = {}) { const value = id(++next); snapshot.tables.HouseholdHistory.push({ RecordID: value, Status: 'Active', RelationshipToHoH: relationship, ...fields }); snapshot.tables.HouseholdLinks.push({ RecordId: value, ClientId: clientId, HouseholdId: householdId }); snapshot.displayIds[value] = 'HHH-' + next; return value }
  const run = (start = '2026-07-01', end = '2026-07-31', asOf = '2026-10-28', signal = new AbortController().signal, progress = () => {}) => api.calculateGlendaleReport(snapshot, start, end, signal, progress, asOf)
  return { snapshot, client, enrollment, service, bed, household, member, run }
}
const rows = (result, name) => result.datasets[name].rows
const sum = (result, name, field) => rows(result, name).reduce((sum, row) => sum + Number(row[field] || 0), 0)

test('Glendale is a single native monthly report with verified sources and no funder restriction or financial guesses', () => {
  assert.equal(plan.GLENDALE_REPORT.id, 'city-of-glendale-monthly-report')
  assert.equal(plan.GLENDALE_REPORT.parameters.length, 2)
  assert.equal(plan.GLENDALE_REPORT.datasets.length, 6)
  for (const [table, fields] of Object.entries(plan.GLENDALE_REQUIREMENTS)) { assert.equal(fields.includes('Funder'), false); assert.ok(plan.planGlendaleReport().required[table]) }
  assert.equal(plan.GLENDALE_REQUIREMENTS.Helpline, undefined)
  for (const dataset of plan.GLENDALE_REPORT.datasets) assert.ok(plan.planGlendaleReport().datasets[dataset.name])
})

test('every person counts individually, while a multi-person household counts once using only its head demographics', async () => {
  const f = fixture(), head = f.client({ gender: 'Female', race: 'White', dob: '1960-01-01', disability: 'Physical' }), child = f.client({ gender: 'Male', race: 'Asian', dob: '2020-01-01' })
  f.enrollment(head); f.enrollment(child); f.household([[head], [child]])
  const result = await f.run()
  assert.equal(sum(result, 'Glendale_Individuals', 'IndividualsServed'), 2)
  assert.equal(sum(result, 'Glendale_Households', 'HouseholdsServed'), 1)
  const household = rows(result, 'Glendale_HouseholdDemographics')
  assert.equal(household.find((row) => row.Demographic === 'Gender' && row.Category === 'Female').Count, 1)
  assert.equal(household.find((row) => row.Demographic === 'Gender' && row.Category === 'Male').Count, 0)
  assert.equal(household.find((row) => row.Demographic === 'Race / Ethnicity' && row.Category === 'Asian').Count, 0)
  assert.equal(household.find((row) => row.Demographic === 'Female-headed households' && row.Category === 'Female head').Count, 1)
  assert.ok(result.warnings.some((warning) => /CURRENT MEMBERSHIP SNAPSHOT/.test(warning)))
})

test('household fiscal history is evaluated before the selected month; later family enrollments do not recount the household', async () => {
  const f = fixture(), head = f.client(), child = f.client()
  f.enrollment(head, { ServiceStartDate: '2026-07-01' }); f.enrollment(child, { ServiceStartDate: '2026-08-01' }); f.household([[head], [child]])
  const result = await f.run('2026-08-01', '2026-08-31')
  assert.equal(sum(result, 'Glendale_Individuals', 'IndividualsServed'), 1)
  assert.equal(sum(result, 'Glendale_Households', 'HouseholdsServed'), 0)
  assert.equal(rows(result, 'Glendale_Individuals')[0].FiscalYearToDate, 2)
  assert.equal(rows(result, 'Glendale_Households')[0].FiscalYearToDate, 1)
})

test('July 1 counts continuing clients again; all programs suppress later counts except the initial DV Outreach transfer', async () => {
  const f = fixture(), continuing = f.client(), priorOther = f.client(), outreachFirst = f.client()
  f.enrollment(continuing, { ServiceStartDate: '2026-06-01' })
  f.enrollment(priorOther, { Program: 'DVSTOP', ServiceStartDate: '2026-07-01' }); f.enrollment(priorOther, { ServiceStartDate: '2026-07-03' })
  const outreach = f.enrollment(outreachFirst, { Program: 'DV Outreach', ServiceStartDate: '2026-07-01' }); f.service(outreach, '2026-07-02')
  f.enrollment(outreachFirst, { ServiceStartDate: '2026-07-03' }); f.enrollment(outreachFirst, { ServiceStartDate: '2026-08-01' })
  const result = await f.run('2026-06-01', '2026-08-31')
  assert.deepEqual(Array.from(rows(result, 'Glendale_Individuals'), (row) => row.IndividualsServed), [1, 2, 0])
  assert.deepEqual(Array.from(rows(result, 'Glendale_Individuals'), (row) => row.FiscalYear), ['2025-2026', '2026-2027', '2026-2027'])
  assert.ok(rows(result, 'Glendale_Audit').some((row) => /DV Outreach transfer/.test(row.Decision)))
  const noActualCall = fixture(), client = noActualCall.client(); noActualCall.enrollment(client, { Program: 'DV Outreach', ServiceStartDate: '2026-07-01' }); noActualCall.enrollment(client)
  assert.equal(sum(await noActualCall.run(), 'Glendale_Individuals', 'IndividualsServed'), 1)
})

test('same-day ties prefer non-outreach; funder/service site cannot change Faith House eligibility', async () => {
  const f = fixture(), a = f.client(), b = f.client(), c = f.client()
  const outreach = f.enrollment(a, { Program: 'DV Outreach' }); f.service(outreach, '2026-07-10')
  f.enrollment(a, { Program: 'Faith House', Funder: 'Other' })
  f.enrollment(b, { Program: 'DVSTOP', ServiceSite: 'Faith House', Funder: 'HUD' })
  f.enrollment(c, { Program: 'Faith House', Funder: '' })
  assert.equal(sum(await f.run(), 'Glendale_Individuals', 'IndividualsServed'), 2)
})

test('bed nights count continuing residents independently of new-client counts and exclude checkout/current night', async () => {
  const f = fixture(), person = f.client(), enrollment = f.enrollment(person, { ServiceStartDate: '2026-07-01' })
  f.bed(enrollment, '2026-08-01', '2026-08-03'); f.bed(enrollment, '2026-08-31', '2026-09-02')
  const result = await f.run('2026-08-01', '2026-09-30')
  assert.equal(sum(result, 'Glendale_Individuals', 'IndividualsServed'), 0)
  assert.deepEqual(Array.from(rows(result, 'Glendale_BedNights'), (row) => row.BedNights), [3, 1])
  const open = fixture(), parent = open.enrollment(open.client()); open.bed(parent, '2026-08-01')
  assert.equal(sum(await open.run('2026-08-01', '2026-08-31', '2026-08-03'), 'Glendale_BedNights', 'BedNights'), 2)
  assert.ok((await open.run('2026-08-01', '2026-08-31', '2026-08-03')).warnings.some((warning) => /clipped/.test(warning)))
})

test('archive and explicit profile exclusions apply to people, family membership, linked records and bed nights', async () => {
  const f = fixture(), good = f.client(), excluded = f.client({ cmps_excludefromreports: 125570000 }), archived = f.client({ cmps_isarchived: 125570000 })
  const pe = f.enrollment(good), ex = f.enrollment(excluded), ar = f.enrollment(archived), badPe = f.enrollment(f.client(), { cmps_isarchived: 125570000 })
  f.bed(pe, '2026-07-10', '2026-07-11'); f.bed(ex, '2026-07-10', '2026-07-30'); f.bed(ar, '2026-07-10', '2026-07-30'); f.bed(badPe, '2026-07-10', '2026-07-30'); f.bed(pe, '2026-07-10', '2026-07-30', { cmps_isarchived: 125570000 })
  f.household([[good], [excluded]])
  const result = await f.run()
  assert.equal(sum(result, 'Glendale_Individuals', 'IndividualsServed'), 1)
  assert.equal(sum(result, 'Glendale_BedNights', 'BedNights'), 1)
  assert.equal(sum(result, 'Glendale_Households', 'HouseholdsServed'), 0)
  const real = fixture(); real.enrollment(real.client({ first_name: 'Test Real Person', cmps_excludefromreports: 125570001 }))
  assert.equal(sum(await real.run(), 'Glendale_Individuals', 'IndividualsServed'), 1)
})

test('missing heads are Unknown, duplicate memberships deduplicate, and conflicting heads never duplicate demographics', async () => {
  const f = fixture(), a = f.client(), b = f.client(); f.enrollment(a); f.enrollment(b)
  const hh = f.household([[a, 'Self'], [b, 'Self']]); f.member(hh, a, 'Self')
  const result = await f.run(), demographic = rows(result, 'Glendale_HouseholdDemographics')
  assert.equal(sum(result, 'Glendale_Households', 'HouseholdsServed'), 1)
  assert.equal(demographic.find((row) => row.Demographic === 'Gender' && row.Category === 'Unknown / unmapped').Count, 1)
  assert.ok(result.warnings.some((warning) => /multiple current Heads/.test(warning)))
})

test('single-person/inactive/archived households do not inflate household counts, and multiple active households are flagged', async () => {
  const f = fixture(), a = f.client(), b = f.client(); f.enrollment(a); f.enrollment(b)
  const single = f.household([[a]])
  f.member(single, b, 'Child of HOH', { Status: 'Inactive' })
  assert.equal(sum(await f.run(), 'Glendale_Households', 'HouseholdsServed'), 0)
  f.household([[a], [b]], { cmps_isarchived: 125570000 })
  assert.equal(sum(await f.run(), 'Glendale_Households', 'HouseholdsServed'), 0)
  const other = f.household([[a], [b]])
  const ambiguous = await f.run()
  assert.equal(sum(ambiguous, 'Glendale_Households', 'HouseholdsServed'), 0)
  assert.equal(sum(ambiguous, 'Glendale_Individuals', 'IndividualsServed'), 2)
  assert.ok(ambiguous.warnings.some((warning) => /multiple active households/.test(warning)))
  assert.ok(other)
})

test('invalid/zero-length stays are excluded, overlapping distinct stays are counted separately and flagged', async () => {
  const f = fixture(), pe = f.enrollment(f.client())
  f.bed(pe, '2026-07-10', '2026-07-12'); f.bed(pe, '2026-07-11', '2026-07-13')
  f.bed(pe, '2026-07-10', '2026-07-10'); f.bed(pe, '2026-07-13', '2026-07-10')
  const result = await f.run()
  assert.equal(sum(result, 'Glendale_BedNights', 'BedNights'), 4)
  assert.ok(result.warnings.some((warning) => /Overlapping/.test(warning)))
  assert.ok(result.warnings.some((warning) => /invalid bed-enrollment dates/.test(warning)))
})

test('race combinations map once to the template categories; unknown ethnicity, missing disability and senior boundary remain explicit', async () => {
  const f = fixture(), a = f.client({ race: 'White|Black or African American|White', ethnicity: '', dob: '1964-07-10', disability: '' }), b = f.client({ race: 'White|Asian|American Indian or Alaska Native', ethnicity: 'Not Hispanic/Latino', dob: '1963-07-10', disability: 'Physical' })
  f.enrollment(a); f.enrollment(b)
  const result = await f.run(), data = rows(result, 'Glendale_IndividualDemographics'), race = data.filter((row) => row.Demographic === 'Race / Ethnicity')
  assert.equal(race.find((row) => row.Category === 'Black/African-American and White').EthnicityUnknown, 1)
  assert.equal(race.find((row) => row.Category === 'Other Multi-Racial').NonHispanic, 1)
  assert.equal(race.find((row) => row.IsTotal).Count, 2)
  assert.equal(race.filter((row) => !row.IsTotal).reduce((sum, row) => sum + row.Count, 0), 2)
  assert.equal(data.find((row) => row.Demographic === 'Seniors (over age 62)' && row.Category === 'Over 62').Count, 1)
  assert.equal(data.find((row) => row.Demographic === 'Disability' && row.Category === 'Unknown / unmapped').Count, 1)
  assert.equal(data.find((row) => row.Demographic === 'Disability' && row.Category === 'Explicit No / none').Count, 0)
  for (const dimension of new Set(data.map((row) => row.Demographic))) assert.equal(data.find((row) => row.Demographic === dimension && row.IsTotal).Count, 2)
})

test('missing household sources block only household sections; missing fiscal history cannot turn into inflated person counts', async () => {
  const f = fixture(); f.enrollment(f.client()); f.snapshot.unavailable.HouseholdHistory = 'Membership denied'
  const partial = await f.run()
  assert.match(partial.datasets.Glendale_Households.unavailable, /Membership denied/)
  assert.equal(sum(partial, 'Glendale_Individuals', 'IndividualsServed'), 1)
  f.snapshot.unavailable.Services = 'History denied'
  const blocked = await f.run()
  for (const name of ['Glendale_Individuals', 'Glendale_Households', 'Glendale_IndividualDemographics', 'Glendale_HouseholdDemographics']) { assert.ok(blocked.datasets[name].unavailable); assert.equal(blocked.datasets[name].rows, undefined) }
  assert.equal(blocked.datasets.Glendale_BedNights.unavailable, undefined)
  delete f.snapshot.unavailable.Services; delete f.snapshot.unavailable.HouseholdHistory; delete f.snapshot.tables.HouseholdLinks
  assert.match((await f.run()).datasets.Glendale_Households.unavailable, /relationship links/)
})

test('repeated records, conflicting links, cancellation and future-only ranges do not produce partial reports', async () => {
  const f = fixture(), pe = f.enrollment(f.client()); f.snapshot.tables.ProgramEnrollment.push({ ...f.snapshot.tables.ProgramEnrollment[0] })
  await assert.rejects(f.run(), /repeated ID/); f.snapshot.tables.ProgramEnrollment.pop()
  f.snapshot.tables.documents.push({ RecordId: pe, ParentId: id(999) }); await assert.rejects(f.run(), /Conflicting/); f.snapshot.tables.documents.pop()
  const controller = new AbortController(); controller.abort()
  await assert.rejects(f.run('2026-07-01', '2026-07-31', '2026-10-28', controller.signal), /abort/i)
  await assert.rejects(f.run('2027-01-01', '2027-01-31'), /after the current date/)
})

test('section downloads and screen share the report palette and layouts, block unavailable exports, and retain mapping needs', async () => {
  const f = fixture(); f.enrollment(f.client())
  const result = await f.run(), View = load('GlendaleReportView').default, html = renderToStaticMarkup(React.createElement(View, { result, parameters: { ReportPeriodStart: '2026-07-01', ReportPeriodEnd: '2026-07-31' } }))
  assert.equal((html.match(/Download section CSV/g) || []).length, 6)
  assert.equal((html.match(/Download section Word/g) || []).length, 6)
  assert.match(html, /current active membership/i); assert.match(html, /HoH|Head.of.Household/i)
  for (const section of plan.GLENDALE_SECTIONS) {
    const word = exportsApi.glendaleSectionWord(section.name, result.datasets[section.name], '2026-07-01', '2026-07-31')
    for (const color of ['#7d256e', '#096052', '#bbd63d', '#4e4f4f']) assert.ok(word.includes(color))
    assert.ok(exportsApi.glendaleSectionCsv(section.name, result.datasets[section.name]).includes(section.columns[0]))
    assert.throws(() => exportsApi.glendaleSectionCsv(section.name, { unavailable: 'Missing' }), /unavailable/)
  }
  const needs = exportsApi.glendaleSectionCsv('Glendale_DataNeeds', result.datasets.Glendale_DataNeeds)
  assert.match(needs, /FPL bands cannot substitute/); assert.doesNotMatch(needs, /117421|C24-0870|Crystal|Olivia/)
  const malicious = { rows: [{ Item: '=SUM(1,1)', Status: '<script>alert(1)</script>', NextStep: '"A&B"' }] }
  assert.ok(exportsApi.glendaleSectionCsv('Glendale_DataNeeds', malicious).includes("'=SUM(1,1)"))
  const word = exportsApi.glendaleSectionWord('Glendale_DataNeeds', malicious, '', '')
  assert.doesNotMatch(word, /<script>/); assert.match(word, /&lt;script&gt;/)
})

test('runner loads July fiscal history and date-scoped bed stays without any funder fields', async () => {
  let request
  const f = fixture(), api = loader({ './reportDataverse': { loadReportSnapshot: async (...args) => { request = args; return f.snapshot } } })('glendaleReport')
  await api.runGlendaleReport({ ReportPeriodStart: '2026-07-01', ReportPeriodEnd: '2026-07-31' }, {}, new AbortController().signal, () => {})
  assert.equal(request[4].Services.from, '2026-07-01')
  assert.equal(request[4].Services.toExclusive, '2026-08-01')
  assert.equal(request[4].BedEnrollment.from, '2026-07-01')
  assert.equal(request[4].BedEnrollment.endField, 'CheckOutDate')
  assert.equal(JSON.stringify(request[0]).includes('Funder'), false)
})

function connectorHarness({ failHistoryPage = false, wrongHouseholdTarget = false, missingHouseholdArchive = false } = {}) {
  const mappings = load('reportMappings').DEFAULT_REPORT_MAPPINGS, names = Object.keys(plan.GLENDALE_REQUIREMENTS), calls = []
  const primary = { Client_Profile: 'cmps_clientprofileid', ProgramEnrollment: 'cmps_programenrollment1id', Services: 'cmps_servicesid', BedEnrollment: 'cmps_bedenrollmentid', Household: 'cmps_householdid', HouseholdHistory: 'cmps_householdhistoryid' }
  const options = {
    cmps_program: { 125570004: 'Faith House', 125570001: 'DV Outreach' }, cmps_enrollmentstatus: { 125570000: 'Enrolled' }, cmps_programtype: { 125570000: 'Residential' },
    cmps_status: { 125570000: 'Active', 125570001: 'Inactive' }, cmps_relationshiptohoh: { 125570000: 'Self', 125570004: 'Child of HOH' },
    cmps_isarchived: { 125570000: 'Yes', 125570001: 'No' }, cmps_excludefromreports: { 125570000: 'Yes', 125570001: 'No' },
    cmps_gender: { 125570000: 'Female', 125570001: 'Male' }, cmps_race: { 125570000: 'White' }, cmps_ethnicity: { 125570000: 'Hispanic/Latin(a)(o)(x)' }, cmps_disability: { 125570000: 'Physical' },
  }
  const schemas = {}
  for (const name of names) {
    const mapping = mappings[name], lookups = ['clientLookup', 'enrollmentLookup', 'householdLookup'].map((field) => mapping[field]).filter(Boolean)
    const fields = [...new Set(['cmps_recordid', ...(name === 'Household' && missingHouseholdArchive ? [] : ['cmps_isarchived']), ...(name === 'Client_Profile' ? ['cmps_excludefromreports'] : []), ...lookups, ...plan.GLENDALE_REQUIREMENTS[name].map((field) => mapping.fields[field]).filter((field) => !field.startsWith('$'))])]
    schemas[name] = { LogicalName: primary[name].replace(/id$/, ''), PrimaryIdAttribute: primary[name], Attributes: fields.map((field) => ({ LogicalName: field, AttributeType: lookups.includes(field) ? 'Lookup' : /date/.test(field) ? 'DateTime' : options[field] ? 'Picklist' : field === 'cmps_numberofhhmembers' ? 'Integer' : 'String' })) }
  }
  const cp = (n, fields = {}) => ({ [primary.Client_Profile]: id(n), cmps_recordid: 'CP-' + n, cmps_isarchived: 125570001, cmps_excludefromreports: 125570001, cmps_dateofbirth: '1990-01-01', cmps_race: 125570000, cmps_ethnicity: 125570000, cmps_gender: 125570000, cmps_disability: null, ...fields })
  const pe = (n, parent) => ({ [primary.ProgramEnrollment]: id(n), cmps_recordid: 'PE-' + n, cmps_isarchived: 125570001, _cmps_clientid_value: id(parent), cmps_program: 125570004, cmps_servicestartdate: '2026-07-01', cmps_serviceenddate: null, cmps_enrollmentstatus: 125570000, cmps_programtype: 125570000 })
  const history = (n, client, relationship, fields = {}) => ({ [primary.HouseholdHistory]: id(n), cmps_recordid: 'HHH-' + n, cmps_isarchived: 125570001, _cmps_clientid_value: id(client), _cmps_householdid_value: id(31), cmps_status: 125570000, cmps_relationshiptohoh: relationship, ...fields })
  const records = {
    Client_Profile: [cp(1), cp(2, { cmps_gender: 125570001 }), cp(3, { cmps_excludefromreports: 125570000 }), cp(4, { cmps_isarchived: 125570000 })],
    ProgramEnrollment: [pe(11, 1), pe(12, 2), pe(13, 3), pe(14, 4)], Services: [],
    BedEnrollment: [{ [primary.BedEnrollment]: id(21), cmps_recordid: 'BE-21', cmps_isarchived: 125570001, _cmps_programenrollment_value: id(11), cmps_checkindate: '2026-07-01', cmps_checkoutdate: '2026-07-03' }],
    Household: [{ [primary.Household]: id(31), cmps_recordid: 'HH-31', cmps_isarchived: 125570001, cmps_numberofhhmembers: 2 }],
    HouseholdHistory: [history(41, 1, 125570000), history(42, 2, 125570004), history(43, 3, 125570004), history(44, 4, 125570004)],
  }
  async function execute({ connectorOperation: operation }) {
    calls.push(operation)
    assert.match(operation.operationName, /^(ListRecordsWithOrganization|GetNextPageWithOrganization)$/)
    const p = operation.parameters
    if (p.entityName === 'EntityDefinitions') { const alias = p.$filter.match(/'([^']+)'/)[1], name = names.find((name) => mappings[name].alias === alias); return { success: true, data: { value: [schemas[name]] } } }
    if (p.entityName.includes('LookupAttributeMetadata')) {
      const name = names.find((name) => p.entityName.includes("LogicalName='" + schemas[name].LogicalName + "'")), field = p.$filter.match(/'([^']+)'/)[1]
      const target = field === mappings[name].householdLookup ? (wrongHouseholdTarget ? 'ProgramEnrollment' : 'Household') : field === mappings[name].clientLookup ? 'Client_Profile' : 'ProgramEnrollment'
      return { success: true, data: { value: [{ LogicalName: field, Targets: [schemas[target].LogicalName] }] } }
    }
    if (p.entityName.includes('PicklistAttributeMetadata')) return { success: true, data: { value: Object.entries(options).map(([LogicalName, entries]) => ({ LogicalName, OptionSet: { Options: Object.entries(entries).map(([Value, Label]) => ({ Value: Number(Value), Label: { UserLocalizedLabel: { Label } } })) } })) } }
    const name = names.find((name) => mappings[name].alias === p.entityName)
    assert.ok(name, 'Only current verified report sources may be read')
    if (name === 'HouseholdHistory') {
      if (p.next) return failHistoryPage ? { success: false, error: 'Household continuation denied' } : { success: true, data: { value: records[name].slice(1) } }
      return { success: true, data: { value: records[name].slice(0, 1), next: 'household-page-2' } }
    }
    return { success: true, data: { value: records[name] } }
  }
  const native = loader({
    '@microsoft/power-apps/data': { getClient: () => ({ executeAsync: execute }) },
    '../../../.power/schemas/appschemas/dataSourcesInfo': { dataSourcesInfo: {} }, '../auth': { getAuthToken: () => 'same-signed-in-user' },
    '../dataverseRecordPages': { readDataverseRecordPages: async (_org, _table, query, _runtime, read) => { const first = await read(query, ''); if (!first.next) return first.value; const second = await read({ next: first.next }, ''); return [...first.value, ...second.value] } },
  }, { window: { location: { hostname: 'apps.powerapps.com' } } })
  return { calls, run: () => native('glendaleReport').runGlendaleReport({ ReportPeriodStart: '2026-07-01', ReportPeriodEnd: '2026-07-31' }, mappings, new AbortController().signal, () => {}) }
}

test('real reader verifies all three parent lookup targets, paginates memberships and applies archive/developer eligibility', async () => {
  const h = connectorHarness(), result = await h.run()
  assert.equal(sum(result, 'Glendale_Individuals', 'IndividualsServed'), 2)
  assert.equal(sum(result, 'Glendale_Households', 'HouseholdsServed'), 1)
  assert.equal(sum(result, 'Glendale_BedNights', 'BedNights'), 2)
  assert.equal(rows(result, 'Glendale_HouseholdDemographics').find((row) => row.Demographic === 'Gender' && row.Category === 'Female').Count, 1)
  const historyQuery = h.calls.find((call) => call.parameters.entityName === 'cmps_householdhistories' && !call.parameters.next).parameters
  assert.match(historyQuery.$select, /_cmps_clientid_value/); assert.match(historyQuery.$select, /_cmps_householdid_value/)
  assert.match(historyQuery.$filter, /cmps_isarchived ne 125570000/)
  assert.equal(h.calls.filter((call) => call.operationName === 'GetNextPageWithOrganization').length, 1)
  assert.equal(JSON.stringify(result).includes('CP-3'), false)
  const selects = h.calls.filter((call) => call.parameters.$select).map((call) => call.parameters.$select).join(',')
  assert.doesNotMatch(selects, /cmps_funder/)
})

test('a denied membership page, invalid household target, or missing archive column makes households unavailable, not partial/zero', async () => {
  for (const options of [{ failHistoryPage: true }, { wrongHouseholdTarget: true }, { missingHouseholdArchive: true }]) {
    const result = await connectorHarness(options).run()
    assert.ok(result.datasets.Glendale_Households.unavailable)
    assert.equal(result.datasets.Glendale_Households.rows, undefined)
    assert.equal(sum(result, 'Glendale_Individuals', 'IndividualsServed'), 2)
    assert.equal(sum(result, 'Glendale_BedNights', 'BedNights'), 2)
  }
})

test('approved Glendale release supports Reporting users with default mappings but without admin setup', async () => {
  const state = [], calls = []; let cursor = 0
  const fakeReact = { useState(initial) { const at = cursor++; if (!(at in state)) state[at] = typeof initial === 'function' ? initial() : initial; return [state[at], (value) => { state[at] = typeof value === 'function' ? value(state[at]) : value }] }, useMemo: (fn) => fn(), useRef: (value) => ({ current: value }), useEffect() {} }
  const expected = { datasets: Object.fromEntries(plan.GLENDALE_SECTIONS.map((section) => [section.name, { rows: [] }])), warnings: [], generatedAt: '', displayIds: {} }, stubView = () => null
  const local = loader({ react: fakeReact, './reportDataverse': { readReportSchema() { throw new Error('No metadata reads during render') } }, './runLegacyReport': { runLegacyReport() { throw new Error('Glendale must use its native runner') } }, './LegacyReportView': { default: () => null }, './SaspMuskieReportView': { default: () => null }, './saspMuskieReport': { runSaspMuskieReport() { throw new Error('Unexpected SASP run') } }, './glendaleReport': { runGlendaleReport: async (...args) => { calls.push(args); return expected } }, './GlendaleReportView': { default: stubView } })
  const Panel = local('LegacyReportsPanel').default
  function render(canView = true, canManage = false) { cursor = 0; return Panel({ canView, canManage }) }
  function descendants(tree, type) { if (Array.isArray(tree)) return tree.flatMap((entry) => descendants(entry, type)); if (!tree || typeof tree !== 'object') return []; return [...(tree.type === type ? [tree] : []), ...descendants(tree.props?.children, type)] }
  let tree = render(), select = descendants(tree, 'select').find((select) => descendants(select, 'option').some((option) => option.props.value === plan.GLENDALE_ID))
  assert.ok(select); select.props.onChange({ target: { value: plan.GLENDALE_ID } }); tree = render()
  assert.equal(descendants(tree, 'summary').some((summary) => /IT Admin/.test(String(summary.props.children))), false)
  const dates = descendants(tree, 'input').filter((input) => input.props.type === 'date')
  dates[0].props.onChange({ target: { value: '2026-07-01' } }); dates[1].props.onChange({ target: { value: '2026-07-31' } })
  tree = render(); descendants(tree, 'button').find((button) => button.props.children === 'View Report').props.onClick()
  await new Promise((resolve) => setTimeout(resolve, 0)); tree = render()
  assert.equal(calls.length, 1)
  assert.equal(calls[0][1].HouseholdHistory.alias, 'cmps_householdhistories')
  assert.equal(descendants(tree, stubView)[0].props.result, expected)
  assert.equal(descendants(render(false), 'button').length, 0)
  assert.doesNotThrow(() => render(true, true), 'Admin dependency view must include every Glendale dataset')
  const live = readFileSync(new URL('../../../../liveapps/COMPASS/src/services/reporting/LegacyReportsPanel.tsx', import.meta.url), 'utf8')
  assert.match(live, /GLENDALE_REPORT/)
  assert.match(live, /GlendaleReportView/)
  assert.match(live, /runGlendaleReport/)
})
