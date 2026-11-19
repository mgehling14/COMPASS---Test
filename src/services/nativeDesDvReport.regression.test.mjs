import assert from 'node:assert/strict'
import { readFileSync } from 'node:fs'
import test from 'node:test'
import vm from 'node:vm'
import ts from 'typescript'
import React from 'react'
import { renderToStaticMarkup } from 'react-dom/server'

const catalog = JSON.parse(readFileSync(new URL('./reporting/legacyReportCatalog.json', import.meta.url), 'utf8'))
function loader(dependencies = {}, globals = {}) {
  const cache = new Map()
  function load(name) {
    if (cache.has(name)) return cache.get(name)
    if (name.endsWith('.json')) return JSON.parse(readFileSync(new URL('./reporting/' + name, import.meta.url), 'utf8'))
    const path = name.startsWith('../') ? name.slice(3) : 'reporting/' + name
    let source
    try { source = readFileSync(new URL('./' + path + '.ts', import.meta.url), 'utf8') } catch { source = readFileSync(new URL('./' + path + '.tsx', import.meta.url), 'utf8') }
    source = source.replaceAll('import.meta.env', '({})')
    const module = { exports: {} }; cache.set(name, module.exports)
    vm.runInNewContext(ts.transpileModule(source, { compilerOptions: { module: ts.ModuleKind.CommonJS, target: ts.ScriptTarget.ES2022, jsx: ts.JsxEmit.ReactJSX } }).outputText, {
      module, exports: module.exports, Date, Map, Set, Intl, AbortController, DOMException, URL, structuredClone, setTimeout, clearTimeout, console, ...globals,
      require(key) { if (key in dependencies) return dependencies[key]; if (key === 'react') return React; if (key === 'react/jsx-runtime') return jsxRuntime; if (key.startsWith('./')) return load(key.slice(2)); if (key.startsWith('../')) return load(key); throw Error('Unexpected import ' + key) },
    })
    cache.set(name, module.exports); return module.exports
  }
  return load
}
const jsxRuntime = await import('react/jsx-runtime')
const load = loader({ './reportDataverse': {} }), plan = load('nativeDesDvPlan'), calculator = load('nativeDesDvReport'), layout = load('rdlLayout'), expressions = load('rdlExpressions')
const original = catalog.reports.find((report) => report.id === plan.NATIVE_DES_DV_ID), report = plan.prepareNativeDesDvReport(original)
const options = (overrides = {}) => ({ ...structuredClone(plan.DEFAULT_NATIVE_DES_DV_OPTIONS), ...overrides })
function fixture() {
  const snapshot = { tables: { Client_Profile: [], ProgramEnrollment: [], Services: [], BedEnrollment: [], documents: [], Links: [] }, unavailable: {}, displayIds: {}, warnings: [] }
  function client(key, fields = {}) { snapshot.tables.Client_Profile.push({ document_id: key, first_name: 'Example', last_name: 'Client', dob: '1990-01-01', race: 'White', gender: 'Female', ...fields }); snapshot.displayIds[key] = 'CP-' + key; return key }
  function enrollment(key, clientId, fields = {}) { snapshot.tables.ProgramEnrollment.push({ RecordID: key, Program: 'CAAFA Shelter', ProgramType: 'Residential', ServiceStartDate: '2026-09-01', ServiceEndDate: null, EnrollmentStatus: 'Enrolled', ClientType: 'Adult', TANFEligible: 'Yes', ...fields }); snapshot.tables.documents.push({ RecordId: key, ParentId: clientId }); snapshot.displayIds[key] = 'PE-' + key; return key }
  function service(key, enrollmentId, fields = {}) { snapshot.tables.Services.push({ RecordID: key, DateofService: '2026-09-10', InHours: .25, ServiceCategory: 'Intake & Discharge', Service: 'Intake', ...fields }); snapshot.tables.Links.push({ LinkFromId: key, LinkToId: enrollmentId }); snapshot.displayIds[key] = 'SV-' + key; return key }
  function bed(key, enrollmentId, fields = {}) { snapshot.tables.BedEnrollment.push({ RecordID: key, CheckInDate: '2026-08-30', CheckOutDate: '2026-09-03', ...fields }); snapshot.tables.Links.push({ LinkFromId: key, LinkToId: enrollmentId }); return key }
  const run = (start = '2026-09-01', end = '2026-09-30', opts = {}, asOf = '2026-10-14', signal = new AbortController().signal, progress = () => {}) => calculator.calculateNativeDesDvReport(snapshot, report, start, end, signal, progress, options(opts), asOf)
  return { snapshot, client, enrollment, service, bed, run }
}
const rows = (result, name = 'DES_DV_monthly_02_data') => result.datasets[name].rows
const audit = (result) => rows(result, 'Native_DES_DV_Audit')

test('native plan needs only actual CP/Enrollment/Services/Beds, with no deferred calendar or capacity data', () => {
  const native = load('reportPlan').planLegacyReport(report, catalog)
  assert.deepEqual(Object.keys(native.required).sort(), ['BedEnrollment', 'Client_Profile', 'ProgramEnrollment', 'Services'])
  assert.equal(Object.values(native.datasets).every((dataset) => !dataset.unavailable), true)
  assert.equal(report.datasets.length, 7)
  assert.equal(original.datasets.length, 6)
})

test('prepared layout preserves all seven sections, fixes false-branch phantom counts, and does not mutate source SQL/RDL', () => {
  assert.equal(report.items.length, 7)
  assert.equal(report.items.find((item) => item.name === 'Tablix24').dataset, 'Native_DES_DV_turnaways')
  assert.equal(original.items.find((item) => item.name === 'Tablix24').dataset, 'DES_DV_monthly_02_data')
  assert.doesNotMatch(JSON.stringify(report.items), /Fields!Client_RecordID.Value, 0\)/)
  assert.match(JSON.stringify(report.items), /NativeCountKey/)
  assert.match(JSON.stringify(report.items), /NativeMCBAHours/)
  assert.equal(report.datasets.find((dataset) => dataset.name === 'DES_DV_02_bednights').fields.find((field) => field.name === 'Bednights').expression, '')
  assert.deepEqual(report.items.map((item) => item.name), ['Tablix4', 'Tablix11', 'Tablix1', 'Tablix3', 'Tablix24', 'Tablix26', 'Tablix2'])
})

