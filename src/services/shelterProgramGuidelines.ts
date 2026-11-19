import { getClient } from '@microsoft/power-apps/data'
import { dataSourcesInfo } from '../../.power/schemas/appschemas/dataSourcesInfo'
import { ensureAuthToken, getAuthToken } from './auth'

export const SHELTER_PROGRAM_GUIDELINES_TABLE_ALIAS = 'cmps_shelterprogramguidelineses'
export const SHELTER_PROGRAM_GUIDELINES_PRIMARY_ID_FIELD = 'cmps_shelterprogramguidelinesid'
const PROGRAM_ENROLLMENT_ENTITY_SET_NAME = 'cmps_programenrollment1s'
const DEFAULT_DATAVERSE_ORG_URL = 'https://org1f466e4e.crm.dynamics.com'
const OPTION_SET_BASE_VALUE = 125570000
const runtimeDataClient = getClient(dataSourcesInfo as any)

export type ShelterProgramGuidelinesSection = 'Main' | 'Autumn House Guidlines' | 'CAAFA Shelter Guidelines' | 'Faith House Guidelines' | 'Children Guidelines' | 'Acknowledgement'

export type ShelterProgramGuidelinesField = {
  field: string
  label: string
  input: 'readonly' | 'lookup' | 'date' | 'radio' | 'text' | 'html'
  options: string[]
  section: ShelterProgramGuidelinesSection
  required?: boolean
  title?: string
}

const AUTUMN_HOUSE_GUIDELINES = `I understand that all residents and staff are responsible for maintaining a safe family friendly atmosphere and creating a cohesive communal environment at Autumn House.

Safety & Confidentiality
• Autumn House is a confidential location. We ask that you get picked up/dropped off from the four street corners: McDonalds at (Mesa Dr. & University), Pawn shop at (Horne & Main), Pete’s Fish diner at (Mesa Dr./Main) and ABC Food Store at (University/Horne). You are welcome to be picked up or dropped off at Autumn House by Comtrans or an established cab company; this does not include Lyft or Uber.
• Your safety is our top priority. We ask that you use the resident sign in/out book each time you enter and leave the property. In the event of an emergency we will check to see who is on or off site.
• We ask that you communicate with staff daily if you are unable to return to shelter by 12:00am. Your communication will notify staff to secure your bed. Daily extended times may be requested in a form of an extension request.
• We strive to keep this a safe environment, free of any derogatory remarks about race, religion, ethnicity, social class, age, medical condition, disability, gender, or sexual preference. We ask that you help us keep it that way by showing respect to other residents, children and staff. We will do our best to ensure you are respected in return. We ask that you do not take pictures and/or video/audio recordings of residents/staff and that you do not share information about the residents or staff through writing, phone calls, text, social media, blogs, chats, or internet sites.

Substances
• As safety is very important to us, we are a drug and alcohol free program.

Children
• Autumn House does not provide childcare onsite; therefore, you will be responsible for the care of your children. You must take your children with you when leaving property. Babysitting agreements are available, please seek staff for assistance.

Community Living
• When exiting shelter, please meet with staff. Autumn House has limited storage space but can accommodate you leaving up to 2 bags for 7 days after your exit date.`

const CAAFA_SHELTER_GUIDELINES = `I understand that all residents and staff are responsible for maintaining a safe family friendly atmosphere and creating a cohesive communal environment at CAAFA shelter.

Safety & Confidentiality
• CAAFA shelter is a confidential location. We ask that you get picked up/dropped off at the Circle K across the street.
• Your safety is our top priority. We ask that you use the resident sign in/out book each time you enter and leave the property. In the event of an emergency, we will check to see who is on or off site.
• We ask that you communicate with staff daily if you are unable to return to shelter by 12:00am. Your communication will notify staff to secure your bed. Daily extended times may be requested in a form of an extension request.
• We strive to keep this a safe environment, free of any derogatory remarks about race, religion, ethnicity, social class, age, medical condition, disability, gender, or sexual preference. We ask that you help us keep it that way by showing respect to other residents, children and staff. We will do our best to ensure you are respected in return. We ask that you do not take pictures and/or videos/audio recordings of residents/staff and that you do not share information about the residents or staff through writing, phone calls, text, social media, blogs, chats, or internet sites.

Substances
• As safety is very important to us, we are a drug and alcohol free program.

Children
• CAAFA shelter does not provide childcare onsite; therefore, you will be responsible for the care of your children. You must take your children with you when leaving property. Babysitting agreements are available, please seek staff for assistance.

Community Living
• When exiting shelter, please meet with staff. CAAFA shelter has limited storage space but can accommodate you leaving up to 2 bags for 7 days after exit. Provide a forwarding address to have mail sent for 7 days after exit.`

