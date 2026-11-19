import { getClient } from '@microsoft/power-apps/data'
import { dataSourcesInfo } from '../../.power/schemas/appschemas/dataSourcesInfo'
import { ensureAuthToken, getAuthToken } from './auth'
import { readDataverseRecordPages } from './dataverseRecordPages'
import type { CompassUser } from '../types/auth'

export const USER_DIRECTORY_TABLE_ALIAS = 'ithd_userses'
// Verified against this environment's ithd_users table. Do not request the
// nonexistent ithd_userid/ithd_name columns or unrelated helpdesk user data.
export const USER_DIRECTORY_COLUMNS = [
  'ithd_usersid', 'ithd_entraobjectid', 'ithd_userprincipalname', 'ithd_email',
  'ithd_displayname', 'ithd_firstname', 'ithd_lastname', 'ithd_isactive',
  'ithd_accountenabled', 'statecode',
] as const
export type DirectoryUser = CompassUser & { active: boolean; identityIds: string[]; identityEmails: string[] }
const client = getClient(dataSourcesInfo as any)
const text = (value: unknown) => String(value ?? '').trim()
const normalize = (value: unknown) => text(value).toLowerCase()

function field(row: Record<string, unknown>, names: string[]): string {
  for (const name of names) {
    const key = Object.keys(row).find((key) => normalize(key) === name.toLowerCase())
    if (key && text(row[key])) return text(row[key])
  }
  return ''
}
const unique = (values: string[]) => [...new Set(values.map(normalize).filter(Boolean))]
const disabled = (value: string) => ['false', 'no', '0', 'inactive', 'disabled'].includes(normalize(value))

export function mapUserDirectoryRecord(row: Record<string, unknown>): DirectoryUser | null {
  const entraId = field(row, ['ithd_entraobjectid'])
  const recordId = field(row, ['ithd_usersid'])
  const legacyId = field(row, ['ithd_userid', 'id'])
  const upn = field(row, ['ithd_userprincipalname', 'userprincipalname'])
  const emailAddress = field(row, ['ithd_email', 'email', 'mail', 'internalemailaddress'])
  const id = entraId || legacyId || recordId
  const email = upn || emailAddress
  if (!id && !email) return null
  const state = normalize(field(row, ['statecode']))
  const active = field(row, ['ithd_isactive', 'isactive', 'active', 'ithd_status'])
  const accountEnabled = field(row, ['ithd_accountenabled'])
  // An Active Dataverse row does not mean its directory account is active.
  // Either explicit disable flag wins over statecode=0.
  const eligible = !['1', 'inactive'].includes(state) && !disabled(active) && !disabled(accountEnabled)
  const name = field(row, ['ithd_displayname', 'ithd_name', 'fullname', 'displayname', 'name'])
    || [field(row, ['ithd_firstname']), field(row, ['ithd_lastname'])].filter(Boolean).join(' ')
    || email || id
  return {
    id, email, name, active: eligible, role: 'guest', roleSource: 'directory',
    // Only aliases from this same verified directory row can match roles.
    identityIds: unique([entraId, recordId, legacyId]),
    identityEmails: unique([upn, emailAddress]),
  }
}

export async function loadUserDirectory(): Promise<DirectoryUser[]> {
  const organization = text(import.meta.env.VITE_DATAVERSE_ORG_URL || 'https://org1f466e4e.crm.dynamics.com').replace(/\/$/, '')
  const runtime = typeof window === 'undefined' || !['localhost', '127.0.0.1'].includes(window.location.hostname)
  const token = runtime ? getAuthToken() : await ensureAuthToken()
  if (!runtime && !token) throw new Error('Dataverse authentication is required to load the user directory.')
  const rows = await readDataverseRecordPages(organization, USER_DIRECTORY_TABLE_ALIAS,
    { '$select': USER_DIRECTORY_COLUMNS.join(','), '$orderby': 'ithd_usersid asc' }, runtime, async (parameters, nextUrl) => {
      if (runtime) {
        const result = await client.executeAsync<any, any>({ connectorOperation: {
          tableName: 'commondataserviceforapps', operationName: parameters.next ? 'GetNextPageWithOrganization' : 'ListRecordsWithOrganization',
          parameters: parameters.next
            ? { organization: parameters.organization || organization, next: parameters.next }
            : { organization, entityName: USER_DIRECTORY_TABLE_ALIAS, ...parameters, prefer: 'odata.maxpagesize=1000', ...(token ? { token } : {}) },
        } } as any)
        if (!result?.success) throw new Error(text(result?.error?.message || result?.error || `Unable to load ${USER_DIRECTORY_TABLE_ALIAS}.`))
        return result.data
      }
      const query = new URLSearchParams(Object.entries(parameters).map(([key, value]) => [key, text(value)]))
      const response = await fetch(nextUrl || `${organization}/api/data/v9.2/${USER_DIRECTORY_TABLE_ALIAS}?${query}`, {
        method: 'GET', credentials: 'include', headers: { Accept: 'application/json', Authorization: `Bearer ${token}`, Prefer: 'odata.maxpagesize=1000', 'OData-Version': '4.0', 'OData-MaxVersion': '4.0' },
      })
      if (!response.ok) throw new Error(`Unable to load ${USER_DIRECTORY_TABLE_ALIAS} (HTTP ${response.status}). ${await response.text()}`)
      return response.json()
    })
  const users = new Map<string, DirectoryUser>()
  for (const row of rows) {
    const user = mapUserDirectoryRecord(row)
    if (user) users.set(`${normalize(user.id)}|${normalize(user.email)}`, user)
  }
  if (rows.length && !users.size) throw new Error(`Read ${rows.length.toLocaleString()} directory rows but none have a usable ithd_entraobjectid, ithd_usersid, ithd_userprincipalname, or ithd_email. Check the user-column mapping.`)
  return [...users.values()].sort((a, b) => a.name.localeCompare(b.name) || a.email.localeCompare(b.email))
}
