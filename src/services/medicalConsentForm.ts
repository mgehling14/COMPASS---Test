import { getClient } from '@microsoft/power-apps/data'
import { dataSourcesInfo } from '../../.power/schemas/appschemas/dataSourcesInfo'
import { ensureAuthToken, getAuthToken } from './auth'

export const MEDICAL_CONSENT_FORMS_TABLE_ALIAS = 'cmps_medicalconsentforms'
export const MEDICAL_CONSENT_FORMS_PRIMARY_ID_FIELD = 'cmps_medicalconsentformid'
const PROGRAM_ENROLLMENT_ENTITY_SET_NAME = 'cmps_programenrollment1s'
const DEFAULT_DATAVERSE_ORG_URL = 'https://org1f466e4e.crm.dynamics.com'
const OPTION_SET_BASE_VALUE = 125570000
const runtimeDataClient = getClient(dataSourcesInfo as any)

export type MedicalConsentFormField = {
  field: string
  label: string
  input: 'readonly' | 'lookup' | 'date' | 'datetime' | 'radio' | 'text' | 'textarea' | 'staff' | 'html'
  options: string[]
  section: 'Main' | 'Medical Information' | 'Internal User Only'
  required?: boolean
}

export const MEDICAL_CONSENT_FORM_FIELDS: MedicalConsentFormField[] = [
  { field: 'cmps_recordid', label: 'Record ID', input: 'readonly', options: [], section: 'Main' },
  { field: 'cmps_peid', label: 'Program Enrollment', input: 'lookup', options: [], section: 'Main', required: true },
  { field: 'cmps_completiondate', label: 'Completion Date', input: 'date', options: [], section: 'Main', required: true },
  { field: 'cmps_doestheresidentrefusetosign', label: 'Does Resident Refuse to Sign?', input: 'radio', options: ['Yes', 'No'], section: 'Main', required: true },
  { field: 'medical-information-header', label: 'The information on this form will be used to support your safety during your stay in our program. It is not required for program participation. You may revoke it at any time, verbally or in writing. Information provided on this form will only be shared on an as-needed basis. We may review it with you periodically for safety and accuracy.', input: 'html', options: [], section: 'Medical Information' },
  { field: 'cmps_medicalhealthconditionsincaseweneedtocallemer', label: 'Medical/Health Conditions -- In case we need to call Emergency Medical personnel, what information would you want us to share with them about you or your children?', input: 'textarea', options: [], section: 'Medical Information' },
  { field: 'cmps_pleaselistallergies', label: 'Allergies -- Do you or your children have any allergies you feel we should know about?', input: 'textarea', options: [], section: 'Medical Information' },
  { field: 'cmps_pleaselistaccommodations', label: 'Accommodations -- Do you or your children need any accommodations or assistance?', input: 'textarea', options: [], section: 'Medical Information' },
  { field: 'cmps_anyotherinformation', label: 'Any Other Information', input: 'textarea', options: [], section: 'Medical Information' },
  { field: 'medical-consent-esignature-header', label: 'E-Signature        By signing this form, you are providing your consent to share the above information with emergency personnel if you become unconscious or unable to respond.', input: 'html', options: [], section: 'Medical Information' },
  { field: 'cmps_clientnameandsignature', label: 'Client Name and Signature', input: 'text', options: [], section: 'Medical Information' },
  { field: 'medical-consent-internal-header', label: 'If the resident(client or residents representative refusees to sign Medical Consent, please document the date and time the notice was preseted to the resident and sign below.', input: 'html', options: [], section: 'Internal User Only' },
  { field: 'cmps_dateandtimepresented', label: 'Date and Time Presented', input: 'datetime', options: [], section: 'Internal User Only' },
  { field: 'cmps_presentedby', label: 'Presented By', input: 'staff', options: [], section: 'Internal User Only' },
  { field: 'cmps_reasonforrefusal', label: 'Reason for Refusal', input: 'textarea', options: [], section: 'Internal User Only' },
]

export type MedicalConsentFormPayload = Partial<Record<string, string>>

function orgUrl(): string {
  return String(import.meta.env.VITE_DATAVERSE_ORG_URL || DEFAULT_DATAVERSE_ORG_URL).trim().replace(/\/$/, '')
}

function local(): boolean {
  return typeof window !== 'undefined' && ['localhost', '127.0.0.1'].includes(window.location.hostname)
}

function normalizeGuid(value: string): string {
  return String(value || '').trim().replace(/[{}]/g, '')
}

