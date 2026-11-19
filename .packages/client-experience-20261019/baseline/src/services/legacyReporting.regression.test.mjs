import assert from 'node:assert/strict'
import { readFileSync } from 'node:fs'
import test from 'node:test'
import vm from 'node:vm'
import ts from 'typescript'
import * as duckdb from '@duckdb/duckdb-wasm/blocking'
import { createRequire } from 'node:module'

const require = createRequire(import.meta.url)
const catalog = JSON.parse(readFileSync(new URL('./reporting/legacyReportCatalog.json', import.meta.url), 'utf8'))
function loader(dependencies = {}, globals = {}) {
  const cache = new Map()
  const load = (file) => {
    if (cache.has(file)) return cache.get(file)
    const source = readFileSync(new URL('./reporting/' + file + '.ts', import.meta.url), 'utf8').replaceAll('import.meta.env', '({})')
    const module = { exports: {} }; cache.set(file, module.exports)
    vm.runInNewContext(ts.transpileModule(source, { compilerOptions: { module: ts.ModuleKind.CommonJS, target: ts.ScriptTarget.ES2022 } }).outputText, { module, exports: module.exports, console, Date, Map, Set, Intl, URL, URLSearchParams, AbortController, DOMException, ...globals, require(name) { if (name in dependencies) return dependencies[name]; if (name.startsWith('./')) return load(name.slice(2)); throw Error('Unexpected ' + name) } })
    return module.exports
  }
  return load
}
const load = loader(), expressions = load('rdlExpressions'), layout = load('rdlLayout'), planner = load('reportPlan'), mapping = load('reportMappings')
const context = (rows = []) => ({ rows, row: rows[0], parameters: { ReportPeriodStart: '2026-09-01', ReportPeriodEnd: '2026-09-30' }, scopes: { Data: rows } })

