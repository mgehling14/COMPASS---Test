import { getClient } from '@microsoft/power-apps/data'
import { dataSourcesInfo } from '../../.power/schemas/appschemas/dataSourcesInfo'
import { ensureAuthToken, getAuthToken } from './auth'
import { listClientLinkedRecords } from './clientLinkedRecords'

export const ADULT_ASSESSMENTS_TABLE_ALIAS = 'cmps_adultassessments'
export const ADULT_ASSESSMENTS_PRIMARY_ID_FIELD = 'cmps_adultassessmentid'
const DEFAULT_DATAVERSE_ORG_URL = 'https://org1f466e4e.crm.dynamics.com'
const PROGRAM_ENROLLMENT_ENTITY_SET_NAME = 'cmps_programenrollment1s'
const CLIENT_PROFILE_ENTITY_SET_NAME = 'cmps_clientprofiles'
const OPTION_SET_BASE_VALUE = 125570000
const runtimeDataClient = getClient(dataSourcesInfo as any)

export type AdultAssessmentField = {
  field: string
  label: string
  input: 'text' | 'textarea' | 'date' | 'radio' | 'readonly' | 'lookup'
  options: string[]
  section: 'Main' | 'Assessment' | 'Acknowledgement'
  required?: boolean
  visibleWhen?: { field: string; values: string[] }
}

const YES_NO_OPTIONS = ['Yes', 'No']

