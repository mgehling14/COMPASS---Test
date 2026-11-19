import { getClient } from '@microsoft/power-apps/data'
import { dataSourcesInfo } from '../../.power/schemas/appschemas/dataSourcesInfo'
import { ensureAuthToken, getAuthToken } from './auth'

export const ANIMAL_AGREEMENT_TABLE_ALIAS = 'cmps_animalagreements'
export const ANIMAL_AGREEMENT_PRIMARY_ID_FIELD = 'cmps_animalagreementid'
const DEFAULT_DATAVERSE_ORG_URL = 'https://org1f466e4e.crm.dynamics.com'
const CLIENT_PROFILE_ENTITY_SET_NAME = 'cmps_clientprofiles'
const runtimeDataClient = getClient(dataSourcesInfo as any)

export const ANIMAL_COMPANION_OPTIONS = [
  'Pet Companion',
  'Emotional Support Animal (ESA)',
  'Service Animal',
] as const

const ANIMAL_COMPANION_VALUES: Record<(typeof ANIMAL_COMPANION_OPTIONS)[number], number> = {
  'Pet Companion': 125570000,
  'Emotional Support Animal (ESA)': 125570001,
  'Service Animal': 125570002,
}

export type AnimalAgreementField = {
  field: string
  label: string
  input: 'text' | 'date' | 'radio' | 'html' | 'readonly'
  options: string[]
  section: 'Main' | 'Signature'
  required?: boolean
}

export const ANIMAL_AGREEMENT_FIELDS: AnimalAgreementField[] = [
  { field: 'animal-companion-header', label: 'This agreement pertains to the following type of animal companion (please select one option below).', input: 'html', options: [], section: 'Main' },
  { field: 'cmps_recordid', label: 'Record ID', input: 'text', options: [], section: 'Main' },
  { field: 'cmps_cpid', label: 'Client Profile', input: 'readonly', options: [], section: 'Main' },
  { field: 'cmps_animalagreementcompletiondate', label: 'Animal Agreement Completion Date', input: 'date', options: [], section: 'Main', required: true },
  { field: 'cmps_typeofanimalcompanion', label: 'Type of Animal Companion', input: 'radio', options: [...ANIMAL_COMPANION_OPTIONS], section: 'Main' },
  { field: 'service-animal-note', label: 'Note        If the animal is a registered service animal, please also complete the Service Animal Contract.', input: 'html', options: [], section: 'Main' },
  { field: 'cmps_animalname', label: 'Animal Name', input: 'text', options: [], section: 'Main', required: true },
  { field: 'cmps_serviceprovidedifapplicable', label: 'Service Provided (If Applicable)', input: 'text', options: [], section: 'Main' },
  { field: 'signature-acknowledgment', label: 'By signing below, I hereby agree and understand that all electronic signatures are the equivalent of my manual/handwritten signature. This is to be used in conjunction wth the use of electronic signatures on all forms in this database with a signature requirement, should I elect to have signed electronically.      By signing I affirm I was involved in the creation and ongoing review of this document.', input: 'html', options: [], section: 'Signature' },
  { field: 'cmps_residentsignature', label: 'Resident Signature', input: 'text', options: [], section: 'Signature', required: true },
  { field: 'cmps_staffsignature', label: 'Staff Signature', input: 'text', options: [], section: 'Signature', required: true },
]

export type AnimalAgreementPayload = Partial<Record<string, string>>

function orgUrl(): string {
  return String(import.meta.env.VITE_DATAVERSE_ORG_URL || DEFAULT_DATAVERSE_ORG_URL).trim().replace(/\/$/, '')
}

function local(): boolean {
  return typeof window !== 'undefined' && ['localhost', '127.0.0.1'].includes(window.location.hostname)
}

function normalizeGuid(value: string): string {
  return String(value || '').trim().replace(/[{}]/g, '')
}

