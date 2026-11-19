import { getClient } from '@microsoft/power-apps/data'
import { dataSourcesInfo } from '../../.power/schemas/appschemas/dataSourcesInfo'
import { ensureAuthToken, getAuthToken } from './auth'
import { ARCHIVE_TABLES } from './archive'
import { DEFAULT_DIVISION_CODE } from './recordIds'
import { APP_RECORD_ID_PREFIXES, createRecordIdSequence, type RecordIdSequence } from './recordIdSequence'
import { parseRuntimeDataverseContinuation, continuationPageKey } from './dataverseContinuation'

export type LegacyMigrationDefinition = {
  key: string; label: string; tableAlias: string; primaryIdField: string
  recordIdPrefix: string
  legacyIdField: string; parentLegacyField?: string; parentKey?: string
  additionalParents?: Array<{ parentKey: string; parentLegacyField: string; lookupAttribute: string; whenPrimaryUnresolved?: boolean }>
}

const mappings: Array<[string, string, string?, string?]> = [
  ['program-enrollment', 'cmps_programenrollmentid', 'cmps_clientidlegacy', 'client-profile'],
  ['services', 'cmps_serviceid', 'cmps_programenrollmentid', 'program-enrollment'],
  ['client-profile', 'cmps_clientid'],
  ['adult-assessment', 'cmps_assessmentid', 'cmps_clientid', 'client-profile'],
  ['release-of-information', 'cmps_limitedroiid', 'cmps_clientid', 'client-profile'],
  ['acknowledgement-consent', 'cmps_ackconid', 'cmps_clientid', 'client-profile'],
  ['animal-agreement', 'cmps_agreementid', 'cmps_clientid', 'client-profile'],
  ['bed-enrollment', 'cmps_bedid', 'cmps_programenrollmentid', 'program-enrollment'],
  ['child-assessment', 'cmps_assessmentid', 'cmps_programenrollmentid', 'program-enrollment'],
  ['child-safety-plan', 'cmps_safetyplanid', 'cmps_programenrollmentid', 'program-enrollment'],
  ['child-shelter-intake', 'cmps_childintakeid', 'cmps_programenrollmentid', 'program-enrollment'],
  ['electronic-document', 'cmps_docid', 'cmps_clientid', 'client-profile'],
  ['employment-benefits', 'cmps_employmentbenefitsid', 'cmps_clientid', 'client-profile'],
  ['event', 'cmps_eventidlegacy'],
  ['financial-assistance', 'cmps_finassistanceid', 'cmps_programenrollmentid', 'program-enrollment'],
  ['focus-plan', 'cmps_focusid', 'cmps_programenrollmentid', 'program-enrollment'],
  ['goal', 'cmps_goallegacyid', 'cmps_programenrollmentid', 'program-enrollment'],
  ['health-wellness', 'cmps_hwqid', 'cmps_clientid', 'client-profile'],
  ['helpline', 'cmps_helplineidlegacy', 'cmps_clientid', 'client-profile'],
  ['household', 'cmps_householdidlegacy'],
  ['household-history', 'cmps_householdidlegacy', 'cmps_clientidlegacy', 'client-profile'],
  ['initial-safety-plan', 'cmps_safetyplanid', 'cmps_programenrollmentid', 'program-enrollment'],
  ['medical-consent', 'cmps_consentid', 'cmps_programenrollmentid', 'program-enrollment'],
  ['person-fleeing-profile', 'cmps_personfleeprofileid', 'cmps_clientid', 'client-profile'],
  ['pet-companion-intake', 'cmps_petintakeid', 'cmps_clientid', 'client-profile'],
  ['shelter-program-guidelines', 'cmps_progguidelinesid', 'cmps_programenrollmentid', 'program-enrollment'],
  ['shelter-screening', 'cmps_shelterscreenid', 'cmps_clientid', 'client-profile'],
  ['service-animal-terms', 'cmps_termsid', 'cmps_clientid', 'client-profile'],
  ['voca-form', 'cmps_vocaid', 'cmps_programenrollmentid', 'program-enrollment'],
]

