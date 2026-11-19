import { getClient } from '@microsoft/power-apps/data'
import { dataSourcesInfo } from '../../.power/schemas/appschemas/dataSourcesInfo'
import { ensureAuthToken, getAuthToken } from './auth'
import { ARCHIVE_TABLES, excludeArchived, setRecordArchived, type ArchiveTableDefinition } from './archive'
import { loadClientProfileDetailRecord } from './clientProfile'
import { readDataverseRecordPages } from './dataverseRecordPages'
import { listProgramEnrollmentsForClientRecord } from './programEnrollment'

const DEFAULT_DATAVERSE_ORG_URL = 'https://org1f466e4e.crm.dynamics.com'
const CLIENT_TABLE = 'cmps_clientprofiles'
const ENROLLMENT_TABLE = 'cmps_programenrollment1s'
const GUID = /^[a-f\d]{8}(?:-[a-f\d]{4}){3}-[a-f\d]{12}$/i
const runtimeDataClient = getClient(dataSourcesInfo as any)

const cleanGuid = (value: unknown) => String(value || '').trim().replace(/[{}]/g, '').toLowerCase()
const orgUrl = () => String(import.meta.env.VITE_DATAVERSE_ORG_URL || DEFAULT_DATAVERSE_ORG_URL).trim().replace(/\/$/, '')
const lookupAttribute = (wireField: string) => String(wireField || '').replace(/^_/, '').replace(/_value$/, '')

export type ClientMergeProfile = { id: string; recordId: string; name: string; hmisId: string; dateOfBirth: string }
export type ClientMergeEnrollment = {
  id: string; recordId: string; program: string; funder: string; startDate: string; endDate: string
}
export type ClientMergeRecord = {
  id: string
  recordId: string
  tableKey: string
  tableLabel: string
  tableAlias: string
  primaryIdField: string
  summary: string
  createdOn: string
  modifiedOn: string
  clientLookupField: string
  enrollmentLookupField: string
  linkedClientId: string
  parentEnrollmentId: string
}
export type ClientMergeInventory = {
  profile: ClientMergeProfile
  enrollments: ClientMergeEnrollment[]
  records: ClientMergeRecord[]
}
export type ClientMergeAction = 'exclude' | 'move' | 'merge'
export type ClientMergeEnrollmentDecision = { sourceId: string; action: ClientMergeAction; targetId?: string }
export type ClientMergeRecordDecision = { sourceId: string; tableAlias: string; action: ClientMergeAction; targetId?: string }
export type ClientMergePlan = {
  primaryClientId: string
  secondaryClientId: string
  enrollmentDecisions: ClientMergeEnrollmentDecision[]
  recordDecisions: ClientMergeRecordDecision[]
}
export type ClientMergeOperation = {
  kind: 'relink' | 'archive'
  tableAlias: string
  rowId: string
  label: string
  lookupField?: string
  targetEntitySet?: string
  targetId?: string
  cascade?: boolean
}
export type ClientMergeResult = { completed: number; total: number; operations: ClientMergeOperation[] }

async function mapLimit<T, R>(items: T[], limit: number, read: (item: T) => Promise<R>): Promise<R[]> {
  const result = new Array<R>(items.length)
  let next = 0
  await Promise.all(Array.from({ length: Math.min(limit, items.length) }, async () => {
    while (next < items.length) { const index = next++; result[index] = await read(items[index]) }
  }))
  return result
}

async function queryRecords(definition: ArchiveTableDefinition, filter: string): Promise<Array<Record<string, any>>> {
  const select = [...new Set([
    definition.primaryIdField, definition.recordIdField, definition.clientLookupField, definition.enrollmentLookupField,
    ...(definition.displayFields || []), 'createdon', 'modifiedon', 'cmps_isarchived',
  ].filter(Boolean))].join(',')
  const organization = orgUrl()
  const query = { '$select': select, '$filter': excludeArchived(filter), '$orderby': `${definition.primaryIdField} asc` }
  const local = typeof window !== 'undefined' && ['localhost', '127.0.0.1'].includes(window.location.hostname)
  const token = local ? await ensureAuthToken() : getAuthToken()
  if (local && !token) throw new Error('Dataverse authentication is required to load merge records.')
  return readDataverseRecordPages(organization, definition.tableAlias, query, !local, async (parameters, nextUrl) => {
    if (local) {
      const url = new URL(nextUrl || `${organization}/api/data/v9.2/${definition.tableAlias}`)
      if (!nextUrl) for (const [key, value] of Object.entries(parameters)) if (key.startsWith('$')) url.searchParams.set(key, String(value))
      const response = await fetch(url.href, { credentials: 'include', headers: { Accept: 'application/json', Authorization: `Bearer ${token}`, 'OData-Version': '4.0', 'OData-MaxVersion': '4.0', Prefer: 'odata.maxpagesize=1000' } })
      if (!response.ok) throw new Error(await response.text())
      return response.json()
    }
    const result = await runtimeDataClient.executeAsync<any, any>({ connectorOperation: {
      tableName: 'commondataserviceforapps', operationName: parameters.next ? 'GetNextPageWithOrganization' : 'ListRecordsWithOrganization',
      parameters: parameters.next ? { organization: parameters.organization, next: parameters.next } : { organization, entityName: definition.tableAlias, ...parameters, accept: 'application/json', prefer: 'odata.maxpagesize=1000', ...(token ? { token } : {}) },
    } } as any)
    if (!result?.success) throw new Error(String(result?.error?.message || result?.error || `Unable to load ${definition.label} merge records.`))
    return result.data
  })
}

