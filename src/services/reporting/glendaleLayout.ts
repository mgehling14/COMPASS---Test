import { GLENDALE_SECTIONS } from './glendalePlan'
import type { ReportRow } from './reportTypes'

type Column = { field: string; label: string }
export type GlendaleDisplayTable = { caption: string; columns: Column[]; rows: ReportRow[] }
const human = (value: string) => value.replace(/([a-z])([A-Z])/g, '$1 $2')
export function glendaleTables(name: string, rows: ReportRow[]): GlendaleDisplayTable[] {
  const section = GLENDALE_SECTIONS.find((entry) => entry.name === name)
  if (!section) return []
  if (!name.endsWith('Demographics')) return [{ caption: '', columns: section.columns.map((field) => ({ field, label: human(field) })), rows }]
  const groups = new Map<string, ReportRow[]>()
  for (const row of rows) {
    const key = JSON.stringify([row.Month, row.Demographic]), group = groups.get(key) || []
    group.push(row); groups.set(key, group)
  }
  return [...groups.values()].map((group) => ({
    caption: `${group[0].Month} - ${group[0].Demographic} (${group[0].PeriodStart} through ${group[0].PeriodEnd})`,
    columns: group[0].Demographic === 'Race / Ethnicity' ? [
      { field: 'Category', label: 'Race' }, { field: 'NonHispanic', label: 'Not Hispanic/Latino' }, { field: 'Hispanic', label: 'Hispanic/Latino' }, { field: 'EthnicityUnknown', label: 'Ethnicity unknown' }, { field: 'Count', label: 'Total' },
    ] : [{ field: 'Category', label: String(group[0].Demographic) }, { field: 'Count', label: 'Total' }],
    rows: group,
  }))
}
