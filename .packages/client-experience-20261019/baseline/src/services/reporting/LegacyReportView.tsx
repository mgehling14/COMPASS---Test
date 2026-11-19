import { Component, useMemo, useState, type ReactNode } from 'react'
import { evaluateRdl, formatReportValue } from './rdlExpressions'
import { intersectReportCell, reportTableAxes } from './rdlLayout'
import type { ExpressionContext, LegacyReport, LegacyReportResult, ReportItem, ReportStyle, TableItem, TextItem } from './reportTypes'

class ReportSectionBoundary extends Component<{ children: ReactNode; label: string }, { message: string }> {
  state = { message: '' }
  static getDerivedStateFromError(error: Error) { return { message: error.message } }
  render() { return this.state.message ? <section className="legacy-report-unavailable"><h4>{this.props.label}</h4><p>Report expression needs review: {this.state.message}</p><p>No zero value has been substituted.</p></section> : this.props.children }
}

function ItemText({ item, context, displayIds }: { item: TextItem; context: ExpressionContext; displayIds: Record<string, string> }) {
  if (item.hidden && evaluateRdl(item.hidden.startsWith('=') ? item.hidden : item.hidden === 'true' ? '=True' : '=False', context)) return null
  return <div style={style(item.style, context)}>{item.paragraphs.map((paragraph, index) => <div key={index}>{paragraph.map((run, position) => {
    const value = evaluateRdl(run.value, context), displayed = typeof value === 'string' && displayIds[value] ? displayIds[value] : formatReportValue(value, run.style.Format || item.style.Format)
    return <span key={position} style={style(run.style, context)}>{displayed}</span>
  })}</div>)}</div>
}
function style(values: ReportStyle, context: ExpressionContext): React.CSSProperties {
  const value = (key: string) => values[key] ? String(evaluateRdl(values[key], context)) : undefined
  return { backgroundColor: value('BackgroundColor'), color: value('Color'), fontSize: value('FontSize'), fontWeight: value('FontWeight') as React.CSSProperties['fontWeight'], fontStyle: value('FontStyle'), textAlign: value('TextAlign') as React.CSSProperties['textAlign'], whiteSpace: 'pre-wrap' }
}
function ReportItems({ items, context, result }: { items: ReportItem[]; context: ExpressionContext; result: LegacyReportResult }) {
  return <>{items.map((item, index) => <ReportSectionBoundary key={`${item.name}-${index}-${result.generatedAt}`} label={item.name}>{item.kind === 'text' ? <ItemText item={item} context={context} displayIds={result.displayIds} /> : <ReportTable table={item} context={context} result={result} />}</ReportSectionBoundary>)}</>
}
function ReportTable({ table, context, result }: { table: TableItem; context: ExpressionContext; result: LegacyReportResult }) {
  const [page, setPage] = useState(0)
  const computed = useMemo(() => {
    try {
      const dataset = result.datasets[table.dataset]
      if (!dataset || dataset.unavailable) return { error: dataset?.unavailable || `Dataset ${table.dataset} is unavailable.` }
      return { axes: reportTableAxes(table, dataset.rows || [], context) }
    } catch (error) { return { error: String((error as Error)?.message || error) } }
  }, [context, result, table])
  if (computed.error || !computed.axes) return <section className="legacy-report-unavailable"><h4>{table.dataset || table.name}</h4><p>{computed.error}</p><p>No zero totals have been substituted for this unavailable section.</p></section>
  const axes = computed.axes
  const pageCount = Math.max(1, Math.ceil(axes.rows.length / 500)), currentPage = Math.min(page, pageCount - 1)
  try {
    const hasRowHeaders = axes.rows.some((row) => row.headers.length), hasColumnHeaders = axes.columns.some((column) => column.headers.length)
    return <section className="legacy-report-section"><div className="legacy-report-scroll"><table style={style(table.style, context)}>
      <caption className="legacy-report-section-name">{table.dataset} • {table.name}</caption>
      {hasColumnHeaders ? <thead><tr>{hasRowHeaders ? <th scope="col">Group</th> : null}{axes.columns.map((column, index) => <th scope="col" key={index}>{column.headers.map((header, position) => <ReportItems key={position} items={header.member.header} context={header.context} result={result} />)}</th>)}</tr></thead> : null}
      <tbody>{axes.rows.slice(currentPage * 500, currentPage * 500 + 500).map((row, rowPosition) => {
        let skip = 0
        return <tr key={rowPosition}>{hasRowHeaders ? <th scope="row">{row.headers.map((header, index) => <ReportItems key={index} items={header.member.header} context={header.context} result={result} />)}</th> : null}{axes.columns.map((column, columnPosition) => {
          if (skip) { skip--; return null }
          const cell = table.rows[row.index]?.[column.index]
          if (!cell) throw new Error('RDL body and group hierarchy do not align.')
          skip = cell.colSpan - 1
          const current = intersectReportCell(row, column, axes.context)
          return <td key={columnPosition} colSpan={cell.colSpan} rowSpan={cell.rowSpan}><ReportItems items={cell.items} context={current} result={result} /></td>
        })}</tr>
      })}</tbody>
    </table></div>{!axes.rows.length ? <p className="hint">No matching detail rows for this section.</p> : null}{axes.rows.length > 500 ? <><div className="legacy-report-actions"><button type="button" className="secondary" disabled={currentPage === 0} onClick={() => setPage(currentPage - 1)}>Previous detail page</button><span>Page {currentPage + 1} of {pageCount} • {axes.rows.length.toLocaleString()} grouped/detail rows</span><button type="button" className="secondary" disabled={currentPage + 1 >= pageCount} onClick={() => setPage(currentPage + 1)}>Next detail page</button></div><p className="legacy-report-unavailable">Aggregates use all records; detail pages show 500 rows at a time. Download the full dataset for the complete detail list. Printing includes only the current detail page.</p></> : null}</section>
  } catch (error) { return <section className="legacy-report-unavailable"><h4>{table.dataset || table.name}</h4><p>Layout/calculation needs review: {String((error as Error)?.message || error)}</p></section> }
}
export default function LegacyReportView({ report, result, parameters, expandDetails = false }: { report: LegacyReport; result: LegacyReportResult; parameters: Record<string, unknown>; expandDetails?: boolean }) {
  const context = useMemo<ExpressionContext>(() => ({ rows: [], parameters, scopes: Object.fromEntries(Object.entries(result.datasets).filter(([, dataset]) => !dataset.unavailable).map(([name, dataset]) => [name, dataset.rows || []])), globals: { ExecutionTime: result.generatedAt, ReportName: report.title, ReportServerUrl: '', ReportFolder: 'COMPASS Reports', ExpandDetails: expandDetails } }), [expandDetails, parameters, report.title, result])
  return <div className="legacy-report-output"><h3>{report.title}</h3><p className="hint">Generated {result.generatedAt}. Current program labels are shown; source calculations use compatibility labels to preserve legacy grouping.</p><ReportItems items={report.items} context={context} result={result} /></div>
}
