import { reportCsv } from '../desDvReport'
import { GLENDALE_SECTIONS } from './glendalePlan'
import { glendaleTables } from './glendaleLayout'
import type { DatasetResult } from './reportTypes'

const escapeHtml = (value: unknown) => String(value ?? '').replace(/[&<>"']/g, (character) => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;' })[character]!)
function verified(name: string, dataset: DatasetResult) {
  const section = GLENDALE_SECTIONS.find((entry) => entry.name === name)
  if (!section || dataset.unavailable || !Array.isArray(dataset.rows)) throw new Error('This Glendale section is unavailable; no zero/partial section will be downloaded.')
  return { section, rows: dataset.rows }
}
export function glendaleSectionCsv(name: string, dataset: DatasetResult): string {
  const { section, rows } = verified(name, dataset)
  return reportCsv([[...section.columns], ...rows.map((row) => section.columns.map((field) => row[field] === null || row[field] === undefined ? '' : String(row[field])))])
}
export function glendaleSectionWord(name: string, dataset: DatasetResult, start: string, end: string): string {
  const { section, rows } = verified(name, dataset)
  return '<!DOCTYPE html><html><head><meta charset="utf-8"><title>City of Glendale Monthly Report</title><style>body{font-family:Arial,sans-serif;color:#203b2c}h2{background:#7d256e;color:white;padding:7px}table{border-collapse:collapse;width:100%;font-size:9pt;margin-bottom:12px}caption{text-align:left;font-weight:bold;margin-top:8px}th,td{border:1px solid #7d997f;padding:5px;text-align:left}th{background:#096052;color:white}.number{background:#bbd63d;text-align:right}.total{font-weight:bold}.total td{background:#bbd63d}.total .number{background:#4e4f4f;color:white}</style></head><body><h1>City of Glendale Monthly Report - Faith House Shelter</h1><h2>' + escapeHtml(section.title) + '</h2><p>Selected dates: ' + escapeHtml(start) + ' through ' + escapeHtml(end) + ' (inclusive).</p><p>' + escapeHtml(section.description) + '</p><p>No funder restriction. Individual counts use July 1 fiscal reset and the DES first-count/DV Outreach transfer rule. Individuals and households are separate units and must not be added. Household counts and HoH-only demographics use a CURRENT ACTIVE MEMBERSHIP SNAPSHOT, even for historical dates. Missing data is not zero. Unknowns remain visible. Bed nights exclude checkout/current unfinished night. Review the data-needs section and report audit before submission.</p>' + glendaleTables(name, rows).map((table) => '<table>' + (table.caption ? '<caption>' + escapeHtml(table.caption) + '</caption>' : '') + '<thead><tr>' + table.columns.map((column) => '<th>' + escapeHtml(column.label) + '</th>').join('') + '</tr></thead><tbody>' + table.rows.map((row) => '<tr' + (row.IsTotal ? ' class="total"' : '') + '>' + table.columns.map((column) => '<td' + (typeof row[column.field] === 'number' ? ' class="number"' : '') + '>' + escapeHtml(row[column.field]) + '</td>').join('') + '</tr>').join('') + '</tbody></table>').join('') + '</body></html>'
}
export function downloadGlendaleSection(name: string, dataset: DatasetResult, start: string, end: string, format: 'csv' | 'word') {
  const content = format === 'csv' ? glendaleSectionCsv(name, dataset) : glendaleSectionWord(name, dataset, start, end)
  const url = URL.createObjectURL(new Blob(['\ufeff', content], { type: format === 'csv' ? 'text/csv;charset=utf-8' : 'application/msword;charset=utf-8' })), link = document.createElement('a')
  link.href = url; link.download = `City-of-Glendale-${name}-${start}-${end}.${format === 'csv' ? 'csv' : 'doc'}`; link.click()
  setTimeout(() => URL.revokeObjectURL(url), 1000)
}