async function listDefinitionRecords(definition: ArchiveTableDefinition, clientId: string, enrollmentIds: string[]): Promise<ClientMergeRecord[]> {
  const found = new Map<string, Record<string, any>>()
  const filters: string[] = []
  if (definition.clientLookupField) filters.push(`${definition.clientLookupField} eq ${clientId}`)
  if (definition.enrollmentLookupField) for (let start = 0; start < enrollmentIds.length; start += 50) {
    filters.push(enrollmentIds.slice(start, start + 50).map((id) => `${definition.enrollmentLookupField} eq ${id}`).join(' or '))
  }
  for (const filter of filters) for (const row of await queryRecords(definition, filter)) {
    const id = cleanGuid(row[definition.primaryIdField] || row.id)
    if (!GUID.test(id)) throw new Error(`${definition.label} returned an invalid Dataverse row ID.`)
    found.set(id, row)
  }
  const enrollmentSet = new Set(enrollmentIds)
  return [...found.entries()].map(([id, row]) => {
    const linkedClientId = definition.clientLookupField ? cleanGuid(row[definition.clientLookupField]) : ''
    const parentEnrollmentId = definition.enrollmentLookupField ? cleanGuid(row[definition.enrollmentLookupField]) : ''
    if (linkedClientId && linkedClientId !== clientId || parentEnrollmentId && !enrollmentSet.has(parentEnrollmentId)) throw new Error(`${definition.label} relationship changed while the merge inventory was loading.`)
    const display = (definition.displayFields || []).map((field) => String(row[field] || '').trim()).filter(Boolean).join(' · ')
    return {
      id, recordId: String(row[definition.recordIdField || 'cmps_recordid'] || '').trim(), tableKey: definition.key,
      tableLabel: definition.label, tableAlias: definition.tableAlias, primaryIdField: definition.primaryIdField,
      summary: display, createdOn: String(row.createdon || '').trim(), modifiedOn: String(row.modifiedon || '').trim(),
      clientLookupField: definition.clientLookupField || '', enrollmentLookupField: definition.enrollmentLookupField || '',
      linkedClientId, parentEnrollmentId,
    }
  })
}

export async function loadClientMergeInventory(clientProfileRowId: string): Promise<ClientMergeInventory> {
  const clientId = cleanGuid(clientProfileRowId)
  if (!GUID.test(clientId)) throw new Error('Choose a valid Client Profile before loading merge records.')
  const [detail, enrollmentRows] = await Promise.all([
    loadClientProfileDetailRecord(clientId), listProgramEnrollmentsForClientRecord(clientId),
  ])
  if (cleanGuid(detail.id) !== clientId) throw new Error('The selected Client Profile could not be verified.')
  const enrollments: ClientMergeEnrollment[] = enrollmentRows.map((row) => ({
    id: cleanGuid(row.id), recordId: row.recordId, program: row.program, funder: row.funder,
    startDate: row.serviceStartDate, endDate: row.serviceEndDate,
  }))
  if (enrollments.some((row) => !GUID.test(row.id))) throw new Error('A Program Enrollment returned an invalid Dataverse row ID.')
  const relatedDefinitions = ARCHIVE_TABLES.filter((definition) => definition.tableAlias !== CLIENT_TABLE && definition.tableAlias !== ENROLLMENT_TABLE && !!definition.primaryIdField && (!!definition.clientLookupField || !!definition.enrollmentLookupField))
  const grouped = await mapLimit(relatedDefinitions, 4, (definition) => listDefinitionRecords(definition, clientId, enrollments.map((row) => row.id)))
  const values = detail.values as Record<string, string>
  return {
    profile: {
      id: clientId, recordId: detail.recordId,
      name: [values.cmps_name, values.cmps_middlename, values.cmps_lastname].filter(Boolean).join(' '),
      hmisId: values.cmps_hmisid || '', dateOfBirth: values.cmps_dateofbirth || '',
    },
    enrollments,
    records: grouped.flat().sort((left, right) => left.tableLabel.localeCompare(right.tableLabel) || left.recordId.localeCompare(right.recordId) || left.id.localeCompare(right.id)),
  }
}

