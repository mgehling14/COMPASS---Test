import { applyReportFilters, evaluateRdl, sortReportRows } from './rdlExpressions'
import type { ExpressionContext, ReportMember, ReportRow, TableItem } from './reportTypes'
export type AxisLeaf = { index: number; rows: ReportRow[]; context: ExpressionContext; scopeNames: string[]; headers: Array<{ member: ReportMember; context: ExpressionContext }> }
const memberships = new WeakMap<ReportRow[], Set<ReportRow>>()
export function expandReportAxis(members: ReportMember[], rows: ReportRow[], context: ExpressionContext): AxisLeaf[] {
  const indices = new Map<ReportMember, number>()
  let index = 0
  function enumerate(nodes: ReportMember[]) { for (const node of nodes) { if (node.members.length) enumerate(node.members); else indices.set(node, index++) } }
  enumerate(members)
  const output: AxisLeaf[] = []
  function visit(nodes: ReportMember[], scopedRows: ReportRow[], parent: ExpressionContext, headers: AxisLeaf['headers'], scopeNames: string[]) {
    for (const member of nodes) {
      const sorted = sortReportRows(scopedRows, member.sorts, parent)
      const groups = new Map<string, ReportRow[]>()
      if (!member.name) groups.set('static', sorted)
      else if (!member.expressions.length) sorted.forEach((row, position) => groups.set(String(position), [row]))
      else for (const row of sorted) { const key = JSON.stringify(member.expressions.map((expression) => evaluateRdl(expression, { ...parent, row, rows: sorted }))); const group = groups.get(key) || []; group.push(row); groups.set(key, group) }
      for (const group of groups.values()) {
        let current: ExpressionContext = { ...parent, row: group[0], rows: group, scopes: { ...parent.scopes, ...(member.name ? { [member.name]: group } : {}) } }
        if (member.filters.length && !applyReportFilters(group, member.filters, current).length) continue
        if (!(member.toggle && parent.globals?.ExpandDetails) && member.hidden && evaluateRdl(member.hidden.startsWith('=') ? member.hidden : member.hidden === 'true' ? '=True' : '=False', current)) continue
        const path = member.header.length ? [...headers, { member, context: current }] : headers
        const names = member.name ? [...scopeNames, member.name] : scopeNames
        if (member.members.length) visit(member.members, group, current, path, names)
        else output.push({ index: indices.get(member)!, rows: group, context: current, scopeNames: names, headers: path })
        if (output.length > 100000) throw new Error('Report grouping exceeded 100,000 expanded entries. Narrow the selected period.')
      }
    }
  }
  visit(members, rows, context, [], [])
  return output
}
export function reportTableAxes(table: TableItem, rows: ReportRow[], context: ExpressionContext): { rows: AxisLeaf[]; columns: AxisLeaf[]; context: ExpressionContext } {
  const filtered = sortReportRows(applyReportFilters(rows, table.filters, context), table.sorts, context)
  const declared: Record<string, ReportRow[]> = {}
  function declare(nodes: ReportMember[]) { for (const node of nodes) { if (node.name) declared[node.name] = []; declare(node.members) } }
  declare(table.rowMembers); declare(table.columnMembers)
  const current: ExpressionContext = { ...context, rows: filtered, row: filtered[0], scopes: { ...declared, ...context.scopes, [table.name]: filtered } }
  return { rows: expandReportAxis(table.rowMembers, filtered, current), columns: expandReportAxis(table.columnMembers, filtered, current), context: current }
}
export function intersectReportCell(row: AxisLeaf, column: AxisLeaf, context: ExpressionContext): ExpressionContext {
  let columns = memberships.get(column.rows)
  if (!columns) { columns = new Set(column.rows); memberships.set(column.rows, columns) }
  const intersection = row.rows.filter((entry) => columns!.has(entry))
  return { ...context, rows: intersection, row: intersection[0] || row.rows[0] || column.rows[0], scopes: { ...context.scopes, ...Object.fromEntries(row.scopeNames.map((name) => [name, row.context.scopes[name]])), ...Object.fromEntries(column.scopeNames.map((name) => [name, column.context.scopes[name]])) } }
}
