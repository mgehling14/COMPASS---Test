import { useEffect, useState } from 'react'
import { EMPTY_SYSTEM_FIELDS, loadSystemFields } from './systemFields'

export default function RecordSystemFields({ tableAlias, rowId }: { tableAlias: string; rowId: string }) {
  const [state, setState] = useState({ key: '', fields: EMPTY_SYSTEM_FIELDS, loading: false, error: '' })
  const key = `${tableAlias}:${rowId}`
  useEffect(() => {
    if (!rowId) return
    let disposed = false
    setState({ key, fields: EMPTY_SYSTEM_FIELDS, loading: true, error: '' })
    void loadSystemFields(tableAlias, rowId).then((fields) => {
      if (!disposed) setState({ key, fields, loading: false, error: '' })
    }).catch((error) => {
      if (!disposed) setState({ key, fields: EMPTY_SYSTEM_FIELDS, loading: false, error: String(error?.message || error) })
    })
    return () => { disposed = true }
  }, [tableAlias, rowId, key])
  if (!rowId) return null
  const fields = state.key === key ? state.fields : EMPTY_SYSTEM_FIELDS
  const timestamp = (value: string) => {
    if (!value) return '-'
    const date = new Date(value)
    return Number.isNaN(date.getTime()) ? value : date.toLocaleString()
  }
  return <section aria-label="System Fields">
    <h4>System Fields</h4>
    <div className="hub-form-grid">
      {Object.entries({ 'Created By': fields.createdBy, 'Created Time': timestamp(fields.createdOn), 'Modified By': fields.modifiedBy, 'Modified Time': timestamp(fields.modifiedOn) }).map(([label, value]) => <div className="hub-form-field" key={label}><span>{label}</span><div>{value || '-'}</div></div>)}
    </div>
    {state.key !== key || state.loading ? <p className="hint" role="status">Loading system information...</p> : null}
    {state.key === key && state.error ? <p className="error" role="alert">Unable to load system information: {state.error}</p> : null}
  </section>
}
