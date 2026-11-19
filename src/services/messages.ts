import { getClient } from '@microsoft/power-apps/data'
import { dataSourcesInfo } from '../../.power/schemas/appschemas/dataSourcesInfo'
import { ensureAuthToken, getAuthToken } from './auth'
import { readDataverseRecordPages } from './dataverseRecordPages'
import { createRecordIdSequence } from './recordIdSequence'
import { APP_VERSION, appVersionsMatch, normalizeAppVersion } from './appVersion'

export const MESSAGES_TABLE_ALIAS = 'cmps_messageses'
export const MESSAGE_TYPES = [
  { label: "What's New?", value: 125570000 },
  { label: 'On The Horizon', value: 125570001 },
] as const
export const MESSAGE_REFRESH_CHOICES = [
  { label: 'Yes', value: 125570000 },
  { label: 'No', value: 125570001 },
] as const
export type MessageDraft = {
  cmps_recordid: string
  cmps_messagename: string
  cmps_startdatetime: string
  cmps_enddatetime: string
  cmps_type: string
  cmps_message: string
  cmps_rr?: string
  cmps_versionnumber?: string
}
export type MessageRecord = MessageDraft & { id: string; archived: boolean; createdOn: string; modifiedOn: string }
type Attribute = { LogicalName: string; AttributeType: string }
type DateTimeBehavior = 'UserLocal' | 'TimeZoneIndependent'
type MessageSchema = { PrimaryIdAttribute: string; Attributes: Attribute[]; dateTimeBehaviors: Record<string, DateTimeBehavior> }
const FIELDS = ['cmps_recordid', 'cmps_messagename', 'cmps_startdatetime', 'cmps_enddatetime', 'cmps_type', 'cmps_message', 'cmps_rr', 'cmps_versionnumber'] as const
const GUID = /^[a-f\d]{8}-[a-f\d]{4}-[a-f\d]{4}-[a-f\d]{4}-[a-f\d]{12}$/i
const client = getClient(dataSourcesInfo as any)
let schemaRequest: Promise<MessageSchema> | undefined

function organization(): string {
  return String(import.meta.env.VITE_DATAVERSE_ORG_URL || 'https://org1f466e4e.crm.dynamics.com').trim().replace(/\/+$/, '')
}
function local(): boolean {
  return typeof window !== 'undefined' && ['localhost', '127.0.0.1'].includes(window.location.hostname)
}
function failure(error: unknown): string {
  if (typeof error === 'string') {
    try { const parsed = JSON.parse(error); if (parsed && typeof parsed === 'object') return failure(parsed) } catch { /* Keep non-JSON Dataverse errors readable. */ }
    return error
  }
  const value = error as any
  return String(value?.error?.message || value?.innerError?.message || value?.message || 'Unable to read or save COMPASS messages.')
}
async function request(entityName: string, parameters: Record<string, unknown>, signal?: AbortSignal, urlOverride = ''): Promise<any> {
  const write = !!parameters.item
  const metadataRead = entityName.startsWith('EntityDefinitions')
  const phase = write ? 'Messages save' : entityName.includes('DateTimeAttributeMetadata') ? 'Messages schedule metadata query' : metadataRead ? 'Messages table metadata query' : 'Messages record query'
  const prefer = write ? 'return=representation' : metadataRead ? 'odata.include-annotations="*"' : 'odata.maxpagesize=1000'
  if (signal?.aborted) throw new DOMException('Aborted', 'AbortError')
  if (!local()) {
    const token = getAuthToken()
    const result = await client.executeAsync<any, any>({ connectorOperation: {
      tableName: 'commondataserviceforapps',
      operationName: write ? parameters.recordId ? 'UpdateRecordWithOrganization' : 'CreateRecordWithOrganization' : parameters.next ? 'GetNextPageWithOrganization' : 'ListRecordsWithOrganization',
      parameters: { organization: organization(), entityName, prefer, accept: 'application/json', ...parameters, ...(token ? { token } : {}) },
    } } as any)
    if (!result?.success) throw new Error(`${phase} failed: ${failure(result?.error)}`)
    if (signal?.aborted) throw new DOMException('Aborted', 'AbortError')
    return result.data
  }
  const token = await ensureAuthToken()
  if (!token) throw new Error('Dataverse authentication is required for messages.')
  const query = new URLSearchParams()
  for (const [key, value] of Object.entries(parameters)) if (key.startsWith('$')) query.set(key, String(value))
  const url = new URL(urlOverride || `${organization()}/api/data/v9.2/${entityName}${parameters.recordId ? `(${parameters.recordId})` : ''}`)
  // Reapply the original scope even when a continuation URL contains only a cookie.
  for (const [key, value] of query) url.searchParams.set(key, value)
  const response = await fetch(url.href, {
    method: write ? parameters.recordId ? 'PATCH' : 'POST' : 'GET', credentials: 'include', signal,
    headers: { Accept: 'application/json', 'Content-Type': 'application/json', 'OData-Version': '4.0', 'OData-MaxVersion': '4.0', Authorization: `Bearer ${token}`, Prefer: prefer },
    ...(write ? { body: JSON.stringify(parameters.item) } : {}),
  })
  if (!response.ok) throw new Error(`${phase} failed: ${failure(await response.text())}`)
  return write ? response.json().catch(() => ({})) : response.json()
}

