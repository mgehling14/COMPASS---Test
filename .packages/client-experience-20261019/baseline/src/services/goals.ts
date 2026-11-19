import { getClient } from '@microsoft/power-apps/data'
import { dataSourcesInfo } from '../../.power/schemas/appschemas/dataSourcesInfo'
import { ensureAuthToken, getAuthToken } from './auth'
import { excludeArchived } from './archive'
import { formatServiceSiteLabel } from './serviceSiteLabels'

export const GOALS_TABLE_ALIAS = 'cmps_goalses'
export const GOALS_PRIMARY_ID_FIELD = 'cmps_goalsid'
const PROGRAM_ENROLLMENTS_ENTITY_SET_NAME = 'cmps_programenrollment1s'
const DEFAULT_DATAVERSE_ORG_URL = 'https://org1f466e4e.crm.dynamics.com'
const runtimeDataClient = getClient(dataSourcesInfo as any)

const BASE = 125570000
export const GOAL_SERVICESITE_OPTIONS = ['Autumn House', 'CAAFA', 'CAAFA - Crisis Response', 'CAAFA - Legal', 'CAAFA - DV', 'CAAFA - SV', 'CAAFA - Thrive', 'DVSTOP', 'Faith House', 'REACH Center']
export const GOAL_CATEGORY_OPTIONS = ['Safety & Empowerment Goals', 'Resource Access Goals', 'Housing & Stability Goals', 'Wellness & Healing Goals', 'Legal & Systems Navigation Goals', 'Education & Skill Development Goals', 'Employment & Career Development Goals', 'Financial Stability Goals']
export const GOAL_STATUS_OPTIONS = ['No Change', 'Improving', 'Barrier Identified', 'Complete']
export const GOAL_OUTCOME_OPTIONS = ['They feel access to services improved', 'They feel safe after program participation', 'They feel self-sufficiency increased', 'They report making education/vocational improvements', 'They report having gained employment', 'They report having more knowledge on achieving financial stability', 'They report having more knowledge on achieving housing stability', 'They report knowing how to access community resources', 'They report knowing how to make informed choices', 'They report having more knowledge on navigating the legal system']
export const GOAL_OPTIONS_BY_CATEGORY: Record<string, string[]> = {
  'Safety & Empowerment Goals': ['Increase personal safety', 'Develop a safety plan', 'Establish healthy boundaries', 'Increase confidence in safety planning', 'Increase self-advocacy', 'Increase decision-making confidence', 'Improve personal empowerment'],
  'Resource Access Goals': ['Improve resource knowledge', 'Access community resources', 'Obtain benefits', 'Connect to community supports'],
  'Housing & Stability Goals': ['Develop a housing plan', 'Increase housing readiness', 'Obtain safe housing', 'Improve housing stability'],
  'Wellness & Healing Goals': ['Maintain stable housing', 'Maintain independent living', 'Build a support network', 'Engage in counseling', 'Attend regular groups', 'Increase self-care practices', 'Strengthen coping skills'],
  'Legal & Systems Navigation Goals': ['Reduce stress', 'Improve emotional wellbeing', 'Connect with legal services', 'Navigate court processes'],
  'Education & Skill Development Goals': ['Obtain an Order of Protection', 'Resolve legal barriers', 'Improve literacy skills', 'Improve computer skills', 'Complete financial literacy training', 'Complete GED perparation', 'Obtain GED'],
  'Employment & Career Development Goals': ['Enroll in college or training program', 'Complete workforce certification', 'Improve employment readiness', 'Update resume', 'Prepare for interviews', 'Complete job applications'],
  'Financial Stability Goals': ['Obtain employment', 'Increase income', 'Increase financial literacy', 'Create a budget', 'Obtain financial assistance', 'Improve money management skills', 'Reduce debt', 'Increase financial independence'],
}
// The supplied option ranges place the final “Other” value after each category group.
export const GOAL_OTHER_OPTION = 'Other'
const GOAL_OTHER_VALUE = String(BASE + 45)
// Dataverse stores this choice as the numeric value, while the form displays
// the labels. Keep the full label list here so create/update payloads are
// encoded as 125570000, 125570001, etc. instead of sending display text.
export const GOAL_CHOICE_OPTIONS = [
  ...Object.values(GOAL_OPTIONS_BY_CATEGORY).flat(),
  GOAL_OTHER_OPTION,
]

