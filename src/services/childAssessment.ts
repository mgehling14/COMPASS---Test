import { getClient } from '@microsoft/power-apps/data'
import { dataSourcesInfo } from '../../.power/schemas/appschemas/dataSourcesInfo'
import { ensureAuthToken, getAuthToken } from './auth'

export const CHILD_ASSESSMENTS_TABLE_ALIAS = 'cmps_childassessments'
export const CHILD_ASSESSMENTS_PRIMARY_ID_FIELD = 'cmps_childassessmentid'
const PROGRAM_ENROLLMENT_ENTITY_SET_NAME = 'cmps_programenrollment1s'
const DEFAULT_DATAVERSE_ORG_URL = 'https://org1f466e4e.crm.dynamics.com'
const runtimeDataClient = getClient(dataSourcesInfo as any)

export type ChildAssessmentField = {
  field: string
  label: string
  input: 'readonly' | 'lookup' | 'date' | 'text' | 'textarea' | 'radio' | 'html'
  options: string[]
  section: 'Main' | 'Child Assessment'
  required?: boolean
  visibleWhen?: { field: string; values: string[] }
}

export const CHILD_ASSESSMENT_FIELDS: ChildAssessmentField[] = [
  { field: 'cmps_recordid', label: 'Record ID', input: 'readonly', options: [], section: 'Main' },
  { field: 'cmps_peid', label: 'Program Enrollment', input: 'lookup', options: [], section: 'Main', required: true },
  { field: 'cmps_assessmentdate', label: 'Assessment Date', input: 'date', options: [], section: 'Main', required: true },
  { field: 'cmps_whataresomeofyourfavoritethingsleastfavoritet', label: '1. What are some of your favorite things? Least favorite things? (Animals, food, activities, toys, etc.)', input: 'textarea', options: [], section: 'Main' },
  { field: 'cmps_whatdoyouwanttobewhenyougrowup', label: '2. What do you want to be when you grow up?', input: 'textarea', options: [], section: 'Main' },
  { field: 'cmps_whatisyourroutine', label: '3. What is your routine? (Morning, afternoon, night, hygiene practices, sleep patterns, food times, etc.)', input: 'textarea', options: [], section: 'Main' },
  { field: 'cmps_whatdoesyourfamilyliketodoforfun', label: '4. What does your family like to do for fun? Do you have any special traditions?', input: 'textarea', options: [], section: 'Main' },
  { field: 'cmps_whatdoyouthinkisspecialaboutyourfamily', label: '5. What do you think is special about your family?', input: 'textarea', options: [], section: 'Main' },
  { field: 'cmps_doyoutakemedicine', label: '6. Do u take medicine?', input: 'radio', options: ['Yes', 'No'], section: 'Main' },
  { field: 'cmps_ifyesforwhat', label: '6 a. If yes, for what?', input: 'textarea', options: [], section: 'Main', visibleWhen: { field: 'cmps_doyoutakemedicine', values: ['Yes'] } },
  { field: 'cmps_howareyoufeelingnow', label: '7. How are you feeling now (safety, emotionally, physically)?', input: 'textarea', options: [], section: 'Main' },
  { field: 'cmps_whatwouldyouliketoworkonwhileyouarehere', label: '8. What would you like to work on while you are here?', input: 'textarea', options: [], section: 'Main' },
  { field: 'cmps_notes', label: 'Notes', input: 'textarea', options: [], section: 'Main' },
  { field: 'child-assessment-signature-header', label: 'By signing below, I hereby agree and understand that all electronic signatures are the equivalent of my manual/handwritten signature. This is to be used in conjunction wth the use of electronic signatures on all forms in this database with a signature requirement, should I elect to have signed electronically.      By signing I affirm I was involved in the creation and ongoing review of this document.', input: 'html', options: [], section: 'Child Assessment' },
  { field: 'cmps_childsnameandsignature', label: "Child's Name and Signature", input: 'text', options: [], section: 'Child Assessment' },
  { field: 'cmps_clientparentorguardiannameandsignature', label: 'Client/Parent or Guardian Name and Signature', input: 'text', options: [], section: 'Child Assessment', required: true },
  { field: 'cmps_childrensspecialistnameandsignature', label: "Children's Specialist Name and Signature", input: 'text', options: [], section: 'Child Assessment', required: true },
]

export type ChildAssessmentPayload = Partial<Record<string, string>>

function orgUrl(): string {
  return String(import.meta.env.VITE_DATAVERSE_ORG_URL || DEFAULT_DATAVERSE_ORG_URL).trim().replace(/\/$/, '')
}

function local(): boolean {
  return typeof window !== 'undefined' && ['localhost', '127.0.0.1'].includes(window.location.hostname)
}

function normalizeGuid(value: string): string {
  return String(value || '').trim().replace(/[{}]/g, '')
}

