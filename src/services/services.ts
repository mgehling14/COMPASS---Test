import { getClient } from '@microsoft/power-apps/data'
import { dataSourcesInfo } from '../../.power/schemas/appschemas/dataSourcesInfo'
import { ensureAuthToken, getAuthToken } from './auth'
import { excludeArchived } from './archive'
import { formatServiceSiteLabel } from './serviceSiteLabels'
import { readDataverseRecordPages } from './dataverseRecordPages'

export const SERVICES_TABLE_ALIAS = 'cmps_serviceses'
export const SERVICES_OPTION_SET_BASE_VALUE = 125570000
const PROGRAM_INFORMATION_ONLY_LABEL = 'Program Information Only'
const PROGRAM_INFORMATION_ONLY_VALUE = 125570071
export const SERVICES_PRIMARY_ID_FIELD = 'cmps_servicesid'
const PROGRAM_ENROLLMENT_ENTITY_SET_NAME = 'cmps_programenrollment1s'
const DEFAULT_DATAVERSE_ORG_URL = 'https://org1f466e4e.crm.dynamics.com'
const runtimeDataClient = getClient(dataSourcesInfo as any)

export type ServicesFieldInput =
  | 'lookup'
  | 'radio'
  | 'select'
  | 'time'
  | 'date'
  | 'text'
  | 'textarea'
  | 'number'
  | 'currency'
  | 'readonly'

export type ServicesFieldSection = 'Main' | 'Service Details' | 'Service Notes' | 'VOCA Direct Services'

export type ServicesFieldDefinition = {
  field: string
  label: string
  input: ServicesFieldInput
  options: string[]
  section: ServicesFieldSection
  required?: boolean
}

export const SERVICES_SITE_OPTIONS = [
  'Autumn House',
  'CAAFA',
  'CAAFA - Crisis Response',
  'CAAFA - Legal',
  'CAAFA - DV',
  'CAAFA - SV',
  'CAAFA - Thrive',
  'DVSTOP',
  'Faith House',
  'REACH Center',
  'Other',
]

export const SERVICE_CATEGORY_OPTIONS = [
  'Intake & Discharge',
  'Assessment',
  'FOCUS Meeting',
  'Pet Services',
  'Safety & Crisis Response',
  'Housing & Stability',
  'Financial Stability',
  'Employment & Career Development',
  'Legal & Medical Advocacy',
  'Emotional Wellness & Healing',
  'Resource Navigation',
  'Family Support',
  'Basic Needs',
  'Empowerment & Self-Sufficiency',
  'Education & Continued Learning',
  'Other',
]

export const SERVICE_OPTIONS = [
  'Intake',
  'Discharge',
  'Adult',
  'Child',
  'Initial',
  'Review',
  'Pet Support',
  'Pet Care',
  'Pet-Related Referral',
  'Pet Transportation',
  'Pet Relocation',
  'Pet Care Coordination',
  'Housing Search Support',
  'Housing Advocacy',
  'Landlord Coordination',
  'Financial Assistance (Housing Stability)',
  'Housing Readiness Planning',
  'Hotel Voucher',
  'Budgeting Support',
  'Financial Literacy',
  'Benefits Navigation',
  'Job Search Assistance',
  'Resume Support',
  'Interview Preparation',
  'Employment Referrals',
  'Parenting Support',
  'Childcare',
  'Transportation Assistance',
  'Food Assistance',
  'Clothing Assistance',
  'Essential Needs Support',
  'Technology/Communication Support',
  'Interpretation',
  'Employment Coaching',
  'Crisis Intervention',
  'Physcial Safety Planning',
  'Emotional Safety Planning',
  'Tech Safety Planning',
  'Legal Referrals',
  'Protective Order Assistance',
  'Criminal Justice Advocacy/Accompaniment',
  'Civil Legal Adovcacy/Accompaniment',
  'General Support (all general, non-goal interactions)',
  'Emotional Support',
  'Counseling Referral',
  'Support Groups',
  'Coping Skills Development',
  'Indivdual Counseling',
  'Internal Referral',
  'External Referral',
  'General Resource Navigation',
  'General Service Coordination',
  'Goal Setting',
  'Empowerment Coaching',
  'Self-Advocacy Development',
  'Life Skills Development',
  'Emergency Financial Assistance',
  'Job Training Assistance',
  'Child Education Referral',
  'Childcare Referral',
  'Childcare Coordination',
  'McKinney Vento Referral/Coordination',
  'Medical Forensic Exam Advocacy/Accompaniment',
  'Group Registration',
  'DV Education',
  'Adult Education Referral',
  'College & University Access Support',
  'Online Learning Resources',
  'Literacy Support',
  'Other',
  PROGRAM_INFORMATION_ONLY_LABEL,
]

// Dropdown order is independent of the stored choice values.
export const SERVICE_ADDITIONAL_DETAIL_CHOICES = [
  { label: 'Adult Community Meeting', value: 125570000 },
  { label: 'Art of Healing Workshop', value: 125570001 },
  { label: 'Child Group', value: 125570002 },
  { label: 'Culturally Specific Healing', value: 125570003 },
  { label: 'DV Support Group', value: 125570004 },
  { label: 'Somatic Series', value: 125570005 },
  { label: 'RISE', value: 125570006 },
  { label: 'Secondary Survivor', value: 125570007 },
  { label: 'Sound Healing', value: 125570008 },
  { label: 'CARE', value: 125570010 },
  { label: 'Other', value: 125570009 },
]
export const SERVICE_ADDITIONAL_DETAIL_OPTIONS = SERVICE_ADDITIONAL_DETAIL_CHOICES.map((choice) => choice.label)

function additionalDetailLabel(value: unknown): string {
  const text = String(value ?? '').trim()
  return normalizeText(text) === 'restorative yoga' ? 'Somatic Series' : text
}

export function resolveServiceAdditionalDetailOptions(options: string[]): string[] {
  if (!options.length) return []
  const labels: string[] = []
  for (const option of options) {
    const text = additionalDetailLabel(option)
    const canonical = SERVICE_ADDITIONAL_DETAIL_CHOICES.find((choice) => normalizeText(choice.label) === normalizeText(text))?.label || text
    if (['care', 'other'].includes(normalizeText(canonical)) || labels.some((label) => normalizeText(label) === normalizeText(canonical))) continue
    labels.push(canonical)
  }
  return [...labels, 'CARE', 'Other']
}

