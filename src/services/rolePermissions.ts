import { getClient } from '@microsoft/power-apps/data'
import { dataSourcesInfo } from '../../.power/schemas/appschemas/dataSourcesInfo'
import { ensureAuthToken } from './auth'
import type { CompassUser } from '../types/auth'

const ROLE_TABLE_ALIAS = 'cr52b_compassroletables'
const runtimeDataClient = getClient(dataSourcesInfo as any)

type RawRoleRow = {
  cr52b_rolename?: unknown
  cr52b_jsondata?: unknown
  cr52b_jsonusers?: unknown
  [key: string]: unknown
}

type JsonUserEntry = {
  id?: string
  email?: string
  name?: string
  [key: string]: unknown
}

type PermissionFlags = {
  view: boolean
  search: boolean
  create: boolean
  edit: boolean
  ignoreProgramAssignment: boolean
}

export type RolePermissionEntry = {
  formName: string
  permissions: PermissionFlags
}

export type RolePermissionProfile = {
  roleName: string
  entries: RolePermissionEntry[]
}

export type RoleTablePullRow = {
  roleName: string
  jsonUsersRaw: string
  jsonDataRaw: string
  matchedByEmail: boolean
  matchedById: boolean
}

function normalize(value: unknown): string {
  return String(value || '').trim().toLowerCase()
}

function asString(value: unknown): string {
  return String(value || '').trim()
}

function isLocalHost(): boolean {
  if (typeof window === 'undefined') return false
  const host = window.location.hostname
  return host === 'localhost' || host === '127.0.0.1'
}

function rowsFromPayload(payload: any): RawRoleRow[] {
  if (Array.isArray(payload)) return payload as RawRoleRow[]
  if (Array.isArray(payload?.value)) return payload.value as RawRoleRow[]
  return []
}

function parseJsonObject(value: unknown): Record<string, unknown> {
  if (!value) return {}
  try {
    const parsed = JSON.parse(String(value))
    if (parsed && typeof parsed === 'object') return parsed as Record<string, unknown>
    return {}
  } catch {
    return {}
  }
}

function parseJsonArray(value: unknown): unknown[] {
  if (!value) return []
  try {
    let parsed: unknown = JSON.parse(String(value))
    // Some text fields end up storing JSON-stringified JSON; decode one more layer.
    if (typeof parsed === 'string') {
      try {
        parsed = JSON.parse(parsed)
      } catch {
        // keep as string fallback below
      }
    }
    return Array.isArray(parsed) ? parsed : []
  } catch {
    return []
  }
}

