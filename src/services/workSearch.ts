import { CLIENT_PROFILE_FIELDS } from './clientProfile'
import { matchesAdvancedSearch, validateAdvancedSearch, type AdvancedSearchCriterion, type AdvancedSearchField } from './advancedSearch'

export type WorkSearchRecord = {
  name: string; recordId: string; hmisId: string; dateOfBirth: string; primaryLanguage: string; gender: string; alertList?: string
  searchValues?: Record<string, string>
  enrollments: Array<{ enrollmentId: string; program: string; startDate: string; endDate?: string; recordId: string; staffAssigned?: string }>
}
export async function mapWorkRecords<T, R>(records: T[], read: (record: T) => Promise<R>): Promise<R[]> {
  const result: R[] = new Array(records.length)
  let next = 0
  await Promise.all(Array.from({ length: Math.min(4, records.length) }, async () => {
    while (next < records.length) { const index = next++; result[index] = await read(records[index]) }
  }))
  return result
}
const base: AdvancedSearchField[] = [
  { field: 'client_recordid', label: 'Client Record ID', kind: 'text' }, { field: 'client_name', label: 'Client Name', kind: 'text' },
  { field: 'date_of_birth', label: 'Date of Birth', kind: 'date' },
]
const enrollmentFields: AdvancedSearchField[] = [
  { field: 'work_program', label: 'Enrollment — Program', kind: 'text' }, { field: 'work_startdate', label: 'Enrollment — Start Date', kind: 'date' },
  { field: 'work_enddate', label: 'Enrollment — End Date', kind: 'date' },
]
export function workSearchFields(_fullProfile: boolean): AdvancedSearchField[] {
  const extra: AdvancedSearchField[] = CLIENT_PROFILE_FIELDS.filter((field) => ['cmps_race', 'cmps_gender'].includes(field.field)).map((field) => ({
    field: field.field, label: `Client Profile — ${field.label}`,
    kind: field.input === 'date' ? 'date' : field.input === 'number' || /current age/i.test(field.label) ? 'number'
      : field.input === 'checkbox-group' ? 'multi-choice' : field.options.length ? 'choice' : 'text',
    ...(field.options.length ? { options: field.options.filter((option) => !option.startsWith('--')).map((option) => ({ value: option, label: option })) } : {}),
  }))
  return [...base, ...extra, ...enrollmentFields]
}
export function filterWorkRecords<T>(rows: T[], getRecord: (row: T) => WorkSearchRecord, query: string,
  criteria: AdvancedSearchCriterion[], fields: AdvancedSearchField[]): T[] {
  validateAdvancedSearch(criteria, fields)
  const parts = query.trim().toLocaleLowerCase().split(/\s+/).filter(Boolean)
  const profileCriteria = criteria.filter((criterion) => !criterion.field.startsWith('work_'))
  const enrollmentCriteria = criteria.filter((criterion) => criterion.field.startsWith('work_'))
  return rows.filter((row) => {
    const record = getRecord(row)
    const text = [record.name, record.recordId, record.hmisId, ...record.enrollments.flatMap((item) => [item.program, item.recordId, item.staffAssigned || ''])].join(' ').toLocaleLowerCase()
    if (!parts.every((part) => text.includes(part))) return false
    const values = { ...record.searchValues, client_name: record.name, client_recordid: record.recordId, date_of_birth: record.dateOfBirth, cmps_gender: record.gender }
    if (!matchesAdvancedSearch(values, profileCriteria, fields)) return false
    // Related enrollment filters must ALL match one enrollment, not different enrollments.
    return !enrollmentCriteria.length || record.enrollments.some((item) => matchesAdvancedSearch({
      work_program: item.program, work_startdate: item.startDate, work_enddate: item.endDate || '',
    }, enrollmentCriteria, fields))
  })
}

