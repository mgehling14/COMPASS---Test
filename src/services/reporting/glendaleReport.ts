import { currentReportDate, reportDate, reportDay, validateReportPeriod } from '../desDvReport'
import { loadReportSnapshot, type ReportSnapshot } from './reportDataverse'
import { profileIsExcludedFromReports, reportRowIsArchived } from './reportEligibility'
import { GLENDALE_DATA_NEEDS, GLENDALE_REQUIREMENTS, GLENDALE_SECTIONS } from './glendalePlan'
import { glendaleDemographics } from './glendaleDemographics'
import type { ReportMappings } from './reportMappings'
import type { LegacyReportResult, ReportRow } from './reportTypes'

const text = (value: unknown) => String(value ?? '').trim()
const key = (value: unknown) => text(value).replace(/[{}]/g, '').toLowerCase()
const normalized = (value: unknown) => text(value).toLowerCase()
const day = (row: ReportRow, field: string) => reportDay(text(row[field]))
const eligible = (row: ReportRow) => ['enrolled', 're-enrolled'].includes(normalized(row.EnrollmentStatus))
function program(row: ReportRow): string { return text(row.Program).replace(/ Transitional$/i, '').replace(/^CAAFA Outreach$/i, 'DV Outreach') }
const outreach = (row: ReportRow) => normalized(program(row)) === 'dv outreach'
const faithHouse = (row: ReportRow) => normalized(program(row)) === 'faith house'
export function glendaleFiscalStart(date: string): string {
  const value = reportDay(date)
  if (value === null) throw new Error('Invalid Glendale fiscal date.')
  const at = new Date(value * 86400000)
  return `${at.getUTCFullYear() - (at.getUTCMonth() < 6 ? 1 : 0)}-07-01`
}
export type GlendaleMonth = { Month: string; PeriodStart: string; PeriodEnd: string; FiscalYear: string }
export function glendaleMonths(start: string, end: string): GlendaleMonth[] {
  validateReportPeriod(start, end)
  const first = reportDay(start)!, last = reportDay(end)!, date = new Date(first * 86400000), months: GlendaleMonth[] = []
  let from = new Date(Date.UTC(date.getUTCFullYear(), date.getUTCMonth(), 1))
  while (from.getTime() / 86400000 <= last) {
    const next = new Date(Date.UTC(from.getUTCFullYear(), from.getUTCMonth() + 1, 1)), fiscal = Number(glendaleFiscalStart(from.toISOString().slice(0, 10)).slice(0, 4))
    months.push({ Month: from.toISOString().slice(0, 7), PeriodStart: reportDate(Math.max(first, from.getTime() / 86400000)), PeriodEnd: reportDate(Math.min(last, next.getTime() / 86400000 - 1)), FiscalYear: `${fiscal}-${fiscal + 1}` })
    from = next
  }
  return months
}
function index(rows: ReportRow[], field: string, table: string): Map<string, ReportRow> {
  const map = new Map<string, ReportRow>()
  for (const row of rows) { const id = key(row[field]); if (!id || map.has(id)) throw new Error(`${table} returned a missing/repeated ID. No partial Glendale report retained.`); map.set(id, row) }
  return map
}
function relation(rows: ReportRow[], from: string, to: string): Map<string, string> {
  const map = new Map<string, string>()
  for (const row of rows) { const id = key(row[from]), target = key(row[to]); if (!id || !target) continue; if (map.has(id) && map.get(id) !== target) throw new Error('Conflicting Glendale parent relationships. No link was guessed.'); map.set(id, target) }
  return map
}
type Candidate = { clientId: string; client: ReportRow; enrollment: ReportRow; when: number; fiscal: number; source: string }
export async function calculateGlendaleReport(snapshot: ReportSnapshot, start: string, end: string, signal: AbortSignal, progress: (message: string) => void, asOf = currentReportDate()): Promise<LegacyReportResult> {
  validateReportPeriod(start, end); signal.throwIfAborted()
  const today = reportDay(asOf)
  if (today === null) throw new Error('Invalid Glendale as-of date.')
  const first = reportDay(start)!, last = Math.min(reportDay(end)!, today)
  if (first > last) throw new Error('The Glendale report period starts after the current date.')
  const months = glendaleMonths(start, reportDate(last)), result: LegacyReportResult = { datasets: {}, warnings: [...snapshot.warnings], displayIds: snapshot.displayIds, generatedAt: new Date().toISOString() }
  for (const section of GLENDALE_SECTIONS) {
    const errors = section.tables.map((table) => snapshot.unavailable[table] || (!Array.isArray(snapshot.tables[table]) ? `${table} data was not returned.` : '')).filter(Boolean)
    result.datasets[section.name] = errors.length ? { unavailable: [...new Set(errors)].join(' ') } : { rows: [] }
  }
  if (!Array.isArray(snapshot.tables.HouseholdLinks)) for (const name of ['Glendale_Households', 'Glendale_HouseholdDemographics']) result.datasets[name] = { unavailable: 'Verified household relationship links were not returned. Household counts are unavailable, not zero.' }
  result.datasets.Glendale_DataNeeds = { rows: GLENDALE_DATA_NEEDS.map((row) => ({ ...row })) }
  const audit: ReportRow[] = [], issues = new Map<string, number>()
  const display = (id: unknown) => { const label = snapshot.displayIds[key(id)] || ''; return !label || /^[a-f\d]{8}(?:-[a-f\d]{4}){3}-[a-f\d]{12}$/i.test(label) ? 'App Record ID unavailable' : label }
  function log(section: string, row: ReportRow, decision: string, clientId = '', when: number | null = null, issue = false) {
    audit.push({ Section: section, RecordID: display(row.RecordID), ClientRecordID: clientId ? display(clientId) : '', Date: when === null ? '' : reportDate(when), Decision: decision, Issue: issue ? 'Yes' : 'No' })
    if (issue) issues.set(decision, (issues.get(decision) || 0) + 1)
  }
  let work = 0
  async function checkpoint(message: string, force = false) { if (++work % 500 === 0 || force) { progress(message); await new Promise<void>((resolve) => setTimeout(resolve, 0)); signal.throwIfAborted() } }
  const clients = index(snapshot.tables.Client_Profile || [], 'document_id', 'Client Profile'), enrollments = index(snapshot.tables.ProgramEnrollment || [], 'RecordID', 'Program Enrollment')
  const parent = relation(snapshot.tables.documents || [], 'RecordId', 'ParentId'), links = relation(snapshot.tables.Links || [], 'LinkFromId', 'LinkToId')
  const clientFor = (enrollment: ReportRow) => {
    const id = parent.get(key(enrollment.RecordID)) || '', client = clients.get(id)
    return client && !reportRowIsArchived(client) && !profileIsExcludedFromReports(client) && !reportRowIsArchived(enrollment) ? { id, client } : null
  }
  const counts: Candidate[] = []
  if (!result.datasets.Glendale_Individuals.unavailable) {
    const services = index(snapshot.tables.Services, 'RecordID', 'Services')
    for (let fiscal = reportDay(glendaleFiscalStart(start))!; fiscal <= last;) {
      const next = reportDay(`${new Date(fiscal * 86400000).getUTCFullYear() + 1}-07-01`)!, candidates: Candidate[] = []
      for (const enrollment of enrollments.values()) {
        const person = clientFor(enrollment), from = day(enrollment, 'ServiceStartDate'), rawEnd = text(enrollment.ServiceEndDate), to = rawEnd ? day(enrollment, 'ServiceEndDate') : null
        if (!person || !eligible(enrollment) || outreach(enrollment)) continue
        if (from === null || rawEnd && (to === null || to < from)) { log('Individuals', enrollment, 'Invalid enrollment dates; excluded.', person.id, null, true); continue }
        if (from >= next || from > last || from < fiscal && to !== null && to <= fiscal) continue
        if (!['autumn house', 'caafa shelter', 'dvstop', 'faith house', 'reach center'].includes(normalized(program(enrollment)))) { log('Individuals', enrollment, 'Unresolved program; fiscal history not guessed.', person.id, null, true); continue }
        if (normalized(program(enrollment)) === 'dvstop' && normalized(enrollment.ProgramType) === 'hotline') continue
        candidates.push({ ...person, clientId: person.id, enrollment, when: Math.max(from, fiscal), fiscal, source: key(enrollment.RecordID) })
        await checkpoint('Building July-June enrollment history...')
      }
      const firstOutreach = new Map<string, Candidate>()
      for (const service of services.values()) {
        if (reportRowIsArchived(service)) continue
        const enrollment = enrollments.get(links.get(key(service.RecordID)) || ''), when = day(service, 'DateofService')
        if (!enrollment || !outreach(enrollment) || !eligible(enrollment)) continue
        const person = clientFor(enrollment)
        if (!person) continue
        if (when === null) { log('Fiscal history', service, 'DV Outreach service has an invalid date; review history.', person.id, null, true); continue }
        if (when < fiscal || when >= next || when > last) continue
        const previous = firstOutreach.get(person.id), source = key(service.RecordID)
        if (!previous || when < previous.when || when === previous.when && source < previous.source) firstOutreach.set(person.id, { clientId: person.id, client: person.client, enrollment, when, fiscal, source })
        await checkpoint('Checking DV Outreach fiscal history...')
      }
      candidates.push(...firstOutreach.values())
      candidates.sort((a, b) => a.when - b.when || Number(outreach(a.enrollment)) - Number(outreach(b.enrollment)) || a.source.localeCompare(b.source))
      const ledger = new Map<string, Candidate>()
      for (const candidate of candidates) {
        const previous = ledger.get(candidate.clientId), override = !!previous && outreach(previous.enrollment) && !outreach(candidate.enrollment)
        if (!previous || override) {
          ledger.set(candidate.clientId, candidate)
          if (faithHouse(candidate.enrollment)) counts.push(candidate)
          log('Fiscal history', candidate.enrollment, override ? 'DV Outreach transfer count.' : 'First July-June fiscal-year count.', candidate.clientId, candidate.when)
        } else log('Fiscal history', candidate.enrollment, `Already counted for ${program(previous.enrollment)} in this July-June fiscal year.`, candidate.clientId, candidate.when)
        await checkpoint('Deduplicating fiscal-year person counts...')
      }
      fiscal = next
    }
    for (const month of months) {
      const from = reportDay(month.PeriodStart)!, through = reportDay(month.PeriodEnd)!, fiscal = reportDay(glendaleFiscalStart(month.PeriodStart))!, matched = counts.filter((entry) => entry.when >= from && entry.when <= through)
      result.datasets.Glendale_Individuals.rows!.push({ ...month, IndividualsServed: matched.length, FiscalYearToDate: counts.filter((entry) => entry.fiscal === fiscal && entry.when <= through).length })
      result.datasets.Glendale_IndividualDemographics.rows!.push(...glendaleDemographics(matched.map((entry) => ({ client: entry.client, when: entry.when })), false).map((row) => ({ ...month, ...row })))
    }
  }

  if (!result.datasets.Glendale_Households.unavailable) {
    const households = index(snapshot.tables.Household, 'RecordID', 'Households'), histories = index(snapshot.tables.HouseholdHistory, 'RecordID', 'Household History')
    const householdLinks = new Map<string, ReportRow>()
    for (const row of snapshot.tables.HouseholdLinks || []) { const id = key(row.RecordId); if (householdLinks.has(id) && JSON.stringify(householdLinks.get(id)) !== JSON.stringify(row)) throw new Error('Conflicting household membership links.'); householdLinks.set(id, row) }
    const membership = new Map<string, Map<string, { history: ReportRow; self: boolean }>>(), clientHouseholds = new Map<string, Set<string>>()
    for (const [id, row] of histories) {
      if (reportRowIsArchived(row)) continue
      if (!['active', 'inactive'].includes(normalized(row.Status))) { log('Households', row, 'Unknown membership status; not assumed Active.', '', null, true); continue }
      if (normalized(row.Status) !== 'active') continue
      if (!householdLinks.has(id)) throw new Error('A Household History row has no verified relationship adapter. No partial household report retained.')
      const link = householdLinks.get(id), householdId = key(link?.HouseholdId), clientId = key(link?.ClientId), household = households.get(householdId), client = clients.get(clientId)
      if (!householdId) continue // Active unassigned pool is not a household.
      if (!household || reportRowIsArchived(household) || !client || reportRowIsArchived(client) || profileIsExcludedFromReports(client)) continue
      const members = membership.get(householdId) || new Map(), self = normalized(row.RelationshipToHoH) === 'self', previous = members.get(clientId)
      if (previous && previous.self !== self) throw new Error('Conflicting active household relationships. No Head of Household was guessed.')
      members.set(clientId, { history: row, self }); membership.set(householdId, members)
      const memberships = clientHouseholds.get(clientId) || new Set<string>(); memberships.add(householdId); clientHouseholds.set(clientId, memberships)
      await checkpoint('Indexing current household membership...')
    }
    const invalid = new Set<string>()
    for (const ids of clientHouseholds.values()) if (ids.size > 1) for (const id of ids) { invalid.add(id); log('Households', households.get(id)!, 'Member has multiple active households; affected household excluded for review.', '', null, true) }
    const householdCounts = new Map<string, { householdId: string; candidate: Candidate; head: ReportRow | null }>()
    for (const candidate of counts) for (const householdId of clientHouseholds.get(candidate.clientId) || []) {
      const members = membership.get(householdId)!, household = households.get(householdId)!
      if (members.size < 2 || invalid.has(householdId)) continue
      const group = `${householdId}|${candidate.fiscal}`, previous = householdCounts.get(group)
      if (previous && previous.candidate.when <= candidate.when) continue
      const heads = [...members].filter(([, member]) => member.self), head = heads.length === 1 ? clients.get(heads[0][0])! : null
      householdCounts.set(group, { householdId, candidate, head })
      if (!head) log('Households', household, 'Missing/multiple current Heads of Household; household retained, head demographics Unknown.', '', candidate.when, true)
      const declared = Number(household.MemberCount)
      if (!Number.isFinite(declared) || declared !== members.size) log('Households', household, 'Stored household size differs from verified active eligible membership; membership used.', '', candidate.when, true)
    }
    for (const { householdId, candidate, head } of householdCounts.values()) log('Households', households.get(householdId)!, 'First July-June household count (current-membership snapshot).', head ? key(head.document_id) : '', candidate.when)
    for (const month of months) {
      const from = reportDay(month.PeriodStart)!, through = reportDay(month.PeriodEnd)!, fiscal = reportDay(glendaleFiscalStart(month.PeriodStart))!, all = [...householdCounts.values()], matched = all.filter(({ candidate }) => candidate.when >= from && candidate.when <= through)
      result.datasets.Glendale_Households.rows!.push({ ...month, HouseholdsServed: matched.length, FiscalYearToDate: all.filter(({ candidate }) => candidate.fiscal === fiscal && candidate.when <= through).length })
      result.datasets.Glendale_HouseholdDemographics.rows!.push(...glendaleDemographics(matched.map(({ candidate, head }) => ({ client: head, when: candidate.when })), true).map((row) => ({ ...month, ...row })))
    }
  }

  if (!result.datasets.Glendale_BedNights.unavailable) {
    const stays = index(snapshot.tables.BedEnrollment, 'RecordID', 'Bed Enrollment'), intervals = new Map<string, Array<[number, number]>>()
    const totals = new Map(months.map((month) => [month.Month, 0]))
    for (const stay of stays.values()) {
      if (reportRowIsArchived(stay)) continue
      const enrollment = enrollments.get(links.get(key(stay.RecordID)) || '')
      if (!enrollment || !faithHouse(enrollment)) continue
      const person = clientFor(enrollment), from = day(stay, 'CheckInDate'), rawEnd = text(stay.CheckOutDate), to = rawEnd ? day(stay, 'CheckOutDate') : today
      if (!person || from === null || to === null || to < from) { log('Bed nights', stay, 'Missing eligible parent or invalid bed-enrollment dates; excluded.', person?.id || '', null, true); continue }
      const clippedFrom = Math.max(from, first), clippedTo = Math.min(to, today, last + 1)
      if (clippedTo <= clippedFrom) continue
      const prior = intervals.get(person.id) || []
      if (prior.some(([a, b]) => clippedFrom < b && clippedTo > a)) log('Bed nights', stay, 'Overlapping bed enrollments counted separately; review for duplicates.', person.id, clippedFrom, true)
      prior.push([clippedFrom, clippedTo]); intervals.set(person.id, prior)
      for (const month of months) {
        const nights = Math.max(0, Math.min(clippedTo, reportDay(month.PeriodEnd)! + 1) - Math.max(clippedFrom, reportDay(month.PeriodStart)!))
        totals.set(month.Month, totals.get(month.Month)! + nights)
        if (nights) log('Bed nights', stay, `${nights} completed Faith House bed night(s) in ${month.Month}.`, person.id, clippedFrom)
      }
      await checkpoint('Calculating Faith House bed nights...')
    }
    result.datasets.Glendale_BedNights.rows = months.map((month) => ({ ...month, BedNights: totals.get(month.Month)! }))
  }
  result.datasets.Glendale_Audit = { rows: audit }
  result.warnings.push('Faith House Shelter only in displayed counts; no funder filter. All programs are considered for fiscal-year person deduplication. July 1 resets the year, continuing enrollments count again, and an initial DV Outreach count permits one later transfer count. DV Outreach history uses actual Services dates, as in DES.')
  result.warnings.push('Individuals include every qualifying person, including household members. Household totals are additional, separate units; never add individuals and households together. Households with 2+ current eligible active members count once per fiscal year using the earliest qualifying Faith House person count.')
  result.warnings.push('CURRENT MEMBERSHIP SNAPSHOT: Household History has no membership start/end dates. Current active members and current Self/Head of Household are used even for historical months. Household membership edits can change reruns. Household demographics use the Head of Household only.')
  result.warnings.push('The performance template informs categories only. Unknown race/ethnicity is not forced into HUD categories; missing disability/DOB remains Unknown. Senior means over age 62 (63+), as labeled in the template. Financial reimbursement, HUD AMI income bands and narratives require other verified data/manual completion.')
  if (reportDay(end)! > today) result.warnings.push(`Future report dates were clipped to ${asOf}; today's unfinished bed night is excluded.`)
  for (const [issue, count] of issues) result.warnings.push(`${count.toLocaleString()} audit item(s): ${issue}`)
  await checkpoint('City of Glendale report complete.', true)
  return result
}
export async function runGlendaleReport(parameters: Record<string, unknown>, mappings: ReportMappings, signal: AbortSignal, progress: (message: string) => void): Promise<LegacyReportResult> {
  const start = text(parameters.ReportPeriodStart), end = text(parameters.ReportPeriodEnd), today = currentReportDate()
  validateReportPeriod(start, end)
  const through = Math.min(reportDay(end)!, reportDay(today)!), toExclusive = reportDate(through + 1)
  if (reportDay(start)! > through) throw new Error('The Glendale report period starts after the current date.')
  const snapshot = await loadReportSnapshot(GLENDALE_REQUIREMENTS, mappings, signal, progress, {
    Services: { startField: 'DateofService', from: glendaleFiscalStart(start), toExclusive },
    BedEnrollment: { startField: 'CheckInDate', endField: 'CheckOutDate', from: start, toExclusive },
  })
  return calculateGlendaleReport(snapshot, start, end, signal, progress, today)
}
