import { getClient } from '@microsoft/power-apps/data'
import { dataSourcesInfo } from '../../.power/schemas/appschemas/dataSourcesInfo'
import { ensureAuthToken, getAuthToken } from './auth'
import { ARCHIVED_NO_VALUE, excludeArchived } from './archive'

export const BEDS_TABLE_ALIAS = 'cmps_bedses'
export const BEDS_PRIMARY_ID_FIELD = 'cmps_bedid'
const BED_ENROLLMENTS_ENTITY_SET_NAME = 'cmps_bedenrollments'
const CLIENT_PROFILES_ENTITY_SET_NAME = 'cmps_clientprofiles'
const DEFAULT_DATAVERSE_ORG_URL = 'https://org1f466e4e.crm.dynamics.com'
const runtimeDataClient = getClient(dataSourcesInfo as any)
const FORMATTED_VALUES_PREFER = 'odata.include-annotations="OData.Community.Display.V1.FormattedValue"'
let resolvedAvailableStatus: number | undefined
let resolvedTakenStatus: number | undefined

export type AvailableBed = {
  id: string
  name: string
  unit: string
  unitType: string
  program: string
  status: string
  floor: string
}

export type BedManagementRecord = AvailableBed

export type BedImportSummary = {
  total: number
  imported: number
  failed: number
  errors: string[]
}

const BED_IMPORT_HEADERS = ['cmps_status', 'cmps_program', 'cmps_unit', 'cmps_unittype', 'cmps_bedname', 'cmps_floor'] as const
type BedImportHeader = (typeof BED_IMPORT_HEADERS)[number]

function orgUrl() { return String(import.meta.env.VITE_DATAVERSE_ORG_URL || DEFAULT_DATAVERSE_ORG_URL).trim().replace(/\/$/, '') }
function localHost() { return typeof window !== 'undefined' && ['localhost', '127.0.0.1'].includes(window.location.hostname) }
function rows(payload: any): Array<Record<string, any>> { return Array.isArray(payload) ? payload : Array.isArray(payload?.value) ? payload.value : [] }
function value(row: Record<string, any>, key: string) { return String(row?.[key] ?? '').trim() }
function formatted(row: Record<string, any>, key: string) { return value(row, `${key}@OData.Community.Display.V1.FormattedValue`) || value(row, key) }
function choice(row: Record<string, any>, key: string, options: string[]) {
  const display = formatted(row, key)
  if (display && !/^\d+$/.test(display)) return display
  const raw = Number(value(row, key))
  return Number.isInteger(raw) && raw >= 125570000 && raw < 125570000 + options.length ? options[raw - 125570000] : display
}
function cleanGuid(valueToClean: unknown) { return String(valueToClean || '').trim().replace(/[{}]/g, '').toLowerCase() }
function bedStatus(row: Record<string, any>): string {
  const display = formatted(row, 'cmps_status')
  if (display && !/^\d+$/.test(display)) return display
  const raw = Number(value(row, 'cmps_status'))
  if (raw === resolvedAvailableStatus) return 'Available'
  if (raw === resolvedTakenStatus) return 'Taken'
  return display
}

function observeStatusChoices(records: Array<Record<string, any>>): Array<Record<string, any>> {
  for (const row of records) {
    const label = value(row, 'cmps_status@OData.Community.Display.V1.FormattedValue').toLowerCase()
    const raw = Number(row.cmps_status)
    if (!Number.isInteger(raw)) continue
    if (label === 'available') resolvedAvailableStatus = raw
    if (label === 'taken') resolvedTakenStatus = raw
  }
  return records
}

