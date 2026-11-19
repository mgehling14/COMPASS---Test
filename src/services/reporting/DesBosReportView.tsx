import { DES_BOS_EXHIBIT_A_DATASET, DES_BOS_EXHIBIT_A_ID, DES_BOS_EXHIBIT_D_DATASET } from './desBosPlan'
import type { LegacyReport, LegacyReportResult, ReportRow } from './reportTypes'

const cell = (row: ReportRow, field: string) => String(row[field] ?? '')
const number = (row: ReportRow, field: string) => Number(row[field] || 0)

function monthLabel(value: unknown): string {
  const match = /^(\d{4})-(\d{2})$/.exec(String(value || ''))
  if (!match) return String(value || '')
  return new Intl.DateTimeFormat('en-US', { month: 'long', year: 'numeric', timeZone: 'UTC' }).format(new Date(Date.UTC(Number(match[1]), Number(match[2]) - 1, 1)))
}

function shortDate(value: unknown): string {
  const match = /^(\d{4})-(\d{2})-(\d{2})/.exec(String(value || ''))
  return match ? `${Number(match[2])}/${Number(match[3])}/${match[1].slice(-2)}` : String(value || '')
}

function unavailable(result: LegacyReportResult, name: string) {
  const dataset = result.datasets[name]
  return !dataset || dataset.unavailable || !Array.isArray(dataset.rows) ? dataset?.unavailable || 'This report was not returned.' : ''
}

function ExhibitA({ result, month }: { result: LegacyReportResult; month: string }) {
  const error = unavailable(result, DES_BOS_EXHIBIT_A_DATASET)
  if (error) return <p className="legacy-report-unavailable">{error} No empty result has been substituted.</p>
  const rows = result.datasets[DES_BOS_EXHIBIT_A_DATASET].rows || []
  const total = rows.reduce((sum, row) => sum + number(row, 'HouseholdsAffected'), 0)
  return <section className="des-bos-form des-bos-exhibit-a">
    <header><h3>Exhibit A</h3><p>Arizona Department of Economic Security</p><h4>Unable to Serve Summary</h4></header>
    <dl className="des-bos-form-meta">
      <div><dt>Month &amp; Year:</dt><dd>{monthLabel(month)}</dd></div>
      <div><dt>Agency &amp; Program Name:</dt><dd>A New Leaf, CAAFA Shelter</dd></div>
      <div><dt># of Households Unable to Serve:</dt><dd>{total.toLocaleString()}</dd></div>
    </dl>
    <p className="des-bos-directions">Directions: Below indicate the Number of persons/households who could not be served.</p>
    <div className="legacy-report-scroll"><table><thead><tr><th scope="col">Reasons Program was Unable to Serve:</th><th scope="col"># of Households Affected:</th></tr></thead><tbody>{rows.map((row, index) => <tr key={`${cell(row, 'ReasonProgramWasUnableToServe')}-${index}`}><td>{cell(row, 'ReasonProgramWasUnableToServe')}</td><td className="des-bos-number">{number(row, 'HouseholdsAffected').toLocaleString()}</td></tr>)}</tbody></table></div>
  </section>
}

const EXHIBIT_D_COLUMNS = [
  ['TypeOfService', 'Type of Service'],
  ['HMISNumber', 'HMIS Number:'],
  ['NameOfAgency', 'Name of Agency'],
  ['DateReferred', 'Date Referred'],
  ['CommentsFollowUp', 'Comments/Follow-Up'],
  ['Other', 'Other'],
] as const

function ExhibitD({ result }: { result: LegacyReportResult }) {
  const error = unavailable(result, DES_BOS_EXHIBIT_D_DATASET)
  if (error) return <p className="legacy-report-unavailable">{error} No empty result has been substituted.</p>
  const rows = result.datasets[DES_BOS_EXHIBIT_D_DATASET].rows || []
  return <section className="des-bos-form des-bos-exhibit-d">
    <header><h3>Exhibit D</h3><p>Arizona Department of Economic Security</p><h4>Mainstream Service Referral Log</h4></header>
    <dl className="des-bos-form-meta"><div><dt>Agency Name:</dt><dd>A New Leaf</dd></div><div><dt>Program:</dt><dd>CAAFA Shelter</dd></div></dl>
    {rows.length === 0 ? <p className="hint">No matching referral records were found for the selected month.</p>
      : <div className="legacy-report-scroll"><table><caption>{rows.length.toLocaleString()} referral row(s)</caption><thead><tr>{EXHIBIT_D_COLUMNS.map(([, label]) => <th scope="col" key={label}>{label}</th>)}</tr></thead><tbody>{rows.map((row, index) => <tr key={`${cell(row, '__reportRowId')}-${index}`}>{EXHIBIT_D_COLUMNS.map(([field]) => <td key={field}>{field === 'DateReferred' ? shortDate(row[field]) : cell(row, field)}</td>)}</tr>)}</tbody></table></div>}
  </section>
}

export default function DesBosReportView({ report, result, parameters }: { report: LegacyReport; result: LegacyReportResult; parameters: Record<string, unknown> }) {
  const month = String(parameters.ReportMonth || '')
  return <div className="legacy-report-output des-bos-report-output">
    <p className="hint">Report month: {monthLabel(month)}. Generated {result.generatedAt}.</p>
    {report.id === DES_BOS_EXHIBIT_A_ID ? <ExhibitA result={result} month={month} /> : <ExhibitD result={result} />}
  </div>
}
