import { getClient } from '@microsoft/power-apps/data'
import { dataSourcesInfo } from '../../.power/schemas/appschemas/dataSourcesInfo'
import { ensureAuthToken, getAuthToken } from './auth'

const ROLE_TABLE_ALIAS = 'cr52b_compassroletables'
const ROLE_TABLE_ID_FIELD = 'cr52b_compassroletableid'
const PERMISSION_ORDER = ['view', 'search', 'create', 'edit', 'ignore program assignment'] as const

type PermissionName = (typeof PERMISSION_ORDER)[number]
type RoleColumnMap = Record<PermissionName, number>

type ParsedRolePayload = {
  roleName: string
  jsonData: string
}

type AppUserRecord = {
  id: string
  email: string
  name: string
  role: string
  source: 'mg_appuserses' | 'ithd_userses'
}

export type RoleImportSummary = {
  imported: number
  created: number
  updated: number
  skipped: number
  roleNames: string[]
}

const runtimeDataClient = getClient(dataSourcesInfo as any)

function normalizeText(value: unknown): string {
  return String(value || '').trim()
}

function normalizeKey(value: unknown): string {
  return normalizeText(value).toLowerCase()
}

function isLocalHost(): boolean {
  if (typeof window === 'undefined') return false
  const host = window.location.hostname
  return host === 'localhost' || host === '127.0.0.1'
}

function rowsFromPayload(payload: any): any[] {
  if (Array.isArray(payload)) return payload
  if (Array.isArray(payload?.value)) return payload.value
  return []
}

function toPermissionName(value: unknown): PermissionName | null {
  const raw = normalizeKey(value)
  if (raw === 'view' || raw === 'visibility') return 'view'
  if (raw === 'search') return 'search'
  if (raw === 'create') return 'create'
  if (raw === 'edit') return 'edit'
  if (raw === 'ignore program assignment' || raw === 'ignore assignment') return 'ignore program assignment'
  return null
}

function toMarker(value: unknown): string {
  const raw = normalizeKey(value)
  if (!raw) return ''
  if (raw === 'x' || raw === 'y' || raw === 'yes' || raw === 'true' || raw === '1') return 'x'
  return ''
}

const MAX_ROLE_WORKBOOK_BYTES = 10 * 1024 * 1024

export async function parseRoleWorkbook(data: ArrayBuffer): Promise<ParsedRolePayload[]> {
  if (!data.byteLength || data.byteLength > MAX_ROLE_WORKBOOK_BYTES) throw new Error('Role workbook must be nonempty and no larger than 10 MB.')
  const XLSX = await import('xlsx')
  const wb = XLSX.read(data, { type: 'array' })
  const firstSheet = wb.SheetNames[0]
  if (!firstSheet || !wb.Sheets[firstSheet]) throw new Error('Workbook has no sheets.')
  const rows = XLSX.utils.sheet_to_json(wb.Sheets[firstSheet], { header: 1, defval: '', raw: false }) as Array<Array<unknown>>
  if (rows.length > 20000 || rows.some((row) => row.length > 2000)) throw new Error('Role workbook exceeds the supported 20,000 rows or 2,000 columns; no roles were imported.')
  return buildRolePayloads(rows)
}

function parseWorkbookRows(file: File): Promise<ParsedRolePayload[]> {
  if (file.size > MAX_ROLE_WORKBOOK_BYTES) return Promise.reject(new Error('Role workbook must be no larger than 10 MB.'))
  return new Promise((resolve, reject) => {
    const reader = new FileReader()
    reader.onload = () => {
      try {
        void parseRoleWorkbook(reader.result as ArrayBuffer).then(resolve, reject)
      } catch (error) {
        reject(error)
      }
    }
    reader.onerror = () => reject(new Error('Failed to read workbook file.'))
    reader.readAsArrayBuffer(file)
  })
}

function buildRoleColumnMaps(rows: Array<Array<unknown>>): Map<string, RoleColumnMap> {
  const top = rows[0] || []
  const permissions = rows[1] || []

  const byRole = new Map<string, RoleColumnMap>()
  let currentRole = ''

  for (let col = 1; col < Math.max(top.length, permissions.length); col++) {
    const roleCell = normalizeText(top[col])
    if (roleCell) currentRole = roleCell
    if (!currentRole) continue

    const permName = toPermissionName(permissions[col])
    if (!permName) continue

    const existing = byRole.get(currentRole) || {
      view: -1,
      search: -1,
      create: -1,
      edit: -1,
      'ignore program assignment': -1,
    }

    if (existing[permName] < 0) {
      existing[permName] = col
    }
    byRole.set(currentRole, existing)
  }

  return byRole
}

