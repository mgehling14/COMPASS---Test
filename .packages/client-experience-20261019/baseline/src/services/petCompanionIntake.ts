import { getClient } from '@microsoft/power-apps/data'
import { dataSourcesInfo } from '../../.power/schemas/appschemas/dataSourcesInfo'
import { ensureAuthToken, getAuthToken } from './auth'

export const PET_COMPANION_INTAKES_TABLE_ALIAS = 'cmps_petcompanionintakes'
export const PET_COMPANION_INTAKES_PRIMARY_ID_FIELD = 'cmps_petcompanionintakeid'
const DEFAULT_DATAVERSE_ORG_URL = 'https://org1f466e4e.crm.dynamics.com'
const OPTION_SET_BASE_VALUE = 125570000
const CLIENT_PROFILE_ENTITY_SET_NAME = 'cmps_clientprofiles'
const runtimeDataClient = getClient(dataSourcesInfo as any)

export type PetCompanionIntakeField = {
  field: string
  label: string
  input: 'readonly' | 'lookup' | 'date' | 'text' | 'textarea' | 'number' | 'radio' | 'html' | 'medications'
  options: string[]
  section: 'Animal Demographics' | 'Animal Background Information' | 'Signature'
  required?: boolean
  visibleWhen?: { field: string; values: string[] }
}

const YES_NO_OPTIONS = ['Yes', 'No']

