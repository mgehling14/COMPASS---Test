import { getClient } from '@microsoft/power-apps/data'
import { dataSourcesInfo } from '../../.power/schemas/appschemas/dataSourcesInfo'
import { ensureAuthToken, getAuthToken } from './auth'
import { excludeArchived } from './archive'

export const HEALTH_WELLNESS_TABLE_ALIAS = 'cmps_healthandwellnessquestionnaires'
export const HEALTH_WELLNESS_PRIMARY_ID_FIELD = 'cmps_healthandwellnessquestionnaireid'
const CLIENT_PROFILE_ENTITY_SET_NAME = 'cmps_clientprofiles'
const DEFAULT_DATAVERSE_ORG_URL = 'https://org1f466e4e.crm.dynamics.com'
const OPTION_SET_BASE_VALUE = 125570000
const runtimeDataClient = getClient(dataSourcesInfo as any)

export type HealthWellnessSection = 'Main' | 'Medical History' | 'Seizure Information' | 'Medications' | 'Additional Medications' | 'Emergency Contact Information'
export type HealthWellnessInput = 'text' | 'textarea' | 'date' | 'radio' | 'select' | 'checkbox-group' | 'phone' | 'readonly' | 'medications'
export type HealthWellnessField = { field: string; label: string; input: HealthWellnessInput; options: string[]; section: HealthWellnessSection; required?: boolean; visibleWhen?: { field: string; values: string[] } }
const YES_NO = ['Yes', 'No']
export const SEIZURE_PROTOCOL_OPTIONS = ['Contact treating physician', 'Call 911 for transport to hospital', 'Notify emergency contact', 'Other']
export const EMERGENCY_RELATIONSHIP_OPTIONS = ['Mother', 'Father', 'Spouse/Partner', 'Daughter', 'Son', 'Cousin', 'Brother', 'Sister', 'Friend', 'Aquaintance', 'Aunt', 'Uncle', 'Nephew', 'Niece', 'Grandmother', 'Grandfather', 'Legal Guardian', 'Former/Legally Separated Spouse', 'Great Grandparent', 'Stepmother', 'Stepfather', 'Stepsister', 'Stepbrother', 'Stepson', 'Stepdaughter', 'Father-in-Law', 'Mother-in-Law', 'Sister-in-Law', 'Brother-in-Law']