export const ADULT_ASSESSMENT_FIELDS: AdultAssessmentField[] = [
  { field: 'cmps_recordid', label: 'Record ID', input: 'readonly', options: [], section: 'Main' },
  { field: 'cmps_cpid', label: 'Client Profile', input: 'lookup', options: [], section: 'Main' },
  { field: 'cmps_peid', label: 'Program Enrollment', input: 'lookup', options: [], section: 'Main', required: true },
  { field: 'cmps_assessmentdate', label: 'Assessment Date', input: 'date', options: [], section: 'Main', required: true },
  { field: 'cmps_isthisaninitialassessment', label: 'Is This an Initial Assessment?', input: 'radio', options: YES_NO_OPTIONS, section: 'Main', required: true },
  { field: 'cmps_canyoupleasetellmeabouttheeventsthatledtoyouc', label: '1.) Can you please tell me about the events that led to you coming to shelter? Has this been ongoing?', input: 'textarea', options: [], section: 'Assessment', required: true },
  { field: 'cmps_haveauthoritiesbeeninvolved', label: '2.) Have the authorities been involved?', input: 'radio', options: YES_NO_OPTIONS, section: 'Assessment', required: true },
  { field: 'cmps_ifyeshowso', label: '2 a.) If yes, how so?', input: 'textarea', options: [], section: 'Assessment', visibleWhen: { field: 'cmps_haveauthoritiesbeeninvolved', values: ['Yes'] } },
  { field: 'cmps_whatstrengthsdoyouhavetohelpyoureachyourgoals', label: '3.) What strengths do you have to help you reach your goals? (Strengths Worksheet)', input: 'textarea', options: [], section: 'Assessment', required: true },
  { field: 'cmps_whatsupportsystemsdoyoucurrentlyhaveinplace', label: '4.) What support systems do you currently have in place (family, friends, benefits, etc.)?', input: 'textarea', options: [], section: 'Assessment', required: true },
  { field: 'cmps_whatareyourcurrentneedshowcanshelterhelp', label: '5.) What are your current needs? How can shelter help?', input: 'textarea', options: [], section: 'Assessment', required: true },
  { field: 'cmps_haveyourecentlyfeltconcernedregardingyouruseo', label: '6.) Have you recently felt concerned regarding your use of drugs or alcohol?', input: 'radio', options: YES_NO_OPTIONS, section: 'Assessment', required: true },
  { field: 'cmps_ifyeshowcanshelterhelp6', label: '6 a.) If yes, how can shelter help?', input: 'textarea', options: [], section: 'Assessment', visibleWhen: { field: 'cmps_haveyourecentlyfeltconcernedregardingyouruseo', values: ['Yes'] } },
  { field: 'cmps_haveyourecentlyfeltconcernedregardingyourment', label: '7.) Have you recently felt concerned regarding your mental health?', input: 'radio', options: YES_NO_OPTIONS, section: 'Assessment', required: true },
  { field: 'cmps_ifyeshowcanshelterhelp7', label: '7 a.) If yes, how can shelter help?', input: 'textarea', options: [], section: 'Assessment', visibleWhen: { field: 'cmps_haveyourecentlyfeltconcernedregardingyourment', values: ['Yes'] } },
  { field: 'cmps_areyoucurrentlyonprobationorparole', label: '8.) Are you currently on probation or parole?', input: 'radio', options: YES_NO_OPTIONS, section: 'Assessment', required: true },
  { field: 'cmps_ifyesdoyouhaveanyrequiredclassestreatmentstoc', label: '8 a.) If yes, do you have any required classes/treatments to complete?', input: 'radio', options: YES_NO_OPTIONS, section: 'Assessment', visibleWhen: { field: 'cmps_areyoucurrentlyonprobationorparole', values: ['Yes'] } },
  { field: 'cmps_ifsowhatclassestreatments', label: '8 b.) If so, what classes/treatments?', input: 'textarea', options: [], section: 'Assessment', visibleWhen: { field: 'cmps_ifyesdoyouhaveanyrequiredclassestreatmentstoc', values: ['Yes'] } },
  { field: 'cmps_whatareyourcurrentconcernsaboutyourhousingsta', label: '9.) What are your current concerns about your housing stability?', input: 'textarea', options: [], section: 'Assessment', required: true },
  { field: 'cmps_doyouhaveanyspiritualculturalcustomsbeliefspr', label: '10.) Do you have any spiritual/cultural customs/beliefs/practices shelter should be aware of?', input: 'radio', options: YES_NO_OPTIONS, section: 'Assessment', required: true },
  { field: 'cmps_ifyespleaseshare', label: '10 a.) If yes, please share.', input: 'textarea', options: [], section: 'Assessment', visibleWhen: { field: 'cmps_doyouhaveanyspiritualculturalcustomsbeliefspr', values: ['Yes'] } },
  { field: 'cmps_residentnameandsignature', label: 'Resident Name and Signature', input: 'text', options: [], section: 'Acknowledgement', required: true },
  { field: 'cmps_programsupervisornameandsignature', label: 'Program Supervisor Name and Signature', input: 'text', options: [], section: 'Acknowledgement', required: true },
]

export type AdultAssessmentPayload = Partial<Record<(typeof ADULT_ASSESSMENT_FIELDS)[number]['field'], string>>

function orgUrl(): string { return String(import.meta.env.VITE_DATAVERSE_ORG_URL || DEFAULT_DATAVERSE_ORG_URL).trim().replace(/\/$/, '') }
function isLocalHost(): boolean { return typeof window !== 'undefined' && ['localhost', '127.0.0.1'].includes(window.location.hostname) }
function normalizeGuid(value: string): string { return String(value || '').trim().replace(/[{}]/g, '') }

function normalizePayload(seed: AdultAssessmentPayload): Record<string, unknown> {
  const payload: Record<string, unknown> = { ...seed }
  if (payload.cmps_recordid) payload.cmps_recordid = String(payload.cmps_recordid).trim().replace(/\.+$/, '')
  const clientId = normalizeGuid(String(payload.cmps_cpid || ''))
  delete payload.cmps_cpid
  if (clientId) payload['cmps_cpid@odata.bind'] = `/${CLIENT_PROFILE_ENTITY_SET_NAME}(${clientId})`
  const enrollmentId = normalizeGuid(String(payload.cmps_peid || ''))
  if (enrollmentId) { delete payload.cmps_peid; payload['cmps_peid@odata.bind'] = `/${PROGRAM_ENROLLMENT_ENTITY_SET_NAME}(${enrollmentId})` }
  for (const field of ADULT_ASSESSMENT_FIELDS) {
    const value = String(payload[field.field] || '').trim()
    if (!value) { delete payload[field.field]; continue }
    if (field.input === 'radio') payload[field.field] = String(OPTION_SET_BASE_VALUE + field.options.findIndex((option) => option.toLowerCase() === value.toLowerCase()))
  }
  return payload
}

