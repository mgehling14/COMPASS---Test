import { getClient } from '@microsoft/power-apps/data'
import { dataSourcesInfo } from '../../.power/schemas/appschemas/dataSourcesInfo'
import { ensureAuthToken, getAuthToken } from './auth'
import { createMigrationGateway, LEGACY_MIGRATION_TABLES, type MigrationGateway, type MigrationMetadata } from './legacyRecordMigration'
import { continuationPageKey } from './dataverseContinuation'
import { createRecordIdSequence } from './recordIdSequence'
import { createHouseholdHistoryRecord, type HouseholdHistoryPayload } from './householdHistory'

type Client = { id: string; recordId: string; legacyId: string }
export type HouseholdBackfillProgress = {
  phase: 'histories' | 'clients' | 'ready' | 'creating' | 'complete'
  historiesScanned: number; clientsScanned: number; existing: number; archived: number
  eligible: number; created: number; skipped: number
}
export type HouseholdBackfillPlan = {
  clients: Client[]; recordIds: string[]; clientMetadata: MigrationMetadata; historyMetadata: MigrationMetadata
  legacyMatch: boolean; progress: HouseholdBackfillProgress
}
export interface HouseholdBackfillGateway {
  reader: MigrationGateway
  eligible(client: Client, plan: HouseholdBackfillPlan, signal: AbortSignal): Promise<boolean>
  create(payload: HouseholdHistoryPayload): Promise<unknown>
}

const sdk = getClient(dataSourcesInfo as any)
const guid = (value: unknown) => String(value || '').trim().replace(/[{}]/g, '').toLowerCase()
const text = (value: unknown) => String(value ?? '').trim()
const GUID = /^[a-f\d]{8}(?:-[a-f\d]{4}){3}-[a-f\d]{12}$/i
let running = false

export function createHouseholdBackfillGateway(savedBy = ''): HouseholdBackfillGateway {
  const reader = createMigrationGateway()
  const query = async (metadata: MigrationMetadata, select: string[], filter: string, signal: AbortSignal): Promise<Record<string, any>[]> => {
    signal.throwIfAborted()
    const organization = String(import.meta.env.VITE_DATAVERSE_ORG_URL || 'https://org1f466e4e.crm.dynamics.com').trim().replace(/\/$/, '')
    const parameters = { organization, entityName: metadata.EntitySetName, '$select': select.join(','), '$filter': filter, '$top': 1 }
    let payload: any
    if (typeof window !== 'undefined' && ['localhost', '127.0.0.1'].includes(window.location.hostname)) {
      const token = await ensureAuthToken()
      if (!token) throw new Error('Dataverse authentication is required.')
      const query = new URLSearchParams({ '$select': parameters.$select, '$filter': filter, '$top': '1' })
      const response = await fetch(`${organization}/api/data/v9.2/${metadata.EntitySetName}?${query}`, { credentials: 'include', signal,
        headers: { Accept: 'application/json', Authorization: `Bearer ${token}` },
      })
      if (!response.ok) throw new Error(await response.text())
      payload = await response.json()
    } else {
      const token = getAuthToken()
      const result = await sdk.executeAsync<any, any>({ connectorOperation: { tableName: 'commondataserviceforapps', operationName: 'ListRecordsWithOrganization', parameters: { ...parameters, ...(token ? { token } : {}) } } } as any)
      if (!result?.success) throw new Error(String(result?.error?.message || result?.error || 'Household History eligibility check failed.'))
      payload = result.data
    }
    signal.throwIfAborted()
    const rows = Array.isArray(payload) ? payload : payload?.value
    if (!Array.isArray(rows)) throw new Error('Dataverse did not return eligibility records. No create was attempted for this client.')
    if (!rows.length && (payload?.['@odata.nextLink'] || payload?.['odata.nextLink'])) throw new Error('Incomplete eligibility response. No create was attempted for this client.')
    return rows
  }
  return {
    reader, create: (payload) => createHouseholdHistoryRecord({ ...payload, ...(savedBy ? { cmps_createdby: savedBy, cmps_modifiedby: savedBy } : {}) }),
    async eligible(client, plan, signal) {
      const profile = await query(plan.clientMetadata, [plan.clientMetadata.PrimaryIdAttribute, 'cmps_isarchived', ...(plan.legacyMatch ? ['cmps_clientid'] : [])], `${plan.clientMetadata.PrimaryIdAttribute} eq ${client.id}`, signal)
      if (profile.length === 0) return false
      if (profile.length !== 1 || guid(profile[0][plan.clientMetadata.PrimaryIdAttribute]) !== client.id) throw new Error('Client eligibility response did not match the requested client.')
      if (Number(profile[0].cmps_isarchived) === 125570000) return false
      const legacy = plan.legacyMatch ? text(profile[0].cmps_clientid) : ''
      const filter = `_cmps_clientid_value eq ${client.id}${legacy ? ` or cmps_clientidlegacy eq '${legacy.replaceAll("'", "''")}'` : ''}`
      // Include inactive, assigned and archived histories. Do not bypass an
      // intentional archive or reactivate someone by creating a second row.
      const histories = await query(plan.historyMetadata, [plan.historyMetadata.PrimaryIdAttribute, '_cmps_clientid_value', ...(plan.legacyMatch ? ['cmps_clientidlegacy'] : [])], filter, signal)
      if (histories.some((row) => guid(row._cmps_clientid_value) !== client.id && (!legacy || text(row.cmps_clientidlegacy) !== legacy))) throw new Error('History eligibility response did not match the requested client.')
      return histories.length === 0
    },
  }
}

