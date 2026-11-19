import type { LegacyReport, ReportRow } from './reportTypes'
import { SASP_REFERENCE_CHECKLIST } from './saspMuskieSupplement'

export const SASP_MUSKIE_ID = 'sasp-muskie-report'
export const isSaspMuskieReport = (report: LegacyReport) => report.id === SASP_MUSKIE_ID
export const SASP_MUSKIE_REQUIREMENTS: Record<string, string[]> = {
  Client_Profile: ['document_id', 'dob', 'race', 'gender', 'ethnicity'],
  ProgramEnrollment: ['RecordID', 'Program'],
  Services: ['RecordID', 'DateofService', 'ServiceCategory', 'Service', 'Funder', 'Minutes'],
}
export const SASP_MUSKIE_OPTIONAL_FIELDS: Record<string, string[]> = {
  ProgramEnrollment: ['VictimType', 'AbuseStatus', 'RelationshiptoAbuser'],
}
const periodColumns = ['PeriodType', 'Period', 'PeriodStart', 'PeriodEnd']
export const SASP_MUSKIE_SECTIONS = [
  { name: 'SASP_ClientsServed', title: '1. Clients Served with Demographics', description: 'Distinct clients with at least one qualifying service; demographics are counted once per client in each period. Multi-race selections can count a client in more than one race category.', columns: [...periodColumns, 'Demographic', 'Category', 'Clients'] },
  { name: 'SASP_ClientServices', title: '2. Client Services', description: 'Qualifying Services records by service category and service, with distinct clients and known service time. These same records are reported as Calls in section 3; do not add the two sections together.', columns: [...periodColumns, 'ServiceCategory', 'Service', 'ServiceRecords', 'DistinctClients', 'KnownMinutes', 'KnownHours', 'MissingOrInvalidMinutes'] },
  { name: 'SASP_Calls', title: '3. Calls', description: 'Each qualifying SASP-funded Services record linked to a REACH Center client counts as one call, regardless of Meeting Mode. No Helpline records are read.', columns: [...periodColumns, 'ServiceCategory', 'Service', 'Calls', 'DistinctClients', 'KnownMinutes', 'KnownHours', 'MissingOrInvalidMinutes'] },
  { name: 'SASP_Victimizations', title: '4. Multiple Victimizations', description: 'Distinct clients with more than one recorded victimization type across enrollments linked to qualifying services. Type rows count only those multiple-victimization clients; they can overlap. Current recorded types are retained, not forced into old categories.', columns: [...periodColumns, 'Measure', 'VictimizationType', 'Clients'] },
  { name: 'SASP_AbuseStatus', title: '5. Primary / Secondary Victims', description: 'Distinct clients by recorded Abuse Status on enrollments linked to qualifying services. Secondary victims are shown separately here, but this supplement does not change the existing all-client demographics or Services/Calls totals. Conflicting statuses are flagged rather than guessed.', columns: [...periodColumns, 'AbuseStatus', 'Clients'] },
  { name: 'SASP_Relationships', title: '6. Relationships to Offender', description: 'Current Relationship to Abuser choices, deduplicated per client across enrollments linked to qualifying services. All recorded relationships are shown; categories can overlap. Total is distinct clients, not the sum of categories.', columns: [...periodColumns, 'Relationship', 'Clients'] },
] as const
export const SASP_AUDIT_DATASET = 'SASP_RecordAudit'
export const SASP_MUSKIE_REPORT: LegacyReport = {
  id: SASP_MUSKIE_ID, title: 'SASP MUSKIE Report — REACH Center', sourceFile: 'Native COMPASS report',
  parameters: [
    { name: 'ReportPeriodStart', type: 'DateTime', prompt: 'Report Period Start', hidden: false, values: [] },
    { name: 'ReportPeriodEnd', type: 'DateTime', prompt: 'Report Period End', hidden: false, values: [] },
  ],
  datasets: [...SASP_MUSKIE_SECTIONS, SASP_REFERENCE_CHECKLIST].map((section) => ({ name: section.name, sql: '', sourceSql: '', dependencies: [], requirements: SASP_MUSKIE_REQUIREMENTS, filters: [], fields: section.columns.map((name) => ({ name, source: name, expression: '' })) })),
  items: [],
}
export function planSaspMuskieReport() {
  return { required: SASP_MUSKIE_REQUIREMENTS, datasets: Object.fromEntries([...SASP_MUSKIE_SECTIONS, SASP_REFERENCE_CHECKLIST].map((section) => [section.name, { tables: section.name === SASP_REFERENCE_CHECKLIST.name ? [] : Object.keys(SASP_MUSKIE_REQUIREMENTS), unavailable: '' }])) }
}
export function saspReportColumns(name: string): readonly string[] {
  return [...SASP_MUSKIE_SECTIONS, SASP_REFERENCE_CHECKLIST].find((section) => section.name === name)?.columns || []
}
export const saspCell = (row: ReportRow, field: string) => row[field] === null || row[field] === undefined ? '' : String(row[field])
