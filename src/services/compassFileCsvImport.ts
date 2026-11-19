import { getClient } from '@microsoft/power-apps/data'
import { dataSourcesInfo } from '../../.power/schemas/appschemas/dataSourcesInfo'
import { ensureAuthToken, getAuthToken } from './auth'
import { COMPASS_FILES_PRIMARY_ID_FIELD, COMPASS_FILES_TABLE_ALIAS } from './compassFiles'
import { FILE_TRANSLATION_TABLES } from './legacyFileTranslation'
import { createMigrationGateway, type MigrationGateway, type MigrationMetadata } from './legacyRecordMigration'
import { createRecordIdSequence } from './recordIdSequence'
import { DEFAULT_DIVISION_CODE } from './recordIds'

export const COMPASS_FILE_CSV_HEADERS = ['cmps_filename', 'cmps_destinationtablename', 'cmps_migrationbatch', 'cmps_filesize', 'cmps_relatedrecordidlegacy'] as const
type Column = typeof COMPASS_FILE_CSV_HEADERS[number]
type Values = Record<Column, string | number>
export type FileCsvRow = { line: number; values: Values; id: string; recordId: string; state: 'ready' | 'existing' | 'issue' | 'imported' | 'unconfirmed'; message: string }
export type FileCsvPlan = { metadata: MigrationMetadata; rows: FileCsvRow[]; signature: string }
export type FileCsvGateway = Pick<MigrationGateway, 'metadata' | 'page'> & {
  create(metadata: MigrationMetadata, payload: Record<string, unknown>, signal: AbortSignal): Promise<void>
  find(metadata: MigrationMetadata, id: string, select: string[], signal: AbortSignal): Promise<Record<string, unknown> | null>
}
const definition = { key: 'compass-file', label: 'Compass Files', tableAlias: COMPASS_FILES_TABLE_ALIAS, primaryIdField: COMPASS_FILES_PRIMARY_ID_FIELD, legacyIdField: 'cmps_relatedrecordidlegacy', recordIdPrefix: 'FILE' }
const columns = [COMPASS_FILES_PRIMARY_ID_FIELD, 'cmps_recordid', ...COMPASS_FILE_CSV_HEADERS]
const text = (value: unknown) => String(value ?? '').trim()
const nullable = (value: unknown) => /^null$/i.test(text(value)) ? '' : text(value)
const guid = (value: unknown) => text(value).replace(/[{}]/g, '').toLowerCase()
const GUID = /^[a-f\d]{8}-[a-f\d]{4}-[a-f\d]{4}-[a-f\d]{4}-[a-f\d]{12}$/i
const aliases = new Map(FILE_TRANSLATION_TABLES.map(({ definition: table }) => [table.tableAlias.toLowerCase(), table.tableAlias]))
let running = false

