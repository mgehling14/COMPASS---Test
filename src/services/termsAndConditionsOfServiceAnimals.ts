import { getClient } from '@microsoft/power-apps/data'
import { dataSourcesInfo } from '../../.power/schemas/appschemas/dataSourcesInfo'
import { ensureAuthToken, getAuthToken } from './auth'

export const TERMS_AND_CONDITIONS_OF_SERVICE_ANIMALS_TABLE_ALIAS = 'cmps_termsandconditionsofserviceanimalses'
export const TERMS_AND_CONDITIONS_OF_SERVICE_ANIMALS_PRIMARY_ID_FIELD = 'cmps_termsandconditionsofserviceanimalsid'
const DEFAULT_DATAVERSE_ORG_URL = 'https://org1f466e4e.crm.dynamics.com'
const CLIENT_PROFILE_ENTITY_SET_NAME = 'cmps_clientprofiles'
const runtimeDataClient = getClient(dataSourcesInfo as any)

export type TermsAndConditionsOfServiceAnimalsField = {
  field: string
  label: string
  input: 'readonly' | 'lookup' | 'date' | 'text' | 'html'
  options: string[]
  section: 'Main' | 'Signature'
  required?: boolean
}

const ADA_SERVICE_ANIMAL_NOTICE = `ADA: § 36.302 Modifications in policies, practices, or procedures:

(c) Service animals.

(1) General. Generally, a public accommodation shall modify policies, practices, or procedures to permit the use of a service animal by an individual with a disability.

(2) Exceptions. A public accommodation may ask an individual with a disability to remove a service animal from the premises if:

(i) The animal is out of control and the animal's handler does not take effective action to control it; or

(ii) The animal is not housebroken.

(3) If an animal is properly excluded. If a public accommodation properly excludes a service animal under § 36.302(c)(2), it shall give the individual with a disability the opportunity to obtain goods, services, and accommodations without having the service animal on the premises.

(4) Animal under handler's control. A service animal shall be under the control of its handler. A service animal shall have a harness, leash, or other tether, unless either the handler is unable because of a disability to use a harness, leash, or other tether, or the use of a harness, leash, or other tether would interfere with the service animal's safe, effective performance of work or tasks, in which case the service animal must be otherwise under the handler's control (e.g., voice control, signals, or other effective means).

(5) Care or supervision. A public accommodation is not responsible for the care or supervision of a service animal.

By signing below, I acknowledge that I have been made aware of my rights as a participant with a service animal.`

export const TERMS_AND_CONDITIONS_OF_SERVICE_ANIMALS_FIELDS: TermsAndConditionsOfServiceAnimalsField[] = [
  { field: 'cmps_recordid', label: 'Record ID', input: 'readonly', options: [], section: 'Main' },
  { field: 'cmps_cpid', label: 'Client Profile', input: 'lookup', options: [], section: 'Main' },
  { field: 'cmps_animalname', label: 'Animal Name', input: 'text', options: [], section: 'Main', required: true },
  { field: 'cmps_completiondate', label: 'Completion Date', input: 'date', options: [], section: 'Main', required: true },
  { field: 'cmps_serviceprovidedbyanimal', label: 'Service Provided by Animal', input: 'text', options: [], section: 'Main', required: true },
  { field: 'service-animal-ada-notice', label: ADA_SERVICE_ANIMAL_NOTICE, input: 'html', options: [], section: 'Main' },
  { field: 'service-animal-esignature-header', label: 'E-Signature Disclaimer/Notice         By signing below, I hereby and understand that all electronic signatures are the equivalent of my manual/handwritten signature. This is to be used in conjunction with the use of electronic signatures on all formas in this database with a signature requirement, should I elect to have signed electronically.      By signing I Affirm I was involved in the creation and ongoing review of this document.', input: 'html', options: [], section: 'Signature' },
  { field: 'cmps_residentsignature', label: 'Resident Signature', input: 'text', options: [], section: 'Signature', required: true },
  { field: 'cmps_staffsignature', label: 'Staff Signature', input: 'text', options: [], section: 'Signature', required: true },
]

export type TermsAndConditionsOfServiceAnimalsPayload = Partial<Record<string, string>>

function orgUrl(): string {
  return String(import.meta.env.VITE_DATAVERSE_ORG_URL || DEFAULT_DATAVERSE_ORG_URL).trim().replace(/\/$/, '')
}

function local(): boolean {
  return typeof window !== 'undefined' && ['localhost', '127.0.0.1'].includes(window.location.hostname)
}

function normalizeGuid(value: string): string {
  return String(value || '').trim().replace(/[{}]/g, '')
}

