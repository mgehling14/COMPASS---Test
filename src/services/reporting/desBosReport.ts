import { reportDate, reportDay } from '../desDvReport'
import { loadReportSnapshot, type ReportDateScope, type ReportSnapshot } from './reportDataverse'
import {
  DES_BOS_EXHIBIT_A_DATASET,
  DES_BOS_EXHIBIT_A_ID,
  DES_BOS_EXHIBIT_D_DATASET,
  DES_BOS_EXHIBIT_D_ID,
  desBosRequirements,
} from './desBosPlan'
import type { ReportMappings } from './reportMappings'
import type { LegacyReport, LegacyReportResult, ReportRow } from './reportTypes'

const PROGRAM = 'CAAFA Shelter'
const text = (value: unknown) => String(value ?? '').trim()
const key = (value: unknown) => text(value).replace(/[{}]/g, '').toLowerCase()
const normalized = (value: unknown) => text(value).toLowerCase()
const yes = (value: unknown) => ['yes', 'true', '125570000'].includes(normalized(value))
const no = (value: unknown) => ['no', 'false', '125570001'].includes(normalized(value))

const EXHIBIT_D_SERVICE_TYPES = Object.fromEntries([
  ['Address Confidential Program', ['address confidential program']],
  ['Copy of ID', ['copy of id', 'identification assistance']],
  ['Education', ['education', 'child education referral', 'adult education referral', 'college & university access support', 'online learning resources', 'literacy support']],
  ['Employment', ['employment', 'job search assistance', 'resume support', 'interview preparation', 'employment referrals', 'employment coaching', 'job training assistance']],
  ['Financial Assistance', ['financial assistance', 'financial assistance (housing stability)', 'budgeting support', 'financial literacy', 'emergency financial assistance']],
  ['Food Assistance', ['food assistance']],
  ['Gym', ['gym']],
  ['Health', ['health', 'medical forensic exam advocacy/accompaniment']],
  ['Health Education', ['health education']],
  ['Housing', ['housing', 'housing search support', 'housing advocacy', 'landlord coordination', 'housing readiness planning', 'hotel voucher']],
  ['Legal Assistance', ['legal assistance', 'legal referrals', 'protective order assistance', 'criminal justice advocacy/accompaniment', 'civil legal adovcacy/accompaniment']],
  ['Library', ['library']],
  ['Notary Assistance', ['notary assistance']],
  ['Public Assistance', ['public assistance', 'benefits navigation']],
  ['Internal Referral', ['internal referral']],
  ['External Referral', ['external referral']],
  ['Resources', ['resources', 'general resource navigation', 'general service coordination', 'program information only']],
  ['Safety Plan', ['safety plan', 'physcial safety planning', 'physical safety planning', 'emotional safety planning', 'tech safety planning']],
  ['Transportation Assistance', ['transportation assistance', 'mckinney vento referral/coordination']],
].flatMap(([label, aliases]) => (aliases as string[]).map((alias) => [alias, label]))) as Record<string, string>

export function exhibitDServiceType(serviceCategory: unknown, service: unknown, serviceOther: unknown): string {
  const category = normalized(serviceCategory), other = normalized(serviceOther), standard = normalized(service)
  const referralOrResource = category === 'resource navigation' || /referral|resource/.test(standard) || /referral|resource/.test(other)
  if (!referralOrResource) return ''
  return EXHIBIT_D_SERVICE_TYPES[other] || EXHIBIT_D_SERVICE_TYPES[standard] || 'Resources'
}

export function desBosMonth(value: unknown): { month: string; start: string; end: string } {
  const month = text(value)
  if (!/^\d{4}-(0[1-9]|1[0-2])$/.test(month)) throw new Error('Choose a valid DES BOS report month.')
  const [year, number] = month.split('-').map(Number)
  const endDay = new Date(Date.UTC(year, number, 0)).getUTCDate()
  return { month, start: `${month}-01`, end: `${month}-${String(endDay).padStart(2, '0')}` }
}

function index(rows: ReportRow[], field: string, table: string): Map<string, ReportRow> {
  const result = new Map<string, ReportRow>()
  for (const row of rows) {
    const id = key(row[field])
    if (!id || result.has(id)) throw new Error(`${table} returned a missing or repeated ID. No partial DES BOS report was retained.`)
    result.set(id, row)
  }
  return result
}

function relationships(rows: ReportRow[], from: string, to: string, label: string): Map<string, string> {
  const result = new Map<string, string>()
  for (const row of rows) {
    const id = key(row[from]), target = key(row[to])
    if (!id || !target) continue
    if (result.has(id) && result.get(id) !== target) throw new Error(`Conflicting ${label} relationships were returned. No parent record was guessed.`)
    result.set(id, target)
  }
  return result
}

