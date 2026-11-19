import assert from 'node:assert/strict'
import { readFileSync } from 'node:fs'
import test from 'node:test'
import vm from 'node:vm'
import ts from 'typescript'
import React from 'react'
import * as JSX from 'react/jsx-runtime'
import { renderToStaticMarkup } from 'react-dom/server'

const catalog = JSON.parse(readFileSync(new URL('./reporting/legacyReportCatalog.json', import.meta.url), 'utf8'))
const monthly = catalog.reports.find((report) => report.id === 'ovw-monthly-report-exhibit-j-v26-1')
const params = { ReportPeriodStart: '2026-09-01', ReportPeriodEnd: '2026-09-30' }
function loader(dependencies = {}) {
  const cache = new Map()
  function load(name) {
    if (name in dependencies) return dependencies[name]
    if (cache.has(name)) return cache.get(name)
    if (name.endsWith('.json')) return JSON.parse(readFileSync(new URL('./reporting/' + name, import.meta.url), 'utf8'))
    let source
    try { source = readFileSync(new URL('./reporting/' + name + '.ts', import.meta.url), 'utf8') }
    catch { source = readFileSync(new URL('./reporting/' + name + '.tsx', import.meta.url), 'utf8') }
    const module = { exports: {} }; cache.set(name, module.exports)
    vm.runInNewContext(ts.transpileModule(source, { compilerOptions: { target: ts.ScriptTarget.ES2022, module: ts.ModuleKind.CommonJS, jsx: ts.JsxEmit.ReactJSX } }).outputText, {
      module, exports: module.exports, Date, Map, Set, WeakMap, Intl, AbortController, setTimeout,
      require(key) {
        if (key === 'react') return React
        if (key === 'react/jsx-runtime') return JSX
        if (key === '../desDvReport') return { currentReportDate: () => '2026-10-20' }
        if (key === './nativeDesDvReport') return { runNativeDesDvReport() { throw Error('Not a DES report') } }
        if (key.startsWith('./')) return load(key.slice(2))
        throw Error('Unexpected dependency ' + key)
      },
    })
    return module.exports
  }
  return load
}
const load = loader(), calendar = load('ovwFiscalCalendar'), planner = load('reportPlan')

test('OVW fiscal years reset October 1, use ending-year names and October-based quarters', () => {
  for (const [day, year, quarter] of [
    ['2025-09-30', 2025, 'Q4'], ['2025-10-01', 2026, 'Q1'], ['2025-12-31', 2026, 'Q1'],
    ['2026-01-01', 2026, 'Q2'], ['2026-03-31', 2026, 'Q2'], ['2026-04-01', 2026, 'Q3'],
    ['2026-06-30', 2026, 'Q3'], ['2026-07-01', 2026, 'Q4'], ['2026-09-30', 2026, 'Q4'], ['2026-10-01', 2027, 'Q1'],
  ]) assert.deepEqual(JSON.parse(JSON.stringify(calendar.ovwFiscalPeriod(day))), { fiscalYear: year, quarter }, day)
  for (const value of ['', 'invalid', '2026-02-30', '0001-01-01']) assert.throws(() => calendar.ovwFiscalPeriod(value), /valid date/)
})

test('calendar includes complete requested fiscal years, valid month ends/leap days and earlier service months without duplicates', () => {
  const rows = calendar.buildOvwFiscalCalendar(params, [{ DateofService: '2024-02-29' }, { DateofService: '2024-02-05' },
    { DateofService: '2025-10-02T10:00:00Z' }, { DateofService: '0001-01-01' }, { DateofService: 'bad' }])
  assert.equal(rows.length, 13)
  assert.equal(rows.filter((row) => row.Fiscal_Year === 2026).length, 12)
  assert.equal(rows.find((row) => row.State_MStart === '2024-02-01').State_MEnd, '2024-02-29')
  assert.equal(rows.find((row) => row.State_MStart === '2026-02-01').State_MEnd, '2026-02-28')
  assert.equal(rows[0].Quarter, 'Q2')
  assert.equal(rows.every((row) => row.ANL_MStart === null && row.ANL_MEnd === null), true, 'do not infer an unconfirmed agency calendar')
  const cross = calendar.buildOvwFiscalCalendar({ ReportPeriodStart: '2026-09-30', ReportPeriodEnd: '2026-10-01' }, [])
  assert.equal(cross.length, 24)
  assert.throws(() => calendar.buildOvwFiscalCalendar({ ...params, ReportPeriodEnd: '2026-08-30' }, []), /valid OVW/)
})