function normalizePayload(seed: TermsAndConditionsOfServiceAnimalsPayload): Record<string, unknown> {
  const payload: Record<string, unknown> = { ...seed }
  const clientId = normalizeGuid(String(payload.cmps_cpid || ''))
  delete payload.cmps_cpid
  if (clientId) payload['cmps_cpid@odata.bind'] = `/${CLIENT_PROFILE_ENTITY_SET_NAME}(${clientId})`
  for (const [field, value] of Object.entries(payload)) {
    if (typeof value === 'string' && !value.trim()) delete payload[field]
  }
  return payload
}

export function generateTermsAndConditionsOfServiceAnimalsRecordId(): string {
  return `TCSA-${new Date().toISOString().replace(/[-:T]/g, '').slice(0, 15)}`
}

export async function createTermsAndConditionsOfServiceAnimalsResponse(seed: TermsAndConditionsOfServiceAnimalsPayload): Promise<{ id: string; recordId: string }> {
  const recordId = String(seed.cmps_recordid || '').trim().replace(/\.+$/, '') || generateTermsAndConditionsOfServiceAnimalsRecordId()
  const payload = normalizePayload({ ...seed, cmps_recordid: recordId })

  if (local()) {
    const token = await ensureAuthToken()
    if (!token) throw new Error('Missing Dataverse connection info for Terms and Conditions of Service Animals create.')
    const response = await fetch(`${orgUrl()}/api/data/v9.2/${TERMS_AND_CONDITIONS_OF_SERVICE_ANIMALS_TABLE_ALIAS}`, {
      method: 'POST',
      credentials: 'include',
      headers: { Accept: 'application/json', 'Content-Type': 'application/json', 'OData-Version': '4.0', 'OData-MaxVersion': '4.0', Authorization: `Bearer ${token}`, Prefer: 'return=representation' },
      body: JSON.stringify(payload),
    })
    if (!response.ok) throw new Error(await response.text())
    const body = await response.json().catch(() => ({}))
    return { id: normalizeGuid(String(body?.[TERMS_AND_CONDITIONS_OF_SERVICE_ANIMALS_PRIMARY_ID_FIELD] || body?.id || '')), recordId }
  }

  const token = getAuthToken()
  const result = await runtimeDataClient.executeAsync<any, any>({
    connectorOperation: {
      tableName: 'commondataserviceforapps',
      operationName: 'CreateRecordWithOrganization',
      parameters: { prefer: 'return=representation', accept: 'application/json',  organization: orgUrl(), entityName: TERMS_AND_CONDITIONS_OF_SERVICE_ANIMALS_TABLE_ALIAS, item: payload, ...(token ? { token } : {}) },
    },
  } as any)
  if (!result?.success) throw new Error(String(result?.error?.message || result?.error || 'Terms and Conditions of Service Animals create failed.'))
  return { id: normalizeGuid(String(result?.data?.[TERMS_AND_CONDITIONS_OF_SERVICE_ANIMALS_PRIMARY_ID_FIELD] || result?.data?.id || '')), recordId }
}

export async function updateTermsAndConditionsOfServiceAnimalsResponse(rowId: string, values: TermsAndConditionsOfServiceAnimalsPayload): Promise<void> {
  const cleanId = normalizeGuid(rowId)
  if (!cleanId) throw new Error('Missing Terms and Conditions of Service Animals row id for update.')
  const payload = normalizePayload(values)
  // PATCH must explicitly clear dates; omitting a blank date preserves its old value.
  for (const field of TERMS_AND_CONDITIONS_OF_SERVICE_ANIMALS_FIELDS) {
    const value = (values as Record<string, unknown>)[field.field]
    if (['date', 'datetime'].includes(field.input) && Object.prototype.hasOwnProperty.call(values, field.field)
      && (value === null || (typeof value === 'string' && !value.trim()))) (payload as Record<string, unknown>)[field.field] = null
  }

  if (local()) {
    const token = await ensureAuthToken()
    if (!token) throw new Error('Missing Dataverse connection info for Terms and Conditions of Service Animals update.')
    const response = await fetch(`${orgUrl()}/api/data/v9.2/${TERMS_AND_CONDITIONS_OF_SERVICE_ANIMALS_TABLE_ALIAS}(${cleanId})`, {
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
      parameters: { organization: orgUrl(), entityName: TERMS_AND_CONDITIONS_OF_SERVICE_ANIMALS_TABLE_ALIAS, recordId: cleanId, item: payload, ...(token ? { token } : {}) },
    },
  } as any)
  if (!result?.success) throw new Error(String(result?.error?.message || result?.error || 'Terms and Conditions of Service Animals update failed.'))
}
