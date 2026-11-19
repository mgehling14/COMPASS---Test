// Local visual/interaction fixture. Sample data only: never queries Dataverse.
import { useState } from 'react'
import { createRoot } from 'react-dom/client'
import WorkRecordSearch from '../src/services/WorkRecordSearch'
import AdvancedSearchControls from '../src/services/AdvancedSearchControls'
import SortableRecordTable from '../src/services/SortableRecordTable'
import { matchesAdvancedSearch } from '../src/services/advancedSearch'
import '../src/index.css'
import '../src/App.css'

const records = Array.from({ length: 112 }, (_, index) => ({
  name: index % 2 ? 'John Smith' : 'Jane Williams', recordId: `CP-${String(index + 1).padStart(3, '0')}`, hmisId: `HMIS-${index}`, dateOfBirth: '1980-01-01', primaryLanguage: 'English', gender: 'Unknown',
  enrollments: [{ enrollmentId: `sample-${index}`, program: index % 2 ? 'Autumn House' : 'Faith House', startDate: index % 2 ? '2026-10-09' : '2025-01-01', recordId: `PE-${index + 1}`, staffAssigned: 'Sample Staff' }],
}))
const fields = [{ field: 'service', label: 'Service', kind: 'choice', options: [{ value: 'Intake', label: 'Intake' }, { value: 'Advocacy', label: 'Advocacy' }] }, { field: 'date', label: 'Date of Services', kind: 'date' }, { field: 'minutes', label: 'Minutes', kind: 'number' }, { field: 'notes', label: 'Notes', kind: 'text' }]
const services = [{ id: 'SV-10', service: 'Intake', date: '2026-10-09', minutes: 15, notes: 'Intake complete' }, { id: 'SV-2', service: 'Advocacy', date: '2025-12-01', minutes: 120, notes: 'Follow-up' }, { id: 'SV-1', service: 'Intake', date: '2026-02-01', minutes: 5, notes: '' }]
export default function Preview() {
  const [filters, setFilters] = useState([]), [dark, setDark] = useState(false)
  return <main className={`compass-app${dark ? ' theme-dark' : ''}`} style={{ maxWidth: 1350, marginInline: 'auto' }}>
    <header className="panel"><h1>Search &amp; Client Workspace</h1><p>Local package preview — sample data only. No live app or Dataverse writes.</p><button className="secondary" onClick={() => setDark(!dark)}>Toggle theme</button></header>
    <article className="panel wide hub-card" style={{ marginBlock: 16 }}><h2>My Work — Case Load</h2>
      <WorkRecordSearch identity="sample-case-load" records={records} getRecord={(row) => row} fullProfile>{(rows) => <div className="client-results-card-grid">{rows.map((row) => <article className="client-result-card" key={row.recordId}><h3>{row.name}</h3><p>{row.recordId} · {row.enrollments[0].program}</p></article>)}</div>}</WorkRecordSearch>
    </article>
    <article className="panel wide hub-card" style={{ marginBlock: 16 }}><h2>Program Search — Services</h2><AdvancedSearchControls fields={fields} applied={filters} onApply={setFilters}/>
      <div className="hub-search-results-table-wrap"><SortableRecordTable className="hub-search-results-table"><thead><tr><th>Record ID</th><th>Service</th><th>Date of Services</th><th>Minutes</th><th>Notes</th></tr></thead><tbody>{services.filter((row) => matchesAdvancedSearch(row, filters, fields)).map((row) => <tr key={row.id}><td>{row.id}</td><td>{row.service}</td><td>{row.date}</td><td>{row.minutes}</td><td>{row.notes || '-'}</td></tr>)}</tbody></SortableRecordTable></div>
    </article>
    <article className="panel wide hub-card"><h2>Services</h2><p className="form-client-context">Client: CP-046 — John M Smith</p><p>Sample form banner showing the client name and Record ID.</p></article>
  </main>
}
createRoot(document.getElementById('root')).render(<Preview />)
