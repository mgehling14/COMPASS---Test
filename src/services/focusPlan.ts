import { getClient } from '@microsoft/power-apps/data'
import { dataSourcesInfo } from '../../.power/schemas/appschemas/dataSourcesInfo'
import { ensureAuthToken, getAuthToken } from './auth'
import { excludeArchived } from './archive'

export const FOCUS_PLANS_TABLE_ALIAS = 'cmps_focusplans'
export const FOCUS_PLANS_PRIMARY_ID_FIELD = 'cmps_focusplanid'
const PROGRAM_ENROLLMENT_ENTITY_SET_NAME = 'cmps_programenrollment1s'
const DEFAULT_DATAVERSE_ORG_URL = 'https://org1f466e4e.crm.dynamics.com'
const OPTION_SET_BASE_VALUE = 125570000
const runtimeDataClient = getClient(dataSourcesInfo as any)

export type FocusPlanSection = 'Main' | 'Goals/Person-Family Vision' | "Person's/Family Strengths & Goals" | 'FOCUS Meeting Notes' | 'FOCUS Plan Checklist'
export type FocusPlanInput = 'text' | 'textarea' | 'date' | 'datetime' | 'number' | 'radio' | 'checkbox-group' | 'lookup' | 'readonly' | 'goals'
export type FocusPlanField = { field: string; label: string; input: FocusPlanInput; options: string[]; section: FocusPlanSection; required?: boolean; visibleWhen?: { field: string; values: string[] }; tooltip?: string }
const YES_NO = ['Yes', 'No']
const YES_NO_NA = ['Yes', 'No', 'N/A']
const TEAM = ['Client', 'Program Supervisor', 'Staff', 'Case Manager', 'Family Member']
const STATUS = ["Client accepted information but isn't ready or interested in applying at this time.", 'Client declined information.', 'Client accepted information and was assisted with the application.', 'Client not eligible.']
export const GOAL_STATUS_OPTIONS = ['Complete', 'Incomplete', 'Ongoing']

