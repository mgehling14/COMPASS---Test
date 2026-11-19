import { useCallback, useEffect, useMemo, useRef, useState } from 'react'
import AdvancedSearchControls from './AdvancedSearchControls'
import { advancedFieldsFromMetadata, supportsAdvancedSearch, type AdvancedSearchCriterion, type AdvancedSearchField } from './advancedSearch'
import { createProgramSearchGateway, type ProgramSearchMetadata } from './programTableSearch'

export default function DataverseAdvancedSearch({ tableKey, developedFields, metadata: provided, applied, onApply, disabled = false }: {
  tableKey: string; developedFields: ReadonlyArray<{ field: string; label: string }>; metadata?: ProgramSearchMetadata
  applied: AdvancedSearchCriterion[]; onApply: (criteria: AdvancedSearchCriterion[]) => void; disabled?: boolean
}) {
  const gateway = useRef(createProgramSearchGateway()), controller = useRef<AbortController | null>(null)
  const [metadata, setMetadata] = useState<ProgramSearchMetadata | undefined>(provided), [loading, setLoading] = useState(false), [error, setError] = useState('')
  const current = provided || metadata
  const fields = useMemo(() => current ? advancedFieldsFromMetadata(current, developedFields, tableKey) : [], [current, developedFields, tableKey])
  useEffect(() => { controller.current?.abort(); setMetadata(provided); setError(''); setLoading(false) }, [tableKey, provided])
  useEffect(() => () => controller.current?.abort(), [])
  async function load() {
    if (!supportsAdvancedSearch(tableKey) || current) return
    controller.current?.abort()
    const abort = new AbortController(); controller.current = abort
    setLoading(true); setError('')
    try { const result = await gateway.current.metadata(tableKey, abort.signal); if (!abort.signal.aborted) setMetadata(result) }
    catch (failure) { if (!abort.signal.aborted) setError(String((failure as Error)?.message || failure)) }
    finally { if (!abort.signal.aborted) setLoading(false) }
  }
  const loadOptions = useCallback(async (field: AdvancedSearchField, signal: AbortSignal) => {
    if (!current) throw new Error('Search metadata is not ready.')
    const options = await gateway.current.choices(current, field.field, signal)
    return options.map((entry) => ({ value: String(entry.value), label: entry.label.replace(/CAAFA Outreach/gi, 'DV Outreach') }))
  }, [current])
  if (!supportsAdvancedSearch(tableKey)) return null
  return <AdvancedSearchControls identity={tableKey} fields={fields} applied={applied} onApply={onApply} disabled={disabled}
    loading={loading} error={error} onOpen={() => { void load() }} loadOptions={loadOptions} />
}

