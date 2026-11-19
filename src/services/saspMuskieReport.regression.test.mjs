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
    const path = name.startsWith('../') ? name : './reporting/' + name
    let source
    try { source = readFileSync(new URL(path + '.ts', import.meta.url), 'utf8') } catch { source = readFileSync(new URL(path + '.tsx', import.meta.url), 'utf8') }
    source = source.replaceAll('import.meta.env', '({})')
    const module = { exports: {} }; cache.set(name, module.exports)
    vm.runInNewContext(ts.transpileModule(source, { compilerOptions: { module: ts.ModuleKind.CommonJS, target: ts.ScriptTarget.ES2022, jsx: ts.JsxEmit.ReactJSX, esModuleInterop: false } }).outputText, {
      module, exports: module.exports, Date, Map, Set, URL, URLSearchParams, Headers, AbortController, DOMException, structuredClone, setTimeout, clearTimeout,
      require(key) {
        if (key in dependencies) return dependencies[key]
        if (key === 'react') return React
        if (key === 'react/jsx-runtime') return jsx
        if (key.endsWith('.css')) return {}
        if (key.endsWith('.json')) return { default: JSON.parse(readFileSync(new URL('./reporting/' + key.slice(2), import.meta.url), 'utf8')) }
        if (key.startsWith('./')) return load(key.slice(2))
        if (key === '../desDvReport') return compileDates()
        throw new Error('Unexpected import ' + key)
      }, ...globals,
    }, { filename: name })
    return module.exports
  }
  return load
}
let dates
function compileDates() {
  if (dates) return dates
  const module = { exports: {} }
  vm.runInNewContext(ts.transpileModule(readFileSync(new URL('./desDvReport.ts', import.meta.url), 'utf8'), { compilerOptions: { module: ts.ModuleKind.CommonJS, target: ts.ScriptTarget.ES2022 } }).outputText, { module, exports: module.exports, Date })
  return dates = module.exports
}
const load = loader({ './reportDataverse': {} }), plan = load('saspMuskiePlan'), calculator = load('saspMuskieReport'), exportsApi = load('saspMuskieExport')
const id = (number) => '11111111-1111-1111-1111-' + String(number).padStart(12, '0')
function fixture() {
  let next = 0
  const snapshot = { tables: { Client_Profile: [], ProgramEnrollment: [], Services: [], documents: [], Links: [] }, unavailable: {}, displayIds: {}, warnings: [] }
  function client(fields = {}) { const value = id(++next); snapshot.tables.Client_Profile.push({ document_id: value, dob: '1990-01-01', race: 'White', gender: 'Female', ethnicity: 'Not Hispanic/Latino', disability: '', PrimaryLanguage: '', ...fields }); snapshot.displayIds[value] = 'CP-' + next; return value }
  function enrollment(clientId, fields = {}) { const value = id(++next); snapshot.tables.ProgramEnrollment.push({ RecordID: value, Program: 'REACH Center', Funder: 'VOCA', VictimType: '', AbuseStatus: '', RelationshiptoAbuser: '', ClientSpecialClassification: '', ...fields }); snapshot.tables.documents.push({ RecordId: value, ParentId: clientId }); snapshot.displayIds[value] = 'PE-' + next; return value }
  function service(enrollmentId, date = '2026-01-10', fields = {}) { const value = id(++next); snapshot.tables.Services.push({ RecordID: value, Funder: 'SASP', DateofService: date, ServiceCategory: 'Resource Navigation', Service: 'Program Information Only', Minutes: 30, MeetingMode: 'Phone', ...fields }); snapshot.tables.Links.push({ LinkFromId: value, LinkToId: enrollmentId }); snapshot.displayIds[value] = 'SV-' + next; return value }
  const run = (start = '2026-01-01', end = '2026-03-31', signal = new AbortController().signal, progress = () => {}) => calculator.calculateSaspMuskieReport(snapshot, start, end, signal, progress)
  return { snapshot, client, enrollment, service, run }
}
const rows = (result, name) => result.datasets[name].rows
const totals = (result, section = 'SASP_ClientServices', type = 'Selected range') => rows(result, section).filter((row) => row.IsTotal && row.PeriodType === type)