export const HEALTH_WELLNESS_FIELDS: HealthWellnessField[] = [
  { field: 'cmps_recordid', label: 'Record ID', input: 'readonly', options: [], section: 'Main' },
  { field: 'cmps_cpid', label: 'Client Profile', input: 'readonly', options: [], section: 'Main' },
  { field: 'cmps_questionnairecompletiondate', label: 'Questionnaire Completion Date', input: 'date', options: [], section: 'Main', required: true },
  { field: 'cmps_doyouhaveanyallergies', label: 'Do You Have Any Allergies?', input: 'radio', options: YES_NO, section: 'Medical History', required: true },
  { field: 'cmps_pleaselistyourallergies', label: 'Please List Your Allergies', input: 'textarea', options: [], section: 'Medical History', required: true, visibleWhen: { field: 'cmps_doyouhaveanyallergies', values: ['Yes'] } },
  { field: 'cmps_doyouoryourchildrenhaveanyhealthconditionsyou', label: 'Do you or your child(ren) have any health conditions you are concerned about?', input: 'radio', options: YES_NO, section: 'Medical History', required: true },
  { field: 'cmps_ifyeslistwhichfamilymemberandtheconditions', label: 'If Yes, Which Family Member and Conditions?', input: 'textarea', options: [], section: 'Medical History', visibleWhen: { field: 'cmps_doyouoryourchildrenhaveanyhealthconditionsyou', values: ['Yes'] } },
  { field: 'cmps_doyouhaveadisability', label: 'Do You Have a Disability?', input: 'radio', options: YES_NO, section: 'Medical History', required: true },
  { field: 'cmps_pleaselistexplainyourdisability', label: 'Please list/explain your disability.', input: 'textarea', options: [], section: 'Medical History', visibleWhen: { field: 'cmps_doyouhaveadisability', values: ['Yes'] } },
  { field: 'cmps_doyourequireanyaccommodationsduetoadisability', label: 'Do you require any accommodations due to a disability?', input: 'textarea', options: [], section: 'Medical History', visibleWhen: { field: 'cmps_doyouhaveadisability', values: ['Yes'] } },
  { field: 'cmps_doyouhaveanyadditionalhealthconditionsordiagn', label: 'Do you have any additional health conditions or diagnoses?', input: 'textarea', options: [], section: 'Medical History' },
  { field: 'cmps_areyouallergictoanymedications', label: 'Are You Allergic to Any Medications?', input: 'radio', options: YES_NO, section: 'Medical History', required: true },
  { field: 'cmps_pleaselistthemedicationsyouareallergictoanthe', label: 'Please list the medications you are allergic to and the reaction:', input: 'textarea', options: [], section: 'Medical History', required: true, visibleWhen: { field: 'cmps_areyouallergictoanymedications', values: ['Yes'] } },
  { field: 'cmps_doyouexperienceseizures', label: 'Do You Experience Seizures?', input: 'radio', options: YES_NO, section: 'Medical History', required: true },
  { field: 'cmps_anybehavioralhealthconcernsyouhavehadinthepas', label: 'Any behavioral health concerns you have had in the past?', input: 'textarea', options: [], section: 'Medical History' },
  { field: 'cmps_behavioralhealthprovidernameoroffice', label: 'Behavioral Health Provider Name or Office', input: 'text', options: [], section: 'Medical History' },
  { field: 'cmps_behavioralhealthproviderphone', label: 'Behavioral Health Provider Phone', input: 'phone', options: [], section: 'Medical History' },
  { field: 'cmps_seizuretype', label: 'Seizure Type', input: 'textarea', options: [], section: 'Seizure Information' },
  { field: 'cmps_typicalresponseafterseizure', label: 'Typical Response (after seizure)', input: 'textarea', options: [], section: 'Seizure Information' },
  { field: 'cmps_whatwouldyoulikestafftodowhenyoubeginseizing', label: 'What would you like staff to do when you begin seizing?', input: 'textarea', options: [], section: 'Seizure Information' },
  { field: 'cmps_typicallengthinminutes', label: 'Typical Length (in minutes)', input: 'text', options: [], section: 'Seizure Information' },
  { field: 'cmps_frequency', label: 'Frequency', input: 'text', options: [], section: 'Seizure Information' },
  { field: 'cmps_seizuretriggersorwarningsigns', label: 'Seizure Triggers or Warning Signs', input: 'textarea', options: [], section: 'Seizure Information' },
  { field: 'cmps_aseizureemergencyforyouisdefinedas', label: 'A seizure emergency for you is defined as:', input: 'textarea', options: [], section: 'Seizure Information' },
  { field: 'cmps_seizureemergencyprotocol1', label: 'Seizure Emergency Protocol', input: 'checkbox-group', options: SEIZURE_PROTOCOL_OPTIONS, section: 'Seizure Information', required: true },
  { field: 'cmps_seizureemergencyprotocolother', label: 'Seizure Emergency Protocol - Other', input: 'text', options: [], section: 'Seizure Information', visibleWhen: { field: 'cmps_seizureemergencyprotocol1', values: ['Other'] } },
  { field: 'cmps_physicianname', label: 'Physician Name', input: 'text', options: [], section: 'Seizure Information', visibleWhen: { field: 'cmps_seizureemergencyprotocol1', values: ['Contact treating physician'] } },
  { field: 'cmps_physicianphone', label: 'Physician Phone', input: 'phone', options: [], section: 'Seizure Information', visibleWhen: { field: 'cmps_seizureemergencyprotocol1', values: ['Contact treating physician'] } },
  { field: 'medications-primary', label: 'Medications 1-4', input: 'medications', options: [], section: 'Medications' },
  { field: 'cmps_doyouhavemoremedicationsyouwouldliketodocumen', label: 'Do you have more medications you would like to document (space provided not enough)?', input: 'radio', options: YES_NO, section: 'Medications' },
  { field: 'cmps_doyouhavethemedicationsyoulistedwithyou', label: 'Do You Have the Medications You Listed With You?', input: 'radio', options: YES_NO, section: 'Medications' },
  { field: 'cmps_whatisyourplantogetyourmedications', label: 'What is your plan to get your medications?', input: 'textarea', options: [], section: 'Medications', visibleWhen: { field: 'cmps_doyouhavethemedicationsyoulistedwithyou', values: ['No'] } },
  { field: 'medications-additional', label: 'Medications 5-10', input: 'medications', options: [], section: 'Additional Medications' },
  { field: 'cmps_incaseofamedicalemergencydoyouhaveanemergency', label: 'In Case of a Medical Emergency, Do You Have an Emergency Contact Staff Can Reach Out To?', input: 'radio', options: YES_NO, section: 'Emergency Contact Information', required: true },
  { field: 'cmps_emergencycontactname', label: 'Emergency Contact Name', input: 'text', options: [], section: 'Emergency Contact Information' },
  { field: 'cmps_emeergencycontactphone', label: 'Emergency Contact Phone', input: 'phone', options: [], section: 'Emergency Contact Information' },
  { field: 'cmps_relationship', label: 'Relationship', input: 'select', options: EMERGENCY_RELATIONSHIP_OPTIONS, section: 'Emergency Contact Information' },
  { field: 'cmps_doesanewleafhaveyourconsenttocontactyouremerg', label: 'Does A New Leaf Have Your Consent to Contact Your Emergency Contact?', input: 'radio', options: YES_NO, section: 'Emergency Contact Information' },
  { field: 'cmps_personalcellnumbertobeusedbystaffforemergenci', label: 'Personal Cell Number to Be Used by Staff for Emergencies Only', input: 'phone', options: [], section: 'Emergency Contact Information' },
]

