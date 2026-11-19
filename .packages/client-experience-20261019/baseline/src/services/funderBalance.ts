import { getClient } from '@microsoft/power-apps/data'
import { dataSourcesInfo } from '../../.power/schemas/appschemas/dataSourcesInfo'
import { ensureAuthToken, getAuthToken } from './auth'
import { funderContractIdentity } from './funderContractIdentity'

export const REMAINING_POOL_FIELD = 'cmps_remainingpoolofmoney'
const CONTRACTS = 'cmps_fundercontracts'
const TRANSACTIONS = 'cmps_fundertransactions'
const TRANSACTION_ID = 'cmps_fundertransactionid'
const client = getClient(dataSourcesInfo as any)
const GUID = /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i
const pendingContracts = new Map<string, Set<string>>()

function organization(): string {
  return String(import.meta.env.VITE_DATAVERSE_ORG_URL || 'https://org1f466e4e.crm.dynamics.com').trim().replace(/\/$/, '')
}

function local(): boolean {
  return typeof window !== 'undefined' && ['localhost', '127.0.0.1'].includes(window.location.hostname)
}

function guid(value: unknown): string {
  const id = String(value || '').trim().replace(/[{}]/g, '')
  if (!GUID.test(id)) throw new Error('A valid funder record ID is required.')
  return id.toLowerCase()
}

// Dataverse currency supports up to four decimal places. Integer arithmetic
// avoids accumulating floating-point errors when adding many transactions.
function moneyUnits(value: unknown): bigint {
  if (value === null || value === undefined || String(value).trim() === '') throw new Error('A currency amount is missing.')
  const amount = Number(value)
  if (!Number.isFinite(amount) || !Number.isSafeInteger(Math.round(amount * 10000))) throw new Error('A currency amount is invalid or too large.')
  const fixed = amount.toFixed(4)
  return BigInt(fixed.replace('.', ''))
}

export function calculateRemainingPool(amount: unknown, transactions: unknown[]): number {
  const units = transactions.reduce<bigint>((total, value) => total - moneyUnits(value), moneyUnits(amount))
  if (!Number.isSafeInteger(Number(units))) throw new Error('The remaining currency amount is too large.')
  return Number(units) / 10000
}

async function request(operationName: string, entityName: string, parameters: Record<string, unknown> = {}): Promise<any> {
  const write = operationName.startsWith('Create') || operationName.startsWith('Update')
  if (local()) {
    const token = await ensureAuthToken()
    if (!token) throw new Error('Missing Dataverse connection info for funder balances.')
    const query = new URLSearchParams()
    for (const [key, value] of Object.entries(parameters)) if (key.startsWith('$')) query.set(key, String(value))
    const response = await fetch(`${organization()}/api/data/v9.2/${entityName}${parameters.recordId ? `(${parameters.recordId})` : ''}${query.size ? `?${query}` : ''}`, {
      method: write ? (parameters.recordId ? 'PATCH' : 'POST') : 'GET', credentials: 'include',
      headers: { Accept: 'application/json', 'Content-Type': 'application/json', 'OData-Version': '4.0', 'OData-MaxVersion': '4.0', Authorization: `Bearer ${token}`, Prefer: write ? 'return=representation' : 'odata.maxpagesize=5000' },
      ...(write ? { body: JSON.stringify(parameters.item) } : {}),
    })
    if (!response.ok) throw new Error(await response.text())
    const data = await response.json().catch(() => ({}))
    if (write && entityName === CONTRACTS && !funderContractIdentity(data).id) {
      const entityId = response.headers?.get('OData-EntityId')
      if (entityId) data['@odata.id'] = entityId
    }
    return data
  }
  const token = getAuthToken()
  const result = await client.executeAsync<any, any>({ connectorOperation: {
    tableName: 'commondataserviceforapps', operationName,
    parameters: { organization: organization(), entityName, prefer: write ? 'return=representation' : 'odata.maxpagesize=5000', accept: 'application/json', ...parameters, ...(token ? { token } : {}) },
  } } as any)
  if (!result?.success) throw new Error(String(result?.error?.message || result?.error || 'Funder balance operation failed.'))
  return result.data || {}
}

async function transactionAmounts(contractId: string): Promise<unknown[]> {
  const amounts: unknown[] = []
  let skiptoken = ''
  const seen = new Set<string>()
  do {
    const page = await request('ListRecordsWithOrganization', TRANSACTIONS, {
      '$select': 'cmps_amount', '$filter': `_cmps_activecontract_value eq ${guid(contractId)}`,
      ...(skiptoken ? { '$skiptoken': skiptoken } : {}),
    })
    const rows = Array.isArray(page) ? page : page.value
    if (!Array.isArray(rows)) throw new Error('Dataverse did not return the linked transactions. The balance was not changed.')
    // Archived transactions still represent money spent, so do not exclude them.
    amounts.push(...rows.map((row: Record<string, unknown>) => row.cmps_amount))
    const next = page['@odata.nextLink'] || page['odata.nextLink']
    skiptoken = next ? new URL(String(next), organization()).searchParams.get('$skiptoken') || '' : ''
    if (next && (!skiptoken || seen.has(skiptoken))) throw new Error('Unable to read all linked transactions. The balance was not changed.')
    seen.add(skiptoken)
  } while (skiptoken)
  return amounts
}