test('one native report retains original sections and adds PDF supplements, with no separate report or Helpline source', () => {
  assert.equal(plan.SASP_MUSKIE_REPORT.id, 'sasp-muskie-report')
  assert.equal(plan.SASP_MUSKIE_REPORT.parameters.length, 2)
  assert.deepEqual(Array.from(plan.SASP_MUSKIE_REPORT.datasets, (dataset) => dataset.name), ['SASP_ClientsServed', 'SASP_ClientServices', 'SASP_Calls', 'SASP_Victimizations', 'SASP_AbuseStatus', 'SASP_Relationships', 'SASP_ReferenceChecklist'])
  assert.deepEqual(Object.keys(plan.SASP_MUSKIE_REQUIREMENTS).sort(), ['Client_Profile', 'ProgramEnrollment', 'Services'])
  assert.ok(plan.SASP_MUSKIE_REQUIREMENTS.Services.includes('Funder'))
  assert.equal(plan.SASP_MUSKIE_REQUIREMENTS.Services.includes('MeetingMode'), false)
  assert.equal(plan.SASP_MUSKIE_REQUIREMENTS.ProgramEnrollment.includes('Funder'), false)
  for (const dataset of plan.SASP_MUSKIE_REPORT.datasets) assert.ok(plan.planSaspMuskieReport().datasets[dataset.name], 'IT Admin dependencies must include the checklist and every new section')
})
test('only service-level SASP + linked REACH program qualifies; service site and enrollment funding cannot substitute', async () => {
  const f = fixture(), client = f.client(), reach = f.enrollment(client), other = f.enrollment(client, { Program: 'DVSTOP', Funder: 'SASP' })
  f.service(reach)
  f.service(reach, '2026-01-11', { Funder: 'VOCA' })
  f.service(other, '2026-01-11', { ServiceSite: 'REACH Center' })
  f.service(reach, '2026-01-11', { Funder: 'SASP Other' })
  const result = await f.run()
  assert.equal(totals(result)[0].ServiceRecords, 1)
  assert.equal(totals(result, 'SASP_ClientsServed')[0].Clients, 1)
  assert.equal(totals(result, 'SASP_Calls')[0].Calls, 1)
})
test('distinct clients are recalculated monthly, annual and across the range, including multiple enrollments for one client', async () => {
  const f = fixture(), a = f.client(), b = f.client(), one = f.enrollment(a), two = f.enrollment(a), three = f.enrollment(b)
  f.service(one, '2026-01-01'); f.service(one, '2026-01-31'); f.service(two, '2026-02-01'); f.service(three, '2026-03-31'); f.service(one, '2026-04-01')
  f.service(one, '2025-12-31')
  const result = await f.run('2026-01-01', '2026-04-01')
  assert.equal(totals(result)[0].ServiceRecords, 5)
  assert.equal(totals(result)[0].DistinctClients, 2)
  assert.deepEqual(Array.from(totals(result, 'SASP_ClientsServed', 'Monthly'), (row) => row.Clients), [1, 1, 1, 1])
  assert.deepEqual(Array.from(totals(result, 'SASP_ClientsServed', 'Annual'), (row) => row.Clients), [2])
  assert.equal(totals(result, 'SASP_ClientsServed')[0].Clients, 2)
})
test('calendar-year/month boundaries, leap days and partial periods are inclusive and clipped, with no extra source dates', async () => {
  const periods = calculator.saspMuskiePeriods('2024-02-29', '2024-04-01')
  assert.deepEqual(Array.from(periods.filter((period) => period.PeriodType === 'Annual'), (period) => [period.PeriodStart, period.PeriodEnd]), [['2024-02-29', '2024-04-01']])
  const f = fixture(), pe = f.enrollment(f.client())
  for (const date of ['2024-02-28', '2024-02-29', '2024-03-31', '2024-04-01', '2024-04-02']) f.service(pe, date)
  assert.equal(totals(await f.run('2024-02-29', '2024-04-01'))[0].ServiceRecords, 3)
  assert.deepEqual(Array.from(calculator.saspMuskiePeriods('2025-12-31', '2026-01-01').filter((period) => period.PeriodType === 'Annual'), (period) => [period.Period, period.PeriodStart, period.PeriodEnd]), [['2025', '2025-12-31', '2025-12-31'], ['2026', '2026-01-01', '2026-01-01']])
  assert.throws(() => calculator.saspMuskiePeriods('2026-02-30', '2026-03-01'), /valid start/)
})
test('every qualifying Services record counts as a call, including in-person/email/blank/missing modes; Helpline is ignored', async () => {
  const f = fixture(), pe = f.enrollment(f.client())
  for (const MeetingMode of ['Phone', 'In person', 'By email', 'Virtual Meeting', 'Other', '', null, undefined]) f.service(pe, '2026-01-10', { MeetingMode })
  f.snapshot.tables.Helpline = [{ Program: 'SV Helpline', DateOfContact: '2026-01-10' }]
  const result = await f.run()
  assert.equal(totals(result)[0].ServiceRecords, 8)
  assert.equal(totals(result, 'SASP_Calls')[0].Calls, 8)
  assert.equal(result.warnings.some((message) => message.includes('Missing Meeting Mode')), false)
  for (const service of rows(result, 'SASP_ClientServices')) {
    const call = rows(result, 'SASP_Calls').find((call) => call.PeriodType === service.PeriodType && call.Period === service.Period && call.ServiceCategory === service.ServiceCategory && call.Service === service.Service)
    assert.equal(call.Calls, service.ServiceRecords)
    for (const field of ['DistinctClients', 'KnownMinutes', 'KnownHours', 'MissingOrInvalidMinutes']) assert.equal(call[field], service[field])
  }
})
test('demographics use one client per period; age is at the earliest service, multi-race duplicates are removed and unknowns are retained', async () => {
  const f = fixture(), pe = f.enrollment(f.client({ dob: '2008-02-01', race: 'White|White|Asian', gender: '', ethnicity: 'Data not collected' }))
  // Reverse source order deliberately; a birthday must not depend on row/GUID order.
  f.service(pe, '2026-02-05'); f.service(pe, '2026-01-05')
  const result = await f.run(), people = rows(result, 'SASP_ClientsServed').filter((row) => row.PeriodType === 'Selected range')
  assert.equal(people.find((row) => row.Category === '13–17').Clients, 1)
  assert.equal(people.find((row) => row.Category === '18–24').Clients, 0)
  assert.equal(people.filter((row) => row.Demographic === 'Race').reduce((total, row) => total + row.Clients, 0), 2)
  assert.equal(people.find((row) => row.Demographic === 'Gender' && row.Category === 'Unknown / not reported').Clients, 1)
  assert.equal(people.find((row) => row.Demographic === 'Ethnicity' && row.Category === 'Unknown / not reported').Clients, 1)
  assert.equal(rows(result, 'SASP_ClientsServed').find((row) => row.PeriodType === 'Monthly' && row.Period === '2026-02' && row.Category === '18–24').Clients, 1)
})
test('missing/future DOB and invalid minutes do not drop qualifying clients or invent duration', async () => {
  const f = fixture(), pe = f.enrollment(f.client({ dob: '2030-01-01' }))
  for (const Minutes of [0, '15.5', null, '', -1, 'bad']) f.service(pe, '2026-01-10', { Minutes })
  const result = await f.run(), total = totals(result)[0]
  assert.equal(total.ServiceRecords, 6); assert.equal(total.DistinctClients, 1)
  assert.equal(total.KnownMinutes, 15.5); assert.equal(total.MissingOrInvalidMinutes, 4)
  assert.equal(total.KnownHours, 15.5 / 60)
  assert.equal(rows(result, 'SASP_ClientsServed').find((row) => row.PeriodType === 'Selected range' && row.Demographic.startsWith('Age') && row.Category === 'Unknown / not reported').Clients, 1)
})
test('archived records and explicit developer exclusions are removed, but test-like names alone do not exclude clients', async () => {
  const f = fixture(), eligible = f.enrollment(f.client({ first_name: 'Test Name', cmps_excludefromreports: 125570001 }))
  f.service(eligible)
  f.service(eligible, '2026-01-10', { cmps_isarchived: 125570000 })
  f.service(f.enrollment(f.client({ cmps_excludefromreports: 125570000 })))
  f.service(f.enrollment(f.client({ cmps_excludefromreports: 'Yes' })))
  f.service(f.enrollment(f.client({ cmps_isarchived: 125570000 })))
  f.service(f.enrollment(f.client(), { cmps_isarchived: 125570000 }))
  const result = await f.run()
  assert.equal(totals(result)[0].ServiceRecords, 1)
  assert.equal(rows(result, 'SASP_RecordAudit').length, 1)
})
test('missing links/dates are flagged, not guessed from names, labels or service site', async () => {
  const f = fixture(), pe = f.enrollment(f.client())
  f.service(pe, 'not-a-date'); f.service('unknown-enrollment')
  f.service(f.enrollment('unknown-client'))
  const result = await f.run()
  assert.equal(totals(result)[0].ServiceRecords, 0)
  assert.equal(rows(result, 'SASP_RecordAudit').length, 3)
  assert.equal(result.warnings.filter((message) => /excluded/.test(message)).length, 3)
})
test('unavailable source/eligibility data yields unavailable sections rather than zero or partial exports', async () => {
  const f = fixture(); f.snapshot.unavailable.Client_Profile = 'Cannot verify cmps_excludefromreports'
  const result = await f.run()
  for (const section of plan.SASP_MUSKIE_SECTIONS) {
    assert.match(result.datasets[section.name].unavailable, /cmps_excludefromreports/)
    assert.throws(() => exportsApi.saspMuskieSectionCsv(section.name, result.datasets[section.name]), /unavailable/)
  }
})
test('repeated rows, conflicting relationships and cancellation stop instead of producing inflated or partial reports', async () => {
  const f = fixture(), pe = f.enrollment(f.client()), service = f.service(pe)
  f.snapshot.tables.Services.push({ ...f.snapshot.tables.Services[0] })
  await assert.rejects(f.run(), /repeated record/)
  f.snapshot.tables.Services.pop(); f.snapshot.tables.Links.push({ LinkFromId: service, LinkToId: id(999) })
  await assert.rejects(f.run(), /Conflicting/)
  f.snapshot.tables.Links.pop()
  const controller = new AbortController()
  await assert.rejects(f.run('2026-01-01', '2026-03-31', controller.signal, () => controller.abort()), /abort/i)
})
test('all section exports contain monthly/annual/full-range rows, with HTML escaping and CSV formula protection', async () => {
  const f = fixture(), pe = f.enrollment(f.client())
  f.service(pe, '2026-01-10', { Service: '=SUM(1,1)', ServiceCategory: '<script>alert(1)</script>' })
  const result = await f.run()
  for (const section of plan.SASP_MUSKIE_SECTIONS) {
    const csv = exportsApi.saspMuskieSectionCsv(section.name, result.datasets[section.name])
    const word = exportsApi.saspMuskieSectionWord(section.name, result.datasets[section.name], '2026-01-01', '2026-03-31')
    for (const period of ['Selected range', 'Monthly', 'Annual']) { assert.ok(csv.includes(period)); assert.ok(word.includes(period)) }
    assert.ok(word.includes(section.title))
    assert.doesNotMatch(word, /<script>/)
    if (['SASP_ClientServices', 'SASP_Calls'].includes(section.name)) { assert.ok(csv.includes("'=SUM(1,1)")); assert.ok(word.includes('&lt;script&gt;')) }
  }
})
test('each visible section has both downloads; unavailability disables them without replacing it with zero', async () => {
  const f = fixture(), pe = f.enrollment(f.client()); f.service(pe)
  const result = await f.run(), View = load('SaspMuskieReportView').default
  const html = renderToStaticMarkup(React.createElement(View, { result, parameters: { ReportPeriodStart: '2026-01-01', ReportPeriodEnd: '2026-03-31' } }))
  assert.equal((html.match(/Download section CSV/g) || []).length, plan.SASP_MUSKIE_SECTIONS.length * 2)
  assert.equal((html.match(/Download section Word/g) || []).length, plan.SASP_MUSKIE_SECTIONS.length * 2)
  assert.match(html, /SASP MUSKIE Report/); assert.match(html, /Monthly/); assert.match(html, /Annual/)
  for (const section of plan.SASP_MUSKIE_SECTIONS) result.datasets[section.name] = { unavailable: 'Schema is unavailable' }
  const blocked = renderToStaticMarkup(React.createElement(View, { result, parameters: {} }))
  assert.equal((blocked.match(/disabled=""/g) || []).length, plan.SASP_MUSKIE_SECTIONS.length * 4)
  assert.match(blocked, /No zero count has been substituted/)
})
test('Monthly contains all visible sections before Annual, without another selected-range block', async () => {
  const f = fixture(), pe = f.enrollment(f.client()); f.service(pe)
  const result = await f.run(), before = JSON.stringify(result), View = load('SaspMuskieReportView').default
  const html = renderToStaticMarkup(React.createElement(View, { result, parameters: { ReportPeriodStart: '2026-01-01', ReportPeriodEnd: '2026-03-31' } }))
  const blocks = html.split('<section class="sasp-muskie-frequency"')
  assert.equal(blocks.length, 3)
  assert.match(blocks[1], /id="sasp-monthly-heading">Monthly<\/h4>/)
  assert.match(blocks[2], /id="sasp-annual-heading">Annual<\/h4>/)
  for (const block of blocks.slice(1)) {
    assert.equal((block.match(/<h5 class="sasp-muskie-section-heading"/g) || []).length, plan.SASP_MUSKIE_SECTIONS.length)
    assert.ok(block.indexOf(plan.SASP_MUSKIE_SECTIONS[0].title) < block.indexOf(plan.SASP_MUSKIE_SECTIONS[1].title))
    assert.ok(block.indexOf(plan.SASP_MUSKIE_SECTIONS[1].title) < block.indexOf(plan.SASP_MUSKIE_SECTIONS[2].title))
    assert.match(block, /<table class="sasp-muskie-table">/)
    assert.doesNotMatch(block, /<details|Entire selected range/)
  }
  assert.equal(JSON.stringify(result), before, 'Reorganizing the display must not change data/counts')
})
test('Monthly and Annual exports contain only their own frequency; Word uses the DES/OVW report palette', async () => {
  const f = fixture(), pe = f.enrollment(f.client()); f.service(pe)
  const result = await f.run(), before = JSON.stringify(result)
  for (const frequency of ['Monthly', 'Annual']) for (const section of plan.SASP_MUSKIE_SECTIONS) {
    const dataset = result.datasets[section.name]
    const csv = exportsApi.saspMuskieSectionCsv(section.name, dataset, frequency)
    const word = exportsApi.saspMuskieSectionWord(section.name, dataset, '2026-01-01', '2026-03-31', frequency)
    const other = frequency === 'Monthly' ? 'Annual' : 'Monthly'
    assert.ok(csv.includes('"' + frequency + '"'))
    assert.ok(!csv.includes('"' + other + '"'))
    assert.ok(!csv.includes('"Selected range"'))
    assert.ok(word.includes('<h2>' + frequency + ' — ' + section.title + '</h2>'))
    assert.ok(!word.includes('<td>' + other + '</td>'))
    assert.ok(!word.includes('<td>Selected range</td>'))
    for (const color of ['#7d256e', '#096052', '#bbd63d', '#4e4f4f']) assert.ok(word.includes(color))
  }
  assert.equal(JSON.stringify(result), before)
  const css = readFileSync(new URL('./reporting/LegacyReports.css', import.meta.url), 'utf8')
  assert.match(css, /\.sasp-muskie-section-heading[^}]*background: #7d256e[^}]*color: white/)
  assert.match(css, /\.sasp-muskie-table th[^}]*background: #096052[^}]*color: white/)
  assert.match(css, /td\.sasp-muskie-number[^}]*background: #bbd63d/)
  assert.match(css, /\.sasp-muskie-total > td\.sasp-muskie-number[^}]*background: #4e4f4f[^}]*color: white/)
})
test('visible section downloads pass their correct frequency instead of mixing monthly and annual datasets', async () => {
  const f = fixture(), pe = f.enrollment(f.client()); f.service(pe)
  const result = await f.run(), downloads = []
  const View = loader({ react: { useState: (initial) => [initial, () => {}] }, './saspMuskieExport': { downloadSaspSection: (...args) => downloads.push(args) } })('SaspMuskieReportView').default
  const tree = View({ result, parameters: { ReportPeriodStart: '2026-01-01', ReportPeriodEnd: '2026-03-31' } })
  function descendants(tree, type) {
    if (Array.isArray(tree)) return tree.flatMap((node) => descendants(node, type))
    if (!tree || typeof tree !== 'object') return []
    return [...(tree.type === type ? [tree] : []), ...descendants(tree.props?.children, type)]
  }
  const buttons = descendants(tree, 'button').filter((button) => /^Download (Monthly|Annual) /.test(button.props['aria-label']))
  for (const button of buttons) button.props.onClick()
  assert.equal(downloads.length, plan.SASP_MUSKIE_SECTIONS.length * 4)
  assert.deepEqual(downloads.map((args) => args[5]), [...Array(plan.SASP_MUSKIE_SECTIONS.length * 2).fill('Monthly'), ...Array(plan.SASP_MUSKIE_SECTIONS.length * 2).fill('Annual')])
})
test('demographics use separate OVW-style two-column blocks without changing SASP categories, age bands or counts', async () => {
  const f = fixture(), a = f.enrollment(f.client({ race: 'White|Asian', gender: 'Female', dob: '1990-01-01' })), b = f.enrollment(f.client({ race: 'White', gender: 'Male', dob: '2010-01-01' }))
  f.service(a); f.service(b)
  const result = await f.run(), source = rows(result, 'SASP_ClientsServed').filter((row) => row.PeriodType === 'Monthly' && row.Period === '2026-01'), before = JSON.stringify(source)
  const groups = load('saspDemographicLayout').saspDemographicTables(source)
  assert.deepEqual(Array.from(groups, (group) => group.heading), ['Gender', 'Age Group', 'Race', 'Ethnicity'])
  const original = Array.from(source).filter((row) => row.Demographic !== 'Clients Served').map((row) => JSON.stringify(row)).sort()
  const displayed = Array.from(groups).flatMap((group) => Array.from(group.rows)).map((row) => JSON.stringify(row)).sort()
  assert.deepEqual(displayed, original)
  const html = renderToStaticMarkup(React.createElement(load('SaspMuskieDemographics').default, { rows: source }))
  const tables = [...html.matchAll(/<table\b[^>]*>([\s\S]*?)<\/table>/g)].map((match) => match[1])
  assert.equal(tables.length, 4)
  for (const [index, table] of tables.entries()) {
    assert.ok(table.includes('<th scope="col">' + groups[index].heading + '</th><th scope="col">Total</th>'))
    assert.match(table, /<tfoot><tr class="sasp-muskie-total"><td[^>]*>Total<\/td><td class="sasp-muskie-number">2<\/td>/)
  }
  for (const band of ['0–12', '13–17', '18–24', '25–59', '60+']) assert.ok(html.includes(band))
  assert.doesNotMatch(html, /50 to 59|60 to 75|76 to 84|<th[^>]*>Sex<\/th>/)
  assert.equal(JSON.stringify(source), before)
})
test('demographic footers reuse the source unique-client total rather than summing overlapping race choices', async () => {
  const f = fixture(), pe = f.enrollment(f.client({ race: 'White|Asian' })); f.service(pe)
  const result = await f.run(), source = rows(result, 'SASP_ClientsServed').filter((row) => row.PeriodType === 'Annual')
  const tables = load('saspDemographicLayout').saspDemographicTables(source), race = tables.find((table) => table.name === 'Race')
  assert.equal(race.rows.reduce((total, row) => total + row.Clients, 0), 2)
  assert.equal(race.total, 1)
  assert.equal(tables.every((table) => table.total === 1), true)
  const missing = load('saspDemographicLayout').saspDemographicTables(source.filter((row) => !row.IsTotal))
  assert.equal(missing.every((table) => table.total === undefined), true)
})
test('demographics Word matches the grouped screen layout while CSV stays the original dataset', async () => {
  const f = fixture(), pe = f.enrollment(f.client({ race: 'White|Asian' })); f.service(pe)
  const result = await f.run(), dataset = result.datasets.SASP_ClientsServed, before = JSON.stringify(dataset)
  for (const frequency of ['Monthly', 'Annual']) {
    const columns = plan.saspReportColumns('SASP_ClientsServed'), filtered = dataset.rows.filter((row) => row.PeriodType === frequency)
    const expected = compileDates().reportCsv([[...columns], ...filtered.map((row) => columns.map((field) => String(row[field] ?? '')))])
    assert.equal(exportsApi.saspMuskieSectionCsv('SASP_ClientsServed', dataset, frequency), expected)
    const word = exportsApi.saspMuskieSectionWord('SASP_ClientsServed', dataset, '2026-01-01', '2026-03-31', frequency)
    for (const heading of ['Gender', 'Age Group', 'Race', 'Ethnicity']) assert.ok(word.includes('<th>' + heading + '</th><th>Total</th>'))
    assert.doesNotMatch(word, /<th>Demographic<\/th>|<th>Category<\/th>/)
    assert.match(word, /<tfoot><tr class="total"><td>Total<\/td><td class="number">1<\/td>/)
  }
  assert.equal(JSON.stringify(dataset), before)
})
test('PDF supplements deduplicate across services and qualifying enrollments; unrelated history cannot add types/relationships', async () => {
  const f = fixture(), a = f.client(), first = f.enrollment(a, { VictimType: 'Sexual Assault|Sexual Assault', RelationshiptoAbuser: 'Stranger', AbuseStatus: 'Primary Victim' }), second = f.enrollment(a, { VictimType: 'Domestic Violence|Sexual Assault', RelationshiptoAbuser: 'Stranger|Acquaintance', AbuseStatus: 'Secondary Victim' })
  f.enrollment(a, { VictimType: 'Labor Trafficked', RelationshiptoAbuser: 'Other' })
  f.service(first); f.service(first); f.service(second, '2026-02-02')
  const result = await f.run(), range = (name) => rows(result, name).filter((row) => row.PeriodType === 'Selected range')
  const victim = range('SASP_Victimizations')
  assert.equal(victim.find((row) => row.IsTotal).Clients, 1)
  assert.equal(victim.filter((row) => row.Measure.startsWith('Type among')).length, 2)
  assert.equal(victim.find((row) => row.VictimizationType === 'Sexual Assault').Clients, 1)
  assert.equal(victim.some((row) => row.VictimizationType === 'Labor Trafficked'), false)
  assert.equal(rows(result, 'SASP_Victimizations').find((row) => row.PeriodType === 'Monthly' && row.Period === '2026-01' && row.IsTotal).Clients, 0)
  const relationship = range('SASP_Relationships')
  assert.equal(relationship.find((row) => row.Relationship === 'Stranger').Clients, 1)
  assert.equal(relationship.find((row) => row.Relationship === 'Acquaintance').Clients, 1)
  assert.equal(relationship.find((row) => row.IsTotal).Clients, 1)
  assert.equal(relationship.some((row) => row.Relationship === 'Other'), false)
  assert.equal(range('SASP_AbuseStatus').find((row) => row.AbuseStatus.startsWith('Multiple')).Clients, 1)
  assert.equal(totals(result)[0].ServiceRecords, 3)
  assert.equal(totals(result, 'SASP_ClientsServed')[0].Clients, 1)
})

