import { getClient } from '@microsoft/power-apps/data'
import { dataSourcesInfo } from '../../.power/schemas/appschemas/dataSourcesInfo'
import { ensureAuthToken, getAuthToken } from './auth'
import { excludeArchived } from './archive'
import { funderContractIdentity } from './funderContractIdentity'
import { mapFunderAdminValues } from './funderAdmin'

export const FUNDERS_TABLE_ALIAS = 'cmps_funders'
export const FUNDER_CONTRACTS_TABLE_ALIAS = 'cmps_fundercontracts'
export const FUNDER_TRANSACTIONS_TABLE_ALIAS = 'cmps_fundertransactions'

const runtimeDataClient = getClient(dataSourcesInfo as any)
const ORG_URL = 'https://org1f466e4e.crm.dynamics.com'

export type FunderAdminRow = {
  id: string
  values: Record<string, string>
  name: string
  startDate: string
  endDate: string
  active: string
  program: string
}

export type FunderContractAdminRow = {
  id: string
  name: string
  values: Record<string, string>
  funderId: string
  funderName: string
  startDate: string
  endDate: string
  amount: string
  remainingPool: string
  status: string
  closedSuspendedDate: string
  notes: string
}

export type FunderTransactionAdminRow = {
  id: string
  values: Record<string, string>
  contractId: string
  contractName: string
  date: string
  amount: string
  type: string
  notes: string
}

export type FunderAdminData = {
  funders: FunderAdminRow[]
  contracts: FunderContractAdminRow[]
  transactions: FunderTransactionAdminRow[]
}

export type ActiveFunderOption = { id: string; name: string }
export type ActiveFunderContractOption = { id: string; name: string }

function orgUrl() { return String(import.meta.env.VITE_DATAVERSE_ORG_URL || ORG_URL).trim().replace(/\/$/, '') }
function localHost() { return typeof window !== 'undefined' && ['localhost', '127.0.0.1'].includes(window.location.hostname) }
function rows(payload: any): Array<Record<string, any>> { return Array.isArray(payload) ? payload : Array.isArray(payload?.value) ? payload.value : [] }
function value(row: Record<string, any>, key: string): string { return String(row?.[key] ?? '').trim() }
function formatted(row: Record<string, any>, key: string): string {
  return value(row, `${key}@OData.Community.Display.V1.FormattedValue`)
    || value(row, `_${key}_value@OData.Community.Display.V1.FormattedValue`)
    || value(row, key)
}
function choice(row: Record<string, any>, key: string, options: string[]): string {
  const display = formatted(row, key)
  if (display && !/^\d+$/.test(display)) return display
  const numeric = Number(value(row, key))
  return Number.isInteger(numeric) && numeric >= 125570000 && numeric < 125570000 + options.length ? options[numeric - 125570000] : display
}

async function listTable(alias: string, select: string): Promise<Array<Record<string, any>>> {
  if (localHost()) {
    const token = await ensureAuthToken().catch(() => '')
    const headers = new Headers({ Accept: 'application/json', 'OData-Version': '4.0', 'OData-MaxVersion': '4.0', Prefer: 'odata.include-annotations="OData.Community.Display.V1.FormattedValue"' })
    if (token) headers.set('Authorization', `Bearer ${token}`)
    const response = await fetch(`${orgUrl()}/api/data/v9.2/${alias}?$select=${encodeURIComponent(select)}&$filter=${encodeURIComponent(excludeArchived())}&$top=5000`, { credentials: 'include', headers })
    if (response.ok) return rows(await response.json().catch(() => ({})))
    throw new Error(await response.text())
  }

  const token = getAuthToken()
  const result = await runtimeDataClient.executeAsync<any, any>({
    connectorOperation: {
      tableName: 'commondataserviceforapps',
      operationName: 'ListRecordsWithOrganization',
      parameters: { organization: orgUrl(), entityName: alias, '$select': select, '$filter': excludeArchived(), '$top': 5000, prefer: 'odata.include-annotations="OData.Community.Display.V1.FormattedValue"', ...(token ? { token } : {}) },
    },
  } as any)
  if (!result?.success) throw new Error(JSON.stringify(result || {}))
  return rows(result.data)
}