export const LEGACY_MIGRATION_TABLES: LegacyMigrationDefinition[] = mappings.map(([key, legacyIdField, parentLegacyField, parentKey]) => {
  const table = ARCHIVE_TABLES.find((entry) => entry.key === key)
  if (!table) throw new Error(`Missing migration table definition: ${key}`)
  return { key, label: table.label, tableAlias: table.tableAlias, primaryIdField: table.primaryIdField, recordIdPrefix: APP_RECORD_ID_PREFIXES[key], legacyIdField, parentLegacyField, parentKey,
    ...(key === 'household-history' ? { additionalParents: [{ parentKey: 'household', parentLegacyField: 'cmps_householdidlegacy', lookupAttribute: 'cmps_householdid' }] } : {}),
    ...(key === 'voca-form' ? { additionalParents: [{ parentKey: 'client-profile', parentLegacyField: 'cmps_clientid', lookupAttribute: 'cmps_cpid', whenPrimaryUnresolved: true }] } : {}),
  }
})

export type MigrationRelationship = { ReferencingAttribute: string; ReferencingEntityNavigationPropertyName: string; ReferencedEntity: string }
export type MigrationMetadata = {
  LogicalName: string; EntitySetName: string; PrimaryIdAttribute: string
  Attributes: Array<{ LogicalName: string; AttributeType: string; IsValidForUpdate?: boolean }>
  ManyToOneRelationships: MigrationRelationship[]
}
export type MigrationPage = { rows: Array<Record<string, unknown>>; nextLink: string }
export interface MigrationGateway {
  metadata(definition: LegacyMigrationDefinition, signal: AbortSignal): Promise<MigrationMetadata>
  page(metadata: MigrationMetadata, select: string[], nextLink: string, signal: AbortSignal): Promise<MigrationPage>
  update(metadata: MigrationMetadata, id: string, payload: Record<string, unknown>, etag: string, signal: AbortSignal): Promise<void>
}
export type MigrationPlan = {
  definition: LegacyMigrationDefinition; source: MigrationMetadata; parent?: MigrationMetadata
  parentDefinition?: LegacyMigrationDefinition; lookups: MigrationRelationship[]
  additionalParents?: Array<{ parentLegacyField: string; parentDefinition: LegacyMigrationDefinition; parent: MigrationMetadata; lookup: MigrationRelationship; whenPrimaryUnresolved?: boolean }>
}
export type MigrationOptions = { preview: boolean; migrateLinks: boolean; lookupAttribute: string; replaceExisting: boolean }
export type MigrationCounts = {
  read: number; updated: number; recordIds: number; links: number; unchanged: number; issues: number; failed: number; pages: number
}
export type MigrationCheckpoint = { version: 2; fingerprint: string; nextLink: string; counts: MigrationCounts; complete: boolean }
export type MigrationProgress = MigrationCounts & { phase: 'sequence' | 'indexing' | 'reading' | 'complete' | 'stopped'; parentRecords: number; sequenceRecords?: number; phasePage?: number }
export type MigrationIssue = { id: string; legacyId: string; parentLegacyId: string; message: string }
export type MigrationChange = { id: string; previousRecordId: string; recordId: string; lookupField: string; previousLookupId: string; lookupId: string }
export const EMPTY_MIGRATION_COUNTS: MigrationCounts = { read: 0, updated: 0, recordIds: 0, links: 0, unchanged: 0, issues: 0, failed: 0, pages: 0 }
const GUID = /^[a-f\d]{8}-[a-f\d]{4}-[a-f\d]{4}-[a-f\d]{4}-[a-f\d]{12}$/i
const client = getClient(dataSourcesInfo as any)
let migrationRunning = false
const text = (value: unknown): string => String(value ?? '').trim()
const guid = (value: unknown): string => text(value).replace(/[{}]/g, '').toLowerCase()
const orgUrl = (): string => String(import.meta.env.VITE_DATAVERSE_ORG_URL || 'https://org1f466e4e.crm.dynamics.com').trim().replace(/\/$/, '')

export class MigrationRequestError extends Error {
  status: number
  retryAfterMs: number
  constructor(message: string, status = 0, retryAfterMs = 0) { super(message); this.status = status; this.retryAfterMs = retryAfterMs }
}

function aborted(signal: AbortSignal): void { signal.throwIfAborted() }

