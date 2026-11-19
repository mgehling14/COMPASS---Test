import { getClient } from '@microsoft/power-apps/data'
import { dataSourcesInfo } from '../../.power/schemas/appschemas/dataSourcesInfo'
import { ensureAuthToken, getAuthToken } from './auth'
import { excludeArchived } from './archive'
import { resolveClientLinkedRecordSource } from './clientLinkedRecords'
import { RELEASE_OF_INFORMATION_FIELDS, RELEASE_OF_INFORMATION_TABLE_ALIAS, RELEASE_OF_INFORMATION_PRIMARY_ID_FIELD } from './releaseOfInformation'
import { ACKNOWLEDGEMENT_AND_CONSENT_FIELDS, ACKNOWLEDGEMENT_AND_CONSENT_TABLE_ALIAS, ACKNOWLEDGEMENT_AND_CONSENT_PRIMARY_ID_FIELD } from './acknowledgementAndConsent'
import { CHILD_SHELTER_INTAKE_FIELDS, CHILD_SHELTER_INTAKES_TABLE_ALIAS, CHILD_SHELTER_INTAKES_PRIMARY_ID_FIELD } from './childShelterIntake'
import { MEDICAL_CONSENT_FORM_FIELDS, MEDICAL_CONSENT_FORMS_TABLE_ALIAS, MEDICAL_CONSENT_FORMS_PRIMARY_ID_FIELD } from './medicalConsentForm'
import { SHELTER_PROGRAM_GUIDELINES_FIELDS, SHELTER_PROGRAM_GUIDELINES_TABLE_ALIAS, SHELTER_PROGRAM_GUIDELINES_PRIMARY_ID_FIELD } from './shelterProgramGuidelines'
import { ANIMAL_AGREEMENT_FIELDS, ANIMAL_AGREEMENT_TABLE_ALIAS, ANIMAL_AGREEMENT_PRIMARY_ID_FIELD } from './animalAgreement'
import { EMPLOYMENT_AND_BENEFITS_FIELDS, EMPLOYMENT_AND_BENEFITS_TABLE_ALIAS, EMPLOYMENT_AND_BENEFITS_PRIMARY_ID_FIELD } from './employmentAndBenefits'
import { PERSON_YOU_ARE_FLEEING_PROFILE_FIELDS, PERSON_YOU_ARE_FLEEING_PROFILES_TABLE_ALIAS, PERSON_YOU_ARE_FLEEING_PROFILES_PRIMARY_ID_FIELD } from './personYouAreFleeingProfile'
import { PET_COMPANION_INTAKE_FIELDS, PET_COMPANION_INTAKES_TABLE_ALIAS, PET_COMPANION_INTAKES_PRIMARY_ID_FIELD } from './petCompanionIntake'
import { TERMS_AND_CONDITIONS_OF_SERVICE_ANIMALS_FIELDS, TERMS_AND_CONDITIONS_OF_SERVICE_ANIMALS_TABLE_ALIAS, TERMS_AND_CONDITIONS_OF_SERVICE_ANIMALS_PRIMARY_ID_FIELD } from './termsAndConditionsOfServiceAnimals'
import { CHILD_ASSESSMENT_FIELDS, CHILD_ASSESSMENTS_TABLE_ALIAS, CHILD_ASSESSMENTS_PRIMARY_ID_FIELD } from './childAssessment'
import { FINANCIAL_ASSISTANCE_FIELDS, FINANCIAL_ASSISTANCES_TABLE_ALIAS, FINANCIAL_ASSISTANCES_PRIMARY_ID_FIELD } from './financialAssistance'
import { SHELTER_SCREENING_FIELD_DEFINITIONS, SHELTER_SCREENINGS_TABLE_ALIAS, SHELTER_SCREENINGS_PRIMARY_ID_FIELD } from './shelterScreening'
import { VOCA_FORM_FIELD_DEFINITIONS, VOCA_FORMS_TABLE_ALIAS, VOCA_FORMS_PRIMARY_ID_FIELD } from './vocaForm'

export type ClientConsentFormKind = 'release-of-information' | 'acknowledgement-and-consent' | 'child-shelter-intake' | 'medical-consent' | 'shelter-program-guidelines' | 'animal-agreement' | 'employment-and-benefits' | 'person-you-are-fleeing' | 'pet-companion-intake' | 'terms-and-conditions-of-service-animals' | 'child-assessment' | 'financial-assistance' | 'shelter-screening' | 'voca-form'
export type ClientConsentFormRecord = { id: string; recordId: string; values: Record<string, string> }

