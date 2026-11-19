import { useMemo, useState } from 'react'
import { searchClientProfileRecordsPaged, type ClientProfileSearchRecord } from './clientProfile'
import {
  executeClientMergePlan,
  loadClientMergeInventory,
  type ClientMergeAction,
  type ClientMergeInventory,
  type ClientMergeRecord,
} from './clientMerge'
import './ClientMerge.css'

type Props = { canManage: boolean; savedBy: string; onMerged?: () => void }

function ProfilePicker({ label, selected, excludedId, disabled, onSelect }: {
  label: string; selected: ClientProfileSearchRecord | null; excludedId?: string; disabled: boolean
  onSelect: (profile: ClientProfileSearchRecord) => void
}) {
  const [query, setQuery] = useState('')
  const [rows, setRows] = useState<ClientProfileSearchRecord[]>([])
  const [busy, setBusy] = useState(false)
  const [error, setError] = useState('')
  async function search() {
    if (!query.trim()) { setRows([]); setError('Enter a client name or record ID.'); return }
    setBusy(true); setError('')
    try {
      const page = await searchClientProfileRecordsPaged(query, 1, 12)
      setRows(page.rows.filter((row) => row.id !== excludedId))
    } catch (reason) { setRows([]); setError(String((reason as Error)?.message || reason)) }
    finally { setBusy(false) }
  }
  return <section className="client-merge-picker">
    <h4>{label}</h4>
    <p className="hint">{label.startsWith('Primary') ? 'This profile remains active.' : 'This profile will be archived after the merge succeeds.'}</p>
    {selected ? <div className="client-merge-selected"><strong>{selected.name || selected.recordId}</strong><span>{selected.recordId || 'No Record ID'}{selected.hmisId ? ` · HMIS ${selected.hmisId}` : ''}</span></div> : null}
    <div className="client-merge-search"><input value={query} disabled={disabled} placeholder="Search client name or record ID" onChange={(event) => setQuery(event.target.value)} onKeyDown={(event) => { if (event.key === 'Enter') { event.preventDefault(); void search() } }} /><button type="button" className="secondary" disabled={disabled || busy} onClick={() => { void search() }}>{busy ? 'Searching…' : 'Search'}</button></div>
    {error ? <p className="error">{error}</p> : null}
    <div className="client-merge-results">{rows.map((row) => <button type="button" className={`client-merge-result${selected?.id === row.id ? ' selected' : ''}`} key={row.id} disabled={disabled} onClick={() => onSelect(row)}><strong>{row.name || '-'}</strong><span>{row.recordId || 'No Record ID'}{row.dateOfBirth ? ` · DOB ${row.dateOfBirth}` : ''}{row.hmisId ? ` · HMIS ${row.hmisId}` : ''}</span></button>)}</div>
  </section>
}

function ActionPicker({ value, targetId, targets, disabled, onChange, itemLabel }: {
  value: ClientMergeAction; targetId: string; targets: Array<{ id: string; label: string }>; disabled?: boolean
  onChange: (action: ClientMergeAction, targetId: string) => void; itemLabel: string
}) {
  return <div className="client-merge-action">
    <select aria-label={`${itemLabel} action`} disabled={disabled} value={value} onChange={(event) => onChange(event.target.value as ClientMergeAction, '')}>
      <option value="exclude">Do not carry over</option>
      <option value="move">Carry to primary</option>
      <option value="merge">Use existing duplicate</option>
    </select>
    {value === 'merge' ? <select aria-label={`${itemLabel} duplicate target`} disabled={disabled} value={targetId} onChange={(event) => onChange(value, event.target.value)}><option value="">-- Choose existing record --</option>{targets.map((target) => <option value={target.id} key={target.id}>{target.label}</option>)}</select> : null}
  </div>
}

const recordLabel = (record: ClientMergeRecord) => `${record.recordId || record.tableLabel}${record.summary ? ` · ${record.summary}` : ''}`

