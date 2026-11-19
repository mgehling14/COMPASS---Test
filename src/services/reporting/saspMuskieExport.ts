import { reportCsv } from '../desDvReport'
import { SASP_MUSKIE_SECTIONS, saspCell, saspReportColumns } from './saspMuskiePlan'
import { saspDemographicTables } from './saspDemographicLayout'
import { SASP_REFERENCE_CHECKLIST } from './saspMuskieSupplement'
import type { DatasetResult, ReportRow } from './reportTypes'

const escapeHtml = (value: unknown) => String(value ?? '').replace(/[&<>"']/g, (character) => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;' })[character]!)
export type SaspExportFrequency = 'Monthly' | 'Annual'
function verified(name: string, dataset: DatasetResult, frequency?: SaspExportFrequency) {
  const columns = saspReportColumns(name)
  if (!columns.length || dataset.unavailable || !Array.isArray(dataset.rows)) throw new Error('This SASP section is unavailable and cannot be downloaded as a zero/partial report.')
  const rows = frequency ? dataset.rows.filter((row) => row.PeriodType === frequency) : dataset.rows
  if (frequency && !rows.length) throw new Error(`No ${frequency.toLowerCase()} period data was returned for this SASP section.`)
  return { columns, rows }
}
export function saspMuskieSectionCsv(name: string, dataset: DatasetResult, frequency?: SaspExportFrequency): string {
  const { columns, rows } = verified(name, dataset, frequency)
  return reportCsv([[...columns], ...rows.map((row) => columns.map((field) => saspCell(row, field)))])
}
function demographicWordTables(rows: ReportRow[]): string {
  const periods = new Map<string, ReportRow[]>()
  for (const row of rows) {
    const key = JSON.stringify([row.PeriodType, row.Period, row.PeriodStart, row.PeriodEnd])
    const group = periods.get(key) || []; group.push(row); periods.set(key, group)
  }
  return [...periods.values()].map((period) => '<p><strong>' + escapeHtml(period[0].PeriodType) + ' — ' + escapeHtml(period[0].Period) + ' · ' + escapeHtml(period[0].PeriodStart) + ' through ' + escapeHtml(period[0].PeriodEnd) + '</strong></p><div class="demographics">' + saspDemographicTables(period).map((group) => '<table><thead><tr><th>' + escapeHtml(group.heading) + '</th><th>Total</th></tr></thead><tbody>' + group.rows.map((row) => '<tr><td>' + escapeHtml(saspCell(row, 'Category')) + '</td><td class="number">' + escapeHtml(saspCell(row, 'Clients')) + '</td></tr>').join('') + '</tbody>' + (group.total === undefined || group.total === null ? '' : '<tfoot><tr class="total"><td>Total</td><td class="number">' + escapeHtml(group.total) + '</td></tr></tfoot>') + '</table>').join('') + '</div><p>Totals show distinct clients in this period. Multi-selection categories can overlap.</p>').join('')
}
export function saspMuskieSectionWord(name: string, dataset: DatasetResult, start: string, end: string, frequency?: SaspExportFrequency): string {
  const { columns, rows } = verified(name, dataset, frequency), title = [...SASP_MUSKIE_SECTIONS, SASP_REFERENCE_CHECKLIST].find((section) => section.name === name)!.title
  const body = name === 'SASP_ClientsServed' ? demographicWordTables(rows) : '<table><thead><tr>' + columns.map((column) => '<th>' + escapeHtml(column.replace(/([a-z])([A-Z])/g, '$1 $2')) + '</th>').join('') + '</tr></thead><tbody>' + rows.map((row) => '<tr' + (row.IsTotal ? ' class="total"' : '') + '>' + columns.map((column) => '<td' + (typeof row[column] === 'number' ? ' class="number"' : '') + '>' + escapeHtml(saspCell(row, column)) + '</td>').join('') + '</tr>').join('') + '</tbody></table>'
  return '<!DOCTYPE html><html><head><meta charset="utf-8"><title>SASP MUSKIE Report</title><style>body{font-family:Arial,sans-serif;color:#203b2c}table{border-collapse:collapse;width:100%;font-size:9pt}th,td{border:1px solid #7d997f;padding:5px;text-align:left}th{background:#096052;color:white}h2{background:#7d256e;color:white;padding:7px}.number{background:#bbd63d;text-align:right}.total{font-weight:bold}.total td{background:#bbd63d}.total .number{background:#4e4f4f;color:white}.demographics table{width:5.3in;max-width:100%;margin-bottom:4px;table-layout:fixed}.demographics th:first-child{width:70%}.demographics th:last-child{width:30%}</style></head><body><h1>SASP MUSKIE Report — REACH Center</h1><h2>' + escapeHtml((frequency ? frequency + ' — ' : '') + title) + '</h2><p>Selected dates: ' + escapeHtml(start) + ' through ' + escapeHtml(end) + ' (inclusive).</p><p>Only Services funded by SASP and linked to REACH Center enrollments. Archived records and excluded Client Profiles and their linked records are omitted. Monthly and calendar-year periods are clipped to the selected dates. Periods overlap; do not sum across period types. Time totals include known minutes only.</p><p>Each qualifying SASP-funded REACH Center Services record counts as one call, regardless of Meeting Mode. Calls and Client Services report the same records under different section labels; do not add their counts together. No Helpline records are used. Demographic counts are distinct clients per period; a multi-race client may appear in multiple race rows. This initial report is for validation against your SASP MUSKIE definitions before official use.</p>' + body + '</body></html>'
}
export function downloadSaspSection(name: string, dataset: DatasetResult, start: string, end: string, format: 'csv' | 'word', frequency?: SaspExportFrequency): void {
  const content = format === 'csv' ? saspMuskieSectionCsv(name, dataset, frequency) : saspMuskieSectionWord(name, dataset, start, end, frequency)
  const url = URL.createObjectURL(new Blob(['\ufeff', content], { type: format === 'csv' ? 'text/csv;charset=utf-8' : 'application/msword;charset=utf-8' }))
  const link = document.createElement('a')
  link.href = url
  link.download = `SASP-MUSKIE-${frequency ? frequency + '-' : ''}${name}-${start}-${end}.${format === 'csv' ? 'csv' : 'doc'}`
  link.click()
  setTimeout(() => URL.revokeObjectURL(url), 1000)
}
