import { getClient } from '@microsoft/power-apps/data'
import { dataSourcesInfo } from '../../.power/schemas/appschemas/dataSourcesInfo'
import { ensureAuthToken, getAuthToken } from './auth'
import { excludeArchived } from './archive'

export const INITIAL_SAFETY_PLANS_TABLE_ALIAS = 'cmps_initialsafetyplans'
export const INITIAL_SAFETY_PLANS_PRIMARY_ID_FIELD = 'cmps_initialsafetyplanid'
const PROGRAM_ENROLLMENT_ENTITY_SET_NAME = 'cmps_programenrollment1s'
const DEFAULT_DATAVERSE_ORG_URL = 'https://org1f466e4e.crm.dynamics.com'
const OPTION_SET_BASE_VALUE = 125570000
const runtimeDataClient = getClient(dataSourcesInfo as any)

export type InitialSafetyPlanField = { field: string; label: string; input: 'text' | 'textarea' | 'date' | 'radio' | 'phone' | 'lookup' | 'readonly'; options: string[]; section: 'Main' | 'Acknowledgement'; required?: boolean }
const YES_NO = ['Yes', 'No']
export const INITIAL_SAFETY_PLAN_FIELDS: InitialSafetyPlanField[] = [
  { field: 'cmps_recordid', label: 'Record ID', input: 'readonly', options: [], section: 'Main' },
  { field: 'cmps_peid', label: 'Program Enrollment', input: 'lookup', options: [], section: 'Main', required: true },
  { field: 'cmps_initialsafetyplancompletiondate', label: 'Initial Safety Plan Completion Date', input: 'date', options: [], section: 'Main', required: true },
  { field: 'cmps_doyouhaveitemsyouplanongettingfromyourpreviou', label: 'Do you have items you plan on getting from your previous place of residence?', input: 'radio', options: YES_NO, section: 'Main', required: true },
  { field: 'cmps_whatisyourplan', label: 'What Is Your Plan?', input: 'textarea', options: [], section: 'Main' },
  { field: 'cmps_didacasemanagerprovideanemergencyinformationc', label: 'Did a Case Manager Provide an Emergency Information Card?', input: 'radio', options: YES_NO, section: 'Main', required: true },
  { field: 'cmps_doyoufeelthatifyousawthepersonharmingyouwhile', label: 'Do you feel that if you saw the person harming you while you were out they would harm or follow you?', input: 'radio', options: YES_NO, section: 'Main', required: true },
  { field: 'cmps_doyouusepublictransportationforworkschoolorha', label: 'Do you use public transportation for work, for school, or have routine medical appointments?', input: 'radio', options: YES_NO, section: 'Main', required: true },
  { field: 'cmps_doyoucurrentlyhavesocialmediaaccounts', label: 'Do You Currently Have Social Media Accounts?', input: 'radio', options: YES_NO, section: 'Main', required: true },
  { field: 'cmps_doesthepersonharmingyouhaveaccesstoyourbankac', label: 'Does the Person Harming You Have Access to Your Bank Accounts?', input: 'radio', options: YES_NO, section: 'Main', required: true },
  { field: 'cmps_willyourchildrenattendthesameschoolordaycare', label: 'Will Your Children Attend the Same School or Daycare?', input: 'radio', options: YES_NO, section: 'Main', required: true },
  { field: 'cmps_programphonenumber', label: 'Program Phone Number', input: 'readonly', options: [], section: 'Main' },
  { field: 'cmps_residentnameandsignature', label: 'Resident Name and Signature', input: 'text', options: [], section: 'Acknowledgement', required: true },
  { field: 'cmps_staffnameandsignature', label: 'Staff Name and Signature', input: 'text', options: [], section: 'Acknowledgement', required: true },
]
export type InitialSafetyPlanPayload = Partial<Record<string, string>>
function orgUrl(): string { return String(import.meta.env.VITE_DATAVERSE_ORG_URL || DEFAULT_DATAVERSE_ORG_URL).trim().replace(/\/$/, '') }
function local(): boolean { return typeof window !== 'undefined' && ['localhost', '127.0.0.1'].includes(window.location.hostname) }
function normalizePayload(seed: InitialSafetyPlanPayload): Record<string, unknown> { const payload: Record<string, unknown> = { ...seed }; const peid = String(payload.cmps_peid || '').trim().replace(/[{}]/g, ''); if (peid) { delete payload.cmps_peid; payload['cmps_peid@odata.bind'] = `/${PROGRAM_ENROLLMENT_ENTITY_SET_NAME}(${peid})` }; INITIAL_SAFETY_PLAN_FIELDS.filter((field) => field.input === 'radio').forEach((field) => { const value = String(payload[field.field] || '').trim(); if (!value) { delete payload[field.field]; return }; const index = field.options.findIndex((option) => option.toLowerCase() === value.toLowerCase()); if (index < 0) throw new Error(`Invalid choice for ${field.label}.`); payload[field.field] = String(OPTION_SET_BASE_VALUE + index) }); for (const [field, value] of Object.entries(payload)) { if (typeof value === 'string' && !value.trim()) delete payload[field] }; return payload }
export function generateInitialSafetyPlanRecordId(): string { return `ISP-${new Date().toISOString().replace(/[-:T]/g, '').slice(0, 15)}` }
export async function createInitialSafetyPlanResponse(seed: InitialSafetyPlanPayload): Promise<{ id: string; recordId: string }> { const recordId = String(seed.cmps_recordid || '').trim().replace(/\.+$/, '') || generateInitialSafetyPlanRecordId(); const payload = normalizePayload({ ...seed, cmps_recordid: recordId }); if (local()) { const token = await ensureAuthToken(); if (!token) throw new Error('Missing Dataverse connection info for Initial Safety Plan create.'); const response = await fetch(`${orgUrl()}/api/data/v9.2/${INITIAL_SAFETY_PLANS_TABLE_ALIAS}`, { method: 'POST', credentials: 'include', headers: { Accept: 'application/json', 'Content-Type': 'application/json', 'OData-Version': '4.0', 'OData-MaxVersion': '4.0', Authorization: `Bearer ${token}`, Prefer: 'return=representation' }, body: JSON.stringify(payload) }); if (!response.ok) throw new Error(await response.text()); const body = await response.json().catch(() => ({})); return { id: String(body?.[INITIAL_SAFETY_PLANS_PRIMARY_ID_FIELD] || body?.id || '').trim(), recordId } }; const token = getAuthToken(); const result = await runtimeDataClient.executeAsync<any, any>({ connectorOperation: { tableName: 'commondataserviceforapps', operationName: 'CreateRecordWithOrganization', parameters: { prefer: 'return=representation', accept: 'application/json',  organization: orgUrl(), entityName: INITIAL_SAFETY_PLANS_TABLE_ALIAS, item: payload, ...(token ? { token } : {}) } } } as any); if (!result?.success) throw new Error(String(result?.error?.message || result?.error || 'Initial Safety Plan create failed.')); return { id: String(result?.data?.[INITIAL_SAFETY_PLANS_PRIMARY_ID_FIELD] || result?.data?.id || '').trim(), recordId } }

