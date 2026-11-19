import type { ReportRow } from './reportTypes'

const headings: Record<string, string> = {
  Gender: 'Gender',
  'Age at first qualifying service in this period': 'Age Group',
  Race: 'Race',
  Ethnicity: 'Ethnicity',
}
const order = Object.keys(headings)
// Presentation only: reuse existing category rows and the period's existing
// distinct-client total. Never sum multi-selection categories or recalculate age.
export function saspDemographicTables(rows: ReportRow[]) {
  const total = rows.find((row) => row.Demographic === 'Clients Served' && row.IsTotal)?.Clients
  const groups = new Map<string, ReportRow[]>()
  for (const row of rows) {
    if (row.Demographic === 'Clients Served') continue
    const name = String(row.Demographic ?? '')
    const group = groups.get(name) || []; group.push(row); groups.set(name, group)
  }
  return [...groups].sort(([a], [b]) => {
    const first = order.indexOf(a), second = order.indexOf(b)
    return (first < 0 ? order.length : first) - (second < 0 ? order.length : second) || a.localeCompare(b)
  }).map(([name, categories]) => ({ name, heading: headings[name] || name, rows: categories, total }))
}