export default function ClientMergePanel({ canManage, savedBy, onMerged }: Props) {
  const [open, setOpen] = useState(false)
  const [primary, setPrimary] = useState<ClientProfileSearchRecord | null>(null)
  const [secondary, setSecondary] = useState<ClientProfileSearchRecord | null>(null)
  const [primaryInventory, setPrimaryInventory] = useState<ClientMergeInventory | null>(null)
  const [secondaryInventory, setSecondaryInventory] = useState<ClientMergeInventory | null>(null)
  const [enrollmentChoices, setEnrollmentChoices] = useState<Record<string, { action: ClientMergeAction; targetId: string }>>({})
  const [recordChoices, setRecordChoices] = useState<Record<string, { action: ClientMergeAction; targetId: string }>>({})
  const [loading, setLoading] = useState(false)
  const [running, setRunning] = useState(false)
  const [error, setError] = useState('')
  const [status, setStatus] = useState('')
  const [confirmText, setConfirmText] = useState('')

  const resetPreview = () => { setPrimaryInventory(null); setSecondaryInventory(null); setEnrollmentChoices({}); setRecordChoices({}); setConfirmText(''); setStatus(''); setError('') }
  async function loadPreview() {
    if (!primary || !secondary) { setError('Choose both a primary and a secondary Client Profile.'); return }
    if (primary.id === secondary.id) { setError('Primary and secondary Client Profiles must be different.'); return }
    setLoading(true); setError(''); setStatus('Loading complete relationship inventories…')
    try {
      const [primaryData, secondaryData] = await Promise.all([loadClientMergeInventory(primary.id), loadClientMergeInventory(secondary.id)])
      setPrimaryInventory(primaryData); setSecondaryInventory(secondaryData)
      setEnrollmentChoices(Object.fromEntries(secondaryData.enrollments.map((row) => [row.id, { action: 'exclude', targetId: '' }])))
      setRecordChoices(Object.fromEntries(secondaryData.records.map((row) => [row.id, { action: 'exclude', targetId: '' }])))
      setStatus('Preview loaded. Nothing is selected by default.')
    } catch (reason) { setError(String((reason as Error)?.message || reason)); setStatus('') }
    finally { setLoading(false) }
  }

  const targetEnrollmentFor = (sourceEnrollmentId: string) => {
    const choice = enrollmentChoices[sourceEnrollmentId]
    return choice?.action === 'merge' ? choice.targetId : choice?.action === 'move' ? sourceEnrollmentId : ''
  }
  const targetRecords = (record: ClientMergeRecord) => (primaryInventory?.records || [])
    .filter((target) => target.tableAlias === record.tableAlias)
    .filter((target) => !record.parentEnrollmentId || !targetEnrollmentFor(record.parentEnrollmentId) || target.parentEnrollmentId === targetEnrollmentFor(record.parentEnrollmentId))
    .map((target) => ({ id: target.id, label: recordLabel(target) }))

  const groupedDirect = useMemo(() => {
    const map = new Map<string, ClientMergeRecord[]>()
    for (const record of secondaryInventory?.records.filter((row) => !row.parentEnrollmentId) || []) map.set(record.tableLabel, [...(map.get(record.tableLabel) || []), record])
    return [...map.entries()]
  }, [secondaryInventory])

  async function executeMerge() {
    if (!primaryInventory || !secondaryInventory) return
    const expected = secondaryInventory.profile.recordId || secondaryInventory.profile.id
    if (confirmText.trim() !== expected) { setError(`Type ${expected} exactly to confirm this merge.`); return }
    if (typeof window !== 'undefined' && !window.confirm(`Merge ${secondaryInventory.profile.recordId || secondaryInventory.profile.name} into ${primaryInventory.profile.recordId || primaryInventory.profile.name}? This will change relationships and archive the secondary profile.`)) return
    setRunning(true); setError(''); setStatus('Revalidating both profiles before making changes…')
    try {
      const result = await executeClientMergePlan({
        primaryClientId: primaryInventory.profile.id, secondaryClientId: secondaryInventory.profile.id,
        enrollmentDecisions: secondaryInventory.enrollments.map((row) => ({ sourceId: row.id, ...(enrollmentChoices[row.id] || { action: 'exclude', targetId: '' }) })),
        recordDecisions: secondaryInventory.records.map((row) => ({ sourceId: row.id, tableAlias: row.tableAlias, ...(recordChoices[row.id] || { action: 'exclude', targetId: '' }) })),
      }, { canManage, savedBy, onProgress: (completed, total, label) => setStatus(`${completed} of ${total} confirmed · ${label}`) })
      setStatus(`Merge complete. ${result.completed} of ${result.total} operations confirmed; the secondary Client Profile is archived.`)
      onMerged?.()
    } catch (reason) { setError(String((reason as Error)?.message || reason)) }
    finally { setRunning(false) }
  }

  if (!canManage) return <p className="error">IT Admin access is required to merge Client Profiles.</p>
  return <section className="panel client-merge-launcher"><h3>Merge Client Profiles</h3><p>Move selected records from a secondary Client Profile into a primary profile, preserve relationship order, and archive everything not carried over.</p><button type="button" className="primary" onClick={() => setOpen(true)}>Open Client Merge</button>
    {open ? <div className="client-merge-backdrop" role="presentation"><div className="client-merge-modal" role="dialog" aria-modal="true" aria-labelledby="client-merge-title">
      <header className="client-merge-head"><div><span className="eyebrow">IT ADMIN</span><h2 id="client-merge-title">Merge Client Profiles</h2><p className="hint">No changes occur until the final confirmed merge.</p></div><button type="button" className="secondary" disabled={running} onClick={() => setOpen(false)}>Close</button></header>
      <div className="client-merge-body">
        <div className="client-merge-pickers"><ProfilePicker label="Primary Client Profile" selected={primary} excludedId={secondary?.id} disabled={running} onSelect={(row) => { setPrimary(row); resetPreview() }} /><ProfilePicker label="Secondary Client Profile" selected={secondary} excludedId={primary?.id} disabled={running} onSelect={(row) => { setSecondary(row); resetPreview() }} /></div>
        <button type="button" className="primary" disabled={loading || running || !primary || !secondary} onClick={() => { void loadPreview() }}>{loading ? 'Loading records…' : 'Load Merge Preview'}</button>
        {error ? <p className="error client-merge-message">{error}</p> : null}{status ? <p className="success client-merge-message">{status}</p> : null}
        {primaryInventory && secondaryInventory ? <>
          <section className="client-merge-warning"><strong>How duplicate handling works</strong><p>“Use existing duplicate” keeps the selected primary-side record and archives the secondary-side record. It does not overwrite populated fields on the existing record. Unselected records are archived with the secondary profile.</p></section>
          <section className="client-merge-section"><div className="client-merge-section-head"><div><h3>Program Enrollments</h3><p className="hint">Choose the enrollment destination first. Enrollment-linked records cannot be carried without their parent.</p></div></div>
            {secondaryInventory.enrollments.length ? secondaryInventory.enrollments.map((enrollment) => {
              const choice = enrollmentChoices[enrollment.id] || { action: 'exclude' as const, targetId: '' }
              const children = secondaryInventory.records.filter((record) => record.parentEnrollmentId === enrollment.id)
              return <article className="client-merge-enrollment" key={enrollment.id}><div className="client-merge-row"><div><strong>{enrollment.recordId || enrollment.id}</strong><span>{enrollment.program || '-'} · {enrollment.startDate || 'No start date'}{enrollment.endDate ? ` to ${enrollment.endDate}` : ' · Active'}</span></div><ActionPicker itemLabel={enrollment.recordId || enrollment.id} value={choice.action} targetId={choice.targetId} targets={primaryInventory.enrollments.map((row) => ({ id: row.id, label: `${row.recordId || row.id} · ${row.program || '-'}` }))} disabled={running} onChange={(action, targetId) => setEnrollmentChoices((current) => ({ ...current, [enrollment.id]: { action, targetId } }))} /></div>
                {children.length ? <div className="client-merge-children"><div className="client-merge-children-head"><span>{children.length} linked record{children.length === 1 ? '' : 's'}</span>{choice.action !== 'exclude' ? <button type="button" className="link-button" disabled={running} onClick={() => setRecordChoices((current) => ({ ...current, ...Object.fromEntries(children.map((record) => [record.id, { action: 'move', targetId: '' }])) }))}>Carry all</button> : null}</div>{children.map((record) => { const recordChoice = recordChoices[record.id] || { action: 'exclude' as const, targetId: '' }; return <div className="client-merge-row compact" key={record.id}><div><strong>{record.tableLabel}</strong><span>{recordLabel(record)}</span></div><ActionPicker itemLabel={record.recordId || record.tableLabel} value={recordChoice.action} targetId={recordChoice.targetId} targets={targetRecords(record)} disabled={running || choice.action === 'exclude'} onChange={(action, targetId) => setRecordChoices((current) => ({ ...current, [record.id]: { action, targetId } }))} /></div> })}</div> : null}
              </article>
            }) : <p className="hint">The secondary profile has no active Program Enrollments.</p>}
          </section>
          <section className="client-merge-section"><div className="client-merge-section-head"><div><h3>Direct Client Records</h3><p className="hint">These records link directly to the Client Profile.</p></div><button type="button" className="link-button" disabled={running} onClick={() => setRecordChoices((current) => ({ ...current, ...Object.fromEntries(secondaryInventory.records.filter((record) => !record.parentEnrollmentId).map((record) => [record.id, { action: 'move', targetId: '' }])) }))}>Carry all direct records</button></div>
            {groupedDirect.length ? groupedDirect.map(([label, records]) => <div className="client-merge-direct-group" key={label}><h4>{label}</h4>{records.map((record) => { const choice = recordChoices[record.id] || { action: 'exclude' as const, targetId: '' }; return <div className="client-merge-row compact" key={record.id}><div><strong>{recordLabel(record)}</strong><span>{record.createdOn ? `Created ${record.createdOn.slice(0, 10)}` : record.id}</span></div><ActionPicker itemLabel={record.recordId || record.tableLabel} value={choice.action} targetId={choice.targetId} targets={targetRecords(record)} disabled={running} onChange={(action, targetId) => setRecordChoices((current) => ({ ...current, [record.id]: { action, targetId } }))} /></div> })}</div>) : <p className="hint">The secondary profile has no active directly linked records.</p>}
          </section>
          <section className="client-merge-confirm"><h3>Final confirmation</h3><p>Type <strong>{secondaryInventory.profile.recordId || secondaryInventory.profile.id}</strong> to confirm. The secondary profile will be archived only after selected relationship updates complete.</p><input disabled={running} value={confirmText} onChange={(event) => setConfirmText(event.target.value)} /><button type="button" className="primary danger" disabled={running || confirmText.trim() !== (secondaryInventory.profile.recordId || secondaryInventory.profile.id)} onClick={() => { void executeMerge() }}>{running ? 'Merging…' : 'Merge and Archive Secondary'}</button></section>
        </> : null}
      </div>
    </div></div> : null}
  </section>
}
