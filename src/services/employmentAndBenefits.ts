import { getClient } from '@microsoft/power-apps/data'
import { dataSourcesInfo } from '../../.power/schemas/appschemas/dataSourcesInfo'
import { ensureAuthToken, getAuthToken } from './auth'

export const EMPLOYMENT_AND_BENEFITS_TABLE_ALIAS = 'cmps_employmentandbenefitses'
export const EMPLOYMENT_AND_BENEFITS_PRIMARY_ID_FIELD = 'cmps_employmentandbenefitsid'
const DEFAULT_DATAVERSE_ORG_URL = 'https://org1f466e4e.crm.dynamics.com'
const OPTION_SET_BASE_VALUE = 125570000
const CLIENT_PROFILE_ENTITY_SET_NAME = 'cmps_clientprofiles'
const runtimeDataClient = getClient(dataSourcesInfo as any)

export type EmploymentAndBenefitsField = {
  field: string
  label: string
  input: 'readonly' | 'lookup' | 'date' | 'radio' | 'checkbox-group' | 'currency' | 'number' | 'textarea'
  options: string[]
  section: 'Main' | 'Benefits'
  required?: boolean
  visibleWhen?: { field: string; values: string[] }
}

export const CLIENT_TYPE_OPTIONS = ['Adult', 'Child']
export const YES_NO_OPTIONS = ['Yes', 'No']
export const PUBLIC_ASSISTANCE_TYPE_OPTIONS = ['WIC', 'Low Income Housing', 'SSI', 'SSDI', 'Cash Assistance', 'Food Stamps', 'AHCCCS', 'CHIP']

export const EMPLOYMENT_AND_BENEFITS_FIELDS: EmploymentAndBenefitsField[] = [
  { field: 'cmps_recordid', label: 'Record ID', input: 'readonly', options: [], section: 'Main' },
  { field: 'cmps_cpid', label: 'Client Profile', input: 'lookup', options: [], section: 'Main' },
  { field: 'cmps_date', label: 'Date', input: 'date', options: [], section: 'Main', required: true },
  { field: 'cmps_clienttype1', label: 'Client Type', input: 'radio', options: CLIENT_TYPE_OPTIONS, section: 'Main' },
  { field: 'cmps_areyoureceivingpublicassistance', label: 'Are You Receiving Public Assistance?', input: 'radio', options: YES_NO_OPTIONS, section: 'Benefits', required: true },
  { field: 'cmps_publicassistancetype1', label: 'Public Assistance Type', input: 'checkbox-group', options: PUBLIC_ASSISTANCE_TYPE_OPTIONS, section: 'Benefits', visibleWhen: { field: 'cmps_areyoureceivingpublicassistance', values: ['Yes'] } },
  { field: 'cmps_ssiamount', label: 'SSI Amount', input: 'currency', options: [], section: 'Benefits', visibleWhen: { field: 'cmps_publicassistancetype1', values: ['SSI'] } },
  { field: 'cmps_ssdiamount', label: 'SSDI Amount', input: 'currency', options: [], section: 'Benefits', visibleWhen: { field: 'cmps_publicassistancetype1', values: ['SSDI'] } },
  { field: 'cmps_cashassistanceamount', label: 'Cash Assistance Amount', input: 'currency', options: [], section: 'Benefits', visibleWhen: { field: 'cmps_publicassistancetype1', values: ['Cash Assistance'] } },
  { field: 'cmps_foodstampsamount', label: 'Food Stamps Amount', input: 'currency', options: [], section: 'Benefits', visibleWhen: { field: 'cmps_publicassistancetype1', values: ['Food Stamps'] } },
  { field: 'cmps_foodstampsdayreceived', label: 'Food Stamps Day Received', input: 'number', options: [], section: 'Benefits', visibleWhen: { field: 'cmps_publicassistancetype1', values: ['Food Stamps'] } },
  { field: 'cmps_areyoucurrentlyemployed', label: 'Are You Currently Employed?', input: 'radio', options: YES_NO_OPTIONS, section: 'Benefits', visibleWhen: { field: 'cmps_clienttype1', values: ['Adult'] } },
  { field: 'cmps_howmanyhoursdoyouworkeachweek', label: 'How Many Hours Do You Work Each Week?', input: 'textarea', options: [], section: 'Benefits', visibleWhen: { field: 'cmps_clienttype1', values: ['Adult'] } },
]

