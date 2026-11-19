import { useEffect, useRef, useState } from 'react'
import { COMPASS_FILE_CSV_HEADERS, compassFileCsvResults, createCompassFileCsvGateway, importCompassFileCsv, previewCompassFileCsv, type FileCsvPlan, type FileCsvRow } from './compassFileCsvImport'

function downloadCsv(name: string, content: string) {
  const url = URL.createObjectURL(new Blob(['\uFEFF', content], { type: 'text/csv;charset=utf-8' }))
  const link = document.createElement('a'); link.href = url; link.download = name; link.click(); setTimeout(() => URL.revokeObjectURL(url), 1000)
}
export default function CompassFileCsvImportPanel({ canManage, savedBy, locked = false, onBusyChange, onDataChange }: {
  canManage: boolean; savedBy: string; locked?: boolean; onBusyChange: (busy: boolean) => void; onDataChange: () => void
}) {
  const [file, setFile] = useState<File | null>(null), [plan, setPlan] = useState<FileCsvPlan | null>(null)
  const [busy, setBusy] = useState(false), [reviewed, setReviewed] = useState(false), [status, setStatus] = useState(''), [error, setError] = useState('')
  const [sample, setSample] = useState<FileCsvRow[]>([]), [counts, setCounts] = useState<Record<string, number>>({}), [imported, setImported] = useState(0)
  const gateway = useRef(createCompassFileCsvGateway()), csv = useRef(''), report = useRef(new Map<number, FileCsvRow>())
  const controller = useRef<AbortController | null>(null), active = useRef(false), mounted = useRef(true), allowed = useRef(canManage)
  allowed.current = canManage
  useEffect(() => { mounted.current = true; return () => { mounted.current = false; controller.current?.abort() } }, [])
  useEffect(() => { if (!canManage) { controller.current?.abort(); setPlan(null); setReviewed(false) } }, [canManage])
  function reset() { csv.current = ''; report.current.clear(); setPlan(null); setReviewed(false); setSample([]); setCounts({}); setImported(0); setStatus(''); setError('') }
  async function run(preview: boolean) {
    if (!allowed.current || active.current || locked || !file || !preview && (!plan || !reviewed)) return
    if (!preview && !window.confirm(`Create ${counts.ready || 0} Compass Files metadata row(s)? This does NOT upload PDFs/images or link files to forms. Existing rows will not be overwritten.`)) return
    active.current = true; setBusy(true); onBusyChange(true); setReviewed(false); setError('')
    const abort = new AbortController(); controller.current = abort
    const progress = (message: string) => { if (mounted.current) setStatus(message) }
    try {
      if (preview) {
        reset(); setBusy(true)
        if (!/\.csv$/i.test(file.name)) throw new Error('Choose a UTF-8 CSV file, not an Excel workbook.')
        if (file.size > 25 * 1024 * 1024) throw new Error('Split CSVs larger than 25 MB into smaller batches before importing.')
        csv.current = await file.text(); abort.signal.throwIfAborted()
        const result = await previewCompassFileCsv(csv.current, gateway.current, abort.signal, progress)
        abort.signal.throwIfAborted()
        if (!mounted.current || !allowed.current) return
        report.current = new Map(result.rows.map((row) => [row.line, row]))
        setPlan(result); setSample(result.rows.slice(0, 100))
        setCounts(result.rows.reduce<Record<string, number>>((totals, row) => { totals[row.state] = (totals[row.state] || 0) + 1; return totals }, {}))
        setStatus('Preview complete. No records changed. Review the results before importing ready rows; issue rows will be skipped.')
      } else {
        try {
          const result = await importCompassFileCsv(csv.current, plan!, gateway.current, abort.signal, savedBy, () => allowed.current && mounted.current, progress, (row) => {
            report.current.set(row.line, row)
            if (mounted.current) { if (row.state === 'imported') setImported((count) => count + 1); setSample((rows) => rows.map((entry) => entry.line === row.line ? row : entry)) }
          })
          report.current = new Map(result.map((row) => [row.line, row]))
          if (mounted.current) setStatus('Metadata import finished. Download the results. Upload the actual files separately, then use Legacy File Translation below once destinations and legacy IDs are complete.')
        } finally { if (mounted.current) { setPlan(null); onDataChange() } }
      }
    } catch (failure) {
      if (mounted.current) { setPlan(null); setError(abort.signal.aborted ? 'Stopped. An in-flight create may have completed. Download results and preview the same CSV again before retrying; matching records are skipped.' : String((failure as Error)?.message || failure)) }
    } finally { active.current = false; controller.current = null; if (mounted.current) { setBusy(false); onBusyChange(false) } }
  }
  if (!canManage) return null
  return <section className="role-admin-section">
    <h3>Compass Files — CSV Metadata Import</h3>
    <p className="hint">Imports into cmps_compassfileses using the five columns shown below. This creates metadata records only: the CSV does not contain file contents, so PDFs/images must be uploaded separately. It does not attach files to forms or change existing records.</p>
    <p className="hint">Export as CSV UTF-8. File size is in bytes; legacy IDs remain text, including leading zeros. Blank/NULL destination or related legacy ID is stored as empty and must be filled before translation. A destination, when provided, must be one of the upload table aliases listed below.</p>
    <p className="hint">A new FILE app Record ID is generated for each new row. Matching existing metadata is skipped. Duplicate filenames and conflicting existing metadata are flagged, never overwritten. Reads all existing record pages and processes up to four rows at a time. Back up your data, stop other file imports/uploads, and keep this page open while importing. Download results before leaving; they are held in memory only.</p>
    <div className="hub-form-grid"><label className="hub-form-field"><span>CSV file (maximum 25 MB)</span><input type="file" accept=".csv,text/csv" disabled={busy || locked} onChange={(event) => { reset(); setFile(event.target.files?.[0] || null) }} /></label></div>
    <p className="hint"><code>{COMPASS_FILE_CSV_HEADERS.join(', ')}</code></p>
    <div className="hub-form-editor-actions">
      <button type="button" className="secondary" disabled={busy || locked} onClick={() => downloadCsv('compass-files-import-template.csv', COMPASS_FILE_CSV_HEADERS.join(',') + '\r\n')}>Download CSV Template</button>
      <button type="button" className="secondary" disabled={busy || locked || !file} onClick={() => { void run(true) }}>Preview CSV Import</button>
      <button type="button" className="primary" disabled={busy || locked || !plan || !reviewed || !counts.ready} onClick={() => { void run(false) }}>Import Ready Metadata Rows</button>
      {busy ? <button type="button" className="secondary" onClick={() => { setStatus('Stopping after the in-flight request settles...'); controller.current?.abort() }}>Stop CSV Import</button> : null}
      <button type="button" className="secondary" disabled={!report.current.size} onClick={() => downloadCsv('compass-files-csv-import-results.csv', compassFileCsvResults([...report.current.values()]))}>Download CSV Preview / Results</button>
    </div>
    {plan ? <label className="permission-check"><input type="checkbox" disabled={busy || locked} checked={reviewed} onChange={(event) => setReviewed(event.target.checked)} /><span>I reviewed the preview and understand this imports metadata only, not file contents.</span></label> : null}
    <p className="hint" role="status" aria-live="polite">{status}</p>{error ? <p className="error" role="alert">{error}</p> : null}
    {Object.keys(counts).length ? <p className="hint">Ready at preview: {counts.ready || 0} · Already exists: {counts.existing || 0} · Issues: {counts.issue || 0} · Confirmed imports: {imported}</p> : null}
    {sample.length ? <><p className="hint">Showing the first 100 CSV rows. Download the full preview/results for all rows.</p><div className="hub-search-results-table-wrap"><table className="hub-search-results-table"><thead><tr><th>CSV line</th><th>Filename</th><th>Destination alias</th><th>Migration batch</th><th>Bytes</th><th>Legacy ID</th><th>App Record ID</th><th>Result</th><th>Details</th></tr></thead><tbody>{sample.map((row) => <tr key={row.line}><td>{row.line}</td><td>{row.values.cmps_filename}</td><td>{row.values.cmps_destinationtablename || '(blank)'}</td><td>{row.values.cmps_migrationbatch}</td><td>{row.values.cmps_filesize}</td><td>{row.values.cmps_relatedrecordidlegacy}</td><td>{row.recordId}</td><td>{row.state}</td><td>{row.message}</td></tr>)}</tbody></table></div></> : null}
  </section>
}