function encodeAdditionalDetail(value: string): string {
  const text = additionalDetailLabel(value)
  const choice = SERVICE_ADDITIONAL_DETAIL_CHOICES.find((entry) => normalizeText(entry.label) === normalizeText(text) || String(entry.value) === text)
  return choice ? String(choice.value) : text
}

function decodeAdditionalDetail(raw: unknown, formatted: unknown): string {
  const text = String(raw ?? '').trim()
  return SERVICE_ADDITIONAL_DETAIL_CHOICES.find((choice) => String(choice.value) === text)?.label || additionalDetailLabel(text || formatted)
}

export const SERVICE_OPTIONS_BY_CATEGORY: Record<string, string[]> = {
  'Intake & Discharge': [
    'Intake',
    'Discharge',
  ],
  Assessment: [
    'Adult',
    'Child',
  ],
  'FOCUS Meeting': [
    'Initial',
    'Review',
    'Discharge',
  ],
  'Pet Services': [
    'Pet Support',
    'Pet Care',
    'Pet-Related Referral',
    'Pet Transportation',
    'Pet Relocation',
    'Pet Care Coordination',
  ],
  'Housing & Stability': [
    'Housing Search Support',
    'Housing Advocacy',
    'Landlord Coordination',
    'Financial Assistance (Housing Stability)',
    'Housing Readiness Planning',
    'Hotel Voucher',
  ],
  'Financial Stability': [
    'Budgeting Support',
    'Financial Literacy',
    'Benefits Navigation',
  ],
  'Employment & Career Development': [
    'Job Search Assistance',
    'Resume Support',
    'Interview Preparation',
    'Employment Referrals',
    'Employment Coaching',
  ],
  'Basic Needs': [
    'Transportation Assistance',
    'Food Assistance',
    'Clothing Assistance',
    'Essential Needs Support',
    'Technology/Communication Support',
    'Interpretation',
  ],
  'Safety & Crisis Response': [
    'Crisis Intervention',
    'Physcial Safety Planning',
    'Emotional Safety Planning',
    'Tech Safety Planning',
  ],
  'Legal & Medical Advocacy': [
    'Legal Referrals',
    'Protective Order Assistance',
    'Criminal Justice Advocacy/Accompaniment',
    'Civil Legal Adovcacy/Accompaniment',
    'Medical Forensic Exam Advocacy/Accompaniment',
  ],
  'Emotional Wellness & Healing': [
    'General Support (all general, non-goal interactions)',
    'Emotional Support',
    'Counseling Referral',
    'Support Groups',
    'Coping Skills Development',
    'Indivdual Counseling',
    'Group Registration',
    'DV Education',
  ],
  'Resource Navigation': [
    PROGRAM_INFORMATION_ONLY_LABEL,
    'Internal Referral',
    'External Referral',
    'General Resource Navigation',
    'General Service Coordination',
  ],
  'Family Support': [
    'Parenting Support',
    'Childcare',
    'Child Education Referral',
    'Childcare Referral',
    'Childcare Coordination',
    'McKinney Vento Referral/Coordination',
  ],
  'Empowerment & Self-Sufficiency': [
    'Goal Setting',
    'Empowerment Coaching',
    'Self-Advocacy Development',
    'Life Skills Development',
  ],
  'Education & Continued Learning': [
    'Adult Education Referral',
    'College & University Access Support',
    'Online Learning Resources',
    'Literacy Support',
  ],
}

SERVICE_OPTIONS_BY_CATEGORY['Financial Stability'] = [...SERVICE_OPTIONS_BY_CATEGORY['Financial Stability'], 'Emergency Financial Assistance']
SERVICE_OPTIONS_BY_CATEGORY['Employment & Career Development'] = [...SERVICE_OPTIONS_BY_CATEGORY['Employment & Career Development'], 'Job Training Assistance']
for (const category of Object.keys(SERVICE_OPTIONS_BY_CATEGORY)) {
  SERVICE_OPTIONS_BY_CATEGORY[category] = [
    ...SERVICE_OPTIONS_BY_CATEGORY[category].filter((option) => option !== 'Other'),
    'Other',
  ]
}

export const WHERE_DID_YOU_REFER_EXTERNAL_OPTIONS = [
  "Arizona Children's Association",
  'Arizona South Asians for Safe Families',
  'Banner Health - MFE',
  'Big Brother Big Sister',
  'CAP (Community Action Program)',
  'CASS (Central Arizona Shelter Services)',
  'Catholic Charities',
  'Chandler Community/Church',
  'Chrysalis Outreach',
  'Chrysalis DV Shelter',
  'DCS',
  'De Colores Outreach',
  'De Colores DV Shelter',
  'DES (Department of Economic Security)',
  'DOVES',
  'Dream Center - ST',
  "Eve's Place",
  'Family Advocacy Center',
  'Family Housing Hub',
  'FANS Across America',
  'Fresh Start',
  'Honor Health - MFE',
  'House of Refuge',
  'Jewish Family Counseling Services',
  'Juvenile Probation',
  'La Frontera - EMPACT',
  'Legal Services for Crime Victims in Arizona',
  'Mesa Community/Church',
  'Mesa Immigrant Education Program',
  'Mesa Public Schools',
  'Mesquite Terrace',
  "My Sister's Place DV Shelter",
  'New Life Center - ST',
  'NLC Outreach',
  'Pathways',
  "Phoenix Children's Hospital",
  'Phoenix Community/Church',
  'Phoenix FAC',
  'Phoenix Public Schools',
  'Rosewood',
  'SAFEDVS',
  'Salvation Army',
  'Shelter Without Walls',
  'Sojurner Lay Legal Advocacy Downtown Phoenix Superior Court',
  'Sojourner Lay Legal Advocacy Southeast Court Mesa',
  'Sojourner Outreach',
  'Sojourner DV Shelter',
  'Solari Crisis',
  'Unite Us',
  'Verde Villas',
  'Other',
]

export const WHERE_DID_YOU_REFER_INTERNAL_OPTIONS = [
  'Autumn House',
  'DV Outreach',
  'CAAFA Shelter',
  'Court Advocacy Surprise/El Mirage',
  'Court Advocacy Glendale',
  'Court Advocacy Northeast Phoenix',
  'Court Advocacy',
  'DVSTOP',
  'Faith House',
  'Faith House Transitional Housing',
  'ANL Foster Care (FC/TFC)',
  'Homeward Bound',
  'MesaCAN',
  'ANL Rapid Rehousing (RRH)',
  'REACH Center',
  'WVCBHS',
  'Workforce',
  'Other',
]

