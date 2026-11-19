import { ARCHIVE_TABLES } from './archive'
import { continuationPageKey } from './dataverseContinuation'
import { createMigrationGateway, LEGACY_MIGRATION_TABLES, type MigrationGateway, type MigrationMetadata, type LegacyMigrationDefinition } from './legacyRecordMigration'
import { createProgramSearchGateway } from './programTableSearch'

// Extend this catalog only after verifying each table's choice and lookup columns.
export const FUNDER_TRANSLATION_TABLES = [
  { key: 'program-enrollment', label: 'Program Enrollment', choiceField: 'cmps_funder', lookupField: 'cmps_funder1' },
]
export type FunderTranslationChange = { id: string; recordId: string; choiceValue: number; choiceLabel: string; funderId: string; funderName: string; etag: string }
export type FunderTranslationIssue = { id: string; recordId: string; choice: string; message: string }
export type FunderTranslationProgress = { phase: 'funders' | 'records' | 'ready' | 'updating' | 'complete'; funders: number; read: number; pages: number; eligible: number; unchanged: number; empty: number; issues: number; updated: number; failed: number }
export type FunderTranslationTarget = { id: string; name: string; archived: boolean }
export type FunderTranslationPlan = { key: string; metadata: MigrationMetadata; navigation: string; funderEntitySet: string; changes: FunderTranslationChange[]; issues: FunderTranslationIssue[]; progress: FunderTranslationProgress; options: Array<{ value: number; label: string }>; funders: FunderTranslationTarget[]; overrides: Record<string, string> }
export interface FunderTranslationGateway {
  reader: MigrationGateway
  choices(metadata: MigrationMetadata, field: string, signal: AbortSignal): Promise<Array<{ value: number; label: string }>>
}
const text = (value: unknown) => String(value ?? '').trim()
const guid = (value: unknown) => text(value).replace(/[{}]/g, '').toLowerCase()
const GUID = /^[a-f\d]{8}(?:-[a-f\d]{4}){3}-[a-f\d]{12}$/i
const NAME = /^[a-z][a-z\d_]*$/i
const normalized = (value: unknown) => text(value).replace(/\s+/g, ' ').toLowerCase()
let running = false

export function createFunderTranslationGateway(): FunderTranslationGateway {
  const choices = createProgramSearchGateway()
  return { reader: createMigrationGateway(), choices: (metadata, field, signal) => choices.choices(metadata, field, signal) }
}

function requireColumn(metadata: MigrationMetadata, field: string, types: string[], writable = false) {
  const attribute = metadata.Attributes?.find((entry) => entry.LogicalName === field)
  if (!attribute || !types.includes(attribute.AttributeType) || writable && attribute.IsValidForUpdate !== true) {
    throw new Error(`Cannot verify ${metadata.LogicalName}.${field} as ${writable ? 'a writable ' : 'a '}${types.join('/')} column. No records changed.`)
  }
}
function verifyTable(metadata: MigrationMetadata, definition: LegacyMigrationDefinition) {
  if (metadata.EntitySetName !== definition.tableAlias || metadata.PrimaryIdAttribute !== definition.primaryIdField
    || ![metadata.LogicalName, metadata.EntitySetName, metadata.PrimaryIdAttribute].every((value) => NAME.test(value))) {
    throw new Error(`Cannot verify ${definition.label} table metadata. No records changed.`)
  }
}
async function scan(gateway: FunderTranslationGateway, metadata: MigrationMetadata, select: string[], signal: AbortSignal,
  row: (value: Record<string, unknown>) => void, page: () => void) {
  const cursors = new Set<string>(), ids = new Set<string>()
  let next = ''
  do {
    signal.throwIfAborted()
    if (next) {
      const key = continuationPageKey(next)
      if (cursors.has(key)) throw new Error(`Repeated continuation for ${metadata.EntitySetName}. No records changed during preflight.`)
      cursors.add(key)
    }
    const result = await gateway.reader.page(metadata, select, next, signal)
    signal.throwIfAborted()
    for (const value of result.rows) {
      const id = guid(value[metadata.PrimaryIdAttribute])
      if (!GUID.test(id) || ids.has(id)) throw new Error(`Invalid or repeated record page for ${metadata.EntitySetName}. No records changed during preflight.`)
      ids.add(id); row(value)
    }
    page(); next = result.nextLink
    if (next && result.rows.length === 0) throw new Error('Empty page with continuation. No records changed during preflight.')
  } while (next)
}

