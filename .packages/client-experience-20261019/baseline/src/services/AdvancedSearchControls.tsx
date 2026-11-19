import { useEffect, useId, useRef, useState } from 'react'
import { ADVANCED_SEARCH_LIMIT, advancedSearchOperators, validateAdvancedSearch, type AdvancedSearchCriterion, type AdvancedSearchField } from './advancedSearch'

export default function AdvancedSearchControls({ fields, applied, onApply, disabled = false, loading = false, error = '', onOpen, loadOptions, identity = '' }: {
  fields: AdvancedSearchField[]; applied: AdvancedSearchCriterion[]; onApply: (criteria: AdvancedSearchCriterion[]) => void
  disabled?: boolean; loading?: boolean; error?: string; onOpen?: () => void
  loadOptions?: (field: AdvancedSearchField, signal: AbortSignal) => Promise<Array<{ value: string; label: string }>>
  identity?: string
}) {
  const id = useId(), [open, setOpen] = useState(false), [draft, setDraft] = useState<AdvancedSearchCriterion[]>([])
  const [validation, setValidation] = useState(''), [options, setOptions] = useState<Record<string, Array<{ value: string; label: string }>>>({})
  const [optionBusy, setOptionBusy] = useState(false), [optionError, setOptionError] = useState('')
  const controller = useRef<AbortController | null>(null)
  useEffect(() => { setDraft(applied.map((row) => ({ ...row }))); setValidation('') }, [applied, identity])
  useEffect(() => { setOpen(false); setOptions({}); setOptionError(''); controller.current?.abort() }, [identity])
  const choiceKeys = [...new Set(draft.map((row) => row.field))].join('|')
  useEffect(() => {
    controller.current?.abort()
    const abort = new AbortController(); controller.current = abort
    const needed = fields.filter((field) => choiceKeys.split('|').includes(field.field) && ['choice', 'multi-choice'].includes(field.kind) && !field.options && !options[field.field])
    if (!open || !needed.length || !loadOptions) { setOptionBusy(false); setOptionError(''); return }
    setOptionBusy(true); setOptionError('')
    void Promise.all(needed.map(async (field) => [field.field, await loadOptions(field, abort.signal)] as const))
      .then((entries) => { if (!abort.signal.aborted) setOptions((current) => ({ ...current, ...Object.fromEntries(entries) })) })
      .catch((failure) => { if (!abort.signal.aborted) setOptionError(String((failure as Error)?.message || failure)) })
      .finally(() => { if (!abort.signal.aborted) setOptionBusy(false) })
    return () => abort.abort()
  }, [choiceKeys, fields, identity, open, options, loadOptions])
  useEffect(() => () => controller.current?.abort(), [])
  const change = (index: number, update: Partial<AdvancedSearchCriterion>) => { setDraft((current) => current.map((row, key) => key === index ? { ...row, ...update } : row)); setValidation('') }
  function apply() {
    try { validateAdvancedSearch(draft, fields); onApply(draft.map((row) => ({ ...row }))); setValidation('') }
    catch (failure) { setValidation(String((failure as Error)?.message || failure)) }
  }
  return <div className="advanced-search">
    <button type="button" className="secondary" aria-expanded={open} aria-controls={id} disabled={disabled} onClick={() => {
      if (!open) { setDraft(applied.map((row) => ({ ...row }))); onOpen?.() }
      setOpen((current) => !current)
    }}>Advanced Search{applied.length ? ` (${applied.length})` : ''}</button>
    {open ? <section id={id} className="hub-client-quick-record advanced-search-panel" aria-label="Advanced search conditions">
      <h4>Search by selected fields</h4>
      <p className="hint">All conditions must match the same record. These refine the normal search; they do not expand your access. Dates use whole calendar days (UTC for timestamp columns). Linked records are searched by their Dataverse GUID.</p>
      {loading ? <p role="status" className="hint">Loading searchable fields...</p> : null}
      {!loading && !error && !fields.length ? <p className="hint">No searchable fields are available for this form.</p> : null}
      {error || optionError ? <p className="error" role="alert">{error || optionError}</p> : null}
      {draft.map((row, index) => {
        const field = fields.find((entry) => entry.field === row.field), kind = field?.kind || 'text'
        const empty = ['empty', 'not-empty'].includes(row.operator)
        const list = kind === 'boolean' ? [{ value: '1', label: 'Yes' }, { value: '0', label: 'No' }] : field?.options || options[row.field] || []
        return <div className="advanced-search-condition" key={index}>
          <label className="hub-form-field"><span>Field {index + 1}</span><select value={row.field} disabled={disabled || loading} onChange={(event) => {
            const selected = fields.find((entry) => entry.field === event.target.value)!
            change(index, { field: selected.field, operator: advancedSearchOperators(selected.kind)[0].value, value: '', valueTo: '' })
          }}>{fields.map((entry) => <option key={entry.field} value={entry.field}>{entry.label}</option>)}</select></label>
          <label className="hub-form-field"><span>Condition</span><select value={row.operator} disabled={disabled} onChange={(event) => change(index, { operator: event.target.value })}>{advancedSearchOperators(kind).map((entry) => <option key={entry.value} value={entry.value}>{entry.label}</option>)}</select></label>
          {!empty ? <label className="hub-form-field"><span>{kind === 'lookup' ? 'Record GUID' : 'Value'}</span>
            {['choice', 'multi-choice', 'boolean'].includes(kind)
              ? <select value={row.value} disabled={disabled || optionBusy || !list.length} onChange={(event) => change(index, { value: event.target.value })}><option value="">Choose an option</option>{list.map((entry) => <option value={entry.value} key={entry.value}>{entry.label}</option>)}</select>
              : <input type={kind === 'date' ? 'date' : kind === 'number' ? 'number' : 'text'} step={kind === 'number' ? 'any' : undefined} value={row.value} maxLength={250} disabled={disabled} onChange={(event) => change(index, { value: event.target.value })} />}
          </label> : null}
          {row.operator === 'between' ? <label className="hub-form-field"><span>Through</span><input type={kind === 'date' ? 'date' : 'number'} step={kind === 'number' ? 'any' : undefined} value={row.valueTo || ''} disabled={disabled} onChange={(event) => change(index, { valueTo: event.target.value })} /></label> : null}
          <button type="button" className="secondary" disabled={disabled} aria-label={`Remove condition ${index + 1}`} onClick={() => setDraft((current) => current.filter((_, key) => key !== index))}>Remove</button>
        </div>
      })}
      {optionBusy ? <p className="hint" role="status">Loading verified choices...</p> : null}
      {validation ? <p className="error" role="alert">{validation}</p> : null}
      <div className="hub-form-editor-actions">
        <button type="button" className="secondary" disabled={disabled || loading || !fields.length || draft.length >= ADVANCED_SEARCH_LIMIT} onClick={() => {
          const field = fields[0]; setDraft((current) => [...current, { field: field.field, operator: advancedSearchOperators(field.kind)[0].value, value: '' }])
        }}>Add Condition</button>
        <button type="button" className="primary" disabled={disabled || loading || optionBusy || !!error || !!optionError} onClick={apply}>Apply Filters</button>
        <button type="button" className="secondary" disabled={disabled} onClick={() => { setDraft([]); setValidation(''); setOptionError(''); onApply([]) }}>Clear Filters</button>
      </div>
    </section> : null}
  </div>
}

