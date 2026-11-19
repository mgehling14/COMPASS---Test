import { useEffect, useRef, useState } from 'react'
import { createHouseholdBackfillGateway, previewHouseholdHistoryBackfill, createMissingHouseholdHistories, type HouseholdBackfillProgress } from './householdHistoryBackfill'

export default function HouseholdHistoryBackfillPanel({ savedBy }: { savedBy: string }) {
  const [progress, setProgress] = useState<HouseholdBackfillProgress | null>(null)
  const [reviewed, setReviewed] = useState(false)
  const [busy, setBusy] = useState(false)
  const [error, setError] = useState('')
  const [status, setStatus] = useState('')
  const controller = useRef<AbortController | null>(null)
  const active = useRef(false)
  const mounted = useRef(true)
  const gateway = useRef(createHouseholdBackfillGateway(savedBy))
  useEffect(() => {
    mounted.current = true
    return () => { mounted.current = false; controller.current?.abort() }
  }, [])

  async function run(create: boolean) {
    if (active.current || (create && !reviewed)) return
    active.current = true
    const abort = new AbortController()
    controller.current = abort
    setBusy(true); setError(''); setStatus(''); setReviewed(false); setProgress(null)
    const update = (value: HouseholdBackfillProgress) => { if (mounted.current) setProgress(value) }
    try {
      if (create) {
        const result = await createMissingHouseholdHistories(gateway.current, abort.signal, update)
        if (mounted.current) setStatus(`Created ${result.created.toLocaleString()} active Household History record(s). ${result.skipped.toLocaleString()} clients skipped after rechecking. Reopen the Household form to refresh its member dropdown.`)
      } else {
        await previewHouseholdHistoryBackfill(gateway.current, abort.signal, update)
        if (mounted.current) { setReviewed(true); setStatus('Preview complete. No records were changed.') }
      }
    } catch (failure) {
      if (mounted.current) setError(abort.signal.aborted ? 'Stopped. In-flight creates have settled; completed records are retained. Run Preview again before retrying.' : String((failure as Error)?.message || failure))
    } finally {
      active.current = false
      if (mounted.current) setBusy(false)
    }
  }

  return <section className="role-admin-section">
    <h3>Household History</h3>
    <p className="hint">Create an Active, unassigned Household History for each non-archived Client Profile with no existing history. This makes those clients available in the Household member dropdown.</p>
    <p className="hint">Existing histories are preserved, including inactive, archived, household-assigned, and matching legacy histories. This does not create households, assign members, or reactivate previous histories. Run only one backfill at a time.</p>
    <div className="hub-form-editor-actions">
      <button type="button" className="secondary" disabled={busy} onClick={() => { void run(false) }}>Preview Missing Histories</button>
      <button type="button" className="primary" disabled={busy || !reviewed || !progress?.eligible} onClick={() => { void run(true) }}>Create Active Histories{reviewed && progress ? ` (${progress.eligible.toLocaleString()})` : ''}</button>
      {busy ? <button type="button" className="secondary" onClick={() => controller.current?.abort()}>Stop</button> : null}
    </div>
    {progress ? <p className="hint" role="status">Phase: {progress.phase} | Client Profiles scanned: {progress.clientsScanned.toLocaleString()} | Histories scanned: {progress.historiesScanned.toLocaleString()} | Missing: {progress.eligible.toLocaleString()} | Existing history: {progress.existing.toLocaleString()} | Archived clients: {progress.archived.toLocaleString()} | Created: {progress.created.toLocaleString()} | Recheck skipped: {progress.skipped.toLocaleString()}</p> : null}
    {status ? <p className="success" role="status">{status}</p> : null}
    {error ? <p className="error" role="alert">{error}</p> : null}
  </section>
}