const FAITH_HOUSE_GUIDELINES = `I understand that all residents and staff are responsible for maintaining a safe family friendly atmosphere and creating a cohesive communal environment at Faith House.

Safety & Confidentiality
• The location of Faith House is confidential, as are the residents residing at Faith House and the staff members working at Faith House. For the confidentiality, privacy and safety purposes, we ask that you do not disclose the location or identity of anyone at Faith House. Disclosure includes but is not limited to: verbal, photography, and videotaping.
• For your safety, please use the Resident Sign in/Sign out book, listing your expected time of return. In the event of an emergency, this book helps us to learn who is on property.
• If it is not possible for you to return to the shelter by midnight, please call to inform our staff, which can help with your safety plan.
• Everyone who resides here is escaping violence and has come here to be safe. We will not make any derogatory remarks about race, religion, ethnicity, social class, age, medical condition, disability, gender, or sexual preference. We encourage you to do the same in your interactions with other residents and their children, and staff.
• No one is allowed in each other's room for any reason. If you believe there is an emergency, press 0 for Front Desk assistance. Faith House is free from liability of damage, theft or loss of my personal property.
• We provide food and cleaning supplies for all residents of Faith House. All meals Faith House provides must be eaten in the dining room, not taken to crisis rooms. To ensure proper cleanliness, please clean up after yourself and your family each time you eat. Only licensed staff may cook in the facility's kitchen and for your safety, children are not permitted in the kitchen under any circumstances.
• Faith House does not administer any type of medication. Lockers for medication storage are provided in each room to ensure safety of all. We do not provide over-the-counter medication of any kind. We do provide basic first aid supplies at the Front Desk.

In-House Curfew
Summer (6/1 - 8/31) is 9:00PM
Winter (9/1 - 5/31) is 8:00PM

Children
• You are responsible for your children at all times. You must take them with you when you leave property.

Community Cleanliness
• All residents have a responsibility to take care of the shelter. We also ask that you maintain the cleanliness of the yard, including the smoking area. Crisis room checks will be conducted every day to ensure health code guidelines are being met.
• All residents share bathrooms. We ask that you be respectful and considerate of other residents. Please limit your time to 30 minutes, remember to unlock the doors and leave the bathroom clean when finished.`

const CHILDREN_GUIDELINES = `The A New Leaf staff would like to welcome you to your shelter program. We look forward to working with your family! Here are a few guidelines to help your continued stay at your program safe, comfortable and enjoyable. If you have any questions, please feel free to ask.

1. Parents are responsible for their children. Parents who leave program premises must take their children with them.
2. Residents are NOT to hit, threaten to hit, pinch, pull hair, push, etc., or verbally abuse children in any way. Any neglect and/or abuse observed by a resident MUST be reported IMMEDIATELY to the Program staff.
3. Children are not allowed to play in the front yards or parking lot, as these areas are unacceptable play areas.
4. Children (anyone under 18 years old) ARE NOT ALLOWED TO SMOKE AT ANY TIME!
5. Videos shown to children must have a G or PG rating.
6. All children must be enrolled within 5 school days upon admission to the Program during the school year.
7. Please take the time to explain to your children that the Program is a safe place. The location of the shelter and information must be kept confidential at all times.
8. Only children 6 years old and up, who are not on any medications and under 180-pounds are allowed to sleep on the top bunk. Any contagious illnesses or bodily injuries must be reported to the Program staff ASAP.
9. Children two and under will be provided with a pack n play to avoid your child sleeping unattended on the floor, couch or bed.
10. An adult must supervise children around any body of water and small children must be supervised while they are eating in a high chair, no eating in the living room or bedroom.
11. Children of all ages must be with their parent at all times. No child should be left unaccompanied by their parent while on shelter property.

The Program staff are mandated reporters and will make reports to ensure the children of the Program are safe and well taken care of. Please be sure to have your children fed, bathed and are appropriately dressed at all times. The Program staff are here to work with you, you will have meetings scheduled to help you and your family adjust to shelter and establish services that will assist your family with becoming safe, independent and self-sufficient by your 120-exit date. Again, we look forward to working with you and your family!`