// Strict RFC-style CSV parsing, without spreadsheet type inference (legacy leading zeros matter).
export function parseCompassFileCsv(csv: string): FileCsvRow[] {
  const records: Array<{ cells: string[]; line: number }> = []
  let cells: string[] = [], cell = '', quoted = false, closed = false, line = 1, start = 1
  const input = csv.replace(/^\uFEFF/, '')
  function endCell() { cells.push(cell); cell = ''; closed = false }
  function endRow() { endCell(); if (cells.some((value) => text(value))) records.push({ cells, line: start }); cells = [] }
  for (let i = 0; i < input.length; i++) {
    const char = input[i]
    if (quoted) {
      if (char === '"') { if (input[i + 1] === '"') { cell += '"'; i++ } else { quoted = false; closed = true } }
      else { cell += char; if (char === '\n') line++ }
    } else if (char === ',') endCell()
    else if (char === '\r' || char === '\n') { endRow(); if (char === '\r' && input[i + 1] === '\n') i++; line++; start = line }
    else if (char === '"') {
      if (cell || closed) throw new Error(`Unexpected quote on CSV line ${line}.`)
      quoted = true
    } else {
      if (closed && !/[ \t]/.test(char)) throw new Error(`Unexpected text after a quoted field on CSV line ${line}.`)
      if (!closed) cell += char
    }
  }
  if (quoted) throw new Error('The CSV contains an unterminated quoted field.')
  if (cell || cells.length || closed) endRow()
  const header = records.shift()?.cells.map((value) => text(value).toLowerCase()) || []
  if (header.length !== COMPASS_FILE_CSV_HEADERS.length || new Set(header).size !== header.length || COMPASS_FILE_CSV_HEADERS.some((col) => !header.includes(col))) throw new Error(`CSV headers must be exactly: ${COMPASS_FILE_CSV_HEADERS.join(', ')}`)
  if (!records.length) throw new Error('The CSV has no data rows.')
  const rows: FileCsvRow[] = records.map((record) => {
    const values = Object.fromEntries(COMPASS_FILE_CSV_HEADERS.map((col) => [col, nullable(record.cells[header.indexOf(col)])])) as Values
    const row: FileCsvRow = { line: record.line, values, id: '', recordId: '', state: 'ready', message: '' }
    const errors: string[] = []
    if (record.cells.length !== header.length) errors.push('Wrong number of columns')
    if (!values.cmps_filename) errors.push('Filename is required')
    if (!values.cmps_migrationbatch) errors.push('Migration batch is required')
    const size = String(values.cmps_filesize)
    if (!/^\d+$/.test(size) || !Number.isSafeInteger(Number(size))) errors.push('File size must be a nonnegative whole number of bytes')
    else values.cmps_filesize = Number(size)
    const destination = String(values.cmps_destinationtablename)
    if (destination) {
      const alias = aliases.get(destination.toLowerCase())
      if (!alias) errors.push('Destination must be a supported upload table alias, blank, or NULL')
      else values.cmps_destinationtablename = alias
    }
    if (errors.length) { row.state = 'issue'; row.message = errors.join('; ') }
    else if (!values.cmps_destinationtablename || !values.cmps_relatedrecordidlegacy) row.message = 'Metadata only; destination or legacy ID is blank. Complete it before translating links.'
    return row
  })
  const seen = new Map<string, FileCsvRow[]>()
  for (const row of rows) { const key = text(row.values.cmps_filename).toLowerCase(); const group = seen.get(key) || []; group.push(row); seen.set(key, group) }
  for (const duplicates of seen.values()) if (duplicates.length > 1) for (const row of duplicates) { row.state = 'issue'; row.message = 'Duplicate filename in this CSV; no record will be chosen or overwritten.' }
  return rows
}

// Stable row GUID makes a retry of the same batch/filename create-only, even if a response was lost.
async function importGuid(values: Values): Promise<string> {
  const key = JSON.stringify(['COMPASS-FILE-CSV-v1', text(values.cmps_migrationbatch).toLowerCase(), text(values.cmps_filename).toLowerCase()])
  const bytes = new Uint8Array(await crypto.subtle.digest('SHA-256', new TextEncoder().encode(key))).slice(0, 16)
  bytes[6] = (bytes[6] & 15) | 0x80; bytes[8] = (bytes[8] & 63) | 0x80
  const hex = Array.from(bytes, (byte) => byte.toString(16).padStart(2, '0')).join('')
  return `${hex.slice(0, 8)}-${hex.slice(8, 12)}-${hex.slice(12, 16)}-${hex.slice(16, 20)}-${hex.slice(20)}`
}
function sameValues(existing: Record<string, unknown>, values: Values) {
  return COMPASS_FILE_CSV_HEADERS.every((col) => col === 'cmps_filesize'
    ? existing[col] !== null && existing[col] !== undefined && text(existing[col]) !== '' && Number(existing[col]) === values[col]
    : col === 'cmps_destinationtablename' ? text(existing[col]).toLowerCase() === text(values[col]).toLowerCase() : text(existing[col]) === values[col])
}
function checkMetadata(metadata: MigrationMetadata) {
  if (metadata.EntitySetName !== COMPASS_FILES_TABLE_ALIAS || metadata.PrimaryIdAttribute !== COMPASS_FILES_PRIMARY_ID_FIELD) throw new Error('Compass Files metadata does not match the configured table alias. Nothing imported.')
  for (const col of ['cmps_recordid', ...COMPASS_FILE_CSV_HEADERS]) {
    const attribute = metadata.Attributes.find((entry) => entry.LogicalName === col)
    const types = col === 'cmps_filesize' ? ['Integer', 'BigInt', 'Decimal', 'Double'] : ['String', 'Memo']
    if (!attribute || !types.includes(attribute.AttributeType) || attribute.IsValidForCreate !== true) throw new Error(`${col} is missing, has an unexpected type, or is not valid for creation. Nothing imported.`)
  }
}