function normalizeGuid(value: string): string { return String(value || '').trim().replace(/[{}]/g, '') }

function rowsFromPayload(payload: any): any[] {
  if (Array.isArray(payload)) return payload
  if (Array.isArray(payload?.value)) return payload.value
  return []
}

export type InitialSafetyPlanListRecord = {
  id: string
  recordId: string
  completionDate: string
  programEnrollmentRowId: string
}

export type InitialSafetyPlanDetailRecord = {
  id: string
  recordId: string
  values: InitialSafetyPlanPayload
}

function toListRecord(row: Record<string, unknown>): InitialSafetyPlanListRecord {
  return {
    id: normalizeGuid(String(row?.[INITIAL_SAFETY_PLANS_PRIMARY_ID_FIELD] || row?.id || '')),
    recordId: String(row?.cmps_recordid || '').trim(),
    completionDate: String(row?.cmps_initialsafetyplancompletiondate || '').trim(),
    programEnrollmentRowId: normalizeGuid(String(row?._cmps_peid_value || '')),
  }
}

export async function listInitialSafetyPlansForProgramEnrollments(programEnrollmentRowIds: string[]): Promise<InitialSafetyPlanListRecord[]> {
  const enrollmentIds = programEnrollmentRowIds.map(normalizeGuid).filter(Boolean)
  if (enrollmentIds.length === 0) return []

  const select = [INITIAL_SAFETY_PLANS_PRIMARY_ID_FIELD, 'cmps_recordid', 'cmps_initialsafetyplancompletiondate', '_cmps_peid_value'].join(',')
  const filter = excludeArchived(enrollmentIds.map((id) => `_cmps_peid_value eq ${id}`).join(' or '))
  const belongsToClient = (rows: any[]) => rows.map(toListRecord).filter((row) => enrollmentIds.includes(row.programEnrollmentRowId))

  if (local()) {
    const token = await ensureAuthToken().catch(() => '')
    if (!token) return []
    const headers = new Headers({ Accept: 'application/json', 'OData-Version': '4.0', 'OData-MaxVersion': '4.0', Authorization: `Bearer ${token}` })
    const response = await fetch(`${orgUrl()}/api/data/v9.2/${INITIAL_SAFETY_PLANS_TABLE_ALIAS}?$select=${encodeURIComponent(select)}&$filter=${encodeURIComponent(filter)}&$top=200`, { method: 'GET', credentials: 'include', headers }).catch(() => null)
    if (!response?.ok) return []
    return belongsToClient(rowsFromPayload(await response.json().catch(() => ({}))))
  }

  const token = getAuthToken()
  const filtered = await runtimeDataClient.executeAsync<any, any>({ connectorOperation: { tableName: 'commondataserviceforapps', operationName: 'ListRecordsWithOrganization', parameters: { organization: orgUrl(), entityName: INITIAL_SAFETY_PLANS_TABLE_ALIAS, '$select': select, '$filter': filter, '$top': 200, ...(token ? { token } : {}) } } } as any).catch(() => null)
  if (filtered?.success) {
    const rows = belongsToClient(rowsFromPayload(filtered.data))
    if (rows.length > 0) return rows
  }

  // Some environments reject lookup filters, so fall back to matching locally.
  const unfiltered = await runtimeDataClient.executeAsync<any, any>({ connectorOperation: { tableName: 'commondataserviceforapps', operationName: 'ListRecordsWithOrganization', parameters: { organization: orgUrl(), entityName: INITIAL_SAFETY_PLANS_TABLE_ALIAS, '$select': select, '$top': 500, ...(token ? { token } : {}) } } } as any).catch(() => null)
  if (!unfiltered?.success) return []
  return belongsToClient(rowsFromPayload(unfiltered.data))
}

