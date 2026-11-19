import { getClient } from '@microsoft/power-apps/data'
import { dataSourcesInfo } from '../../.power/schemas/appschemas/dataSourcesInfo'
import { ensureAuthToken, getAuthToken } from './auth'

export const CHILD_SHELTER_INTAKES_TABLE_ALIAS = 'cmps_childshelterintakes'
export const CHILD_SHELTER_INTAKES_PRIMARY_ID_FIELD = 'cmps_childshelterintakeid'
const PROGRAM_ENROLLMENT_ENTITY_SET_NAME = 'cmps_programenrollment1s'
const DEFAULT_DATAVERSE_ORG_URL = 'https://org1f466e4e.crm.dynamics.com'
const OPTION_SET_BASE_VALUE = 125570000
const runtimeDataClient = getClient(dataSourcesInfo as any)

export type ChildShelterIntakeField = {
  field: string
  label: string
  input: 'readonly' | 'lookup' | 'date' | 'text' | 'textarea' | 'radio' | 'phone' | 'html'
  options: string[]
  section: "Child's Intake Details - To Be Completed with Parent" | 'Acknowledgement'
  required?: boolean
  visibleWhen?: { field: string; values: string[] }
}

const YES_NO_OPTIONS = ['Yes', 'No']

export const CHILD_SHELTER_INTAKE_FIELDS: ChildShelterIntakeField[] = [
  { field: 'cmps_recordid', label: 'Record ID', input: 'readonly', options: [], section: "Child's Intake Details - To Be Completed with Parent" },
  { field: 'cmps_peid', label: 'Program Enrollment', input: 'lookup', options: [], section: "Child's Intake Details - To Be Completed with Parent", required: true },
  { field: 'cmps_intakedate', label: 'Intake Date', input: 'date', options: [], section: "Child's Intake Details - To Be Completed with Parent", required: true },
  { field: 'cmps_parentguardianfullname', label: 'Parent/Guardian Full Name', input: 'text', options: [], section: "Child's Intake Details - To Be Completed with Parent", required: true },
  { field: 'cmps_pleaselistthenamesandagesofallsiblingscurrent', label: 'Please list the names and ages of all siblings currently living in shelter, including step-siblings:', input: 'textarea', options: [], section: "Child's Intake Details - To Be Completed with Parent" },
  { field: 'cmps_arethereanycustodyissues', label: 'Are There Any Custody Issues?', input: 'radio', options: YES_NO_OPTIONS, section: "Child's Intake Details - To Be Completed with Parent" },
  { field: 'cmps_pleaseexplainthecustodyissues', label: 'Please explain the custody issue(s):', input: 'textarea', options: [], section: "Child's Intake Details - To Be Completed with Parent", visibleWhen: { field: 'cmps_arethereanycustodyissues', values: ['Yes'] } },
  { field: 'cmps_hasanyoneotherthanyoubeenthechildsprimarycare', label: "Has anyone other than you been the child's primary care giver?", input: 'radio', options: YES_NO_OPTIONS, section: "Child's Intake Details - To Be Completed with Parent" },
  { field: 'cmps_whoelsehasbeenacaregiver', label: 'Who Else Has Been a Caregiver?', input: 'textarea', options: [], section: "Child's Intake Details - To Be Completed with Parent", visibleWhen: { field: 'cmps_hasanyoneotherthanyoubeenthechildsprimarycare', values: ['Yes'] } },
  { field: 'cmps_isyourchildcurrentlyenrolledinschoolordaycare', label: 'Is Your Child Currently Enrolled in School or Daycare?', input: 'radio', options: YES_NO_OPTIONS, section: "Child's Intake Details - To Be Completed with Parent" },
  { field: 'cmps_ifyeswherearetheyenrolled', label: 'If Yes, Where Are They Enrolled?', input: 'textarea', options: [], section: "Child's Intake Details - To Be Completed with Parent", visibleWhen: { field: 'cmps_isyourchildcurrentlyenrolledinschoolordaycare', values: ['Yes'] } },
  { field: 'cmps_doesyourchildhaveadisabilityorneedspecialacco', label: 'Does your child have a disability or need special accommodations?', input: 'radio', options: YES_NO_OPTIONS, section: "Child's Intake Details - To Be Completed with Parent" },
  { field: 'cmps_ifyeswhatdisabilitiesdotheyhaveandwhataccommo', label: 'If yes, what disability/disabilities do they have and what accommodation is needed?', input: 'textarea', options: [], section: "Child's Intake Details - To Be Completed with Parent" },
  { field: 'cmps_hasthedepartmentofchildsafetyeverbeeninvolved', label: 'Has the Department of Child Safety Ever Been Involved?', input: 'radio', options: YES_NO_OPTIONS, section: "Child's Intake Details - To Be Completed with Parent" },
  { field: 'cmps_dcscaseworkersname', label: "DCS Caseworker's Name", input: 'text', options: [], section: "Child's Intake Details - To Be Completed with Parent", visibleWhen: { field: 'cmps_hasthedepartmentofchildsafetyeverbeeninvolved', values: ['Yes'] } },
  { field: 'cmps_dcscaseworkersphonenumber', label: "DCS Caseworker's Phone Number", input: 'phone', options: [], section: "Child's Intake Details - To Be Completed with Parent", visibleWhen: { field: 'cmps_hasthedepartmentofchildsafetyeverbeeninvolved', values: ['Yes'] } },
  { field: 'cmps_isthereanythingelseyoufeelisimportantforustok', label: 'Is there anything else you feel is important for us to know about your child?', input: 'textarea', options: [], section: "Child's Intake Details - To Be Completed with Parent" },
  { field: 'child-shelter-intake-signature-header', label: 'By signing below, I hereby agree and understand that all electronic signatures are the equivalent of my manual/handwritten signature. This is to be used in conjunction wth the use of electronic signatures on all forms in this database with a signature requirement, should I elect to have signed electronically.      By signing I affirm I was involved in the creation and ongoing review of this document.', input: 'html', options: [], section: 'Acknowledgement' },
  { field: 'cmps_parentguardiansnameandsignature', label: "Parent/Guardian's Name and Signature", input: 'text', options: [], section: 'Acknowledgement', required: true },
  { field: 'cmps_staffsnameandsignature', label: "Staff's Name and Signature", input: 'text', options: [], section: 'Acknowledgement', required: true },
  { field: 'cmps_childrensspecialistnameandsignature', label: "Children's Specialist Name and Signature", input: 'text', options: [], section: 'Acknowledgement' },
]

