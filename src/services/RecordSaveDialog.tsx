import { useEffect, useRef, useState } from 'react'
import { recordSaveMessage, type RecordSaveChoice, type RecordSaveResult } from './recordSaveResult'
import './RecordSaveDialog.css'

export default function RecordSaveDialog({ result, canOpenClient = false, clientUnavailableReason = 'This record does not have a linked Client Profile.', canCreateAnotherService = false, onCreateAnotherService, onChoose }: {
  result: RecordSaveResult; canOpenClient?: boolean; clientUnavailableReason?: string; onChoose: (choice: RecordSaveChoice) => void | Promise<void>
  canCreateAnotherService?: boolean; onCreateAnotherService?: (copyServiceNotes: boolean) => void | Promise<void>
}) {
  const dialog = useRef<HTMLDialogElement | null>(null)
  const choosing = useRef(false)
  const [busy, setBusy] = useState(false)
  const [error, setError] = useState('')
  const [copyServiceNotes, setCopyServiceNotes] = useState(false)
  const showCreateAnotherService = result.formKind === 'services' && result.status === 'saved' && canCreateAnotherService && !!onCreateAnotherService
  useEffect(() => {
    const element = dialog.current
    const previous = document.activeElement as HTMLElement | null
    if (element && !element.open) element.showModal()
    return () => { element?.close(); if (previous?.isConnected) previous.focus() }
  }, [])
  async function choose(choice: RecordSaveChoice) {
    if (choosing.current || choice !== 'remain' && result.status !== 'saved' || choice === 'client' && !canOpenClient) return
    choosing.current = true; setBusy(true); setError('')
    try { await onChoose(choice) }
    catch (failure) { setError(String((failure as Error)?.message || failure)) }
    finally { choosing.current = false; setBusy(false) }
  }
  async function createAnotherService() {
    if (choosing.current || !showCreateAnotherService) return
    choosing.current = true; setBusy(true); setError('')
    try { await onCreateAnotherService?.(copyServiceNotes) }
    catch (failure) { setError(String((failure as Error)?.message || failure)) }
    finally { choosing.current = false; setBusy(false) }
  }
  return <dialog ref={dialog} className="record-save-dialog" aria-labelledby="record-save-title" aria-describedby="record-save-message" onCancel={(event) => { event.preventDefault(); void choose('remain') }}>
    <p className="eyebrow">Form save</p>
    <h2 id="record-save-title">{result.status === 'saved' ? 'Record saved' : result.status === 'failed' ? 'Record not saved' : 'Save needs attention'}</h2>
    <p id="record-save-message">{recordSaveMessage(result)}</p>
    {result.details ? <p className={result.status === 'saved' ? 'hint record-save-details' : 'error record-save-details'}>{result.details}</p> : null}
    {result.status !== 'saved' ? <p className="hint">Choose “Remain on current record” to review or retry. Navigation is disabled until the save is complete.</p> : null}
    {!canOpenClient && result.status === 'saved' ? <p className="hint">{clientUnavailableReason}</p> : null}
    {error ? <p className="error" role="alert">{error}</p> : null}
    <div className="record-save-actions">
      <button type="button" className="secondary" disabled={busy || result.status !== 'saved'} onClick={() => { void choose('search') }}>Back to search</button>
      <button type="button" className="primary" autoFocus disabled={busy} onClick={() => { void choose('remain') }}>Remain on current record</button>
      <button type="button" className="secondary" disabled={busy || result.status !== 'saved' || !canOpenClient} onClick={() => { void choose('client') }}>Open Client Profile</button>
    </div>
    {showCreateAnotherService ? <div className="record-save-another-service">
      <label className="record-save-copy-notes"><input type="checkbox" checked={copyServiceNotes} disabled={busy} onChange={(event) => setCopyServiceNotes(event.target.checked)} />Copy Service Notes</label>
      <p className="hint">Start a new Services record for this client and program enrollment. Only Service Notes will be copied if checked; other service details will be blank.</p>
      <button type="button" className="secondary" disabled={busy} onClick={() => { void createAnotherService() }}>Create another service</button>
    </div> : null}
    {busy ? <p className="hint" role="status">Opening your selected destination...</p> : null}
  </dialog>
}
