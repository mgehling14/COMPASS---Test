import { useEffect, useRef, useState } from 'react'
import { createMigrationGateway } from './legacyRecordMigration'
import CompassFileCsvImportPanel from './CompassFileCsvImportPanel'
import { applyFileTranslation, FILE_TRANSLATION_TABLES, fileTranslationCsv, previewFileTranslation, type FileTranslationOptions, type FileTranslationPlan, type FileTranslationRow } from './legacyFileTranslation'

export default function LegacyFileTranslationPanel({ canManage, savedBy }: { canManage: boolean; savedBy: string }) {
  const [options, setOptions] = useState<FileTranslationOptions>({ destination: 'all', eventSlot: 'empty-in-order' })
  const [plan, setPlan] = useState<FileTranslationPlan | null>(null), [reviewed, setReviewed] = useState(false)
  const [busy, setBusy] = useState(false), [error, setError] = useState(''), [status, setStatus] = useState('')
  const [importBusy, setImportBusy] = useState(false)
  const [sample, setSample] = useState<FileTranslationRow[]>([]), [counts, setCounts] = useState<Record<string, number>>({})
  const [writes, setWrites] = useState({ processed: 0, updated: 0, failed: 0, partial: 0 })
  const gateway = useRef(createMigrationGateway()), controller = useRef<AbortController | null>(null), active = useRef(false)
  const mounted = useRef(true), allowed = useRef(canManage), report = useRef(new Map<string, FileTranslationRow>())
  allowed.current = canManage
  useEffect(() => { mounted.current = true; return () => { mounted.current = false; controller.current?.abort() } }, [])
  useEffect(() => { if (!canManage) { controller.current?.abort(); setPlan(null); setReviewed(false) } }, [canManage])
  function reset() { setPlan(null); setReviewed(false); setSample([]); setCounts({}); setError(''); setStatus(''); report.current.clear(); setWrites({ processed: 0, updated: 0, failed: 0, partial: 0 }) }
  async function run(preview: boolean) {
    if (!allowed.current || active.current || importBusy || !preview && (!plan || !reviewed)) return
    if (!preview && !window.confirm(`Link ${plan!.rows.filter((row) => row.state === 'ready').length.toLocaleString()} file record(s)? Existing attachments will not be replaced. File contents and legacy columns are not modified.`)) return
    active.current = true; setBusy(true); setError(''); setReviewed(false)
    const abort = new AbortController(); controller.current = abort
    const progress = (message: string) => { if (mounted.current) setStatus(message) }
    try {
      if (preview) {
        reset(); setBusy(true)
        const result = await previewFileTranslation(options, gateway.current, abort.signal, progress)
        abort.signal.throwIfAborted()
        if (!allowed.current || !mounted.current) return
        report.current = new Map(result.rows.map((row) => [row.fileId, row]))
        setPlan(result); setSample(result.rows.filter((row) => row.state !== 'skipped').slice(0, 100))
        setCounts(result.rows.reduce<Record<string, number>>((current, row) => ({ ...current, [row.state]: (current[row.state] || 0) + 1 }), {}))
        setStatus('Preview complete. Download and review the report before linking. No records were changed.')
      } else {
        const result = await applyFileTranslation(plan!, gateway.current, abort.signal, savedBy, () => allowed.current && mounted.current, progress, (row) => {
          report.current.set(row.fileId, row)
          if (mounted.current) {
            setWrites((current) => ({ ...current, processed: current.processed + 1,
              updated: current.updated + Number(row.state === 'updated'), failed: current.failed + Number(row.state === 'failed'), partial: current.partial + Number(row.state === 'partial') }))
            setSample((current) => current.map((entry) => entry.fileId === row.fileId ? row : entry))
          }
        })
        report.current = new Map(result.map((row) => [row.fileId, row]))
        if (mounted.current) { setStatus('Translation finished. Download the results. Rerun Preview to review remaining issues or safely repair partial links.'); setPlan(null) }
      }
    } catch (failure) {
      if (mounted.current) { setPlan(null); setError(abort.signal.aborted ? 'Stopped. Some in-flight updates may have completed. Download the report and rerun Preview; existing links will be recognized.' : String((failure as Error)?.message || failure)) }
    } finally { active.current = false; controller.current = null; if (mounted.current) setBusy(false) }
  }
  function download() {
    const url = URL.createObjectURL(new Blob([fileTranslationCsv([...report.current.values()])], { type: 'text/csv;charset=utf-8' }))
    const link = document.createElement('a'); link.href = url; link.download = 'compass-legacy-file-translation.csv'; link.click(); setTimeout(() => URL.revokeObjectURL(url), 1000)
  }
  if (!canManage) return <p className="hint">File translation is IT Admin-only and unavailable in View as User.</p>
  return <><CompassFileCsvImportPanel canManage={canManage} savedBy={savedBy} locked={busy} onBusyChange={setImportBusy} onDataChange={() => { setPlan(null); setReviewed(false) }} /><section className="role-admin-section">
    <h3>Legacy File Translation</h3>
    <p className="hint">After importing files into cmps_compassfileses, match cmps_relatedrecordidlegacy against the destination form’s own legacy ID. cmps_destinationtablename identifies that form. Preview reads all pages, including archived records, before any writes. No file payloads are downloaded.</p>
    <p className="hint">Linking sets the destination’s file lookup to the Compass Files GUID and sets the file’s cmps_relatedrecordid to the destination’s app Record ID. It does not change file contents, legacy values, app Record IDs, Client Profile links or archive flags. Translate destination Record IDs first. Back up your data and finish importing before running. Avoid editing attachments or running another migration during translation.</p>
    <fieldset disabled={busy || importBusy}><legend>Translation scope</legend><div className="hub-form-grid">
      <label className="hub-form-field"><span>Destination table</span><select value={options.destination} onChange={(event) => { reset(); setOptions((current) => ({ ...current, destination: event.target.value })) }}>
        <option value="all">All supported upload tables</option>{FILE_TRANSLATION_TABLES.map(({ definition }) => <option key={definition.key} value={definition.key}>{definition.label}</option>)}
      </select></label>
      <label className="hub-form-field"><span>Event upload slots</span><select value={options.eventSlot} onChange={(event) => { reset(); setOptions((current) => ({ ...current, eventSlot: event.target.value as FileTranslationOptions['eventSlot'] })) }}>
        <option value="empty-in-order">Fill empty File 1, then File 2; flag overflow</option><option value="cmps_fileid1">File 1 only</option><option value="cmps_fileid2">File 2 only</option><option value="review">Do not assign new Event attachments</option>
      </select></label>
    </div></fieldset>
    <details><summary>Accepted destination names and legacy columns</summary>
      <p className="hint">Use one of the aliases below in cmps_destinationtablename. Form labels and metadata-verified logical names are also accepted, ignoring spaces, hyphens and letter case. Legacy IDs match exactly after trimming outer whitespace; leading zeros are preserved.</p>
      <div className="hub-search-results-table-wrap"><table className="hub-search-results-table"><thead><tr><th>Form</th><th>Destination table alias</th><th>Legacy ID column</th><th>Upload lookup(s)</th></tr></thead><tbody>{FILE_TRANSLATION_TABLES.map(({ definition, uploads }) => <tr key={definition.key}><td>{definition.label}</td><td>{definition.tableAlias}</td><td>{definition.legacyIdField}</td><td>{uploads.join(', ')}</td></tr>)}</tbody></table></div>
    </details>
    <p className="hint">Existing attachments and different file backlinks are preserved. Duplicate legacy IDs, unsupported destinations and competing imports for a single upload field are reported, not guessed. Event slots are assigned in stable file-row-ID order. Rerunning is safe; already completed pairs are unchanged and partial backlinks can be repaired.</p>
    <div className="hub-form-editor-actions">
      <button type="button" className="secondary" disabled={busy || importBusy} onClick={() => { void run(true) }}>Preview File Translation</button>
      <button type="button" className="primary" disabled={busy || importBusy || !reviewed || !plan || !counts.ready} onClick={() => { void run(false) }}>Link Imported Files</button>
      {busy ? <button type="button" className="secondary" onClick={() => { setStatus('Stopping; waiting for in-flight requests to settle…'); controller.current?.abort() }}>Stop</button> : null}
      <button type="button" className="secondary" disabled={!report.current.size} onClick={download}>Download Preview / Results</button>
    </div>
    {plan ? <label className="permission-check"><input type="checkbox" checked={reviewed} disabled={busy || importBusy} onChange={(event) => setReviewed(event.target.checked)} /><span>I reviewed the preview and want to link only the ready records without replacing existing attachments.</span></label> : null}
    <p className="hint" role="status" aria-live="polite">{status}</p>{error ? <p className="error" role="alert">{error}</p> : null}
    {Object.keys(counts).length ? <p className="hint">Ready: {counts.ready || 0} · Already linked: {counts.unchanged || 0} · Issues: {counts.issue || 0} · Skipped: {counts.skipped || 0} · Processed: {writes.processed} · Updated: {writes.updated} · Failed: {writes.failed} · Partial: {writes.partial}</p> : null}
    {sample.length ? <><p className="hint">Showing up to 100 non-skipped files. Download the report for every file in this run. Reports stay in memory only; download before leaving this page.</p>
      <div className="hub-search-results-table-wrap"><table className="hub-search-results-table"><thead><tr><th>File record</th><th>Destination</th><th>Legacy ID</th><th>App Record ID</th><th>Upload field</th><th>Result</th><th>Details</th></tr></thead><tbody>{sample.map((row) => <tr key={row.fileId}><td>{row.fileRecordId || row.fileId}</td><td>{row.destination}</td><td>{row.legacyId}</td><td>{row.targetRecordId}</td><td>{row.slot}</td><td>{row.state}</td><td>{row.message}</td></tr>)}</tbody></table></div></> : null}
  </section></>
}
