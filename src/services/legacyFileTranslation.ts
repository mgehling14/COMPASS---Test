import { COMPASS_FILES_PRIMARY_ID_FIELD, COMPASS_FILES_TABLE_ALIAS } from './compassFiles'
import { CHILD_SAFETY_PLAN_FIELDS } from './childSafetyPlan'
import { ELECTRONIC_DOCUMENT_FIELDS } from './electronicDocument'
import { EVENT_FIELD_DEFINITIONS } from './event'
import { PERSON_YOU_ARE_FLEEING_PROFILE_FIELDS } from './personYouAreFleeingProfile'
import { LEGACY_MIGRATION_TABLES, type LegacyMigrationDefinition, type MigrationGateway, type MigrationMetadata, type MigrationRelationship } from './legacyRecordMigration'

const forms: Array<{ key: string; fields: ReadonlyArray<{ field: string; input: string }> }> = [
  { key: 'child-safety-plan', fields: CHILD_SAFETY_PLAN_FIELDS },
  { key: 'electronic-document', fields: ELECTRONIC_DOCUMENT_FIELDS },
  { key: 'event', fields: EVENT_FIELD_DEFINITIONS },
  { key: 'person-fleeing-profile', fields: PERSON_YOU_ARE_FLEEING_PROFILE_FIELDS },
]
export const FILE_TRANSLATION_TABLES = forms.map(({ key, fields }) => ({
  definition: LEGACY_MIGRATION_TABLES.find((entry) => entry.key === key)!,
  uploads: fields.filter((field) => field.input === 'file').map((field) => field.field),
}))
const FILES: LegacyMigrationDefinition = { key: 'compass-file', label: 'Compass Files', tableAlias: COMPASS_FILES_TABLE_ALIAS,
  primaryIdField: COMPASS_FILES_PRIMARY_ID_FIELD, recordIdPrefix: 'FILE', legacyIdField: 'cmps_relatedrecordidlegacy' }
export type FileTranslationOptions = { destination: string; eventSlot: 'review' | 'cmps_fileid1' | 'cmps_fileid2' | 'empty-in-order' }
type Destination = { definition: LegacyMigrationDefinition; metadata: MigrationMetadata; slots: MigrationRelationship[]; select: string[] }
export type FileTranslationRow = {
  fileId: string; fileRecordId: string; destination: string; legacyId: string; targetId: string; targetRecordId: string
  slot: string; state: 'ready' | 'unchanged' | 'issue' | 'skipped' | 'updated' | 'failed' | 'partial'; message: string
}
export type FileTranslationPlan = { options: FileTranslationOptions; source: MigrationMetadata; destinations: Destination[]; rows: FileTranslationRow[]; signature: string }
const text = (value: unknown) => String(value ?? '').trim()
const guid = (value: unknown) => text(value).replace(/[{}]/g, '').toLowerCase()
const GUID = /^[a-f\d]{8}-[a-f\d]{4}-[a-f\d]{4}-[a-f\d]{4}-[a-f\d]{12}$/i
const identifier = /^[a-z][a-z\d_]*$/i
const name = (value: unknown) => text(value).toLowerCase().replace(/[^a-z0-9]/g, '')
const etag = (row: Record<string, unknown>) => /^W\/"[^"\r\n]+"$/.test(text(row['@odata.etag'])) ? text(row['@odata.etag']) : ''
const SOURCE_FIELDS = [COMPASS_FILES_PRIMARY_ID_FIELD, 'cmps_recordid', 'cmps_relatedrecordidlegacy', 'cmps_destinationtablename', 'cmps_relatedrecordid']
let applying = false