export const WHERE_DID_YOU_REFER_OPTIONS = [
  "Arizona Children's Association",
  'Arizona South Asians for Safe Families',
  'Banner Health - MFE',
  'Big Brother Big Sister',
  'CAP (Community Action Program)',
  'CASS (Central Arizona Shelter Services)',
  'Catholic Charities',
  'Chandler Community/Church',
  'Chrysalis Outreach',
  'Chrysalis DV Shelter',
  'DCS',
  'De Colores Outreach',
  'De Colores DV Shelter',
  'DES (Department of Economic Security)',
  'DOVES',
  'Dream Center - ST',
  "Eve's Place",
  'Family Advocacy Center',
  'Family Housing Hub',
  'FANS Across America',
  'Fresh Start',
  'Honor Health - MFE',
  'House of Refuge',
  'Jewish Family Counseling Services',
  'Juvenile Probation',
  'La Frontera - EMPACT',
  'Legal Services for Crime Victims in Arizona',
  'Mesa Community/Church',
  'Mesa Immigrant Education Program',
  'Mesa Public Schools',
  'Mesquite Terrace',
  "My Sister's Place DV Shelter",
  'New Life Center - ST',
  'NLC Outreach',
  'Pathways',
  "Phoenix Children's Hospital",
  'Phoenix Community/Church',
  'Phoenix FAC',
  'Phoenix Public Schools',
  'Rosewood',
  'SAFEDVS',
  'Salvation Army',
  'Shelter Without Walls',
  'Sojurner Lay Legal Advocacy Downtown Phoenix Superior Court',
  'Sojourner Lay Legal Advocacy Southeast Court Mesa',
  'Sojourner Outreach',
  'Sojourner DV Shelter',
  'Solari Crisis',
  'Unite Us',
  'Verde Villas',
  'Autumn House',
  'DV Outreach',
  'CAAFA Shelter',
  'Court Advocacy Surprise/El Mirage',
  'Court Advocacy Glendale',
  'Court Advocacy Northeast Phoenix',
  'Court Advocacy',
  'DVSTOP',
  'Faith House',
  'Faith House Transitional Housing',
  'ANL Foster Care (FC/TFC)',
  'Homeward Bound',
  'MesaCAN',
  'ANL Rapid Rehousing (RRH)',
  'REACH Center',
  'WVCBHS',
  'Workforce',
  'Other',
]

export const WHERE_DID_YOU_REFER_OPTIONS_BY_SERVICE: Record<string, string[]> = {
  'External Referral': WHERE_DID_YOU_REFER_EXTERNAL_OPTIONS,
  'Internal Referral': WHERE_DID_YOU_REFER_INTERNAL_OPTIONS,
}

export const FUNDER_OPTIONS = [
  'DES DV',
  'DES SV',
  'N/A',
  'OVW-Late Life',
  'SASP',
  'Thrive',
  'VOCA',
]

export const MEETING_MODE_OPTIONS = [
  'In person',
  'Phone',
  'By email',
  'Virtual Meeting',
  'Other',
]

export const DIRECT_SERVICE_CATEGORIES_OPTIONS = [
  'Information and Referral',
  'Personal Advocacy/Accompaniment',
  'Emotional Support or Safety Services',
  'Shelter/Housing Services',
  'Criminal Justice System Assistance',
]

export const INFORMATION_AND_REFERRAL_OPTIONS = [
  'Information about the Criminal Justice Process',
  'Information about Victim Rights, How to Obtain Notifications, etc.',
  'Referral to Other Victim Services Programs',
  'Referral to Other Services, Supports and Resources',
]

export const PERSONAL_ADVOCACY_ACCOMPANIMENT_OPTIONS = [
  'Emergency Medical Care',
  'Victim Advocacy/Accompaniment to Medical Forensic Exam',
  'Law Enforcement Interview Advocacy/Accompaniment',
  'Individual Advocacy',
  'Immigration Assistance',
  'Intervention with Employer, Creditor, Landlord or Academic Institution',
  'Child or Dependent Care Assistance',
  'Transportation Assistance',
  'Interpreter Services',
]

export const EMOTIONAL_SUPPORT_OR_SAFETY_SERVICES_OPTIONS = [
  'Crisis intervention (in-person, includes safety planning, etc.)',
  'Hotline/crisis line counseling',
  'On-scene crisis response (e.g., community crisis response)',
  'Individual counseling',
  'Support Groups (facilitated or peer)',
  'Other therapy (traditional, culturalm or alternative healing: art, writing, or play therapy, etc.)',
  'Emergency financial assistance (includes emergency loans and petty cash, payment for items such as food and/or clothing, changing windows and/or locks, taxis, prophylactic and nonprophylcatic medications, durable medical equipment, etc.)',
]

export const SHELTER_HOUSING_SERVICES_OPTIONS = [
  'Transitional housing',
  'Relocation assistance',
]

export const CRIMINAL_CIVIL_JUSTICE_ASSISTANCE_OPTIONS = [
  'Notification of Criminal Justice Events',
  'Victim Impact Statement Assistance',
  'Assistance with Restitution',
  'Civil Legal Assistance in Obtaining Protection or Restraining Order',
  'Civil Legal Assistance with Family Law Issues',
  'Other Emergency Justice-Related Assistance',
  'Immigration Assistance',
  'Prosecution Interview Advocacy/Accompaniment',
  'Law Enforcement Interview Advocacy/Accompaniment',
  'Criminal Advocacy/Accompaniment',
]

