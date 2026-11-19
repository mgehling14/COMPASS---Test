import type { LegacyReport, ReportRow } from './reportTypes'

// Only OVW's State_* monthly references have a confirmed calendar. Other
// agency calendars and budget/capacity references remain deferred.
export function usesOvwFiscalCalendar(report: Pick<LegacyReport, 'id'>): boolean {
  return ['ovw-monthly-report-exhibit-j-v26-1', 'ovw-dq-report-v26-1'].includes(report.id)
}

function date(value: unknown): string {
  const text = String(value ?? '').trim().slice(0, 10)
  if (!/^\d{4}-\d{2}-\d{2}$/.test(text)) return ''
  const [year, month, day] = text.split('-').map(Number)
  if (year < 1900 || year > 9998 || month < 1 || month > 12 || day < 1) return ''
  return new Date(Date.UTC(year, month - 1, day)).toISOString().slice(0, 10) === text ? text : ''
}

export function ovwFiscalPeriod(value: string): { fiscalYear: number; quarter: string } {
  const valid = date(value)
  if (!valid) throw new Error('A valid date is required for the OVW fiscal calendar.')
  const year = Number(valid.slice(0, 4)), month = Number(valid.slice(5, 7))
  return { fiscalYear: month >= 10 ? year + 1 : year, quarter: `Q${Math.floor(((month + 2) % 12) / 3) + 1}` }
}

export function buildOvwFiscalCalendar(parameters: Record<string, unknown>, services: ReportRow[]): ReportRow[] {
  const start = date(parameters.ReportPeriodStart), end = date(parameters.ReportPeriodEnd)
  if (!start || !end || start > end) throw new Error('Choose a valid OVW report start/end date range.')
  const months = new Set<string>()
  // Supply every month of each requested fiscal year, even for an empty report.
  for (let fiscal = ovwFiscalPeriod(start).fiscalYear; fiscal <= ovwFiscalPeriod(end).fiscalYear; fiscal++) {
    for (let index = 0; index < 12; index++) months.add(new Date(Date.UTC(fiscal - 1, 9 + index, 1)).toISOString().slice(0, 7))
  }
  // OVW's original views join Ref_Dates only on Services.DateofService. Include
  // ALL source service months, not just the selected period: earlier services
  // determine the first yearly count and also qualify later stays/exits.
  // Unused historical months cannot join a service, so need not be materialized.
  for (const service of services) {
    const value = date(service.DateofService)
    if (value) months.add(value.slice(0, 7))
  }
  return [...months].sort().map((month) => {
    const start = `${month}-01`, [year, number] = month.split('-').map(Number)
    const { fiscalYear, quarter } = ovwFiscalPeriod(start)
    return { Fiscal_Year: fiscalYear, Quarter: quarter, State_MStart: start,
      State_MEnd: new Date(Date.UTC(year, number, 0)).toISOString().slice(0, 10),
      ANL_MStart: null, ANL_MEnd: null }
  })
}