export const SHELTER_PROGRAM_GUIDELINES_FIELDS: ShelterProgramGuidelinesField[] = [
  { field: 'cmps_recordid', label: 'Record ID', input: 'readonly', options: [], section: 'Main' },
  { field: 'cmps_peid', label: 'Program Enrollment', input: 'lookup', options: [], section: 'Main', required: true },
  { field: 'cmps_guidlinecompletiondate', label: 'Guideline Completion Date', input: 'date', options: [], section: 'Main', required: true },
  { field: 'cmps_arechildrenalsoenteringtheshelter', label: 'Are Children Also Entering the Shelter?', input: 'radio', options: ['Yes', 'No'], section: 'Main', required: true },
  { field: 'autumn-house-guidelines', title: 'Autumn House Resident Guidelines & Responsibilities', label: AUTUMN_HOUSE_GUIDELINES, input: 'html', options: [], section: 'Autumn House Guidlines' },
  { field: 'caafa-shelter-guidelines', title: 'CAAFA Shelter Resident Guidelines & Responsibilities', label: CAAFA_SHELTER_GUIDELINES, input: 'html', options: [], section: 'CAAFA Shelter Guidelines' },
  { field: 'faith-house-guidelines', title: 'Faith House Resident Guidelines & Responsibilities', label: FAITH_HOUSE_GUIDELINES, input: 'html', options: [], section: 'Faith House Guidelines' },
  { field: 'children-guidelines', title: "A New Leaf's Children-Resident Shelter Guidelines & Responsibilities", label: CHILDREN_GUIDELINES, input: 'html', options: [], section: 'Children Guidelines' },
  { field: 'shelter-program-guidelines-signature-header', label: 'E-Signature Disclaimer/Notice       By signing below, I hereby agree and understand that all electronic signatures are the equivalent of my manual/handwritten signature. This is to be used in conjunction with the use of electronic signatures on all forms in the database with a signature requirement, should I elect to have signed electronically. By signing I affirm I was involved in the creation and ongoing review of this document.', input: 'html', options: [], section: 'Acknowledgement' },
  { field: 'cmps_residentnameandsignature', label: 'Resident Name and Signature', input: 'text', options: [], section: 'Acknowledgement', required: true },
  { field: 'cmps_staffnameandsignature', label: 'Staff Name and Signature', input: 'text', options: [], section: 'Acknowledgement', required: true },
]

export type ShelterProgramGuidelinesPayload = Partial<Record<string, string>>

function orgUrl(): string {
  return String(import.meta.env.VITE_DATAVERSE_ORG_URL || DEFAULT_DATAVERSE_ORG_URL).trim().replace(/\/$/, '')
}

function local(): boolean {
  return typeof window !== 'undefined' && ['localhost', '127.0.0.1'].includes(window.location.hostname)
}

function normalizeGuid(value: string): string {
  return String(value || '').trim().replace(/[{}]/g, '')
}

function normalizePayload(seed: ShelterProgramGuidelinesPayload): Record<string, unknown> {
  const payload: Record<string, unknown> = { ...seed }
  const programEnrollmentId = normalizeGuid(String(payload.cmps_peid || ''))
  if (programEnrollmentId) {
    delete payload.cmps_peid
    payload['cmps_peid@odata.bind'] = `/${PROGRAM_ENROLLMENT_ENTITY_SET_NAME}(${programEnrollmentId})`
  }

  const childrenChoice = String(payload.cmps_arechildrenalsoenteringtheshelter || '').trim()
  if (childrenChoice) {
    const numericValue = Number(childrenChoice)
    if (Number.isInteger(numericValue) && numericValue >= OPTION_SET_BASE_VALUE && numericValue <= OPTION_SET_BASE_VALUE + 1) {
      payload.cmps_arechildrenalsoenteringtheshelter = numericValue
    } else {
      const index = ['Yes', 'No'].findIndex((option) => option.toLowerCase() === childrenChoice.toLowerCase())
      if (index < 0) throw new Error('Invalid choice for Are Children Also Entering the Shelter?')
      payload.cmps_arechildrenalsoenteringtheshelter = OPTION_SET_BASE_VALUE + index
    }
  } else {
    delete payload.cmps_arechildrenalsoenteringtheshelter
  }

  for (const field of SHELTER_PROGRAM_GUIDELINES_FIELDS.filter((entry) => entry.input === 'html')) delete payload[field.field]
  for (const [field, value] of Object.entries(payload)) {
    if (typeof value === 'string' && !value.trim()) delete payload[field]
  }
  return payload
}

