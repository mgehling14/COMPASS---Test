import { getClient } from '@microsoft/power-apps/data'
import { dataSourcesInfo } from '../../.power/schemas/appschemas/dataSourcesInfo'
import { ensureAuthToken, getAuthToken } from './auth'
import { readDataverseRecordPages } from './dataverseRecordPages'
import { reportingYearStart, reportDay, reportDate, validateReportPeriod, type ReportInput, type ReportRules } from './desDvReport'
import { PROFILE_REPORT_EXCLUSION_COLUMN, REPORT_ARCHIVE_COLUMN, profileReportExclusionFilter, profileIsExcludedFromReports, reportArchiveFilter, reportRowIsArchived } from './reporting/reportEligibility'

const client = getClient(dataSourcesInfo as any)
const TABLES = { enrollment: 'cmps_programenrollment1s', profile: 'cmps_clientprofiles', stay: 'cmps_bedenrollments' } as const
const GUID = /^[a-f\d]{8}-[a-f\d]{4}-[a-f\d]{4}-[a-f\d]{4}-[a-f\d]{12}$/i
type Attribute = { LogicalName: string; AttributeType: string }
type Schema = { LogicalName: string; PrimaryIdAttribute: string; Attributes: Attribute[] }
const org = () => String(import.meta.env.VITE_DATAVERSE_ORG_URL || 'https://org1f466e4e.crm.dynamics.com').trim().replace(/\/+$/, '')
const local = () => typeof window !== 'undefined' && ['localhost', '127.0.0.1'].includes(window.location.hostname)
const clean = (value: unknown) => String(value ?? '').trim()
const guid = (value: unknown) => clean(value).replace(/[{}]/g, '').toLowerCase()
function errorMessage(value: any): string { return typeof value === 'string' ? value : String(value?.error?.message || value?.message || 'Dataverse report read failed.') }

