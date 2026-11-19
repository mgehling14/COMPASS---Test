import { getClient } from '@microsoft/power-apps/data'
import { dataSourcesInfo } from '../../.power/schemas/appschemas/dataSourcesInfo'
import { ensureAuthToken, getAuthToken } from './auth'
import { excludeArchived } from './archive'
import { formatServiceSiteLabel } from './serviceSiteLabels'

export const BED_ENROLLMENTS_TABLE_ALIAS = 'cmps_bedenrollments'
export const BED_ENROLLMENTS_OPTION_SET_BASE_VALUE = 125570000
export const BED_ENROLLMENTS_PRIMARY_ID_FIELD = 'cmps_bedenrollmentid'
const PROGRAM_ENROLLMENT_ENTITY_SET_NAME = 'cmps_programenrollment1s'
const DEFAULT_DATAVERSE_ORG_URL = 'https://org1f466e4e.crm.dynamics.com'
const runtimeDataClient = getClient(dataSourcesInfo as any)

export type BedEnrollmentFieldInput =
  | 'lookup'
  | 'select'
  | 'date'
  | 'text'
  | 'textarea'
  | 'readonly'

export type BedEnrollmentFieldDefinition = {
  field: string
  label: string
  input: BedEnrollmentFieldInput
  options: string[]
}

