import { getClient } from '@microsoft/power-apps/data'
import { dataSourcesInfo } from '../../.power/schemas/appschemas/dataSourcesInfo'
import { ensureAuthToken } from './auth'
import { loadUserDirectory } from './userDirectory'

// Staff eligibility comes only from this directory. Legacy app-user tables
// must not add users or override their active status.
const ROLE_TABLE_ALIASES = ['cr52b_compassroletables', 'cmps_compassroletables', 'cmps_compassroletable'] as const
const DEFAULT_DATAVERSE_ORG_URL = 'https://org1f466e4e.crm.dynamics.com'
const runtimeDataClient = getClient(dataSourcesInfo as any)

export type StaffDirectoryEntry = {
  id: string
  email: string
  name: string
  roleNames: string[]
  identityIds?: string[]
  identityEmails?: string[]
  memberships: Array<{
    roleName: string
    program: string
  }>
}

function normalize(value: unknown): string {
  return String(value || '').trim().toLowerCase()
}

function text(value: unknown): string {
  return String(value ?? '').trim()
}

function orgUrl(): string {
  return String(import.meta.env.VITE_DATAVERSE_ORG_URL || DEFAULT_DATAVERSE_ORG_URL).trim().replace(/\/$/, '')
}

function isLocalHost(): boolean {
  if (typeof window === 'undefined') return false
  return ['localhost', '127.0.0.1'].includes(window.location.hostname)
}

function rowsFromPayload(payload: any): Array<Record<string, unknown>> {
  if (Array.isArray(payload)) return payload as Array<Record<string, unknown>>
  if (Array.isArray(payload?.value)) return payload.value as Array<Record<string, unknown>>
  return []
}

function getField(row: Record<string, unknown>, names: string[]): string {
  const key = Object.keys(row).find((existing) => names.some((name) => normalize(existing) === normalize(name)))
  return key ? text(row[key]) : ''
}

function parseJsonArray(value: unknown): Array<Record<string, unknown>> {
  if (Array.isArray(value)) return value as Array<Record<string, unknown>>
  if (value && typeof value === 'object') return [value as Record<string, unknown>]
  try {
    const parsed = JSON.parse(text(value))
    if (Array.isArray(parsed)) return parsed as Array<Record<string, unknown>>
    if (parsed && typeof parsed === 'object') {
      const nested = (parsed as Record<string, unknown>).users || (parsed as Record<string, unknown>).value
      return Array.isArray(nested) ? nested as Array<Record<string, unknown>> : []
    }
    if (typeof parsed === 'string') return parseJsonArray(parsed)
  } catch {
    // Fall through to simple delimited values.
  }
  return text(value)
    .split(/[;,\n\r]+/)
    .map((entry) => ({ email: entry.trim() }))
    .filter((entry) => !!entry.email)
}

function readRoleUsers(row: Record<string, unknown>): Array<{ id: string; email: string; name: string }> {
  const raw = getField(row, ['cr52b_jsonusers', 'cmps_jsonusers', 'jsonusers', 'cr52b_people', 'cmps_people', 'people', 'members', 'users'])
  return parseJsonArray(raw).map((entry) => ({
    id: getField(entry, ['id', 'userid', 'user id', 'user_id', 'objectid', 'object id', 'ithd_userid', 'mg_userid']),
    email: getField(entry, ['email', 'e-mail', 'mail', 'useremail', 'user email', 'userprincipalname', 'upn', 'username', 'ithd_email', 'mg_email']),
    name: getField(entry, ['name', 'fullname', 'displayname', 'full name', 'username', 'ithd_name', 'mg_name']),
  })).filter((entry) => !!entry.id || !!entry.email)
}

async function listRows(alias: string, select = ''): Promise<Array<Record<string, unknown>>> {
  if (isLocalHost()) {
    const token = await ensureAuthToken().catch(() => '')
    const headers = new Headers({ Accept: 'application/json', 'OData-Version': '4.0', 'OData-MaxVersion': '4.0' })
    if (token) headers.set('Authorization', `Bearer ${token}`)
    const query = select ? `?$select=${encodeURIComponent(select)}&$top=5000` : '?$top=5000'
    const response = await fetch(`${orgUrl()}/api/data/v9.2/${alias}${query}`, { credentials: 'include', headers }).catch(() => null)
    if (!response?.ok) return select ? listRows(alias) : []
    return rowsFromPayload(await response.json().catch(() => ({})))
  }

  const result = await runtimeDataClient.executeAsync<any, any>({
    connectorOperation: {
      tableName: 'commondataserviceforapps',
      operationName: 'ListRecordsWithOrganization',
      parameters: { organization: orgUrl(), entityName: alias, ...(select ? { '$select': select } : {}), '$top': 5000 },
    },
  } as any).catch(() => null)
  if (result?.success) return rowsFromPayload(result.data)
  return select ? listRows(alias) : []
}

export async function loadStaffDirectoryEntries(): Promise<StaffDirectoryEntry[]> {
  const directoryUsers = await loadUserDirectory()
  const roleResults = await Promise.all(ROLE_TABLE_ALIASES.map((alias) => listRows(alias, 'cr52b_rolename,cr52b_jsonusers,cr52b_program')))
  const roleRows = roleResults.flat()

  const assignments = new Map<string, { roleName: string; program: string }[]>()
  roleRows.forEach((row) => {
    const roleName = getField(row, ['cr52b_rolename', 'cmps_rolename', 'rolename', 'role'])
    const program = getField(row, ['cr52b_program', 'cmps_program', 'program', 'programname'])
    readRoleUsers(row).forEach((member) => {
      for (const key of [member.id, member.email, member.name].map(normalize).filter(Boolean)) {
        const current = assignments.get(key) || []
        current.push({ roleName, program })
        assignments.set(key, current)
      }
    })
  })

  const entries = new Map<string, StaffDirectoryEntry>()
  directoryUsers.filter((user) => user.active).forEach((user) => {
    const { id, email, name, identityIds, identityEmails } = user
    const membershipsByKey = new Map<string, { roleName: string; program: string }>()
    ;[id, email, name, ...identityIds, ...identityEmails]
      .map(normalize)
      .filter(Boolean)
      .flatMap((key) => assignments.get(key) || [])
      .forEach((membership) => {
        const membershipKey = `${normalize(membership.roleName)}|${normalize(membership.program)}`
        if (!membershipsByKey.has(membershipKey)) membershipsByKey.set(membershipKey, membership)
      })
    const memberships = Array.from(membershipsByKey.values())
    if (!memberships.length) return

    const key = normalize(email || id)
    entries.set(key, {
      id,
      email,
      name,
      identityIds,
      identityEmails,
      roleNames: Array.from(new Set(memberships.flatMap((membership) => [membership.roleName, membership.program]).filter(Boolean))),
      memberships,
    })
  })

  return Array.from(entries.values()).sort((a, b) => a.name.localeCompare(b.name))
}