export async function previewCompassFileCsv(csv: string, gateway: FileCsvGateway, signal: AbortSignal, progress: (message: string) => void = () => {}): Promise<FileCsvPlan> {
  const rows = parseCompassFileCsv(csv), metadata = await gateway.metadata(definition, signal)
  checkMetadata(metadata)
  const existing = new Map<string, Array<Record<string, unknown>>>(), ids = new Set<string>(), cursors = new Set<string>()
  const sequence = createRecordIdSequence('FILE', DEFAULT_DIVISION_CODE)
  let cursor = '', scanned = 0
  do {
    signal.throwIfAborted()
    const page = await gateway.page(metadata, columns, cursor, signal)
    for (const record of page.rows) {
      const id = guid(record[metadata.PrimaryIdAttribute])
      if (!GUID.test(id) || ids.has(id)) throw new Error('Compass Files returned an invalid/repeated record page. Nothing imported.')
      ids.add(id); sequence.observe(record.cmps_recordid)
      const key = text(record.cmps_filename).toLowerCase(), group = existing.get(key) || []; group.push(record); existing.set(key, group)
    }
    scanned += page.rows.length; progress(`${scanned.toLocaleString()} existing Compass Files records checked.`)
    cursor = page.nextLink
    if (cursor && cursors.has(cursor)) throw new Error('Compass Files returned a repeated continuation. Nothing imported.')
    cursors.add(cursor)
  } while (cursor)
  const sizeType = metadata.Attributes.find((col) => col.LogicalName === 'cmps_filesize')!.AttributeType
  for (const row of rows) {
    signal.throwIfAborted()
    if (row.state !== 'ready') continue
    if (sizeType === 'Integer' && Number(row.values.cmps_filesize) > 2147483647) { row.state = 'issue'; row.message = 'File size exceeds the Dataverse Integer column range.'; continue }
    const candidates = existing.get(text(row.values.cmps_filename).toLowerCase()) || []
    if (candidates.length) {
      if (candidates.length === 1 && sameValues(candidates[0], row.values)) {
        row.state = 'existing'; row.id = guid(candidates[0][metadata.PrimaryIdAttribute]); row.recordId = text(candidates[0].cmps_recordid); row.message = 'Matching metadata already exists; skipped without changes.'
      } else { row.state = 'issue'; row.message = 'Filename already exists with different metadata or is ambiguous; existing rows are preserved.' }
      continue
    }
    row.id = await importGuid(row.values)
    if (ids.has(row.id)) { row.state = 'issue'; row.message = 'Stable import GUID already exists with different metadata; preserved.'; continue }
    row.recordId = sequence.allocate()
    if (!row.message) row.message = 'Create metadata row only; upload the actual file separately.'
  }
  const signature = JSON.stringify([metadata.EntitySetName, metadata.Attributes.filter((col) => columns.includes(col.LogicalName)).map((col) => [col.LogicalName, col.AttributeType, col.IsValidForCreate]), rows.map((row) => [row.line, row.values, row.id, row.recordId, row.state])])
  return { metadata, rows, signature }
}

