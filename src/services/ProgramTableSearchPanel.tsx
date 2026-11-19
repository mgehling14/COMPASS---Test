import { useEffect, useMemo, useRef, useState } from 'react'
import type { ReactNode } from 'react'
import RecordSystemFields from './RecordSystemFields'
import FocusPlanNeedsView from './FocusPlanNeedsView'
import { GOAL_COLUMNS } from './focusPlan'
import DataverseAdvancedSearch from './DataverseAdvancedSearch'
import RecordAttachmentButtons from './RecordAttachmentButtons'
import { recordAttachmentFields, recordAttachments } from './recordAttachments'
import type { AdvancedSearchCriterion } from './advancedSearch'
import type { RolePermissionProfile } from './rolePermissions'
import { programSearchGrants, type ProgramSearchFields, type ProgramSearchHub } from './programSearchCatalog'
import { createProgramSearchGateway, inspectProgramSearch, loadProgramSearchRecord, searchProgramTable, type ProgramSearchCursor, type ProgramSearchPlan, type ProgramSearchRow } from './programTableSearch'

export default function ProgramTableSearchPanel({ hub, profiles, rolesLoading, rolesError, fields, refreshSignal, onOpenClientProfile, renderArchiveButton, onOpenFile }: {
  hub: ProgramSearchHub; profiles: RolePermissionProfile[]; rolesLoading: boolean; rolesError: string; fields: ProgramSearchFields; refreshSignal: number
  onOpenClientProfile: (row: ProgramSearchRow) => Promise<boolean>
  renderArchiveButton: (tableAlias: string, rowId: string, recordLabel: string) => ReactNode
  onOpenFile?: (fileId: string) => void
}) {
  const allowed = useMemo(() => rolesLoading || rolesError ? [] : programSearchGrants(profiles, hub), [profiles, hub, rolesLoading, rolesError])
  const [selectedKey, setSelectedKey] = useState('')
  const [query, setQuery] = useState('')
  const [appliedQuery, setAppliedQuery] = useState('')
  const [advanced, setAdvanced] = useState<{ key: string; criteria: AdvancedSearchCriterion[] }>({ key: '', criteria: [] })
  const [rows, setRows] = useState<ProgramSearchRow[]>([])
  const [plan, setPlan] = useState<ProgramSearchPlan | null>(null)
  const [cursors, setCursors] = useState<Array<ProgramSearchCursor | undefined>>([undefined])
  const [page, setPage] = useState(0)
  const [next, setNext] = useState<ProgramSearchCursor | null>(null)
  const [busy, setBusy] = useState(false)
  const [error, setError] = useState('')
  const [detail, setDetail] = useState<{ row: ProgramSearchRow; values: Array<{ field: string; label: string; value: string; fileId?: string }> } | null>(null)
  const gateway = useRef(createProgramSearchGateway())
  const controller = useRef<AbortController | null>(null)
  const requestNumber = useRef(0)
  const key = allowed.some((entry) => entry.table.key === selectedKey) ? selectedKey : allowed.find((entry) => entry.table.key === 'client-profile')?.table.key || allowed[0]?.table.key || ''
  const appliedFilters = useMemo(() => advanced.key === key ? advanced.criteria : [], [advanced, key])
  const permission = allowed.find((entry) => entry.table.key === key)
  const context = useMemo(() => ({ profiles, hub }), [profiles, hub])

  async function load(targetPage: number, cursor: ProgramSearchCursor | undefined, currentQuery: string, signal: AbortSignal, request: number) {
    setBusy(true); setError(''); setDetail(null); setRows([])
    try {
      // Rebuild permissions and program scope for each search/page. A stale plan
      // or cursor can never be reused after permissions or the hub change.
      const checked = await inspectProgramSearch(context, key, fields[key] || [], gateway.current, signal)
      const result = await searchProgramTable(context, checked, currentQuery, gateway.current, signal, cursor, advanced.key === key ? advanced.criteria : [])
      if (signal.aborted || request !== requestNumber.current) return
      setPlan(checked); setRows(result.rows); setNext(result.next); setPage(targetPage)
      if (targetPage === 0) setCursors([undefined])
    } catch (failure) {
      if (!signal.aborted && request === requestNumber.current) { setError(String((failure as Error)?.message || failure)); setNext(null); setPlan(null) }
    } finally { if (!signal.aborted && request === requestNumber.current) setBusy(false) }
  }

  useEffect(() => {
    controller.current?.abort()
    const abort = new AbortController(); controller.current = abort
    const request = ++requestNumber.current
    setDetail(null); setRows([]); setPlan(null); setNext(null); setPage(0); setCursors([undefined]); setError('')
    if (key && !rolesLoading && !rolesError) void load(0, undefined, appliedQuery, abort.signal, request)
    else setBusy(false)
    return () => { abort.abort(); controller.current?.abort(); ++requestNumber.current }
  }, [key, context, appliedQuery, advanced, rolesLoading, rolesError, refreshSignal])

  function movePage(targetPage: number, cursor: ProgramSearchCursor | undefined) {
    controller.current?.abort()
    const abort = new AbortController(); controller.current = abort
    const request = ++requestNumber.current
    if (targetPage > page) setCursors((current) => [...current.slice(0, targetPage), cursor])
    void load(targetPage, cursor, appliedQuery, abort.signal, request)
  }

  async function open(row: ProgramSearchRow) {
    if (!plan || !permission?.view || busy) return
    controller.current?.abort()
    const abort = new AbortController(); controller.current = abort
    const request = ++requestNumber.current
    setBusy(true); setError('')
    try {
      const values = await loadProgramSearchRecord(context, plan, row.id, gateway.current, abort.signal)
      if (!abort.signal.aborted && request === requestNumber.current) {
        if (key === 'client-profile') {
          if (!await onOpenClientProfile(row)) throw new Error('Unable to open the selected client profile. Please try again.')
        }
        else setDetail({ row, values })
      }
    } catch (failure) {
      if (!abort.signal.aborted && request === requestNumber.current) setError(String((failure as Error)?.message || failure))
    } finally { if (!abort.signal.aborted && request === requestNumber.current) setBusy(false) }
  }

  function renderPagination(position: 'top' | 'bottom') {
    return <nav className="hub-form-editor-actions" aria-label={`Search result pages (${position})`} style={{ marginBlock: '0.75rem' }}>
      <button type="button" className="secondary" disabled={busy || page === 0} onClick={() => movePage(page - 1, cursors[page - 1])}>Previous Page</button>
      <span className="hint">Page {page + 1}</span>
      <button type="button" className="secondary" disabled={busy || !next} onClick={() => { if (next) movePage(page + 1, next) }}>Next Page</button>
    </nav>
  }

  return <article className="panel wide hub-card" aria-label="Program record search">
    <h3>Search Records</h3>
    <p className="hint">Only developed tables with Search enabled in your assigned COMPASS role for this program are listed.</p>
    {rolesLoading ? <p className="hint" role="status">Loading search permissions...</p> : rolesError ? <p className="error" role="alert">Search is unavailable until role permissions can be loaded.</p> : !allowed.length ? <p className="hint">Your assigned role has no searchable developed forms for this program. Ask IT Admin to review the form's Search permission.</p> : <>
      <form className="hub-search-controls" onSubmit={(event) => { event.preventDefault(); if (!busy) { setAppliedQuery(query.trim()); if (query.trim() === appliedQuery) movePage(0, undefined) } }}>
        <label className="hub-form-field" htmlFor={`program-search-table-${hub.id}`}><span>Form/Table</span><select id={`program-search-table-${hub.id}`} value={key} onChange={(event) => { controller.current?.abort(); setSelectedKey(event.target.value); setQuery(''); setAppliedQuery(''); setRows([]); setDetail(null); setError('') }}>
          {allowed.map((entry) => <option key={entry.table.key} value={entry.table.key}>{entry.table.label}</option>)}
        </select></label>
        <label className="hub-form-field" htmlFor={`program-search-query-${hub.id}`}><span>Search text</span><input id={`program-search-query-${hub.id}`} value={query} maxLength={250} onChange={(event) => setQuery(event.target.value)} placeholder="Record ID or text in this table" /></label>
        <div className="hub-search-actions">
          <button type="submit" className="secondary" disabled={busy}>{busy ? 'Searching...' : 'Search'}</button>
          <DataverseAdvancedSearch key={key} tableKey={key} developedFields={fields[key] || []}
            metadata={plan?.grant.table.key === key ? plan.metadata : undefined}
            applied={appliedFilters} disabled={busy}
            onApply={(criteria) => { setAppliedQuery(query.trim()); setAdvanced({ key, criteria }) }} />
        </div>
      </form>
      <p className="hint">{permission?.ignoreProgramAssignment ? 'Your role enables Ignore Program for this table, so results may include other programs.' : `Results are restricted to ${hub.displayTitle || hub.title} through verified program, enrollment, or client links.`}</p>
      {!permission?.view ? <p className="hint">Search is enabled, but View is not. You can find records here without opening their form details.</p> : null}
    </>}
    {error ? <p className="error" role="alert">{error}</p> : null}
    {busy ? <p className="hint" role="status">Loading records...</p> : null}
    {detail && permission?.view ? <section className="hub-client-quick-record" aria-label="Search record details">
      <div className="hub-client-quick-record-head"><h4>{permission.table.label}: {detail.row.recordId}</h4><div className="hub-form-editor-actions"><button type="button" className="secondary" onClick={() => setDetail(null)}>Back to Search Results</button>{renderArchiveButton(permission.table.tableAlias, detail.row.id, detail.row.recordId)}</div></div>
      <p className="hint">Read-only form view.</p>
      <RecordSystemFields tableAlias={permission.table.tableAlias} rowId={detail.row.id} />
      <div className="hub-form-grid">{detail.values.filter((field) => key !== 'focus-plan' || !GOAL_COLUMNS.includes(field.field)).map((field) => <div className="hub-form-field" key={field.field}><span>{field.label}</span>{recordAttachmentFields(key).some((entry) => entry.field === field.field)
        ? field.fileId ? <RecordAttachmentButtons attachments={recordAttachments(key, { [field.field]: field.fileId })} onOpenFile={onOpenFile} /> : <span>No file attached</span>
        : <div style={{ whiteSpace: 'pre-wrap', overflowWrap: 'anywhere' }}>{field.value || '-'}</div>}</div>)}
        {key === 'focus-plan' ? <FocusPlanNeedsView values={Object.fromEntries(detail.values.map((field) => [field.field, field.value]))} idPrefix={`program-search-focus-${detail.row.id}`} /> : null}
      </div>
    </section> : null}
    {key && permission && !detail && !rolesLoading && !rolesError ? <section aria-label="Program search results">
      <h4>Search Results</h4>
      {!busy && !error ? <p className="hint">{rows.length ? `Page ${page + 1}: ${rows.length} record(s).` : 'No matching records found.'}</p> : null}
      {renderPagination('top')}
      {rows.length ? <div className="hub-search-results-table-wrap"><table className="hub-search-results-table"><thead><tr><th>Action</th><th>Record ID</th><th>Name / Description</th><th>Last Modified</th></tr></thead><tbody>
        {rows.map((row) => <tr key={row.id}><td><div className="hub-form-editor-actions">{permission.view ? <><button type="button" className="secondary" disabled={busy} onClick={() => { void open(row) }}>{key === 'client-profile' ? 'Open Profile' : 'View Record'}</button><RecordAttachmentButtons attachments={row.attachments || []} onOpenFile={onOpenFile} disabled={busy} /></> : <span className="hint">Search only</span>}{renderArchiveButton(permission.table.tableAlias, row.id, row.recordId)}</div></td><td>{row.recordId}</td><td>{row.title || '-'}</td><td>{row.modifiedOn || '-'}</td></tr>)}
      </tbody></table></div> : null}
      {renderPagination('bottom')}
    </section> : null}
  </article>
}
