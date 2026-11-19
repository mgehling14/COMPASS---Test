import { getClient } from '@microsoft/power-apps/data'
import { dataSourcesInfo } from '../../.power/schemas/appschemas/dataSourcesInfo'
import { ensureAuthToken, getAuthToken } from './auth'
import { excludeArchived } from './archive'

export const SHELTER_SCREENINGS_TABLE_ALIAS = 'cmps_shelterscreenings'
export const SHELTER_SCREENINGS_OPTION_SET_BASE_VALUE = 125570000
export const SHELTER_SCREENINGS_PRIMARY_ID_FIELD = 'cmps_shelterscreeningid'
const DEFAULT_DATAVERSE_ORG_URL = 'https://org1f466e4e.crm.dynamics.com'
const runtimeDataClient = getClient(dataSourcesInfo as any)

export type ShelterScreeningFieldInput =
  | 'select'
  | 'radio'
  | 'date'
  | 'text'
  | 'textarea'
  | 'number'
  | 'readonly'

export type ShelterScreeningFieldDefinition = {
  field: string
  label: string
  input: ShelterScreeningFieldInput
  options: string[]
}

const YES_NO_OPTIONS = ['Yes', 'No']

export const SHELTER_SCREENING_PROGRAM_OPTIONS = [
  'Autumn House',
  'DV Outreach',
  'CAAFA Shelter',
  'DVSTOP',
  'Faith House',
]

export const SHELTER_SCREENING_TURNAWAY_REASON_OPTIONS = [
  'Caller Declined Shelter Space',
  'Household Composition Restrictions',
  'Accessibility Needs Unable to be Met',
  'Other',
]

export const SHELTER_SCREENING_FIELD_DEFINITIONS: ShelterScreeningFieldDefinition[] = [
  { field: 'cmps_recordid', label: 'Record ID', input: 'readonly', options: [] },
  { field: 'cmps_cpid', label: 'Client Profile', input: 'readonly', options: [] },
  { field: 'cmps_screendate', label: 'Screen Date', input: 'date', options: [] },
  { field: 'cmps_program', label: 'Program', input: 'select', options: SHELTER_SCREENING_PROGRAM_OPTIONS },

  { field: 'cmps_istthereanyoneelseyouneedtobringtoshelterwith', label: 'Is there anyone else you need to bring to shelter with you?', input: 'textarea', options: [] },
  { field: 'cmps_areyoucurrentlypregnant', label: 'Are you currently pregnant?', input: 'radio', options: YES_NO_OPTIONS },
  { field: 'cmps_numberofchildrencomingtotheshelter', label: 'Number of children coming to the shelter', input: 'number', options: [] },
  { field: 'cmps_agesofchildren', label: 'Ages of children', input: 'textarea', options: [] },
  { field: 'cmps_doyouneedtobringanypetswithyoutoshelter', label: 'Do you need to bring any pets with you to shelter?', input: 'radio', options: YES_NO_OPTIONS },
  { field: 'cmps_numberofpets', label: 'Number of pets', input: 'number', options: [] },
  { field: 'cmps_wasanyinformationdisclosedthatrequiresareport', label: 'Was any information disclosed that requires a report?', input: 'radio', options: YES_NO_OPTIONS },

  { field: 'cmps_doyouhaveanymedicalconditionsthesheltershould', label: 'Do you have any medical conditions the shelter should know about?', input: 'radio', options: YES_NO_OPTIONS },
  { field: 'cmps_doyouhaveanyfoodallergiesordietaryrestriction', label: 'Do you have any food allergies or dietary restrictions?', input: 'textarea', options: [] },
  { field: 'cmps_doyouoryourchildrenhaveanyphysicalormedicatio', label: 'Do you or your children have any physical or medication needs?', input: 'radio', options: YES_NO_OPTIONS },
  { field: 'cmps_willyourequireanyspecialaccommodationsuponent', label: 'Will you require any special accommodations upon entry?', input: 'radio', options: YES_NO_OPTIONS },
  { field: 'cmps_listspecialaccommodations', label: 'List special accommodations', input: 'textarea', options: [] },

  { field: 'cmps_isthereanyonewhoneedstoknowyourwhereabouts', label: 'Is there anyone who needs to know your whereabouts?', input: 'radio', options: YES_NO_OPTIONS },
  { field: 'cmps_ifyespleaseexplain', label: 'If yes, please explain', input: 'textarea', options: [] },
  { field: 'cmps_doyouhaveanycurrentorpendinglegalorcustodyiss', label: 'Do you have any current or pending legal/custody issues?', input: 'radio', options: YES_NO_OPTIONS },
  { field: 'cmps_legalorcustodyissuenotes', label: 'Legal/Custody Issues Notes', input: 'textarea', options: [] },
  { field: 'cmps_doyouoryourchildrenhaveanymedicalconditionsth', label: 'Do you or your children have any medical conditions that should be documented?', input: 'radio', options: YES_NO_OPTIONS },
  { field: 'cmps_wascallerplacedinshelter', label: 'Was caller placed in shelter?', input: 'radio', options: YES_NO_OPTIONS },
  { field: 'cmps_shelterturnawayreason', label: 'Shelter Turnaway Reason', input: 'select', options: SHELTER_SCREENING_TURNAWAY_REASON_OPTIONS },
  { field: 'cmps_shelterturnawayreasonother', label: 'Shelter Turnaway Reason - Other', input: 'text', options: [] },
]