async function schema(): Promise<MessageSchema> {
  if (!schemaRequest) schemaRequest = request('EntityDefinitions', {
    '$filter': `EntitySetName eq '${MESSAGES_TABLE_ALIAS}'`, '$select': 'PrimaryIdAttribute',
    // Metadata queries return all matches and do not support record paging.
    '$expand': 'Attributes($select=LogicalName,AttributeType)',
  }).then(async (payload) => {
    const rows = Array.isArray(payload) ? payload : payload?.value
    if (!Array.isArray(rows) || rows.length !== 1 || !/^[a-z][a-z\d_]*$/i.test(rows[0].PrimaryIdAttribute || '') || !Array.isArray(rows[0].Attributes)) throw new Error('Cannot resolve the cmps_messageses table metadata.')
    const resolved: MessageSchema = rows[0]
    for (const field of FIELDS) {
      const type = resolved.Attributes.find((attribute) => attribute.LogicalName === field)?.AttributeType
      const allowed = field === 'cmps_type' || field === 'cmps_rr' ? ['Picklist'] : field.endsWith('datetime') ? ['DateTime'] : ['String', 'Memo']
      if (!type || !allowed.includes(type)) throw new Error(`Messages column ${field} is missing or has an unexpected type.`)
    }
    const dateMetadata = await request("EntityDefinitions(LogicalName='cmps_messages')/Attributes/Microsoft.Dynamics.CRM.DateTimeAttributeMetadata", {
      '$select': 'LogicalName,DateTimeBehavior', '$filter': "LogicalName eq 'cmps_startdatetime' or LogicalName eq 'cmps_enddatetime'",
    })
    const dates = Array.isArray(dateMetadata) ? dateMetadata : dateMetadata?.value
    resolved.dateTimeBehaviors = {}
    for (const field of ['cmps_startdatetime', 'cmps_enddatetime']) {
      const behavior = dates?.find((attribute: any) => attribute.LogicalName === field)?.DateTimeBehavior?.Value
      if (!['UserLocal', 'TimeZoneIndependent'].includes(behavior)) throw new Error(`${field} must be a date-and-time column with User Local or Time Zone Independent behavior.`)
      resolved.dateTimeBehaviors[field] = behavior
    }
    return resolved
  }).catch((error) => { schemaRequest = undefined; throw error })
  return schemaRequest
}
function hasColumn(metadata: MessageSchema, field: string): boolean {
  return metadata.Attributes.some((attribute) => attribute.LogicalName === field)
}
export async function messagesSupportArchive(): Promise<boolean> {
  return hasColumn(await schema(), 'cmps_isarchived')
}
function typeValue(value: unknown): number {
  const text = String(value ?? '').trim()
  const option = MESSAGE_TYPES.find((type) => String(type.value) === text || type.label.toLowerCase() === text.toLowerCase())
  if (!option) throw new Error('Choose a valid message section.')
  return option.value
}