async function listBeds(select = '', filter = ''): Promise<Array<Record<string, any>>> {
  const visibleFilter = excludeArchived(filter)
  let runtimeError = ''
  if (!localHost()) {
    const token = getAuthToken()
    try {
      const result = await runtimeDataClient.executeAsync<any, any>({
        connectorOperation: {
          tableName: 'commondataserviceforapps', operationName: 'ListRecordsWithOrganization',
          parameters: { organization: orgUrl(), entityName: BEDS_TABLE_ALIAS, prefer: FORMATTED_VALUES_PREFER, accept: 'application/json', ...(select ? { '$select': select } : {}), '$filter': visibleFilter, '$top': 5000, ...(token ? { token } : {}) },
        },
      } as any)
      if (result?.success) return observeStatusChoices(rows(result.data))
      runtimeError = parseConnectorError(result?.error || result)
    } catch (error) {
      runtimeError = parseConnectorError(error)
    }
  }

  const token = await ensureAuthToken().catch(() => '')
  if (!token || !orgUrl()) {
    throw new Error(runtimeError || 'Missing Dataverse connection information for the bed list.')
  }
  const headers = new Headers({ Accept: 'application/json', Prefer: FORMATTED_VALUES_PREFER, 'OData-Version': '4.0', 'OData-MaxVersion': '4.0', Authorization: `Bearer ${token}` })
  const query = `${select ? `$select=${encodeURIComponent(select)}&` : ''}$top=5000&$filter=${encodeURIComponent(visibleFilter)}`
  const response = await fetch(`${orgUrl()}/api/data/v9.2/${BEDS_TABLE_ALIAS}?${query}`, { credentials: 'include', headers })
  if (!response.ok) throw new Error(await response.text())
  return observeStatusChoices(rows(await response.json().catch(() => ({}))))
}

function bedRowId(row: Record<string, any>): string {
  const known = value(row, 'cmps_bedsid') || value(row, BEDS_PRIMARY_ID_FIELD) || value(row, 'id')
  if (known) return known
  const dynamicKey = Object.keys(row).find((key) => /^cmps_beds?id$/i.test(key))
  return dynamicKey ? value(row, dynamicKey) : ''
}

function mapBed(row: Record<string, any>): AvailableBed {
  return {
    id: bedRowId(row),
    name: value(row, 'cmps_bedname'),
    unit: value(row, 'cmps_unit'),
    unitType: choice(row, 'cmps_unittype', ['Individual', 'Family', 'Individual - Accessible', 'Family - Accessible']),
    program: choice(row, 'cmps_program', ['Autumn House', 'DV Outreach', 'CAAFA Shelter', 'DVSTOP', 'Faith House', 'REACH Center', 'SV Helpline']).replace(/^CAAFA Outreach$/i, 'DV Outreach'),
    status: bedStatus(row),
    floor: value(row, 'cmps_floor'),
  }
}

export async function listBedManagementRecords(): Promise<BedManagementRecord[]> {
  return (await listBeds())
    .map(mapBed)
    .sort((a, b) => `${a.floor} ${a.unit} ${a.name}`.localeCompare(`${b.floor} ${b.unit} ${b.name}`, undefined, { numeric: true }))
}

function parseCsv(text: string): string[][] {
  const rows: string[][] = []
  let row: string[] = []
  let field = ''
  let quoted = false

  for (let index = 0; index < text.length; index += 1) {
    const character = text[index]
    if (quoted) {
      if (character === '"' && text[index + 1] === '"') {
        field += '"'
        index += 1
      } else if (character === '"') {
        quoted = false
      } else {
        field += character
      }
      continue
    }

    if (character === '"') {
      quoted = true
    } else if (character === ',') {
      row.push(field.trim())
      field = ''
    } else if (character === '\n') {
      row.push(field.trim())
      rows.push(row)
      row = []
      field = ''
    } else if (character !== '\r') {
      field += character
    }
  }

  if (quoted) throw new Error('The CSV contains an unterminated quoted value.')
  if (field || row.length) {
    row.push(field.trim())
    rows.push(row)
  }
  return rows
}

function parseChoiceValue(valueToParse: string, fieldName: BedImportHeader, rowNumber: number): number {
  const parsed = Number(valueToParse)
  if (!Number.isInteger(parsed)) throw new Error(`Row ${rowNumber}: ${fieldName} must be a whole-number Dataverse choice value.`)
  return parsed
}

function parseConnectorError(error: unknown): string {
  if (typeof error === 'string') return error
  if (!error || typeof error !== 'object') return 'Dataverse rejected the bed record.'
  const candidate = error as any
  const message = candidate?.innerError?.message
    || candidate?.error?.innerError?.message
    || candidate?.error?.message
    || candidate?.message
  if (message) return String(message)
  try {
    return JSON.stringify(error)
  } catch {
    return 'Dataverse rejected the bed record.'
  }
}