async function contractBalance(contractId: string, amountOverride?: unknown): Promise<number> {
  const contract = await request('GetItemWithOrganization', CONTRACTS, { recordId: guid(contractId), '$select': 'cmps_contractamount,cmps_remainingpoolofmoney' })
  return calculateRemainingPool(amountOverride ?? contract.cmps_contractamount, await transactionAmounts(contractId))
}

export async function synchronizeContractBalance(contractId: string, savedBy = ''): Promise<void> {
  const id = guid(contractId)
  // Re-read after writing to detect overlapping app saves and retry using the
  // current ledger rather than subtracting from a potentially stale balance.
  for (let attempt = 0; attempt < 3; attempt += 1) {
    const balance = await contractBalance(id)
    await request('UpdateRecordWithOrganization', CONTRACTS, { recordId: id, item: { [REMAINING_POOL_FIELD]: balance, ...(savedBy ? { cmps_modifiedby: savedBy } : {}) } })
    const contract = await request('GetItemWithOrganization', CONTRACTS, { recordId: id, '$select': 'cmps_contractamount,cmps_remainingpoolofmoney' })
    const expected = calculateRemainingPool(contract.cmps_contractamount, await transactionAmounts(id))
    if (moneyUnits(contract[REMAINING_POOL_FIELD]) === moneyUnits(expected)) return
  }
  throw new Error('The contract changed during balance synchronization. Please retry Save.')
}

export class FunderBalanceSyncError extends Error {
  savedRecordId: string

  constructor(savedRecordId: string, cause: unknown) {
    super(`The record was saved, but its contract balance could not be updated. Retry Save to update the same record, not create another. ${String((cause as Error)?.message || cause)}`)
    this.name = 'FunderBalanceSyncError'
    this.savedRecordId = savedRecordId
  }
}

export async function saveFunderFinancialRecord(kind: 'contract' | 'transaction', rowId: string, payload: Record<string, unknown>): Promise<{ id: string }> {
  const id = rowId ? guid(rowId) : ''
  const item = { ...payload }
  // The pool is system-managed, never accepted from an editable form payload.
  delete item[REMAINING_POOL_FIELD]
  if (kind === 'contract') {
    if (id) item[REMAINING_POOL_FIELD] = await contractBalance(id, item.cmps_contractamount)
    else if (item.cmps_contractamount !== undefined) item[REMAINING_POOL_FIELD] = calculateRemainingPool(item.cmps_contractamount, [])
    const result = await request(id ? 'UpdateRecordWithOrganization' : 'CreateRecordWithOrganization', CONTRACTS, { prefer: 'return=representation', accept: 'application/json',  ...(id ? { recordId: id } : {}), item })
    if (id) {
      try { await synchronizeContractBalance(id, String(item.cmps_modifiedby || '')) } catch (error) { throw new FunderBalanceSyncError(id, error) }
    }
    return { id: id || funderContractIdentity(result).id }
  }

  const previous = id ? await request('GetItemWithOrganization', TRANSACTIONS, { recordId: id, '$select': '_cmps_activecontract_value,cmps_amount' }) : null
  const binding = String(item['cmps_activecontract@odata.bind'] || '')
  const linkedId = binding ? guid(binding.match(/\(([^)]+)\)$/)?.[1]) : guid(previous?._cmps_activecontract_value)
  moneyUnits(item.cmps_amount ?? previous?.cmps_amount)
  // Use a client-generated GUID so even a successful response without a body
  // can safely retain the transaction ID if subsequent synchronization fails.
  const savedId = id || crypto.randomUUID()
  if (!id) item[TRANSACTION_ID] = savedId
  const contracts = new Set(pendingContracts.get(savedId) || [])
  contracts.add(linkedId)
  if (previous?._cmps_activecontract_value) contracts.add(guid(previous._cmps_activecontract_value))
  await request(id ? 'UpdateRecordWithOrganization' : 'CreateRecordWithOrganization', TRANSACTIONS, { prefer: 'return=representation', accept: 'application/json',  ...(id ? { recordId: id } : {}), item })
  pendingContracts.set(savedId, contracts)
  try {
    for (const contractId of contracts) await synchronizeContractBalance(contractId, String(item.cmps_modifiedby || ''))
    pendingContracts.delete(savedId)
  } catch (error) {
    throw new FunderBalanceSyncError(savedId, error)
  }
  return { id: savedId }
}
