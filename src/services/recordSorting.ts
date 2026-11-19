export type RecordSortKind = 'text' | 'date' | 'number'
export type RecordSortDirection = 'ascending' | 'descending'
const missing = (value: unknown) => value === null || value === undefined || ['', '-', '--'].includes(String(value).trim())
const collator = new Intl.Collator(undefined, { sensitivity: 'base', numeric: true })
export function recordSortKind(label: string): RecordSortKind {
  if (/date|created|modified|date\/time|check in|check out/i.test(label)) return 'date'
  if (/minutes|amount|cost|length of stay|count|\bage\b|number|hours/i.test(label)) return 'number'
  return 'text'
}
export function compareRecordValues(a: unknown, b: unknown, kind: RecordSortKind, direction: RecordSortDirection): number {
  if (missing(a) || missing(b)) return missing(a) === missing(b) ? 0 : missing(a) ? 1 : -1
  const left = String(a).trim(), right = String(b).trim()
  let comparison = 0
  if (kind === 'date') {
    const first = Date.parse(left), second = Date.parse(right)
    if (!Number.isFinite(first) || !Number.isFinite(second)) return Number.isFinite(first) === Number.isFinite(second) ? collator.compare(left, right) : Number.isFinite(first) ? -1 : 1
    comparison = first - second
  } else if (kind === 'number') {
    const first = Number(left.replace(/[$,]/g, '')), second = Number(right.replace(/[$,]/g, ''))
    comparison = Number.isFinite(first) && Number.isFinite(second) ? first - second : collator.compare(left, right)
  } else comparison = collator.compare(left, right)
  return direction === 'ascending' ? comparison : -comparison
}
export function sortRecordRows<T>(rows: T[], read: (row: T) => unknown, kind: RecordSortKind, direction: RecordSortDirection): T[] {
  return rows.map((row, index) => ({ row, index })).sort((a, b) => compareRecordValues(read(a.row), read(b.row), kind, direction) || a.index - b.index).map((entry) => entry.row)
}