export const FOCUS_PLAN_FIELDS: FocusPlanField[] = [
  { field: 'cmps_recordid', label: 'Record ID', input: 'readonly', options: [], section: 'Main' },
  { field: 'cmps_peid', label: 'Program Enrollment', input: 'lookup', options: [], section: 'Main', required: true },
  { field: 'cmps_initialdateandtime', label: 'Initial Date and Time', input: 'datetime', options: [], section: 'Main', required: true },
  { field: 'cmps_minutes', label: 'Minutes', input: 'number', options: [], section: 'Main', required: true },
  { field: 'cmps_identifiedfocusplanningmeetingteamme', label: 'Identified FOCUS Planning Meeting - Team Members Present at Plan Review Meeting', input: 'checkbox-group', options: TEAM, section: 'Main', required: true },
  { field: 'cmps_typeofmeeting1', label: 'Type of Meeting', input: 'checkbox-group', options: ['Initial', '2 Week Review', 'Other'], section: 'Main', required: true, tooltip: 'If you are modifying this record for the 2-Week Review or Other, do not unselect Initial, select the additional option.' },
  { field: 'cmps_typeofmeetingother', label: 'Type of Meeting - Other', input: 'text', options: [], section: 'Main', required: true, visibleWhen: { field: 'cmps_typeofmeeting1', values: ['Other'] } },
  { field: 'cmps_dateofnextfocusmeeting', label: 'Date of Next FOCUS Meeting', input: 'date', options: [], section: 'Main', required: true },
  { field: 'cmps_focusplancompletiondate', label: 'FOCUS Plan Completion Date', input: 'date', options: [], section: 'Main' },
  { field: 'cmps_2weekreviewmeetingteammemberspresen1', label: '2 Week Review Meeting Team Members Present', input: 'checkbox-group', options: TEAM, section: 'Main', required: true, visibleWhen: { field: 'cmps_typeofmeeting1', values: ['2 Week Review'] } },
  { field: 'cmps_2weekreviewdate', label: '2 Week Review Date', input: 'date', options: [], section: 'Main', required: true, visibleWhen: { field: 'cmps_typeofmeeting1', values: ['2 Week Review'] } },
  { field: 'cmps_2weekreviewmeetingminutes', label: '2 Week Review Meeting Minutes', input: 'number', options: [], section: 'Main', required: true, visibleWhen: { field: 'cmps_typeofmeeting1', values: ['2 Week Review'] } },
  { field: 'cmps_otherreviewmeetingteammemberspresent1', label: 'Other Review Meeting Team Members Present', input: 'checkbox-group', options: TEAM, section: 'Main', required: true, visibleWhen: { field: 'cmps_typeofmeeting1', values: ['Other'] } },
  { field: 'cmps_otherreviewmeetingdate', label: 'Other Review Meeting Date', input: 'date', options: [], section: 'Main', required: true, visibleWhen: { field: 'cmps_typeofmeeting1', values: ['Other'] } },
  { field: 'cmps_otherreviewmeetingminutes', label: 'Other Review Meeting Minutes', input: 'number', options: [], section: 'Main', required: true, visibleWhen: { field: 'cmps_typeofmeeting1', values: ['Other'] } },
  { field: 'cmps_goalspersonfamilyvision', label: 'Goals/Person-Family Vision', input: 'textarea', options: [], section: 'Goals/Person-Family Vision', required: true },
  { field: 'cmps_numberofidentifiedneeds', label: 'Number of Identified Needs', input: 'number', options: [], section: "Person's/Family Strengths & Goals", required: true, tooltip: 'Enter the Number of Identified Needs You Are Documenting' },
  { field: 'focus-goals', label: 'Identified Needs', input: 'goals', options: [], section: "Person's/Family Strengths & Goals", required: true },
  { field: 'cmps_focusmeetingnotes', label: 'FOCUS Meeting Notes', input: 'textarea', options: [], section: 'FOCUS Meeting Notes', required: true },
  { field: 'cmps_informationprovidedonvictimrights', label: 'Information Provided on Victim Rights', input: 'radio', options: YES_NO, section: 'FOCUS Plan Checklist', required: true },
  { field: 'cmps_victimrightscompletiondate', label: 'Victim Rights Completion Date', input: 'date', options: [], section: 'FOCUS Plan Checklist', required: true, visibleWhen: { field: 'cmps_informationprovidedonvictimrights', values: ['Yes'] } },
  { field: 'cmps_victimrightsstatus', label: 'Victim Rights Status', input: 'radio', options: STATUS, section: 'FOCUS Plan Checklist', required: true, visibleWhen: { field: 'cmps_informationprovidedonvictimrights', values: ['Yes'] } },
  { field: 'cmps_informationprovidedonvictimcompensation', label: 'Information Provided on Victim Compensation', input: 'radio', options: YES_NO, section: 'FOCUS Plan Checklist', required: true },
  { field: 'cmps_victimcompensationcompletiondate', label: 'Victim Compensation Completion Date', input: 'date', options: [], section: 'FOCUS Plan Checklist', required: true, visibleWhen: { field: 'cmps_informationprovidedonvictimcompensation', values: ['Yes'] } },
  { field: 'cmps_victimcompensationstatus', label: 'Victim Compensation Status', input: 'radio', options: STATUS, section: 'FOCUS Plan Checklist', required: true, visibleWhen: { field: 'cmps_informationprovidedonvictimcompensation', values: ['Yes'] } },
  { field: 'cmps_informationprovidedonaddressconfidentialitypr', label: 'Information Provided on Address Confidentiality Program', input: 'radio', options: YES_NO, section: 'FOCUS Plan Checklist', required: true },
  { field: 'cmps_addressconfidentialityinfoprovideddate', label: 'Address Confidentiality Information Provided Date', input: 'date', options: [], section: 'FOCUS Plan Checklist', required: true, visibleWhen: { field: 'cmps_informationprovidedonaddressconfidentialitypr', values: ['Yes'] } },
  { field: 'cmps_addressconfidentialitystatus', label: 'Address Confidentiality Status', input: 'radio', options: STATUS, section: 'FOCUS Plan Checklist', required: true, visibleWhen: { field: 'cmps_informationprovidedonaddressconfidentialitypr', values: ['Yes'] } },
  { field: 'cmps_informationprovidedondveducationandsupportgro', label: 'Information Provided on DV Education and Support Groups (e.g., schedule, potential topics, etc.)?', input: 'radio', options: YES_NO, section: 'FOCUS Plan Checklist' },
  { field: 'cmps_firstdayofgroups', label: 'First Day of Groups', input: 'date', options: [], section: 'FOCUS Plan Checklist', required: true, visibleWhen: { field: 'cmps_informationprovidedondveducationandsupportgro', values: ['Yes'] } },
  { field: 'cmps_groupnotes', label: 'Group Notes', input: 'textarea', options: [], section: 'FOCUS Plan Checklist', required: true, visibleWhen: { field: 'cmps_informationprovidedondveducationandsupportgro', values: ['Yes'] } },
  { field: 'cmps_safetyplancreated', label: 'Safety Plan Created', input: 'radio', options: YES_NO, section: 'FOCUS Plan Checklist', required: true },
  { field: 'cmps_safetyplancreationdate', label: 'Safety Plan Creation Date', input: 'date', options: [], section: 'FOCUS Plan Checklist', required: true, visibleWhen: { field: 'cmps_safetyplancreated', values: ['Yes'] } },
  { field: 'cmps_safetyplannotes', label: 'Safety Plan Notes', input: 'textarea', options: [], section: 'FOCUS Plan Checklist', required: true, visibleWhen: { field: 'cmps_safetyplancreated', values: ['Yes'] } },
  { field: 'cmps_emergencycontactupdated', label: 'Emergency Contact Updated', input: 'radio', options: YES_NO_NA, section: 'FOCUS Plan Checklist', required: true },
  { field: 'cmps_projectedexitdate', label: 'Projected Exit Date', input: 'date', options: [], section: 'FOCUS Plan Checklist', required: true },
  { field: 'cmps_enteredshelteronthisdate', label: 'Entered Shelter on This Date', input: 'date', options: [], section: 'FOCUS Plan Checklist', required: true },
  { field: 'cmps_residentnameandsignature', label: 'Resident Name and Signature', input: 'text', options: [], section: 'FOCUS Plan Checklist', required: true },
  { field: 'cmps_programsupervisorsignature', label: 'Program Supervisor Signature', input: 'text', options: [], section: 'FOCUS Plan Checklist', required: true },
  { field: 'cmps_thisfocusplanhasbeenreviewedbytheprogrammanag', label: 'This FOCUS Plan Has Been Reviewed by the Program Manager', input: 'text', options: [], section: 'FOCUS Plan Checklist' },
]

