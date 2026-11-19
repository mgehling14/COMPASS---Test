import { getClient } from '@microsoft/power-apps/data'
import { dataSourcesInfo } from '../../.power/schemas/appschemas/dataSourcesInfo'
import { ensureAuthToken, getAuthToken } from './auth'
import { excludeArchived } from './archive'
import { PERSON_YOU_ARE_FLEEING_PROFILE_FIELDS, PERSON_YOU_ARE_FLEEING_PROFILES_PRIMARY_ID_FIELD as primary, PERSON_YOU_ARE_FLEEING_PROFILES_TABLE_ALIAS as table, type PersonYouAreFleeingProfilePayload } from './personYouAreFleeingProfile'

const client = getClient(dataSourcesInfo as any)
const cleanId = (value: unknown) => String(value || '').trim().replace(/[{}]/g, '').toLowerCase()
const GUID = /^[a-f\d]{8}(?:-[a-f\d]{4}){3}-[a-f\d]{12}$/i

// Load only this unarchived record, scoped to the opened Client Profile. Preserve
// lookup GUIDs and hydrate raw dates/choices for the existing editing controls.
export async function loadPersonFleeingRecord(rowId: string, clientProfileId: string): Promise<{ id: string; recordId: string; values: PersonYouAreFleeingProfilePayload }> {
  const id = cleanId(rowId), clientId = cleanId(clientProfileId)
  if (!GUID.test(id) || !GUID.test(clientId)) throw new Error('A valid record ID and opened Client Profile are required.')
  const fields = PERSON_YOU_ARE_FLEEING_PROFILE_FIELDS.filter((field) => field.field.startsWith('cmps_'))
  const select = [primary, 'cmps_isarchived', ...fields.map((field) => field.input === 'lookup' || field.input === 'file' ? `_${field.field}_value` : field.field)].join(',')
  const filter = excludeArchived(`${primary} eq ${id} and _cmps_cpid_value eq ${clientId}`)
  const organization = String(import.meta.env.VITE_DATAVERSE_ORG_URL || 'https://org1f466e4e.crm.dynamics.com').trim().replace(/\/$/, '')
  const prefer = 'odata.include-annotations="OData.Community.Display.V1.FormattedValue"'
  let payload: any
  if (typeof window !== 'undefined' && ['localhost', '127.0.0.1'].includes(window.location.hostname)) {
    const token = await ensureAuthToken()
    if (!token) throw new Error('Dataverse authentication is required to edit this record.')
    const query = new URLSearchParams({ '$select': select, '$filter': filter, '$top': '2' })
    const response = await fetch(`${organization}/api/data/v9.2/${table}?${query}`, { credentials: 'include', headers: { Accept: 'application/json', Authorization: `Bearer ${token}`, Prefer: prefer } })
    if (!response.ok) throw new Error(await response.text())
    payload = await response.json()
  } else {
    const token = getAuthToken()
    const result = await client.executeAsync<any, any>({ connectorOperation: { tableName: 'commondataserviceforapps', operationName: 'ListRecordsWithOrganization',
      parameters: { organization, entityName: table, '$select': select, '$filter': filter, '$top': 2, prefer, accept: 'application/json', ...(token ? { token } : {}) },
    } } as any)
    if (!result?.success) throw new Error(String(result?.error?.message || result?.error || 'Unable to load Person You Are Fleeing Profile.'))
    payload = result.data
  }
  const rows = Array.isArray(payload) ? payload : payload?.value
  if (!Array.isArray(rows) || rows.length !== 1 || cleanId(rows[0]?.[primary]) !== id || cleanId(rows[0]?._cmps_cpid_value) !== clientId || Number(rows[0]?.cmps_isarchived) === 125570000) throw new Error('The record was not found, is archived, or does not belong to the opened Client Profile.')
  const row = rows[0], values: PersonYouAreFleeingProfilePayload = {}
  for (const field of fields) {
    if (field.input === 'lookup' || field.input === 'file') { values[field.field] = cleanId(row[`_${field.field}_value`]); continue }
    const raw = String(row[field.field] ?? '').trim()
    if (field.input === 'date') { values[field.field] = raw.startsWith('0001-01-01') ? '' : raw.match(/^\d{4}-\d{2}-\d{2}/)?.[0] || ''; continue }
    if ((field.input === 'select' || field.input === 'radio') && /^\d+$/.test(raw)) values[field.field] = field.options[Number(raw) - 125570000] || raw
    else values[field.field] = raw
  }
  return { id, recordId: String(row.cmps_recordid || '').trim(), values }
}