export async function loadFunderAdminData(): Promise<FunderAdminData> {
  const [funderRows, contractRows, transactionRows] = await Promise.all([
    listTable(FUNDERS_TABLE_ALIAS, 'cmps_funderid,cmps_name,cmps_startdate,cmps_enddate,cmps_activechoice,cmps_program'),
    listTable(FUNDER_CONTRACTS_TABLE_ALIAS, '_cmps_funder_value,cmps_contractname,cmps_contractstartdate,cmps_contractenddate,cmps_contractamount,cmps_remainingpoolofmoney,cmps_contractstatus,cmps_closedsuspendeddate,cmps_notes'),
    listTable(FUNDER_TRANSACTIONS_TABLE_ALIAS, 'cmps_fundertransactionid,_cmps_activecontract_value,cmps_dateoftransaction,cmps_amount,cmps_transactiontype,cmps_notes'),
  ])

  return {
    funders: funderRows.map((row) => ({
      values: mapFunderAdminValues('funder', row),
      id: value(row, 'cmps_funderid') || value(row, 'id'), name: value(row, 'cmps_name'), startDate: value(row, 'cmps_startdate'), endDate: value(row, 'cmps_enddate'),
      active: choice(row, 'cmps_activechoice', ['Yes', 'No']), program: choice(row, 'cmps_program', ['Autumn House', 'DV Outreach', 'CAAFA Shelter', 'DVSTOP', 'Faith House', 'REACH Center', 'SV Helpline']).replace(/^CAAFA Outreach$/i, 'DV Outreach'),
    })),
    contracts: contractRows.map((row) => ({
      name: value(row, 'cmps_contractname'), values: mapFunderAdminValues('contract', row),
      id: funderContractIdentity(row).id, funderId: value(row, '_cmps_funder_value'), funderName: formatted(row, 'cmps_funder'), startDate: value(row, 'cmps_contractstartdate'), endDate: value(row, 'cmps_contractenddate'), amount: value(row, 'cmps_contractamount'),
      remainingPool: value(row, 'cmps_remainingpoolofmoney'),
      status: choice(row, 'cmps_contractstatus', ['Open for Disbursements', 'Completed Disbursements', 'Suspended']), closedSuspendedDate: value(row, 'cmps_closedsuspendeddate'), notes: value(row, 'cmps_notes'),
    })),
    transactions: transactionRows.map((row) => ({
      values: mapFunderAdminValues('transaction', row),
      id: value(row, 'cmps_fundertransactionid') || value(row, 'id'), contractId: value(row, '_cmps_activecontract_value'), contractName: formatted(row, 'cmps_activecontract'), date: value(row, 'cmps_dateoftransaction'), amount: value(row, 'cmps_amount'),
      type: choice(row, 'cmps_transactiontype', ['Charge', 'Fee Adjustment', 'Other Adjustment']), notes: value(row, 'cmps_notes'),
    })),
  }
}

export async function loadActiveFunders(): Promise<ActiveFunderOption[]> {
  let sourceRows: Array<Record<string, any>>
  try {
    sourceRows = await listTable(FUNDERS_TABLE_ALIAS, 'cmps_funderid,cmps_name,cmps_activechoice')
  } catch {
    sourceRows = await listTable(FUNDERS_TABLE_ALIAS, 'cmps_funderid,cmps_name,cmps_isactive')
  }

  return sourceRows
    .filter((row) => {
      const raw = formatted(row, 'cmps_isactive') || formatted(row, 'cmps_activechoice')
      return ['yes', 'true', '1'].includes(raw.toLowerCase()) || raw === '125570000'
    })
    .map((row) => ({ id: value(row, 'cmps_funderid') || value(row, 'id'), name: value(row, 'cmps_name') }))
    .filter((row) => row.id && row.name)
    .sort((a, b) => a.name.localeCompare(b.name))
}

export async function loadActiveFunderContracts(): Promise<ActiveFunderContractOption[]> {
  const sourceRows = await listTable(FUNDER_CONTRACTS_TABLE_ALIAS, '_cmps_funder_value,cmps_contractname,cmps_contractenddate,cmps_contractstatus')
  const now = new Date()
  const today = `${now.getFullYear()}-${String(now.getMonth() + 1).padStart(2, '0')}-${String(now.getDate()).padStart(2, '0')}`
  return sourceRows
    .filter((row) => {
      const endDate = mapFunderAdminValues('contract', row).cmps_contractenddate
      return !endDate || endDate >= today
    })
    .filter((row) => {
      const status = choice(row, 'cmps_contractstatus', ['Open for Disbursements', 'Completed Disbursements', 'Suspended'])
      return !status || normalizeContractStatus(status) === 'open for disbursements'
    })
    .map((row) => ({ id: funderContractIdentity(row).id, name: value(row, 'cmps_contractname') }))
    .filter((row) => row.id && row.name)
    .sort((a, b) => a.name.localeCompare(b.name))
}

function normalizeContractStatus(valueToNormalize: string): string {
  return String(valueToNormalize || '').trim().toLowerCase()
}