export const SERVICES_FIELD_DEFINITIONS: ServicesFieldDefinition[] = [
  { field: 'cmps_recordid', label: 'RecordID', input: 'readonly', options: [], section: 'Main' },
  { field: 'cmps_programenrollment', label: 'Program Enrollment', input: 'lookup', options: [], section: 'Main', required: true },
  { field: 'cmps_servicesite', label: 'Service Site', input: 'select', options: SERVICES_SITE_OPTIONS, section: 'Main' },
  { field: 'cmps_servicesiteother', label: 'Service Site - Other', input: 'text', options: [], section: 'Main' },
  { field: 'cmps_dateofservice', label: 'Date of Services', input: 'date', options: [], section: 'Main', required: true },
  { field: 'cmps_time', label: 'Time', input: 'time', options: [], section: 'Main', required: true },
  { field: 'cmps_servicecategory', label: 'Service Category', input: 'select', options: SERVICE_CATEGORY_OPTIONS, section: 'Service Details', required: true },
  { field: 'cmps_servicecategoryother', label: 'Service Category - Other', input: 'text', options: [], section: 'Service Details' },
  { field: 'cmps_service', label: 'Service', input: 'select', options: SERVICE_OPTIONS, section: 'Service Details', required: true },
  { field: 'cmps_serviceother', label: 'Service - Other', input: 'text', options: [], section: 'Service Details' },
  { field: 'cmps_additionalservicedetail', label: 'Additional Service Detail', input: 'select', options: SERVICE_ADDITIONAL_DETAIL_OPTIONS, section: 'Service Details' },
  { field: 'cmps_additionalservicedetailother', label: 'Additional Service Detail - Other', input: 'text', options: [], section: 'Service Details' },
  { field: 'cmps_servicecost', label: 'Service Cost', input: 'currency', options: [], section: 'Service Details', required: true },
  { field: 'cmps_wheredidyourefer', label: 'Where Did You Refer', input: 'select', options: WHERE_DID_YOU_REFER_OPTIONS, section: 'Service Details', required: true },
  { field: 'cmps_wheredidyoureferother', label: 'Where Did You Refer - Other', input: 'text', options: [], section: 'Service Details' },
  { field: 'cmps_minutes', label: 'Minutes', input: 'number', options: [], section: 'Service Details', required: true },
  { field: 'cmps_funder', label: 'Funder', input: 'select', options: FUNDER_OPTIONS, section: 'Service Details', required: true },
  { field: 'cmps_wasinformationservicereceivedhelpful', label: 'Was Information/Service Received Helpful?', input: 'radio', options: ['Yes', 'No'], section: 'Service Details', required: true },
  { field: 'cmps_meetingmode', label: 'Meeting Mode', input: 'radio', options: MEETING_MODE_OPTIONS, section: 'Main' },
  { field: 'cmps_meetingmodeother', label: 'Meeting Mode - Other', input: 'text', options: [], section: 'Main' },
  { field: 'cmps_clientresponsefeedback', label: 'Client Response Feedback', input: 'textarea', options: [], section: 'Service Notes' },
  { field: 'cmps_servicenotes', label: 'Service Notes', input: 'textarea', options: [], section: 'Service Notes' },
  { field: 'cmps_directservicecategories', label: 'Direct Service Categories', input: 'select', options: DIRECT_SERVICE_CATEGORIES_OPTIONS, section: 'VOCA Direct Services' },
  { field: 'cmps_informationandreferral', label: 'Information and Referral', input: 'select', options: INFORMATION_AND_REFERRAL_OPTIONS, section: 'VOCA Direct Services' },
  { field: 'cmps_personaladvocacyaccompaniment', label: 'Personal Advocacy / Accompaniment', input: 'select', options: PERSONAL_ADVOCACY_ACCOMPANIMENT_OPTIONS, section: 'VOCA Direct Services' },
  { field: 'cmps_emotionalsupportorsafetyservices', label: 'Emotional Support or Safety Services', input: 'select', options: EMOTIONAL_SUPPORT_OR_SAFETY_SERVICES_OPTIONS, section: 'VOCA Direct Services' },
  { field: 'cmps_shelterhousingservices', label: 'Shelter / Housing Services', input: 'select', options: SHELTER_HOUSING_SERVICES_OPTIONS, section: 'VOCA Direct Services' },
  { field: 'cmps_criminalciviljusticeassistance', label: 'Criminal / Civil Justice Assistance', input: 'select', options: CRIMINAL_CIVIL_JUSTICE_ASSISTANCE_OPTIONS, section: 'VOCA Direct Services' },
]

export const SERVICES_FIELD_NAMES = SERVICES_FIELD_DEFINITIONS.map((field) => field.field)

export const SERVICES_FIELD_DEF_BY_NAME = new Map<string, ServicesFieldDefinition>(
  SERVICES_FIELD_DEFINITIONS.map((field) => [field.field, field]),
)

export type ServicesPayload = Partial<Record<(typeof SERVICES_FIELD_NAMES)[number], string>>

export type ServicesListRecord = {
  id: string
  recordId: string
  serviceCategory: string
  service: string
  dateOfServices: string
  funder: string
  minutes: string
  serviceTime: string
  modifiedOn?: string
  createdOn?: string
}

export type ServicesDetailRecord = {
  id: string
  recordId: string
  values: ServicesPayload
}

type ServicesDataversePayload = Record<string, unknown>

function sanitizeOrgUrl(value: unknown): string {
  const raw = String(value || '').trim().replace(/\/$/, '')
  const lowered = raw.toLowerCase()
  if (!raw || lowered === 'null' || lowered === 'undefined') return ''
  return raw
}

function getOrgUrl(): string {
  const configured = sanitizeOrgUrl(import.meta.env.VITE_DATAVERSE_ORG_URL)
  return configured || DEFAULT_DATAVERSE_ORG_URL
}

function isLocalHost(): boolean {
  if (typeof window === 'undefined') return false
  const host = window.location.hostname
  return host === 'localhost' || host === '127.0.0.1'
}

function rowsFromPayload(payload: any): any[] {
  if (Array.isArray(payload)) return payload
  if (Array.isArray(payload?.value)) return payload.value
  return []
}

function normalizeText(value: unknown): string {
  return String(value || '').trim().toLowerCase()
}

function isNumericLiteral(value: string): boolean {
  return /^-?\d+$/.test(String(value || '').trim())
}

function normalizeGuid(value: unknown): string {
  return String(value || '').trim().replace(/[{}]/g, '').toLowerCase()
}

function isLikelyDataverseGuid(value: string): boolean {
  return /^[0-9a-fA-F]{8}-[0-9a-fA-F]{4}-[0-9a-fA-F]{4}-[0-9a-fA-F]{4}-[0-9a-fA-F]{12}$/.test(String(value || '').trim())
}

function isEmptyDateValue(value: string): boolean {
  const text = String(value || '').trim()
  if (!text) return true
  if (text.startsWith('0001-01-01')) return true
  if (text.startsWith('01/01/0001')) return true
  if (text.startsWith('1/1/0001')) return true
  return false
}

function toIsoDate(value: Date): string {
  const year = value.getUTCFullYear()
  const month = String(value.getUTCMonth() + 1).padStart(2, '0')
  const day = String(value.getUTCDate()).padStart(2, '0')
  return `${year}-${month}-${day}`
}