export type ChildShelterIntakePayload = Partial<Record<string, string>>

const CHOICE_FIELDS = CHILD_SHELTER_INTAKE_FIELDS.filter((field) => field.input === 'radio')

function orgUrl(): string {
  return String(import.meta.env.VITE_DATAVERSE_ORG_URL || DEFAULT_DATAVERSE_ORG_URL).trim().replace(/\/$/, '')
}

function local(): boolean {
  return typeof window !== 'undefined' && ['localhost', '127.0.0.1'].includes(window.location.hostname)
}

function normalizeGuid(value: string): string {
  return String(value || '').trim().replace(/[{}]/g, '')
}

function isYes(value: unknown): boolean {
  const text = String(value || '').trim().toLowerCase()
  return text === 'yes' || text === String(OPTION_SET_BASE_VALUE)
}

function normalizePayload(seed: ChildShelterIntakePayload): Record<string, unknown> {
  const payload: Record<string, unknown> = { ...seed }
  const programEnrollmentId = normalizeGuid(String(payload.cmps_peid || ''))
  if (programEnrollmentId) {
    delete payload.cmps_peid
    payload['cmps_peid@odata.bind'] = `/${PROGRAM_ENROLLMENT_ENTITY_SET_NAME}(${programEnrollmentId})`
  }

  if (!isYes(payload.cmps_arethereanycustodyissues)) delete payload.cmps_pleaseexplainthecustodyissues
  if (!isYes(payload.cmps_hasanyoneotherthanyoubeenthechildsprimarycare)) delete payload.cmps_whoelsehasbeenacaregiver
  if (!isYes(payload.cmps_isyourchildcurrentlyenrolledinschoolordaycare)) delete payload.cmps_ifyeswherearetheyenrolled
  if (!isYes(payload.cmps_hasthedepartmentofchildsafetyeverbeeninvolved)) {
    delete payload.cmps_dcscaseworkersname
    delete payload.cmps_dcscaseworkersphonenumber
  }

  for (const field of CHOICE_FIELDS) {
    const rawValue = String(payload[field.field] || '').trim()
    if (!rawValue) {
      delete payload[field.field]
      continue
    }
    if (/^12557000[01]$/.test(rawValue)) {
      payload[field.field] = Number(rawValue)
      continue
    }
    const index = field.options.findIndex((option) => option.toLowerCase() === rawValue.toLowerCase())
    if (index < 0) throw new Error(`Invalid choice for ${field.label}.`)
    payload[field.field] = OPTION_SET_BASE_VALUE + index
  }

  for (const [field, value] of Object.entries(payload)) {
    if (typeof value === 'string' && !value.trim()) delete payload[field]
  }

  return payload
}