test('removed sections 7 and 8 have no datasets, downloads, calculations or supplemental source requests', async () => {
  const f = fixture(), pe = f.enrollment(f.client()); f.service(pe)
  const result = await f.run(), View = load('SaspMuskieReportView').default
  const html = renderToStaticMarkup(React.createElement(View, { result, parameters: {} }))
  assert.equal(plan.SASP_MUSKIE_SECTIONS.length, 6)
  assert.doesNotMatch(html, /7\. Additional Demographics|8\. Detailed Age Groups|Quarterly/)
  assert.equal(plan.SASP_MUSKIE_OPTIONAL_FIELDS.Client_Profile, undefined)
  assert.deepEqual(Array.from(plan.SASP_MUSKIE_OPTIONAL_FIELDS.ProgramEnrollment), ['VictimType', 'AbuseStatus', 'RelationshiptoAbuser'])
  for (const name of ['SASP_AdditionalDemographics', 'SASP_ReferenceAge']) {
    assert.equal(result.datasets[name], undefined)
    assert.equal(plan.saspReportColumns(name).length, 0)
    assert.throws(() => exportsApi.saspMuskieSectionCsv(name, { rows: [] }), /unavailable/)
  }
  assert.ok(rows(result, 'SASP_ClientsServed').some((row) => row.Category === '0–12'))
})