async function createBedRecord(item: Record<string, unknown>): Promise<void> {
  const token = getAuthToken()
  if (!localHost()) {
    const createWithConnector = (payload: Record<string, unknown>) => runtimeDataClient.executeAsync<any, any>({
      connectorOperation: {
        tableName: 'commondataserviceforapps', operationName: 'CreateRecordWithOrganization',
        parameters: { prefer: 'return=representation', accept: 'application/json',  organization: orgUrl(), entityName: BEDS_TABLE_ALIAS, item: payload, ...(token ? { token } : {}) },
      },
    } as any)
    const result = await createWithConnector(item)
    if (result?.success) return

    const firstError = parseConnectorError(result?.error || result)
    const floorNumber = Number(item.cmps_floor)
    if (/cmps_floor|edm\.int|whole number/i.test(firstError) && Number.isFinite(floorNumber)) {
      const retry = await createWithConnector({ ...item, cmps_floor: floorNumber })
      if (retry?.success) return
      throw new Error(parseConnectorError(retry?.error || retry))
    }
    throw new Error(firstError)
  }

  const localToken = await ensureAuthToken()
  if (!localToken || !orgUrl()) throw new Error('Missing Dataverse connection information for bed import.')
  const headers = new Headers({ Accept: 'application/json', 'Content-Type': 'application/json', 'OData-Version': '4.0', 'OData-MaxVersion': '4.0', Authorization: `Bearer ${localToken}` })
  const response = await fetch(`${orgUrl()}/api/data/v9.2/${BEDS_TABLE_ALIAS}`, { method: 'POST', credentials: 'include', headers, body: JSON.stringify(item) })
  if (!response.ok) throw new Error(await response.text())
}

export async function importBedsCsv(file: File, savedBy = ''): Promise<BedImportSummary> {
  const parsedRows = parseCsv(await file.text())
  if (parsedRows.length < 2) throw new Error('The CSV must contain a header row and at least one bed row.')

  const headers = parsedRows[0].map((header, index) => (index === 0 ? header.replace(/^\uFEFF/, '') : header).trim().toLowerCase())
  const headerIndexes = new Map(headers.map((header, index) => [header, index]))
  const missingHeaders = BED_IMPORT_HEADERS.filter((header) => !headerIndexes.has(header))
  if (missingHeaders.length) throw new Error(`Missing required CSV column${missingHeaders.length === 1 ? '' : 's'}: ${missingHeaders.join(', ')}`)

  const payloadRows = parsedRows.slice(1)
    .map((cells, index) => ({ cells, rowNumber: index + 2 }))
    .filter(({ cells }) => cells.some((cell) => String(cell || '').trim()))
    .map(({ cells, rowNumber }) => {
      const cell = (header: BedImportHeader) => String(cells[headerIndexes.get(header)!] || '').trim()
      const status = cell('cmps_status')
      const program = cell('cmps_program')
      const unit = cell('cmps_unit')
      const unitType = cell('cmps_unittype')
      const bedName = cell('cmps_bedname')
      const floor = cell('cmps_floor')
      if (!status || !program || !unit || !unitType || !bedName || !floor) {
        throw new Error(`Row ${rowNumber}: all six bed import columns must contain a value.`)
      }
      return {
        rowNumber,
        item: {
          cmps_status: parseChoiceValue(status, 'cmps_status', rowNumber),
          cmps_program: parseChoiceValue(program, 'cmps_program', rowNumber),
          cmps_unit: unit,
          cmps_unittype: parseChoiceValue(unitType, 'cmps_unittype', rowNumber),
          cmps_bedname: bedName,
          // Text values match the existing bed form/connector payload convention and
          // preserve non-numeric floor labels if they are added later.
          cmps_floor: floor,
          cmps_isarchived: ARCHIVED_NO_VALUE,
          ...(savedBy ? { cmps_createdby: savedBy, cmps_modifiedby: savedBy } : {}),
        },
      }
    })

  if (!payloadRows.length) throw new Error('The CSV does not contain any bed rows to import.')

  const errors: string[] = []
  let imported = 0
  const [firstRow, ...remainingRows] = payloadRows
  try {
    await createBedRecord(firstRow.item)
    imported = 1
  } catch (error) {
    const message = String((error as Error)?.message || error || 'Import failed.')
    return {
      total: payloadRows.length,
      imported: 0,
      failed: payloadRows.length,
      errors: [`Row ${firstRow.rowNumber}: ${message}`, 'The remaining rows were not submitted because the first Dataverse create failed.'],
    }
  }

  const concurrency = 5
  for (let start = 0; start < remainingRows.length; start += concurrency) {
    const chunk = remainingRows.slice(start, start + concurrency)
    const outcomes = await Promise.allSettled(chunk.map(({ item }) => createBedRecord(item)))
    outcomes.forEach((outcome, index) => {
      if (outcome.status === 'fulfilled') {
        imported += 1
      } else {
        const rowNumber = chunk[index].rowNumber
        errors.push(`Row ${rowNumber}: ${String((outcome.reason as Error)?.message || outcome.reason || 'Import failed.')}`)
      }
    })
  }

  return { total: payloadRows.length, imported, failed: errors.length, errors }
}