function inPeriod(value: unknown, first: number, last: number): boolean {
  const day = reportDay(text(value))
  return day !== null && day >= first && day <= last
}

function available(snapshot: ReportSnapshot, tables: string[]): string {
  return tables.map((table) => snapshot.unavailable[table] || (!Array.isArray(snapshot.tables[table]) ? `${table} data was not returned.` : '')).filter(Boolean).join(' ')
}

function result(snapshot: ReportSnapshot): LegacyReportResult {
  return { datasets: {}, warnings: [...snapshot.warnings], displayIds: snapshot.displayIds, generatedAt: new Date().toISOString() }
}

export function calculateDesBosExhibitA(snapshot: ReportSnapshot, reportMonth: unknown, signal: AbortSignal, progress: (message: string) => void): LegacyReportResult {
  const { start, end } = desBosMonth(reportMonth), first = reportDay(start)!, last = reportDay(end)!
  signal.throwIfAborted()
  const output = result(snapshot), error = available(snapshot, ['ShelterScreening'])
  if (error) { output.datasets[DES_BOS_EXHIBIT_A_DATASET] = { unavailable: error }; return output }
  progress('DES BOS Exhibit A: summarizing unable-to-serve households...')
  const counts = new Map<string, { label: string; count: number }>()
  let wrongProgram = 0, missingOutcome = 0, missingReason = 0
  for (const row of snapshot.tables.ShelterScreening || []) {
    signal.throwIfAborted()
    if (!inPeriod(row.ScreenDate, first, last)) continue
    if (normalized(row.ProgramScreening) !== normalized(PROGRAM)) { wrongProgram++; continue }
    if (yes(row.PlacedInShelter)) continue
    if (!no(row.PlacedInShelter)) { missingOutcome++; continue }
    const reason = text(row.ShelterTurnawayReason), other = text(row.ShelterTurnawayReasonOther)
    const label = !reason ? 'Reason not recorded' : normalized(reason) === 'other' && other ? `Other: ${other}` : reason
    if (!reason || (normalized(reason) === 'other' && !other)) missingReason++
    const group = counts.get(normalized(label)) || { label, count: 0 }
    group.count++; counts.set(normalized(label), group)
  }
  const rows: ReportRow[] = [...counts.values()]
    .sort((left, right) => left.label.localeCompare(right.label))
    .map((entry) => ({ ReasonProgramWasUnableToServe: entry.label, HouseholdsAffected: entry.count }))
  if (!rows.length) rows.push({ ReasonProgramWasUnableToServe: 'N/A', HouseholdsAffected: 0 })
  output.datasets[DES_BOS_EXHIBIT_A_DATASET] = { rows }
  if (missingOutcome) output.warnings.push(`${missingOutcome.toLocaleString()} CAAFA Shelter screening record(s) in the selected month had no clear placed-in-shelter outcome and were excluded from Exhibit A.`)
  if (missingReason) output.warnings.push(`${missingReason.toLocaleString()} unable-to-serve household(s) had an incomplete turnaway reason and remain visible for review.`)
  if (wrongProgram) output.warnings.push(`${wrongProgram.toLocaleString()} screening record(s) for other programs were excluded from the CAAFA Shelter report.`)
  output.warnings.push('Exhibit A counts one household per CAAFA Shelter screening marked not placed in shelter during the selected month.')
  progress('DES BOS Exhibit A: report prepared.')
  return output
}

