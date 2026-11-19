import type { CompassRole, CompassUser, RoleLookupResult } from '../types/auth'

const STORAGE_KEY = 'compass_auth_user'
const AUTH_TOKEN_KEY = 'compass_auth_token'

const ROLE_TABLE_ALIASES = ['mg_appuserses', 'ithd_userses'] as const

type PowerUser = {
  email?: string
  userPrincipalName?: string
  objectId?: string
  id?: string
  fullName?: string
  name?: string
}

type PowerContextLike = {
  user?: PowerUser
  authentication?: {
    accessToken?: string
    token?: string
  }
  auth?: {
    accessToken?: string
    token?: string
  }
  accessToken?: string
  token?: string
}

type DirectoryRow = {
  id: string
  email: string
  name: string
  rawRole: string
  role: CompassRole
  source: (typeof ROLE_TABLE_ALIASES)[number]
}

function normalizeRole(value: unknown): CompassRole {
  const raw = String(value || '').trim().toLowerCase()
  if (raw === 'superadmin' || raw === 'super admin') return 'superadmin'
  if (raw === 'admin' || raw === 'administrator') return 'admin'
  if (raw === 'manager' || raw === 'mgr') return 'manager'
  if (raw === 'user' || raw === 'staff') return 'user'
  return 'guest'
}

function normalizeKey(value?: string): string {
  return String(value || '').trim().toLowerCase()
}

function parseCsv(value?: string): string[] {
  return String(value || '')
    .split(',')
    .map((entry) => entry.trim().toLowerCase())
    .filter(Boolean)
}

function applyRoleOverride(user: CompassUser): CompassUser {
  const superAdminEmails = parseCsv((import.meta.env.VITE_SUPER_ADMIN_EMAILS as string) || '')
  const superAdminObjectIds = parseCsv((import.meta.env.VITE_SUPER_ADMIN_OBJECT_IDS as string) || '')
  const isSuperAdmin =
    (!!normalizeKey(user.email) && superAdminEmails.includes(normalizeKey(user.email))) ||
    (!!normalizeKey(user.id) && superAdminObjectIds.includes(normalizeKey(user.id)))

  if (isSuperAdmin) {
    return { ...user, role: 'superadmin' }
  }

  return user
}

function getStoredUser(): CompassUser | null {
  try {
    const stored = localStorage.getItem(STORAGE_KEY)
    if (!stored) return null
    return applyRoleOverride(JSON.parse(stored) as CompassUser)
  } catch {
    localStorage.removeItem(STORAGE_KEY)
    return null
  }
}

function getFallbackUser(): CompassUser {
  return applyRoleOverride({
    id: 'local-user',
    name: 'Local User',
    email: '',
    role: 'user',
    roleSource: 'fallback',
  })
}

async function detectPowerUser(): Promise<PowerUser | null> {
  if (typeof window === 'undefined') return null

  try {
    const appModule = await import('@microsoft/power-apps/app')
    if (appModule && typeof (appModule as any).getContext === 'function') {
      const context = (await (appModule as any).getContext()) as PowerContextLike | null
      const user = context?.user
      if (user) return user
    }
  } catch {
    // fall through to browser globals
  }

  const w = window as typeof window & {
    PowerApps?: { context?: { user?: PowerUser } }
    powerAppsContext?: { user?: PowerUser }
    __POWER_CONTEXT__?: { user?: PowerUser }
  }

  return w.PowerApps?.context?.user || w.powerAppsContext?.user || w.__POWER_CONTEXT__?.user || null
}

async function readPowerUser(): Promise<CompassUser | null> {
  const powerUser = await detectPowerUser()
  if (!powerUser) return null

  const email = String(powerUser.email || powerUser.userPrincipalName || '').trim()
  const id = String(powerUser.objectId || powerUser.id || email || 'power-user').trim()
  const name = String(powerUser.fullName || powerUser.name || email || 'Power User').trim()

  return applyRoleOverride({
    id,
    email,
    name,
    role: 'user',
    rawRole: '',
    roleSource: 'fallback',
  })
}

async function readAliasRows(alias: (typeof ROLE_TABLE_ALIASES)[number], token: string): Promise<DirectoryRow[]> {
  const orgUrl = (import.meta.env.VITE_DATAVERSE_ORG_URL || '').toString().trim().replace(/\/$/, '')
  if (!orgUrl || !token) return []

  const response = await fetch(`${orgUrl}/api/data/v9.2/${alias}?$select=mg_userid,mg_email,mg_name,mg_role,ithd_userid,ithd_email,ithd_name,ithd_role&$top=5000`, {
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
      const id = String(row.mg_userid || row.ithd_userid || row[`${alias}id`] || row.id || '').trim()
      const email = String(row.mg_email || row.ithd_email || row.email || row.internalemailaddress || '').trim()
      const name = String(row.mg_name || row.ithd_name || row.fullname || row.name || row.displayname || '').trim()
      const rawRole = String(row.mg_role || row.ithd_role || row.role || '').trim()
      const role = normalizeRole(rawRole)

      return { id, email, name, rawRole, role, source: alias }
    })
    .filter((row) => !!row.id || !!row.email)
}