export type GoalPayload = Record<string, string>
export type GoalListRecord = {
  id: string
  recordId: string
  goal: string
  category: string
  status: string
  startDate: string
  programEnrollmentRowId: string
}
export type GoalDetailRecord = { id: string; recordId: string; values: GoalPayload }
export type GoalFieldSection = 'Main' | 'Goal Information' | 'Goal Outcomes' | 'Goal Notes'
export type GoalFieldDefinition = { field: string; label: string; input: 'text' | 'textarea' | 'date' | 'select' | 'radio' | 'checkbox-group' | 'lookup'; options: string[]; section: GoalFieldSection; required?: boolean; tooltip?: string }
export const GOAL_FIELDS: GoalFieldDefinition[] = [
  { field: 'cmps_recordid', label: 'RecordID', input: 'text', options: [], section: 'Main' },
  { field: 'cmps_peid', label: 'Program Enrollment', input: 'lookup', options: [], section: 'Main', required: true },
  { field: 'cmps_servicesite', label: 'Service Site', input: 'select', options: GOAL_SERVICESITE_OPTIONS, section: 'Main' },
  { field: 'cmps_goalstartdate', label: 'Goal Start Date', input: 'date', options: [], section: 'Main', required: true },
  { field: 'cmps_goalcompletiondate', label: 'Goal Completion Date', input: 'date', options: [], section: 'Main' },
  { field: 'cmps_goalcategory', label: 'Goal Category', input: 'select', options: GOAL_CATEGORY_OPTIONS, section: 'Goal Information', required: true },
  { field: 'cmps_goal', label: 'Goal', input: 'select', options: GOAL_CHOICE_OPTIONS, section: 'Goal Information', required: true },
  { field: 'cmps_othergoal', label: 'Other Goal', input: 'text', options: [], section: 'Goal Information' },
  { field: 'cmps_goaltargetdate', label: 'Goal Target Date', input: 'date', options: [], section: 'Goal Information' },
  { field: 'cmps_goalstatus', label: 'Goal Status', input: 'select', options: GOAL_STATUS_OPTIONS, section: 'Goal Information', required: true },
  { field: 'cmps_goalprogressreportdate', label: 'Goal Progress Report Date', input: 'date', options: [], section: 'Goal Information', required: true, tooltip: 'Enter the date when you will follow up with client on progress.' },
  { field: 'cmps_barrieridentified', label: 'Barrier Identified', input: 'text', options: [], section: 'Goal Information' },
  { field: 'cmps_plantoaddressbarrier', label: 'Plan to Address Barrier', input: 'text', options: [], section: 'Goal Information' },
  { field: 'cmps_goaloutcomes', label: 'Goal Outcomes', input: 'checkbox-group', options: GOAL_OUTCOME_OPTIONS, section: 'Goal Outcomes' },
  { field: 'cmps_goalnotes', label: 'Goal Notes', input: 'textarea', options: [], section: 'Goal Notes' },
]

