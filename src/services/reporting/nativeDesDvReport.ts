import { currentReportDate, reportDay, reportDate, reportingYearStart, validateReportPeriod } from '../desDvReport'
import { rowValue } from './rdlExpressions'
import { loadReportSnapshot, type ReportDateScope, type ReportSnapshot } from './reportDataverse'
import { DEFAULT_NATIVE_DES_DV_OPTIONS, NATIVE_DES_DV_DATASETS, NATIVE_DES_DV_REQUIREMENTS, type NativeDesDvOptions } from './nativeDesDvPlan'
import type { ReportMappings } from './reportMappings'
import type { LegacyReport, LegacyReportResult, ReportRow } from './reportTypes'

const text = (row: ReportRow, key: string) => String(rowValue(row, key) ?? '').trim()
const id = (row: ReportRow, key: string) => text(row, key).toLowerCase()
const normalized = (value: unknown) => String(value ?? '').trim().toLowerCase()
const date = (row: ReportRow, key: string) => reportDay(text(row, key))
const SHELTERS = new Set(['Autumn House', 'CAAFA Shelter', 'DVSTOP', 'Faith House'])
function program(row: ReportRow): string {
  const value = text(row, 'Program').replace(/ Transitional$/i, '')
  return ['Autumn House', 'CAAFA Shelter', 'DVSTOP', 'Faith House', 'CAAFA Outreach', 'DV Outreach', 'REACH Center'].find((label) => normalized(label) === normalized(value))?.replace('DV Outreach', 'CAAFA Outreach') || value
}
const eligible = (row: ReportRow) => ['enrolled', 're-enrolled'].includes(normalized(text(row, 'EnrollmentStatus')))
type Candidate = { enrollment: ReportRow; client: ReportRow; when: number; program: string; source: string; override?: boolean }
function tanfCategory(client: ReportRow, enrollment: ReportRow, when: number, options: NativeDesDvOptions): { value: string | null; issue: string } {
  const birth = date(client, 'dob'), ageAt = new Date(when * 86400000)
  let child: boolean, issue = ''
  if (birth !== null && birth <= when) {
    const birthday = new Date(birth * 86400000)
    let age = ageAt.getUTCFullYear() - birthday.getUTCFullYear()
    if (ageAt.getUTCMonth() < birthday.getUTCMonth() || (ageAt.getUTCMonth() === birthday.getUTCMonth() && ageAt.getUTCDate() < birthday.getUTCDate())) age--
    child = age < 18
  } else if (birth === null && options.allowClientTypeFallback && ['adult', 'child'].includes(normalized(text(enrollment, 'ClientType')))) {
    child = normalized(text(enrollment, 'ClientType')) === 'child'; issue = 'DOB unavailable; age classification uses the verified Enrollment Client Type.'
  } else return { value: null, issue: 'Missing/invalid/future DOB and no permitted age classification; excluded from TANF counts.' }
  const tanf = normalized(text(enrollment, 'TANFEligible'))
  if (tanf === 'yes') return { value: child ? '2-TANF Child' : '1-TANF Adult', issue }
  if (!['no', 'n/a'].includes(tanf)) return { value: null, issue: 'TANF eligibility is unknown; not assumed to be No. Excluded from TANF counts.' }
  return { value: child ? '4-non-TANF Child' : '3-non-TANF Adult', issue }
}
export function nativeDesDvReadScopes(start: string, end: string, asOf = currentReportDate()): Record<string, ReportDateScope> {
  validateReportPeriod(start, end)
  const today = reportDay(asOf)
  if (today === null) throw new Error('Invalid report as-of date.')
  const through = Math.min(reportDay(end)!, today), toExclusive = reportDate(through + 1)
  return { Services: { startField: 'DateofService', from: reportingYearStart(start), toExclusive }, BedEnrollment: { startField: 'CheckInDate', endField: 'CheckOutDate', from: start, toExclusive } }
}
export async function calculateNativeDesDvReport(snapshot: ReportSnapshot, report: LegacyReport, start: string, end: string, signal: AbortSignal, progress: (message: string) => void, options = DEFAULT_NATIVE_DES_DV_OPTIONS, asOf = currentReportDate()): Promise<LegacyReportResult> {
  validateReportPeriod(start, end); signal.throwIfAborted()
  const today = reportDay(asOf)
  if (today === null) throw new Error('Invalid report as-of date.')
  const first = reportDay(start)!, last = Math.min(reportDay(end)!, today), history = reportDay(reportingYearStart(start))!
  const result: LegacyReportResult = { datasets: {}, displayIds: snapshot.displayIds, generatedAt: new Date().toISOString(), warnings: [...snapshot.warnings] }
  for (const dataset of report.datasets) {
    const tables = NATIVE_DES_DV_DATASETS[dataset.name]
    const errors = tables?.map((table) => snapshot.unavailable[table]).filter(Boolean)
    if (!tables || errors?.length) result.datasets[dataset.name] = { unavailable: errors?.length ? [...new Set(errors)].join(' ') : 'Dataset not converted to native DES DV calculations.' }
  }
  const audits: ReportRow[] = [], issues = new Map<string, number>()
  function audit(row: ReportRow, section: string, decision: string, issue = false, clientId = '', when: string | null = null) {
    audits.push({ Section: section, T2_RecordID: text(row, 'RecordID'), Client_RecordID: clientId, Date: when, Decision: decision, Issue: issue ? 'Yes' : 'No' })
    if (issue) issues.set(decision, (issues.get(decision) || 0) + 1)
  }
  let processed = 0
  async function checkpoint(stage: string, force = false) {
    if (++processed % 500 === 0 || force) { progress(`${stage} (${processed.toLocaleString()} records/decisions processed)…`); await new Promise<void>((resolve) => setTimeout(resolve, 0)); signal.throwIfAborted() }
  }
  const clients = new Map((snapshot.tables.Client_Profile || []).map((row) => [id(row, 'document_id'), row]))
  const parentIds = new Map((snapshot.tables.documents || []).map((row) => [id(row, 'RecordId'), id(row, 'ParentId')]))
  const enrollmentIds = new Map((snapshot.tables.Links || []).map((row) => [id(row, 'LinkFromId'), id(row, 'LinkToId')]))
  const enrollments = new Map((snapshot.tables.ProgramEnrollment || []).map((row) => [id(row, 'RecordID'), row]))
  const linked = new Map<string, ReportRow>()
  for (const [key, enrollment] of enrollments) {
    const client = clients.get(parentIds.get(key) || '')
    if (!client) audit(enrollment, 'Linkage', 'Client Profile link is missing or its active record could not be read.', true)
    else {
      linked.set(key, client)
      if (!['enrolled', 're-enrolled', 'turnaway', 'waiting list'].includes(normalized(text(enrollment, 'EnrollmentStatus')))) audit(enrollment, 'People Served', 'Unknown Enrollment Status; not assumed to be Enrolled.', true, text(client, 'document_id'))
    }
    await checkpoint('Indexing enrollment/client links')
  }
  const name = (client: ReportRow) => [text(client, 'first_name'), text(client, 'last_name')].filter(Boolean).join(' ')
  function candidateRow(candidate: Candidate): ReportRow {
    const enrollment = candidate.enrollment
    return { Client_ProfileID: text(candidate.client, 'document_id'), Client_RecordID: text(candidate.client, 'document_id'), NativeCountKey: `${id(candidate.client, 'document_id')}|${reportingYearStart(reportDate(candidate.when))}`, client_name: name(candidate.client), Program_Name: candidate.program, Fiscal_Year: null, Quarter: null, MonthServed: reportDate(candidate.when), first_service: reportDate(candidate.when), ServiceStartDate: text(enrollment, 'ServiceStartDate') || null, ServiceEndDate: text(enrollment, 'ServiceEndDate') || null, T2_RecordID: candidate.source, TANF_Eligibility: null, Turnaway_Status: null, Exit_Status: null, Safe_Location_Status: null }
  }
  const validServices: Array<{ service: ReportRow; enrollment: ReportRow; client: ReportRow; when: number }> = []
  for (const service of snapshot.tables.Services || []) {
    const parent = enrollments.get(enrollmentIds.get(id(service, 'RecordID')) || ''), client = parent && linked.get(id(parent, 'RecordID')), when = date(service, 'DateofService')
    if (!parent || !client) audit(service, 'Services', 'Service has no readable enrollment/client link; not attributed to a guessed program.', true)
    else if (when === null) audit(service, 'Services', 'Missing/invalid date of service; excluded.', true, text(client, 'document_id'))
    else if (when >= history && when <= last) validServices.push({ service, enrollment: parent, client, when })
    await checkpoint('Indexing service records')
  }
  const counts: Candidate[] = []
  for (let fiscal = history; fiscal <= last;) {
    const next = reportDay(`${new Date(fiscal * 86400000).getUTCFullYear() + 1}-10-01`)!, candidates: Candidate[] = []
    for (const [key, enrollment] of enrollments) {
      const client = linked.get(key), from = date(enrollment, 'ServiceStartDate'), rawTo = text(enrollment, 'ServiceEndDate'), to = rawTo ? date(enrollment, 'ServiceEndDate') : null, label = program(enrollment)
      if (!client || !eligible(enrollment)) continue
      if (label === 'CAAFA Outreach' && options.outreachCountDate === 'service') continue
      if (from === null || (rawTo && (to === null || to < from))) { audit(enrollment, 'People Served', 'Missing/invalid enrollment dates; excluded from yearly counts.', true, text(client, 'document_id')); continue }
      if (from >= next || from > last || (from < fiscal && to !== null && to <= fiscal)) continue
      if (!label || /^\d+$/.test(label)) { audit(enrollment, 'People Served', 'Unresolved program; excluded from yearly counts.', true); continue }
      if (label === 'DVSTOP' && normalized(text(enrollment, 'ProgramType')) === 'hotline') continue
      candidates.push({ client, enrollment, program: label, when: Math.max(from, fiscal), source: text(enrollment, 'RecordID') })
      await checkpoint('Building October–September counting history')
    }
    if (options.outreachCountDate === 'service') {
      const firstCalls = new Map<string, Candidate>()
      for (const row of validServices) {
        if (row.when < fiscal || row.when >= next || program(row.enrollment) !== 'CAAFA Outreach' || !eligible(row.enrollment)) continue
        const key = id(row.client, 'document_id'), previous = firstCalls.get(key), source = text(row.service, 'RecordID')
        if (!previous || row.when < previous.when || (row.when === previous.when && source < previous.source)) firstCalls.set(key, { client: row.client, enrollment: row.enrollment, when: row.when, program: 'CAAFA Outreach', source })
      }
      candidates.push(...firstCalls.values())
    }
    candidates.sort((a, b) => a.when - b.when || Number(a.program === 'CAAFA Outreach') - Number(b.program === 'CAAFA Outreach') || a.source.localeCompare(b.source))
    const ledger = new Map<string, Candidate>()
    for (const candidate of candidates) {
      const clientId = id(candidate.client, 'document_id'), previous = ledger.get(clientId)
      const override = previous?.program === 'CAAFA Outreach' && candidate.program !== 'CAAFA Outreach'
      if (!previous || override) {
        ledger.set(clientId, candidate)
        if (candidate.when >= first && (SHELTERS.has(candidate.program) || candidate.program === 'CAAFA Outreach')) counts.push({ ...candidate, override })
        audit(candidate.enrollment, 'People Served', override ? 'Counted once after DV Outreach transfer.' : candidate.when < first ? 'First yearly count before the selected period; later counts excluded.' : 'First yearly count.', false, text(candidate.client, 'document_id'), reportDate(candidate.when))
      } else audit(candidate.enrollment, 'People Served', `Already counted for ${previous.program} this October–September year.`, false, text(candidate.client, 'document_id'), reportDate(candidate.when))
      await checkpoint('Deduplicating yearly client counts')
    }
    fiscal = next
  }
  const firstClients = counts.map(candidateRow), people: ReportRow[] = []
  for (const candidate of counts) {
    const category = tanfCategory(candidate.client, candidate.enrollment, candidate.when, options)
    if (category.issue) audit(candidate.enrollment, 'TANF Classification', category.issue, true, text(candidate.client, 'document_id'), reportDate(candidate.when))
    if (category.value) people.push({ ...candidateRow(candidate), TANF_Eligibility: category.value })
  }
  const turnaways = new Map<string, ReportRow>(), exits = new Map<string, ReportRow>()
  for (const row of firstClients.filter((row) => SHELTERS.has(text(row, 'Program_Name')))) turnaways.set(`${id(row, 'Client_RecordID')}|${text(row, 'Program_Name')}`, { ...row })
  for (const [key, enrollment] of enrollments) {
    const client = linked.get(key), label = program(enrollment), from = date(enrollment, 'ServiceStartDate'), to = date(enrollment, 'ServiceEndDate')
    if (!client || !SHELTERS.has(label) || (label === 'DVSTOP' && normalized(text(enrollment, 'ProgramType')) === 'hotline')) continue
    const row = candidateRow({ enrollment, client, program: label, when: from ?? to ?? first, source: text(enrollment, 'RecordID') }), group = `${id(client, 'document_id')}|${label}`
    if (normalized(text(enrollment, 'EnrollmentStatus')) === 'turnaway' && from !== null && from >= first && from <= last) {
      const reason = text(enrollment, 'ReasonTurnedAway'), status = /capacity/i.test(reason) ? '1-No Room' : normalized(reason) === 'no show' ? '2-No Show' : '3-Other Reasons'
      const previous = turnaways.get(group)
      if (!previous?.Turnaway_Status || String(previous.Turnaway_Status) < status) turnaways.set(group, { ...row, Turnaway_Status: status })
      audit(enrollment, 'Turnaways', status.slice(2), !reason, text(client, 'document_id'), reportDate(from))
    }
    if (eligible(enrollment) && to !== null && to >= first && to <= last) {
      if (from === null || to < from) { audit(enrollment, 'Exits', 'Invalid enrollment dates; exit excluded.', true, text(client, 'document_id')); continue }
      const previous = exits.get(group), ownSafe = normalized(text(enrollment, 'SafeLoc')) === 'yes', safe = ownSafe || previous?.Safe_Location_Status === '1-Safe/Stable Location'
      const newest = previous && String(previous.ServiceEndDate) > reportDate(to) ? previous : row
      exits.set(group, { ...newest, NativeExitCountKey: group, Exit_Status: '1-Exited', Safe_Location_Status: safe ? '1-Safe/Stable Location' : '2-Not Safe/Unknown' })
      audit(enrollment, 'Exits', ownSafe ? 'Exited; explicit safe destination.' : 'Exited; destination not safe or unknown.', false, text(client, 'document_id'), reportDate(to))
    }
    await checkpoint('Calculating exits and turnaways')
  }
  const beds: ReportRow[] = [], latestNightEnd = new Map<string, number>()
  const orderedStays = [...(snapshot.tables.BedEnrollment || [])].sort((a, b) => (date(a, 'CheckInDate') ?? Infinity) - (date(b, 'CheckInDate') ?? Infinity) || id(a, 'RecordID').localeCompare(id(b, 'RecordID')))
  for (const stay of orderedStays) {
    const parent = enrollments.get(enrollmentIds.get(id(stay, 'RecordID')) || ''), client = parent && linked.get(id(parent, 'RecordID')), checkIn = date(stay, 'CheckInDate'), rawOut = text(stay, 'CheckOutDate'), checkOut = rawOut ? date(stay, 'CheckOutDate') : null
    if (!parent || !client || checkIn === null || (rawOut && (checkOut === null || checkOut < checkIn))) audit(stay, 'Bed Nights', 'Missing client/enrollment linkage or invalid stay dates; excluded.', true)
    else if (SHELTERS.has(program(parent)) && !(program(parent) === 'DVSTOP' && normalized(text(parent, 'ProgramType')) === 'hotline')) {
      const from = Math.max(checkIn, first), to = Math.min(checkOut ?? today, last + 1, today), key = id(client, 'document_id')
      if (to > from) {
        const priorEnd = latestNightEnd.get(key) ?? -Infinity
        if (priorEnd > from) audit(stay, 'Bed Nights', 'Overlapping bed enrollments counted separately; review for duplicate stays.', true, text(client, 'document_id'))
        latestNightEnd.set(key, Math.max(priorEnd, to))
        beds.push({ Client_ProfileID: text(client, 'document_id'), client_name: name(client), Program_Name: program(parent), ServiceStartDate: text(parent, 'ServiceStartDate') || null, ServiceEndDate: text(parent, 'ServiceEndDate') || null, CheckInDate: reportDate(checkIn), CheckOutDate: checkOut === null ? null : reportDate(checkOut), Bednights: to - from, T2_RecordID: text(stay, 'RecordID') })
      }
    }
    await checkpoint('Calculating completed bed nights')
  }
  const services: ReportRow[] = []
  for (const record of validServices) {
    if (record.when < first || program(record.enrollment) !== 'CAAFA Outreach') continue
    const service = record.service, client = record.client, enrollment = record.enrollment, rawHours = rowValue(service, 'InHours'), hours = rawHours === null || rawHours === undefined || rawHours === '' ? null : Number(rawHours)
    const validHours = hours !== null && Number.isFinite(hours) && hours >= 0
    if (!validHours) audit(service, 'MCBA Hours', 'Missing/invalid service minutes; no hours substituted.', true, text(client, 'document_id'), reportDate(record.when))
    const row: ReportRow = { Client_ProfileID: text(client, 'document_id'), client_name: name(client), DOB: text(client, 'dob') || null, Program_Name: 'CAAFA Outreach', DateOfService: reportDate(record.when), ServiceStartDate: text(enrollment, 'ServiceStartDate') || null, ServiceEndDate: text(enrollment, 'ServiceEndDate') || null, Hrs: validHours ? hours : null, svcs_RecordID: text(service, 'RecordID'), NativeMCBAHours: validHours ? hours : null }
    for (const [target, source] of Object.entries({ Race: 'race', MultiRaceInd: 'multi_race_ind', Gender: 'gender', Ethnicity: 'ethnicity', VeteranStatus: 'mil_veteran', DisabilityStatus: 'disability' })) row[target] = rowValue(client, source)
    for (const [target, source] of Object.entries({ ClientType: 'ClientType', AbuseStatus: 'AbuseStatus', ClientSpecialClassification: 'ClientSpecialClassification', VictimType: 'VictimType' })) row[target] = rowValue(enrollment, source)
    for (const field of ['ServiceSite', 'ServiceCategory', 'Service', 'Wheredidyourefer', 'Funder', 'DirectServiceCategories', 'CriminalCivilJusticeAssistance', 'EmotionalSupportorSafetyServices', 'InformationandReferral', 'PersonalAdvocacyAccompaniment', 'ShelterHousingServices']) row[field] = rowValue(service, field)
    services.push(row)
    await checkpoint('Calculating DV Outreach services and hours')
  }
  const hoursByClient = new Map<string, ReportRow>()
  for (const row of services) {
    const key = id(row, 'Client_ProfileID'), previous = hoursByClient.get(key), hours = Number(row.NativeMCBAHours || 0)
    const earliest = previous && String(previous.first_service) <= String(row.DateOfService) ? previous : { Client_ProfileID: row.Client_ProfileID, client_name: row.client_name, Program_Name: row.Program_Name, Fiscal_Year: null, Quarter: null, MonthServed: row.DateOfService, first_service: row.DateOfService, ServiceStartDate: row.ServiceStartDate, ServiceEndDate: row.ServiceEndDate, T2_RecordID: row.svcs_RecordID }
    hoursByClient.set(key, { ...earliest, MCBA_Hours_Served: Number(previous?.MCBA_Hours_Served || 0) + hours })
  }
  const datasets: Record<string, ReportRow[]> = { DES_DV_01_clients: firstClients, DES_DV_monthly_02_data: people, DES_DV_02_bednights: beds, DES_DV_exits: [...exits.values()], Native_DES_DV_turnaways: [...turnaways.values()], DVSV_Services_CO: services, DES_DV_monthly_02_MCBAHours: [...hoursByClient.values()], Native_DES_DV_Audit: audits }
  for (const [key, rows] of Object.entries(datasets)) if (!result.datasets[key]?.unavailable) result.datasets[key] = { rows: rows.map((row, index) => ({ ...row, __reportRowId: index + 1 })), columns: [...new Set(rows.flatMap(Object.keys))] }
  result.warnings.push('Native DES DV preview: no SQL engine, WebAssembly, worker or direct hosted-asset downloads. Counts use actual GUID links and the selected dates. No source records are changed.')
  result.warnings.push('People Served resets October 1, counts continuing enrollments again, and permits one DV Outreach-to-other-program transfer count. TANF is from Enrollment; age is at first count. Unknown TANF is excluded; N/A is non-TANF as in the legacy query.')
  result.warnings.push(`DV Outreach yearly count uses the first ${options.outreachCountDate === 'service' ? 'actual Service date (legacy Section F)' : 'Program Enrollment start date'}. MCBA hours include all DV Outreach services in the selected period, regardless of category (including blank or legacy categories). Missing/invalid service minutes are flagged; no hours are invented.`)
  result.warnings.push('Shelter nights use distinct bed-enrollment records, check-in included and checkout/current day excluded. Autumn House/Faith House transitional stays are combined under their normal names. Overlaps are flagged, not silently deduplicated.')
  result.warnings.push('Exits include clients whose actual enrollment end falls in the selected dates, even if first served earlier. Counts are distinct clients per program, and totals add those program counts rather than deduplicating clients across programs. Any explicit safe Yes among a client’s exits in that program during the period places them in Safe/Stable. Turnaway reasons use the legacy highest reason code for each client/program within the period.')
  result.warnings.push('Ref_Dates agency/fiscal/quarter labels and capacity/budget data remain deferred. Fiscal_Year and Quarter are blank, not guessed; this date-range DES report does not require those reference rows. Other library reports have not yet been converted.')
  for (const [issue, count] of issues) result.warnings.push(`${count.toLocaleString()} audit item(s): ${issue}`)
  await checkpoint('Native DES DV calculations complete', true)
  return result
}
export async function runNativeDesDvReport(report: LegacyReport, parameters: Record<string, unknown>, mappings: ReportMappings, signal: AbortSignal, progress: (message: string) => void, options = DEFAULT_NATIVE_DES_DV_OPTIONS): Promise<LegacyReportResult> {
  const start = String(parameters.ReportPeriodStart || ''), end = String(parameters.ReportPeriodEnd || ''), asOf = currentReportDate()
  validateReportPeriod(start, end); signal.throwIfAborted()
  progress('Reading native DES DV report data through the Dataverse connector…')
  const snapshot = await loadReportSnapshot(NATIVE_DES_DV_REQUIREMENTS, mappings, signal, progress, nativeDesDvReadScopes(start, end, asOf))
  return calculateNativeDesDvReport(snapshot, report, start, end, signal, progress, options, asOf)
}
