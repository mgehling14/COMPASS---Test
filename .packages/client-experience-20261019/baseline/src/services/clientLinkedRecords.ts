import { getClient } from '@microsoft/power-apps/data'
import { dataSourcesInfo } from '../../.power/schemas/appschemas/dataSourcesInfo'
import { ensureAuthToken, getAuthToken } from './auth'
import { excludeArchived } from './archive'
import { readDataverseRecordPages } from './dataverseRecordPages'

const DEFAULT_DATAVERSE_ORG_URL = 'https://org1f466e4e.crm.dynamics.com'
const runtimeDataClient = getClient(dataSourcesInfo as any)
const GUID = /^[a-f\d]{8}(?:-[a-f\d]{4}){3}-[a-f\d]{12}$/i
const NAME = /^[a-z][a-z\d_]*$/i
const cleanGuid = (value: unknown) => String(value || '').trim().replace(/[{}]/g, '').toLowerCase()

export type ClientLinkedRecord = {
  id: string
  recordId: string
  createdOn: string
  modifiedOn: string
  data?: Record<string, unknown>
}
export type ClientLinkedRecordSource = {
  tableAlias: string
  primaryIdField: string
  recordIdField?: string
  clientLookup?: string
  enrollmentLookup?: string
  clientLookups?: string[]
  enrollmentLookups?: string[]
  verifyRelationships?: boolean
  selectColumns?: string[]
}
const verifiedSources = new Map<string, Promise<ClientLinkedRecordSource>>()