function refreshChoiceValue(value: unknown): number | null {
  const text = String(value ?? '').trim().toLowerCase()
  if (!text) return null
  const choice = MESSAGE_REFRESH_CHOICES.find((option) => String(option.value) === text || option.label.toLowerCase() === text)
  if (!choice) throw new Error('Refresh Required must be Yes or No.')
  return choice.value
}
export function refreshRequiredMessages(messages: MessageRecord[], now = Date.now()): MessageRecord[] {
  return visibleHomeMessages(messages, now).filter((message) => ['yes', '125570000'].includes(String(message.cmps_rr ?? '').trim().toLowerCase()))
}

export function refreshBannerMessages(messages: MessageRecord[], now = Date.now(), runningVersion = APP_VERSION): MessageRecord[] {
  const announcements = refreshRequiredMessages(messages, now).sort((a, b) =>
    Date.parse(b.cmps_startdatetime) - Date.parse(a.cmps_startdatetime)
    || (Date.parse(b.createdOn) || 0) - (Date.parse(a.createdOn) || 0)
    || (Date.parse(b.modifiedOn) || 0) - (Date.parse(a.modifiedOn) || 0)
    || b.cmps_recordid.localeCompare(a.cmps_recordid) || b.id.localeCompare(a.id))
  const latest = announcements[0]
  if (!latest || appVersionsMatch(runningVersion, latest.cmps_versionnumber)) return []
  // The newest active refresh message advertises the release. Earlier releases
  // must not keep warning a user who already matches that latest release.
  const target = normalizeAppVersion(latest.cmps_versionnumber)
  return announcements.filter((message) => normalizeAppVersion(message.cmps_versionnumber) === target)
}

