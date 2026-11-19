import type { LegacyReport, ReportCatalog, ReportView } from './reportTypes'
import { isNativeDesDvReport, planNativeDesDvReport } from './nativeDesDvPlan'
import { usesOvwFiscalCalendar } from './ovwFiscalCalendar'
export type ReportPlan = { datasets: Record<string, { tables: string[]; unavailable: string }>; required: Record<string, string[]> }
export function planLegacyReport(report: LegacyReport, catalog: ReportCatalog): ReportPlan {
  if (isNativeDesDvReport(report)) return planNativeDesDvReport(report)
  const views = new Map(catalog.views.map((view) => [view.name, view])), result: ReportPlan = { datasets: {}, required: {} }
  for (const dataset of report.datasets) {
    const tables = new Set<string>(), requirements = new Map<string, Set<string>>(), visited = new Set<string>()
    let problem = ''
    function addFields(required: Record<string, string[]>) { for (const [table, fields] of Object.entries(required)) { const selected = requirements.get(table) || new Set<string>(); for (const field of fields) selected.add(field); requirements.set(table, selected) } }
    function visit(dependency: string, trail: string[]) {
      if (dependency.startsWith('table:')) { tables.add(dependency.slice(6)); return }
      if (trail.includes(dependency)) throw new Error(`Report SQL view cycle: ${trail.join(' → ')} → ${dependency}`)
      if (visited.has(dependency)) return
      const view: ReportView | undefined = views.get(dependency)
      if (!view) { problem = `Missing legacy view ${dependency}.`; return }
      visited.add(dependency); addFields(view.requirements)
      for (const child of view.dependencies) visit(child, [...trail, dependency])
    }
    addFields(dataset.requirements)
    for (const dependency of dataset.dependencies) visit(dependency, [])
    const references = [...tables].filter((table) => catalog.deferredReferences.includes(table)
      && !(table === 'Ref_Dates' && usesOvwFiscalCalendar(report)))
    if (references.length) problem = `${references.join(', ')} reference data is deferred. This dataset is unavailable, not a zero count.`
    result.datasets[dataset.name] = { tables: [...tables], unavailable: problem }
    if (!problem) for (const [table, columns] of requirements) result.required[table] = [...new Set([...(result.required[table] || []), ...columns])]
  }
  return result
}
