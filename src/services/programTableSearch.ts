import { getClient } from '@microsoft/power-apps/data'
import { dataSourcesInfo } from '../../.power/schemas/appschemas/dataSourcesInfo'
import { ensureAuthToken, getAuthToken } from './auth'
import { ARCHIVE_TABLES } from './archive'
import { normalizeSearchName, programSearchGrants, programSearchLabels, type ProgramSearchField, type ProgramSearchGrant, type ProgramSearchHub } from './programSearchCatalog'
import type { RolePermissionProfile } from './rolePermissions'
import { advancedFieldsFromMetadata, advancedSearchFetchXml, type AdvancedSearchCriterion } from './advancedSearch'
import { recordAttachmentFields, recordAttachments, type RecordAttachment } from './recordAttachments'

type Attribute = { LogicalName: string; AttributeType: string; AttributeTypeName?: { Value?: string }; IsValidForRead?: boolean; DisplayName?: { UserLocalizedLabel?: { Label?: string } } }
type Relationship = { ReferencingAttribute: string; ReferencedEntity: string }
export type ProgramSearchMetadata = {
  LogicalName: string; EntitySetName: string; PrimaryIdAttribute: string; PrimaryNameAttribute?: string
  Attributes: Attribute[]; ManyToOneRelationships: Relationship[]
}
export type ProgramSearchCursor = { page: number; cookie: string; fingerprint: string }
export type ProgramSearchRow = { id: string; recordId: string; title: string; modifiedOn: string; attachments?: RecordAttachment[] }
export type ProgramSearchPage = { rows: ProgramSearchRow[]; next: ProgramSearchCursor | null }
export type ProgramSearchPlan = { hubId: string; grant: ProgramSearchGrant; metadata: ProgramSearchMetadata; links: string; scope: string; fields: ProgramSearchField[] }
export type ProgramSearchContext = { profiles: RolePermissionProfile[]; hub: ProgramSearchHub }
export interface ProgramSearchGateway {
  metadata(key: string, signal: AbortSignal): Promise<ProgramSearchMetadata>
  choices(metadata: ProgramSearchMetadata, field: string, signal: AbortSignal): Promise<Array<{ value: number; label: string }>>
  query(metadata: ProgramSearchMetadata, fetchXml: string, signal: AbortSignal): Promise<any>
}
const GUID = /^[a-f\d]{8}(?:-[a-f\d]{4}){3}-[a-f\d]{12}$/i
const NAME = /^[a-z][a-z\d_]*$/i
const client = getClient(dataSourcesInfo as any)
const text = (value: unknown) => String(value ?? '').trim()
const guid = (value: unknown) => text(value).replace(/[{}]/g, '').toLowerCase()
export const xmlEscape = (value: unknown) => text(value).replace(/&/g, '&amp;').replace(/</g, '&lt;').replace(/>/g, '&gt;').replace(/"/g, '&quot;').replace(/'/g, '&apos;')
const name = (value: string) => { if (!NAME.test(value)) throw new Error('Invalid Dataverse metadata identifier.'); return value }
const archiveFilter = (alias = '') => `<filter type="or"><condition ${alias ? `entityname="${name(alias)}" ` : ''}attribute="cmps_isarchived" operator="ne" value="125570000"/><condition ${alias ? `entityname="${name(alias)}" ` : ''}attribute="cmps_isarchived" operator="null"/></filter>`

export function createProgramSearchGateway(): ProgramSearchGateway {
  // Structural metadata only: permissions, scope, and record queries are rebuilt every time.
  const metadataCache = new Map<string, { expires: number; value: ProgramSearchMetadata }>()
  const choicesCache = new Map<string, { expires: number; value: Array<{ value: number; label: string }> }>()
  const metadataLifetime = 60_000
  const organization = String(import.meta.env.VITE_DATAVERSE_ORG_URL || 'https://org1f466e4e.crm.dynamics.com').trim().replace(/\/$/, '')
  const local = typeof window !== 'undefined' && ['localhost', '127.0.0.1'].includes(window.location.hostname)
  const request = async (entityName: string, parameters: Record<string, unknown>, signal: AbortSignal): Promise<any> => {
    signal.throwIfAborted()
    let payload: any
    if (local) {
      const token = await ensureAuthToken()
      signal.throwIfAborted()
      if (!token) throw new Error('Dataverse authentication is required to search records.')
      const query = new URLSearchParams(Object.entries(parameters).map(([key, value]) => [key, String(value)]))
      const response = await fetch(`${organization}/api/data/v9.2/${entityName}?${query}`, { signal, credentials: 'include',
        headers: { Accept: 'application/json', Authorization: `Bearer ${token}`, 'OData-Version': '4.0', 'OData-MaxVersion': '4.0', Prefer: 'odata.include-annotations="*"' },
      })
      if (!response.ok) throw new Error(await response.text())
      payload = await response.json()
    } else {
      const token = getAuthToken()
      const result = await client.executeAsync<any, any>({ connectorOperation: {
        tableName: 'commondataserviceforapps', operationName: 'ListRecordsWithOrganization',
        parameters: { organization, entityName, ...parameters, accept: 'application/json', prefer: 'odata.include-annotations="*"', ...(token ? { token } : {}) },
      } } as any)
      if (!result?.success) throw new Error(String(result?.error?.message || result?.error || 'Unable to search Dataverse records.'))
      payload = result.data
    }
    signal.throwIfAborted()
    return payload
  }
  return {
    async metadata(key, signal) {
      signal.throwIfAborted()
      const cached = metadataCache.get(key)
      if (cached && cached.expires > Date.now()) return cached.value
      const table = ARCHIVE_TABLES.find((entry) => entry.key === key)
      if (!table) throw new Error('This table has not been implemented in COMPASS.')
      const payload = await request('EntityDefinitions', { '$filter': `EntitySetName eq '${table.tableAlias}'${table.primaryIdField ? ` or PrimaryIdAttribute eq '${table.primaryIdField}'` : ''}`,
        '$select': 'LogicalName,EntitySetName,PrimaryIdAttribute,PrimaryNameAttribute',
        '$expand': 'Attributes($select=LogicalName,AttributeType,AttributeTypeName,IsValidForRead,DisplayName),ManyToOneRelationships($select=ReferencingAttribute,ReferencedEntity)',
      }, signal)
      const rows = Array.isArray(payload) ? payload : payload?.value
      if (!Array.isArray(rows) || rows.length !== 1) throw new Error(`Cannot uniquely resolve the ${table.label} table metadata.`)
      const metadata = rows[0] as ProgramSearchMetadata
      name(metadata.LogicalName); name(metadata.EntitySetName); name(metadata.PrimaryIdAttribute)
      if (!Array.isArray(metadata.Attributes) || !Array.isArray(metadata.ManyToOneRelationships)) throw new Error('Incomplete table metadata.')
      metadataCache.set(key, { expires: Date.now() + metadataLifetime, value: metadata })
      return metadata
    },
    async choices(metadata, field, signal) {
      signal.throwIfAborted()
      const key = `${metadata.LogicalName}:${field}`
      const cached = choicesCache.get(key)
      if (cached && cached.expires > Date.now()) return cached.value
      const attribute = metadata.Attributes.find((entry) => entry.LogicalName === field)
      const type = attribute?.AttributeTypeName?.Value === 'MultiSelectPicklistType' ? 'MultiSelectPicklist'
        : attribute?.AttributeType === 'State' ? 'State' : attribute?.AttributeType === 'Status' ? 'Status' : 'Picklist'
      const payload = await request(`EntityDefinitions(LogicalName='${name(metadata.LogicalName)}')/Attributes(LogicalName='${name(field)}')/Microsoft.Dynamics.CRM.${type}AttributeMetadata`, { '$select': 'LogicalName', '$expand': 'OptionSet' }, signal)
      if (!Array.isArray(payload?.OptionSet?.Options)) throw new Error('Cannot verify the choice mappings for this field.')
      const value = payload.OptionSet.Options.map((option: any) => ({ value: Number(option.Value), label: text(option.Label?.UserLocalizedLabel?.Label || option.Label?.LocalizedLabels?.[0]?.Label) }))
      choicesCache.set(key, { expires: Date.now() + metadataLifetime, value })
      return value
    },
    async query(metadata, fetchXml, signal) { return request(metadata.EntitySetName, { fetchXml }, signal) },
  }
}

function requiredGrant(context: ProgramSearchContext, key: string, view = false): ProgramSearchGrant {
  const grant = programSearchGrants(context.profiles, context.hub).find((entry) => entry.table.key === key)
  if (!grant || view && !grant.view) throw new Error(view ? 'Your assigned role does not allow viewing this form.' : 'Your assigned role does not allow searching this table in this program.')
  return grant
}

// Build verified, server-side joins rather than reading every table and
// filtering client data in the browser. All joins are outer and distinct so
// either a direct-client legacy link OR an enrollment link can qualify.
export async function inspectProgramSearch(context: ProgramSearchContext, key: string, fields: ReadonlyArray<ProgramSearchField>, gateway: ProgramSearchGateway, signal: AbortSignal): Promise<ProgramSearchPlan> {
  const grant = requiredGrant(context, key)
  const cache = new Map<string, Promise<ProgramSearchMetadata>>()
  const metadataFor = (tableKey: string) => {
    if (!cache.has(tableKey)) cache.set(tableKey, gateway.metadata(tableKey, signal))
    return cache.get(tableKey)!
  }
  const [source, enrollment, profile] = grant.ignoreProgramAssignment
    ? [await metadataFor(key), undefined, undefined]
    : await Promise.all([metadataFor(key), metadataFor('program-enrollment'), metadataFor('client-profile')])
  const readable = (field: string) => source.Attributes.some((attribute) => attribute.LogicalName === field && attribute.IsValidForRead !== false && (!['File', 'Image', 'Virtual', 'PartyList'].includes(attribute.AttributeType) || attribute.AttributeTypeName?.Value === 'MultiSelectPicklistType'))
  const selectedFields = fields.map((field) => key === 'program-enrollment' && field.field === 'cmps_funder'
    ? { ...field, field: 'cmps_funder1' } : field)
    .filter((field, index, list) => readable(field.field) && list.findIndex((entry) => entry.field === field.field) === index)
  if (grant.ignoreProgramAssignment) return { hubId: context.hub.id, grant, metadata: source, links: '', scope: '', fields: selectedFields }
  if (!enrollment || !profile) throw new Error('Incomplete program scope metadata.')
  const targets = new Set(programSearchLabels(context.hub).map(normalizeSearchName))
  let aliasNumber = 0
  let joinCount = 0
  const conditions: string[] = []
  const lookupFields: Record<string, string[]> = {
    'client-profile': ['cmps_cpid', 'cmps_clientid'],
    'program-enrollment': ['cmps_peid', 'cmps_programenrollment'],
    funder: ['cmps_funder'], 'funder-contract': ['cmps_activecontract'], household: ['cmps_householdid'],
  }
  const verifiedLookup = (metadata: ProgramSearchMetadata, relationship: Relationship, parentKey: string) =>
    lookupFields[parentKey]?.includes(relationship.ReferencingAttribute) && metadata.Attributes.some((attribute) => attribute.LogicalName === relationship.ReferencingAttribute && attribute.AttributeType === 'Lookup')
  const programConditions = async (metadata: ProgramSearchMetadata, alias: string): Promise<boolean> => {
    const attribute = metadata.Attributes.find((entry) => entry.LogicalName === 'cmps_program' && entry.IsValidForRead !== false)
    if (!attribute) return false
    const qualifier = alias ? `entityname="${name(alias)}" ` : ''
    const program = ['String', 'Memo'].includes(attribute.AttributeType)
      ? programSearchLabels(context.hub).map((label) => `<condition ${qualifier}attribute="cmps_program" operator="eq" value="${xmlEscape(label)}"/>`)
      : attribute.AttributeType === 'Picklist' ? (await gateway.choices(metadata, 'cmps_program', signal)).filter((option) => targets.has(normalizeSearchName(option.label)) && Number.isSafeInteger(option.value)).map((option) => `<condition ${qualifier}attribute="cmps_program" operator="eq" value="${option.value}"/>`) : []
    if (!program.length) return false
    const archive = metadata.Attributes.some((entry) => entry.LogicalName === 'cmps_isarchived') ? archiveFilter(alias) : ''
    conditions.push(`<filter type="and">${archive}<filter type="or">${program.join('')}</filter></filter>`)
    return true
  }
  const wrapLink = (parent: ProgramSearchMetadata, from: string, to: string, alias: string, inner: string) => {
    if (++joinCount > 12) throw new Error('Too many program links to search this table safely.')
    return `<link-entity name="${name(parent.LogicalName)}" from="${name(from)}" to="${name(to)}" alias="${name(alias)}" link-type="outer">${inner}</link-entity>`
  }
  const build = async (metadata: ProgramSearchMetadata, alias: string, visited: string[], depth: number): Promise<string> => {
    // Prefer a record's own explicit program rather than another program on
    // the same client. Enrollment-only forms use their enrolled program.
    if (metadata.Attributes.some((attribute) => attribute.LogicalName === 'cmps_program' && attribute.IsValidForRead !== false)) { await programConditions(metadata, alias); return '' }
    if (depth > 3) return ''
    let links = ''
    if (metadata.LogicalName === profile.LogicalName) {
      const relationships = enrollment.ManyToOneRelationships.filter((entry) => entry.ReferencedEntity === profile.LogicalName && verifiedLookup(enrollment, entry, 'client-profile'))
      for (const relationship of relationships) {
        const childAlias = `p${++aliasNumber}`
        if (await programConditions(enrollment, childAlias)) links += wrapLink(enrollment, relationship.ReferencingAttribute, profile.PrimaryIdAttribute, childAlias, '')
      }
      return links
    }
    const recognized = new Map([[profile.LogicalName, 'client-profile'], [enrollment.LogicalName, 'program-enrollment']])
    if (key === 'funder-contract' || key === 'funder-transaction') {
      const funder = await metadataFor('funder'); recognized.set(funder.LogicalName, 'funder')
      if (key === 'funder-transaction') { const contract = await metadataFor('funder-contract'); recognized.set(contract.LogicalName, 'funder-contract') }
    }
    for (const relationship of metadata.ManyToOneRelationships) {
      const parentKey = recognized.get(relationship.ReferencedEntity)
      if (!parentKey || visited.includes(relationship.ReferencedEntity) || !verifiedLookup(metadata, relationship, parentKey)) continue
      const parent = await metadataFor(parentKey)
      const parentAlias = `p${++aliasNumber}`
      const before = conditions.length
      const childLinks = await build(parent, parentAlias, [...visited, parent.LogicalName], depth + 1)
      if (parent.Attributes.some((entry) => entry.LogicalName === 'cmps_isarchived')) {
        for (let index = before; index < conditions.length; index += 1) conditions[index] = `<filter type="and">${archiveFilter(parentAlias)}${conditions[index]}</filter>`
      }
      if (parentKey === 'client-profile') {
        const enrollmentLookups = metadata.ManyToOneRelationships.filter((entry) => entry.ReferencedEntity === enrollment.LogicalName && verifiedLookup(metadata, entry, 'program-enrollment'))
        const qualifier = alias ? `entityname="${name(alias)}" ` : ''
        const missingEnrollment = enrollmentLookups.map((entry) => `<condition ${qualifier}attribute="${name(entry.ReferencingAttribute)}" operator="null"/>`).join('')
        if (missingEnrollment) for (let index = before; index < conditions.length; index += 1) conditions[index] = `<filter type="and">${missingEnrollment}${conditions[index]}</filter>`
      }
      if (conditions.length > before) links += wrapLink(parent, parent.PrimaryIdAttribute, relationship.ReferencingAttribute, parentAlias, childLinks)
    }
    if (key === 'household' && depth === 0) {
      const history = await metadataFor('household-history')
      for (const relationship of history.ManyToOneRelationships.filter((entry) => entry.ReferencedEntity === source.LogicalName && verifiedLookup(history, entry, 'household'))) {
        const historyAlias = `p${++aliasNumber}`
        const before = conditions.length
        const childLinks = await build(history, historyAlias, [source.LogicalName, history.LogicalName], depth + 1)
        if (history.Attributes.some((entry) => entry.LogicalName === 'cmps_isarchived')) {
          for (let index = before; index < conditions.length; index += 1) conditions[index] = `<filter type="and">${archiveFilter(historyAlias)}${conditions[index]}</filter>`
        }
        if (conditions.length > before) links += wrapLink(history, relationship.ReferencingAttribute, source.PrimaryIdAttribute, historyAlias, childLinks)
      }
    }
    return links
  }
  const links = await build(source, '', [source.LogicalName], 0)
  if (!conditions.length) throw new Error('No verified program association is available for this table and hub. Search was not broadened to other programs. IT Admin can review the role\'s Ignore Program setting.')
  return { hubId: context.hub.id, grant, metadata: source, links, scope: `<filter type="or">${conditions.join('')}</filter>`, fields: selectedFields }
}

function assertPlan(context: ProgramSearchContext, plan: ProgramSearchPlan, view = false): void {
  const grant = requiredGrant(context, plan.grant.table.key, view)
  if (context.hub.id !== plan.hubId) throw new Error('The selected program changed; start a fresh search.')
  if (grant.ignoreProgramAssignment !== plan.grant.ignoreProgramAssignment) throw new Error('Role permissions changed; start a fresh search.')
}
function fingerprint(context: ProgramSearchContext, plan: ProgramSearchPlan, query: string, criteria: AdvancedSearchCriterion[]): string {
  return JSON.stringify([context.hub.id, plan.grant.table.key, plan.metadata.EntitySetName, plan.scope, plan.links, plan.grant.ignoreProgramAssignment, query, criteria])
}
function fetchXml(plan: ProgramSearchPlan, columns: string[], filter: string, page = 1, cookie = '', count = 50): string {
  const archived = plan.metadata.Attributes.some((entry) => entry.LogicalName === 'cmps_isarchived') ? archiveFilter() : ''
  return `<fetch distinct="true" count="${count}" page="${page}"${cookie ? ` paging-cookie="${xmlEscape(cookie)}"` : ''}><entity name="${name(plan.metadata.LogicalName)}">${[...new Set([plan.metadata.PrimaryIdAttribute, ...columns])].map((column) => `<attribute name="${name(column)}"/>`).join('')}<order attribute="${name(plan.metadata.PrimaryIdAttribute)}"/><filter type="and">${archived}${plan.scope}${filter}</filter>${plan.links}</entity></fetch>`
}
export function decodeProgramSearchCookie(value: unknown): string {
  const raw = text(value)
  const encoded = raw.match(/\bpagingcookie\s*=\s*(["'])(.*?)\1/i)?.[2]
  if (!encoded) throw new Error('Missing or invalid search paging cookie. Search stopped rather than skipping records.')
  let cookie: string
  try { cookie = decodeURIComponent(decodeURIComponent(encoded)) } catch { throw new Error('Invalid search paging cookie encoding.') }
  if (!/^<cookie\b[\s\S]*<\/cookie>$/.test(cookie) || /<!DOCTYPE|<!ENTITY/i.test(cookie)) throw new Error('Invalid search paging cookie contents.')
  return cookie
}
function recordValue(row: Record<string, unknown>, metadata: ProgramSearchMetadata, field: string): string {
  const attribute = metadata.Attributes.find((entry) => entry.LogicalName === field)
  const column = attribute?.AttributeType === 'Lookup' ? `_${field}_value` : field
  const value = text(row[`${column}@OData.Community.Display.V1.FormattedValue`] ?? row[column])
  return ['cmps_program', 'cmps_assignedprograms', 'cmps_wheredidyourefer'].includes(field) ? value.replace(/\bCAAFA Outreach\b/gi, 'DV Outreach') : value
}
export async function searchProgramTable(context: ProgramSearchContext, plan: ProgramSearchPlan, query: string, gateway: ProgramSearchGateway, signal: AbortSignal, cursor?: ProgramSearchCursor, criteria: AdvancedSearchCriterion[] = []): Promise<ProgramSearchPage> {
  assertPlan(context, plan)
  const cleanQuery = query.trim()
  if (cleanQuery.length > 250) throw new Error('Search text must be 250 characters or fewer.')
  const advanced = advancedSearchFetchXml(criteria, advancedFieldsFromMetadata(plan.metadata, plan.fields, plan.grant.table.key))
  const identity = fingerprint(context, plan, cleanQuery, criteria)
  if (cursor && (cursor.fingerprint !== identity || !Number.isSafeInteger(cursor.page) || cursor.page < 2 || !cursor.cookie)) throw new Error('This page does not match the selected table, program, permissions, and query.')
  const searchColumns = plan.metadata.Attributes.filter((attribute) => attribute.LogicalName.startsWith('cmps_') && ['String', 'Memo'].includes(attribute.AttributeType) && attribute.IsValidForRead !== false).map((attribute) => attribute.LogicalName)
  if (searchColumns.length > 400) throw new Error('This table has too many text columns for a safe search query.')
  const escapedQuery = xmlEscape(cleanQuery.replace(/\[/g, '[[]').replace(/%/g, '[%]').replace(/_/g, '[_]'))
  const conditions = GUID.test(guid(cleanQuery))
    ? [`<condition attribute="${name(plan.metadata.PrimaryIdAttribute)}" operator="eq" value="${guid(cleanQuery)}"/>`]
    : /^[a-z][a-z0-9]*-\d{3,}$/i.test(cleanQuery) && searchColumns.includes('cmps_recordid')
      ? [`<condition attribute="cmps_recordid" operator="begins-with" value="${xmlEscape(cleanQuery)}"/>`]
      : cleanQuery ? searchColumns.map((column) => `<condition attribute="${name(column)}" operator="like" value="%${escapedQuery}%"/>`) : []
  // Client names are stored separately. Require every name part on this same
  // profile, rather than accepting records that match only John OR Smith.
  const nameParts = cleanQuery.split(/\s+/).filter(Boolean)
  const nameColumns = ['cmps_name', 'cmps_middlename', 'cmps_lastname'].filter((column) => searchColumns.includes(column))
  if (plan.grant.table.key === 'client-profile' && nameParts.length > 1
    && nameColumns.includes('cmps_name') && nameColumns.includes('cmps_lastname')) {
    conditions.push(`<filter type="and">${nameParts.map((part) => {
      const escapedPart = xmlEscape(part.replace(/\[/g, '[[]').replace(/%/g, '[%]').replace(/_/g, '[_]'))
      return `<filter type="or">${nameColumns.map((column) => `<condition attribute="${name(column)}" operator="like" value="%${escapedPart}%"/>`).join('')}</filter>`
    }).join('')}</filter>`)
  }
  if (cleanQuery && !conditions.length) throw new Error('This table has no searchable text columns. Search by its Dataverse row ID.')
  const textFilter = conditions.length ? `<filter type="or">${conditions.join('')}</filter>` : ''
  const filter = advanced ? `<filter type="and">${textFilter}${advanced}</filter>` : textFilter
  const available = new Set(plan.metadata.Attributes.filter((attribute) => attribute.IsValidForRead !== false).map((attribute) => attribute.LogicalName))
  const attachmentFields = requiredGrant(context, plan.grant.table.key).view ? recordAttachmentFields(plan.grant.table.key).filter(({ field }) => available.has(field) && plan.metadata.Attributes.some((entry) => entry.LogicalName === field && entry.AttributeType === 'Lookup')) : []
  const columns = ['cmps_recordid', plan.metadata.PrimaryNameAttribute || '', ...(plan.grant.table.displayFields || []), 'modifiedon', 'createdon', 'cmps_isarchived', ...attachmentFields.map(({ field }) => field)].filter((field) => available.has(field))
  const payload = await gateway.query(plan.metadata, fetchXml(plan, columns, filter, cursor?.page || 1, cursor?.cookie || ''), signal)
  signal.throwIfAborted()
  const rows = Array.isArray(payload) ? payload : payload?.value
  if (!Array.isArray(rows)) throw new Error('Dataverse did not return search records.')
  const more = payload?.['@Microsoft.Dynamics.CRM.morerecords'] === true || payload?.['@Microsoft.Dynamics.CRM.morerecords'] === 'true'
  const rawCookie = payload?.['@Microsoft.Dynamics.CRM.fetchxmlpagingcookie']
  const cookie = more ? decodeProgramSearchCookie(rawCookie) : ''
  if (more && (!rows.length || cookie === cursor?.cookie)) throw new Error('Search paging repeated or returned an empty continuation page.')
  const seen = new Set<string>()
  const records = rows.filter((row: any) => Number(row.cmps_isarchived) !== 125570000).map((row: any) => {
    const id = guid(row[plan.metadata.PrimaryIdAttribute])
    if (!GUID.test(id) || seen.has(id)) throw new Error('Search returned an invalid or duplicate record ID.')
    seen.add(id)
    return { id, recordId: text(row.cmps_recordid) || id, title: [...new Set([plan.metadata.PrimaryNameAttribute || '', ...(plan.grant.table.displayFields || [])])].map((field) => recordValue(row, plan.metadata, field)).filter((value) => value && value !== text(row.cmps_recordid)).join(' | '), modifiedOn: text(row.modifiedon || row.createdon),
      ...(attachmentFields.length ? { attachments: recordAttachments(plan.grant.table.key, Object.fromEntries(attachmentFields.map(({ field }) => [field, row[`_${field}_value`] ?? row[field]]))) } : {}) }
  })
  return { rows: records, next: more ? { page: (cursor?.page || 1) + 1, cookie, fingerprint: identity } : null }
}

export async function loadProgramSearchRecord(context: ProgramSearchContext, plan: ProgramSearchPlan, rowId: string, gateway: ProgramSearchGateway, signal: AbortSignal): Promise<Array<{ field: string; label: string; value: string; fileId?: string }>> {
  assertPlan(context, plan, true)
  const id = guid(rowId)
  if (!GUID.test(id)) throw new Error('Invalid record ID.')
  const payload = await gateway.query(plan.metadata, fetchXml(plan, plan.fields.map((field) => field.field), `<condition attribute="${name(plan.metadata.PrimaryIdAttribute)}" operator="eq" value="${id}"/>`, 1, '', 2), signal)
  signal.throwIfAborted()
  const rows = Array.isArray(payload) ? payload : payload?.value
  if (!Array.isArray(rows) || rows.length !== 1 || guid(rows[0][plan.metadata.PrimaryIdAttribute]) !== id || Number(rows[0].cmps_isarchived) === 125570000) throw new Error('The record was not found, is archived, or is outside this program.')
  const files = recordAttachments(plan.grant.table.key, rows[0])
  return plan.fields.map((field) => ({ ...field, value: recordValue(rows[0], plan.metadata, field.field),
    ...(files.some((file) => file.field === field.field) ? { fileId: files.find((file) => file.field === field.field)!.id } : {}) }))
}