const client = getClient(dataSourcesInfo as any)
const GUID = /^[a-f\d]{8}(?:-[a-f\d]{4}){3}-[a-f\d]{12}$/i
const cleanId = (value: unknown) => String(value || '').trim().replace(/[{}]/g, '').toLowerCase()
const definitions = {
  'release-of-information': { fields: RELEASE_OF_INFORMATION_FIELDS, table: RELEASE_OF_INFORMATION_TABLE_ALIAS, primary: RELEASE_OF_INFORMATION_PRIMARY_ID_FIELD, clientLookup: 'cmps_cpid', enrollmentLookup: '' },
  'acknowledgement-and-consent': { fields: ACKNOWLEDGEMENT_AND_CONSENT_FIELDS, table: ACKNOWLEDGEMENT_AND_CONSENT_TABLE_ALIAS, primary: ACKNOWLEDGEMENT_AND_CONSENT_PRIMARY_ID_FIELD, clientLookup: 'cmps_cpid', enrollmentLookup: 'cmps_peid' },
  'child-shelter-intake': { fields: CHILD_SHELTER_INTAKE_FIELDS, table: CHILD_SHELTER_INTAKES_TABLE_ALIAS, primary: CHILD_SHELTER_INTAKES_PRIMARY_ID_FIELD, clientLookup: '', enrollmentLookup: 'cmps_peid' },
  'medical-consent': { fields: MEDICAL_CONSENT_FORM_FIELDS, table: MEDICAL_CONSENT_FORMS_TABLE_ALIAS, primary: MEDICAL_CONSENT_FORMS_PRIMARY_ID_FIELD, clientLookup: '', enrollmentLookup: 'cmps_peid' },
  'shelter-program-guidelines': { fields: SHELTER_PROGRAM_GUIDELINES_FIELDS, table: SHELTER_PROGRAM_GUIDELINES_TABLE_ALIAS, primary: SHELTER_PROGRAM_GUIDELINES_PRIMARY_ID_FIELD, clientLookup: '', enrollmentLookup: 'cmps_peid' },
  'animal-agreement': { fields: ANIMAL_AGREEMENT_FIELDS, table: ANIMAL_AGREEMENT_TABLE_ALIAS, primary: ANIMAL_AGREEMENT_PRIMARY_ID_FIELD, clientLookup: 'cmps_cpid', enrollmentLookup: '' },
  'employment-and-benefits': { fields: EMPLOYMENT_AND_BENEFITS_FIELDS, table: EMPLOYMENT_AND_BENEFITS_TABLE_ALIAS, primary: EMPLOYMENT_AND_BENEFITS_PRIMARY_ID_FIELD, clientLookup: 'cmps_cpid', enrollmentLookup: '' },
  'person-you-are-fleeing': { fields: PERSON_YOU_ARE_FLEEING_PROFILE_FIELDS, table: PERSON_YOU_ARE_FLEEING_PROFILES_TABLE_ALIAS, primary: PERSON_YOU_ARE_FLEEING_PROFILES_PRIMARY_ID_FIELD, clientLookup: 'cmps_cpid', enrollmentLookup: '' },
  'pet-companion-intake': { fields: PET_COMPANION_INTAKE_FIELDS, table: PET_COMPANION_INTAKES_TABLE_ALIAS, primary: PET_COMPANION_INTAKES_PRIMARY_ID_FIELD, clientLookup: 'cmps_cpid', enrollmentLookup: '' },
  'terms-and-conditions-of-service-animals': { fields: TERMS_AND_CONDITIONS_OF_SERVICE_ANIMALS_FIELDS, table: TERMS_AND_CONDITIONS_OF_SERVICE_ANIMALS_TABLE_ALIAS, primary: TERMS_AND_CONDITIONS_OF_SERVICE_ANIMALS_PRIMARY_ID_FIELD, clientLookup: 'cmps_cpid', enrollmentLookup: '' },
  'child-assessment': { fields: CHILD_ASSESSMENT_FIELDS, table: CHILD_ASSESSMENTS_TABLE_ALIAS, primary: CHILD_ASSESSMENTS_PRIMARY_ID_FIELD, clientLookup: '', enrollmentLookup: 'cmps_peid' },
  'financial-assistance': { fields: FINANCIAL_ASSISTANCE_FIELDS, table: FINANCIAL_ASSISTANCES_TABLE_ALIAS, primary: FINANCIAL_ASSISTANCES_PRIMARY_ID_FIELD, clientLookup: '', enrollmentLookup: 'cmps_peid' },
  'shelter-screening': { fields: SHELTER_SCREENING_FIELD_DEFINITIONS.map((field) => ({ ...field, section: 'Main' })), table: SHELTER_SCREENINGS_TABLE_ALIAS, primary: SHELTER_SCREENINGS_PRIMARY_ID_FIELD, clientLookup: 'cmps_cpid', enrollmentLookup: '' },
  'voca-form': { fields: VOCA_FORM_FIELD_DEFINITIONS.map((field) => ({ ...field, section: 'Main' })), table: VOCA_FORMS_TABLE_ALIAS, primary: VOCA_FORMS_PRIMARY_ID_FIELD, clientLookup: 'cmps_cpid', enrollmentLookup: 'cmps_peid' },
}