function normalizeDateValueForDataverse(value: string): string {
  const text = String(value || '').trim()
  if (isEmptyDateValue(text)) return ''

  const isoDateMatch = text.match(/^(\d{4})-(\d{2})-(\d{2})(?:T.*)?$/)
  if (isoDateMatch) return `${isoDateMatch[1]}-${isoDateMatch[2]}-${isoDateMatch[3]}`

  const slashDateMatch = text.match(/^(\d{1,2})\/(\d{1,2})\/(\d{4})(?:\s.*)?$/)
  if (slashDateMatch) {
    const month = Number.parseInt(slashDateMatch[1], 10)
    const day = Number.parseInt(slashDateMatch[2], 10)
    const year = Number.parseInt(slashDateMatch[3], 10)
    const parsed = new Date(Date.UTC(year, month - 1, day))
    if (Number.isNaN(parsed.getTime())) return ''
    if (parsed.getUTCFullYear() !== year || parsed.getUTCMonth() !== month - 1 || parsed.getUTCDate() !== day) return ''
    return toIsoDate(parsed)
  }

  const parsed = new Date(text)
  if (Number.isNaN(parsed.getTime())) return text
  return toIsoDate(parsed)
}

function encodeOptionLiteral(value: string, options: string[]): string {
  const text = String(value || '').trim().replace(/^CAAFA Outreach$/i, 'DV Outreach')
  if (!text) return ''
  if (isNumericLiteral(text)) return text

  const normalized = normalizeText(text)
  if (normalized === normalizeText('Legal Advocacy')) {
    const renamedIndex = options.findIndex((entry) => normalizeText(entry) === normalizeText('Legal & Medical Advocacy'))
    if (renamedIndex >= 0) return String(SERVICES_OPTION_SET_BASE_VALUE + renamedIndex)
  }
  const index = options.findIndex((entry) => normalizeText(entry) === normalized)
  if (index >= 0) return String(SERVICES_OPTION_SET_BASE_VALUE + index)
  return text
}

function encodeServiceOptionLiteral(value: string, options: string[]): string {
  const text = String(value ?? '').trim()
  if (!text || isNumericLiteral(text)) return text
  if (normalizeText(text) === normalizeText(PROGRAM_INFORMATION_ONLY_LABEL)) return String(PROGRAM_INFORMATION_ONLY_VALUE)
  // The actual backend retains a second Discharge slot at 125570006.
  // It is not a second UI option, but subsequent values must not shift.
  if (normalizeText(text) === 'other') throw new Error('Other has no configured Dataverse Service choice. Select the saved service instead.')
  const index = options.findIndex((option) => normalizeText(option) === normalizeText(text))
  return index < 0 ? text : String(SERVICES_OPTION_SET_BASE_VALUE + index + (index >= 6 ? 1 : 0))
}

function decodeOptionLiteral(value: string, options: string[]): string {
  const text = String(value || '').trim().replace(/^CAAFA Outreach$/i, 'DV Outreach')
  if (!text) return ''
  if (!isNumericLiteral(text)) return text

  const numeric = Number.parseInt(text, 10)
  const index = numeric - SERVICES_OPTION_SET_BASE_VALUE
  if (index >= 0 && index < options.length) return options[index]
  return text
}

function decodeServiceOptionLiteral(value: string, options: string[]): string {
  const text = String(value ?? '').trim()
  if (!isNumericLiteral(text)) return text
  if (Number(text) === PROGRAM_INFORMATION_ONLY_VALUE) return PROGRAM_INFORMATION_ONLY_LABEL
  const slot = Number(text) - SERVICES_OPTION_SET_BASE_VALUE
  if (slot === 6) return 'Discharge'
  const index = slot > 6 ? slot - 1 : slot
  // Keep unmapped values intact; never overwrite them with Other/Intake.
  return index >= 0 && index < options.length ? options[index] : text
}

function encodeChoiceFieldValue(input: ServicesFieldInput, options: string[], rawValue: string): string {
  const text = String(rawValue || '').trim()
  if (!text || options.length === 0) return text
  if (input === 'select' || input === 'radio') return encodeOptionLiteral(text, options)
  return text
}

function decodeChoiceFieldValue(input: ServicesFieldInput, options: string[], rawValue: unknown, formattedValue?: unknown): string {
  const formatted = String(formattedValue || '').trim().replace(/^CAAFA Outreach$/i, 'DV Outreach')
  if (formatted) return normalizeText(formatted) === normalizeText('Legal Advocacy') ? 'Legal & Medical Advocacy' : formatted

  const text = String(rawValue ?? '').trim()
  if (!text || options.length === 0) return text
  if (input === 'select' || input === 'radio') return decodeOptionLiteral(text, options)
  return text
}

function parseConnectorErrorMessage(error: unknown): string {
  if (typeof error === 'string') return error
  if (!error || typeof error !== 'object') return 'Connector operation failed.'
  const err = error as any
  const nested = err?.innerError?.message || err?.message
  if (nested) return String(nested)
  try {
    return JSON.stringify(error)
  } catch {
    return 'Connector operation failed.'
  }
}

function normalizeServicesPayloadForDataverse(seed: ServicesPayload): ServicesDataversePayload {
  const payload: ServicesDataversePayload = { ...seed }

  const enrollmentLookupRowId = normalizeGuid(payload.cmps_programenrollment)
  delete payload.cmps_programenrollment
  if (enrollmentLookupRowId) {
    if (!isLikelyDataverseGuid(enrollmentLookupRowId)) throw new Error('Please select a Program Enrollment record, not its legacy or display ID.')
    payload['cmps_programenrollment@odata.bind'] = `/${PROGRAM_ENROLLMENT_ENTITY_SET_NAME}(${enrollmentLookupRowId})`
  }

  for (const fieldName of SERVICES_FIELD_NAMES) {
    if (!Object.prototype.hasOwnProperty.call(payload, fieldName)) continue
    const fieldDef = SERVICES_FIELD_DEF_BY_NAME.get(fieldName)
    if (!fieldDef) continue
    const rawValue = fieldName === 'cmps_servicesite'
      ? formatServiceSiteLabel(payload[fieldName])
      : String(payload[fieldName] ?? '').trim()
    if (!rawValue) {
      if (fieldDef.input === 'select' || fieldDef.input === 'radio') delete payload[fieldName]
      if (fieldDef.input === 'number' || fieldDef.input === 'currency') payload[fieldName] = null
      continue
    }

    if (fieldDef.input === 'date') {
      const normalizedDate = normalizeDateValueForDataverse(rawValue)
      if (!normalizedDate) {
        delete payload[fieldName]
        continue
      }
      payload[fieldName] = normalizedDate
      continue
    }

    if (fieldDef.input === 'number' || fieldDef.input === 'currency') {
      const numeric = Number(rawValue)
      if (!Number.isFinite(numeric)) throw new Error(`Invalid number for ${fieldDef.label}. Enter a numeric value or leave it blank.`)
      payload[fieldName] = numeric
      continue
    }

    if (fieldDef.input === 'select' || fieldDef.input === 'radio') {
      const encoded = fieldName === 'cmps_service'
        ? normalizeText(rawValue) === 'discharge' && (normalizeText(seed.cmps_servicecategory || '') === 'focus meeting' || String(seed.cmps_servicecategory) === '125570002')
          ? String(SERVICES_OPTION_SET_BASE_VALUE + 6)
          : encodeServiceOptionLiteral(rawValue, fieldDef.options)
        : fieldName === 'cmps_additionalservicedetail'
          ? encodeAdditionalDetail(rawValue)
          : encodeChoiceFieldValue(fieldDef.input, fieldDef.options, rawValue)
      if (!isNumericLiteral(encoded)) {
        throw new Error(
          `Invalid choice value for ${fieldName}: "${rawValue}". Expected one of the configured option labels for this field.`,
        )
      }
      payload[fieldName] = Number.parseInt(encoded, 10)
    }
  }

  return payload
}