export async function importCompassFileCsv(csv: string, reviewed: FileCsvPlan, gateway: FileCsvGateway, signal: AbortSignal, savedBy: string,
  authorize: () => boolean, progress: (message: string) => void = () => {}, completed: (row: FileCsvRow) => void = () => {}): Promise<FileCsvRow[]> {
  if (running) throw new Error('A Compass Files CSV import is already running or stopping.')
  if (!authorize() || !text(savedBy)) throw new Error('IT Admin access and a signed-in identity are required.')
  running = true
  try {
    const fresh = await previewCompassFileCsv(csv, gateway, signal, progress)
    if (fresh.signature !== reviewed.signature) throw new Error('CSV, metadata, or existing records changed. Preview again; nothing imported.')
    const ready = fresh.rows.filter((row) => row.state === 'ready')
    let processed = 0, next = 0, stop: unknown
    const processRow = async (row: FileCsvRow) => {
      signal.throwIfAborted(); if (!authorize()) throw new Error('IT Admin access changed; import stopped.')
      const previous = await gateway.find(fresh.metadata, row.id, columns, signal)
      if (previous) throw new Error('A planned row now exists. Preview again; existing rows were not changed.')
      const payload: Record<string, unknown> = { ...row.values, [fresh.metadata.PrimaryIdAttribute]: row.id, cmps_recordid: row.recordId }
      // Blank optional text becomes a genuine Dataverse null, never the literal string NULL.
      for (const col of ['cmps_destinationtablename', 'cmps_relatedrecordidlegacy']) if (payload[col] === '') payload[col] = null
      for (const field of ['cmps_createdby', 'cmps_modifiedby']) if (fresh.metadata.Attributes.some((col) => col.LogicalName === field && col.AttributeType === 'String' && col.IsValidForCreate === true)) payload[field] = text(savedBy)
      let failure = ''
      try {
        signal.throwIfAborted(); if (!authorize()) throw new Error('IT Admin access changed; import stopped.')
        await gateway.create(fresh.metadata, payload, signal)
      } catch (error) { failure = String((error as Error)?.message || error) }
      try {
        signal.throwIfAborted()
        const confirmed = await gateway.find(fresh.metadata, row.id, columns, signal)
        if (!confirmed || !sameValues(confirmed, row.values) || text(confirmed.cmps_recordid) !== row.recordId) throw new Error(failure || 'Created metadata could not be confirmed.')
        row.state = 'imported'; row.message = 'Metadata created and confirmed. File content not uploaded.'
      } catch (error) {
        row.state = 'unconfirmed'; row.message = `${failure || String((error as Error)?.message || error)} Import stopped. The row may exist; preview again before retrying. Existing records were not overwritten.`
        completed({ ...row }); throw new Error(row.message)
      }
      completed({ ...row }); progress(`${++processed} of ${ready.length} metadata rows imported.`)
    }
    // Bound requests for large imports. On any uncertain outcome, start no more rows
    // and wait for every in-flight create/confirmation before releasing the run lock.
    const worker = async () => {
      try { while (!stop && next < ready.length) await processRow(ready[next++]) }
      catch (error) { stop ||= error; throw error }
    }
    await Promise.allSettled(Array.from({ length: Math.min(4, ready.length) }, worker))
    if (stop) throw stop
    return fresh.rows
  } finally { running = false }
}