export const CLIENT_RECORD_EDIT_KINDS = {
  'release-of-information': 'release-of-information', 'acknowledgement-and-consent': 'acknowledgement-and-consent',
  'child-shelter-intake': 'child-shelter-intake', 'medical-consent': 'medical-consent-form', 'shelter-program-guidelines': 'shelter-program-guidelines',
  'animal-agreement': 'animal-agreement', 'employment-and-benefits': 'employment-and-benefits', 'person-you-are-fleeing': 'person-you-are-fleeing-profile',
  'pet-companion-intake': 'pet-companion-intake', 'terms-and-conditions-of-service-animals': 'terms-and-conditions-of-service-animals',
  'child-assessment': 'child-assessment', 'financial-assistance': 'financial-assistance', 'shelter-screening': 'shelter-screening', 'voca-form': 'voca-form',
} as const satisfies Record<ClientConsentFormKind, string>

export const CLIENT_RECORD_LABELS: Record<ClientConsentFormKind, string> = {
  'release-of-information': 'A New Leaf Limited Release of Information', 'acknowledgement-and-consent': 'Acknowledgement & Consent Form',
  'child-shelter-intake': 'Child Shelter Intake', 'medical-consent': 'Medical Consent Form', 'shelter-program-guidelines': 'Shelter Program Guidelines',
  'animal-agreement': 'Animal Agreement', 'employment-and-benefits': 'Employment & Benefits', 'person-you-are-fleeing': 'Person You Are Fleeing Profile',
  'pet-companion-intake': 'Pet Companion Intake', 'terms-and-conditions-of-service-animals': 'Terms & Conditions of Service Animals',
  'child-assessment': 'Child Assessment', 'financial-assistance': 'Financial Assistance', 'shelter-screening': 'Shelter Screening Form', 'voca-form': 'VOCA Form',
}

export const CLIENT_RECORD_SOURCES = Object.fromEntries(Object.entries(definitions).map(([key, definition]) => [key, {
  tableAlias: definition.table, primaryIdField: definition.primary, recordIdField: 'cmps_recordid',
  clientLookup: definition.clientLookup, enrollmentLookup: definition.enrollmentLookup,
  ...(key === 'shelter-program-guidelines' ? { verifyRelationships: true } : {}),
}])) as Record<ClientConsentFormKind, { tableAlias: string; primaryIdField: string; recordIdField: string; clientLookup: string; enrollmentLookup: string; verifyRelationships?: boolean }>

export function getClientConsentFormFields(kind: ClientConsentFormKind) { return definitions[kind].fields }

