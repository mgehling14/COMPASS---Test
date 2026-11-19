import { getClient } from '@microsoft/power-apps/data'
import { dataSourcesInfo } from '../../.power/schemas/appschemas/dataSourcesInfo'
import { ensureAuthToken, getAuthToken } from './auth'
import { excludeArchived } from './archive'

export const CHILD_SAFETY_PLANS_TABLE_ALIAS = 'cmps_childsafetyplans'
export const CHILD_SAFETY_PLANS_PRIMARY_ID_FIELD = 'cmps_childsafetyplanid'
const DEFAULT_DATAVERSE_ORG_URL = 'https://org1f466e4e.crm.dynamics.com'
const PROGRAM_ENROLLMENT_ENTITY_SET_NAME = 'cmps_programenrollment1s'
const runtimeDataClient = getClient(dataSourcesInfo as any)

export type ChildSafetyPlanField = {
  field: string
  label: string
  input: 'text' | 'textarea' | 'date' | 'readonly' | 'lookup' | 'select' | 'file'
  section: 'Main' | 'Planning' | 'Emotions' | 'Acknowledgement'
  required?: boolean
}

export const CHILD_SAFETY_PLAN_FIELDS: ChildSafetyPlanField[] = [
  { field: 'cmps_recordid', label: 'Record ID', input: 'readonly', section: 'Main' },
  { field: 'cmps_peid', label: 'Program Enrollment', input: 'lookup', section: 'Main', required: true },
  { field: 'cmps_plancompletiondate', label: 'Plan Completion Date', input: 'date', section: 'Main', required: true },
  { field: 'cmps_administeredby', label: 'Administered By', input: 'select', section: 'Main', required: true },
  { field: 'cmps_title', label: 'Title', input: 'text', section: 'Main', required: true },
  { field: 'cmps_whoaremysafepeopleicantalkto', label: 'WHO are my safe people I can talk to?', input: 'textarea', section: 'Planning' },
  { field: 'cmps_whatcanidotobesafe', label: 'WHAT can I do to be safe?', input: 'textarea', section: 'Planning' },
  { field: 'cmps_wherecanigotobesafe', label: 'WHERE can I go to be safe?', input: 'textarea', section: 'Planning' },
  { field: 'cmps_ifmeorsomeoneiknowishurtorindangericancall911', label: 'If me or someone I know is hurt or in danger, I can call 911. These are the steps to do that:', input: 'textarea', section: 'Planning' },
  { field: 'cmps_fileid1', label: 'Drawing Upload', input: 'file', section: 'Emotions' },
  { field: 'cmps_whendealingwithstrongemotionswhatareyourthoug', label: 'When Dealing With Strong Emotions, What Are Your Thoughts?', input: 'textarea', section: 'Emotions' },
  { field: 'cmps_whendealingwithstrongemotionswhatdoyoufeel', label: 'When Dealing With Strong Emotions, What Do You Feel?', input: 'textarea', section: 'Emotions' },
  { field: 'cmps_whendealingwithstrongemotionswhatdoyoudo', label: 'When Dealing With Strong Emotions, What Do You Do?', input: 'textarea', section: 'Emotions' },
  { field: 'cmps_childnameandsignature', label: 'Child Name and Signature', input: 'text', section: 'Acknowledgement' },
  { field: 'cmps_clientparentorguardiannameandsignature', label: 'Client Parent or Guardian Name and Signature', input: 'text', section: 'Acknowledgement', required: true },
  { field: 'cmps_staffnameandsignature', label: 'Staff Name and Signature', input: 'text', section: 'Acknowledgement', required: true },
]

export type ChildSafetyPlanPayload = Partial<Record<(typeof CHILD_SAFETY_PLAN_FIELDS)[number]['field'], string>>

function getOrgUrl(): string { return String(import.meta.env.VITE_DATAVERSE_ORG_URL || DEFAULT_DATAVERSE_ORG_URL).trim().replace(/\/$/, '') }
function isLocalHost(): boolean { return typeof window !== 'undefined' && ['localhost', '127.0.0.1'].includes(window.location.hostname) }
function normalizeGuid(value: string): string { return String(value || '').trim().replace(/[{}]/g, '') }