function normalizePayload(seed: MedicalConsentFormPayload): Record<string, unknown> {
  const payload: Record<string, unknown> = { ...seed }
  // Retired fields must never be sent, even from an older saved draft.
  delete payload.cmps_doesresidentrefusetosign
  delete payload.cmps_allergiesdoyouoryourchildrenhaveanyallergiesy
  delete payload.cmps_accommodationsdoyouoryourchildrenneedanyaccom
  delete payload.cmps_accomodationsdoyouoryourchildrenneedanyaccom
  const programEnrollmentId = normalizeGuid(String(payload.cmps_peid || ''))
  if (programEnrollmentId) {
    delete payload.cmps_peid
    payload['cmps_peid@odata.bind'] = `/${PROGRAM_ENROLLMENT_ENTITY_SET_NAME}(${programEnrollmentId})`
  }

  const refusalValue = String(payload.cmps_doestheresidentrefusetosign || '').trim()
  if (refusalValue) {
    const numericValue = Number(refusalValue)
    if (Number.isInteger(numericValue) && numericValue >= OPTION_SET_BASE_VALUE && numericValue <= OPTION_SET_BASE_VALUE + 1) {
      payload.cmps_doestheresidentrefusetosign = numericValue
    } else {
      const index = ['Yes', 'No'].findIndex((option) => option.toLowerCase() === refusalValue.toLowerCase())
      if (index < 0) throw new Error('Invalid choice for Does Resident Refuse to Sign?')
      payload.cmps_doestheresidentrefusetosign = OPTION_SET_BASE_VALUE + index
    }
  } else {
    delete payload.cmps_doestheresidentrefusetosign
  }

  for (const [field, value] of Object.entries(payload)) {
    if (typeof value === 'string' && !value.trim()) delete payload[field]
  }

  return payload
}

export function generateMedicalConsentFormRecordId(): string {
  return `MCF-${new Date().toISOString().replace(/[-:T]/g, '').slice(0, 15)}`
}

export async function createMedicalConsentFormResponse(seed: MedicalConsentFormPayload): Promise<{ id: string; recordId: string }> {
  const recordId = String(seed.cmps_recordid || '').trim().replace(/\.+$/, '') || generateMedicalConsentFormRecordId()
  const payload = normalizePayload({ ...seed, cmps_recordid: recordId })

  if (local()) {
    const token = await ensureAuthToken()
    if (!token) throw new Error('Missing Dataverse connection info for Medical Consent Form create.')
    const response = await fetch(`${orgUrl()}/api/data/v9.2/${MEDICAL_CONSENT_FORMS_TABLE_ALIAS}`, {
      method: 'POST',
      credentials: 'include',
      headers: { Accept: 'application/json', 'Content-Type': 'application/json', 'OData-Version': '4.0', 'OData-MaxVersion': '4.0', Authorization: `Bearer ${token}`, Prefer: 'return=representation' },
      body: JSON.stringify(payload),
    })
    if (!response.ok) throw new Error(await response.text())
    const body = await response.json().catch(() => ({}))
    return { id: normalizeGuid(String(body?.[MEDICAL_CONSENT_FORMS_PRIMARY_ID_FIELD] || body?.id || '')), recordId }
  }

  const token = getAuthToken()
  const result = await runtimeDataClient.executeAsync<any, any>({
    connectorOperation: {
      tableName: 'commondataserviceforapps',
      operationName: 'CreateRecordWithOrganization',
      parameters: { prefer: 'return=representation', accept: 'application/json',  organization: orgUrl(), entityName: MEDICAL_CONSENT_FORMS_TABLE_ALIAS, item: payload, ...(token ? { token } : {}) },
    },
  } as any)
  if (!result?.success) throw new Error(String(result?.error?.message || result?.error || 'Medical Consent Form create failed.'))
  return { id: normalizeGuid(String(result?.data?.[MEDICAL_CONSENT_FORMS_PRIMARY_ID_FIELD] || result?.data?.id || '')), recordId }
}

export async function updateMedicalConsentFormResponse(rowId: string, values: MedicalConsentFormPayload): Promise<void> {
  const cleanId = normalizeGuid(rowId)
  if (!cleanId) throw new Error('Missing Medical Consent Form row id for update.')
  const payload = normalizePayload(values)
  // PATCH must explicitly clear dates; omitting a blank date preserves its old value.
  for (const field of MEDICAL_CONSENT_FORM_FIELDS) {
    const value = (values as Record<string, unknown>)[field.field]
    if (['date', 'datetime'].includes(field.input) && Object.prototype.hasOwnProperty.call(values, field.field)
      && (value === null || (typeof value === 'string' && !value.trim()))) (payload as Record<string, unknown>)[field.field] = null
  }

  if (local()) {
    const token = await ensureAuthToken()
    if (!token) throw new Error('Missing Dataverse connection info for Medical Consent Form update.')
    const response = await fetch(`${orgUrl()}/api/data/v9.2/${MEDICAL_CONSENT_FORMS_TABLE_ALIAS}(${cleanId})`, {
      method: 'PATCH',
      credentials: 'include',
      headers: { Accept: 'application/json', 'Content-Type': 'application/json', 'OData-Version': '4.0', 'OData-MaxVersion': '4.0', Authorization: `Bearer ${token}` },
      body: JSON.stringify(payload),
    })
    if (!response.ok) throw new Error(await response.text())
    return
  }

  const token = getAuthToken()
  const result = await runtimeDataClient.executeAsync<any, any>({
    connectorOperation: {
      tableName: 'commondataserviceforapps',
      operationName: 'UpdateRecordWithOrganization',
      parameters: { organization: orgUrl(), entityName: MEDICAL_CONSENT_FORMS_TABLE_ALIAS, recordId: cleanId, item: payload, ...(token ? { token } : {}) },
    },
  } as any)
  if (!result?.success) throw new Error(String(result?.error?.message || result?.error || 'Medical Consent Form update failed.'))
}