// Read only the requested, unarchived row belonging to the opened client.
// Use the supported list operation: record IDs are GUIDs, not display IDs.
export async function loadClientConsentFormRecord(kind: ClientConsentFormKind, rowId: string, clientProfileId: string, programEnrollmentIds: string[] = []): Promise<ClientConsentFormRecord> {
  const id = cleanId(rowId)
  const clientId = cleanId(clientProfileId)
  if (!GUID.test(id) || !GUID.test(clientId)) throw new Error('Missing or invalid form/client record ID.')
  const definition = definitions[kind]
  if (!definition) throw new Error('Unsupported client consent form.')
  const enrollmentSet = new Set(programEnrollmentIds.map(cleanId).filter((value) => GUID.test(value)))
  const source = await resolveClientLinkedRecordSource({ tableAlias: definition.table, primaryIdField: definition.primary, recordIdField: 'cmps_recordid', clientLookup: definition.clientLookup, enrollmentLookup: definition.enrollmentLookup, verifyRelationships: kind === 'shelter-program-guidelines' })
  const clientLookups = source.clientLookups ?? (definition.clientLookup ? [definition.clientLookup] : [])
  const enrollmentLookups = source.enrollmentLookups ?? (definition.enrollmentLookup ? [definition.enrollmentLookup] : [])
  const links: string[] = []
  for (const lookup of clientLookups) links.push(`_${lookup}_value eq ${clientId}`)
  for (const lookup of enrollmentLookups) for (const enrollmentId of enrollmentSet) links.push(`_${lookup}_value eq ${enrollmentId}`)
  if (!links.length) throw new Error('No verified enrollment links for the opened client.')
  const columns = definition.fields.filter((field) => field.field.startsWith('cmps_'))
    .flatMap((field) => field.field === definition.clientLookup ? clientLookups.map((lookup) => `_${lookup}_value`) : field.field === definition.enrollmentLookup ? enrollmentLookups.map((lookup) => `_${lookup}_value`) : field.input === 'lookup' || field.input === 'file' ? [`_${field.field}_value`] : [field.field])
  const select = [...new Set([definition.primary, 'cmps_recordid', 'cmps_isarchived', ...columns, ...clientLookups.map((field) => `_${field}_value`), ...enrollmentLookups.map((field) => `_${field}_value`)])].join(',')
  const filter = excludeArchived(`${definition.primary} eq ${id} and (${links.join(' or ')})`)
  const organization = String(import.meta.env.VITE_DATAVERSE_ORG_URL || 'https://org1f466e4e.crm.dynamics.com').trim().replace(/\/$/, '')
  let payload: any
  if (typeof window !== 'undefined' && ['localhost', '127.0.0.1'].includes(window.location.hostname)) {
    const token = await ensureAuthToken()
    if (!token) throw new Error('Dataverse authentication is required to open this form.')
    const query = new URLSearchParams({ '$select': select, '$filter': filter, '$top': '2' })
    const response = await fetch(`${organization}/api/data/v9.2/${source.tableAlias}?${query}`, { credentials: 'include',
      headers: { Accept: 'application/json', Authorization: `Bearer ${token}`, Prefer: 'odata.include-annotations="OData.Community.Display.V1.FormattedValue"' },
    })
    if (!response.ok) throw new Error(await response.text())
    payload = await response.json()
  } else {
    const token = getAuthToken()
    const result = await client.executeAsync<any, any>({ connectorOperation: {
      tableName: 'commondataserviceforapps', operationName: 'ListRecordsWithOrganization',
      parameters: { organization, entityName: source.tableAlias, '$select': select, '$filter': filter, '$top': 2,
        prefer: 'odata.include-annotations="OData.Community.Display.V1.FormattedValue"', ...(token ? { token } : {}) },
    } } as any)
    if (!result?.success) throw new Error(String(result?.error?.message || result?.error || 'Unable to open the client form.'))
    payload = result.data
  }
  const rows = Array.isArray(payload) ? payload : payload?.value
  if (!Array.isArray(rows)) throw new Error('Dataverse did not return a form record.')
  const row = rows[0]
  const direct = clientLookups.map((lookup) => cleanId(row?.[`_${lookup}_value`])).filter(Boolean), parents = enrollmentLookups.map((lookup) => cleanId(row?.[`_${lookup}_value`]))
  if (rows.length !== 1 || cleanId(row?.[definition.primary]) !== id || direct.some((value) => value !== clientId) || !(direct.includes(clientId) || parents.some((value) => enrollmentSet.has(value))) || Number(row?.cmps_isarchived) === 125570000) {
    throw new Error('This form was not found, is archived, or does not belong to the opened client.')
  }
  const values: Record<string, string> = { cmps_recordid: String(row.cmps_recordid || '') }
  for (const field of definition.fields) {
    if (!field.field.startsWith('cmps_')) continue
    const lookup = field.input === 'lookup' || field.input === 'file' || field.field === definition.clientLookup || field.field === definition.enrollmentLookup
    const lookupName = field.field === definition.enrollmentLookup ? enrollmentLookups.find((name) => enrollmentSet.has(cleanId(row[`_${name}_value`]))) || enrollmentLookups[0] : field.field === definition.clientLookup ? clientLookups.find((name) => cleanId(row[`_${name}_value`]) === clientId) || clientLookups[0] : field.field
    const column = lookup ? `_${lookupName}_value` : field.field
    const raw = row[column]
    if (lookup) values[field.field] = cleanId(raw)
    else if (field.input === 'date') values[field.field] = String(raw ?? '').startsWith('0001-01-01') ? '' : String(raw ?? '').match(/^\d{4}-\d{2}-\d{2}/)?.[0] || ''
    else if (field.input === 'radio' || field.input === 'checkbox-group' || field.input === 'select') {
      values[field.field] = String(raw ?? '').split(/[,;]+/).map((value) => {
        const text = value.trim()
        return /^\d+$/.test(text) ? field.options[Number(text) - 125570000] || text : text
      }).filter(Boolean).join(', ')
    } else values[field.field] = String(raw ?? '')
  }
  // Preserve VOCA's existing direct legacy client link without exposing it on the form.
  if (kind === 'voca-form') values.cmps_cpid = cleanId(row._cmps_cpid_value)
  return { id, recordId: values.cmps_recordid, values }
}