function normalizePayload(seed: ChildAssessmentPayload): Record<string, unknown> {
  const payload: Record<string, unknown> = { ...seed }
  const programEnrollmentId = normalizeGuid(String(payload.cmps_peid || ''))
  if (programEnrollmentId) {
    delete payload.cmps_peid
    payload['cmps_peid@odata.bind'] = `/${PROGRAM_ENROLLMENT_ENTITY_SET_NAME}(${programEnrollmentId})`
  }

  const medicineValue = String(payload.cmps_doyoutakemedicine || '').trim()
  if (medicineValue) {
    if (/^12557000[01]$/.test(medicineValue)) {
      payload.cmps_doyoutakemedicine = Number(medicineValue)
    } else {
      const index = ['Yes', 'No'].findIndex((option) => option.toLowerCase() === medicineValue.toLowerCase())
      if (index < 0) throw new Error('Invalid choice for 6. Do u take medicine?')
      payload.cmps_doyoutakemedicine = 125570000 + index
    }
  } else {
    delete payload.cmps_doyoutakemedicine
  }

  if (medicineValue.toLowerCase() !== 'yes' && medicineValue !== '125570000') delete payload.cmps_ifyesforwhat

  for (const [field, value] of Object.entries(payload)) {
    if (typeof value === 'string' && !value.trim()) delete payload[field]
  }

  return payload
}

export function generateChildAssessmentRecordId(): string {
  return `CA-${new Date().toISOString().replace(/[-:T]/g, '').slice(0, 15)}`
}

export async function createChildAssessmentResponse(seed: ChildAssessmentPayload): Promise<{ id: string; recordId: string }> {
  const recordId = String(seed.cmps_recordid || '').trim().replace(/\.+$/, '') || generateChildAssessmentRecordId()
  const payload = normalizePayload({ ...seed, cmps_recordid: recordId })

  if (local()) {
    const token = await ensureAuthToken()
    if (!token) throw new Error('Missing Dataverse connection info for Child Assessment create.')
    const response = await fetch(`${orgUrl()}/api/data/v9.2/${CHILD_ASSESSMENTS_TABLE_ALIAS}`, {
      method: 'POST',
      credentials: 'include',
      headers: { Accept: 'application/json', 'Content-Type': 'application/json', 'OData-Version': '4.0', 'OData-MaxVersion': '4.0', Authorization: `Bearer ${token}`, Prefer: 'return=representation' },
      body: JSON.stringify(payload),
    })
    if (!response.ok) throw new Error(await response.text())
    const body = await response.json().catch(() => ({}))
    return { id: normalizeGuid(String(body?.[CHILD_ASSESSMENTS_PRIMARY_ID_FIELD] || body?.id || '')), recordId }
  }

  const token = getAuthToken()
  const result = await runtimeDataClient.executeAsync<any, any>({
    connectorOperation: {
      tableName: 'commondataserviceforapps',
      operationName: 'CreateRecordWithOrganization',
      parameters: { prefer: 'return=representation', accept: 'application/json', 
        organization: orgUrl(),
        entityName: CHILD_ASSESSMENTS_TABLE_ALIAS,
        item: payload,
        ...(token ? { token } : {}),
      },
    },
  } as any)
  if (!result?.success) throw new Error(String(result?.error?.message || result?.error || 'Child Assessment create failed.'))
  return { id: normalizeGuid(String(result?.data?.[CHILD_ASSESSMENTS_PRIMARY_ID_FIELD] || result?.data?.id || '')), recordId }
}

export async function updateChildAssessmentResponse(rowId: string, values: ChildAssessmentPayload): Promise<void> {
  const cleanId = normalizeGuid(rowId)
  if (!cleanId) throw new Error('Missing Child Assessment row id for update.')
  const payload = normalizePayload(values)
  // PATCH must explicitly clear dates; omitting a blank date preserves its old value.
  for (const field of CHILD_ASSESSMENT_FIELDS) {
    const value = (values as Record<string, unknown>)[field.field]
    if (['date', 'datetime'].includes(field.input) && Object.prototype.hasOwnProperty.call(values, field.field)
      && (value === null || (typeof value === 'string' && !value.trim()))) (payload as Record<string, unknown>)[field.field] = null
  }

  if (local()) {
    const token = await ensureAuthToken()
    if (!token) throw new Error('Missing Dataverse connection info for Child Assessment update.')
    const response = await fetch(`${orgUrl()}/api/data/v9.2/${CHILD_ASSESSMENTS_TABLE_ALIAS}(${cleanId})`, {
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
      parameters: {
        organization: orgUrl(),
        entityName: CHILD_ASSESSMENTS_TABLE_ALIAS,
        recordId: cleanId,
        item: payload,
        ...(token ? { token } : {}),
      },
    },
  } as any)
  if (!result?.success) throw new Error(String(result?.error?.message || result?.error || 'Child Assessment update failed.'))
}
