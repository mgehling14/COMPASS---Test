import { getClient } from '@microsoft/power-apps/data'
import { dataSourcesInfo } from '../../.power/schemas/appschemas/dataSourcesInfo'
import { ensureAuthToken, getAuthToken } from './auth'
import { excludeArchived } from './archive'

export const EVENTS_TABLE_ALIAS = 'cmps_events'
export const EVENTS_OPTION_SET_BASE_VALUE = 125570000
export const EVENTS_PRIMARY_ID_FIELD = 'cmps_eventid'
const DEFAULT_DATAVERSE_ORG_URL = 'https://org1f466e4e.crm.dynamics.com'
const runtimeDataClient = getClient(dataSourcesInfo as any)

export type EventFieldInput = 'select' | 'date' | 'text' | 'textarea' | 'number' | 'readonly' | 'file'

export type EventFieldDefinition = {
  field: string
  label: string
  input: EventFieldInput
  options: string[]
  section: 'Event Details' | 'Attendance by Demographic' | 'Notes'
  requiredWhen?: (values: EventPayload) => boolean
}

export const EVENT_PROGRAM_OPTIONS = [
  'Artspace', 'ATO', 'Autumn House', 'DV Outreach', 'CAAFA Shelter',
  'Desert Leaf Apartments', 'DVSTOP', 'Eerie', 'Faith House', 'Financial Wellness',
  'La Mesita Support Services', 'MesaCAN/CAP', 'REACH Center', 'Workforce',
  'Thunderbird Apartments',
]
export const EVENT_FUNDER_OPTIONS = ['DES DV', 'DES SV', 'N/A', 'OVW-Late Life', 'SASP', 'Thrive', 'VOCA']
export const EVENT_CATEGORY_OPTIONS = ['Available Services', 'Dating Violence', 'Domestic Violence', 'Financial Empowerment', 'Healthy Relationships', 'Sexual Violence']
export const EVENT_AUDIENCE_OPTIONS = ['Adult Only', 'Child Only', 'Both Children and Adults', 'Leaf Employees and Volunteers']

const DEMOGRAPHIC_NUMBER_FIELDS = [
  ['cmps_totalattendance', 'Total Attendance'],
  ['cmps_repeatattendance', 'Repeat Attendance'],
  ['cmps_totalfemaleattendance', 'Total Female Attendance'],
  ['cmps_totalmaleattendance', 'Total Male Attendance'],
  ['cmps_totalothergenderattendance', 'Total Other Gender Attendance'],
  ['cmps_totalunknownnotreportedgenderattendance', 'Total Unknown / Not Reported Gender Attendance'],
  ['cmps_totalgenderattendance', 'Total Gender Attendance'],
  ['cmps_totaladultattendance', 'Total Adult Attendance'],
  ['cmps_totalyouthattendance', 'Total Youth Attendance'],
  ['cmps_under18', 'Under 18'],
  ['cmps_18to19', '18 to 19'],
  ['cmps_20to29', '20 to 29'],
  ['cmps_30to39', '30 to 39'],
  ['cmps_40to49', '40 to 49'],
  ['cmps_50to59', '50 to 59'],
  ['cmps_60to69', '60 to 69'],
  ['cmps_70plus', '70 Plus'],
  ['cmps_ageunknownnotreported', 'Age Unknown / Not Reported'],
  ['cmps_totalattendancebyagerange', 'Total Attendance by Age Range'],
  ['cmps_blackafricanamerican', 'Black / African American'],
  ['cmps_asian', 'Asian'],
  ['cmps_white', 'White'],
  ['cmps_multiracial', 'Multiracial'],
  ['cmps_otherrace', 'Other Race'],
  ['cmps_raceunknownnotreported', 'Race Unknown / Not Reported'],
  ['cmps_totalattendancebyrace', 'Total Attendance by Race'],
  ['cmps_hispanic', 'Hispanic'],
  ['cmps_nonhispanic', 'Non-Hispanic'],
  ['cmps_ethnicityunknownnotreported', 'Ethnicity Unknown / Not Reported'],
  ['cmps_totalattendancebyethnicity', 'Total Attendance by Ethnicity'],
] as const