test('annual counts span quarters, deduplicate within each year and reset at January 1', async () => {
  const f = fixture(), a = f.client(), b = f.client(), one = f.enrollment(a), two = f.enrollment(a), three = f.enrollment(b)
  f.service(one, '2025-12-31'); f.service(two, '2026-01-01'); f.service(one, '2026-04-01'); f.service(three, '2026-12-31'); f.service(one, '2027-01-01')
  const result = await f.run('2025-12-31', '2027-01-01')
  assert.deepEqual(Array.from(totals(result, 'SASP_ClientsServed', 'Annual'), (row) => [row.Period, row.Clients]), [['2025', 1], ['2026', 2], ['2027', 1]])
  assert.deepEqual(Array.from(totals(result, 'SASP_ClientServices', 'Annual'), (row) => row.ServiceRecords), [1, 3, 1])
  assert.equal(totals(result, 'SASP_ClientsServed')[0].Clients, 2)
  for (const dataset of Object.values(result.datasets)) assert.equal(dataset.rows?.some((row) => row.PeriodType === 'Quarterly'), false)
})

test('missing or undecodable optional metadata does not suppress the established SASP cohort or unrelated supplements', async () => {
  const missing = await connectorHarness().run()
  assert.equal(totals(missing)[0].ServiceRecords, 2)
  assert.match(missing.datasets.SASP_Victimizations.unavailable, /VictimType/)
  assert.match(missing.datasets.SASP_Relationships.unavailable, /RelationshiptoAbuser/)
  assert.equal(missing.datasets.SASP_ReferenceAge, undefined)
  const h = connectorHarness({ supplemental: true })
  Object.assign(h.records.ProgramEnrollment[0], { cmps_victimtype1: '125570000,125570001', cmps_abusestatus: 125570001, cmps_relationshiptoabuser: '125570000,125570001', cmps_clientspecialclassification1: '125570000,125570001' })
  Object.assign(h.records.Client_Profile[0], { cmps_disability: '125570000,125570001', cmps_primarylanguage: 125570001 })
  const valid = await h.run()
  for (const name of ['SASP_ClientsServed', 'SASP_ClientServices', 'SASP_Calls']) assert.deepEqual(JSON.parse(JSON.stringify(valid.datasets[name])), JSON.parse(JSON.stringify(missing.datasets[name])), 'Supplemental source columns must not change the original datasets')
  assert.equal(rows(valid, 'SASP_Victimizations').find((row) => row.PeriodType === 'Selected range' && row.IsTotal).Clients, 1)
  assert.equal(rows(valid, 'SASP_AbuseStatus').find((row) => row.PeriodType === 'Selected range' && row.AbuseStatus === 'Secondary Victim').Clients, 1)
  assert.equal(rows(valid, 'SASP_Relationships').find((row) => row.PeriodType === 'Selected range' && row.Relationship === 'Stranger').Clients, 1)
  assert.doesNotMatch(h.calls.find((call) => call.parameters.entityName === 'cmps_clientprofiles').parameters.$select, /cmps_primarylanguage|cmps_disability/)
  assert.doesNotMatch(h.calls.find((call) => call.parameters.entityName === 'cmps_programenrollment1s').parameters.$select, /cmps_clientspecialclassification1/)
  h.records.ProgramEnrollment[0].cmps_victimtype1 = '999999999'
  const badChoice = await h.run()
  assert.match(badChoice.datasets.SASP_Victimizations.unavailable, /Unrecognized backend choice/)
  assert.equal(totals(badChoice)[0].ServiceRecords, 2)
  assert.equal(badChoice.datasets.SASP_Relationships.unavailable, undefined)
})