function validateMetadata(metadata: MigrationMetadata, key: string): void {
  const definition = LEGACY_MIGRATION_TABLES.find((entry) => entry.key === key)!
  if (metadata.EntitySetName !== definition.tableAlias || metadata.PrimaryIdAttribute !== definition.primaryIdField) throw new Error(`Cannot verify ${definition.label} metadata. No histories were created.`)
}

export async function previewHouseholdHistoryBackfill(gateway: HouseholdBackfillGateway, signal: AbortSignal, progress?: (value: HouseholdBackfillProgress) => void): Promise<HouseholdBackfillPlan> {
  const clientMetadata = await gateway.reader.metadata(LEGACY_MIGRATION_TABLES.find((entry) => entry.key === 'client-profile')!, signal)
  const historyMetadata = await gateway.reader.metadata(LEGACY_MIGRATION_TABLES.find((entry) => entry.key === 'household-history')!, signal)
  validateMetadata(clientMetadata, 'client-profile'); validateMetadata(historyMetadata, 'household-history')
  for (const [name, type] of [['cmps_recordid', 'String'], ['cmps_clientid', 'Lookup'], ['cmps_householdid', 'Lookup'], ['cmps_status', 'Picklist'], ['cmps_isarchived', 'Picklist']]) {
    if (!historyMetadata.Attributes.some((entry) => entry.LogicalName === name && entry.AttributeType === type)) throw new Error(`Cannot verify Household History column ${name}. No histories were created.`)
  }
  if (!clientMetadata.Attributes.some((entry) => entry.LogicalName === 'cmps_isarchived')) throw new Error('Cannot verify client archive status. No histories were created.')
  if (!historyMetadata.ManyToOneRelationships.some((entry) => entry.ReferencingAttribute === 'cmps_clientid' && entry.ReferencedEntity === clientMetadata.LogicalName)) throw new Error('Cannot verify the Household History Client Profile lookup. No histories were created.')
  const legacyMatch = clientMetadata.Attributes.some((entry) => entry.LogicalName === 'cmps_clientid' && entry.AttributeType === 'String')
    && historyMetadata.Attributes.some((entry) => entry.LogicalName === 'cmps_clientidlegacy' && entry.AttributeType === 'String')
  const state: HouseholdBackfillProgress = { phase: 'histories', historiesScanned: 0, clientsScanned: 0, existing: 0, archived: 0, eligible: 0, created: 0, skipped: 0 }
  const emit = () => progress?.({ ...state })
  const histories = new Set<string>()
  const legacyHistories = new Set<string>()
  const recordIds: string[] = []
  const scan = async (metadata: MigrationMetadata, select: string[], row: (value: Record<string, unknown>) => void) => {
    let cursor = ''
    const seen = new Set<string>()
    do {
      signal.throwIfAborted()
      const page = await gateway.reader.page(metadata, select, cursor, signal)
      if (page.nextLink) {
        const key = continuationPageKey(page.nextLink)
        if (seen.has(key)) throw new Error('Household History preview paging repeated. No histories were created.')
        seen.add(key)
      }
      for (const value of page.rows) row(value)
      cursor = page.nextLink
      emit()
    } while (cursor)
  }
  emit()
  await scan(historyMetadata, [historyMetadata.PrimaryIdAttribute, 'cmps_recordid', '_cmps_clientid_value', ...(legacyMatch ? ['cmps_clientidlegacy'] : [])], (row) => {
    const id = guid(row._cmps_clientid_value)
    if (id && !GUID.test(id)) throw new Error('Invalid Household History client lookup. No histories were created.')
    if (id) histories.add(id)
    if (legacyMatch && text(row.cmps_clientidlegacy)) legacyHistories.add(text(row.cmps_clientidlegacy))
    recordIds.push(text(row.cmps_recordid)); state.historiesScanned += 1
  })
  state.phase = 'clients'; emit()
  const clients: Client[] = []
  const seenClients = new Set<string>()
  await scan(clientMetadata, [clientMetadata.PrimaryIdAttribute, 'cmps_recordid', 'cmps_isarchived', ...(legacyMatch ? ['cmps_clientid'] : [])], (row) => {
    const id = guid(row[clientMetadata.PrimaryIdAttribute])
    if (!GUID.test(id) || seenClients.has(id)) throw new Error('Invalid or repeated Client Profile row. No histories were created.')
    seenClients.add(id); state.clientsScanned += 1
    if (Number(row.cmps_isarchived) === 125570000) { state.archived += 1; return }
    const legacyId = legacyMatch ? text(row.cmps_clientid) : ''
    if (histories.has(id) || (legacyId && legacyHistories.has(legacyId))) { state.existing += 1; return }
    clients.push({ id, legacyId, recordId: text(row.cmps_recordid) }); state.eligible += 1
  })
  state.phase = 'ready'; emit()
  return { clients, recordIds, clientMetadata, historyMetadata, legacyMatch, progress: { ...state } }
}