export function createCompassFileCsvGateway(): FileCsvGateway {
  const reads = createMigrationGateway(), client = getClient(dataSourcesInfo as any)
  const local = typeof window !== 'undefined' && ['localhost', '127.0.0.1'].includes(window.location.hostname)
  const organization = String(import.meta.env.VITE_DATAVERSE_ORG_URL || 'https://org1f466e4e.crm.dynamics.com').trim().replace(/\/$/, '')
  return { metadata: reads.metadata, page: reads.page,
    async find(metadata, id, select, signal) {
      // Reuse narrow, authenticated reads; an empty row is distinguished from all network/permission failures.
      if (!GUID.test(id)) throw new Error('Invalid import row GUID.')
      if (local) {
        const token = await ensureAuthToken(); signal.throwIfAborted()
        if (!token) throw new Error('Dataverse authentication is required.')
        const query = new URLSearchParams({ '$select': select.join(','), '$filter': `${metadata.PrimaryIdAttribute} eq ${id}`, '$top': '2' })
        const response = await fetch(`${organization}/api/data/v9.2/${metadata.EntitySetName}?${query}`, { signal, credentials: 'include', headers: { Accept: 'application/json', Authorization: `Bearer ${token}` } })
        if (!response.ok) throw new Error(await response.text())
        return single((await response.json())?.value, id, metadata)
      }
      const token = getAuthToken()
      const result = await client.executeAsync<any, any>({ connectorOperation: { tableName: 'commondataserviceforapps', operationName: 'ListRecordsWithOrganization', parameters: { organization, entityName: metadata.EntitySetName, '$select': select.join(','), '$filter': `${metadata.PrimaryIdAttribute} eq ${id}`, '$top': 2, ...(token ? { token } : {}) } } } as any)
      signal.throwIfAborted()
      if (!result?.success) throw new Error(String(result?.error?.message || result?.error || 'Could not confirm imported metadata.'))
      return single(Array.isArray(result.data) ? result.data : result.data?.value, id, metadata)
    },
    async create(metadata, payload, signal) {
      signal.throwIfAborted()
      if (local) {
        const token = await ensureAuthToken(); signal.throwIfAborted()
        if (!token) throw new Error('Dataverse authentication is required.')
        const response = await fetch(`${organization}/api/data/v9.2/${metadata.EntitySetName}`, { method: 'POST', signal, credentials: 'include', headers: { Accept: 'application/json', 'Content-Type': 'application/json', Authorization: `Bearer ${token}`, Prefer: 'return=minimal' }, body: JSON.stringify(payload) })
        if (!response.ok) throw new Error(await response.text())
      } else {
        const token = getAuthToken()
        const result = await client.executeAsync<any, any>({ connectorOperation: { tableName: 'commondataserviceforapps', operationName: 'CreateRecordWithOrganization', parameters: { organization, entityName: metadata.EntitySetName, item: payload, prefer: 'return=minimal', accept: 'application/json', ...(token ? { token } : {}) } } } as any)
        if (!result?.success) throw new Error(String(result?.error?.message || result?.error || 'Metadata creation was not confirmed.'))
      }
      // Never automatically retry a create. Confirmation uses the same stable GUID.
      signal.throwIfAborted()
    },
  }
}
function single(rows: unknown, id: string, metadata: MigrationMetadata): Record<string, unknown> | null {
  if (!Array.isArray(rows) || rows.length > 1 || rows.length === 1 && guid(rows[0]?.[metadata.PrimaryIdAttribute]) !== id) throw new Error('Dataverse did not return a unique import confirmation.')
  return rows[0] || null
}

export function compassFileCsvResults(rows: FileCsvRow[]): string {
  const cell = (value: unknown) => { const raw = String(value ?? ''); return '"' + (/^\s*[=+@-]/.test(raw) ? "'" + raw : raw).replaceAll('"', '""') + '"' }
  return [['CSV line', ...COMPASS_FILE_CSV_HEADERS, 'Dataverse Row ID', 'App Record ID', 'Result', 'Details'], ...rows.map((row) => [row.line, ...COMPASS_FILE_CSV_HEADERS.map((col) => row.values[col]), row.id, row.recordId, row.state, row.message])].map((row) => row.map(cell).join(',')).join('\r\n')
}
