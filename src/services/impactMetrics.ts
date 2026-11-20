import { getClient } from '@microsoft/power-apps/data'
import { dataSourcesInfo } from '../../.power/schemas/appschemas/dataSourcesInfo'
import { ensureAuthToken, getAuthToken } from './auth'
import { excludeArchived } from './archive'
import { readDataverseRecordPages } from './dataverseRecordPages'
import { impactPeriodRange, summarizeImpact, type ImpactHelplineRecord, type ImpactMetrics, type ImpactPeriod, type ImpactServiceRecord } from './impactMath'
export { impactPeriodRange, summarizeImpact } from './impactMath'
export type { ImpactPeriod, ImpactMetrics, ImpactServiceRecord, ImpactHelplineRecord } from './impactMath'

const SERVICE_TABLE = 'cmps_serviceses'
const HELPLINE_TABLE = 'cmps_helplines'
const ENROLLMENT_TABLE = 'cmps_programenrollment1s'
const CLIENT_TABLE = 'cmps_clientprofiles'
const client = getClient(dataSourcesInfo as any)
const organization = () => String(import.meta.env.VITE_DATAVERSE_ORG_URL || 'https://org1f466e4e.crm.dynamics.com').trim().replace(/\/+$/, '')
const isLocal = () => typeof window !== 'undefined' && ['localhost', '127.0.0.1'].includes(window.location.hostname)
const cleanId = (value: unknown) => String(value || '').replace(/[{}]/g, '').trim().toLowerCase()
const getLabel = (row: Record<string, any>, field: string) => String(row[`${field}@OData.Community.Display.V1.FormattedValue`] ?? row[field] ?? '').trim()


async function readRows(table: string, query: Record<string, unknown>, signal: AbortSignal) {
  const org = organization(), runtime = !isLocal(), token = runtime ? getAuthToken() : await ensureAuthToken()
  if (!runtime && !token) throw new Error('Dataverse sign-in is required to load My Impact.')
  const rows = await readDataverseRecordPages(org, table, query, runtime, async (parameters, nextUrl) => {
    signal.throwIfAborted()
    if (runtime) {
      const result = await client.executeAsync<any, any>({ connectorOperation: { tableName: 'commondataserviceforapps', operationName: parameters.next ? 'GetNextPageWithOrganization' : 'ListRecordsWithOrganization', parameters: { organization: org, entityName: table, accept: 'application/json', prefer: 'odata.maxpagesize=1000,odata.include-annotations="OData.Community.Display.V1.FormattedValue"', ...parameters, ...(token ? { token } : {}) } } } as any)
      signal.throwIfAborted()
      if (!result?.success) throw new Error(`${table}: ${typeof result?.error === 'string' ? result.error : result?.error?.message || 'Dataverse read failed.'}`)
      return result.data
    }
    const url = new URL(nextUrl || `${org}/api/data/v9.2/${table}`)
    for (const [key, value] of Object.entries(parameters)) if (key.startsWith('$')) url.searchParams.set(key, String(value))
    const response = await fetch(url.href, { signal, credentials: 'include', headers: { Accept: 'application/json', Authorization: `Bearer ${token}`, Prefer: 'odata.maxpagesize=1000,odata.include-annotations="OData.Community.Display.V1.FormattedValue"', 'OData-Version': '4.0', 'OData-MaxVersion': '4.0' } })
    if (!response.ok) throw new Error(`${table}: ${await response.text()}`)
    return response.json()
  })
  signal.throwIfAborted()
  return rows
}

function chunks<T>(values: T[], size = 30) { const result: T[][] = []; for (let i = 0; i < values.length; i += size) result.push(values.slice(i, i + size)); return result }
function idsFilter(field: string, ids: string[]) { return ids.map((id) => `${field} eq ${id}`).join(' or ') }