function connectorFailure(failure: unknown): MigrationRequestError {
  const error = (failure || {}) as Record<string, any>
  const message = text(error.message || (typeof failure === 'string' ? failure : 'Dataverse migration request failed.'))
  const status = Number(error.status || error.statusCode || error.httpStatusCode) || Number(message.match(/\b(401|403|408|412|429|502|503|504)\b/)?.[1]) || (error.name === 'TypeError' ? 0 : -1)
  const retryAfter = text(error.retryAfter || error.headers?.['Retry-After'])
  const delay = /^\d+(\.\d+)?$/.test(retryAfter) ? Number(retryAfter) * 1000 : Math.max(0, Date.parse(retryAfter) - Date.now()) || 0
  return new MigrationRequestError(message, status, delay)
}

function wait(ms: number, signal: AbortSignal): Promise<void> {
  aborted(signal)
  return new Promise((resolve, reject) => {
    const stop = () => { clearTimeout(timer); reject(signal.reason || new Error('Stopped')); signal.removeEventListener('abort', stop) }
    const timer = setTimeout(() => { signal.removeEventListener('abort', stop); resolve() }, ms)
    signal.addEventListener('abort', stop, { once: true })
  })
}

export async function retryMigrationRequest<T>(task: () => Promise<T>, signal: AbortSignal): Promise<T> {
  for (let attempt = 0; ; attempt += 1) {
    aborted(signal)
    try { const value = await task(); aborted(signal); return value } catch (error) {
      aborted(signal)
      const failure = error as MigrationRequestError
      if (attempt >= 5 || ![0, 408, 429, 502, 503, 504].includes(failure.status ?? -1)) throw error
      await wait(Math.max(failure.retryAfterMs || 0, Math.min(30000, 1000 * 2 ** attempt)), signal)
    }
  }
}

export function createMigrationGateway(): MigrationGateway {
  const local = typeof window !== 'undefined' && ['localhost', '127.0.0.1'].includes(window.location.hostname)
  // A shared cooldown also holds other workers when Dataverse throttles one.
  let cooldownUntil = 0
  const request = async (entityName: string, parameters: Record<string, unknown>, signal: AbortSignal, urlOverride = ''): Promise<any> => retryMigrationRequest(async () => {
    if (cooldownUntil > Date.now()) await wait(cooldownUntil - Date.now(), signal)
    const write = !!parameters.item
    if (local) {
      const token = await ensureAuthToken()
      if (!token) throw new MigrationRequestError('Dataverse authentication is required.', 401)
      const query = new URLSearchParams()
      for (const [key, value] of Object.entries(parameters)) if (key.startsWith('$')) query.set(key, String(value))
      const url = urlOverride || `${orgUrl()}/api/data/v9.2/${entityName}${write ? `(${parameters.recordId})` : ''}?${query}`
      let response: Response
      try {
        response = await fetch(url, { method: write ? 'PATCH' : 'GET', credentials: 'include', signal,
          headers: { Accept: 'application/json', 'Content-Type': 'application/json', 'OData-Version': '4.0', 'OData-MaxVersion': '4.0', Authorization: `Bearer ${token}`, Prefer: write ? 'return=minimal' : 'odata.maxpagesize=1000', ...(write ? { 'If-Match': String(parameters['If-Match']) } : {}) },
          ...(write ? { body: JSON.stringify(parameters.item) } : {}),
        })
      } catch (error) { aborted(signal); throw new MigrationRequestError(text((error as Error)?.message) || 'Network error.') }
      if (!response.ok) {
        const retryAfter = response.headers.get('Retry-After') || ''
        const delay = /^\d+(\.\d+)?$/.test(retryAfter) ? Number(retryAfter) * 1000 : Math.max(0, Date.parse(retryAfter) - Date.now()) || 0
        if (response.status === 429) cooldownUntil = Date.now() + Math.max(delay, 1000)
        throw new MigrationRequestError(await response.text(), response.status, delay)
      }
      return write ? {} : response.json()
    }
    const token = getAuthToken()
    let result: any
    try {
      result = await client.executeAsync<any, any>({ connectorOperation: {
        tableName: 'commondataserviceforapps', operationName: write ? 'UpdateOnlyRecordWithOrganization' : parameters.next ? 'GetNextPageWithOrganization' : 'ListRecordsWithOrganization',
        parameters: { organization: orgUrl(), entityName, prefer: write ? 'return=minimal' : 'odata.maxpagesize=1000', accept: 'application/json', ...parameters, ...(token ? { token } : {}) },
      } } as any)
    } catch (failure) {
      const error = connectorFailure(failure)
      if (error.status === 429) cooldownUntil = Date.now() + Math.max(error.retryAfterMs, 1000)
      throw error
    }
    if (!result?.success) {
      const error = connectorFailure(result?.error)
      if (error.status === 429) cooldownUntil = Date.now() + Math.max(error.retryAfterMs, 1000)
      throw error
    }
    return result.data
  }, signal)
  return {
    async metadata(definition, signal) {
      const payload = await request('EntityDefinitions', {
        '$filter': `EntitySetName eq '${definition.tableAlias}' or PrimaryIdAttribute eq '${definition.primaryIdField}'`,
        '$select': 'LogicalName,EntitySetName,PrimaryIdAttribute',
        '$expand': 'Attributes($select=LogicalName,AttributeType,IsValidForUpdate),ManyToOneRelationships($select=ReferencingAttribute,ReferencingEntityNavigationPropertyName,ReferencedEntity)',
      }, signal)
      const rows = Array.isArray(payload) ? payload : payload?.value
      if (!Array.isArray(rows) || rows.length !== 1) throw new Error(`Cannot uniquely resolve Dataverse metadata for ${definition.label}. No records were changed.`)
      return rows[0]
    },
    async page(metadata, select, nextLink, signal) {
      const parameters: Record<string, unknown> = { '$select': [...new Set(select)].join(','), '$orderby': `${metadata.PrimaryIdAttribute} asc` }
      let nextUrl = ''
      if (nextLink) {
        const continuation = parseRuntimeDataverseContinuation(nextLink, orgUrl(), metadata.EntitySetName)
        nextUrl = continuation.url.href
        if (!local && continuation.kind === 'connector') {
          parameters.organization = continuation.organization
          parameters.next = continuation.next
        } else parameters['$skiptoken'] = continuation.url.searchParams.get('$skiptoken')
      }
      const payload = await request(metadata.EntitySetName, parameters, signal, nextUrl)
      const rows = Array.isArray(payload) ? payload : payload?.value
      if (!Array.isArray(rows)) throw new Error('Dataverse did not return a record page. Migration stopped.')
      const continuation = text(payload?.['@odata.nextLink'] || payload?.['odata.nextLink'])
      // Validate the next cursor before this page can cause any updates or
      // advance a checkpoint, not after partially translating another page.
      if (continuation) parseRuntimeDataverseContinuation(continuation, orgUrl(), metadata.EntitySetName)
      return { rows, nextLink: continuation }
    },
    async update(metadata, id, payload, etag, signal) {
      if (!GUID.test(id)) throw new Error('Invalid Dataverse row ID.')
      await request(metadata.EntitySetName, { recordId: id, item: payload, 'If-Match': etag || '*' }, signal)
    },
  }
}

