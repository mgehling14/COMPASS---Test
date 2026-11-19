import { getClient } from '@microsoft/power-apps/data'
import { dataSourcesInfo } from '../../.power/schemas/appschemas/dataSourcesInfo'
import { ensureAuthToken, getAuthToken } from './auth'
import { excludeArchived } from './archive'

export const HOUSEHOLDS_TABLE_ALIAS = 'cmps_households'
export const HOUSEHOLDS_PRIMARY_ID_FIELD = 'cmps_householdid'
export const HOUSEHOLDS_OPTION_SET_BASE_VALUE = 125570000
const DEFAULT_DATAVERSE_ORG_URL = 'https://org1f466e4e.crm.dynamics.com'
const runtimeDataClient = getClient(dataSourcesInfo as any)

export type HouseholdFieldInput = 'readonly' | 'select' | 'radio' | 'date' | 'number' | 'text'

export type HouseholdFieldDefinition = {
  field: string
  label: string
  input: HouseholdFieldInput
  options: string[]
  readOnly?: boolean
}

export const HOUSEHOLD_PROGRAM_OPTIONS = [
  'Autumn House',
  'DV Outreach',
  'CAAFA Shelter',
  'DVSTOP',
  'Faith House',
  'REACH Center',
]

export const HOUSEHOLD_INCLUDES_OPTIONS = [
  'Only Children or People Under 18 Years Old',
  'Only Adults or People 18 Years Old or Older',
  'Both Children and Adults',
  'Unknown (at Least One Birth Date Missing/Unknown)',
]

export const HOUSEHOLD_FIELD_DEFINITIONS: HouseholdFieldDefinition[] = [
  { field: 'cmps_recordid', label: 'Record ID', input: 'readonly', options: [] },
  { field: 'cmps_headofhouseholdname', label: 'Head of Household Name', input: 'readonly', options: [] },
  { field: 'cmps_effectivestartdate', label: 'Effective Start Date', input: 'date', options: [], readOnly: true },
  { field: 'cmps_effectiveenddate', label: 'Effective End Date', input: 'date', options: [], readOnly: true },
  { field: 'cmps_householdincludes', label: 'Household Includes', input: 'radio', options: HOUSEHOLD_INCLUDES_OPTIONS },
  { field: 'cmps_numberofhhmembers', label: 'Number of HH Members', input: 'number', options: [] },
]

export const HOUSEHOLD_FIELD_NAMES = HOUSEHOLD_FIELD_DEFINITIONS.map((field) => field.field)

export type HouseholdPayload = Partial<Record<(typeof HOUSEHOLD_FIELD_NAMES)[number], string>>

export type HouseholdListRecord = {
  id: string
  recordId: string
  headOfHouseholdName: string
  program: string
  statusSummary: string
}

export type HouseholdDetailRecord = {
  id: string
  recordId: string
  values: HouseholdPayload
}

function normalize(value: unknown): string {
  return String(value || '').trim().toLowerCase()
}

function rowsFromPayload(payload: any): any[] {
  if (Array.isArray(payload)) return payload
  if (Array.isArray(payload?.value)) return payload.value
  return []
}

function sanitizeOrgUrl(value: unknown): string {
  const raw = String(value || '').trim().replace(/\/$/, '')
  const lowered = raw.toLowerCase()
  if (!raw || lowered === 'null' || lowered === 'undefined') return ''
  return raw
}

function getOrgUrl(): string {
  const configured = sanitizeOrgUrl(import.meta.env.VITE_DATAVERSE_ORG_URL)
  return configured || DEFAULT_DATAVERSE_ORG_URL
}

function isLocalHost(): boolean {
  if (typeof window === 'undefined') return false
  const host = window.location.hostname
  return host === 'localhost' || host === '127.0.0.1'
}