test('PE-based shelter first counts deduplicate yearly, with history before the chosen month retained', async () => {
  const f = fixture(), cp = f.client('a')
  f.enrollment('old', cp, { ServiceStartDate: '2025-11-10', ServiceEndDate: '2025-12-10' })
  f.enrollment('later', cp)
  const result = await f.run()
  assert.equal(rows(result).length, 0)
  assert.ok(audit(result).some((row) => /before the selected period/.test(row.Decision)))
  assert.ok(audit(result).some((row) => /Already counted/.test(row.Decision)))
})

test('continuing enrollments count again at October 1; later starts cannot steal that first count', async () => {
  const f = fixture(), cp = f.client('a')
  f.enrollment('continuing', cp, { ServiceStartDate: '2024-01-01', Program: 'Faith House' })
  f.enrollment('later', cp, { ServiceStartDate: '2026-10-05' })
  const result = await f.run('2026-10-01', '2026-10-14')
  assert.equal(rows(result).length, 1)
  assert.equal(rows(result)[0].Program_Name, 'Faith House')
  assert.equal(rows(result)[0].MonthServed, '2026-10-01')
})

test('a prior DV Outreach service permits one later program override, not repeated shelter counts', async () => {
  const f = fixture(), cp = f.client('a')
  const outreach = f.enrollment('outreach', cp, { Program: 'CAAFA Outreach', ServiceStartDate: '2025-10-05' })
  f.service('first', outreach, { DateofService: '2025-10-10' })
  f.enrollment('shelter', cp, { ServiceStartDate: '2026-09-02' })
  f.enrollment('repeat', cp, { Program: 'Faith House', ServiceStartDate: '2026-09-15' })
  const result = await f.run()
  assert.equal(rows(result).length, 1)
  assert.equal(rows(result)[0].Program_Name, 'CAAFA Shelter')
  assert.ok(audit(result).some((row) => /after DV Outreach transfer/.test(row.Decision)))
})

test('same-date outreach/shelter ties prefer the shelter; other programs participate in counting history', async () => {
  const f = fixture(), a = f.client('a'), b = f.client('b')
  const outreach = f.enrollment('outreach', a, { Program: 'CAAFA Outreach' }); f.service('first', outreach, { DateofService: '2026-09-01' }); f.enrollment('shelter', a)
  f.enrollment('reach', b, { Program: 'REACH Center', ServiceStartDate: '2025-11-01' }); f.enrollment('later', b)
  const result = await f.run()
  assert.equal(rows(result).length, 1)
  assert.equal(rows(result)[0].Client_RecordID, a)
  assert.equal(rows(result)[0].Program_Name, 'CAAFA Shelter')
})

test('DV Outreach date source is configurable, and all period service hours survive earlier yearly client counts', async () => {
  const f = fixture(), cp = f.client('a'), pe = f.enrollment('outreach', cp, { Program: 'DV Outreach', ServiceStartDate: '2025-10-02' })
  f.service('sv', pe)
  const service = await f.run(), enrollment = await f.run('2026-09-01', '2026-09-30', { outreachCountDate: 'enrollment' })
  assert.equal(rows(service).length, 1); assert.equal(rows(service)[0].MonthServed, '2026-09-10')
  assert.equal(rows(enrollment).length, 0)
  assert.equal(rows(enrollment, 'DVSV_Services_CO')[0].NativeMCBAHours, .25)
})

test('age comes from DOB on the first-count date; missing DOB fallback is explicit and unknown TANF is not No', async () => {
  const f = fixture(), child = f.client('child', { dob: '2008-09-02' }), fallback = f.client('fallback', { dob: null }), unknown = f.client('unknown')
  f.enrollment('child', child, { ClientType: 'Adult' }); f.enrollment('fallback', fallback, { ClientType: 'Child' }); f.enrollment('unknown', unknown, { TANFEligible: 'Unknown/Not Reported' })
  const result = await f.run()
  assert.deepEqual(Array.from(rows(result), (row) => row.TANF_Eligibility), ['2-TANF Child', '2-TANF Child'])
  assert.ok(result.warnings.some((warning) => /DOB unavailable/.test(warning)))
  assert.ok(result.warnings.some((warning) => /not assumed to be No/.test(warning)))
  const strict = await f.run('2026-09-01', '2026-09-30', { allowClientTypeFallback: false })
  assert.equal(rows(strict).length, 1)
})

test('non-TANF adults include legacy N/A; non-TANF children are always included as their own category', async () => {
  const f = fixture(), adult = f.client('adult'), child = f.client('child', { dob: '2020-01-01' })
  f.enrollment('adult', adult, { TANFEligible: 'N/A' }); f.enrollment('child', child, { TANFEligible: 'No' })
  const result = await f.run()
  assert.equal(rows(result).length, 2)
  assert.deepEqual(Array.from(rows(result), (row) => row.TANF_Eligibility), ['3-non-TANF Adult', '4-non-TANF Child'])
  assert.equal(audit(result).some((row) => /Non-TANF child excluded/.test(row.Decision)), false)
})