function requireText(metadata: MigrationMetadata, field: string, writable = false): void {
  const attribute = metadata.Attributes?.find((entry) => entry.LogicalName === field)
  if (!attribute || !['String', 'Memo'].includes(attribute.AttributeType) || writable && attribute.IsValidForUpdate !== true) throw new Error(`${metadata.LogicalName}.${field} must be ${writable ? 'a writable' : 'a'} text column. No records were changed.`)
}

export async function inspectLegacyMigrationTable(key: string, gateway: MigrationGateway, signal: AbortSignal, migrateLinks = true): Promise<MigrationPlan> {
  const definition = LEGACY_MIGRATION_TABLES.find((entry) => entry.key === key)
  if (!definition) throw new Error('Choose a supported migration table.')
  const source = await gateway.metadata(definition, signal)
  requireText(source, definition.legacyIdField)
  requireText(source, 'cmps_recordid', true)
  if (!source.PrimaryIdAttribute || !source.EntitySetName) throw new Error('Incomplete table metadata.')
  if (!migrateLinks || !definition.parentKey) return { definition, source, lookups: [] }
  requireText(source, definition.parentLegacyField!)
  const parentDefinition = LEGACY_MIGRATION_TABLES.find((entry) => entry.key === definition.parentKey)!
  const parent = await gateway.metadata(parentDefinition, signal)
  if (!parent.PrimaryIdAttribute || !parent.EntitySetName) throw new Error('Incomplete parent table metadata. No records were changed.')
  requireText(parent, parentDefinition.legacyIdField)
  const lookups = (source.ManyToOneRelationships || []).filter((relationship) => relationship.ReferencedEntity === parent.LogicalName && relationship.ReferencingEntityNavigationPropertyName && source.Attributes.some((attribute) => attribute.LogicalName === relationship.ReferencingAttribute && attribute.AttributeType === 'Lookup' && attribute.IsValidForUpdate === true))
  const additionalParents: NonNullable<MigrationPlan['additionalParents']> = []
  for (const mapping of definition.additionalParents || []) {
    requireText(source, mapping.parentLegacyField)
    const extraDefinition = LEGACY_MIGRATION_TABLES.find((entry) => entry.key === mapping.parentKey)!
    const extraParent = await gateway.metadata(extraDefinition, signal)
    if (!extraParent.PrimaryIdAttribute || !extraParent.EntitySetName) throw new Error('Incomplete parent table metadata. No records were changed.')
    requireText(extraParent, extraDefinition.legacyIdField)
    const matches = (source.ManyToOneRelationships || []).filter((relationship) => relationship.ReferencingAttribute === mapping.lookupAttribute && relationship.ReferencedEntity === extraParent.LogicalName && relationship.ReferencingEntityNavigationPropertyName && source.Attributes.some((attribute) => attribute.LogicalName === mapping.lookupAttribute && attribute.AttributeType === 'Lookup' && attribute.IsValidForUpdate === true))
    if (matches.length !== 1) throw new Error(`${source.LogicalName}.${mapping.lookupAttribute} must be a unique writable lookup to ${extraParent.LogicalName}. No records were changed.`)
    additionalParents.push({ parentLegacyField: mapping.parentLegacyField, parentDefinition: extraDefinition, parent: extraParent, lookup: matches[0], ...(mapping.whenPrimaryUnresolved ? { whenPrimaryUnresolved: true } : {}) })
  }
  return { definition, source, parent, parentDefinition, lookups, ...(additionalParents.length ? { additionalParents } : {}) }
}