export function generateShelterProgramGuidelinesRecordId(): string {
  return `SPG-${new Date().toISOString().replace(/[-:T]/g, '').slice(0, 15)}`
}

export async function createShelterProgramGuidelinesResponse(seed: ShelterProgramGuidelinesPayload): Promise<{ id: string; recordId: string }> {
  const recordId = String(seed.cmps_recordid || '').trim().replace(/\.+$/, '') || generateShelterProgramGuidelinesRecordId()
  const payload = normalizePayload({ ...seed, cmps_recordid: recordId })

  if (local()) {
    const token = await ensureAuthToken()
    if (!token) throw new Error('Missing Dataverse connection info for Shelter Program Guidelines create.')
    const response = await fetch(`${orgUrl()}/api/data/v9.2/${SHELTER_PROGRAM_GUIDELINES_TABLE_ALIAS}`, {
      method: 'POST', credentials: 'include',
      headers: { Accept: 'application/json', 'Content-Type': 'application/json', 'OData-Version': '4.0', 'OData-MaxVersion': '4.0', Authorization: `Bearer ${token}`, Prefer: 'return=representation' },
      body: JSON.stringify(payload),
    })
    if (!response.ok) throw new Error(await response.text())
    const body = await response.json().catch(() => ({}))
    return { id: normalizeGuid(String(body?.[SHELTER_PROGRAM_GUIDELINES_PRIMARY_ID_FIELD] || body?.id || '')), recordId }
  }

  const token = getAuthToken()
  const result = await runtimeDataClient.executeAsync<any, any>({ connectorOperation: { tableName: 'commondataserviceforapps', operationName: 'CreateRecordWithOrganization', parameters: { prefer: 'return=representation', accept: 'application/json',  organization: orgUrl(), entityName: SHELTER_PROGRAM_GUIDELINES_TABLE_ALIAS, item: payload, ...(token ? { token } : {}) } } } as any)
  if (!result?.success) throw new Error(String(result?.error?.message || result?.error || 'Shelter Program Guidelines create failed.'))
  return { id: normalizeGuid(String(result?.data?.[SHELTER_PROGRAM_GUIDELINES_PRIMARY_ID_FIELD] || result?.data?.id || '')), recordId }
}

export async function updateShelterProgramGuidelinesResponse(rowId: string, values: ShelterProgramGuidelinesPayload): Promise<void> {
  const cleanId = normalizeGuid(rowId)
  if (!cleanId) throw new Error('Missing Shelter Program Guidelines row id for update.')
  const payload = normalizePayload(values)
  // PATCH must explicitly clear dates; omitting a blank date preserves its old value.
  for (const field of SHELTER_PROGRAM_GUIDELINES_FIELDS) {
    const value = (values as Record<string, unknown>)[field.field]
    if (['date', 'datetime'].includes(field.input) && Object.prototype.hasOwnProperty.call(values, field.field)
      && (value === null || (typeof value === 'string' && !value.trim()))) (payload as Record<string, unknown>)[field.field] = null
  }

  if (local()) {
    const token = await ensureAuthToken()
    if (!token) throw new Error('Missing Dataverse connection info for Shelter Program Guidelines update.')
    const response = await fetch(`${orgUrl()}/api/data/v9.2/${SHELTER_PROGRAM_GUIDELINES_TABLE_ALIAS}(${cleanId})`, {
      method: 'PATCH', credentials: 'include',
      headers: { Accept: 'application/json', 'Content-Type': 'application/json', 'OData-Version': '4.0', 'OData-MaxVersion': '4.0', Authorization: `Bearer ${token}` },
      body: JSON.stringify(payload),
    })
    if (!response.ok) throw new Error(await response.text())
    return
  }

  const token = getAuthToken()
  const result = await runtimeDataClient.executeAsync<any, any>({ connectorOperation: { tableName: 'commondataserviceforapps', operationName: 'UpdateRecordWithOrganization', parameters: { organization: orgUrl(), entityName: SHELTER_PROGRAM_GUIDELINES_TABLE_ALIAS, recordId: cleanId, item: payload, ...(token ? { token } : {}) } } } as any)
  if (!result?.success) throw new Error(String(result?.error?.message || result?.error || 'Shelter Program Guidelines update failed.'))
}