test('catalog contains every supplied report/view, with no credentials, connections, external links or VB code', () => {
  assert.equal(catalog.reports.length, 25); assert.equal(catalog.views.length, 40)
  const source = JSON.stringify(catalog)
  assert.doesNotMatch(source, /ConnectionString|DataSourceReference|Password=|Public Function|Dim counter AS/)
  for (const report of catalog.reports) { assert.ok(report.datasets.length); assert.ok(report.items.length); assert.ok(report.sourceFile.endsWith('.rdl')) }
})
test('every supplied RDL expression parses using the allowlisted interpreter, without eval', () => {
  let count = 0
  function visit(value) { if (typeof value === 'string' && value.startsWith('=')) { expressions.parseRdlExpression(value); count++ } else if (value && typeof value === 'object') Object.values(value).forEach(visit) }
  visit(catalog.reports)
  assert.ok(count > 1500)
  const source = readFileSync(new URL('./reporting/rdlExpressions.ts', import.meta.url), 'utf8')
  assert.doesNotMatch(source, /\beval\(|new Function\(/)
  assert.throws(() => expressions.evaluateRdl('=Process.start("evil")', context()), /Unsupported report function/)
})
test('conditional aggregates, scoped distinct clients, nulls, string concatenation and multiline text match RDL formulas', () => {
  const rows = [{ Client: 'a', Category: 'Yes', Minutes: 15 }, { Client: 'a', Category: 'Yes', Minutes: 30 }, { Client: 'b', Category: 'No', Minutes: null }]
  assert.equal(expressions.evaluateRdl('=CountDistinct(IIF(Fields!Category.Value="Yes",Fields!Client.Value,Nothing))', context(rows)), 1)
  assert.equal(expressions.evaluateRdl('=Sum(Fields!Minutes.Value,"Data")', context(rows)), 45)
  assert.equal(expressions.evaluateRdl('="Count: " & Count(Fields!Client.Value) & vbCrLf & "Minutes: " & Sum(Fields!Minutes.Value)', context(rows)), 'Count: 3\nMinutes: 45')
  assert.equal(expressions.evaluateRdl('=IIF(Nothing Is Nothing,0,1)', context()), 0)
  assert.throws(() => expressions.evaluateRdl('=Sum(Fields!Minutes.Value,"Missing")', context(rows)), /Unknown report aggregate scope/)
})
test('legacy substring, conditions, date intervals and format expressions are preserved', () => {
  assert.equal(expressions.evaluateRdl('=InStr(1,"abc|def","def")', context()), 5)
  assert.equal(expressions.evaluateRdl('=Switch(False,"x",True,Mid("12-Example",4))', context()), 'Example')
  assert.equal(expressions.evaluateRdl('=DateDiff("d",Parameters!ReportPeriodStart.Value,DateAdd("d",1,Parameters!ReportPeriodEnd.Value))', context()), 30)
  assert.equal(expressions.evaluateRdl('=Not IsNothing(Fields!X.Value) AND Fields!X.Value = "a"', context([{ X: 'a' }])), true)
  assert.equal(expressions.evaluateRdl('=FORMAT("2026-09-01","yyyy-MM-dd")', context()), '2026-09-01')
})
test('filters and sort rules operate on full datasets before layout', () => {
  const rows = [{ Code: 'b', Value: 2 }, { Code: 'a', Value: 1 }, { Code: 'c', Value: 3 }]
  const filtered = expressions.applyReportFilters(rows, [{ expression: '=Fields!Value.Value', operator: 'GreaterThan', values: ['=1'] }], context(rows))
  assert.equal(filtered.length, 2)
  assert.equal(expressions.sortReportRows(filtered, [{ expression: '=Fields!Code.Value', direction: 'Descending' }], context(rows))[0].Code, 'c')
})
test('every RDL body aligns with its row/column group hierarchy', () => {
  const leaves = (nodes) => nodes.reduce((count, node) => count + (node.members.length ? leaves(node.members) : 1), 0)
  function visit(items) { for (const table of items.filter((item) => item.kind === 'table')) { assert.equal(leaves(table.rowMembers), table.rows.length); assert.equal(leaves(table.columnMembers), table.rows[0].length); for (const row of table.rows) for (const cell of row) visit(cell.items) } }
  catalog.reports.forEach((report) => visit(report.items))
})
test('row/column matrices intersect records while named parent scopes retain totals', () => {
  const rows = [{ Program: 'A', Category: 'X', Client: 1 }, { Program: 'B', Category: 'X', Client: 2 }, { Program: 'A', Category: 'Y', Client: 3 }]
  const member = (name, field) => ({ name, expressions: ['=Fields!' + field + '.Value'], filters: [], sorts: [], hidden: '', header: [], members: [] })
  const axes = layout.reportTableAxes({ name: 'Matrix', filters: [], sorts: [], rowMembers: [member('CategoryGroup', 'Category')], columnMembers: [member('ProgramGroup', 'Program')] }, rows, context(rows))
  const cell = layout.intersectReportCell(axes.rows[0], axes.columns[0], axes.context)
  assert.equal(expressions.evaluateRdl('=Count(Fields!Client.Value)', cell), 1)
  assert.equal(expressions.evaluateRdl('=Count(Fields!Client.Value,"CategoryGroup")', cell), 2)
  assert.equal(expressions.evaluateRdl('=Count(Fields!Client.Value,"Matrix")', cell), 3)
})
test('missing references are marked unavailable, not replaced with empty fiscal-year zero counts', () => {
  const report = catalog.reports.find((entry) => entry.id !== 'des-dv-monthly-report-exhibit-e-v26-0' && Object.values(planner.planLegacyReport(entry, catalog).datasets).some((dataset) => /reference data is deferred/.test(dataset.unavailable)))
  const plan = planner.planLegacyReport(report, catalog)
  assert.ok(Object.values(plan.datasets).some((dataset) => /reference data is deferred/.test(dataset.unavailable)))
  assert.equal(plan.required.Ref_Dates, undefined)
  const native = planner.planLegacyReport(catalog.reports.find((entry) => entry.title.startsWith('DES DV Monthly')), catalog)
  assert.ok(native.required.BedEnrollment)
  assert.equal(native.datasets.DES_DV_monthly_02_data.unavailable, '')
  assert.equal(native.required.Ref_Dates, undefined)
})
test('unified call SQL reads Helpline once rather than duplicating old PhoneLog/ProgramEnrollment paths', () => {
  const view = catalog.views.find((entry) => entry.name === 'calls')
  assert.ok(view.adaptation)
  assert.equal(view.dependencies.includes('table:PhoneLog'), false)
  assert.equal(view.dependencies.includes('table:ProgramEnrollment'), false)
  assert.equal(view.dependencies.includes('table:Helpline'), true)
  assert.match(view.sql, /COALESCE\(cp.document_id, h.RecordID\)/)
  assert.equal(mapping.legacyLabel('DV Outreach'), 'CAAFA Outreach')
  assert.equal(mapping.legacyLabel('OVW Late-Life'), 'OVW-Late Life')
  assert.equal(mapping.legacyDemographicLabel('Client_Profile', 'gender', 'Unknown/Not Reported'), 'Data not collected')
  assert.equal(mapping.legacyDemographicLabel('Client_Profile', 'race', 'White|Unknown/Not Reported'), 'White|Data not collected')
  assert.equal(mapping.legacyDemographicLabel('ProgramEnrollment', 'ClientType', 'Unknown/Not Reported'), 'Unknown/Not Reported')
})
test('report mapping uses GUID joins, new backend choices and minute-derived hours', () => {
  assert.equal(mapping.DEFAULT_REPORT_MAPPINGS.ProgramEnrollment.fields.RecordID, '$id')
  assert.equal(mapping.DEFAULT_REPORT_MAPPINGS.ProgramEnrollment.clientLookup, 'cmps_clientid')
  assert.equal(mapping.DEFAULT_REPORT_MAPPINGS.Services.fields.InHours, '$hours')
  assert.equal(mapping.DEFAULT_REPORT_MAPPINGS.VOCAForm.fields.VOCAVictimizationType, 'cmps_vocavictimizationtype1')
})

test('collapsed details can be expanded without exposing permanently hidden members', () => {
  const rows = [{ Client: 'a' }], member = { name: 'Detail', expressions: [], filters: [], sorts: [], hidden: 'true', toggle: 'ClientHeader', header: [], members: [] }
  assert.equal(layout.expandReportAxis([member], rows, context(rows)).length, 0)
  assert.equal(layout.expandReportAxis([member], rows, { ...context(rows), globals: { ExpandDetails: true } }).length, 1)
  assert.equal(layout.expandReportAxis([{ ...member, toggle: '' }], rows, { ...context(rows), globals: { ExpandDetails: true } }).length, 0)
})
test('group filters evaluate aggregates over the whole group, not its first record', () => {
  const rows = [{ Category: 'A' }, { Category: 'A' }], member = { name: 'Category', expressions: ['=Fields!Category.Value'], filters: [{ expression: '=Count(Fields!Category.Value)', operator: 'GreaterThan', values: ['=1'] }], sorts: [], hidden: '', header: [], members: [] }
  assert.equal(layout.expandReportAxis([member], rows, context(rows)).length, 1)
  assert.equal(expressions.evaluateRdl('=Round(2.5)', context()), 2)
  assert.equal(expressions.evaluateRdl('=Round(3.5)', context()), 4)
})

function snapshotHarness({ missing = false, duplicate = false, wrongTarget = false, noLabel = false, newFunder = false } = {}) {
  const calls = [], cp = 'aaaaaaaa-aaaa-aaaa-aaaa-aaaaaaaaaaaa', pe = 'bbbbbbbb-bbbb-bbbb-bbbb-bbbbbbbbbbbb', funder = 'dddddddd-dddd-dddd-dddd-dddddddddddd'
  const schemas = {
    cmps_clientprofiles: { LogicalName: 'cmps_clientprofile', PrimaryIdAttribute: 'cmps_clientprofileid', Attributes: [['cmps_recordid', 'String'], ['cmps_name', 'String'], ['cmps_isarchived', 'Picklist']] },
    cmps_programenrollment1s: { LogicalName: 'cmps_programenrollment1', PrimaryIdAttribute: 'cmps_programenrollment1id', Attributes: [['cmps_recordid', 'String'], ['cmps_clientid', 'Lookup'], ['cmps_program', 'Picklist'], ['cmps_funder1', 'Lookup'], ['cmps_funder', 'Picklist'], ['cmps_isarchived', 'Picklist']] },
  }
  schemas.cmps_clientprofiles.Attributes.push(['cmps_excludefromreports', 'Picklist'])
  for (const schema of Object.values(schemas)) schema.Attributes = schema.Attributes.filter(([name]) => !(missing && name === 'cmps_program')).map(([LogicalName, AttributeType]) => ({ LogicalName, AttributeType }))
  const api = loader({
    '@microsoft/power-apps/data': { getClient: () => ({ executeAsync: async ({ connectorOperation: op }) => {
      calls.push(op); assert.ok(['ListRecordsWithOrganization', 'GetNextPageWithOrganization'].includes(op.operationName)); assert.equal(op.parameters.item, undefined)
      const p = op.parameters
      if (p.entityName === 'EntityDefinitions') { assert.equal(p.$top, undefined); assert.doesNotMatch(p.prefer, /maxpagesize/); return { success: true, data: { value: [schemas[p.$filter.match(/'([^']+)'/)[1]]] } } }
      if (p.entityName.includes('LookupAttributeMetadata')) return { success: true, data: { value: [{ LogicalName: 'cmps_clientid', Targets: [wrongTarget ? 'wrong' : 'cmps_clientprofile'] }] } }
      if (p.entityName.includes('PicklistAttributeMetadata')) return { success: true, data: { value: [{ LogicalName: 'cmps_program', OptionSet: { Options: [{ Value: 100, Label: { UserLocalizedLabel: { Label: 'DV Outreach' } } }] } }, { LogicalName: 'cmps_funder', OptionSet: { Options: [{ Value: 200, Label: { UserLocalizedLabel: { Label: 'VOCA' } } }] } }] } }
      if (p.entityName === 'cmps_clientprofiles') return { success: true, data: { value: [{ cmps_clientprofileid: cp, cmps_recordid: 'CP-001', cmps_isarchived: 125570001 }] } }
      const row = { cmps_programenrollment1id: pe, cmps_recordid: 'PE-001', _cmps_clientid_value: cp, cmps_program: 100, cmps_funder: 200, ...(newFunder ? { _cmps_funder1_value: funder, ...(!noLabel ? { 'cmps_funder1@OData.Community.Display.V1.FormattedValue': 'OVW Late-Life' } : {}) } : {}) }
      return { success: true, data: { value: duplicate ? [row, row] : [row] } }
    } }) },
    '../../../.power/schemas/appschemas/dataSourcesInfo': { dataSourcesInfo: {} }, '../auth': { getAuthToken: () => 'test' },
    '../dataverseRecordPages': { readDataverseRecordPages: async (_org, _table, query, _runtime, request) => (await request(query, '')).value },
  }, { window: { location: { hostname: 'powerapps.example' } } })('reportDataverse')
  return { calls, run: () => api.loadReportSnapshot({ ProgramEnrollment: ['RecordID', 'Program', 'Funder'] }, mapping.DEFAULT_REPORT_MAPPINGS, new AbortController().signal, () => {}) }
}
test('metadata-verified legacy funder fallback retains imported records with empty new lookup', async () => {
  const h = snapshotHarness(), snapshot = await h.run()
  assert.equal(snapshot.tables.ProgramEnrollment[0].Funder, 'VOCA')
  assert.equal(snapshot.tables.ProgramEnrollment[0].Program, 'CAAFA Outreach')
  assert.equal(snapshot.tables.documents[0].RecordId, 'bbbbbbbb-bbbb-bbbb-bbbb-bbbbbbbbbbbb')
  assert.equal(snapshot.displayIds['bbbbbbbb-bbbb-bbbb-bbbb-bbbbbbbbbbbb'], 'PE-001')
  assert.match(snapshot.warnings[0], /legacy funder choices used/)
  assert.match(h.calls.find((call) => call.parameters.entityName === 'cmps_programenrollment1s').parameters.$filter, /cmps_isarchived ne 125570000/)
})
test('new funder lookup takes precedence and its GUID is never treated as the funder label', async () => {
  const snapshot = await snapshotHarness({ newFunder: true }).run()
  assert.equal(snapshot.tables.ProgramEnrollment[0].Funder, 'OVW-Late Life')
  assert.equal(snapshot.warnings.length, 0)
  assert.match((await snapshotHarness({ newFunder: true, noLabel: true }).run()).unavailable.ProgramEnrollment, /no display label/)
})
for (const [options, match] of [[{ missing: true }, /not in current metadata/], [{ duplicate: true }, /invalid or repeated row/], [{ wrongTarget: true }, /does not target/]]) test(`snapshot marks affected sections unavailable for ${Object.keys(options)[0]}`, async () => {
  const snapshot = await snapshotHarness(options).run()
  assert.match(snapshot.unavailable.ProgramEnrollment, match)
  assert.equal(snapshot.tables.ProgramEnrollment, undefined)
})

test('shipped browser MVP engine binds all views/datasets, ingests dates and executes representative report cohorts', async () => {
  const db = await duckdb.createDuckDB({ mvp: { mainModule: require.resolve('@duckdb/duckdb-wasm/dist/duckdb-mvp.wasm') } }, new duckdb.VoidLogger(), duckdb.NODE_RUNTIME)
  await db.instantiate()
  const conn = db.connect(), quote = (value) => '"' + value.replaceAll('"', '""') + '"'
  try {
    conn.query("SET default_collation='nocase'; CREATE MACRO report_asof() AS DATE '2026-10-13'; CREATE MACRO report_int(x) AS CAST(TRUNC(TRY_CAST(x AS DOUBLE)) AS INTEGER)")
    for (const [name, columns] of Object.entries(catalog.tables)) conn.query(`CREATE TABLE ${quote('base_' + name)} (${Object.entries(columns).map(([field, type]) => quote(field) + ' ' + type).join(',')})`)
    const pending = [...catalog.views], created = new Set()
    while (pending.length) { const index = pending.findIndex((view) => view.dependencies.every((dependency) => dependency.startsWith('table:') || created.has(dependency))); assert.ok(index >= 0); const view = pending.splice(index, 1)[0]; conn.query(`CREATE VIEW ${quote('view_' + view.name)} AS ${view.sql}`); created.add(view.name) }
    const parameters = { ReportPeriodStart: '2026-09-01', ReportPeriodEnd: '2026-09-30', Quarter: 'Q4', Fiscal_Year: 2026, fiscal_year: 2026, Program_Name: 'DVSTOP' }
    let datasets = 0
    for (const report of catalog.reports) for (const dataset of report.datasets) { const bound = dataset.sql.replace(/\$([A-Za-z_]\w*)/g, (_all, name) => typeof parameters[name] === 'number' ? String(parameters[name]) : "'" + parameters[name] + "'"); conn.query(bound); datasets++ }
    assert.equal(created.size, 40); assert.equal(datasets, 86)
    conn.query("INSERT INTO base_Client_Profile (document_id,first_name,last_name,dob) VALUES ('cp','Example','Client',DATE '1990-01-01'); INSERT INTO base_documents VALUES ('cp','pe'); INSERT INTO base_ProgramEnrollment (RecordID,Program,ProjectType,ClientType,ProgramType,ServiceStartDate,Funder) VALUES ('pe','CAAFA Shelter','Emergency Shelter','Adult','Residential',DATE '2026-09-01','VOCA'); INSERT INTO base_Links VALUES ('pe','sv'); INSERT INTO base_Services (RecordID,ProgramEnrollment,DateofService,ServiceCategory,Service,InHours,Minutes) VALUES ('sv','CAAFA Shelter | PE-001',DATE '2026-09-05','Intake & Discharge','Intake',0.25,15)")
    const services = conn.query('SELECT to_json(t) AS j FROM view_services t').toArray().map((row) => JSON.parse(row.j))
    assert.equal(services.length, 1); assert.equal(services[0].Client_ProfileID, 'cp'); assert.equal(services[0].Hrs, 0.25); assert.equal(services[0].DateOfService, '2026-09-05')
    conn.query("INSERT INTO base_Helpline (RecordID,Program,DateOfContact,AbuseStatus) VALUES ('call-1','SV Helpline',DATE '2026-09-05','Primary Victim'),('call-2','CAAFA Outreach',DATE '2026-09-06','Other'); INSERT INTO base_documents VALUES ('cp','call-1')")
    const calls = conn.query('SELECT * FROM view_calls').toArray()
    assert.equal(calls.length, 2); assert.equal(calls.find((row) => row.call_record_id === 'call-2').Client_ProfileID, 'call-2')
    assert.equal(conn.query('SELECT COUNT(*) AS n FROM view_des_sv_02_helplinecalls').toArray()[0].n, 1n)
    db.registerFileText('report_test.json', '[{"RecordID":"event","Minutes":15}]')
    conn.query("CREATE TABLE test_ingest AS SELECT * FROM read_json('report_test.json',columns={RecordID:'VARCHAR',Minutes:'DOUBLE'},format='array')")
    db.dropFile('report_test.json'); conn.query('SET enable_external_access=false')
    assert.equal(JSON.parse(conn.query('SELECT to_json(t) AS j FROM test_ingest t').toArray()[0].j).Minutes, 15)
  } finally { conn.close(); db.reset() }
})
test('reports stay Sandbox-wired and IT Admin-only outside View as User; exports/cancel/limitations are visible', () => {
  const app = readFileSync(new URL('../App.tsx', import.meta.url), 'utf8'), panel = readFileSync(new URL('./reporting/LegacyReportsPanel.tsx', import.meta.url), 'utf8')
  assert.match(app, /<LegacyReportsPanel canManage=\{canAccessRoleAdmin && !isUserPreview\}/)
  assert.match(panel, /if \(!canManage \|\| busy \|\| schemaBusy\) return/)
  assert.match(panel, /Download Full Dataset/)
  assert.match(panel, /No.*zero|not.*zero/i)
  assert.match(panel, /request\.current\?\.abort\(\)/)
})
