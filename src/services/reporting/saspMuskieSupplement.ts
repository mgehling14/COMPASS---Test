import type { ReportSnapshot } from './reportDataverse'
import type { SaspPeriod } from './saspMuskieReport'
import type { DatasetResult, ReportRow } from './reportTypes'

export type SaspQualifiedService = { row: ReportRow; client: ReportRow; clientId: string; enrollment: ReportRow; when: number; minutes: number | null }
const unknown = 'Unknown / not reported'
const text = (value: unknown) => String(value ?? '').trim()
const normalize = (value: unknown) => text(value).toLowerCase().replace(/\s+/g, ' ')
function selections(value: unknown): string[] {
  return [...new Map(text(value).split('|').map((item) => item.trim()).filter(Boolean).map((item) => [normalize(item), item])).values()]
}
function isUnknown(value: string) { return /^(unknown(?:\s*\/\s*not reported)?|relationship unknown|data not collected|not reported|--please select--)$/i.test(value) }
function values(entries: SaspQualifiedService[], field: string): string[] {
  const all = [...new Map(entries.flatMap((entry) => selections(entry.enrollment[field])).filter((item) => !isUnknown(item)).map((item) => [normalize(item), item])).values()]
  return all.length ? all : [unknown]
}
function sourceProblem(snapshot: ReportSnapshot, table: string, field: string): string {
  return snapshot.unavailable[table] || snapshot.unavailableFields?.[`${table}.${field}`] ||
    (!Array.isArray(snapshot.tables[table]) || snapshot.tables[table].some((row) => !Object.hasOwn(row, field)) ? `${table}.${field} was not loaded. This measure is unavailable, not zero.` : '')
}
export function saspSupplementRows(snapshot: ReportSnapshot, services: SaspQualifiedService[], period: SaspPeriod): Record<string, DatasetResult> {
  const fields = { PeriodType: period.PeriodType, Period: period.Period, PeriodStart: period.PeriodStart, PeriodEnd: period.PeriodEnd }
  const clients = new Map<string, SaspQualifiedService[]>()
  for (const entry of services) { const group = clients.get(entry.clientId) || []; group.push(entry); clients.set(entry.clientId, group) }
  const groups = [...clients.values()]
  const result: Record<string, DatasetResult> = {}
  function set(name: string, data: ReportRow[], required: Array<[string, string]> = []) {
    const problems = required.map(([table, field]) => sourceProblem(snapshot, table, field)).filter(Boolean)
    result[name] = problems.length ? { unavailable: [...new Set(problems)].join(' ') } : { rows: data.map((row) => ({ ...fields, ...row })) }
  }
  // Sets are per client, not per service/enrollment. Only enrollments that have
  // qualifying services in this period contribute their recorded categories.
  const victimCounts = new Map<string, { label: string; clients: number }>()
  let multiple = 0, unknownVictimization = 0
  for (const entries of groups) {
    const types = values(entries, 'VictimType')
    if (types[0] === unknown) unknownVictimization++
    if (types.length <= 1) continue
    multiple++
    for (const type of types) { const key = normalize(type), group = victimCounts.get(key) || { label: type, clients: 0 }; group.clients++; victimCounts.set(key, group) }
  }
  set('SASP_Victimizations', [
    { Measure: 'Clients with multiple recorded victimization types', VictimizationType: 'All multiple-victimization clients', Clients: multiple, IsTotal: true },
    ...[...victimCounts.values()].sort((a, b) => a.label.localeCompare(b.label)).map((group) => ({ Measure: 'Type among multiple-victimization clients', VictimizationType: group.label, Clients: group.clients })),
    { Measure: 'Clients with no known victimization type', VictimizationType: unknown, Clients: unknownVictimization },
  ], [['ProgramEnrollment', 'VictimType']])

  const statuses = new Map<string, number>([['Primary Victim', 0], ['Secondary Victim', 0], ['Other', 0], [unknown, 0], ['Multiple recorded statuses - review', 0]])
  for (const entries of groups) {
    const all = values(entries, 'AbuseStatus')
    const status = all.length > 1 ? 'Multiple recorded statuses - review' : [...statuses.keys()].find((label) => normalize(label) === normalize(all[0])) || all[0]
    statuses.set(status, (statuses.get(status) || 0) + 1)
  }
  set('SASP_AbuseStatus', [...[...statuses].map(([AbuseStatus, Clients]) => ({ AbuseStatus, Clients })), { AbuseStatus: 'Total distinct clients', Clients: clients.size, IsTotal: true }], [['ProgramEnrollment', 'AbuseStatus']])

  const relationships = new Map<string, { label: string; clients: number }>([[normalize(unknown), { label: unknown, clients: 0 }]])
  for (const entries of groups) for (const relationship of values(entries, 'RelationshiptoAbuser')) {
    const key = normalize(relationship), group = relationships.get(key) || { label: relationship, clients: 0 }; group.clients++; relationships.set(key, group)
  }
  set('SASP_Relationships', [...[...relationships.values()].sort((a, b) => a.label.localeCompare(b.label)).map((group) => ({ Relationship: group.label, Clients: group.clients })), { Relationship: 'Total distinct clients (categories overlap)', Clients: clients.size, IsTotal: true }], [['ProgramEnrollment', 'RelationshiptoAbuser']])

  return result
}