function normalizePayload(seed: ChildSafetyPlanPayload): Record<string, unknown> {
  const payload: Record<string, unknown> = { ...seed }
  if (payload.cmps_recordid) payload.cmps_recordid = String(payload.cmps_recordid).trim().replace(/\.+$/, '')
  const enrollmentId = normalizeGuid(String(payload.cmps_peid || ''))
  if (enrollmentId) { delete payload.cmps_peid; payload['cmps_peid@odata.bind'] = `/${PROGRAM_ENROLLMENT_ENTITY_SET_NAME}(${enrollmentId})` }
  const fileId = normalizeGuid(String(payload.cmps_fileid1 || ''))
  delete payload.cmps_fileid1
  if (fileId) payload['cmps_fileid1@odata.bind'] = `/cmps_compassfileses(${fileId})`
  for (const [field, value] of Object.entries(payload)) if (!String(value || '').trim()) delete payload[field]
  return payload
}

export function generateChildSafetyPlanRecordId(): string { return `CSP-${new Date().toISOString().replace(/[-:T]/g, '').slice(0, 15)}`.replace(/\.+$/, '') }

export async function createChildSafetyPlanResponse(seed: ChildSafetyPlanPayload): Promise<{ id: string; recordId: string }> {
  const recordId = String(seed.cmps_recordid || '').trim().replace(/\.+$/, '') || generateChildSafetyPlanRecordId()
  const payload = normalizePayload({ ...seed, cmps_recordid: recordId })
  if (isLocalHost()) {
    const token = await ensureAuthToken()
    if (!token) throw new Error('Missing Dataverse connection info for Child Safety Plan create.')
    const response = await fetch(`${getOrgUrl()}/api/data/v9.2/${CHILD_SAFETY_PLANS_TABLE_ALIAS}`, { method: 'POST', credentials: 'include', headers: { Accept: 'application/json', 'Content-Type': 'application/json', 'OData-Version': '4.0', 'OData-MaxVersion': '4.0', Authorization: `Bearer ${token}`, Prefer: 'return=representation' }, body: JSON.stringify(payload) })
    if (!response.ok) throw new Error(await response.text())
    const body = await response.json().catch(() => ({}))
    return { id: String(body?.[CHILD_SAFETY_PLANS_PRIMARY_ID_FIELD] || body?.id || '').trim(), recordId }
  }
  const token = getAuthToken()
  const result = await runtimeDataClient.executeAsync<any, any>({ connectorOperation: { tableName: 'commondataserviceforapps', operationName: 'CreateRecordWithOrganization', parameters: { prefer: 'return=representation', accept: 'application/json',  organization: getOrgUrl(), entityName: CHILD_SAFETY_PLANS_TABLE_ALIAS, item: payload, ...(token ? { token } : {}) } } } as any)
  if (!result?.success) throw new Error(String(result?.error?.message || result?.error || 'Child Safety Plan create failed.'))
  return { id: String(result?.data?.[CHILD_SAFETY_PLANS_PRIMARY_ID_FIELD] || result?.data?.id || '').trim(), recordId }
}

export type ChildSafetyPlanListRecord = {
  id: string
  recordId: string
  fileRowId?: string
  planCompletionDate: string
  programEnrollmentRowId: string
}

export type ChildSafetyPlanDetailRecord = {
  id: string
  recordId: string
  values: ChildSafetyPlanPayload
}

function rowsFromPayload(payload: any): any[] {
  if (Array.isArray(payload)) return payload
  if (Array.isArray(payload?.value)) return payload.value
  return []
}

function toListRecord(row: Record<string, unknown>): ChildSafetyPlanListRecord {
  return {
    id: normalizeGuid(String(row?.[CHILD_SAFETY_PLANS_PRIMARY_ID_FIELD] || row?.id || '')),
    recordId: String(row?.cmps_recordid || '').trim(),
    planCompletionDate: String(row?.cmps_plancompletiondate || '').trim(),
    fileRowId: normalizeGuid(String(row?._cmps_fileid1_value || '')),
    programEnrollmentRowId: normalizeGuid(String(row?._cmps_peid_value || '')),
  }
}