function requireText(metadata: MigrationMetadata, field: string, writable = false) {
  const column = metadata.Attributes.find((entry) => entry.LogicalName === field)
  if (!column || !['String', 'Memo'].includes(column.AttributeType) || writable && column.IsValidForUpdate !== true) throw new Error(`${metadata.LogicalName}.${field} must be ${writable ? 'writable ' : ''}text. No records changed.`)
}
function verify(metadata: MigrationMetadata, definition: LegacyMigrationDefinition) {
  if (metadata.EntitySetName !== definition.tableAlias || metadata.PrimaryIdAttribute !== definition.primaryIdField
    || !identifier.test(metadata.LogicalName) || !identifier.test(metadata.EntitySetName) || !identifier.test(metadata.PrimaryIdAttribute)) {
    throw new Error(`Metadata does not match the configured alias for ${definition.label}. No records changed.`)
  }
}
async function scan(gateway: MigrationGateway, metadata: MigrationMetadata, select: string[], signal: AbortSignal, progress: (message: string) => void) {
  const rows: Array<Record<string, unknown>> = [], ids = new Set<string>(), cursors = new Set<string>()
  let cursor = '', pages = 0
  do {
    signal.throwIfAborted()
    const page = await gateway.page(metadata, select, cursor, signal)
    for (const row of page.rows) {
      const id = guid(row[metadata.PrimaryIdAttribute])
      if (!GUID.test(id) || ids.has(id)) throw new Error(`Invalid/repeated record page in ${metadata.EntitySetName}; stopped before writes.`)
      ids.add(id); rows.push(row)
    }
    cursor = page.nextLink
    if (cursor && cursors.has(cursor)) throw new Error(`Repeated continuation in ${metadata.EntitySetName}; stopped before writes.`)
    cursors.add(cursor); progress(`${metadata.EntitySetName}: ${rows.length.toLocaleString()} records read (${++pages} pages).`)
  } while (cursor)
  return rows
}
function matches(value: unknown, destination: Destination) {
  return [destination.definition.key, destination.definition.label, destination.definition.tableAlias, destination.metadata.LogicalName].some((candidate) => name(candidate) === name(value))
}
function audit(metadata: MigrationMetadata, savedBy: string): Record<string, string> {
  const field = metadata.Attributes.find((entry) => entry.LogicalName === 'cmps_modifiedby')
  return field?.AttributeType === 'String' && field.IsValidForUpdate === true ? { cmps_modifiedby: savedBy } : {}
}