const SHELTER_PROGRAMS = new Set(['Autumn House', 'Faith House', 'CAAFA Shelter', 'DVSTOP', 'DV Outreach'])

export type EventPayload = Partial<Record<string, string>>

export const EVENT_FIELD_DEFINITIONS: EventFieldDefinition[] = [
  { field: 'cmps_recordid', label: 'Record ID', input: 'readonly', options: [], section: 'Event Details' },
  { field: 'cmps_program', label: 'Program', input: 'select', options: EVENT_PROGRAM_OPTIONS, section: 'Event Details' },
  { field: 'cmps_eventdate', label: 'Event Date', input: 'date', options: [], section: 'Event Details' },
  { field: 'cmps_funder', label: 'Funder', input: 'select', options: EVENT_FUNDER_OPTIONS, section: 'Event Details' },
  { field: 'cmps_eventcategory', label: 'Event Category', input: 'select', options: EVENT_CATEGORY_OPTIONS, section: 'Event Details' },
  { field: 'cmps_eventtitle', label: 'Event Title', input: 'text', options: [], section: 'Event Details' },
  { field: 'cmps_eventlocation', label: 'Event Location', input: 'text', options: [], section: 'Event Details' },
  { field: 'cmps_presenter', label: 'Presenter', input: 'text', options: [], section: 'Event Details' },
  { field: 'cmps_audiencetype', label: 'Audience Type', input: 'select', options: EVENT_AUDIENCE_OPTIONS, section: 'Event Details' },
  { field: 'cmps_minutes', label: 'Minutes', input: 'number', options: [], section: 'Event Details' },
  { field: 'cmps_city', label: 'City', input: 'text', options: [], section: 'Event Details' },
  { field: 'cmps_numberofmaterialshandedout', label: 'Number of Materials Handed Out', input: 'number', options: [], section: 'Event Details', requiredWhen: (values) => values.cmps_program === 'REACH Center' },
  { field: 'cmps_fileid1', label: 'Upload File 1', input: 'file', options: [], section: 'Event Details' },
  { field: 'cmps_fileid2', label: 'Upload File 2', input: 'file', options: [], section: 'Event Details' },
  ...DEMOGRAPHIC_NUMBER_FIELDS.map(([field, label]) => ({
    field, label, input: 'number' as const, options: [], section: 'Attendance by Demographic' as const,
    requiredWhen: (values: EventPayload) => field.startsWith('cmps_total') && field !== 'cmps_totalattendance' ? SHELTER_PROGRAMS.has(String(values.cmps_program || '').trim()) : false,
  })),
  { field: 'cmps_notes', label: 'Notes', input: 'textarea', options: [], section: 'Notes' },
]

export const EVENT_FORM_FIELD_NAMES = EVENT_FIELD_DEFINITIONS.map((field) => (
  field.input === 'file' ? `_${field.field}_value` : field.field
))
export const EVENT_FORM_FIELD_DEF_BY_NAME = new Map(EVENT_FIELD_DEFINITIONS.map((field) => [field.field, field]))

