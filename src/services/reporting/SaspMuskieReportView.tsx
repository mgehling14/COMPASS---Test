import { useState } from 'react'
import { downloadSaspSection } from './saspMuskieExport'
import SaspMuskieDemographics from './SaspMuskieDemographics'
import { SASP_MUSKIE_SECTIONS, saspCell } from './saspMuskiePlan'
import { SASP_REFERENCE_CHECKLIST } from './saspMuskieSupplement'
import type { LegacyReportResult, ReportRow } from './reportTypes'

function periodGroups(rows: ReportRow[]) {
  const groups = new Map<string, ReportRow[]>()
  for (const row of rows) {
    const key = String(row.Period)
    const group = groups.get(key) || []; group.push(row); groups.set(key, group)
  }
  return groups
}
export default function SaspMuskieReportView({ result, parameters }: { result: LegacyReportResult; parameters: Record<string, unknown>; expandDetails?: boolean }) {
  const [error, setError] = useState('')
  const start = String(parameters.ReportPeriodStart || ''), end = String(parameters.ReportPeriodEnd || '')
  return <div className="legacy-report-output sasp-muskie-output">
    <h3>SASP MUSKIE Report — REACH Center</h3>
    <p>Report dates: {start} through {end} (inclusive). Generated {result.generatedAt}.</p>
    <p className="hint">Services funder = SASP; linked enrollment program = REACH Center. Monthly results are grouped first, followed by annual results. Periods are clipped to the selected dates; distinct clients are recalculated within each period.</p>
    <p className="hint">Age is calculated from Client Profile DOB at the first qualifying service in each period. Missing demographics remain Unknown; missing minutes do not remove a client or service. Calls counts every qualifying service regardless of Meeting Mode. Client Services and Calls report the same records; do not add their counts together. Review this initial report before official use.</p>
    {error ? <p className="error" role="alert">{error}</p> : null}
    {(['Monthly', 'Annual'] as const).map((frequency) => <section className="sasp-muskie-frequency" key={frequency} aria-labelledby={`sasp-${frequency.toLowerCase()}-heading`}>
      <h4 className="sasp-muskie-frequency-heading" id={`sasp-${frequency.toLowerCase()}-heading`}>{frequency}</h4>
      <p className="hint">{frequency === 'Monthly' ? 'All sections for each selected month.' : 'All sections for each selected calendar year.'} Section downloads include only these {frequency.toLowerCase()} results. Sections 4-6 supplement the original report using current recorded fields; they do not change sections 1-3.</p>
      {SASP_MUSKIE_SECTIONS.map((section) => {
        const dataset = result.datasets[section.name]
        const periodRows = dataset?.rows?.filter((row) => row.PeriodType === frequency) || []
        const unavailable = !dataset || dataset.unavailable || !Array.isArray(dataset.rows) || !periodRows.length
        function download(format: 'csv' | 'word') {
          if (unavailable || !dataset) return
          try { setError(''); downloadSaspSection(section.name, dataset, start, end, format, frequency) } catch (failure) { setError(String((failure as Error)?.message || failure)) }
        }
        return <section className="legacy-report-section sasp-muskie-section" key={section.name}>
          <h5 className="sasp-muskie-section-heading">{section.title}</h5><p className="hint">{section.description}</p>
          <div className="legacy-report-actions"><button type="button" className="secondary" aria-label={`Download ${frequency} ${section.title} CSV`} disabled={!!unavailable} onClick={() => download('csv')}>Download section CSV</button><button type="button" className="secondary" aria-label={`Download ${frequency} ${section.title} Word`} disabled={!!unavailable} onClick={() => download('word')}>Download section Word</button></div>
          {unavailable ? <p className="legacy-report-unavailable">{dataset?.unavailable || `No ${frequency.toLowerCase()} period data was returned for this section.`} No zero count has been substituted.</p> : [...periodGroups(periodRows).entries()].map(([period, rows]) => <div className="sasp-muskie-period" key={period}>
            {section.name === 'SASP_ClientsServed' ? <SaspMuskieDemographics rows={rows} /> : <div className="legacy-report-scroll"><table className="sasp-muskie-table"><caption>{period} · {String(rows[0].PeriodStart)} through {String(rows[0].PeriodEnd)}</caption><thead><tr>{section.columns.filter((column) => !column.startsWith('Period')).map((column) => <th scope="col" key={column}>{column.replace(/([a-z])([A-Z])/g, '$1 $2')}</th>)}</tr></thead><tbody>{rows.map((row, index) => <tr key={index} className={row.IsTotal ? 'sasp-muskie-total' : undefined}>{section.columns.filter((column) => !column.startsWith('Period')).map((column) => <td key={column} className={typeof row[column] === 'number' ? 'sasp-muskie-number' : undefined}>{typeof row[column] === 'number' && column === 'KnownHours' ? Number(row[column]).toLocaleString('en-US', { maximumFractionDigits: 2 }) : saspCell(row, column)}</td>)}</tr>)}</tbody></table></div>}
          </div>)}
        </section>
      })}
    </section>)}
    <section className="legacy-report-section sasp-muskie-section" aria-label="PDF reference mapping checklist">
      <h4 className="sasp-muskie-section-heading">{SASP_REFERENCE_CHECKLIST.title}</h4>
      <p className="hint">Reviewed against the SASP 2024 Muskie Annual Report. Historical values, contacts, grant details and narratives are not reused. This is not yet a complete official submission: the current all-client cohort is unchanged, and the old PDF's primary/fully-served rules need confirmed mappings.</p>
      <div className="legacy-report-actions">{(['csv', 'word'] as const).map((format) => <button type="button" className="secondary" key={format} disabled={!result.datasets[SASP_REFERENCE_CHECKLIST.name]?.rows} onClick={() => { try { setError(''); downloadSaspSection(SASP_REFERENCE_CHECKLIST.name, result.datasets[SASP_REFERENCE_CHECKLIST.name], start, end, format) } catch (failure) { setError(String((failure as Error)?.message || failure)) } }}>Download checklist {format === 'word' ? 'Word' : 'CSV'}</button>)}</div>
      <div className="legacy-report-scroll"><table className="sasp-muskie-table"><thead><tr><th scope="col">Reference area</th><th scope="col">Status</th><th scope="col">Next step / limitation</th></tr></thead><tbody>{result.datasets[SASP_REFERENCE_CHECKLIST.name]?.rows?.map((row, index) => <tr key={index}><td>{saspCell(row, 'ReferenceArea')}</td><td>{saspCell(row, 'Status')}</td><td>{saspCell(row, 'NextStep')}</td></tr>)}</tbody></table></div>
    </section>
  </div>
}
