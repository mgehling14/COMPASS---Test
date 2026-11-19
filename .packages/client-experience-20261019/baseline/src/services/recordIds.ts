import { getClient } from '@microsoft/power-apps/data'
import { dataSourcesInfo } from '../../.power/schemas/appschemas/dataSourcesInfo'
import { ensureAuthToken, getAuthToken } from './auth'
import { createRecordIdSequence } from './recordIdSequence'
import { ARCHIVE_TABLES } from './archive'
import { parseDataverseContinuation, parseRuntimeDataverseContinuation, continuationPageKey } from './dataverseContinuation'

const runtimeDataClient = getClient(dataSourcesInfo as any)
const DEFAULT_DATAVERSE_ORG_URL = 'https://org1f466e4e.crm.dynamics.com'

export const DEFAULT_DIVISION_CODE = '04'

// Keep this map centralized so new programs can receive their division code
// without changing every form generator.
export const PROGRAM_DIVISION_CODES: Record<string, string> = {
  'Autumn House': '04',
  'DV Outreach': '04',
  'CAAFA Shelter': '04',
  DVSTOP: '04',
  'Faith House': '04',
  'REACH Center': '04',
  'SV Helpline': '04',
}

function normalize(value: unknown): string {
  return String(value || '').trim().toLowerCase()
}

function sanitizeOrgUrl(value: unknown): string {
  const text = String(value || '').trim()
  if (!text) return ''
  return text.replace(/\/+$/, '')
}

function getOrgUrl(): string {
  const sources = dataSourcesInfo as any
  const candidates = [
    sources?.commondataserviceforapps?.organizationUrl,
    sources?.commondataserviceforapps?.environmentUrl,
    sources?.organizationUrl,
    import.meta.env.VITE_DATAVERSE_ORG_URL,
    DEFAULT_DATAVERSE_ORG_URL,
  ]
  return sanitizeOrgUrl(candidates.find((entry) => String(entry || '').trim()))
}

function rowsFromResult(result: any): Array<Record<string, any>> {
  const data = result?.data || result
  if (Array.isArray(data)) return data
  if (Array.isArray(data?.value)) return data.value
  if (Array.isArray(data?.rows)) return data.rows
  if (Array.isArray(data?.data)) return data.data
  return []
}

async function listRecordIds(tableAlias: string): Promise<string[]> {
  const select = 'cmps_recordid'
  const organization = getOrgUrl()
  const token = getAuthToken()
  const primary = ARCHIVE_TABLES.find((table) => table.tableAlias === tableAlias)?.primaryIdField
  if (!primary) throw new Error(`Missing primary-ID mapping for record-ID generation in ${tableAlias}.`)
  const parseNext = (payload: any): string => String(payload?.['@odata.nextLink'] || payload?.['odata.nextLink'] || '').trim()
  const skipToken = (link: string): string => {
    return parseDataverseContinuation(link, organization, tableAlias).searchParams.get('$skiptoken')!
  }
  const append = (ids: string[], payload: any) => {
    const rows = rowsFromResult(payload)
    if (!Array.isArray(payload) && !Array.isArray(payload?.value)) throw new Error('Dataverse did not return existing record IDs.')
    for (const row of rows) if (row.cmps_recordid) ids.push(String(row.cmps_recordid).trim())
  }
  try {
    const ids: string[] = []
    let cursor = ''
    const seen = new Set<string>()
    do {
      const continuation = cursor ? parseRuntimeDataverseContinuation(cursor, organization, tableAlias) : undefined
      const connectorPage = continuation?.kind === 'connector'
      const result = await runtimeDataClient.executeAsync<any, any>({ connectorOperation: {
        tableName: 'commondataserviceforapps', operationName: connectorPage ? 'GetNextPageWithOrganization' : 'ListRecordsWithOrganization',
        parameters: connectorPage ? { organization: continuation.organization, next: continuation.next } : { organization, entityName: tableAlias, '$select': select, '$orderby': `${primary} asc`, prefer: 'odata.maxpagesize=5000', ...(continuation ? { '$skiptoken': continuation.url.searchParams.get('$skiptoken') } : {}), ...(token ? { token } : {}) },
      } } as any)
      if (!result?.success) throw new Error('Unable to read existing record IDs using the connector.')
      append(ids, result.data)
      cursor = parseNext(result.data)
      if (cursor) {
        parseRuntimeDataverseContinuation(cursor, organization, tableAlias)
        const key = continuationPageKey(cursor)
        if (seen.has(key)) throw new Error('Record-ID paging repeated.')
        seen.add(key)
      }
    } while (cursor)
    return ids
  } catch {
    // Restart the complete scan through the authenticated Web API. Never
    // generate an ID from a partial connector page or from raw legacy counts.
  }
  const authToken = token || await ensureAuthToken().catch(() => '')
  if (!organization || !authToken) {
    throw new Error(`Unable to count records in ${tableAlias} before generating a record ID.`)
  }

  const ids: string[] = []
  let url = `${organization}/api/data/v9.2/${tableAlias}?$select=${select}&$orderby=${encodeURIComponent(`${primary} asc`)}`
  const seen = new Set<string>()
  let continuation = false
  do {
    const parsed = continuation ? parseDataverseContinuation(url, organization, tableAlias) : new URL(url)
    const response = await fetch(parsed.href, { credentials: 'include', headers: {
      Accept: 'application/json', Authorization: `Bearer ${authToken}`, 'OData-Version': '4.0', 'OData-MaxVersion': '4.0', Prefer: 'odata.maxpagesize=5000',
    } })
    if (!response.ok) throw new Error(`Unable to read all records in ${tableAlias} before generating a record ID.`)
    const payload = await response.json()
    append(ids, payload)
    url = parseNext(payload)
    if (url) {
      const key = skipToken(url)
      if (seen.has(key)) throw new Error('Record-ID paging repeated.')
      seen.add(key)
    }
    continuation = true
  } while (url)
  return ids
}

export function divisionCodeForProgram(program?: string): string {
  const requested = String(program || '').trim()
  if (/^\d{2}$/.test(requested)) return requested
  const match = Object.entries(PROGRAM_DIVISION_CODES)
    .find(([name]) => normalize(name) === normalize(requested))
  return match?.[1] || DEFAULT_DIVISION_CODE
}

export async function generateSequentialRecordId(
  tableAlias: string,
  prefix: string,
  programOrDivision?: string,
): Promise<string> {
  const divisionCode = divisionCodeForProgram(programOrDivision)
  const existingIds = await listRecordIds(tableAlias)
  const sequence = createRecordIdSequence(prefix, divisionCode)
  for (const id of existingIds) sequence.observe(id)
  return sequence.allocate()
}