export async function listChildSafetyPlansForProgramEnrollments(programEnrollmentRowIds: string[]): Promise<ChildSafetyPlanListRecord[]> {
  const enrollmentIds = programEnrollmentRowIds.map(normalizeGuid).filter(Boolean)
  if (enrollmentIds.length === 0) return []

  const select = [CHILD_SAFETY_PLANS_PRIMARY_ID_FIELD, 'cmps_recordid', 'cmps_plancompletiondate', '_cmps_peid_value', '_cmps_fileid1_value'].join(',')
  const filter = excludeArchived(enrollmentIds.map((id) => `_cmps_peid_value eq ${id}`).join(' or '))
  const belongsToClient = (rows: any[]) => rows.map(toListRecord).filter((row) => enrollmentIds.includes(row.programEnrollmentRowId))

  if (isLocalHost()) {
    const token = await ensureAuthToken().catch(() => '')
    if (!token) return []
    const headers = new Headers({ Accept: 'application/json', 'OData-Version': '4.0', 'OData-MaxVersion': '4.0', Authorization: `Bearer ${token}` })
    const response = await fetch(`${getOrgUrl()}/api/data/v9.2/${CHILD_SAFETY_PLANS_TABLE_ALIAS}?$select=${encodeURIComponent(select)}&$filter=${encodeURIComponent(filter)}&$top=200`, { method: 'GET', credentials: 'include', headers }).catch(() => null)
    if (!response?.ok) return []
    return belongsToClient(rowsFromPayload(await response.json().catch(() => ({}))))
  }

  const token = getAuthToken()
  const filtered = await runtimeDataClient.executeAsync<any, any>({ connectorOperation: { tableName: 'commondataserviceforapps', operationName: 'ListRecordsWithOrganization', parameters: { organization: getOrgUrl(), entityName: CHILD_SAFETY_PLANS_TABLE_ALIAS, '$select': select, '$filter': filter, '$top': 200, ...(token ? { token } : {}) } } } as any).catch(() => null)
  if (filtered?.success) {
    const rows = belongsToClient(rowsFromPayload(filtered.data))
    if (rows.length > 0) return rows
  }

  // Some environments reject lookup filters, so fall back to matching locally.
  const unfiltered = await runtimeDataClient.executeAsync<any, any>({ connectorOperation: { tableName: 'commondataserviceforapps', operationName: 'ListRecordsWithOrganization', parameters: { organization: getOrgUrl(), entityName: CHILD_SAFETY_PLANS_TABLE_ALIAS, '$select': select, '$top': 500, ...(token ? { token } : {}) } } } as any).catch(() => null)
  if (!unfiltered?.success) return []
  return belongsToClient(rowsFromPayload(unfiltered.data))
}

function mapChildSafetyPlanDetailRow(row: Record<string, unknown>): ChildSafetyPlanDetailRecord {
  const values: ChildSafetyPlanPayload = {}

  for (const field of CHILD_SAFETY_PLAN_FIELDS) {
    if (field.field === 'cmps_peid') {
      const rawLookup = row?.['_cmps_peid_value']
      values[field.field] = String(rawLookup || '').trim()
      continue
    }
    if (field.field === 'cmps_fileid1') {
      values[field.field] = String(row?._cmps_fileid1_value || '').trim()
      continue
    }
    values[field.field] = String(row?.[field.field] ?? '').trim()
  }

  return {
    id: normalizeGuid(String(row?.[CHILD_SAFETY_PLANS_PRIMARY_ID_FIELD] || row?.id || '')),
    recordId: String(values.cmps_recordid || row?.cmps_recordid || '').trim(),
    values,
  }
}

