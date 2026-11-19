import { useEffect, useRef, useState } from 'react'
import { createFunderTranslationGateway, FUNDER_TRANSLATION_TABLES, previewFunderTranslation, translateFunders,
  type FunderTranslationPlan, type FunderTranslationProgress, type FunderTranslationIssue, type FunderTranslationChange } from './funderTranslation'

function downloadReport(name: string, headers: string[], rows: string[][]) {
  const cell = (value: string) => '"' + (/^[=+@-]/.test(value) ? "'" + value : value).replaceAll('"', '""') + '"'
  const blob = new Blob(['\uFEFF' + [headers, ...rows].map((row) => row.map(cell).join(',')).join('\r\n')], { type: 'text/csv;charset=utf-8' })
  const url = URL.createObjectURL(blob), anchor = document.createElement('a')
  anchor.href = url; anchor.download = name; anchor.click(); setTimeout(() => URL.revokeObjectURL(url), 1000)
}

export default function FunderTranslationPanel({ savedBy }: { savedBy: string }) {
  const [key, setKey] = useState(FUNDER_TRANSLATION_TABLES[0].key)
  const [plan, setPlan] = useState<FunderTranslationPlan | null>(null)
  const [mappingData, setMappingData] = useState<Pick<FunderTranslationPlan, 'options' | 'funders'> | null>(null)
  const [overrides, setOverrides] = useState<Record<string, string>>({})
  const [progress, setProgress] = useState<FunderTranslationProgress | null>(null)
  const [issues, setIssues] = useState<FunderTranslationIssue[]>([])
  const [updated, setUpdated] = useState<Set<string>>(new Set())
  const [busy, setBusy] = useState(false), [error, setError] = useState(''), [status, setStatus] = useState('')
  const gateway = useRef(createFunderTranslationGateway())
  const active = useRef(false), mounted = useRef(true), controller = useRef<AbortController | null>(null)
  useEffect(() => {
    mounted.current = true
    return () => { mounted.current = false; controller.current?.abort() }
  }, [])

  async function run(write: boolean) {
    if (active.current || write && !plan?.progress.eligible) return
    if (write && !window.confirm(`Translate ${plan!.changes.length.toLocaleString()} reviewed Funder lookup(s)? Existing links and legacy choice values will not be changed.`)) return
    active.current = true
    const reviewed = plan, abort = new AbortController()
    controller.current = abort
    setBusy(true); setError(''); setStatus(''); setUpdated(new Set())
    const emit = (value: FunderTranslationProgress) => { if (mounted.current) setProgress(value) }
    try {
      if (!write) {
        setPlan(null); setIssues([]); setProgress(null)
        const result = await previewFunderTranslation(key, gateway.current, abort.signal, emit, overrides)
        if (mounted.current) { setPlan(result); setMappingData(result); setIssues(result.issues); setStatus('Preview complete. No records changed. Review the matches and issue report before translating.') }
      } else {
        const result = await translateFunders(reviewed!, gateway.current, savedBy, abort.signal, emit,
          (issue) => { if (mounted.current) setIssues((current) => [...current, issue]) },
          (change: FunderTranslationChange) => { if (mounted.current) setUpdated((current) => new Set(current).add(change.id)) })
        if (mounted.current) setStatus(`Updated ${result.updated.toLocaleString()} Funder lookup(s); ${result.failed.toLocaleString()} updates were not confirmed. Run Preview again before retrying or reopen enrollments to see the links.`)
      }
    } catch (failure) {
      if (mounted.current) setError(abort.signal.aborted
        ? 'Stopped. Completed updates are retained; an interrupted request may still have saved. Download reports and run Preview again before retrying.'
        : String((failure as Error)?.message || failure))
    } finally {
      active.current = false
      if (mounted.current) { setBusy(false); if (write) setPlan((current) => current ? { ...current, progress: { ...current.progress, eligible: 0 } } : null) }
    }
  }

  return <section className="role-admin-section">
    <h3>Imported Funder Translation</h3>
    <p className="hint">Translate legacy Funder choices into Funder lookup records, starting with Program Enrollment. The legacy choice and app Record ID are preserved. Records without a choice are skipped.</p>
    <p className="hint">Matches use the actual Dataverse choice labels and exact Funder names (ignoring case and extra spaces). Existing links are never overwritten. Inactive funders can be linked for historical records; archived funders, duplicate names, unmatched choices, and conflicting existing links are reported.</p>
    <p className="hint">Scans all pages, including archived enrollments, before making changes. Updates use record versions with up to four requests in flight and retries for throttling. Avoid editing or importing during this operation. Keep this page open; Stop cancels further work. Reports are in memory—download before leaving.</p>
    <label className="role-admin-field"><span>Table</span><select value={key} disabled={busy} onChange={(event) => { setKey(event.target.value); setPlan(null); setMappingData(null); setOverrides({}); setIssues([]); setProgress(null); setStatus(''); setError('') }}>
      {FUNDER_TRANSLATION_TABLES.map((table) => <option key={table.key} value={table.key}>{table.label}</option>)}
    </select></label>
    <p className="hint">Legacy choice: cmps_funder → verified Funder lookup: cmps_funder1 → cmps_funders. More tables can be added once their mappings are verified.</p>
    {mappingData ? <details className="role-admin-card" open>
      <summary>Choice-to-Funder mappings</summary>
      <p className="hint">Automatic matches require exact names. For differently named or duplicate funders, explicitly select the correct record below, then run Preview again. If a funder is missing, add it through Manage Funders first. Selections affect this session only.</p>
      <div className="role-admin-list">{mappingData.options.map((option) => <label className="role-admin-field" key={option.value}>
        <span>{option.label} ({option.value})</span><select disabled={busy} value={overrides[String(option.value)] || ''} onChange={(event) => {
          const value = event.target.value
          setOverrides((current) => { const next = { ...current }; if (value) next[String(option.value)] = value; else delete next[String(option.value)]; return next })
          setPlan(null); setProgress(null); setIssues([]); setError(''); setStatus('Mapping changed. Run Preview again to review the new matches before translating.')
        }}><option value="">Automatic exact-name match</option>
          {mappingData.funders.filter((funder) => !funder.archived).map((funder) => <option key={funder.id} value={funder.id}>{funder.name} | {funder.id}</option>)}
        </select>
      </label>)}</div>
    </details> : null}
    <div className="hub-form-editor-actions">
      <button type="button" className="secondary" disabled={busy} onClick={() => { void run(false) }}>Preview Funder Translation</button>
      <button type="button" className="primary" disabled={busy || !plan?.progress.eligible} onClick={() => { void run(true) }}>Translate Funder Lookups{plan?.progress.eligible ? ` (${plan.progress.eligible.toLocaleString()})` : ''}</button>
      {busy ? <button type="button" className="secondary" onClick={() => controller.current?.abort()}>Stop</button> : null}
      <button type="button" className="secondary" disabled={busy || !issues.length} onClick={() => downloadReport('funder-translation-issues.csv', ['Row ID', 'Record ID', 'Legacy Choice', 'Issue'], issues.map((row) => [row.id, row.recordId, row.choice, row.message]))}>Download Issue Report</button>
      <button type="button" className="secondary" disabled={busy || !plan} onClick={() => downloadReport('funder-translation-changes.csv', ['Row ID', 'Record ID', 'Legacy Choice', 'Choice Label', 'Funder ID', 'Funder Name', 'Status'], plan!.changes.map((row) => [row.id, row.recordId, String(row.choiceValue), row.choiceLabel, row.funderId, row.funderName, updated.has(row.id) ? 'Update confirmed' : 'Planned / not confirmed']))}>Download Change Report</button>
    </div>
    {progress ? <p className="hint" role="status">Phase: {progress.phase} | Funders: {progress.funders.toLocaleString()} | Records read: {progress.read.toLocaleString()} | Pages: {progress.pages.toLocaleString()} | Would update: {progress.eligible.toLocaleString()} | Already linked: {progress.unchanged.toLocaleString()} | No choice: {progress.empty.toLocaleString()} | Issues: {progress.issues.toLocaleString()} | Updated: {progress.updated.toLocaleString()} | Failed/unconfirmed: {progress.failed.toLocaleString()}</p> : null}
    {status ? <p className="success" role="status">{status}</p> : null}
    {error ? <p className="error" role="alert">{error}</p> : null}
    {plan?.changes.length ? <><h4>Reviewed matches</h4><p className="hint">Showing the first 100 matches. Download the change report for all records.</p>
      <table className="record-table"><thead><tr><th>Record ID</th><th>Legacy Funder</th><th>Funder lookup record</th></tr></thead>
        <tbody>{plan.changes.slice(0, 100).map((row) => <tr key={row.id}><td>{row.recordId || row.id}</td><td>{row.choiceLabel}</td><td>{row.funderName}</td></tr>)}</tbody></table></> : null}
    {issues.length ? <><h4>Records needing attention</h4><p className="hint">Showing the first 100 issues. These records are not automatically relinked.</p>
      <table className="record-table"><thead><tr><th>Record ID</th><th>Legacy Choice</th><th>Issue</th></tr></thead>
        <tbody>{issues.slice(0, 100).map((row, index) => <tr key={`${row.id}-${index}`}><td>{row.recordId || row.id}</td><td>{row.choice}</td><td>{row.message}</td></tr>)}</tbody></table></> : null}
  </section>
}

