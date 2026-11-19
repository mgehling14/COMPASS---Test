import { getClient } from '@microsoft/power-apps/data'
import { dataSourcesInfo } from '../../.power/schemas/appschemas/dataSourcesInfo'
import { ensureAuthToken, getAuthToken } from './auth'
import { formatServiceSiteLabel } from './serviceSiteLabels'

export const FINANCIAL_ASSISTANCES_TABLE_ALIAS = 'cmps_financialassitances'
export const FINANCIAL_ASSISTANCES_PRIMARY_ID_FIELD = 'cmps_financialassistanceid'
const PROGRAM_ENROLLMENT_ENTITY_SET_NAME = 'cmps_programenrollment1s'
const DEFAULT_DATAVERSE_ORG_URL = 'https://org1f466e4e.crm.dynamics.com'
const OPTION_SET_BASE_VALUE = 125570000
const runtimeDataClient = getClient(dataSourcesInfo as any)

export type FinancialAssistanceField = {
  field: string
  label: string
  input: 'readonly' | 'lookup' | 'select' | 'date' | 'staff' | 'currency' | 'radio' | 'number' | 'text' | 'textarea'
  options: string[]
  section: 'Main'
  required?: boolean
}

export const FINANCIAL_ASSISTANCE_SERVICE_SITE_OPTIONS = [
  'Autumn House',
  'CAAFA',
  'CAAFA - Crisis Response',
  'CAAFA - Legal',
  'CAAFA - DV',
  'CAAFA - SV',
  'CAAFA - Thrive',
  'DVSTOP',
  'Faith House',
  'REACH Center',
]

export const FINANCIAL_ASSISTANCE_CASH_CARD_OPTIONS = ['Cash', 'Card', 'In-Kind']
export const FINANCIAL_ASSISTANCE_TYPE_OPTIONS = ['Household Furnishings', 'Rent Subsidy/Voucher', 'Relocation Expenses', 'Utilities', 'Gift Card']
export const FINANCIAL_ASSISTANCE_FUNDER_OPTIONS = ['DES DV', 'DES SV', 'N/A', 'OVW-Late Life', 'SASP', 'Thrive', 'VOCA']

export const FINANCIAL_ASSISTANCE_FIELDS: FinancialAssistanceField[] = [
  { field: 'cmps_recordid', label: 'Record ID', input: 'readonly', options: [], section: 'Main' },
  { field: 'cmps_peid', label: 'Program Enrollment', input: 'lookup', options: [], section: 'Main', required: true },
  { field: 'cmps_servicesite', label: 'Service Site', input: 'select', options: FINANCIAL_ASSISTANCE_SERVICE_SITE_OPTIONS, section: 'Main' },
  { field: 'cmps_date', label: 'Date', input: 'date', options: [], section: 'Main', required: true },
  { field: 'cmps_staff', label: 'Staff', input: 'staff', options: [], section: 'Main' },
  { field: 'cmps_dollarvalue', label: 'Dollar Value', input: 'currency', options: [], section: 'Main', required: true },
  { field: 'cmps_cashcardinkind', label: 'Cash, Card, or In-Kind', input: 'radio', options: FINANCIAL_ASSISTANCE_CASH_CARD_OPTIONS, section: 'Main', required: true },
  { field: 'cmps_assistancetype', label: 'Assistance Type', input: 'radio', options: FINANCIAL_ASSISTANCE_TYPE_OPTIONS, section: 'Main' },
  { field: 'cmps_funder', label: 'Funder', input: 'select', options: FINANCIAL_ASSISTANCE_FUNDER_OPTIONS, section: 'Main' },
  { field: 'cmps_checknumber', label: 'Check Number', input: 'number', options: [], section: 'Main' },
  { field: 'cmps_payee', label: 'Payee', input: 'text', options: [], section: 'Main' },
  { field: 'cmps_notes', label: 'Notes', input: 'textarea', options: [], section: 'Main' },
]

export type FinancialAssistancePayload = Partial<Record<string, string>>

const CHOICE_FIELDS = FINANCIAL_ASSISTANCE_FIELDS.filter((field) => field.input === 'select' || field.input === 'radio')

function orgUrl(): string {
  return String(import.meta.env.VITE_DATAVERSE_ORG_URL || DEFAULT_DATAVERSE_ORG_URL).trim().replace(/\/$/, '')
}

function local(): boolean {
  return typeof window !== 'undefined' && ['localhost', '127.0.0.1'].includes(window.location.hostname)
}

function normalizeGuid(value: string): string {
  return String(value || '').trim().replace(/[{}]/g, '')
}