export async function createMissingHouseholdHistories(gateway: HouseholdBackfillGateway, signal: AbortSignal, progress?: (value: HouseholdBackfillProgress) => void): Promise<HouseholdBackfillProgress> {
  if (running) throw new Error('A Household History backfill is already running or stopping.')
  running = true
  try {
    // Always refresh the complete plan before writing, even after a preview.
    const plan = await previewHouseholdHistoryBackfill(gateway, signal, progress)
    const state = { ...plan.progress, phase: 'creating' as HouseholdBackfillProgress['phase'] }
    const emit = () => progress?.({ ...state })
    const sequence = createRecordIdSequence('HHIST', '04')
    for (const recordId of plan.recordIds) sequence.observe(recordId)
    let position = 0
    let failure: unknown
    emit()
    const worker = async () => {
      while (position < plan.clients.length && !failure && !signal.aborted) {
        const client = plan.clients[position++]
        try {
          if (!await gateway.eligible(client, plan, signal)) { state.skipped += 1; emit(); continue }
          if (failure || signal.aborted) return
          // Reserve IDs synchronously before the POST. Never retry an
          // ambiguous create: a fresh preview/rerun checks whether it landed.
          await gateway.create({ clientRowId: client.id, cmps_recordid: sequence.allocate(), cmps_status: 'Active' })
          state.created += 1; emit()
        } catch (error) { failure ||= error }
      }
    }
    await Promise.all(Array.from({ length: 4 }, worker))
    if (failure) throw new Error(`${String((failure as Error)?.message || failure)} ${state.created} histories confirmed created. Completed creates are retained; run Preview again before retrying.`)
    signal.throwIfAborted()
    state.phase = 'complete'; emit()
    return state
  } finally { running = false }
}
