import { getClient } from '@microsoft/power-apps/data'
import { dataSourcesInfo } from '../../.power/schemas/appschemas/dataSourcesInfo'
import { ensureAuthToken, getAuthToken } from './auth'

export const PERSON_YOU_ARE_FLEEING_PROFILES_TABLE_ALIAS = 'cmps_personyouarefleeingprofiles'
export const PERSON_YOU_ARE_FLEEING_PROFILES_PRIMARY_ID_FIELD = 'cmps_personyouarefleeingprofileid'
const DEFAULT_DATAVERSE_ORG_URL = 'https://org1f466e4e.crm.dynamics.com'
const OPTION_SET_BASE_VALUE = 125570000
const CLIENT_PROFILE_ENTITY_SET_NAME = 'cmps_clientprofiles'
const runtimeDataClient = getClient(dataSourcesInfo as any)

export type PersonYouAreFleeingProfileField = {
  field: string
  label: string
  input: 'readonly' | 'lookup' | 'date' | 'number' | 'text' | 'phone' | 'textarea' | 'select' | 'radio' | 'html' | 'file'
  options: string[]
  section: 'Main' | 'Vehicle Details' | 'Additional History/Background Details'
  required?: boolean
}

export const PERSON_FLEEING_RACE_ETHNICITY_OPTIONS = [
  'White/Caucasian',
  'Black/African American',
  'Arab',
  'Asian',
  'Native American/Alaskan Native',
  'Native Hawaiian/Pacific Islander',
  'Hispanic/Latino',
  'Do Not Know',
  'Other',
]

export const PERSON_FLEEING_HAIR_COLOR_OPTIONS = [
  'Black',
  'Brown',
  'Blond/Yellow',
  'White',
  'Gray/Silver',
  'Red',
  'Bald/No Hair',
  'Orange',
  'Blue',
  'Pink',
  'Purple',
  'Green',
]

export const PERSON_FLEEING_EYE_COLOR_OPTIONS = ['Black', 'Brown', 'Hazel/Amber', 'Blue', 'Green', 'Gray', 'Red']