async function request(table: string, parameters: Record<string, unknown>, signal: AbortSignal, urlOverride = ''): Promise<any> {
  signal.throwIfAborted()
  if (!local()) {
    const token = getAuthToken()
    const result = await client.executeAsync<any, any>({ connectorOperation: {
      tableName: 'commondataserviceforapps', operationName: parameters.next ? 'GetNextPageWithOrganization' : 'ListRecordsWithOrganization',
      parameters: { organization: org(), entityName: table, accept: 'application/json', prefer: table.startsWith('EntityDefinitions') ? 'odata.include-annotations="*"' : 'odata.maxpagesize=1000,odata.include-annotations="OData.Community.Display.V1.FormattedValue"', ...parameters, ...(token ? { token } : {}) },
    } } as any)
    signal.throwIfAborted()
    if (!result?.success) throw new Error(`${table}: ${errorMessage(result?.error)}`)
    return result.data
  }
  const token = await ensureAuthToken()
  if (!token) throw new Error('Sign in to Dataverse to run the report.')
  const url = new URL(urlOverride || `${org()}/api/data/v9.2/${table}`)
  for (const [key, value] of Object.entries(parameters)) if (key.startsWith('$')) url.searchParams.set(key, String(value))
  const response = await fetch(url.href, { signal, credentials: 'include', headers: {
    Accept: 'application/json', Authorization: `Bearer ${token}`, 'OData-Version': '4.0', 'OData-MaxVersion': '4.0',
    Prefer: table.startsWith('EntityDefinitions') ? 'odata.include-annotations="*"' : 'odata.maxpagesize=1000,odata.include-annotations="OData.Community.Display.V1.FormattedValue"',
  } })
  if (!response.ok) throw new Error(`${table}: ${await response.text()}`)
  return response.json()
}
const rows = (payload: any): Array<Record<string, any>> => {
  const value = Array.isArray(payload) ? payload : payload?.value
  if (!Array.isArray(value)) throw new Error('Dataverse returned an invalid report/metadata response.')
  return value
}
async function schema(table: string, signal: AbortSignal): Promise<Schema> {
  const records = rows(await request('EntityDefinitions', { '$filter': `EntitySetName eq '${table}'`, '$select': 'LogicalName,PrimaryIdAttribute', '$expand': 'Attributes($select=LogicalName,AttributeType)' }, signal))
  if (records.length !== 1 || !/^[a-z][a-z\d_]*$/i.test(records[0].PrimaryIdAttribute || '') || !Array.isArray(records[0].Attributes)) throw new Error(`Could not verify the reporting schema for ${table}.`)
  return records[0] as Schema
}
function requireField(metadata: Schema, field: string, types: string[]): void {
  if (!/^[a-z][a-z\d_]*$/i.test(field) || !types.includes(metadata.Attributes.find((attribute) => attribute.LogicalName === field)?.AttributeType || '')) throw new Error(`${metadata.LogicalName}.${field} is missing or has the wrong type. Review the report's field mappings.`)
}
async function verifyLookup(metadata: Schema, field: string, target: string, signal: AbortSignal): Promise<void> {
  requireField(metadata, field, ['Lookup'])
  const attributes = rows(await request(`EntityDefinitions(LogicalName='${metadata.LogicalName}')/Attributes/Microsoft.Dynamics.CRM.LookupAttributeMetadata`, { '$select': 'LogicalName,Targets', '$filter': `LogicalName eq '${field}'` }, signal))
  if (attributes.length !== 1 || !attributes[0].Targets?.includes(target)) throw new Error(`${field} is not a verified lookup to ${target}. No report will be produced from guessed links.`)
}
async function choiceLabels(metadata: Schema, fields: string[], signal: AbortSignal): Promise<Map<string, Map<string, string>>> {
  for (const field of fields) requireField(metadata, field, ['Picklist'])
  const attributes = rows(await request(`EntityDefinitions(LogicalName='${metadata.LogicalName}')/Attributes/Microsoft.Dynamics.CRM.PicklistAttributeMetadata`, {
    '$select': 'LogicalName', '$filter': fields.map((field) => `LogicalName eq '${field}'`).join(' or '), '$expand': 'OptionSet,GlobalOptionSet',
  }, signal))
  const result = new Map<string, Map<string, string>>()
  for (const field of fields) {
    const attribute = attributes.find((entry) => entry.LogicalName === field)
    const options = attribute?.OptionSet?.Options || attribute?.GlobalOptionSet?.Options
    if (!Array.isArray(options)) throw new Error(`Unable to read verified choices for ${field}.`)
    result.set(field, new Map(options.map((option: any) => [String(option.Value), clean(option.Label?.LocalizedLabels?.find((label: any) => label.LanguageCode === 1033)?.Label || option.Label?.UserLocalizedLabel?.Label)])))
  }
  return result
}
async function records(table: string, metadata: Schema, fields: string[], filter: string, signal: AbortSignal, progress: (message: string) => void): Promise<Array<Record<string, unknown>>> {
  const activeFilter = reportArchiveFilter(metadata, table)
  const profile = table === TABLES.profile
  const exclusionFilter = profile ? profileReportExclusionFilter(metadata, table) : ''
  let read = 0
  const result = await readDataverseRecordPages(org(), table, {
    '$select': [...new Set([metadata.PrimaryIdAttribute, REPORT_ARCHIVE_COLUMN, ...(profile ? [PROFILE_REPORT_EXCLUSION_COLUMN] : []), ...fields])].join(','), '$orderby': `${metadata.PrimaryIdAttribute} asc`,
    '$filter': [filter, activeFilter, exclusionFilter].filter(Boolean).map((part) => `(${part})`).join(' and '),
  }, !local(), async (parameters, url) => {
    const payload = await request(table, parameters, signal, url)
    read += rows(payload).length
    progress(`${table}: ${read.toLocaleString()} records read (all pages).`)
    return payload
  })
  const unique = new Map<string, Record<string, unknown>>()
  for (const row of result) {
    const id = guid(row[metadata.PrimaryIdAttribute])
    if (!GUID.test(id)) throw new Error(`${table} returned a record without a valid row ID.`)
    if (unique.has(id)) throw new Error(`${table} returned a repeated row across pages; stopped instead of inflating report totals.`)
    unique.set(id, row)
  }
  return [...unique.values()].filter((row) => !reportRowIsArchived(row) && (!profile || !profileIsExcludedFromReports(row)))
}
export async function loadDesDvReportInput(start: string, end: string, rules: ReportRules, signal: AbortSignal, progress: (message: string) => void): Promise<ReportInput> {
  validateReportPeriod(start, end)
  progress('Verifying table, lookup and choice metadata…')
  const [enrollmentSchema, clientSchema, staySchema] = await Promise.all([schema(TABLES.enrollment, signal), schema(TABLES.profile, signal), schema(TABLES.stay, signal)])
  for (const field of ['cmps_servicestartdate', 'cmps_serviceenddate']) requireField(enrollmentSchema, field, ['DateTime'])
  for (const field of ['cmps_checkindate', 'cmps_checkoutdate']) requireField(staySchema, field, ['DateTime'])
  if (rules.ageSource === 'birthDate') requireField(clientSchema, 'cmps_dateofbirth', ['DateTime'])
  for (const metadata of [enrollmentSchema, clientSchema, staySchema]) requireField(metadata, 'cmps_recordid', ['String'])
  await Promise.all([verifyLookup(enrollmentSchema, 'cmps_clientid', clientSchema.LogicalName, signal), verifyLookup(staySchema, 'cmps_programenrollment', enrollmentSchema.LogicalName, signal)])
  const enrollmentChoices = ['cmps_program', 'cmps_enrollmentstatus', 'cmps_clienttype', ...(rules.tanfSource === 'enrollment' ? [rules.tanfField] : [])]
  const choices = await choiceLabels(enrollmentSchema, [...new Set(enrollmentChoices)], signal)
  const clientChoices = rules.tanfSource === 'client' ? await choiceLabels(clientSchema, [rules.tanfField], signal) : new Map<string, Map<string, string>>()
  const label = (row: Record<string, unknown>, field: string, labels = choices) => clean(labels.get(field)?.get(clean(row[field])) || row[`${field}@OData.Community.Display.V1.FormattedValue`] || row[field])
  const tanfChoices = (rules.tanfSource === 'client' ? clientChoices : choices).get(rules.tanfField)!
  for (const option of [rules.tanfYes, rules.tanfNo]) if (![...tanfChoices.values()].some((value) => value.toLowerCase() === option.trim().toLowerCase())) throw new Error(`TANF choice "${option}" is not in ${rules.tanfField}. Enter the actual choice label in Report Setup.`)
  const periodEnd = `${reportDate(reportDay(end)! + 1)}T00:00:00Z`, floor = `${reportingYearStart(start)}T00:00:00Z`
  const enrollmentRows = await records(TABLES.enrollment, enrollmentSchema, ['cmps_recordid', '_cmps_clientid_value', 'cmps_servicestartdate', 'cmps_serviceenddate', ...enrollmentChoices], `(cmps_servicestartdate lt ${periodEnd} or cmps_servicestartdate eq null) and (cmps_serviceenddate ge ${floor} or cmps_serviceenddate eq null or cmps_servicestartdate ge ${floor})`, signal, progress)
  const stayRows = await records(TABLES.stay, staySchema, ['cmps_recordid', '_cmps_programenrollment_value', 'cmps_checkindate', 'cmps_checkoutdate'], `(cmps_checkindate lt ${periodEnd} or cmps_checkindate eq null) and (cmps_checkoutdate gt ${start}T00:00:00Z or cmps_checkoutdate eq null)`, signal, progress)
  // Occupancy depends on bed dates, not parent service dates. Retrieve parents
  // outside the People Served history window without scanning the whole table.
  const knownParents = new Set(enrollmentRows.map((row) => guid(row[enrollmentSchema.PrimaryIdAttribute])))
  const missingParents = [...new Set(stayRows.map((row) => guid(row._cmps_programenrollment_value)).filter((id) => GUID.test(id) && !knownParents.has(id)))]
  for (let offset = 0; offset < missingParents.length; offset += 75) enrollmentRows.push(...await records(TABLES.enrollment, enrollmentSchema, ['cmps_recordid', '_cmps_clientid_value', 'cmps_servicestartdate', 'cmps_serviceenddate', ...enrollmentChoices], missingParents.slice(offset, offset + 75).map((id) => `${enrollmentSchema.PrimaryIdAttribute} eq ${id}`).join(' or '), signal, progress))
  const clientIds = [...new Set(enrollmentRows.map((row) => guid(row._cmps_clientid_value)).filter((id) => GUID.test(id)))]
  const clientRows: Array<Record<string, unknown>> = []
  const clientFields = ['cmps_recordid', 'cmps_name', 'cmps_lastname', ...(rules.ageSource === 'birthDate' ? ['cmps_dateofbirth'] : []), ...(rules.tanfSource === 'client' ? [rules.tanfField] : [])]
  for (const field of ['cmps_name', 'cmps_lastname']) requireField(clientSchema, field, ['String', 'Memo'])
  for (let offset = 0; offset < clientIds.length; offset += 75) clientRows.push(...await records(TABLES.profile, clientSchema, clientFields, clientIds.slice(offset, offset + 75).map((id) => `${clientSchema.PrimaryIdAttribute} eq ${id}`).join(' or '), signal, progress))
  const activeClientIds = new Set(clientRows.map((row) => guid(row[clientSchema.PrimaryIdAttribute])))
  const eligibleEnrollments = enrollmentRows.filter((row) => activeClientIds.has(guid(row._cmps_clientid_value)))
  const activeEnrollmentIds = new Set(eligibleEnrollments.map((row) => guid(row[enrollmentSchema.PrimaryIdAttribute])))
  const eligibleStays = stayRows.filter((row) => activeEnrollmentIds.has(guid(row._cmps_programenrollment_value)))
  return {
    clients: clientRows.map((row) => ({ id: guid(row[clientSchema.PrimaryIdAttribute]), recordId: clean(row.cmps_recordid), name: [row.cmps_name, row.cmps_lastname].filter(Boolean).join(' '), birthDate: clean(row.cmps_dateofbirth), tanf: rules.tanfSource === 'client' ? label(row, rules.tanfField, clientChoices) : '' })),
    enrollments: eligibleEnrollments.map((row) => ({ id: guid(row[enrollmentSchema.PrimaryIdAttribute]), recordId: clean(row.cmps_recordid), clientId: guid(row._cmps_clientid_value), program: label(row, 'cmps_program'), start: clean(row.cmps_servicestartdate), end: clean(row.cmps_serviceenddate), status: label(row, 'cmps_enrollmentstatus'), clientType: label(row, 'cmps_clienttype'), tanf: rules.tanfSource === 'enrollment' ? label(row, rules.tanfField) : '' })),
    stays: eligibleStays.map((row) => ({ id: guid(row[staySchema.PrimaryIdAttribute]), recordId: clean(row.cmps_recordid), enrollmentId: guid(row._cmps_programenrollment_value), start: clean(row.cmps_checkindate), end: clean(row.cmps_checkoutdate) })),
  }
}
