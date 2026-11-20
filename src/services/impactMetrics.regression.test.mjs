import test from 'node:test'
import assert from 'node:assert/strict'
import { readFileSync } from 'node:fs'
import { impactPeriodRange, summarizeImpact } from './impactMath.ts'
import { compareRecordValues, sortRecordRows } from './recordSorting.ts'

test('My Impact reporting periods use calendar week/month/quarter and October fiscal-year boundaries', () => {
  const now = new Date(2026, 10, 19, 12)
  assert.deepEqual(impactPeriodRange('week', now), { from: '2026-11-16', toExclusive: '2026-11-23' })
  assert.deepEqual(impactPeriodRange('month', now), { from: '2026-11-01', toExclusive: '2026-12-01' })
  assert.deepEqual(impactPeriodRange('quarter', now), { from: '2026-10-01', toExclusive: '2027-01-01' })
  assert.deepEqual(impactPeriodRange('fiscal-year', now), { from: '2026-10-01', toExclusive: '2027-10-01' })
  assert.deepEqual(impactPeriodRange('fiscal-year', new Date(2026, 8, 30, 12)), { from: '2025-10-01', toExclusive: '2026-10-01' })
})

test('My Impact summaries deduplicate by COMPASS record ID and count unique clients', () => {
  const services = [
    { id: 'row-a', recordId: 'SV-1', minutes: 60, clientId: 'client-a' },
    { id: 'row-a-copy', recordId: 'SV-1', minutes: 60, clientId: 'client-a' },
    { id: 'row-b', recordId: 'SV-2', minutes: 30, clientId: 'client-a' },
    { id: 'row-c', recordId: 'SV-3', minutes: 30, clientId: 'client-b' },
  ]
  const calls = [
    { id: 'call-a', recordId: 'HL-1' },
    { id: 'call-a-copy', recordId: 'HL-1' },
    { id: 'call-b', recordId: 'HL-2' },
  ]
  const result = summarizeImpact(services, calls)
  assert.equal(result.services.length, 3)
  assert.equal(result.calls.length, 2)
  assert.equal(result.totalHours, 2)
  assert.equal(result.clientsServed, 2)
})

test('Impact detail actions open records through COMPASS in-app viewers', () => {
  const app = readFileSync(new URL('../App.tsx', import.meta.url), 'utf8')
  const panel = readFileSync(new URL('./ImpactManagementPanel.tsx', import.meta.url), 'utf8')
  assert.match(app, /function openImpactServiceRecord\([\s\S]*?setSelectedAppNav\('programs'\)[\s\S]*?openServicesDetail\(record\.id, record\.recordId, true\)/)
  assert.match(app, /function openImpactHelplineRecord\([\s\S]*?setSelectedAppNav\('programs'\)[\s\S]*?openHelplineDetail\(record\.id, record\.recordId\)/)
  assert.match(app, /function openImpactClientRecord\([\s\S]*?setSelectedAppNav\('clients'\)[\s\S]*?openClientProfileDetail\(clientId, recordId\)/)
  assert.match(app, /returnToImpact: boolean/)
  assert.match(app, /selectedAppNav === 'reports' && selectedReportsPage === 'impact-management'/)
  assert.match(app, /recordFormView\?\.returnToImpact[\s\S]*?'Back to Impact'/)
  assert.match(app, /origin\.returnToImpact[\s\S]*?setSelectedReportsPage\('impact-management'\)/)
  assert.match(app, /impactClientReturn \? 'Back to Impact' : 'Back to Clients'/)
  assert.match(panel, /onOpenService\(row\)/)
  assert.match(panel, /onOpenHelpline\(row\)/)
  assert.match(panel, /onOpenClient\(row\.clientId/)
  assert.doesNotMatch(panel, /main\.aspx|target="_blank"/)
})

test('Active Client Roster is standalone, role-scoped, and independent of cadence', () => {
  const app = readFileSync(new URL('../App.tsx', import.meta.url), 'utf8')
  const roster = readFileSync(new URL('./activeClientRoster.ts', import.meta.url), 'utf8')
  const panel = readFileSync(new URL('./ActiveClientRosterPanel.tsx', import.meta.url), 'utf8')
  assert.match(app, /impactAuthorizedPrograms = useMemo/)
  assert.match(app, /authorizedPrograms=\{impactAuthorizedPrograms\}/)
  assert.match(roster, /cmps_serviceenddate eq null/)
  assert.match(roster, /cmps_program eq \$\{value\}/)
  assert.match(panel, /<summary>Active Client Roster<\/summary>/)
  assert.match(panel, /impact-roster-horizontal-scroll-top/)
  assert.match(panel, /impact-roster-horizontal-scroll-bottom/)
  assert.match(panel, /syncHorizontalScroll/)
  assert.match(panel, /import SortableRecordTable from '\.\/SortableRecordTable'/)
  assert.match(panel, /<SortableRecordTable key=\{selectedProgram\} className="impact-roster-table">/)
  assert.match(panel, /data-sort-value=\{row\.clientDob\}/)
  assert.match(panel, /selectedProgram === 'all' \|\| !\['dv outreach', 'reach center'\]/)
  assert.match(panel, /showBedEnrollmentColumns \? <th>Check In Date<\/th>/)
  assert.match(panel, /showBedEnrollmentColumns \? <th>Check Out Date<\/th>/)
  assert.match(panel, /showBedEnrollmentColumns \? <th>Bed Number<\/th>/)
  assert.match(panel, /All programs available to your role/)
  assert.doesNotMatch(panel, /ImpactPeriod|periodRange|period=\{|period\s*\}/i)
  for (const heading of ['Client ID', 'Client Name', 'Client DOB', 'Program Name', 'Program Start Date', 'Program End Date', 'Staff Assigned', 'Last Service Received Date', 'Service Category', 'Service', 'Check In Date', 'Check Out Date', 'Bed Number']) assert.ok(panel.includes(heading), `missing roster column ${heading}`)
  assert.match(panel, /'Client Profile', onOpenClient, row/)
  assert.match(panel, /'Program Enrollment', onOpenProgramEnrollment, row/)
  assert.match(panel, /'Service', onOpenService, row/)
  assert.match(panel, /'Bed Enrollment', onOpenBedEnrollment, row/)
  assert.doesNotMatch(panel, /main\.aspx|target="_blank"/)
  const css = readFileSync(new URL('../index.css', import.meta.url), 'utf8')
  assert.match(css, /\.impact-roster-table \{[^}]*font-size: \.78rem/s)
})

test('Roster date columns sort oldest to newest with the shared folder sort rules', () => {
  const rows = [{ date: '2026-11-19' }, { date: '2025-01-02' }, { date: '2026-01-01' }]
  assert.deepEqual(sortRecordRows(rows, (row) => row.date, 'date', 'ascending').map((row) => row.date), ['2025-01-02', '2026-01-01', '2026-11-19'])
  assert.equal(compareRecordValues('2025-01-02', '2026-11-19', 'date', 'ascending') < 0, true)
})
