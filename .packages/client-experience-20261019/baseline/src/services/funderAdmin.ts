import { getClient } from '@microsoft/power-apps/data'
import { dataSourcesInfo } from '../../.power/schemas/appschemas/dataSourcesInfo'
import { ensureAuthToken, getAuthToken } from './auth'
import { CONTRACT_FIELDS, CONTRACTS_TABLE_ALIAS } from './contract'
import { FUNDER_TRANSACTION_FIELDS, FUNDER_TRANSACTIONS_TABLE_ALIAS } from './funderTransaction'
import { saveFunderFinancialRecord } from './funderBalance'

export type FunderAdminKind = 'funder' | 'contract' | 'transaction'
export type FunderAdminField = {
  field: string
  label: string
  input: string
  options: string[]
  required?: boolean
}

export const FUNDER_ADMIN_TABLES: Record<FunderAdminKind, {
  label: string
  tableAlias: string
  fields: FunderAdminField[]
  lookupTargets: Record<string, string>
}> = {
  funder: {
    label: 'Funder', tableAlias: 'cmps_funders', lookupTargets: {},
    fields: [
      { field: 'cmps_name', label: 'Name', input: 'text', options: [], required: true },
      { field: 'cmps_program', label: 'Program', input: 'select', options: ['Autumn House', 'DV Outreach', 'CAAFA Shelter', 'DVSTOP', 'Faith House', 'REACH Center', 'SV Helpline'] },
      { field: 'cmps_startdate', label: 'Start Date', input: 'date', options: [] },
      { field: 'cmps_enddate', label: 'End Date', input: 'date', options: [] },
      { field: 'cmps_activechoice', label: 'Active', input: 'radio', options: ['Yes', 'No'], required: true },
    ],
  },
  contract: { label: 'Funder Contract', tableAlias: CONTRACTS_TABLE_ALIAS, fields: CONTRACT_FIELDS, lookupTargets: { cmps_funder: 'cmps_funders' } },
  transaction: { label: 'Funder Transaction', tableAlias: FUNDER_TRANSACTIONS_TABLE_ALIAS, fields: FUNDER_TRANSACTION_FIELDS, lookupTargets: { cmps_activecontract: CONTRACTS_TABLE_ALIAS } },
}

const BASE_CHOICE_VALUE = 125570000
const runtimeDataClient = getClient(dataSourcesInfo as any)
const GUID_PATTERN = /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i

function cleanGuid(value: string): string {
  return String(value || '').trim().replace(/[{}]/g, '')
}

function dateForInput(value: unknown): string {
  const text = String(value ?? '').trim()
  if (!text || text.startsWith('0001-01-01')) return ''
  if (/^\d{4}-\d{2}-\d{2}/.test(text)) return text.slice(0, 10)
  const parsed = new Date(text)
  if (Number.isNaN(parsed.getTime())) return ''
  return `${parsed.getFullYear()}-${String(parsed.getMonth() + 1).padStart(2, '0')}-${String(parsed.getDate()).padStart(2, '0')}`
}

export function mapFunderAdminValues(kind: FunderAdminKind, row: Record<string, unknown>): Record<string, string> {
  const values: Record<string, string> = {}
  for (const field of FUNDER_ADMIN_TABLES[kind].fields) {
    const raw = row[field.field]
    if (field.input === 'lookup') {
      values[field.field] = cleanGuid(String(row[`_${field.field}_value`] || ''))
    } else if (field.input === 'date') {
      values[field.field] = dateForInput(raw)
    } else if (field.options.length) {
      const numeric = Number(raw)
      values[field.field] = raw !== null && raw !== undefined && Number.isInteger(numeric) && field.options[numeric - BASE_CHOICE_VALUE]
        ? field.options[numeric - BASE_CHOICE_VALUE]
        : String(row[`${field.field}@OData.Community.Display.V1.FormattedValue`] || raw || '').trim()
    } else {
      values[field.field] = String(raw ?? '').trim()
    }
    if (kind === 'funder' && field.field === 'cmps_program') values[field.field] = values[field.field].replace(/^CAAFA Outreach$/i, 'DV Outreach')
  }
  if (kind === 'contract') values.cmps_remainingpoolofmoney = String(row.cmps_remainingpoolofmoney ?? '')
  return values
}

export function validateFunderAdminValues(kind: FunderAdminKind, values: Record<string, string>): string {
  const missing = FUNDER_ADMIN_TABLES[kind].fields.filter((field) => field.required && !String(values[field.field] || '').trim())
  return missing.length ? `Please complete required field(s): ${missing.map((field) => field.label).join(', ')}` : ''
}