export type FocusPlanPayload = Partial<Record<string, string>>
const CHOICE_FIELDS = FOCUS_PLAN_FIELDS.filter((field) => ['radio', 'checkbox-group'].includes(field.input))
export const GOAL_COLUMNS = ['cmps_identifiedneeds', 'cmps_resourcesgivenandfrequencyseenbyspecialists', 'cmps_goalstatuses', 'cmps_goalcompletiondates']
export const FOCUS_PLAN_GOAL_FIELDS = GOAL_COLUMNS.map((field, index) => ({ field, label: ['Identified Needs', 'Resources Given and Frequency Seen by Specialists', 'Goal Statuses', 'Goal Completion Dates'][index] }))

// Serialization is internal: users edit plain values, including commas/quotes.
// Accept JSON arrays, legacy brace-wrapped arrays, and older comma-separated rows.
export function parseFocusGoalColumn(value: unknown): string[] {
  const flatten = (input: unknown, depth = 0): string[] | undefined => {
    if (!Array.isArray(input) || depth > 16) return undefined
    const result: string[] = []
    for (const item of input) {
      if (Array.isArray(item)) {
        const nested = flatten(item, depth + 1)
        if (!nested) return undefined
        result.push(...nested)
      } else if (item === null || ['string', 'number'].includes(typeof item)) result.push(String(item ?? ''))
      else return undefined
    }
    return result
  }
  if (Array.isArray(value)) return flatten(value) ?? [String(value)]
  const decode = (raw: string, depth = 0): string[] | undefined => {
    if (depth > 2) return undefined
    const text = raw.trim()
    const inner = text.startsWith('{') && text.endsWith('}') ? text.slice(1, -1).trim() : ''
    const candidates = inner.startsWith('[') ? [inner, `[${inner}]`] : [text]
    for (const candidate of candidates) {
      try {
        const parsed: unknown = JSON.parse(candidate)
        const items = flatten(parsed)
        if (items) return items
        if (typeof parsed === 'string' && parsed !== raw) {
          const nested = decode(parsed, depth + 1)
          if (nested) return nested
        }
      } catch { /* Not serialized data; retain the original text below. */ }
    }
    return undefined
  }
  const raw = String(value ?? '')
  if (!raw) return []
  const decoded = decode(raw)
  if (decoded) return decoded
  // Split old delimiters only outside quoted or bracketed serialized items.
  const parts: string[] = []
  let start = 0, depth = 0, quoted = false, escaped = false
  for (let index = 0; index < raw.length; index += 1) {
    const char = raw[index]
    if (quoted) {
      if (escaped) escaped = false
      else if (char === '\\') escaped = true
      else if (char === '"') quoted = false
    } else if (char === '"') quoted = true
    else if (char === '[' || char === '{') depth += 1
    else if (char === ']' || char === '}') depth = Math.max(0, depth - 1)
    else if (char === ',' && depth === 0) { parts.push(raw.slice(start, index)); start = index + 1 }
  }
  parts.push(raw.slice(start))
  return parts.flatMap((item, index) => {
    const text = index > 0 && item.startsWith(' ') ? item.slice(1) : item
    return decode(text) ?? [text]
  })
}
export function serializeFocusGoalColumn(values: readonly string[]): string {
  return JSON.stringify(values)
}
export function getFocusPlanGoalCount(values: Record<string, unknown>): number {
  const count = Number.parseInt(String(values.cmps_numberofidentifiedneeds || ''), 10)
  return Math.max(1, Math.min(6, count > 0 ? count : Math.max(...GOAL_COLUMNS.map((column) => parseFocusGoalColumn(values[column]).length))))
}
function orgUrl(): string { return String(import.meta.env.VITE_DATAVERSE_ORG_URL || DEFAULT_DATAVERSE_ORG_URL).trim().replace(/\/$/, '') }
function local(): boolean { return typeof window !== 'undefined' && ['localhost', '127.0.0.1'].includes(window.location.hostname) }
function normalizePayload(seed: FocusPlanPayload): Record<string, unknown> {
  const payload: Record<string, unknown> = { ...seed }
  const peid = String(payload.cmps_peid || '').trim().replace(/[{}]/g, '')
  if (peid) { delete payload.cmps_peid; payload['cmps_peid@odata.bind'] = `/${PROGRAM_ENROLLMENT_ENTITY_SET_NAME}(${peid})` }
  for (const field of CHOICE_FIELDS) { const raw = String(payload[field.field] || '').trim(); if (!raw) { delete payload[field.field]; continue }; const encoded = raw.split(/[,;]+/).map((item) => { const index = field.options.findIndex((option) => option.toLowerCase() === item.trim().toLowerCase()); if (index < 0) throw new Error(`Invalid choice for ${field.label}.`); return String(OPTION_SET_BASE_VALUE + index) }); payload[field.field] = field.input === 'checkbox-group' ? encoded.join(',') : encoded[0] }
  GOAL_COLUMNS.forEach((field) => {
    if (Object.prototype.hasOwnProperty.call(seed, field) && seed[field] !== undefined) payload[field] = serializeFocusGoalColumn(parseFocusGoalColumn(seed[field]))
  })
  // Strip remaining empty text/date/number fields so Dataverse never receives '' for a date column.
  for (const [field, value] of Object.entries(payload)) { if (typeof value === 'string' && !value.trim()) delete payload[field] }
  return payload
}
export function generateFocusPlanRecordId(): string { return `FP-${new Date().toISOString().replace(/[-:T]/g, '').slice(0, 15)}` }
export async function createFocusPlanResponse(seed: FocusPlanPayload): Promise<{ id: string; recordId: string }> {
  const recordId = String(seed.cmps_recordid || '').trim().replace(/\.+$/, '') || generateFocusPlanRecordId(); const payload = normalizePayload({ ...seed, cmps_recordid: recordId })
  if (local()) { const token = await ensureAuthToken(); if (!token) throw new Error('Missing Dataverse connection info for FOCUS Plan create.'); const response = await fetch(`${orgUrl()}/api/data/v9.2/${FOCUS_PLANS_TABLE_ALIAS}`, { method: 'POST', credentials: 'include', headers: { Accept: 'application/json', 'Content-Type': 'application/json', 'OData-Version': '4.0', 'OData-MaxVersion': '4.0', Authorization: `Bearer ${token}`, Prefer: 'return=representation' }, body: JSON.stringify(payload) }); if (!response.ok) throw new Error(await response.text()); const body = await response.json().catch(() => ({})); return { id: String(body?.[FOCUS_PLANS_PRIMARY_ID_FIELD] || body?.id || '').trim(), recordId } }
  const token = getAuthToken(); const result = await runtimeDataClient.executeAsync<any, any>({ connectorOperation: { tableName: 'commondataserviceforapps', operationName: 'CreateRecordWithOrganization', parameters: { prefer: 'return=representation', accept: 'application/json',  organization: orgUrl(), entityName: FOCUS_PLANS_TABLE_ALIAS, item: payload, ...(token ? { token } : {}) } } } as any); if (!result?.success) throw new Error(String(result?.error?.message || result?.error || 'FOCUS Plan create failed.')); return { id: String(result?.data?.[FOCUS_PLANS_PRIMARY_ID_FIELD] || result?.data?.id || '').trim(), recordId }
}

