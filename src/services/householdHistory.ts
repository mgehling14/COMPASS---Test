import { getClient } from '@microsoft/power-apps/data'
import { dataSourcesInfo } from '../../.power/schemas/appschemas/dataSourcesInfo'
import { ensureAuthToken, getAuthToken } from './auth'
import { excludeArchived } from './archive'
import { parseRuntimeDataverseContinuation, continuationPageKey } from './dataverseContinuation'

export const HOUSEHOLD_HISTORIES_TABLE_ALIAS = 'cmps_householdhistories'
export const HOUSEHOLD_HISTORIES_PRIMARY_ID_FIELD = 'cmps_householdhistoryid'
export const HOUSEHOLD_HISTORIES_OPTION_SET_BASE_VALUE = 125570000
const CLIENT_PROFILES_ENTITY_SET_NAME = 'cmps_clientprofiles'
const HOUSEHOLDS_ENTITY_SET_NAME = 'cmps_households'
const DEFAULT_DATAVERSE_ORG_URL = 'https://org1f466e4e.crm.dynamics.com'
const runtimeDataClient = getClient(dataSourcesInfo as any)

export const HOUSEHOLD_HISTORY_STATUS_OPTIONS = ['Active', 'Inactive']
export const HOUSEHOLD_HISTORY_RELATIONSHIP_OPTIONS = [
  'Self',
  'Spouse/Partner',
  'Family/Friend',
  'Roommate',
  'Child of HOH',
  'Other',
]

export const HOUSEHOLD_HISTORY_FIELDS = [
  'cmps_recordid',
  'cmps_clientid',
  'cmps_householdid',
  'cmps_status',
  'cmps_relationshiptohoh',
  'cmps_relationshiptohohother',
] as const

export type HouseholdHistoryFieldName = (typeof HOUSEHOLD_HISTORY_FIELDS)[number]

export type HouseholdHistoryPayload = Partial<Record<HouseholdHistoryFieldName, string>> & {
  cmps_createdby?: string
  cmps_modifiedby?: string
  clientRowId?: string
  householdRowId?: string
}

