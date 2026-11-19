import { getClient } from '@microsoft/power-apps/data'
import { dataSourcesInfo } from '../../.power/schemas/appschemas/dataSourcesInfo'
import { ensureAuthToken, getAuthToken } from './auth'
import { excludeArchived } from './archive'

export const VOCA_FORMS_TABLE_ALIAS = 'cmps_vocaforms'
export const VOCA_FORMS_PRIMARY_ID_FIELD = 'cmps_vocaformid'
const PROGRAM_ENROLLMENT_ENTITY_SET_NAME = 'cmps_programenrollment1s'
const DEFAULT_DATAVERSE_ORG_URL = 'https://org1f466e4e.crm.dynamics.com'
const runtimeDataClient = getClient(dataSourcesInfo as any)

export type VocaFormFieldInput =
  | 'readonly'
  | 'select'
  | 'checkbox-group'
  | 'text'

export type VocaFormFieldDefinition = {
  field: string
  label: string
  input: VocaFormFieldInput
  options: string[]
  visibleWhen: Array<{
    field: string
    values: string[]
  }>
  tooltip?: string
}

export const VOCA_AGE_AT_VICTIMIZATION_OPTIONS = [
  '0 - 12',
  '13 - 17',
  '18 - 24',
  '25 - 59',
  '60 and older',
  'Not Reported',
  'Not Tracked',
]

export const VOCA_VICTIMIZATION_TYPE_OPTIONS = [
  'Adult Sexual Assault',
  'Adults Sexually Abused/Assaulted as Children',
  'Child Physical Abuse or Neglect',
  'Child Sexual Abuse/Assault',
  'Domestic and/or Family Violence',
  'Elder Abuse or Neglect',
  'Human Trafficking: Labor',
  'Human Trafficking: Sex',
]

export const VOCA_SPECIAL_CLASSIFICATION_OPTIONS = [
  'Deaf/Hard of Hearing',
  'Homeless',
  'LGBTQ',
  'Veterans',
  'Victims with Disabilities: Cognitive/Physical/Mental',
  'Victims with Limited English Proficiency',
  'Immigrants/Refugees/Asylum Seekers',
  'Other',
]

export const VOCA_RACE_ETHNICITY_OPTIONS = [
  'American Indian/Alaska Native',
  'Asian',
  'Black/African American',
  'Hispanic or Latino',
  'Native Hawaiian and Other Pacific Islander',
  'White Non-Latino/Caucasian',
  'Some Other Race',
  'Multiple Races',
  'Not Reported',
  'Not Tracked',
]

export const VOCA_FORM_FIELD_DEFINITIONS: VocaFormFieldDefinition[] = [
  { field: 'cmps_recordid', label: 'Record ID', input: 'readonly', options: [], visibleWhen: [] },
  { field: 'cmps_peid', label: 'Program Enrollment', input: 'select', options: [], visibleWhen: [] },
  { field: 'cmps_vocaageattimeofvictimization', label: 'Age at Time of Victimization', input: 'select', options: VOCA_AGE_AT_VICTIMIZATION_OPTIONS, visibleWhen: [] },
  { field: 'cmps_vocavictimizationtype1', label: 'Victimization Type', input: 'checkbox-group', options: VOCA_VICTIMIZATION_TYPE_OPTIONS, visibleWhen: [], tooltip: 'Only select the victimization types for client reason coming to the program.' },
  { field: 'cmps_specialclassificationofindividuals1', label: 'Special Classification of Individuals', input: 'checkbox-group', options: VOCA_SPECIAL_CLASSIFICATION_OPTIONS, visibleWhen: [] },
  { field: 'cmps_specialclassificationofindividualsother', label: 'Special Classification - Other', input: 'text', options: [], visibleWhen: [{ field: 'cmps_specialclassificationofindividuals1', values: ['Other'] }] },
  { field: 'cmps_vocaraceethnicity', label: 'Race / Ethnicity', input: 'select', options: VOCA_RACE_ETHNICITY_OPTIONS, visibleWhen: [] },
]

export const VOCA_FORM_FIELD_NAMES = VOCA_FORM_FIELD_DEFINITIONS.map((field) => field.field)
const VOCA_DETAIL_SELECT = [VOCA_FORMS_PRIMARY_ID_FIELD, ...VOCA_FORM_FIELD_NAMES.map((field) => field === 'cmps_peid' ? '_cmps_peid_value' : field)].join(',')
const VOCA_FORMATTED_VALUES_PREFERENCE = 'odata.include-annotations="OData.Community.Display.V1.FormattedValue"'
export const VOCA_FORM_FIELD_DEF_BY_NAME = new Map<string, VocaFormFieldDefinition>(
  VOCA_FORM_FIELD_DEFINITIONS.map((field) => [field.field, field]),
)