test('People Served displays four ordered category rows with correct totals and no Outreach spillover', async () => {
  const f = fixture()
  for (const [key, dob, tanf] of [['tanf-adult', '1990-01-01', 'Yes'], ['tanf-child', '2020-01-01', 'Yes'], ['non-tanf-adult', '1990-01-01', 'No'], ['non-tanf-child', '2020-01-01', 'No']]) f.enrollment(key, f.client(key, { dob }), { TANFEligible: tanf })
  const outreach = f.enrollment('outreach-child', f.client('outreach-child', { dob: '2020-01-01' }), { Program: 'DV Outreach', TANFEligible: 'No' })
  f.service('outreach-service', outreach)
  const result = await f.run(), data = rows(result)
  assert.equal(data.length, 5)
  const labels = ['TANF Adult', 'TANF Child', 'non-TANF Adult', 'non-TANF Child']
  for (const [name, expected] of [['Tablix4', [1, 1, 1, 1, 4]], ['Tablix26', [0, 0, 0, 1, 1]]]) {
    const table = report.items.find((item) => item.name === name)
    const context = { rows: data, scopes: { DES_DV_monthly_02_data: data }, parameters: { ReportPeriodStart: '2026-09-01', ReportPeriodEnd: '2026-09-30' } }
    const axes = layout.reportTableAxes(table, data, context)
    assert.equal(axes.rows.length, 5)
    assert.deepEqual(Array.from(axes.rows.slice(0, 4), (row) => table.rows[row.index][0].items[0].paragraphs[0][0].value), labels)
    const totalColumn = axes.columns.at(-1)
    assert.deepEqual(Array.from(axes.rows, (row) => expressions.evaluateRdl(table.rows[row.index][totalColumn.index].items[0].paragraphs[0][0].value, layout.intersectReportCell(row, totalColumn, axes.context))), expected)
    assert.equal(original.items.find((item) => item.name === name).rows.length, 2, 'Keep supplied source SQL/RDL unchanged')
  }
})

test('all four People Served rows remain visible with zero clients, without synthetic rows or phantom totals', async () => {
  const f = fixture(), result = await f.run(), data = rows(result)
  assert.equal(data.length, 0)
  const table = report.items.find((item) => item.name === 'Tablix4'), context = { rows: data, scopes: { DES_DV_monthly_02_data: data }, parameters: { ReportPeriodStart: '2026-09-01', ReportPeriodEnd: '2026-09-30' } }
  const axes = layout.reportTableAxes(table, data, context)
  assert.equal(axes.rows.length, 5)
  for (const row of axes.rows) for (const column of axes.columns.filter((column) => column.index > 0)) assert.equal(expressions.evaluateRdl(table.rows[row.index][column.index].items[0].paragraphs[0][0].value, layout.intersectReportCell(row, column, axes.context)), 0)
  const view = load('LegacyReportView').default
  const html = renderToStaticMarkup(React.createElement(view, { report: { ...report, items: [table] }, result, parameters: context.parameters }))
  for (const label of ['TANF Adult', 'TANF Child', 'non-TANF Adult', 'non-TANF Child']) assert.ok(html.includes('>' + label + '<'))
  assert.doesNotMatch(html, /Layout\/calculation needs review|Report expression needs review/)
  const sparse = fixture(); sparse.enrollment('only-adult', sparse.client('only-adult'))
  const sparseData = rows(await sparse.run()), sparseContext = { ...context, rows: sparseData, scopes: { DES_DV_monthly_02_data: sparseData } }
  const sparseAxes = layout.reportTableAxes(table, sparseData, sparseContext), totalColumn = sparseAxes.columns.at(-1)
  assert.deepEqual(Array.from(sparseAxes.rows, (row) => expressions.evaluateRdl(table.rows[row.index][totalColumn.index].items[0].paragraphs[0][0].value, layout.intersectReportCell(row, totalColumn, sparseAxes.context))), [1, 0, 0, 0, 1], 'Missing categories show zero, not phantom clients from other categories')
  const panel = readFileSync(new URL('./reporting/LegacyReportsPanel.tsx', import.meta.url), 'utf8')
  assert.doesNotMatch(panel, /includeNonTanfChildren|otherwise excluded and flagged/)
})

test('people layout counts the same client separately after a fiscal reset in a cross-year date range', async () => {
  const f = fixture(), cp = f.client('a'); f.enrollment('pe', cp)
  const result = await f.run('2026-09-01', '2026-10-14'), data = rows(result)
  assert.equal(data.length, 2)
  assert.equal(new Set(data.map((row) => row.NativeCountKey)).size, 2)
  const ctx = { rows: data, scopes: { DES_DV_monthly_02_data: data }, parameters: { ReportPeriodStart: '2026-09-01', ReportPeriodEnd: '2026-10-14' } }
  assert.equal(expressions.evaluateRdl('=CountDistinct(Fields!NativeCountKey.Value)', ctx), 2)
  assert.equal(data.every((row) => row.Fiscal_Year === null && row.Quarter === null), true)
})

test('bed nights use actual enrollment GUID links, normal shelter names, date clipping and completed nights only', async () => {
  const f = fixture(), cp = f.client('a'), pe = f.enrollment('pe', cp, { Program: 'Faith House Transitional' })
  f.bed('checkout', pe); f.bed('open', pe, { CheckInDate: '2026-10-13', CheckOutDate: null }); f.bed('broken', 'nonexistent')
  const past = await f.run(), current = await f.run('2026-10-01', '2026-10-31')
  assert.equal(rows(past, 'DES_DV_02_bednights')[0].Bednights, 2)
  assert.equal(rows(past, 'DES_DV_02_bednights')[0].Program_Name, 'Faith House')
  assert.equal(rows(current, 'DES_DV_02_bednights')[0].Bednights, 1)
  assert.ok(audit(past).some((row) => /invalid stay dates/.test(row.Decision)))
})

