import { getClient } from '@microsoft/power-apps/data'
import { dataSourcesInfo } from '../../.power/schemas/appschemas/dataSourcesInfo'
import { ensureAuthToken, getAuthToken } from './auth'
import { excludeArchived } from './archive'
import { readDataverseRecordPages } from './dataverseRecordPages'
import { PROGRAM_ENROLLMENT_FIELDS } from './programEnrollment'
import { SERVICE_CATEGORY_OPTIONS, SERVICE_OPTIONS } from './services'

export type ActiveRosterRow = {
  clientId: string; clientRecordId: string; clientName: string; clientDob: string
  enrollmentId: string; enrollmentRecordId: string; program: string; programStartDate: string; programEndDate: string; staffAssigned: string
  serviceId: string; serviceRecordId: string; serviceDate: string; serviceCategory: string; service: string
  bedEnrollmentId: string; bedEnrollmentRecordId: string; checkInDate: string; checkOutDate: string; bedNumber: string
}

const ENROLLMENTS = 'cmps_programenrollment1s'
const CLIENTS = 'cmps_clientprofiles'
const SERVICES = 'cmps_serviceses'
const BEDS = 'cmps_bedenrollments'
const BED_DEFINITIONS = 'cmps_bedses'
const OPTION_BASE = 125570000
const PROGRAM_OPTIONS = PROGRAM_ENROLLMENT_FIELDS.find((field) => field.field === 'cmps_program')?.options || []
const client = getClient(dataSourcesInfo as any)
const organization = () => String(import.meta.env.VITE_DATAVERSE_ORG_URL || 'https://org1f466e4e.crm.dynamics.com').trim().replace(/\/+$/, '')
const isLocal = () => typeof window !== 'undefined' && ['localhost', '127.0.0.1'].includes(window.location.hostname)
const cleanId = (value: unknown) => String(value || '').replace(/[{}]/g, '').trim().toLowerCase()
const isGuid = (value: string) => /^[a-f\d]{8}-[a-f\d]{4}-[a-f\d]{4}-[a-f\d]{4}-[a-f\d]{12}$/i.test(value)
const text = (value: unknown) => String(value ?? '').trim()
const dateValue = (value: unknown) => text(value).slice(0, 10)
const label = (row: Record<string, any>, field: string, options: string[] = []) => {
  const formatted = text(row[`${field}@OData.Community.Display.V1.FormattedValue`])
  if (formatted && !/^\d+$/.test(formatted)) return formatted
  const raw = row[field]
  if (options.length && /^\d+$/.test(text(raw))) return options[Number(raw) - OPTION_BASE] || text(raw)
  return text(raw)
}

function chunk<T>(values: T[], size = 30): T[][] { const result: T[][] = []; for (let i = 0; i < values.length; i += size) result.push(values.slice(i, i + size)); return result }
function idsFilter(field: string, ids: string[]) { return ids.map((id) => `${field} eq ${id}`).join(' or ') }
async function mapLimit<T, R>(items: T[], limit: number, action: (item: T) => Promise<R>): Promise<R[]> {
  const result: R[] = new Array(items.length); let cursor = 0
  await Promise.all(Array.from({ length: Math.min(limit, items.length) }, async () => {
    while (cursor < items.length) { const index = cursor++; result[index] = await action(items[index]) }
  }))
  return result
}

