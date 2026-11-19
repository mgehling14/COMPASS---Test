// Read-only DES DV prototype. Counting history is rebuilt for each report;
// no client/enrollment is marked counted and no source record is modified.
export const PEOPLE_PROGRAMS = ['CAAFA Shelter', 'DVSTOP', 'Faith House'] as const
export const OCCUPANCY_PROGRAMS = ['Autumn House', 'CAAFA Shelter', 'DVSTOP', 'Faith House'] as const
export const PEOPLE_CATEGORIES = ['TANF Adult', 'TANF Child', 'non-TANF Adult', 'non-TANF Child'] as const
export type ReportRules = {
  carryOver: boolean
  ageSource: 'birthDate' | 'clientType'
  adultAge: number
  tanfSource: 'enrollment' | 'client'
  tanfField: string
  tanfYes: string
  tanfNo: string
  deduplicateClientNights: boolean
}
export const DEFAULT_REPORT_RULES: ReportRules = {
  carryOver: true, ageSource: 'birthDate', adultAge: 18,
  tanfSource: 'enrollment', tanfField: 'cmps_tanfeligible',
  tanfYes: 'Yes', tanfNo: 'No',
  deduplicateClientNights: false,
}
export type ReportClient = { id: string; recordId: string; name: string; birthDate: string; tanf: string }
export type ReportEnrollment = {
  id: string; recordId: string; clientId: string; program: string; start: string; end: string;
  status: string; clientType: string; tanf: string
}
export type ReportStay = { id: string; recordId: string; enrollmentId: string; start: string; end: string }
export type ReportInput = { clients: ReportClient[]; enrollments: ReportEnrollment[]; stays: ReportStay[] }
export type ReportAudit = {
  section: 'People Served' | 'Shelter Occupancy'; recordId: string; rowId: string; client: string;
  program: string; date: string; decision: string; amount: number; issue: boolean
}
export type DesDvReport = {
  start: string; end: string; historyStart: string; asOf: string; rules: ReportRules;
  people: Record<string, Record<string, number>>; nights: Record<string, number>; audit: ReportAudit[]
}
const DAY = 86400000
const normalized = (value: unknown) => String(value || '').trim().toLowerCase()
export function reportDay(value: string): number | null {
  const text = String(value || '').trim()
  const match = text.match(/^(\d{4})-(\d{2})-(\d{2})(?:T.*)?$/) || text.match(/^(\d{1,2})\/(\d{1,2})\/(\d{4})(?:\s.*)?$/)?.slice(0).map((part, index, all) => index === 1 ? all[3] : index === 2 ? all[1] : index === 3 ? all[2] : part)
  if (!match) return null
  const [year, month, day] = match.slice(1).map(Number)
  const date = new Date(Date.UTC(year, month - 1, day))
  return year >= 1753 && date.getUTCFullYear() === year && date.getUTCMonth() === month - 1 && date.getUTCDate() === day ? date.getTime() / DAY : null
}
export const reportDate = (day: number) => new Date(day * DAY).toISOString().slice(0, 10)
export function reportingYearStart(date: string): string {
  const day = reportDay(date)
  if (day === null) throw new Error('Enter a valid report date.')
  const value = new Date(day * DAY)
  return `${value.getUTCFullYear() - (value.getUTCMonth() < 9 ? 1 : 0)}-10-01`
}
export function validateReportPeriod(start: string, end: string): void {
  const first = reportDay(start), last = reportDay(end)
  if (first === null || last === null || first > last) throw new Error('Choose a valid start/end date; end must be on or after start.')
  if (last - first > 3660) throw new Error('Run no more than ten years at a time.')
}
function program(value: string): string {
  const label = normalized(value) === 'caafa outreach' ? 'DV Outreach' : value.trim()
  return [...PEOPLE_PROGRAMS, ...OCCUPANCY_PROGRAMS, 'DV Outreach', 'REACH Center'].find((entry) => normalized(entry) === normalized(label)) || label
}
function eligibleStatus(status: string): boolean { return ['enrolled', 're-enrolled'].includes(normalized(status)) }
function category(client: ReportClient | undefined, enrollment: ReportEnrollment, when: number, rules: ReportRules): { label: string; reason: string } {
  if (!client) return { label: '', reason: 'Linked Client Profile could not be read.' }
  let child: boolean
  if (rules.ageSource === 'clientType') {
    if (!['adult', 'child'].includes(normalized(enrollment.clientType))) return { label: '', reason: 'Missing/unknown enrollment Client Type.' }
    child = normalized(enrollment.clientType) === 'child'
  } else {
    const birth = reportDay(client.birthDate)
    if (birth === null || birth > when) return { label: '', reason: 'Missing, invalid or future client Date of Birth.' }
    const date = new Date(when * DAY), birthday = new Date(birth * DAY)
    let age = date.getUTCFullYear() - birthday.getUTCFullYear()
    if (date.getUTCMonth() < birthday.getUTCMonth() || (date.getUTCMonth() === birthday.getUTCMonth() && date.getUTCDate() < birthday.getUTCDate())) age--
    child = age < rules.adultAge
  }
  const tanf = rules.tanfSource === 'client' ? client.tanf : enrollment.tanf
  if (normalized(tanf) === normalized(rules.tanfYes)) return { label: child ? 'TANF Child' : 'TANF Adult', reason: '' }
  if (normalized(tanf) !== normalized(rules.tanfNo)) return { label: '', reason: 'Missing/unknown TANF eligibility; not assumed to be No.' }
  if (child) return { label: 'non-TANF Child', reason: '' }
  return { label: 'non-TANF Adult', reason: '' }
}
export function currentReportDate(): string {
  const date = new Date()
  return `${date.getFullYear()}-${String(date.getMonth() + 1).padStart(2, '0')}-${String(date.getDate()).padStart(2, '0')}`
}
export function calculateDesDvReport(input: ReportInput, start: string, end: string, rules: ReportRules, asOf = currentReportDate()): DesDvReport {
  validateReportPeriod(start, end)
  if (!Number.isInteger(rules.adultAge) || rules.adultAge < 1 || rules.adultAge > 100 || !rules.tanfYes.trim() || !rules.tanfNo.trim() || normalized(rules.tanfYes) === normalized(rules.tanfNo)) throw new Error('Review the report classification rules.')
  const today = reportDay(asOf)
  if (today === null) throw new Error('The report as-of date is invalid.')
  const first = reportDay(start)!, last = Math.min(reportDay(end)!, today), historyStart = reportingYearStart(start)
  const result: DesDvReport = { start, end, historyStart, asOf, rules: { ...rules }, people: Object.fromEntries(PEOPLE_CATEGORIES.map((label) => [label, Object.fromEntries(PEOPLE_PROGRAMS.map((name) => [name, 0]))])), nights: Object.fromEntries(OCCUPANCY_PROGRAMS.map((name) => [name, 0])), audit: [] }
  const clients = new Map(input.clients.map((client) => [normalized(client.id), client]))
  const enrollments = new Map(input.enrollments.map((entry) => [normalized(entry.id), entry]))
  const ordered = [...input.enrollments].sort((a, b) => (reportDay(a.start) ?? Infinity) - (reportDay(b.start) ?? Infinity) || Number(program(a.program) === 'DV Outreach') - Number(program(b.program) === 'DV Outreach') || a.id.localeCompare(b.id))
  for (let fiscal = reportDay(historyStart)!; fiscal <= last;) {
    const next = reportDay(`${new Date(fiscal * DAY).getUTCFullYear() + 1}-10-01`)!
    const ledger = new Map<string, { program: string; overrideUsed: boolean }>()
    for (const entry of ordered) {
      const startDay = reportDay(entry.start), endDay = entry.end ? reportDay(entry.end) : null
      if (startDay !== null && (startDay >= next || startDay > last || (startDay < fiscal && (!rules.carryOver || (endDay !== null && endDay <= fiscal))))) continue
      const effective = startDay === null ? null : Math.max(startDay, fiscal)
      const clientId = normalized(entry.clientId), client = clients.get(clientId), name = program(entry.program)
      const base = { section: 'People Served' as const, recordId: entry.recordId, rowId: entry.id, client: client ? `${client.recordId} | ${client.name}` : entry.clientId, program: name, date: effective === null ? '' : reportDate(effective), amount: 0 }
      if (startDay === null || (entry.end && (endDay === null || endDay < startDay))) { result.audit.push({ ...base, decision: 'Invalid/missing enrollment dates; review required.', issue: true }); continue }
      if (!eligibleStatus(entry.status)) { result.audit.push({ ...base, decision: 'Not Enrolled/Re-Enrolled; waiting list/turnaway are excluded.', issue: !['waiting list', 'turnaway'].includes(normalized(entry.status)) }); continue }
      if (!clientId || !client || !name || /^\d+$/.test(name)) { result.audit.push({ ...base, decision: 'Missing/unresolved client link or program; review required.', issue: true }); continue }
      const previous = ledger.get(clientId)
      const override = !!previous && previous.program === 'DV Outreach' && !previous.overrideUsed && name !== 'DV Outreach'
      if (previous && !override) { result.audit.push({ ...base, decision: `Already counted for ${previous.program} in the October–September reporting year.`, issue: false }); continue }
      ledger.set(clientId, { program: name, overrideUsed: override })
      const classification = category(client, entry, effective!, rules)
      const insidePeriod = effective! >= first && effective! <= last
      const shown = (PEOPLE_PROGRAMS as readonly string[]).includes(name)
      const counted = insidePeriod && shown && !!classification.label
      if (counted) result.people[classification.label][name]++
      result.audit.push({ ...base, amount: counted ? 1 : 0, issue: shown && !classification.label, decision: !classification.label ? classification.reason : !insidePeriod ? 'First count occurred before the selected period (used for deduplication).' : !shown ? 'Counted in fiscal history; program is outside Section A/H columns.' : `${override ? 'DV Outreach transfer exception; ' : ''}${classification.label}${startDay < fiscal ? '; continuing enrollment counted at October 1' : ''}.` })
    }
    fiscal = next
  }
  // A bed enrollment represents a stay, not a mutable current physical bed
  // assignment. Overlaps are flagged; optional client-night deduplication can
  // be explored in setup, but the default counts each distinct bed enrollment.
  const occupied = new Map<string, Array<{ from: number; to: number }>>()
  for (const stay of [...input.stays].sort((a, b) => (reportDay(a.start) ?? Infinity) - (reportDay(b.start) ?? Infinity) || a.id.localeCompare(b.id))) {
    const parent = enrollments.get(normalized(stay.enrollmentId)), client = parent && clients.get(normalized(parent.clientId))
    const checkIn = reportDay(stay.start), checkOut = stay.end ? reportDay(stay.end) : null
    const name = parent ? program(parent.program) : ''
    const bucket = name
    const base = { section: 'Shelter Occupancy' as const, recordId: stay.recordId, rowId: stay.id, client: client ? `${client.recordId} | ${client.name}` : parent?.clientId || '', program: bucket, date: checkIn === null ? '' : reportDate(checkIn) }
    if (!parent || checkIn === null || (stay.end && (checkOut === null || checkOut < checkIn))) { result.audit.push({ ...base, amount: 0, issue: true, decision: 'Missing parent enrollment or invalid bed-enrollment dates.' }); continue }
    if (!(OCCUPANCY_PROGRAMS as readonly string[]).includes(bucket)) { result.audit.push({ ...base, amount: 0, issue: !name || /^\d+$/.test(name), decision: 'Program is outside Section B or unresolved.' }); continue }
    const from = Math.max(checkIn, first), to = Math.min(checkOut ?? today, last + 1, today)
    const occupancyKey = normalized(parent.clientId) || `enrollment:${parent.id}`
    const prior = occupied.get(occupancyKey) || []
    const overlaps = prior.filter((interval) => interval.from < to && interval.to > from).sort((a, b) => a.from - b.from)
    let cursor = from, count = 0
    for (const interval of overlaps) { count += Math.max(0, Math.min(interval.from, to) - cursor); cursor = Math.max(cursor, interval.to) }
    count += Math.max(0, to - cursor)
    if (!rules.deduplicateClientNights) count = Math.max(0, to - from)
    if (to > from) { prior.push({ from, to }); occupied.set(occupancyKey, prior) }
    result.nights[bucket] += count
    result.audit.push({ ...base, amount: count, issue: overlaps.length > 0 || !client, decision: to <= from ? 'No overnight stay inside the selected period.' : `${!client ? 'Client linkage unavailable; ' : ''}${overlaps.length ? `Overlapping stays ${rules.deduplicateClientNights ? 'counted once' : 'counted per bed enrollment'}; review needed.` : 'Bed-enrollment nights: check-in included; checkout/current day excluded; clipped to report dates.'}` })
  }
  return result
}
export function reportCsv(rows: Array<Array<string | number>>): string {
  return rows.map((row) => row.map((value) => { const text = String(value); return `"${(/^[\s]*[=+@-]|^[\t\r]/.test(text) ? "'" : '') + text.replace(/"/g, '""')}"` }).join(',')).join('\r\n')
}
