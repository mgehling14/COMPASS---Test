import { useEffect, useRef, useState } from 'react'
import { DEFAULT_DIVISION_CODE } from './recordIds'
import {
  LEGACY_MIGRATION_TABLES, EMPTY_MIGRATION_COUNTS, createMigrationGateway,
  inspectLegacyMigrationTable, migrationFingerprint, migrationIssueCsv, migrationChangeCsv, runLegacyMigration,
  type MigrationCheckpoint, type MigrationIssue, type MigrationChange, type MigrationOptions, type MigrationPlan, type MigrationProgress,
} from './legacyRecordMigration'

const REPORT_HEADER = 'Dataverse Row ID,Legacy Record ID,Parent Legacy ID,Issue\r\n'
const CHANGE_HEADER = 'Dataverse Row ID,Previous Record ID,New Record ID,Lookup Column,Previous Lookup GUID,New Lookup GUID\r\n'
const initialProgress: MigrationProgress = { ...EMPTY_MIGRATION_COUNTS, phase: 'reading', parentRecords: 0 }

export default function LegacyRecordMigrationPanel({ userIdentity }: { userIdentity: string }) {
  const [tableKey, setTableKey] = useState('client-profile')
  const [migrateLinks, setMigrateLinks] = useState(true)
  const [replaceExisting, setReplaceExisting] = useState(false)
  const [lookupAttribute, setLookupAttribute] = useState('')
  const [plan, setPlan] = useState<MigrationPlan | null>(null)
  const [busy, setBusy] = useState(false)
  const [preview, setPreview] = useState(true)
  const [previewFingerprint, setPreviewFingerprint] = useState('')
  const [progress, setProgress] = useState<MigrationProgress | null>(null)
  const [checkpoint, setCheckpoint] = useState<MigrationCheckpoint | null>(null)
  const [error, setError] = useState('')
  const [status, setStatus] = useState('')
  const [issues, setIssues] = useState<MigrationIssue[]>([])
  const [changeSamples, setChangeSamples] = useState<MigrationChange[]>([])
  const report = useRef<string[]>([REPORT_HEADER])
  const changes = useRef<string[]>([CHANGE_HEADER])
  const controller = useRef<AbortController | null>(null)
  const active = useRef(false)
  const mounted = useRef(true)
  const gateway = useRef(createMigrationGateway())
  const definition = LEGACY_MIGRATION_TABLES.find((entry) => entry.key === tableKey)!
  const options = (isPreview: boolean): MigrationOptions => ({ preview: isPreview, migrateLinks, replaceExisting, lookupAttribute })
  const storageKey = `compass:legacy-migration:v2:${encodeURIComponent(userIdentity)}:${tableKey}`

  useEffect(() => {
    mounted.current = true
    return () => { mounted.current = false; controller.current?.abort() }
  }, [])

  useEffect(() => {
    setCheckpoint(null)
    try {
      const saved = JSON.parse(sessionStorage.getItem(storageKey) || 'null') as MigrationCheckpoint | null
      if (saved?.version === 2 && !saved.complete && typeof saved.fingerprint === 'string' && typeof saved.nextLink === 'string' && Object.keys(EMPTY_MIGRATION_COUNTS).every((key) => Number.isSafeInteger(saved.counts?.[key as keyof typeof EMPTY_MIGRATION_COUNTS]) && saved.counts[key as keyof typeof EMPTY_MIGRATION_COUNTS] >= 0)) {
        // Settings are restored, but metadata and lookup targets are rechecked
        // before any writes. No client names or legacy IDs are stored here.
        const parsed = JSON.parse(saved.fingerprint)
        const settings = parsed.at(-1) as MigrationOptions
        setMigrateLinks(settings.migrateLinks === true)
        setReplaceExisting(settings.replaceExisting === true)
        setLookupAttribute(String(settings.lookupAttribute || ''))
        setCheckpoint(saved)
      }
    } catch { /* Session storage may be disabled; in-memory resume still works. */ }
  }, [storageKey])

  function clearReview() {
    setPlan(null); setPreviewFingerprint(''); setError(''); setStatus(''); setProgress(null)
    setIssues([]); report.current = [REPORT_HEADER]
    setChangeSamples([])
    changes.current = [CHANGE_HEADER]
  }

  async function inspect() {
    if (active.current) return
    active.current = true; setBusy(true); setPlan(null); setPreviewFingerprint(''); setError(''); setStatus('Checking table and lookup metadata...')
    const abort = new AbortController(); controller.current = abort
    try {
      const checked = await inspectLegacyMigrationTable(tableKey, gateway.current, abort.signal, migrateLinks)
      if (!mounted.current) return
      setPlan(checked)
      const selected = checked.lookups.find((lookup) => lookup.ReferencingAttribute === lookupAttribute)
        || checked.lookups.find((lookup) => lookup.ReferencingAttribute === (checked.definition.key === 'services' ? 'cmps_programenrollment' : 'cmps_cpid'))
        || (checked.lookups.length === 1 ? checked.lookups[0] : undefined)
      setLookupAttribute(selected?.ReferencingAttribute || '')
      setStatus('Mapping checked. Run a read-only preview before translating this table.')
      if (migrateLinks && definition.parentKey && !checked.lookups.length) setError('This table has no writable lookup to the required parent table. Add the lookup in Dataverse, or explicitly choose Record IDs only.')
    } catch (failure) {
      if (mounted.current) { setError(String((failure as Error)?.message || failure)); setStatus('') }
    } finally {
      active.current = false
      if (mounted.current) setBusy(false)
    }
  }

  function saveCheckpoint(value: MigrationCheckpoint) {
    if (!mounted.current) return
    setCheckpoint(value)
    try {
      if (value.complete) sessionStorage.removeItem(storageKey)
      else sessionStorage.setItem(storageKey, JSON.stringify(value))
    } catch { /* Keep the checkpoint in memory when storage is unavailable. */ }
  }

  async function run(isPreview: boolean, resume = false) {
    if (!plan || active.current) return
    active.current = true; setBusy(true); setError(''); setPreview(isPreview); setStatus('')
    if (isPreview) setPreviewFingerprint('')
    setProgress({ ...initialProgress, ...(resume ? checkpoint?.counts : {}) })
    if (!resume) { setIssues([]); setChangeSamples([]); report.current = [REPORT_HEADER]; changes.current = [CHANGE_HEADER] }
    const abort = new AbortController(); controller.current = abort
    try {
      // Refresh schema at the start of every run, even when resuming.
      const checked = await inspectLegacyMigrationTable(tableKey, gateway.current, abort.signal, migrateLinks)
      const settings = options(isPreview)
      if (!isPreview && !resume && previewFingerprint !== migrationFingerprint(checked, options(true))) throw new Error('Run the preview again after changing the table, mapping, or replacement setting.')
      const result = await runLegacyMigration(checked, settings, gateway.current, abort.signal, {
        progress: (value) => { if (mounted.current) setProgress(value) },
        checkpoint: (value) => { if (!isPreview) saveCheckpoint(value) },
        issue: (value) => {
          report.current.push(migrationIssueCsv(value))
          if (mounted.current) setIssues((current) => current.length < 100 ? [...current, value] : current)
        },
        change: (value) => {
          changes.current.push(migrationChangeCsv(value))
          if (mounted.current && changes.current.length <= 101) setChangeSamples((current) => [...current, value])
        },
      }, resume && checkpoint ? checkpoint : undefined)
      if (mounted.current) {
        setStatus(`${isPreview ? 'Preview' : 'Translation'} complete for ${definition.label}. ${result.counts.issues ? 'Review the issue report; unresolved records need attention.' : 'No issues found.'}`)
        if (isPreview) setPreviewFingerprint(migrationFingerprint(checked, options(true)))
      }
    } catch (failure) {
      if (mounted.current) {
        if (abort.signal.aborted) setStatus('Stopped. Completed updates are kept. Resume restarts the unfinished page safely.')
        else setError(String((failure as Error)?.message || failure))
        setProgress((current) => current ? { ...current, phase: 'stopped' } : current)
      }
    } finally {
      active.current = false
      if (mounted.current) setBusy(false)
    }
  }

  function downloadReport(kind: 'issues' | 'changes') {
    const blob = new Blob(['\uFEFF', ...(kind === 'issues' ? report.current : changes.current)], { type: 'text/csv;charset=utf-8' })
    const url = URL.createObjectURL(blob)
    const anchor = document.createElement('a')
    anchor.href = url; anchor.download = `legacy-migration-${tableKey}-${preview ? 'preview' : 'translation'}-${kind}.csv`; anchor.click()
    setTimeout(() => URL.revokeObjectURL(url), 1000)
  }

  const validLookup = !migrateLinks || !definition.parentKey || (!!plan?.lookups.some((entry) => entry.ReferencingAttribute === lookupAttribute) && (definition.additionalParents || []).every((mapping) => plan?.additionalParents?.some((entry) => entry.parentDefinition.key === mapping.parentKey && entry.parentLegacyField === mapping.parentLegacyField && entry.lookup.ReferencingAttribute === mapping.lookupAttribute)))
  const canResume = !!plan && !!checkpoint && !checkpoint.complete && checkpoint.fingerprint === migrationFingerprint(plan, options(false))
  const reviewed = !!plan && previewFingerprint === migrationFingerprint(plan, options(true))

  return <section className="funder-admin-panel legacy-migration-panel">
    <h3>Legacy Record Migration</h3>
    <p className="hint">Process one selected table per run. Records with legacy IDs receive new sequential app IDs in cmps_recordid, continuing after the highest existing app ID in this table. Parent links still match the original legacy columns and use Dataverse GUIDs. Legacy columns and existing valid app IDs are never changed.</p>
    <p className="hint">Includes active and archived records. Reads pages of 1,000 records with up to four updates in flight and retries throttled requests. Keep this tab open during a run. Stop before leaving this page; returning or refreshing this same tab can resume from the last completed page.</p>
    <p className="hint">Legacy IDs are matched as text with outer whitespace trimmed; leading zeros are preserved. Avoid editing or importing into these tables during migration. Back up your data before enabling replacement. Records added during a run may require another run.</p>
    <p className="hint">Download the preview’s change report before translating to review old/new values. Reports stay in memory only; download them before leaving or refreshing this page.</p>
    <div className="hub-form-grid">
      <label className="hub-form-field"><span>Table</span><select value={tableKey} disabled={busy} onChange={(event) => { setTableKey(event.target.value); clearReview() }}>
        {LEGACY_MIGRATION_TABLES.map((table) => <option key={table.key} value={table.key}>{table.label}</option>)}
      </select></label>
      <label className="hub-form-field"><span>Operation</span><select value={migrateLinks ? 'links' : 'ids'} disabled={busy} onChange={(event) => { setMigrateLinks(event.target.value === 'links'); clearReview() }}>
        <option value="links">Generate App Record IDs and resolve parent lookups</option><option value="ids">App Record IDs only</option>
      </select></label>
      <div className="hub-form-field"><span>New app Record ID format</span><code>{definition.recordIdPrefix}-{DEFAULT_DIVISION_CODE}&lt;next sequence&gt; → cmps_recordid</code><span className="hint">{definition.legacyIdField} stays unchanged. IDs copied from it by the previous migration are repaired automatically.</span></div>
      {definition.parentKey ? <div className="hub-form-field"><span>Parent legacy ID</span><code>{definition.parentLegacyField}</code><span className="hint">Match against {LEGACY_MIGRATION_TABLES.find((entry) => entry.key === definition.parentKey)?.label}.{LEGACY_MIGRATION_TABLES.find((entry) => entry.key === definition.parentKey)?.legacyIdField}</span></div> : null}
      {plan && migrateLinks && definition.parentKey ? <label className="hub-form-field"><span>Verified destination lookup</span><select value={lookupAttribute} disabled={busy} onChange={(event) => { setLookupAttribute(event.target.value); setPreviewFingerprint('') }}>
        <option value="">Choose a lookup</option>{plan.lookups.map((lookup) => <option key={lookup.ReferencingAttribute} value={lookup.ReferencingAttribute}>{lookup.ReferencingAttribute} → {plan.parent?.LogicalName}</option>)}
      </select></label> : null}
      {definition.additionalParents?.map((mapping) => <div className="hub-form-field" key={mapping.lookupAttribute}>
        <span>{mapping.whenPrimaryUnresolved ? 'Fallback parent link' : 'Additional parent link'}: {LEGACY_MIGRATION_TABLES.find((entry) => entry.key === mapping.parentKey)?.label}</span>
        <code>{mapping.parentLegacyField} -&gt; {mapping.lookupAttribute}</code>
        <span className="hint">Match against {LEGACY_MIGRATION_TABLES.find((entry) => entry.key === mapping.parentKey)?.label}.{LEGACY_MIGRATION_TABLES.find((entry) => entry.key === mapping.parentKey)?.legacyIdField}. {mapping.whenPrimaryUnresolved ? 'Used only when the Program Enrollment legacy ID cannot be uniquely matched and no enrollment lookup is already set. A successful client fallback resolves the missing enrollment issue.' : 'Both parent links are processed in the same run when resolving lookups.'}</span>
        {migrateLinks && plan?.additionalParents?.some((entry) => entry.lookup.ReferencingAttribute === mapping.lookupAttribute) ? <span className="hint">Lookup verified against Dataverse metadata.</span> : null}
      </div>)}
    </div>
    <label className="permission-check legacy-migration-replacement"><input type="checkbox" checked={replaceExisting} disabled={busy} onChange={(event) => { setReplaceExisting(event.target.checked); setPreviewFingerprint('') }} /><span>Replace other non-app Record IDs and different lookup links. Existing valid app IDs are preserved. Review the preview first.</span></label>
    <div className="funder-admin-record-actions">
      <button type="button" className="secondary" disabled={busy} onClick={() => { void inspect() }}>Check Table Mapping</button>
      <button type="button" className="secondary" disabled={busy || !plan || !validLookup} onClick={() => { void run(true) }}>Preview Selected Table</button>
      <button type="button" className="primary" disabled={busy || !reviewed || !validLookup} onClick={() => { void run(false) }}>Translate Selected Table</button>
      {checkpoint && !checkpoint.complete ? <button type="button" className="secondary" disabled={busy || !canResume} onClick={() => { void run(false, true) }}>Resume Selected Table</button> : null}
      {busy ? <button type="button" className="secondary" onClick={() => { controller.current?.abort(); setStatus('Stopping after in-flight requests settle...') }}>Stop</button> : null}
      {report.current.length > 1 ? <button type="button" className="secondary" onClick={() => downloadReport('issues')}>Download Issue Report</button> : null}
      {changes.current.length > 1 ? <button type="button" className="secondary" onClick={() => downloadReport('changes')}>Download Change Report</button> : null}
    </div>
    {status ? <p className="hint" role="status">{status}</p> : null}
    {error ? <p className="error" role="alert">{error}</p> : null}
    {checkpoint && !checkpoint.complete && !canResume && !busy ? <p className="hint">An unfinished translation exists. Check its table mapping with the same lookup and replacement settings to enable Resume.</p> : null}
    {progress ? <div className="legacy-migration-progress" role="status" aria-live="polite">
      <p>{preview ? 'Read-only preview' : 'Translation'}: {progress.phase}. {progress.parentRecords.toLocaleString()} parent records indexed.</p>
      <dl>
        <div><dt>Records read</dt><dd>{progress.read.toLocaleString()}</dd></div>
        <div><dt>Existing IDs scanned</dt><dd>{(progress.sequenceRecords || 0).toLocaleString()}</dd></div>
        <div><dt>Current phase page</dt><dd>{(progress.phasePage || 0).toLocaleString()}</dd></div>
        <div><dt>{preview ? 'Would update' : 'Updated'}</dt><dd>{progress.updated.toLocaleString()}</dd></div>
        <div><dt>Record IDs</dt><dd>{progress.recordIds.toLocaleString()}</dd></div>
        <div><dt>Lookup links</dt><dd>{progress.links.toLocaleString()}</dd></div>
        <div><dt>Unchanged</dt><dd>{progress.unchanged.toLocaleString()}</dd></div>
        <div><dt>Records with issues</dt><dd>{progress.issues.toLocaleString()}</dd></div>
        <div><dt>Failed updates</dt><dd>{progress.failed.toLocaleString()}</dd></div>
        <div><dt>Completed pages</dt><dd>{progress.pages.toLocaleString()}</dd></div>
      </dl>
    </div> : null}
    {changeSamples.length ? <>
      <h4>{preview ? 'Planned changes' : 'Confirmed changes'}</h4>
      <p className="hint">Showing the first {changeSamples.length} changes. Download the change report for all changes in this session.</p>
      <div className="hub-search-results-table-wrap"><table className="hub-search-results-table"><thead><tr><th>Dataverse Row ID</th><th>Previous Record ID</th><th>New App Record ID</th><th>Lookup Column</th><th>Previous Lookup GUID</th><th>New Lookup GUID</th></tr></thead><tbody>
        {changeSamples.map((change, index) => <tr key={`${change.id}-${index}`}><td>{change.id}</td><td>{change.previousRecordId || '-'}</td><td>{change.recordId || '-'}</td><td>{change.lookupField || '-'}</td><td>{change.previousLookupId || '-'}</td><td>{change.lookupId || '-'}</td></tr>)}
      </tbody></table></div>
    </> : null}
    {issues.length ? <>
      <p className="hint">Showing the first {issues.length} issues. The CSV contains all issues reported in this session; download it before leaving or refreshing. Resumed runs recheck the unfinished page. Rerun the table after fixing unresolved matches or failed updates.</p>
      <div className="hub-search-results-table-wrap"><table className="hub-search-results-table"><thead><tr><th>Dataverse Row ID</th><th>Legacy ID</th><th>Parent Legacy ID</th><th>Issue</th></tr></thead><tbody>
        {issues.map((issue, index) => <tr key={`${issue.id}-${index}`}><td>{issue.id || '-'}</td><td>{issue.legacyId || '-'}</td><td>{issue.parentLegacyId || '-'}</td><td>{issue.message}</td></tr>)}
      </tbody></table></div>
    </> : null}
  </section>
}