export async function listAvailableBedsForProgram(program: string): Promise<AvailableBed[]> {
  const cleanProgram = String(program || '').trim()
  if (!cleanProgram) return []
  const rowsForProgram = await listBeds()
  return rowsForProgram
    .map(mapBed)
    .filter((bed) => bed.status.toLowerCase() === 'available' && bed.program.toLowerCase() === cleanProgram.toLowerCase())
    .sort((a, b) => `${a.unit} ${a.name}`.localeCompare(`${b.unit} ${b.name}`))
}

export async function listBedsAssignedToEnrollment(bedEnrollmentId: string): Promise<AvailableBed[]> {
  const enrollmentId = cleanGuid(bedEnrollmentId)
  if (!enrollmentId) return []
  return (await listBeds())
    .filter((row) => cleanGuid(row?._cmps_beid_value || row?.cmps_beid) === enrollmentId)
    .map(mapBed)
    .sort((a, b) => `${a.unit} ${a.name}`.localeCompare(`${b.unit} ${b.name}`))
}

export function isBedCheckoutDateValid(checkOutDate: string): boolean {
  const date = checkOutDate.trim()
  if (!/^\d{4}-\d{2}-\d{2}$/.test(date) || date === '0001-01-01') return false
  const parsed = new Date(date)
  return Number.isFinite(parsed.getTime()) && parsed.toISOString().slice(0, 10) === date
}

export function isBedSelectionRequired(program: string, beds: ReadonlyArray<Pick<AvailableBed, 'status'>>, checkOutDate = ''): boolean {
  return !isBedCheckoutDateValid(checkOutDate) && !!program.trim() && program.trim().toLowerCase() !== 'dvstop'
    && beds.some((bed) => bed.status.trim().toLowerCase() === 'available')
}

export async function listSelectableBedsForEnrollment(program: string, bedEnrollmentId = ''): Promise<{ beds: AvailableBed[]; assignedBedIds: string[] }> {
  const targetProgram = String(program || '').trim().toLowerCase()
  const targetEnrollment = cleanGuid(bedEnrollmentId)
  if (!targetProgram) return { beds: [], assignedBedIds: [] }
  const assignedBedIds: string[] = []
  const records = await listBeds()
  if (records.some((row) => !value(row, 'cmps_status@OData.Community.Display.V1.FormattedValue'))
    && resolvedAvailableStatus === undefined) {
    throw new Error('The bed status labels could not be loaded. Available beds cannot be identified until the Available choice value is confirmed.')
  }
  const selectable = records.filter((row) => {
    const bed = mapBed(row)
    if (!bed.id || bed.program.toLowerCase() !== targetProgram) return false
    const assignedEnrollment = cleanGuid(row._cmps_beid_value || row.cmps_beid)
    if (targetEnrollment && assignedEnrollment === targetEnrollment) {
      assignedBedIds.push(bed.id)
      return true
    }
    // Never offer a bed occupied by another enrollment, even if its status is stale.
    if (assignedEnrollment || cleanGuid(row._cmps_cpid_value || row.cmps_cpid)) return false
    return bed.status.toLowerCase() === 'available'
  }).map(mapBed)
  selectable.sort((a, b) => `${a.unit} ${a.name}`.localeCompare(`${b.unit} ${b.name}`, undefined, { numeric: true }))
  return { beds: selectable, assignedBedIds }
}