export const PERSON_YOU_ARE_FLEEING_PROFILE_FIELDS: PersonYouAreFleeingProfileField[] = [
  { field: 'cmps_recordid', label: 'Record ID', input: 'readonly', options: [], section: 'Main' },
  { field: 'cmps_cpid', label: 'Client Profile', input: 'lookup', options: [], section: 'Main' },
  { field: 'cmps_profilecompletiondate', label: 'Profile Completion Date', input: 'date', options: [], section: 'Main', required: true },
  { field: 'person-fleeing-demographic-header', label: 'Demographic Details', input: 'html', options: [], section: 'Main' },
  { field: 'cmps_fullnameofpersonyouarefleeing', label: 'Full Name of Person You Are Fleeing', input: 'text', options: [], section: 'Main', required: true },
  { field: 'cmps_aliasornicknameused', label: 'Alias or Nickname Used', input: 'text', options: [], section: 'Main' },
  { field: 'cmps_lastknownaddress', label: 'Last Known Address', input: 'text', options: [], section: 'Main' },
  { field: 'cmps_phonenumber', label: 'Phone Number', input: 'phone', options: [], section: 'Main' },
  { field: 'cmps_dateofbirth', label: 'Date of Birth', input: 'date', options: [], section: 'Main' },
  { field: 'cmps_age', label: 'Age', input: 'number', options: [], section: 'Main' },
  { field: 'cmps_raceethnicity', label: 'Race/Ethnicity', input: 'select', options: PERSON_FLEEING_RACE_ETHNICITY_OPTIONS, section: 'Main' },
  { field: 'cmps_height', label: 'Height', input: 'text', options: [], section: 'Main' },
  { field: 'cmps_weight', label: 'Weight', input: 'text', options: [], section: 'Main' },
  { field: 'cmps_haircolor', label: 'Hair Color', input: 'select', options: PERSON_FLEEING_HAIR_COLOR_OPTIONS, section: 'Main' },
  { field: 'cmps_eyecolor', label: 'Eye Color', input: 'select', options: PERSON_FLEEING_EYE_COLOR_OPTIONS, section: 'Main' },
  { field: 'cmps_facialhairpleasedescribe', label: 'Facial Hair — Please Describe', input: 'text', options: [], section: 'Main' },
  { field: 'cmps_relationshipduringtheabuse', label: 'Relationship During the Abuse', input: 'text', options: [], section: 'Main' },
  { field: 'cmps_relationshiptochildrenwithyouinshelter', label: 'Relationship to Children with You in Shelter', input: 'text', options: [], section: 'Main' },
  { field: 'cmps_wherearetheyemployed', label: 'Where Are They Employed?', input: 'text', options: [], section: 'Main' },
  { field: 'cmps_wheredotheyhangoutfrequent', label: 'Where Do They Hang Out/Frequent?', input: 'text', options: [], section: 'Main' },
  { field: 'cmps_vehiclemake', label: 'Vehicle Make', input: 'text', options: [], section: 'Vehicle Details' },
  { field: 'cmps_vehiclemodel', label: 'Vehicle Model', input: 'text', options: [], section: 'Vehicle Details' },
  { field: 'cmps_vehiclecolor', label: 'Vehicle Color', input: 'text', options: [], section: 'Vehicle Details' },
  { field: 'cmps_yearcar', label: 'Year (car)', input: 'text', options: [], section: 'Vehicle Details' },
  { field: 'cmps_licenseplatenumber', label: 'License Plate Number', input: 'text', options: [], section: 'Vehicle Details' },
  { field: 'cmps_dotheyhaveanydistinguishingmarks', label: 'Do They Have Any Distinguishing Marks?', input: 'text', options: [], section: 'Additional History/Background Details' },
  { field: 'cmps_dotheyhaveahistoryofdrugabuse', label: 'Do They Have a History of Drug Abuse?', input: 'text', options: [], section: 'Additional History/Background Details' },
  { field: 'cmps_dotheyhaveanyweapons', label: 'Do They Have Any Weapons?', input: 'text', options: [], section: 'Additional History/Background Details' },
  { field: 'cmps_aretheystalkingyou', label: 'Are They Stalking You?', input: 'text', options: [], section: 'Additional History/Background Details' },
  { field: 'cmps_additionalinformationyouwanttoshare', label: 'Additional Information You Want to Share', input: 'textarea', options: [], section: 'Additional History/Background Details' },
  { field: 'cmps_doyoucurrentlyhaveanoop', label: 'Do You Currently Have an OOP?', input: 'radio', options: ['Yes', 'No'], section: 'Additional History/Background Details', required: true },
  { field: 'person-fleeing-oop-header', label: 'If you have a current Order of Protection or Injunction Against Harassment, or if you obtain such while in shelter, you will provide the shelter with a copy', input: 'html', options: [], section: 'Additional History/Background Details' },
  { field: 'cmps_fileid1', label: 'Photo', input: 'file', options: [], section: 'Additional History/Background Details' },
]

export type PersonYouAreFleeingProfilePayload = Partial<Record<string, string>>

const CHOICE_FIELDS = PERSON_YOU_ARE_FLEEING_PROFILE_FIELDS.filter((field) => field.input === 'select' || field.input === 'radio')

function orgUrl(): string {
  return String(import.meta.env.VITE_DATAVERSE_ORG_URL || DEFAULT_DATAVERSE_ORG_URL).trim().replace(/\/$/, '')
}

function local(): boolean {
  return typeof window !== 'undefined' && ['localhost', '127.0.0.1'].includes(window.location.hostname)
}

function normalizeGuid(value: string): string {
  return String(value || '').trim().replace(/[{}]/g, '')
}

function calculateAge(dateOfBirth: unknown): string {
  const match = String(dateOfBirth || '').trim().match(/^(\d{4})-(\d{2})-(\d{2})/)
  if (!match) return ''
  const birthYear = Number(match[1])
  const birthMonth = Number(match[2])
  const birthDay = Number(match[3])
  const today = new Date()
  let age = today.getFullYear() - birthYear
  if (today.getMonth() + 1 < birthMonth || (today.getMonth() + 1 === birthMonth && today.getDate() < birthDay)) age -= 1
  return age >= 0 ? String(age) : ''
}

function normalizePayload(seed: PersonYouAreFleeingProfilePayload): Record<string, unknown> {
  const payload: Record<string, unknown> = { ...seed }
  // Do not submit the retired column from an older draft.
  delete payload.cmps_doyucurrentlyhaveanoop
  const clientId = normalizeGuid(String(payload.cmps_cpid || ''))
  delete payload.cmps_cpid
  if (clientId) payload['cmps_cpid@odata.bind'] = `/${CLIENT_PROFILE_ENTITY_SET_NAME}(${clientId})`
  const calculatedAge = calculateAge(payload.cmps_dateofbirth)
  if (calculatedAge) payload.cmps_age = calculatedAge
  const fileId = normalizeGuid(String(payload.cmps_fileid1 || ''))
  delete payload.cmps_fileid1
  if (fileId) payload['cmps_fileid1@odata.bind'] = `/cmps_compassfileses(${fileId})`

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

  const age = String(payload.cmps_age || '').trim()
  if (age) {
    const numericAge = Number(age)
    if (!Number.isInteger(numericAge) || numericAge < 0) throw new Error('Age must be a non-negative whole number.')
    payload.cmps_age = numericAge
  } else {
    delete payload.cmps_age
  }

  for (const [field, value] of Object.entries(payload)) {
    if (typeof value === 'string' && !value.trim()) delete payload[field]
  }

  return payload
}

