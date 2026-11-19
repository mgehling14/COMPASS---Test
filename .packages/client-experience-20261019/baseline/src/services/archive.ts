import { getClient } from '@microsoft/power-apps/data'
import { dataSourcesInfo } from '../../.power/schemas/appschemas/dataSourcesInfo'
import { ensureAuthToken, getAuthToken } from './auth'
import { funderContractIdentity } from './funderContractIdentity'

export const ARCHIVED_YES_VALUE = 125570000
export const ARCHIVED_NO_VALUE = 125570001
export const NOT_ARCHIVED_FILTER = `(cmps_isarchived ne ${ARCHIVED_YES_VALUE} or cmps_isarchived eq null)`

export function excludeArchived(filter = ''): string {
  const clean = String(filter || '').trim()
  return clean ? `(${clean}) and ${NOT_ARCHIVED_FILTER}` : NOT_ARCHIVED_FILTER
}

export type ArchiveTableDefinition = {
  key: string
  label: string
  tableAlias: string
  primaryIdField: string
  recordIdField?: string
  displayFields?: string[]
  clientLookupField?: string
  enrollmentLookupField?: string
  adminOnly?: boolean
}

export type ArchivedRecord = {
  tableKey: string
  tableLabel: string
  tableAlias: string
  primaryIdField: string
  id: string
  recordId: string
  displayName: string
  createdOn: string
  modifiedOn: string
}

const client = (definition: ArchiveTableDefinition): ArchiveTableDefinition => ({
  ...definition,
  clientLookupField: definition.clientLookupField || '_cmps_cpid_value',
})

const enrollment = (definition: ArchiveTableDefinition): ArchiveTableDefinition => ({
  ...definition,
  enrollmentLookupField: definition.enrollmentLookupField || '_cmps_peid_value',
})

