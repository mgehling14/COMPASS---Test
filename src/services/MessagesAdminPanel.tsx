import { useEffect, useRef, useState, type FormEvent } from 'react'
import { archiveMessage, generateNextMessageRecordId, loadMessages, MESSAGE_TYPES, MESSAGE_REFRESH_CHOICES, messageDateTimeForInput, messagesSupportArchive, messageStatus, saveMessage, validateMessageDraft, type MessageDraft, type MessageRecord } from './messages'
import './Messages.css'
import RecordSaveDialog from './RecordSaveDialog'
import { type RecordSaveResult } from './recordSaveResult'
import { confirmSavedRecordId, SaveConfirmationPendingError } from './savedRecordConfirmation'

const emptyDraft = (): MessageDraft => ({ cmps_recordid: '', cmps_messagename: '', cmps_startdatetime: '', cmps_enddatetime: '', cmps_type: String(MESSAGE_TYPES[0].value), cmps_message: '', cmps_rr: '125570001', cmps_versionnumber: '' })

export default function MessagesAdminPanel({ canManage, savedBy, onBackToSearch }: { canManage: boolean; savedBy: string; onBackToSearch?: () => void }) {
  const [saveResult, setSaveResult] = useState<RecordSaveResult | null>(null)
  const pendingConfirmation = useRef('')
  const [records, setRecords] = useState<MessageRecord[]>([])
  const [draft, setDraft] = useState<MessageDraft | null>(null)
  const [editingId, setEditingId] = useState('')
  const [loading, setLoading] = useState(false)
  const [busy, setBusy] = useState(false)
  const [refresh, setRefresh] = useState(0)
  const [supportsArchive, setSupportsArchive] = useState(false)
  const [error, setError] = useState('')
  const [status, setStatus] = useState('')
  const active = useRef(false), mounted = useRef(false), authorized = useRef(canManage)
  authorized.current = canManage
  useEffect(() => { mounted.current = true; return () => { mounted.current = false } }, [])
  useEffect(() => {
    if (!canManage) return
    let disposed = false
    const controller = new AbortController()
    setLoading(true); setError('')
    void Promise.all([loadMessages('admin', Date.now(), controller.signal), messagesSupportArchive()]).then(([rows, archive]) => {
      if (!disposed) { setRecords(rows); setSupportsArchive(archive) }
    }).catch((failure) => { if (!disposed) setError(String(failure?.message || failure)) })
      .finally(() => { if (!disposed) setLoading(false) })
    return () => { disposed = true; controller.abort() }
  }, [canManage, refresh])

  async function add() {
    if (!authorized.current || active.current || loading) return
    active.current = true; setBusy(true); setError(''); setStatus('')
    try {
      const recordId = await generateNextMessageRecordId()
      pendingConfirmation.current = ''
      if (mounted.current && authorized.current) { setEditingId(''); setDraft({ ...emptyDraft(), cmps_recordid: recordId }) }
    } catch (failure) { if (mounted.current) setError(String((failure as Error)?.message || failure)) }
    finally { active.current = false; if (mounted.current) setBusy(false) }
  }
  function edit(record: MessageRecord) {
    if (!authorized.current || active.current || loading) return
    setEditingId(record.id)
    pendingConfirmation.current = ''
    setDraft({ ...record, cmps_startdatetime: messageDateTimeForInput(record.cmps_startdatetime), cmps_enddatetime: messageDateTimeForInput(record.cmps_enddatetime) })
    setError(''); setStatus('')
  }
  async function submit(event: FormEvent) {
    event.preventDefault()
    if (!authorized.current || active.current || !draft) return
    const invalid = validateMessageDraft(draft)
    const result = (status: RecordSaveResult['status'], rowId: string, details = ''): RecordSaveResult => ({ status, rowId, formName: 'Message', recordId: draft.cmps_recordid, isNew: !editingId, details })
    if (invalid) { setError(invalid); setSaveResult(result('failed', editingId, invalid)); return }
    active.current = true; setBusy(true); setError(''); setStatus('')
    try {
      let rowId = editingId
      if (!rowId && pendingConfirmation.current) {
        rowId = await confirmSavedRecordId('cmps_messageses', pendingConfirmation.current)
        pendingConfirmation.current = ''
        setEditingId(rowId)
      }
      const saved = await saveMessage(rowId, draft, savedBy)
      rowId = saved.id || rowId
      if (!rowId) {
        pendingConfirmation.current = draft.cmps_recordid
        rowId = await confirmSavedRecordId('cmps_messageses', draft.cmps_recordid)
      }
      pendingConfirmation.current = ''
      if (mounted.current && authorized.current) {
        setEditingId(rowId)
        setSaveResult(result('saved', rowId))
        setStatus(`Saved message ${draft.cmps_recordid}. It will appear on Home during its scheduled window.`)
        setRefresh((value) => value + 1)
      }
    } catch (failure) { if (mounted.current) { const details = String((failure as Error)?.message || failure); setError(details); setSaveResult(result(failure instanceof SaveConfirmationPendingError ? 'unconfirmed' : 'failed', editingId, details)) } }
    finally { active.current = false; if (mounted.current) setBusy(false) }
  }
  async function archive(record: MessageRecord) {
    if (!authorized.current || active.current || loading || !window.confirm(`Archive message ${record.cmps_recordid || record.cmps_messagename}? It will no longer appear on Home. IT Admin can restore it in Archived Records.`)) return
    active.current = true; setBusy(true); setError(''); setStatus('')
    try {
      await archiveMessage(record.id, true, savedBy)
      if (mounted.current && authorized.current) { setStatus('Message archived. Restore it through Archived Records if needed.'); setRefresh((value) => value + 1) }
    } catch (failure) { if (mounted.current) setError(String((failure as Error)?.message || failure)) }
    finally { active.current = false; if (mounted.current) setBusy(false) }
  }
  if (!canManage) return null
  const timezone = Intl.DateTimeFormat().resolvedOptions().timeZone
  const displayDate = (value: string) => Number.isFinite(Date.parse(value)) ? new Date(value).toLocaleString() : 'Not set'
  return <section className="role-admin-section messages-admin" aria-labelledby="messages-admin-title">
    {saveResult ? <RecordSaveDialog result={saveResult} onChoose={(choice) => {
      if (choice === 'search') { setDraft(null); setEditingId(''); pendingConfirmation.current = ''; onBackToSearch?.() }
      setSaveResult(null)
    }} /> : null}
    <h3 id="messages-admin-title">Home Messages</h3>
    <p className="hint">Create and schedule messages for all COMPASS users. Only the Message text is displayed on Home; Message Name is for administration.</p>
    <div className="hub-form-editor-actions"><button type="button" className="primary" disabled={busy || loading || !!draft} onClick={() => { void add() }}>Add Message</button><button type="button" className="secondary" disabled={busy || loading} onClick={() => setRefresh((value) => value + 1)}>Refresh Messages</button></div>
    {status ? <p className="success" role="status">{status}</p> : null}
    {error ? <p className="error" role="alert">{error}</p> : null}
    {draft ? <form className="messages-editor" onSubmit={(event) => { void submit(event) }}>
      <h4>{editingId ? 'Edit Message' : 'New Message'}</h4>
      <p className="hint">Times use your local timezone ({timezone}). The message appears at the start time and stops displaying at the end time.</p>
      <fieldset disabled={busy}><legend className="sr-only">Message details</legend><div className="messages-fields">
        <label className="hub-form-field"><span>Record ID</span><input value={draft.cmps_recordid} readOnly /></label>
        <label className="hub-form-field"><span>Message Name *</span><input required value={draft.cmps_messagename} onChange={(event) => setDraft({ ...draft, cmps_messagename: event.target.value })} /></label>
        <label className="hub-form-field"><span>Section *</span><select required value={draft.cmps_type} onChange={(event) => setDraft({ ...draft, cmps_type: event.target.value })}><option value="">Choose a section</option>{MESSAGE_TYPES.map((type) => <option key={type.value} value={String(type.value)}>{type.label}</option>)}</select></label>
        <fieldset className="messages-refresh-field"><legend>Refresh Required?</legend><div className="messages-refresh-options">{MESSAGE_REFRESH_CHOICES.map((choice) => <label className="permission-check" key={choice.value}><input type="radio" name="message-refresh-required" value={String(choice.value)} checked={(draft.cmps_rr || '125570001') === String(choice.value)} onChange={() => setDraft({ ...draft, cmps_rr: String(choice.value) })} /><span>{choice.label}</span></label>)}</div><p className="hint">Yes shows a refresh banner while this message is visible on Home.</p></fieldset>
        {['125570000', 'yes'].includes(String(draft.cmps_rr || '').trim().toLowerCase()) ? <label className="hub-form-field"><span>Version Number</span><input type="text" value={draft.cmps_versionnumber || ''} onChange={(event) => setDraft({ ...draft, cmps_versionnumber: event.target.value })} /><span className="hint">Enter the version bundled with the new release. Matching versions hide the banner. Leave blank for a general refresh reminder.</span></label> : null}
        <label className="hub-form-field"><span>Start Date/Time *</span><input type="datetime-local" step="1" required value={draft.cmps_startdatetime} onChange={(event) => setDraft({ ...draft, cmps_startdatetime: event.target.value })} /></label>
        <label className="hub-form-field"><span>End Date/Time *</span><input type="datetime-local" step="1" required value={draft.cmps_enddatetime} onChange={(event) => setDraft({ ...draft, cmps_enddatetime: event.target.value })} /></label>
        <label className="hub-form-field messages-body-field"><span>Message *</span><textarea required rows={5} value={draft.cmps_message} onChange={(event) => setDraft({ ...draft, cmps_message: event.target.value })} /></label>
      </div></fieldset>
      <div className="hub-form-editor-actions"><button type="submit" className="primary" disabled={busy}>{busy ? 'Saving...' : 'Save Message'}</button><button type="button" className="secondary" disabled={busy} onClick={() => { setDraft(null); setEditingId(''); setError('') }}>Cancel</button></div>
    </form> : null}
    {loading ? <p className="hint" role="status">Loading messages...</p> : null}
    <div className="messages-table-wrap"><table className="record-table"><caption>Scheduled and previously displayed messages</caption><thead><tr><th>Actions</th><th>Record ID</th><th>Message Name</th><th>Section</th><th>Start Date/Time</th><th>End Date/Time</th><th>Visibility</th><th>Message</th></tr></thead>
      <tbody>{records.length ? records.map((record) => <tr key={record.id}><td><button type="button" className="secondary" disabled={busy || loading || !!draft} onClick={() => edit(record)}>Edit</button>{supportsArchive ? <button type="button" className="secondary" disabled={busy || loading || !!draft} onClick={() => { void archive(record) }}>Archive</button> : null}</td><td>{record.cmps_recordid}</td><td>{record.cmps_messagename}</td><td>{MESSAGE_TYPES.find((type) => String(type.value) === record.cmps_type)?.label || 'Unknown section'}</td><td>{displayDate(record.cmps_startdatetime)}</td><td>{displayDate(record.cmps_enddatetime)}</td><td>{messageStatus(record)}</td><td className="messages-record-text">{record.cmps_message}</td></tr>) : <tr><td colSpan={8}>{loading ? 'Loading...' : 'No messages found. Add a message to get started.'}</td></tr>}</tbody></table></div>
  </section>
}