export function generateChildShelterIntakeRecordId(): string {
  return `CSI-${new Date().toISOString().replace(/[-:T]/g, '').slice(0, 15)}`
}

export async function createChildShelterIntakeResponse(seed: ChildShelterIntakePayload): Promise<{ id: string; recordId: string }> {
  const recordId = String(seed.cmps_recordid || '').trim().replace(/\.+$/, '') || generateChildShelterIntakeRecordId()
  const payload = normalizePayload({ ...seed, cmps_recordid: recordId })

  if (local()) {
    const token = await ensureAuthToken()
    if (!token) throw new Error('Missing Dataverse connection info for Child Shelter Intake create.')
    const response = await fetch(`${orgUrl()}/api/data/v9.2/${CHILD_SHELTER_INTAKES_TABLE_ALIAS}`, {
      method: 'POST',
      credentials: 'include',
      headers: { Accept: 'application/json', 'Content-Type': 'application/json', 'OData-Version': '4.0', 'OData-MaxVersion': '4.0', Authorization: `Bearer ${token}`, Prefer: 'return=representation' },
      body: JSON.stringify(payload),
    })
    if (!response.ok) throw new Error(await response.text())
    const body = await response.json().catch(() => ({}))
    return { id: normalizeGuid(String(body?.[CHILD_SHELTER_INTAKES_PRIMARY_ID_FIELD] || body?.id || '')), recordId }
  }

  const token = getAuthToken()
  const result = await runtimeDataClient.executeAsync<any, any>({
    connectorOperation: {
      tableName: 'commondataserviceforapps',
      operationName: 'CreateRecordWithOrganization',
      parameters: { prefer: 'return=representation', accept: 'application/json',  organization: orgUrl(), entityName: CHILD_SHELTER_INTAKES_TABLE_ALIAS, item: payload, ...(token ? { token } : {}) },
    },
  } as any)
  if (!result?.success) throw new Error(String(result?.error?.message || result?.error || 'Child Shelter Intake create failed.'))
  return { id: normalizeGuid(String(result?.data?.[CHILD_SHELTER_INTAKES_PRIMARY_ID_FIELD] || result?.data?.id || '')), recordId }
}

export async function updateChildShelterIntakeResponse(rowId: string, values: ChildShelterIntakePayload): Promise<void> {
  const cleanId = normalizeGuid(rowId)
  if (!cleanId) throw new Error('Missing Child Shelter Intake row id for update.')
  const payload = normalizePayload(values)
  // PATCH must explicitly clear dates; omitting a blank date preserves its old value.
  for (const field of CHILD_SHELTER_INTAKE_FIELDS) {
    const value = (values as Record<string, unknown>)[field.field]
    if (['date', 'datetime'].includes(field.input) && Object.prototype.hasOwnProperty.call(values, field.field)
      && (value === null || (typeof value === 'string' && !value.trim()))) (payload as Record<string, unknown>)[field.field] = null
  }

  if (local()) {
    const token = await ensureAuthToken()
    if (!token) throw new Error('Missing Dataverse connection info for Child Shelter Intake update.')
    const response = await fetch(`${orgUrl()}/api/data/v9.2/${CHILD_SHELTER_INTAKES_TABLE_ALIAS}(${cleanId})`, {
      method: 'PATCH',
      credentials: 'include',
      headers: { Accept: 'application/json', 'Content-Type': 'application/json', 'OData-Version': '4.0', 'OData-MaxVersion': '4.0', Authorization: `Bearer ${token}` },
      body: JSON.stringify(payload),
    })
    if (!response.ok) throw new Error(await response.text())
    return
  }

  const token = getAuthToken()
  const result = await runtimeDataClient.executeAsync<any, any>({
    connectorOperation: {
      tableName: 'commondataserviceforapps',
      operationName: 'UpdateRecordWithOrganization',
      parameters: { organization: orgUrl(), entityName: CHILD_SHELTER_INTAKES_TABLE_ALIAS, recordId: cleanId, item: payload, ...(token ? { token } : {}) },
    },
  } as any)
  if (!result?.success) throw new Error(String(result?.error?.message || result?.error || 'Child Shelter Intake update failed.'))
}
