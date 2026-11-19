import { getClient } from '@microsoft/power-apps/data'
import { dataSourcesInfo } from '../../.power/schemas/appschemas/dataSourcesInfo'
import { ensureAuthToken, getAuthToken } from './auth'
import { formatServiceSiteLabel } from './serviceSiteLabels'
import { excludeArchived } from './archive'

export const ELECTRONIC_DOCUMENTS_TABLE_ALIAS = 'cmps_electronicdocuments'
export const ELECTRONIC_DOCUMENTS_PRIMARY_ID_FIELD = 'cmps_electronicdocumentid'
const CLIENT_PROFILE_ENTITY_SET_NAME = 'cmps_clientprofiles'
const COMPASS_FILES_ENTITY_SET_NAME = 'cmps_compassfileses'
const DEFAULT_DATAVERSE_ORG_URL = 'https://org1f466e4e.crm.dynamics.com'
const OPTION_SET_BASE_VALUE = 125570000
const runtimeDataClient = getClient(dataSourcesInfo as any)

export type ElectronicDocumentField = {
  field: string
  label: string
  input: 'readonly' | 'lookup' | 'select' | 'date' | 'staff' | 'text' | 'file' | 'textarea'
  options: string[]
  section: 'Main' | 'Document Details' | 'Notes'
  required?: boolean
}

export const ELECTRONIC_DOCUMENT_PROGRAM_OPTIONS = [
  'Autumn House',
  'DV Outreach',
  'CAAFA Shelter',
  'DVSTOP',
  'Faith House',
  'REACH Center',
  'DVHEART',
]

export const ELECTRONIC_DOCUMENT_SERVICE_SITE_OPTIONS = [
  'Autumn House',
  'CAAFA',
  'CAAFA - Crisis Response',
  'CAAFA - Legal',
  'CAAFA - DV',
  'CAAFA - SV',
  'CAAFA - Thrive',
  'DVSTOP',
  'Faith House',
  'REACH Center',
]

export const ELECTRONIC_DOCUMENT_TYPE_OPTIONS = [
  'Assessments',
  'Focus Plans',
  'Intake Documents',
  'Misc Documents',
  'Emergency Adult File Checklist',
  'Order of Protection',
  'Discharge Documents',
  'OVW Screening',
  'Other',
]

export const ELECTRONIC_DOCUMENT_FIELDS: ElectronicDocumentField[] = [
  { field: 'cmps_recordid', label: 'Record ID', input: 'readonly', options: [], section: 'Main' },
  { field: 'cmps_cpid', label: 'Client Profile', input: 'lookup', options: [], section: 'Main' },
  { field: 'cmps_program', label: 'Program', input: 'select', options: ELECTRONIC_DOCUMENT_PROGRAM_OPTIONS, section: 'Main', required: true },
  { field: 'cmps_servicesite', label: 'Service Site', input: 'select', options: ELECTRONIC_DOCUMENT_SERVICE_SITE_OPTIONS, section: 'Main' },
  { field: 'cmps_dateofdocument', label: 'Date of Document', input: 'date', options: [], section: 'Main', required: true },
  { field: 'cmps_staff', label: 'Staff', input: 'staff', options: [], section: 'Main' },
  { field: 'cmps_nameofdocument', label: 'Name of Document', input: 'text', options: [], section: 'Document Details', required: true },
  { field: 'cmps_typeofdocument', label: 'Type of Document', input: 'select', options: ELECTRONIC_DOCUMENT_TYPE_OPTIONS, section: 'Document Details', required: true },
  { field: 'cmps_fileid1', label: 'Upload Document', input: 'file', options: [], section: 'Document Details', required: true },
  { field: 'cmps_notes', label: 'Notes', input: 'textarea', options: [], section: 'Notes' },
]

export type ElectronicDocumentPayload = Partial<Record<string, string>>

export type ElectronicDocumentListRecord = {
  id: string
  recordId: string
  dateOfDocument: string
  nameOfDocument: string
  typeOfDocument: string
  fileRowId: string
}

export type ElectronicDocumentDetailRecord = {
  id: string
  recordId: string
  values: ElectronicDocumentPayload
}

const CHOICE_FIELDS = ELECTRONIC_DOCUMENT_FIELDS.filter((field) => field.input === 'select')

function orgUrl(): string {
  return String(import.meta.env.VITE_DATAVERSE_ORG_URL || DEFAULT_DATAVERSE_ORG_URL).trim().replace(/\/$/, '')
}

function local(): boolean {
  return typeof window !== 'undefined' && ['localhost', '127.0.0.1'].includes(window.location.hostname)
}

function normalizeGuid(value: unknown): string {
  return String(value || '').trim().replace(/[{}]/g, '')
}