function buildRolePayloads(rows: Array<Array<unknown>>): ParsedRolePayload[] {
  if (rows.length < 3) {
    throw new Error('Roles worksheet must include header rows and at least one form row.')
  }

  const roleColumns = buildRoleColumnMaps(rows)
  if (!roleColumns.size) {
    throw new Error('No role columns detected. Check header row formatting in roles.xlsx.')
  }

  const roleJsonByName = new Map<string, Record<string, string[]>>()
  for (const roleName of roleColumns.keys()) {
    roleJsonByName.set(roleName, Object.create(null))
  }

  for (let rowIndex = 2; rowIndex < rows.length; rowIndex++) {
    const row = rows[rowIndex] || []
    const formName = normalizeText(row[0])
    if (!formName) continue

    for (const [roleName, colMap] of roleColumns.entries()) {
      const markers = PERMISSION_ORDER.map((perm) => {
        const col = colMap[perm]
        if (col < 0) return ''
        return toMarker(row[col])
      })
      const target = roleJsonByName.get(roleName)
      if (target) target[formName] = markers
    }
  }

  return Array.from(roleJsonByName.entries()).map(([roleName, formMap]) => ({
    roleName,
    jsonData: JSON.stringify(formMap),
  }))
}

function escapeODataLiteral(text: string): string {
  return text.replace(/'/g, "''")
}

async function dataverseRequest<T>(url: string, token?: string, init?: RequestInit): Promise<T> {
  const headers = new Headers(init?.headers)
  headers.set('Accept', 'application/json')
  headers.set('OData-Version', '4.0')
  headers.set('OData-MaxVersion', '4.0')
  if (token) headers.set('Authorization', `Bearer ${token}`)

  const response = await fetch(url, {
    ...init,
    credentials: 'include',
    headers,
  })

  if (!response.ok) {
    const bodyText = await response.text()
    if (response.status === 401 || response.status === 403) {
      throw new Error('Dataverse authorization failed. Open the app from the Power host and click Detect Logged-In User, then retry import.')
    }
    throw new Error(`Dataverse request failed (${response.status}): ${bodyText || response.statusText}`)
  }

  if (response.status === 204) return undefined as T
  return (await response.json()) as T
}

async function listRecordsRuntime(entityName: string, options?: { select?: string; top?: number; filter?: string }): Promise<any[]> {
  const top = options?.top || 5000
  const orgUrl = (import.meta.env.VITE_DATAVERSE_ORG_URL || '').toString().trim().replace(/\/$/, '')
  const token = getAuthToken()

  if (orgUrl) {
    try {
      const paramsWithOrg: any = { organization: orgUrl, entityName, '$top': top }
      if (options?.select) paramsWithOrg.$select = options.select
      if (options?.filter) paramsWithOrg.$filter = options.filter
      if (token) paramsWithOrg.token = token

      const withOrg = await runtimeDataClient.executeAsync<any, any>({
        connectorOperation: {
          tableName: 'commondataserviceforapps',
          operationName: 'ListRecordsWithOrganization',
          parameters: paramsWithOrg,
        },
      } as any)

      if (withOrg?.success) return rowsFromPayload(withOrg.data)
    } catch {
      // fall through
    }
  }

  try {
    const paramsNoOrg: any = { entityName, '$top': top }
    if (options?.select) paramsNoOrg.$select = options.select
    if (options?.filter) paramsNoOrg.$filter = options.filter
    if (token) paramsNoOrg.token = token

    const noOrg = await runtimeDataClient.executeAsync<any, any>({
      connectorOperation: {
        tableName: 'commondataserviceforapps',
        operationName: 'ListRecords',
        parameters: paramsNoOrg,
      },
    } as any)

    if (noOrg?.success) return rowsFromPayload(noOrg.data)
  } catch {
    // no-op
  }

  return []
}

async function createRecordRuntime(entityName: string, item: Record<string, unknown>): Promise<{ ok: boolean; error?: string }> {
  const orgUrl = (import.meta.env.VITE_DATAVERSE_ORG_URL || '').toString().trim().replace(/\/$/, '')
  const token = getAuthToken()

  if (orgUrl) {
    try {
      const paramsWithOrg: any = { organization: orgUrl, entityName, item }
      if (token) paramsWithOrg.token = token
      const withOrg = await runtimeDataClient.executeAsync<any, any>({
        connectorOperation: {
          tableName: 'commondataserviceforapps',
          operationName: 'CreateRecordWithOrganization',
          parameters: paramsWithOrg,
        },
      } as any)
      if (withOrg?.success) return { ok: true }
      if (withOrg && withOrg.success === false) {
        return { ok: false, error: JSON.stringify(withOrg) }
      }
    } catch {
      // fall through
    }
  }

  try {
    const paramsNoOrg: any = { entityName, item }
    if (token) paramsNoOrg.token = token
    const noOrg = await runtimeDataClient.executeAsync<any, any>({
      connectorOperation: {
        tableName: 'commondataserviceforapps',
        operationName: 'CreateRecord',
        parameters: paramsNoOrg,
      },
    } as any)
    if (noOrg?.success) return { ok: true }
    return { ok: false, error: noOrg ? JSON.stringify(noOrg) : 'Unknown runtime create failure.' }
  } catch {
    return { ok: false, error: 'Runtime create operation threw an exception.' }
  }
}

async function updateRecordRuntime(entityName: string, recordId: string, item: Record<string, unknown>): Promise<{ ok: boolean; error?: string }> {
  const orgUrl = (import.meta.env.VITE_DATAVERSE_ORG_URL || '').toString().trim().replace(/\/$/, '')
  const token = getAuthToken()

  if (orgUrl) {
    try {
      const paramsWithOrg: any = { organization: orgUrl, entityName, recordId, item }
      if (token) paramsWithOrg.token = token
      const withOrg = await runtimeDataClient.executeAsync<any, any>({
        connectorOperation: {
          tableName: 'commondataserviceforapps',
          operationName: 'UpdateOnlyRecordWithOrganization',
          parameters: paramsWithOrg,
        },
      } as any)
      if (withOrg?.success) return { ok: true }
      if (withOrg && withOrg.success === false) {
        return { ok: false, error: JSON.stringify(withOrg) }
      }
    } catch {
      // fall through
    }
  }

  try {
    const paramsNoOrg: any = { entityName, recordId, item }
    if (token) paramsNoOrg.token = token
    const noOrg = await runtimeDataClient.executeAsync<any, any>({
      connectorOperation: {
        tableName: 'commondataserviceforapps',
        operationName: 'UpdateOnlyRecord',
        parameters: paramsNoOrg,
      },
    } as any)
    if (noOrg?.success) return { ok: true }
    return { ok: false, error: noOrg ? JSON.stringify(noOrg) : 'Unknown runtime update failure.' }
  } catch {
    return { ok: false, error: 'Runtime update operation threw an exception.' }
  }
}

async function findExistingRoleRecord(orgUrl: string, token: string, roleName: string): Promise<string | null> {
  if (!isLocalHost()) {
    const filter = `cr52b_rolename eq '${escapeODataLiteral(roleName)}'`
    const rows = await listRecordsRuntime(ROLE_TABLE_ALIAS, {
      select: ROLE_TABLE_ID_FIELD,
      filter,
      top: 1,
    })
    const first = rows?.[0]
    if (!first) return null
    return normalizeText(first[ROLE_TABLE_ID_FIELD] || first.id || first[`${ROLE_TABLE_ALIAS}id`]) || null
  }

  const filter = encodeURIComponent(`cr52b_rolename eq '${escapeODataLiteral(roleName)}'`)
  const url = `${orgUrl}/api/data/v9.2/${ROLE_TABLE_ALIAS}?$select=${ROLE_TABLE_ID_FIELD}&$top=1&$filter=${filter}`
  const payload = await dataverseRequest<{ value: Array<Record<string, unknown>> }>(url, token)
  const first = payload?.value?.[0]
  if (!first) return null
  return normalizeText(first[ROLE_TABLE_ID_FIELD]) || null
}

async function fetchAppUsers(orgUrl: string, token: string): Promise<AppUserRecord[]> {
  const aliases: Array<'mg_appuserses' | 'ithd_userses'> = ['mg_appuserses', 'ithd_userses']
  const rows: AppUserRecord[] = []

  for (const alias of aliases) {
    try {
      const sourceRows = isLocalHost()
        ? (await dataverseRequest<{ value: Array<Record<string, unknown>> }>(
            `${orgUrl}/api/data/v9.2/${alias}?$select=mg_userid,mg_email,mg_name,mg_role,ithd_userid,ithd_email,ithd_name,ithd_role&$top=5000`,
            token,
          ))?.value || []
        : await listRecordsRuntime(alias, {
            select: 'mg_userid,mg_email,mg_name,mg_role,ithd_userid,ithd_email,ithd_name,ithd_role',
            top: 5000,
          })

      for (const row of sourceRows || []) {
        const id = normalizeText(row.mg_userid || row.ithd_userid || row[`${alias}id`] || row.id)
        const email = normalizeText(row.mg_email || row.ithd_email || row.email || row.internalemailaddress)
        const name = normalizeText(row.mg_name || row.ithd_name || row.fullname || row.name || row.displayname)
        const role = normalizeText(row.mg_role || row.ithd_role || row.role)
        if (!id && !email) continue
        rows.push({ id, email, name, role, source: alias })
      }
    } catch {
      // Continue when one of the user aliases is unavailable in this environment.
    }
  }

  return rows
}

function buildJsonUsers(roleName: string, appUsers: AppUserRecord[]): string {
  const key = normalizeKey(roleName)
  const matched = appUsers
    .filter((u) => normalizeKey(u.role) === key)
    .map((u) => ({ id: u.id, email: u.email, name: u.name, source: u.source }))

  return JSON.stringify(matched)
}

export async function importRolesWorkbook(file: File): Promise<RoleImportSummary> {
  const orgUrl = (import.meta.env.VITE_DATAVERSE_ORG_URL || '').toString().trim().replace(/\/$/, '')
  if (!orgUrl) {
    throw new Error('Missing VITE_DATAVERSE_ORG_URL. Set it in your environment before importing roles.')
  }

  const token = await ensureAuthToken()
  const rolePayloads = await parseWorkbookRows(file)
  const appUsers = await fetchAppUsers(orgUrl, token)

  let created = 0
  let updated = 0
  let skipped = 0
  const importedNames: string[] = []

  for (const roleItem of rolePayloads) {
    const roleName = normalizeText(roleItem.roleName)
    if (!roleName) {
      skipped++
      continue
    }

    const payload = {
      cr52b_rolename: roleName,
      cr52b_jsondata: roleItem.jsonData,
      cr52b_jsonusers: buildJsonUsers(roleName, appUsers),
    }

    const existingId = await findExistingRoleRecord(orgUrl, token, roleName)
    if (existingId) {
      if (!isLocalHost()) {
        const result = await updateRecordRuntime(ROLE_TABLE_ALIAS, existingId, payload)
        if (!result.ok) {
          throw new Error(`Failed to update role '${roleName}' via runtime Dataverse connector. ${result.error || ''}`.trim())
        }
      } else {
        await dataverseRequest<void>(`${orgUrl}/api/data/v9.2/${ROLE_TABLE_ALIAS}(${existingId})`, token, {
          method: 'PATCH',
          headers: { 'Content-Type': 'application/json' },
          body: JSON.stringify(payload),
        })
      }
      updated++
    } else {
      if (!isLocalHost()) {
        const result = await createRecordRuntime(ROLE_TABLE_ALIAS, payload)
        if (!result.ok) {
          throw new Error(`Failed to create role '${roleName}' via runtime Dataverse connector. ${result.error || ''}`.trim())
        }
      } else {
        await dataverseRequest<void>(`${orgUrl}/api/data/v9.2/${ROLE_TABLE_ALIAS}`, token, {
          method: 'POST',
          headers: { 'Content-Type': 'application/json' },
          body: JSON.stringify(payload),
        })
      }
      created++
    }

    importedNames.push(roleName)
  }

  return {
    imported: importedNames.length,
    created,
    updated,
    skipped,
    roleNames: importedNames,
  }
}