test('OVW Monthly and DQ plans enable every date-dependent dataset; unrelated calendars and capacity stay deferred', () => {
  for (const report of catalog.reports.filter((report) => calendar.usesOvwFiscalCalendar(report))) {
    const plan = planner.planLegacyReport(report, catalog)
    assert.equal(Object.values(plan.datasets).every((dataset) => !dataset.unavailable), true)
    assert.ok(plan.required.Ref_Dates.includes('State_MStart'))
    assert.ok(plan.required.Services.includes('DateofService'))
  }
  const other = catalog.reports.find((report) => !calendar.usesOvwFiscalCalendar(report) && Object.values(planner.planLegacyReport(report, catalog).datasets).some((dataset) => dataset.unavailable.includes('Ref_Dates')))
  assert.ok(other, 'unconfirmed non-OVW calendar remains deferred')
  const synthetic = { ...monthly, datasets: [{ ...monthly.datasets[0], dependencies: ['table:Ref_ShelterCapacity'], requirements: { Ref_ShelterCapacity: ['BudgetAmt'] } }] }
  assert.match(planner.planLegacyReport(synthetic, catalog).datasets[monthly.datasets[0].name].unavailable, /Ref_ShelterCapacity/)
})

function fixture() {
  const snapshot = { tables: Object.fromEntries(Object.keys(catalog.tables).map((name) => [name, []])),
    unavailable: { Ref_Dates: 'Deferred', Ref_ShelterCapacity: 'Budget/capacity is deferred' }, warnings: [], displayIds: {} }
  function client(key, dates, end = null) {
    snapshot.tables.Client_Profile.push({ document_id: key, first_name: key, last_name: 'Client', dob: '1950-01-01', disability: null, race: 'White', ethnicity: 'Not Hispanic/Latino', gender: 'Female' })
    const pe = 'pe-' + key
    snapshot.tables.ProgramEnrollment.push({ RecordID: pe, Program: 'DVSTOP', ProgramType: 'Residential', ClientType: 'Adult', ServiceStartDate: dates[0], ServiceEndDate: end,
      AbuseStatus: 'Primary Victim', OVWClientServedStatus: 'Client Fully Served', ExitDestination: 'Rental by client', ClientSpecialClassification: 'None of the Above', VictimType: 'Elder Abuse/Neglect/Exploitation', RelationshiptoAbuser: 'Spouse' })
    snapshot.tables.documents.push({ RecordId: pe, ParentId: key })
    for (const [index, day] of dates.entries()) {
      const id = 'sv-' + key + '-' + index
      snapshot.tables.Services.push({ RecordID: id, DateofService: day, ProgramEnrollment: 'DVSTOP | ' + pe, Funder: 'OVW-Late Life', InHours: .5, Service: 'Intake', ServiceCategory: 'Intake & Discharge', ServiceCost: null })
      snapshot.tables.Links.push({ LinkFromId: id, LinkToId: pe })
    }
    return pe
  }
  client('new-september', ['2026-09-10'])
  client('counted-earlier', ['2025-11-02', '2026-09-12', '2026-10-03'])
  client('prior-fiscal', ['2025-09-12', '2026-09-13'])
  const older = client('older-service', ['2024-12-01'], '2026-09-25')
  snapshot.tables.BedEnrollment.push({ RecordID: 'bed-old', ProgramEnrollment: 'DVSTOP | ' + older, CheckInDate: '2026-09-01', CheckOutDate: '2026-09-03' })
  snapshot.tables.Links.push({ LinkFromId: 'bed-old', LinkToId: older })
  snapshot.tables.Helpline.push({ RecordID: 'call', Program: 'DVSTOP', DateOfContact: '2026-09-15', CompleteOVWLateLifeAbuseScreening: 'Yes', CallerOver50YrsOld: 'Yes', AbuserIsSpousePartnerOrCloseRelative: 'Yes', HasCallerExperiencedRecentDVorSVorElderAbuse: 'Yes' })
  snapshot.tables.documents.push({ RecordId: 'call', ParentId: 'new-september' })
  return snapshot
}

