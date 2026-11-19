import { getClient } from '@microsoft/power-apps/data'
import { dataSourcesInfo } from '../../.power/schemas/appschemas/dataSourcesInfo'
import { ensureAuthToken, getAuthToken } from './auth'

export const RELEASE_OF_INFORMATION_TABLE_ALIAS = 'cmps_anewleaflimitedreleaseofinformations'
export const RELEASE_OF_INFORMATION_PRIMARY_ID_FIELD = 'cmps_anewleaflimitedreleaseofinformationid'
const DEFAULT_DATAVERSE_ORG_URL = 'https://org1f466e4e.crm.dynamics.com'
const OPTION_SET_BASE_VALUE = 125570000
const CLIENT_PROFILE_ENTITY_SET_NAME = 'cmps_clientprofiles'
const runtimeDataClient = getClient(dataSourcesInfo as any)

export type ReleaseOfInformationFieldInput = 'text' | 'textarea' | 'email' | 'phone' | 'date' | 'datetime' | 'checkbox-group' | 'readonly' | 'lookup'

export type ReleaseOfInformationFieldDefinition = {
  field: string
  label: string
  input: ReleaseOfInformationFieldInput
  options: string[]
  section: 'Release of Information' | 'Attestation' | 'Reaffirmation & Extension'
  visibleWhen?: { field: string; values: string[] }
}

export const RELEASE_METHOD_OPTIONS = ['In Person', 'By Phone', 'By Fax', 'By Mail', 'By E-mail']
export const RELEASE_PROGRAM_OPTIONS = ['Autumn House', 'DV Outreach', 'CAAFA Shelter', 'DVSTOP', 'Faith House', 'REACH Center', 'Other']

export const RELEASE_OF_INFORMATION_FIELDS: ReleaseOfInformationFieldDefinition[] = [
  { field: 'cmps_recordid', label: 'Record ID', input: 'readonly', options: [], section: 'Release of Information' },
  { field: 'cmps_cpid', label: 'Client Profile', input: 'lookup', options: [], section: 'Release of Information' },
  { field: 'cmps_name', label: 'Name', input: 'text', options: [], section: 'Release of Information' },
  { field: 'cmps_specificofficeatagency', label: 'Specific Office at Agency', input: 'text', options: [], section: 'Release of Information' },
  { field: 'cmps_phone', label: 'Phone', input: 'phone', options: [], section: 'Release of Information' },
  { field: 'cmps_method', label: 'Method', input: 'checkbox-group', options: RELEASE_METHOD_OPTIONS, section: 'Release of Information' },
  { field: 'cmps_email', label: 'E-mail', input: 'email', options: [], section: 'Release of Information', visibleWhen: { field: 'cmps_method', values: ['By E-mail'] } },
  { field: 'cmps_address', label: 'Address', input: 'text', options: [], section: 'Release of Information', visibleWhen: { field: 'cmps_method', values: ['By Mail'] } },
  { field: 'cmps_fax', label: 'Fax', input: 'phone', options: [], section: 'Release of Information', visibleWhen: { field: 'cmps_method', values: ['By Fax'] } },
  { field: 'cmps_programs1', label: 'Programs', input: 'checkbox-group', options: RELEASE_PROGRAM_OPTIONS, section: 'Release of Information' },
  { field: 'cmps_programsother', label: 'Programs - Other', input: 'text', options: [], section: 'Release of Information', visibleWhen: { field: 'cmps_programs1', values: ['Other'] } },
  { field: 'cmps_iwantthisinformationaboutmetobeshared', label: 'I Want This Information About Me To Be Shared', input: 'textarea', options: [], section: 'Release of Information' },
  { field: 'cmps_sharingthisinformationhelpsmebecause', label: 'Sharing This Information Helps Me Because', input: 'textarea', options: [], section: 'Release of Information' },
  { field: 'cmps_expirationdateandtime', label: 'Expiration Date and Time', input: 'datetime', options: [], section: 'Attestation' },
  { field: 'cmps_mynameandsignature', label: 'My Name and Signature', input: 'text', options: [], section: 'Attestation' },
  { field: 'cmps_witnessnameandsignature', label: 'Witness Name and Signature', input: 'text', options: [], section: 'Attestation' },
  { field: 'cmps_reaffirmed', label: 'Reaffirmed', input: 'text', options: [], section: 'Reaffirmation & Extension' },
  { field: 'cmps_witness', label: 'Witness', input: 'text', options: [], section: 'Reaffirmation & Extension' },
]

export type ReleaseOfInformationPayload = Partial<Record<string, string>>

function orgUrl(): string { return String(import.meta.env.VITE_DATAVERSE_ORG_URL || DEFAULT_DATAVERSE_ORG_URL).trim().replace(/\/$/, '') }
function localHost(): boolean { return typeof window !== 'undefined' && ['localhost', '127.0.0.1'].includes(window.location.hostname) }
function normalize(value: string): string { return String(value || '').trim().toLowerCase() }
function numeric(value: string): boolean { return /^-?\d+$/.test(String(value || '').trim()) }
function parseError(error: unknown): string { return String((error as any)?.innerError?.message || (error as any)?.message || error || 'Dataverse operation failed.') }

