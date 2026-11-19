export type AdvancedSearchKind = 'text' | 'date' | 'number' | 'choice' | 'multi-choice' | 'boolean' | 'lookup'
export type AdvancedSearchField = { field: string; label: string; kind: AdvancedSearchKind; options?: Array<{ value: string; label: string }> }
export type AdvancedSearchCriterion = { field: string; operator: string; value: string; valueTo?: string }
type Metadata = { Attributes: Array<{ LogicalName: string; AttributeType: string; IsValidForRead?: boolean; AttributeTypeName?: { Value?: string } }> }
export const ADVANCED_SEARCH_LIMIT = 10
export const ADVANCED_SEARCH_FIELDS: Readonly<Record<string, ReadonlyArray<{ field: string; label: string }>>> = {
  'client-profile': [
    { field: 'cmps_recordid', label: 'Record ID' }, { field: 'cmps_name', label: 'Name' },
    { field: 'cmps_dateofbirth', label: 'Date of Birth' }, { field: 'cmps_race', label: 'Race' }, { field: 'cmps_gender', label: 'Gender' },
  ],
  'program-enrollment': [
    { field: 'cmps_servicestartdate', label: 'Service Start Date' }, { field: 'cmps_serviceenddate', label: 'Service End Date' }, { field: 'cmps_program', label: 'Program' },
  ],
  services: [
    { field: 'cmps_dateofservice', label: 'Date of Service' }, { field: 'cmps_servicecategory', label: 'Service Category' }, { field: 'cmps_service', label: 'Service' },
  ],
  'bed-enrollment': [{ field: 'cmps_checkindate', label: 'Check In Date' }],
}
export function supportsAdvancedSearch(tableKey: string): boolean {
  return Object.hasOwn(ADVANCED_SEARCH_FIELDS, tableKey)
}
const NAME = /^[a-z][a-z\d_]*$/i
const GUID = /^[a-f\d]{8}(?:-[a-f\d]{4}){3}-[a-f\d]{12}$/i
const fold = (value: unknown) => String(value ?? '').trim().replace(/\s+/g, ' ').toLocaleLowerCase()
const xml = (value: unknown) => String(value).replace(/&/g, '&amp;').replace(/</g, '&lt;').replace(/>/g, '&gt;').replace(/"/g, '&quot;').replace(/'/g, '&apos;')
export function advancedSearchOperators(kind: AdvancedSearchKind): Array<{ value: string; label: string }> {
  const common = [{ value: 'empty', label: 'Is empty' }, { value: 'not-empty', label: 'Is not empty' }]
  if (kind === 'date') return [{ value: 'eq', label: 'On date' }, { value: 'before', label: 'Before date' }, { value: 'after', label: 'After date' }, { value: 'ge', label: 'On or after' }, { value: 'le', label: 'On or before' }, { value: 'between', label: 'Between dates' }, ...common]
  if (kind === 'number') return [{ value: 'eq', label: 'Equals' }, { value: 'ge', label: 'At least' }, { value: 'le', label: 'At most' }, { value: 'between', label: 'Between' }, ...common]
  if (kind === 'multi-choice') return [{ value: 'includes', label: 'Includes option' }, ...common]
  if (kind !== 'text') return [{ value: 'eq', label: 'Equals' }, { value: 'ne', label: 'Does not equal' }, ...common]
  return [{ value: 'contains', label: 'Contains' }, { value: 'eq', label: 'Equals' }, { value: 'begins-with', label: 'Starts with' }, ...common]
}
export function advancedFieldsFromMetadata(metadata: Metadata, developed: ReadonlyArray<{ field: string; label: string }>, tableKey = ''): AdvancedSearchField[] {
  const definitions = (supportsAdvancedSearch(tableKey) ? ADVANCED_SEARCH_FIELDS[tableKey] : [])
    .filter((definition) => developed.some((entry) => entry.field === definition.field))
  const seen = new Set<string>(), result: AdvancedSearchField[] = []
  for (const definition of definitions) {
    const field = definition.field
    if (seen.has(field) || !NAME.test(field)) continue
    seen.add(field)
    const attribute = metadata.Attributes.find((entry) => entry.LogicalName === field && entry.IsValidForRead !== false)
    if (!attribute) continue
    const type = attribute.AttributeType
    const kind: AdvancedSearchKind | undefined = ['String', 'Memo'].includes(type) ? 'text'
      : type === 'DateTime' ? 'date' : ['Integer', 'BigInt', 'Decimal', 'Double', 'Money'].includes(type) ? 'number'
        : ['Picklist', 'State', 'Status'].includes(type) ? 'choice' : type === 'Boolean' ? 'boolean'
          : ['Lookup', 'Customer', 'Owner', 'Uniqueidentifier'].includes(type) ? 'lookup'
            : attribute.AttributeTypeName?.Value === 'MultiSelectPicklistType' ? 'multi-choice' : undefined
    if (kind) result.push({ field, label: definition.label, kind })
  }
  return result
}
function day(value: string): number {
  const match = value.match(/^(\d{4})-(\d{2})-(\d{2})$/)
  if (!match) throw new Error('Enter dates as YYYY-MM-DD.')
  const year = Number(match[1]), month = Number(match[2]), date = Number(match[3]), number = Date.UTC(year, month - 1, date)
  const parsed = new Date(number)
  if (year < 1753 || parsed.getUTCFullYear() !== year || parsed.getUTCMonth() !== month - 1 || parsed.getUTCDate() !== date) throw new Error('Enter a valid date on or after 1753-01-01.')
  return number
}
export function validateAdvancedSearch(criteria: AdvancedSearchCriterion[], fields: AdvancedSearchField[], backend = false): void {
  if (!Array.isArray(criteria) || criteria.length > ADVANCED_SEARCH_LIMIT) throw new Error('Use at most 10 advanced search conditions.')
  for (const criterion of criteria) {
    const field = fields.find((entry) => entry.field === criterion.field)
    if (!field || !NAME.test(field.field)) throw new Error('This search field is unavailable for the selected form.')
    if (!advancedSearchOperators(field.kind).some((entry) => entry.value === criterion.operator)) throw new Error('Invalid operator for this search field.')
    if (['empty', 'not-empty'].includes(criterion.operator)) continue
    const value = String(criterion.value ?? '').trim(), end = String(criterion.valueTo ?? '').trim()
    if (!value || value.length > 250 || criterion.operator === 'between' && (!end || end.length > 250)) throw new Error('Complete each search condition before applying it (maximum 250 characters per value).')
    if (field.kind === 'date') { const first = day(value); if (criterion.operator === 'between' && first > day(end)) throw new Error('The end of a date range must not be before its start.') }
    if (field.kind === 'number') {
      if (!Number.isFinite(Number(value)) || criterion.operator === 'between' && (!Number.isFinite(Number(end)) || Number(value) > Number(end))) throw new Error('Enter a valid number or an ascending numeric range.')
    }
    if (field.kind === 'lookup' && !GUID.test(value)) throw new Error('Enter the linked record’s Dataverse GUID, not its app Record ID.')
    if (backend && ['choice', 'multi-choice', 'boolean'].includes(field.kind) && (!/^-?\d+$/.test(value) || !Number.isSafeInteger(Number(value)))) throw new Error('Choose a verified option value.')
    if (field.kind === 'boolean' && !['0', '1'].includes(value)) throw new Error('Choose Yes or No.')
  }
}
export function advancedSearchFetchXml(criteria: AdvancedSearchCriterion[], fields: AdvancedSearchField[]): string {
  validateAdvancedSearch(criteria, fields, true)
  const condition = (field: string, operator: string, value?: string) => `<condition attribute="${field}" operator="${operator}"${value === undefined ? '' : ` value="${xml(value)}"`}/>`
  const compiled = criteria.map((criterion) => {
    const field = fields.find((entry) => entry.field === criterion.field)!
    const value = criterion.value.trim(), end = String(criterion.valueTo || '').trim(), op = criterion.operator
    if (op === 'empty' || op === 'not-empty') return condition(field.field, op === 'empty' ? 'null' : 'not-null')
    if (field.kind === 'date') {
      const start = day(value), iso = (number: number) => new Date(number).toISOString()
      if (op === 'before') return condition(field.field, 'lt', iso(start))
      if (op === 'after') return condition(field.field, 'ge', iso(start + 86400000))
      if (op === 'ge') return condition(field.field, 'ge', iso(start))
      if (op === 'le') return condition(field.field, 'lt', iso(start + 86400000))
      return `<filter type="and">${condition(field.field, 'ge', iso(start))}${condition(field.field, 'lt', iso((op === 'between' ? day(end) : start) + 86400000))}</filter>`
    }
    if (field.kind === 'multi-choice') return `<condition attribute="${field.field}" operator="contain-values"><value>${xml(value)}</value></condition>`
    if (op === 'between') return `<filter type="and">${condition(field.field, 'ge', value)}${condition(field.field, 'le', end)}</filter>`
    const escaped = value.replace(/\[/g, '[[]').replace(/%/g, '[%]').replace(/_/g, '[_]')
    return condition(field.field, op === 'contains' ? 'like' : op, op === 'contains' ? `%${escaped}%` : op === 'begins-with' ? escaped : value)
  })
  return compiled.length ? `<filter type="and">${compiled.join('')}</filter>` : ''
}
export function matchesAdvancedSearch(values: Record<string, unknown>, criteria: AdvancedSearchCriterion[], fields: AdvancedSearchField[]): boolean {
  return criteria.every((criterion) => {
    const field = fields.find((entry) => entry.field === criterion.field)!
    const raw = values[criterion.field], text = fold(raw), value = fold(criterion.value)
    const empty = raw === null || raw === undefined || text === '' || text === '-'
    if (criterion.operator === 'empty') return empty
    if (criterion.operator === 'not-empty') return !empty
    if (empty) return false
    let a: number | string = text, b: number | string = value, end: number | string = fold(criterion.valueTo)
    if (field.kind === 'date') {
      const literal = String(raw).match(/^\d{4}-\d{2}-\d{2}/)?.[0]
      const parsed = literal ? Date.parse(literal) : Date.parse(String(raw))
      if (!Number.isFinite(parsed)) return false
      a = day(new Date(parsed).toISOString().slice(0, 10)); b = day(criterion.value)
      if (criterion.operator === 'between') end = day(String(criterion.valueTo))
    } else if (field.kind === 'number') {
      a = Number(raw); b = Number(criterion.value); end = Number(criterion.valueTo)
      if (!Number.isFinite(a)) return false
    }
    switch (criterion.operator) {
      case 'contains': return text.includes(value)
      case 'begins-with': return text.startsWith(value)
      case 'includes': return text === value || text.split(/;\s*/).some((part) => part === value) || (`, ${text}, `).includes(`, ${value}, `)
      case 'eq': return a === b
      case 'ne': return a !== b
      case 'ge': return a >= b
      case 'le': return a <= b
      case 'before': return a < b
      case 'after': return a > b
      case 'between': return a >= b && a <= end
      default: return false
    }
  })
}