export function messageRefreshPreview(text: string): string {
  const line = String(text || '').split(/\r?\n/).map((part) => part.trim()).find(Boolean) || ''
  const plain = line.replace(/^[#*\s]+|[*\s]+$/g, '').replace(/\s+/g, ' ')
  return plain.length > 120 ? plain.slice(0, 119).trimEnd() + '…' : plain
}

// datetime-local inputs represent the user's local time; Dataverse receives UTC.
export function messageDateTimeForInput(value: string): string {
  const date = new Date(value)
  if (!value || !Number.isFinite(date.getTime())) return ''
  const pad = (number: number) => String(number).padStart(2, '0')
  return `${date.getFullYear()}-${pad(date.getMonth() + 1)}-${pad(date.getDate())}T${pad(date.getHours())}:${pad(date.getMinutes())}:${pad(date.getSeconds())}`
}
function dateTime(value: string, label: string): Date {
  const text = String(value || '').trim()
  if (!/^\d{4}-\d{2}-\d{2}T\d{2}:\d{2}(?::\d{2}(?:\.\d{1,3})?)?(?:Z|[+-]\d{2}:\d{2})?$/.test(text)) throw new Error(`${label} must be a valid date and time.`)
  const parsed = new Date(text)
  const [year, month, day] = text.slice(0, 10).split('-').map(Number)
  const [hour, minute, second = 0] = text.slice(11).split(':').map((part) => Number.parseInt(part, 10))
  const calendar = new Date(Date.UTC(year, month - 1, day))
  if (!Number.isFinite(parsed.getTime()) || year < 1753 || hour > 23 || minute > 59 || second > 59 || calendar.getUTCFullYear() !== year || calendar.getUTCMonth() !== month - 1 || calendar.getUTCDate() !== day) throw new Error(`${label} must be a valid date and time.`)
  return parsed
}
export function validateMessageDraft(values: MessageDraft): string {
  try {
    for (const [field, label] of [['cmps_recordid', 'Record ID'], ['cmps_messagename', 'Message Name'], ['cmps_message', 'Message']] as const) if (!String(values[field] || '').trim()) throw new Error(`${label} is required.`)
    typeValue(values.cmps_type)
    refreshChoiceValue(values.cmps_rr)
    const start = dateTime(values.cmps_startdatetime, 'Start Date/Time'), end = dateTime(values.cmps_enddatetime, 'End Date/Time')
    if (end.getTime() <= start.getTime()) throw new Error('End Date/Time must be after Start Date/Time.')
    return ''
  } catch (error) { return failure(error) }
}
export function messageStatus(message: MessageDraft & { archived?: boolean }, now = Date.now()): 'Active' | 'Scheduled' | 'Expired' | 'Archived' | 'Invalid schedule' {
  if (message.archived) return 'Archived'
  const start = Date.parse(message.cmps_startdatetime), end = Date.parse(message.cmps_enddatetime)
  if (!Number.isFinite(start) || !Number.isFinite(end) || end <= start) return 'Invalid schedule'
  return now < start ? 'Scheduled' : now >= end ? 'Expired' : 'Active'
}
export function visibleHomeMessages(messages: MessageRecord[], now = Date.now()): MessageRecord[] {
  return messages.filter((message) => messageStatus(message, now) === 'Active' && MESSAGE_TYPES.some((type) => String(type.value) === message.cmps_type) && !!message.cmps_message.trim())
    .sort((a, b) => Date.parse(b.cmps_startdatetime) - Date.parse(a.cmps_startdatetime) || a.cmps_recordid.localeCompare(b.cmps_recordid))
}
export function nextMessageBoundaryDelay(messages: MessageRecord[], now = Date.now()): number {
  return messages.reduce((delay, message) => {
    for (const value of [message.cmps_startdatetime, message.cmps_enddatetime]) {
      const time = Date.parse(value)
      if (time > now) delay = Math.min(delay, time - now)
    }
    return Math.max(1, delay)
  }, 60000)
}
function mapMessage(row: Record<string, unknown>, metadata: MessageSchema): MessageRecord {
  const id = String(row[metadata.PrimaryIdAttribute] || '').trim()
  if (!GUID.test(id)) throw new Error('Dataverse returned a message without a valid row ID.')
  return {
    id, cmps_recordid: String(row.cmps_recordid || ''), cmps_messagename: String(row.cmps_messagename || ''),
    cmps_startdatetime: readDateTime(row.cmps_startdatetime, metadata.dateTimeBehaviors.cmps_startdatetime), cmps_enddatetime: readDateTime(row.cmps_enddatetime, metadata.dateTimeBehaviors.cmps_enddatetime),
    cmps_type: String(row.cmps_type ?? ''), cmps_message: String(row.cmps_message || ''), cmps_rr: String(row.cmps_rr ?? ''), cmps_versionnumber: String(row.cmps_versionnumber ?? ''),
    archived: Number(row.cmps_isarchived) === 125570000, createdOn: String(row.createdon || ''), modifiedOn: String(row.modifiedon || ''),
  }
}
function readDateTime(value: unknown, behavior: DateTimeBehavior): string {
  const text = String(value || '')
  return behavior === 'TimeZoneIndependent' ? text.replace(/(?:Z|[+-]\d{2}:\d{2})$/, '') : text
}
function storedDateTime(value: string, label: string, behavior: DateTimeBehavior): string {
  const date = dateTime(value, label)
  // Independent columns preserve the wall clock; User Local columns preserve the instant.
  return behavior === 'TimeZoneIndependent' ? `${messageDateTimeForInput(value)}Z` : date.toISOString()
}
async function readRows(metadata: MessageSchema, filter = '', select: string[] = [...FIELDS], signal?: AbortSignal): Promise<Array<Record<string, unknown>>> {
  return readDataverseRecordPages(organization(), MESSAGES_TABLE_ALIAS, {
    '$select': [...new Set([metadata.PrimaryIdAttribute, ...select])].join(','),
    '$orderby': `${metadata.PrimaryIdAttribute} asc`, ...(filter ? { '$filter': filter } : {}),
  }, !local(), (parameters, url) => request(MESSAGES_TABLE_ALIAS, parameters, signal, url))
}
export async function loadMessages(scope: 'admin' | 'home' | 'archived', now = Date.now(), signal?: AbortSignal): Promise<MessageRecord[]> {
  const metadata = await schema()
  const archive = hasColumn(metadata, 'cmps_isarchived')
  if (scope === 'archived' && !archive) return []
  const filters = archive ? [scope === 'archived' ? 'cmps_isarchived eq 125570000' : '(cmps_isarchived ne 125570000 or cmps_isarchived eq null)'] : []
  // Include future messages, so the Home clock can show them at their exact start.
  if (scope === 'home') filters.push(`cmps_enddatetime gt ${metadata.dateTimeBehaviors.cmps_enddatetime === 'TimeZoneIndependent' ? `${messageDateTimeForInput(new Date(now).toISOString())}Z` : new Date(now).toISOString()}`, '(cmps_type eq 125570000 or cmps_type eq 125570001)')
  const rows = await readRows(metadata, filters.join(' and '), [...FIELDS, ...(archive ? ['cmps_isarchived'] : []), 'createdon', 'modifiedon'], signal)
  return rows.map((row) => mapMessage(row, metadata)).filter((message) => scope === 'archived' ? message.archived : !message.archived)
}
export async function generateNextMessageRecordId(): Promise<string> {
  const metadata = await schema(), sequence = createRecordIdSequence('MSG', '04')
  for (const row of await readRows(metadata, '', ['cmps_recordid'])) sequence.observe(row.cmps_recordid)
  return sequence.allocate()
}
export async function saveMessage(rowId: string, values: MessageDraft, savedBy: string): Promise<{ id: string }> {
  const invalid = validateMessageDraft(values)
  if (invalid) throw new Error(invalid)
  if (rowId && !GUID.test(rowId)) throw new Error('A valid message row ID is required.')
  const metadata = await schema()
  const item: Record<string, unknown> = {
    cmps_recordid: values.cmps_recordid.trim(), cmps_messagename: values.cmps_messagename.trim(), cmps_message: values.cmps_message.trim(),
    cmps_type: typeValue(values.cmps_type), cmps_startdatetime: storedDateTime(values.cmps_startdatetime, 'Start Date/Time', metadata.dateTimeBehaviors.cmps_startdatetime), cmps_enddatetime: storedDateTime(values.cmps_enddatetime, 'End Date/Time', metadata.dateTimeBehaviors.cmps_enddatetime),
    cmps_rr: refreshChoiceValue(values.cmps_rr),
    cmps_versionnumber: String(values.cmps_versionnumber ?? '').trim() || null,
  }
  if (!rowId && hasColumn(metadata, 'cmps_isarchived')) item.cmps_isarchived = 125570001
  if (!rowId && savedBy && hasColumn(metadata, 'cmps_createdby')) item.cmps_createdby = savedBy
  if (savedBy && hasColumn(metadata, 'cmps_modifiedby')) item.cmps_modifiedby = savedBy
  const saved = await request(MESSAGES_TABLE_ALIAS, { ...(rowId ? { recordId: rowId } : {}), item })
  return { id: rowId || String(saved?.[metadata.PrimaryIdAttribute] || saved?.id || '') }
}
export async function archiveMessage(rowId: string, archived: boolean, savedBy: string): Promise<void> {
  if (!GUID.test(rowId)) throw new Error('A valid message row ID is required.')
  const metadata = await schema()
  if (!hasColumn(metadata, 'cmps_isarchived')) throw new Error('Add cmps_isarchived to Messages before archiving records.')
  await request(MESSAGES_TABLE_ALIAS, { recordId: rowId, item: { cmps_isarchived: archived ? 125570000 : 125570001, ...(savedBy && hasColumn(metadata, 'cmps_modifiedby') ? { cmps_modifiedby: savedBy } : {}) } })
}