export const ARCHIVE_TABLES: ArchiveTableDefinition[] = [
  { key: 'client-profile', label: 'Client Profile', tableAlias: 'cmps_clientprofiles', primaryIdField: 'cmps_clientprofileid', recordIdField: 'cmps_recordid', displayFields: ['cmps_name', 'cmps_middlename', 'cmps_lastname', 'cmps_hmisid'] },
  { key: 'program-enrollment', label: 'Program Enrollment', tableAlias: 'cmps_programenrollment1s', primaryIdField: 'cmps_programenrollment1id', recordIdField: 'cmps_recordid', clientLookupField: '_cmps_clientid_value' },
  enrollment({ key: 'services', label: 'Services', tableAlias: 'cmps_serviceses', primaryIdField: 'cmps_servicesid', recordIdField: 'cmps_recordid', enrollmentLookupField: '_cmps_programenrollment_value' }),
  enrollment({ key: 'bed-enrollment', label: 'Bed Enrollment', tableAlias: 'cmps_bedenrollments', primaryIdField: 'cmps_bedenrollmentid', recordIdField: 'cmps_recordid', enrollmentLookupField: '_cmps_programenrollment_value' }),
  client({ key: 'helpline', label: 'Helpline', tableAlias: 'cmps_helplines', primaryIdField: 'cmps_helplineid', recordIdField: 'cmps_recordid' }),
  client({ key: 'shelter-screening', label: 'Shelter Screening', tableAlias: 'cmps_shelterscreenings', primaryIdField: 'cmps_shelterscreeningid', recordIdField: 'cmps_recordid' }),
  enrollment({ key: 'voca-form', label: 'VOCA Form', tableAlias: 'cmps_vocaforms', primaryIdField: 'cmps_vocaformid', recordIdField: 'cmps_recordid', clientLookupField: '_cmps_cpid_value' }),
  client({ key: 'event', label: 'Event', tableAlias: 'cmps_events', primaryIdField: 'cmps_eventid', recordIdField: 'cmps_recordid', displayFields: ['cmps_eventtitle'] }),
  client({ key: 'release-of-information', label: 'Release of Information', tableAlias: 'cmps_anewleaflimitedreleaseofinformations', primaryIdField: 'cmps_anewleaflimitedreleaseofinformationid', recordIdField: 'cmps_recordid' }),
  enrollment({ key: 'child-safety-plan', label: 'Child Safety Plan', tableAlias: 'cmps_childsafetyplans', primaryIdField: 'cmps_childsafetyplanid', recordIdField: 'cmps_recordid' }),
  enrollment({ key: 'adult-assessment', label: 'Adult Assessment', tableAlias: 'cmps_adultassessments', primaryIdField: 'cmps_adultassessmentid', recordIdField: 'cmps_recordid' }),
  enrollment({ key: 'child-assessment', label: 'Child Assessment', tableAlias: 'cmps_childassessments', primaryIdField: 'cmps_childassessmentid', recordIdField: 'cmps_recordid' }),
  enrollment({ key: 'child-shelter-intake', label: 'Child Shelter Intake', tableAlias: 'cmps_childshelterintakes', primaryIdField: 'cmps_childshelterintakeid', recordIdField: 'cmps_recordid' }),
  client({ key: 'electronic-document', label: 'Electronic Document', tableAlias: 'cmps_electronicdocuments', primaryIdField: 'cmps_electronicdocumentid', recordIdField: 'cmps_recordid', displayFields: ['cmps_nameofdocument'] }),
  client({ key: 'employment-benefits', label: 'Employment & Benefits', tableAlias: 'cmps_employmentandbenefitses', primaryIdField: 'cmps_employmentandbenefitsid', recordIdField: 'cmps_recordid' }),
  enrollment({ key: 'financial-assistance', label: 'Financial Assistance', tableAlias: 'cmps_financialassitances', primaryIdField: 'cmps_financialassistanceid', recordIdField: 'cmps_recordid' }),
  enrollment({ key: 'medical-consent', label: 'Medical Consent Form', tableAlias: 'cmps_medicalconsentforms', primaryIdField: 'cmps_medicalconsentformid', recordIdField: 'cmps_recordid' }),
  client({ key: 'person-fleeing-profile', label: 'Person You Are Fleeing Profile', tableAlias: 'cmps_personyouarefleeingprofiles', primaryIdField: 'cmps_personyouarefleeingprofileid', recordIdField: 'cmps_recordid' }),
  client({ key: 'pet-companion-intake', label: 'Pet Companion Intake', tableAlias: 'cmps_petcompanionintakes', primaryIdField: 'cmps_petcompanionintakeid', recordIdField: 'cmps_recordid' }),
  enrollment({ key: 'shelter-program-guidelines', label: 'Shelter Program Guidelines', tableAlias: 'cmps_shelterprogramguidelineses', primaryIdField: 'cmps_shelterprogramguidelinesid', recordIdField: 'cmps_recordid' }),
  client({ key: 'service-animal-terms', label: 'Terms & Conditions of Service Animals', tableAlias: 'cmps_termsandconditionsofserviceanimalses', primaryIdField: 'cmps_termsandconditionsofserviceanimalsid', recordIdField: 'cmps_recordid' }),
  enrollment({ key: 'focus-plan', label: 'FOCUS Plan', tableAlias: 'cmps_focusplans', primaryIdField: 'cmps_focusplanid', recordIdField: 'cmps_recordid' }),
  enrollment({ key: 'goal', label: 'Goals', tableAlias: 'cmps_goalses', primaryIdField: 'cmps_goalsid', recordIdField: 'cmps_recordid' }),
  enrollment({ key: 'initial-safety-plan', label: 'Initial Safety Plan', tableAlias: 'cmps_initialsafetyplans', primaryIdField: 'cmps_initialsafetyplanid', recordIdField: 'cmps_recordid' }),
  client({ key: 'health-wellness', label: 'Health & Wellness Questionnaire', tableAlias: 'cmps_healthandwellnessquestionnaires', primaryIdField: 'cmps_healthandwellnessquestionnaireid', recordIdField: 'cmps_recordid' }),
  client({ key: 'acknowledgement-consent', label: 'Acknowledgement & Consent', tableAlias: 'cmps_acknowledgementandconsentforms', primaryIdField: 'cmps_acknowledgementandconsentformid' }),
  client({ key: 'animal-agreement', label: 'Animal Agreement', tableAlias: 'cmps_animalagreements', primaryIdField: 'cmps_animalagreementid', recordIdField: 'cmps_recordid' }),
  { key: 'household', label: 'Household', tableAlias: 'cmps_households', primaryIdField: 'cmps_householdid', recordIdField: 'cmps_recordid', displayFields: ['cmps_headofhouseholdname'] },
  client({ key: 'household-history', label: 'Household History', tableAlias: 'cmps_householdhistories', primaryIdField: 'cmps_householdhistoryid', clientLookupField: '_cmps_clientid_value' }),
  { key: 'bed', label: 'Bed', tableAlias: 'cmps_bedses', primaryIdField: 'cmps_bedid', displayFields: ['cmps_bedname'] },
  { key: 'compass-file', label: 'Compass File', tableAlias: 'cmps_compassfileses', primaryIdField: 'cmps_compassfilesid', displayFields: ['cmps_filename'] },
  { key: 'funder', label: 'Funder', tableAlias: 'cmps_funders', primaryIdField: 'cmps_funderid', displayFields: ['cmps_name'] },
  { key: 'funder-contract', label: 'Funder Contract', tableAlias: 'cmps_fundercontracts', primaryIdField: '', displayFields: ['cmps_contractname'] },
  { key: 'funder-transaction', label: 'Funder Transaction', tableAlias: 'cmps_fundertransactions', primaryIdField: 'cmps_fundertransactionid' },
  { key: 'message', label: 'Home Messages', tableAlias: 'cmps_messageses', primaryIdField: '', recordIdField: 'cmps_recordid', displayFields: ['cmps_messagename', 'cmps_message'], adminOnly: true },
]