function normalizeGuid(value: string): string { return String(value || '').trim().replace(/[{}]/g, '') }

function rowsFromPayload(payload: any): any[] {
  if (Array.isArray(payload)) return payload
  if (Array.isArray(payload?.value)) return payload.value
  return []
}

export type FocusPlanListRecord = {
  id: string
  recordId: string
  initialDateAndTime: string
  programEnrollmentRowId: string
}

export type FocusPlanDetailRecord = {
  id: string
  recordId: string
  values: FocusPlanPayload
}

function toListRecord(row: Record<string, unknown>): FocusPlanListRecord {
  return {
    id: normalizeGuid(String(row?.[FOCUS_PLANS_PRIMARY_ID_FIELD] || row?.id || '')),
    recordId: String(row?.cmps_recordid || '').trim(),
    initialDateAndTime: String(row?.cmps_initialdateandtime || '').trim(),
    programEnrollmentRowId: normalizeGuid(String(row?._cmps_peid_value || '')),
  }
}

export async function listFocusPlansForProgramEnrollments(programEnrollmentRowIds: string[]): Promise<FocusPlanListRecord[]> {
  const enrollmentIds = programEnrollmentRowIds.map(normalizeGuid).filter(Boolean)
  if (enrollmentIds.length === 0) return []

  const select = [FOCUS_PLANS_PRIMARY_ID_FIELD, 'cmps_recordid', 'cmps_initialdateandtime', '_cmps_peid_value'].join(',')
  const filter = excludeArchived(enrollmentIds.map((id) => `_cmps_peid_value eq ${id}`).join(' or '))
  const belongsToClient = (rows: any[]) => rows.map(toListRecord).filter((row) => enrollmentIds.includes(row.programEnrollmentRowId))

  if (local()) {
    const token = await ensureAuthToken().catch(() => '')
    if (!token) return []
    const headers = new Headers({ Accept: 'application/json', 'OData-Version': '4.0', 'OData-MaxVersion': '4.0', Authorization: `Bearer ${token}` })
    const response = await fetch(`${orgUrl()}/api/data/v9.2/${FOCUS_PLANS_TABLE_ALIAS}?$select=${encodeURIComponent(select)}&$filter=${encodeURIComponent(filter)}&$top=200`, { method: 'GET', credentials: 'include', headers }).catch(() => null)
    if (!response?.ok) return []
    return belongsToClient(rowsFromPayload(await response.json().catch(() => ({}))))
  }

  const token = getAuthToken()
  const filtered = await runtimeDataClient.executeAsync<any, any>({ connectorOperation: { tableName: 'commondataserviceforapps', operationName: 'ListRecordsWithOrganization', parameters: { organization: orgUrl(), entityName: FOCUS_PLANS_TABLE_ALIAS, '$select': select, '$filter': filter, '$top': 200, ...(token ? { token } : {}) } } } as any).catch(() => null)
  if (filtered?.success) {
    const rows = belongsToClient(rowsFromPayload(filtered.data))
    if (rows.length > 0) return rows
  }

  // Some environments reject lookup filters, so fall back to matching locally.
  const unfiltered = await runtimeDataClient.executeAsync<any, any>({ connectorOperation: { tableName: 'commondataserviceforapps', operationName: 'ListRecordsWithOrganization', parameters: { organization: orgUrl(), entityName: FOCUS_PLANS_TABLE_ALIAS, '$select': select, '$top': 500, ...(token ? { token } : {}) } } } as any).catch(() => null)
  if (!unfiltered?.success) return []
  return belongsToClient(rowsFromPayload(unfiltered.data))
}