test('actual RDL totals exclude Outreach from the shelter total without counting a phantom zero client', async () => {
  const f = fixture(), shelter = f.enrollment('shelter', f.client('a')), outreach = f.enrollment('outreach', f.client('b'), { Program: 'CAAFA Outreach' })
  f.bed('bed', shelter); f.service('service', outreach)
  const result = await f.run(), table = report.items.find((item) => item.name === 'Tablix4'), data = rows(result)
  const context = { rows: data, scopes: { DES_DV_monthly_02_data: data }, parameters: { ReportPeriodStart: '2026-09-01', ReportPeriodEnd: '2026-09-30' } }
  const axes = layout.reportTableAxes(table, data, context), row = axes.rows.at(-1), column = axes.columns.at(-1)
  const cell = table.rows[row.index][column.index], expression = cell.items[0].paragraphs[0][0].value
  assert.equal(expressions.evaluateRdl(expression, layout.intersectReportCell(row, column, axes.context)), 1)
  assert.equal(rows(result, 'DVSV_Services_CO').reduce((sum, row) => sum + (row.NativeMCBAHours || 0), 0), .25)
})

test('separate overlapping bed enrollments count separately and are flagged, not multiplied by physical bed selections', async () => {
  const f = fixture(), cp = f.client('a'), pe = f.enrollment('pe', cp)
  f.bed('one', pe); f.bed('two', pe)
  const result = await f.run()
  assert.equal(rows(result, 'DES_DV_02_bednights').reduce((sum, row) => sum + row.Bednights, 0), 4)
  assert.ok(audit(result).some((row) => /Overlapping bed enrollments/.test(row.Decision)))
})

test('exits use actual end dates even for clients first counted earlier; open stays never become synthetic exits', async () => {
  const f = fixture(), cp = f.client('a'), open = f.client('open')
  f.enrollment('old', cp, { ServiceStartDate: '2025-10-01', ServiceEndDate: '2026-09-10', SafeLoc: 'Yes' })
  f.enrollment('later', cp, { ServiceStartDate: '2026-09-15', ServiceEndDate: '2026-09-25', SafeLoc: 'No' })
  f.enrollment('open', open, { ServiceStartDate: '2025-10-01' })
  const result = await f.run()
  assert.equal(rows(result).length, 0)
  const exits = rows(result, 'DES_DV_exits')
  assert.equal(exits.length, 1); assert.equal(exits[0].ServiceEndDate, '2026-09-25')
  assert.equal(exits[0].Safe_Location_Status, '1-Safe/Stable Location')
  assert.ok(audit(result).some((row) => row.T2_RecordID === 'later' && row.Decision.includes('not safe or unknown')))
})


test('prior December DVSTOP service suppresses January People Served but does not suppress a January Faith House exit', async () => {
  const f = fixture(), cp = f.client('transfer')
  f.enrollment('dvstop', cp, { Program: 'DVSTOP', ServiceStartDate: '2025-12-09', ServiceEndDate: '2025-12-11', SafeLoc: 'No' })
  f.enrollment('faith', cp, { Program: 'Faith House', ServiceStartDate: '2025-12-11', ServiceEndDate: '2026-01-01', SafeLoc: 'Yes' })
  const january = await f.run('2026-01-01', '2026-01-31')
  assert.equal(rows(january).length, 0, 'Only People Served is suppressed by the first fiscal-year count')
  const exits = rows(january, 'DES_DV_exits')
  assert.equal(exits.length, 1)
  assert.equal(exits[0].Program_Name, 'Faith House')
  assert.equal(exits[0].ServiceEndDate, '2026-01-01')
  assert.equal(exits[0].Safe_Location_Status, '1-Safe/Stable Location')
  const combined = await f.run('2025-12-01', '2026-01-31')
  assert.equal(rows(combined).length, 1)
  assert.equal(rows(combined)[0].Program_Name, 'DVSTOP')
  assert.deepEqual(Array.from(rows(combined, 'DES_DV_exits'), (row) => row.Program_Name).sort(), ['DVSTOP', 'Faith House'])
})

test('exit totals retain distinct-client-per-program counting and destination aggregation without fiscal-year suppression', async () => {
  const f = fixture(), cp = f.client('transfer')
  f.enrollment('first', cp, { Program: 'DVSTOP', ServiceStartDate: '2026-01-01', ServiceEndDate: '2026-01-04', SafeLoc: 'No' })
  f.enrollment('second', cp, { Program: 'Faith House', ServiceStartDate: '2026-01-04', ServiceEndDate: '2026-01-12', SafeLoc: 'Yes' })
  f.enrollment('third', cp, { Program: 'DVSTOP', ServiceStartDate: '2026-01-12', ServiceEndDate: '2026-01-20', SafeLoc: 'Yes' })
  const result = await f.run('2026-01-01', '2026-01-31'), exits = rows(result, 'DES_DV_exits')
  assert.equal(rows(result).length, 1)
  assert.equal(exits.length, 2)
  const dvstop = exits.find((row) => row.Program_Name === 'DVSTOP')
  assert.equal(dvstop.ServiceEndDate, '2026-01-20')
  assert.equal(dvstop.Safe_Location_Status, '1-Safe/Stable Location')
  for (const tableName of ['Tablix1', 'Tablix3']) {
    const table = report.items.find((item) => item.name === tableName)
    assert.doesNotMatch(JSON.stringify(table), /NativeCountKey/)
    assert.match(JSON.stringify(table), /NativeExitCountKey/)
    const context = { rows: exits, scopes: { DES_DV_exits: exits }, parameters: {} }
    const axes = layout.reportTableAxes(table, exits, context), row = axes.rows.at(-1), column = axes.columns.at(-1)
    assert.equal(expressions.evaluateRdl(table.rows[row.index][column.index].items[0].paragraphs[0][0].value, layout.intersectReportCell(row, column, axes.context)), 2, 'A repeated exit in one program stays deduplicated, but exits from two programs total two')
  }
})

