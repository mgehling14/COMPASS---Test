import { getClient } from '@microsoft/power-apps/data'
import { dataSourcesInfo } from '../../.power/schemas/appschemas/dataSourcesInfo'
import { ensureAuthToken, getAuthToken } from './auth'

const client = getClient(dataSourcesInfo as any)
const GUID = /^[a-f\d]{8}-[a-f\d]{4}-[a-f\d]{4}-[a-f\d]{4}-[a-f\d]{12}$/i
export class SaveConfirmationPendingError extends Error {}
export async function confirmSavedRecordId(tableAlias: string, recordId: string, identityColumn: 'cmps_recordid' | 'cmps_name' = 'cmps_recordid'): Promise<string> {
  if (!/^[a-z][a-z\d_]*$/i.test(tableAlias) || !recordId.trim()) throw new SaveConfirmationPendingError('The submitted record could not be uniquely identified. Remain on the form and check the saved record before retrying.')
  const organization = String(import.meta.env.VITE_DATAVERSE_ORG_URL || 'https://org1f466e4e.crm.dynamics.com').trim().replace(/\/+$/, '')
  const local = typeof window !== 'undefined' && ['localhost', '127.0.0.1'].includes(window.location.hostname)
  const request = async (entityName: string, parameters: Record<string, unknown>): Promise<any> => {
    if (!local) {
      const token = getAuthToken()
      const response = await client.executeAsync<any, any>({ connectorOperation: { tableName: 'commondataserviceforapps', operationName: 'ListRecordsWithOrganization',
        parameters: { organization, entityName, accept: 'application/json', ...parameters, ...(token ? { token } : {}) },
      } } as any)
      if (!response?.success) throw new Error(String(response?.error?.message || response?.error || 'Record confirmation failed.'))
      return response.data
    }
    const token = await ensureAuthToken()
    if (!token) throw new Error('Dataverse authentication is required to confirm this save.')
    const query = new URLSearchParams(Object.entries(parameters).map(([key, value]) => [key, String(value)]))
    const response = await fetch(`${organization}/api/data/v9.2/${entityName}?${query}`, { credentials: 'include', headers: { Accept: 'application/json', Authorization: `Bearer ${token}` } })
    if (!response.ok) throw new Error(await response.text())
    return response.json()
  }
  try {
    const metadata = await request('EntityDefinitions', { '$filter': `EntitySetName eq '${tableAlias}'`, '$select': 'PrimaryIdAttribute' })
    const definitions = Array.isArray(metadata) ? metadata : metadata?.value
    if (definitions?.length !== 1 || !/^[a-z][a-z\d_]*$/i.test(definitions[0].PrimaryIdAttribute || '')) throw new Error('Cannot resolve the table primary ID.')
    const primary = definitions[0].PrimaryIdAttribute
    const data = await request(tableAlias, { '$select': `${primary},${identityColumn}`, '$filter': `${identityColumn} eq '${recordId.trim().replace(/'/g, "''")}'`, '$top': 2 })
    const rows = Array.isArray(data) ? data : data?.value
    if (rows?.length !== 1 || String(rows[0][identityColumn] || '').trim() !== recordId.trim() || !GUID.test(String(rows[0][primary] || ''))) throw new Error('The saved record identity did not return exactly one matching row.')
    return rows[0][primary]
  } catch (failure) { throw new SaveConfirmationPendingError(`The save was submitted, but confirmation is pending. Your form is retained; saving again will check this same record, not create another. ${String((failure as Error)?.message || failure)}`) }
}
