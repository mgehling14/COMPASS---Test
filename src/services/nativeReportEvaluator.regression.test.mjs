import assert from 'node:assert/strict'
import { readFileSync } from 'node:fs'
import { createHash } from 'node:crypto'
import { createRequire } from 'node:module'
import vm from 'node:vm'
import test from 'node:test'
import ts from 'typescript'
import * as duckdb from '@duckdb/duckdb-wasm/blocking'
import React from 'react'
import { renderToStaticMarkup } from 'react-dom/server'
const jsxRuntime = await import('react/jsx-runtime')

const require = createRequire(import.meta.url)
const source = readFileSync(new URL('./reporting/legacyReportCatalog.json', import.meta.url), 'utf8'), catalog = JSON.parse(source)
const compiled = JSON.parse(readFileSync(new URL('./reporting/nativeReportQueries.json', import.meta.url), 'utf8'))
function load(file) {
  let source
  try { source = readFileSync(new URL('./reporting/' + file + '.ts', import.meta.url), 'utf8') } catch { source = readFileSync(new URL('./reporting/' + file + '.tsx', import.meta.url), 'utf8') }
  const module = { exports: {} }
  vm.runInNewContext(ts.transpileModule(source, { compilerOptions: { target: ts.ScriptTarget.ES2022, module: ts.ModuleKind.CommonJS, jsx: ts.JsxEmit.ReactJSX } }).outputText, { module, exports: module.exports, console, Date, Map, Set, WeakMap, Intl, AbortController, setTimeout, require(name) { if (name === 'react') return React; if (name === 'react/jsx-runtime') return jsxRuntime; if (name.startsWith('./')) return load(name.slice(2)); throw Error(name) } })
  return module.exports
}
const { NativeReportEvaluator } = load('nativeReportEvaluator')
const parameters = { ReportPeriodStart: '2026-09-01', ReportPeriodEnd: '2026-09-30', Fiscal_Year: 2026, fiscal_year: 2026, Quarter: 'Q4', Program_Name: 'DVSTOP' }
function fixture() {
  const tables = Object.fromEntries(Object.keys(catalog.tables).map((name) => [name, []]))
  const programs = ['CAAFA Shelter', 'DVSTOP', 'Faith House', 'Autumn House', 'CAAFA Outreach', 'REACH Center', 'SVSASS', 'DVHEART']
  for (let i = 0; i < 16; i++) {
    const cp = 'cp-' + i, pe = 'pe-' + i, sv = 'sv-' + i, day = '2026-09-' + String(i + 1).padStart(2, '0'), program = programs[i % 8]
    tables.Client_Profile.push({ document_id: cp, first_name: 'Example ' + i, last_name: 'Client', dob: i === 15 ? null : i % 3 === 0 ? '2016-01-01' : '1990-05-10', race: i % 2 ? 'White' : 'Black or African American', ethnicity: 'Not Hispanic/Latino', gender: i % 2 ? 'Female' : 'Male', multi_race_ind: 'No', mil_veteran: 'No', disability: 'No', prev_addr_city: 'Phoenix', prev_addr_state: 'AZ', prev_addr_zip: '85001' })
    tables.ProgramEnrollment.push({ RecordID: pe, Program: program, ServiceStartDate: day, ServiceEndDate: i % 2 ? '2026-09-25' : null, ProjectType: i === 3 ? 'Transitional Housing' : 'Emergency Shelter', ProgramType: 'Residential', ClientType: i % 3 === 0 ? 'Child' : 'Adult', TANFEligible: i % 2 ? 'Yes' : 'No', EnrollmentStatus: 'Enrolled', DischargeStatus: 'Discharged', ExitDestination: 'Rental by client', SafeLoc: i % 2 ? 'Yes' : 'No', ReasonTurnedAway: 'Not Turned Away', AbuseStatus: 'Primary Victim', VictimType: 'Domestic Violence', ClientSpecialClassification: 'None of the Above', HouseholdReportedIncomeLevel: 'Below Poverty Level', Funder: i % 2 ? 'VOCA' : 'DES DV', ServiceSite: program, VictimCompensation: 'Yes', RelationshiptoAbuser: 'Spouse', PetsToShelter: 'Yes', NumPets: 1, OVWClientServedStatus: 'New Client' })
    tables.documents.push({ RecordId: pe, ParentId: cp })
    tables.Services.push({ RecordID: sv, ProgramEnrollment: program + ' | PE-001', DateofService: day, ServiceCategory: i % 2 ? 'Victim Advocacy' : 'Intake & Discharge', Service: i % 2 ? 'Safety Planning' : 'Intake', Minutes: 15, InHours: .25, Funder: 'VOCA', ServiceCost: 1.25, ServiceSite: program, DirectServiceCategories: 'Emotional Support or Safety Services', EmotionalSupportorSafetyServices: 'Crisis intervention', InformationandReferral: 'Information about victim rights', CriminalCivilJusticeAssistance: 'Legal assistance', Wheredidyourefer: 'Other', ShelterHousingServices: 'Transitional housing', PersonalAdvocacyAccompaniment: 'Individual advocacy' })
    tables.Links.push({ LinkFromId: sv, LinkToId: pe })
    tables.BedEnrollment.push({ RecordID: 'bed-' + i, ProgramEnrollment: program + ' | PE-001', CheckInDate: '2026-08-30', CheckOutDate: i % 2 ? '2026-09-03' : null })
    tables.Links.push({ LinkFromId: 'bed-' + i, LinkToId: pe })
    tables.Helpline.push({ RecordID: 'call-' + i, Program: i % 2 ? 'SV Helpline' : program, DateOfContact: day, AbuseStatus: 'Primary Victim', CompleteOVWLateLifeAbuseScreening: 'Yes', CallerOver50YrsOld: 'Yes', AbuserIsSpousePartnerOrCloseRelative: 'Yes', HasCallerExperiencedRecentDVorSVorElderAbuse: 'Yes', HelplineTurnawayReason: 'No Space', CallerTurnaway: 'Yes' })
    if (i < 15) tables.documents.push({ RecordId: 'call-' + i, ParentId: cp })
    for (const [name, datefield] of [['AdultAssessment', 'AssessmentDate'], ['ChildAssessment', 'AssessmentDate'], ['AdultSafetyPlan', 'CompletionDate'], ['ChildSafetyPlan', 'PlanCompletionDate'], ['ShelterScreening', 'ScreenDate'], ['VOCAForm', 'CreationDate']]) {
      const id = name + '-' + i
      tables[name].push({ RecordID: id, [datefield]: day, ProgramScreening: program, PlacedInShelter: 'Yes', ShelterTurnawayReason: 'No Space', VOCAAgeatTimeofVictimization: '25-59', VOCARaceEthnicity: 'White', VOCAVictimizationType: 'Domestic and/or Family Violence' })
      tables.documents.push({ RecordId: id, ParentId: cp }); tables.Links.push({ LinkFromId: id, LinkToId: pe })
    }
    tables.Event.push({ RecordID: 'event-' + i, Program: program, EventDate: day, EventTitle: 'Training', EventCategory: 'Outreach', EventType: 'Presentation', EventLocation: 'School', AudienceType: 'Community', Hours: 1.25, Funder: 'VOCA', TotalAttendance: 10, TotalAdultAttendance: 8, TotalYouthAttendance: 2, TotalFemaleAttendance: 6, TotalMaleAttendance: 4, NumberOfMaterialsDistributed: 10 })
  }
  // Reference data is test-only to exercise the deferred calculations; the app
  // never fabricates or supplies these rows in production.
  for (let month = 1; month <= 12; month++) {
    const start = '2026-' + String(month).padStart(2, '0') + '-01', end = new Date(Date.UTC(2026, month, 0)).toISOString().slice(0, 10)
    tables.Ref_Dates.push({ Fiscal_Year: 2026, Quarter: 'Q' + Math.ceil(month / 3), ANL_MStart: start, ANL_MEnd: end, State_MStart: start, State_MEnd: end })
  }
  for (const Program of programs) tables.Ref_ShelterCapacity.push({ Fiscal_Year: 2026, Program, MaxUnitCapacity: 10, BudgetAmt: 10000, EffectiveStart: '2026-01-01', EffectiveEnd: '2026-12-31' })
  return tables
}
const tables = fixture(), db = await duckdb.createDuckDB({ mvp: { mainModule: require.resolve('@duckdb/duckdb-wasm/dist/duckdb-mvp.wasm') } }, new duckdb.VoidLogger(), duckdb.NODE_RUNTIME)
await db.instantiate()
const conn = db.connect(), quote = (v) => '"' + v.replaceAll('"', '""') + '"', literal = (v) => v == null ? 'NULL' : typeof v === 'number' ? String(v) : "'" + String(v).replaceAll("'", "''") + "'"
conn.query("SET default_collation='nocase'; CREATE MACRO report_asof() AS DATE '2026-10-14'")
for (const [name, columns] of Object.entries(catalog.tables)) {
  conn.query(`CREATE TABLE ${quote('base_' + name)} (${Object.entries(columns).map(([field, type]) => quote(field) + ' ' + type).join(',')})`)
  for (const row of tables[name]) conn.query(`INSERT INTO ${quote('base_' + name)} VALUES (${Object.keys(columns).map((field) => literal(row[field])).join(',')})`)
}
const pending = [...catalog.views], created = new Set()
while (pending.length) { const index = pending.findIndex((view) => view.dependencies.every((dependency) => dependency.startsWith('table:') || created.has(dependency))); assert.ok(index >= 0); const view = pending.splice(index, 1)[0]; conn.query(`CREATE VIEW ${quote('view_' + view.name)} AS ${view.sql}`); created.add(view.name) }
const queries = [...catalog.views.map((view) => ({ key: 'view:' + view.name, sql: view.sql })), ...catalog.reports.flatMap((report) => report.datasets.map((dataset) => ({ key: report.id + ':' + dataset.name, sql: dataset.sql, fields: dataset.fields })))]
const normalize = (rows) => rows.map((row) => JSON.stringify(Object.fromEntries(Object.entries(row).map(([k, v]) => [k.toLowerCase(), typeof v === 'string' && /^\d{4}-\d\d-\d\d[ T]/.test(v) ? v.slice(0, 10) : typeof v === 'number' ? Math.round(v * 1e6) / 1e6 : v]).sort(([a], [b]) => a.localeCompare(b))))).sort()
const evaluator = new NativeReportEvaluator(catalog, compiled.queries, tables, parameters, '2026-10-14', new AbortController().signal)
for (const entry of queries) test('native plan matches SQL fixture: ' + entry.key, async () => {
  const sql = entry.sql.replace(/\$([A-Za-z_]\w*)/g, (_all, name) => literal(parameters[name]))
  const expected = conn.query(`SELECT to_json(t) AS j FROM (${sql}) t`).toArray().map((row) => JSON.parse(row.j))
  const actual = await evaluator.query(compiled.queries[entry.key])
  const actualNormalized = normalize(actual.rows), expectedNormalized = normalize(expected)
  if (JSON.stringify(actualNormalized) !== JSON.stringify(expectedNormalized)) {
    const different = actualNormalized.find((row) => !expectedNormalized.includes(row)), missing = expectedNormalized.find((row) => !actualNormalized.includes(row))
    assert.fail(`Rows actual=${actualNormalized.length} expected=${expectedNormalized.length}; unexpected=${different}; missing=${missing}`)
  }
  for (const field of entry.fields || []) if (field.source && !actual.columns.some((column) => column.toLowerCase() === field.source.toLowerCase())) {
    // Two original RDL files request Unmet_Shelter from a SQL query that does
    // not produce it. Preserve the runtime unavailable error, never invent it.
    assert.equal(field.source, 'Unmet_Shelter')
    assert.ok(['des-dv-client-dq-exhibit-f-v25-0:DES_DV_quarterly_02_data', 'des-dv-quarterly-report-exhibit-f-v26-3:DES_DV_quarterly_02_data'].includes(entry.key))
    assert.equal(conn.query('DESCRIBE ' + sql).toArray().some((row) => row.column_name === field.source), false)
  }
})
test('all 126 static plans match the source catalog hash and contain no executable source', () => {
  assert.equal(compiled.sourceSha256, createHash('sha256').update(source).digest('hex'))
  assert.equal(Object.keys(compiled.queries).length, 126)
  const runtimeSource = readFileSync(new URL('./reporting/runLegacyReport.ts', import.meta.url), 'utf8') + readFileSync(new URL('./reporting/nativeReportEvaluator.ts', import.meta.url), 'utf8')
  assert.doesNotMatch(runtimeSource, /\beval\(|new Function\(|new Worker\(|import\(.+reportSqlEngine/)
})
test('cancellation interrupts native joins and unknown plans fail rather than return zero', async () => {
  const controller = new AbortController(), ev = new NativeReportEvaluator(catalog, compiled.queries, tables, parameters, '2026-10-14', controller.signal)
  controller.abort(); await assert.rejects(ev.query(compiled.queries['view:services']), { name: 'AbortError' })
  await assert.rejects(evaluator.query({ k: 'Evil', a: {} }), /Unsupported report query/)
})
test('large parenthesized joins are indexed and cooperate with cancellation', async () => {
  const large = { ...tables, Client_Profile: [], documents: [], ProgramEnrollment: [], Links: [], Services: [] }
  for (let i = 0; i < 10000; i++) {
    large.Client_Profile.push({ ...tables.Client_Profile[1], document_id: 'cp' + i })
    large.ProgramEnrollment.push({ ...tables.ProgramEnrollment[1], RecordID: 'pe' + i })
    large.documents.push({ ParentId: 'cp' + i, RecordId: 'pe' + i })
    large.Services.push({ ...tables.Services[1], RecordID: 'sv' + i, InHours: 1 / 60 })
    large.Links.push({ LinkToId: 'pe' + i, LinkFromId: 'sv' + i })
  }
  const ev = new NativeReportEvaluator(catalog, compiled.queries, large, parameters, '2026-10-14', new AbortController().signal), start = Date.now()
  const result = await ev.query(compiled.queries['view:services'])
  assert.equal(result.rows.length, 10000); assert.equal(result.rows[0].Hrs, .02)
  assert.ok(Date.now() - start < 20000, 'Indexed 10,000-record joins should not devolve into a Cartesian scan')
  const controller = new AbortController(), cancellable = new NativeReportEvaluator(catalog, compiled.queries, large, parameters, '2026-10-14', controller.signal)
  const pending = cancellable.query(compiled.queries['view:services']); setTimeout(() => controller.abort(), 0)
  await assert.rejects(pending, { name: 'AbortError' })
})
test('static plans no longer exclude an eligible client named Test', async () => {
  const named = structuredClone(tables); named.Client_Profile[1].last_name = 'Test'
  const ev = new NativeReportEvaluator(catalog, compiled.queries, named, parameters, '2026-10-14', new AbortController().signal)
  assert.ok((await ev.query(compiled.queries['view:services'])).rows.some((row) => row.client_name === 'Example 1 Test'))
  assert.ok((await ev.query(compiled.queries['view:calls'])).rows.some((row) => row.Last_Name === 'Test'))
})
const View = load('LegacyReportView').default, expressions = load('rdlExpressions')
for (const report of catalog.reports) test('native result statically renders supplied layout: ' + report.id, async () => {
  const result = { datasets: {}, warnings: [], displayIds: {}, generatedAt: '2026-10-14T12:00:00Z' }
  const context = { parameters, rows: [], scopes: {}, globals: { ExecutionTime: result.generatedAt } }
  for (const dataset of report.datasets) {
    const { rows: sourceRows, columns } = await evaluator.query(compiled.queries[report.id + ':' + dataset.name])
    const missing = dataset.fields.find((field) => field.source && !columns.some((column) => column.toLowerCase() === field.source.toLowerCase()))
    if (missing) { result.datasets[dataset.name] = { unavailable: 'Original RDL requests ' + missing.source + ' but source SQL does not return it.' }; continue }
    const rows = sourceRows.map((sourceRow, index) => {
      const row = { ...sourceRow, __reportRowId: index + 1 }
      for (const field of dataset.fields.filter((field) => field.source)) row[field.name] = expressions.rowValue(row, field.source)
      return row
    })
    context.scopes[dataset.name] = rows
    for (const row of rows) for (const field of dataset.fields.filter((field) => field.expression)) row[field.name] = expressions.evaluateRdl(field.expression, { ...context, row, rows })
    result.datasets[dataset.name] = { rows: expressions.applyReportFilters(rows, dataset.filters, { ...context, rows }), columns }
  }
  const html = renderToStaticMarkup(React.createElement(View, { report, parameters, result, expandDetails: true }))
  if (report.id === 'des-dv-client-dq-exhibit-f-v25-0') assert.match(html, /Original RDL requests Unmet_Shelter/)
  else assert.match(html, /legacy-report-section/)
  assert.doesNotMatch(html, /expression needs review|report layout needs review|layout\/calculation needs review/i)
  assert.ok(html.length > 100)
})
test.after(() => { conn.close(); db.reset() })
