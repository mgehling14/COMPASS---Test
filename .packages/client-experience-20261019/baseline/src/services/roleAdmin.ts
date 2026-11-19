import { getClient } from '@microsoft/power-apps/data'
import { dataSourcesInfo } from '../../.power/schemas/appschemas/dataSourcesInfo'
import { ensureAuthToken, getAuthToken } from './auth'

const ROLE_TABLE_ALIAS = 'cr52b_compassroletables'
const ROLE_TABLE_ID_FIELD = 'cr52b_compassroletableid'
const runtimeDataClient = getClient(dataSourcesInfo as any)

type RoleRowPayload = {
  cr52b_rolename: string
  cr52b_jsonusers: string
  cr52b_jsondata: string
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

function normalize(value: unknown): string {
  return String(value || '').trim().toLowerCase()
}

async function listRowsRuntime(): Promise<any[]> {
  const orgUrl = (import.meta.env.VITE_DATAVERSE_ORG_URL || '').toString().trim().replace(/\/$/, '')
  const token = getAuthToken()

  if (orgUrl) {
    try {
      const withOrg = await runtimeDataClient.executeAsync<any, any>({
        connectorOperation: {
          tableName: 'commondataserviceforapps',
          operationName: 'ListRecordsWithOrganization',
          parameters: {
            organization: orgUrl,
            entityName: ROLE_TABLE_ALIAS,
            '$select': ROLE_TABLE_ID_FIELD + ',cr52b_rolename,cr52b_jsonusers,cr52b_jsondata',
            '$top': 5000,
            ...(token ? { token } : {}),
          },
        },
      } as any)

      if (withOrg?.success) return rowsFromPayload(withOrg.data)
    } catch {
      // fall through
    }
  }

  try {
    const noOrg = await runtimeDataClient.executeAsync<any, any>({
      connectorOperation: {
        tableName: 'commondataserviceforapps',
        operationName: 'ListRecords',
        parameters: {
          entityName: ROLE_TABLE_ALIAS,
          '$select': ROLE_TABLE_ID_FIELD + ',cr52b_rolename,cr52b_jsonusers,cr52b_jsondata',
          '$top': 5000,
          ...(token ? { token } : {}),
        },
      },
    } as any)

    if (noOrg?.success) return rowsFromPayload(noOrg.data)
  } catch {
    // no-op
  }

  return []
}

async function listRowsLocal(): Promise<any[]> {
  const orgUrl = (import.meta.env.VITE_DATAVERSE_ORG_URL || '').toString().trim().replace(/\/$/, '')
  const token = await ensureAuthToken()
  if (!orgUrl) return []

  const headers = new Headers()
  headers.set('Accept', 'application/json')
  headers.set('OData-Version', '4.0')
  headers.set('OData-MaxVersion', '4.0')
  if (token) headers.set('Authorization', `Bearer ${token}`)

  const response = await fetch(
    `${orgUrl}/api/data/v9.2/${ROLE_TABLE_ALIAS}?$select=${ROLE_TABLE_ID_FIELD},cr52b_rolename,cr52b_jsonusers,cr52b_jsondata&$top=5000`,
    {
      method: 'GET',
      credentials: 'include',
      headers,
    },
  )

  if (!response.ok) return []
  const payload = await response.json()
  return rowsFromPayload(payload)
}

async function updateRuntime(recordId: string, payload: RoleRowPayload): Promise<void> {
  const orgUrl = (import.meta.env.VITE_DATAVERSE_ORG_URL || '').toString().trim().replace(/\/$/, '')
  const token = getAuthToken()

  const tryUpdate = async (operationName: string, parameters: Record<string, unknown>) => {
    const result = await runtimeDataClient.executeAsync<any, any>({
      connectorOperation: {
        tableName: 'commondataserviceforapps',
        operationName,
        parameters,
      },
    } as any)
    if (!result?.success) {
      throw new Error(JSON.stringify(result || {}))
    }
  }

  if (orgUrl) {
    try {
      await tryUpdate('UpdateOnlyRecordWithOrganization', {
        organization: orgUrl,
        entityName: ROLE_TABLE_ALIAS,
        recordId,
        item: payload,
        ...(token ? { token } : {}),
      })
      return
    } catch {
      // fall through
    }
  }

  await tryUpdate('UpdateOnlyRecord', {
    entityName: ROLE_TABLE_ALIAS,
    recordId,
    item: payload,
    ...(token ? { token } : {}),
  })
}

async function createRuntime(payload: RoleRowPayload): Promise<void> {
  const orgUrl = (import.meta.env.VITE_DATAVERSE_ORG_URL || '').toString().trim().replace(/\/$/, '')
  const token = getAuthToken()

  const tryCreate = async (operationName: string, parameters: Record<string, unknown>) => {
    const result = await runtimeDataClient.executeAsync<any, any>({
      connectorOperation: {
        tableName: 'commondataserviceforapps',
        operationName,
        parameters,
      },
    } as any)
    if (!result?.success) {
      throw new Error(JSON.stringify(result || {}))
    }
  }

  if (orgUrl) {
    try {
      await tryCreate('CreateRecordWithOrganization', { prefer: 'return=representation', accept: 'application/json', 
        organization: orgUrl,
        entityName: ROLE_TABLE_ALIAS,
        item: payload,
        ...(token ? { token } : {}),
      })
      return
    } catch {
      // fall through
    }
  }

  await tryCreate('CreateRecord', { prefer: 'return=representation', accept: 'application/json', 
    entityName: ROLE_TABLE_ALIAS,
    item: payload,
    ...(token ? { token } : {}),
  })
}

export async function saveRoleRow(originalRoleName: string, payload: RoleRowPayload): Promise<void> {
  const roleName = normalize(originalRoleName)
  if (!roleName) throw new Error('Missing role name.')

  if (isLocalHost()) {
    const token = await ensureAuthToken()
    const orgUrl = (import.meta.env.VITE_DATAVERSE_ORG_URL || '').toString().trim().replace(/\/$/, '')
    if (!orgUrl || !token) throw new Error('Missing Dataverse connection info.')

    const headers = new Headers()
    headers.set('Accept', 'application/json')
    headers.set('Content-Type', 'application/json')
    headers.set('OData-Version', '4.0')
    headers.set('OData-MaxVersion', '4.0')
    headers.set('Authorization', `Bearer ${token}`)

    const rowsResponse = await fetch(
      `${orgUrl}/api/data/v9.2/${ROLE_TABLE_ALIAS}?$select=${ROLE_TABLE_ID_FIELD},cr52b_rolename&$filter=cr52b_rolename eq '${originalRoleName.replace(/'/g, "''")}'&$top=1`,
      {
        method: 'GET',
        credentials: 'include',
        headers,
      },
    )

    let existingId = ''
    if (rowsResponse.ok) {
      const rows = rowsFromPayload(await rowsResponse.json())
      existingId = String(rows?.[0]?.[ROLE_TABLE_ID_FIELD] || '').trim()
    }

    if (existingId) {
      const patchResponse = await fetch(`${orgUrl}/api/data/v9.2/${ROLE_TABLE_ALIAS}(${existingId})`, {
        method: 'PATCH',
        credentials: 'include',
        headers,
        body: JSON.stringify(payload),
      })
      if (!patchResponse.ok) throw new Error(await patchResponse.text())
      return
    }

    const postResponse = await fetch(`${orgUrl}/api/data/v9.2/${ROLE_TABLE_ALIAS}`, {
      method: 'POST',
      credentials: 'include',
      headers,
      body: JSON.stringify(payload),
    })
    if (!postResponse.ok) throw new Error(await postResponse.text())
    return
  }

  const rows = await listRowsRuntime()
  const existing = rows.find((row) => normalize(row.cr52b_rolename) === roleName)
  if (existing?.[ROLE_TABLE_ID_FIELD]) {
    await updateRuntime(String(existing[ROLE_TABLE_ID_FIELD]), payload)
    return
  }

  await createRuntime(payload)
}

export async function loadRoleRowsForAdmin(): Promise<Array<{ id: string; roleName: string; jsonUsersRaw: string; jsonDataRaw: string }>> {
  const rows = isLocalHost() ? await listRowsLocal() : await listRowsRuntime()
  return rows.map((row) => ({
    id: String(row[ROLE_TABLE_ID_FIELD] || row.id || '').trim(),
    roleName: String(row.cr52b_rolename || '').trim(),
    jsonUsersRaw: String(row.cr52b_jsonusers || '').trim(),
    jsonDataRaw: String(row.cr52b_jsondata || '').trim(),
  }))
}