function decodeChoiceValue(field: FocusPlanField, rawValue: unknown, formattedValue?: unknown): string {
  const formatted = String(formattedValue || '').trim()
  if (formatted) return formatted
  const raw = String(rawValue ?? '').trim()
  if (!raw) return ''
  const decodeOne = (item: string) => { const numeric = Number(item.trim()); if (Number.isNaN(numeric)) return item.trim(); return field.options[numeric - OPTION_SET_BASE_VALUE] ?? item.trim() }
  return raw.split(',').map(decodeOne).join(', ')
}

function formatDateForInput(rawValue: unknown, input: FocusPlanInput): string {
  const value = String(rawValue ?? '').trim()
  const match = value.match(/^(\d{4}-\d{2}-\d{2})(?:T(\d{2}:\d{2})(?::\d{2}(?:\.\d+)?)?(?:Z|[+-]\d{2}:\d{2})?)?$/)
  if (!match) return value
  if (input === 'date') return match[1]
  return input === 'datetime' && match[2] ? `${match[1]}T${match[2]}` : value
}

const REAL_FOCUS_PLAN_FIELDS = FOCUS_PLAN_FIELDS.filter((field) => field.input !== 'goals')

function mapFocusPlanDetailRow(row: Record<string, unknown>): FocusPlanDetailRecord {
  const values: FocusPlanPayload = {}

  for (const field of REAL_FOCUS_PLAN_FIELDS) {
    if (field.field === 'cmps_peid') {
      const rawLookup = row?.['_cmps_peid_value']
      values[field.field] = String(rawLookup || '').trim()
      continue
    }
    const raw = row?.[field.field]
    const formatted = row?.[`${field.field}@OData.Community.Display.V1.FormattedValue`]
    values[field.field] = ['radio', 'checkbox-group'].includes(field.input)
      ? decodeChoiceValue(field, raw, formatted)
      : field.input === 'date' || field.input === 'datetime'
        ? formatDateForInput(raw, field.input)
        : String(raw ?? '').trim()
  }

  for (const column of GOAL_COLUMNS) values[column] = String(row?.[column] ?? '')

  return {
    id: normalizeGuid(String(row?.[FOCUS_PLANS_PRIMARY_ID_FIELD] || row?.id || '')),
    recordId: String(values.cmps_recordid || row?.cmps_recordid || '').trim(),
    values,
  }
}