function rowsFromPayload(payload: any): Array<Record<string, unknown>> {
  if (Array.isArray(payload)) return payload
  if (Array.isArray(payload?.value)) return payload.value
  return []
}

function decodeChoiceValue(rawValue: unknown, formattedValue: unknown, options: string[]): string {
  const formatted = String(formattedValue || '').trim()
  if (formatted) return formatted
  const raw = String(rawValue ?? '').trim()
  if (!raw) return ''
  const numeric = Number(raw)
  if (!Number.isInteger(numeric)) return raw
  const index = numeric - OPTION_SET_BASE_VALUE
  return index >= 0 && index < options.length ? options[index] : raw
}

function mapElectronicDocumentDetailRow(row: Record<string, unknown>): ElectronicDocumentDetailRecord {
  const values: ElectronicDocumentPayload = {}
  for (const field of ELECTRONIC_DOCUMENT_FIELDS) {
    if (field.field === 'cmps_cpid') {
      values[field.field] = normalizeGuid(row?._cmps_cpid_value)
      continue
    }
    if (field.field === 'cmps_fileid1') {
      values[field.field] = normalizeGuid(row?._cmps_fileid1_value)
      continue
    }
    const raw = row?.[field.field]
    const formatted = row?.[`${field.field}@OData.Community.Display.V1.FormattedValue`]
    values[field.field] = field.input === 'select'
      ? decodeChoiceValue(raw, formatted, field.options)
      : String(raw ?? '').trim()
    if (field.field === 'cmps_servicesite') values[field.field] = formatServiceSiteLabel(values[field.field])
  }
  return {
    id: normalizeGuid(row?.[ELECTRONIC_DOCUMENTS_PRIMARY_ID_FIELD] || row?.id),
    recordId: String(values.cmps_recordid || row?.cmps_recordid || '').trim(),
    values,
  }
}

function toElectronicDocumentListRecord(row: Record<string, unknown>): ElectronicDocumentListRecord {
  const detail = mapElectronicDocumentDetailRow(row)
  return {
    id: detail.id,
    recordId: detail.recordId,
    dateOfDocument: String(detail.values.cmps_dateofdocument || '').trim(),
    nameOfDocument: String(detail.values.cmps_nameofdocument || '').trim(),
    typeOfDocument: String(detail.values.cmps_typeofdocument || '').trim(),
    fileRowId: String(detail.values.cmps_fileid1 || '').trim(),
  }
}

function electronicDocumentSelectColumns(): string {
  return [
    ELECTRONIC_DOCUMENTS_PRIMARY_ID_FIELD,
    ...ELECTRONIC_DOCUMENT_FIELDS
      .map((field) => field.field)
      .filter((field) => field !== 'cmps_cpid' && field !== 'cmps_fileid1'),
    '_cmps_cpid_value',
    '_cmps_fileid1_value',
  ].join(',')
}

function normalizePayload(seed: ElectronicDocumentPayload): Record<string, unknown> {
  const payload: Record<string, unknown> = { ...seed }
  const clientProfileId = normalizeGuid(payload.cmps_cpid)
  const fileId = normalizeGuid(payload.cmps_fileid1)
  delete payload.cmps_cpid
  delete payload.cmps_fileid1
  if (clientProfileId) payload['cmps_cpid@odata.bind'] = `/${CLIENT_PROFILE_ENTITY_SET_NAME}(${clientProfileId})`
  if (fileId) payload['cmps_fileid1@odata.bind'] = `/${COMPASS_FILES_ENTITY_SET_NAME}(${fileId})`

  for (const field of CHOICE_FIELDS) {
    const rawValue = field.field === 'cmps_servicesite'
      ? formatServiceSiteLabel(payload[field.field])
      : String(payload[field.field] || '').trim()
    if (!rawValue) {
      delete payload[field.field]
      continue
    }
    const numericValue = Number(rawValue)
    if (Number.isInteger(numericValue) && numericValue >= OPTION_SET_BASE_VALUE && numericValue < OPTION_SET_BASE_VALUE + field.options.length) {
      payload[field.field] = numericValue
      continue
    }
    const index = field.options.findIndex((option) => option.toLowerCase() === rawValue.toLowerCase())
    if (index < 0) throw new Error(`Invalid choice for ${field.label}.`)
    payload[field.field] = OPTION_SET_BASE_VALUE + index
  }

  for (const [field, value] of Object.entries(payload)) {
    if (typeof value === 'string' && !value.trim()) delete payload[field]
  }
  return payload
}

export function generateElectronicDocumentRecordId(): string {
  return `EDOC-${new Date().toISOString().replace(/[-:T]/g, '').slice(0, 15)}`
}