test('August exit and destination totals add the displayed program columns, including clients exiting multiple programs', async () => {
  const f = fixture()
  const exit = (key, client, program, safe) => f.enrollment(key, client, { Program: program, ServiceStartDate: '2026-07-01', ServiceEndDate: '2026-08-15', SafeLoc: safe ? 'Yes' : 'No' })
  for (let index = 0; index < 25; index++) {
    const client = f.client('dvstop-' + index)
    exit('dvstop-' + index, client, 'DVSTOP', index < 2)
    if (index === 2 || index === 3) exit('caafa-transfer-' + index, client, 'CAAFA Shelter', true)
    if (index === 4) exit('faith-transfer', client, 'Faith House', true)
  }
  for (let index = 0; index < 2; index++) exit('caafa-' + index, f.client('caafa-' + index), 'CAAFA Shelter', true)
  for (let index = 0; index < 4; index++) exit('faith-' + index, f.client('faith-' + index), 'Faith House', true)
  const result = await f.run('2026-08-01', '2026-08-31'), data = rows(result, 'DES_DV_exits')
  assert.equal(data.length, 34)
  assert.equal(new Set(data.map((row) => row.Client_RecordID)).size, 31, 'Fixture reproduces the old cross-program total of 31')
  assert.equal(new Set(data.map((row) => row.NativeExitCountKey)).size, 34)
  for (const tableName of ['Tablix1', 'Tablix3']) {
    const table = report.items.find((item) => item.name === tableName)
    const context = { rows: data, scopes: { DES_DV_exits: data }, parameters: { ReportPeriodStart: '2026-08-01', ReportPeriodEnd: '2026-08-31' } }
    const axes = layout.reportTableAxes(table, data, context)
    for (const row of axes.rows) {
      const status = row.index === 1 ? 'Total' : tableName === 'Tablix1' ? 'Exited' : row.context.row.Safe_Location_Status
      const expected = status === '1-Safe/Stable Location' ? { 'CAAFA Shelter': 4, DVSTOP: 2, 'Faith House': 5, Total: 11 }
        : status === '2-Not Safe/Unknown' ? { 'CAAFA Shelter': 0, DVSTOP: 23, 'Faith House': 0, Total: 23 }
          : { 'CAAFA Shelter': 4, DVSTOP: 25, 'Faith House': 5, Total: 34 }
      const actual = Object.fromEntries(axes.columns.filter((column) => column.index > 0).map((column) => [column === axes.columns.at(-1) ? 'Total' : column.context.row.Program_Name, expressions.evaluateRdl(table.rows[row.index][column.index].items[0].paragraphs[0][0].value, layout.intersectReportCell(row, column, axes.context))]))
      assert.deepEqual(actual, expected, tableName + ': ' + status)
      assert.equal(actual.Total, Object.entries(actual).filter(([key]) => key !== 'Total').reduce((sum, [, value]) => sum + value, 0))
    }
  }
})

test('exit and destination totals remain zero without exits', async () => {
  const result = await fixture().run(), data = rows(result, 'DES_DV_exits')
  for (const name of ['Tablix1', 'Tablix3']) {
    const table = report.items.find((item) => item.name === name), axes = layout.reportTableAxes(table, data, { rows: data, scopes: { DES_DV_exits: data }, parameters: {} })
    const row = axes.rows.at(-1), column = axes.columns.at(-1)
    assert.equal(expressions.evaluateRdl(table.rows[row.index][column.index].items[0].paragraphs[0][0].value, layout.intersectReportCell(row, column, axes.context)), 0)
  }
})

test('turnaways are separate from TANF People Served, classified by own records and limited to the selected dates', async () => {
  const f = fixture(), cp = f.client('a'), served = f.client('b')
  f.enrollment('turnaway', cp, { EnrollmentStatus: 'Turnaway', ReasonTurnedAway: 'At Capacity' })
  f.enrollment('old', cp, { EnrollmentStatus: 'Turnaway', ServiceStartDate: '2026-08-01', ReasonTurnedAway: 'No Show' })
  f.enrollment('served', served)
  const result = await f.run()
  assert.equal(rows(result).length, 1)
  const turnaways = rows(result, 'Native_DES_DV_turnaways')
  assert.equal(turnaways.length, 2)
  assert.equal(turnaways.find((row) => row.Client_RecordID === cp).Turnaway_Status, '1-No Room')
  assert.equal(turnaways.find((row) => row.Client_RecordID === served).Turnaway_Status, null)
})

test('MCBA hours always include every category, including blank and unknown values, and retain valid zeros', async () => {
  const f = fixture(), cp = f.client('a'), pe = f.enrollment('pe', cp, { Program: 'CAAFA Outreach' })
  f.service('intake', pe); f.service('legal', pe, { ServiceCategory: 'Legal & Medical Advocacy', InHours: .5 }); f.service('other', pe, { ServiceCategory: 'Other', InHours: 2 }); f.service('zero', pe, { InHours: 0 }); f.service('invalid', pe, { InHours: -1 })
  f.service('blank', pe, { ServiceCategory: null, InHours: .75 }); f.service('new-category', pe, { ServiceCategory: 'A newly added category', InHours: 1 })
  f.service('missing-minutes', pe, { InHours: null }); f.service('invalid-minutes', pe, { InHours: 'invalid' })
  const result = await f.run(), data = rows(result, 'DVSV_Services_CO')
  assert.equal(data.reduce((sum, row) => sum + (row.NativeMCBAHours || 0), 0), 4.5)
  assert.equal(data.find((row) => row.svcs_RecordID === 'zero').NativeMCBAHours, 0)
  assert.equal(data.find((row) => row.svcs_RecordID === 'invalid').Hrs, null)
  assert.equal(data.find((row) => row.svcs_RecordID === 'blank').NativeMCBAHours, .75)
  assert.equal(data.find((row) => row.svcs_RecordID === 'new-category').NativeMCBAHours, 1)
  for (const key of ['invalid', 'missing-minutes', 'invalid-minutes']) assert.equal(data.find((row) => row.svcs_RecordID === key).NativeMCBAHours, null)
  assert.equal(rows(result, 'DES_DV_monthly_02_MCBAHours')[0].MCBA_Hours_Served, 4.5)
  const table = report.items.find((item) => item.name === 'Tablix2'), context = { rows: data, scopes: { DVSV_Services_CO: data }, parameters: { ReportPeriodStart: '2026-09-01', ReportPeriodEnd: '2026-09-30' } }
  const axes = layout.reportTableAxes(table, data, context), lastRow = axes.rows.at(-1), lastColumn = axes.columns.at(-1)
  const renderedHours = table.rows[lastRow.index][lastColumn.index].items[0].paragraphs[0][0].value
  assert.equal(expressions.evaluateRdl(renderedHours, layout.intersectReportCell(lastRow, lastColumn, axes.context)), 4.5, 'The visible MCBA total includes every category too')
  const staleSetup = await f.run('2026-09-01', '2026-09-30', { mcbaCategories: [] })
  assert.equal(rows(staleSetup, 'DES_DV_monthly_02_MCBAHours')[0].MCBA_Hours_Served, 4.5, 'An obsolete saved category selection cannot suppress hours')
  assert.equal(result.warnings.some((warning) => /category checkboxes|excluded from MCBA hours by/.test(warning)), false)
})

