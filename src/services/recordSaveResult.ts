export type RecordSaveChoice = 'search' | 'remain' | 'client'
export type RecordSaveResult = {
  status: 'saved' | 'failed' | 'partial' | 'unconfirmed'
  formName: string
  formKind?: string
  recordId: string
  rowId: string
  isNew: boolean
  details?: string
  clientId?: string
  enrollmentId?: string
}
export function recordSaveMessage(result: RecordSaveResult): string {
  const name = String(result.formName || 'Form').trim()
  const record = `Your ${result.isNew ? 'new ' : ''}${name} record`
  const identity = result.recordId ? ` with record id ${result.recordId}` : ''
  if (result.status === 'saved') return `${record} has been saved${identity}!`
  if (result.status === 'partial') return `${record} was saved${identity}, but some related updates could not be completed. Remain on this record to review the issue.`
  if (result.status === 'unconfirmed') return `${record}'s save could not yet be confirmed${identity}. Your form remains open. Saving again will check this same record before attempting any further changes.`
  return `${record} could not be saved. Your changes are still on this form. Please review the issue and try again.`
}
const guid = (value: unknown) => {
  const id = String(value || '').trim().replace(/[{}]/g, '').toLowerCase()
  return /^[a-f\d]{8}-[a-f\d]{4}-[a-f\d]{4}-[a-f\d]{4}-[a-f\d]{12}$/.test(id) ? id : ''
}
export function savedFormClientTarget(session: { kind: string; rowId: string; values: Record<string, string | undefined> },
  enrollments: Array<{ id: string; clientRowId?: string }>): { clientId: string; enrollmentId: string } {
  if (session.kind === 'client-profile') return { clientId: guid(session.rowId), enrollmentId: '' }
  // Standalone records must never inherit an unrelated cached client profile.
  if (['event', 'household', 'contract', 'funder-transaction', 'message', 'funder'].includes(session.kind)) return { clientId: '', enrollmentId: '' }
  const enrollmentId = guid(session.values.cmps_peid || session.values.cmps_programenrollment)
  const enrollment = enrollments.find((entry) => guid(entry.id) === enrollmentId)
  const directClientId = guid(session.values.cmps_cpid || session.values.cmps_clientid)
  return { clientId: directClientId || guid(enrollment?.clientRowId), enrollmentId }
}