function decodeRadioValue(field: InitialSafetyPlanField, rawValue: unknown, formattedValue?: unknown): string {
  const formatted = String(formattedValue || '').trim()
  if (formatted) return formatted
  const raw = String(rawValue ?? '').trim()
  if (!raw) return ''
  if (field.input !== 'radio') return raw
  const numeric = Number(raw)
  if (Number.isNaN(numeric)) return raw
  return field.options[numeric - OPTION_SET_BASE_VALUE] ?? raw
}

function mapInitialSafetyPlanDetailRow(row: Record<string, unknown>): InitialSafetyPlanDetailRecord {
  const values: InitialSafetyPlanPayload = {}

  for (const field of INITIAL_SAFETY_PLAN_FIELDS) {
    if (field.field === 'cmps_peid') {
      const rawLookup = row?.['_cmps_peid_value']
      values[field.field] = String(rawLookup || '').trim()
      continue
    }
    const raw = row?.[field.field]
    const formatted = row?.[`${field.field}@OData.Community.Display.V1.FormattedValue`]
    values[field.field] = field.input === 'radio' ? decodeRadioValue(field, raw, formatted) : String(raw ?? '').trim()
  }

  return {
    id: normalizeGuid(String(row?.[INITIAL_SAFETY_PLANS_PRIMARY_ID_FIELD] || row?.id || '')),
    recordId: String(values.cmps_recordid || row?.cmps_recordid || '').trim(),
    values,
  }
}