test('all-category MCBA hours still respect report dates and program links, independently of yearly People Served counts', async () => {
  const f = fixture(), cp = f.client('outreach'), outreach = f.enrollment('outreach', cp, { Program: 'DV Outreach', ServiceStartDate: '2025-10-01' })
  f.service('history', outreach, { DateofService: '2025-11-01', ServiceCategory: 'Other', InHours: 10 })
  f.service('first-day', outreach, { DateofService: '2026-01-01', ServiceCategory: 'Legal & Medical Advocacy', InHours: .5 })
  f.service('last-day', outreach, { DateofService: '2026-01-31', ServiceCategory: '', InHours: .75 })
  f.service('after', outreach, { DateofService: '2026-02-01', ServiceCategory: 'Other', InHours: 10 })
  const shelter = f.enrollment('shelter', f.client('shelter'), { Program: 'Faith House', ServiceStartDate: '2025-10-01' })
  f.service('other-program', shelter, { DateofService: '2026-01-15', ServiceCategory: 'Other', InHours: 10 })
  f.service('no-parent', 'missing-enrollment', { DateofService: '2026-01-15', ServiceCategory: 'Other', InHours: 10 })
  const result = await f.run('2026-01-01', '2026-01-31')
  assert.equal(rows(result).length, 0, 'Earlier yearly People Served counts do not remove current-period hours')
  assert.deepEqual(Array.from(rows(result, 'DVSV_Services_CO'), (row) => row.svcs_RecordID), ['first-day', 'last-day'])
  assert.equal(rows(result, 'DES_DV_monthly_02_MCBAHours')[0].MCBA_Hours_Served, 1.25)
})

test('schema/read failures mark affected sections unavailable, not zero; unrelated exits and bed sections still run', async () => {
  const f = fixture(), cp = f.client('a'), pe = f.enrollment('pe', cp, { ServiceEndDate: '2026-09-20' }); f.bed('bed', pe)
  f.snapshot.unavailable.Services = 'Service metadata is unavailable.'
  const result = await f.run()
  assert.match(result.datasets.DES_DV_monthly_02_data.unavailable, /metadata/)
  assert.equal(result.datasets.DES_DV_monthly_02_data.rows, undefined)
  assert.equal(rows(result, 'DES_DV_exits').length, 1)
  assert.equal(rows(result, 'DES_DV_02_bednights').length, 1)
})

test('missing GUID links are not guessed; names alone do not exclude clients and malformed/future dates are excluded', async () => {
  const f = fixture(), a = f.client('a'), testClient = f.client('test', { last_name: 'Test' })
  f.enrollment('badlink', 'CP-a'); f.enrollment('test', testClient); f.enrollment('invalid', a, { ServiceStartDate: '2026-02-31' }); f.enrollment('future', a, { ServiceStartDate: '2027-01-01' })
  const result = await f.run()
  assert.equal(rows(result).length, 1)
  assert.equal(rows(result)[0].Client_RecordID, testClient)
  assert.ok(audit(result).some((row) => /Client Profile link is missing/.test(row.Decision)))
  assert.ok(audit(result).some((row) => /Missing\/invalid enrollment dates/.test(row.Decision)))
})

test('all native dataset field contracts and seven RDL sections render without a SQL engine', async () => {
  const f = fixture(), a = f.client('a'), b = f.client('b'), pe = f.enrollment('shelter', a, { ServiceEndDate: '2026-09-20', SafeLoc: 'Yes' }), outreach = f.enrollment('outreach', b, { Program: 'CAAFA Outreach' })
  f.service('svc', outreach); f.bed('bed', pe)
  const result = await f.run()
  for (const dataset of report.datasets) for (const row of rows(result, dataset.name)) for (const field of dataset.fields.filter((field) => field.source)) assert.ok(Object.keys(row).some((key) => key.toLowerCase() === field.source.toLowerCase()), dataset.name + ': ' + field.source)
  const View = load('LegacyReportView').default
  const html = renderToStaticMarkup(React.createElement(View, { report, result, parameters: { ReportPeriodStart: '2026-09-01', ReportPeriodEnd: '2026-09-30' } }))
  assert.equal((html.match(/legacy-report-section-name/g) || []).length, 7)
  assert.doesNotMatch(html, /needs review|Dataset .* unavailable|expression needs review|No zero totals/i)
  assert.match(html, /DV Outreach/); assert.match(html, /Bed Nights/); assert.match(html, /Exited/)
  for (const item of report.items) {
    const data = rows(result, item.dataset), ctx = { rows: data, scopes: Object.fromEntries(Object.entries(result.datasets).map(([key, dataset]) => [key, dataset.rows || []])), parameters: { ReportPeriodStart: '2026-09-01', ReportPeriodEnd: '2026-09-30' } }
    assert.ok(layout.reportTableAxes(item, data, ctx))
  }
})