function normalizePayload(seed: ReleaseOfInformationPayload): Record<string, unknown> {
  const payload: Record<string, unknown> = { ...seed }
  delete payload.cmps_programs
  const clientId = String(payload.cmps_cpid || '').trim().replace(/[{}]/g, '')
  delete payload.cmps_cpid
  if (clientId) payload['cmps_cpid@odata.bind'] = `/${CLIENT_PROFILE_ENTITY_SET_NAME}(${clientId})`
  if (payload.cmps_recordid) payload.cmps_recordid = String(payload.cmps_recordid).trim().replace(/\.+$/, '')
  for (const field of RELEASE_OF_INFORMATION_FIELDS) {
    const value = String(payload[field.field] || '').trim()
    if (!value) { delete payload[field.field]; continue }
    if (field.input === 'checkbox-group') {
      const choices = value.split(/[,;]+/).map((item) => item.trim()).filter(Boolean).map((item) => {
        if (numeric(item)) return item
        const index = field.options.findIndex((option) => normalize(option) === normalize(item))
        if (index < 0) throw new Error(`Invalid choice value for ${field.label}.`)
        return String(OPTION_SET_BASE_VALUE + index)
      })
      payload[field.field] = Array.from(new Set(choices)).join(',')
    }
  }
  return payload
}

async function createLocal(payload: Record<string, unknown>): Promise<string> {
  const token = await ensureAuthToken()
  if (!token) throw new Error('Missing Dataverse connection info for Release of Information create.')
  const response = await fetch(`${orgUrl()}/api/data/v9.2/${RELEASE_OF_INFORMATION_TABLE_ALIAS}`, {
    method: 'POST', credentials: 'include',
    headers: { Accept: 'application/json', 'Content-Type': 'application/json', 'OData-Version': '4.0', 'OData-MaxVersion': '4.0', Authorization: `Bearer ${token}`, Prefer: 'return=representation' },
    body: JSON.stringify(payload),
  })
  if (!response.ok) throw new Error(await response.text())
  const body = await response.json().catch(() => ({}))
  return String(body?.[RELEASE_OF_INFORMATION_PRIMARY_ID_FIELD] || body?.id || '').trim()
}

async function createRuntime(payload: Record<string, unknown>): Promise<string> {
  const token = getAuthToken()
  const result = await runtimeDataClient.executeAsync<any, any>({ connectorOperation: { tableName: 'commondataserviceforapps', operationName: 'CreateRecordWithOrganization', parameters: { organization: orgUrl(), entityName: RELEASE_OF_INFORMATION_TABLE_ALIAS, item: payload, prefer: 'return=representation', accept: 'application/json', ...(token ? { token } : {}) } } } as any)
  if (!result?.success) throw new Error(parseError(result?.error || result))
  return String(result?.data?.[RELEASE_OF_INFORMATION_PRIMARY_ID_FIELD] || result?.data?.id || '').trim()
}

export function generateReleaseOfInformationRecordId(): string {
  return `ROI-${new Date().toISOString().replace(/[-:T]/g, '').slice(0, 15)}`.replace(/\.+$/, '')
}

export async function createReleaseOfInformationResponse(values: ReleaseOfInformationPayload): Promise<string> {
  const payload = normalizePayload({ ...values, cmps_recordid: String(values.cmps_recordid || '').trim() || generateReleaseOfInformationRecordId() })
  return localHost() ? createLocal(payload) : createRuntime(payload)
}

export async function updateReleaseOfInformationResponse(rowId: string, values: ReleaseOfInformationPayload): Promise<void> {
  const id = String(rowId || '').trim().replace(/[{}]/g, '')
  if (!/^[a-f\d]{8}-[a-f\d]{4}-[a-f\d]{4}-[a-f\d]{4}-[a-f\d]{12}$/i.test(id)) throw new Error('A valid Release of Information row ID is required.')
  const payload = normalizePayload(values)
  // PATCH must explicitly clear dates; omitting a blank date preserves its old value.
  for (const field of RELEASE_OF_INFORMATION_FIELDS) {
    const value = (values as Record<string, unknown>)[field.field]
    if (['date', 'datetime'].includes(field.input) && Object.prototype.hasOwnProperty.call(values, field.field)
      && (value === null || (typeof value === 'string' && !value.trim()))) (payload as Record<string, unknown>)[field.field] = null
  }
  if (localHost()) {
    const token = await ensureAuthToken()
    if (!token) throw new Error('Dataverse authentication is required to update Release of Information.')
    const response = await fetch(`${orgUrl()}/api/data/v9.2/${RELEASE_OF_INFORMATION_TABLE_ALIAS}(${id})`, { method: 'PATCH', credentials: 'include', headers: { Accept: 'application/json', 'Content-Type': 'application/json', Authorization: `Bearer ${token}` }, body: JSON.stringify(payload) })
    if (!response.ok) throw new Error(await response.text())
    return
  }
  const token = getAuthToken()
  const result = await runtimeDataClient.executeAsync<any, any>({ connectorOperation: { tableName: 'commondataserviceforapps', operationName: 'UpdateRecordWithOrganization', parameters: { organization: orgUrl(), entityName: RELEASE_OF_INFORMATION_TABLE_ALIAS, recordId: id, item: payload, prefer: 'return=representation', accept: 'application/json', ...(token ? { token } : {}) } } } as any)
  if (!result?.success) throw new Error(parseError(result?.error || result))
}