export function calculateDesBosExhibitD(snapshot: ReportSnapshot, reportMonth: unknown, signal: AbortSignal, progress: (message: string) => void): LegacyReportResult {
  const { start, end } = desBosMonth(reportMonth), first = reportDay(start)!, last = reportDay(end)!
  signal.throwIfAborted()
  const output = result(snapshot), error = available(snapshot, ['Client_Profile', 'ProgramEnrollment', 'Services'])
  if (error) { output.datasets[DES_BOS_EXHIBIT_D_DATASET] = { unavailable: error }; return output }
  if (!Array.isArray(snapshot.tables.documents)) { output.datasets[DES_BOS_EXHIBIT_D_DATASET] = { unavailable: 'Verified Client Profile relationships were not returned.' }; return output }
  if (!Array.isArray(snapshot.tables.Links)) { output.datasets[DES_BOS_EXHIBIT_D_DATASET] = { unavailable: 'Verified Services-to-enrollment relationships were not returned.' }; return output }
  progress('DES BOS Exhibit D: preparing mainstream service referrals...')
  const clients = index(snapshot.tables.Client_Profile || [], 'document_id', 'Client Profile')
  const enrollments = index(snapshot.tables.ProgramEnrollment || [], 'RecordID', 'Program Enrollment')
  const parent = relationships(snapshot.tables.documents || [], 'RecordId', 'ParentId', 'Client Profile')
  const enrollmentLink = relationships(snapshot.tables.Links || [], 'LinkFromId', 'LinkToId', 'Program Enrollment')
  const rows: ReportRow[] = []
  let missingHmis = 0, unlinked = 0, wrongProgram = 0, missingAgency = 0, nonReferralResourceService = 0
  for (const service of snapshot.tables.Services || []) {
    signal.throwIfAborted()
    if (!inPeriod(service.DateofService, first, last)) continue
    const enrollmentId = enrollmentLink.get(key(service.RecordID)) || '', enrollment = enrollments.get(enrollmentId)
    const clientId = enrollment ? parent.get(key(enrollment.RecordID)) || '' : '', client = clients.get(clientId)
    if (!enrollment || !client) { unlinked++; continue }
    if (normalized(enrollment.Program) !== normalized(PROGRAM)) { wrongProgram++; continue }
    const hmisId = text(client.HMISID)
    if (!hmisId) missingHmis++
    const destination = text(service.Wheredidyourefer), destinationOther = text(service.Wheredidyoureferother)
    const serviceName = exhibitDServiceType(service.ServiceCategory, service.Service, service.ServiceOther)
    if (!serviceName) { nonReferralResourceService++; continue }
    if (!destination && !destinationOther) missingAgency++
    rows.push({
      __reportRowId: snapshot.displayIds[key(service.RecordID)] || key(service.RecordID),
      TypeOfService: serviceName,
      HMISNumber: hmisId,
      NameOfAgency: destination,
      DateReferred: text(service.DateofService),
      CommentsFollowUp: '',
      Other: destinationOther,
    })
  }
  rows.sort((left, right) => text(left.DateReferred).localeCompare(text(right.DateReferred))
    || text(left.HMISNumber).localeCompare(text(right.HMISNumber), undefined, { numeric: true })
    || text(left.TypeOfService).localeCompare(text(right.TypeOfService))
    || text(left.NameOfAgency).localeCompare(text(right.NameOfAgency)))
  output.datasets[DES_BOS_EXHIBIT_D_DATASET] = { rows }
  if (missingHmis) output.warnings.push(`${missingHmis.toLocaleString()} qualifying referral/resource record(s) have no HMIS ID and are included with a blank HMIS Number.`)
  if (unlinked) output.warnings.push(`${unlinked.toLocaleString()} dated Services record(s) lacked a verified enrollment/client relationship and were not assigned to a guessed client.`)
  if (wrongProgram) output.warnings.push(`${wrongProgram.toLocaleString()} dated Services record(s) for other programs were excluded from the CAAFA Shelter report.`)
  if (nonReferralResourceService) output.warnings.push(`${nonReferralResourceService.toLocaleString()} CAAFA Shelter service record(s) were excluded because they were not recorded as Resource Navigation or with Referral/Resource in Service or Service Other.`)
  if (missingAgency) output.warnings.push(`${missingAgency.toLocaleString()} qualifying referral/resource record(s) have no referral agency and are included with a blank agency.`)
  output.warnings.push('Exhibit D includes every CAAFA Shelter referral/resource Services record in the selected month. Exact duplicate source records are retained, and no funder restriction is applied.')
  output.warnings.push('Comments/Follow-Up remains blank because COMPASS has no verified source field for that value.')
  progress('DES BOS Exhibit D: report prepared.')
  return output
}

export async function runDesBosReport(report: LegacyReport, parameters: Record<string, unknown>, mappings: ReportMappings, signal: AbortSignal, progress: (message: string) => void): Promise<LegacyReportResult> {
  const { start, end } = desBosMonth(parameters.ReportMonth)
  const toExclusive = reportDate(reportDay(end)! + 1)
  const requirements = desBosRequirements(report)
  const dateScopes: Record<string, ReportDateScope> = report.id === DES_BOS_EXHIBIT_A_ID
    ? { ShelterScreening: { startField: 'ScreenDate', from: start, toExclusive } }
    : report.id === DES_BOS_EXHIBIT_D_ID
      ? { Services: { startField: 'DateofService', from: start, toExclusive } }
      : {}
  const snapshot = await loadReportSnapshot(requirements, mappings, signal, progress, dateScopes)
  signal.throwIfAborted()
  return report.id === DES_BOS_EXHIBIT_A_ID
    ? calculateDesBosExhibitA(snapshot, parameters.ReportMonth, signal, progress)
    : calculateDesBosExhibitD(snapshot, parameters.ReportMonth, signal, progress)
}