test('reference checklist documents unverified official definitions, never copies historical values, and supports downloads', async () => {
  const f = fixture(), pe = f.enrollment(f.client()); f.service(pe)
  const result = await f.run(), dataset = result.datasets.SASP_ReferenceChecklist
  for (const term of ['Staff FTEs', 'served', 'Protection orders', 'Narrative', 'Victim witness', 'Statutory']) assert.ok(JSON.stringify(dataset).includes(term))
  const csv = exportsApi.saspMuskieSectionCsv('SASP_ReferenceChecklist', dataset), word = exportsApi.saspMuskieSectionWord('SASP_ReferenceChecklist', dataset, '2026-01-01', '2026-03-31')
  assert.match(csv, /Not mapped/); assert.match(word, /Manual completion required/)
  assert.doesNotMatch(csv + word, /RFGA-SASP-GOYFF-080124|Wendy|384|159/)
  for (const section of plan.SASP_MUSKIE_SECTIONS.slice(3)) {
    const blocked = { unavailable: 'Missing column' }
    assert.throws(() => exportsApi.saspMuskieSectionCsv(section.name, blocked), /unavailable/)
    const csv = exportsApi.saspMuskieSectionCsv(section.name, result.datasets[section.name], 'Monthly')
    assert.ok(csv.includes('"Monthly"')); assert.ok(!csv.includes('"Annual"'))
  }
})