async function run(snapshot, parameters = params) {
  let loaded
  const runtime = loader({ reportDataverse: { loadReportSnapshot: async (required) => { loaded = required; return structuredClone(snapshot) } } })
  const result = await runtime('runLegacyReport').runLegacyReport(monthly, catalog, parameters, {}, new AbortController().signal, () => {})
  return { result, loaded }
}

test('OVW native calculations and all eight RDL sections render after enabling the fiscal calendar', async () => {
  const snapshot = fixture(), before = JSON.stringify(snapshot), { result, loaded } = await run(snapshot)
  assert.ok(loaded.Ref_Dates)
  for (const dataset of monthly.datasets) assert.equal(result.datasets[dataset.name].unavailable, undefined, dataset.name + ': ' + result.datasets[dataset.name].unavailable)
  const people = result.datasets.OVW_02_demographics.rows
  assert.deepEqual(Array.from(people, (row) => row.Client_ProfileID).sort(), ['new-september', 'prior-fiscal'])
  assert.equal(people.every((row) => row.Fiscal_Year === 2026 && row.Quarter === 'Q4'), true)
  assert.equal(result.datasets.OVW_04_bednights.rows[0].Client_ProfileID, 'older-service', 'keep older service history for bed eligibility')
  assert.equal(result.datasets.OVW_EXITS.rows[0].Client_ProfileID, 'older-service', 'keep older service history for exits')
  assert.equal(result.datasets.OVW_05_calls.rows.length, 1)
  assert.ok(result.warnings.some((warning) => warning.includes('October 1–September 30')))
  const View = load('LegacyReportView').default
  const html = renderToStaticMarkup(React.createElement(View, { report: monthly, parameters: params, result, expandDetails: true }))
  assert.equal((html.match(/<table/g) || []).length, 8)
  assert.doesNotMatch(html, /No zero totals|unavailable, not a zero|Report expression needs review/)
  assert.equal(JSON.stringify(snapshot), before, 'never mutate source data or write calendar records')
})

test('October starts a new yearly client count rather than repeating the September fiscal year', async () => {
  const { result } = await run(fixture(), { ReportPeriodStart: '2026-10-01', ReportPeriodEnd: '2026-10-31' })
  assert.equal(result.datasets.OVW_02_demographics.unavailable, undefined)
  const rows = result.datasets.OVW_02_demographics.rows
  assert.equal(rows.length, 1); assert.equal(rows[0].Client_ProfileID, 'counted-earlier')
  assert.equal(rows[0].Fiscal_Year, 2027); assert.equal(rows[0].Quarter, 'Q1')
})

test('calendar support does not hide a failed real-table read behind zero counts', async () => {
  const snapshot = fixture(); snapshot.unavailable.Client_Profile = 'Profile read failed'
  const { result } = await run(snapshot)
  assert.match(result.datasets.OVW_02_demographics.unavailable, /Profile read failed/)
  assert.equal(result.datasets.OVW_02_demographics.rows, undefined)
})

test('only the retired top prototype is removed; the report library and its DES report remain', () => {
  const app = readFileSync(new URL('../App.tsx', import.meta.url), 'utf8')
  assert.doesNotMatch(app, /import DesDvReportPanel|<DesDvReportPanel/)
  assert.match(app, /<LegacyReportsPanel/)
  assert.ok(catalog.reports.some((report) => report.id === 'des-dv-monthly-report-exhibit-e-v26-0'))
  const panel = readFileSync(new URL('./reporting/LegacyReportsPanel.tsx', import.meta.url), 'utf8')
  assert.match(panel, /ovwCalendar \? <p/)
})
