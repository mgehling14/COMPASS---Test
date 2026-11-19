import { saveFunderFinancialRecord } from './funderBalance'

export const CONTRACTS_TABLE_ALIAS = 'cmps_fundercontracts'
const OPTION_SET_BASE_VALUE = 125570000

export type ContractField = {
  field: string
  label: string
  input: 'text' | 'lookup' | 'currency' | 'date' | 'select' | 'textarea'
  options: string[]
  section: 'Main'
  required?: boolean
}

export const CONTRACT_STATUS_OPTIONS = ['Open for Disbursements', 'Completed Disbursements', 'Suspended']

export const CONTRACT_FIELDS: ContractField[] = [
  { field: 'cmps_contractname', label: 'Contract Name', input: 'text', options: [], section: 'Main', required: true },
  { field: 'cmps_funder', label: 'Funder', input: 'lookup', options: [], section: 'Main' },
  { field: 'cmps_contractamount', label: 'Contract Amount', input: 'currency', options: [], section: 'Main', required: true },
  { field: 'cmps_contractstartdate', label: 'Contract Start Date', input: 'date', options: [], section: 'Main', required: true },
  { field: 'cmps_contractenddate', label: 'Contract End Date', input: 'date', options: [], section: 'Main', required: true },
  { field: 'cmps_contractstatus', label: 'Contract Status', input: 'select', options: CONTRACT_STATUS_OPTIONS, section: 'Main', required: true },
  { field: 'cmps_closedsuspendeddate', label: 'Closed/Suspended Date', input: 'date', options: [], section: 'Main' },
  { field: 'cmps_notes', label: 'Notes', input: 'textarea', options: [], section: 'Main' },
]

export type ContractPayload = Partial<Record<string, string>>

function normalizeGuid(value: string): string {
  return String(value || '').trim().replace(/[{}]/g, '')
}

function normalizePayload(seed: ContractPayload): Record<string, unknown> {
  const payload: Record<string, unknown> = Object.fromEntries(
    CONTRACT_FIELDS.filter((field) => Object.prototype.hasOwnProperty.call(seed, field.field)).map((field) => [field.field, seed[field.field]]),
  )
  for (const field of ['cmps_createdby', 'cmps_modifiedby']) if (seed[field]) payload[field] = seed[field]
  const funderId = normalizeGuid(String(payload.cmps_funder || ''))
  delete payload.cmps_funder
  if (funderId) payload['cmps_funder@odata.bind'] = `/cmps_funders(${funderId})`

  const statusValue = String(payload.cmps_contractstatus || '').trim()
  if (statusValue) {
    const numericValue = Number(statusValue)
    if (Number.isInteger(numericValue) && numericValue >= OPTION_SET_BASE_VALUE && numericValue < OPTION_SET_BASE_VALUE + CONTRACT_STATUS_OPTIONS.length) {
      payload.cmps_contractstatus = numericValue
    } else {
      const index = CONTRACT_STATUS_OPTIONS.findIndex((option) => option.toLowerCase() === statusValue.toLowerCase())
      if (index < 0) throw new Error('Invalid choice for Contract Status.')
      payload.cmps_contractstatus = OPTION_SET_BASE_VALUE + index
    }
  } else {
    delete payload.cmps_contractstatus
  }

  const amount = String(payload.cmps_contractamount || '').trim()
  if (amount) {
    const numericAmount = Number(amount)
    if (!Number.isFinite(numericAmount) || numericAmount < 0) throw new Error('Contract Amount must be a valid non-negative amount.')
    payload.cmps_contractamount = numericAmount
  } else {
    delete payload.cmps_contractamount
  }

  for (const [field, value] of Object.entries(payload)) {
    if (typeof value === 'string' && !value.trim()) delete payload[field]
  }
  return payload
}

export async function createContractResponse(seed: ContractPayload): Promise<{ id: string }> {
  return saveFunderFinancialRecord('contract', '', normalizePayload(seed))
}

export async function updateContractResponse(rowId: string, values: ContractPayload): Promise<void> {
  if (!normalizeGuid(rowId)) throw new Error('Missing Contract row id for update.')
  const payload = normalizePayload(values)
  // PATCH must explicitly clear dates; omitting a blank date preserves its old value.
  for (const field of CONTRACT_FIELDS) {
    const value = (values as Record<string, unknown>)[field.field]
    if (['date', 'datetime'].includes(field.input) && Object.prototype.hasOwnProperty.call(values, field.field)
      && (value === null || (typeof value === 'string' && !value.trim()))) (payload as Record<string, unknown>)[field.field] = null
  }
  await saveFunderFinancialRecord('contract', rowId, payload)
}