export async function previewFileTranslation(options: FileTranslationOptions, gateway: MigrationGateway, signal: AbortSignal,
  progress: (message: string) => void = () => {}): Promise<FileTranslationPlan> {
  if (options.destination !== 'all' && !FILE_TRANSLATION_TABLES.some((entry) => entry.definition.key === options.destination)) throw new Error('Choose a supported upload table.')
  if (!['review', 'cmps_fileid1', 'cmps_fileid2', 'empty-in-order'].includes(options.eventSlot)) throw new Error('Choose a valid Event file-slot rule.')
  const source = await gateway.metadata(FILES, signal)
  verify(source, FILES)
  for (const field of ['cmps_recordid', 'cmps_relatedrecordidlegacy', 'cmps_destinationtablename']) requireText(source, field)
  requireText(source, 'cmps_relatedrecordid', true)
  const destinations: Destination[] = []
  // Inspect all four tables so a file already attached elsewhere is not reused.
  for (const entry of FILE_TRANSLATION_TABLES) {
    signal.throwIfAborted()
    const metadata = await gateway.metadata(entry.definition, signal)
    verify(metadata, entry.definition)
    requireText(metadata, entry.definition.legacyIdField); requireText(metadata, 'cmps_recordid')
    const slots = entry.uploads.map((field) => {
      const candidates = metadata.ManyToOneRelationships.filter((relationship) => relationship.ReferencingAttribute === field
        && relationship.ReferencedEntity === source.LogicalName && identifier.test(relationship.ReferencingEntityNavigationPropertyName)
        && metadata.Attributes.some((column) => column.LogicalName === field && column.AttributeType === 'Lookup' && column.IsValidForUpdate === true))
      if (candidates.length !== 1) throw new Error(`${metadata.LogicalName}.${field} must be a unique writable lookup to Compass Files. No records changed.`)
      return candidates[0]
    })
    destinations.push({ definition: entry.definition, metadata, slots,
      select: [metadata.PrimaryIdAttribute, 'cmps_recordid', entry.definition.legacyIdField, ...slots.map((slot) => `_${slot.ReferencingAttribute}_value`)] })
  }
  const indexes = new Map<string, Map<string, Array<Record<string, unknown>>>>(), attached = new Map<string, Set<string>>()
  for (const destination of destinations) {
    const index = new Map<string, Array<Record<string, unknown>>>()
    for (const row of await scan(gateway, destination.metadata, destination.select, signal, progress)) {
      const legacy = text(row[destination.definition.legacyIdField])
      if (legacy) { const candidates = index.get(legacy) || []; candidates.push(row); index.set(legacy, candidates) }
      for (const slot of destination.slots) {
        const file = guid(row[`_${slot.ReferencingAttribute}_value`])
        if (file) { const owners = attached.get(file) || new Set<string>(); owners.add(`${destination.definition.key}:${guid(row[destination.metadata.PrimaryIdAttribute])}`); attached.set(file, owners) }
      }
    }
    indexes.set(destination.definition.key, index)
  }
  const rows: FileTranslationRow[] = [], groups = new Map<string, { destination: Destination; target: Record<string, unknown>; files: Array<{ row: FileTranslationRow; source: Record<string, unknown> }> }>()
  for (const file of await scan(gateway, source, SOURCE_FIELDS, signal, progress)) {
    const row: FileTranslationRow = { fileId: guid(file[source.PrimaryIdAttribute]), fileRecordId: text(file.cmps_recordid), destination: text(file.cmps_destinationtablename),
      legacyId: text(file.cmps_relatedrecordidlegacy), targetId: '', targetRecordId: '', slot: '', state: 'issue', message: '' }
    rows.push(row)
    if (!row.legacyId && !row.destination) { row.state = 'skipped'; row.message = 'Not marked as a legacy import.'; continue }
    const matched = destinations.filter((destination) => matches(row.destination, destination))
    if (matched.length !== 1) { row.message = 'Destination table is missing or not a supported verified upload table.'; continue }
    const destination = matched[0]
    if (options.destination !== 'all' && options.destination !== destination.definition.key) { row.state = 'skipped'; row.message = 'Different destination table.'; continue }
    row.destination = destination.definition.label
    const candidates = indexes.get(destination.definition.key)!.get(row.legacyId) || []
    if (!row.legacyId || candidates.length !== 1) { row.message = !row.legacyId ? 'Related legacy ID is empty.' : candidates.length ? 'Multiple destination records share this legacy ID; no link chosen.' : 'No destination record has this exact legacy ID.'; continue }
    const target = candidates[0]
    row.targetId = guid(target[destination.metadata.PrimaryIdAttribute]); row.targetRecordId = text(target.cmps_recordid)
    if (!row.targetRecordId || row.targetRecordId === row.legacyId) { row.message = 'Translate the destination record to its app Record ID first.'; continue }
    const owner = `${destination.definition.key}:${row.targetId}`
    if ([...(attached.get(row.fileId) || [])].some((existing) => existing !== owner)) { row.message = 'File is already attached to a different record; preserved.'; continue }
    if (text(file.cmps_relatedrecordid) && text(file.cmps_relatedrecordid) !== row.targetRecordId) { row.message = 'Existing file related Record ID differs; preserved.'; continue }
    if (!etag(file) || !etag(target)) { row.message = 'A concurrency ETag is missing; cannot safely update this pair.'; continue }
    const group = groups.get(owner) || { destination, target, files: [] }
    group.files.push({ row, source: file }); groups.set(owner, group)
  }
  for (const { destination, target, files } of groups.values()) {
    const slots = destination.definition.key === 'event' && options.eventSlot !== 'empty-in-order' && options.eventSlot !== 'review'
      ? destination.slots.filter((slot) => slot.ReferencingAttribute === options.eventSlot) : destination.slots
    const reserved = new Map(destination.slots.map((slot) => [slot.ReferencingAttribute, guid(target[`_${slot.ReferencingAttribute}_value`])]))
    const pending = files.filter(({ row }) => !destination.slots.some((slot) => reserved.get(slot.ReferencingAttribute) === row.fileId))
    for (const { row, source: file } of files.sort((a, b) => a.row.fileId.localeCompare(b.row.fileId))) {
      const existing = destination.slots.find((slot) => reserved.get(slot.ReferencingAttribute) === row.fileId)
      if (!existing && destination.definition.key === 'event' && options.eventSlot === 'review') { row.message = 'Choose an Event upload slot rule and preview again.'; continue }
      if (!existing && slots.length === 1 && pending.length > 1) { row.message = 'Multiple imported files compete for one upload field; review these files manually.'; continue }
      const slot = existing || slots.find((candidate) => !reserved.get(candidate.ReferencingAttribute))
      if (!slot) { row.message = 'No empty upload field is available; existing attachments are preserved.'; continue }
      reserved.set(slot.ReferencingAttribute, row.fileId); row.slot = slot.ReferencingAttribute
      row.state = existing && text(file.cmps_relatedrecordid) === row.targetRecordId ? 'unchanged' : 'ready'
      row.message = row.state === 'unchanged' ? 'Already linked on both records.' : existing ? 'Repair the file related Record ID; attachment already exists.' : 'Attach file and set its related app Record ID.'
    }
  }
  const signature = JSON.stringify([options, source.EntitySetName, destinations.map((destination) => [destination.metadata.EntitySetName, destination.definition.legacyIdField,
    destination.slots.map((slot) => [slot.ReferencingAttribute, slot.ReferencingEntityNavigationPropertyName, slot.ReferencedEntity])]),
    rows.filter((row) => row.state === 'ready').map((row) => [row.fileId, row.targetId, row.targetRecordId, row.destination, row.legacyId, row.slot])])
  return { options: { ...options }, source, destinations, rows, signature }
}

