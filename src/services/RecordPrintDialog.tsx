import { useEffect, useRef, useState, type ReactNode } from 'react'
import { createPortal } from 'react-dom'
import { mapPrintItems, type PrintCatalog, type PrintRecordRef } from './recordPrinting'
import './RecordPrint.css'

type Props = {
  clientLabel: string
  includeProfile: boolean
  loadCatalog: () => Promise<PrintCatalog>
  loadRecord: (record: PrintRecordRef, catalog: PrintCatalog) => Promise<ReactNode>
  onClose: () => void
}
function SelectionBox({ checked, partial, disabled, onChange, label }: { checked: boolean; partial?: boolean; disabled?: boolean; onChange: () => void; label: string }) {
  const input = useRef<HTMLInputElement>(null)
  useEffect(() => { if (input.current) input.current.indeterminate = !!partial }, [partial])
  return <label className="record-print-choice"><input ref={input} type="checkbox" checked={checked} disabled={disabled} onChange={onChange} /><span>{label}</span></label>
}
export default function RecordPrintDialog({ clientLabel, includeProfile, loadCatalog, loadRecord, onClose }: Props) {
  const dialog = useRef<HTMLDialogElement>(null), live = useRef(true), request = useRef(0)
  const [catalog, setCatalog] = useState<PrintCatalog | null>(null)
  const [selected, setSelected] = useState<Set<string>>(new Set())
  const [expanded, setExpanded] = useState<Set<string>>(new Set(['client-profile']))
  const [error, setError] = useState('')
  const [busy, setBusy] = useState(false)
  const [progress, setProgress] = useState('')
  const [pages, setPages] = useState<Array<{ ref: PrintRecordRef; content: ReactNode }>>([])
  useEffect(() => {
    live.current = true
    const element = dialog.current
    if (element && !element.open) element.showModal()
    void loadCatalog().then((value) => {
      if (!live.current) return
      setCatalog(value)
      const defaults = value.groups.flatMap((group) => group.records).filter((record) => !includeProfile || record.kind === 'client-profile')
      setSelected(new Set(defaults.map((record) => record.key)))
    }).catch((failure) => { if (live.current) setError(String(failure?.message || failure)) })
    return () => { live.current = false; request.current++; if (element?.open) element.close() }
  }, [])
  const records = catalog?.groups.flatMap((group) => group.records) || []
  const chosen = records.filter((record) => selected.has(record.key))
  function toggle(keys: string[], check: boolean) {
    setPages([]); setError('')
    setSelected((current) => {
      const next = new Set(current)
      for (const key of keys) {
        const row = records.find((record) => record.key === key)
        if (check || includeProfile && row?.kind === 'client-profile') next.add(key)
        else next.delete(key)
      }
      return next
    })
  }
  async function preview() {
    if (!catalog || busy || !chosen.length) return
    const run = ++request.current
    setBusy(true); setError(''); setPages([])
    let completed = 0
    try {
      const prepared = await mapPrintItems(chosen, async (record) => {
        if (!live.current || request.current !== run) throw new Error('Print preparation cancelled.')
        try {
          const content = await loadRecord(record, catalog)
          if (live.current && request.current === run) setProgress('Preparing records: ' + (++completed) + ' of ' + chosen.length)
          return { ref: record, content }
        } catch (failure) { throw new Error(record.formName + ' ' + record.recordId + ': ' + String((failure as Error)?.message || failure)) }
      }, 2)
      if (live.current && request.current === run) setPages(prepared)
    } catch (failure) { if (live.current && request.current === run) { request.current++; setError('Preview was not completed. No partial packet will be printed. ' + String((failure as Error)?.message || failure)) } }
    finally { if (live.current) { setBusy(false); setProgress('') } }
  }
  useEffect(() => { if (catalog) void preview() }, [catalog])
  if (typeof document === 'undefined') return null
  return createPortal(<dialog ref={dialog} className="record-print-dialog" aria-labelledby="record-print-title" onCancel={(event) => { event.preventDefault(); onClose() }}>
    <header className="record-print-controls">
      <div><p className="eyebrow">Record printing</p><h2 id="record-print-title">Print / Save as PDF</h2><p>{clientLabel}</p></div>
      <button type="button" className="secondary" onClick={onClose}>Close preview</button>
    </header>
    <p className="record-print-controls hint">Choose records, prepare the preview, then select Print / Save as PDF. In the browser print dialog, choose Save as PDF. Attachments are listed, not merged into the PDF.</p>
    <p className="record-print-controls hint">Contains confidential client information. Use approved storage and sharing procedures.</p>
    {error ? <p className="record-print-controls error" role="alert">{error}</p> : null}
    {!catalog && !error ? <p role="status">Loading printable records...</p> : null}
    {catalog ? <div className="record-print-layout">
      <fieldset className="record-print-selector" disabled={busy}><legend>Select records by form</legend>
        {includeProfile ? <><p className="hint">Client Profile is always included.</p><SelectionBox label="Select all available records" checked={records.length > 0 && chosen.length === records.length} partial={chosen.length > 0 && chosen.length < records.length} onChange={() => toggle(records.map((row) => row.key), chosen.length !== records.length)} /></> : null}
        {catalog.groups.some((group) => group.error) ? <p className="error" role="alert">Some forms could not be listed. Expand sections marked Unavailable to review the errors; those forms cannot be included.</p> : null}
        {catalog.groups.map((group) => {
          const count = group.records.filter((record) => selected.has(record.key)).length
          return <details key={group.kind} open={expanded.has(group.kind)} onToggle={(event) => {
            const open = event.currentTarget.open
            setExpanded((current) => { const next = new Set(current); if (open) next.add(group.kind); else next.delete(group.kind); return next })
          }}>
            <summary>{group.formName} <span>{group.error ? 'Unavailable' : count + ' / ' + group.records.length}</span></summary>
            {expanded.has(group.kind) ? <div className="record-print-group">
              {group.error ? <p className="error" role="alert">{group.error}</p> : <>
                <SelectionBox label="Select all records for this form" checked={group.records.length > 0 && count === group.records.length} partial={count > 0 && count < group.records.length} disabled={!group.records.length || includeProfile && group.kind === 'client-profile'} onChange={() => toggle(group.records.map((row) => row.key), count !== group.records.length)} />
                {!group.records.length ? <p className="hint">No linked records.</p> : null}
                {group.records.map((record) => <SelectionBox key={record.key} label={[record.recordId || record.id, record.summary].filter(Boolean).join(' - ')} checked={selected.has(record.key)} disabled={includeProfile && record.kind === 'client-profile'} onChange={() => toggle([record.key], !selected.has(record.key))} />)}
              </>}
            </div> : null}
          </details>
        })}
      </fieldset>
      <section className="record-print-preview" aria-label="Print preview">
        <div className="record-print-controls record-print-toolbar">
          <button type="button" className="secondary" disabled={busy || !chosen.length} onClick={() => { void preview() }}>{busy ? 'Preparing preview...' : 'Preview selected records (' + chosen.length + ')'}</button>
          <button type="button" className="primary" disabled={busy || !pages.length} onClick={() => { try { window.print() } catch (failure) { setError('The browser could not open printing: ' + String((failure as Error)?.message || failure)) } }}>Print / Save as PDF</button>
        </div>
        {progress ? <p className="record-print-controls hint" role="status">{progress}</p> : null}
        {!pages.length && !busy ? <p className="record-print-controls hint">Select Preview selected records to load the printable forms.</p> : null}
        <div className="record-print-pages">{pages.map(({ ref, content }) => <article className="record-print-page" key={ref.key}>
          <header className="record-print-page-header"><span>COMPASS - Client Records</span><h2>{ref.formName}</h2><p>{clientLabel}</p><p>Record ID: {ref.recordId || ref.id}</p></header>
          {content}
        </article>)}</div>
      </section>
    </div> : null}
  </dialog>, document.body)
}