export type AdultAssessmentListRecord = {
  id: string
  recordId: string
  assessmentDate: string
  isInitialAssessment: string
  programEnrollmentRowId: string
}

export type AdultAssessmentDetailRecord = {
  id: string
  recordId: string
  values: AdultAssessmentPayload
}

function decodeRadioValue(field: AdultAssessmentField, rawValue: unknown, formattedValue?: unknown): string {
  const formatted = String(formattedValue || '').trim()
  if (formatted) return formatted
  const raw = String(rawValue ?? '').trim()
  if (!raw) return ''
  if (field.input !== 'radio') return raw
  const numeric = Number(raw)
  if (Number.isNaN(numeric)) return raw
  const index = numeric - OPTION_SET_BASE_VALUE
  return field.options[index] ?? raw
}

function mapAdultAssessmentDetailRow(row: Record<string, unknown>): AdultAssessmentDetailRecord {
  const values: AdultAssessmentPayload = {}

  for (const field of ADULT_ASSESSMENT_FIELDS) {
    if (field.field === 'cmps_cpid') {
      values[field.field] = String(row?.['_cmps_cpid_value'] || '').trim()
      continue
    }
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
    id: normalizeGuid(String(row?.[ADULT_ASSESSMENTS_PRIMARY_ID_FIELD] || row?.id || '')),
    recordId: String(values.cmps_recordid || row?.cmps_recordid || '').trim(),
    values,
  }
}

function rowsFromPayload(payload: any): any[] {
  if (Array.isArray(payload)) return payload
  if (Array.isArray(payload?.value)) return payload.value
  return []
}

function toListRecord(row: Record<string, unknown>): AdultAssessmentListRecord {
  const rawInitial = String(row?.cmps_isthisaninitialassessment ?? '').trim()
  const formattedInitial = String(row?.['cmps_isthisaninitialassessment@OData.Community.Display.V1.FormattedValue'] || '').trim()
  const decodedInitial = formattedInitial || (rawInitial === String(OPTION_SET_BASE_VALUE) ? 'Yes' : rawInitial === String(OPTION_SET_BASE_VALUE + 1) ? 'No' : rawInitial)

  return {
    id: normalizeGuid(String(row?.[ADULT_ASSESSMENTS_PRIMARY_ID_FIELD] || row?.id || '')),
    recordId: String(row?.cmps_recordid || '').trim(),
    assessmentDate: String(row?.cmps_assessmentdate || '').trim(),
    isInitialAssessment: decodedInitial,
    programEnrollmentRowId: normalizeGuid(String(row?._cmps_peid_value || '')),
  }
}

export async function listAdultAssessmentsForProgramEnrollments(programEnrollmentRowIds: string[], clientProfileId = ''): Promise<AdultAssessmentListRecord[]> {
  const records = await listClientLinkedRecords({
    tableAlias: ADULT_ASSESSMENTS_TABLE_ALIAS, primaryIdField: ADULT_ASSESSMENTS_PRIMARY_ID_FIELD, recordIdField: 'cmps_recordid',
    clientLookup: 'cmps_cpid', enrollmentLookup: 'cmps_peid', selectColumns: ['cmps_assessmentdate', 'cmps_isthisaninitialassessment'],
  }, clientProfileId, programEnrollmentRowIds)
  return records.map((record) => toListRecord(record.data || {}))
}