export async function applyFileTranslation(reviewed: FileTranslationPlan, gateway: MigrationGateway, signal: AbortSignal, savedBy: string,
  authorize: () => boolean, progress: (message: string) => void = () => {}, completed: (row: FileTranslationRow) => void = () => {}): Promise<FileTranslationRow[]> {
  if (applying) throw new Error('A file translation is still running or stopping.')
  if (!authorize() || !text(savedBy)) throw new Error('IT Admin access and a signed-in identity are required.')
  if (!gateway.record) throw new Error('The migration gateway cannot recheck records safely.')
  applying = true
  try {
    const fresh = await previewFileTranslation(reviewed.options, gateway, signal, progress)
    if (fresh.signature !== reviewed.signature) throw new Error('Records or mappings changed since preview. Preview again; no records changed.')
    const groups = new Map<string, FileTranslationRow[]>()
    for (const row of fresh.rows.filter((entry) => entry.state === 'ready')) {
      const key = `${row.destination}:${row.targetId}`; groups.set(key, [...(groups.get(key) || []), row])
    }
    const work = [...groups.values()], total = fresh.rows.filter((row) => row.state === 'ready').length
    let next = 0, finished = 0
    const worker = async () => {
      while (next < work.length) {
        const group = work[next++]
        for (const row of group) {
          signal.throwIfAborted()
          if (!authorize()) throw new Error('IT Admin access changed; translation stopped.')
          const destination = fresh.destinations.find((entry) => entry.definition.label === row.destination)!
          let attachedNow = false
          try {
            const target = await gateway.record!(destination.metadata, row.targetId, destination.select, signal)
            const file = await gateway.record!(fresh.source, row.fileId, SOURCE_FIELDS, signal)
            const slot = destination.slots.find((entry) => entry.ReferencingAttribute === row.slot)!
            const current = guid(target[`_${row.slot}_value`])
            if (text(target[destination.definition.legacyIdField]) !== row.legacyId || text(target.cmps_recordid) !== row.targetRecordId
              || text(file.cmps_relatedrecordidlegacy) !== row.legacyId || !matches(file.cmps_destinationtablename, destination)
              || current && current !== row.fileId || text(file.cmps_relatedrecordid) && text(file.cmps_relatedrecordid) !== row.targetRecordId
              || destination.slots.some((other) => other.ReferencingAttribute !== row.slot && guid(target[`_${other.ReferencingAttribute}_value`]) === row.fileId)) {
              throw new Error('A record/link changed; no existing attachment was replaced. Preview again.')
            }
            if (!etag(target) || !etag(file)) throw new Error('A concurrency ETag is missing; no unsafe update attempted.')
            if (!authorize()) throw new Error('IT Admin access changed; translation stopped.')
            if (current !== row.fileId) await gateway.update(destination.metadata, row.targetId, {
              [`${slot.ReferencingEntityNavigationPropertyName}@odata.bind`]: `/${fresh.source.EntitySetName}(${row.fileId})`, ...audit(destination.metadata, savedBy),
            }, etag(target), signal)
            attachedNow = true
            signal.throwIfAborted()
            if (!authorize()) throw new Error('IT Admin access changed; attachment exists but file backlink was not updated. Rerun to repair.')
            if (text(file.cmps_relatedrecordid) !== row.targetRecordId) await gateway.update(fresh.source, row.fileId,
              { cmps_relatedrecordid: row.targetRecordId, ...audit(fresh.source, savedBy) }, etag(file), signal)
            row.state = 'updated'; row.message = 'File and destination linked. File contents and legacy columns unchanged.'
          } catch (error) {
            row.state = attachedNow ? 'partial' : 'failed'; row.message = `${attachedNow ? 'Attachment exists; backlink may need repair. Rerun safely. ' : ''}${String((error as Error)?.message || error)}`
          }
          completed({ ...row }); progress(`${++finished} of ${total} file pairs processed.`)
          signal.throwIfAborted()
        }
      }
    }
    const results = await Promise.allSettled(Array.from({ length: Math.min(4, work.length) }, worker))
    const failure = results.find((result) => result.status === 'rejected')
    if (failure?.status === 'rejected') throw failure.reason
    return fresh.rows
  } finally { applying = false }
}

export function fileTranslationCsv(rows: FileTranslationRow[]): string {
  const fields: Array<keyof FileTranslationRow> = ['fileId', 'fileRecordId', 'destination', 'legacyId', 'targetId', 'targetRecordId', 'slot', 'state', 'message']
  const cell = (value: unknown) => { const raw = String(value ?? ''); return '"' + (/^\s*[=+@-]/.test(raw) ? "'" + raw : raw).replaceAll('"', '""') + '"' }
  return [fields.join(','), ...rows.map((row) => fields.map((field) => cell(row[field])).join(','))].join('\r\n')
}