test('native runner validates dates before scanning and bypasses SQL asset imports and startup entirely', async () => {
  const f = fixture(), cp = f.client('a'); f.enrollment('pe', cp)
  const calls = []
  const runLoad = loader({ './reportDataverse': { loadReportSnapshot: async (...args) => { calls.push(args); return f.snapshot } }, './reportSqlEngine': { startReportSqlEngine() { throw Error('SQL engine must never be used') } } })
  const runner = runLoad('runLegacyReport').runLegacyReport
  const result = await runner(report, catalog, { ReportPeriodStart: '2026-09-01', ReportPeriodEnd: '2026-09-30' }, {}, new AbortController().signal, () => {})
  assert.equal(rows(result).length, 1); assert.equal(calls.length, 1)
  assert.equal(calls[0][4].Services.from, '2025-10-01'); assert.equal(calls[0][4].Services.toExclusive, '2026-10-01')
  await assert.rejects(runner(report, catalog, { ReportPeriodStart: 'bad', ReportPeriodEnd: '2026-09-30' }, {}, new AbortController().signal, () => {}), /Choose a valid/)
  assert.equal(calls.length, 1)
})

test('large service/stay cohorts use indexed GUID joins, yield progress, and cancel without retaining partial totals', async () => {
  const f = fixture(), cp = f.client('a'), pe = f.enrollment('pe', cp, { Program: 'CAAFA Outreach' }), shelter = f.enrollment('shelter', f.client('b'))
  for (let index = 0; index < 10_000; index++) { f.service('sv-' + index, pe); f.bed('be-' + index, shelter) }
  const progress = [], result = await f.run('2026-09-01', '2026-09-30', {}, '2026-10-14', new AbortController().signal, (text) => progress.push(text))
  assert.equal(rows(result, 'DVSV_Services_CO').length, 10_000)
  assert.equal(rows(result, 'DES_DV_monthly_02_MCBAHours')[0].MCBA_Hours_Served, 2500)
  assert.equal(rows(result, 'DES_DV_02_bednights').reduce((sum, row) => sum + row.Bednights, 0), 20_000)
  assert.ok(progress.length > 20)
  const controller = new AbortController()
  await assert.rejects(f.run('2026-09-01', '2026-09-30', {}, '2026-10-14', controller.signal, () => controller.abort()), { name: 'AbortError' })
})

test('native read scopes retain all fiscal-year service history and clip future dates and overlapping bed stays', () => {
  const scopes = calculator.nativeDesDvReadScopes('2026-09-01', '2026-09-30', '2026-09-15')
  assert.equal(scopes.Services.from, '2025-10-01'); assert.equal(scopes.Services.toExclusive, '2026-09-16')
  assert.equal(scopes.BedEnrollment.from, '2026-09-01'); assert.equal(scopes.BedEnrollment.endField, 'CheckOutDate')
})