export async function loadInitialSafetyPlanDetailRecord(rowId: string, recordIdHint = ''): Promise<InitialSafetyPlanDetailRecord> {
  const cleanId = normalizeGuid(rowId)
  const cleanRecordId = String(recordIdHint || '').trim()
  if (!cleanId && !cleanRecordId) throw new Error('Missing Initial Safety Plan row id and record id for detail load.')

  const select = [INITIAL_SAFETY_PLANS_PRIMARY_ID_FIELD, ...INITIAL_SAFETY_PLAN_FIELDS.map((field) => field.field).filter((field) => field !== 'cmps_peid'), '_cmps_peid_value'].join(',')

  if (local()) {
    const token = await ensureAuthToken()
    if (!token) throw new Error('Missing Dataverse connection info for Initial Safety Plan detail load.')
    const headers = new Headers({ Accept: 'application/json', 'OData-Version': '4.0', 'OData-MaxVersion': '4.0', Authorization: `Bearer ${token}` })

    if (cleanId) {
      const response = await fetch(`${orgUrl()}/api/data/v9.2/${INITIAL_SAFETY_PLANS_TABLE_ALIAS}(${cleanId})?$select=${encodeURIComponent(select)}`, { method: 'GET', credentials: 'include', headers })
      if (response.ok) return mapInitialSafetyPlanDetailRow(await response.json().catch(() => ({})))
    }

    if (!cleanRecordId) throw new Error('No Initial Safety Plan record found.')
    const filter = `cmps_recordid eq '${cleanRecordId.replace(/'/g, "''")}'`
    const response = await fetch(`${orgUrl()}/api/data/v9.2/${INITIAL_SAFETY_PLANS_TABLE_ALIAS}?$select=${encodeURIComponent(select)}&$filter=${encodeURIComponent(filter)}&$top=1`, { method: 'GET', credentials: 'include', headers })
    if (!response.ok) throw new Error(await response.text())
    const rows = rowsFromPayload(await response.json().catch(() => ({})))
    if (rows.length === 0) throw new Error(`No Initial Safety Plan record found for Record ID ${cleanRecordId}.`)
    return mapInitialSafetyPlanDetailRow(rows[0])
  }

  const token = getAuthToken()

  if (cleanRecordId) {
    const filter = `cmps_recordid eq '${cleanRecordId.replace(/'/g, "''")}'`
    const listResult = await runtimeDataClient.executeAsync<any, any>({ connectorOperation: { tableName: 'commondataserviceforapps', operationName: 'ListRecordsWithOrganization', parameters: { organization: orgUrl(), entityName: INITIAL_SAFETY_PLANS_TABLE_ALIAS, '$select': select, '$filter': filter, '$top': 1, ...(token ? { token } : {}) } } } as any).catch(() => null)
    if (listResult?.success) {
      const rows = rowsFromPayload(listResult.data)
      if (rows.length > 0) return mapInitialSafetyPlanDetailRow(rows[0])
    }
  }

  if (cleanId) {
    const directResult = await runtimeDataClient.executeAsync<any, any>({ connectorOperation: { tableName: 'commondataserviceforapps', operationName: 'GetRecordWithOrganization', parameters: { organization: orgUrl(), entityName: INITIAL_SAFETY_PLANS_TABLE_ALIAS, recordId: cleanId, '$select': select, ...(token ? { token } : {}) } } } as any).catch(() => null)
    if (directResult?.success) return mapInitialSafetyPlanDetailRow(directResult.data || {})
    throw new Error(String(directResult?.error?.message || directResult?.error || 'Initial Safety Plan detail load failed.'))
  }

  throw new Error('No Initial Safety Plan record found.')
}

export async function updateInitialSafetyPlanResponse(rowId: string, values: InitialSafetyPlanPayload): Promise<void> {
  const cleanId = normalizeGuid(rowId)
  if (!cleanId) throw new Error('Missing Initial Safety Plan row id for update.')
  const payload = normalizePayload(values)
  // PATCH must explicitly clear dates; omitting a blank date preserves its old value.
  for (const field of INITIAL_SAFETY_PLAN_FIELDS) {
    const value = (values as Record<string, unknown>)[field.field]
    if (['date', 'datetime'].includes(field.input) && Object.prototype.hasOwnProperty.call(values, field.field)
      && (value === null || (typeof value === 'string' && !value.trim()))) (payload as Record<string, unknown>)[field.field] = null
  }

  if (local()) {
    const token = await ensureAuthToken()
    if (!token) throw new Error('Missing Dataverse connection info for Initial Safety Plan update.')
    const response = await fetch(`${orgUrl()}/api/data/v9.2/${INITIAL_SAFETY_PLANS_TABLE_ALIAS}(${cleanId})`, { method: 'PATCH', credentials: 'include', headers: { Accept: 'application/json', 'Content-Type': 'application/json', 'OData-Version': '4.0', 'OData-MaxVersion': '4.0', Authorization: `Bearer ${token}` }, body: JSON.stringify(payload) })
    if (!response.ok) throw new Error(await response.text())
    return
  }

  const token = getAuthToken()
  const result = await runtimeDataClient.executeAsync<any, any>({ connectorOperation: { tableName: 'commondataserviceforapps', operationName: 'UpdateRecordWithOrganization', parameters: { organization: orgUrl(), entityName: INITIAL_SAFETY_PLANS_TABLE_ALIAS, recordId: cleanId, item: payload, ...(token ? { token } : {}) } } } as any)
  if (!result?.success) throw new Error(String(result?.error?.message || result?.error || 'Initial Safety Plan update failed.'))
}