function normalizePayload(seed: AnimalAgreementPayload): Record<string, unknown> {
  const payload: Record<string, unknown> = { ...seed }
  const clientProfileId = String(payload.cmps_cpid || '').trim().replace(/[{}]/g, '')
  if (clientProfileId) {
    delete payload.cmps_cpid
    payload['cmps_cpid@odata.bind'] = `/${CLIENT_PROFILE_ENTITY_SET_NAME}(${clientProfileId})`
  }
  const choiceField = 'cmps_typeofanimalcompanion'
  const selectedChoice = String(payload[choiceField] || '').trim()

  if (selectedChoice) {
    if (/^12557000[0-2]$/.test(selectedChoice)) {
      payload[choiceField] = Number(selectedChoice)
    } else {
      const option = ANIMAL_COMPANION_OPTIONS.find((value) => value.toLowerCase() === selectedChoice.toLowerCase())
      if (!option) throw new Error('Invalid choice for Type of Animal Companion.')
      payload[choiceField] = ANIMAL_COMPANION_VALUES[option]
    }
  } else {
    delete payload[choiceField]
  }

  for (const [field, value] of Object.entries(payload)) {
    if (typeof value === 'string' && !value.trim()) delete payload[field]
  }

  return payload
}

export function generateAnimalAgreementRecordId(): string {
  return `AA-${new Date().toISOString().replace(/[-:T]/g, '').slice(0, 15)}`
}

export async function createAnimalAgreementResponse(seed: AnimalAgreementPayload): Promise<{ id: string; recordId: string }> {
  const recordId = String(seed.cmps_recordid || '').trim().replace(/\.+$/, '') || generateAnimalAgreementRecordId()
  const payload = normalizePayload({ ...seed, cmps_recordid: recordId })

  if (local()) {
    const token = await ensureAuthToken()
    if (!token) throw new Error('Missing Dataverse connection info for Animal Agreement create.')
    const response = await fetch(`${orgUrl()}/api/data/v9.2/${ANIMAL_AGREEMENT_TABLE_ALIAS}`, {
      method: 'POST',
      credentials: 'include',
      headers: { Accept: 'application/json', 'Content-Type': 'application/json', 'OData-Version': '4.0', 'OData-MaxVersion': '4.0', Authorization: `Bearer ${token}`, Prefer: 'return=representation' },
      body: JSON.stringify(payload),
    })
    if (!response.ok) throw new Error(await response.text())
    const body = await response.json().catch(() => ({}))
    return { id: normalizeGuid(String(body?.[ANIMAL_AGREEMENT_PRIMARY_ID_FIELD] || body?.id || '')), recordId }
  }

  const token = getAuthToken()
  const result = await runtimeDataClient.executeAsync<any, any>({ connectorOperation: { tableName: 'commondataserviceforapps', operationName: 'CreateRecordWithOrganization', parameters: { prefer: 'return=representation', accept: 'application/json',  organization: orgUrl(), entityName: ANIMAL_AGREEMENT_TABLE_ALIAS, item: payload, ...(token ? { token } : {}) } } } as any)
  if (!result?.success) throw new Error(String(result?.error?.message || result?.error || 'Animal Agreement create failed.'))
  return { id: normalizeGuid(String(result?.data?.[ANIMAL_AGREEMENT_PRIMARY_ID_FIELD] || result?.data?.id || '')), recordId }
}

export async function updateAnimalAgreementResponse(rowId: string, values: AnimalAgreementPayload): Promise<void> {
  const cleanId = normalizeGuid(rowId)
  if (!cleanId) throw new Error('Missing Animal Agreement row id for update.')
  const payload = normalizePayload(values)
  // PATCH must explicitly clear dates; omitting a blank date preserves its old value.
  for (const field of ANIMAL_AGREEMENT_FIELDS) {
    const value = (values as Record<string, unknown>)[field.field]
    if (['date', 'datetime'].includes(field.input) && Object.prototype.hasOwnProperty.call(values, field.field)
      && (value === null || (typeof value === 'string' && !value.trim()))) (payload as Record<string, unknown>)[field.field] = null
  }

  if (local()) {
    const token = await ensureAuthToken()
    if (!token) throw new Error('Missing Dataverse connection info for Animal Agreement update.')
    const response = await fetch(`${orgUrl()}/api/data/v9.2/${ANIMAL_AGREEMENT_TABLE_ALIAS}(${cleanId})`, {
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
      parameters: {
        organization: orgUrl(),
        entityName: ANIMAL_AGREEMENT_TABLE_ALIAS,
        recordId: cleanId,
        item: payload,
        ...(token ? { token } : {}),
      },
    },
  } as any)
  if (!result?.success) throw new Error(String(result?.error?.message || result?.error || 'Animal Agreement update failed.'))
}