// Preserve the configured aliases. For legacy tables, verify the wire endpoint and
// every actual parent lookup instead of inventing a plural alias or lookup name.
export async function resolveClientLinkedRecordSource(source: ClientLinkedRecordSource): Promise<ClientLinkedRecordSource> {
  if (!source.verifyRelationships) return source
  if (![source.tableAlias, source.primaryIdField].every((name) => NAME.test(name))) throw new Error('Invalid client-linked table mapping.')
  const organization = String(import.meta.env.VITE_DATAVERSE_ORG_URL || DEFAULT_DATAVERSE_ORG_URL).trim().replace(/\/$/, '')
  const key = JSON.stringify([organization, source])
  let pending = verifiedSources.get(key)
  if (!pending) {
    pending = (async () => {
      const query = {
        '$filter': [source.primaryIdField, 'cmps_clientprofileid', 'cmps_programenrollment1id'].map((primary) => `PrimaryIdAttribute eq '${primary}'`).join(' or '),
        '$select': 'LogicalName,EntitySetName,PrimaryIdAttribute',
        '$expand': 'ManyToOneRelationships($select=ReferencingAttribute,ReferencedEntity)',
      }
      const local = typeof window !== 'undefined' && ['localhost', '127.0.0.1'].includes(window.location.hostname)
      const token = local ? await ensureAuthToken() : getAuthToken()
      let payload: any
      if (local) {
        if (!token) throw new Error('Dataverse authentication is required to verify linked-record mappings.')
        const response = await fetch(`${organization}/api/data/v9.2/EntityDefinitions?${new URLSearchParams(query)}`, { credentials: 'include', headers: { Accept: 'application/json', Authorization: `Bearer ${token}` } })
        if (!response.ok) throw new Error(await response.text())
        payload = await response.json()
      } else {
        const result = await runtimeDataClient.executeAsync<any, any>({ connectorOperation: {
          tableName: 'commondataserviceforapps', operationName: 'ListRecordsWithOrganization',
          parameters: { organization, entityName: 'EntityDefinitions', ...query, accept: 'application/json', ...(token ? { token } : {}) },
        } } as any)
        if (!result?.success) throw new Error(String(result?.error?.message || result?.error || 'Unable to verify linked-record mappings.'))
        payload = result.data
      }
      const rows = Array.isArray(payload) ? payload : payload?.value
      if (!Array.isArray(rows) || payload?.['@odata.nextLink']) throw new Error('Incomplete linked-record table metadata.')
      const find = (primary: string) => {
        const matches = rows.filter((row) => row.PrimaryIdAttribute === primary)
        if (matches.length !== 1 || typeof matches[0].LogicalName !== 'string' || typeof matches[0].EntitySetName !== 'string' || !NAME.test(matches[0].LogicalName) || !NAME.test(matches[0].EntitySetName)) throw new Error(`Cannot uniquely verify linked-record metadata for ${primary}.`)
        return matches[0]
      }
      const table = find(source.primaryIdField), client = find('cmps_clientprofileid'), enrollment = find('cmps_programenrollment1id')
      if (!Array.isArray(table.ManyToOneRelationships) || table['ManyToOneRelationships@odata.nextLink']) throw new Error('Incomplete linked-record relationship metadata.')
      const lookups = (target: string) => [...new Set<string>(table.ManyToOneRelationships.filter((relationship: any) => relationship.ReferencedEntity === target).map((relationship: any) => typeof relationship.ReferencingAttribute === 'string' ? relationship.ReferencingAttribute : ''))].sort()
      const clientLookups = source.clientLookup ? lookups(client.LogicalName) : []
      const enrollmentLookups = source.enrollmentLookup ? lookups(enrollment.LogicalName) : []
      if (!clientLookups.length && !enrollmentLookups.length || [...clientLookups, ...enrollmentLookups].some((name) => !NAME.test(name))) throw new Error('No verified parent lookup exists for this client-linked form.')
      return { ...source, tableAlias: table.EntitySetName, clientLookup: '', enrollmentLookup: '', clientLookups, enrollmentLookups, verifyRelationships: false }
    })()
    verifiedSources.set(key, pending)
  }
  try { return await pending } catch (error) { verifiedSources.delete(key); throw error }
}
export async function listClientLinkedRecords(source: ClientLinkedRecordSource, clientProfileRowId: string, programEnrollmentRowIds: string[] = []): Promise<ClientLinkedRecord[]> {
  const clientId = cleanGuid(clientProfileRowId)
  if (clientId && !GUID.test(clientId)) throw new Error('A valid Client Profile row ID is required.')
  const enrollments = [...new Set(programEnrollmentRowIds.map(cleanGuid).filter((id) => GUID.test(id)))]
  const enrollmentSet = new Set(enrollments)
  source = await resolveClientLinkedRecordSource(source)
  const clientLookups = source.clientLookups ?? (source.clientLookup !== undefined ? (source.clientLookup ? [source.clientLookup] : []) : source.enrollmentLookup || source.enrollmentLookups?.length ? [] : ['cmps_cpid'])
  const enrollmentLookups = source.enrollmentLookups ?? (source.enrollmentLookup ? [source.enrollmentLookup] : [])
  for (const name of [source.tableAlias, source.primaryIdField, source.recordIdField, ...clientLookups, ...enrollmentLookups, ...(source.selectColumns || [])].filter(Boolean)) if (!NAME.test(name!)) throw new Error('Invalid client-linked table/column mapping.')
  const filters: string[] = []
  if (clientId) for (const lookup of clientLookups) filters.push(`_${lookup}_value eq ${clientId}`)
  for (const lookup of enrollmentLookups) for (let start = 0; start < enrollments.length; start += 50) filters.push(enrollments.slice(start, start + 50).map((id) => `_${lookup}_value eq ${id}`).join(' or '))
  if (!filters.length) return []
  const select = [...new Set([source.primaryIdField, source.recordIdField, ...[...clientLookups, ...enrollmentLookups].map((lookup) => `_${lookup}_value`), 'cmps_isarchived', 'createdon', 'modifiedon', ...(source.selectColumns || [])].filter(Boolean))].join(',')
  const organization = String(import.meta.env.VITE_DATAVERSE_ORG_URL || DEFAULT_DATAVERSE_ORG_URL).trim().replace(/\/$/, '')
  const local = typeof window !== 'undefined' && ['localhost', '127.0.0.1'].includes(window.location.hostname)
  const token = local ? await ensureAuthToken() : getAuthToken()
  if (local && !token) throw new Error('Dataverse authentication is required to load linked records.')
  const records = new Map<string, ClientLinkedRecord>()
  for (const filter of filters) {
    const rows = await readDataverseRecordPages(organization, source.tableAlias, { '$select': select, '$filter': excludeArchived(filter), '$orderby': `${source.primaryIdField} asc` }, !local, async (query, nextUrl) => {
      if (local) {
        const url = new URL(nextUrl || `${organization}/api/data/v9.2/${source.tableAlias}`)
        if (!nextUrl) for (const [key, value] of Object.entries(query)) if (key.startsWith('$')) url.searchParams.set(key, String(value))
        const response = await fetch(url.href, { credentials: 'include', headers: { Accept: 'application/json', Authorization: `Bearer ${token}`, 'OData-Version': '4.0', 'OData-MaxVersion': '4.0', Prefer: 'odata.maxpagesize=1000,odata.include-annotations="OData.Community.Display.V1.FormattedValue"' } })
        if (!response.ok) throw new Error(await response.text())
        return response.json()
      }
      const result = await runtimeDataClient.executeAsync<any, any>({ connectorOperation: {
        tableName: 'commondataserviceforapps', operationName: query.next ? 'GetNextPageWithOrganization' : 'ListRecordsWithOrganization',
        parameters: { organization, entityName: source.tableAlias, accept: 'application/json', prefer: 'odata.maxpagesize=1000,odata.include-annotations="OData.Community.Display.V1.FormattedValue"', ...query, ...(token ? { token } : {}) },
      } } as any)
      if (!result?.success) throw new Error(String(result?.error?.message || result?.error || 'Unable to load linked records.'))
      return result.data
    })
    for (const row of rows) {
      const id = cleanGuid(row[source.primaryIdField]), direct = clientLookups.map((lookup) => cleanGuid(row[`_${lookup}_value`])).filter(Boolean), parents = enrollmentLookups.map((lookup) => cleanGuid(row[`_${lookup}_value`]))
      if (!GUID.test(id)) throw new Error('A linked record returned an invalid Dataverse row ID.')
      if (Number(row.cmps_isarchived) === 125570000 || direct.some((value) => clientId && value !== clientId)) continue
      if (!direct.includes(clientId) && !parents.some((value) => enrollmentSet.has(value))) continue
      records.set(id, { id, recordId: String(row[source.recordIdField || 'cmps_recordid'] || '').trim(), createdOn: String(row.createdon || '').trim(), modifiedOn: String(row.modifiedon || '').trim(), data: row })
    }
  }
  return [...records.values()].sort((left, right) => String(right.modifiedOn || right.createdOn).localeCompare(String(left.modifiedOn || left.createdOn)) || left.id.localeCompare(right.id))
}