export type VocaFormPayload = Partial<Record<(typeof VOCA_FORM_FIELD_NAMES)[number], string>>

export type VocaFormListRecord = {
  id: string
  recordId: string
  programEnrollmentId: string
  createdOn?: string
  modifiedOn?: string
}

type VocaFormDataversePayload = Record<string, unknown>

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

function normalizeText(value: string): string {
  return String(value || '').trim().toLowerCase()
}

function isNumericLiteral(value: string): boolean {
  return /^-?\d+$/.test(String(value || '').trim())
}

function encodeOptionLiteral(value: string, options: string[]): string {
  const text = String(value || '').trim()
  if (!text) return ''
  if (isNumericLiteral(text)) return text

  const normalized = normalizeText(text)
  const index = options.findIndex((entry) => normalizeText(entry) === normalized)
  if (index >= 0) return String(125570000 + index)
  return text
}

function decodeOptionLiteral(value: string, options: string[]): string {
  const text = String(value || '').trim()
  if (!text) return ''
  if (!isNumericLiteral(text)) return text

  const numeric = Number.parseInt(text, 10)
  const index = numeric - 125570000
  if (index >= 0 && index < options.length) return options[index]
  return text
}

function normalizeChoiceValue(input: VocaFormFieldInput, options: string[], rawValue: string): string {
  const text = String(rawValue || '').trim()
  if (!text || options.length === 0) return text

  if (input === 'checkbox-group') {
    const pieces = text.split(/[;,]+/).map((entry) => entry.trim()).filter(Boolean)
    const encoded = pieces.map((entry) => encodeOptionLiteral(entry, options)).filter(Boolean)
    if (encoded.some((entry) => !isNumericLiteral(entry) || Number(entry) < 125570000 || Number(entry) >= 125570000 + options.length)) {
      throw new Error(`Invalid VOCA multi-select choice: ${text}`)
    }
    return Array.from(new Set(encoded)).join(',')
  }

  if (input === 'select') {
    return encodeOptionLiteral(text, options)
  }

  return text
}

function decodeChoiceValue(input: VocaFormFieldInput, options: string[], rawValue: unknown, formattedValue?: unknown): string {
  const formatted = String(formattedValue || '').trim()
  if (formatted) {
    if (input === 'checkbox-group') {
      return formatted.split(';').map((entry) => entry.trim()).filter(Boolean).join(', ')
    }
    return formatted
  }

  const text = String(rawValue ?? '').trim()
  if (!text || options.length === 0) return text

  if (input === 'checkbox-group') {
    const pieces = text.split(/[;,]+/).map((entry) => entry.trim()).filter(Boolean)
    return pieces.map((entry) => decodeOptionLiteral(entry, options)).join(', ')
  }

  if (input === 'select') {
    return decodeOptionLiteral(text, options)
  }

  return text
}

