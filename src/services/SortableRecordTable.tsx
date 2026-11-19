import { Children, cloneElement, isValidElement, useState, type ReactElement, type ReactNode, type TableHTMLAttributes } from 'react'
import { recordSortKind, sortRecordRows, type RecordSortDirection } from './recordSorting'

type Element = ReactElement<{ children?: ReactNode; colSpan?: number; 'data-sort-value'?: unknown; [key: string]: unknown }>
function recordCellText(node: ReactNode): string {
  if (typeof node === 'string' || typeof node === 'number') return String(node)
  if (Array.isArray(node)) return node.map(recordCellText).join(' ')
  if (!isValidElement(node)) return ''
  const element = node as Element
  if (element.props['data-sort-value'] !== undefined) return String(element.props['data-sort-value'] ?? '')
  return recordCellText(element.props.children)
}
export default function SortableRecordTable({ children, ...props }: TableHTMLAttributes<HTMLTableElement>) {
  const [sort, setSort] = useState<{ column: number; direction: RecordSortDirection } | null>(null)
  const sections = Children.toArray(children)
  const head = sections.find((node) => isValidElement(node) && node.type === 'thead') as Element | undefined
  const headerRow = head ? Children.toArray(head.props.children).find((node) => isValidElement(node) && node.type === 'tr') as Element | undefined : undefined
  const headers = headerRow ? Children.toArray(headerRow.props.children) : []
  const heading = sort ? recordCellText(headers[sort.column]) : ''
  const transformed = sections.map((node) => {
    if (!isValidElement(node)) return node
    const element = node as Element
    if (element.type === 'thead' && headerRow) {
      const columns = headers.map((header, index) => {
        if (!isValidElement(header)) return header
        const label = recordCellText(header)
        if (!label.trim() || /^(open|action|file|select)$/i.test(label.trim())) return header
        const active = sort?.column === index, direction = active ? sort.direction : 'none'
        return cloneElement(header as Element, { 'aria-sort': direction, scope: 'col' },
          <button type="button" className="record-sort-button" title={`Sort by ${label}`} onClick={() => setSort((current) => ({
            column: index, direction: current?.column === index && current.direction === 'ascending' ? 'descending' : 'ascending',
          }))}><span>{(header as Element).props.children}</span><span aria-hidden="true">{active ? direction === 'ascending' ? '↑' : '↓' : '↕'}</span></button>)
      })
      return cloneElement(element, {}, cloneElement(headerRow, {}, columns))
    }
    if (element.type === 'tbody' && sort) {
      const rows = Children.toArray(element.props.children)
      const sorted = sortRecordRows(rows, (row) => {
        if (!isValidElement(row)) return ''
        const cells = Children.toArray((row as Element).props.children)
        return recordCellText(cells[sort.column])
      }, recordSortKind(heading), sort.direction)
      return cloneElement(element, {}, sorted)
    }
    return element
  })
  return <table {...props}>{transformed}</table>
}

