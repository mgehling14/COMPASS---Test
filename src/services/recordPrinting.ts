import { CLIENT_RECORD_SOURCES, CLIENT_RECORD_LABELS, loadClientConsentFormRecord, type ClientConsentFormKind } from './clientConsentForms'
import { listClientLinkedRecords, type ClientLinkedRecordSource } from './clientLinkedRecords'
import { CLIENT_PROFILE_TABLE_ALIAS, CLIENT_PROFILE_PRIMARY_ID_FIELD, loadClientProfileDetailRecord } from './clientProfile'
import { PROGRAM_ENROLLMENT_TABLE_ALIAS, PROGRAM_ENROLLMENT_PRIMARY_ID_FIELD, loadProgramEnrollmentDetailRecord } from './programEnrollment'
import { SERVICES_TABLE_ALIAS, SERVICES_PRIMARY_ID_FIELD, loadServicesDetailRecord } from './services'
import { BED_ENROLLMENTS_TABLE_ALIAS, BED_ENROLLMENTS_PRIMARY_ID_FIELD, loadBedEnrollmentDetailRecord } from './bedEnrollment'
import { HELPLINES_TABLE_ALIAS, HELPLINES_PRIMARY_ID_FIELD, loadHelplineDetailRecord } from './helpline'
import { CHILD_SAFETY_PLANS_TABLE_ALIAS, CHILD_SAFETY_PLANS_PRIMARY_ID_FIELD, loadChildSafetyPlanDetailRecord } from './childSafetyPlan'
import { ELECTRONIC_DOCUMENTS_TABLE_ALIAS, ELECTRONIC_DOCUMENTS_PRIMARY_ID_FIELD, loadElectronicDocumentDetailRecord } from './electronicDocument'
import { ADULT_ASSESSMENTS_TABLE_ALIAS, ADULT_ASSESSMENTS_PRIMARY_ID_FIELD, loadAdultAssessmentDetailRecord } from './adultAssessment'
import { HEALTH_WELLNESS_TABLE_ALIAS, HEALTH_WELLNESS_PRIMARY_ID_FIELD, loadHealthWellnessDetailRecord } from './healthAndWellnessQuestionnaire'
import { GOALS_TABLE_ALIAS, GOALS_PRIMARY_ID_FIELD, loadGoalDetailRecord } from './goals'
import { FOCUS_PLANS_TABLE_ALIAS, FOCUS_PLANS_PRIMARY_ID_FIELD, loadFocusPlanDetailRecord } from './focusPlan'
import { INITIAL_SAFETY_PLANS_TABLE_ALIAS, INITIAL_SAFETY_PLANS_PRIMARY_ID_FIELD, loadInitialSafetyPlanDetailRecord } from './initialSafetyPlan'
import { HOUSEHOLDS_TABLE_ALIAS, loadHouseholdDetailRecord, listHouseholdsByIds } from './household'
import { listHouseholdHistoriesForClient } from './householdHistory'
import { EVENTS_TABLE_ALIAS } from './event'

export type PrintRecordRef = { key: string; kind: string; formName: string; id: string; recordId: string; summary?: string }
export type PrintRecordGroup = { kind: string; formName: string; records: PrintRecordRef[]; error?: string }
export type PrintCatalog = { clientId: string; enrollmentIds: string[]; groups: PrintRecordGroup[] }
export type PrintRecordDetail = { id: string; recordId: string; values: Record<string, string> }
type LoadedPrintRecordDetail = { id: string; recordId: string; clientRowId?: string; values: Record<string, string | undefined> }
type Definition = { formName: string; source: ClientLinkedRecordSource; load: (id: string, recordId: string) => Promise<LoadedPrintRecordDetail> }
const clean = (value: unknown) => String(value || '').trim().replace(/[{}]/g, '').toLowerCase()
const GUID = /^[a-f\d]{8}(?:-[a-f\d]{4}){3}-[a-f\d]{12}$/i
const source = (tableAlias: string, primaryIdField: string, clientLookup = '', enrollmentLookup = ''): ClientLinkedRecordSource =>
  ({ tableAlias, primaryIdField, recordIdField: 'cmps_recordid', clientLookup, enrollmentLookup })