function escapeODataString(value: string): string {
  return String(value || '').replace(/'/g, "''")
}

function normalizeGuid(value: unknown): string {
  return String(value || '').trim().replace(/[{}]/g, '').toLowerCase()
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

function normalizeVocaFormPayloadForDataverse(seed: VocaFormPayload): VocaFormDataversePayload {
  const payload: VocaFormDataversePayload = { ...seed }
  // The migration-only direct Client Profile link is not editable on this form.
  delete payload.cmps_cpid
  // Retired columns must never be sent back to Dataverse.
  delete payload.cmps_vocavictimizationtype
  delete payload.cmps_specialclassificationofindividuals
  delete payload.cmps_hatecrimeother

  const peLookupRowId = String(payload.cmps_peid || '').trim()
  if (peLookupRowId) {
    delete payload.cmps_peid
    payload['cmps_peid@odata.bind'] = `/${PROGRAM_ENROLLMENT_ENTITY_SET_NAME}(${peLookupRowId})`
  }

  for (const fieldName of VOCA_FORM_FIELD_NAMES) {
    const fieldDef = VOCA_FORM_FIELD_DEF_BY_NAME.get(fieldName)
    if (!fieldDef) continue
    if (!Object.prototype.hasOwnProperty.call(payload, fieldName)) continue

    const rawValue = String(payload[fieldName] || '').trim()
    if (!rawValue) {
      if (fieldDef.input === 'checkbox-group') payload[fieldName] = null
      else delete payload[fieldName]
      continue
    }

    if (fieldDef.input === 'select' || fieldDef.input === 'checkbox-group') {
      payload[fieldName] = normalizeChoiceValue(fieldDef.input, fieldDef.options, rawValue)
    }
  }

  return payload
}

function mapVocaFormDetailRow(row: Record<string, unknown>): { id: string; recordId: string; values: VocaFormPayload } {
  const values: VocaFormPayload = {}

  for (const field of VOCA_FORM_FIELD_NAMES) {
    if (field === 'cmps_peid') {
      const rawLookup = row?.['_cmps_peid_value']
      values[field] = String(rawLookup || '').trim()
      continue
    }

    const fieldDef = VOCA_FORM_FIELD_DEF_BY_NAME.get(field)
    const raw = row?.[field]
    if (!fieldDef) {
      values[field] = String(raw ?? '').trim()
      continue
    }

    const formatted = (row as Record<string, unknown>)[`${field}@OData.Community.Display.V1.FormattedValue`]
    values[field] = decodeChoiceValue(fieldDef.input, fieldDef.options, raw, formatted)
  }

  return {
    id: String(row?.[VOCA_FORMS_PRIMARY_ID_FIELD] || row?.id || '').trim(),
    recordId: String(values.cmps_recordid || row?.cmps_recordid || '').trim(),
    values,
  }
}

export async function listVocaProgramEnrollmentOptionsForClient(clientRowId: string): Promise<Array<{ value: string; label: string }>> {
  const cleanClientRowId = normalizeGuid(clientRowId)
  if (!cleanClientRowId) return []

  const token = getAuthToken()
  const orgUrl = getOrgUrl()
  if (!orgUrl || !token) return []

  const headers = new Headers()
  headers.set('Accept', 'application/json')
  headers.set('OData-Version', '4.0')
  headers.set('OData-MaxVersion', '4.0')
  headers.set('Authorization', `Bearer ${token}`)

  const response = await fetch(
    `${orgUrl}/api/data/v9.2/${PROGRAM_ENROLLMENT_ENTITY_SET_NAME}?$select=cmps_programenrollment1id,cmps_recordid,cmps_program,cmps_servicestartdate,cmps_serviceenddate,_cmps_funder1_value,_cmps_clientid_value&$filter=${encodeURIComponent(excludeArchived(`_cmps_clientid_value eq ${cleanClientRowId} and (cmps_serviceenddate eq null or cmps_serviceenddate eq '')`))}&$orderby=cmps_servicestartdate desc`,
    {
      method: 'GET',
      credentials: 'include',
      headers,
    },
  ).catch(() => null)

  if (!response?.ok) return []
  const payload = await response.json().catch(() => ({}))
  const rows = rowsFromPayload(payload)

  return rows.map((row) => {
    const rowId = normalizeGuid(row?.cmps_programenrollment1id || row?.id || '')
    const recordId = String(row?.cmps_recordid || '').trim()
    const program = String(row?.cmps_program || row?.['cmps_program@OData.Community.Display.V1.FormattedValue'] || '').trim() || 'Program Enrollment'
    const startDate = String(row?.cmps_servicestartdate || '').trim()
    const label = [recordId || rowId, program, startDate]
      .map((entry) => String(entry || '').trim())
      .filter(Boolean)
      .join(' | ')
    return {
      value: rowId,
      label,
    }
  }).filter((entry) => !!entry.value)
}

export async function listExistingVocaProgramEnrollmentIds(): Promise<string[]> {
  const token = getAuthToken()
  const orgUrl = getOrgUrl()
  if (!isLocalHost()) {
    try {
      const result = await runtimeDataClient.executeAsync<any, any>({
        connectorOperation: {
          tableName: 'commondataserviceforapps',
          operationName: 'ListRecordsWithOrganization',
          parameters: { organization: orgUrl, entityName: VOCA_FORMS_TABLE_ALIAS, '$select': '_cmps_peid_value', '$filter': excludeArchived(), '$top': 5000, ...(token ? { token } : {}) },
        },
      } as any)
      if (result?.success) return rowsFromPayload(result.data).map((row) => normalizeGuid(row?._cmps_peid_value || '')).filter(Boolean)
    } catch {
      // Fall through to direct Web API.
    }
  }
  if (!orgUrl || !token) return []
  const headers = new Headers({ Accept: 'application/json', 'OData-Version': '4.0', 'OData-MaxVersion': '4.0', Authorization: `Bearer ${token}` })
  const response = await fetch(`${orgUrl}/api/data/v9.2/${VOCA_FORMS_TABLE_ALIAS}?$select=${VOCA_FORMS_PRIMARY_ID_FIELD},_cmps_peid_value&$filter=${encodeURIComponent(excludeArchived())}&$top=5000`, { credentials: 'include', headers }).catch(() => null)
  if (!response?.ok) return []
  return rowsFromPayload(await response.json().catch(() => ({})))
    .map((row) => normalizeGuid(row?._cmps_peid_value || ''))
    .filter(Boolean)
}

export async function listVocaFormsForProgramEnrollments(enrollmentIds: string[]): Promise<VocaFormListRecord[]> {
  const enrollmentIdSet = new Set(enrollmentIds.map(normalizeGuid).filter(Boolean))
  if (enrollmentIdSet.size === 0) return []

  const select = [VOCA_FORMS_PRIMARY_ID_FIELD, 'cmps_recordid', 'createdon', 'modifiedon', '_cmps_peid_value'].join(',')
  const mapRows = (rows: any[]): VocaFormListRecord[] => rows
    .map((row) => ({
      id: normalizeGuid(row?.[VOCA_FORMS_PRIMARY_ID_FIELD] || row?.id || ''),
      recordId: String(row?.cmps_recordid || '').trim(),
      programEnrollmentId: normalizeGuid(row?._cmps_peid_value || row?.cmps_peid || ''),
      createdOn: String(row?.createdon || '').trim(),
      modifiedOn: String(row?.modifiedon || '').trim(),
    }))
    .filter((row) => !!row.id && enrollmentIdSet.has(row.programEnrollmentId))

  const token = getAuthToken()
  const orgUrl = getOrgUrl()

  if (!isLocalHost()) {
    try {
      const result = await runtimeDataClient.executeAsync<any, any>({
        connectorOperation: {
          tableName: 'commondataserviceforapps',
          operationName: 'ListRecordsWithOrganization',
          parameters: { organization: orgUrl, entityName: VOCA_FORMS_TABLE_ALIAS, '$select': select, '$filter': excludeArchived(), '$top': 5000, ...(token ? { token } : {}) },
        },
      } as any)
      if (result?.success) return mapRows(rowsFromPayload(result.data))
    } catch {
      // Fall through to the direct Web API when the runtime connector is unavailable.
    }
  }

  if (!orgUrl || !token) return []

  const headers = new Headers({
    Accept: 'application/json',
    'OData-Version': '4.0',
    'OData-MaxVersion': '4.0',
    Authorization: `Bearer ${token}`,
    Prefer: 'odata.include-annotations="*"',
  })
  const response = await fetch(
    `${orgUrl}/api/data/v9.2/${VOCA_FORMS_TABLE_ALIAS}?$select=${encodeURIComponent(select)}&$filter=${encodeURIComponent(excludeArchived())}&$top=5000`,
    { credentials: 'include', headers },
  )
  if (!response.ok) throw new Error(await response.text())

  const payload = await response.json().catch(() => ({}))
  return mapRows(rowsFromPayload(payload))
}

async function createVocaFormLocal(payload: VocaFormDataversePayload): Promise<string> {
  const token = await ensureAuthToken()
  const orgUrl = getOrgUrl()
  if (!token || !orgUrl) throw new Error('Missing Dataverse connection info for VOCA form create.')

  const headers = new Headers()
  headers.set('Accept', 'application/json')
  headers.set('Content-Type', 'application/json')
  headers.set('OData-Version', '4.0')
  headers.set('OData-MaxVersion', '4.0')
  headers.set('Authorization', `Bearer ${token}`)
  headers.set('Prefer', 'return=representation')

  const response = await fetch(`${orgUrl}/api/data/v9.2/${VOCA_FORMS_TABLE_ALIAS}`, {
    method: 'POST',
    credentials: 'include',
    headers,
    body: JSON.stringify(payload),
  })

  if (!response.ok) throw new Error(await response.text())
  const body = await response.json().catch(() => ({}))
  return normalizeGuid(body?.[VOCA_FORMS_PRIMARY_ID_FIELD] || body?.id || '')
}

async function updateVocaFormLocal(rowId: string, payload: VocaFormDataversePayload): Promise<void> {
  const token = await ensureAuthToken()
  const orgUrl = getOrgUrl()
  if (!token || !orgUrl) throw new Error('Missing Dataverse connection info for VOCA form update.')

  const headers = new Headers()
  headers.set('Accept', 'application/json')
  headers.set('Content-Type', 'application/json')
  headers.set('OData-Version', '4.0')
  headers.set('OData-MaxVersion', '4.0')
  headers.set('Authorization', `Bearer ${token}`)

  const response = await fetch(`${orgUrl}/api/data/v9.2/${VOCA_FORMS_TABLE_ALIAS}(${normalizeGuid(rowId)})`, {
    method: 'PATCH',
    credentials: 'include',
    headers,
    body: JSON.stringify(payload),
  })

  if (!response.ok) throw new Error(await response.text())
}

async function loadVocaFormLocal(rowId: string, recordIdHint = ''): Promise<{ id: string; recordId: string; values: VocaFormPayload }> {
  const token = await ensureAuthToken()
  const orgUrl = getOrgUrl()
  if (!token || !orgUrl) throw new Error('Missing Dataverse connection info for VOCA form detail load.')

  const headers = new Headers()
  headers.set('Accept', 'application/json')
  headers.set('OData-Version', '4.0')
  headers.set('OData-MaxVersion', '4.0')
  headers.set('Authorization', `Bearer ${token}`)
  headers.set('Prefer', VOCA_FORMATTED_VALUES_PREFERENCE)

  const cleanId = normalizeGuid(rowId)
  if (cleanId) {
    const response = await fetch(
      `${orgUrl}/api/data/v9.2/${VOCA_FORMS_TABLE_ALIAS}(${cleanId})?$select=${encodeURIComponent(VOCA_DETAIL_SELECT)}`,
      {
        method: 'GET',
        credentials: 'include',
        headers,
      },
    )

    if (response.ok) {
      const row = await response.json()
      return mapVocaFormDetailRow(row)
    }
  }

  const recordId = String(recordIdHint || '').trim()
  if (!recordId) throw new Error('Missing VOCA row id and record id for detail load.')

  const response = await fetch(
    `${orgUrl}/api/data/v9.2/${VOCA_FORMS_TABLE_ALIAS}?$select=${encodeURIComponent(VOCA_DETAIL_SELECT)}&$filter=${encodeURIComponent(`cmps_recordid eq '${escapeODataString(recordId)}'`)}&$top=1`,
    {
      method: 'GET',
      credentials: 'include',
      headers,
    },
  )

  if (!response.ok) throw new Error(await response.text())
  const payload = await response.json().catch(() => ({}))
  const rows = rowsFromPayload(payload)
  if (rows.length === 0) throw new Error(`No VOCA form record found for Record ID ${recordId}.`)
  return mapVocaFormDetailRow(rows[0])
}

async function createVocaFormRuntime(payload: VocaFormDataversePayload): Promise<string> {
  const orgUrl = getOrgUrl()
  const token = getAuthToken()

  const result = await runtimeDataClient.executeAsync<any, any>({
    connectorOperation: {
      tableName: 'commondataserviceforapps',
      operationName: orgUrl ? 'CreateRecordWithOrganization' : 'CreateRecord',
      parameters: {
        ...(orgUrl ? { organization: orgUrl } : {}),
        entityName: VOCA_FORMS_TABLE_ALIAS,
        item: payload,
        prefer: 'return=representation',
        accept: 'application/json',
        ...(token ? { token } : {}),
      },
    },
  } as any)

  if (!result?.success) throw new Error(parseConnectorErrorMessage(result?.error || result))
  return normalizeGuid(result?.data?.[VOCA_FORMS_PRIMARY_ID_FIELD] || result?.data?.id || '')
}

async function updateVocaFormRuntime(rowId: string, payload: VocaFormDataversePayload): Promise<void> {
  const orgUrl = getOrgUrl()
  const token = getAuthToken()
  const result = await runtimeDataClient.executeAsync<any, any>({
    connectorOperation: {
      tableName: 'commondataserviceforapps',
      operationName: orgUrl ? 'UpdateRecordWithOrganization' : 'UpdateRecord',
      parameters: {
        ...(orgUrl ? { organization: orgUrl } : {}),
        entityName: VOCA_FORMS_TABLE_ALIAS,
        recordId: normalizeGuid(rowId),
        item: payload,
        prefer: 'return=representation',
        accept: 'application/json',
        ...(token ? { token } : {}),
      },
    },
  } as any)

  if (!result?.success) throw new Error(parseConnectorErrorMessage(result?.error || result))
}

export function generateVocaFormRecordId(): string {
  const now = new Date()
  const datePart = now.toISOString().slice(0, 10).replace(/-/g, '')
  const timePart = now.toISOString().slice(11, 19).replace(/:/g, '')
  return `VOCA-${datePart}${timePart}`
}

export async function createVocaFormResponse(seed: VocaFormPayload = {}): Promise<{ id: string; recordId: string }> {
  const recordId = String(seed.cmps_recordid || '').trim() || generateVocaFormRecordId()
  const payload = normalizeVocaFormPayloadForDataverse({ ...seed, cmps_recordid: recordId })

  try {
    const id = isLocalHost()
      ? await createVocaFormLocal(payload)
      : await createVocaFormRuntime(payload)
    return { id, recordId }
  } catch (error) {
    throw new Error(String((error as Error)?.message || error || 'VOCA form create failed.'))
  }
}

export async function updateVocaFormResponse(rowId: string, values: VocaFormPayload): Promise<void> {
  const cleanId = normalizeGuid(rowId)
  if (!cleanId) throw new Error('Missing VOCA form row id for update.')
  const payload = normalizeVocaFormPayloadForDataverse(values)

  try {
    if (isLocalHost()) {
      await updateVocaFormLocal(cleanId, payload)
      return
    }
    await updateVocaFormRuntime(cleanId, payload)
  } catch (error) {
    throw new Error(String((error as Error)?.message || error || 'VOCA form update failed.'))
  }
}

export async function loadVocaFormDetailRecord(rowId: string, recordIdHint = ''): Promise<{ id: string; recordId: string; values: VocaFormPayload }> {
  const cleanId = normalizeGuid(rowId)
  const cleanRecordId = String(recordIdHint || '').trim()
  if (!cleanId && !cleanRecordId) throw new Error('Missing VOCA row id and record id for detail load.')

  try {
    if (isLocalHost()) {
      return await loadVocaFormLocal(cleanId, cleanRecordId)
    }

    const orgUrl = getOrgUrl()
    const token = getAuthToken()
    if (!orgUrl) throw new Error('Dataverse organization URL could not be resolved for VOCA detail load.')

    if (cleanId) {
      const result = await runtimeDataClient.executeAsync<any, any>({
        connectorOperation: {
          tableName: 'commondataserviceforapps',
          operationName: 'GetItemWithOrganization',
          parameters: {
            organization: orgUrl,
            entityName: VOCA_FORMS_TABLE_ALIAS,
            recordId: cleanId,
            '$select': VOCA_DETAIL_SELECT,
            prefer: VOCA_FORMATTED_VALUES_PREFERENCE,
            accept: 'application/json',
            ...(token ? { token } : {}),
          },
        },
      } as any)

      if (result?.success) {
        return mapVocaFormDetailRow(result.data || {})
      }
    }
  } catch {
    // fall through to load by record ID
  }

  if (!cleanRecordId) throw new Error('Unable to load VOCA form.')

  if (isLocalHost()) {
    return loadVocaFormLocal('', cleanRecordId)
  }

  const orgUrl = getOrgUrl()
  const token = getAuthToken()
  const result = await runtimeDataClient.executeAsync<any, any>({
    connectorOperation: {
      tableName: 'commondataserviceforapps',
      operationName: 'ListRecordsWithOrganization',
      parameters: {
        organization: orgUrl,
        entityName: VOCA_FORMS_TABLE_ALIAS,
        '$select': VOCA_DETAIL_SELECT,
        '$filter': `cmps_recordid eq '${escapeODataString(cleanRecordId)}'`,
        '$top': 1,
        prefer: VOCA_FORMATTED_VALUES_PREFERENCE,
        accept: 'application/json',
        ...(token ? { token } : {}),
      },
    },
  } as any)

  if (!result?.success) throw new Error(parseConnectorErrorMessage(result?.error || result))
  const rows = rowsFromPayload(result.data)
  if (rows.length === 0) throw new Error(`No VOCA form record found for Record ID ${cleanRecordId}.`)
  return mapVocaFormDetailRow(rows[0])
}