export type HouseholdHistoryRecord = {
  id: string
  recordId: string
  clientRowId: string
  clientRecordId: string
  clientName: string
  householdRowId: string
  status: string
  relationshipToHoh: string
  relationshipToHohOther: string
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

function isNumericLiteral(value: string): boolean {
  return /^-?\d+$/.test(String(value || '').trim())
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
  return String(HOUSEHOLD_HISTORIES_OPTION_SET_BASE_VALUE + index)
}

function decodeChoice(rawValue: unknown, options: string[], formattedValue?: unknown): string {
  if (formattedValue) return String(formattedValue || '').trim()

  const text = String(rawValue || '').trim()
  if (!text) return ''
  if (!isNumericLiteral(text)) return text

  const parsed = Number.parseInt(text, 10)
  const index = parsed - HOUSEHOLD_HISTORIES_OPTION_SET_BASE_VALUE
  if (index >= 0 && index < options.length) return options[index]
  return text
}

function parseCreatedRowId(data: any): string {
  if (!data) return ''

  const direct = data[HOUSEHOLD_HISTORIES_PRIMARY_ID_FIELD] || data.id
  if (direct) return String(direct).trim()

  const entityId = data['@odata.id'] || data['@odata.editLink']
  if (entityId && typeof entityId === 'string') {
    const match = entityId.match(/\(([0-9a-fA-F-]{36})\)/)
    return match?.[1] || ''
  }

  return ''
}

function normalizeHouseholdHistoryPayloadForDataverse(seed: HouseholdHistoryPayload): Record<string, unknown> {
  const payload: Record<string, unknown> = { ...seed }

  const clientRowId = String(seed.clientRowId || '').trim()
  const householdRowId = String(seed.householdRowId || '').trim()

  delete payload.clientRowId
  delete payload.householdRowId

  const status = String(payload.cmps_status || '').trim()
  if (status) {
    const encoded = encodeChoice(status, HOUSEHOLD_HISTORY_STATUS_OPTIONS)
    if (!isNumericLiteral(encoded)) throw new Error(`Invalid choice value for cmps_status: "${status}".`)
    payload.cmps_status = Number(encoded)
  } else {
    delete payload.cmps_status
  }

  const relationship = String(payload.cmps_relationshiptohoh || '').trim()
  if (relationship) {
    const encoded = encodeChoice(relationship, HOUSEHOLD_HISTORY_RELATIONSHIP_OPTIONS)
    if (!isNumericLiteral(encoded)) throw new Error(`Invalid choice value for cmps_relationshiptohoh: "${relationship}".`)
    payload.cmps_relationshiptohoh = Number(encoded)
  } else {
    delete payload.cmps_relationshiptohoh
  }

  const relationshipOther = String(payload.cmps_relationshiptohohother || '').trim()
  if (relationshipOther) payload.cmps_relationshiptohohother = relationshipOther
  else delete payload.cmps_relationshiptohohother

  const recordId = String(payload.cmps_recordid || '').trim()
  if (recordId) payload.cmps_recordid = recordId
  else delete payload.cmps_recordid

  delete payload.cmps_clientid
  delete payload.cmps_householdid

  if (clientRowId) {
    payload['cmps_clientid@odata.bind'] = `/${CLIENT_PROFILES_ENTITY_SET_NAME}(${clientRowId})`
  }

  if (householdRowId) {
    payload['cmps_householdid@odata.bind'] = `/${HOUSEHOLDS_ENTITY_SET_NAME}(${householdRowId})`
  } else {
    payload['cmps_householdid@odata.bind'] = null
  }

  return payload
}

function mapHouseholdHistoryRow(row: any): HouseholdHistoryRecord {
  const clientRowId = String(row?._cmps_clientid_value || row?.cmps_clientid || '').trim()
  const householdRowId = String(row?._cmps_householdid_value || row?.cmps_householdid || '').trim()
  const expandedClient = row?.cmps_clientid || null
  const firstName = String(expandedClient?.cmps_name || row?.['cmps_clientid.cmps_name'] || '').trim()
  const middleName = String(expandedClient?.cmps_middlename || row?.['cmps_clientid.cmps_middlename'] || '').trim()
  const lastName = String(expandedClient?.cmps_lastname || row?.['cmps_clientid.cmps_lastname'] || '').trim()
  const composedName = [firstName, middleName, lastName].filter(Boolean).join(' ').trim()

  return {
    id: String(row?.[HOUSEHOLD_HISTORIES_PRIMARY_ID_FIELD] || row?.id || '').trim(),
    recordId: String(row?.cmps_recordid || '').trim(),
    clientRowId,
    clientRecordId: String(
      expandedClient?.cmps_recordid
      || row?.['cmps_clientid.cmps_recordid']
      || '',
    ).trim(),
    clientName: String(
      composedName
      || row?.['_cmps_clientid_value@OData.Community.Display.V1.FormattedValue']
      || row?.['cmps_clientid@OData.Community.Display.V1.FormattedValue']
      || '',
    ).trim(),
    householdRowId,
    status: decodeChoice(row?.cmps_status, HOUSEHOLD_HISTORY_STATUS_OPTIONS, row?.['cmps_status@OData.Community.Display.V1.FormattedValue']),
    relationshipToHoh: decodeChoice(row?.cmps_relationshiptohoh, HOUSEHOLD_HISTORY_RELATIONSHIP_OPTIONS, row?.['cmps_relationshiptohoh@OData.Community.Display.V1.FormattedValue']),
    relationshipToHohOther: String(row?.cmps_relationshiptohohother || '').trim(),
  }
}

export function generateHouseholdHistoryRecordId(): string {
  const now = new Date()
  const datePart = now.toISOString().slice(0, 10).replace(/-/g, '')
  const timePart = now.toISOString().slice(11, 19).replace(/:/g, '')
  return `HHIST-${datePart}${timePart}`
}

export async function createHouseholdHistoryRecord(seed: HouseholdHistoryPayload): Promise<{ id: string; recordId: string }> {
  const recordId = String(seed.cmps_recordid || '').trim() || generateHouseholdHistoryRecordId()
  const payload = normalizeHouseholdHistoryPayloadForDataverse({ ...seed, cmps_recordid: recordId })
  // New histories must remain visible even if the backend column default is
  // unset or archived; archiving existing records uses the Archive action.
  payload.cmps_isarchived = 125570001
  const orgUrl = getOrgUrl()
  const token = getAuthToken()

  if (!isLocalHost()) {
    const result = await runtimeDataClient.executeAsync<any, any>({
      connectorOperation: {
        tableName: 'commondataserviceforapps',
        operationName: orgUrl ? 'CreateRecordWithOrganization' : 'CreateRecord',
        parameters: {
          ...(orgUrl ? { organization: orgUrl } : {}),
          entityName: HOUSEHOLD_HISTORIES_TABLE_ALIAS,
          item: payload,
          prefer: 'return=representation',
          accept: 'application/json',
          ...(token ? { token } : {}),
        },
      },
    } as any)

    if (!result?.success) throw new Error(parseConnectorErrorMessage(result?.error || result))
    return { id: parseCreatedRowId(result?.data), recordId }
  }

  const localToken = await ensureAuthToken()
  if (!orgUrl || !localToken) throw new Error('Missing Dataverse connection info for Household History create.')

  const headers = new Headers()
  headers.set('Accept', 'application/json')
  headers.set('Content-Type', 'application/json')
  headers.set('OData-Version', '4.0')
  headers.set('OData-MaxVersion', '4.0')
  headers.set('Authorization', `Bearer ${localToken}`)
  headers.set('Prefer', 'return=representation')

  const response = await fetch(`${orgUrl}/api/data/v9.2/${HOUSEHOLD_HISTORIES_TABLE_ALIAS}`, {
    method: 'POST',
    credentials: 'include',
    headers,
    body: JSON.stringify(payload),
  })

  if (!response.ok) throw new Error(await response.text())
  const body = await response.json().catch(() => ({}))
  return { id: parseCreatedRowId(body), recordId }
}

export async function createInitialHouseholdHistoryForClient(clientRowId: string, savedBy = ''): Promise<void> {
  const cleanClientRowId = String(clientRowId || '').trim().replace(/[{}]/g, '')
  if (!cleanClientRowId) return
  if (!/^[a-f\d]{8}(?:-[a-f\d]{4}){3}-[a-f\d]{12}$/i.test(cleanClientRowId)) throw new Error('Invalid Client Profile row ID for Household History create.')
  if ((await listHouseholdHistoryRowsByFilter(`_cmps_clientid_value eq ${cleanClientRowId}`, true)).length) return

  await createHouseholdHistoryRecord({
    ...(savedBy ? { cmps_createdby: savedBy, cmps_modifiedby: savedBy } : {}),
    clientRowId: cleanClientRowId,
    cmps_status: 'Active',
  })
}

export async function updateHouseholdHistoryRecord(rowId: string, seed: HouseholdHistoryPayload): Promise<void> {
  const cleanId = String(rowId || '').trim()
  if (!cleanId) throw new Error('Missing Household History row id for update.')

  const payload = normalizeHouseholdHistoryPayloadForDataverse(seed)
  const orgUrl = getOrgUrl()
  const token = getAuthToken()

  if (!isLocalHost()) {
    const result = await runtimeDataClient.executeAsync<any, any>({
      connectorOperation: {
        tableName: 'commondataserviceforapps',
        operationName: orgUrl ? 'UpdateRecordWithOrganization' : 'UpdateRecord',
        parameters: {
          ...(orgUrl ? { organization: orgUrl } : {}),
          entityName: HOUSEHOLD_HISTORIES_TABLE_ALIAS,
          recordId: cleanId,
          item: payload,
          prefer: 'return=minimal',
          accept: 'application/json',
          ...(token ? { token } : {}),
        },
      },
    } as any)

    if (!result?.success) throw new Error(parseConnectorErrorMessage(result?.error || result))
    return
  }

  const localToken = await ensureAuthToken()
  if (!orgUrl || !localToken) throw new Error('Missing Dataverse connection info for Household History update.')

  const headers = new Headers()
  headers.set('Accept', 'application/json')
  headers.set('Content-Type', 'application/json')
  headers.set('OData-Version', '4.0')
  headers.set('OData-MaxVersion', '4.0')
  headers.set('Authorization', `Bearer ${localToken}`)

  const response = await fetch(`${orgUrl}/api/data/v9.2/${HOUSEHOLD_HISTORIES_TABLE_ALIAS}(${cleanId})`, {
    method: 'PATCH',
    credentials: 'include',
    headers,
    body: JSON.stringify(payload),
  })

  if (!response.ok) throw new Error(await response.text())
}

async function listHouseholdHistoryRowsByFilter(filter: string, includeArchived = false): Promise<HouseholdHistoryRecord[]> {
  const visibleFilter = includeArchived ? filter : excludeArchived(filter)
  const orgUrl = getOrgUrl()
  const token = getAuthToken()
  const select = [
    HOUSEHOLD_HISTORIES_PRIMARY_ID_FIELD,
    'cmps_recordid',
    'cmps_status',
    'cmps_relationshiptohoh',
    'cmps_relationshiptohohother',
    '_cmps_clientid_value',
    '_cmps_householdid_value',
  ].join(',')

  const expand = 'cmps_clientid($select=cmps_recordid,cmps_name,cmps_middlename,cmps_lastname)'

  const rows: HouseholdHistoryRecord[] = []
  const seen = new Set<string>()
  let cursor = ''
  const local = isLocalHost()
  const localToken = local ? await ensureAuthToken() : ''
  if (local && !localToken) throw new Error('Missing Dataverse connection info for Household History list.')
  do {
    const continuation = cursor ? parseRuntimeDataverseContinuation(cursor, orgUrl, HOUSEHOLD_HISTORIES_TABLE_ALIAS) : null
    let payload: any
    if (!local) {
      const result = await runtimeDataClient.executeAsync<any, any>({
        connectorOperation: {
          tableName: 'commondataserviceforapps',
          operationName: continuation?.kind === 'connector' ? 'GetNextPageWithOrganization' : 'ListRecordsWithOrganization',
          parameters: continuation?.kind === 'connector' ? { organization: continuation.organization, next: continuation.next } : {
            organization: orgUrl,
            entityName: HOUSEHOLD_HISTORIES_TABLE_ALIAS,
            '$select': select,
            '$expand': expand,
            '$filter': visibleFilter,
            '$orderby': `${HOUSEHOLD_HISTORIES_PRIMARY_ID_FIELD} asc`,
            prefer: 'odata.maxpagesize=1000',
            ...(continuation ? { '$skiptoken': continuation.url.searchParams.get('$skiptoken') } : {}),
            ...(token ? { token } : {}),
          },
        },
      } as any)

      if (!result?.success) throw new Error(parseConnectorErrorMessage(result?.error || result))
      payload = result.data
    } else {

      const headers = new Headers()
      headers.set('Accept', 'application/json')
      headers.set('OData-Version', '4.0')
      headers.set('OData-MaxVersion', '4.0')
      headers.set('Authorization', `Bearer ${localToken}`)
      headers.set('Prefer', 'odata.maxpagesize=1000')

      const response = await fetch(
        continuation?.url.href || `${orgUrl}/api/data/v9.2/${HOUSEHOLD_HISTORIES_TABLE_ALIAS}?$select=${encodeURIComponent(select)}&$expand=${encodeURIComponent(expand)}&$filter=${encodeURIComponent(visibleFilter)}&$orderby=${encodeURIComponent(`${HOUSEHOLD_HISTORIES_PRIMARY_ID_FIELD} asc`)}`,
        {
          method: 'GET',
          credentials: 'include',
          headers,
        },
      )

      if (!response.ok) throw new Error(await response.text())
      payload = await response.json()
    }
    if (!Array.isArray(payload) && !Array.isArray(payload?.value)) throw new Error('Dataverse did not return Household History records.')
    const next = String(payload?.['@odata.nextLink'] || payload?.['odata.nextLink'] || '').trim()
    if (next) {
      parseRuntimeDataverseContinuation(next, orgUrl, HOUSEHOLD_HISTORIES_TABLE_ALIAS)
      const key = continuationPageKey(next)
      if (seen.has(key)) throw new Error('Household History paging repeated; not all members could be loaded.')
      seen.add(key)
    }
    rows.push(...rowsFromPayload(payload).map(mapHouseholdHistoryRow))
    cursor = next
  } while (cursor)
  return rows
}

export async function listHouseholdMembersForHousehold(householdRowId: string): Promise<HouseholdHistoryRecord[]> {
  const cleanHouseholdRowId = String(householdRowId || '').trim()
  if (!cleanHouseholdRowId) return []

  const filter = `_cmps_householdid_value eq ${cleanHouseholdRowId}`
  return listHouseholdHistoryRowsByFilter(filter)
}

export async function listActiveHouseholdCandidates(): Promise<HouseholdHistoryRecord[]> {
  const activeValue = HOUSEHOLD_HISTORIES_OPTION_SET_BASE_VALUE
  const filter = `cmps_status eq ${activeValue} and _cmps_householdid_value eq null`
  return listHouseholdHistoryRowsByFilter(filter)
}

export async function listHouseholdHistoriesForClient(clientRowId: string): Promise<HouseholdHistoryRecord[]> {
  const cleanClientRowId = String(clientRowId || '').trim()
  if (!cleanClientRowId) return []

  const filter = `_cmps_clientid_value eq ${cleanClientRowId}`
  return listHouseholdHistoryRowsByFilter(filter)
}

export async function findActiveHouseholdHistoryForClient(clientRowId: string): Promise<HouseholdHistoryRecord | null> {
  const cleanClientRowId = String(clientRowId || '').trim()
  if (!cleanClientRowId) return null

  const activeValue = HOUSEHOLD_HISTORIES_OPTION_SET_BASE_VALUE
  const filter = `_cmps_clientid_value eq ${cleanClientRowId} and cmps_status eq ${activeValue}`
  const rows = await listHouseholdHistoryRowsByFilter(filter)
  return rows[0] || null
}

export async function listHouseholdHistoriesByHouseholdOrActivePool(householdRowId: string): Promise<HouseholdHistoryRecord[]> {
  const cleanHouseholdRowId = String(householdRowId || '').trim()
  const activeValue = HOUSEHOLD_HISTORIES_OPTION_SET_BASE_VALUE

  if (!cleanHouseholdRowId) {
    return listHouseholdHistoryRowsByFilter(`cmps_status eq ${activeValue} and _cmps_householdid_value eq null`)
  }

  const filter = `(cmps_status eq ${activeValue} and _cmps_householdid_value eq ${cleanHouseholdRowId}) or (cmps_status eq ${activeValue} and _cmps_householdid_value eq null)`
  return listHouseholdHistoryRowsByFilter(filter)
}