function escapeODataString(value: string): string {
  return String(value || '').replace(/'/g, "''")
}

function isNumericLiteral(value: string): boolean {
  return /^-?\d+$/.test(String(value || '').trim())
}

function normalizeDateValueForDataverse(value: string): string {
  const text = String(value || '').trim()
  if (!text) return ''

  const isoDateMatch = text.match(/^(\d{4})-(\d{2})-(\d{2})(?:T.*)?$/)
  if (isoDateMatch) return `${isoDateMatch[1]}-${isoDateMatch[2]}-${isoDateMatch[3]}`

  const parsed = new Date(text)
  if (Number.isNaN(parsed.getTime())) return text

  const year = parsed.getUTCFullYear()
  const month = String(parsed.getUTCMonth() + 1).padStart(2, '0')
  const day = String(parsed.getUTCDate()).padStart(2, '0')
  return `${year}-${month}-${day}`
}

function parseConnectorErrorMessage(error: unknown): string {
  if (typeof error === 'string') return error
  if (!error || typeof error !== 'object') return 'Connector operation failed.'
  const err = error as any
  const nested = err?.innerError?.message || err?.message
  if (nested) return String(nested)
  try {
    return JSON.stringify(error)
  } catch {
    return 'Connector operation failed.'
  }
}

function encodeChoice(value: string, options: string[]): string {
  const text = String(value || '').trim()
  if (!text) return ''
  if (isNumericLiteral(text)) return text

  const index = options.findIndex((entry) => normalize(entry) === normalize(text))
  if (index < 0) return text
  return String(HOUSEHOLDS_OPTION_SET_BASE_VALUE + index)
}

function decodeChoice(rawValue: unknown, options: string[], formattedValue?: unknown): string {
  if (formattedValue) return String(formattedValue || '').trim()

  const text = String(rawValue || '').trim()
  if (!text) return ''
  if (!isNumericLiteral(text)) return text

  const parsed = Number.parseInt(text, 10)
  const index = parsed - HOUSEHOLDS_OPTION_SET_BASE_VALUE
  if (index >= 0 && index < options.length) return options[index]
  return text
}

function normalizeHouseholdPayloadForDataverse(seed: HouseholdPayload): Record<string, unknown> {
  const payload: Record<string, unknown> = { ...seed }

  for (const field of HOUSEHOLD_FIELD_DEFINITIONS) {
    const rawValue = String(payload[field.field] || '').trim()

    if (!rawValue) {
      if (field.field === 'cmps_effectiveenddate') payload[field.field] = null
      else delete payload[field.field]
      continue
    }

    if (field.input === 'readonly' && field.field !== 'cmps_recordid') {
      continue
    }

    if (field.input === 'date') {
      const normalizedDate = normalizeDateValueForDataverse(rawValue)
      if (!normalizedDate) {
        delete payload[field.field]
        continue
      }
      payload[field.field] = normalizedDate
      continue
    }

    if (field.input === 'number') {
      if (!isNumericLiteral(rawValue)) {
        throw new Error(`Invalid whole number value for ${field.field}.`)
      }
      payload[field.field] = rawValue
      continue
    }

    if (field.input === 'select' || field.input === 'radio') {
      const encoded = encodeChoice(rawValue, field.options)
      if (!isNumericLiteral(encoded)) {
        throw new Error(`Invalid choice value for ${field.field}: "${rawValue}".`)
      }
      payload[field.field] = encoded
    }
  }

  return payload
}

function parseCreatedRowId(data: any): string {
  if (!data) return ''

  if (typeof data === 'string') {
    const match = data.match(/\(([0-9a-fA-F-]{36})\)/)
    return match?.[1] || ''
  }

  const direct = data[HOUSEHOLDS_PRIMARY_ID_FIELD] || data.id
  if (direct) return String(direct).trim()

  const entityId = data['@odata.id'] || data['@odata.editLink']
  if (entityId && typeof entityId === 'string') {
    const match = entityId.match(/\(([0-9a-fA-F-]{36})\)/)
    return match?.[1] || ''
  }

  return ''
}

function mapHouseholdDetailRow(row: any): HouseholdDetailRecord {
  const values: HouseholdPayload = {}

  for (const field of HOUSEHOLD_FIELD_DEFINITIONS) {
    const rawValue = row?.[field.field]
    const formattedValue = row?.[`${field.field}@OData.Community.Display.V1.FormattedValue`]

    if (field.input === 'select' || field.input === 'radio') {
      values[field.field as keyof HouseholdPayload] = decodeChoice(rawValue, field.options, formattedValue)
      continue
    }

    values[field.field as keyof HouseholdPayload] = String(rawValue || '').trim()
  }

  return {
    id: String(row?.[HOUSEHOLDS_PRIMARY_ID_FIELD] || row?.id || '').trim(),
    recordId: String(values.cmps_recordid || '').trim(),
    values,
  }
}

export function generateHouseholdRecordId(): string {
  const now = new Date()
  const datePart = now.toISOString().slice(0, 10).replace(/-/g, '')
  const timePart = now.toISOString().slice(11, 19).replace(/:/g, '')
  return `HH-${datePart}${timePart}`
}

export async function createHouseholdResponse(values: HouseholdPayload): Promise<{ id: string; recordId: string }> {
  const recordId = String(values.cmps_recordid || '').trim() || generateHouseholdRecordId()
  const payload = normalizeHouseholdPayloadForDataverse({
    ...values,
    cmps_recordid: recordId,
    cmps_effectivestartdate: String(values.cmps_effectivestartdate || '').trim() || new Date().toISOString().slice(0, 10),
  })
  const orgUrl = getOrgUrl()
  const token = getAuthToken()

  if (!isLocalHost()) {
    const result = await runtimeDataClient.executeAsync<any, any>({
      connectorOperation: {
        tableName: 'commondataserviceforapps',
        operationName: orgUrl ? 'CreateRecordWithOrganization' : 'CreateRecord',
        parameters: { prefer: 'return=representation', accept: 'application/json', 
          ...(orgUrl ? { organization: orgUrl } : {}),
          entityName: HOUSEHOLDS_TABLE_ALIAS,
          item: payload,
          ...(token ? { token } : {}),
        },
      },
    } as any)

    if (!result?.success) throw new Error(parseConnectorErrorMessage(result?.error || result))
    const id = parseCreatedRowId(result?.data)
    return { id, recordId }
  }

  const localToken = await ensureAuthToken()
  if (!orgUrl || !localToken) throw new Error('Missing Dataverse connection info for Household create.')

  const headers = new Headers()
  headers.set('Accept', 'application/json')
  headers.set('Content-Type', 'application/json')
  headers.set('OData-Version', '4.0')
  headers.set('OData-MaxVersion', '4.0')
  headers.set('Authorization', `Bearer ${localToken}`)
  headers.set('Prefer', 'return=representation')

  const response = await fetch(`${orgUrl}/api/data/v9.2/${HOUSEHOLDS_TABLE_ALIAS}`, {
    method: 'POST',
    credentials: 'include',
    headers,
    body: JSON.stringify(payload),
  })

  if (!response.ok) throw new Error(await response.text())
  const body = await response.json().catch(() => ({}))
  const headerEntityId = response.headers.get('OData-EntityId') || response.headers.get('odata-entityid') || ''
  const id = parseCreatedRowId(body) || parseCreatedRowId(headerEntityId)
  return { id, recordId }
}

async function findLocalHouseholdRowIdByRecordId(recordId: string): Promise<string> {
  const cleanRecordId = String(recordId || '').trim()
  if (!cleanRecordId) return ''

  const localToken = await ensureAuthToken()
  const orgUrl = getOrgUrl()
  if (!orgUrl || !localToken) return ''

  const headers = new Headers()
  headers.set('Accept', 'application/json')
  headers.set('OData-Version', '4.0')
  headers.set('OData-MaxVersion', '4.0')
  headers.set('Authorization', `Bearer ${localToken}`)

  const filter = `cmps_recordid eq '${escapeODataString(cleanRecordId)}'`
  const select = `${HOUSEHOLDS_PRIMARY_ID_FIELD},cmps_recordid`
  const response = await fetch(
    `${orgUrl}/api/data/v9.2/${HOUSEHOLDS_TABLE_ALIAS}?$select=${encodeURIComponent(select)}&$filter=${encodeURIComponent(filter)}&$top=1`,
    {
      method: 'GET',
      credentials: 'include',
      headers,
    },
  )

  if (!response.ok) return ''
  const payload = await response.json()
  const row = rowsFromPayload(payload)[0] || {}
  return String(row?.[HOUSEHOLDS_PRIMARY_ID_FIELD] || row?.id || '').trim()
}

async function findRuntimeHouseholdRowIdByRecordId(recordId: string): Promise<string> {
  const cleanRecordId = String(recordId || '').trim()
  if (!cleanRecordId) return ''

  const orgUrl = getOrgUrl()
  const token = getAuthToken()
  if (!orgUrl) return ''

  const result = await runtimeDataClient.executeAsync<any, any>({
    connectorOperation: {
      tableName: 'commondataserviceforapps',
      operationName: 'ListRecordsWithOrganization',
      parameters: {
        organization: orgUrl,
        entityName: HOUSEHOLDS_TABLE_ALIAS,
        '$select': `${HOUSEHOLDS_PRIMARY_ID_FIELD},cmps_recordid`,
        '$filter': `cmps_recordid eq '${escapeODataString(cleanRecordId)}'`,
        '$top': 1,
        ...(token ? { token } : {}),
      },
    },
  } as any)

  if (!result?.success) return ''
  const row = rowsFromPayload(result.data)[0] || {}
  return String(row?.[HOUSEHOLDS_PRIMARY_ID_FIELD] || row?.id || '').trim()
}

export async function resolveHouseholdRowIdByRecordId(recordId: string): Promise<string> {
  const cleanRecordId = String(recordId || '').trim()
  if (!cleanRecordId) return ''

  try {
    const localMatch = await findLocalHouseholdRowIdByRecordId(cleanRecordId)
    if (localMatch) return localMatch
  } catch {
    // no-op; fallback to runtime lookup
  }

  try {
    return await findRuntimeHouseholdRowIdByRecordId(cleanRecordId)
  } catch {
    return ''
  }
}

export async function updateHouseholdResponse(rowId: string, values: HouseholdPayload): Promise<void> {
  const cleanId = String(rowId || '').trim()
  if (!cleanId) throw new Error('Missing Household row id for update.')

  const payload = normalizeHouseholdPayloadForDataverse(values)
  // PATCH must explicitly clear dates; omitting a blank date preserves its old value.
  for (const field of HOUSEHOLD_FIELD_DEFINITIONS) {
    const value = (values as Record<string, unknown>)[field.field]
    if (['date', 'datetime'].includes(field.input) && Object.prototype.hasOwnProperty.call(values, field.field)
      && (value === null || (typeof value === 'string' && !value.trim()))) (payload as Record<string, unknown>)[field.field] = null
  }
  const orgUrl = getOrgUrl()
  const token = getAuthToken()

  if (!isLocalHost()) {
    const result = await runtimeDataClient.executeAsync<any, any>({
      connectorOperation: {
        tableName: 'commondataserviceforapps',
        operationName: orgUrl ? 'UpdateRecordWithOrganization' : 'UpdateRecord',
        parameters: {
          ...(orgUrl ? { organization: orgUrl } : {}),
          entityName: HOUSEHOLDS_TABLE_ALIAS,
          recordId: cleanId,
          item: payload,
          ...(token ? { token } : {}),
        },
      },
    } as any)

    if (!result?.success) throw new Error(parseConnectorErrorMessage(result?.error || result))
    return
  }

  const localToken = await ensureAuthToken()
  if (!orgUrl || !localToken) throw new Error('Missing Dataverse connection info for Household update.')

  const headers = new Headers()
  headers.set('Accept', 'application/json')
  headers.set('Content-Type', 'application/json')
  headers.set('OData-Version', '4.0')
  headers.set('OData-MaxVersion', '4.0')
  headers.set('Authorization', `Bearer ${localToken}`)

  const response = await fetch(`${orgUrl}/api/data/v9.2/${HOUSEHOLDS_TABLE_ALIAS}(${cleanId})`, {
    method: 'PATCH',
    credentials: 'include',
    headers,
    body: JSON.stringify(payload),
  })

  if (!response.ok) throw new Error(await response.text())
}

export async function loadHouseholdDetailRecord(rowId: string, recordIdHint = ''): Promise<HouseholdDetailRecord> {
  const cleanId = String(rowId || '').trim()
  const cleanRecordId = String(recordIdHint || '').trim()
  const orgUrl = getOrgUrl()
  const token = getAuthToken()

  if (!cleanId && !cleanRecordId) {
    throw new Error('Missing Household row id and record id hint.')
  }

  if (!isLocalHost()) {
    const select = HOUSEHOLD_FIELD_NAMES.join(',')
    const filter = cleanId
      ? `${HOUSEHOLDS_PRIMARY_ID_FIELD} eq ${cleanId}`
      : `cmps_recordid eq '${escapeODataString(cleanRecordId)}'`

    const result = await runtimeDataClient.executeAsync<any, any>({
      connectorOperation: {
        tableName: 'commondataserviceforapps',
        operationName: 'ListRecordsWithOrganization',
        parameters: {
          organization: orgUrl,
          entityName: HOUSEHOLDS_TABLE_ALIAS,
          '$select': `${HOUSEHOLDS_PRIMARY_ID_FIELD},${select}`,
          '$filter': filter,
          '$top': 1,
          ...(token ? { token } : {}),
        },
      },
    } as any)

    if (!result?.success) throw new Error(parseConnectorErrorMessage(result?.error || result))
    const row = rowsFromPayload(result.data)[0]
    if (!row) throw new Error('Household record not found.')
    return mapHouseholdDetailRow(row)
  }

  const localToken = await ensureAuthToken()
  if (!orgUrl || !localToken) throw new Error('Missing Dataverse connection info for Household detail load.')

  const headers = new Headers()
  headers.set('Accept', 'application/json')
  headers.set('OData-Version', '4.0')
  headers.set('OData-MaxVersion', '4.0')
  headers.set('Authorization', `Bearer ${localToken}`)

  if (cleanId) {
    const select = [HOUSEHOLDS_PRIMARY_ID_FIELD, ...HOUSEHOLD_FIELD_NAMES].join(',')
    const response = await fetch(`${orgUrl}/api/data/v9.2/${HOUSEHOLDS_TABLE_ALIAS}(${cleanId})?$select=${encodeURIComponent(select)}`, {
      method: 'GET',
      credentials: 'include',
      headers,
    })

    if (!response.ok) throw new Error(await response.text())
    const row = await response.json()
    return mapHouseholdDetailRow(row)
  }

  const filter = `cmps_recordid eq '${escapeODataString(cleanRecordId)}'`
  const select = [HOUSEHOLDS_PRIMARY_ID_FIELD, ...HOUSEHOLD_FIELD_NAMES].join(',')
  const response = await fetch(`${orgUrl}/api/data/v9.2/${HOUSEHOLDS_TABLE_ALIAS}?$select=${encodeURIComponent(select)}&$filter=${encodeURIComponent(filter)}&$top=1`, {
    method: 'GET',
    credentials: 'include',
    headers,
  })

  if (!response.ok) throw new Error(await response.text())
  const payload = await response.json()
  const row = rowsFromPayload(payload)[0]
  if (!row) throw new Error('Household record not found.')
  return mapHouseholdDetailRow(row)
}

export async function listHouseholdsByIds(rowIds: string[]): Promise<HouseholdListRecord[]> {
  const ids = rowIds
    .map((entry) => String(entry || '').trim())
    .filter(Boolean)

  if (ids.length === 0) return []

  const uniqueIds = Array.from(new Set(ids))
  const filter = excludeArchived(uniqueIds.map((id) => `${HOUSEHOLDS_PRIMARY_ID_FIELD} eq ${id}`).join(' or '))
  const select = [HOUSEHOLDS_PRIMARY_ID_FIELD, 'cmps_recordid', 'cmps_headofhouseholdname', 'cmps_program'].join(',')

  const orgUrl = getOrgUrl()
  const token = getAuthToken()

  const mapRows = (rows: any[]): HouseholdListRecord[] => rows.map((row) => ({
    id: String(row?.[HOUSEHOLDS_PRIMARY_ID_FIELD] || row?.id || '').trim(),
    recordId: String(row?.cmps_recordid || '').trim(),
    headOfHouseholdName: String(row?.cmps_headofhouseholdname || '').trim(),
    program: decodeChoice(row?.cmps_program, HOUSEHOLD_PROGRAM_OPTIONS, row?.['cmps_program@OData.Community.Display.V1.FormattedValue']).replace(/^CAAFA Outreach$/i, 'DV Outreach'),
    statusSummary: '',
  }))

  if (!isLocalHost()) {
    const result = await runtimeDataClient.executeAsync<any, any>({
      connectorOperation: {
        tableName: 'commondataserviceforapps',
        operationName: 'ListRecordsWithOrganization',
        parameters: {
          organization: orgUrl,
          entityName: HOUSEHOLDS_TABLE_ALIAS,
          '$select': select,
          '$filter': filter,
          ...(token ? { token } : {}),
        },
      },
    } as any)

    if (!result?.success) throw new Error(parseConnectorErrorMessage(result?.error || result))
    return mapRows(rowsFromPayload(result.data))
  }

  const localToken = await ensureAuthToken()
  if (!orgUrl || !localToken) throw new Error('Missing Dataverse connection info for Household list.')

  const headers = new Headers()
  headers.set('Accept', 'application/json')
  headers.set('OData-Version', '4.0')
  headers.set('OData-MaxVersion', '4.0')
  headers.set('Authorization', `Bearer ${localToken}`)

  const response = await fetch(`${orgUrl}/api/data/v9.2/${HOUSEHOLDS_TABLE_ALIAS}?$select=${encodeURIComponent(select)}&$filter=${encodeURIComponent(filter)}`, {
    method: 'GET',
    credentials: 'include',
    headers,
  })

  if (!response.ok) throw new Error(await response.text())
  const payload = await response.json()
  return mapRows(rowsFromPayload(payload))
}