export const BED_ENROLLMENT_SITE_OPTIONS = [
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

export const BED_ENROLLMENT_FIELD_DEFINITIONS: BedEnrollmentFieldDefinition[] = [
  { field: 'cmps_recordid', label: 'RecordID', input: 'readonly', options: [] },
  { field: 'cmps_programenrollment', label: 'Program Enrollment', input: 'lookup', options: [] },
  { field: 'cmps_servicesite', label: 'Service Site', input: 'select', options: BED_ENROLLMENT_SITE_OPTIONS },
  { field: 'cmps_checkindate', label: 'Check In Date', input: 'date', options: [] },
  { field: 'cmps_checkoutdate', label: 'Check Out Date', input: 'date', options: [] },
  { field: 'cmps_notes', label: 'Notes', input: 'textarea', options: [] },
]

export const BED_ENROLLMENT_FIELD_NAMES = BED_ENROLLMENT_FIELD_DEFINITIONS.map((field) => field.field)

export const BED_ENROLLMENT_FIELD_DEF_BY_NAME = new Map<string, BedEnrollmentFieldDefinition>(
  BED_ENROLLMENT_FIELD_DEFINITIONS.map((field) => [field.field, field]),
)

export type BedEnrollmentPayload = Partial<Record<(typeof BED_ENROLLMENT_FIELD_NAMES)[number], string>>

export type BedEnrollmentListRecord = {
  id: string
  recordId: string
  serviceSite: string
  checkInDate: string
  checkOutDate: string
}

export type BedEnrollmentDetailRecord = {
  id: string
  recordId: string
  values: BedEnrollmentPayload
}

type BedEnrollmentDataversePayload = Record<string, unknown>

function sanitizeOrgUrl(value: unknown): string {
  const raw = String(value || '').trim().replace(/\/$/, '')
  const lowered = raw.toLowerCase()
  if (!raw || lowered === 'null' || lowered === 'undefined') return ''
  return raw
}

function getOrgUrl(): string {
  const configured = sanitizeOrgUrl(import.meta.env.VITE_DATAVERSE_ORG_URL)
  return configured || DEFAULT_DATAVERSE_ORG_URL
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

function normalizeText(value: unknown): string {
  return String(value || '').trim().toLowerCase()
}

function isNumericLiteral(value: string): boolean {
  return /^-?\d+$/.test(String(value || '').trim())
}

function normalizeGuid(value: unknown): string {
  return String(value || '').trim().replace(/[{}]/g, '').toLowerCase()
}

function isLikelyDataverseGuid(value: string): boolean {
  return /^[0-9a-fA-F]{8}-[0-9a-fA-F]{4}-[0-9a-fA-F]{4}-[0-9a-fA-F]{4}-[0-9a-fA-F]{12}$/.test(String(value || '').trim())
}

function isEmptyDateValue(value: string): boolean {
  const text = String(value || '').trim()
  if (!text) return true
  if (text.startsWith('0001-01-01')) return true
  if (text.startsWith('01/01/0001')) return true
  if (text.startsWith('1/1/0001')) return true
  return false
}

function toIsoDate(value: Date): string {
  const year = value.getUTCFullYear()
  const month = String(value.getUTCMonth() + 1).padStart(2, '0')
  const day = String(value.getUTCDate()).padStart(2, '0')
  return `${year}-${month}-${day}`
}

function normalizeDateValueForDataverse(value: string): string {
  const text = String(value || '').trim()
  if (isEmptyDateValue(text)) return ''

  const isoDateMatch = text.match(/^(\d{4})-(\d{2})-(\d{2})(?:T.*)?$/)
  if (isoDateMatch) return `${isoDateMatch[1]}-${isoDateMatch[2]}-${isoDateMatch[3]}`

  const slashDateMatch = text.match(/^(\d{1,2})\/(\d{1,2})\/(\d{4})(?:\s.*)?$/)
  if (slashDateMatch) {
    const month = Number.parseInt(slashDateMatch[1], 10)
    const day = Number.parseInt(slashDateMatch[2], 10)
    const year = Number.parseInt(slashDateMatch[3], 10)
    const parsed = new Date(Date.UTC(year, month - 1, day))
    if (Number.isNaN(parsed.getTime())) return ''
    if (parsed.getUTCFullYear() !== year || parsed.getUTCMonth() !== month - 1 || parsed.getUTCDate() !== day) return ''
    return toIsoDate(parsed)
  }

  const parsed = new Date(text)
  if (Number.isNaN(parsed.getTime())) return text
  return toIsoDate(parsed)
}

function encodeOptionLiteral(value: string, options: string[]): string {
  const text = String(value || '').trim()
  if (!text) return ''
  if (isNumericLiteral(text)) return text

  const normalized = normalizeText(text)
  const index = options.findIndex((entry) => normalizeText(entry) === normalized)
  if (index >= 0) return String(BED_ENROLLMENTS_OPTION_SET_BASE_VALUE + index)
  return text
}

function decodeOptionLiteral(value: string, options: string[]): string {
  const text = String(value || '').trim()
  if (!text) return ''
  if (!isNumericLiteral(text)) return text

  const numeric = Number.parseInt(text, 10)
  const index = numeric - BED_ENROLLMENTS_OPTION_SET_BASE_VALUE
  if (index >= 0 && index < options.length) return options[index]
  return text
}

function encodeChoiceFieldValue(input: BedEnrollmentFieldInput, options: string[], rawValue: string): string {
  const text = String(rawValue || '').trim()
  if (!text || options.length === 0) return text
  if (input === 'select') return encodeOptionLiteral(text, options)
  return text
}

function decodeChoiceFieldValue(input: BedEnrollmentFieldInput, options: string[], rawValue: unknown, formattedValue?: unknown): string {
  const formatted = String(formattedValue || '').trim()
  if (formatted) return formatted

  const text = String(rawValue ?? '').trim()
  if (!text || options.length === 0) return text
  if (input === 'select') return decodeOptionLiteral(text, options)
  return text
}

function parseConnectorErrorMessage(error: unknown): string {
  if (typeof error === 'string') return error
  if (!error || typeof error !== 'object') return 'Connector operation failed.'
  const err = error as any
  const nested = err?.innerError?.message || err?.message
  if (nested) return String(nested)
  try {
    return JSON.stringify(error)
  } catch {
    return 'Connector operation failed.'
  }
}

function normalizeBedEnrollmentPayloadForDataverse(seed: BedEnrollmentPayload): BedEnrollmentDataversePayload {
  const payload: BedEnrollmentDataversePayload = { ...seed }

  const enrollmentLookupRowId = String(payload.cmps_programenrollment || '').trim()
  if (enrollmentLookupRowId) {
    delete payload.cmps_programenrollment
    payload['cmps_programenrollment@odata.bind'] = `/${PROGRAM_ENROLLMENT_ENTITY_SET_NAME}(${enrollmentLookupRowId})`
  }

  for (const fieldName of BED_ENROLLMENT_FIELD_NAMES) {
    const fieldDef = BED_ENROLLMENT_FIELD_DEF_BY_NAME.get(fieldName)
    if (!fieldDef) continue
    const rawValue = fieldName === 'cmps_servicesite'
      ? formatServiceSiteLabel(payload[fieldName])
      : String(payload[fieldName] || '').trim()
    if (!rawValue) continue

    if (fieldDef.input === 'date') {
      const normalizedDate = normalizeDateValueForDataverse(rawValue)
      if (!normalizedDate) {
        delete payload[fieldName]
        continue
      }
      payload[fieldName] = normalizedDate
      continue
    }

    if (fieldDef.input === 'select') {
      const encoded = encodeChoiceFieldValue(fieldDef.input, fieldDef.options, rawValue)
      if (!isNumericLiteral(encoded)) {
        throw new Error(
          `Invalid choice value for ${fieldName}: "${rawValue}". Expected one of the configured option labels for this field.`,
        )
      }
      payload[fieldName] = encoded
    }
  }

  return payload
}

function mapBedEnrollmentDetailRow(row: Record<string, unknown>): BedEnrollmentDetailRecord {
  const values: BedEnrollmentPayload = {}

  for (const field of BED_ENROLLMENT_FIELD_NAMES) {
    if (field === 'cmps_programenrollment') {
      const rawLookup = row?.['_cmps_programenrollment_value']
      values[field] = String(rawLookup || '').trim()
      continue
    }

    const raw = row?.[field]
    const fieldDef = BED_ENROLLMENT_FIELD_DEF_BY_NAME.get(field)
    if (!fieldDef) {
      values[field] = String(raw ?? '').trim()
      continue
    }

    const formatted = (row as Record<string, unknown>)[`${field}@OData.Community.Display.V1.FormattedValue`]
    if (fieldDef.input === 'date') {
      values[field] = normalizeDateValueForDataverse(String(raw ?? ''))
      continue
    }
    values[field] = decodeChoiceFieldValue(fieldDef.input, fieldDef.options, raw, formatted)
    if (field === 'cmps_servicesite') values[field] = formatServiceSiteLabel(values[field])
  }

  return {
    id: String(row?.[BED_ENROLLMENTS_PRIMARY_ID_FIELD] || row?.id || '').trim(),
    recordId: String(values.cmps_recordid || row?.cmps_recordid || '').trim(),
    values,
  }
}

function comparableDate(value: unknown): string {
  const text = String(value || '').trim()
  const match = text.match(/^(\d{4}-\d{2}-\d{2})/)
  return match?.[1] || text
}

export async function verifyBedEnrollmentDates(rowId: string, expected: BedEnrollmentPayload): Promise<void> {
  const expectedCheckIn = comparableDate(expected.cmps_checkindate)
  const expectedCheckOut = comparableDate(expected.cmps_checkoutdate)
  if (!expectedCheckIn && !expectedCheckOut) return

  const saved = await loadBedEnrollmentDetailRecord(rowId)
  const savedCheckIn = comparableDate(saved.values.cmps_checkindate)
  const savedCheckOut = comparableDate(saved.values.cmps_checkoutdate)
  const missing: string[] = []
  if (expectedCheckIn && savedCheckIn !== expectedCheckIn) missing.push('Check In Date')
  if (expectedCheckOut && savedCheckOut !== expectedCheckOut) missing.push('Check Out Date')
  if (missing.length) throw new Error(`Dataverse did not retain: ${missing.join(', ')}.`)
}

export function generateBedEnrollmentRecordId(): string {
  const now = new Date()
  const datePart = now.toISOString().slice(0, 10).replace(/-/g, '')
  const timePart = now.toISOString().slice(11, 19).replace(/:/g, '')
  return `BE-${datePart}${timePart}`
}

export async function createBedEnrollmentResponse(values: BedEnrollmentPayload): Promise<{ id: string; recordId: string }> {
  const recordId = String(values.cmps_recordid || '').trim() || generateBedEnrollmentRecordId()
  const payload = normalizeBedEnrollmentPayloadForDataverse({ ...values, cmps_recordid: recordId })
  const orgUrl = getOrgUrl()
  const token = getAuthToken()

  if (!isLocalHost()) {
    const result = await runtimeDataClient.executeAsync<any, any>({
      connectorOperation: {
        tableName: 'commondataserviceforapps',
        operationName: orgUrl ? 'CreateRecordWithOrganization' : 'CreateRecord',
        parameters: {
          ...(orgUrl ? { organization: orgUrl } : {}),
          entityName: BED_ENROLLMENTS_TABLE_ALIAS,
          item: payload,
          prefer: 'return=representation',
          accept: 'application/json',
          ...(token ? { token } : {}),
        },
      },
    } as any)

    if (!result?.success) throw new Error(parseConnectorErrorMessage(result?.error || result))
    let id = String(result?.data?.[BED_ENROLLMENTS_PRIMARY_ID_FIELD] || result?.data?.id || '').trim()
    if (!id) {
      try {
        id = (await loadBedEnrollmentDetailRecord('', recordId)).id
      } catch {
        // The create succeeded, but the connector did not return the row id.
      }
    }
    if (!id) throw new Error(`Bed Enrollment ${recordId} was created, but its Dataverse row ID could not be resolved for bed assignment.`)
    return { id, recordId }
  }

  const localToken = await ensureAuthToken()
  if (!orgUrl || !localToken) throw new Error('Missing Dataverse connection info for Bed Enrollment create.')

  const headers = new Headers()
  headers.set('Accept', 'application/json')
  headers.set('Content-Type', 'application/json')
  headers.set('OData-Version', '4.0')
  headers.set('OData-MaxVersion', '4.0')
  headers.set('Authorization', `Bearer ${localToken}`)
  headers.set('Prefer', 'return=representation')

  const response = await fetch(`${orgUrl}/api/data/v9.2/${BED_ENROLLMENTS_TABLE_ALIAS}`, {
    method: 'POST',
    credentials: 'include',
    headers,
    body: JSON.stringify(payload),
  })

  if (!response.ok) throw new Error(await response.text())
  const body = await response.json().catch(() => ({}))
  let id = String(body?.[BED_ENROLLMENTS_PRIMARY_ID_FIELD] || body?.id || '').trim()
  if (!id) id = (await loadBedEnrollmentDetailRecord('', recordId)).id
  if (!id) throw new Error(`Bed Enrollment ${recordId} was created, but its Dataverse row ID could not be resolved for bed assignment.`)
  return { id, recordId }
}

export async function updateBedEnrollmentResponse(rowId: string, values: BedEnrollmentPayload): Promise<void> {
  const cleanId = String(rowId || '').trim()
  if (!cleanId) throw new Error('Missing Bed Enrollment row id for update.')
  const payload = normalizeBedEnrollmentPayloadForDataverse(values)
  // PATCH must explicitly clear dates; omitting a blank date preserves its old value.
  for (const field of BED_ENROLLMENT_FIELD_DEFINITIONS) {
    const value = (values as Record<string, unknown>)[field.field]
    if (['date', 'datetime'].includes(field.input) && Object.prototype.hasOwnProperty.call(values, field.field)
      && (value === null || (typeof value === 'string' && !value.trim()))) (payload as Record<string, unknown>)[field.field] = null
  }
  const orgUrl = getOrgUrl()
  const token = getAuthToken()

  if (!isLocalHost()) {
    const result = await runtimeDataClient.executeAsync<any, any>({
      connectorOperation: {
        tableName: 'commondataserviceforapps',
        operationName: orgUrl ? 'UpdateRecordWithOrganization' : 'UpdateRecord',
        parameters: {
          ...(orgUrl ? { organization: orgUrl } : {}),
          entityName: BED_ENROLLMENTS_TABLE_ALIAS,
          recordId: cleanId,
          item: payload,
          prefer: 'return=representation',
          accept: 'application/json',
          ...(token ? { token } : {}),
        },
      },
    } as any)

    if (!result?.success) throw new Error(parseConnectorErrorMessage(result?.error || result))
    await verifyBedEnrollmentDates(cleanId, values)
    return
  }

  const localToken = await ensureAuthToken()
  if (!orgUrl || !localToken) throw new Error('Missing Dataverse connection info for Bed Enrollment update.')

  const headers = new Headers()
  headers.set('Accept', 'application/json')
  headers.set('Content-Type', 'application/json')
  headers.set('OData-Version', '4.0')
  headers.set('OData-MaxVersion', '4.0')
  headers.set('Authorization', `Bearer ${localToken}`)

  const response = await fetch(`${orgUrl}/api/data/v9.2/${BED_ENROLLMENTS_TABLE_ALIAS}(${cleanId})`, {
    method: 'PATCH',
    credentials: 'include',
    headers,
    body: JSON.stringify(payload),
  })

  if (!response.ok) throw new Error(await response.text())
  await verifyBedEnrollmentDates(cleanId, values)
}

function rowMatchesEnrollmentLookup(row: Record<string, unknown>, enrollmentRowId: string): boolean {
  const target = normalizeGuid(enrollmentRowId)
  if (!target) return false

  const candidates = [
    row?._cmps_programenrollment_value,
    row?.cmps_programenrollment,
    row?.['_cmps_programenrollment_value@OData.Community.Display.V1.FormattedValue'],
  ]

  return candidates.some((entry) => normalizeGuid(entry) === target)
}

export async function listBedEnrollmentsForProgramEnrollmentRecord(programEnrollmentRowId: string): Promise<BedEnrollmentListRecord[]> {
  const cleanId = String(programEnrollmentRowId || '').trim().replace(/[{}]/g, '')
  if (!isLikelyDataverseGuid(cleanId)) return []
  const select = [
    BED_ENROLLMENTS_PRIMARY_ID_FIELD,
    'cmps_recordid',
    'cmps_servicesite',
    'cmps_checkindate',
    'cmps_checkoutdate',
    '_cmps_programenrollment_value',
  ].join(',')
  const filters = [
    excludeArchived(`_cmps_programenrollment_value eq ${cleanId}`),
    excludeArchived(`_cmps_programenrollment_value eq '${cleanId}'`),
  ]

  const toList = (rows: Array<Record<string, unknown>>) => rows.map((row) => ({
    id: String(row?.[BED_ENROLLMENTS_PRIMARY_ID_FIELD] || row?.id || '').trim(),
    recordId: String(row?.cmps_recordid || '').trim(),
    serviceSite: formatServiceSiteLabel(decodeChoiceFieldValue('select', BED_ENROLLMENT_FIELD_DEF_BY_NAME.get('cmps_servicesite')?.options || [], row?.cmps_servicesite, row?.['cmps_servicesite@OData.Community.Display.V1.FormattedValue'])),
    checkInDate: String(row?.cmps_checkindate || '').trim(),
    checkOutDate: String(row?.cmps_checkoutdate || '').trim(),
  }))

  const orgUrl = getOrgUrl()
  const token = getAuthToken()

  if (!isLocalHost()) {
    for (const filter of filters) {
      const result = await runtimeDataClient.executeAsync<any, any>({
        connectorOperation: {
          tableName: 'commondataserviceforapps',
          operationName: orgUrl ? 'ListRecordsWithOrganization' : 'ListRecords',
          parameters: {
            ...(orgUrl ? { organization: orgUrl } : {}),
            entityName: BED_ENROLLMENTS_TABLE_ALIAS,
            '$select': select,
            '$filter': filter,
            '$top': 200,
            ...(token ? { token } : {}),
          },
        },
      } as any)

      if (result?.success) {
        const rows = rowsFromPayload(result.data)
        if (rows.length > 0) return toList(rows)
      }
    }

    const fallbackResult = await runtimeDataClient.executeAsync<any, any>({
      connectorOperation: {
        tableName: 'commondataserviceforapps',
        operationName: orgUrl ? 'ListRecordsWithOrganization' : 'ListRecords',
        parameters: {
          ...(orgUrl ? { organization: orgUrl } : {}),
          entityName: BED_ENROLLMENTS_TABLE_ALIAS,
          '$select': select,
          '$filter': excludeArchived(),
          '$top': 500,
          ...(token ? { token } : {}),
        },
      },
    } as any)

    if (fallbackResult?.success) {
      const rows = rowsFromPayload(fallbackResult.data)
      const matched = rows.filter((row: Record<string, unknown>) => rowMatchesEnrollmentLookup(row, cleanId))
      return toList(matched)
    }
  }

  const localToken = await ensureAuthToken().catch(() => '')
  if (!orgUrl || !localToken) return []

  const headers = new Headers()
  headers.set('Accept', 'application/json')
  headers.set('OData-Version', '4.0')
  headers.set('OData-MaxVersion', '4.0')
  headers.set('Authorization', `Bearer ${localToken}`)

  for (const filter of filters) {
    const response = await fetch(
      `${orgUrl}/api/data/v9.2/${BED_ENROLLMENTS_TABLE_ALIAS}?$select=${encodeURIComponent(select)}&$filter=${encodeURIComponent(filter)}&$top=200`,
      {
        method: 'GET',
        credentials: 'include',
        headers,
      },
    )

    if (!response.ok) continue
    const body = await response.json().catch(() => ({}))
    const rows: Array<Record<string, unknown>> = Array.isArray(body?.value) ? body.value : []
    if (rows.length > 0) return toList(rows)
  }

  const fallback = await fetch(
    `${orgUrl}/api/data/v9.2/${BED_ENROLLMENTS_TABLE_ALIAS}?$select=${encodeURIComponent(select)}&$top=500`,
    {
      method: 'GET',
      credentials: 'include',
      headers,
    },
  )
  if (!fallback.ok) return []

  const body = await fallback.json().catch(() => ({}))
  const rows: Array<Record<string, unknown>> = Array.isArray(body?.value) ? body.value : []
  const matched = rows.filter((row) => rowMatchesEnrollmentLookup(row, cleanId))
  return toList(matched)
}

export async function loadBedEnrollmentDetailRecord(rowId: string, recordIdHint = ''): Promise<BedEnrollmentDetailRecord> {
  const cleanId = String(rowId || '').trim()
  const cleanRecordId = String(recordIdHint || '').trim()
  if (!cleanId && !cleanRecordId) throw new Error('Missing Bed Enrollment row id and record id for detail load.')

  const select = [BED_ENROLLMENTS_PRIMARY_ID_FIELD, ...BED_ENROLLMENT_FIELD_NAMES.filter((field) => field !== 'cmps_programenrollment'), '_cmps_programenrollment_value'].join(',')
  const orgUrl = getOrgUrl()
  const token = getAuthToken()

  if (!isLocalHost()) {
    if (cleanRecordId) {
      const filter = `cmps_recordid eq '${String(cleanRecordId || '').replace(/'/g, "''")}'`
      const listResult = await runtimeDataClient.executeAsync<any, any>({
        connectorOperation: {
          tableName: 'commondataserviceforapps',
          operationName: orgUrl ? 'ListRecordsWithOrganization' : 'ListRecords',
          parameters: {
            ...(orgUrl ? { organization: orgUrl } : {}),
            entityName: BED_ENROLLMENTS_TABLE_ALIAS,
            '$select': select,
            '$filter': filter,
            '$top': 1,
            ...(token ? { token } : {}),
          },
        },
      } as any)

      if (listResult?.success) {
        const rows = rowsFromPayload(listResult.data)
        if (rows.length > 0) return mapBedEnrollmentDetailRow(rows[0])
      }
    }

    if (cleanId) {
      const directResult = await runtimeDataClient.executeAsync<any, any>({
        connectorOperation: {
          tableName: 'commondataserviceforapps',
          operationName: orgUrl ? 'GetItemWithOrganization' : 'GetItem',
          parameters: {
            ...(orgUrl ? { organization: orgUrl } : {}),
            entityName: BED_ENROLLMENTS_TABLE_ALIAS,
            recordId: cleanId,
            prefer: 'odata.include-annotations="OData.Community.Display.V1.FormattedValue"',
            accept: 'application/json',
            '$select': select,
            ...(token ? { token } : {}),
          },
        },
      } as any)

      if (directResult?.success) return mapBedEnrollmentDetailRow(directResult.data || {})
      throw new Error(parseConnectorErrorMessage(directResult?.error || directResult))
    }
  }

  const localToken = await ensureAuthToken()
  if (!orgUrl || !localToken) throw new Error('Missing Dataverse connection info for Bed Enrollment detail load.')
  const headers = new Headers()
  headers.set('Accept', 'application/json')
  headers.set('OData-Version', '4.0')
  headers.set('OData-MaxVersion', '4.0')
  headers.set('Authorization', `Bearer ${localToken}`)

  if (cleanId) {
    const directResponse = await fetch(
      `${orgUrl}/api/data/v9.2/${BED_ENROLLMENTS_TABLE_ALIAS}(${cleanId})?$select=${encodeURIComponent(select)}`,
      {
        method: 'GET',
        credentials: 'include',
        headers,
      },
    )

    if (directResponse.ok) {
      const row = await directResponse.json().catch(() => ({}))
      return mapBedEnrollmentDetailRow(row)
    }
  }

  if (!cleanRecordId) throw new Error('No Bed Enrollment record found.')
  const filter = `cmps_recordid eq '${String(cleanRecordId || '').replace(/'/g, "''")}'`
  const response = await fetch(
    `${orgUrl}/api/data/v9.2/${BED_ENROLLMENTS_TABLE_ALIAS}?$select=${encodeURIComponent(select)}&$filter=${encodeURIComponent(filter)}&$top=1`,
    {
      method: 'GET',
      credentials: 'include',
      headers,
    },
  )

  if (!response.ok) throw new Error(await response.text())
  const body = await response.json().catch(() => ({}))
  const rows: Array<Record<string, unknown>> = Array.isArray(body?.value) ? body.value : []
  if (rows.length === 0) throw new Error(`No Bed Enrollment record found for Record ID ${cleanRecordId}.`)
  return mapBedEnrollmentDetailRow(rows[0])
}