export async function previewFunderTranslation(key: string, gateway: FunderTranslationGateway, signal: AbortSignal,
  onProgress?: (progress: FunderTranslationProgress) => void, overrides: Record<string, string> = {}): Promise<FunderTranslationPlan> {
  const mapping = FUNDER_TRANSLATION_TABLES.find((entry) => entry.key === key)
  const definition = LEGACY_MIGRATION_TABLES.find((entry) => entry.key === key)
  if (!mapping || !definition) throw new Error('Choose a supported funder translation table.')
  const funder = ARCHIVE_TABLES.find((entry) => entry.key === 'funder')!
  const funderDefinition: LegacyMigrationDefinition = { ...funder, recordIdPrefix: '', legacyIdField: '' }
  const metadata = await gateway.reader.metadata(definition, signal)
  const funderMetadata = await gateway.reader.metadata(funderDefinition, signal)
  verifyTable(metadata, definition); verifyTable(funderMetadata, funderDefinition)
  requireColumn(metadata, mapping.choiceField, ['Picklist'])
  requireColumn(metadata, mapping.lookupField, ['Lookup'], true)
  requireColumn(metadata, 'cmps_recordid', ['String'])
  requireColumn(metadata, 'cmps_modifiedby', ['String', 'Memo'], true)
  requireColumn(funderMetadata, 'cmps_name', ['String'])
  requireColumn(funderMetadata, 'cmps_isarchived', ['Picklist', 'Boolean'])
  const relationships = metadata.ManyToOneRelationships.filter((entry) => entry.ReferencingAttribute === mapping.lookupField
    && entry.ReferencedEntity === funderMetadata.LogicalName && NAME.test(entry.ReferencingEntityNavigationPropertyName))
  if (relationships.length !== 1) throw new Error('Cannot uniquely verify the Funder lookup relationship. No records changed.')
  const options = await gateway.choices(metadata, mapping.choiceField, signal)
  const labels = new Map<number, string>()
  for (const option of options) {
    if (!Number.isInteger(option.value) || !text(option.label) || labels.has(option.value)) throw new Error('Invalid or duplicate Funder choice metadata. No records changed.')
    labels.set(option.value, text(option.label))
  }
  if (!labels.size) throw new Error('No Funder choice mappings returned. No records changed.')
  const state: FunderTranslationProgress = { phase: 'funders', funders: 0, read: 0, pages: 0, eligible: 0, unchanged: 0, empty: 0, issues: 0, updated: 0, failed: 0 }
  const emit = () => onProgress?.({ ...state })
  const funders = new Map<string, FunderTranslationTarget[]>(), targets = new Map<string, FunderTranslationTarget>()
  await scan(gateway, funderMetadata, [funderMetadata.PrimaryIdAttribute, 'cmps_name', 'cmps_isarchived'], signal, (row) => {
    const name = text(row.cmps_name), key = normalized(name)
    const target = { id: guid(row[funderMetadata.PrimaryIdAttribute]), name,
      archived: Number(row.cmps_isarchived) === 125570000 || row.cmps_isarchived === true }
    funders.set(key, [...(funders.get(key) || []), target]); targets.set(target.id, target)
    state.funders++
  }, emit)
  for (const [value, selected] of Object.entries(overrides)) {
    if (!labels.has(Number(value)) || !GUID.test(selected) || !targets.has(selected) || targets.get(selected)!.archived) {
      throw new Error('Explicit Funder mapping is invalid or references an archived/missing funder. No records changed.')
    }
  }
  state.phase = 'records'; emit()
  const changes: FunderTranslationChange[] = [], issues: FunderTranslationIssue[] = []
  const lookupValue = `_${mapping.lookupField}_value`
  await scan(gateway, metadata, [metadata.PrimaryIdAttribute, 'cmps_recordid', mapping.choiceField, lookupValue], signal, (row) => {
    state.read++
    const id = guid(row[metadata.PrimaryIdAttribute]), recordId = text(row.cmps_recordid), raw = row[mapping.choiceField]
    const issue = (message: string) => { issues.push({ id, recordId, choice: text(raw), message }); state.issues++ }
    // Never replace an existing link, including one that disagrees with a legacy choice.
    const existing = guid(row[lookupValue])
    if (raw === null || raw === undefined || raw === '') {
      if (existing) state.unchanged++
      else state.empty++
      return
    }
    const value = Number(raw), label = labels.get(value)
    if (!label) { issue('Legacy choice has no verified option label. Existing lookup preserved.'); return }
    const selected = overrides[String(value)]
    const matches = selected ? [targets.get(selected)!] : funders.get(normalized(label)) || []
    if (matches.length !== 1) { issue(matches.length ? `Multiple Funder records match "${label}". Existing lookup preserved.` : `No Funder record matches "${label}". Existing lookup preserved.`); return }
    const match = matches[0]
    if (existing) {
      if (existing === match.id) state.unchanged++
      else issue('Existing Funder lookup differs from the legacy choice. Not overwritten.')
      return
    }
    if (match.archived) { issue(`Matching Funder "${label}" is archived. No link created.`); return }
    const etag = text(row['@odata.etag'])
    if (!/^W\/"[^"]+"$/.test(etag)) { issue('Record version (ETag) unavailable; cannot safely update this record.'); return }
    changes.push({ id, recordId, choiceValue: value, choiceLabel: label, funderId: match.id, funderName: match.name, etag })
    state.eligible++
  }, () => { state.pages++; emit() })
  state.phase = 'ready'; emit()
  return { key, metadata, navigation: relationships[0].ReferencingEntityNavigationPropertyName, funderEntitySet: funderMetadata.EntitySetName, changes, issues, progress: { ...state }, options, funders: [...targets.values()], overrides: { ...overrides } }
}