function sanitizeOrgUrl(value: unknown): string {
  const raw = String(value || '').trim().replace(/\/$/, '')
  const lowered = raw.toLowerCase()
  return !raw || lowered === 'null' || lowered === 'undefined' ? '' : raw
}
function getOrgUrl(): string { return sanitizeOrgUrl(import.meta.env.VITE_DATAVERSE_ORG_URL) || DEFAULT_DATAVERSE_ORG_URL }
function isLocalHost(): boolean {
  if (typeof window === 'undefined') return false
  return window.location.hostname === 'localhost' || window.location.hostname === '127.0.0.1'
}
function isNumericLiteral(value: string): boolean { return /^-?\d+$/.test(String(value || '').trim()) }
function normalizeText(value: unknown): string { return String(value || '').trim().toLowerCase() }
function encodeOptionLiteral(value: string, options: string[]): string {
  const text = String(value || '').trim()
  if (!text) return ''
  if (isNumericLiteral(text)) return text
  const index = options.findIndex((option) => normalizeText(option) === normalizeText(text))
  return index >= 0 ? String(EVENTS_OPTION_SET_BASE_VALUE + index) : text
}
function normalizeDate(value: string): string {
  const text = String(value || '').trim()
  const match = text.match(/^(\d{4}-\d{2}-\d{2})/)
  return match?.[1] || text
}
function parseConnectorErrorMessage(error: unknown): string {
  if (typeof error === 'string') return error
  const nested = (error as any)?.innerError?.message || (error as any)?.message
  return nested ? String(nested) : 'Connector operation failed.'
}
function normalizeEventPayload(seed: EventPayload): Record<string, unknown> {
  const payload: Record<string, unknown> = { ...seed }
  for (const fieldDef of EVENT_FIELD_DEFINITIONS) {
    const rawValue = String(payload[fieldDef.field] || '').trim()
    if (fieldDef.input === 'file') {
      delete payload[fieldDef.field]
      const cleanId = rawValue.replace(/[{}]/g, '')
      if (cleanId) payload[`${fieldDef.field}@odata.bind`] = `/cmps_compassfileses(${cleanId})`
      continue
    }
    if (!rawValue || fieldDef.input === 'readonly') { if (!rawValue) delete payload[fieldDef.field]; continue }
    if (fieldDef.input === 'number' && !isNumericLiteral(rawValue)) throw new Error(`Invalid whole number value for ${fieldDef.field}.`)
    if (fieldDef.input === 'date') payload[fieldDef.field] = normalizeDate(rawValue)
    if (fieldDef.input === 'select') {
      const encoded = encodeOptionLiteral(rawValue, fieldDef.options)
      if (!isNumericLiteral(encoded)) throw new Error(`Invalid choice value for ${fieldDef.field}: "${rawValue}".`)
      payload[fieldDef.field] = encoded
    }
  }
  return payload
}

export function generateEventRecordId(): string {
  const now = new Date()
  return `EVENT-${now.toISOString().replace(/[-:T]/g, '').slice(0, 15)}`
}

export async function createEventResponse(values: EventPayload): Promise<{ id: string; recordId: string }> {
  const recordId = String(values.cmps_recordid || '').trim() || generateEventRecordId()
  const payload = normalizeEventPayload({ ...values, cmps_recordid: recordId })
  const orgUrl = getOrgUrl()
  const token = getAuthToken()
  if (!isLocalHost()) {
    const result = await runtimeDataClient.executeAsync<any, any>({ connectorOperation: { tableName: 'commondataserviceforapps', operationName: orgUrl ? 'CreateRecordWithOrganization' : 'CreateRecord', parameters: { prefer: 'return=representation', accept: 'application/json',  ...(orgUrl ? { organization: orgUrl } : {}), entityName: EVENTS_TABLE_ALIAS, item: payload, ...(token ? { token } : {}) } } } as any)
    if (!result?.success) throw new Error(parseConnectorErrorMessage(result?.error || result))
    return { id: String(result?.data?.[EVENTS_PRIMARY_ID_FIELD] || result?.data?.id || '').trim(), recordId }
  }
  const localToken = await ensureAuthToken()
  if (!orgUrl || !localToken) throw new Error('Missing Dataverse connection info for Event create.')
  const headers = new Headers({ Accept: 'application/json', 'Content-Type': 'application/json', 'OData-Version': '4.0', 'OData-MaxVersion': '4.0', Authorization: `Bearer ${localToken}`, Prefer: 'return=representation' })
  const response = await fetch(`${orgUrl}/api/data/v9.2/${EVENTS_TABLE_ALIAS}`, { method: 'POST', credentials: 'include', headers, body: JSON.stringify(payload) })
  if (!response.ok) throw new Error(await response.text())
  const body = await response.json().catch(() => ({}))
  return { id: String(body?.[EVENTS_PRIMARY_ID_FIELD] || body?.id || '').trim(), recordId }
}