export const PET_COMPANION_INTAKE_FIELDS: PetCompanionIntakeField[] = [
  { field: 'cmps_recordid', label: 'Record ID', input: 'readonly', options: [], section: 'Animal Demographics' },
  { field: 'cmps_cpid', label: 'Client Profile', input: 'lookup', options: [], section: 'Animal Demographics' },
  { field: 'cmps_intakecompletiondate', label: 'Intake Completion Date', input: 'date', options: [], section: 'Animal Demographics', required: true },
  { field: 'cmps_animalname', label: 'Animal Name', input: 'text', options: [], section: 'Animal Demographics', required: true },
  { field: 'cmps_pettype', label: 'Pet Type', input: 'radio', options: ['Dog', 'Cat', 'Other'], section: 'Animal Demographics', required: true },
  { field: 'cmps_pettypeother', label: 'Pet Type - Other', input: 'text', options: [], section: 'Animal Demographics', visibleWhen: { field: 'cmps_pettype', values: ['Other'] } },
  { field: 'cmps_typeofanimalcompanion', label: 'Type of Animal Companion', input: 'radio', options: ['Pet Companion', 'Emotional Support Animal (ESA)', 'Service Animal'], section: 'Animal Demographics', required: true },
  { field: 'cmps_serviceprovided', label: 'Service Provided (if applicable)', input: 'text', options: [], section: 'Animal Demographics' },
  { field: 'cmps_approximateage', label: 'Approximate Age', input: 'text', options: [], section: 'Animal Demographics' },
  { field: 'cmps_breed', label: 'Breed', input: 'text', options: [], section: 'Animal Demographics' },
  { field: 'cmps_description', label: 'Description', input: 'text', options: [], section: 'Animal Demographics' },
  { field: 'cmps_approximateweight', label: 'Approximate Weight (lbs)', input: 'number', options: [], section: 'Animal Demographics' },
  { field: 'cmps_approximatesize', label: 'Approximate Size', input: 'text', options: [], section: 'Animal Demographics' },
  { field: 'cmps_hastheanimalexperiencedanyabuse', label: 'Has the Animal Experienced Any Abuse?', input: 'radio', options: YES_NO_OPTIONS, section: 'Animal Background Information', required: true },
  { field: 'cmps_pleasedescribe', label: 'Please Describe', input: 'textarea', options: [], section: 'Animal Background Information', visibleWhen: { field: 'cmps_hastheanimalexperiencedanyabuse', values: ['Yes'] } },
  { field: 'cmps_hastheanimalhadanyinjuriesasaresultoftheabuse', label: 'Has the animal had any injuries as a result of the abuse or other injuries?', input: 'radio', options: YES_NO_OPTIONS, section: 'Animal Background Information', required: true },
  { field: 'cmps_pleasedescribetheinjuries', label: 'Please Describe the Injuries', input: 'textarea', options: [], section: 'Animal Background Information', visibleWhen: { field: 'cmps_hastheanimalhadanyinjuriesasaresultoftheabuse', values: ['Yes'] } },
  { field: 'cmps_hasthepethadallrequiredvaccinations', label: 'Has the Pet Had All Required Vaccinations?', input: 'radio', options: YES_NO_OPTIONS, section: 'Animal Background Information', required: true },
  { field: 'cmps_ifyespleaselistvaccinationsreceivedandwhen', label: 'If Yes, Please List Vaccinations Received and When', input: 'textarea', options: [], section: 'Animal Background Information', visibleWhen: { field: 'cmps_hasthepethadallrequiredvaccinations', values: ['Yes'] } },
  { field: 'pet-vaccination-note', label: "NOTE    Please provide documentation on the animal's vaccinations.      Require vaccinations may include DHLPP (distemper, hepatitis, leptospirosis, parvo, and parainfluenza), rabies, and/or FIV and FeLV.", input: 'html', options: [], section: 'Animal Background Information' },
  { field: 'cmps_doestheanimalhaveahistoryofaggressiontowardhu', label: 'Does the animal have a history of aggression toward humans or other animals?', input: 'radio', options: YES_NO_OPTIONS, section: 'Animal Background Information', required: true },
  { field: 'cmps_ifyespleasedescribetheaggression', label: 'If Yes, Please Describe the Aggression', input: 'textarea', options: [], section: 'Animal Background Information', visibleWhen: { field: 'cmps_doestheanimalhaveahistoryofaggressiontowardhu', values: ['Yes'] } },
  { field: 'cmps_doestheanimalhaveanyhealthconditionsthatstaff', label: 'Does the animal have any health conditions that staff should be aware of?', input: 'radio', options: YES_NO_OPTIONS, section: 'Animal Background Information', required: true },
  { field: 'cmps_ifyespleaselistthehealthconditions', label: 'If Yes, Please List the Health Conditions', input: 'textarea', options: [], section: 'Animal Background Information', visibleWhen: { field: 'cmps_doestheanimalhaveanyhealthconditionsthatstaff', values: ['Yes'] } },
  { field: 'cmps_istheanimalcurrentlyonanymedications', label: 'Is the Animal Currently on Any Medications?', input: 'radio', options: YES_NO_OPTIONS, section: 'Animal Background Information', required: true },
  { field: 'pet-medication-note', label: "NOTE         All medications brought on site will need to be photocopied by staff. All medications must be in the animal's name or the animal guardian's name to be able to be kept on site.", input: 'html', options: [], section: 'Animal Background Information', visibleWhen: { field: 'cmps_istheanimalcurrentlyonanymedications', values: ['Yes'] } },
  { field: 'cmps_numberofmedicationstolist', label: 'Number of Medications to List', input: 'number', options: [], section: 'Animal Background Information', visibleWhen: { field: 'cmps_istheanimalcurrentlyonanymedications', values: ['Yes'] } },
  { field: 'pet-medications', label: 'Medications', input: 'medications', options: [], section: 'Animal Background Information', visibleWhen: { field: 'cmps_istheanimalcurrentlyonanymedications', values: ['Yes'] } },
  { field: 'pet-signature-header', label: 'E-Signature Disclaimer/Notice       By signing below, I hereby agree and understand that all electronic signatures are the equivalent of my manual/handwritten signature. This is to be used in conjuction with the use of electronic signatures on all forms in this database with a signature requirement, should I elect to have signed electronically. By signing I affirm I was involved in the creation and ongoing review of this document.', input: 'html', options: [], section: 'Signature' },
  { field: 'cmps_residentpetparentsignature', label: 'Resident/Pet Parent Signature', input: 'text', options: [], section: 'Signature', required: true },
  { field: 'cmps_staffsignature', label: 'Staff Signature', input: 'text', options: [], section: 'Signature', required: true },
]

export type PetCompanionIntakePayload = Partial<Record<string, string>>

const CHOICE_FIELDS = PET_COMPANION_INTAKE_FIELDS.filter((field) => field.input === 'radio')
const MEDICATION_COLUMNS = ['cmps_medications', 'cmps_reasons', 'cmps_dosages', 'cmps_frequencies']