export async function loadChildSafetyPlanDetailRecord(rowId: string, recordIdHint = ''): Promise<ChildSafetyPlanDetailRecord> {
  const cleanId = normalizeGuid(rowId)
  const cleanRecordId = String(recordIdHint || '').trim()
  if (!cleanId && !cleanRecordId) throw new Error('Missing Child Safety Plan row id and record id for detail load.')

  const select = [CHILD_SAFETY_PLANS_PRIMARY_ID_FIELD, ...CHILD_SAFETY_PLAN_FIELDS.map((field) => field.field).filter((field) => field !== 'cmps_peid' && field !== 'cmps_fileid1'), '_cmps_peid_value', '_cmps_fileid1_value'].join(',')

  if (isLocalHost()) {
    const token = await ensureAuthToken()
    if (!token) throw new Error('Missing Dataverse connection info for Child Safety Plan detail load.')
    const headers = new Headers({ Accept: 'application/json', 'OData-Version': '4.0', 'OData-MaxVersion': '4.0', Authorization: `Bearer ${token}` })

    if (cleanId) {
      const response = await fetch(`${getOrgUrl()}/api/data/v9.2/${CHILD_SAFETY_PLANS_TABLE_ALIAS}(${cleanId})?$select=${encodeURIComponent(select)}`, { method: 'GET', credentials: 'include', headers })
      if (response.ok) return mapChildSafetyPlanDetailRow(await response.json().catch(() => ({})))
    }

    if (!cleanRecordId) throw new Error('No Child Safety Plan record found.')
    const filter = `cmps_recordid eq '${cleanRecordId.replace(/'/g, "''")}'`
    const response = await fetch(`${getOrgUrl()}/api/data/v9.2/${CHILD_SAFETY_PLANS_TABLE_ALIAS}?$select=${encodeURIComponent(select)}&$filter=${encodeURIComponent(filter)}&$top=1`, { method: 'GET', credentials: 'include', headers })
    if (!response.ok) throw new Error(await response.text())
    const rows = rowsFromPayload(await response.json().catch(() => ({})))
    if (rows.length === 0) throw new Error(`No Child Safety Plan record found for Record ID ${cleanRecordId}.`)
    return mapChildSafetyPlanDetailRow(rows[0])
  }

  const token = getAuthToken()

  if (cleanRecordId) {
    const filter = `cmps_recordid eq '${cleanRecordId.replace(/'/g, "''")}'`
    const listResult = await runtimeDataClient.executeAsync<any, any>({ connectorOperation: { tableName: 'commondataserviceforapps', operationName: 'ListRecordsWithOrganization', parameters: { organization: getOrgUrl(), entityName: CHILD_SAFETY_PLANS_TABLE_ALIAS, '$select': select, '$filter': filter, '$top': 1, ...(token ? { token } : {}) } } } as any).catch(() => null)
    if (listResult?.success) {
      const rows = rowsFromPayload(listResult.data)
      if (rows.length > 0) return mapChildSafetyPlanDetailRow(rows[0])
    }
  }

  if (cleanId) {
    const directResult = await runtimeDataClient.executeAsync<any, any>({ connectorOperation: { tableName: 'commondataserviceforapps', operationName: 'GetItemWithOrganization', parameters: {
          prefer: 'odata.include-annotations="OData.Community.Display.V1.FormattedValue"',
          accept: 'application/json', organization: getOrgUrl(), entityName: CHILD_SAFETY_PLANS_TABLE_ALIAS, recordId: cleanId, '$select': select, ...(token ? { token } : {}) } } } as any).catch(() => null)
    if (directResult?.success) return mapChildSafetyPlanDetailRow(directResult.data || {})
    throw new Error(String(directResult?.error?.message || directResult?.error || 'Child Safety Plan detail load failed.'))
  }

  throw new Error('No Child Safety Plan record found.')
}

export async function updateChildSafetyPlanResponse(rowId: string, values: ChildSafetyPlanPayload): Promise<void> {
  const cleanId = normalizeGuid(rowId)
  if (!cleanId) throw new Error('Missing Child Safety Plan row id for update.')
  const payload = normalizePayload(values)
  // PATCH must explicitly clear dates; omitting a blank date preserves its old value.
  for (const field of CHILD_SAFETY_PLAN_FIELDS) {
    const value = (values as Record<string, unknown>)[field.field]
    if (['date', 'datetime'].includes(field.input) && Object.prototype.hasOwnProperty.call(values, field.field)
      && (value === null || (typeof value === 'string' && !value.trim()))) (payload as Record<string, unknown>)[field.field] = null
  }

  if (isLocalHost()) {
    const token = await ensureAuthToken()
    if (!token) throw new Error('Missing Dataverse connection info for Child Safety Plan update.')
    const response = await fetch(`${getOrgUrl()}/api/data/v9.2/${CHILD_SAFETY_PLANS_TABLE_ALIAS}(${cleanId})`, { method: 'PATCH', credentials: 'include', headers: { Accept: 'application/json', 'Content-Type': 'application/json', 'OData-Version': '4.0', 'OData-MaxVersion': '4.0', Authorization: `Bearer ${token}` }, body: JSON.stringify(payload) })
    if (!response.ok) throw new Error(await response.text())
    return
  }

  const token = getAuthToken()
  const result = await runtimeDataClient.executeAsync<any, any>({ connectorOperation: { tableName: 'commondataserviceforapps', operationName: 'UpdateRecordWithOrganization', parameters: { organization: getOrgUrl(), entityName: CHILD_SAFETY_PLANS_TABLE_ALIAS, recordId: cleanId, item: payload, ...(token ? { token } : {}) } } } as any)
  if (!result?.success) throw new Error(String(result?.error?.message || result?.error || 'Child Safety Plan update failed.'))
}