export async function listElectronicDocumentsForClient(clientRowId: string): Promise<ElectronicDocumentListRecord[]> {
  const clientId = normalizeGuid(clientRowId)
  if (!clientId) return []
  const select = electronicDocumentSelectColumns()
  const belongsToClient = (rows: Array<Record<string, unknown>>) => rows
    .filter((row) => normalizeGuid(row?._cmps_cpid_value).toLowerCase() === clientId.toLowerCase())
    .map(toElectronicDocumentListRecord)

  if (local()) {
    const token = await ensureAuthToken().catch(() => '')
    if (!token) return []
    const headers = new Headers({ Accept: 'application/json', 'OData-Version': '4.0', 'OData-MaxVersion': '4.0', Authorization: `Bearer ${token}` })
    const filter = excludeArchived(`_cmps_cpid_value eq ${clientId}`)
    const response = await fetch(`${orgUrl()}/api/data/v9.2/${ELECTRONIC_DOCUMENTS_TABLE_ALIAS}?$select=${encodeURIComponent(select)}&$filter=${encodeURIComponent(filter)}&$top=200`, { credentials: 'include', headers }).catch(() => null)
    if (response?.ok) return belongsToClient(rowsFromPayload(await response.json().catch(() => ({}))))
    return []
  }

  const token = getAuthToken()
  const filter = excludeArchived(`_cmps_cpid_value eq ${clientId}`)
  const filtered = await runtimeDataClient.executeAsync<any, any>({ connectorOperation: { tableName: 'commondataserviceforapps', operationName: 'ListRecordsWithOrganization', parameters: { organization: orgUrl(), entityName: ELECTRONIC_DOCUMENTS_TABLE_ALIAS, '$select': select, '$filter': filter, '$top': 200, ...(token ? { token } : {}) } } } as any).catch(() => null)
  if (filtered?.success) {
    const rows = belongsToClient(rowsFromPayload(filtered.data))
    if (rows.length > 0) return rows
  }

  const unfiltered = await runtimeDataClient.executeAsync<any, any>({ connectorOperation: { tableName: 'commondataserviceforapps', operationName: 'ListRecordsWithOrganization', parameters: { organization: orgUrl(), entityName: ELECTRONIC_DOCUMENTS_TABLE_ALIAS, '$select': select, '$top': 500, ...(token ? { token } : {}) } } } as any).catch(() => null)
  return unfiltered?.success ? belongsToClient(rowsFromPayload(unfiltered.data)) : []
}

export async function loadElectronicDocumentDetailRecord(rowId: string, recordIdHint = ''): Promise<ElectronicDocumentDetailRecord> {
  const cleanId = normalizeGuid(rowId)
  const cleanRecordId = String(recordIdHint || '').trim()
  if (!cleanId && !cleanRecordId) throw new Error('Missing Electronic Document row id and record id for detail load.')
  const select = electronicDocumentSelectColumns()

  if (local()) {
    const token = await ensureAuthToken()
    if (!token) throw new Error('Missing Dataverse connection info for Electronic Document detail load.')
    const headers = new Headers({ Accept: 'application/json', 'OData-Version': '4.0', 'OData-MaxVersion': '4.0', Authorization: `Bearer ${token}` })
    if (cleanId) {
      const response = await fetch(`${orgUrl()}/api/data/v9.2/${ELECTRONIC_DOCUMENTS_TABLE_ALIAS}(${cleanId})?$select=${encodeURIComponent(select)}`, { credentials: 'include', headers })
      if (response.ok) return mapElectronicDocumentDetailRow(await response.json().catch(() => ({})))
    }
    if (!cleanRecordId) throw new Error('No Electronic Document record found.')
    const filter = `cmps_recordid eq '${cleanRecordId.replace(/'/g, "''")}'`
    const response = await fetch(`${orgUrl()}/api/data/v9.2/${ELECTRONIC_DOCUMENTS_TABLE_ALIAS}?$select=${encodeURIComponent(select)}&$filter=${encodeURIComponent(filter)}&$top=1`, { credentials: 'include', headers })
    if (!response.ok) throw new Error(await response.text())
    const rows = rowsFromPayload(await response.json().catch(() => ({})))
    if (rows.length === 0) throw new Error(`No Electronic Document record found for Record ID ${cleanRecordId}.`)
    return mapElectronicDocumentDetailRow(rows[0])
  }

  const token = getAuthToken()
  if (cleanRecordId) {
    const filter = `cmps_recordid eq '${cleanRecordId.replace(/'/g, "''")}'`
    const result = await runtimeDataClient.executeAsync<any, any>({ connectorOperation: { tableName: 'commondataserviceforapps', operationName: 'ListRecordsWithOrganization', parameters: { organization: orgUrl(), entityName: ELECTRONIC_DOCUMENTS_TABLE_ALIAS, '$select': select, '$filter': filter, '$top': 1, ...(token ? { token } : {}) } } } as any).catch(() => null)
    if (result?.success) {
      const rows = rowsFromPayload(result.data)
      if (rows.length > 0) return mapElectronicDocumentDetailRow(rows[0])
    }
  }
  if (cleanId) {
    const result = await runtimeDataClient.executeAsync<any, any>({ connectorOperation: { tableName: 'commondataserviceforapps', operationName: 'GetItemWithOrganization', parameters: {
          prefer: 'odata.include-annotations="OData.Community.Display.V1.FormattedValue"',
          accept: 'application/json', organization: orgUrl(), entityName: ELECTRONIC_DOCUMENTS_TABLE_ALIAS, recordId: cleanId, '$select': select, ...(token ? { token } : {}) } } } as any).catch(() => null)
    if (result?.success) return mapElectronicDocumentDetailRow(result.data || {})
    throw new Error(String(result?.error?.message || result?.error || 'Electronic Document detail load failed.'))
  }
  throw new Error('No Electronic Document record found.')
}

