import { getClient } from '@microsoft/power-apps/data'
import { dataSourcesInfo } from '../../.power/schemas/appschemas/dataSourcesInfo'
import { ensureAuthToken, getAuthToken } from './auth'
import { excludeArchived, ARCHIVED_YES_VALUE } from './archive'
import { parseRuntimeDataverseContinuation, continuationPageKey } from './dataverseContinuation'
import type { VocaFormListRecord } from './vocaForm'

const TABLE = 'cmps_vocaforms'
const PRIMARY = 'cmps_vocaformid'
const GUID = /^[a-f\d]{8}(?:-[a-f\d]{4}){3}-[a-f\d]{12}$/i
const cleanId = (value: unknown) => String(value || '').trim().replace(/[{}]/g, '').toLowerCase()
const client = getClient(dataSourcesInfo as any)

// Include legacy client-only VOCA records even when the client has no
// enrollments. Scope every request on the server; never scan all clients'
// VOCA records or stop silently at the connector's first-page limit.
export async function listVocaFormsForClient(clientProfileId: string, enrollmentIds: string[]): Promise<VocaFormListRecord[]> {
  const clientId = cleanId(clientProfileId)
  if (!GUID.test(clientId)) throw new Error('A valid Client Profile row ID is required to load VOCA records.')
  const enrollments = [...new Set(enrollmentIds.map(cleanId).filter((id) => GUID.test(id)))]
  const enrollmentSet = new Set(enrollments)
  const filters = [`_cmps_cpid_value eq ${clientId} and _cmps_peid_value eq null`]
  for (let start = 0; start < enrollments.length; start += 50) filters.push(enrollments.slice(start, start + 50).map((id) => `_cmps_peid_value eq ${id}`).join(' or '))
  const organization = String(import.meta.env.VITE_DATAVERSE_ORG_URL || 'https://org1f466e4e.crm.dynamics.com').trim().replace(/\/$/, '')
  const local = typeof window !== 'undefined' && ['localhost', '127.0.0.1'].includes(window.location.hostname)
  const token = local ? await ensureAuthToken() : getAuthToken()
  if (local && !token) throw new Error('Dataverse authentication is required to load VOCA records.')
  const select = [PRIMARY, 'cmps_recordid', 'cmps_isarchived', 'createdon', 'modifiedon', '_cmps_peid_value', '_cmps_cpid_value'].join(',')
  const records = new Map<string, VocaFormListRecord>()
  for (const filter of filters) {
    let cursor = ''
    const seen = new Set<string>()
    do {
      const continuation = cursor ? parseRuntimeDataverseContinuation(cursor, organization, TABLE) : null
      let payload: any
      if (local) {
        const query = new URLSearchParams({ '$select': select, '$filter': excludeArchived(filter), '$orderby': `${PRIMARY} asc` })
        const response = await fetch(continuation?.url.href || `${organization}/api/data/v9.2/${TABLE}?${query}`, { credentials: 'include',
          headers: { Accept: 'application/json', Authorization: `Bearer ${token}`, 'OData-Version': '4.0', 'OData-MaxVersion': '4.0', Prefer: 'odata.maxpagesize=1000' },
        })
        if (!response.ok) throw new Error(await response.text())
        payload = await response.json()
      } else {
        const result = await client.executeAsync<any, any>({ connectorOperation: {
          tableName: 'commondataserviceforapps', operationName: continuation?.kind === 'connector' ? 'GetNextPageWithOrganization' : 'ListRecordsWithOrganization',
          parameters: {
            ...(continuation?.kind === 'connector' ? { organization: continuation.organization, next: continuation.next } : {
              organization, entityName: TABLE, '$select': select, '$filter': excludeArchived(filter), '$orderby': `${PRIMARY} asc`,
              ...(continuation ? { '$skiptoken': continuation.url.searchParams.get('$skiptoken') } : {}),
            }),
            accept: 'application/json', prefer: 'odata.maxpagesize=1000', ...(token ? { token } : {}),
          },
        } } as any)
        if (!result?.success) throw new Error(String(result?.error?.message || result?.error || 'Unable to load VOCA records.'))
        payload = result.data
      }
      const rows = Array.isArray(payload) ? payload : payload?.value
      if (!Array.isArray(rows)) throw new Error('Dataverse did not return VOCA records.')
      const next = String(payload?.['@odata.nextLink'] || payload?.['odata.nextLink'] || '').trim()
      if (next) {
        parseRuntimeDataverseContinuation(next, organization, TABLE)
        const key = continuationPageKey(next)
        if (seen.has(key)) throw new Error('VOCA paging repeated; not all records could be loaded.')
        seen.add(key)
      }
      for (const row of rows) {
        const id = cleanId(row[PRIMARY])
        const enrollmentId = cleanId(row._cmps_peid_value)
        const directClientId = cleanId(row._cmps_cpid_value)
        if (!GUID.test(id) || Number(row.cmps_isarchived) === ARCHIVED_YES_VALUE || !(enrollmentSet.has(enrollmentId) || (!enrollmentId && directClientId === clientId))) continue
        records.set(id, { id, recordId: String(row.cmps_recordid || '').trim(), programEnrollmentId: enrollmentId,
          createdOn: String(row.createdon || '').trim(), modifiedOn: String(row.modifiedon || '').trim() })
      }
      cursor = next
    } while (cursor)
  }
  return [...records.values()].sort((left, right) => String(right.modifiedOn || right.createdOn).localeCompare(String(left.modifiedOn || left.createdOn)))
}