export type EmploymentAndBenefitsPayload = Partial<Record<string, string>>

const CHOICE_FIELDS = EMPLOYMENT_AND_BENEFITS_FIELDS.filter((field) => field.input === 'radio')

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
  const numeric = Number(text)
  if (!Number.isNaN(numeric)) return options[numeric - OPTION_SET_BASE_VALUE] || text
  return options.find((option) => option.toLowerCase() === text.toLowerCase()) || text
}

export function parsePublicAssistanceTypes(value: unknown): string[] {
  return [...new Set(String(value ?? '').split(/[,;]+/).map((item) => normalizedChoice(item.trim(), PUBLIC_ASSISTANCE_TYPE_OPTIONS)).filter(Boolean))]
}

function normalizePayload(seed: EmploymentAndBenefitsPayload): Record<string, unknown> {
  const payload: Record<string, unknown> = { ...seed }
  delete payload.cmps_publicassistancetype
  const clientId = normalizeGuid(String(payload.cmps_cpid || ''))
  delete payload.cmps_cpid
  if (clientId) payload['cmps_cpid@odata.bind'] = `/${CLIENT_PROFILE_ENTITY_SET_NAME}(${clientId})`
  const clientType = normalizedChoice(payload.cmps_clienttype1, CLIENT_TYPE_OPTIONS)
  const receivingAssistance = normalizedChoice(payload.cmps_areyoureceivingpublicassistance, YES_NO_OPTIONS)
  const assistanceTypes = parsePublicAssistanceTypes(payload.cmps_publicassistancetype1)

  if (clientType !== 'Adult') {
    delete payload.cmps_areyoucurrentlyemployed
    delete payload.cmps_howmanyhoursdoyouworkeachweek
  }

  if (receivingAssistance !== 'Yes') {
    delete payload.cmps_publicassistancetype1
    delete payload.cmps_ssiamount
    delete payload.cmps_ssdiamount
    delete payload.cmps_cashassistanceamount
    delete payload.cmps_foodstampsamount
    delete payload.cmps_foodstampsdayreceived
  } else {
    if (!assistanceTypes.includes('SSI')) delete payload.cmps_ssiamount
    if (!assistanceTypes.includes('SSDI')) delete payload.cmps_ssdiamount
    if (!assistanceTypes.includes('Cash Assistance')) delete payload.cmps_cashassistanceamount
    if (!assistanceTypes.includes('Food Stamps')) {
      delete payload.cmps_foodstampsamount
      delete payload.cmps_foodstampsdayreceived
    }
  }

  if (Object.prototype.hasOwnProperty.call(payload, 'cmps_publicassistancetype1')) {
    payload.cmps_publicassistancetype1 = assistanceTypes.length ? assistanceTypes.map((option) => {
      const index = PUBLIC_ASSISTANCE_TYPE_OPTIONS.indexOf(option)
      if (index < 0) throw new Error('Invalid choice for Public Assistance Type.')
      return String(OPTION_SET_BASE_VALUE + index)
    }).join(',') : null
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

  for (const field of EMPLOYMENT_AND_BENEFITS_FIELDS.filter((definition) => ['currency', 'number'].includes(definition.input))) {
    const value = String(payload[field.field] || '').trim()
    if (!value) {
      delete payload[field.field]
      continue
    }
    const numericValue = Number(value)
    if (!Number.isFinite(numericValue)) throw new Error(`${field.label} must be a valid number.`)
    if (field.input === 'currency' && numericValue < 0) throw new Error(`${field.label} cannot be negative.`)
    if (field.field === 'cmps_foodstampsdayreceived' && (!Number.isInteger(numericValue) || numericValue < 1 || numericValue > 31)) {
      throw new Error('Food Stamps Day Received must be a whole number from 1 through 31.')
    }
    payload[field.field] = numericValue
  }

  for (const [field, value] of Object.entries(payload)) {
    if (typeof value === 'string' && !value.trim()) delete payload[field]
  }

  return payload
}

export function generateEmploymentAndBenefitsRecordId(): string {
  return `EB-${new Date().toISOString().replace(/[-:T]/g, '').slice(0, 15)}`
}

export async function createEmploymentAndBenefitsResponse(seed: EmploymentAndBenefitsPayload): Promise<{ id: string; recordId: string }> {
  const recordId = String(seed.cmps_recordid || '').trim().replace(/\.+$/, '') || generateEmploymentAndBenefitsRecordId()
  const payload = normalizePayload({ ...seed, cmps_recordid: recordId })

  if (local()) {
    const token = await ensureAuthToken()
    if (!token) throw new Error('Missing Dataverse connection info for Employment and Benefits create.')
    const response = await fetch(`${orgUrl()}/api/data/v9.2/${EMPLOYMENT_AND_BENEFITS_TABLE_ALIAS}`, {
      method: 'POST',
      credentials: 'include',
      headers: { Accept: 'application/json', 'Content-Type': 'application/json', 'OData-Version': '4.0', 'OData-MaxVersion': '4.0', Authorization: `Bearer ${token}`, Prefer: 'return=representation' },
      body: JSON.stringify(payload),
    })
    if (!response.ok) throw new Error(await response.text())
    const body = await response.json().catch(() => ({}))
    return { id: normalizeGuid(String(body?.[EMPLOYMENT_AND_BENEFITS_PRIMARY_ID_FIELD] || body?.id || '')), recordId }
  }

  const token = getAuthToken()
  const result = await runtimeDataClient.executeAsync<any, any>({
    connectorOperation: {
      tableName: 'commondataserviceforapps',
      operationName: 'CreateRecordWithOrganization',
      parameters: { prefer: 'return=representation', accept: 'application/json',  organization: orgUrl(), entityName: EMPLOYMENT_AND_BENEFITS_TABLE_ALIAS, item: payload, ...(token ? { token } : {}) },
    },
  } as any)
  if (!result?.success) throw new Error(String(result?.error?.message || result?.error || 'Employment and Benefits create failed.'))
  return { id: normalizeGuid(String(result?.data?.[EMPLOYMENT_AND_BENEFITS_PRIMARY_ID_FIELD] || result?.data?.id || '')), recordId }
}

export async function updateEmploymentAndBenefitsResponse(rowId: string, values: EmploymentAndBenefitsPayload): Promise<void> {
  const cleanId = normalizeGuid(rowId)
  if (!cleanId) throw new Error('Missing Employment and Benefits row id for update.')
  const payload = normalizePayload(values)
  // PATCH must explicitly clear dates; omitting a blank date preserves its old value.
  for (const field of EMPLOYMENT_AND_BENEFITS_FIELDS) {
    const value = (values as Record<string, unknown>)[field.field]
    if (['date', 'datetime'].includes(field.input) && Object.prototype.hasOwnProperty.call(values, field.field)
      && (value === null || (typeof value === 'string' && !value.trim()))) (payload as Record<string, unknown>)[field.field] = null
  }

  if (local()) {
    const token = await ensureAuthToken()
    if (!token) throw new Error('Missing Dataverse connection info for Employment and Benefits update.')
    const response = await fetch(`${orgUrl()}/api/data/v9.2/${EMPLOYMENT_AND_BENEFITS_TABLE_ALIAS}(${cleanId})`, {
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
      parameters: { organization: orgUrl(), entityName: EMPLOYMENT_AND_BENEFITS_TABLE_ALIAS, recordId: cleanId, item: payload, prefer: 'return=representation', accept: 'application/json', ...(token ? { token } : {}) },
    },
  } as any)
  if (!result?.success) throw new Error(String(result?.error?.message || result?.error || 'Employment and Benefits update failed.'))
}