const DEFAULT_DATAVERSE_ORG_URL = 'https://org1f466e4e.crm.dynamics.com'
const runtimeDataClient = getClient(dataSourcesInfo as any)

function orgUrl(): string {
  return String(import.meta.env.VITE_DATAVERSE_ORG_URL || DEFAULT_DATAVERSE_ORG_URL).trim().replace(/\/$/, '')
}

function cleanGuid(value: unknown): string {
  return String(value || '').trim().replace(/[{}]/g, '')
}

function rowsFromPayload(payload: any): Array<Record<string, any>> {
  if (Array.isArray(payload?.value)) return payload.value
  if (Array.isArray(payload)) return payload
  return []
}

async function listRecords(definition: ArchiveTableDefinition, filter: string, selectFields?: string[]): Promise<Array<Record<string, any>>> {
  const select = Array.from(new Set([
    definition.primaryIdField,
    definition.recordIdField,
    ...(definition.displayFields || []),
    'createdon',
    'modifiedon',
    ...(selectFields || []),
  ].filter(Boolean) as string[])).join(',')

  const token = getAuthToken()
  try {
    const result = await runtimeDataClient.executeAsync<any, any>({
      connectorOperation: {
        tableName: 'commondataserviceforapps',
        operationName: 'ListRecordsWithOrganization',
        parameters: {
          organization: orgUrl(),
          entityName: definition.tableAlias,
          '$select': select,
          '$filter': filter,
          '$top': 5000,
          ...(token ? { token } : {}),
        },
      },
    } as any)
    if (result?.success) return rowsFromPayload(result.data)
  } catch {
    // Fall through to the direct Web API request.
  }

  const directToken = await ensureAuthToken()
  const headers = new Headers({ Accept: 'application/json', 'OData-Version': '4.0', 'OData-MaxVersion': '4.0', Authorization: `Bearer ${directToken}` })
  const response = await fetch(`${orgUrl()}/api/data/v9.2/${definition.tableAlias}?$select=${encodeURIComponent(select)}&$filter=${encodeURIComponent(filter)}&$top=5000`, { credentials: 'include', headers })
  if (!response.ok) throw new Error(await response.text())
  return rowsFromPayload(await response.json().catch(() => ({})))
}

async function updateArchiveValue(definition: ArchiveTableDefinition, rowId: string, archived: boolean, savedBy = ''): Promise<void> {
  const cleanId = cleanGuid(rowId)
  if (!cleanId) throw new Error(`Missing ${definition.label} row id.`)
  const item = { cmps_isarchived: archived ? ARCHIVED_YES_VALUE : ARCHIVED_NO_VALUE, ...(savedBy ? { cmps_modifiedby: savedBy } : {}) }
  const token = getAuthToken()

  try {
    const result = await runtimeDataClient.executeAsync<any, any>({
      connectorOperation: {
        tableName: 'commondataserviceforapps',
        operationName: 'UpdateRecordWithOrganization',
        parameters: { organization: orgUrl(), entityName: definition.tableAlias, recordId: cleanId, item, prefer: 'return=representation', accept: 'application/json', ...(token ? { token } : {}) },
      },
    } as any)
    if (result?.success) return
  } catch {
    // Fall through to the direct Web API request.
  }

  const directToken = await ensureAuthToken()
  const headers = new Headers({ Accept: 'application/json', 'Content-Type': 'application/json', 'OData-Version': '4.0', 'OData-MaxVersion': '4.0', Authorization: `Bearer ${directToken}` })
  const response = await fetch(`${orgUrl()}/api/data/v9.2/${definition.tableAlias}(${cleanId})`, { method: 'PATCH', credentials: 'include', headers, body: JSON.stringify(item) })
  if (!response.ok) throw new Error(await response.text())
}

function definitionForTable(tableAlias: string): ArchiveTableDefinition {
  const definition = ARCHIVE_TABLES.find((entry) => entry.tableAlias === tableAlias)
  if (!definition) throw new Error(`Archiving is not configured for table ${tableAlias}.`)
  return definition
}

