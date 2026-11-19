import { useEffect, useRef, type ReactNode } from 'react'
import './RecordSaveDialog.css'

export default function ReadOnlyRecordDialog({ title, children, onClose }: { title: string; children: ReactNode; onClose: () => void }) {
  const dialog = useRef<HTMLDialogElement>(null)
  useEffect(() => {
    const element = dialog.current
    if (element && !element.open) element.showModal()
    return () => { if (element?.open) element.close() }
  }, [])
  return <dialog ref={dialog} className="record-save-dialog" style={{ width: 'min(1100px, calc(100vw - 2rem))' }} aria-labelledby="client-readonly-record-title" onCancel={(event) => { event.preventDefault(); onClose() }}>
    <div className="hub-client-quick-record-head"><h2 id="client-readonly-record-title">{title}</h2><button type="button" className="secondary" autoFocus onClick={onClose}>Close Record</button></div>
    <p className="hint">Read-only record view.</p>
    {children}
  </dialog>
}