export const SHELTER_SCREENING_FIELD_NAMES = SHELTER_SCREENING_FIELD_DEFINITIONS.map((field) => field.field)

export const SHELTER_SCREENING_FIELD_DEF_BY_NAME = new Map<string, ShelterScreeningFieldDefinition>(
  SHELTER_SCREENING_FIELD_DEFINITIONS.map((field) => [field.field, field]),
)

export type ShelterScreeningPayload = Partial<Record<(typeof SHELTER_SCREENING_FIELD_NAMES)[number], string>>

export type ShelterScreeningListRecord = {
  id: string
  recordId: string
  program: string
  screenDate: string
}

export type ShelterScreeningDetailRecord = {
  id: string
  recordId: string
  values: ShelterScreeningPayload
}

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

function normalizeText(value: unknown): string {
  return String(value || '').trim().toLowerCase()
}

function rowsFromPayload(payload: any): any[] {
  if (Array.isArray(payload)) return payload
  if (Array.isArray(payload?.value)) return payload.value
  return []
}

function escapeODataString(value: string): string {
  return String(value || '').replace(/'/g, "''")
}

function normalizeGuidValue(value: unknown): string {
  return String(value || '').trim().replace(/[{}]/g, '')
}

function normalizeDateForInput(value: unknown): string {
  const text = String(value || '').trim()
  if (!text || text.startsWith('0001-01-01')) return ''
  const match = text.match(/^(\d{4}-\d{2}-\d{2})/)
  return match?.[1] || text
}

function decodeShelterScreeningValue(fieldDef: ShelterScreeningFieldDefinition, row: any): string {
  if (fieldDef.field === 'cmps_cpid') return normalizeGuidValue(row?._cmps_cpid_value || row?.cmps_cpid)
  const raw = row?.[fieldDef.field]
  if (fieldDef.input === 'date') return normalizeDateForInput(raw)

  const formatted = String(row?.[`${fieldDef.field}@OData.Community.Display.V1.FormattedValue`] || '').trim()
  if (formatted) return formatted

  const text = String(raw ?? '').trim()
  if ((fieldDef.input === 'select' || fieldDef.input === 'radio') && isNumericLiteral(text)) {
    const index = Number.parseInt(text, 10) - SHELTER_SCREENINGS_OPTION_SET_BASE_VALUE
    if (index >= 0 && index < fieldDef.options.length) return fieldDef.options[index]
  }
  return text
}

function mapShelterScreeningListRows(rows: any[]): ShelterScreeningListRecord[] {
  return rows.map((row) => ({
    id: normalizeGuidValue(row?.[SHELTER_SCREENINGS_PRIMARY_ID_FIELD] || row?.id),
    recordId: String(row?.cmps_recordid || '').trim(),
    program: decodeShelterScreeningValue(SHELTER_SCREENING_FIELD_DEF_BY_NAME.get('cmps_program')!, row),
    screenDate: normalizeDateForInput(row?.cmps_screendate),
  }))
}

function mapShelterScreeningDetailRow(row: any): ShelterScreeningDetailRecord {
  const values: ShelterScreeningPayload = {}
  for (const fieldDef of SHELTER_SCREENING_FIELD_DEFINITIONS) {
    values[fieldDef.field] = decodeShelterScreeningValue(fieldDef, row)
  }
  return {
    id: normalizeGuidValue(row?.[SHELTER_SCREENINGS_PRIMARY_ID_FIELD] || row?.id),
    recordId: String(row?.cmps_recordid || '').trim(),
    values,
  }
}

function isNumericLiteral(value: string): boolean {
  return /^-?\d+$/.test(String(value || '').trim())
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
  if (index >= 0) return String(SHELTER_SCREENINGS_OPTION_SET_BASE_VALUE + index)
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

function normalizeShelterScreeningPayloadForDataverse(seed: ShelterScreeningPayload): Record<string, unknown> {
  const payload: Record<string, unknown> = { ...seed }

  const clientProfileId = String(payload.cmps_cpid || '').trim()
  if (clientProfileId) {
    delete payload.cmps_cpid
    payload['cmps_cpid@odata.bind'] = `/cmps_clientprofiles(${clientProfileId})`
  }

  for (const fieldName of SHELTER_SCREENING_FIELD_NAMES) {
    const fieldDef = SHELTER_SCREENING_FIELD_DEF_BY_NAME.get(fieldName)
    if (!fieldDef) continue
    const rawValue = String(payload[fieldName] || '').trim()

    if (!rawValue) {
      delete payload[fieldName]
      continue
    }

    if (fieldDef.input === 'date') {
      const normalizedDate = normalizeDateValueForDataverse(rawValue)
      if (!normalizedDate) {
        delete payload[fieldName]
        continue
      }
      payload[fieldName] = normalizedDate
      continue
    }

    if (fieldDef.input === 'number') {
      if (!isNumericLiteral(rawValue)) {
        throw new Error(`Invalid whole number value for ${fieldName}.`)
      }
      payload[fieldName] = rawValue
      continue
    }

    if (fieldDef.input === 'select' || fieldDef.input === 'radio') {
      const encoded = encodeOptionLiteral(rawValue, fieldDef.options)
      if (!isNumericLiteral(encoded)) {
        throw new Error(`Invalid choice value for ${fieldName}: "${rawValue}".`)
      }
      payload[fieldName] = encoded
    }
  }

  return payload
}

export function generateShelterScreeningRecordId(): string {
  const now = new Date()
  const datePart = now.toISOString().slice(0, 10).replace(/-/g, '')
  const timePart = now.toISOString().slice(11, 19).replace(/:/g, '')
  return `SS-${datePart}${timePart}`
}

export async function listShelterScreeningsForClient(clientRowId: string): Promise<ShelterScreeningListRecord[]> {
  const clientId = normalizeGuidValue(clientRowId)
  if (!clientId) return []

  const select = [SHELTER_SCREENINGS_PRIMARY_ID_FIELD, 'cmps_recordid', 'cmps_program', 'cmps_screendate', '_cmps_cpid_value'].join(',')
  const filter = excludeArchived(`_cmps_cpid_value eq ${clientId}`)

  if (isLocalHost()) {
    const token = await ensureAuthToken().catch(() => '')
    if (!token) return []
    const headers = new Headers({
      Accept: 'application/json',
      'OData-Version': '4.0',
      'OData-MaxVersion': '4.0',
      Authorization: `Bearer ${token}`,
      Prefer: 'odata.include-annotations="OData.Community.Display.V1.FormattedValue"',
    })
    const response = await fetch(
      `${getOrgUrl()}/api/data/v9.2/${SHELTER_SCREENINGS_TABLE_ALIAS}?$select=${encodeURIComponent(select)}&$filter=${encodeURIComponent(filter)}&$top=200`,
      { credentials: 'include', headers },
    ).catch(() => null)
    return response?.ok ? mapShelterScreeningListRows(rowsFromPayload(await response.json().catch(() => ({})))) : []
  }

  const token = getAuthToken()
  const result = await runtimeDataClient.executeAsync<any, any>({
    connectorOperation: {
      tableName: 'commondataserviceforapps',
      operationName: 'ListRecordsWithOrganization',
      parameters: {
        organization: getOrgUrl(),
        entityName: SHELTER_SCREENINGS_TABLE_ALIAS,
        '$select': select,
        '$filter': filter,
        '$top': 200,
        ...(token ? { token } : {}),
      },
    },
  } as any).catch(() => null)

  return result?.success ? mapShelterScreeningListRows(rowsFromPayload(result.data)) : []
}

export async function loadShelterScreeningDetailRecord(rowId: string, recordIdHint = ''): Promise<ShelterScreeningDetailRecord> {
  const cleanId = normalizeGuidValue(rowId)
  const cleanRecordId = String(recordIdHint || '').trim()
  if (!cleanId && !cleanRecordId) throw new Error('Missing Shelter Screening row id and record id.')

  const select = [
    SHELTER_SCREENINGS_PRIMARY_ID_FIELD,
    ...SHELTER_SCREENING_FIELD_NAMES.filter((field) => field !== 'cmps_cpid'),
    '_cmps_cpid_value',
  ].join(',')

  const loadLocal = async () => {
    const token = await ensureAuthToken()
    if (!token) throw new Error('Missing Dataverse connection info for Shelter Screening detail load.')
    const headers = new Headers({
      Accept: 'application/json',
      'OData-Version': '4.0',
      'OData-MaxVersion': '4.0',
      Authorization: `Bearer ${token}`,
      Prefer: 'odata.include-annotations="OData.Community.Display.V1.FormattedValue"',
    })
    const url = cleanId
      ? `${getOrgUrl()}/api/data/v9.2/${SHELTER_SCREENINGS_TABLE_ALIAS}(${cleanId})?$select=${encodeURIComponent(select)}`
      : `${getOrgUrl()}/api/data/v9.2/${SHELTER_SCREENINGS_TABLE_ALIAS}?$select=${encodeURIComponent(select)}&$filter=${encodeURIComponent(`cmps_recordid eq '${escapeODataString(cleanRecordId)}'`)}&$top=1`
    const response = await fetch(url, { credentials: 'include', headers })
    if (!response.ok) throw new Error(await response.text())
    const payload = await response.json()
    const row = cleanId ? payload : rowsFromPayload(payload)[0]
    if (!row) throw new Error(`No Shelter Screening record found for Record ID ${cleanRecordId}.`)
    return mapShelterScreeningDetailRow(row)
  }

  try {
    return await loadLocal()
  } catch {
    const token = getAuthToken()
    const operationName = cleanId ? 'GetRecordWithOrganization' : 'ListRecordsWithOrganization'
    const result = await runtimeDataClient.executeAsync<any, any>({
      connectorOperation: {
        tableName: 'commondataserviceforapps',
        operationName,
        parameters: {
          organization: getOrgUrl(),
          entityName: SHELTER_SCREENINGS_TABLE_ALIAS,
          ...(cleanId ? { recordId: cleanId } : { '$filter': `cmps_recordid eq '${escapeODataString(cleanRecordId)}'`, '$top': 1 }),
          '$select': select,
          ...(token ? { token } : {}),
        },
      },
    } as any)
    if (!result?.success) throw new Error(parseConnectorErrorMessage(result?.error || result))
    const row = cleanId ? result.data : rowsFromPayload(result.data)[0]
    if (!row) throw new Error(`No Shelter Screening record found for Record ID ${cleanRecordId}.`)
    return mapShelterScreeningDetailRow(row)
  }
}

export async function createShelterScreeningResponse(values: ShelterScreeningPayload): Promise<{ id: string; recordId: string }> {
  const recordId = String(values.cmps_recordid || '').trim() || generateShelterScreeningRecordId()
  const payload = normalizeShelterScreeningPayloadForDataverse({ ...values, cmps_recordid: recordId })
  const orgUrl = getOrgUrl()
  const token = getAuthToken()

  if (!isLocalHost()) {
    const result = await runtimeDataClient.executeAsync<any, any>({
      connectorOperation: {
        tableName: 'commondataserviceforapps',
        operationName: orgUrl ? 'CreateRecordWithOrganization' : 'CreateRecord',
        parameters: { prefer: 'return=representation', accept: 'application/json', 
          ...(orgUrl ? { organization: orgUrl } : {}),
          entityName: SHELTER_SCREENINGS_TABLE_ALIAS,
          item: payload,
          ...(token ? { token } : {}),
        },
      },
    } as any)

    if (!result?.success) throw new Error(parseConnectorErrorMessage(result?.error || result))
    const id = String(result?.data?.[SHELTER_SCREENINGS_PRIMARY_ID_FIELD] || result?.data?.id || '').trim()
    return { id, recordId }
  }

  const localToken = await ensureAuthToken()
  if (!orgUrl || !localToken) throw new Error('Missing Dataverse connection info for Shelter Screening create.')

  const headers = new Headers()
  headers.set('Accept', 'application/json')
  headers.set('Content-Type', 'application/json')
  headers.set('OData-Version', '4.0')
  headers.set('OData-MaxVersion', '4.0')
  headers.set('Authorization', `Bearer ${localToken}`)
  headers.set('Prefer', 'return=representation')

  const response = await fetch(`${orgUrl}/api/data/v9.2/${SHELTER_SCREENINGS_TABLE_ALIAS}`, {
    method: 'POST',
    credentials: 'include',
    headers,
    body: JSON.stringify(payload),
  })

  if (!response.ok) throw new Error(await response.text())
  const body = await response.json().catch(() => ({}))
  const id = String(body?.[SHELTER_SCREENINGS_PRIMARY_ID_FIELD] || body?.id || '').trim()
  return { id, recordId }
}

export async function updateShelterScreeningResponse(rowId: string, values: ShelterScreeningPayload): Promise<void> {
  const cleanId = String(rowId || '').trim()
  if (!cleanId) throw new Error('Missing Shelter Screening row id for update.')
  const payload = normalizeShelterScreeningPayloadForDataverse(values)
  // PATCH must explicitly clear dates; omitting a blank date preserves its old value.
  for (const field of SHELTER_SCREENING_FIELD_DEFINITIONS) {
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
          entityName: SHELTER_SCREENINGS_TABLE_ALIAS,
          recordId: cleanId,
          item: payload,
          ...(token ? { token } : {}),
        },
      },
    } as any)

    if (!result?.success) throw new Error(parseConnectorErrorMessage(result?.error || result))
    return
  }

  const localToken = await ensureAuthToken()
  if (!orgUrl || !localToken) throw new Error('Missing Dataverse connection info for Shelter Screening update.')

  const headers = new Headers()
  headers.set('Accept', 'application/json')
  headers.set('Content-Type', 'application/json')
  headers.set('OData-Version', '4.0')
  headers.set('OData-MaxVersion', '4.0')
  headers.set('Authorization', `Bearer ${localToken}`)

  const response = await fetch(`${orgUrl}/api/data/v9.2/${SHELTER_SCREENINGS_TABLE_ALIAS}(${cleanId})`, {
    method: 'PATCH',
    credentials: 'include',
    headers,
    body: JSON.stringify(payload),
  })

  if (!response.ok) throw new Error(await response.text())
}
