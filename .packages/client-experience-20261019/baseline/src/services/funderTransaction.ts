import { saveFunderFinancialRecord } from './funderBalance'

export const FUNDER_TRANSACTIONS_TABLE_ALIAS = 'cmps_fundertransactions'
export const FUNDER_TRANSACTIONS_PRIMARY_ID_FIELD = 'cmps_fundertransactionid'
const FUNDER_CONTRACTS_ENTITY_SET_NAME = 'cmps_fundercontracts'
const OPTION_SET_BASE_VALUE = 125570000

export type FunderTransactionField = {
  field: string
  label: string
  input: 'date' | 'lookup' | 'radio' | 'currency' | 'textarea'
  options: string[]
  section: 'Main'
  required?: boolean
}

export const FUNDER_TRANSACTION_TYPE_OPTIONS = ['Charge', 'Fee Adjustment', 'Other Adjustment']

export const FUNDER_TRANSACTION_FIELDS: FunderTransactionField[] = [
  { field: 'cmps_dateoftransaction', label: 'Date of Transaction', input: 'date', options: [], section: 'Main', required: true },
  { field: 'cmps_activecontract', label: 'Active Contract', input: 'lookup', options: [], section: 'Main', required: true },
  { field: 'cmps_transactiontype', label: 'Transaction Type', input: 'radio', options: FUNDER_TRANSACTION_TYPE_OPTIONS, section: 'Main', required: true },
  { field: 'cmps_amount', label: 'Amount', input: 'currency', options: [], section: 'Main', required: true },
  { field: 'cmps_notes', label: 'Notes', input: 'textarea', options: [], section: 'Main' },
]

export type FunderTransactionPayload = Partial<Record<string, string>>

function normalizeGuid(value: string): string {
  return String(value || '').trim().replace(/[{}]/g, '')
}

function normalizePayload(seed: FunderTransactionPayload): Record<string, unknown> {
  const payload: Record<string, unknown> = Object.fromEntries(
    FUNDER_TRANSACTION_FIELDS.filter((field) => Object.prototype.hasOwnProperty.call(seed, field.field)).map((field) => [field.field, seed[field.field]]),
  )
  for (const field of ['cmps_createdby', 'cmps_modifiedby']) if (seed[field]) payload[field] = seed[field]
  const contractId = normalizeGuid(String(payload.cmps_activecontract || ''))
  delete payload.cmps_activecontract
  if (contractId) payload['cmps_activecontract@odata.bind'] = `/${FUNDER_CONTRACTS_ENTITY_SET_NAME}(${contractId})`

  const transactionType = String(payload.cmps_transactiontype || '').trim()
  if (transactionType) {
    const numericValue = Number(transactionType)
    if (Number.isInteger(numericValue) && numericValue >= OPTION_SET_BASE_VALUE && numericValue < OPTION_SET_BASE_VALUE + FUNDER_TRANSACTION_TYPE_OPTIONS.length) {
      payload.cmps_transactiontype = numericValue
    } else {
      const index = FUNDER_TRANSACTION_TYPE_OPTIONS.findIndex((option) => option.toLowerCase() === transactionType.toLowerCase())
      if (index < 0) throw new Error('Invalid choice for Transaction Type.')
      payload.cmps_transactiontype = OPTION_SET_BASE_VALUE + index
    }
  } else {
    delete payload.cmps_transactiontype
  }

  const amount = String(payload.cmps_amount || '').trim()
  if (amount) {
    const numericAmount = Number(amount)
    if (!Number.isFinite(numericAmount)) throw new Error('Amount must be a valid number.')
    payload.cmps_amount = numericAmount
  } else {
    delete payload.cmps_amount
  }

  for (const [field, value] of Object.entries(payload)) {
    if (typeof value === 'string' && !value.trim()) delete payload[field]
  }
  return payload
}

export async function createFunderTransactionResponse(seed: FunderTransactionPayload): Promise<{ id: string }> {
  return saveFunderFinancialRecord('transaction', '', normalizePayload(seed))
}

export async function updateFunderTransactionResponse(rowId: string, values: FunderTransactionPayload): Promise<void> {
  if (!normalizeGuid(rowId)) throw new Error('Missing Funder Transaction row id for update.')
  const payload = normalizePayload(values)
  // PATCH must explicitly clear dates; omitting a blank date preserves its old value.
  for (const field of FUNDER_TRANSACTION_FIELDS) {
    const value = (values as Record<string, unknown>)[field.field]
    if (['date', 'datetime'].includes(field.input) && Object.prototype.hasOwnProperty.call(values, field.field)
      && (value === null || (typeof value === 'string' && !value.trim()))) (payload as Record<string, unknown>)[field.field] = null
  }
  await saveFunderFinancialRecord('transaction', rowId, payload)
}
