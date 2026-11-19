import { useState } from 'react'
import { GLENDALE_SECTIONS } from './glendalePlan'
import { downloadGlendaleSection } from './glendaleExport'
import { glendaleTables } from './glendaleLayout'
import type { LegacyReportResult } from './reportTypes'

export default function GlendaleReportView({ result, parameters }: { result: LegacyReportResult; parameters: Record<string, unknown> }) {
  const [error, setError] = useState('')
  const start = String(parameters.ReportPeriodStart || ''), end = String(parameters.ReportPeriodEnd || '')
  return <div className="legacy-report-output sasp-muskie-output glendale-report-output">
    <h3>City of Glendale Monthly Report - Faith House Shelter</h3>
    <p>Selected dates: {start} through {end} (inclusive). Generated {result.generatedAt}.</p>
    <p className="hint">No funder filter. The fiscal year is July 1 through June 30. Every qualifying person is counted individually; households are a separate count. First fiscal-year counts are rebuilt from all programs using the DES rule and one DV Outreach transfer exception. Bed nights are independent of first-year counts.</p>
    <p className="legacy-report-unavailable">Current household membership snapshot: household counts and Head-of-Household-only demographics use current active membership, not historical membership. Changes in current membership may change past-period reruns. Do not add individual and household totals together.</p>
    {error ? <p role="alert" className="error">{error}</p> : null}
    {GLENDALE_SECTIONS.map((section) => {
      const dataset = result.datasets[section.name], unavailable = !dataset || dataset.unavailable || !Array.isArray(dataset.rows)
      return <section className="legacy-report-section" key={section.name}>
        <h4 className="sasp-muskie-section-heading">{section.title}</h4><p className="hint">{section.description}</p>
        <div className="legacy-report-actions">{(['csv', 'word'] as const).map((format) => <button type="button" className="secondary" key={format} aria-label={`Download ${section.title} ${format === 'word' ? 'Word' : 'CSV'}`} disabled={!!unavailable} onClick={() => { if (unavailable || !dataset) return; try { setError(''); downloadGlendaleSection(section.name, dataset, start, end, format) } catch (failure) { setError(String((failure as Error)?.message || failure)) } }}>Download section {format === 'word' ? 'Word' : 'CSV'}</button>)}</div>
        {unavailable ? <p className="legacy-report-unavailable">{dataset?.unavailable || 'This section was not returned.'} No zero count has been substituted.</p> : glendaleTables(section.name, dataset.rows!).map((table, index) => <div className="legacy-report-scroll" key={index}><table className="sasp-muskie-table">{table.caption ? <caption>{table.caption}</caption> : null}<thead><tr>{table.columns.map((column) => <th scope="col" key={column.field}>{column.label}</th>)}</tr></thead><tbody>{table.rows.map((row, rowIndex) => <tr key={rowIndex} className={row.IsTotal ? 'sasp-muskie-total' : undefined}>{table.columns.map((column) => <td key={column.field} className={typeof row[column.field] === 'number' ? 'sasp-muskie-number' : undefined}>{String(row[column.field] ?? '')}</td>)}</tr>)}</tbody></table></div>)}
      </section>
    })}
  </div>
}
