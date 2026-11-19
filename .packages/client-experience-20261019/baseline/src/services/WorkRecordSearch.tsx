import { useMemo, useState, type ReactNode } from 'react'
import AdvancedSearchControls from './AdvancedSearchControls'
import { filterWorkRecords, workSearchFields, type WorkSearchRecord } from './workSearch'
import type { AdvancedSearchCriterion } from './advancedSearch'

export default function WorkRecordSearch<T>({ records, getRecord, children, busy = false, fullProfile = false, identity }: {
  records: T[]; getRecord: (row: T) => WorkSearchRecord; children: (rows: T[]) => ReactNode; busy?: boolean; fullProfile?: boolean; identity: string
}) {
  const [query, setQuery] = useState(''), [filters, setFilters] = useState<AdvancedSearchCriterion[]>([]), [page, setPage] = useState(0)
  const fields = useMemo(() => workSearchFields(fullProfile), [fullProfile])
  const matches = useMemo(() => filterWorkRecords(records, getRecord, query, filters, fields), [records, getRecord, query, filters, fields])
  const pages = Math.max(1, Math.ceil(matches.length / 50)), current = Math.min(page, pages - 1)
  function pagination(position: string) {
    return <nav className="hub-form-editor-actions" aria-label={`My Work result pages (${position})`}>
      <button type="button" className="secondary" disabled={busy || current === 0} onClick={() => setPage(current - 1)}>Previous Page</button>
      <span className="hint">Page {current + 1} of {pages}</span>
      <button type="button" className="secondary" disabled={busy || current + 1 >= pages} onClick={() => setPage(current + 1)}>Next Page</button>
    </nav>
  }
  return <section aria-label="Search assigned work">
    <div className="hub-search-controls">
      <label className="hub-form-field"><span>Search assigned clients</span><input type="search" value={query} maxLength={250}
        placeholder="Client name, Record ID, HMIS ID, program, or staff" disabled={busy} onChange={(event) => { setQuery(event.target.value); setPage(0) }} /></label>
      <AdvancedSearchControls identity={identity} fields={fields} applied={filters} disabled={busy} onApply={(criteria) => { setFilters(criteria); setPage(0) }} />
      <button type="button" className="secondary" disabled={busy} onClick={() => { setQuery(''); setFilters([]); setPage(0) }}>Clear Search</button>
    </div>
    <p className="hint">Search is limited to the assigned work available on this page. {busy ? 'Loading...' : `${matches.length.toLocaleString()} of ${records.length.toLocaleString()} client/item records match.`}</p>
    {matches.length > 50 ? pagination('top') : null}
    {!busy && records.length > 0 && !matches.length ? <p className="hint">No assigned records match your search. Clear the search or adjust the filters.</p> : null}
    {children(busy ? [] : matches.slice(current * 50, current * 50 + 50))}
    {matches.length > 50 ? pagination('bottom') : null}
  </section>
}

