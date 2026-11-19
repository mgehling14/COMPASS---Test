import { getClient } from '@microsoft/power-apps/data'
import { dataSourcesInfo } from '../../../.power/schemas/appschemas/dataSourcesInfo'
import { ensureAuthToken, getAuthToken } from '../auth'
import { readReportSchema, type ReportSchema } from './reportDataverse'
import { PROFILE_REPORT_EXCLUSION_COLUMN, REPORT_ARCHIVED_NO, REPORT_ARCHIVED_YES, profileIsExcludedFromReports, profileReportExclusionFilter, reportArchiveFilter, reportRowIsArchived } from './reportEligibility'

const alias = 'cmps_clientprofiles', client = getClient(dataSourcesInfo as any)
const organization = () => String(import.meta.env.VITE_DATAVERSE_ORG_URL || 'https://org1f466e4e.crm.dynamics.com').trim().replace(/\/+$/, '')
const local = () => typeof window !== 'undefined' && ['localhost', '127.0.0.1'].includes(window.location.hostname)
export type ReportExclusionAccess = { canManage: () => boolean; savedBy: string }
export type ClientReportExclusion = { id: string; recordId: string; name: string; excluded: boolean }
function assertAccess(access: ReportExclusionAccess, signal: AbortSignal) { signal.throwIfAborted(); if (!access.canManage()) throw new Error('Only IT Admin outside View as User can edit report exclusions.') }
function profileId(value: string): string { const id = value.trim().replace(/[{}]/g, '').toLowerCase(); if (!/^[a-f\d]{8}(?:-[a-f\d]{4}){3}-[a-f\d]{12}$/i.test(id)) throw new Error('Invalid Client Profile row ID.'); return id }
async function request(parameters: Record<string, unknown>, signal: AbortSignal, item?: Record<string, unknown>): Promise<any> {
  signal.throwIfAborted()
  if (!local()) {
    const token = getAuthToken(), result = await client.executeAsync<any, any>({ connectorOperation: { tableName: 'commondataserviceforapps', operationName: item ? 'UpdateRecordWithOrganization' : 'ListRecordsWithOrganization', parameters: { organization: organization(), entityName: alias, accept: 'application/json', prefer: item ? 'return=representation' : 'odata.include-annotations="*"', ...parameters, ...(item ? { item } : {}), ...(token ? { token } : {}) } } } as any)
    signal.throwIfAborted()
    if (!result?.success) throw new Error(typeof result?.error === 'string' ? result.error : result?.error?.message || 'Client report exclusion request failed.')
    return result.data
  }
  const token = await ensureAuthToken()
  if (!token) throw new Error('Sign in to Dataverse first.')
  const url = new URL(`${organization()}/api/data/v9.2/${alias}${item ? `(${parameters.recordId})` : ''}`)
  if (!item) for (const [key, value] of Object.entries(parameters)) if (key.startsWith('$')) url.searchParams.set(key, String(value))
  const response = await fetch(url.href, { method: item ? 'PATCH' : 'GET', signal, credentials: 'include', headers: { Accept: 'application/json', 'Content-Type': 'application/json', Authorization: `Bearer ${token}`, 'OData-Version': '4.0', 'OData-MaxVersion': '4.0' }, ...(item ? { body: JSON.stringify(item) } : {}) })
  if (!response.ok) throw new Error(await response.text())
  return response.status === 204 ? null : response.json()
}
async function metadata(signal: AbortSignal): Promise<ReportSchema> {
  const schema = await readReportSchema(alias, signal)
  reportArchiveFilter(schema, alias); profileReportExclusionFilter(schema, alias)
  return schema
}
async function readProfile(id: string, schema: ReportSchema, signal: AbortSignal): Promise<ClientReportExclusion> {
  const payload = await request({ '$filter': `${schema.PrimaryIdAttribute} eq ${id}`, '$select': [schema.PrimaryIdAttribute, 'cmps_recordid', 'cmps_name', 'cmps_lastname', 'cmps_isarchived', PROFILE_REPORT_EXCLUSION_COLUMN].join(',') }, signal)
  const rows = Array.isArray(payload) ? payload : payload?.value
  if (!Array.isArray(rows) || rows.length !== 1 || String(rows[0][schema.PrimaryIdAttribute] || '').toLowerCase() !== id) throw new Error('The Client Profile could not be uniquely identified. No exclusion was changed.')
  const row = rows[0]
  if (reportRowIsArchived(row)) throw new Error('This profile is archived and already excluded from reports. Restore it first to change report inclusion.')
  return { id, recordId: String(row.cmps_recordid || ''), name: [row.cmps_name, row.cmps_lastname].filter(Boolean).join(' '), excluded: profileIsExcludedFromReports(row) }
}
export async function loadClientReportExclusion(rowId: string, access: ReportExclusionAccess, signal: AbortSignal): Promise<ClientReportExclusion> {
  assertAccess(access, signal); const id = profileId(rowId), schema = await metadata(signal); assertAccess(access, signal)
  return readProfile(id, schema, signal)
}
export async function saveClientReportExclusion(rowId: string, excluded: boolean, access: ReportExclusionAccess, signal: AbortSignal): Promise<ClientReportExclusion> {
  assertAccess(access, signal); const id = profileId(rowId), schema = await metadata(signal)
  await readProfile(id, schema, signal)
  assertAccess(access, signal)
  if (!access.savedBy.trim()) throw new Error('Signed-in IT Admin identity is required to save the exclusion.')
  const item: Record<string, unknown> = { [PROFILE_REPORT_EXCLUSION_COLUMN]: excluded ? REPORT_ARCHIVED_YES : REPORT_ARCHIVED_NO }
  if (schema.Attributes.some((field) => field.LogicalName === 'cmps_modifiedby' && ['String', 'Memo'].includes(field.AttributeType))) item.cmps_modifiedby = access.savedBy.trim()
  await request({ recordId: id }, signal, item)
  const saved = await readProfile(id, schema, signal)
  if (saved.excluded !== excluded) throw new Error('The report exclusion save could not be confirmed. Refresh before trying again.')
  return saved
}