export type HealthWellnessPayload = Partial<Record<string, string>>
const CHOICE_FIELDS = new Map(HEALTH_WELLNESS_FIELDS.filter((field) => ['radio', 'select', 'checkbox-group'].includes(field.input)).map((field) => [field.field, field]))
const COMBINED_COLUMNS = ['cmps_medications', 'cmps_doseofmedications', 'cmps_frequencytakenformedications', 'cmps_reasonfortakingmedications', 'cmps_moremedications', 'cmps_moredoseofmedications', 'cmps_morefrequencytakenformedications', 'cmps_morereasonfortakingmedications']
function orgUrl(): string { return String(import.meta.env.VITE_DATAVERSE_ORG_URL || DEFAULT_DATAVERSE_ORG_URL).trim().replace(/\/$/, '') }
function isLocalHost(): boolean { return typeof window !== 'undefined' && ['localhost', '127.0.0.1'].includes(window.location.hostname) }
function values(value: string): string[] { return String(value || '').split(/[,;]+/).map((item) => item.trim()).filter(Boolean) }
function normalizePayload(seed: HealthWellnessPayload): Record<string, unknown> {
  const payload: Record<string, unknown> = { ...seed }
  delete payload.cmps_seizureemergencyprotocol
  const clientId = String(payload.cmps_cpid || '').trim().replace(/[{}]/g, '')
  if (clientId) { delete payload.cmps_cpid; payload['cmps_cpid@odata.bind'] = `/${CLIENT_PROFILE_ENTITY_SET_NAME}(${clientId})` }
  for (const [field, definition] of CHOICE_FIELDS) {
    const raw = String(payload[field] || '').trim()
    if (!raw) {
      if (definition.input === 'checkbox-group' && Object.hasOwn(seed, field)) payload[field] = null
      else delete payload[field]
      continue
    }
    const encoded = values(raw).map((item) => {
      const index = definition.options.findIndex((option) => option.toLowerCase() === item.toLowerCase())
      if (index >= 0) return String(OPTION_SET_BASE_VALUE + index)
      const numeric = Number(item)
      if (definition.input === 'checkbox-group' && /^\d+$/.test(item) && numeric >= OPTION_SET_BASE_VALUE && numeric < OPTION_SET_BASE_VALUE + definition.options.length) return String(numeric)
      throw new Error(`Invalid choice for ${definition.label}.`)
    })
    if (!encoded.length) throw new Error(`Invalid choice for ${definition.label}.`)
    payload[field] = definition.input === 'checkbox-group' ? [...new Set(encoded)].join(',') : encoded[0]
  }
  for (const field of COMBINED_COLUMNS) if (!String(payload[field] || '').trim()) delete payload[field]
  // Strip remaining empty text/date/number fields so Dataverse never receives '' for a date column.
  for (const [field, value] of Object.entries(payload)) { if (typeof value === 'string' && !value.trim()) delete payload[field] }
  return payload
}
export function generateHealthWellnessRecordId(): string { return `HWQ-${new Date().toISOString().replace(/[-:T]/g, '').slice(0, 15)}` }
export async function createHealthWellnessResponse(seed: HealthWellnessPayload): Promise<{ id: string; recordId: string }> {
  const recordId = String(seed.cmps_recordid || '').trim().replace(/\.+$/, '') || generateHealthWellnessRecordId()
  const payload = normalizePayload({ ...seed, cmps_recordid: recordId })
  if (isLocalHost()) {
    const token = await ensureAuthToken(); if (!token) throw new Error('Missing Dataverse connection info for Health and Wellness Questionnaire create.')
    const response = await fetch(`${orgUrl()}/api/data/v9.2/${HEALTH_WELLNESS_TABLE_ALIAS}`, { method: 'POST', credentials: 'include', headers: { Accept: 'application/json', 'Content-Type': 'application/json', 'OData-Version': '4.0', 'OData-MaxVersion': '4.0', Authorization: `Bearer ${token}`, Prefer: 'return=representation' }, body: JSON.stringify(payload) })
    if (!response.ok) throw new Error(await response.text()); const body = await response.json().catch(() => ({})); return { id: String(body?.[HEALTH_WELLNESS_PRIMARY_ID_FIELD] || body?.id || '').trim(), recordId }
  }
  const token = getAuthToken(); const result = await runtimeDataClient.executeAsync<any, any>({ connectorOperation: { tableName: 'commondataserviceforapps', operationName: 'CreateRecordWithOrganization', parameters: { prefer: 'return=representation', accept: 'application/json',  organization: orgUrl(), entityName: HEALTH_WELLNESS_TABLE_ALIAS, item: payload, ...(token ? { token } : {}) } } } as any)
  if (!result?.success) throw new Error(String(result?.error?.message || result?.error || 'Health and Wellness Questionnaire create failed.'))
  return { id: String(result?.data?.[HEALTH_WELLNESS_PRIMARY_ID_FIELD] || result?.data?.id || '').trim(), recordId }
}