export async function updateEventResponse(rowId: string, values: EventPayload): Promise<void> {
  const cleanId = String(rowId || '').trim()
  if (!cleanId) throw new Error('Missing Event row id for update.')
  const payload = normalizeEventPayload(values)
  // PATCH must explicitly clear dates; omitting a blank date preserves its old value.
  for (const field of EVENT_FIELD_DEFINITIONS) {
    const value = (values as Record<string, unknown>)[field.field]
    if (['date', 'datetime'].includes(field.input) && Object.prototype.hasOwnProperty.call(values, field.field)
      && (value === null || (typeof value === 'string' && !value.trim()))) (payload as Record<string, unknown>)[field.field] = null
  }
  const orgUrl = getOrgUrl()
  const token = getAuthToken()
  if (!isLocalHost()) {
    const result = await runtimeDataClient.executeAsync<any, any>({ connectorOperation: { tableName: 'commondataserviceforapps', operationName: orgUrl ? 'UpdateRecordWithOrganization' : 'UpdateRecord', parameters: { ...(orgUrl ? { organization: orgUrl } : {}), entityName: EVENTS_TABLE_ALIAS, recordId: cleanId, item: payload, ...(token ? { token } : {}) } } } as any)
    if (!result?.success) throw new Error(parseConnectorErrorMessage(result?.error || result))
    return
  }
  const localToken = await ensureAuthToken()
  if (!orgUrl || !localToken) throw new Error('Missing Dataverse connection info for Event update.')
  const headers = new Headers({ Accept: 'application/json', 'Content-Type': 'application/json', 'OData-Version': '4.0', 'OData-MaxVersion': '4.0', Authorization: `Bearer ${localToken}` })
  const response = await fetch(`${orgUrl}/api/data/v9.2/${EVENTS_TABLE_ALIAS}(${cleanId})`, { method: 'PATCH', credentials: 'include', headers, body: JSON.stringify(payload) })
  if (!response.ok) throw new Error(await response.text())
}

export type EventSearchRecord = {
  id: string
  recordId: string
  program: string
  eventDate: string
  eventTitle: string
  fileRowId1?: string
  fileRowId2?: string
}

export type EventDetailRecord = {
  id: string
  recordId: string
  values: EventPayload
}

function rowsFromPayload(payload: any): any[] {
  if (Array.isArray(payload)) return payload
  if (Array.isArray(payload?.value)) return payload.value
  return []
}

function decodeOptionLiteral(value: unknown, formatted: unknown, options: string[]): string {
  const formattedText = String(formatted || '').trim()
  if (formattedText) return formattedText
  const raw = String(value ?? '').trim()
  if (!raw) return ''
  const numeric = Number(raw)
  if (Number.isNaN(numeric)) return raw
  return options[numeric - EVENTS_OPTION_SET_BASE_VALUE] ?? raw
}

