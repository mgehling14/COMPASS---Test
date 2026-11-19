type Profile = { id: string; recordId: string; values: Record<string, string | undefined> }
type Session = { kind: string; rowId?: string; values: Record<string, string | undefined> }
const normalizedId = (value: unknown) => String(value ?? '').trim().replace(/[{}]/g, '').toLowerCase()
const STANDALONE = new Set(['client-profile', 'event', 'household', 'contract', 'funder-transaction'])
export function getFormClientContext(session: Session | null, opened: Profile | null,
  original: Profile | null | undefined, enrollments: Array<{ id: string; clientRowId?: string }>): { recordId: string; name: string } | null {
  if (!session || STANDALONE.has(session.kind)) return null
  const clientId = normalizedId(session.values.cmps_clientid || session.values.cmps_cpid)
  const enrollmentId = normalizedId(session.values.cmps_peid || session.values.cmps_programenrollment)
  const candidate = [original, opened].find((profile) => profile && (!clientId || normalizedId(profile.id) === clientId))
  if (!candidate) return null
  if (clientId && clientId !== normalizedId(candidate.id)) return null
  if (enrollmentId) {
    const parent = enrollments.find((row) => normalizedId(row.id) === enrollmentId)
    if (!parent || parent.clientRowId && normalizedId(parent.clientRowId) !== normalizedId(candidate.id)) return null
  }
  // Without a link yet (e.g. a new Service awaiting enrollment selection),
  // only the captured opened-profile workflow can provide this context.
  if (!clientId && !enrollmentId && !original) return null
  return { recordId: candidate.recordId || candidate.id,
    name: [candidate.values.cmps_name, candidate.values.cmps_middlename, candidate.values.cmps_lastname].map((value) => String(value || '').trim()).filter(Boolean).join(' ') || 'Name not recorded' }
}

