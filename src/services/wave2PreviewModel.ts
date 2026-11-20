import type { RolePermissionEntry, RolePermissionProfile } from './rolePermissions'

export const WAVE2_PROGRAMS = [
  { id: 'cap', label: 'CAP', description: 'Household applications, eligibility and assistance.' },
  { id: 'ato', label: 'Assets to Opportunity', description: 'Education, business goals and savings.' },
  { id: 'workforce', label: 'MesaCAN Workforce', description: 'Employers, placements and retention.' },
  { id: 'ged', label: 'GED', description: 'Test navigation, preparation and results.' },
  { id: 'financial-wellness', label: 'Financial Wellness', description: 'Goals, coaching and follow-up.' },
] as const
export type Wave2Program = typeof WAVE2_PROGRAMS[number]['id']
export type PreviewMode = 'view' | 'new' | 'edit'
export type PreviewRoute = { program?: Wave2Program; form?: string; mode?: PreviewMode; invalid?: boolean }
export type PreviewForm = { id: string; label: string; permissionKey: string; programs: readonly Wave2Program[]; task: string; source: string; kind: 'shared' | 'proposed' | 'history'; note?: string }
const all = WAVE2_PROGRAMS.map(p => p.id)
const assessmentPrograms: Wave2Program[] = ['cap', 'ato', 'workforce', 'financial-wellness']
function form(id: string, label: string, programs: readonly Wave2Program[], task: string, source: string, existingKey?: string, note?: string): PreviewForm {
  return { id, label, programs, task, source, permissionKey: existingKey || `Wave 2 / ${label}`, kind: existingKey ? 'shared' : 'proposed', note }
}
// Local UI keys only. These are NOT Dataverse table aliases or physical mappings.
export const WAVE2_FORMS: readonly PreviewForm[] = [
  form('client-profile', 'Client Profile', all, '03–05', '107', 'Client Profile'),
  form('program-enrollment', 'Program Enrollment', all, '07', '108', 'Program Enrollment'),
  form('household', 'Household', ['cap', 'workforce', 'financial-wellness'], '06', '112', 'Household', 'Workforce household remains optional pending owner decision D3.'),
  form('employment-income', 'Employment, Income & Benefits', ['cap', 'ato', 'financial-wellness'], '08–09', '109', 'Employment & Benefits'),
  form('client-document', 'Client Electronic Document', all, '09', '117', 'Electronic Document'),
  form('household-document', 'Household Electronic Document', ['cap'], '09', '119', undefined, 'Provisional CAP review route only; program and household parent scope are unconfirmed.'),
  form('services', 'Services', all, '10–13', '110', 'Services'),
  form('ssm-2024', 'Self-Sufficiency Matrix 2024', assessmentPrograms, '14', '160'),
  { ...form('ssm-legacy', 'Legacy Self-Sufficiency Matrix', assessmentPrograms, '14', '118'), kind: 'history', note: 'History shell only; no new entry or editing.' },
  form('goals', 'Goals', ['ato', 'financial-wellness'], '15–16', '138', 'Goals'),
  form('goal-review', 'Goal Review', ['ato', 'financial-wellness'], '15–16', 'Additional concept: Goal Review'),
  form('income-evidence', 'Income Evidence', ['cap'], '08–09', 'Additional concept: Income Evidence'),
  form('cap-application', 'CAP Household Application', ['cap'], '17', '135'),
  form('cap-eligibility', 'CAP Income Determination', ['cap'], '18', '136'),
  form('cap-award', 'CAP Assistance Award', ['cap'], '19', '122'),
  form('cap-notice', 'CAP Decision Notice', ['cap'], '20', '124'),
  form('funder', 'Funding Source', ['cap'], '21', '113', 'Funder'),
  form('contract', 'Funder Contract', ['cap'], '21', '114', 'Funder Contract'),
  form('ato-ledger', 'ATO Transaction Ledger', ['ato'], '22', '151'),
  form('ato-allocation', 'ATO Disbursement Allocation', ['ato'], '22', 'Additional concept: Allocation'),
  form('employer', 'Employer Partner', ['workforce'], '23', '140'),
  form('employer-contact', 'Employer Contact Log', ['workforce'], '23', '145'),
  form('opportunity', 'Employment Opportunity', ['workforce'], '24', '144'),
  form('employer-needs', 'Employer Needs Assessment', ['workforce'], '24', 'Additional concept: Employer Needs', undefined, 'Original assessment instrument is not supplied.'),
  form('placement', 'Employment Placement', ['workforce'], '25', '146'),
  form('retention', 'Retention Follow-up', ['workforce'], '26', '148'),
  form('holland', 'Holland Code Assessment', ['workforce'], '27', '149'),
  form('job-match', 'Job Match Assessment', ['workforce'], '27', 'Additional concept: Job Match', undefined, 'Question content and scoring require original evidence.'),
  form('ged-attempt', 'GED Test Attempt', ['ged'], '28', 'Additional concept: GED Test Attempt'),
  form('pending-item', 'Pending Item', all, '29', 'Additional concept: Pending Item'),
  form('fw-outreach', 'Financial Wellness Outreach', ['financial-wellness'], '29', 'Additional concept: FW outreach'),
  form('event', 'Event', assessmentPrograms, '30', '50', 'Event'),
  form('class-session', 'Class Session', assessmentPrograms, '30', '143 / Additional concept', undefined, 'Program scope is provisional; source form 143 has no program flags.'),
  form('attendance', 'Individual Attendance', assessmentPrograms, '30', '143 / Additional concept', undefined, 'Program scope is provisional; source form 143 has no program flags.'),
]
export type FixtureId = 'authorized' | 'view-only' | 'denied' | 'cap-only' | 'search-only'
export const PERMISSION_FIXTURES: { id: FixtureId; label: string; markers: string[]; assigned: readonly Wave2Program[] }[] = [
  { id: 'authorized', label: 'Authorized fixture', markers: ['X', 'X', 'X', 'X', ''], assigned: all },
  { id: 'view-only', label: 'View-only fixture', markers: ['X', 'X', '', '', ''], assigned: all },
  { id: 'denied', label: 'Denied fixture', markers: ['', '', '', '', ''], assigned: all },
  { id: 'cap-only', label: 'CAP assignment fixture', markers: ['X', 'X', 'X', 'X', ''], assigned: ['cap'] },
  { id: 'search-only', label: 'Search-only fixture', markers: ['', 'X', '', '', ''], assigned: all },
]
export function permissionJson(markers: readonly string[]): Record<string, string[]> {
  return Object.fromEntries(WAVE2_FORMS.map(f => [f.permissionKey, [...markers]]))
}
// Same marker vocabulary and positional JSON shape as rolePermissions.ts:128–166.
// Type-only imports prevent the role service / data client from loading here.
export function previewPermissionEntries(json: unknown): RolePermissionEntry[] {
  let parsed: unknown
  try { parsed = typeof json === 'string' ? JSON.parse(json) : json } catch { return [] }
  if (!parsed || typeof parsed !== 'object' || Array.isArray(parsed)) return []
  const marker = (value: unknown) => ['x', 'true', 'yes', '1'].includes(String(value || '').trim().toLowerCase())
  return Object.entries(parsed).map(([formName, values]) => {
    const row = Array.isArray(values) ? values : []
    return { formName, permissions: { view: marker(row[0]), search: marker(row[1]), create: marker(row[2]), edit: marker(row[3]), ignoreProgramAssignment: marker(row[4]) } }
  })
}
export function previewFixture(id: FixtureId) {
  const fixture = PERMISSION_FIXTURES.find(f => f.id === id) || PERMISSION_FIXTURES[2]
  return { ...fixture, entries: previewPermissionEntries(permissionJson(fixture.markers)) }
}
export function previewAccess(entries: readonly RolePermissionEntry[], assignedPrograms: readonly Wave2Program[], program: Wave2Program, target: PreviewForm) {
  const matching = entries.filter(e => e.formName === target.permissionKey)
  const scoped = matching.filter(e => assignedPrograms.includes(program) || e.permissions.ignoreProgramAssignment)
  const applicable = target.programs.includes(program)
  const allowed = (key: keyof RolePermissionEntry['permissions']) => applicable && scoped.some(e => e.permissions[key])
  return { view: allowed('view'), search: allowed('search'), create: allowed('view') && allowed('create') && target.kind !== 'history', edit: allowed('view') && allowed('edit') && target.kind !== 'history' }
}
// Future adapter: pass profiles already authorized for this program by the host.
// Role-name matching and user/program assignments must be approved before wiring it.
export function previewAccessFromProfiles(profilesForProgram: readonly RolePermissionProfile[], assignedPrograms: readonly Wave2Program[], program: Wave2Program, target: PreviewForm) {
  return previewAccess(profilesForProgram.flatMap(p => p.entries), assignedPrograms, program, target)
}
export function parsePreviewRoute(hash: string): PreviewRoute {
  let parts: string[]
  try { parts = decodeURIComponent(hash.replace(/^#\/?/, '')).replace(/\/$/, '').split('/') } catch { return { invalid: true } }
  if (parts.length === 1 && parts[0] === 'wave2') return {}
  const program = WAVE2_PROGRAMS.find(p => p.id === parts[1])?.id
  if (parts[0] !== 'wave2' || !program) return { invalid: true }
  if (parts.length === 2) return { program }
  const target = WAVE2_FORMS.find(f => f.id === parts[3] && f.programs.includes(program))
  const mode = parts[4] as PreviewMode
  if (parts.length !== 5 || parts[2] !== 'forms' || !target || !['view', 'new', 'edit'].includes(mode)) return { invalid: true }
  return { program, form: target.id, mode }
}
export function previewPath(program?: Wave2Program, target?: string, mode: PreviewMode = 'view') {
  return `#/wave2${program ? `/${program}` : ''}${program && target ? `/forms/${target}/${mode}` : ''}`
}
export const SYNTHETIC_CLIENTS = [{ id: 'sample-alex', name: 'Alex Sample', reference: 'DEMO-001' }, { id: 'sample-jordan', name: 'Jordan Example', reference: 'DEMO-002' }]
export const SYNTHETIC_ENROLLMENTS = all.flatMap(program => SYNTHETIC_CLIENTS.map((client, index) => ({ id: `demo-${program}-${index + 1}`, clientId: client.id, program, label: `${program.toUpperCase()} · ${index ? 'Closed example' : 'Active example'}` })))
export type PreviewDraft = { clientId: string; enrollmentId: string; reviewDate: string; notes: string }
export const blankPreviewDraft = (): PreviewDraft => ({ clientId: '', enrollmentId: '', reviewDate: '', notes: '' })
export function examplePreviewDraft(program: Wave2Program): PreviewDraft {
  return { clientId: SYNTHETIC_CLIENTS[0].id, enrollmentId: `demo-${program}-1`, reviewDate: '2026-11-20', notes: 'Synthetic example for reviewing the preview workspace. No record will be saved.' }
}
export function validatePreviewDraft(draft: PreviewDraft, program: Wave2Program): Partial<Record<keyof PreviewDraft, string>> {
  const errors: Partial<Record<keyof PreviewDraft, string>> = {}
  if (!SYNTHETIC_CLIENTS.some(c => c.id === draft.clientId)) errors.clientId = 'Choose a synthetic client.'
  if (!SYNTHETIC_ENROLLMENTS.some(e => e.id === draft.enrollmentId && e.clientId === draft.clientId && e.program === program)) errors.enrollmentId = 'Choose an enrollment for this client and program.'
  const date = new Date(`${draft.reviewDate}T00:00:00Z`)
  if (!/^\d{4}-\d{2}-\d{2}$/.test(draft.reviewDate) || !Number.isFinite(date.getTime()) || date.toISOString().slice(0, 10) !== draft.reviewDate) errors.reviewDate = 'Enter a valid review date.'
  if (draft.notes.length > 500) errors.notes = 'Keep example notes to 500 characters.'
  return errors
}
