import { getClient } from '@microsoft/power-apps/data'
import { dataSourcesInfo } from '../../.power/schemas/appschemas/dataSourcesInfo'
import { ensureAuthToken, getAuthToken } from './auth'

const DEFAULT_DATAVERSE_ORG_URL = 'https://org1f466e4e.crm.dynamics.com'
const FORM_PICKLIST_TABLE_ALIAS = 'cmps_formpicklists'
const FORM_PICKLIST_ID_CANDIDATES = ['cmps_formpicklistid', 'cmps_formpicklistsid'] as const
const runtimeDataClient = getClient(dataSourcesInfo as any)

type PicklistType = 'drop down' | 'radio button' | 'checkboxes'

export type ResolvedPicklistField = {
  label: string
  options: string[]
  picklistType?: PicklistType
  active: boolean
}

export type ResolvedFormPicklistConfig = {
  formName: string
  fieldsByLabel: Record<string, ResolvedPicklistField>
}

export type FormPicklistAdminRow = {
  id: string
  formName: string
  jsonPickList: string
  jsonPickListOptions: string
  jsonPickListOptions2: string
  jsonPickListInfo: string
}

export type FormPicklistAdminPayload = {
  cmps_formname: string
  cmps_jsonpicklist: string
  cmps_jsonpicklistoptions: string
  cmps_jsonpicklistoptions2: string
  cmps_jsonpicklistinfo: string
}

function normalize(value: string): string {
  return String(value || '').trim().toLowerCase()
}

function sanitizeOrgUrl(value: unknown): string {
  return String(value || '').trim().replace(/\/$/, '')
}

function isLocalHost(): boolean {
  if (typeof window === 'undefined') return false
  const host = window.location.hostname
  return host === 'localhost' || host === '127.0.0.1'
}

function getDataverseOrgUrl(): string {
  return sanitizeOrgUrl(import.meta.env.VITE_DATAVERSE_ORG_URL || DEFAULT_DATAVERSE_ORG_URL)
}

function rowsFromPayload(payload: any): any[] {
  if (Array.isArray(payload)) return payload
  if (Array.isArray(payload?.value)) return payload.value
  return []
}

function parseJsonValue<T>(value: unknown, fallback: T): T {
  if (value === null || value === undefined) return fallback
  const text = String(value || '').trim()
  if (!text) return fallback

  try {
    return JSON.parse(text) as T
  } catch {
    return fallback
  }
}