function normalizeGuid(value: string): string { return String(value || '').trim().replace(/[{}]/g, '') }

function rowsFromPayload(payload: any): any[] {
  if (Array.isArray(payload)) return payload
  if (Array.isArray(payload?.value)) return payload.value
  return []
}

export type HealthWellnessListRecord = {
  id: string
  recordId: string
  completionDate: string
  clientRowId: string
}

export type HealthWellnessDetailRecord = {
  id: string
  recordId: string
  values: HealthWellnessPayload
}

function toListRecord(row: Record<string, unknown>): HealthWellnessListRecord {
  return {
    id: normalizeGuid(String(row?.[HEALTH_WELLNESS_PRIMARY_ID_FIELD] || row?.id || '')),
    recordId: String(row?.cmps_recordid || '').trim(),
    completionDate: String(row?.cmps_questionnairecompletiondate || '').trim(),
    clientRowId: normalizeGuid(String(row?._cmps_cpid_value || '')),
  }
}

export async function listHealthWellnessForClient(clientRowId: string): Promise<HealthWellnessListRecord[]> {
  const cleanClientId = normalizeGuid(clientRowId)
  if (!cleanClientId) return []

  const select = [HEALTH_WELLNESS_PRIMARY_ID_FIELD, 'cmps_recordid', 'cmps_questionnairecompletiondate', '_cmps_cpid_value'].join(',')
  const filter = excludeArchived(`_cmps_cpid_value eq ${cleanClientId}`)
  const belongsToClient = (rows: any[]) => rows.map(toListRecord).filter((row) => row.clientRowId === cleanClientId)

  if (isLocalHost()) {
    const token = await ensureAuthToken().catch(() => '')
    if (!token) return []
    const headers = new Headers({ Accept: 'application/json', 'OData-Version': '4.0', 'OData-MaxVersion': '4.0', Authorization: `Bearer ${token}` })
    const response = await fetch(`${orgUrl()}/api/data/v9.2/${HEALTH_WELLNESS_TABLE_ALIAS}?$select=${encodeURIComponent(select)}&$filter=${encodeURIComponent(filter)}&$top=200`, { method: 'GET', credentials: 'include', headers }).catch(() => null)
    if (!response?.ok) return []
    return belongsToClient(rowsFromPayload(await response.json().catch(() => ({}))))
  }

  const token = getAuthToken()
  const filtered = await runtimeDataClient.executeAsync<any, any>({ connectorOperation: { tableName: 'commondataserviceforapps', operationName: 'ListRecordsWithOrganization', parameters: { organization: orgUrl(), entityName: HEALTH_WELLNESS_TABLE_ALIAS, '$select': select, '$filter': filter, '$top': 200, ...(token ? { token } : {}) } } } as any).catch(() => null)
  if (filtered?.success) {
    const rows = belongsToClient(rowsFromPayload(filtered.data))
    if (rows.length > 0) return rows
  }

  // Some environments reject lookup filters, so fall back to matching locally.
  const unfiltered = await runtimeDataClient.executeAsync<any, any>({ connectorOperation: { tableName: 'commondataserviceforapps', operationName: 'ListRecordsWithOrganization', parameters: { organization: orgUrl(), entityName: HEALTH_WELLNESS_TABLE_ALIAS, '$select': select, '$top': 500, ...(token ? { token } : {}) } } } as any).catch(() => null)
  if (!unfiltered?.success) return []
  return belongsToClient(rowsFromPayload(unfiltered.data))
}