export const SASP_REFERENCE_CHECKLIST = {
  name: 'SASP_ReferenceChecklist', title: 'PDF Reference - Completion / Mapping Checklist',
  columns: ['ReferenceArea', 'Status', 'NextStep'],
} as const
export const SASP_REFERENCE_COVERAGE: ReportRow[] = [
  { ReferenceArea: 'General information / grant numbers / contact / organization', Status: 'Manual completion required', NextStep: 'Confirm current grant and organization details. Historical 2024 values are not copied.' },
  { ReferenceArea: 'Staff FTEs', Status: 'Not mapped', NextStep: 'Supply funded staff time, role and grant allocation. Service minutes are not staff FTEs.' },
  { ReferenceArea: 'Statutory purpose areas and products', Status: 'Manual completion required', NextStep: 'Confirm applicable funded activities and products for this reporting period; do not reuse 2024 selections.' },
  { ReferenceArea: 'Fully served / partially served / not served; reasons not served', Status: 'Not mapped for SASP', NextStep: 'Confirm SASP-specific outcome and request/turnaway fields and funding attribution. OVW-only served status and a delivered Service record do not establish these outcomes.' },
  { ReferenceArea: 'Primary victims / secondary victims and demographics', Status: 'Supplement added; official cohort needs confirmation', NextStep: 'The existing all-client SASP cohort is preserved. Abuse Status is broken out separately. Confirm primary served/partially-served eligibility before official PDF submission.' },
  { ReferenceArea: 'Multiple victimizations / additional types', Status: 'Current recorded-type breakdown added', NextStep: 'Uses all recorded Victim Type selections on qualifying enrollments. Confirm that these types represent victimizations supported by SASP, not just lifetime history; no presenting type is guessed.' },
  { ReferenceArea: 'Race/ethnicity, sex and age', Status: 'Current demographics retained', NextStep: 'Uses current Gender, Race and Ethnicity separately and the original age groups in section 1. No unsupported sex/race categories are fabricated. The detailed PDF-age supplement was removed.' },
  { ReferenceArea: 'Additional demographics', Status: 'Removed from this report', NextStep: 'The additional-demographics supplement was removed. These fields are not requested or calculated by SASP.' },
  { ReferenceArea: 'Relationships to offender', Status: 'Current-field supplement added', NextStep: 'Verify mappings and completeness. Relationship labels retain current wording; source blank is Unknown.' },
  { ReferenceArea: 'Victim services categories', Status: 'Current Services category/service breakdown retained', NextStep: 'Approve a crosswalk before merging current choices into the old PDF categories. Attorney/paralegal legal assistance must be distinguishable before applying its exclusion.' },
  { ReferenceArea: 'Hotline requests', Status: 'Current Calls workflow retained', NextStep: 'Per current REACH process every qualifying Services record is one call. No Helpline records, funding proration, or primary-request counts are inferred.' },
  { ReferenceArea: 'Victim witness notification / unsolicited outreach', Status: 'Not mapped', NextStep: 'Identify specific activity fields and SASP funding rules; ordinary service/contact counts are not substituted.' },
  { ReferenceArea: 'Protection orders granted / legal services', Status: 'Not mapped', NextStep: 'Identify actual temporary/final orders granted and attorney/paralegal-funded work. Referral or assistance is not proof an order was granted.' },
  { ReferenceArea: 'Narrative questions', Status: 'Manual completion required', NextStep: 'Prepare current-period narratives on multiple victimizations, barriers, effectiveness, remaining needs, funding impact and data notes. Historical narratives and client quotes are not copied.' },
]