export function generatePersonYouAreFleeingProfileRecordId(): string {
  return `PYFP-${new Date().toISOString().replace(/[-:T]/g, '').slice(0, 15)}`
}

export async function createPersonYouAreFleeingProfileResponse(seed: PersonYouAreFleeingProfilePayload): Promise<{ id: string; recordId: string }> {
  const recordId = String(seed.cmps_recordid || '').trim().replace(/\.+$/, '') || generatePersonYouAreFleeingProfileRecordId()
  const payload = normalizePayload({ ...seed, cmps_recordid: recordId })

  if (local()) {
    const token = await ensureAuthToken()
    if (!token) throw new Error('Missing Dataverse connection info for Person You Are Fleeing Profile create.')
    const response = await fetch(`${orgUrl()}/api/data/v9.2/${PERSON_YOU_ARE_FLEEING_PROFILES_TABLE_ALIAS}`, {
      method: 'POST',
      credentials: 'include',
      headers: { Accept: 'application/json', 'Content-Type': 'application/json', 'OData-Version': '4.0', 'OData-MaxVersion': '4.0', Authorization: `Bearer ${token}`, Prefer: 'return=representation' },
      body: JSON.stringify(payload),
    })
    if (!response.ok) throw new Error(await response.text())
    const body = await response.json().catch(() => ({}))
    return { id: normalizeGuid(String(body?.[PERSON_YOU_ARE_FLEEING_PROFILES_PRIMARY_ID_FIELD] || body?.id || '')), recordId }
  }

  const token = getAuthToken()
  const result = await runtimeDataClient.executeAsync<any, any>({
    connectorOperation: {
      tableName: 'commondataserviceforapps',
      operationName: 'CreateRecordWithOrganization',
      parameters: { organization: orgUrl(), entityName: PERSON_YOU_ARE_FLEEING_PROFILES_TABLE_ALIAS, item: payload, prefer: 'return=representation', accept: 'application/json', ...(token ? { token } : {}) },
    },
  } as any)
  if (!result?.success) throw new Error(String(result?.error?.message || result?.error || 'Person You Are Fleeing Profile create failed.'))
  return { id: normalizeGuid(String(result?.data?.[PERSON_YOU_ARE_FLEEING_PROFILES_PRIMARY_ID_FIELD] || result?.data?.id || '')), recordId }
}

export async function updatePersonYouAreFleeingProfileResponse(rowId: string, values: PersonYouAreFleeingProfilePayload): Promise<void> {
  const cleanId = normalizeGuid(rowId)
  if (!cleanId) throw new Error('Missing Person You Are Fleeing Profile row id for update.')
  const payload = normalizePayload(values)
  // PATCH must explicitly clear dates; omitting a blank date preserves its old value.
  for (const field of PERSON_YOU_ARE_FLEEING_PROFILE_FIELDS) {
    const value = (values as Record<string, unknown>)[field.field]
    if (['date', 'datetime'].includes(field.input) && Object.prototype.hasOwnProperty.call(values, field.field)
      && (value === null || (typeof value === 'string' && !value.trim()))) (payload as Record<string, unknown>)[field.field] = null
  }

  if (local()) {
    const token = await ensureAuthToken()
    if (!token) throw new Error('Missing Dataverse connection info for Person You Are Fleeing Profile update.')
    const response = await fetch(`${orgUrl()}/api/data/v9.2/${PERSON_YOU_ARE_FLEEING_PROFILES_TABLE_ALIAS}(${cleanId})`, {
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
      parameters: { organization: orgUrl(), entityName: PERSON_YOU_ARE_FLEEING_PROFILES_TABLE_ALIAS, recordId: cleanId, item: payload, prefer: 'return=minimal', accept: 'application/json', ...(token ? { token } : {}) },
    },
  } as any)
  if (!result?.success) throw new Error(String(result?.error?.message || result?.error || 'Person You Are Fleeing Profile update failed.'))
}