const definitions: Record<string, Definition> = {
  'client-profile': { formName: 'Client Profile', source: source(CLIENT_PROFILE_TABLE_ALIAS, CLIENT_PROFILE_PRIMARY_ID_FIELD), load: loadClientProfileDetailRecord },
  'program-enrollment': { formName: 'Program Enrollment', source: source(PROGRAM_ENROLLMENT_TABLE_ALIAS, PROGRAM_ENROLLMENT_PRIMARY_ID_FIELD, 'cmps_clientid'), load: loadProgramEnrollmentDetailRecord },
  services: { formName: 'Services', source: source(SERVICES_TABLE_ALIAS, SERVICES_PRIMARY_ID_FIELD, '', 'cmps_programenrollment'), load: loadServicesDetailRecord },
  'bed-enrollment': { formName: 'Bed Enrollment', source: source(BED_ENROLLMENTS_TABLE_ALIAS, BED_ENROLLMENTS_PRIMARY_ID_FIELD, '', 'cmps_programenrollment'), load: loadBedEnrollmentDetailRecord },
  helpline: { formName: 'Helpline', source: source(HELPLINES_TABLE_ALIAS, HELPLINES_PRIMARY_ID_FIELD, 'cmps_cpid'), load: loadHelplineDetailRecord },
  'child-safety-plan': { formName: 'Child Safety Plan', source: source(CHILD_SAFETY_PLANS_TABLE_ALIAS, CHILD_SAFETY_PLANS_PRIMARY_ID_FIELD, '', 'cmps_peid'), load: loadChildSafetyPlanDetailRecord },
  'electronic-document': { formName: 'Electronic Document', source: source(ELECTRONIC_DOCUMENTS_TABLE_ALIAS, ELECTRONIC_DOCUMENTS_PRIMARY_ID_FIELD, 'cmps_cpid'), load: loadElectronicDocumentDetailRecord },
  'adult-assessment': { formName: 'Adult Assessment', source: source(ADULT_ASSESSMENTS_TABLE_ALIAS, ADULT_ASSESSMENTS_PRIMARY_ID_FIELD, 'cmps_cpid', 'cmps_peid'), load: loadAdultAssessmentDetailRecord },
  'health-wellness': { formName: 'Health & Wellness Questionnaire', source: source(HEALTH_WELLNESS_TABLE_ALIAS, HEALTH_WELLNESS_PRIMARY_ID_FIELD, 'cmps_cpid'), load: loadHealthWellnessDetailRecord },
  goals: { formName: 'Goals', source: source(GOALS_TABLE_ALIAS, GOALS_PRIMARY_ID_FIELD, '', 'cmps_peid'), load: loadGoalDetailRecord },
  'focus-plan': { formName: 'FOCUS Plan', source: source(FOCUS_PLANS_TABLE_ALIAS, FOCUS_PLANS_PRIMARY_ID_FIELD, '', 'cmps_peid'), load: loadFocusPlanDetailRecord },
  'initial-safety-plan': { formName: 'Initial Safety Plan', source: source(INITIAL_SAFETY_PLANS_TABLE_ALIAS, INITIAL_SAFETY_PLANS_PRIMARY_ID_FIELD, '', 'cmps_peid'), load: loadInitialSafetyPlanDetailRecord },
}
export const PRINT_FORM_NAMES: Record<string, string> = { ...Object.fromEntries(Object.entries(definitions).map(([kind, value]) => [kind, value.formName])), ...CLIENT_RECORD_LABELS, household: 'Household', event: 'Event' }
export const PRINT_TABLE_KINDS: Record<string, string> = { ...Object.fromEntries(Object.entries(definitions).map(([kind, value]) => [value.source.tableAlias, kind])), ...Object.fromEntries(Object.entries(CLIENT_RECORD_SOURCES).map(([kind, value]) => [value.tableAlias, kind])), [HOUSEHOLDS_TABLE_ALIAS]: 'household', [EVENTS_TABLE_ALIAS]: 'event' }
export function printRecordRef(kind: string, row: { id: string; recordId: string }): PrintRecordRef {
  if (!GUID.test(clean(row.id)) || !PRINT_FORM_NAMES[kind]) throw new Error('Invalid printable record.')
  return { key: kind + ':' + clean(row.id), kind, formName: PRINT_FORM_NAMES[kind], id: clean(row.id), recordId: row.recordId }
}
export function sortPrintGroups(groups: PrintRecordGroup[]): PrintRecordGroup[] {
  return [...groups].sort((a, b) => a.kind === 'client-profile' ? -1 : b.kind === 'client-profile' ? 1 : a.formName.localeCompare(b.formName))
    .map((group) => ({ ...group, records: [...group.records].sort((a, b) => a.recordId.localeCompare(b.recordId, undefined, { numeric: true }) || a.id.localeCompare(b.id)) }))
}
export async function mapPrintItems<T, R>(items: readonly T[], task: (value: T, index: number) => Promise<R>, concurrency = 3): Promise<R[]> {
  const output: R[] = new Array(items.length)
  let next = 0
  await Promise.all(Array.from({ length: Math.min(Math.max(1, concurrency), items.length) }, async () => {
    while (next < items.length) { const index = next++; output[index] = await task(items[index], index) }
  }))
  return output
}
// Fetch lists only when printing is requested. Shared paging never silently truncates a form's records.
export async function listClientPrintCatalog(clientId: string, profileRecordId: string, canView: (name: string) => boolean): Promise<PrintCatalog> {
  clientId = clean(clientId)
  if (!GUID.test(clientId) || !canView('Client Profile')) throw new Error('Your role cannot print this Client Profile.')
  let enrollmentIds: string[] = [], enrollmentError = ''
  try { enrollmentIds = (await listClientLinkedRecords(definitions['program-enrollment'].source, clientId)).map((row) => row.id) }
  catch (error) { enrollmentError = String((error as Error)?.message || error) }
  const groups = await mapPrintItems(Object.entries(PRINT_FORM_NAMES).filter(([kind, name]) => kind !== 'client-profile' && kind !== 'event' && canView(name)), async ([kind, formName]): Promise<PrintRecordGroup> => {
    try {
      if (kind === 'household') {
        const histories = await listHouseholdHistoriesForClient(clientId)
        const ids = [...new Set(histories.map((row) => row.householdRowId).filter(Boolean))]
        const rows = ids.length ? await listHouseholdsByIds(ids) : []
        return { kind, formName, records: rows.map((row) => printRecordRef(kind, row)) }
      }
      const mapping = CLIENT_RECORD_SOURCES[kind as ClientConsentFormKind] || definitions[kind]?.source
      if (!mapping) throw new Error('This form has no verified client relationship.')
      if (enrollmentError && mapping.enrollmentLookup) throw new Error('Program Enrollment links could not be loaded: ' + enrollmentError)
      const rows = await listClientLinkedRecords(mapping, clientId, enrollmentIds)
      return { kind, formName, records: rows.map((row) => ({ ...printRecordRef(kind, row), summary: row.createdOn ? 'Created ' + row.createdOn.slice(0, 10) : '' })) }
    } catch (error) { return { kind, formName, records: [], error: String((error as Error)?.message || error) } }
  })
  groups.push({ kind: 'client-profile', formName: 'Client Profile', records: [printRecordRef('client-profile', { id: clientId, recordId: profileRecordId })] })
  return { clientId, enrollmentIds, groups: sortPrintGroups(groups) }
}
export async function loadClientPrintRecord(ref: PrintRecordRef, catalog: PrintCatalog, canView: (name: string) => boolean): Promise<PrintRecordDetail> {
  if (ref.formName !== PRINT_FORM_NAMES[ref.kind] || ref.key !== ref.kind + ':' + clean(ref.id) || !canView(PRINT_FORM_NAMES[ref.kind]) || !catalog.groups.some((group) => group.kind === ref.kind && group.records.some((row) => row.key === ref.key && row.id === ref.id))) throw new Error('This record is not available for printing.')
  let detail: LoadedPrintRecordDetail
  const consentKind = ref.kind as ClientConsentFormKind
  if (CLIENT_RECORD_SOURCES[consentKind]) detail = await loadClientConsentFormRecord(consentKind, ref.id, catalog.clientId, catalog.enrollmentIds)
  else if (ref.kind === 'household') {
    const histories = await listHouseholdHistoriesForClient(catalog.clientId)
    if (!histories.some((row) => clean(row.householdRowId) === ref.id)) throw new Error('This Household is no longer linked to this client.')
    detail = await loadHouseholdDetailRecord(ref.id, ref.recordId)
  } else {
    const definition = definitions[ref.kind]
    if (!definition) throw new Error('Unsupported printable form.')
    detail = await definition.load(ref.id, ref.recordId)
    if (ref.kind === 'client-profile') {
      if (clean(detail.id) !== catalog.clientId) throw new Error('Client Profile changed during print preparation.')
    } else {
      // Enrollment's UI hydrator replaces values.cmps_clientid with CP-... .
      // Keep ownership checks on the retained lookup GUID, never its display ID.
      const client = ref.kind === 'program-enrollment'
        ? clean(detail.clientRowId || (GUID.test(clean(detail.values.cmps_clientid)) ? detail.values.cmps_clientid : ''))
        : definition.source.clientLookup ? clean(detail.values[definition.source.clientLookup]) : ''
      const enrollment = definition.source.enrollmentLookup ? clean(detail.values[definition.source.enrollmentLookup]) : ''
      if (client && client !== catalog.clientId || client !== catalog.clientId && !catalog.enrollmentIds.includes(enrollment)) throw new Error('This record is no longer linked to the selected client.')
    }
  }
  if (clean(detail.id) !== ref.id) throw new Error('The requested print record could not be verified.')
  return { ...detail, values: Object.fromEntries(Object.entries(detail.values).map(([field, value]) => [field, String(value ?? '')])) }
}