test('runner scopes Services by selected dates before calculation and does not request Helpline or funder from Enrollment', async () => {
  let read
  const f = fixture(), pe = f.enrollment(f.client()); f.service(pe)
  const api = loader({ './reportDataverse': { loadReportSnapshot: async (...args) => { read = args; return f.snapshot } } })('saspMuskieReport')
  await api.runSaspMuskieReport({ ReportPeriodStart: '2026-01-01', ReportPeriodEnd: '2026-03-31' }, {}, new AbortController().signal, () => {})
  assert.deepEqual(Object.keys(read[0]).sort(), ['Client_Profile', 'ProgramEnrollment', 'Services'])
  assert.equal(read[0].ProgramEnrollment.includes('Funder'), false)
  assert.deepEqual(JSON.parse(JSON.stringify(read[4])), { Services: { startField: 'DateofService', from: '2026-01-01', toExclusive: '2026-04-01' } })
  assert.deepEqual(JSON.parse(JSON.stringify(read[5])), JSON.parse(JSON.stringify(plan.SASP_MUSKIE_OPTIONAL_FIELDS)))
})

function connectorHarness({ missingExclusion = false, failPage = false, supplemental = false } = {}) {
  const calls = [], mappings = load('reportMappings').DEFAULT_REPORT_MAPPINGS
  const names = ['Client_Profile', 'ProgramEnrollment', 'Services'], schemas = {}, primary = { Client_Profile: 'cmps_clientprofileid', ProgramEnrollment: 'cmps_programenrollment1id', Services: 'cmps_servicesid' }
  const optionLabels = {
    cmps_program: { 125570005: 'REACH Center', 125570000: 'Autumn House' },
    cmps_funder: { 125570004: 'SASP', 125570006: 'VOCA' },
    cmps_meetingmode: { 125570001: 'Phone', 125570000: 'In person' },
    cmps_isarchived: { 125570000: 'Yes', 125570001: 'No' },
    cmps_excludefromreports: { 125570000: 'Yes', 125570001: 'No' },
    cmps_victimtype1: { 125570000: 'Domestic Violence', 125570001: 'Sexual Assault' },
    cmps_relationshiptoabuser: { 125570000: 'Stranger', 125570001: 'Acquaintance' },
    cmps_abusestatus: { 125570000: 'Primary Victim', 125570001: 'Secondary Victim' },
    cmps_clientspecialclassification1: { 125570000: 'Deaf/Hard of Hearing', 125570001: 'Immigrants/Refugees/Asylum Seekers' },
    cmps_disability: { 125570000: 'Physical', 125570001: 'Deaf/Hard of Hearing' },
    cmps_primarylanguage: { 125570000: 'English', 125570001: 'Spanish' },
  }
  for (const name of names) {
    const mapping = mappings[name]
    const fields = [...plan.SASP_MUSKIE_REQUIREMENTS[name], ...(supplemental ? plan.SASP_MUSKIE_OPTIONAL_FIELDS[name] || [] : [])].map((legacy) => mapping.fields[legacy]).filter((field) => !field.startsWith('$'))
    const physical = [...new Set(['cmps_recordid', 'cmps_isarchived', ...fields, ...['clientLookup', 'enrollmentLookup'].map((key) => mapping[key]).filter(Boolean), ...(name === 'Client_Profile' && !missingExclusion ? ['cmps_excludefromreports'] : [])])]
    schemas[mapping.alias] = {
      LogicalName: primary[name].replace(/id$/, ''), PrimaryIdAttribute: primary[name],
      Attributes: physical.map((field) => ['cmps_victimtype1', 'cmps_relationshiptoabuser', 'cmps_clientspecialclassification1', 'cmps_disability'].includes(field) ? { LogicalName: field, AttributeType: 'Virtual', AttributeTypeName: { Value: 'MultiSelectPicklistType' } } : { LogicalName: field, AttributeType: field === mapping.clientLookup || field === mapping.enrollmentLookup ? 'Lookup' : field === 'cmps_dateofbirth' || field === 'cmps_dateofservice' ? 'DateTime' : optionLabels[field] ? 'Picklist' : field === 'cmps_minutes' ? 'Decimal' : 'String' }),
    }
  }
  const cp = (n, fields = {}) => ({ cmps_clientprofileid: id(n), cmps_recordid: 'CP-' + n, cmps_isarchived: 125570001, cmps_excludefromreports: 125570001, cmps_dateofbirth: '1990-01-01', cmps_race: 'White', cmps_gender: 'Female', cmps_ethnicity: 'Not Hispanic/Latino', ...fields })
  const pe = (n, parent, fields = {}) => ({ cmps_programenrollment1id: id(n), cmps_recordid: 'PE-' + n, cmps_isarchived: 125570001, _cmps_clientid_value: id(parent), cmps_program: 125570005, ...fields })
  const sv = (n, parent, fields = {}) => ({ cmps_servicesid: id(n), cmps_recordid: 'SV-' + n, cmps_isarchived: 125570001, _cmps_programenrollment_value: id(parent), cmps_dateofservice: '2026-01-10T00:00:00Z', cmps_funder: 125570004, cmps_meetingmode: 125570001, cmps_servicecategory: 'Resource Navigation', cmps_service: 'Program Information Only', cmps_minutes: 30, ...fields })
  const records = {
    Client_Profile: [cp(1, { cmps_name: 'A Test-Like Real Name' }), cp(2, { cmps_excludefromreports: 125570000 }), cp(3, { cmps_isarchived: 125570000 })],
    ProgramEnrollment: [pe(11, 1), pe(12, 2), pe(13, 1, { cmps_isarchived: 125570000 }), pe(14, 3), pe(15, 1, { cmps_program: 125570000 })],
    Services: [sv(21, 11), sv(22, 11, { cmps_dateofservice: '2026-02-10T00:00:00Z', cmps_minutes: '15' }), sv(23, 12), sv(24, 13), sv(25, 11, { cmps_isarchived: 125570000 }), sv(26, 11, { cmps_funder: 125570006 }), sv(27, 15), sv(28, 14), sv(29, 11, { cmps_dateofservice: '2025-12-31T00:00:00Z' })],
  }
  const execute = async ({ connectorOperation: operation }) => {
    calls.push(operation)
    assert.match(operation.operationName, /^(ListRecordsWithOrganization|GetNextPageWithOrganization)$/)
    const p = operation.parameters
    if (p.entityName === 'EntityDefinitions') return { success: true, data: { value: [schemas[p.$filter.match(/'([^']+)'/)[1]]] } }
    if (p.entityName.includes('LookupAttributeMetadata')) {
      const name = names.find((name) => p.entityName.includes("LogicalName='" + schemas[mappings[name].alias].LogicalName + "'"))
      const field = p.$filter.match(/'([^']+)'/)[1]
      return { success: true, data: { value: [{ LogicalName: field, Targets: [schemas[mappings[field === mappings[name].clientLookup ? 'Client_Profile' : 'ProgramEnrollment'].alias].LogicalName] }] } }
    }
    if (p.entityName.includes('PicklistAttributeMetadata')) return { success: true, data: { value: Object.entries(optionLabels).map(([LogicalName, options]) => ({ LogicalName, OptionSet: { Options: Object.entries(options).map(([Value, Label]) => ({ Value: Number(Value), Label: { UserLocalizedLabel: { Label } } })) } })) } }
    const name = names.find((name) => mappings[name].alias === p.entityName)
    assert.ok(name, 'Must not read Helpline or unrelated tables')
    // Ignore row filters deliberately to exercise defensive archive, exclusion,
    // parent-link and date checks in addition to checking outgoing filters.
    if (name === 'Services') {
      if (p.next) { if (failPage) return { success: false, error: 'Next page denied' }; return { success: true, data: { value: records.Services.slice(1) } } }
      return { success: true, data: { value: records.Services.slice(0, 1), next: 'service-page-two' } }
    }
    return { success: true, data: { value: records[name] } }
  }
  const native = loader({
    '@microsoft/power-apps/data': { getClient: () => ({ executeAsync: execute }) },
    '../../../.power/schemas/appschemas/dataSourcesInfo': { dataSourcesInfo: {} },
    '../auth': { getAuthToken: () => 'same-signed-in-user' },
    '../dataverseRecordPages': { readDataverseRecordPages: async (_org, _table, query, _runtime, request) => { const first = await request(query, ''); return [...first.value, ...(first.next ? (await request({ next: first.next }, '')).value : [])] } },
  }, { window: { location: { hostname: 'apps.powerapps.com' } } })
  return { calls, records, run: () => native('saspMuskieReport').runSaspMuskieReport({ ReportPeriodStart: '2026-01-01', ReportPeriodEnd: '2026-03-31' }, mappings, new AbortController().signal, () => {}) }
}
test('real report reader verifies schema/choice IDs/lookup targets, pages all data and preserves explicit exclusions and date filters', async () => {
  const h = connectorHarness(), result = await h.run()
  assert.equal(totals(result)[0].ServiceRecords, 2)
  assert.equal(totals(result)[0].KnownMinutes, 45)
  assert.equal(totals(result, 'SASP_ClientsServed')[0].Clients, 1)
  assert.equal(totals(result, 'SASP_Calls')[0].Calls, 2)
  const query = h.calls.find((call) => call.parameters.entityName === 'cmps_serviceses' && !call.parameters.next).parameters
  assert.match(query.$filter, /cmps_isarchived ne 125570000/)
  assert.match(query.$filter, /cmps_dateofservice ge 2026-01-01T00:00:00Z/)
  assert.match(query.$filter, /cmps_dateofservice lt 2026-04-01T00:00:00Z/)
  assert.match(query.$select, /cmps_funder/); assert.doesNotMatch(query.$select, /cmps_meetingmode/)
  const profile = h.calls.find((call) => call.parameters.entityName === 'cmps_clientprofiles').parameters
  assert.match(profile.$filter, /cmps_excludefromreports ne 125570000/)
  assert.equal(h.calls.filter((call) => call.operationName === 'GetNextPageWithOrganization').length, 1)
  assert.equal(JSON.stringify(result).includes('CP-2'), false)
  assert.equal(JSON.stringify(result).includes('SV-23'), false)
})
test('missing developer eligibility metadata and a failed continuation page cannot become partial/zero report totals', async () => {
  for (const options of [{ missingExclusion: true }, { failPage: true }]) {
    const result = await connectorHarness(options).run()
    for (const section of plan.SASP_MUSKIE_SECTIONS) {
      assert.ok(result.datasets[section.name].unavailable)
      assert.equal(result.datasets[section.name].rows, undefined)
    }
  }
})
test('approved test and live selectors route SASP to its native runner/view with report access controls', () => {
  const panel = readFileSync(new URL('./reporting/LegacyReportsPanel.tsx', import.meta.url), 'utf8')
  assert.match(panel, /reports: \[\.\.\.\(catalogData as unknown as ReportCatalog\).reports, SASP_MUSKIE_REPORT, GLENDALE_REPORT, \.\.\.DES_BOS_REPORTS\]/)
  assert.match(panel, /if \(!canView \|\| busy \|\| schemaBusy\) return/)
  assert.match(panel, /const current = sasp[\s\S]*?runSaspMuskieReport[\s\S]*?: await runLegacyReport/)
  assert.match(panel, /sasp \? <SaspMuskieReportView[\s\S]*?: <LegacyReportView/)
  const live = readFileSync(new URL('../../../../liveapps/COMPASS/src/services/reporting/LegacyReportsPanel.tsx', import.meta.url), 'utf8')
  assert.match(live, /SASP_MUSKIE_REPORT/)
  assert.match(live, /runSaspMuskieReport/)
  assert.match(live, /SaspMuskieReportView/)
})
test('a Reporting user can choose the single SASP entry, run all three sections, and see the result without admin setup access', async () => {
  const state = [], calls = [], effects = []
  let cursor = 0
  const fakeReact = {
    useState(initial) { const position = cursor++; if (!(position in state)) state[position] = typeof initial === 'function' ? initial() : initial; return [state[position], (value) => { state[position] = typeof value === 'function' ? value(state[position]) : value }] },
    useRef(value) { return { current: value } }, useMemo: (fn) => fn(), useEffect: (fn) => effects.push(fn),
  }
  const expected = { datasets: Object.fromEntries(plan.SASP_MUSKIE_SECTIONS.map((section) => [section.name, { rows: [] }])), warnings: [], generatedAt: '2026-10-27T12:00:00Z', displayIds: {} }
  const stubView = () => null
  const api = loader({
    react: fakeReact,
    './reportDataverse': { readReportSchema() { throw new Error('Reporting users must not inspect/change metadata') } },
    './runLegacyReport': { runLegacyReport() { throw new Error('SASP must not enter the SQL/legacy runner') } },
    './saspMuskieReport': { runSaspMuskieReport: async (...args) => { calls.push(args); return expected } },
    './SaspMuskieReportView': { default: stubView }, './LegacyReportView': { default: () => null },
  })
  const Panel = api('LegacyReportsPanel').default
  function render(canView = true) { cursor = 0; return Panel({ canView, canManage: false }) }
  function descendants(tree, type) {
    if (Array.isArray(tree)) return tree.flatMap((entry) => descendants(entry, type))
    if (!tree || typeof tree !== 'object') return []
    return [...(tree.type === type ? [tree] : []), ...descendants(tree.props?.children, type)]
  }
  let tree = render()
  const select = descendants(tree, 'select').find((select) => descendants(select, 'option').some((option) => option.props.value === plan.SASP_MUSKIE_ID))
  assert.ok(select)
  assert.equal(descendants(select, 'option').filter((option) => String(option.props.children).includes('SASP')).length, 1)
  select.props.onChange({ target: { value: plan.SASP_MUSKIE_ID } })
  tree = render()
  const dates = descendants(tree, 'input').filter((input) => input.props.type === 'date')
  assert.equal(dates.length, 2)
  dates[0].props.onChange({ target: { value: '2026-01-01' } }); dates[1].props.onChange({ target: { value: '2026-03-31' } })
  tree = render()
  descendants(tree, 'button').find((button) => button.props.children === 'View Report').props.onClick()
  await new Promise((resolve) => setTimeout(resolve, 0))
  assert.equal(calls.length, 1)
  assert.equal(calls[0][0].ReportPeriodStart, '2026-01-01')
  assert.equal(calls[0][0].ReportPeriodEnd, '2026-03-31')
  tree = render()
  assert.equal(descendants(tree, stubView)[0].props.result, expected)
  assert.equal(descendants(tree, 'summary').some((summary) => /IT Admin/.test(String(summary.props.children))), false)
  assert.equal(descendants(render(false), 'button').length, 0)
})