async function relatedRows(definition: ArchiveTableDefinition, field: string, ids: string[]): Promise<Array<Record<string, any>>> {
  const cleanIds = Array.from(new Set(ids.map(cleanGuid).filter(Boolean)))
  if (!field || cleanIds.length === 0) return []
  const filter = cleanIds.map((id) => `${field} eq ${id}`).join(' or ')
  return listRecords(definition, filter, [field]).catch(() => [])
}

async function collectClientCascade(clientRowId: string): Promise<Array<{ definition: ArchiveTableDefinition; id: string }>> {
  const clientId = cleanGuid(clientRowId)
  const enrollmentDefinition = definitionForTable('cmps_programenrollment1s')
  const enrollmentRows = await relatedRows(enrollmentDefinition, enrollmentDefinition.clientLookupField || '', [clientId])
  const enrollmentIds = enrollmentRows.map((row) => cleanGuid(row?.[enrollmentDefinition.primaryIdField] || row?.id)).filter(Boolean)
  const targets: Array<{ definition: ArchiveTableDefinition; id: string }> = enrollmentIds.map((id) => ({ definition: enrollmentDefinition, id }))

  for (const definition of ARCHIVE_TABLES) {
    if (definition.tableAlias === 'cmps_clientprofiles' || definition.tableAlias === enrollmentDefinition.tableAlias) continue
    const rows = [
      ...(definition.clientLookupField ? await relatedRows(definition, definition.clientLookupField, [clientId]) : []),
      ...(definition.enrollmentLookupField ? await relatedRows(definition, definition.enrollmentLookupField, enrollmentIds) : []),
    ]
    const seen = new Set<string>()
    for (const row of rows) {
      const id = cleanGuid(row?.[definition.primaryIdField] || row?.id)
      if (!id || seen.has(id)) continue
      seen.add(id)
      targets.push({ definition, id })
    }
  }

  return targets
}

export async function setRecordArchived(tableAlias: string, rowId: string, archived: boolean, savedBy = ''): Promise<{ updated: number }> {
  const definition = definitionForTable(tableAlias)
  if (definition.key === 'message') {
    const { archiveMessage } = await import('./messages')
    await archiveMessage(rowId, archived, savedBy)
    return { updated: 1 }
  }
  const targets = definition.tableAlias === 'cmps_clientprofiles'
    ? await collectClientCascade(rowId)
    : []

  let updated = 0
  for (const target of targets) {
    await updateArchiveValue(target.definition, target.id, archived, savedBy)
    updated += 1
  }
  await updateArchiveValue(definition, rowId, archived, savedBy)
  return { updated: updated + 1 }
}

export async function searchArchivedRecords(tableKey: string, query = ''): Promise<ArchivedRecord[]> {
  const definition = ARCHIVE_TABLES.find((entry) => entry.key === tableKey)
  if (!definition) return []
  if (definition.key === 'message') {
    const { loadMessages } = await import('./messages')
    const needle = query.trim().toLowerCase()
    return (await loadMessages('archived')).filter((row) => !needle || [row.id, row.cmps_recordid, row.cmps_messagename, row.cmps_message].some((value) => value.toLowerCase().includes(needle)))
      .map((row) => ({ tableKey: definition.key, tableLabel: definition.label, tableAlias: definition.tableAlias, primaryIdField: '', id: row.id, recordId: row.cmps_recordid, displayName: row.cmps_messagename, createdOn: row.createdOn, modifiedOn: row.modifiedOn }))
  }
  const rows = await listRecords(definition, `cmps_isarchived eq ${ARCHIVED_YES_VALUE}`)
  const needle = String(query || '').trim().toLowerCase()

  return rows
    .map((row): ArchivedRecord => {
      const identity = definition.key === 'funder-contract'
        ? funderContractIdentity(row)
        : { id: cleanGuid(row?.[definition.primaryIdField] || row?.id), primaryIdField: definition.primaryIdField }
      const displayName = (definition.displayFields || []).map((field) => String(row?.[field] || '').trim()).filter(Boolean).join(' ')
      return {
        tableKey: definition.key,
        tableLabel: definition.label,
        tableAlias: definition.tableAlias,
        primaryIdField: identity.primaryIdField,
        id: identity.id,
        recordId: definition.recordIdField ? String(row?.[definition.recordIdField] || '').trim() : '',
        displayName,
        createdOn: String(row?.createdon || '').trim(),
        modifiedOn: String(row?.modifiedon || '').trim(),
      }
    })
    .filter((row) => !!row.id)
    .filter((row) => !needle || [row.recordId, row.displayName, row.id].some((value) => value.toLowerCase().includes(needle)))
    .sort((left, right) => String(right.modifiedOn || right.createdOn).localeCompare(String(left.modifiedOn || left.createdOn)))
}