function orgUrl(): string {
  return String(import.meta.env.VITE_DATAVERSE_ORG_URL || DEFAULT_DATAVERSE_ORG_URL).trim().replace(/\/$/, '')
}

function local(): boolean {
  return typeof window !== 'undefined' && ['localhost', '127.0.0.1'].includes(window.location.hostname)
}

function normalizeGuid(value: string): string {
  return String(value || '').trim().replace(/[{}]/g, '')
}

function normalizedChoice(value: unknown, options: string[]): string {
  const text = String(value || '').trim()
  if (!text) return ''
  const numericValue = Number(text)
  if (Number.isInteger(numericValue)) return options[numericValue - OPTION_SET_BASE_VALUE] || text
  return options.find((option) => option.toLowerCase() === text.toLowerCase()) || text
}

function normalizePayload(seed: PetCompanionIntakePayload): Record<string, unknown> {
  const payload: Record<string, unknown> = { ...seed }
  // The retired misspelling must never be sent to Dataverse.
  delete payload.cmps_doseages
  const clientId = normalizeGuid(String(payload.cmps_cpid || ''))
  delete payload.cmps_cpid
  if (clientId) payload['cmps_cpid@odata.bind'] = `/${CLIENT_PROFILE_ENTITY_SET_NAME}(${clientId})`
  const petType = normalizedChoice(payload.cmps_pettype, ['Dog', 'Cat', 'Other'])
  if (petType !== 'Other') delete payload.cmps_pettypeother

  const conditionalFields: Array<[string, string]> = [
    ['cmps_hastheanimalexperiencedanyabuse', 'cmps_pleasedescribe'],
    ['cmps_hastheanimalhadanyinjuriesasaresultoftheabuse', 'cmps_pleasedescribetheinjuries'],
    ['cmps_hasthepethadallrequiredvaccinations', 'cmps_ifyespleaselistvaccinationsreceivedandwhen'],
    ['cmps_doestheanimalhaveahistoryofaggressiontowardhu', 'cmps_ifyespleasedescribetheaggression'],
    ['cmps_doestheanimalhaveanyhealthconditionsthatstaff', 'cmps_ifyespleaselistthehealthconditions'],
  ]
  for (const [choiceField, detailField] of conditionalFields) {
    if (normalizedChoice(payload[choiceField], YES_NO_OPTIONS) !== 'Yes') delete payload[detailField]
  }

  const hasMedications = normalizedChoice(payload.cmps_istheanimalcurrentlyonanymedications, YES_NO_OPTIONS) === 'Yes'
  if (!hasMedications) {
    delete payload.cmps_numberofmedicationstolist
    for (const field of MEDICATION_COLUMNS) delete payload[field]
  }

  for (const field of CHOICE_FIELDS) {
    const rawValue = String(payload[field.field] || '').trim()
    if (!rawValue) {
      delete payload[field.field]
      continue
    }
    const numericValue = Number(rawValue)
    if (Number.isInteger(numericValue) && numericValue >= OPTION_SET_BASE_VALUE && numericValue < OPTION_SET_BASE_VALUE + field.options.length) {
      payload[field.field] = numericValue
      continue
    }
    const index = field.options.findIndex((option) => option.toLowerCase() === rawValue.toLowerCase())
    if (index < 0) throw new Error(`Invalid choice for ${field.label}.`)
    payload[field.field] = OPTION_SET_BASE_VALUE + index
  }

  for (const field of ['cmps_approximateweight', 'cmps_numberofmedicationstolist']) {
    const value = String(payload[field] || '').trim()
    if (!value) {
      delete payload[field]
      continue
    }
    const numericValue = Number(value)
    if (!Number.isFinite(numericValue) || numericValue < 0) throw new Error(`${field === 'cmps_approximateweight' ? 'Approximate Weight' : 'Number of Medications to List'} must be a valid non-negative number.`)
    if (field === 'cmps_numberofmedicationstolist' && (!Number.isInteger(numericValue) || numericValue > 10)) throw new Error('Number of Medications to List must be a whole number from 0 through 10.')
    payload[field] = numericValue
  }

  for (const [field, value] of Object.entries(payload)) {
    if (typeof value === 'string' && !value.trim()) delete payload[field]
  }
  return payload
}