function mapServicesDetailRow(row: Record<string, unknown>): ServicesDetailRecord {
  const values: ServicesPayload = {}

  for (const field of SERVICES_FIELD_NAMES) {
    if (field === 'cmps_programenrollment') {
      const rawLookup = row?.['_cmps_programenrollment_value']
      values[field] = String(rawLookup || '').trim()
      continue
    }

    const raw = row?.[field]
    const fieldDef = SERVICES_FIELD_DEF_BY_NAME.get(field)
    if (!fieldDef) {
      values[field] = String(raw ?? '').trim()
      continue
    }

    const formatted = (row as Record<string, unknown>)[`${field}@OData.Community.Display.V1.FormattedValue`]
    if (fieldDef.input === 'date') {
      values[field] = normalizeDateValueForDataverse(String(raw ?? ''))
      continue
    }
    if (fieldDef.input === 'number' || fieldDef.input === 'currency' || fieldDef.input === 'time') {
      values[field] = String(raw ?? '').trim()
      continue
    }
    values[field] = field === 'cmps_service'
      ? (decodeServiceOptionLiteral(String(raw ?? ''), fieldDef.options) || String(formatted || '').trim())
      : field === 'cmps_additionalservicedetail'
        ? decodeAdditionalDetail(raw, formatted)
        : decodeChoiceFieldValue(fieldDef.input, fieldDef.options, raw, formatted)
    if (field === 'cmps_servicesite') values[field] = formatServiceSiteLabel(values[field])
  }

  return {
    id: String(row?.[SERVICES_PRIMARY_ID_FIELD] || row?.id || '').trim(),
    recordId: String(values.cmps_recordid || row?.cmps_recordid || '').trim(),
    values,
  }
}

export function generateServicesRecordId(): string {
  const now = new Date()
  const datePart = now.toISOString().slice(0, 10).replace(/-/g, '')
  const timePart = now.toISOString().slice(11, 19).replace(/:/g, '')
  return `SV-${datePart}${timePart}`
}

// A successful create with no response body must never be submitted again.
// Keep the original app ID and resolve that exact row on subsequent retries.
const submittedServices = new Set<string>()

async function findSubmittedService(recordId: string, enrollmentId: string): Promise<string> {
  const select = `${SERVICES_PRIMARY_ID_FIELD},cmps_recordid,_cmps_programenrollment_value`
  const filter = `cmps_recordid eq '${recordId.replace(/'/g, "''")}'`
  const orgUrl = getOrgUrl()
  let body: any
  if (!isLocalHost()) {
    const token = getAuthToken()
    const result = await runtimeDataClient.executeAsync<any, any>({ connectorOperation: {
      tableName: 'commondataserviceforapps', operationName: 'ListRecordsWithOrganization',
      parameters: { organization: orgUrl, entityName: SERVICES_TABLE_ALIAS, '$select': select, '$filter': filter, '$top': 2, ...(token ? { token } : {}) },
    } } as any)
    if (!result?.success) throw new Error(parseConnectorErrorMessage(result?.error || result))
    body = result.data
  } else {
    const token = await ensureAuthToken()
    if (!token) throw new Error('Dataverse authentication is required to confirm the Service record.')
    const query = new URLSearchParams({ '$select': select, '$filter': filter, '$top': '2' })
    const response = await fetch(`${orgUrl}/api/data/v9.2/${SERVICES_TABLE_ALIAS}?${query}`, {
      credentials: 'include', headers: { Accept: 'application/json', Authorization: `Bearer ${token}` },
    })
    if (!response.ok) throw new Error(await response.text())
    body = await response.json()
  }
  const rows = rowsFromPayload(body)
  if (rows.length !== 1 || String(rows[0]?.cmps_recordid || '').trim() !== recordId) throw new Error('The exact submitted Service record could not be uniquely identified.')
  const row = rows[0]
  if (enrollmentId && normalizeGuid(row._cmps_programenrollment_value) !== enrollmentId) throw new Error('The submitted Service record is not linked to the selected Program Enrollment.')
  const id = normalizeGuid(row[SERVICES_PRIMARY_ID_FIELD] || row.id)
  if (!isLikelyDataverseGuid(id)) throw new Error('Dataverse did not return a valid Service row ID.')
  return id
}

async function confirmSubmittedService(recordId: string, enrollmentId: string): Promise<string> {
  try { return await findSubmittedService(recordId, enrollmentId) } catch (error) {
    throw new Error(`Services ${recordId} was submitted, but confirmation is still pending. Your form has been kept open; saving again will check this same record, not create another. Details: ${String((error as Error)?.message || error)}`)
  }
}

function serviceCreatedId(body: any, entityId = ''): string {
  const value = body?.[SERVICES_PRIMARY_ID_FIELD] || body?.id || ''
  const direct = normalizeGuid(value)
  if (isLikelyDataverseGuid(direct)) return direct
  const reference = String(body?.['@odata.id'] || entityId)
  const match = reference.match(/\(([a-f\d-]{36})\)\/?$/i)
  return match && isLikelyDataverseGuid(match[1]) ? normalizeGuid(match[1]) : ''
}