export function generateAdultAssessmentRecordId(): string { return `AA-${new Date().toISOString().replace(/[-:T]/g, '').slice(0, 15)}`.replace(/\.+$/, '') }

export async function createAdultAssessmentResponse(seed: AdultAssessmentPayload): Promise<{ id: string; recordId: string }> {
  const recordId = String(seed.cmps_recordid || '').trim().replace(/\.+$/, '') || generateAdultAssessmentRecordId()
  const payload = normalizePayload({ ...seed, cmps_recordid: recordId })
  if (isLocalHost()) {
    const token = await ensureAuthToken()
    if (!token) throw new Error('Missing Dataverse connection info for Adult Assessment create.')
    const response = await fetch(`${orgUrl()}/api/data/v9.2/${ADULT_ASSESSMENTS_TABLE_ALIAS}`, { method: 'POST', credentials: 'include', headers: { Accept: 'application/json', 'Content-Type': 'application/json', 'OData-Version': '4.0', 'OData-MaxVersion': '4.0', Authorization: `Bearer ${token}`, Prefer: 'return=representation' }, body: JSON.stringify(payload) })
    if (!response.ok) throw new Error(await response.text())
    const body = await response.json().catch(() => ({}))
    return { id: String(body?.[ADULT_ASSESSMENTS_PRIMARY_ID_FIELD] || body?.id || '').trim(), recordId }
  }
  const token = getAuthToken()
  const result = await runtimeDataClient.executeAsync<any, any>({ connectorOperation: { tableName: 'commondataserviceforapps', operationName: 'CreateRecordWithOrganization', parameters: { prefer: 'return=representation', accept: 'application/json',  organization: orgUrl(), entityName: ADULT_ASSESSMENTS_TABLE_ALIAS, item: payload, ...(token ? { token } : {}) } } } as any)
  if (!result?.success) throw new Error(String(result?.error?.message || result?.error || 'Adult Assessment create failed.'))
  return { id: String(result?.data?.[ADULT_ASSESSMENTS_PRIMARY_ID_FIELD] || result?.data?.id || '').trim(), recordId }
}

