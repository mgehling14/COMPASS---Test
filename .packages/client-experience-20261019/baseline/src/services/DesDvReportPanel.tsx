import { useEffect, useRef, useState } from 'react'
import { calculateDesDvReport, DEFAULT_REPORT_RULES, OCCUPANCY_PROGRAMS, PEOPLE_CATEGORIES, PEOPLE_PROGRAMS, reportCsv, reportingYearStart, type DesDvReport, type ReportRules } from './desDvReport'
import { loadDesDvReportInput } from './desDvReportData'
import './DesDvReport.css'

function previousMonth(): { start: string; end: string } {
  const now = new Date(), first = new Date(now.getFullYear(), now.getMonth() - 1, 1), last = new Date(now.getFullYear(), now.getMonth(), 0)
  const day = (date: Date) => `${date.getFullYear()}-${String(date.getMonth() + 1).padStart(2, '0')}-${String(date.getDate()).padStart(2, '0')}`
  return { start: day(first), end: day(last) }
}
function download(content: string, filename: string, mime = 'text/csv;charset=utf-8'): void {
  const url = URL.createObjectURL(new Blob([content], { type: mime })), link = document.createElement('a')
  link.href = url; link.download = filename; link.click(); setTimeout(() => URL.revokeObjectURL(url), 1000)
}
export default function DesDvReportPanel({ canManage }: { canManage: boolean }) {
  const [period, setPeriod] = useState(previousMonth)
  const [rules, setRules] = useState<ReportRules>({ ...DEFAULT_REPORT_RULES })
  const [reviewed, setReviewed] = useState(false)
  const [report, setReport] = useState<DesDvReport | null>(null)
  const [busy, setBusy] = useState(false), [progress, setProgress] = useState(''), [error, setError] = useState('')
  const [issuesOnly, setIssuesOnly] = useState(false), [auditPage, setAuditPage] = useState(0)
  const request = useRef<AbortController | null>(null)
  useEffect(() => () => request.current?.abort(), [])
  useEffect(() => { if (!canManage) { request.current?.abort(); setReport(null) } }, [canManage])
  function changeRule<K extends keyof ReportRules>(field: K, value: ReportRules[K]) {
    setRules((current) => ({ ...current, [field]: value })); setReviewed(false); setReport(null); setError('')
  }
  function changePeriod(field: 'start' | 'end', value: string) { setPeriod((current) => ({ ...current, [field]: value })); setReport(null); setError('') }
  async function run() {
    if (!canManage || !reviewed || busy) return
    const controller = new AbortController(); request.current = controller
    setBusy(true); setReport(null); setError(''); setAuditPage(0)
    try {
      const data = await loadDesDvReportInput(period.start, period.end, rules, controller.signal, setProgress)
      controller.signal.throwIfAborted()
      const result = calculateDesDvReport(data, period.start, period.end, rules)
      setReport(result)
      setProgress(`Complete: ${data.enrollments.length.toLocaleString()} enrollments, ${data.clients.length.toLocaleString()} linked clients and ${data.stays.length.toLocaleString()} bed enrollments read.`)
    } catch (failure) {
      if (controller.signal.aborted) setProgress('Report cancelled. No partial totals were retained.')
      else { setError(String((failure as Error)?.message || failure)); setProgress('No partial report displayed.') }
    } finally { if (request.current === controller) { request.current = null; setBusy(false) } }
  }
  if (!canManage) return <article className="panel hub-card"><h3>DES DV Monthly Reporting</h3><p className="hint">This reporting prototype is currently available to IT Admin outside View as User while its counting rules are being reviewed.</p></article>
  let fiscalStart = ''
  try { fiscalStart = reportingYearStart(period.start) } catch { /* Input validation occurs before reading data. */ }
  const audit = report?.audit.filter((row) => !issuesOnly || row.issue) || []
  const auditRows = audit.slice(auditPage * 100, auditPage * 100 + 100)
  const issueCount = report?.audit.filter((row) => row.issue).length || 0
  const summary = () => reportCsv([
    ['DES DV Monthly Reporting — PROTOTYPE', report?.start || '', report?.end || ''],
    ['Reporting year history begins', report?.historyStart || ''],
    ['As of', report?.asOf || ''],
    ['Rules (review before official reporting)', JSON.stringify(report?.rules)],
    ['Audit issues', issueCount],
    ['Section A/H — People Served', ...PEOPLE_PROGRAMS, 'Total'],
    ...PEOPLE_CATEGORIES.map((category) => [category, ...PEOPLE_PROGRAMS.map((program) => report!.people[category][program]), PEOPLE_PROGRAMS.reduce((sum, program) => sum + report!.people[category][program], 0)]),
    ['Total Clients Served', ...PEOPLE_PROGRAMS.map((program) => PEOPLE_CATEGORIES.reduce((sum, category) => sum + report!.people[category][program], 0)), PEOPLE_CATEGORIES.reduce((sum, category) => sum + PEOPLE_PROGRAMS.reduce((subtotal, program) => subtotal + report!.people[category][program], 0), 0)],
    ['Section B — Shelter Occupancy', ...OCCUPANCY_PROGRAMS, 'Total'],
    ['Client Bed Nights', ...OCCUPANCY_PROGRAMS.map((program) => report!.nights[program]), Object.values(report!.nights).reduce((sum, count) => sum + count, 0)],
  ])
  return <article className="panel hub-card des-dv-report">
    <h3>DES DV Monthly Reporting</h3>
    <p className="hint">Prototype: Section A/H — People Served and Section B — Shelter Occupancy only. Review the calculation rules before using totals for official reporting.</p>
    <fieldset disabled={busy} className="des-report-period">
      <legend>Report period (inclusive)</legend>
      <label>Start date<input type="date" value={period.start} onChange={(event) => changePeriod('start', event.target.value)} /></label>
      <label>End date<input type="date" value={period.end} onChange={(event) => changePeriod('end', event.target.value)} /></label>
    </fieldset>
    <p className="hint">October 1 reset: history begins {fiscalStart || 'after choosing a start date'}. All programs are checked for earlier counts, not just the three displayed shelter programs. A DV Outreach first count allows one later transfer count in another program. Same-day ties prefer the non-outreach enrollment, then Dataverse row ID.</p>
    <details className="des-report-setup" open={!reviewed}>
      <summary>IT Admin — Report Setup / Counting Rules</summary>
      <p className="hint">These settings affect this report preview only, not source records or other users. Download the rule configuration to retain your setup. The reset is October 1–September 30, not January–December.</p>
      <fieldset disabled={busy} className="des-report-rules"><legend>Classification and yearly count</legend>
        <label>Enrollments that began before October 1<select value={String(rules.carryOver)} onChange={(event) => changeRule('carryOver', event.target.value === 'true')}><option value="false">Only count new enrollment starts after reset</option><option value="true">Count continuing enrollments again on October 1</option></select></label>
        <label>Adult / child source<select value={rules.ageSource} onChange={(event) => changeRule('ageSource', event.target.value as ReportRules['ageSource'])}><option value="birthDate">Client Profile Date of Birth, age at first count</option><option value="clientType">Program Enrollment Client Type</option></select></label>
        <label>Adult age threshold<input type="number" min="1" max="100" disabled={rules.ageSource !== 'birthDate'} value={rules.adultAge} onChange={(event) => changeRule('adultAge', Number(event.target.value))} /></label>
        <label>TANF source<select value={rules.tanfSource} onChange={(event) => changeRule('tanfSource', event.target.value as ReportRules['tanfSource'])}><option value="enrollment">Program Enrollment</option><option value="client">Client Profile (enter its TANF choice column)</option></select></label>
        <label>TANF logical choice column<input value={rules.tanfField} onChange={(event) => changeRule('tanfField', event.target.value)} /></label>
        <label>TANF eligible choice label<input value={rules.tanfYes} onChange={(event) => changeRule('tanfYes', event.target.value)} /></label>
        <label>Non-TANF choice label<input value={rules.tanfNo} onChange={(event) => changeRule('tanfNo', event.target.value)} /></label>
        <p className="hint">People Served includes TANF Adult, TANF Child, non-TANF Adult, and non-TANF Child as separate rows, including zero counts.</p>
        <label>Overlapping bed enrollments<select value={String(rules.deduplicateClientNights)} onChange={(event) => changeRule('deduplicateClientNights', event.target.value === 'true')}><option value="false">Count each bed enrollment; flag overlaps</option><option value="true">Count each client's overlapping night once</option></select></label>
      </fieldset>
      <p className="hint">People Served uses Enrolled/Re-Enrolled records only; waiting list/turnaway excluded. Unknown TANF/age and broken links are flagged, not guessed. Archived records are excluded. Section B counts nights from each bed enrollment's check-in/check-out within the selected period, through the current date for open stays. Check-in is included; checkout/current day is excluded (no future or unfinished nights). Overlaps are flagged; the optional overlap rule can count each client night once. Transitional stays are combined under the normal Autumn House/Faith House names; current physical bed assignments are not multiplied.</p>
      <label className="des-report-review"><input type="checkbox" disabled={busy} checked={reviewed} onChange={(event) => { setReviewed(event.target.checked); setReport(null) }} />I reviewed these prototype rules and want to run this calculation.</label>
      <button type="button" className="secondary" disabled={busy} onClick={() => download(JSON.stringify({ report: 'DES DV Monthly Reporting', version: 1, rules }, null, 2), 'des-dv-report-rules.json', 'application/json')}>Download rule configuration</button>
    </details>
    <div className="des-report-actions"><button type="button" disabled={!reviewed || busy} onClick={() => void run()}>{busy ? 'Building report…' : 'View Report'}</button>{busy ? <button type="button" className="secondary" onClick={() => request.current?.abort()}>Cancel</button> : null}{report ? <><button type="button" className="secondary" onClick={() => download(summary(), `des-dv-summary-${report.start}-${report.end}.csv`)}>Download Summary</button><button type="button" className="secondary" onClick={() => download(reportCsv([['Section', 'Record ID', 'Dataverse Row ID', 'Client', 'Program', 'Count Date', 'Decision', 'Count', 'Issue'], ...report.audit.map((row) => [row.section, row.recordId, row.rowId, row.client, row.program, row.date, row.decision, row.amount, row.issue ? 'Yes' : 'No'])]), `des-dv-audit-${report.start}-${report.end}.csv`)}>Download Full Audit</button></> : null}</div>
    <p role="status" aria-live="polite" className="hint">{progress}</p>{error ? <p className="error" role="alert">{error}</p> : null}
    {report ? <>
      <p className="des-report-warning">PROTOTYPE — As of {report.asOf}. {issueCount ? `${issueCount.toLocaleString()} audit items need review. Totals may be incomplete.` : 'No data issues detected by these configured rules; business definitions still require your approval.'} Data is read live when View Report is clicked; changes during a run may require rerunning.</p>
      <div className="des-report-table"><table><caption>Section A/H — People Served • {report.start} through {report.end}</caption><thead><tr><th scope="col">TANF Eligibility</th>{PEOPLE_PROGRAMS.map((program) => <th scope="col" key={program}>{program}</th>)}<th scope="col">Total</th></tr></thead><tbody>{PEOPLE_CATEGORIES.map((category) => <tr key={category}><th scope="row">{category}</th>{PEOPLE_PROGRAMS.map((program) => <td key={program}>{report.people[category][program]}</td>)}<td>{PEOPLE_PROGRAMS.reduce((sum, program) => sum + report.people[category][program], 0)}</td></tr>)}</tbody><tfoot><tr><th scope="row">Total Clients Served</th>{PEOPLE_PROGRAMS.map((program) => <td key={program}>{PEOPLE_CATEGORIES.reduce((sum, category) => sum + report.people[category][program], 0)}</td>)}<td>{PEOPLE_CATEGORIES.reduce((sum, category) => sum + PEOPLE_PROGRAMS.reduce((subtotal, program) => subtotal + report.people[category][program], 0), 0)}</td></tr></tfoot></table></div>
      <div className="des-report-table"><table><caption>Section B — Shelter Occupancy</caption><thead><tr><th scope="col">Shelter Occupancy</th>{OCCUPANCY_PROGRAMS.map((program) => <th scope="col" key={program}>{program}</th>)}<th scope="col">Total</th></tr></thead><tbody><tr><th scope="row">Client Bed Nights</th>{OCCUPANCY_PROGRAMS.map((program) => <td key={program}>{report.nights[program]}</td>)}<td>{Object.values(report.nights).reduce((sum, count) => sum + count, 0)}</td></tr></tbody></table></div>
      <details><summary>Record-level audit ({report.audit.length.toLocaleString()} decisions)</summary><label className="des-report-review"><input type="checkbox" checked={issuesOnly} onChange={(event) => { setIssuesOnly(event.target.checked); setAuditPage(0) }} />Only items needing review</label><p className="hint">All source IDs are unchanged. First counts before the report period are shown to explain deduplication.</p><div className="des-report-actions"><button type="button" className="secondary" disabled={auditPage === 0} onClick={() => setAuditPage((page) => page - 1)}>Previous audit page</button><span>Page {auditPage + 1} • {audit.length.toLocaleString()} decisions</span><button type="button" className="secondary" disabled={(auditPage + 1) * 100 >= audit.length} onClick={() => setAuditPage((page) => page + 1)}>Next audit page</button></div><div className="des-report-table"><table><thead><tr>{['Section', 'Record ID', 'Client', 'Program', 'Count Date', 'Decision', 'Count'].map((label) => <th scope="col" key={label}>{label}</th>)}</tr></thead><tbody>{auditRows.map((row, index) => <tr key={`${row.section}-${row.rowId}-${row.date}-${index}`}><td>{row.section}</td><td>{row.recordId || row.rowId}</td><td>{row.client}</td><td>{row.program}</td><td>{row.date}</td><td>{row.issue ? 'Review: ' : ''}{row.decision}</td><td>{row.amount}</td></tr>)}</tbody></table></div></details>
    </> : null}
  </article>
}