async function updateBed(rowId: string, item: Record<string, unknown>): Promise<void> {
  const token = getAuthToken()
  if (!localHost()) {
    const result = await runtimeDataClient.executeAsync<any, any>({
      connectorOperation: {
        tableName: 'commondataserviceforapps', operationName: 'UpdateRecordWithOrganization',
        parameters: { organization: orgUrl(), entityName: BEDS_TABLE_ALIAS, recordId: rowId, item, prefer: 'return=representation', accept: 'application/json', ...(token ? { token } : {}) },
      },
    } as any)
    if (!result?.success) throw new Error(parseConnectorError(result?.error || result))
    return
  }

  const localToken = await ensureAuthToken()
  const headers = new Headers({ Accept: 'application/json', 'Content-Type': 'application/json', 'OData-Version': '4.0', 'OData-MaxVersion': '4.0', Authorization: `Bearer ${localToken}` })
  const response = await fetch(`${orgUrl()}/api/data/v9.2/${BEDS_TABLE_ALIAS}(${rowId})`, { method: 'PATCH', credentials: 'include', headers, body: JSON.stringify(item) })
  if (!response.ok) throw new Error(await response.text())
}

export async function assignBedsToEnrollment(bedIds: string[], bedEnrollmentId: string, clientProfileId = '', savedBy = ''): Promise<void> {
  const cleanBedIds = Array.from(new Set(bedIds.map(cleanGuid).filter(Boolean)))
  const enrollmentId = cleanGuid(bedEnrollmentId)
  const clientId = cleanGuid(clientProfileId)
  if (!enrollmentId || cleanBedIds.length === 0) return
  // Read Dataverse's own labels to avoid assuming that the choice values are
  // sequential or that their order matches an array in the app.
  const records = await listBeds()
  if (resolvedTakenStatus === undefined) {
    throw new Error('The Taken bed status choice value could not be resolved from Dataverse. Confirm the cmps_status choice values before assigning beds.')
  }
  const takenStatus = resolvedTakenStatus
  for (const bedId of cleanBedIds) {
    const row = records.find((candidate) => cleanGuid(bedRowId(candidate)) === bedId)
    if (!row) throw new Error('A selected bed could not be found. Reload the bed list before saving.')
    const assignedEnrollment = cleanGuid(row._cmps_beid_value || row.cmps_beid)
    if (assignedEnrollment && assignedEnrollment !== enrollmentId) throw new Error('A selected bed is already assigned to another enrollment. Reload the bed list before saving.')
    if (!assignedEnrollment && (bedStatus(row).toLowerCase() !== 'available' || cleanGuid(row._cmps_cpid_value || row.cmps_cpid))) {
      throw new Error('A selected bed is no longer available. Reload the bed list before saving.')
    }
  }
  await Promise.all(cleanBedIds.map((bedId) => updateBed(bedId, {
    'cmps_beid@odata.bind': `/${BED_ENROLLMENTS_ENTITY_SET_NAME}(${enrollmentId})`,
    ...(clientId ? { 'cmps_cpid@odata.bind': `/${CLIENT_PROFILES_ENTITY_SET_NAME}(${clientId})` } : {}),
    cmps_status: takenStatus,
    ...(savedBy ? { cmps_modifiedby: savedBy } : {}),
  })))

  const refreshed = await listBeds()
  const failures = cleanBedIds.filter((bedId) => {
    const row = refreshed.find((candidate) => cleanGuid(bedRowId(candidate)) === bedId)
    if (!row) return true
    if (Number(value(row, 'cmps_status')) !== takenStatus) return true
    if (cleanGuid(row?._cmps_beid_value || row?.cmps_beid) !== enrollmentId) return true
    if (clientId && cleanGuid(row?._cmps_cpid_value || row?.cmps_cpid) !== clientId) return true
    return false
  })
  if (failures.length) throw new Error(`Dataverse did not retain the status or enrollment/client links for ${failures.length} selected bed(s).`)
}