const select = [GOALS_PRIMARY_ID_FIELD, ...GOAL_FIELDS.map((field) => field.field).filter((field) => field !== 'cmps_peid'), '_cmps_peid_value'].join(',')
function orgUrl() { return String(import.meta.env.VITE_DATAVERSE_ORG_URL || DEFAULT_DATAVERSE_ORG_URL).trim().replace(/\/$/, '') }
function localHost() { return typeof window !== 'undefined' && ['localhost', '127.0.0.1'].includes(window.location.hostname) }
function rows(payload: any): Array<Record<string, any>> { return Array.isArray(payload) ? payload : Array.isArray(payload?.value) ? payload.value : [] }
function value(row: Record<string, any>, key: string) { return String(row?.[key] ?? '').trim() }
function choice(row: Record<string, any>, key: string, options: string[]) { const formatted = value(row, `${key}@OData.Community.Display.V1.FormattedValue`); if (formatted) return formatted; const rawValue = value(row, key); if (key === 'cmps_goal' && rawValue === GOAL_OTHER_VALUE) return GOAL_OTHER_OPTION; const raw = Number(rawValue); return Number.isInteger(raw) && raw >= BASE && raw < BASE + options.length ? options[raw - BASE] : rawValue }
function encodeChoice(valueToEncode: string, options: string[]) { const index = options.findIndex((option) => option.toLowerCase() === valueToEncode.toLowerCase()); return index >= 0 ? String(BASE + index) : valueToEncode }
function encodeGoalChoice(valueToEncode: string) { return valueToEncode.toLowerCase() === GOAL_OTHER_OPTION.toLowerCase() ? GOAL_OTHER_VALUE : encodeChoice(valueToEncode, GOAL_CHOICE_OPTIONS) }
function normalizeGuid(valueToNormalize: unknown) { return String(valueToNormalize || '').trim().replace(/[{}]/g, '').toLowerCase() }
function mapDetail(row: Record<string, any>): GoalDetailRecord {
  const values: GoalPayload = {}
  GOAL_FIELDS.forEach((field) => {
    if (field.field === 'cmps_peid') { values[field.field] = value(row, '_cmps_peid_value'); return }
    const raw = row[field.field]
    values[field.field] = ['select', 'radio', 'checkbox-group'].includes(field.input) ? choice({ ...row, [field.field]: raw }, field.field, field.options) : value(row, field.field)
    if (field.field === 'cmps_servicesite') values[field.field] = formatServiceSiteLabel(values[field.field])
  })
  return { id: value(row, GOALS_PRIMARY_ID_FIELD) || value(row, 'id'), recordId: values.cmps_recordid || value(row, 'cmps_recordid'), values }
}
function normalizePayload(seed: GoalPayload): Record<string, unknown> {
  const payload: Record<string, unknown> = { ...seed }
  const peid = String(payload.cmps_peid || '').trim(); delete payload.cmps_peid
  if (peid) payload['cmps_peid@odata.bind'] = `/${PROGRAM_ENROLLMENTS_ENTITY_SET_NAME}(${peid.replace(/[{}]/g, '')})`
  GOAL_FIELDS.forEach((field) => {
    if (!['select', 'radio', 'checkbox-group'].includes(field.input)) return
    const raw = field.field === 'cmps_servicesite'
      ? formatServiceSiteLabel(payload[field.field])
      : String(payload[field.field] || '').trim()
    if (!raw) return
    if (field.input === 'checkbox-group') payload[field.field] = raw.split(',').map((item) => encodeChoice(item.trim(), field.options)).join(',')
    else payload[field.field] = field.field === 'cmps_goal' ? encodeGoalChoice(raw) : encodeChoice(raw, field.options)
  })
  return payload
}
async function requestList(filter = ''): Promise<Array<Record<string, any>>> {
  const visibleFilter = excludeArchived(filter)
  const token = getAuthToken()
  if (!localHost()) {
    const result = await runtimeDataClient.executeAsync<any, any>({ connectorOperation: { tableName: 'commondataserviceforapps', operationName: 'ListRecordsWithOrganization', parameters: { organization: orgUrl(), entityName: GOALS_TABLE_ALIAS, '$select': select, '$top': 5000, '$filter': visibleFilter, ...(token ? { token } : {}) } } } as any)
    if (result?.success) return rows(result.data)
  }
  const localToken = await ensureAuthToken().catch(() => ''); if (!localToken || !orgUrl()) return []
  const headers = new Headers({ Accept: 'application/json', 'OData-Version': '4.0', 'OData-MaxVersion': '4.0', Authorization: `Bearer ${localToken}` })
  const query = `$select=${encodeURIComponent(select)}&$top=5000&$filter=${encodeURIComponent(visibleFilter)}`
  const response = await fetch(`${orgUrl()}/api/data/v9.2/${GOALS_TABLE_ALIAS}?${query}`, { credentials: 'include', headers }); if (!response.ok) throw new Error(await response.text())
  return rows(await response.json().catch(() => ({})))
}
async function write(method: 'POST' | 'PATCH', id: string, item: Record<string, unknown>) {
  const token = getAuthToken()
  if (!localHost()) {
    const result = await runtimeDataClient.executeAsync<any, any>({ connectorOperation: { tableName: 'commondataserviceforapps', operationName: method === 'POST' ? 'CreateRecordWithOrganization' : 'UpdateRecordWithOrganization', parameters: { prefer: 'return=representation', accept: 'application/json',  organization: orgUrl(), entityName: GOALS_TABLE_ALIAS, ...(method === 'PATCH' ? { recordId: id } : {}), item, ...(token ? { token } : {}) } } } as any)
    if (!result?.success) throw new Error(JSON.stringify(result || {})); return String(result?.data?.[GOALS_PRIMARY_ID_FIELD] || result?.data?.id || '')
  }
  const localToken = await ensureAuthToken(); const headers = new Headers({ Accept: 'application/json', 'Content-Type': 'application/json', 'OData-Version': '4.0', 'OData-MaxVersion': '4.0', Authorization: `Bearer ${localToken}`, Prefer: 'return=representation' })
  const response = await fetch(`${orgUrl()}/api/data/v9.2/${GOALS_TABLE_ALIAS}${method === 'PATCH' ? `(${id})` : ''}`, { method, credentials: 'include', headers, body: JSON.stringify(item) }); if (!response.ok) throw new Error(await response.text()); const body = await response.json().catch(() => ({})); return String(body?.[GOALS_PRIMARY_ID_FIELD] || body?.id || '')
}
export function generateGoalRecordId() { return `GOAL-${new Date().toISOString().replace(/[-:T.Z]/g, '').slice(0, 14)}` }
export async function createGoalResponse(values: GoalPayload) { const recordId = String(values.cmps_recordid || '').trim() || generateGoalRecordId(); const id = await write('POST', '', normalizePayload({ ...values, cmps_recordid: recordId })); return { id, recordId } }
export async function updateGoalResponse(rowId: string, values: GoalPayload) {
  const payload = normalizePayload(values)
  // PATCH must explicitly clear dates; omitting a blank date preserves its old value.
  for (const field of GOAL_FIELDS) {
    const value = (values as Record<string, unknown>)[field.field]
    if (['date', 'datetime'].includes(field.input) && Object.prototype.hasOwnProperty.call(values, field.field)
      && (value === null || (typeof value === 'string' && !value.trim()))) (payload as Record<string, unknown>)[field.field] = null
  }
  await write('PATCH', rowId, payload)
}
export async function loadGoalDetailRecord(rowId: string, recordId = '') { const rowsFound = await requestList(rowId ? `${GOALS_PRIMARY_ID_FIELD} eq ${rowId}` : `cmps_recordid eq '${recordId.replace(/'/g, "''")}'`); const row = rowsFound[0]; if (!row) throw new Error('Goal record not found.'); return mapDetail(row) }
export async function listGoalsForProgramEnrollments(programEnrollmentRowIds: string[]): Promise<GoalListRecord[]> {
  const enrollmentIds = programEnrollmentRowIds.map(normalizeGuid).filter(Boolean)
  if (enrollmentIds.length === 0) return []
  const all = await requestList()
  return all
    .map((row) => ({
      id: normalizeGuid(value(row, GOALS_PRIMARY_ID_FIELD) || value(row, 'id')),
      recordId: value(row, 'cmps_recordid'),
      goal: choice(row, 'cmps_goal', GOAL_CHOICE_OPTIONS),
      category: choice(row, 'cmps_goalcategory', GOAL_CATEGORY_OPTIONS),
      status: choice(row, 'cmps_goalstatus', GOAL_STATUS_OPTIONS),
      startDate: value(row, 'cmps_goalstartdate'),
      programEnrollmentRowId: normalizeGuid(value(row, '_cmps_peid_value')),
    }))
    .filter((row) => enrollmentIds.includes(row.programEnrollmentRowId))
}