function normalizePayload(seed: FinancialAssistancePayload): Record<string, unknown> {
  const payload: Record<string, unknown> = { ...seed }
  const programEnrollmentId = normalizeGuid(String(payload.cmps_peid || ''))
  if (programEnrollmentId) {
    delete payload.cmps_peid
    payload['cmps_peid@odata.bind'] = `/${PROGRAM_ENROLLMENT_ENTITY_SET_NAME}(${programEnrollmentId})`
  }

  for (const field of CHOICE_FIELDS) {
    const rawValue = field.field === 'cmps_servicesite'
      ? formatServiceSiteLabel(payload[field.field])
      : String(payload[field.field] || '').trim()
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

  const dollarValue = String(payload.cmps_dollarvalue || '').trim()
  if (dollarValue) {
    const numericValue = Number(dollarValue)
    if (!Number.isFinite(numericValue) || numericValue < 0) throw new Error('Dollar Value must be a valid non-negative amount.')
    payload.cmps_dollarvalue = numericValue
  } else {
    delete payload.cmps_dollarvalue
  }

  const checkNumber = String(payload.cmps_checknumber || '').trim()
  if (checkNumber) {
    const numericValue = Number(checkNumber)
    if (!Number.isInteger(numericValue) || numericValue < 0) throw new Error('Check Number must be a non-negative whole number.')
    payload.cmps_checknumber = numericValue
  } else {
    delete payload.cmps_checknumber
  }

  for (const [field, value] of Object.entries(payload)) {
    if (typeof value === 'string' && !value.trim()) delete payload[field]
  }

  return payload
}

export function generateFinancialAssistanceRecordId(): string {
  return `FA-${new Date().toISOString().replace(/[-:T]/g, '').slice(0, 15)}`
}

export async function createFinancialAssistanceResponse(seed: FinancialAssistancePayload): Promise<{ id: string; recordId: string }> {
  const recordId = String(seed.cmps_recordid || '').trim().replace(/\.+$/, '') || generateFinancialAssistanceRecordId()
  const payload = normalizePayload({ ...seed, cmps_recordid: recordId })

  if (local()) {
    const token = await ensureAuthToken()
    if (!token) throw new Error('Missing Dataverse connection info for Financial Assistance create.')
    const response = await fetch(`${orgUrl()}/api/data/v9.2/${FINANCIAL_ASSISTANCES_TABLE_ALIAS}`, {
      method: 'POST',
      credentials: 'include',
      headers: { Accept: 'application/json', 'Content-Type': 'application/json', 'OData-Version': '4.0', 'OData-MaxVersion': '4.0', Authorization: `Bearer ${token}`, Prefer: 'return=representation' },
      body: JSON.stringify(payload),
    })
    if (!response.ok) throw new Error(await response.text())
    const body = await response.json().catch(() => ({}))
    return { id: normalizeGuid(String(body?.[FINANCIAL_ASSISTANCES_PRIMARY_ID_FIELD] || body?.id || '')), recordId }
  }

  const token = getAuthToken()
  const result = await runtimeDataClient.executeAsync<any, any>({
    connectorOperation: {
      tableName: 'commondataserviceforapps',
      operationName: 'CreateRecordWithOrganization',
      parameters: { prefer: 'return=representation', accept: 'application/json',  organization: orgUrl(), entityName: FINANCIAL_ASSISTANCES_TABLE_ALIAS, item: payload, ...(token ? { token } : {}) },
    },
  } as any)
  if (!result?.success) throw new Error(String(result?.error?.message || result?.error || 'Financial Assistance create failed.'))
  return { id: normalizeGuid(String(result?.data?.[FINANCIAL_ASSISTANCES_PRIMARY_ID_FIELD] || result?.data?.id || '')), recordId }
}

export async function updateFinancialAssistanceResponse(rowId: string, values: FinancialAssistancePayload): Promise<void> {
  const cleanId = normalizeGuid(rowId)
  if (!cleanId) throw new Error('Missing Financial Assistance row id for update.')
  const payload = normalizePayload(values)
  // PATCH must explicitly clear dates; omitting a blank date preserves its old value.
  for (const field of FINANCIAL_ASSISTANCE_FIELDS) {
    const value = (values as Record<string, unknown>)[field.field]
    if (['date', 'datetime'].includes(field.input) && Object.prototype.hasOwnProperty.call(values, field.field)
      && (value === null || (typeof value === 'string' && !value.trim()))) (payload as Record<string, unknown>)[field.field] = null
  }

  if (local()) {
    const token = await ensureAuthToken()
    if (!token) throw new Error('Missing Dataverse connection info for Financial Assistance update.')
    const response = await fetch(`${orgUrl()}/api/data/v9.2/${FINANCIAL_ASSISTANCES_TABLE_ALIAS}(${cleanId})`, {
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
      parameters: { organization: orgUrl(), entityName: FINANCIAL_ASSISTANCES_TABLE_ALIAS, recordId: cleanId, item: payload, ...(token ? { token } : {}) },
    },
  } as any)
  if (!result?.success) throw new Error(String(result?.error?.message || result?.error || 'Financial Assistance update failed.'))
}