export async function createServicesResponse(values: ServicesPayload): Promise<{ id: string; recordId: string }> {
  const recordId = String(values.cmps_recordid || '').trim() || generateServicesRecordId()
  const payload = normalizeServicesPayloadForDataverse({ ...values, cmps_recordid: recordId })
  const orgUrl = getOrgUrl()
  const token = getAuthToken()
  const submissionKey = `${orgUrl}|${recordId}`
  const enrollmentId = normalizeGuid(values.cmps_programenrollment)
  if (submittedServices.has(submissionKey)) return { id: await confirmSubmittedService(recordId, enrollmentId), recordId }

  if (!isLocalHost()) {
    const result = await runtimeDataClient.executeAsync<any, any>({
      connectorOperation: {
        tableName: 'commondataserviceforapps',
        operationName: orgUrl ? 'CreateRecordWithOrganization' : 'CreateRecord',
        parameters: { prefer: 'return=representation', accept: 'application/json', 
          ...(orgUrl ? { organization: orgUrl } : {}),
          entityName: SERVICES_TABLE_ALIAS,
          item: payload,
          ...(token ? { token } : {}),
        },
      },
    } as any)

    if (!result?.success) throw new Error(parseConnectorErrorMessage(result?.error || result))
    const returnedId = serviceCreatedId(result.data)
    if (!returnedId) submittedServices.add(submissionKey)
    const id = returnedId || await confirmSubmittedService(recordId, enrollmentId)
    return { id, recordId }
  }

  const localToken = await ensureAuthToken()
  if (!orgUrl || !localToken) throw new Error('Missing Dataverse connection info for Services create.')

  const headers = new Headers()
  headers.set('Accept', 'application/json')
  headers.set('Content-Type', 'application/json')
  headers.set('OData-Version', '4.0')
  headers.set('OData-MaxVersion', '4.0')
  headers.set('Authorization', `Bearer ${localToken}`)
  headers.set('Prefer', 'return=representation')

  const response = await fetch(`${orgUrl}/api/data/v9.2/${SERVICES_TABLE_ALIAS}`, {
    method: 'POST',
    credentials: 'include',
    headers,
    body: JSON.stringify(payload),
  })

  if (!response.ok) throw new Error(await response.text())
  const body = await response.json().catch(() => ({}))
  const returnedId = serviceCreatedId(body, response.headers?.get('OData-EntityId') || '')
  if (!returnedId) submittedServices.add(submissionKey)
  const id = returnedId || await confirmSubmittedService(recordId, enrollmentId)
  return { id, recordId }
}

export async function updateServicesResponse(rowId: string, values: ServicesPayload): Promise<void> {
  const cleanId = String(rowId || '').trim()
  if (!cleanId) throw new Error('Missing Services row id for update.')
  const payload = normalizeServicesPayloadForDataverse(values)
  // PATCH must explicitly clear dates; omitting a blank date preserves its old value.
  for (const field of SERVICES_FIELD_DEFINITIONS) {
    const value = (values as Record<string, unknown>)[field.field]
    if (['date', 'datetime'].includes(field.input) && Object.prototype.hasOwnProperty.call(values, field.field)
      && (value === null || (typeof value === 'string' && !value.trim()))) (payload as Record<string, unknown>)[field.field] = null
  }
  const orgUrl = getOrgUrl()
  const token = getAuthToken()

  if (!isLocalHost()) {
    const result = await runtimeDataClient.executeAsync<any, any>({
      connectorOperation: {
        tableName: 'commondataserviceforapps',
        operationName: orgUrl ? 'UpdateRecordWithOrganization' : 'UpdateRecord',
        parameters: {
          ...(orgUrl ? { organization: orgUrl } : {}),
          entityName: SERVICES_TABLE_ALIAS,
          recordId: cleanId,
          item: payload,
          prefer: 'return=representation',
          accept: 'application/json',
          ...(token ? { token } : {}),
        },
      },
    } as any)

    if (!result?.success) throw new Error(parseConnectorErrorMessage(result?.error || result))
    return
  }

  const localToken = await ensureAuthToken()
  if (!orgUrl || !localToken) throw new Error('Missing Dataverse connection info for Services update.')

  const headers = new Headers()
  headers.set('Accept', 'application/json')
  headers.set('Content-Type', 'application/json')
  headers.set('OData-Version', '4.0')
  headers.set('OData-MaxVersion', '4.0')
  headers.set('Authorization', `Bearer ${localToken}`)

  const response = await fetch(`${orgUrl}/api/data/v9.2/${SERVICES_TABLE_ALIAS}(${cleanId})`, {
    method: 'PATCH',
    credentials: 'include',
    headers,
    body: JSON.stringify(payload),
  })

  if (!response.ok) throw new Error(await response.text())
}

function rowMatchesEnrollmentLookup(row: Record<string, unknown>, enrollmentRowId: string): boolean {
  const target = normalizeGuid(enrollmentRowId)
  if (!target) return false

  const candidates = [
    row?._cmps_programenrollment_value,
    row?.cmps_programenrollment,
    row?.['_cmps_programenrollment_value@OData.Community.Display.V1.FormattedValue'],
  ]

  return candidates.some((entry) => normalizeGuid(entry) === target)
}

