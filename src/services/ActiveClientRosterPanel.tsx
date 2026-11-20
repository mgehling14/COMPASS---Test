import { useEffect, useMemo, useRef, useState } from 'react'
import { loadActiveClientRoster, type ActiveRosterRow } from './activeClientRoster'
import SortableRecordTable from './SortableRecordTable'

type Props = {
  authorizedPrograms: string[]
  onOpenClient: (row: ActiveRosterRow) => boolean
  onOpenProgramEnrollment: (row: ActiveRosterRow) => boolean
  onOpenService: (row: ActiveRosterRow) => boolean
  onOpenBedEnrollment: (row: ActiveRosterRow) => boolean
}

function formatDate(value: string) {
  if (!value) return ''
  const [year, month, day] = value.slice(0, 10).split('-').map(Number)
  if (!year || !month || !day) return value
  return new Intl.DateTimeFormat(undefined, { month: 'numeric', day: 'numeric', year: 'numeric' }).format(new Date(year, month - 1, day))
}

export default function ActiveClientRoster({ authorizedPrograms, onOpenClient, onOpenProgramEnrollment, onOpenService, onOpenBedEnrollment }: Props) {
  const [expanded, setExpanded] = useState(false)
  const [selectedProgram, setSelectedProgram] = useState('all')
  const [rows, setRows] = useState<ActiveRosterRow[]>([])
  const [loaded, setLoaded] = useState(false)
  const [loading, setLoading] = useState(false)
  const [error, setError] = useState('')
  const [actionError, setActionError] = useState('')
  const [tableScrollWidth, setTableScrollWidth] = useState(0)
  const topScrollRef = useRef<HTMLDivElement>(null)
  const tableScrollRef = useRef<HTMLDivElement>(null)
  const bottomScrollRef = useRef<HTMLDivElement>(null)
  const scopeKey = [...new Set(authorizedPrograms)].sort().join('|')
  useEffect(() => {
    if (!expanded || !scopeKey) return
    const controller = new AbortController()
    setLoading(true); setError(''); setLoaded(false)
    void loadActiveClientRoster(scopeKey.split('|'), controller.signal).then((result) => setRows(result)).catch((reason) => {
      if (!controller.signal.aborted) { setRows([]); setError(String((reason as Error)?.message || reason)) }
    }).finally(() => { if (!controller.signal.aborted) { setLoading(false); setLoaded(true) } })
    return () => controller.abort()
  }, [expanded, scopeKey])

  const programs = useMemo(() => [...new Set([...authorizedPrograms, ...rows.map((row) => row.program)].filter(Boolean))].sort((a, b) => a.localeCompare(b)), [authorizedPrograms, rows])
  const visibleRows = useMemo(() => selectedProgram === 'all' ? rows : rows.filter((row) => row.program.toLocaleLowerCase() === selectedProgram.toLocaleLowerCase()), [rows, selectedProgram])
  const showBedEnrollmentColumns = selectedProgram === 'all' || !['dv outreach', 'reach center'].includes(selectedProgram.trim().toLocaleLowerCase())
  useEffect(() => {
    const table = tableScrollRef.current?.querySelector('table')
    if (!loaded || !visibleRows.length || !table) return
    const updateWidth = () => setTableScrollWidth(table.scrollWidth)
    updateWidth()
    const observer = new ResizeObserver(updateWidth)
    observer.observe(table)
    return () => observer.disconnect()
  }, [loaded, visibleRows.length, showBedEnrollmentColumns])
  function openRecord(action: (row: ActiveRosterRow) => boolean, row: ActiveRosterRow) {
    setActionError('')
    if (!action(row)) setActionError('Your current workspace permissions do not allow opening that record.')
  }
  function syncHorizontalScroll(source: 'top' | 'table' | 'bottom', scrollLeft: number) {
    const targets = [topScrollRef.current, tableScrollRef.current, bottomScrollRef.current]
    const sourceIndex = source === 'top' ? 0 : source === 'table' ? 1 : 2
    targets.forEach((target, index) => { if (index !== sourceIndex && target && target.scrollLeft !== scrollLeft) target.scrollLeft = scrollLeft })
  }
  function recordButton(value: string, label: string, action: (row: ActiveRosterRow) => boolean, row: ActiveRosterRow, disabled = false) {
    if (!value) return null
    return <button type="button" className="impact-roster-record-link" title={`Open ${label} in COMPASS`} onClick={() => openRecord(action, row)} disabled={disabled}>{value}</button>
  }

  return <details className="impact-roster panel" onToggle={(event) => setExpanded(event.currentTarget.open)}>
    <summary>Active Client Roster</summary>
    <div className="impact-roster-content">
      <div className="impact-roster-toolbar">
        <p className="hint">Current active enrollments in programs available to your role. This roster is independent of the My Impact cadence.</p>
        <label className="impact-roster-program-filter"><span>Program</span><select value={selectedProgram} onChange={(event) => setSelectedProgram(event.target.value)} disabled={!programs.length}><option value="all">All programs available to your role</option>{programs.map((program) => <option key={program} value={program}>{program}</option>)}</select></label>
      </div>
      {!authorizedPrograms.length ? <p className="hint" role="status">No program roster access is assigned to your current role.</p> : null}
      {loading ? <p className="hint" role="status">Loading active client roster…</p> : null}
      {error ? <p className="error" role="alert">The active client roster could not be loaded. {error}</p> : null}
      {actionError ? <p className="error" role="alert">{actionError}</p> : null}
      {loaded && !error && visibleRows.length === 0 ? <p className="hint">No active client enrollments for this program selection.</p> : null}
      {loaded && !error && visibleRows.length > 0 ? <>
      <div className="impact-roster-horizontal-scroll impact-roster-horizontal-scroll-top" ref={topScrollRef} onScroll={(event) => syncHorizontalScroll('top', event.currentTarget.scrollLeft)} role="region" aria-label="Scroll roster columns"><div style={{ width: tableScrollWidth, height: 1 }} /></div>
      <div className="impact-roster-table-wrap" ref={tableScrollRef} onScroll={(event) => syncHorizontalScroll('table', event.currentTarget.scrollLeft)} role="region" aria-label="Active Client Roster table" tabIndex={0}><SortableRecordTable key={selectedProgram} className="impact-roster-table">
        <thead><tr><th>Client ID</th><th>Client Name</th><th>Client DOB</th><th>Program Name</th><th>Program Start Date</th><th>Program End Date</th><th>Staff Assigned</th><th>Last Service Received Date</th><th>Service Category</th><th>Service</th>{showBedEnrollmentColumns ? <th>Check In Date</th> : null}{showBedEnrollmentColumns ? <th>Check Out Date</th> : null}{showBedEnrollmentColumns ? <th>Bed Number</th> : null}</tr></thead>
        <tbody>{visibleRows.map((row) => <tr key={row.enrollmentId}>
          <td>{recordButton(row.clientRecordId, 'Client Profile', onOpenClient, row)}</td>
          <td>{row.clientName}</td><td data-sort-value={row.clientDob}>{formatDate(row.clientDob)}</td>
          <td>{recordButton(row.program, 'Program Enrollment', onOpenProgramEnrollment, row)}</td>
          <td data-sort-value={row.programStartDate}>{formatDate(row.programStartDate)}</td><td data-sort-value={row.programEndDate}>{formatDate(row.programEndDate)}</td><td>{row.staffAssigned}</td>
          <td data-sort-value={row.serviceDate}>{row.serviceId ? recordButton(formatDate(row.serviceDate), 'Service', onOpenService, row) : formatDate(row.serviceDate)}</td>
          <td>{row.serviceCategory}</td><td>{row.service}</td>
          {showBedEnrollmentColumns ? <td data-sort-value={row.checkInDate}>{row.bedEnrollmentId ? recordButton(formatDate(row.checkInDate), 'Bed Enrollment', onOpenBedEnrollment, row) : formatDate(row.checkInDate)}</td> : null}
          {showBedEnrollmentColumns ? <td data-sort-value={row.checkOutDate}>{formatDate(row.checkOutDate)}</td> : null}{showBedEnrollmentColumns ? <td>{row.bedNumber}</td> : null}
        </tr>)}</tbody>
      </SortableRecordTable></div>
      <div className="impact-roster-horizontal-scroll impact-roster-horizontal-scroll-bottom" ref={bottomScrollRef} onScroll={(event) => syncHorizontalScroll('bottom', event.currentTarget.scrollLeft)} role="region" aria-label="Scroll roster columns"><div style={{ width: tableScrollWidth, height: 1 }} /></div>
      </> : null}
    </div>
  </details>
}