export async function createElectronicDocumentResponse(seed: ElectronicDocumentPayload): Promise<{ id: string; recordId: string }> {
  const recordId = String(seed.cmps_recordid || '').trim().replace(/\.+$/, '') || generateElectronicDocumentRecordId()
  const payload = normalizePayload({ ...seed, cmps_recordid: recordId })

  if (local()) {
    const token = await ensureAuthToken()
    if (!token) throw new Error('Missing Dataverse connection info for Electronic Document create.')
    const response = await fetch(`${orgUrl()}/api/data/v9.2/${ELECTRONIC_DOCUMENTS_TABLE_ALIAS}`, {
      method: 'POST',
      credentials: 'include',
      headers: { Accept: 'application/json', 'Content-Type': 'application/json', 'OData-Version': '4.0', 'OData-MaxVersion': '4.0', Authorization: `Bearer ${token}`, Prefer: 'return=representation' },
      body: JSON.stringify(payload),
    })
    if (!response.ok) throw new Error(await response.text())
    const body = await response.json().catch(() => ({}))
    return { id: normalizeGuid(body?.[ELECTRONIC_DOCUMENTS_PRIMARY_ID_FIELD] || body?.id), recordId }
  }

  const token = getAuthToken()
  const result = await runtimeDataClient.executeAsync<any, any>({
    connectorOperation: {
      tableName: 'commondataserviceforapps',
      operationName: 'CreateRecordWithOrganization',
      parameters: { prefer: 'return=representation', accept: 'application/json',  organization: orgUrl(), entityName: ELECTRONIC_DOCUMENTS_TABLE_ALIAS, item: payload, ...(token ? { token } : {}) },
    },
  } as any)
  if (!result?.success) throw new Error(String(result?.error?.message || result?.error || 'Electronic Document create failed.'))
  return { id: normalizeGuid(result?.data?.[ELECTRONIC_DOCUMENTS_PRIMARY_ID_FIELD] || result?.data?.id), recordId }
}

export async function updateElectronicDocumentResponse(rowId: string, values: ElectronicDocumentPayload): Promise<void> {
  const cleanId = normalizeGuid(rowId)
  if (!cleanId) throw new Error('Missing Electronic Document row id for update.')
  const payload = normalizePayload(values)
  // PATCH must explicitly clear dates; omitting a blank date preserves its old value.
  for (const field of ELECTRONIC_DOCUMENT_FIELDS) {
    const value = (values as Record<string, unknown>)[field.field]
    if (['date', 'datetime'].includes(field.input) && Object.prototype.hasOwnProperty.call(values, field.field)
      && (value === null || (typeof value === 'string' && !value.trim()))) (payload as Record<string, unknown>)[field.field] = null
  }

  if (local()) {
    const token = await ensureAuthToken()
    if (!token) throw new Error('Missing Dataverse connection info for Electronic Document update.')
    const response = await fetch(`${orgUrl()}/api/data/v9.2/${ELECTRONIC_DOCUMENTS_TABLE_ALIAS}(${cleanId})`, {
      method: 'PATCH',
      credentials: 'include',
      headers: { Accept: 'application/json', 'Content-Type': 'application/json', 'OData-Version': '4.0', 'OData-MaxVersion': '4.0', Authorization: `Bearer ${token}` },
      body: JSON.stringify(payload),
    })
    if (!response.ok) throw new Error(await response.text())
    return
  }

  const token = getAuthToken()
  const result = await runtimeDataClient.executeAsync<any, any>({
    connectorOperation: {
      tableName: 'commondataserviceforapps',
      operationName: 'UpdateRecordWithOrganization',
      parameters: { organization: orgUrl(), entityName: ELECTRONIC_DOCUMENTS_TABLE_ALIAS, recordId: cleanId, item: payload, ...(token ? { token } : {}) },
    },
  } as any)
  if (!result?.success) throw new Error(String(result?.error?.message || result?.error || 'Electronic Document update failed.'))
}