function normalizePayload(kind: FunderAdminKind, values: Record<string, string>, editing: boolean): Record<string, unknown> {
  const definition = FUNDER_ADMIN_TABLES[kind]
  const item: Record<string, unknown> = {}
  for (const field of definition.fields) {
    if (!Object.prototype.hasOwnProperty.call(values, field.field)) continue
    let text = String(values[field.field] || '').trim()
    if (kind === 'funder' && field.field === 'cmps_program') text = text.replace(/^CAAFA Outreach$/i, 'DV Outreach')
    if (field.input === 'lookup') {
      const id = cleanGuid(text)
      if (id && !GUID_PATTERN.test(id)) throw new Error(`Please select a valid ${field.label}.`)
      if (id) item[`${field.field}@odata.bind`] = `/${definition.lookupTargets[field.field]}(${id})`
      else if (editing) item[field.field] = null
    } else if (!text) {
      if (editing) item[field.field] = field.input === 'text' || field.input === 'textarea' ? '' : null
    } else if (field.options.length) {
      const index = field.options.findIndex((option) => option.toLowerCase() === text.toLowerCase())
      const numeric = index >= 0 ? BASE_CHOICE_VALUE + index : Number(text)
      if (!Number.isInteger(numeric) || numeric < BASE_CHOICE_VALUE || numeric >= BASE_CHOICE_VALUE + field.options.length) throw new Error(`Invalid choice for ${field.label}.`)
      item[field.field] = numeric
    } else if (field.input === 'currency') {
      const amount = Number(text)
      if (!Number.isFinite(amount) || (kind === 'contract' && amount < 0)) throw new Error(`${field.label} must be a valid ${kind === 'contract' ? 'non-negative ' : ''}number.`)
      item[field.field] = amount
    } else if (field.input === 'date') {
      const date = dateForInput(text)
      const parsed = new Date(`${date}T00:00:00Z`)
      if (!date || !/^\d{4}-\d{2}-\d{2}$/.test(date) || Number.isNaN(parsed.getTime()) || parsed.toISOString().slice(0, 10) !== date) throw new Error(`Invalid date for ${field.label}.`)
      item[field.field] = date
    } else {
      item[field.field] = text
    }
  }
  if (!editing && values.cmps_createdby) item.cmps_createdby = values.cmps_createdby
  if (values.cmps_modifiedby) item.cmps_modifiedby = values.cmps_modifiedby
  return item
}

export async function saveFunderAdminRecord(kind: FunderAdminKind, rowId: string, values: Record<string, string>): Promise<{ id: string }> {
  const validation = validateFunderAdminValues(kind, values)
  if (validation) throw new Error(validation)
  const id = cleanGuid(rowId)
  if (id && !GUID_PATTERN.test(id)) throw new Error('The record ID is invalid. Reopen the record before saving.')
  const definition = FUNDER_ADMIN_TABLES[kind]
  const item = normalizePayload(kind, values, !!id)
  if (kind === 'contract' || kind === 'transaction') {
    return await saveFunderFinancialRecord(kind, id, item)
  }
  const organization = String(import.meta.env.VITE_DATAVERSE_ORG_URL || 'https://org1f466e4e.crm.dynamics.com').trim().replace(/\/$/, '')
  const local = typeof window !== 'undefined' && ['localhost', '127.0.0.1'].includes(window.location.hostname)

  if (local) {
    const token = await ensureAuthToken()
    if (!token) throw new Error('Missing Dataverse connection info for the funder editor.')
    const response = await fetch(`${organization}/api/data/v9.2/${definition.tableAlias}${id ? `(${id})` : ''}`, {
      method: id ? 'PATCH' : 'POST', credentials: 'include',
      headers: { Accept: 'application/json', 'Content-Type': 'application/json', 'OData-Version': '4.0', 'OData-MaxVersion': '4.0', Authorization: `Bearer ${token}`, Prefer: 'return=representation' },
      body: JSON.stringify(item),
    })
    if (!response.ok) throw new Error(await response.text())
    const body = response.status === 204 ? {} : await response.json().catch(() => ({}))
    return { id: id || String(body?.cmps_funderid || body?.id || response.headers?.get('OData-EntityId')?.match(/\(([a-f\d-]+)\)/i)?.[1] || '') }
  }

  const token = getAuthToken()
  const result = await runtimeDataClient.executeAsync<any, any>({
    connectorOperation: {
      tableName: 'commondataserviceforapps',
      operationName: id ? 'UpdateRecordWithOrganization' : 'CreateRecordWithOrganization',
      parameters: { organization, entityName: definition.tableAlias, ...(id ? { recordId: id } : {}), item, prefer: 'return=representation', accept: 'application/json', ...(token ? { token } : {}) },
    },
  } as any)
  if (!result?.success) throw new Error(String(result?.error?.message || result?.error || `Unable to save ${definition.label}.`))
  return { id: id || String(result.data?.cmps_funderid || result.data?.id || '') }
}