function decodeChoiceValue(definition: HealthWellnessField, rawValue: unknown, formattedValue?: unknown): string {
  const formatted = String(formattedValue || '').trim()
  if (formatted) return definition.input === 'checkbox-group' ? [...new Set(values(formatted))].join(', ') : formatted
  const raw = String(rawValue ?? '').trim()
  if (!raw) return ''
  const decodeOne = (item: string) => { const numeric = Number(item.trim()); if (Number.isNaN(numeric)) return item.trim(); return definition.options[numeric - OPTION_SET_BASE_VALUE] ?? item.trim() }
  return [...new Set(values(raw).map(decodeOne))].join(', ')
}

const REAL_HEALTH_WELLNESS_FIELDS = HEALTH_WELLNESS_FIELDS.filter((field) => field.input !== 'medications')

function mapHealthWellnessDetailRow(row: Record<string, unknown>): HealthWellnessDetailRecord {
  const values: HealthWellnessPayload = {}

  for (const field of REAL_HEALTH_WELLNESS_FIELDS) {
    if (field.field === 'cmps_cpid') {
      const rawLookup = row?.['_cmps_cpid_value']
      values[field.field] = String(rawLookup || '').trim()
      continue
    }
    const raw = row?.[field.field]
    const formatted = row?.[`${field.field}@OData.Community.Display.V1.FormattedValue`]
    values[field.field] = CHOICE_FIELDS.has(field.field) ? decodeChoiceValue(field, raw, formatted) : String(raw ?? '').trim()
  }

  for (const column of COMBINED_COLUMNS) values[column] = String(row?.[column] ?? '').trim()

  return {
    id: normalizeGuid(String(row?.[HEALTH_WELLNESS_PRIMARY_ID_FIELD] || row?.id || '')),
    recordId: String(values.cmps_recordid || row?.cmps_recordid || '').trim(),
    values,
  }
}

