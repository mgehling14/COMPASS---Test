import type { CompassRole, CompassUser, RoleLookupResult } from '../types/auth'

const ROLE_TABLE_ALIASES = ['mg_appuserses', 'ithd_userses'] as const

type DirectoryRow = {
  id: string
  name: string
  email: string
  role: CompassRole
  tableAlias: (typeof ROLE_TABLE_ALIASES)[number]
}

function normalizeRole(value: unknown): CompassRole {
  const raw = String(value || '').trim().toLowerCase()
  if (raw === 'superadmin' || raw === 'super admin') return 'superadmin'
  if (raw === 'admin' || raw === 'administrator') return 'admin'
  if (raw === 'manager' || raw === 'mgr') return 'manager'
  if (raw === 'user' || raw === 'staff') return 'user'
  return 'guest'
}

function pick(row: Record<string, unknown>, keys: string[]): string {
  for (const key of keys) {
    const value = row[key]
    if (value !== undefined && value !== null && String(value).trim()) {
      return String(value).trim()
    }
  }
  return ''
}

function detectPowerUser(): { id: string; email: string; name: string } | null {
  if (typeof window === 'undefined') return null

  const w = window as any
  const candidates = [
    w?.PowerApps?.context?.user,
    w?.powerAppsContext?.user,
    w?.__POWER_CONTEXT__?.user,
  ]

  for (const candidate of candidates) {
    if (!candidate) continue

    const email = String(candidate.email || candidate.userPrincipalName || '').trim()
    const id = String(candidate.objectId || candidate.id || '').trim()
    const name = String(candidate.fullName || candidate.name || email || id).trim()

    if (email || id) {
      return {
        id: id || email,
        email,
        name: name || 'Compass User',
      }
    }
  }

  return null
}

function readFallbackUser(): { id: string; email: string; name: string } {
  const email = (import.meta.env.VITE_DEV_USER_EMAIL || 'demo.user@compass.local').toString().trim()
  const id = (import.meta.env.VITE_DEV_USER_ID || email).toString().trim()
  const name = (import.meta.env.VITE_DEV_USER_NAME || 'Compass Demo User').toString().trim()
  return { id, email, name }
}

function getAuthToken(): string {
  if (typeof window === 'undefined') return ''
  const keys = ['inventory_auth_token', 'compass_auth_token', 'auth_token']
  for (const key of keys) {
    const value = localStorage.getItem(key) || sessionStorage.getItem(key)
    if (value && value.trim()) return value.trim()
  }
  return ''
}

async function readAliasRows(alias: (typeof ROLE_TABLE_ALIASES)[number]): Promise<DirectoryRow[]> {
  const orgUrl = (import.meta.env.VITE_DATAVERSE_ORG_URL || '').toString().trim().replace(/\/$/, '')
  const token = getAuthToken()
  if (!orgUrl || !token) return []

  const selectColumns = [
    'mg_userid', 'mg_email', 'mg_name', 'mg_role',
    'ithd_userid', 'ithd_email', 'ithd_name', 'ithd_role',
  ].join(',')

  const response = await fetch(`${orgUrl}/api/data/v9.2/${alias}?$select=${selectColumns}&$top=5000`, {
    headers: {
      Accept: 'application/json',
      Authorization: `Bearer ${token}`,
      'OData-Version': '4.0',
      'OData-MaxVersion': '4.0',
    },
  })

  if (!response.ok) {
    throw new Error(`${alias} lookup failed (${response.status})`)
  }

  const payload = await response.json()
  const rows: Array<Record<string, unknown>> = Array.isArray(payload?.value) ? payload.value : []

  return rows
    .map((row) => {
      const id = pick(row, ['mg_userid', 'ithd_userid', `${alias}id`, 'id'])
      const email = pick(row, ['mg_email', 'ithd_email', 'email', 'internalemailaddress'])
      const name = pick(row, ['mg_name', 'ithd_name', 'fullname', 'name', 'displayname'])
      const roleRaw = pick(row, ['mg_role', 'ithd_role', 'role'])
      const role = normalizeRole(roleRaw)

      return {
        id,
        email,
        name,
        role,
        tableAlias: alias,
      }
    })
    .filter((row) => !!row.id || !!row.email)
}

function compareKey(value: string): string {
  return String(value || '').trim().toLowerCase()
}

export async function detectCurrentUser(): Promise<{ id: string; email: string; name: string }> {
  return detectPowerUser() || readFallbackUser()
}

export async function resolveRoleForUser(user: { id: string; email: string }): Promise<RoleLookupResult> {
  const results = await Promise.allSettled(ROLE_TABLE_ALIASES.map((alias) => readAliasRows(alias)))

  const allRows = results.flatMap((result) => {
    if (result.status === 'fulfilled') return result.value
    return []
  })

  const idKey = compareKey(user.id)
  const emailKey = compareKey(user.email)

  const match = allRows.find((row) => {
    const rowId = compareKey(row.id)
    const rowEmail = compareKey(row.email)
    return (!!idKey && rowId === idKey) || (!!emailKey && rowEmail === emailKey)
  })

  if (match) {
    return {
      resolvedRole: match.role,
      source: match.tableAlias,
    }
  }

  return {
    resolvedRole: 'user',
    source: 'fallback',
  }
}

export async function loadCompassUser(): Promise<CompassUser> {
  const baseUser = await detectCurrentUser()
  const roleResult = await resolveRoleForUser(baseUser)

  return {
    id: baseUser.id,
    email: baseUser.email,
    name: baseUser.name,
    role: roleResult.resolvedRole,
    roleSource: roleResult.source === 'fallback' ? 'fallback' : 'directory',
  }
}