function escapeODataString(value: string): string {
  return String(value || '').replace(/'/g, "''")
}

function stringValue(row: Record<string, unknown>, key: string): string {
  const value = row[key]
  if (value === null || value === undefined) return ''
  return String(value).trim()
}

function resolveRowId(row: Record<string, unknown>): string {
  for (const key of FORM_PICKLIST_ID_CANDIDATES) {
    const value = stringValue(row, key)
    if (value) return value
  }

  for (const [key, rawValue] of Object.entries(row)) {
    if (!/id$/i.test(key)) continue
    const value = String(rawValue || '').trim()
    if (!value) continue
    if (/^[0-9a-fA-F-]{36}$/.test(value)) return value
  }

  return ''
}

async function listFormPicklistRowsRuntime(): Promise<any[]> {
  const orgUrl = sanitizeOrgUrl(import.meta.env.VITE_DATAVERSE_ORG_URL || '')
  const token = getAuthToken()
  const select = 'cmps_formname,cmps_jsonpicklist,cmps_jsonpicklistoptions,cmps_jsonpicklistoptions2,cmps_jsonpicklistinfo'

  if (orgUrl) {
    try {
      const withOrg = await runtimeDataClient.executeAsync<any, any>({
        connectorOperation: {
          tableName: 'commondataserviceforapps',
          operationName: 'ListRecordsWithOrganization',
          parameters: {
            organization: orgUrl,
            entityName: FORM_PICKLIST_TABLE_ALIAS,
            '$select': select,
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
          entityName: FORM_PICKLIST_TABLE_ALIAS,
          '$select': select,
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

async function listFormPicklistRowsLocal(): Promise<any[]> {
  const orgUrl = sanitizeOrgUrl(import.meta.env.VITE_DATAVERSE_ORG_URL || '')
  const token = await ensureAuthToken()
  if (!orgUrl || !token) return []

  const headers = new Headers()
  headers.set('Accept', 'application/json')
  headers.set('OData-Version', '4.0')
  headers.set('OData-MaxVersion', '4.0')
  headers.set('Authorization', `Bearer ${token}`)

  const response = await fetch(
    `${orgUrl}/api/data/v9.2/${FORM_PICKLIST_TABLE_ALIAS}?$select=cmps_formname,cmps_jsonpicklist,cmps_jsonpicklistoptions,cmps_jsonpicklistoptions2,cmps_jsonpicklistinfo&$top=5000`,
    {
      method: 'GET',
      credentials: 'include',
      headers,
    },
  )

  if (!response.ok) {
    throw new Error(`Failed to load form picklist rows: ${response.status} ${response.statusText}`)
  }

  const payload = await response.json().catch(() => ({}))
  return rowsFromPayload(payload)
}

async function listFormPicklistRows(): Promise<any[]> {
  const rows = isLocalHost() ? await listFormPicklistRowsLocal() : await listFormPicklistRowsRuntime()
  if (rows.length > 0) return rows
  if (!isLocalHost()) throw new Error(`No rows returned from ${FORM_PICKLIST_TABLE_ALIAS}.`)
  return rows
}

async function updateRuntime(recordId: string, payload: FormPicklistAdminPayload): Promise<void> {
  const orgUrl = sanitizeOrgUrl(import.meta.env.VITE_DATAVERSE_ORG_URL || '')
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
        entityName: FORM_PICKLIST_TABLE_ALIAS,
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
    entityName: FORM_PICKLIST_TABLE_ALIAS,
    recordId,
    item: payload,
    ...(token ? { token } : {}),
  })
}

async function createRuntime(payload: FormPicklistAdminPayload): Promise<void> {
  const orgUrl = sanitizeOrgUrl(import.meta.env.VITE_DATAVERSE_ORG_URL || '')
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
        entityName: FORM_PICKLIST_TABLE_ALIAS,
        item: payload,
        ...(token ? { token } : {}),
      })
      return
    } catch {
      // fall through
    }
  }

  await tryCreate('CreateRecord', { prefer: 'return=representation', accept: 'application/json', 
    entityName: FORM_PICKLIST_TABLE_ALIAS,
    item: payload,
    ...(token ? { token } : {}),
  })
}

function parseStringArray(value: unknown): string[] {
  const parsed = parseJsonValue<unknown>(value, [])
  if (!Array.isArray(parsed)) return []
  return parsed.map((entry) => String(entry || '').trim()).filter(Boolean)
}

function parseOptionMatrix(value: unknown): string[][] {
  const parsed = parseJsonValue<unknown>(value, [])
  if (!Array.isArray(parsed)) return []

  return parsed.map((group) => {
    if (!Array.isArray(group)) return []
    return group.map((entry) => String(entry || '').trim()).filter(Boolean)
  })
}

function parsePicklistInfo(value: unknown): Partial<Record<PicklistType, number[]>> {
  const parsed = parseJsonValue<unknown>(value, {})
  if (!parsed || typeof parsed !== 'object' || Array.isArray(parsed)) return {}

  const row = parsed as Record<string, unknown>
  const out: Partial<Record<PicklistType, number[]>> = {}

  const keys: PicklistType[] = ['drop down', 'radio button', 'checkboxes']
  for (const key of keys) {
    const bucket = row[key]
    if (!Array.isArray(bucket)) continue

    out[key] = bucket.map((entry) => {
      if (typeof entry === 'number') return entry
      const asText = String(entry || '').trim()
      return asText === '1' ? 1 : 0
    })
  }

  return out
}

function resolveTypeAndActive(index: number, info: Partial<Record<PicklistType, number[]>>): { picklistType?: PicklistType; active: boolean } {
  const order: PicklistType[] = ['drop down', 'radio button', 'checkboxes']

  for (const key of order) {
    const values = info[key]
    if (!values || index >= values.length) continue
    if (values[index] === 1) {
      return {
        picklistType: key,
        active: true,
      }
    }
  }

  for (const key of order) {
    const values = info[key]
    if (!values || index >= values.length) continue
    return { active: false }
  }

  return { active: true }
}

export async function loadFormPicklistConfigs(): Promise<Record<string, ResolvedFormPicklistConfig>> {
  const rows = await listFormPicklistRows()

  const result: Record<string, ResolvedFormPicklistConfig> = {}

  for (const rawRow of rows) {
    if (!rawRow || typeof rawRow !== 'object') continue
    const row = rawRow as Record<string, unknown>

    const formName = stringValue(row, 'cmps_formname')
    if (!formName) continue

    const pickListNames = parseStringArray(row.cmps_jsonpicklist)

    const options1 = parseOptionMatrix(row.cmps_jsonpicklistoptions)

    const options2 = parseOptionMatrix(row.cmps_jsonpicklistoptions2)

    const options = [...options1, ...options2]
    const info = parsePicklistInfo(row.cmps_jsonpicklistinfo)

    const fieldsByLabel: Record<string, ResolvedPicklistField> = {}

    pickListNames.forEach((label, index) => {
      const resolved = resolveTypeAndActive(index, info)
      const key = normalize(label)
      if (!key) return

      fieldsByLabel[key] = {
        label,
        options: options[index] || [],
        picklistType: resolved.picklistType,
        active: resolved.active,
      }
    })

    result[normalize(formName)] = {
      formName,
      fieldsByLabel,
    }
  }

  return result
}

export async function loadFormPicklistRowsForAdmin(): Promise<FormPicklistAdminRow[]> {
  const rows = await listFormPicklistRows()

  return rows.map((row: Record<string, unknown>) => ({
    id: resolveRowId(row),
    formName: stringValue(row, 'cmps_formname'),
    jsonPickList: stringValue(row, 'cmps_jsonpicklist'),
    jsonPickListOptions: stringValue(row, 'cmps_jsonpicklistoptions'),
    jsonPickListOptions2: stringValue(row, 'cmps_jsonpicklistoptions2'),
    jsonPickListInfo: stringValue(row, 'cmps_jsonpicklistinfo'),
  }))
}

export async function saveFormPicklistRow(originalFormName: string, payload: FormPicklistAdminPayload): Promise<void> {
  const filterName = String(originalFormName || payload.cmps_formname || '').trim()
  if (!filterName) throw new Error('Form name is required.')

  if (isLocalHost()) {
    const token = await ensureAuthToken().catch(() => '')
    const orgUrl = getDataverseOrgUrl()
    if (!token || !orgUrl) throw new Error('Missing Dataverse connection info for saving form picklists.')

    const headers = new Headers()
    headers.set('Accept', 'application/json')
    headers.set('Content-Type', 'application/json')
    headers.set('OData-Version', '4.0')
    headers.set('OData-MaxVersion', '4.0')
    headers.set('Authorization', `Bearer ${token}`)

    const filter = `cmps_formname eq '${escapeODataString(filterName)}'`
    const findResponse = await fetch(
      `${orgUrl}/api/data/v9.2/${FORM_PICKLIST_TABLE_ALIAS}?$select=cmps_formname&$filter=${encodeURIComponent(filter)}&$top=1`,
      {
        method: 'GET',
        credentials: 'include',
        headers,
      },
    )

    let existingId = ''
    if (findResponse.ok) {
      const body = await findResponse.json().catch(() => ({}))
      const rows = Array.isArray(body?.value) ? body.value : []
      const firstRow = rows[0]
      if (firstRow && typeof firstRow === 'object') {
        existingId = resolveRowId(firstRow as Record<string, unknown>)
      }
    }

    if (existingId) {
      const patchResponse = await fetch(`${orgUrl}/api/data/v9.2/${FORM_PICKLIST_TABLE_ALIAS}(${existingId})`, {
        method: 'PATCH',
        credentials: 'include',
        headers,
        body: JSON.stringify(payload),
      })
      if (!patchResponse.ok) throw new Error(await patchResponse.text())
      return
    }

    const postResponse = await fetch(`${orgUrl}/api/data/v9.2/${FORM_PICKLIST_TABLE_ALIAS}`, {
      method: 'POST',
      credentials: 'include',
      headers,
      body: JSON.stringify(payload),
    })
    if (!postResponse.ok) throw new Error(await postResponse.text())
    return
  }

  const rows = await listFormPicklistRowsRuntime()
  const existing = rows.find((row) => normalize(String(row.cmps_formname || '')) === normalize(filterName))
  const existingId = existing && typeof existing === 'object' ? resolveRowId(existing as Record<string, unknown>) : ''

  if (existingId) {
    await updateRuntime(existingId, payload)
    return
  }

  await createRuntime(payload)
}
