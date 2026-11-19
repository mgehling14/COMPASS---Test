import { saspDemographicTables } from './saspDemographicLayout'
import { saspCell } from './saspMuskiePlan'
import type { ReportRow } from './reportTypes'

export default function SaspMuskieDemographics({ rows }: { rows: ReportRow[] }) {
  const period = rows[0]
  return <div className="sasp-muskie-demographics">
    <p className="sasp-muskie-demographic-period">{String(period.Period)} · {String(period.PeriodStart)} through {String(period.PeriodEnd)}</p>
    <div className="legacy-report-scroll">{saspDemographicTables(rows).map((group) => <table className="sasp-muskie-table sasp-muskie-demographic-table" key={group.name} aria-label={`${String(period.Period)} ${group.heading}`}>
      <thead><tr><th scope="col">{group.heading}</th><th scope="col">Total</th></tr></thead>
      <tbody>{group.rows.map((row, index) => <tr key={index}><td>{saspCell(row, 'Category')}</td><td className="sasp-muskie-number">{saspCell(row, 'Clients')}</td></tr>)}</tbody>
      {group.total !== undefined && group.total !== null ? <tfoot><tr className="sasp-muskie-total"><td title="Distinct clients in this period">Total</td><td className="sasp-muskie-number">{String(group.total)}</td></tr></tfoot> : null}
    </table>)}</div>
    <p className="hint sasp-muskie-demographic-note">Totals show distinct clients in this period. Multi-selection categories can overlap.</p>
  </div>
}
