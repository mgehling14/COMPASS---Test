import { reportDate, reportDay, validateReportPeriod } from '../desDvReport'
import { loadReportSnapshot, type ReportSnapshot } from './reportDataverse'
import { profileIsExcludedFromReports, reportRowIsArchived } from './reportEligibility'
import { SASP_AUDIT_DATASET, SASP_MUSKIE_REQUIREMENTS, SASP_MUSKIE_OPTIONAL_FIELDS, SASP_MUSKIE_SECTIONS } from './saspMuskiePlan'
import { saspSupplementRows, SASP_REFERENCE_CHECKLIST, SASP_REFERENCE_COVERAGE, type SaspQualifiedService } from './saspMuskieSupplement'
import type { ReportMappings } from './reportMappings'
import type { LegacyReportResult, ReportRow } from './reportTypes'

export type SaspPeriod = { PeriodType: 'Selected range' | 'Monthly' | 'Annual'; Period: string; PeriodStart: string; PeriodEnd: string; key: string }
const text = (value: unknown) => String(value ?? '').trim()
const key = (value: unknown) => text(value).replace(/[{}]/g, '').toLowerCase()
const unknown = 'Unknown / not reported'
const ageBands = ['0–12', '13–17', '18–24', '25–59', '60+', unknown]

export function saspMuskiePeriods(start: string, end: string): SaspPeriod[] {
  validateReportPeriod(start, end)
  const first = reportDay(start)!, last = reportDay(end)!
  const periods: SaspPeriod[] = [{ PeriodType: 'Selected range', Period: 'Entire selected range', PeriodStart: reportDate(first), PeriodEnd: reportDate(last), key: 'all' }]
  for (const annual of [false, true]) {
    const initial = new Date(first * 86400000)
    let date = new Date(Date.UTC(initial.getUTCFullYear(), annual ? 0 : initial.getUTCMonth(), 1))
    while (date.getTime() / 86400000 <= last) {
      const next = new Date(Date.UTC(date.getUTCFullYear(), date.getUTCMonth() + (annual ? 12 : 1), 1))
      const month = date.toISOString().slice(0, 7), year = String(date.getUTCFullYear())
      periods.push({ PeriodType: annual ? 'Annual' : 'Monthly', Period: annual ? year : month, PeriodStart: reportDate(Math.max(first, date.getTime() / 86400000)), PeriodEnd: reportDate(Math.min(last, next.getTime() / 86400000 - 1)), key: annual ? 'y:' + year : 'm:' + month })
      date = next
    }
  }
  return periods
}
function index(rows: ReportRow[], field: string, table: string): Map<string, ReportRow> {
  const result = new Map<string, ReportRow>()
  for (const row of rows) {
    const id = key(row[field])
    if (!id || result.has(id)) throw new Error(`${table} returned a missing or repeated record ID. No partial SASP report was retained.`)
    result.set(id, row)
  }
  return result
}
function links(rows: ReportRow[], from: string, to: string): Map<string, string> {
  const result = new Map<string, string>()
  for (const row of rows) {
    const source = key(row[from]), parent = key(row[to])
    if (!source || !parent) continue
    if (result.has(source) && result.get(source) !== parent) throw new Error('Conflicting report relationships. No SASP client/program link was guessed.')
    result.set(source, parent)
  }
  return result
}
function ageBand(client: ReportRow, when: number): string {
  const dob = reportDay(text(client.dob))
  if (dob === null || dob > when) return unknown
  const birth = new Date(dob * 86400000), at = new Date(when * 86400000)
  let age = at.getUTCFullYear() - birth.getUTCFullYear()
  if (at.getUTCMonth() < birth.getUTCMonth() || at.getUTCMonth() === birth.getUTCMonth() && at.getUTCDate() < birth.getUTCDate()) age--
  return age <= 12 ? ageBands[0] : age <= 17 ? ageBands[1] : age <= 24 ? ageBands[2] : age <= 59 ? ageBands[3] : ageBands[4]
}
function demographicValues(value: unknown): string[] {
  const values = text(value).split('|').map((item) => item.trim()).filter(Boolean)
  return [...new Map((values.length ? values : [unknown]).map((value) => [/^(data not collected|unknown\s*\/\s*not reported)$/i.test(value) ? unknown.toLowerCase() : value.toLowerCase(), /^(data not collected|unknown\s*\/\s*not reported)$/i.test(value) ? unknown : value])).values()]
}
type QualifiedService = SaspQualifiedService
function minutes(value: unknown): number | null {
  if ((typeof value !== 'string' && typeof value !== 'number') || !text(value)) return null
  const number = Number(value)
  return Number.isFinite(number) && number >= 0 ? number : null
}
function periodFields(period: SaspPeriod) {
  return { PeriodType: period.PeriodType, Period: period.Period, PeriodStart: period.PeriodStart, PeriodEnd: period.PeriodEnd }
}
function serviceRows(services: QualifiedService[], period: SaspPeriod, calls: boolean): ReportRow[] {
  // REACH Center moved its call workflow to Services. Every qualifying service
  // is one call; Meeting Mode is not an eligibility rule or required source.
  const selected = services
  const groups = new Map<string, { category: string; service: string; rows: QualifiedService[] }>()
  for (const entry of selected) {
    const category = text(entry.row.ServiceCategory) || 'Unknown / not recorded', service = text(entry.row.Service) || 'Unknown / not recorded'
    const groupKey = JSON.stringify([category.toLowerCase(), service.toLowerCase()])
    const group = groups.get(groupKey) || { category, service, rows: [] }
    group.rows.push(entry); groups.set(groupKey, group)
  }
  function summary(category: string, service: string, rows: QualifiedService[], total = false): ReportRow {
    const knownMinutes = rows.reduce((total, entry) => total + (entry.minutes ?? 0), 0)
    return { ...periodFields(period), ServiceCategory: category, Service: service, [calls ? 'Calls' : 'ServiceRecords']: rows.length, DistinctClients: new Set(rows.map((entry) => entry.clientId)).size, KnownMinutes: knownMinutes, KnownHours: knownMinutes / 60, MissingOrInvalidMinutes: rows.filter((entry) => entry.minutes === null).length, IsTotal: total }
  }
  return [...[...groups.values()].sort((a, b) => a.category.localeCompare(b.category) || a.service.localeCompare(b.service)).map((group) => summary(group.category, group.service, group.rows)), summary('All service categories', 'TOTAL', selected, true)]
}
export async function calculateSaspMuskieReport(snapshot: ReportSnapshot, start: string, end: string, signal: AbortSignal, progress: (message: string) => void): Promise<LegacyReportResult> {
  const periods = saspMuskiePeriods(start, end)
  signal.throwIfAborted()
  const result: LegacyReportResult = { datasets: {}, displayIds: snapshot.displayIds, warnings: [...snapshot.warnings], generatedAt: new Date().toISOString() }
  result.datasets[SASP_REFERENCE_CHECKLIST.name] = { rows: SASP_REFERENCE_COVERAGE.map((row) => ({ ...row })) }
  const problems = Object.keys(SASP_MUSKIE_REQUIREMENTS).map((table) => snapshot.unavailable[table] || (!Array.isArray(snapshot.tables[table]) ? `${table} data was not returned.` : '')).filter(Boolean)
  if (problems.length) {
    for (const name of [...SASP_MUSKIE_SECTIONS.map((section) => section.name), SASP_AUDIT_DATASET]) result.datasets[name] = { unavailable: [...new Set(problems)].join(' ') }
    result.warnings.push('SASP eligibility could not be verified. Unavailable sections are not zero counts.')
    return result
  }
  const clients = index(snapshot.tables.Client_Profile, 'document_id', 'Client Profile')
  const enrollments = index(snapshot.tables.ProgramEnrollment, 'RecordID', 'Program Enrollment')
  const services = index(snapshot.tables.Services, 'RecordID', 'Services')
  const clientLinks = links(snapshot.tables.documents || [], 'RecordId', 'ParentId'), enrollmentLinks = links(snapshot.tables.Links || [], 'LinkFromId', 'LinkToId')
  const buckets = new Map(periods.map((period) => [period.key, [] as QualifiedService[]]))
  const audits: ReportRow[] = [], issues = new Map<string, number>()
  const displayed = (id: string) => snapshot.displayIds[id] || 'App Record ID unavailable'
  function issue(reason: string) { issues.set(reason, (issues.get(reason) || 0) + 1) }
  function audit(row: ReportRow, reason: string, clientId = '', enrollmentId = '', included = false) {
    audits.push({ ServiceRecordID: displayed(key(row.RecordID)), ClientRecordID: clientId ? displayed(clientId) : '', EnrollmentRecordID: enrollmentId ? displayed(enrollmentId) : '', DateOfService: text(row.DateofService), ServiceCategory: text(row.ServiceCategory), Service: text(row.Service), Included: included ? 'Yes' : 'No', Decision: reason })
  }
  let processed = 0
  async function checkpoint(stage: string, force = false) {
    if (++processed % 500 === 0 || force) { progress(stage); await new Promise<void>((resolve) => setTimeout(resolve, 0)); signal.throwIfAborted() }
  }
  const first = reportDay(start)!, last = reportDay(end)!
  for (const [serviceId, row] of services) {
    await checkpoint(`Checking SASP Services (${processed.toLocaleString()} records processed)…`)
    if (reportRowIsArchived(row)) continue
    // Funding is exclusively the Services value; never inherit enrollment funding.
    if (key(row.Funder) !== 'sasp') continue
    const enrollmentId = enrollmentLinks.get(serviceId) || '', enrollment = enrollments.get(enrollmentId)
    if (!enrollment) { issue('SASP service has no verified linked Program Enrollment and was excluded.'); audit(row, 'Missing verified Program Enrollment'); continue }
    if (reportRowIsArchived(enrollment) || key(enrollment.Program) !== 'reach center') continue
    const clientId = clientLinks.get(enrollmentId) || '', client = clients.get(clientId)
    if (!client) { issue('REACH Center SASP service has no verified Client Profile and was excluded.'); audit(row, 'Missing verified Client Profile', '', enrollmentId); continue }
    if (reportRowIsArchived(client) || profileIsExcludedFromReports(client)) continue
    const when = reportDay(text(row.DateofService))
    if (when === null) { issue('REACH Center SASP service has no valid service date and was excluded.'); audit(row, 'Missing/invalid service date', clientId, enrollmentId); continue }
    if (when < first || when > last) continue
    const duration = minutes(row.Minutes), warnings: string[] = []
    if (duration === null) { const warning = 'Missing/invalid minutes: clients and services are counted, but time totals contain known minutes only.'; issue(warning); warnings.push(warning) }
    if (ageBand(client, when) === unknown) { const warning = 'Missing/invalid/future client DOB: client is retained in the Unknown age category.'; issue(warning); warnings.push(warning) }
    const entry: QualifiedService = { row, client, clientId, enrollment, when, minutes: duration }, date = new Date(when * 86400000)
    const keys = ['all', 'm:' + reportDate(when).slice(0, 7), `y:${date.getUTCFullYear()}`]
    for (const bucket of keys) buckets.get(bucket)!.push(entry)
    audit(row, warnings.length ? 'Included; ' + warnings.join(' ') : 'Included: REACH Center + Services funder SASP', clientId, enrollmentId, true)
  }
  const people: ReportRow[] = [], delivered: ReportRow[] = [], calls: ReportRow[] = []
  for (const period of periods) {
    await checkpoint(`Calculating SASP ${period.PeriodType.toLowerCase()} ${period.Period}…`, true)
    const matched = buckets.get(period.key)!, unique = new Map<string, QualifiedService>()
    for (const entry of matched) if (!unique.has(entry.clientId) || unique.get(entry.clientId)!.when > entry.when) unique.set(entry.clientId, entry)
    people.push({ ...periodFields(period), Demographic: 'Clients Served', Category: 'Total distinct clients', Clients: unique.size, IsTotal: true })
    const ages = new Map(ageBands.map((band) => [band, 0]))
    const demographicCounts = new Map<string, { demographic: string; category: string; clients: number }>()
    for (const demographic of ['Race', 'Gender', 'Ethnicity']) demographicCounts.set(JSON.stringify([demographic, unknown.toLowerCase()]), { demographic, category: unknown, clients: 0 })
    for (const { client, when } of unique.values()) {
      const age = ageBand(client, when); ages.set(age, ages.get(age)! + 1)
      for (const [demographic, field] of [['Race', 'race'], ['Gender', 'gender'], ['Ethnicity', 'ethnicity']]) for (const category of demographicValues(client[field])) {
        const groupKey = JSON.stringify([demographic, category.toLowerCase()]), group = demographicCounts.get(groupKey) || { demographic, category, clients: 0 }
        group.clients++; demographicCounts.set(groupKey, group)
      }
    }
    for (const [category, count] of ages) people.push({ ...periodFields(period), Demographic: 'Age at first qualifying service in this period', Category: category, Clients: count })
    for (const group of [...demographicCounts.values()].sort((a, b) => a.demographic.localeCompare(b.demographic) || a.category.localeCompare(b.category))) people.push({ ...periodFields(period), Demographic: group.demographic, Category: group.category, Clients: group.clients })
    delivered.push(...serviceRows(matched, period, false)); calls.push(...serviceRows(matched, period, true))
    for (const [name, dataset] of Object.entries(saspSupplementRows(snapshot, matched, period))) {
      if (dataset.unavailable) result.datasets[name] = dataset
      else if (!result.datasets[name]?.unavailable) (result.datasets[name] ||= { rows: [] }).rows!.push(...dataset.rows!)
    }
  }
  result.datasets.SASP_ClientsServed = { rows: people }
  result.datasets.SASP_ClientServices = { rows: delivered }
  result.datasets.SASP_Calls = { rows: calls }
  result.datasets[SASP_AUDIT_DATASET] = { rows: audits }
  for (const [reason, count] of issues) result.warnings.push(`${count.toLocaleString()} record(s): ${reason}`)
  result.warnings.push('Monthly and calendar-year annual periods (January 1 through December 31) are clipped to the selected dates. Distinct clients are recalculated in each period; do not add monthly client totals to obtain an annual or entire-range total.')
  result.warnings.push('Each qualifying SASP-funded REACH Center Services record counts as one call, regardless of Meeting Mode. Calls and Client Services report the same records under different section labels; do not add their counts together. No Helpline records or October 1 once-per-year People Served rule are used.')
  result.warnings.push('The 2024 PDF is a structural reference, not a source of current values. New supplements retain the existing all-client cohort and current choice labels. Primary/secondary status, SASP outcomes, supported victimizations and old service-category crosswalks must be validated before official PDF submission. See the completion/mapping checklist; unsupported measures are not reported as zero.')
  signal.throwIfAborted()
  return result
}
export async function runSaspMuskieReport(parameters: Record<string, unknown>, mappings: ReportMappings, signal: AbortSignal, progress: (message: string) => void): Promise<LegacyReportResult> {
  const start = text(parameters.ReportPeriodStart), end = text(parameters.ReportPeriodEnd)
  validateReportPeriod(start, end); signal.throwIfAborted()
  const snapshot = await loadReportSnapshot(SASP_MUSKIE_REQUIREMENTS, mappings, signal, progress, { Services: { startField: 'DateofService', from: reportDate(reportDay(start)!), toExclusive: reportDate(reportDay(end)! + 1) } }, SASP_MUSKIE_OPTIONAL_FIELDS)
  signal.throwIfAborted()
  return calculateSaspMuskieReport(snapshot, start, end, signal, progress)
}
