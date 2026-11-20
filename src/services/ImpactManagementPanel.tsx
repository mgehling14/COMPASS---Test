import { useEffect, useMemo, useState } from 'react'
import { loadStaffImpact } from './impactMetrics'
import type { ImpactHelplineRecord, ImpactMetrics, ImpactPeriod, ImpactServiceRecord } from './impactMath'
import ActiveClientRoster from './ActiveClientRosterPanel'
import type { ActiveRosterRow } from './activeClientRoster'

type DetailSelection = { title: string; services?: ImpactServiceRecord[]; calls?: ImpactHelplineRecord[] }
type Props = {
  staffName: string
  onOpenService: (record: ImpactServiceRecord) => boolean
  onOpenHelpline: (record: ImpactHelplineRecord) => boolean
  onOpenClient: (clientId: string, recordId: string) => boolean
  authorizedPrograms: string[]
  onOpenRosterClient: (row: ActiveRosterRow) => boolean
  onOpenRosterProgramEnrollment: (row: ActiveRosterRow) => boolean
  onOpenRosterService: (row: ActiveRosterRow) => boolean
  onOpenRosterBedEnrollment: (row: ActiveRosterRow) => boolean
}
type Slice = { label: string; value: number; color: string }
const COLORS = ['#15766f', '#76a84a', '#d1843d', '#4f7894', '#a46783', '#8d8153', '#687c53', '#697bb3', '#9b6848', '#6c9a90']
const PERIODS: Array<{ key: ImpactPeriod; label: string }> = [
  { key: 'week', label: 'This Week' }, { key: 'month', label: 'This Month' }, { key: 'quarter', label: 'This Quarter' }, { key: 'fiscal-year', label: 'This Fiscal Year' },
]
const money = (value: number) => value.toLocaleString(undefined, { minimumFractionDigits: value % 1 ? 1 : 0, maximumFractionDigits: 1 })

function describeArc(cx: number, cy: number, radius: number, start: number, end: number) {
  const point = (angle: number) => { const radians = (angle - 90) * Math.PI / 180; return [cx + radius * Math.cos(radians), cy + radius * Math.sin(radians)] }
  const [x1, y1] = point(start), [x2, y2] = point(end)
  const large = end - start > 180 ? 1 : 0
  return `M ${cx} ${cy} L ${x1} ${y1} A ${radius} ${radius} 0 ${large} 1 ${x2} ${y2} Z`
}

function ImpactPie({ title, slices, total, valueLabel, onPick }: { title: string; slices: Slice[]; total: number; valueLabel: (value: number) => string; onPick: (label: string) => void }) {
  const visible = slices.filter((slice) => slice.value > 0)
  let angle = 0
  return <section className="impact-chart-card">
    <header><p className="eyebrow">Breakdown</p><h3>{title}</h3></header>
    {visible.length ? <div className="impact-chart-layout">
      <svg className="impact-pie" viewBox="0 0 200 200" role="img" aria-label={`${title} pie chart`}>
        {visible.map((slice) => {
          const start = angle, end = angle + slice.value / total * 360; angle = end
          return <path key={slice.label} d={describeArc(100, 100, 94, start, end)} fill={slice.color} role="button" tabIndex={0} aria-label={`${slice.label}: ${valueLabel(slice.value)}. View records`} onClick={() => onPick(slice.label)} onKeyDown={(event) => { if (event.key === 'Enter' || event.key === ' ') { event.preventDefault(); onPick(slice.label) } }}><title>{slice.label}: {valueLabel(slice.value)}</title></path>
        })}
        <circle cx="100" cy="100" r="49" className="impact-pie-hole" />
        <text x="100" y="96" className="impact-pie-total">{valueLabel(total)}</text><text x="100" y="116" className="impact-pie-caption">total</text>
      </svg>
      <div className="impact-chart-legend">{visible.map((slice) => <button key={slice.label} type="button" className="impact-legend-item" onClick={() => onPick(slice.label)}><span style={{ backgroundColor: slice.color }} /> <span>{slice.label}</span><strong>{valueLabel(slice.value)}</strong></button>)}</div>
    </div> : <p className="hint">No records in this period.</p>}
  </section>
}