function scopedSnapshotHarness({ wrongType = false, remap = false } = {}) {
  const calls = [], cp = 'aaaaaaaa-aaaa-aaaa-aaaa-aaaaaaaaaaaa', pe = 'bbbbbbbb-bbbb-bbbb-bbbb-bbbbbbbbbbbb', svcDate = remap ? 'cmps_legacyservicedate' : 'cmps_dateofservice'
  const schemas = {
    cmps_clientprofiles: { LogicalName: 'cmps_clientprofile', PrimaryIdAttribute: 'cmps_clientprofileid', Attributes: [['cmps_recordid', 'String'], ['cmps_isarchived', 'Picklist']] },
    cmps_programenrollment1s: { LogicalName: 'cmps_programenrollment1', PrimaryIdAttribute: 'cmps_programenrollment1id', Attributes: [['cmps_recordid', 'String'], ['cmps_clientid', 'Lookup'], ['cmps_program', 'Picklist'], ['cmps_isarchived', 'Picklist']] },
    cmps_serviceses: { LogicalName: 'cmps_services', PrimaryIdAttribute: 'cmps_servicesid', Attributes: [['cmps_recordid', 'String'], ['cmps_programenrollment', 'Lookup'], [svcDate, wrongType ? 'String' : 'DateTime'], ['cmps_minutes', 'Integer'], ['cmps_isarchived', 'Picklist']] },
    cmps_bedenrollments: { LogicalName: 'cmps_bedenrollment', PrimaryIdAttribute: 'cmps_bedenrollmentid', Attributes: [['cmps_recordid', 'String'], ['cmps_programenrollment', 'Lookup'], ['cmps_checkindate', 'DateTime'], ['cmps_checkoutdate', 'DateTime'], ['cmps_isarchived', 'Picklist']] },
  }
  schemas.cmps_clientprofiles.Attributes.push(['cmps_excludefromreports', 'Picklist'])
  for (const schema of Object.values(schemas)) schema.Attributes = schema.Attributes.map(([LogicalName, AttributeType]) => ({ LogicalName, AttributeType }))
  const mappings = structuredClone(load('reportMappings').DEFAULT_REPORT_MAPPINGS)
  mappings.Services.fields.DateofService = svcDate
  let servicePage = 0
  const nativeLoad = loader({
    '@microsoft/power-apps/data': { getClient: () => ({ executeAsync: async ({ connectorOperation: op }) => {
      calls.push(op); const p = op.parameters
      assert.ok(['ListRecordsWithOrganization', 'GetNextPageWithOrganization'].includes(op.operationName))
      if (p.entityName === 'EntityDefinitions') return { success: true, data: { value: [schemas[p.$filter.match(/'([^']+)'/)[1]]] } }
      if (p.entityName.includes('LookupAttributeMetadata')) return { success: true, data: { value: [{ LogicalName: p.$filter.includes('cmps_clientid') ? 'cmps_clientid' : 'cmps_programenrollment', Targets: [p.$filter.includes('cmps_clientid') ? 'cmps_clientprofile' : 'cmps_programenrollment1'] }] } }
      if (p.entityName.includes('PicklistAttributeMetadata')) return { success: true, data: { value: [{ LogicalName: 'cmps_program', OptionSet: { Options: [{ Value: 100, Label: { UserLocalizedLabel: { Label: 'DV Outreach' } } }] } }] } }
      if (p.entityName === 'cmps_clientprofiles') return { success: true, data: { value: [{ cmps_clientprofileid: cp, cmps_recordid: 'CP-001', cmps_isarchived: 125570001 }] } }
      if (p.entityName === 'cmps_programenrollment1s') return { success: true, data: { value: [{ cmps_programenrollment1id: pe, cmps_recordid: 'PE-001', _cmps_clientid_value: cp, cmps_program: 100 }] } }
      if (p.entityName === 'cmps_serviceses') { servicePage++; return { success: true, data: { value: [{ cmps_servicesid: servicePage === 1 ? 'cccccccc-cccc-cccc-cccc-cccccccccccc' : 'dddddddd-dddd-dddd-dddd-dddddddddddd', cmps_recordid: 'SV-' + servicePage, _cmps_programenrollment_value: pe, [svcDate]: '2026-09-10T00:00:00Z', cmps_minutes: 15 }], ...(servicePage === 1 ? { next: 'next-page' } : {}) } } }
      return { success: true, data: { value: [{ cmps_bedenrollmentid: 'eeeeeeee-eeee-eeee-eeee-eeeeeeeeeeee', cmps_recordid: 'BE-001', _cmps_programenrollment_value: pe, cmps_checkindate: '2026-08-01T00:00:00Z', cmps_checkoutdate: '2026-09-10T00:00:00Z' }] } }
    } }) },
    '../../../.power/schemas/appschemas/dataSourcesInfo': { dataSourcesInfo: {} }, '../auth': { getAuthToken: () => 'test' },
    '../dataverseRecordPages': { readDataverseRecordPages: async (_org, _table, query, _runtime, request) => { const first = await request(query, ''); return [...first.value, ...(first.next ? (await request({ next: first.next }, '')).value : [])] } },
  }, { window: { location: { hostname: 'powerapps.example' } } })
  return { calls, run: () => nativeLoad('reportDataverse').loadReportSnapshot({ Services: ['RecordID', 'DateofService', 'InHours'], BedEnrollment: ['RecordID', 'CheckInDate', 'CheckOutDate'] }, mappings, new AbortController().signal, () => {}, calculator.nativeDesDvReadScopes('2026-09-01', '2026-09-30', '2026-10-14')) }
}

test('native scoped reads retain archive filters and full paging through existing Dataverse connector operations', async () => {
  const h = scopedSnapshotHarness(), snapshot = await h.run()
  assert.equal(snapshot.tables.Services.length, 2)
  assert.equal(snapshot.tables.Services[0].InHours, .25)
  const svc = h.calls.find((call) => call.parameters.entityName === 'cmps_serviceses' && !call.parameters.next).parameters
  assert.match(svc.$filter, /cmps_isarchived ne 125570000/)
  assert.match(svc.$filter, /cmps_dateofservice ge 2025-10-01T00:00:00Z/)
  assert.match(svc.$filter, /cmps_dateofservice lt 2026-10-01T00:00:00Z/)
  const bed = h.calls.find((call) => call.parameters.entityName === 'cmps_bedenrollments').parameters
  assert.match(bed.$filter, /cmps_checkindate lt 2026-10-01T00:00:00Z/)
  assert.match(bed.$filter, /cmps_checkoutdate eq null or cmps_checkoutdate ge 2026-09-01T00:00:00Z/)
  assert.equal(h.calls.filter((call) => call.operationName === 'GetNextPageWithOrganization').length, 1)
  assert.equal(snapshot.tables.Links.length, 3)
})

test('scoped reads use the verified admin-selected date mapping rather than hardcoded physical columns', async () => {
  const h = scopedSnapshotHarness({ remap: true }), snapshot = await h.run()
  assert.equal(snapshot.tables.Services.length, 2)
  const query = h.calls.find((call) => call.parameters.entityName === 'cmps_serviceses' && !call.parameters.next).parameters
  assert.match(query.$filter, /cmps_legacyservicedate ge/)
  assert.doesNotMatch(query.$filter, /cmps_dateofservice/)
})

test('a scope mapped to a non-date column fails before the affected table scan, without returning guessed zeros', async () => {
  const h = scopedSnapshotHarness({ wrongType: true }), snapshot = await h.run()
  assert.match(snapshot.unavailable.Services, /verified DateTime/)
  assert.equal(snapshot.tables.Services, undefined)
  assert.equal(h.calls.some((call) => call.parameters.entityName === 'cmps_serviceses'), false)
})

test('native configuration, filters and exports remain IT Admin-only, with no new writes/security changes', () => {
  const panel = readFileSync(new URL('./reporting/LegacyReportsPanel.tsx', import.meta.url), 'utf8'), source = readFileSync(new URL('./reporting/nativeDesDvReport.ts', import.meta.url), 'utf8')
  assert.match(panel, /if \(!canView \|\| busy \|\| schemaBusy\) return/)
  assert.match(panel, /Native DES DV Counting Setup/)
  assert.match(panel, /Download Native Report Setup/)
  assert.doesNotMatch(panel, /mcbaCategories|nativeCategoryChoices|Service categories counted toward MCBA hours/)
  assert.match(panel, /MCBA hours include all DV Outreach services/)
  assert.doesNotMatch(source, /new Worker|WebAssembly\.|\bfetch\(|\beval\(|new Function\(|executeAsync|CreateRecord|UpdateRecord/)
})