export function getAuthToken(): string {
  if (typeof window === 'undefined') return ''

  const keys = [AUTH_TOKEN_KEY, 'compass_auth_token', 'inventory_auth_token', 'auth_token']
  for (const key of keys) {
    const value = localStorage.getItem(key) || sessionStorage.getItem(key)
    if (value && value.trim()) return value.trim()
  }

  return ''
}

export async function ensureAuthToken(): Promise<string> {
  const existing = getAuthToken()
  if (existing) return existing

  try {
    const appModule = await import('@microsoft/power-apps/app')
    if (appModule && typeof (appModule as any).getSecret === 'function') {
      const secretNames = ['dataverse_access_token', 'access_token', 'graph_access_token']
      for (const secretName of secretNames) {
        try {
          const candidate = await (appModule as any).getSecret(secretName)
          const token = String(candidate || '').trim()
          if (!token) continue
          try {
            localStorage.setItem(AUTH_TOKEN_KEY, token)
          } catch {
            // no-op
          }
          return token
        } catch {
          // continue to next secret name
        }
      }
    }

    if (appModule && typeof (appModule as any).getToken === 'function') {
      try {
        const candidate = await (appModule as any).getToken()
        const token = String(candidate || '').trim()
        if (token) {
          try {
            localStorage.setItem(AUTH_TOKEN_KEY, token)
          } catch {
            // no-op
          }
          return token
        }
      } catch {
        // no-op
      }
    }

    if (appModule && typeof (appModule as any).getContext === 'function') {
      const context = (await (appModule as any).getContext()) as PowerContextLike | null
      const candidates = [
        context?.authentication?.accessToken,
        context?.authentication?.token,
        context?.auth?.accessToken,
        context?.auth?.token,
        context?.accessToken,
        context?.token,
      ]

      for (const candidate of candidates) {
        const token = String(candidate || '').trim()
        if (!token) continue
        try {
          localStorage.setItem(AUTH_TOKEN_KEY, token)
        } catch {
          // no-op
        }
        return token
      }
    }
  } catch {
    // no-op
  }

  // Final storage sweep in case host code hydrated a token after initial checks.
  const lateStored = getAuthToken()
  if (lateStored) return lateStored

  return ''
}

function compareKey(value: string): string {
  return String(value || '').trim().toLowerCase()
}

async function resolveRoleForUser(user: Pick<CompassUser, 'id' | 'email'>): Promise<RoleLookupResult> {
  const token = getAuthToken()
  if (!token) {
    return { resolvedRole: 'user', source: 'fallback' }
  }

  const results = await Promise.allSettled(ROLE_TABLE_ALIASES.map((alias) => readAliasRows(alias, token)))
  const rows = results.flatMap((result) => (result.status === 'fulfilled' ? result.value : []))

  const idKey = compareKey(user.id)
  const emailKey = compareKey(user.email)

  const match = rows.find((row) => {
    const rowId = compareKey(row.id)
    const rowEmail = compareKey(row.email)
    return (!!idKey && rowId === idKey) || (!!emailKey && rowEmail === emailKey)
  })

  if (match) {
    return {
      resolvedRole: match.role,
      rawRole: match.rawRole,
      source: match.source,
    }
  }

  return { resolvedRole: 'user', source: 'fallback' }
}

export function getCurrentUser(): CompassUser {
  return getStoredUser() || getFallbackUser()
}

export function setCurrentUser(user: CompassUser) {
  const normalized = applyRoleOverride({ ...user, role: normalizeRole(user.role) })
  localStorage.setItem(STORAGE_KEY, JSON.stringify(normalized))
  try {
    window.dispatchEvent(new CustomEvent('compass:authChanged', { detail: normalized }))
  } catch {
    // ignore
  }
}

export async function initializeAuthFromPower(): Promise<CompassUser> {
  if (typeof window === 'undefined') {
    return getFallbackUser()
  }

  const powerUser = await readPowerUser()
  if (!powerUser) {
    const localUser = getCurrentUser()
    setCurrentUser(localUser)
    return localUser
  }

  let role = powerUser.role
  let resolvedRawRole = powerUser.rawRole || ''
  try {
    const roleResult = await resolveRoleForUser(powerUser)
    if (roleResult.resolvedRole && roleResult.resolvedRole !== 'guest') {
      role = roleResult.resolvedRole
    }
    resolvedRawRole = roleResult.rawRole || resolvedRawRole
  } catch {
    // keep power role / fallback role
  }

  const resolved = applyRoleOverride({
    ...powerUser,
    role,
    rawRole: resolvedRawRole,
    roleSource: 'power',
  })

  setCurrentUser(resolved)
  return resolved
}