export function migrationFingerprint(plan: MigrationPlan, options: MigrationOptions): string {
  return JSON.stringify(['app-sequential-v2', orgUrl(), plan.definition.key, plan.source.EntitySetName, plan.source.PrimaryIdAttribute, plan.definition.legacyIdField, plan.definition.parentLegacyField, plan.parent?.EntitySetName, plan.definition.recordIdPrefix, DEFAULT_DIVISION_CODE,
    ...(options.migrateLinks && plan.definition.additionalParents?.length ? [plan.additionalParents?.map((entry) => [entry.parentLegacyField, entry.parentDefinition.legacyIdField, entry.parent.EntitySetName, entry.parent.PrimaryIdAttribute, entry.lookup, ...(entry.whenPrimaryUnresolved ? ['fallback-without-existing-enrollment'] : [])])] : []), options])
}

export function planLegacyRecord(row: Record<string, unknown>, plan: MigrationPlan, options: MigrationOptions, parents: Map<string, string | null>, sequence: RecordIdSequence, additionalIndexes: Array<Map<string, string | null>> = []): { payload: Record<string, unknown>; messages: string[]; copiedId: boolean; linked: boolean } {
  const payload: Record<string, unknown> = {}
  const messages: string[] = []
  let copiedId = false
  let linked = false
  const legacy = text(row[plan.definition.legacyIdField])
  const current = text(row.cmps_recordid)
  const extraLinkWork = options.migrateLinks && plan.additionalParents?.length && [plan.definition.parentLegacyField!, ...plan.additionalParents.map((entry) => entry.parentLegacyField)].some((field) => text(row[field]))
  if (!legacy && sequence.isAppId(current) && !extraLinkWork) return { payload, messages, copiedId, linked }
  if (!legacy && !sequence.isAppId(current)) messages.push('Legacy record ID is empty; Record ID was not changed.')
  else if (!sequence.isAppId(current)) {
    // Blank IDs and values copied from the legacy column by the old tool are
    // eligible by default. Never renumber valid app IDs on rerun or resume.
    if (current && current !== legacy && !options.replaceExisting) messages.push('Existing non-app Record ID differs from the legacy ID; preserved. Enable replacement only after review.')
    else { payload.cmps_recordid = sequence.allocate(); copiedId = true }
  }
  const resolveLink = (parent: MigrationMetadata, lookup: MigrationRelationship, legacyField: string, index: Map<string, string | null>, extra = false) => {
    const legacyParent = text(row[legacyField])
    const match = index.get(legacyParent)
    const existing = guid(row[`_${lookup.ReferencingAttribute}_value`])
    const report = (message: string) => messages.push(extra ? `${lookup.ReferencingAttribute} (${legacyField}=${JSON.stringify(legacyParent)}): ${message}` : message)
    if (!legacyParent) report('Parent legacy ID is empty; lookup was not changed.')
    else if (match === null) report('Multiple parent records share this legacy ID; lookup was not changed.')
    else if (!match) report('No parent record matches this legacy ID; lookup was not changed.')
    else if (existing !== match) {
      if (existing && !options.replaceExisting) report('Existing lookup differs; preserved. Enable replacement only after review.')
      else { payload[`${lookup.ReferencingEntityNavigationPropertyName}@odata.bind`] = `/${parent.EntitySetName}(${match})`; linked = true; return true }
    }
    return !!match && existing === match
  }
  if (options.migrateLinks && plan.parent && plan.parentDefinition) {
    const primaryLookup = plan.lookups.find((entry) => entry.ReferencingAttribute === options.lookupAttribute)!
    const primaryMessageStart = messages.length
    resolveLink(plan.parent, primaryLookup, plan.definition.parentLegacyField!, parents)
    const primaryMessageCount = messages.length - primaryMessageStart
    // A direct client fallback is only safe without a resolvable legacy
    // enrollment AND without an existing enrollment lookup. Never clear or
    // supersede an existing enrollment to force a fallback.
    const fallbackEligible = !parents.get(text(row[plan.definition.parentLegacyField!])) && !guid(row[`_${primaryLookup.ReferencingAttribute}_value`])
    for (const [index, entry] of (plan.additionalParents || []).entries()) {
      if (entry.whenPrimaryUnresolved && !fallbackEligible) continue
      const resolved = resolveLink(entry.parent, entry.lookup, entry.parentLegacyField, additionalIndexes[index], true)
      if (entry.whenPrimaryUnresolved && resolved) messages.splice(primaryMessageStart, primaryMessageCount)
    }
  }
  return { payload, messages, copiedId, linked }
}

