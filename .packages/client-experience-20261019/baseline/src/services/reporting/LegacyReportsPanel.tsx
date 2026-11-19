import { useEffect, useMemo, useRef, useState } from 'react'
import catalogData from './legacyReportCatalog.json'
import { DEFAULT_REPORT_MAPPINGS, legacyLabel, type ReportMappings } from './reportMappings'
import { readReportSchema, type ReportSchema } from './reportDataverse'
import { planLegacyReport } from './reportPlan'
import { runLegacyReport } from './runLegacyReport'
import LegacyReportView from './LegacyReportView'
import { reportCsv } from '../desDvReport'
import { DEFAULT_NATIVE_DES_DV_OPTIONS, isNativeDesDvReport, prepareNativeDesDvReport, type NativeDesDvOptions } from './nativeDesDvPlan'
import type { LegacyReportResult, ReportCatalog } from './reportTypes'
import './LegacyReports.css'

const catalog = catalogData as unknown as ReportCatalog
function defaults(): Record<string, unknown> {
  const now = new Date(), first = new Date(now.getFullYear(), now.getMonth() - 1, 1), last = new Date(now.getFullYear(), now.getMonth(), 0)
  const day = (value: Date) => `${value.getFullYear()}-${String(value.getMonth() + 1).padStart(2, '0')}-${String(value.getDate()).padStart(2, '0')}`
  return { ReportPeriodStart: day(first), ReportPeriodEnd: day(last), Fiscal_Year: now.getFullYear(), fiscal_year: now.getFullYear(), Quarter: 'Q1', Program_Name: 'DVSTOP' }
}
function download(content: string, name: string, type = 'text/csv;charset=utf-8') { const url = URL.createObjectURL(new Blob([content], { type })), link = document.createElement('a'); link.href = url; link.download = name; link.click(); setTimeout(() => URL.revokeObjectURL(url), 1000) }
export default function LegacyReportsPanel({ canManage }: { canManage: boolean }) {
  const [selected, setSelected] = useState(catalog.reports[0].id), [find, setFind] = useState('')
  const [parameters, setParameters] = useState<Record<string, unknown>>(defaults), [mappings, setMappings] = useState<ReportMappings>(() => structuredClone(DEFAULT_REPORT_MAPPINGS))
  const [result, setResult] = useState<LegacyReportResult | null>(null), [busy, setBusy] = useState(false), [progress, setProgress] = useState(''), [error, setError] = useState('')
  const [mappingTable, setMappingTable] = useState('ProgramEnrollment'), [schema, setSchema] = useState<ReportSchema | null>(null), [schemaBusy, setSchemaBusy] = useState(false)
  const [expandDetails, setExpandDetails] = useState(false)
  const [nativeOptions, setNativeOptions] = useState<NativeDesDvOptions>(() => structuredClone(DEFAULT_NATIVE_DES_DV_OPTIONS))
  const request = useRef<AbortController | null>(null), schemaRequest = useRef<AbortController | null>(null)
  const report = useMemo(() => prepareNativeDesDvReport(catalog.reports.find((entry) => entry.id === selected)!), [selected]), plan = useMemo(() => planLegacyReport(report, catalog), [report])
  const native = isNativeDesDvReport(report)
  const choices = catalog.reports.filter((entry) => entry.title.toLowerCase().includes(find.trim().toLowerCase()))
  useEffect(() => () => { request.current?.abort(); schemaRequest.current?.abort() }, [])
  useEffect(() => { if (!canManage) { request.current?.abort(); schemaRequest.current?.abort(); setResult(null) } }, [canManage])
  function clear() { setResult(null); setError(''); setProgress('') }
  function changeField(field: string, value: string) { setMappings((current) => ({ ...current, [mappingTable]: { ...current[mappingTable], fields: { ...current[mappingTable].fields, [field]: value } } })); clear() }
  async function inspectSchema() {
    if (!canManage || schemaBusy || busy) return
    const controller = new AbortController(); schemaRequest.current = controller; setSchemaBusy(true); setSchema(null); setError('')
    try { const current = await readReportSchema(mappings[mappingTable].alias, controller.signal); controller.signal.throwIfAborted(); setSchema(current) } catch (failure) { if (!controller.signal.aborted) setError(String((failure as Error)?.message || failure)) } finally { if (schemaRequest.current === controller) { schemaRequest.current = null; setSchemaBusy(false) } }
  }
  async function run() {
    if (!canManage || busy || schemaBusy) return
    if (parameters.ReportPeriodStart && parameters.ReportPeriodEnd && String(parameters.ReportPeriodStart) > String(parameters.ReportPeriodEnd)) { setError('Report end must be on or after start.'); return }
    for (const field of report.parameters) if (parameters[field.name] === '' || parameters[field.name] === undefined) { setError(`${field.prompt} is required.`); return }
    const controller = new AbortController(); request.current = controller; setBusy(true); setError(''); setResult(null)
    try {
      const current = await runLegacyReport(report, catalog, parameters, mappings, controller.signal, setProgress, nativeOptions)
      controller.signal.throwIfAborted(); setResult(current)
      const ready = report.datasets.filter((dataset) => current.datasets[dataset.name] && !current.datasets[dataset.name].unavailable).length
      setProgress(`Finished: ${ready} available dataset(s), ${report.datasets.length - ready} unavailable. Review limitations before using the report.`)
    } catch (failure) { if (controller.signal.aborted) setProgress('Cancelled; no partial report retained.'); else setError(String((failure as Error)?.message || failure)) } finally { if (request.current === controller) { request.current = null; setBusy(false) } }
  }
  if (!canManage) return <article className="panel hub-card"><h3>Report Library</h3><p className="hint">IT Admin-only during validation; unavailable in View as User.</p></article>
  return <article className="panel hub-card legacy-reports">
    <h3>Legacy Report Library</h3><p className="hint">All {catalog.reports.length} supplied RDL layouts now use native app calculations. No report worker or WebAssembly downloads are required. Validation preview only: compare against legacy totals before official use. Reports never save or change source records.</p>
    <p className="hint">Archived records are excluded. Client Profiles marked cmps_excludefromreports = Yes (125570000), and records linked directly or through their Program Enrollments, are excluded. No or blank is included unless archived. Names and creators do not determine inclusion. IT Admin can change Report Inclusion on an opened Client Profile. Rerun reports after changing inclusion.</p>
    <fieldset disabled={busy || schemaBusy} className="legacy-report-controls"><legend>Choose report and parameters</legend>
      <label>Find report<input value={find} onChange={(event) => setFind(event.target.value)} placeholder="DES, VOCA, OVW, SAGE, DQ…" /></label>
      <label>Report<select value={selected} onChange={(event) => { setSelected(event.target.value); clear() }}>{!choices.some((entry) => entry.id === selected) ? <option value={selected}>{report.title}</option> : null}{choices.map((entry) => <option key={entry.id} value={entry.id}>{entry.title}</option>)}</select></label>
      {report.parameters.map((field) => <label key={field.name}>{field.prompt || field.name}{field.values.length ? <select value={String(parameters[field.name] ?? '')} onChange={(event) => { setParameters((current) => ({ ...current, [field.name]: event.target.value })); clear() }}>{field.values.map((value) => <option key={value.value} value={value.value}>{legacyLabel(value.label || value.value).replaceAll('CAAFA Outreach', 'DV Outreach')}</option>)}</select> : <input type={field.type === 'DateTime' ? 'date' : field.type === 'Integer' ? 'number' : 'text'} value={String(parameters[field.name] ?? '')} onChange={(event) => { setParameters((current) => ({ ...current, [field.name]: field.type === 'Integer' ? Number(event.target.value) : event.target.value })); clear() }} />}</label>)}
    </fieldset>
    {native ? <><p className="hint">Native DES DV calculation — this report uses the existing Dataverse connector and ordinary app code. No browser SQL engine, workers, WebAssembly, or environment security changes are required.</p>
      <details><summary>IT Admin — Native DES DV Counting Setup</summary><p className="hint">October 1–September 30 reset; continuing enrollments count again on October 1; a first DV Outreach count permits one later transfer count. Shelter transitional stays are combined under their normal program names. TANF comes from the counted enrollment. These settings affect this preview only; review before official use.</p>
      <fieldset disabled={busy || schemaBusy} className="legacy-report-controls"><legend>Classification and MCBA hours</legend>
        <label>DV Outreach first yearly count<select value={nativeOptions.outreachCountDate} onChange={(event) => { setNativeOptions((current) => ({ ...current, outreachCountDate: event.target.value as NativeDesDvOptions['outreachCountDate'] })); clear() }}><option value="service">First actual Service date (legacy Section F)</option><option value="enrollment">Program Enrollment start date</option></select></label>
        <label><span><input type="checkbox" checked={nativeOptions.allowClientTypeFallback} onChange={(event) => { setNativeOptions((current) => ({ ...current, allowClientTypeFallback: event.target.checked })); clear() }} />Use Enrollment Client Type if Date of Birth is unavailable; flag the fallback</span></label>
        <p className="hint">People Served always shows TANF Adult, TANF Child, non-TANF Adult, and non-TANF Child, including zero counts.</p>
        <p className="hint">MCBA hours include all DV Outreach services in the selected period, regardless of service category. Missing or invalid minutes are flagged.</p>
      </fieldset><button type="button" className="secondary" disabled={busy || schemaBusy} onClick={() => download(JSON.stringify({ version: 1, report: report.id, nativeOptions, mappings }, null, 2), 'des-dv-native-report-setup.json', 'application/json')}>Download Native Report Setup</button></details>
      <p className="legacy-report-unavailable">This DES date-range report does not need Ref_Dates or capacity/budget rows. Agency fiscal/quarter labels remain blank rather than guessed. Other report sections that depend on the deferred reference tables remain unavailable.</p></> : <p className="legacy-report-unavailable">Fiscal/month/quarter reference rows and budget/capacity data are deliberately deferred. Sections depending on them are marked unavailable—not displayed as zero. Some original queries use date range OR fiscal year/quarter; keep those parameters consistent when reference data is added.</p>}
    <details><summary>IT Admin — Report Mapping Setup</summary><p className="hint">Defaults come from current form code and are verified against actual metadata when used. Changes apply to this tab only. $id uses the Dataverse GUID for safe joins; $hours derives minutes ÷ 60; $enrollmentLabel derives the program from a verified parent lookup. Report output shows app Record IDs. Reference tables remain deferred.</p>
      <fieldset disabled={busy || schemaBusy} className="legacy-report-controls"><legend>Current table bindings</legend><label>Legacy table<select value={mappingTable} onChange={(event) => { setMappingTable(event.target.value); setSchema(null); clear() }}>{Object.keys(mappings).map((table) => <option key={table}>{table}</option>)}</select></label><label>Current Dataverse table alias<input value={mappings[mappingTable].alias} onChange={(event) => { setMappings((current) => ({ ...current, [mappingTable]: { ...current[mappingTable], alias: event.target.value } })); setSchema(null); clear() }} /></label>
      {(['clientLookup', 'enrollmentLookup'] as const).filter((field) => field in mappings[mappingTable]).map((field) => <label key={field}>{field === 'clientLookup' ? 'Client Profile lookup logical column' : 'Program Enrollment lookup logical column'}<input value={mappings[mappingTable][field] || ''} onChange={(event) => { setMappings((current) => ({ ...current, [mappingTable]: { ...current[mappingTable], [field]: event.target.value } })); clear() }} /></label>)}
      <button type="button" className="secondary" onClick={() => void inspectSchema()}>{schemaBusy ? 'Reading metadata…' : 'Read Current Columns'}</button>
      {Object.entries(mappings[mappingTable].fields).map(([legacy, field]) => <label key={legacy}>{legacy}<input list="legacy-report-columns" value={field} onChange={(event) => changeField(legacy, event.target.value)} /></label>)}<datalist id="legacy-report-columns">{schema?.Attributes.map((attribute) => <option key={attribute.LogicalName} value={attribute.LogicalName}>{attribute.AttributeType}</option>)}</datalist>
      </fieldset><button type="button" className="secondary" disabled={busy || schemaBusy} onClick={() => download(JSON.stringify({ version: 1, mappings }, null, 2), 'compass-report-mappings.json', 'application/json')}>Download Mapping Configuration</button>
    </details>
    <details><summary>Source SQL and report dependencies</summary><p className="hint">Original SQL is provided for comparison only. It is not editable/executable through this screen.</p>{report.datasets.map((dataset) => <section key={dataset.name}><h4>{dataset.name}</h4><p className="hint">{plan.datasets[dataset.name].unavailable || `Tables: ${plan.datasets[dataset.name].tables.join(', ')}`}</p><pre>{dataset.sourceSql}</pre></section>)}</details>
    <div className="legacy-report-actions"><button type="button" disabled={busy || schemaBusy} onClick={() => void run()}>{busy ? 'Building report…' : 'View Report'}</button>{busy ? <button type="button" className="secondary" onClick={() => request.current?.abort()}>Cancel</button> : null}{result ? <button type="button" className="secondary" onClick={() => window.print()}>Print Displayed Report</button> : null}</div>
    <p className="hint" role="status" aria-live="polite">{progress}</p>{error ? <p className="error" role="alert">{error}</p> : null}
    {result ? <><section className="legacy-report-validation"><h4>Validation / Data Availability</h4><p>Not validated against production or legacy report totals yet. Data changes during a run may require rerunning. Current app archive boundaries apply.</p><label><span><input type="checkbox" checked={expandDetails} onChange={(event) => setExpandDetails(event.target.checked)} /> Expand all collapsible report details</span></label>{result.warnings.map((warning, index) => <p key={index}>{warning}</p>)}{Object.entries(result.datasets).map(([name, dataset]) => <div key={name}><strong>{name}: </strong>{dataset.unavailable ? <span>{dataset.unavailable}</span> : <><span>{dataset.rows?.length.toLocaleString()} row(s)</span> <button type="button" className="secondary" onClick={() => { const rows = dataset.rows || [], fields = [...new Set(rows.flatMap(Object.keys))].filter((field) => field !== '__reportRowId'); download(reportCsv([fields, ...rows.map((row) => fields.map((field) => { const value = row[field]; return typeof value === 'string' && result.displayIds[value] ? result.displayIds[value] : value === null || value === undefined ? '' : String(value) }))]), `${report.id}-${name}.csv`) }}>Download Full Dataset</button></>}</div>)}</section><LegacyReportView report={report} parameters={parameters} result={result} expandDetails={expandDetails} /></> : null}
  </article>
}
