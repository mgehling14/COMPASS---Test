export const REPORT_ARCHIVE_COLUMN = 'cmps_isarchived'
export const REPORT_ARCHIVED_YES = 125570000
export const REPORT_ARCHIVED_NO = 125570001
export const PROFILE_REPORT_EXCLUSION_COLUMN = 'cmps_excludefromreports'
type ArchiveSchema = { Attributes: Array<{ LogicalName: string; AttributeType: string }> }

export function reportArchiveFilter(schema: ArchiveSchema, table: string): string {
  const column = schema.Attributes.find((attribute) => attribute.LogicalName === REPORT_ARCHIVE_COLUMN)
  if (!column || column.AttributeType !== 'Picklist') throw new Error(`${table}: cannot verify the ${REPORT_ARCHIVE_COLUMN} choice column. This report section is unavailable; archived records must not be included.`)
  return `(${REPORT_ARCHIVE_COLUMN} ne ${REPORT_ARCHIVED_YES} or ${REPORT_ARCHIVE_COLUMN} eq null)`
}
export function reportRowIsArchived(row: Record<string, unknown>): boolean {
  const value = row[REPORT_ARCHIVE_COLUMN]
  // Null remains active for legacy imports, exactly as the app's archive rule.
  if (value === null || value === undefined) return false
  if ((typeof value === 'number' || typeof value === 'string') && String(value).trim() === String(REPORT_ARCHIVED_YES)) return true
  if ((typeof value === 'number' || typeof value === 'string') && String(value).trim() === String(REPORT_ARCHIVED_NO)) return false
  throw new Error('Unrecognized cmps_isarchived value; report eligibility cannot be verified. No totals from guessed archive status.')
}
export function profileReportExclusionFilter(schema: ArchiveSchema, table: string): string {
  if (schema.Attributes.find((attribute) => attribute.LogicalName === PROFILE_REPORT_EXCLUSION_COLUMN)?.AttributeType !== 'Picklist') throw new Error(`${table}: add the ${PROFILE_REPORT_EXCLUSION_COLUMN} choice column (Yes 125570000 / No 125570001) before running client-based reports. Developer-record eligibility cannot be verified without it.`)
  return `(${PROFILE_REPORT_EXCLUSION_COLUMN} ne ${REPORT_ARCHIVED_YES} or ${PROFILE_REPORT_EXCLUSION_COLUMN} eq null)`
}
export function profileIsExcludedFromReports(row: Record<string, unknown>): boolean {
  const value = row[PROFILE_REPORT_EXCLUSION_COLUMN]
  return Number(value) === REPORT_ARCHIVED_YES || String(value ?? '').trim().toLowerCase() === 'yes'
}
