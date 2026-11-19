import { getClient } from '@microsoft/power-apps/data'
import { dataSourcesInfo } from '../../.power/schemas/appschemas/dataSourcesInfo'
import { ensureAuthToken, getAuthToken } from './auth'
import { createRecordIdSequence } from './recordIdSequence'
import { ARCHIVE_TABLES } from './archive'

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

function candidateFromPayload(payload: any): string | undefined {
  const rows = Array.isArray(payload) ? payload : payload?.value
  if (!Array.isArray(rows) || rows.length > 1 || payload?.['@odata.nextLink'] || payload?.['odata.nextLink']) {
    throw new Error('Dataverse did not return a bounded record-ID lookup.')
  }
  if (!rows.length) return undefined
  if (typeof rows[0]?.cmps_recordid !== 'string' || !rows[0].cmps_recordid.trim()) {
    throw new Error('Dataverse did not return a valid record ID.')
  }
  return rows[0].cmps_recordid.trim()
}

async function readRecordIdCandidate(tableAlias: string, stem: string, minimumDigits: number): Promise<string | undefined> {
  const organization = getOrgUrl()
  const token = getAuthToken()
  // Dataverse supports bracket wildcards in startswith/contains. Require a
  // nonzero first digit and reject any nonnumeric suffix, so legacy numbers,
  // timestamp IDs and malformed/imported values cannot inflate the sequence.
  // https://learn.microsoft.com/power-apps/developer/data-platform/wildcard-characters
  const query = {
    '$select': 'cmps_recordid',
    '$filter': `startswith(cmps_recordid,'${stem}[1-9]${'[0-9]'.repeat(minimumDigits - 1)}') and not contains(cmps_recordid,'${stem}%[^0-9]')`,
    '$orderby': 'cmps_recordid desc',
    '$top': 1,
  }
  try {
    const result = await runtimeDataClient.executeAsync<any, any>({ connectorOperation: {
      tableName: 'commondataserviceforapps', operationName: 'ListRecordsWithOrganization',
      parameters: { organization, entityName: tableAlias, ...query, ...(token ? { token } : {}) },
    } } as any)
    if (!result?.success) throw new Error('Unable to look up the next record ID using the connector.')
    return candidateFromPayload(result.data)
  } catch {
    // Retry only the same bounded lookup through the authenticated Web API.
    // Never fall back to downloading the table or allocating after a failure.
  }
  const authToken = token || await ensureAuthToken().catch(() => '')
  if (!organization || !authToken) {
    throw new Error(`Unable to look up the next record ID in ${tableAlias}. Please sign in and retry.`)
  }
  const url = new URL(`${organization}/api/data/v9.2/${tableAlias}`)
  for (const [key, value] of Object.entries(query)) url.searchParams.set(key, String(value))
  const response = await fetch(url.href, { credentials: 'include', headers: {
    Accept: 'application/json', Authorization: `Bearer ${authToken}`, 'OData-Version': '4.0', 'OData-MaxVersion': '4.0',
  } })
  if (!response.ok) throw new Error(`Unable to look up the next record ID in ${tableAlias}. No ID was allocated; please retry.`)
  return candidateFromPayload(await response.json())
}

const allocations = new Map<string, { sequence: ReturnType<typeof createRecordIdSequence>; tail: Promise<void> }>()

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
  const validatedSequence = createRecordIdSequence(prefix, divisionCode)
  if (!ARCHIVE_TABLES.some((table) => table.tableAlias === tableAlias && table.primaryIdField)) {
    throw new Error(`Missing primary-ID mapping for record-ID generation in ${tableAlias}.`)
  }
  const key = `${getOrgUrl()}|${tableAlias}|${prefix.toUpperCase()}|${divisionCode}`
  let state = allocations.get(key)
  if (!state) {
    state = { sequence: validatedSequence, tail: Promise.resolve() }
    allocations.set(key, state)
  }
  const { sequence } = state
  const allocation = state.tail.then(async () => {
    const stem = `${prefix}-${divisionCode}`
    const pattern = new RegExp(`^${stem}([1-9]\\d*)$`, 'i')
    // Text sorting alone would choose 999 before 1000. After each candidate,
    // ask only for longer numeric suffixes until none remain. Every query
    // returns at most one row, independent of the table's total row count.
    let minimumDigits = 1
    while (true) {
      const candidate = await readRecordIdCandidate(tableAlias, stem, minimumDigits)
      if (candidate === undefined) break
      const digits = candidate.match(pattern)?.[1]
      if (!digits || digits.length < minimumDigits) throw new Error('Dataverse returned an unexpected record ID. No ID was allocated.')
      sequence.observe(candidate) // Also stops unsafe/exhausted numeric ranges.
      minimumDigits = digits.length + 1
    }
    // Keep unsaved drafts distinct in this app session, but always recheck the
    // server above. This is not an atomic reservation across separate users;
    // that requires a Dataverse autonumber/counter or unique alternate key.
    return sequence.allocate()
  })
  state.tail = allocation.then(() => {}, () => {})
  return allocation
}
