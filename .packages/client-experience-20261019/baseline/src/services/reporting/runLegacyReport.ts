import compiledPlans from './nativeReportQueries.json'
import { NativeReportEvaluator, type QueryNode } from './nativeReportEvaluator'
import { isNativeDesDvReport, type NativeDesDvOptions } from './nativeDesDvPlan'
import { runNativeDesDvReport } from './nativeDesDvReport'
import { currentReportDate } from '../desDvReport'
import { applyReportFilters, evaluateRdl, rowValue } from './rdlExpressions'
import { loadReportSnapshot } from './reportDataverse'
import { planLegacyReport } from './reportPlan'
import type { ReportMappings } from './reportMappings'
import type { ExpressionContext, LegacyReport, LegacyReportResult, ReportCatalog, ReportRow } from './reportTypes'

// Offline comparison helper only. Runtime parameters are values in static plans.
export function bindReportParameters(sql: string, parameters: Record<string, unknown>): string {
  return sql.replace(/\$([A-Za-z_]\w*)/g, (_token, name: string) => { if (!(name in parameters)) throw new Error(`Report parameter ${name} is required.`); const value = parameters[name]; return value == null ? 'NULL' : typeof value === 'number' && Number.isFinite(value) ? String(value) : "'" + String(value).replaceAll("'", "''") + "'" })
}
export async function runLegacyReport(report: LegacyReport, catalog: ReportCatalog, parameters: Record<string, unknown>, mappings: ReportMappings, signal: AbortSignal, progress: (message: string) => void, nativeOptions?: NativeDesDvOptions): Promise<LegacyReportResult> {
  signal.throwIfAborted()
  if (isNativeDesDvReport(report)) return runNativeDesDvReport(report, parameters, mappings, signal, progress, nativeOptions)
  const plan = planLegacyReport(report, catalog)
  const output: LegacyReportResult = { datasets: {}, warnings: [], generatedAt: new Date().toISOString(), displayIds: {} }
  for (const [name, dataset] of Object.entries(plan.datasets)) if (dataset.unavailable) output.datasets[name] = { unavailable: dataset.unavailable }
  if (!Object.keys(plan.required).length) { output.warnings.push('All datasets require deferred reference data. No records were read and no zero totals were substituted.'); return output }
  const snapshot = await loadReportSnapshot(plan.required, mappings, signal, progress)
  output.displayIds = snapshot.displayIds; output.warnings.push(...snapshot.warnings)
  for (const [name, dataset] of Object.entries(plan.datasets)) {
    const errors = dataset.tables.map((table) => snapshot.unavailable[table]).filter(Boolean)
    if (errors.length) output.datasets[name] = { unavailable: [...new Set(errors)].join(' ') }
  }
  const evaluator = new NativeReportEvaluator(catalog, compiledPlans.queries as unknown as Record<string, QueryNode>, snapshot.tables, parameters, currentReportDate(), signal, progress)
  const contexts: ExpressionContext = { rows: [], parameters, scopes: {}, globals: { ExecutionTime: output.generatedAt, ReportName: report.title, ReportServerUrl: '', ReportFolder: 'COMPASS Reports' } }
  for (const dataset of report.datasets) {
    if (output.datasets[dataset.name]?.unavailable) continue
    signal.throwIfAborted(); progress(`Calculating ${dataset.name}…`)
    try {
      const query = (compiledPlans.queries as Record<string, unknown>)[report.id + ':' + dataset.name] as QueryNode | undefined
      if (!query) throw new Error('No verified native calculation plan. Recompile the report catalog before using this dataset.')
      const { rows: sourceRows, columns } = await evaluator.query(query)
      const rows = sourceRows.map((sourceRow, index) => {
        const row: ReportRow = { ...sourceRow, __reportRowId: index + 1 }
        for (const field of dataset.fields.filter((field) => field.source)) {
          if (!columns.some((column) => column.toLowerCase() === field.source.toLowerCase())) throw new Error(`RDL expects ${field.source}, but the calculation does not return it.`)
          row[field.name] = rowValue(row, field.source)
        }
        return row
      })
      contexts.scopes[dataset.name] = rows
      for (const row of rows) for (const field of dataset.fields.filter((field) => field.expression)) row[field.name] = evaluateRdl(field.expression, { ...contexts, row, rows })
      output.datasets[dataset.name] = { rows: applyReportFilters(rows, dataset.filters, { ...contexts, rows }), columns }
    } catch (error) { signal.throwIfAborted(); output.datasets[dataset.name] = { unavailable: `${dataset.name}: ${String((error as Error)?.message || error)}` } }
  }
  signal.throwIfAborted()
  return output
}