export async function loadHealthWellnessDetailRecord(rowId: string, recordIdHint = ''): Promise<HealthWellnessDetailRecord> {
  const cleanId = normalizeGuid(rowId)
  const cleanRecordId = String(recordIdHint || '').trim()
  if (!cleanId && !cleanRecordId) throw new Error('Missing Health and Wellness Questionnaire row id and record id for detail load.')

  const select = [HEALTH_WELLNESS_PRIMARY_ID_FIELD, ...REAL_HEALTH_WELLNESS_FIELDS.map((field) => field.field).filter((field) => field !== 'cmps_cpid'), ...COMBINED_COLUMNS, '_cmps_cpid_value'].join(',')

  if (isLocalHost()) {
    const token = await ensureAuthToken()
    if (!token) throw new Error('Missing Dataverse connection info for Health and Wellness Questionnaire detail load.')
    const headers = new Headers({ Accept: 'application/json', 'OData-Version': '4.0', 'OData-MaxVersion': '4.0', Authorization: `Bearer ${token}` })

    if (cleanId) {
      const response = await fetch(`${orgUrl()}/api/data/v9.2/${HEALTH_WELLNESS_TABLE_ALIAS}(${cleanId})?$select=${encodeURIComponent(select)}`, { method: 'GET', credentials: 'include', headers })
      if (response.ok) return mapHealthWellnessDetailRow(await response.json().catch(() => ({})))
    }

    if (!cleanRecordId) throw new Error('No Health and Wellness Questionnaire record found.')
    const filter = `cmps_recordid eq '${cleanRecordId.replace(/'/g, "''")}'`
    const response = await fetch(`${orgUrl()}/api/data/v9.2/${HEALTH_WELLNESS_TABLE_ALIAS}?$select=${encodeURIComponent(select)}&$filter=${encodeURIComponent(filter)}&$top=1`, { method: 'GET', credentials: 'include', headers })
    if (!response.ok) throw new Error(await response.text())
    const rows = rowsFromPayload(await response.json().catch(() => ({})))
    if (rows.length === 0) throw new Error(`No Health and Wellness Questionnaire record found for Record ID ${cleanRecordId}.`)
    return mapHealthWellnessDetailRow(rows[0])
  }

  const token = getAuthToken()

  if (cleanRecordId) {
    const filter = `cmps_recordid eq '${cleanRecordId.replace(/'/g, "''")}'`
    const listResult = await runtimeDataClient.executeAsync<any, any>({ connectorOperation: { tableName: 'commondataserviceforapps', operationName: 'ListRecordsWithOrganization', parameters: { organization: orgUrl(), entityName: HEALTH_WELLNESS_TABLE_ALIAS, '$select': select, '$filter': filter, '$top': 1, ...(token ? { token } : {}) } } } as any).catch(() => null)
    if (listResult?.success) {
      const rows = rowsFromPayload(listResult.data)
      if (rows.length > 0) return mapHealthWellnessDetailRow(rows[0])
    }
  }

  if (cleanId) {
    const directResult = await runtimeDataClient.executeAsync<any, any>({ connectorOperation: { tableName: 'commondataserviceforapps', operationName: 'GetRecordWithOrganization', parameters: { organization: orgUrl(), entityName: HEALTH_WELLNESS_TABLE_ALIAS, recordId: cleanId, '$select': select, ...(token ? { token } : {}) } } } as any).catch(() => null)
    if (directResult?.success) return mapHealthWellnessDetailRow(directResult.data || {})
    throw new Error(String(directResult?.error?.message || directResult?.error || 'Health and Wellness Questionnaire detail load failed.'))
  }

  throw new Error('No Health and Wellness Questionnaire record found.')
}

export async function updateHealthWellnessResponse(rowId: string, values: HealthWellnessPayload): Promise<void> {
  const cleanId = normalizeGuid(rowId)
  if (!cleanId) throw new Error('Missing Health and Wellness Questionnaire row id for update.')
  const payload = normalizePayload(values)
  // PATCH must explicitly clear dates; omitting a blank date preserves its old value.
  for (const field of HEALTH_WELLNESS_FIELDS) {
    const value = (values as Record<string, unknown>)[field.field]
    if (['date', 'datetime'].includes(field.input) && Object.prototype.hasOwnProperty.call(values, field.field)
      && (value === null || (typeof value === 'string' && !value.trim()))) (payload as Record<string, unknown>)[field.field] = null
  }

  if (isLocalHost()) {
    const token = await ensureAuthToken()
    if (!token) throw new Error('Missing Dataverse connection info for Health and Wellness Questionnaire update.')
    const response = await fetch(`${orgUrl()}/api/data/v9.2/${HEALTH_WELLNESS_TABLE_ALIAS}(${cleanId})`, { method: 'PATCH', credentials: 'include', headers: { Accept: 'application/json', 'Content-Type': 'application/json', 'OData-Version': '4.0', 'OData-MaxVersion': '4.0', Authorization: `Bearer ${token}` }, body: JSON.stringify(payload) })
    if (!response.ok) throw new Error(await response.text())
    return
  }

  const token = getAuthToken()
  const result = await runtimeDataClient.executeAsync<any, any>({ connectorOperation: { tableName: 'commondataserviceforapps', operationName: 'UpdateRecordWithOrganization', parameters: { organization: orgUrl(), entityName: HEALTH_WELLNESS_TABLE_ALIAS, recordId: cleanId, item: payload, ...(token ? { token } : {}) } } } as any)
  if (!result?.success) throw new Error(String(result?.error?.message || result?.error || 'Health and Wellness Questionnaire update failed.'))
}