const signature = (plan: FunderTranslationPlan) => JSON.stringify([plan.metadata.EntitySetName, plan.navigation, plan.funderEntitySet,
  plan.progress.read, plan.issues,
  plan.changes.map((entry) => [entry.id, entry.choiceValue, entry.choiceLabel, entry.funderId, entry.funderName, entry.etag])])

export async function translateFunders(reviewed: FunderTranslationPlan, gateway: FunderTranslationGateway, savedBy: string, signal: AbortSignal,
  onProgress?: (progress: FunderTranslationProgress) => void, onIssue?: (issue: FunderTranslationIssue) => void,
  onUpdated?: (change: FunderTranslationChange) => void): Promise<FunderTranslationProgress> {
  if (running) throw new Error('A funder translation is already running.')
  if (!text(savedBy)) throw new Error('Your signed-in user identity is required.')
  running = true
  try {
    // Complete a fresh full scan before writes, and require the reviewed plan to remain unchanged.
    const fresh = await previewFunderTranslation(reviewed.key, gateway, signal, onProgress, reviewed.overrides)
    if (signature(fresh) !== signature(reviewed)) throw new Error('Records or Funder mappings changed since preview. Run Preview again. No records changed.')
    const state = { ...fresh.progress, phase: 'updating' as FunderTranslationProgress['phase'] }
    onProgress?.({ ...state })
    let cursor = 0
    await Promise.all(Array.from({ length: Math.min(4, fresh.changes.length) }, async () => {
      while (!signal.aborted && cursor < fresh.changes.length) {
        const change = fresh.changes[cursor++]
        try {
          await gateway.reader.update(fresh.metadata, change.id, {
            [`${fresh.navigation}@odata.bind`]: `/${fresh.funderEntitySet}(${change.funderId})`,
            cmps_modifiedby: text(savedBy),
          }, change.etag, signal)
          state.updated++; onUpdated?.(change)
        } catch (error) {
          state.failed++; state.issues++
          onIssue?.({ id: change.id, recordId: change.recordId, choice: String(change.choiceValue),
            message: `Update not confirmed; re-preview before retrying. ${text((error as Error)?.message || error)}` })
        }
        onProgress?.({ ...state })
      }
    }))
    signal.throwIfAborted()
    state.phase = 'complete'; onProgress?.({ ...state })
    return state
  } finally { running = false }
}