export function generatePetCompanionIntakeRecordId(): string {
  return `PCI-${new Date().toISOString().replace(/[-:T]/g, '').slice(0, 15)}`
}

export async function createPetCompanionIntakeResponse(seed: PetCompanionIntakePayload): Promise<{ id: string; recordId: string }> {
  const recordId = String(seed.cmps_recordid || '').trim().replace(/\.+$/, '') || generatePetCompanionIntakeRecordId()
  const payload = normalizePayload({ ...seed, cmps_recordid: recordId })

  if (local()) {
    const token = await ensureAuthToken()
    if (!token) throw new Error('Missing Dataverse connection info for Pet Companion Intake create.')
    const response = await fetch(`${orgUrl()}/api/data/v9.2/${PET_COMPANION_INTAKES_TABLE_ALIAS}`, {
      method: 'POST', credentials: 'include',
      headers: { Accept: 'application/json', 'Content-Type': 'application/json', 'OData-Version': '4.0', 'OData-MaxVersion': '4.0', Authorization: `Bearer ${token}`, Prefer: 'return=representation' },
      body: JSON.stringify(payload),
    })
    if (!response.ok) throw new Error(await response.text())
    const body = await response.json().catch(() => ({}))
    return { id: normalizeGuid(String(body?.[PET_COMPANION_INTAKES_PRIMARY_ID_FIELD] || body?.id || '')), recordId }
  }

  const token = getAuthToken()
  const result = await runtimeDataClient.executeAsync<any, any>({ connectorOperation: { tableName: 'commondataserviceforapps', operationName: 'CreateRecordWithOrganization', parameters: { organization: orgUrl(), entityName: PET_COMPANION_INTAKES_TABLE_ALIAS, item: payload, prefer: 'return=representation', accept: 'application/json', ...(token ? { token } : {}) } } } as any)
  if (!result?.success) throw new Error(String(result?.error?.message || result?.error || 'Pet Companion Intake create failed.'))
  return { id: normalizeGuid(String(result?.data?.[PET_COMPANION_INTAKES_PRIMARY_ID_FIELD] || result?.data?.id || '')), recordId }
}

export async function updatePetCompanionIntakeResponse(rowId: string, values: PetCompanionIntakePayload): Promise<void> {
  const cleanId = normalizeGuid(rowId)
  if (!cleanId) throw new Error('Missing Pet Companion Intake row id for update.')
  const payload = normalizePayload(values)
  // PATCH must explicitly clear dates; omitting a blank date preserves its old value.
  for (const field of PET_COMPANION_INTAKE_FIELDS) {
    const value = (values as Record<string, unknown>)[field.field]
    if (['date', 'datetime'].includes(field.input) && Object.prototype.hasOwnProperty.call(values, field.field)
      && (value === null || (typeof value === 'string' && !value.trim()))) (payload as Record<string, unknown>)[field.field] = null
  }

  if (local()) {
    const token = await ensureAuthToken()
    if (!token) throw new Error('Missing Dataverse connection info for Pet Companion Intake update.')
    const response = await fetch(`${orgUrl()}/api/data/v9.2/${PET_COMPANION_INTAKES_TABLE_ALIAS}(${cleanId})`, {
      method: 'PATCH', credentials: 'include',
      headers: { Accept: 'application/json', 'Content-Type': 'application/json', 'OData-Version': '4.0', 'OData-MaxVersion': '4.0', Authorization: `Bearer ${token}` },
      body: JSON.stringify(payload),
    })
    if (!response.ok) throw new Error(await response.text())
    return
  }

  const token = getAuthToken()
  const result = await runtimeDataClient.executeAsync<any, any>({ connectorOperation: { tableName: 'commondataserviceforapps', operationName: 'UpdateRecordWithOrganization', parameters: { organization: orgUrl(), entityName: PET_COMPANION_INTAKES_TABLE_ALIAS, recordId: cleanId, item: payload, prefer: 'return=minimal', accept: 'application/json', ...(token ? { token } : {}) } } } as any)
  if (!result?.success) throw new Error(String(result?.error?.message || result?.error || 'Pet Companion Intake update failed.'))
}