function extractUsersFromJsonUsersValue(value: unknown): JsonUserEntry[] {
  const directArray = parseJsonArray(value) as JsonUserEntry[]
  if (directArray.length) return directArray

  // Support object wrappers like { users: [...] } or { value: [...] }
  const objectPayload = parseJsonObject(value)
  const nestedUsers = objectPayload.users
  if (Array.isArray(nestedUsers)) return nestedUsers as JsonUserEntry[]
  const nestedValue = objectPayload.value
  if (Array.isArray(nestedValue)) return nestedValue as JsonUserEntry[]

  // Fallback: treat raw text as comma/semicolon-separated emails.
  const raw = asString(value)
  if (!raw) return []

  const normalizeToken = (token: string) =>
    token
      .trim()
      .replace(/^[\s\[\]\(\){}"']+/, '')
      .replace(/[\s\[\]\(\){}"']+$/, '')

  const split = raw
    .split(/[;,\n\r]+/)
    .map((v) => normalizeToken(v))
    .filter(Boolean)

  if (!split.length) return []
  return split.map((email) => ({ email }))
}

function markerToBool(value: unknown): boolean {
  const key = normalize(value)
  return key === 'x' || key === 'true' || key === 'yes' || key === '1'
}

function readUserEntryValue(entry: JsonUserEntry, keys: string[]): string {
  for (const key of keys) {
    const direct = entry[key]
    if (direct !== undefined && direct !== null && String(direct).trim()) {
      return String(direct).trim()
    }

    const normalizedKey = Object.keys(entry).find((existingKey) => normalize(existingKey) === normalize(key))
    if (normalizedKey) {
      const normalizedValue = entry[normalizedKey]
      if (normalizedValue !== undefined && normalizedValue !== null && String(normalizedValue).trim()) {
        return String(normalizedValue).trim()
      }
    }
  }

  return ''
}

function mapEntriesFromJsonData(jsonDataValue: unknown): RolePermissionEntry[] {
  const raw = parseJsonObject(jsonDataValue)
  return Object.entries(raw).map(([formName, markerSet]) => {
    const values = Array.isArray(markerSet) ? markerSet : []
    return {
      formName,
      permissions: {
        view: markerToBool(values[0]),
        search: markerToBool(values[1]),
        create: markerToBool(values[2]),
        edit: markerToBool(values[3]),
        ignoreProgramAssignment: markerToBool(values[4]),
      },
    }
  })
}

function userMatchesRole(user: CompassUser, jsonUsersValue: unknown): boolean {
  // UPN, mail address, Entra ID and directory row ID can identify the same
  // person. Only use aliases verified on that person's directory record.
  return userMatchesRoleByEmail(user, jsonUsersValue) || userMatchesRoleById(user, jsonUsersValue)
}

function userMatchesRoleByEmail(user: CompassUser, jsonUsersValue: unknown): boolean {
  const list = extractUsersFromJsonUsersValue(jsonUsersValue)
  if (!list.length) return false

  const userEmails = new Set([user.email, ...(user.identityEmails || [])].map(normalize).filter(Boolean))
  if (!userEmails.size) return false

  return list.some((entry) => {
    const entryEmail = normalize(readUserEntryValue(entry, ['email', 'e-mail', 'mg_email', 'ithd_email', 'mail']))
    return !!entryEmail && userEmails.has(entryEmail)
  })
}

function userMatchesRoleById(user: CompassUser, jsonUsersValue: unknown): boolean {
  const list = extractUsersFromJsonUsersValue(jsonUsersValue)
  if (!list.length) return false

  const userIds = new Set([user.id, ...(user.identityIds || [])].map(normalize).filter(Boolean))
  if (!userIds.size) return false

  return list.some((entry) => {
    const entryId = normalize(readUserEntryValue(entry, ['id', 'userid', 'user id', 'mg_userid', 'ithd_userid']))
    return !!entryId && userIds.has(entryId)
  })
}

async function listRoleRowsRuntime(): Promise<RawRoleRow[]> {
  const orgUrl = (import.meta.env.VITE_DATAVERSE_ORG_URL || '').toString().trim().replace(/\/$/, '')
  const failures: string[] = []

  const describeFailure = (result: any, fallback: string) => {
    const message = result?.error?.message || result?.message
    return typeof message === 'string' && message.trim() ? message.trim() : fallback
  }

  if (orgUrl) {
    try {
      const withOrg = await runtimeDataClient.executeAsync<any, any>({
        connectorOperation: {
          tableName: 'commondataserviceforapps',
          operationName: 'ListRecordsWithOrganization',
          parameters: {
            organization: orgUrl,
            entityName: ROLE_TABLE_ALIAS,
            '$select': 'cr52b_rolename,cr52b_jsondata,cr52b_jsonusers',
            '$top': 5000,
          },
        },
      } as any)

      if (withOrg?.success) return rowsFromPayload(withOrg.data)
      failures.push(describeFailure(withOrg, 'Organization-scoped Dataverse role lookup failed.'))
    } catch (error) {
      failures.push(error instanceof Error && error.message ? error.message : 'Organization-scoped Dataverse role lookup could not be completed.')
    }
  }

  try {
    const noOrg = await runtimeDataClient.executeAsync<any, any>({
      connectorOperation: {
        tableName: 'commondataserviceforapps',
        operationName: 'ListRecords',
        parameters: {
          entityName: ROLE_TABLE_ALIAS,
          '$select': 'cr52b_rolename,cr52b_jsondata,cr52b_jsonusers',
          '$top': 5000,
        },
      },
    } as any)

    if (noOrg?.success) return rowsFromPayload(noOrg.data)
    failures.push(describeFailure(noOrg, 'Dataverse role lookup failed.'))
  } catch (error) {
    failures.push(error instanceof Error && error.message ? error.message : 'Dataverse role lookup could not be completed.')
  }

  throw new Error(`Unable to load COMPASS role permissions. ${failures.join(' ')}`)
}

async function listRoleRowsLocal(): Promise<RawRoleRow[]> {
  const orgUrl = (import.meta.env.VITE_DATAVERSE_ORG_URL || '').toString().trim().replace(/\/$/, '')
  if (!orgUrl) return []

  const token = await ensureAuthToken()
  const headers = new Headers()
  headers.set('Accept', 'application/json')
  headers.set('OData-Version', '4.0')
  headers.set('OData-MaxVersion', '4.0')
  if (token) headers.set('Authorization', `Bearer ${token}`)

  const response = await fetch(
    `${orgUrl}/api/data/v9.2/${ROLE_TABLE_ALIAS}?$select=cr52b_rolename,cr52b_jsondata,cr52b_jsonusers&$top=5000`,
    {
      method: 'GET',
      credentials: 'include',
      headers,
    },
  )

  if (!response.ok) {
    return []
  }

  const payload = await response.json()
  return rowsFromPayload(payload)
}

async function listRoleRows(): Promise<RawRoleRow[]> {
  if (isLocalHost()) {
    return listRoleRowsLocal()
  }
  return listRoleRowsRuntime()
}

export async function loadRolePermissionsForUser(user: CompassUser): Promise<RolePermissionProfile[]> {
  const rows = await listRoleRows()
  if (!rows.length) return []

  const matchesByUsers = rows.filter((row) => userMatchesRole(user, row.cr52b_jsonusers))
  const matchingRows = matchesByUsers.length
    ? matchesByUsers
    : rows.filter((row) => {
        const roleName = normalize(row.cr52b_rolename)
        return roleName === normalize(user.rawRole || '') || roleName === normalize(user.role)
      })

  return matchingRows
    .map((row) => ({
      roleName: asString(row.cr52b_rolename) || 'Unnamed Role',
      entries: mapEntriesFromJsonData(row.cr52b_jsondata),
    }))
    .filter((profile) => profile.entries.length > 0 || normalize(profile.roleName) === 'reporting')
}

// Preview assignments must be matched by this user's email/ID only. Never
// fall back to a generic role or the signed-in administrator's role name.
export async function loadAssignedRolePermissionsForUser(user: CompassUser): Promise<RolePermissionProfile[]> {
  const rows = await listRoleRows()
  return rows.filter((row) => userMatchesRole(user, row.cr52b_jsonusers)).map((row) => ({
    roleName: asString(row.cr52b_rolename) || 'Unnamed Role',
    entries: mapEntriesFromJsonData(row.cr52b_jsondata),
  }))
}

export async function loadRoleTablePullForUser(user: CompassUser): Promise<RoleTablePullRow[]> {
  const rows = await listRoleRows()
  return rows.map((row) => ({
    roleName: asString(row.cr52b_rolename) || 'Unnamed Role',
    jsonUsersRaw: asString(row.cr52b_jsonusers),
    jsonDataRaw: asString(row.cr52b_jsondata),
    matchedByEmail: userMatchesRoleByEmail(user, row.cr52b_jsonusers),
    matchedById: userMatchesRoleById(user, row.cr52b_jsonusers),
  }))
}