async function readRows(table: string, query: Record<string, unknown>, signal: AbortSignal) {
  const org = organization(), runtime = !isLocal(), token = runtime ? getAuthToken() : await ensureAuthToken()
  if (!runtime && !token) throw new Error('Dataverse sign-in is required to load the Active Client Roster.')
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

function personName(row: Record<string, any> | undefined) {
  if (!row) return ''
  const first = text(row.cmps_name), middle = text(row.cmps_middlename), last = text(row.cmps_lastname)
  if (!middle && !last && first.includes(' ')) return first
  return [first, middle, last].filter(Boolean).join(' ')
}

function mappedBedNumber(value: unknown, row: Record<string, any>, bedsById: Map<string, string>) {
  const lookupId = cleanId(row._cmps_bedid_value)
  if (lookupId && bedsById.has(lookupId)) return bedsById.get(lookupId) || ''
  const formatted = text(row['_cmps_bedid_value@OData.Community.Display.V1.FormattedValue'] || row['cmps_bedid@OData.Community.Display.V1.FormattedValue'])
  if (formatted) return formatted
  const raw = text(value)
  return isGuid(cleanId(raw)) ? bedsById.get(cleanId(raw)) || raw : raw
}

export async function loadActiveClientRoster(authorizedPrograms: string[], signal: AbortSignal): Promise<ActiveRosterRow[]> {
  const permittedPrograms = [...new Set(authorizedPrograms.map(text).filter((program) => PROGRAM_OPTIONS.some((option) => option.toLocaleLowerCase() === program.toLocaleLowerCase())))]
  if (!permittedPrograms.length) return []
  const programValues = permittedPrograms.map((program) => String(OPTION_BASE + PROGRAM_OPTIONS.findIndex((option) => option.toLocaleLowerCase() === program.toLocaleLowerCase())))
  const enrollmentRows = await readRows(ENROLLMENTS, {
    '$select': 'cmps_programenrollment1id,cmps_recordid,cmps_program,cmps_servicestartdate,cmps_serviceenddate,cmps_staffassigned,_cmps_clientid_value,cmps_isarchived',
    '$filter': excludeArchived(`cmps_serviceenddate eq null and (${programValues.map((value) => `cmps_program eq ${value}`).join(' or ')})`),
    '$orderby': 'cmps_servicestartdate desc',
  }, signal)
  const allowed = new Set(permittedPrograms.map((program) => program.toLocaleLowerCase()))
  const enrollments = enrollmentRows.filter((row) => !text(row.cmps_serviceenddate) && Number(row.cmps_isarchived) !== OPTION_BASE && allowed.has(label(row, 'cmps_program', PROGRAM_OPTIONS).toLocaleLowerCase()))
  const clientIds = [...new Set(enrollments.map((row) => cleanId(row._cmps_clientid_value)).filter(Boolean))]
  const enrollmentIds = [...new Set(enrollments.map((row) => cleanId(row.cmps_programenrollment1id)).filter(Boolean))]
  const [clientPages, servicePages, bedPages] = await Promise.all([
    mapLimit(chunk(clientIds), 4, (ids) => readRows(CLIENTS, { '$select': 'cmps_clientprofileid,cmps_recordid,cmps_name,cmps_middlename,cmps_lastname,cmps_dateofbirth', '$filter': excludeArchived(idsFilter('cmps_clientprofileid', ids)) }, signal)),
    mapLimit(chunk(enrollmentIds), 4, (ids) => readRows(SERVICES, { '$select': 'cmps_servicesid,cmps_recordid,cmps_dateofservice,cmps_servicecategory,cmps_service,_cmps_programenrollment_value,cmps_isarchived', '$filter': excludeArchived(idsFilter('_cmps_programenrollment_value', ids)), '$orderby': 'cmps_dateofservice desc' }, signal)),
    mapLimit(chunk(enrollmentIds), 4, async (ids) => {
      const base = 'cmps_bedenrollmentid,cmps_recordid,cmps_checkindate,cmps_checkoutdate,_cmps_programenrollment_value,cmps_isarchived'
      const filter = excludeArchived(idsFilter('_cmps_programenrollment_value', ids))
      try { return await readRows(BEDS, { '$select': `${base},_cmps_bedid_value`, '$filter': filter, '$orderby': 'cmps_checkindate desc' }, signal) }
      catch { try { return await readRows(BEDS, { '$select': `${base},cmps_bedid`, '$filter': filter, '$orderby': 'cmps_checkindate desc' }, signal) } catch { return readRows(BEDS, { '$select': base, '$filter': filter, '$orderby': 'cmps_checkindate desc' }, signal) } }
    }),
  ])
  const clients = clientPages.flat(), services = servicePages.flat(), beds = bedPages.flat()
  const bedIds = [...new Set(beds.map((row) => cleanId(row._cmps_bedid_value || row.cmps_bedid)).filter(isGuid))]
  const bedDefinitionPages = await mapLimit(chunk(bedIds), 4, (ids) => readRows(BED_DEFINITIONS, { '$select': 'cmps_bedid,cmps_bedname', '$filter': idsFilter('cmps_bedid', ids) }, signal).catch(() => []))
  const bedsById = new Map(bedDefinitionPages.flat().map((row) => [cleanId(row.cmps_bedid), text(row.cmps_bedname)]))
  const clientById = new Map(clients.map((row) => [cleanId(row.cmps_clientprofileid), row]))
  const serviceByEnrollment = new Map<string, Record<string, any>>()
  for (const row of services) {
    if (Number(row.cmps_isarchived) === OPTION_BASE) continue
    const enrollmentId = cleanId(row._cmps_programenrollment_value), prior = serviceByEnrollment.get(enrollmentId)
    const date = dateValue(row.cmps_dateofservice), priorDate = dateValue(prior?.cmps_dateofservice)
    if (!prior || date > priorDate || date === priorDate && text(row.cmps_recordid).localeCompare(text(prior.cmps_recordid)) > 0) serviceByEnrollment.set(enrollmentId, row)
  }
  const bedByEnrollment = new Map<string, Record<string, any>>()
  for (const row of beds) {
    if (Number(row.cmps_isarchived) === OPTION_BASE) continue
    const enrollmentId = cleanId(row._cmps_programenrollment_value), prior = bedByEnrollment.get(enrollmentId)
    const active = !text(row.cmps_checkoutdate), priorActive = prior && !text(prior.cmps_checkoutdate)
    const date = dateValue(row.cmps_checkindate), priorDate = dateValue(prior?.cmps_checkindate)
    if (!prior || active && !priorActive || active === priorActive && date > priorDate) bedByEnrollment.set(enrollmentId, row)
  }
  return enrollments.flatMap((enrollment): ActiveRosterRow[] => {
    const clientId = cleanId(enrollment._cmps_clientid_value), person = clientById.get(clientId), enrollmentId = cleanId(enrollment.cmps_programenrollment1id)
    if (!person || !clientId || !enrollmentId) return []
    const service = serviceByEnrollment.get(enrollmentId), bed = bedByEnrollment.get(enrollmentId)
    return [{
      clientId, clientRecordId: text(person.cmps_recordid), clientName: personName(person), clientDob: dateValue(person.cmps_dateofbirth),
      enrollmentId, enrollmentRecordId: text(enrollment.cmps_recordid), program: label(enrollment, 'cmps_program', PROGRAM_OPTIONS), programStartDate: dateValue(enrollment.cmps_servicestartdate), programEndDate: dateValue(enrollment.cmps_serviceenddate), staffAssigned: label(enrollment, 'cmps_staffassigned'),
      serviceId: cleanId(service?.cmps_servicesid), serviceRecordId: text(service?.cmps_recordid), serviceDate: dateValue(service?.cmps_dateofservice), serviceCategory: label(service || {}, 'cmps_servicecategory', SERVICE_CATEGORY_OPTIONS), service: label(service || {}, 'cmps_service', SERVICE_OPTIONS),
      bedEnrollmentId: cleanId(bed?.cmps_bedenrollmentid), bedEnrollmentRecordId: text(bed?.cmps_recordid), checkInDate: dateValue(bed?.cmps_checkindate), checkOutDate: dateValue(bed?.cmps_checkoutdate), bedNumber: mappedBedNumber(bed?.cmps_bedid, bed || {}, bedsById),
    }]
  }).sort((a, b) => a.program.localeCompare(b.program) || a.clientName.localeCompare(b.clientName) || a.clientRecordId.localeCompare(b.clientRecordId))
}