function decisionMap<T extends { sourceId: string }>(decisions: T[]): Map<string, T> {
  const result = new Map<string, T>()
  for (const decision of decisions) {
    const id = cleanGuid(decision.sourceId)
    if (!GUID.test(id) || result.has(id)) throw new Error('The merge plan contains an invalid or duplicate source record.')
    result.set(id, { ...decision, sourceId: id })
  }
  return result
}

function relink(tableAlias: string, rowId: string, label: string, lookupField: string, targetEntitySet: string, targetId: string): ClientMergeOperation {
  const attribute = lookupAttribute(lookupField)
  if (!attribute || !GUID.test(cleanGuid(targetId))) throw new Error(`Cannot resolve the destination relationship for ${label}.`)
  return { kind: 'relink', tableAlias, rowId, label, lookupField: attribute, targetEntitySet, targetId: cleanGuid(targetId) }
}

export function buildClientMergeOperations(plan: ClientMergePlan, primary: ClientMergeInventory, secondary: ClientMergeInventory): ClientMergeOperation[] {
  const primaryId = cleanGuid(plan.primaryClientId), secondaryId = cleanGuid(plan.secondaryClientId)
  if (!GUID.test(primaryId) || !GUID.test(secondaryId) || primaryId === secondaryId) throw new Error('Primary and secondary Client Profiles must be different valid records.')
  if (cleanGuid(primary.profile.id) !== primaryId || cleanGuid(secondary.profile.id) !== secondaryId) throw new Error('The merge inventory does not match the selected Client Profiles.')
  const enrollmentDecisions = decisionMap(plan.enrollmentDecisions)
  const recordDecisions = decisionMap(plan.recordDecisions)
  const secondaryEnrollments = new Map(secondary.enrollments.map((row) => [cleanGuid(row.id), row]))
  const primaryEnrollments = new Map(primary.enrollments.map((row) => [cleanGuid(row.id), row]))
  const primaryRecords = new Map(primary.records.map((row) => [cleanGuid(row.id), row]))
  const operations: ClientMergeOperation[] = []
  const enrollmentDestinations = new Map<string, string>()

  for (const [sourceId, enrollment] of secondaryEnrollments) {
    const decision = enrollmentDecisions.get(sourceId) || { sourceId, action: 'exclude' as const }
    if (decision.action === 'exclude') continue
    if (decision.action === 'move') {
      enrollmentDestinations.set(sourceId, sourceId)
      operations.push(relink(ENROLLMENT_TABLE, sourceId, `Program Enrollment ${enrollment.recordId || sourceId}`, '_cmps_clientid_value', CLIENT_TABLE, primaryId))
      continue
    }
    const targetId = cleanGuid(decision.targetId)
    if (!primaryEnrollments.has(targetId)) throw new Error(`Choose an existing primary Program Enrollment for ${enrollment.recordId || sourceId}.`)
    enrollmentDestinations.set(sourceId, targetId)
  }

  for (const record of secondary.records) {
    const sourceId = cleanGuid(record.id)
    const decision = recordDecisions.get(sourceId) || { sourceId, tableAlias: record.tableAlias, action: 'exclude' as const }
    if (decision.tableAlias && decision.tableAlias !== record.tableAlias) throw new Error(`The merge plan table does not match ${record.recordId || sourceId}.`)
    const enrollmentDecision = record.parentEnrollmentId ? enrollmentDecisions.get(cleanGuid(record.parentEnrollmentId)) || { action: 'exclude' as const } : null
    if (decision.action === 'exclude') {
      // Once an enrollment is moved, its descendants would otherwise move with it.
      if (enrollmentDecision?.action === 'move') operations.push({ kind: 'archive', tableAlias: record.tableAlias, rowId: sourceId, label: `${record.tableLabel} ${record.recordId || sourceId}` })
      continue
    }
    if (enrollmentDecision?.action === 'exclude') throw new Error(`Select the parent Program Enrollment before carrying ${record.tableLabel} ${record.recordId || sourceId}.`)
    if (decision.action === 'merge') {
      const targetId = cleanGuid(decision.targetId), target = primaryRecords.get(targetId)
      if (!target || target.tableAlias !== record.tableAlias) throw new Error(`Choose an existing primary ${record.tableLabel} for ${record.recordId || sourceId}.`)
      operations.push({ kind: 'archive', tableAlias: record.tableAlias, rowId: sourceId, label: `${record.tableLabel} ${record.recordId || sourceId}` })
      continue
    }
    if (record.clientLookupField && record.linkedClientId === secondaryId) operations.push(relink(record.tableAlias, sourceId, `${record.tableLabel} ${record.recordId || sourceId}`, record.clientLookupField, CLIENT_TABLE, primaryId))
    if (record.enrollmentLookupField && record.parentEnrollmentId) {
      const destinationId = enrollmentDestinations.get(cleanGuid(record.parentEnrollmentId))
      if (!destinationId) throw new Error(`Choose a destination Program Enrollment for ${record.tableLabel} ${record.recordId || sourceId}.`)
      if (destinationId !== cleanGuid(record.parentEnrollmentId)) operations.push(relink(record.tableAlias, sourceId, `${record.tableLabel} ${record.recordId || sourceId}`, record.enrollmentLookupField, ENROLLMENT_TABLE, destinationId))
    }
  }

  for (const [sourceId, enrollment] of secondaryEnrollments) {
    const decision = enrollmentDecisions.get(sourceId)
    if (decision?.action === 'merge') operations.push({ kind: 'archive', tableAlias: ENROLLMENT_TABLE, rowId: sourceId, label: `Program Enrollment ${enrollment.recordId || sourceId}` })
  }
  operations.push({ kind: 'archive', tableAlias: CLIENT_TABLE, rowId: secondaryId, label: `secondary Client Profile ${secondary.profile.recordId || secondaryId}`, cascade: true })
  return operations
}