export async function runLegacyMigration(plan: MigrationPlan, options: MigrationOptions, gateway: MigrationGateway, signal: AbortSignal, callbacks: {
  progress?: (value: MigrationProgress) => void; checkpoint?: (value: MigrationCheckpoint) => void; issue?: (value: MigrationIssue) => void; change?: (value: MigrationChange) => void
}, resume?: MigrationCheckpoint): Promise<MigrationCheckpoint> {
  if (migrationRunning) throw new Error('Another table migration is still running or stopping. Wait for its in-flight requests to settle.')
  migrationRunning = true
  try { return await runMigration(plan, options, gateway, signal, callbacks, resume) } finally { migrationRunning = false }
}

async function runMigration(plan: MigrationPlan, options: MigrationOptions, gateway: MigrationGateway, signal: AbortSignal, callbacks: {
  progress?: (value: MigrationProgress) => void; checkpoint?: (value: MigrationCheckpoint) => void; issue?: (value: MigrationIssue) => void; change?: (value: MigrationChange) => void
}, resume?: MigrationCheckpoint): Promise<MigrationCheckpoint> {
  const fingerprint = migrationFingerprint(plan, options)
  if (resume && (resume.version !== 2 || resume.fingerprint !== fingerprint || resume.complete)) throw new Error('This checkpoint does not match the selected table and settings. Start a new run to repair IDs copied by the old migration.')
  const lookup = plan.lookups.find((entry) => entry.ReferencingAttribute === options.lookupAttribute)
  if (options.migrateLinks && plan.definition.parentKey && (!plan.parent || !lookup)) throw new Error('Choose a verified lookup to the required parent table, or explicitly use Record IDs only. No records were changed.')
  if (options.migrateLinks && (plan.definition.additionalParents || []).some((mapping) => !plan.additionalParents?.some((entry) => entry.parentDefinition.key === mapping.parentKey && entry.parentLegacyField === mapping.parentLegacyField && entry.lookup.ReferencingAttribute === mapping.lookupAttribute && !!entry.whenPrimaryUnresolved === !!mapping.whenPrimaryUnresolved))) throw new Error('Check all additional parent lookup mappings before translating. No records were changed.')
  const counts = { ...(resume?.counts || EMPTY_MIGRATION_COUNTS) }
  let checkpoint: MigrationCheckpoint = { version: 2, fingerprint, nextLink: resume?.nextLink || '', counts: { ...counts }, complete: false }
  callbacks.checkpoint?.(checkpoint)
  let parentRecords = 0
  let sequenceRecords = 0
  let phasePage = 0
  const publish = (phase: MigrationProgress['phase']) => callbacks.progress?.({ ...counts, phase, parentRecords, sequenceRecords, phasePage })
  const readPage = async (metadata: MigrationMetadata, select: string[], cursor: string, phase: 'sequence' | 'indexing' | 'reading', pageNumber: number): Promise<MigrationPage> => {
    phasePage = pageNumber
    publish(phase)
    try { return await gateway.page(metadata, select, cursor, signal) } catch (error) {
      aborted(signal)
      const label = phase === 'sequence' ? 'Existing Record ID scan' : phase === 'indexing' ? 'Parent legacy-ID scan' : 'Source record processing'
      const read = phase === 'sequence' ? sequenceRecords : phase === 'indexing' ? parentRecords : counts.read
      const recovery = phase === 'reading' ? 'Completed updates are kept; the unfinished page checkpoint was not advanced.' : 'No records were changed during this preflight scan.'
      throw new Error(`${label} failed on page ${pageNumber} of ${metadata.EntitySetName} after ${read.toLocaleString()} records ${phase === 'reading' ? 'processed' : 'scanned'}. ${text((error as Error)?.message || error)} ${recovery}`)
    }
  }
  const sequence = createRecordIdSequence(plan.definition.recordIdPrefix, DEFAULT_DIVISION_CODE)
  publish('sequence')
  // Read every existing ID, including archived rows and IDs beyond page 1.
  // Reserve IDs synchronously in this run before any parallel PATCH awaits.
  let sequenceCursor = ''
  let sequencePage = 0
  const sequencePages = new Set<string>()
  do {
    aborted(signal)
    const page = await readPage(plan.source, [plan.source.PrimaryIdAttribute, 'cmps_recordid'], sequenceCursor, 'sequence', ++sequencePage)
    for (const row of page.rows) sequence.observe(row.cmps_recordid)
    sequenceRecords += page.rows.length
    publish('sequence')
    sequenceCursor = page.nextLink
    const key = continuationPageKey(sequenceCursor)
    if (sequenceCursor && sequencePages.has(key)) throw new Error(`Record-ID sequence paging repeated on page ${sequencePage} of ${plan.source.EntitySetName}; migration stopped before writing records.`)
    sequencePages.add(key)
  } while (sequenceCursor)
  const parents = new Map<string, string | null>()
  phasePage = 0
  publish('indexing')
  // Scan each parent table once into a small legacy-ID/GUID index, not one
  // network search per child. Never use recordid as a substitute for legacy ID.
  const indexParent = async (parent: MigrationMetadata, parentDefinition: LegacyMigrationDefinition, index: Map<string, string | null>) => {
    let cursor = ''
    let parentPage = 0
    const seen = new Set<string>()
    do {
      aborted(signal)
      const page = await readPage(parent, [parent.PrimaryIdAttribute, parentDefinition.legacyIdField], cursor, 'indexing', ++parentPage)
      for (const row of page.rows) {
        const legacy = text(row[parentDefinition.legacyIdField])
        const id = guid(row[parent.PrimaryIdAttribute])
        if (legacy) {
          if (!GUID.test(id)) throw new Error('A parent record has an invalid primary ID. Migration stopped before writing records.')
          index.set(legacy, index.has(legacy) && index.get(legacy) !== id ? null : id)
        }
      }
      parentRecords += page.rows.length
      publish('indexing')
      cursor = page.nextLink
      const key = continuationPageKey(cursor)
      if (cursor && seen.has(key)) throw new Error(`Parent paging repeated on page ${parentPage} of ${parent.EntitySetName}; migration stopped before writing records.`)
      seen.add(key)
    } while (cursor)
  }
  const additionalIndexes: Array<Map<string, string | null>> = []
  if (options.migrateLinks && plan.parent && plan.parentDefinition) {
    await indexParent(plan.parent, plan.parentDefinition, parents)
    for (const entry of plan.additionalParents || []) {
      const index = new Map<string, string | null>()
      await indexParent(entry.parent, entry.parentDefinition, index)
      additionalIndexes.push(index)
    }
  }
  const select = [plan.source.PrimaryIdAttribute, 'cmps_recordid', plan.definition.legacyIdField,
    ...(lookup && options.migrateLinks ? [plan.definition.parentLegacyField!, `_${lookup.ReferencingAttribute}_value`, ...(plan.additionalParents || []).flatMap((entry) => [entry.parentLegacyField, `_${entry.lookup.ReferencingAttribute}_value`])] : [])]
  let cursor = checkpoint.nextLink
  const seen = new Set<string>(cursor ? [continuationPageKey(cursor)] : [])
  do {
    aborted(signal)
    const page = await readPage(plan.source, select, cursor, 'reading', counts.pages + 1)
    const key = continuationPageKey(page.nextLink)
    if (page.nextLink && seen.has(key)) throw new Error(`Source paging repeated on page ${counts.pages + 1} of ${plan.source.EntitySetName}; migration stopped without advancing its checkpoint.`)
    if (page.nextLink) seen.add(key)
    let position = 0
    let fatal: unknown
    const worker = async () => {
      while (position < page.rows.length && !fatal && !signal.aborted) {
        const row = page.rows[position++]
        const id = guid(row[plan.source.PrimaryIdAttribute])
        const decision = planLegacyRecord(row, plan, options, parents, sequence, additionalIndexes)
        let failed = false
        try {
          if (!GUID.test(id)) throw new Error('Invalid primary record ID; record was not changed.')
          if (Object.keys(decision.payload).length) {
            if (!options.preview) await gateway.update(plan.source, id, decision.payload, text(row['@odata.etag']), signal)
            counts.updated += 1
            if (decision.copiedId) counts.recordIds += 1
            counts.links += Object.keys(decision.payload).filter((field) => field.endsWith('@odata.bind')).length
            // One report row per destination lookup; the source row is still
            // updated only once, with all resolved bindings in one PATCH.
            const reportLookups = options.migrateLinks && lookup ? [lookup, ...(plan.additionalParents || []).map((entry) => entry.lookup)] : [undefined]
            for (const reportLookup of reportLookups) callbacks.change?.({
              id, previousRecordId: String(row.cmps_recordid ?? ''), recordId: String(decision.payload.cmps_recordid ?? row.cmps_recordid ?? ''),
              lookupField: reportLookup?.ReferencingAttribute || '', previousLookupId: reportLookup ? guid(row[`_${reportLookup.ReferencingAttribute}_value`]) : '',
              lookupId: reportLookup ? guid(text(decision.payload[`${reportLookup.ReferencingEntityNavigationPropertyName}@odata.bind`]).match(/\(([^)]+)\)$/)?.[1] || row[`_${reportLookup.ReferencingAttribute}_value`]) : '',
            })
          } else counts.unchanged += 1
        } catch (error) {
          if (signal.aborted || [401, 403].includes((error as MigrationRequestError)?.status)) { fatal = error; break }
          failed = true
          counts.failed += 1
          decision.messages.push(`Update failed: ${text((error as Error)?.message || error)}`)
        }
        counts.read += 1
        if (decision.messages.length || failed) {
          counts.issues += 1
          callbacks.issue?.({ id, legacyId: text(row[plan.definition.legacyIdField]), parentLegacyId: text(row[plan.definition.parentLegacyField || '']), message: decision.messages.join(' ') })
        }
        // At most four requests in flight; publish per 25 records, not 50,000
        // React renders. Page completion always publishes an exact count.
        if (counts.read % 25 === 0) publish('reading')
      }
    }
    await Promise.all(Array.from({ length: Math.min(4, page.rows.length) }, worker))
    if (fatal) throw fatal
    aborted(signal)
    counts.pages += 1
    cursor = page.nextLink
    checkpoint = { version: 2, fingerprint, nextLink: cursor, counts: { ...counts }, complete: !cursor }
    callbacks.checkpoint?.(checkpoint)
    publish(cursor ? 'reading' : 'complete')
  } while (cursor)
  return checkpoint
}

function csvCell(value: string): string {
  return `"${(/^\s*[=+\-@]|^[\t\r\n]/.test(value) ? "'" : '') + value.replace(/"/g, '""')}"`
}

export function migrationIssueCsv(issue: MigrationIssue): string {
  return [issue.id, issue.legacyId, issue.parentLegacyId, issue.message].map(csvCell).join(',') + '\r\n'
}

export function migrationChangeCsv(change: MigrationChange): string {
  return [change.id, change.previousRecordId, change.recordId, change.lookupField, change.previousLookupId, change.lookupId].map(csvCell).join(',') + '\r\n'
}