export async function loadStaffImpact(staffName: string, period: ImpactPeriod, signal: AbortSignal): Promise<ImpactMetrics> {
  const staff = staffName.trim()
  if (!staff) throw new Error('Your COMPASS display name is not available, so My Impact cannot match records created by you.')
  const { from, toExclusive } = impactPeriodRange(period)
  const escape = (value: string) => value.replaceAll("'", "''")
  const filters = (dateField: string) => excludeArchived(`cmps_createdby eq '${escape(staff)}' and ${dateField} ge ${from} and ${dateField} lt ${toExclusive}`)
  const [serviceRows, helplineRows] = await Promise.all([
    readRows(SERVICE_TABLE, { '$select': 'cmps_servicesid,cmps_recordid,cmps_dateofservice,cmps_minutes,cmps_servicecategory,cmps_service,_cmps_programenrollment_value,cmps_createdby,cmps_isarchived', '$filter': filters('cmps_dateofservice'), '$orderby': 'cmps_dateofservice desc' }, signal),
    readRows(HELPLINE_TABLE, { '$select': 'cmps_helplineid,cmps_recordid,cmps_dateofcontact,cmps_contacttype,cmps_program,_cmps_cpid_value,cmps_createdby,cmps_isarchived', '$filter': filters('cmps_dateofcontact'), '$orderby': 'cmps_dateofcontact desc' }, signal),
  ])
  const scopedServices = serviceRows.filter((row) => String(row.cmps_createdby || '').trim().toLocaleLowerCase() === staff.toLocaleLowerCase() && Number(row.cmps_isarchived) !== 125570000)
  const enrollmentIds = [...new Set(scopedServices.map((row) => cleanId(row._cmps_programenrollment_value)).filter(Boolean))]
  const enrollments = (await Promise.all(chunks(enrollmentIds).map((ids) => readRows(ENROLLMENT_TABLE, { '$select': 'cmps_programenrollment1id,cmps_recordid,cmps_program,_cmps_clientid_value', '$filter': excludeArchived(idsFilter('cmps_programenrollment1id', ids)) }, signal)))).flat()
  const enrollmentById = new Map(enrollments.map((row) => [cleanId(row.cmps_programenrollment1id), row]))
  const clientIds = [...new Set(enrollments.map((row) => cleanId(row._cmps_clientid_value)).filter(Boolean))]
  const clients = (await Promise.all(chunks(clientIds).map((ids) => readRows(CLIENT_TABLE, { '$select': 'cmps_clientprofileid,cmps_recordid,cmps_name,cmps_middlename,cmps_lastname', '$filter': idsFilter('cmps_clientprofileid', ids) }, signal)))).flat()
  const clientById = new Map(clients.map((row) => [cleanId(row.cmps_clientprofileid), row]))
  const services = scopedServices.map((row): ImpactServiceRecord => {
    const enrollmentId = cleanId(row._cmps_programenrollment_value), enrollment = enrollmentById.get(enrollmentId), clientId = cleanId(enrollment?._cmps_clientid_value), person = clientById.get(clientId)
    return { id: cleanId(row.cmps_servicesid), recordId: String(row.cmps_recordid || '').trim(), date: String(row.cmps_dateofservice || '').slice(0, 10), category: getLabel(row, 'cmps_servicecategory') || 'Uncategorized', service: getLabel(row, 'cmps_service') || 'Unspecified', minutes: Math.max(0, Number(row.cmps_minutes) || 0), enrollmentId, clientId, clientRecordId: String(person?.cmps_recordid || '').trim(), clientName: [person?.cmps_name, person?.cmps_middlename, person?.cmps_lastname].filter(Boolean).join(' ').trim(), program: String(enrollment?.cmps_program || '').trim() }
  }).filter((row) => row.id)
  const calls = helplineRows.filter((row) => String(row.cmps_createdby || '').trim().toLocaleLowerCase() === staff.toLocaleLowerCase() && Number(row.cmps_isarchived) !== 125570000).map((row): ImpactHelplineRecord => ({ id: cleanId(row.cmps_helplineid), recordId: String(row.cmps_recordid || '').trim(), date: String(row.cmps_dateofcontact || '').slice(0, 10), contactType: getLabel(row, 'cmps_contacttype') || 'Helpline call', program: getLabel(row, 'cmps_program'), clientId: cleanId(row._cmps_cpid_value) })).filter((row) => row.id)
  return summarizeImpact(services, calls)
}