export default function ImpactManagementPanel({ staffName, onOpenService, onOpenHelpline, onOpenClient, authorizedPrograms, onOpenRosterClient, onOpenRosterProgramEnrollment, onOpenRosterService, onOpenRosterBedEnrollment }: Props) {
  const [period, setPeriod] = useState<ImpactPeriod>('month')
  const [metrics, setMetrics] = useState<ImpactMetrics | null>(null)
  const [loading, setLoading] = useState(true)
  const [error, setError] = useState('')
  const [detail, setDetail] = useState<DetailSelection | null>(null)
  useEffect(() => {
    const controller = new AbortController(); setLoading(true); setError('')
    void loadStaffImpact(staffName, period, controller.signal).then(setMetrics).catch((reason) => { if (!controller.signal.aborted) { setMetrics(null); setError(String((reason as Error)?.message || reason)) } }).finally(() => { if (!controller.signal.aborted) setLoading(false) })
    return () => controller.abort()
  }, [staffName, period])

  const categories = useMemo(() => {
    const map = new Map<string, number>(); for (const row of metrics?.services || []) map.set(row.category, (map.get(row.category) || 0) + row.minutes / 60)
    return [...map].map(([label, value], index) => ({ label, value, color: COLORS[index % COLORS.length] })).sort((a, b) => b.value - a.value)
  }, [metrics])
  const services = useMemo(() => {
    const map = new Map<string, number>(); for (const row of metrics?.services || []) map.set(row.service, (map.get(row.service) || 0) + 1)
    return [...map].map(([label, value], index) => ({ label, value, color: COLORS[index % COLORS.length] })).sort((a, b) => b.value - a.value)
  }, [metrics])
  const totalServiceCount = metrics?.services.length || 0
  const pickCategory = (category: string) => setDetail({ title: `Services · ${category}`, services: (metrics?.services || []).filter((row) => row.category === category) })
  const pickService = (service: string) => setDetail({ title: `Services · ${service}`, services: (metrics?.services || []).filter((row) => row.service === service) })

  return <div className="impact-management">
    <section className="panel spotlight hub-hero impact-hero"><div><p className="eyebrow">Reports</p><h2>Impact Management</h2><p className="subtitle">A personal view of DV and SV service activity, calls, and client reach.</p></div><div className="impact-period-picker" role="group" aria-label="My Impact reporting period">{PERIODS.map((entry) => <button key={entry.key} type="button" className={period === entry.key ? 'active' : ''} aria-pressed={period === entry.key} onClick={() => setPeriod(entry.key)}>{entry.label}</button>)}</div></section>
    <section className="impact-section">
      <div className="impact-section-heading"><div><p className="eyebrow">Staff activity</p><h2>My Impact</h2></div><span className="impact-staff-label">{staffName || 'Current staff member'}</span></div>
      {loading ? <div className="panel"><p className="hint" role="status">Loading your impact for {PERIODS.find((item) => item.key === period)?.label.toLowerCase()}…</p></div> : error ? <div className="panel"><p className="error" role="alert">My Impact could not be loaded. {error}</p></div> : <>
        <div className="impact-kpis">
          <button type="button" className="panel impact-kpi" onClick={() => setDetail({ title: 'Services · All service hours', services: metrics?.services || [] })}><span>Total Service Hours</span><strong>{money(metrics?.totalHours || 0)}</strong><small>Click to see contributing service records</small></button>
          <button type="button" className="panel impact-kpi" onClick={() => setDetail({ title: 'Helpline · Calls', calls: metrics?.calls || [] })}><span>Number of Calls</span><strong>{(metrics?.calls.length || 0).toLocaleString()}</strong><small>Click to see helpline records</small></button>
          <button type="button" className="panel impact-kpi" onClick={() => setDetail({ title: 'Clients Served', services: [...new Map<string, ImpactServiceRecord>((metrics?.services || []).filter((row) => row.clientId).map((row) => [row.clientId, row] as const)).values()] })}><span>Number of Clients Served</span><strong>{(metrics?.clientsServed || 0).toLocaleString()}</strong><small>Distinct clients with a service record</small></button>
        </div>
        <div className="impact-charts">
          <ImpactPie title="Service Hours by Service Category" slices={categories} total={metrics?.totalHours || 0} valueLabel={(value) => `${money(value)}h`} onPick={pickCategory} />
          <ImpactPie title="Number of Services by Service" slices={services} total={totalServiceCount} valueLabel={(value) => Math.round(value).toLocaleString()} onPick={pickService} />
        </div>
        <p className="impact-data-note">Counts use unique service and helpline record IDs. Service hours are calculated from recorded service minutes; clients served are distinct client profiles linked to your services.</p>
      </>}
    </section>
    <ActiveClientRoster authorizedPrograms={authorizedPrograms} onOpenClient={onOpenRosterClient} onOpenProgramEnrollment={onOpenRosterProgramEnrollment} onOpenService={onOpenRosterService} onOpenBedEnrollment={onOpenRosterBedEnrollment} />
    {detail ? <div className="impact-dialog-backdrop" role="presentation" onMouseDown={(event) => { if (event.target === event.currentTarget) setDetail(null) }}><section className="panel impact-dialog" role="dialog" aria-modal="true" aria-labelledby="impact-dialog-title"><header className="impact-dialog-header"><div><p className="eyebrow">My Impact detail</p><h2 id="impact-dialog-title">{detail.title}</h2><p className="hint">{detail.services?.length ?? detail.calls?.length ?? 0} record(s) contribute to this selection.</p></div><button type="button" className="secondary" onClick={() => setDetail(null)}>Close</button></header>
      <div className="impact-detail-list">{detail.services ? detail.services.length ? detail.services.map((row) => <article className="impact-detail-row" key={row.id}><div className="impact-detail-primary"><strong>{row.recordId || 'Service record'}</strong><span>{row.date || 'Date not recorded'} · {row.category} · {row.service}</span><small>{row.clientName || 'Client'}{row.clientRecordId ? ` · ${row.clientRecordId}` : ''}{row.program ? ` · ${row.program}` : ''}</small></div><span className="impact-detail-hours">{money(row.minutes / 60)}h</span><button type="button" className="secondary impact-open-link" onClick={() => { if (onOpenService(row)) setDetail(null) }}>Open Service</button>{row.clientId ? <button type="button" className="secondary impact-open-link" onClick={() => { if (onOpenClient(row.clientId, row.clientRecordId)) setDetail(null) }}>Open Client</button> : null}</article>) : <p className="hint">No service records in this selection.</p> : detail.calls?.length ? detail.calls.map((row) => <article className="impact-detail-row" key={row.id}><div className="impact-detail-primary"><strong>{row.recordId || 'Helpline record'}</strong><span>{row.date || 'Date not recorded'} · {row.contactType}{row.program ? ` · ${row.program}` : ''}</span></div>{row.clientId ? <button type="button" className="secondary impact-open-link" onClick={() => { if (onOpenClient(row.clientId, '')) setDetail(null) }}>Open Client</button> : null}<button type="button" className="secondary impact-open-link" onClick={() => { if (onOpenHelpline(row)) setDetail(null) }}>Open Helpline</button></article>) : <p className="hint">No call records in this period.</p>}</div>
    </section></div> : null}
  </div>
}
