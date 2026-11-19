import { getClient } from '@microsoft/power-apps/data'
import { dataSourcesInfo } from '../../../.power/schemas/appschemas/dataSourcesInfo'
import { ensureAuthToken, getAuthToken } from '../auth'
import { readDataverseRecordPages } from '../dataverseRecordPages'
import { DEFAULT_REPORT_MAPPINGS, legacyDemographicLabel, legacyLabel, mappingField, type ReportMappings } from './reportMappings'
import type { ReportRow } from './reportTypes'
import { PROFILE_REPORT_EXCLUSION_COLUMN, REPORT_ARCHIVE_COLUMN, profileReportExclusionFilter, profileIsExcludedFromReports, reportArchiveFilter, reportRowIsArchived } from './reportEligibility'

export type ReportSchema = { LogicalName: string; PrimaryIdAttribute: string; Attributes: Array<{ LogicalName: string; AttributeType: string; AttributeTypeName?: { Value: string } }> }
export type ReportSnapshot = { tables: Record<string, ReportRow[]>; unavailable: Record<string, string>; unavailableFields?: Record<string, string>; displayIds: Record<string, string>; warnings: string[] }
export type ReportDateScope = { startField: string; endField?: string; from?: string; toExclusive: string }
const dataClient = getClient(dataSourcesInfo as any)
const organization = () => String(import.meta.env.VITE_DATAVERSE_ORG_URL || 'https://org1f466e4e.crm.dynamics.com').trim().replace(/\/+$/, '')
const local = () => typeof window !== 'undefined' && ['localhost', '127.0.0.1'].includes(window.location.hostname)
const cleanGuid = (value: unknown) => String(value || '').replace(/[{}]/g, '').trim().toLowerCase()
const GUID = /^[a-f\d]{8}-[a-f\d]{4}-[a-f\d]{4}-[a-f\d]{4}-[a-f\d]{12}$/i
const IDENTIFIER = /^[a-z][a-z\d_]*$/i
const payloadRows = (payload: any): ReportRow[] => { const rows = Array.isArray(payload) ? payload : payload?.value; if (!Array.isArray(rows)) throw new Error('Dataverse returned an invalid report page.'); return rows }
async function read(table: string, parameters: Record<string, unknown>, signal: AbortSignal, override = ''): Promise<any> {
  signal.throwIfAborted()
  const metadata = table.startsWith('EntityDefinitions'), prefer = metadata ? 'odata.include-annotations="*"' : 'odata.maxpagesize=1000,odata.include-annotations="OData.Community.Display.V1.FormattedValue"'
  if (!local()) {
    const token = getAuthToken(), response = await dataClient.executeAsync<any, any>({ connectorOperation: { tableName: 'commondataserviceforapps', operationName: parameters.next ? 'GetNextPageWithOrganization' : 'ListRecordsWithOrganization', parameters: { organization: organization(), entityName: table, accept: 'application/json', prefer, ...parameters, ...(token ? { token } : {}) } } } as any)
    signal.throwIfAborted()
    if (!response?.success) throw new Error(`${table}: ${typeof response?.error === 'string' ? response.error : response?.error?.message || 'Report read failed.'}`)
    return response.data
  }
  const token = await ensureAuthToken()
  if (!token) throw new Error('Dataverse sign-in is required.')
  const url = new URL(override || `${organization()}/api/data/v9.2/${table}`)
  for (const [key, value] of Object.entries(parameters)) if (key.startsWith('$')) url.searchParams.set(key, String(value))
  const response = await fetch(url.href, { signal, credentials: 'include', headers: { Accept: 'application/json', Authorization: `Bearer ${token}`, Prefer: prefer, 'OData-Version': '4.0', 'OData-MaxVersion': '4.0' } })
  if (!response.ok) throw new Error(`${table}: ${await response.text()}`)
  return response.json()
}
export async function readReportSchema(alias: string, signal: AbortSignal): Promise<ReportSchema> {
  if (!IDENTIFIER.test(alias)) throw new Error('Invalid reporting table alias.')
  const rows = payloadRows(await read('EntityDefinitions', { '$filter': `EntitySetName eq '${alias}'`, '$select': 'LogicalName,PrimaryIdAttribute', '$expand': 'Attributes($select=LogicalName,AttributeType,AttributeTypeName)' }, signal))
  const schema = rows[0] as unknown as ReportSchema
  if (rows.length !== 1 || !IDENTIFIER.test(schema.PrimaryIdAttribute || '') || !IDENTIFIER.test(schema.LogicalName || '') || !Array.isArray(schema.Attributes)) throw new Error(`Cannot verify schema for ${alias}.`)
  return schema
}
async function checkLookup(schema: ReportSchema, field: string, targetAlias: string, signal: AbortSignal): Promise<void> {
  if (!IDENTIFIER.test(field) || schema.Attributes.find((attribute) => attribute.LogicalName === field)?.AttributeType !== 'Lookup') throw new Error(`Unverified lookup ${field}.`)
  const target = await readReportSchema(targetAlias, signal)
  const rows = payloadRows(await read(`EntityDefinitions(LogicalName='${schema.LogicalName}')/Attributes/Microsoft.Dynamics.CRM.LookupAttributeMetadata`, { '$select': 'LogicalName,Targets', '$filter': `LogicalName eq '${field}'` }, signal))
  if (rows.length !== 1 || !(rows[0].Targets as string[])?.includes(target.LogicalName)) throw new Error(`${field} does not target ${targetAlias}.`)
}
async function choices(schema: ReportSchema, fields: string[], signal: AbortSignal): Promise<Record<string, Record<string, string>>> {
  const options: Record<string, Record<string, string>> = {}
  for (const [kind, columns] of [['Picklist', fields.filter((field) => schema.Attributes.find((attribute) => attribute.LogicalName === field)?.AttributeType === 'Picklist')], ['MultiSelectPicklist', fields.filter((field) => schema.Attributes.find((attribute) => attribute.LogicalName === field)?.AttributeTypeName?.Value === 'MultiSelectPicklistType')]] as const) {
    if (!columns.length) continue
    const metadata = payloadRows(await read(`EntityDefinitions(LogicalName='${schema.LogicalName}')/Attributes/Microsoft.Dynamics.CRM.${kind}AttributeMetadata`, { '$select': 'LogicalName', '$filter': columns.map((column) => `LogicalName eq '${column}'`).join(' or '), '$expand': 'OptionSet,GlobalOptionSet' }, signal))
    for (const attribute of metadata) {
      const entries = (attribute.OptionSet as any)?.Options || (attribute.GlobalOptionSet as any)?.Options
      if (!Array.isArray(entries)) continue
      options[String(attribute.LogicalName)] = Object.fromEntries(entries.map((entry) => [String(entry.Value), entry.Label?.LocalizedLabels?.find((label: any) => label.LanguageCode === 1033)?.Label || entry.Label?.UserLocalizedLabel?.Label || '']))
    }
  }
  return options
}
function mappedValue(row: ReportRow, field: string, schema: ReportSchema, labels: Record<string, Record<string, string>>): unknown {
  const attribute = schema.Attributes.find((column) => column.LogicalName === field)!
  const raw = attribute.AttributeType === 'Lookup' ? row[`_${field}_value`] : row[field]
  if (raw === null || raw === undefined || raw === '') return null
  const formatted = row[`${field}@OData.Community.Display.V1.FormattedValue`]
  if (attribute.AttributeType === 'Lookup') { if (!formatted && row[`_${field}_value`]) throw new Error(`Lookup ${field} has no display label; its GUID must not be interpreted as a funder name.`); return formatted ? legacyLabel(String(formatted)) : null }
  if (attribute.AttributeType === 'Picklist' || attribute.AttributeTypeName?.Value === 'MultiSelectPicklistType') {
    if (labels[field]) {
      const values = String(raw).split(',').map((value) => labels[field][value.trim()])
      if (values.some((value) => !value)) throw new Error(`Unrecognized backend choice value in ${field}.`)
      return legacyLabel(values.join('|'))
    }
    if (!formatted) throw new Error(`Choices for ${field} could not be decoded; no report from guessed labels.`)
    return legacyLabel(String(formatted).split(';').map((value) => value.trim()).join('|'))
  }
  if (attribute.AttributeType === 'Boolean') return raw ? 'Yes' : 'No'
  if (attribute.AttributeType === 'DateTime') { const value = String(raw).slice(0, 10); if (!/^\d{4}-\d{2}-\d{2}$/.test(value) || value.startsWith('0001')) throw new Error(`Invalid source date in ${field}.`); return value }
  return typeof raw === 'string' ? legacyLabel(raw) : raw
}
export async function loadReportSnapshot(required: Record<string, string[]>, mappings: ReportMappings, signal: AbortSignal, progress: (message: string) => void, dateScopes: Record<string, ReportDateScope> = {}, optionalFields: Record<string, string[]> = {}): Promise<ReportSnapshot> {
  const result: ReportSnapshot = { tables: {}, unavailable: {}, displayIds: {}, warnings: [] }, rawTables: Record<string, { rows: ReportRow[]; schema: ReportSchema }> = {}
  // These are relationship adapters, not actual legacy Dataverse tables.
  const names = Object.keys(required).filter((name) => !['documents', 'Links', 'HouseholdLinks', 'Ref_Dates', 'Ref_ShelterCapacity'].includes(name))
  if (names.some((name) => mappings[name]?.enrollmentLookup) && !names.includes('ProgramEnrollment')) names.unshift('ProgramEnrollment')
  if (names.some((name) => mappings[name]?.clientLookup) && !names.includes('Client_Profile')) names.unshift('Client_Profile')
  if (names.some((name) => mappings[name]?.householdLookup) && !names.includes('Household')) names.unshift('Household')
  const eligibleIds: Record<string, Set<string>> = {}
  const priority = (name: string) => name === 'Client_Profile' ? 0 : name === 'ProgramEnrollment' ? 1 : name === 'Household' ? 2 : 3
  for (const name of names.sort((a, b) => priority(a) - priority(b))) {
    signal.throwIfAborted()
    try {
      const mapping = mappings[name]
      if (!mapping) throw new Error(`No current table mapping for ${name}.`)
      for (const relationship of ['clientLookup', 'enrollmentLookup', 'householdLookup'] as const) {
        if (DEFAULT_REPORT_MAPPINGS[name]?.[relationship] && !mapping[relationship]) throw new Error(`${name}: ${relationship} is required for legacy joins. An empty mapping must not silently remove records from the report.`)
      }
      progress(`Verifying ${name} → ${mapping.alias}…`)
      const schema = await readReportSchema(mapping.alias, signal)
      const activeFilter = reportArchiveFilter(schema, mapping.alias)
      const exclusionFilter = name === 'Client_Profile' ? profileReportExclusionFilter(schema, mapping.alias) : ''
      const wanted = new Set(required[name] || (name === 'Client_Profile' ? ['document_id'] : ['RecordID', 'Program']))
      if (name === 'ProgramEnrollment') { wanted.add('RecordID'); wanted.add('Program') }
      const physical = new Set<string>(['cmps_recordid', REPORT_ARCHIVE_COLUMN])
      if (name === 'Client_Profile') physical.add(PROFILE_REPORT_EXCLUSION_COLUMN)
      for (const legacy of wanted) {
        const field = mappingField(mapping, legacy)
        if (!field) throw new Error(`Map legacy column ${name}.${legacy} in Report Mapping Setup.`)
        if (['recordid', 'document_id'].includes(legacy.toLowerCase()) && field !== '$id') throw new Error(`${name}.${legacy} must use $id for GUID-safe relationships, not display text. App Record IDs are shown separately.`)
        if (!field.startsWith('$')) physical.add(field)
        else if (field === '$hours') physical.add('cmps_minutes')
        else if (field === '$funder') {
          physical.add('cmps_funder1')
          if (schema.Attributes.some((attribute) => attribute.LogicalName === 'cmps_funder' && attribute.AttributeType === 'Picklist')) physical.add('cmps_funder')
        }
        else if (!['$id', '$enrollmentLabel'].includes(field)) throw new Error(`Unknown derived reporting field ${field}.`)
      }
      for (const field of physical) if (!IDENTIFIER.test(field) || !schema.Attributes.some((attribute) => attribute.LogicalName === field)) throw new Error(`${name}.${field} is not in current metadata. Correct its mapping before using this section.`)
      if (mapping.clientLookup) await checkLookup(schema, mapping.clientLookup, mappings.Client_Profile.alias, signal)
      if (mapping.enrollmentLookup) await checkLookup(schema, mapping.enrollmentLookup, mappings.ProgramEnrollment.alias, signal)
      if (mapping.householdLookup) await checkLookup(schema, mapping.householdLookup, mappings.Household.alias, signal)
      for (const parent of [mapping.clientLookup ? 'Client_Profile' : '', mapping.enrollmentLookup ? 'ProgramEnrollment' : '', mapping.householdLookup ? 'Household' : ''].filter(Boolean)) if (result.unavailable[parent]) throw new Error(`Cannot verify linked ${parent} report eligibility: ${result.unavailable[parent]}`)
      const labels = await choices(schema, [...physical], signal)
      // Supplemental native-report fields must not disable the established
      // cohort when an optional column is absent or cannot be decoded.
      const optional = new Set<string>()
      for (const legacy of optionalFields[name] || []) {
        if (wanted.has(legacy)) continue
        try {
          const field = mappingField(mapping, legacy)
          if (!IDENTIFIER.test(field) || !schema.Attributes.some((attribute) => attribute.LogicalName === field)) throw new Error(`${name}.${legacy}: mapped column ${field || '(not mapped)'} is not in current metadata.`)
          Object.assign(labels, await choices(schema, [field], signal))
          physical.add(field); wanted.add(legacy); optional.add(legacy)
        } catch (error) {
          signal.throwIfAborted()
          ;(result.unavailableFields ||= {})[`${name}.${legacy}`] = String((error as Error)?.message || error)
        }
      }
      const selects = [...physical].map((field) => schema.Attributes.find((attribute) => attribute.LogicalName === field)?.AttributeType === 'Lookup' ? `_${field}_value` : field)
      if (mapping.clientLookup) selects.push(`_${mapping.clientLookup}_value`)
      if (mapping.enrollmentLookup) selects.push(`_${mapping.enrollmentLookup}_value`)
      if (mapping.householdLookup) selects.push(`_${mapping.householdLookup}_value`)
      const filters = [activeFilter, exclusionFilter].filter(Boolean)
      const scope = dateScopes[name]
      if (scope) {
        const start = mappingField(mapping, scope.startField), end = scope.endField ? mappingField(mapping, scope.endField) : ''
        for (const field of [start, ...(scope.endField ? [end] : [])]) if (!IDENTIFIER.test(field) || schema.Attributes.find((attribute) => attribute.LogicalName === field)?.AttributeType !== 'DateTime') throw new Error(`${name}: native report date scope is not mapped to a verified DateTime column.`)
        for (const value of [scope.toExclusive, ...(scope.from ? [scope.from] : [])]) if (!/^\d{4}-\d{2}-\d{2}$/.test(value)) throw new Error('Invalid native report date scope.')
        filters.push(`(${start} eq null or ${start} lt ${scope.toExclusive}T00:00:00Z)`)
        if (scope.from) filters.push(end ? `(${end} eq null or ${end} ge ${scope.from}T00:00:00Z)` : `(${start} eq null or ${start} ge ${scope.from}T00:00:00Z)`)
      }
      let count = 0
      const records = await readDataverseRecordPages(organization(), mapping.alias, { '$select': [...new Set([schema.PrimaryIdAttribute, ...selects])].join(','), '$orderby': `${schema.PrimaryIdAttribute} asc`, ...(filters.length ? { '$filter': filters.join(' and ') } : {}) }, !local(), async (parameters, url) => { const page = await read(mapping.alias, parameters, signal, url); count += payloadRows(page).length; progress(`${name}: ${count.toLocaleString()} records read…`); return page })
      const seen = new Set<string>()
      for (const row of records) { const id = cleanGuid(row[schema.PrimaryIdAttribute]); if (!GUID.test(id) || seen.has(id)) throw new Error(`${name} returned an invalid or repeated row; stopped instead of changing report counts.`); seen.add(id) }
      let archived = 0, excludedParent = 0, excludedProfile = 0
      const eligible = records.filter((row) => {
        if (reportRowIsArchived(row)) { archived++; return false }
        if (name === 'Client_Profile' && profileIsExcludedFromReports(row)) { excludedProfile++; return false }
        const profile = mapping.clientLookup ? cleanGuid(row[`_${mapping.clientLookup}_value`]) : '', enrollment = mapping.enrollmentLookup ? cleanGuid(row[`_${mapping.enrollmentLookup}_value`]) : ''
        const household = mapping.householdLookup ? cleanGuid(row[`_${mapping.householdLookup}_value`]) : ''
        if ((name === 'ProgramEnrollment' && !GUID.test(profile)) || (profile && (!GUID.test(profile) || !eligibleIds.Client_Profile?.has(profile))) || (enrollment && (!GUID.test(enrollment) || !eligibleIds.ProgramEnrollment?.has(enrollment))) || (household && (!GUID.test(household) || !eligibleIds.Household?.has(household)))) { excludedParent++; return false }
        return true
      })
      const parents = new Map((result.tables.ProgramEnrollment || []).map((row) => [row.RecordID, row]))
      const output: ReportRow[] = []
      let funderFallbacks = 0
      for (const raw of eligible) {
        const row: ReportRow = {}
        for (const legacy of wanted) {
          const field = mappingField(mapping, legacy)
          if (field === '$id') row[legacy] = cleanGuid(raw[schema.PrimaryIdAttribute])
          else if (field === '$hours') row[legacy] = raw.cmps_minutes === null || raw.cmps_minutes === undefined ? null : Number(raw.cmps_minutes) / 60
          else if (field === '$funder') {
            row[legacy] = raw._cmps_funder1_value ? mappedValue(raw, 'cmps_funder1', schema, labels) : physical.has('cmps_funder') ? mappedValue(raw, 'cmps_funder', schema, labels) : null
            if (!raw._cmps_funder1_value && row[legacy]) funderFallbacks++
          }
          else if (field === '$enrollmentLabel') { const parent = parents.get(cleanGuid(raw[`_${mapping.enrollmentLookup}_value`])); row[legacy] = parent?.Program ? `${parent.Program} | ${result.displayIds[String(parent.RecordID)]}` : null }
          else {
            try { row[legacy] = legacyDemographicLabel(name, legacy, mappedValue(raw, field, schema, labels)) }
            catch (error) {
              if (!optional.has(legacy)) throw error
              ;(result.unavailableFields ||= {})[`${name}.${legacy}`] = String((error as Error)?.message || error)
              row[legacy] = null
            }
          }
        }
        output.push(row)
      }
      result.tables[name] = output
      rawTables[name] = { rows: eligible, schema }
      eligibleIds[name] = new Set(eligible.map((row) => cleanGuid(row[schema.PrimaryIdAttribute])))
      for (const row of eligible) result.displayIds[cleanGuid(row[schema.PrimaryIdAttribute])] = String(row.cmps_recordid || row[schema.PrimaryIdAttribute])
      if (archived) result.warnings.push(`${name}: ${archived.toLocaleString()} archived records excluded defensively from returned pages.`)
      if (excludedProfile) result.warnings.push(`Client Profile: ${excludedProfile.toLocaleString()} records marked Exclude from reports = Yes removed, along with their linked records.`)
      if (excludedParent) result.warnings.push(`${name}: ${excludedParent.toLocaleString()} records excluded because a linked Client Profile or Program Enrollment is archived, missing or ineligible. They are not treated as anonymous/unlinked records.`)
      if (funderFallbacks) result.warnings.push(`${name}: ${funderFallbacks.toLocaleString()} verified legacy funder choices used because the new funder lookup is empty. No funder records were changed.`)
    } catch (error) { signal.throwIfAborted(); result.unavailable[name] = String((error as Error)?.message || error) }
  }
  const documents: ReportRow[] = [], links: ReportRow[] = [], householdLinks: ReportRow[] = []
  for (const [name, table] of Object.entries(rawTables)) {
    const mapping = mappings[name]
    let missing = 0
    for (const row of table.rows) {
      const id = cleanGuid(row[table.schema.PrimaryIdAttribute]), parent = cleanGuid(row[`_${mapping.clientLookup}_value`]), enrollment = cleanGuid(row[`_${mapping.enrollmentLookup}_value`])
      if (mapping.clientLookup && GUID.test(parent)) documents.push({ RecordId: id, ParentId: parent })
      if (mapping.enrollmentLookup && GUID.test(enrollment)) links.push({ LinkFromId: id, LinkToId: enrollment })
      if (mapping.householdLookup) householdLinks.push({ RecordId: id, ClientId: parent, HouseholdId: cleanGuid(row[`_${mapping.householdLookup}_value`]) })
      if ((mapping.clientLookup && !parent && name === 'ProgramEnrollment') || (mapping.enrollmentLookup && !enrollment)) missing++
    }
    if (missing) result.warnings.push(`${name}: ${missing.toLocaleString()} records lack the parent linkage needed by legacy report joins. They are not assigned to a guessed enrollment/program.`)
  }
  result.tables.documents = documents; result.tables.Links = links
  if (names.some((name) => mappings[name]?.householdLookup)) result.tables.HouseholdLinks = householdLinks
  result.unavailable.Ref_Dates = 'Fiscal/month/quarter reference rows are deferred. This section is unavailable, not a zero count.'
  result.unavailable.Ref_ShelterCapacity = 'Budget/capacity reference rows are deferred. No utilization or budget totals are guessed.'
  return result
}
