export type ImpactPeriod = 'week' | 'month' | 'quarter' | 'fiscal-year'
export type ImpactServiceRecord = {
  id: string; recordId: string; date: string; category: string; service: string; minutes: number
  enrollmentId: string; clientId: string; clientRecordId: string; clientName: string; program: string
}
export type ImpactHelplineRecord = { id: string; recordId: string; date: string; contactType: string; program: string; clientId: string }
export type ImpactMetrics = { services: ImpactServiceRecord[]; calls: ImpactHelplineRecord[]; totalHours: number; clientsServed: number }

function dateKey(date: Date) { return `${date.getFullYear()}-${String(date.getMonth() + 1).padStart(2, '0')}-${String(date.getDate()).padStart(2, '0')}` }
function startOfWeek(date: Date) { const result = new Date(date.getFullYear(), date.getMonth(), date.getDate()); result.setDate(result.getDate() - ((result.getDay() + 6) % 7)); return result }
export function impactPeriodRange(period: ImpactPeriod, now = new Date()) {
  const start = new Date(now.getFullYear(), now.getMonth(), now.getDate())
  let end: Date
  if (period === 'week') { const from = startOfWeek(start); end = new Date(from); end.setDate(end.getDate() + 7); return { from: dateKey(from), toExclusive: dateKey(end) } }
  if (period === 'month') { const from = new Date(start.getFullYear(), start.getMonth(), 1); end = new Date(start.getFullYear(), start.getMonth() + 1, 1); return { from: dateKey(from), toExclusive: dateKey(end) } }
  if (period === 'quarter') { const quarterMonth = Math.floor(start.getMonth() / 3) * 3; const from = new Date(start.getFullYear(), quarterMonth, 1); end = new Date(start.getFullYear(), quarterMonth + 3, 1); return { from: dateKey(from), toExclusive: dateKey(end) } }
  const year = start.getMonth() >= 9 ? start.getFullYear() : start.getFullYear() - 1
  return { from: dateKey(new Date(year, 9, 1)), toExclusive: dateKey(new Date(year + 1, 9, 1)) }
}

export function summarizeImpact(services: ImpactServiceRecord[], calls: ImpactHelplineRecord[]): ImpactMetrics {
  const uniqueServices = [...new Map(services.map((row) => [row.recordId || row.id, row])).values()]
  const uniqueCalls = [...new Map(calls.map((row) => [row.recordId || row.id, row])).values()]
  return { services: uniqueServices, calls: uniqueCalls, totalHours: uniqueServices.reduce((sum, row) => sum + Math.max(0, Number(row.minutes) || 0) / 60, 0), clientsServed: new Set(uniqueServices.map((row) => row.clientId).filter(Boolean)).size }
}
