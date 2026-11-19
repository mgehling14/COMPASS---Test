import type { LegacyReport, ReportItem } from './reportTypes'
const typeCountCells = new Set(['Textbox166', 'Textbox173', 'Textbox180', 'Textbox194', 'Textbox342',
  'Textbox201', 'Textbox208', 'Textbox349', 'Textbox328', 'Textbox335'])
// Exhibit J's legacy rows wrapped a distinct-client count in IIF(count > 0, 1, 0).
// Display that full count instead. Preserve Section B and every total verbatim.
export function prepareOvwReportLayout(report: LegacyReport): LegacyReport {
  if (report.id !== 'ovw-monthly-report-exhibit-j-v26-1') return report
  function typeCell(item: ReportItem): ReportItem {
    if (item.kind !== 'text' || !typeCountCells.has(item.name)) return item
    return { ...item, paragraphs: item.paragraphs.map((paragraph) => paragraph.map((run) => {
      const count = /^=IIF\(\s*(CountDistinct\([\s\S]*\))\s*>\s*0,\s*1,\s*0\s*\)$/i.exec(run.value.trim())
      return count ? { ...run, value: '=' + count[1] } : run
    })) }
  }
  return { ...report, items: report.items.map((item) => item.kind === 'table' && item.name === 'Tablix1'
    ? { ...item, rows: item.rows.map((row) => row.map((cell) => ({ ...cell, items: cell.items.map(typeCell) }))) } : item) }
}