function escapeODataString(value: string): string { return String(value || '').replace(/'/g, "''") }

function buildEventSearchFilter(query: string): string {
  const clean = String(query || '').trim()
  if (!clean) return ''
  const escaped = escapeODataString(clean)
  return [
    `contains(cmps_recordid,'${escaped}')`,
    `contains(cmps_eventtitle,'${escaped}')`,
    `contains(cmps_eventlocation,'${escaped}')`,
  ].join(' or ')
}

function mapEventSearchRows(rows: any[]): EventSearchRecord[] {
  const programField = EVENT_FORM_FIELD_DEF_BY_NAME.get('cmps_program')
  return rows.map((row) => ({
    id: String(row?.[EVENTS_PRIMARY_ID_FIELD] || row?.id || '').trim(),
    recordId: String(row?.cmps_recordid || '').trim(),
    program: decodeOptionLiteral(row?.cmps_program, row?.['cmps_program@OData.Community.Display.V1.FormattedValue'], programField?.options || []),
    eventDate: String(row?.['cmps_eventdate@OData.Community.Display.V1.FormattedValue'] || row?.cmps_eventdate || '').trim(),
    eventTitle: String(row?.cmps_eventtitle || '').trim(),
    fileRowId1: String(row?._cmps_fileid1_value || '').trim(),
    fileRowId2: String(row?._cmps_fileid2_value || '').trim(),
  }))
}

function mapEventDetailRow(row: Record<string, unknown>): EventDetailRecord {
  const values: EventPayload = {}

  for (const fieldDef of EVENT_FIELD_DEFINITIONS) {
    const raw = fieldDef.input === 'file' ? row?.[`_${fieldDef.field}_value`] : row?.[fieldDef.field]
    const formatted = row?.[`${fieldDef.field}@OData.Community.Display.V1.FormattedValue`]
    values[fieldDef.field] = fieldDef.input === 'select' ? decodeOptionLiteral(raw, formatted, fieldDef.options) : String(raw ?? '').trim()
  }

  return {
    id: String(row?.[EVENTS_PRIMARY_ID_FIELD] || row?.id || '').trim(),
    recordId: String(values.cmps_recordid || row?.cmps_recordid || '').trim(),
    values,
  }
}

async function searchEventsLocal(query: string, limit = 25): Promise<EventSearchRecord[]> {
  const token = await ensureAuthToken()
  const orgUrl = getOrgUrl()
  if (!token || !orgUrl) throw new Error('Missing Dataverse connection info for Event search.')

  const headers = new Headers({ Accept: 'application/json', 'OData-Version': '4.0', 'OData-MaxVersion': '4.0', Authorization: `Bearer ${token}` })
  const select = [EVENTS_PRIMARY_ID_FIELD, 'cmps_recordid', 'cmps_program', 'cmps_eventdate', 'cmps_eventtitle', '_cmps_fileid1_value', '_cmps_fileid2_value'].join(',')
  const filter = excludeArchived(buildEventSearchFilter(query))

  const searchParams = new URLSearchParams()
  searchParams.set('$select', select)
  searchParams.set('$top', String(Math.max(1, Math.min(100, limit))))
  searchParams.set('$filter', filter)

  const response = await fetch(`${orgUrl}/api/data/v9.2/${EVENTS_TABLE_ALIAS}?${searchParams.toString()}`, { method: 'GET', credentials: 'include', headers })
  if (!response.ok) throw new Error(await response.text())
  const payload = await response.json().catch(() => ({}))
  return mapEventSearchRows(rowsFromPayload(payload))
}

async function searchEventsRuntime(query: string, limit = 25): Promise<EventSearchRecord[]> {
  const token = getAuthToken()
  const orgUrl = getOrgUrl()
  const filter = excludeArchived(buildEventSearchFilter(query))

  const result = await runtimeDataClient.executeAsync<any, any>({
    connectorOperation: {
      tableName: 'commondataserviceforapps',
      operationName: 'ListRecordsWithOrganization',
      parameters: {
        organization: orgUrl,
        entityName: EVENTS_TABLE_ALIAS,
        '$select': `${EVENTS_PRIMARY_ID_FIELD},cmps_recordid,cmps_program,cmps_eventdate,cmps_eventtitle,_cmps_fileid1_value,_cmps_fileid2_value`,
        '$top': Math.max(1, Math.min(100, limit)),
        '$filter': filter,
        ...(token ? { token } : {}),
      },
    },
  } as any)

  if (!result?.success) throw new Error(parseConnectorErrorMessage(result?.error || result))
  return mapEventSearchRows(rowsFromPayload(result.data))
}

export async function searchEventRecords(query: string, limit = 25): Promise<EventSearchRecord[]> {
  try {
    return await searchEventsLocal(query, limit)
  } catch {
    return searchEventsRuntime(query, limit)
  }
}

async function loadEventDetailLocal(rowId: string, recordIdHint = ''): Promise<EventDetailRecord> {
  const token = await ensureAuthToken()
  const orgUrl = getOrgUrl()
  if (!token || !orgUrl) throw new Error('Missing Dataverse connection info for Event detail load.')

  const headers = new Headers({ Accept: 'application/json', 'OData-Version': '4.0', 'OData-MaxVersion': '4.0', Authorization: `Bearer ${token}` })
  const select = EVENT_FORM_FIELD_NAMES.join(',')
  const cleanId = String(rowId || '').trim()

  if (cleanId) {
    const response = await fetch(`${orgUrl}/api/data/v9.2/${EVENTS_TABLE_ALIAS}(${cleanId})?$select=${encodeURIComponent(select)}`, { method: 'GET', credentials: 'include', headers })
    if (response.ok) return mapEventDetailRow(await response.json())
  }

  const recordId = String(recordIdHint || '').trim()
  if (!recordId) throw new Error('Missing row id and record id for Event detail load.')

  const filter = `cmps_recordid eq '${escapeODataString(recordId)}'`
  const response = await fetch(`${orgUrl}/api/data/v9.2/${EVENTS_TABLE_ALIAS}?$select=${encodeURIComponent(select)}&$filter=${encodeURIComponent(filter)}&$top=1`, { method: 'GET', credentials: 'include', headers })
  if (!response.ok) throw new Error(await response.text())
  const rows = rowsFromPayload(await response.json())
  if (rows.length === 0) throw new Error(`No Event record found for Record ID ${recordId}.`)
  return mapEventDetailRow(rows[0])
}

async function loadEventDetailRuntime(rowId: string, recordIdHint = ''): Promise<EventDetailRecord> {
  const orgUrl = getOrgUrl()
  const token = getAuthToken()
  const cleanId = String(rowId || '').trim()

  if (cleanId) {
    const directResult = await runtimeDataClient.executeAsync<any, any>({
      connectorOperation: {
        tableName: 'commondataserviceforapps',
        operationName: 'GetItemWithOrganization',
        parameters: {
          prefer: 'odata.include-annotations="OData.Community.Display.V1.FormattedValue"',
          accept: 'application/json', organization: orgUrl, entityName: EVENTS_TABLE_ALIAS, recordId: cleanId, '$select': EVENT_FORM_FIELD_NAMES.join(','), ...(token ? { token } : {}) },
      },
    } as any)
    if (directResult?.success) return mapEventDetailRow(directResult.data || {})
  }

  const cleanRecordId = String(recordIdHint || '').trim()
  if (!cleanRecordId) throw new Error('No matching Event record found.')

  const result = await runtimeDataClient.executeAsync<any, any>({
    connectorOperation: {
      tableName: 'commondataserviceforapps',
      operationName: 'ListRecordsWithOrganization',
      parameters: {
        organization: orgUrl,
        entityName: EVENTS_TABLE_ALIAS,
        '$select': EVENT_FORM_FIELD_NAMES.join(','),
        '$top': 1,
        '$filter': `cmps_recordid eq '${escapeODataString(cleanRecordId)}'`,
        ...(token ? { token } : {}),
      },
    },
  } as any)

  if (!result?.success) throw new Error(parseConnectorErrorMessage(result?.error || result))
  const rows = rowsFromPayload(result.data)
  if (rows.length === 0) throw new Error(`No Event record found for Record ID ${cleanRecordId}.`)
  return mapEventDetailRow(rows[0])
}

export async function loadEventDetailRecord(rowId: string, recordIdHint = ''): Promise<EventDetailRecord> {
  try {
    return await loadEventDetailLocal(rowId, recordIdHint)
  } catch {
    return loadEventDetailRuntime(rowId, recordIdHint)
  }
}