export async function loadAdultAssessmentDetailRecord(rowId: string, recordIdHint = ''): Promise<AdultAssessmentDetailRecord> {
  const cleanId = normalizeGuid(rowId)
  const cleanRecordId = String(recordIdHint || '').trim()
  if (!cleanId && !cleanRecordId) throw new Error('Missing Adult Assessment row id and record id for detail load.')

  const select = [ADULT_ASSESSMENTS_PRIMARY_ID_FIELD, ...ADULT_ASSESSMENT_FIELDS.map((field) => field.field).filter((field) => field !== 'cmps_peid' && field !== 'cmps_cpid'), '_cmps_peid_value', '_cmps_cpid_value'].join(',')

  if (isLocalHost()) {
    const token = await ensureAuthToken()
    if (!token) throw new Error('Missing Dataverse connection info for Adult Assessment detail load.')
    const headers = new Headers({ Accept: 'application/json', 'OData-Version': '4.0', 'OData-MaxVersion': '4.0', Authorization: `Bearer ${token}` })

    if (cleanId) {
      const response = await fetch(`${orgUrl()}/api/data/v9.2/${ADULT_ASSESSMENTS_TABLE_ALIAS}(${cleanId})?$select=${encodeURIComponent(select)}`, { method: 'GET', credentials: 'include', headers })
      if (response.ok) return mapAdultAssessmentDetailRow(await response.json().catch(() => ({})))
    }

    if (!cleanRecordId) throw new Error('No Adult Assessment record found.')
    const filter = `cmps_recordid eq '${cleanRecordId.replace(/'/g, "''")}'`
    const response = await fetch(`${orgUrl()}/api/data/v9.2/${ADULT_ASSESSMENTS_TABLE_ALIAS}?$select=${encodeURIComponent(select)}&$filter=${encodeURIComponent(filter)}&$top=1`, { method: 'GET', credentials: 'include', headers })
    if (!response.ok) throw new Error(await response.text())
    const rows = rowsFromPayload(await response.json().catch(() => ({})))
    if (rows.length === 0) throw new Error(`No Adult Assessment record found for Record ID ${cleanRecordId}.`)
    return mapAdultAssessmentDetailRow(rows[0])
  }

  const token = getAuthToken()

  if (cleanRecordId) {
    const filter = `cmps_recordid eq '${cleanRecordId.replace(/'/g, "''")}'`
    const listResult = await runtimeDataClient.executeAsync<any, any>({ connectorOperation: { tableName: 'commondataserviceforapps', operationName: 'ListRecordsWithOrganization', parameters: { organization: orgUrl(), entityName: ADULT_ASSESSMENTS_TABLE_ALIAS, '$select': select, '$filter': filter, '$top': 1, ...(token ? { token } : {}) } } } as any).catch(() => null)
    if (listResult?.success) {
      const rows = rowsFromPayload(listResult.data)
      if (rows.length > 0) return mapAdultAssessmentDetailRow(rows[0])
    }
  }

  if (cleanId) {
    const directResult = await runtimeDataClient.executeAsync<any, any>({ connectorOperation: { tableName: 'commondataserviceforapps', operationName: 'GetItemWithOrganization', parameters: {
          prefer: 'odata.include-annotations="OData.Community.Display.V1.FormattedValue"',
          accept: 'application/json', organization: orgUrl(), entityName: ADULT_ASSESSMENTS_TABLE_ALIAS, recordId: cleanId, '$select': select, ...(token ? { token } : {}) } } } as any).catch(() => null)
    if (directResult?.success) return mapAdultAssessmentDetailRow(directResult.data || {})
    throw new Error(String(directResult?.error?.message || directResult?.error || 'Adult Assessment detail load failed.'))
  }

  throw new Error('No Adult Assessment record found.')
}

export async function updateAdultAssessmentResponse(rowId: string, values: AdultAssessmentPayload): Promise<void> {
  const cleanId = normalizeGuid(rowId)
  if (!cleanId) throw new Error('Missing Adult Assessment row id for update.')
  const payload = normalizePayload(values)
  // PATCH must explicitly clear dates; omitting a blank date preserves its old value.
  for (const field of ADULT_ASSESSMENT_FIELDS) {
    const value = (values as Record<string, unknown>)[field.field]
    if (['date', 'datetime'].includes(field.input) && Object.prototype.hasOwnProperty.call(values, field.field)
      && (value === null || (typeof value === 'string' && !value.trim()))) (payload as Record<string, unknown>)[field.field] = null
  }

  if (isLocalHost()) {
    const token = await ensureAuthToken()
    if (!token) throw new Error('Missing Dataverse connection info for Adult Assessment update.')
    const response = await fetch(`${orgUrl()}/api/data/v9.2/${ADULT_ASSESSMENTS_TABLE_ALIAS}(${cleanId})`, { method: 'PATCH', credentials: 'include', headers: { Accept: 'application/json', 'Content-Type': 'application/json', 'OData-Version': '4.0', 'OData-MaxVersion': '4.0', Authorization: `Bearer ${token}` }, body: JSON.stringify(payload) })
    if (!response.ok) throw new Error(await response.text())
    return
  }

  const token = getAuthToken()
  const result = await runtimeDataClient.executeAsync<any, any>({ connectorOperation: { tableName: 'commondataserviceforapps', operationName: 'UpdateRecordWithOrganization', parameters: { organization: orgUrl(), entityName: ADULT_ASSESSMENTS_TABLE_ALIAS, recordId: cleanId, item: payload, ...(token ? { token } : {}) } } } as any)
  if (!result?.success) throw new Error(String(result?.error?.message || result?.error || 'Adult Assessment update failed.'))
}