export async function listServicesForProgramEnrollmentRecord(programEnrollmentRowId: string): Promise<ServicesListRecord[]> {
  const cleanId = normalizeGuid(programEnrollmentRowId)
  if (!isLikelyDataverseGuid(cleanId)) return []
  const select = [SERVICES_PRIMARY_ID_FIELD, 'cmps_recordid', 'createdon', 'modifiedon', 'cmps_servicecategory', 'cmps_service', 'cmps_dateofservice', 'cmps_funder', 'cmps_minutes', 'cmps_time', '_cmps_programenrollment_value', 'cmps_isarchived'].join(',')
  const query = { '$select': select, '$filter': excludeArchived(`_cmps_programenrollment_value eq ${cleanId}`), '$orderby': `createdon desc,${SERVICES_PRIMARY_ID_FIELD} asc` }
  const orgUrl = getOrgUrl()
  const runtime = !isLocalHost()
  const token = runtime ? getAuthToken() : await ensureAuthToken()
  if (!runtime && !token) throw new Error('Dataverse authentication is required to load Services.')
  const headers = new Headers({ Accept: 'application/json', 'OData-Version': '4.0', 'OData-MaxVersion': '4.0', Authorization: `Bearer ${token}`, Prefer: 'odata.maxpagesize=1000,odata.include-annotations="OData.Community.Display.V1.FormattedValue"' })
  const rows = await readDataverseRecordPages(orgUrl, SERVICES_TABLE_ALIAS, query, runtime, async (parameters, nextUrl) => {
    if (runtime) {
      const result = await runtimeDataClient.executeAsync<any, any>({ connectorOperation: {
        tableName: 'commondataserviceforapps', operationName: parameters.next ? 'GetNextPageWithOrganization' : 'ListRecordsWithOrganization',
        parameters: parameters.next
          ? { organization: parameters.organization || orgUrl, next: parameters.next }
          : { organization: orgUrl, entityName: SERVICES_TABLE_ALIAS, ...parameters, prefer: 'odata.maxpagesize=1000,odata.include-annotations="OData.Community.Display.V1.FormattedValue"', ...(token ? { token } : {}) },
      } } as any)
      if (!result?.success) throw new Error(`Unable to load Services for this enrollment: ${parseConnectorErrorMessage(result?.error || result)}`)
      return result.data
    }
    const search = new URLSearchParams(Object.entries(parameters).map(([key, value]) => [key, String(value)]))
    const response = await fetch(nextUrl || `${orgUrl}/api/data/v9.2/${SERVICES_TABLE_ALIAS}?${search}`, { method: 'GET', credentials: 'include', headers })
    if (!response.ok) throw new Error(`Unable to load Services for this enrollment: ${await response.text()}`)
    return response.json()
  })
  const unique = new Map<string, ServicesListRecord>()
  for (const row of rows) {
    if (!rowMatchesEnrollmentLookup(row, cleanId) || Number(row.cmps_isarchived) === 125570000) continue
    const id = normalizeGuid(row[SERVICES_PRIMARY_ID_FIELD] || row.id)
    if (!isLikelyDataverseGuid(id)) continue
    unique.set(id, {
      id, recordId: String(row.cmps_recordid || '').trim(),
      serviceCategory: decodeChoiceFieldValue('select', SERVICES_FIELD_DEF_BY_NAME.get('cmps_servicecategory')?.options || [], row.cmps_servicecategory, row['cmps_servicecategory@OData.Community.Display.V1.FormattedValue']),
      service: decodeServiceOptionLiteral(String(row.cmps_service ?? ''), SERVICES_FIELD_DEF_BY_NAME.get('cmps_service')?.options || []) || String(row['cmps_service@OData.Community.Display.V1.FormattedValue'] || '').trim(),
      dateOfServices: String(row.cmps_dateofservice || '').trim(),
      funder: decodeChoiceFieldValue('select', SERVICES_FIELD_DEF_BY_NAME.get('cmps_funder')?.options || [], row.cmps_funder, row['cmps_funder@OData.Community.Display.V1.FormattedValue']),
      minutes: String(row.cmps_minutes ?? '').trim(),
      serviceTime: String(row.cmps_time ?? '').trim(),
      createdOn: String(row.createdon || '').trim(), modifiedOn: String(row.modifiedon || '').trim(),
    })
  }
  return [...unique.values()]
}


export async function loadServicesDetailRecord(rowId: string, recordIdHint = ''): Promise<ServicesDetailRecord> {
  const cleanId = String(rowId || '').trim()
  const cleanRecordId = String(recordIdHint || '').trim()
  if (!cleanId && !cleanRecordId) throw new Error('Missing Services row id and record id for detail load.')

  const select = [SERVICES_PRIMARY_ID_FIELD, ...SERVICES_FIELD_NAMES.filter((field) => field !== 'cmps_programenrollment'), '_cmps_programenrollment_value'].join(',')
  const orgUrl = getOrgUrl()
  const token = getAuthToken()

  if (!isLocalHost()) {
    if (cleanId || cleanRecordId) {
      const id = normalizeGuid(cleanId)
      if (id && !isLikelyDataverseGuid(id)) throw new Error('A Services Dataverse row ID is required, not its legacy ID.')
      const filter = id ? `${SERVICES_PRIMARY_ID_FIELD} eq ${id}` : `cmps_recordid eq '${cleanRecordId.replace(/'/g, "''")}'`
      const listResult = await runtimeDataClient.executeAsync<any, any>({
        connectorOperation: {
          tableName: 'commondataserviceforapps',
          operationName: orgUrl ? 'ListRecordsWithOrganization' : 'ListRecords',
          parameters: {
            ...(orgUrl ? { organization: orgUrl } : {}),
            entityName: SERVICES_TABLE_ALIAS,
            '$select': select,
            '$filter': excludeArchived(filter),
            '$top': 2,
            ...(token ? { token } : {}),
          },
        },
      } as any)

      if (listResult?.success) {
        const rows = rowsFromPayload(listResult.data)
        if (rows.length !== 1 || (id && normalizeGuid(rows[0]?.[SERVICES_PRIMARY_ID_FIELD]) !== id)) throw new Error('The Services record could not be uniquely identified.')
        return mapServicesDetailRow(rows[0])
      }
      throw new Error(parseConnectorErrorMessage(listResult?.error || listResult))
    }
  }

  const localToken = await ensureAuthToken()
  if (!orgUrl || !localToken) throw new Error('Missing Dataverse connection info for Services detail load.')
  const headers = new Headers()
  headers.set('Accept', 'application/json')
  headers.set('OData-Version', '4.0')
  headers.set('OData-MaxVersion', '4.0')
  headers.set('Authorization', `Bearer ${localToken}`)

  if (cleanId) {
    const directResponse = await fetch(
      `${orgUrl}/api/data/v9.2/${SERVICES_TABLE_ALIAS}(${cleanId})?$select=${encodeURIComponent(select)}`,
      {
        method: 'GET',
        credentials: 'include',
        headers,
      },
    )

    if (directResponse.ok) {
      const row = await directResponse.json().catch(() => ({}))
      return mapServicesDetailRow(row)
    }
  }

  if (!cleanRecordId) throw new Error('No Services record found.')
  const filter = `cmps_recordid eq '${String(cleanRecordId || '').replace(/'/g, "''")}'`
  const response = await fetch(
    `${orgUrl}/api/data/v9.2/${SERVICES_TABLE_ALIAS}?$select=${encodeURIComponent(select)}&$filter=${encodeURIComponent(filter)}&$top=1`,
    {
      method: 'GET',
      credentials: 'include',
      headers,
    },
  )

  if (!response.ok) throw new Error(await response.text())
  const body = await response.json().catch(() => ({}))
  const rows: Array<Record<string, unknown>> = Array.isArray(body?.value) ? body.value : []
  if (rows.length === 0) throw new Error(`No Services record found for Record ID ${cleanRecordId}.`)
  return mapServicesDetailRow(rows[0])
}
