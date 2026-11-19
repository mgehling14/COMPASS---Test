import { getClient } from '@microsoft/power-apps/data'
import { dataSourcesInfo } from '../../.power/schemas/appschemas/dataSourcesInfo'
import { ensureAuthToken, getAuthToken } from './auth'

const DEFAULT_DATAVERSE_ORG_URL = 'https://org1f466e4e.crm.dynamics.com'
const runtimeDataClient = getClient(dataSourcesInfo as any)

export type SystemFields = {
  createdBy: string
  createdOn: string
  modifiedBy: string
  modifiedOn: string
}

export const EMPTY_SYSTEM_FIELDS: SystemFields = {
  createdBy: '',
  createdOn: '',
  modifiedBy: '',
  modifiedOn: '',
}

function orgUrl(): string {
  return String(import.meta.env.VITE_DATAVERSE_ORG_URL || DEFAULT_DATAVERSE_ORG_URL).trim().replace(/\/$/, '')
}

function cleanGuid(value: unknown): string {
  const id = String(value || '').trim().replace(/[{}]/g, '')
  if (!/^[0-9a-f]{8}(?:-[0-9a-f]{4}){3}-[0-9a-f]{12}$/i.test(id)) throw new Error('Invalid row ID for system information.')
  return id
}

function firstRow(payload: any): Record<string, any> {
  if (Array.isArray(payload?.value)) return payload.value[0] || {}
  if (Array.isArray(payload)) return payload[0] || {}
  return payload && typeof payload === 'object' ? payload : {}
}

function lookupName(row: Record<string, any>, key: 'createdby' | 'modifiedby'): string {
  const expanded = row?.[key]
  return String(
    expanded?.fullname
    || expanded?.name
    || row?.[`${key}.fullname`]
    || row?.[`_${key}_value@OData.Community.Display.V1.FormattedValue`]
    || row?.[`${key}@OData.Community.Display.V1.FormattedValue`]
    || '',
  ).trim()
}

function mapSystemFields(payload: any): SystemFields {
  const row = firstRow(payload)
  return {
    createdBy: String(row?.cmps_createdby || '').trim() || lookupName(row, 'createdby'),
    createdOn: String(row?.createdon || '').trim(),
    modifiedBy: String(row?.cmps_modifiedby || '').trim() || lookupName(row, 'modifiedby'),
    modifiedOn: String(row?.modifiedon || '').trim(),
  }
}

export async function loadSystemFields(tableAlias: string, rowId: string): Promise<SystemFields> {
  const cleanTableAlias = String(tableAlias || '').trim()
  if (!cleanTableAlias || !rowId) return EMPTY_SYSTEM_FIELDS
  if (!/^[a-z][a-z0-9_]*$/i.test(cleanTableAlias)) throw new Error('Invalid table name for system information.')
  const cleanRowId = cleanGuid(rowId)

  const token = getAuthToken()
  const local = typeof window !== 'undefined' && ['localhost', '127.0.0.1'].includes(window.location.hostname)
  if (!local) {
    const result = await runtimeDataClient.executeAsync<any, any>({
      connectorOperation: {
        tableName: 'commondataserviceforapps',
        operationName: 'GetItemWithOrganization',
        parameters: {
          prefer: 'odata.include-annotations="OData.Community.Display.V1.FormattedValue"',
          accept: 'application/json',
          organization: orgUrl(),
          entityName: cleanTableAlias,
          recordId: cleanRowId,
          '$select': 'cmps_createdby,cmps_modifiedby,createdon,modifiedon,_createdby_value,_modifiedby_value',
          '$expand': 'createdby($select=fullname),modifiedby($select=fullname)',
          ...(token ? { token } : {}),
        },
      },
    } as any)

    if (!result?.success) throw new Error(String(result?.error?.message || result?.error || 'Unable to load system information.'))
    if (!result.data || typeof result.data !== 'object') throw new Error('Dataverse returned no system information.')
    return mapSystemFields(result.data)
  }

  const directToken = await ensureAuthToken()
  const headers = new Headers({
    Accept: 'application/json',
    'OData-Version': '4.0',
    'OData-MaxVersion': '4.0',
    Prefer: 'odata.include-annotations="OData.Community.Display.V1.FormattedValue"',
    Authorization: `Bearer ${directToken}`,
  })
  const select = 'cmps_createdby,cmps_modifiedby,createdon,modifiedon,_createdby_value,_modifiedby_value'
  const expand = 'createdby($select=fullname),modifiedby($select=fullname)'
  const response = await fetch(
    `${orgUrl()}/api/data/v9.2/${cleanTableAlias}(${cleanRowId})?$select=${encodeURIComponent(select)}&$expand=${encodeURIComponent(expand)}`,
    { credentials: 'include', headers },
  )
  if (!response.ok) throw new Error(await response.text())
  return mapSystemFields(await response.json().catch(() => ({})))
}