async function updateLookup(operation: ClientMergeOperation, savedBy: string): Promise<void> {
  if (!operation.lookupField || !operation.targetEntitySet || !operation.targetId) throw new Error(`Incomplete relationship update for ${operation.label}.`)
  const item = { [`${operation.lookupField}@odata.bind`]: `/${operation.targetEntitySet}(${operation.targetId})`, ...(savedBy ? { cmps_modifiedby: savedBy } : {}) }
  const token = getAuthToken()
  try {
    const result = await runtimeDataClient.executeAsync<any, any>({ connectorOperation: {
      tableName: 'commondataserviceforapps', operationName: 'UpdateRecordWithOrganization',
      parameters: { organization: orgUrl(), entityName: operation.tableAlias, recordId: operation.rowId, item, prefer: 'return=representation', accept: 'application/json', ...(token ? { token } : {}) },
    } } as any)
    if (result?.success) return
  } catch {
    // Fall through to the authenticated Web API path.
  }
  const directToken = await ensureAuthToken()
  const response = await fetch(`${orgUrl()}/api/data/v9.2/${operation.tableAlias}(${operation.rowId})`, {
    method: 'PATCH', credentials: 'include', headers: { Accept: 'application/json', 'Content-Type': 'application/json', 'OData-Version': '4.0', 'OData-MaxVersion': '4.0', Authorization: `Bearer ${directToken}` }, body: JSON.stringify(item),
  })
  if (!response.ok) throw new Error(await response.text())
}

export class ClientMergeProgressError extends Error {
  completed: number
  total: number
  constructor(completed: number, total: number, operation: ClientMergeOperation, cause: unknown) {
    super(`Client merge stopped after ${completed} of ${total} confirmed operations while processing ${operation.label}. Completed relationship changes were not rolled back. Review both profiles before retrying. ${String((cause as Error)?.message || cause)}`)
    this.name = 'ClientMergeProgressError'
    this.completed = completed
    this.total = total
  }
}

export async function executeClientMergePlan(
  plan: ClientMergePlan,
  options: { canManage: boolean; savedBy?: string; onProgress?: (completed: number, total: number, label: string) => void },
): Promise<ClientMergeResult> {
  if (!options.canManage) throw new Error('IT Admin access is required to merge Client Profiles.')
  const primaryId = cleanGuid(plan.primaryClientId), secondaryId = cleanGuid(plan.secondaryClientId)
  const [primary, secondary] = await Promise.all([loadClientMergeInventory(primaryId), loadClientMergeInventory(secondaryId)])
  const operations = buildClientMergeOperations(plan, primary, secondary)
  let completed = 0
  for (const operation of operations) {
    options.onProgress?.(completed, operations.length, operation.label)
    try {
      if (operation.kind === 'relink') await updateLookup(operation, String(options.savedBy || '').trim())
      else await setRecordArchived(operation.tableAlias, operation.rowId, true, String(options.savedBy || '').trim())
      completed += 1
      options.onProgress?.(completed, operations.length, operation.label)
    } catch (error) {
      throw new ClientMergeProgressError(completed, operations.length, operation, error)
    }
  }
  return { completed, total: operations.length, operations }
}