export async function loadFocusPlanDetailRecord(rowId: string, recordIdHint = ''): Promise<FocusPlanDetailRecord> {
  const cleanId = normalizeGuid(rowId)
  const cleanRecordId = String(recordIdHint || '').trim()
  if (!cleanId && !cleanRecordId) throw new Error('Missing FOCUS Plan row id and record id for detail load.')

  const select = [FOCUS_PLANS_PRIMARY_ID_FIELD, ...REAL_FOCUS_PLAN_FIELDS.map((field) => field.field).filter((field) => field !== 'cmps_peid'), ...GOAL_COLUMNS, '_cmps_peid_value'].join(',')

  if (local()) {
    const token = await ensureAuthToken()
    if (!token) throw new Error('Missing Dataverse connection info for FOCUS Plan detail load.')
    const headers = new Headers({ Accept: 'application/json', 'OData-Version': '4.0', 'OData-MaxVersion': '4.0', Authorization: `Bearer ${token}` })

    if (cleanId) {
      const response = await fetch(`${orgUrl()}/api/data/v9.2/${FOCUS_PLANS_TABLE_ALIAS}(${cleanId})?$select=${encodeURIComponent(select)}`, { method: 'GET', credentials: 'include', headers })
      if (response.ok) return mapFocusPlanDetailRow(await response.json().catch(() => ({})))
    }

    if (!cleanRecordId) throw new Error('No FOCUS Plan record found.')
    const filter = `cmps_recordid eq '${cleanRecordId.replace(/'/g, "''")}'`
    const response = await fetch(`${orgUrl()}/api/data/v9.2/${FOCUS_PLANS_TABLE_ALIAS}?$select=${encodeURIComponent(select)}&$filter=${encodeURIComponent(filter)}&$top=1`, { method: 'GET', credentials: 'include', headers })
    if (!response.ok) throw new Error(await response.text())
    const rows = rowsFromPayload(await response.json().catch(() => ({})))
    if (rows.length === 0) throw new Error(`No FOCUS Plan record found for Record ID ${cleanRecordId}.`)
    return mapFocusPlanDetailRow(rows[0])
  }

  const token = getAuthToken()

  if (cleanRecordId) {
    const filter = `cmps_recordid eq '${cleanRecordId.replace(/'/g, "''")}'`
    const listResult = await runtimeDataClient.executeAsync<any, any>({ connectorOperation: { tableName: 'commondataserviceforapps', operationName: 'ListRecordsWithOrganization', parameters: { organization: orgUrl(), entityName: FOCUS_PLANS_TABLE_ALIAS, '$select': select, '$filter': filter, '$top': 1, ...(token ? { token } : {}) } } } as any).catch(() => null)
    if (listResult?.success) {
      const rows = rowsFromPayload(listResult.data)
      if (rows.length > 0) return mapFocusPlanDetailRow(rows[0])
    }
  }

  if (cleanId) {
    const directResult = await runtimeDataClient.executeAsync<any, any>({ connectorOperation: { tableName: 'commondataserviceforapps', operationName: 'GetItemWithOrganization', parameters: {
          prefer: 'odata.include-annotations="OData.Community.Display.V1.FormattedValue"',
          accept: 'application/json', organization: orgUrl(), entityName: FOCUS_PLANS_TABLE_ALIAS, recordId: cleanId, '$select': select, ...(token ? { token } : {}) } } } as any).catch(() => null)
    if (directResult?.success) return mapFocusPlanDetailRow(directResult.data || {})
    throw new Error(String(directResult?.error?.message || directResult?.error || 'FOCUS Plan detail load failed.'))
  }

  throw new Error('No FOCUS Plan record found.')
}

export async function updateFocusPlanResponse(rowId: string, values: FocusPlanPayload): Promise<void> {
  const cleanId = normalizeGuid(rowId)
  if (!cleanId) throw new Error('Missing FOCUS Plan row id for update.')
  const payload = normalizePayload(values)
  // PATCH must explicitly clear dates; omitting a blank date preserves its old value.
  for (const field of FOCUS_PLAN_FIELDS) {
    const value = (values as Record<string, unknown>)[field.field]
    if (['date', 'datetime'].includes(field.input) && Object.prototype.hasOwnProperty.call(values, field.field)
      && (value === null || (typeof value === 'string' && !value.trim()))) (payload as Record<string, unknown>)[field.field] = null
  }

  if (local()) {
    const token = await ensureAuthToken()
    if (!token) throw new Error('Missing Dataverse connection info for FOCUS Plan update.')
    const response = await fetch(`${orgUrl()}/api/data/v9.2/${FOCUS_PLANS_TABLE_ALIAS}(${cleanId})`, { method: 'PATCH', credentials: 'include', headers: { Accept: 'application/json', 'Content-Type': 'application/json', 'OData-Version': '4.0', 'OData-MaxVersion': '4.0', Authorization: `Bearer ${token}` }, body: JSON.stringify(payload) })
    if (!response.ok) throw new Error(await response.text())
    return
  }

  const token = getAuthToken()
  const result = await runtimeDataClient.executeAsync<any, any>({ connectorOperation: { tableName: 'commondataserviceforapps', operationName: 'UpdateRecordWithOrganization', parameters: { organization: orgUrl(), entityName: FOCUS_PLANS_TABLE_ALIAS, recordId: cleanId, item: payload, ...(token ? { token } : {}) } } } as any)
  if (!result?.success) throw new Error(String(result?.error?.message || result?.error || 'FOCUS Plan update failed.'))
}
