import { getClient } from '@microsoft/power-apps/data'
import { dataSourcesInfo } from '../../.power/schemas/appschemas/dataSourcesInfo'
import { ensureAuthToken, getAuthToken } from './auth'
import { excludeArchived } from './archive'
import { formatServiceSiteLabel } from './serviceSiteLabels'
import { readDataverseRecordPages } from './dataverseRecordPages'

export const PROGRAM_ENROLLMENT_TABLE_ALIAS = 'cmps_programenrollment1s'
export const PROGRAM_ENROLLMENT_PRIMARY_ID_FIELD = 'cmps_programenrollment1id'
const DEFAULT_DATAVERSE_ORG_URL = 'https://org1f466e4e.crm.dynamics.com'
const runtimeDataClient = getClient(dataSourcesInfo as any)
const DISABILITY_FIELD_DISPLAY_NAME = 'Did this client receive any disability accommodations and/or disability assistance from program staff?'
const DISABILITY_FIELD_LOGICAL_NAME = 'cmps_didthisclientreceiveanydisabilityaccommo'
const DISABILITY_FIELD_CANDIDATES = [
  DISABILITY_FIELD_LOGICAL_NAME,
  'cmps_receiveddisabilityaccommodations',
  'cmps_didthisclientreceiveanydisabilityaccommodationsandordisabilityassistancefromprogramstaff',
] as const
let resolvedDisabilityFieldLogicalName: string | null | undefined

export type ProgramEnrollmentFieldInput =
  | 'text'
  | 'textarea'
  | 'date'
  | 'datetime'
  | 'radio'
  | 'select'
  | 'checkbox-group'
  | 'phone'
  | 'email'
  | 'readonly'

export type ProgramEnrollmentFieldDefinition = {
  field: string
  label: string
  input: ProgramEnrollmentFieldInput
  options: string[]
  section: ProgramEnrollmentFieldSection
  required?: boolean
  visibleWhen: Array<{
    field: string
    values: string[]
  }>
}

export type ProgramEnrollmentFieldSection = 'Enrollment Details' | 'Incident Information' | 'Program Notes' | 'Discharge Summary' | 'Household Demographics'

export type ProgramEnrollmentPayload = Record<string, string>

export function isOvwLateLifeEnrollmentFunder(value: unknown, funders: ReadonlyArray<{ id: string; name: string }>): boolean {
  const raw = String(value || '').trim()
  const lookupId = raw.replace(/[{}]/g, '').toLowerCase()
  const name = funders.find((funder) => funder.id.replace(/[{}]/g, '').toLowerCase() === lookupId)?.name || raw
  return name.toLowerCase().replace(/[^a-z0-9]/g, '') === 'ovwlatelife'
}

export type ProgramEnrollmentListRecord = {
  id: string
  clientRowId?: string
  recordId: string
  program: string
  funder: string
  enrollmentStatus: string
  serviceStartDate: string
  serviceEndDate: string
  victimizationTypes?: string
  specialClassifications?: string
  staffAssigned?: string
  modifiedOn?: string
  createdOn?: string
}

export type ProgramEnrollmentDetailRecord = {
  id: string
  recordId: string
  values: ProgramEnrollmentPayload
}

const PROGRAM_ENROLLMENT_FIELD_VISIBILITY: Record<string, Array<{
  field: string
  values: string[]
}>> = {
  cmps_reasonturnedaway: [
    {
      field: 'cmps_enrollmentstatus',
      values: ['Turnaway'],
    },
  ],
  cmps_numberofpets: [
    {
      field: 'cmps_isthisclientbringinganypetstoshelter1',
      values: ['Yes'],
    },
  ],
}

export const PROGRAM_ENROLLMENT_DISCHARGE_STATUS_OPTIONS = ['Positive', 'Negative', 'Unknown']

export const PROGRAM_ENROLLMENT_EXIT_DESTINATION_OPTIONS = [
  '--Please Select--',
  'Place not meant for habitation (e.g., a vehicle, an abandonded building, bus/train/subway-station/airport or anywhere outside)',
  'Emergency shelter, including hotel or motel paid for with emergency shelter voucher, or Host Home shelter',
  'Hospital or other residential non-psychiatric medical facility',
  'Jail, prison, or juvenile detention facility',
  'Long-term care facility or nursing home',
  'Psychiatric hospital or other psychiatric facility',
  'Substance abuse treatment facility or detox center',
  'Residential project or halfway house',
  'Hotel/motel without emergency shelter voucher',
  'Transitional housing for homeless persons (including homeless youth shelters)',
  'Staying or living with family',
  'Staying or living with friends',
  'Permanent housing (other than RRH)',
  'Rental by client without RRH/equivalent subsidy',
  'Rental by client with RRH/equivalent subsidy',
  'Back to abuser',
  'Deceased',
  'Unknown',
  'N/A',
]

export const PROGRAM_ENROLLMENT_FIELDS: ProgramEnrollmentFieldDefinition[] = [
  { field: 'cmps_recordid', label: 'RecordID', input: 'readonly', options: [], section: 'Enrollment Details', visibleWhen: [] },
  { field: 'cmps_clientid', label: 'Client ID', input: 'readonly', options: [], section: 'Enrollment Details', visibleWhen: [] },
  { field: 'cmps_servicestartdate', label: 'Service Start Date', input: 'date', options: [], section: 'Enrollment Details', required: true, visibleWhen: [] },
  { field: 'cmps_serviceenddate', label: 'Service End Date', input: 'date', options: [], section: 'Enrollment Details', visibleWhen: [] },
  { field: 'cmps_programtype', label: 'Program Type', input: 'radio', options: ['Non-Residential', 'Residential'], section: 'Enrollment Details', required: true, visibleWhen: [] },
  { field: 'cmps_projecttype', label: 'Project Type', input: 'select', options: ['Emergency Shelter', 'Transitional Housing', 'Services Only', 'Other'], section: 'Enrollment Details', required: true, visibleWhen: [] },
  { field: 'cmps_program', label: 'Program', input: 'select', options: ['Autumn House', 'DV Outreach', 'CAAFA Shelter', 'DVSTOP', 'Faith House', 'REACH Center'], section: 'Enrollment Details', required: true, visibleWhen: [] },
  { field: 'cmps_clienttype', label: 'Client Type', input: 'select', options: ['--Please Select--', 'Adult', 'Child'], section: 'Enrollment Details', required: true, visibleWhen: [] },
  { field: 'cmps_enrollmentstatus', label: 'Enrollment Status', input: 'select', options: ['--Please Select--', 'Enrolled', 'Waiting List', 'Re-Enrolled', 'Turnaway'], section: 'Enrollment Details', required: true, visibleWhen: [] },
  { field: 'cmps_clientlocation', label: 'Client Current Location', input: 'text', options: [], section: 'Enrollment Details', visibleWhen: [] },
  { field: 'cmps_funder', label: 'Funder', input: 'select', options: [], section: 'Enrollment Details', required: true, visibleWhen: [] },
  { field: 'cmps_servicesite', label: 'Service Site', input: 'select', options: ['--Please Select--', 'Autumn House', 'CAAFA', 'CAAFA - Crisis Response', 'CAAFA - Legal', 'CAAFA - DV', 'CAAFA - SV', 'CAAFA - Thrive', 'DVSTOP', 'Faith House', 'REACH Center'], section: 'Enrollment Details', required: true, visibleWhen: [] },
  { field: 'cmps_staffassigned', label: 'Staff Assigned', input: 'select', options: [], section: 'Enrollment Details', visibleWhen: [] },
  { field: 'cmps_reasonturnedaway', label: 'Reason Turned Away', input: 'select', options: ['--Please Select--', 'Lack of Capacity (Adults Only)', 'Lack of Capacity (Children/Youth Only)', 'Family Size', 'Substance Abuse/Intoxication', 'Unsafe Location', 'No Funding for Motel Vouchers', 'Mental Health Concerns', 'No Domestic Violence Concerns', 'Domestic Violence Not Imminent', 'Disability', 'Pets', 'Language Barrier', 'Lack of Transportation', 'Other Reasons', 'No Show'], section: 'Enrollment Details', visibleWhen: PROGRAM_ENROLLMENT_FIELD_VISIBILITY.cmps_reasonturnedaway || [] },
  { field: 'cmps_abusestatus', label: 'Abuse Status', input: 'radio', options: ['Primary Victim', 'Secondary Victim', 'Other'], section: 'Enrollment Details', required: true, visibleWhen: [] },
  { field: 'cmps_isthisclientbringinganypetstoshelter1', label: 'Is this client bringing any pets to shelter?', input: 'radio', options: ['Yes', 'No'], section: 'Enrollment Details', visibleWhen: [] },
  { field: 'cmps_numberofpets', label: 'Number of pets', input: 'text', options: [], section: 'Enrollment Details', visibleWhen: PROGRAM_ENROLLMENT_FIELD_VISIBILITY.cmps_numberofpets || [] },
  { field: 'cmps_victimtype1', label: 'Victim Type', input: 'checkbox-group', options: ['Domestic Violence', 'Sexual Assault', 'Labor Trafficked', 'Sex Trafficked', 'Homeless', 'Adult Survivor of Child SA', 'Child SA', 'Sexual Harassment', 'Elder Abuse/Neglect/Exploitation'], section: 'Enrollment Details', required: true, visibleWhen: [] },
  { field: 'cmps_clientspecialclassification1', label: 'Client Special Classification', input: 'checkbox-group', options: ['Deaf/Hard of Hearing', 'Homeless', 'LGBTQ', 'Veterans', 'Victims with Disabilities: Cognitive/Physical/Mental', 'Victims with Limited English Proficiency', 'Immigrants/Refugees/Asylum Seekers', 'None of the Above'], section: 'Enrollment Details', required: true, visibleWhen: [] },
  { field: 'cmps_ovwclientservedstatus', label: 'OVW Client Served Status', input: 'radio', options: ['Client Fully Served', 'Client Partially Served'], section: 'Enrollment Details', visibleWhen: [] },
  { field: 'cmps_didthisclientreceiveanydisabilityaccommo1', label: 'Did this client receive any disability accommodations and/or disability assistance from program staff?', input: 'radio', options: ['Yes', 'No'], section: 'Enrollment Details', visibleWhen: [] },
  { field: 'cmps_tanfeligible', label: 'TANF Eligible?', input: 'radio', options: ['Yes', 'No', 'N/A'], section: 'Enrollment Details', required: true, visibleWhen: [] },
  { field: 'cmps_isthesurroundingareaofthisshelterasafelo1', label: 'Is the surrounding area of this shelter a safe location for you?', input: 'radio', options: ['Yes', 'No'], section: 'Enrollment Details', visibleWhen: [] },
  { field: 'cmps_howdidsvclienthearaboutusreferredby', label: 'How did SV Client hear about us? (referred by)', input: 'select', options: ['--Please Select--', 'Court Advocate', 'Family/Friend', 'Media', 'Medical', 'Medical Advocacy', 'Mental Health', 'Minister/Clergy', 'Other Shelter', 'Agency Website', 'Police Department', 'Previous Client', 'Prosecutor/Attorney', 'Self-Referral', 'Social Services', 'Fire Department', 'Family Advocacy Center', 'Social Media', 'RAINN', 'Outreach'], section: 'Enrollment Details', visibleWhen: [] },
  { field: 'cmps_intakenotes', label: 'Notes', input: 'textarea', options: [], section: 'Program Notes', visibleWhen: [] },
  { field: 'cmps_lengthofstay', label: 'Length of Stay', input: 'readonly', options: [], section: 'Discharge Summary', visibleWhen: [] },
  { field: 'cmps_dischargestatus', label: 'Discharge Status', input: 'radio', options: PROGRAM_ENROLLMENT_DISCHARGE_STATUS_OPTIONS, section: 'Discharge Summary', required: true, visibleWhen: [] },
  { field: 'cmps_dischargenotes', label: 'Discharge Notes', input: 'textarea', options: [], section: 'Discharge Summary', visibleWhen: [] },
  { field: 'cmps_exitdestination', label: 'Exit Destination', input: 'select', options: PROGRAM_ENROLLMENT_EXIT_DESTINATION_OPTIONS, section: 'Discharge Summary', required: true, visibleWhen: [] },
  { field: 'cmps_isthisasafepermanentortransitionalhousin1', label: 'Is this a safe permanent or transitional housing destination?', input: 'radio', options: ['Yes', 'No'], section: 'Discharge Summary', required: true, visibleWhen: [] },
  { field: 'cmps_staffnameandsignature', label: 'Staff Name and Signature', input: 'text', options: [], section: 'Discharge Summary', visibleWhen: [] },
  { field: 'cmps_victimcompensation1', label: 'Victim Compensation', input: 'checkbox-group', options: ['Provided Information on Compensation', 'Victim Qualified for Compensation', 'Victim Not Qualified for Compensation', 'N/A'], section: 'Incident Information', required: true, visibleWhen: [] },
  { field: 'cmps_relationshiptoabuser', label: 'Relationship to Abuser', input: 'checkbox-group', options: ['Current or Former Spouse or Intimate Partner', 'Parent/Grandparent', 'Other Family or Household Member', 'Acquaintance', 'Current or Former Dating Relationship', 'Patient/Client Care Receiver', 'Stranger', 'Relationship Unknown', 'Other'], section: 'Incident Information', required: true, visibleWhen: [] },
  { field: 'cmps_householdreportedincomelevel', label: 'Household Reported Income Level', input: 'radio', options: ['At or Below 100% of FPL', 'Between 100% and 150% of FPL', 'Between 150% and 200% of FPL', 'Between 200% and 250% of FPL', 'Above 250% of FPL', 'Unknown/Not Reported'], section: 'Household Demographics', required: true, visibleWhen: [] },
]

const PROGRAM_ENROLLMENT_FIELD_NAMES = Array.from(new Set(PROGRAM_ENROLLMENT_FIELDS.map((field) => field.field)))
const PROGRAM_ENROLLMENT_SELECT_COLUMNS = [
  PROGRAM_ENROLLMENT_PRIMARY_ID_FIELD,
  ...PROGRAM_ENROLLMENT_FIELD_NAMES.filter((field) => field !== 'cmps_clientid' && field !== 'cmps_funder'),
  '_cmps_clientid_value',
  '_cmps_funder1_value',
].join(',')
const OPTION_SET_BASE_VALUE = 125570000
const CHOICE_PLACEHOLDER_LABEL = '--Please Select--'
const PROGRAM_ENROLLMENT_HISTORICAL_PROGRAM_VALUE = 125570007
// Dataverse choice values are immutable. These Project Type choices retain
// their original option-set values even though the form now exposes only four.
const PROGRAM_ENROLLMENT_PROJECT_TYPE_VALUE_BY_LABEL: Record<string, number> = {
  'Emergency Shelter': 125570002,
  'Transitional Housing': 125570004,
  'Services Only': 125570011,
  Other: 125570012,
}

const PROGRAM_ENROLLMENT_PROJECT_TYPE_LABEL_BY_VALUE = new Map<number, string>(
  Object.entries(PROGRAM_ENROLLMENT_PROJECT_TYPE_VALUE_BY_LABEL).map(([label, value]) => [value, label]),
)

function canonicalProgramEnrollmentProgram(value: unknown): string {
  const text = String(value ?? '').trim()
  if (normalizeText(text) === normalizeText('CAAFA Outreach')) return 'DV Outreach'
  return text
}

function canonicalProgramEnrollmentExitDestination(value: unknown): string {
  const text = String(value ?? '').trim()
  // Accept existing Dataverse formatted labels while showing the new wording.
  // The options keep their original positions/choice values.
  const aliases: Record<string, string> = {
    'Place not meant for habitation (vehicle, abandoned building, station, airport, or anywhere outside)': 'Place not meant for habitation (e.g., a vehicle, an abandonded building, bus/train/subway-station/airport or anywhere outside)',
    'Place not meant for habitation (e.g., a vehicle, an abandoned building, bus/train/subway-station/airport or anywhere outside)': 'Place not meant for habitation (e.g., a vehicle, an abandonded building, bus/train/subway-station/airport or anywhere outside)',
    'Hotel or motel paid for without emergency shelter voucher': 'Hotel/motel without emergency shelter voucher',
    'Rental by client without RRH or equivalent subsidy': 'Rental by client without RRH/equivalent subsidy',
    'Rental by client with RRH or equivalent subsidy': 'Rental by client with RRH/equivalent subsidy',
  }
  return Object.entries(aliases).find(([label]) => normalizeText(label) === normalizeText(text))?.[1] || text
}

function encodeProgramEnrollmentProgram(value: string, options: string[]): string {
  const text = canonicalProgramEnrollmentProgram(value)
  if (normalizeText(text) === normalizeText('DVHEART')) return String(PROGRAM_ENROLLMENT_HISTORICAL_PROGRAM_VALUE)
  return encodeOptionLiteral(text, options)
}

function decodeProgramEnrollmentProgram(rawValue: unknown, formattedValue?: unknown, options: string[] = []): string {
  const formatted = canonicalProgramEnrollmentProgram(formattedValue)
  if (formatted) return formatted

  const raw = String(rawValue ?? '').trim()
  if (raw && isNumericLiteral(raw) && Number.parseInt(raw, 10) === PROGRAM_ENROLLMENT_HISTORICAL_PROGRAM_VALUE) {
    return 'DVHEART'
  }
  return canonicalProgramEnrollmentProgram(decodeOptionLiteral(raw, options))
}

function encodeProgramEnrollmentProjectType(value: string, options: string[]): string {
  const text = String(value || '').trim()
  const mappedValue = PROGRAM_ENROLLMENT_PROJECT_TYPE_VALUE_BY_LABEL[text]
  return mappedValue === undefined ? encodeOptionLiteral(text, options) : String(mappedValue)
}

function decodeProgramEnrollmentProjectType(rawValue: unknown, formattedValue?: unknown, options: string[] = []): string {
  const formatted = String(formattedValue || '').trim()
  if (formatted) return formatted

  const raw = String(rawValue ?? '').trim()
  if (isNumericLiteral(raw)) {
    const mappedLabel = PROGRAM_ENROLLMENT_PROJECT_TYPE_LABEL_BY_VALUE.get(Number.parseInt(raw, 10))
    if (mappedLabel) return mappedLabel
  }
  return decodeOptionLiteral(raw, options)
}
const DATAVERSE_MIN_YEAR = 1753
const PROGRAM_ENROLLMENT_FIELD_DEF_BY_NAME = new Map<string, ProgramEnrollmentFieldDefinition>(
  PROGRAM_ENROLLMENT_FIELDS
    .filter((field, index, all) => all.findIndex((entry) => entry.field === field.field) === index)
    .map((field) => [field.field, field]),
)

const CLIENT_PROFILE_ENTITY_SET_NAME = 'cmps_clientprofiles'
const CLIENT_PROFILE_PRIMARY_ID_FIELD = 'cmps_clientprofileid'

function sanitizeOrgUrl(value: unknown): string {
  const raw = String(value || '').trim().replace(/\/$/, '')
  const lowered = raw.toLowerCase()
  if (!raw || lowered === 'null' || lowered === 'undefined') return ''
  return raw
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

function normalizeGuid(value: unknown): string {
  return String(value || '').trim().replace(/[{}]/g, '').toLowerCase()
}

function isLikelyDataverseGuid(value: string): boolean {
  // Dataverse IDs are GUID-shaped but are not always strict RFC4122 versioned GUIDs.
  return /^[0-9a-fA-F]{8}-[0-9a-fA-F]{4}-[0-9a-fA-F]{4}-[0-9a-fA-F]{4}-[0-9a-fA-F]{12}$/.test(String(value || '').trim())
}

function rowMatchesClientLookup(row: Record<string, unknown>, clientRowId: string): boolean {
  const target = normalizeGuid(clientRowId)
  if (!target) return false

  const candidates = [
    row?._cmps_clientid_value,
    row?.cmps_clientid,
    row?.['_cmps_clientid_value@OData.Community.Display.V1.FormattedValue'],
  ]

  return candidates.some((entry) => normalizeGuid(entry) === target)
}

function normalizeText(value: string): string {
  return String(value || '').trim().toLowerCase()
}

function isNumericLiteral(value: string): boolean {
  return /^-?\d+$/.test(String(value || '').trim())
}

function isYesNoChoice(options: string[]): boolean {
  if (options.length !== 2) return false
  const normalized = options.map((entry) => normalizeText(entry)).sort()
  return normalized[0] === 'no' && normalized[1] === 'yes'
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
  if (isoDateMatch) {
    const year = Number.parseInt(isoDateMatch[1], 10)
    if (year < DATAVERSE_MIN_YEAR) return ''
    return `${isoDateMatch[1]}-${isoDateMatch[2]}-${isoDateMatch[3]}`
  }

  const slashDateMatch = text.match(/^(\d{1,2})\/(\d{1,2})\/(\d{4})(?:\s.*)?$/)
  if (slashDateMatch) {
    const month = Number.parseInt(slashDateMatch[1], 10)
    const day = Number.parseInt(slashDateMatch[2], 10)
    const year = Number.parseInt(slashDateMatch[3], 10)
    if (year < DATAVERSE_MIN_YEAR) return ''
    const parsed = new Date(Date.UTC(year, month - 1, day))
    if (Number.isNaN(parsed.getTime())) return ''
    if (parsed.getUTCFullYear() !== year || parsed.getUTCMonth() !== month - 1 || parsed.getUTCDate() !== day) return ''
    return toIsoDate(parsed)
  }

  const parsed = new Date(text)
  if (Number.isNaN(parsed.getTime())) return text
  if (parsed.getUTCFullYear() < DATAVERSE_MIN_YEAR) return ''
  return toIsoDate(parsed)
}


const DISCHARGE_SUMMARY_PROGRAMS = new Set(['dvstop', 'caafa shelter', 'faith house', 'autumn house'])
const UNKNOWN_DISCHARGE_PROGRAMS = new Set(['dv outreach', 'reach', 'reach center', 'reach sv', 'reach sv hub'])

export function getProgramEnrollmentDischargeRules(values: Record<string, string | undefined>): { showSummary: boolean; defaultUnknown: boolean } {
  const date = normalizeDateValueForDataverse(String(values.cmps_serviceenddate || ''))
  const match = date.match(/^(\d{4})-(\d{2})-(\d{2})$/)
  // Only a real, populated end date qualifies; legacy minimum-date sentinels do not.
  let hasEndDate = false
  if (match) {
    const year = Number(match[1]), month = Number(match[2]), day = Number(match[3])
    const parsed = new Date(Date.UTC(year, month - 1, day))
    hasEndDate = year >= DATAVERSE_MIN_YEAR && parsed.getUTCFullYear() === year
      && parsed.getUTCMonth() === month - 1 && parsed.getUTCDate() === day
  }
  const options = PROGRAM_ENROLLMENT_FIELD_DEF_BY_NAME.get('cmps_program')?.options || []
  const program = normalizeText(decodeProgramEnrollmentProgram(values.cmps_program, undefined, options))
  return {
    showSummary: hasEndDate && DISCHARGE_SUMMARY_PROGRAMS.has(program),
    defaultUnknown: hasEndDate && UNKNOWN_DISCHARGE_PROGRAMS.has(program),
  }
}

function buildProgramEnrollmentDateDebug(
  formValues: ProgramEnrollmentPayload,
  payload: ProgramEnrollmentPayload,
): string {
  const dateFieldDefs = PROGRAM_ENROLLMENT_FIELDS
    .filter((field) => field.input === 'date' || field.input === 'datetime')
    .filter((field, index, all) => all.findIndex((entry) => entry.field === field.field) === index)

  const lines: string[] = []
  lines.push('Date fields from form -> payload')

  for (const fieldDef of dateFieldDefs) {
    const formValue = String(formValues[fieldDef.field] || '').trim() || '(empty)'
    const payloadValue = String(payload[fieldDef.field] || '').trim() || '(omitted)'
    lines.push(`${fieldDef.field} [${fieldDef.label}] | form='${formValue}' | payload='${payloadValue}'`)
  }

  const suspiciousEntries = Object.entries(payload).filter(([field, value]) => {
    const text = String(value || '').trim()
    if (!text) return false
    if (field.toLowerCase().includes('date') || field.toLowerCase().includes('time')) return true
    if (text.includes('0001-01-01') || text.includes('01/01/0001') || text.includes('1/1/0001')) return true
    if (/^\d{4}-\d{2}-\d{2}/.test(text)) return true
    return false
  })

  lines.push('Outgoing payload date-like entries')
  if (suspiciousEntries.length === 0) {
    lines.push('(none)')
  } else {
    for (const [field, value] of suspiciousEntries) {
      lines.push(`${field}='${String(value || '').trim()}'`)
    }
  }

  return lines.join('\n')
}

function getDataverseChoiceOptions(options: string[]): string[] {
  return options.filter((entry) => String(entry || '').trim() !== CHOICE_PLACEHOLDER_LABEL)
}

function encodeOptionLiteral(value: string, options: string[]): string {
  const choiceOptions = getDataverseChoiceOptions(options)
  const text = String(value || '').trim()
  if (!text) return ''
  if (isNumericLiteral(text)) return text

  const yesNo = isYesNoChoice(choiceOptions)
  const normalizedText = normalizeText(text)
  const directIndex = choiceOptions.findIndex((entry) => normalizeText(entry) === normalizedText)

  if (yesNo) {
    if (normalizedText === 'yes') return String(OPTION_SET_BASE_VALUE)
    if (normalizedText === 'no') return String(OPTION_SET_BASE_VALUE + 1)
  }

  if (directIndex >= 0) return String(OPTION_SET_BASE_VALUE + directIndex)
  if (normalizedText.startsWith('other:')) {
    const otherIndex = choiceOptions.findIndex((entry) => normalizeText(entry) === 'other')
    if (otherIndex >= 0) return String(OPTION_SET_BASE_VALUE + otherIndex)
  }

  return text
}

function decodeOptionLiteral(value: string, options: string[]): string {
  const choiceOptions = getDataverseChoiceOptions(options)
  const text = String(value || '').trim()
  if (!text) return ''
  if (!isNumericLiteral(text)) return text

  const numeric = Number.parseInt(text, 10)
  const yesNo = isYesNoChoice(choiceOptions)
  if (yesNo) {
    if (numeric === OPTION_SET_BASE_VALUE) return 'Yes'
    if (numeric === OPTION_SET_BASE_VALUE + 1) return 'No'
  }

  const index = numeric - OPTION_SET_BASE_VALUE
  if (index >= 0 && index < choiceOptions.length) return choiceOptions[index]
  return text
}

function encodeChoiceFieldValue(input: ProgramEnrollmentFieldInput, options: string[], rawValue: string): string {
  const text = String(rawValue || '').trim()
  if (!text || options.length === 0) return text

  if (input === 'checkbox-group') {
    const pieces = text.split(/[;,]+/).map((entry) => entry.trim()).filter(Boolean)
    const encoded = pieces.map((entry) => encodeOptionLiteral(entry, options)).filter(Boolean)
    return Array.from(new Set(encoded)).join(',')
  }

  if (input === 'radio' || input === 'select') {
    return encodeOptionLiteral(text, options)
  }

  return text
}

function decodeChoiceFieldValue(input: ProgramEnrollmentFieldInput, options: string[], rawValue: unknown, formattedValue?: unknown): string {
  const formatted = String(formattedValue || '').trim()
  if (formatted) {
    if (input === 'checkbox-group') {
      return formatted.split(';').map((entry) => entry.trim()).filter(Boolean).join(', ')
    }
    return formatted
  }

  const text = String(rawValue ?? '').trim()
  if (!text || options.length === 0) return text

  if (input === 'checkbox-group') {
    const pieces = text.split(/[;,]+/).map((entry) => entry.trim()).filter(Boolean)
    return pieces.map((entry) => decodeOptionLiteral(entry, options)).join(', ')
  }

  if (input === 'radio' || input === 'select') {
    return decodeOptionLiteral(text, options)
  }

  return text
}

function normalizeProgramEnrollmentPayloadForDataverse(seed: ProgramEnrollmentPayload): ProgramEnrollmentPayload {
  const payload: ProgramEnrollmentPayload = { ...seed }
  if (getProgramEnrollmentDischargeRules(seed).defaultUnknown) payload.cmps_dischargestatus = 'Unknown'

  const clientLookupRowId = String(payload.cmps_clientid || '').trim()
  if (clientLookupRowId) {
    delete payload.cmps_clientid
    payload['cmps_clientid@odata.bind'] = `/${CLIENT_PROFILE_ENTITY_SET_NAME}(${clientLookupRowId})`
  }

  const funderLookupRowId = String(payload.cmps_funder || '').trim()
  delete payload.cmps_funder
  if (funderLookupRowId) {
    payload['cmps_funder1@odata.bind'] = `/cmps_funders(${funderLookupRowId.replace(/[{}]/g, '')})`
  }

  for (const fieldName of PROGRAM_ENROLLMENT_FIELD_NAMES) {
    const fieldDef = PROGRAM_ENROLLMENT_FIELD_DEF_BY_NAME.get(fieldName)
    if (!fieldDef) continue
    if (
      fieldDef.input !== 'radio'
      && fieldDef.input !== 'select'
      && fieldDef.input !== 'checkbox-group'
      && fieldDef.input !== 'date'
      && fieldDef.input !== 'datetime'
    ) continue

    const rawValue = fieldName === 'cmps_servicesite'
      ? formatServiceSiteLabel(payload[fieldName])
      : fieldName === 'cmps_exitdestination'
        ? canonicalProgramEnrollmentExitDestination(payload[fieldName])
        : String(payload[fieldName] || '').trim()
    if (!rawValue) continue
    if (fieldDef.input === 'date' || fieldDef.input === 'datetime') {
      const normalizedDate = normalizeDateValueForDataverse(rawValue)
      if (!normalizedDate) {
        delete payload[fieldName]
        continue
      }
      payload[fieldName] = normalizedDate
      continue
    }

    // Guard against DateTime minimum sentinel leaking through in non-date mapped fields.
    if (isEmptyDateValue(rawValue)) {
      delete payload[fieldName]
      continue
    }
    payload[fieldName] = fieldName === 'cmps_program'
      ? encodeProgramEnrollmentProgram(rawValue, fieldDef.options)
      : fieldName === 'cmps_projecttype'
        ? encodeProgramEnrollmentProjectType(rawValue, fieldDef.options)
        : encodeChoiceFieldValue(fieldDef.input, fieldDef.options, rawValue)
  }

  return payload
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

function mapProgramEnrollmentDetailRow(row: Record<string, unknown>): ProgramEnrollmentDetailRecord {
  const values: ProgramEnrollmentPayload = {}
  for (const field of PROGRAM_ENROLLMENT_FIELD_NAMES) {
    if (field === 'cmps_clientid') {
      const rawLookup = row?.['_cmps_clientid_value']
      values[field] = String(rawLookup || '').trim()
      continue
    }

    if (field === 'cmps_funder') {
      values[field] = String(row?.['_cmps_funder1_value'] || '').trim()
      continue
    }

    const raw = row?.[field]
    const fieldDef = PROGRAM_ENROLLMENT_FIELD_DEF_BY_NAME.get(field)
    if (!fieldDef) {
      values[field] = String(raw ?? '').trim()
      continue
    }

    // Date inputs require raw ISO dates, not localized display annotations.
    if (fieldDef.input === 'date') {
      values[field] = normalizeDateValueForDataverse(String(raw ?? ''))
      continue
    }

    const formatted = (row as Record<string, unknown>)[`${field}@OData.Community.Display.V1.FormattedValue`]
    values[field] = field === 'cmps_program'
      ? decodeProgramEnrollmentProgram(raw, formatted, fieldDef.options)
      : field === 'cmps_projecttype'
        ? decodeProgramEnrollmentProjectType(raw, formatted, fieldDef.options)
        : decodeChoiceFieldValue(fieldDef.input, fieldDef.options, raw, formatted)
    if (field === 'cmps_servicesite') values[field] = formatServiceSiteLabel(values[field])
    if (field === 'cmps_exitdestination') values[field] = canonicalProgramEnrollmentExitDestination(values[field])
  }

  const recordId = String(values.cmps_recordid || row?.cmps_recordid || '').trim()
  return {
    id: String(row?.[PROGRAM_ENROLLMENT_PRIMARY_ID_FIELD] || row?.id || '').trim(),
    recordId,
    values,
  }
}

function getOrgUrl(): string {
  const configured = sanitizeOrgUrl(import.meta.env.VITE_DATAVERSE_ORG_URL)
  return configured || DEFAULT_DATAVERSE_ORG_URL
}

function cleanPayload(values: ProgramEnrollmentPayload): ProgramEnrollmentPayload {
  return Object.entries(values).reduce<ProgramEnrollmentPayload>((acc, [field, value]) => {
    const text = String(value || '').trim()
    if (!text) return acc
    acc[field] = text
    return acc
  }, {})
}

function escapeODataString(value: string): string {
  return String(value || '').replace(/'/g, "''")
}

function normalizeLabel(value: unknown): string {
  return String(value || '')
    .trim()
    .toLowerCase()
    .replace(/[^a-z0-9]+/g, '')
}

function findLogicalNameByDisplayLabel(rows: Array<Record<string, unknown>>, displayLabel: string): string {
  const target = normalizeLabel(displayLabel)
  if (!target) return ''

  for (const row of rows) {
    const logicalName = String(row?.LogicalName || '').trim()
    if (!logicalName) continue

    const display = row?.DisplayName as Record<string, unknown> | undefined
    const labels = Array.isArray(display?.LocalizedLabels) ? display?.LocalizedLabels as Array<Record<string, unknown>> : []
    for (const labelRow of labels) {
      const label = normalizeLabel(labelRow?.Label)
      if (label && (label === target || label.includes(target) || target.includes(label))) {
        return logicalName
      }
    }
  }

  return ''
}

function findDisabilityLogicalNameByHeuristics(rows: Array<Record<string, unknown>>): string {
  for (const row of rows) {
    const logicalName = String(row?.LogicalName || '').trim().toLowerCase()
    if (!logicalName.startsWith('cmps_')) continue

    const hasDisability = logicalName.includes('disability')
    const hasAccommodation = logicalName.includes('accommod')
    const hasAssistance = logicalName.includes('assist')
    const hasReceive = logicalName.includes('receive') || logicalName.includes('received')

    if (hasDisability && hasAccommodation && (hasAssistance || hasReceive)) {
      return logicalName
    }
  }

  return ''
}

async function resolveDisabilityFieldLogicalName(): Promise<string> {
  if (resolvedDisabilityFieldLogicalName !== undefined) {
    return resolvedDisabilityFieldLogicalName || ''
  }

  const token = await ensureAuthToken().catch(() => '')
  const orgUrl = getOrgUrl()
  if (!token || !orgUrl) {
    resolvedDisabilityFieldLogicalName = ''
    return ''
  }

  const headers = new Headers()
  headers.set('Accept', 'application/json')
  headers.set('OData-Version', '4.0')
  headers.set('OData-MaxVersion', '4.0')
  headers.set('Authorization', `Bearer ${token}`)

  const entityLogicalNames = ['cmps_programenrollment1', 'cmps_programenrollment1s', 'cmps_programenrollment', 'cmps_programenrollments']

  for (const entityLogicalName of entityLogicalNames) {
    const response = await fetch(
      `${orgUrl}/api/data/v9.2/EntityDefinitions(LogicalName='${entityLogicalName}')/Attributes?$select=LogicalName&$expand=DisplayName($select=LocalizedLabels)&$top=5000`,
      {
        method: 'GET',
        credentials: 'include',
        headers,
      },
    ).catch(() => null)

    if (!response || !response.ok) continue
    const body = await response.json().catch(() => ({}))
    const rows: Array<Record<string, unknown>> = Array.isArray(body?.value) ? body.value : []
    const logicalName = findLogicalNameByDisplayLabel(rows, DISABILITY_FIELD_DISPLAY_NAME)
    if (logicalName) {
      resolvedDisabilityFieldLogicalName = logicalName
      return logicalName
    }

    const heuristicLogicalName = findDisabilityLogicalNameByHeuristics(rows)
    if (heuristicLogicalName) {
      resolvedDisabilityFieldLogicalName = heuristicLogicalName
      return heuristicLogicalName
    }
  }

  resolvedDisabilityFieldLogicalName = ''
  return ''
}

async function normalizeProgramEnrollmentPayload(values: ProgramEnrollmentPayload): Promise<ProgramEnrollmentPayload> {
  const payload = normalizeProgramEnrollmentPayloadForDataverse(values)

  const resolvedLogicalName = await resolveDisabilityFieldLogicalName()
  const targetLogicalName = resolvedLogicalName || DISABILITY_FIELD_LOGICAL_NAME

  let sourceKey = ''
  for (const key of DISABILITY_FIELD_CANDIDATES) {
    const text = String(payload[key] || '').trim()
    if (!text) continue
    sourceKey = key
    break
  }

  if (!sourceKey) return payload

  const value = payload[sourceKey]
  for (const key of DISABILITY_FIELD_CANDIDATES) {
    if (key in payload) delete payload[key]
  }

  if (targetLogicalName) {
    payload[targetLogicalName] = value
  }

  return payload
}

export function generateProgramEnrollmentRecordId(): string {
  const now = new Date()
  const datePart = now.toISOString().slice(0, 10).replace(/-/g, '')
  const timePart = now.toISOString().slice(11, 19).replace(/:/g, '')
  return `PE-${datePart}${timePart}`
}

async function createProgramEnrollmentRuntime(payload: ProgramEnrollmentPayload): Promise<string> {
  const orgUrl = getOrgUrl()
  const token = getAuthToken()

  const tryCreate = async (operationName: string, parameters: Record<string, unknown>) => {
    const result = await runtimeDataClient.executeAsync<any, any>({
      connectorOperation: {
        tableName: 'commondataserviceforapps',
        operationName,
        parameters,
      },
    } as any)

    if (!result?.success) {
      throw new Error(JSON.stringify(result || {}))
    }

    const data = result.data || {}
    return String(data?.[PROGRAM_ENROLLMENT_PRIMARY_ID_FIELD] || data?.id || '').trim()
  }

  if (!orgUrl) {
    return tryCreate('CreateRecord', { prefer: 'return=representation', accept: 'application/json', 
      entityName: PROGRAM_ENROLLMENT_TABLE_ALIAS,
      item: payload,
      ...(token ? { token } : {}),
    })
  }

  return tryCreate('CreateRecordWithOrganization', { prefer: 'return=representation', accept: 'application/json', 
    organization: orgUrl,
    entityName: PROGRAM_ENROLLMENT_TABLE_ALIAS,
    item: payload,
    ...(token ? { token } : {}),
  })
}

async function updateProgramEnrollmentRuntime(rowId: string, payload: ProgramEnrollmentPayload): Promise<void> {
  const cleanId = String(rowId || '').trim()
  if (!cleanId) throw new Error('Missing Program Enrollment row id for update.')

  const orgUrl = getOrgUrl()
  const token = getAuthToken()

  const tryUpdate = async (operationName: string, parameters: Record<string, unknown>) => {
    const result = await runtimeDataClient.executeAsync<any, any>({
      connectorOperation: {
        tableName: 'commondataserviceforapps',
        operationName,
        parameters,
      },
    } as any)

    if (!result?.success) {
      throw new Error(JSON.stringify(result || {}))
    }
  }

  if (!orgUrl) {
    await tryUpdate('UpdateRecord', { prefer: 'return=representation', accept: 'application/json',
      entityName: PROGRAM_ENROLLMENT_TABLE_ALIAS,
      recordId: cleanId,
      item: payload,
      ...(token ? { token } : {}),
    })
    return
  }

  await tryUpdate('UpdateRecordWithOrganization', { prefer: 'return=representation', accept: 'application/json',
    organization: orgUrl,
    entityName: PROGRAM_ENROLLMENT_TABLE_ALIAS,
    recordId: cleanId,
    item: payload,
    ...(token ? { token } : {}),
  })
}

async function listProgramEnrollmentsRuntime(cleanRecordId: string): Promise<any[]> {
  const clientId = cleanRecordId.trim().replace(/[{}]/g, '').toLowerCase()
  if (!isLikelyDataverseGuid(clientId)) return []
  const organization = getOrgUrl(), runtime = !isLocalHost()
  const token = runtime ? getAuthToken() : await ensureAuthToken()
  if (!runtime && !token) throw new Error('Dataverse authentication is required to load Program Enrollments.')
  const select = [PROGRAM_ENROLLMENT_PRIMARY_ID_FIELD, 'cmps_recordid', 'createdon', 'modifiedon', 'cmps_isarchived', '_cmps_clientid_value', 'cmps_program', 'cmps_enrollmentstatus', 'cmps_servicestartdate', 'cmps_serviceenddate', 'cmps_victimtype1', 'cmps_clientspecialclassification1', 'cmps_staffassigned', '_cmps_funder1_value'].join(',')
  const rows = await readDataverseRecordPages(organization, PROGRAM_ENROLLMENT_TABLE_ALIAS, {
    '$select': select, '$filter': excludeArchived(`_cmps_clientid_value eq ${clientId}`), '$orderby': `${PROGRAM_ENROLLMENT_PRIMARY_ID_FIELD} asc`,
  }, runtime, async (query, nextUrl) => {
    if (!runtime) {
      const url = new URL(nextUrl || `${organization}/api/data/v9.2/${PROGRAM_ENROLLMENT_TABLE_ALIAS}`)
      if (!nextUrl) for (const [key, value] of Object.entries(query)) if (key.startsWith('$')) url.searchParams.set(key, String(value))
      const response = await fetch(url.href, { credentials: 'include', headers: { Accept: 'application/json', Authorization: `Bearer ${token}`, 'OData-Version': '4.0', 'OData-MaxVersion': '4.0', Prefer: 'odata.maxpagesize=1000,odata.include-annotations="OData.Community.Display.V1.FormattedValue"' } })
      if (!response.ok) throw new Error(await response.text())
      return response.json()
    }
    const result = await runtimeDataClient.executeAsync<any, any>({ connectorOperation: {
      tableName: 'commondataserviceforapps', operationName: query.next ? 'GetNextPageWithOrganization' : 'ListRecordsWithOrganization',
      parameters: { organization, entityName: PROGRAM_ENROLLMENT_TABLE_ALIAS, accept: 'application/json', prefer: 'odata.maxpagesize=1000,odata.include-annotations="OData.Community.Display.V1.FormattedValue"', ...query, ...(token ? { token } : {}) },
    } } as any)
    if (!result?.success) throw new Error(parseConnectorErrorMessage(result?.error))
    return result.data
  })
  const records = new Map<string, Record<string, unknown>>()
  for (const row of rows) {
    if (!rowMatchesClientLookup(row, clientId) || Number(row.cmps_isarchived) === 125570000) continue
    const id = String(row[PROGRAM_ENROLLMENT_PRIMARY_ID_FIELD] || '').trim().toLowerCase()
    if (!isLikelyDataverseGuid(id)) throw new Error('Program Enrollment returned an invalid row ID.')
    records.set(id, row)
  }
  return [...records.values()]
}

async function loadProgramEnrollmentDetailLocal(rowId: string, recordIdHint = ''): Promise<ProgramEnrollmentDetailRecord> {
  const token = await ensureAuthToken()
  const orgUrl = getOrgUrl()
  if (!token || !orgUrl) throw new Error('Missing Dataverse connection info for Program Enrollment detail load.')

  const headers = new Headers()
  headers.set('Accept', 'application/json')
  headers.set('OData-Version', '4.0')
  headers.set('OData-MaxVersion', '4.0')
  headers.set('Authorization', `Bearer ${token}`)

  const cleanId = String(rowId || '').trim()
  if (cleanId) {
    const response = await fetch(
      `${orgUrl}/api/data/v9.2/${PROGRAM_ENROLLMENT_TABLE_ALIAS}(${cleanId})?$select=${encodeURIComponent(PROGRAM_ENROLLMENT_SELECT_COLUMNS)}`,
      {
        method: 'GET',
        credentials: 'include',
        headers,
      },
    )

    if (response.ok) {
      const row = await response.json()
      return mapProgramEnrollmentDetailRow(row)
    }
  }

  const recordId = String(recordIdHint || '').trim()
  if (!recordId) throw new Error('Missing Program Enrollment row id and record id for detail load.')

  const filter = `cmps_recordid eq '${escapeODataString(recordId)}'`
  const response = await fetch(
    `${orgUrl}/api/data/v9.2/${PROGRAM_ENROLLMENT_TABLE_ALIAS}?$select=${encodeURIComponent(PROGRAM_ENROLLMENT_SELECT_COLUMNS)}&$filter=${encodeURIComponent(filter)}&$top=1`,
    {
      method: 'GET',
      credentials: 'include',
      headers,
    },
  )

  if (!response.ok) throw new Error(await response.text())
  const payload = await response.json()
  const rows = rowsFromPayload(payload)
  if (rows.length === 0) throw new Error(`No Program Enrollment record found for Record ID ${recordId}.`)
  return mapProgramEnrollmentDetailRow(rows[0])
}

async function loadProgramEnrollmentDetailRuntime(rowId: string, recordIdHint = ''): Promise<ProgramEnrollmentDetailRecord> {
  const orgUrl = getOrgUrl()
  const token = getAuthToken()
  const id = normalizeGuid(rowId)
  const recordId = String(recordIdHint || '').trim()
  if (!orgUrl) throw new Error('Dataverse organization URL is missing for Program Enrollment detail load.')
  if (id && !isLikelyDataverseGuid(id)) throw new Error('A Program Enrollment Dataverse row ID is required, not its legacy ID.')
  if (!id && !recordId) throw new Error('No Program Enrollment record ID provided for detail load.')
  const filter = id ? `${PROGRAM_ENROLLMENT_PRIMARY_ID_FIELD} eq ${id}` : `cmps_recordid eq '${escapeODataString(recordId)}'`
  const result = await runtimeDataClient.executeAsync<any, any>({ connectorOperation: {
    tableName: 'commondataserviceforapps', operationName: 'ListRecordsWithOrganization',
    parameters: { organization: orgUrl, entityName: PROGRAM_ENROLLMENT_TABLE_ALIAS, '$select': PROGRAM_ENROLLMENT_SELECT_COLUMNS, '$filter': excludeArchived(filter), '$top': 2, prefer: 'odata.include-annotations="OData.Community.Display.V1.FormattedValue"', ...(token ? { token } : {}) },
  } } as any)
  if (!result?.success) throw new Error(parseConnectorErrorMessage(result?.error || result))
  const rows = rowsFromPayload(result.data)
  if (rows.length !== 1 || (id && normalizeGuid(rows[0]?.[PROGRAM_ENROLLMENT_PRIMARY_ID_FIELD]) !== id)) throw new Error('The Program Enrollment record could not be uniquely identified.')
  return mapProgramEnrollmentDetailRow(rows[0])
}

async function resolveClientProfileRecordIdFromLookup(clientLookupValue: string): Promise<string> {
  const guid = String(clientLookupValue || '').trim().replace(/[{}]/g, '')
  if (!isLikelyDataverseGuid(guid)) return ''

  const orgUrl = getOrgUrl()
  const token = getAuthToken()

  if (!isLocalHost()) {
    try {
      const runtimeResult = await runtimeDataClient.executeAsync<any, any>({
        connectorOperation: {
          tableName: 'commondataserviceforapps',
          operationName: orgUrl ? 'GetRecordWithOrganization' : 'GetRecord',
          parameters: {
            ...(orgUrl ? { organization: orgUrl } : {}),
            entityName: CLIENT_PROFILE_ENTITY_SET_NAME,
            recordId: guid,
            '$select': 'cmps_recordid',
            ...(token ? { token } : {}),
          },
        },
      } as any)

      if (runtimeResult?.success) {
        const value = String(runtimeResult?.data?.cmps_recordid || '').trim()
        if (value) return value
      }
    } catch {
      // continue to runtime filter fallbacks
    }

    const filters = [
      `${CLIENT_PROFILE_PRIMARY_ID_FIELD} eq ${guid}`,
      `${CLIENT_PROFILE_PRIMARY_ID_FIELD} eq '${guid}'`,
    ]

    for (const filter of filters) {
      try {
        const runtimeListResult = await runtimeDataClient.executeAsync<any, any>({
          connectorOperation: {
            tableName: 'commondataserviceforapps',
            operationName: orgUrl ? 'ListRecordsWithOrganization' : 'ListRecords',
            parameters: {
              ...(orgUrl ? { organization: orgUrl } : {}),
              entityName: CLIENT_PROFILE_ENTITY_SET_NAME,
              '$select': 'cmps_recordid',
              '$filter': filter,
              '$top': 1,
              ...(token ? { token } : {}),
            },
          },
        } as any)

        if (runtimeListResult?.success) {
          const rows = rowsFromPayload(runtimeListResult.data)
          const value = String(rows?.[0]?.cmps_recordid || '').trim()
          if (value) return value
        }
      } catch {
        // continue to next filter
      }
    }
  }

  const ensuredToken = token || await ensureAuthToken().catch(() => '')
  if (!orgUrl || !ensuredToken) return ''

  const headers = new Headers()
  headers.set('Accept', 'application/json')
  headers.set('OData-Version', '4.0')
  headers.set('OData-MaxVersion', '4.0')
  headers.set('Authorization', `Bearer ${ensuredToken}`)

  const response = await fetch(
    `${orgUrl}/api/data/v9.2/${CLIENT_PROFILE_ENTITY_SET_NAME}(${guid})?$select=cmps_recordid`,
    {
      method: 'GET',
      credentials: 'include',
      headers,
    },
  ).catch(() => null)

  if (response?.ok) {
    const body = await response.json().catch(() => ({}))
    const value = String(body?.cmps_recordid || '').trim()
    if (value) return value
  }

  const filters = [
    `${CLIENT_PROFILE_PRIMARY_ID_FIELD} eq ${guid}`,
    `${CLIENT_PROFILE_PRIMARY_ID_FIELD} eq '${guid}'`,
  ]

  for (const filter of filters) {
    const byFilterResponse = await fetch(
      `${orgUrl}/api/data/v9.2/${CLIENT_PROFILE_ENTITY_SET_NAME}?$select=cmps_recordid&$filter=${encodeURIComponent(filter)}&$top=1`,
      {
        method: 'GET',
        credentials: 'include',
        headers,
      },
    ).catch(() => null)

    if (!byFilterResponse?.ok) continue
    const body = await byFilterResponse.json().catch(() => ({}))
    const rows: Array<Record<string, unknown>> = Array.isArray(body?.value) ? body.value : []
    const value = String(rows?.[0]?.cmps_recordid || '').trim()
    if (value) return value
  }

  return ''
}

async function hydrateProgramEnrollmentClientDisplay(detail: ProgramEnrollmentDetailRecord): Promise<ProgramEnrollmentDetailRecord> {
  const currentClientValue = String(detail.values.cmps_clientid || '').trim()
  if (!currentClientValue) return detail
  if (!isLikelyDataverseGuid(currentClientValue.replace(/[{}]/g, ''))) return detail

  const clientRecordId = await resolveClientProfileRecordIdFromLookup(currentClientValue)
  if (!clientRecordId) return detail

  return {
    ...detail,
    values: {
      ...detail.values,
      cmps_clientid: clientRecordId,
    },
  }
}

export async function createProgramEnrollmentResponse(values: ProgramEnrollmentPayload): Promise<{ id: string; recordId: string }> {
  const recordId = String(values.cmps_recordid || '').trim() || generateProgramEnrollmentRecordId()
  const formValues = cleanPayload({
    ...values,
    cmps_recordid: recordId,
  })
  const payload = await normalizeProgramEnrollmentPayload(formValues)
  const dateDebug = buildProgramEnrollmentDateDebug(formValues, payload)

  try {
    if (!isLocalHost()) {
      const id = await createProgramEnrollmentRuntime(payload)
      return {
        id,
        recordId,
      }
    }

    const token = await ensureAuthToken()
    const orgUrl = getOrgUrl()
    if (!token || !orgUrl) throw new Error('Missing Dataverse connection info for Program Enrollment create.')

    const headers = new Headers()
    headers.set('Accept', 'application/json')
    headers.set('Content-Type', 'application/json')
    headers.set('OData-Version', '4.0')
    headers.set('OData-MaxVersion', '4.0')
    headers.set('Authorization', `Bearer ${token}`)
    headers.set('Prefer', 'return=representation')

    const response = await fetch(`${orgUrl}/api/data/v9.2/${PROGRAM_ENROLLMENT_TABLE_ALIAS}`, {
      method: 'POST',
      credentials: 'include',
      headers,
      body: JSON.stringify(payload),
    })

    if (!response.ok) {
      throw new Error(await response.text())
    }

    const body = await response.json().catch(() => ({}))
    const id = String(body?.[PROGRAM_ENROLLMENT_PRIMARY_ID_FIELD] || body?.id || '').trim()
    return {
      id,
      recordId,
    }
  } catch (error) {
    const reason = String((error as Error)?.message || error || 'Program Enrollment create failed.')
    throw new Error(`${reason}\n\nProgram Enrollment Date Debug\n${dateDebug}`)
  }
}

export async function updateProgramEnrollmentResponse(rowId: string, values: ProgramEnrollmentPayload): Promise<void> {
  const cleanId = String(rowId || '').trim()
  if (!cleanId) throw new Error('Missing Program Enrollment row id for update.')

  const formValues = cleanPayload(values)
  const payload = await normalizeProgramEnrollmentPayload(formValues)
  // PATCH must explicitly clear dates; omitting a blank date preserves its old value.
  for (const field of PROGRAM_ENROLLMENT_FIELDS) {
    const value = (values as Record<string, unknown>)[field.field]
    if (['date', 'datetime'].includes(field.input) && Object.prototype.hasOwnProperty.call(values, field.field)
      && (value === null || (typeof value === 'string' && !value.trim()))) (payload as Record<string, unknown>)[field.field] = null
  }
  const dateDebug = buildProgramEnrollmentDateDebug(formValues, payload)

  try {
    if (!isLocalHost()) {
      await updateProgramEnrollmentRuntime(cleanId, payload)
      return
    }

    const token = await ensureAuthToken()
    const orgUrl = getOrgUrl()
    if (!token || !orgUrl) throw new Error('Missing Dataverse connection info for Program Enrollment update.')

    const headers = new Headers()
    headers.set('Accept', 'application/json')
    headers.set('Content-Type', 'application/json')
    headers.set('OData-Version', '4.0')
    headers.set('OData-MaxVersion', '4.0')
    headers.set('Authorization', `Bearer ${token}`)

    const response = await fetch(`${orgUrl}/api/data/v9.2/${PROGRAM_ENROLLMENT_TABLE_ALIAS}(${cleanId})`, {
      method: 'PATCH',
      credentials: 'include',
      headers,
      body: JSON.stringify(payload),
    })

    if (!response.ok) {
      throw new Error(await response.text())
    }
  } catch (error) {
    const reason = String((error as Error)?.message || error || 'Program Enrollment update failed.')
    throw new Error(`${reason}\n\nProgram Enrollment Date Debug\n${dateDebug}`)
  }
}

export async function listProgramEnrollmentsForClientRecord(clientRecordId: string): Promise<ProgramEnrollmentListRecord[]> {
  const rows = await listProgramEnrollmentsRuntime(String(clientRecordId || '').trim())
  return rows.map((row) => ({
    id: String(row?.[PROGRAM_ENROLLMENT_PRIMARY_ID_FIELD] || row?.id || '').trim(),
    clientRowId: String(row?._cmps_clientid_value || row?.cmps_clientid || '').trim(),
    recordId: String(row?.cmps_recordid || '').trim(),
    program: decodeProgramEnrollmentProgram(row?.cmps_program, row?.['cmps_program@OData.Community.Display.V1.FormattedValue'], PROGRAM_ENROLLMENT_FIELD_DEF_BY_NAME.get('cmps_program')?.options || []),
    enrollmentStatus: decodeChoiceFieldValue('select', PROGRAM_ENROLLMENT_FIELD_DEF_BY_NAME.get('cmps_enrollmentstatus')?.options || [], row?.cmps_enrollmentstatus, row?.['cmps_enrollmentstatus@OData.Community.Display.V1.FormattedValue']),
    serviceStartDate: String(row?.cmps_servicestartdate || '').trim(),
    serviceEndDate: String(row?.cmps_serviceenddate || '').trim(),
    victimizationTypes: decodeChoiceFieldValue('checkbox-group', PROGRAM_ENROLLMENT_FIELD_DEF_BY_NAME.get('cmps_victimtype1')?.options || [], row?.cmps_victimtype1, row?.['cmps_victimtype1@OData.Community.Display.V1.FormattedValue']),
    specialClassifications: decodeChoiceFieldValue('checkbox-group', PROGRAM_ENROLLMENT_FIELD_DEF_BY_NAME.get('cmps_clientspecialclassification1')?.options || [], row?.cmps_clientspecialclassification1, row?.['cmps_clientspecialclassification1@OData.Community.Display.V1.FormattedValue']),
    funder: String(row?.['_cmps_funder1_value@OData.Community.Display.V1.FormattedValue'] || row?._cmps_funder1_value || '').trim(),
    staffAssigned: String(row?.cmps_staffassigned || '').trim(),
    createdOn: String(row?.createdon || '').trim(),
    modifiedOn: String(row?.modifiedon || '').trim(),
  }))
}

export async function listActiveProgramEnrollments(scope?: { staffIdentities?: string[]; programs?: string[] }): Promise<ProgramEnrollmentListRecord[]> {
  const select = [
    PROGRAM_ENROLLMENT_PRIMARY_ID_FIELD,
    'cmps_recordid',
    'createdon',
    'modifiedon',
    '_cmps_clientid_value',
    'cmps_program',
    'cmps_enrollmentstatus',
    'cmps_servicestartdate',
    'cmps_serviceenddate',
    'cmps_victimtype1',
    'cmps_clientspecialclassification1',
    'cmps_staffassigned',
    '_cmps_funder1_value',
  ].join(',')

  const programOptions = PROGRAM_ENROLLMENT_FIELD_DEF_BY_NAME.get('cmps_program')?.options || []
  const staff = [...new Set((scope?.staffIdentities || []).map((value) => String(value).trim()).filter(Boolean))]
  const programs = [...new Set((scope?.programs || []).map((value) => encodeProgramEnrollmentProgram(value, programOptions)).filter(isNumericLiteral))]
  if (scope?.staffIdentities && !staff.length || scope?.programs && !programs.length) return []
  const filter = excludeArchived([
    'cmps_serviceenddate eq null',
    staff.length ? `(${staff.map((value) => `cmps_staffassigned eq '${escapeODataString(value)}'`).join(' or ')})` : '',
    programs.length ? `(${programs.map((value) => `cmps_program eq ${value}`).join(' or ')})` : '',
  ].filter(Boolean).join(' and '))
  const query = { '$select': select, '$filter': filter, '$orderby': `${PROGRAM_ENROLLMENT_PRIMARY_ID_FIELD} asc` }
  const mapRows = (rows: Array<Record<string, unknown>>): ProgramEnrollmentListRecord[] => rows
    .filter((row) => !String(row?.cmps_serviceenddate || '').trim())
    .map((row) => ({
      id: String(row?.[PROGRAM_ENROLLMENT_PRIMARY_ID_FIELD] || row?.id || '').trim(),
      clientRowId: String(row?._cmps_clientid_value || row?.cmps_clientid || '').trim(),
      recordId: String(row?.cmps_recordid || '').trim(),
      program: decodeProgramEnrollmentProgram(row?.cmps_program, row?.['cmps_program@OData.Community.Display.V1.FormattedValue'], PROGRAM_ENROLLMENT_FIELD_DEF_BY_NAME.get('cmps_program')?.options || []),
      enrollmentStatus: decodeChoiceFieldValue('select', PROGRAM_ENROLLMENT_FIELD_DEF_BY_NAME.get('cmps_enrollmentstatus')?.options || [], row?.cmps_enrollmentstatus, row?.['cmps_enrollmentstatus@OData.Community.Display.V1.FormattedValue']),
      serviceStartDate: String(row?.cmps_servicestartdate || '').trim(),
      serviceEndDate: String(row?.cmps_serviceenddate || '').trim(),
      victimizationTypes: decodeChoiceFieldValue('checkbox-group', PROGRAM_ENROLLMENT_FIELD_DEF_BY_NAME.get('cmps_victimtype1')?.options || [], row?.cmps_victimtype1, row?.['cmps_victimtype1@OData.Community.Display.V1.FormattedValue']),
      specialClassifications: decodeChoiceFieldValue('checkbox-group', PROGRAM_ENROLLMENT_FIELD_DEF_BY_NAME.get('cmps_clientspecialclassification1')?.options || [], row?.cmps_clientspecialclassification1, row?.['cmps_clientspecialclassification1@OData.Community.Display.V1.FormattedValue']),
      staffAssigned: String(row?.cmps_staffassigned || '').trim(),
      funder: String(row?.['_cmps_funder1_value@OData.Community.Display.V1.FormattedValue'] || row?._cmps_funder1_value || '').trim(),
      createdOn: String(row?.createdon || '').trim(),
      modifiedOn: String(row?.modifiedon || '').trim(),
    }))

  if (!isLocalHost()) {
    const orgUrl = getOrgUrl(), token = getAuthToken()
    const rows = await readDataverseRecordPages(orgUrl, PROGRAM_ENROLLMENT_TABLE_ALIAS, query, true, async (parameters) => {
      const result = await runtimeDataClient.executeAsync<any, any>({ connectorOperation: {
        tableName: 'commondataserviceforapps', operationName: parameters.next ? 'GetNextPageWithOrganization' : 'ListRecordsWithOrganization',
        parameters: { organization: orgUrl, entityName: PROGRAM_ENROLLMENT_TABLE_ALIAS, ...parameters, accept: 'application/json',
          prefer: 'odata.maxpagesize=1000,odata.include-annotations="OData.Community.Display.V1.FormattedValue"', ...(token ? { token } : {}) },
      } } as any)
      if (!result?.success) throw new Error(parseConnectorErrorMessage(result?.error || result))
      return result.data
    })
    return mapRows(rows)
  }

  const token = await ensureAuthToken().catch(() => '')
  const orgUrl = getOrgUrl()
  if (!token || !orgUrl) throw new Error('Dataverse authentication is required to load active assigned work.')
  const headers = new Headers({ Accept: 'application/json', 'OData-Version': '4.0', 'OData-MaxVersion': '4.0', Authorization: `Bearer ${token}`,
    Prefer: 'odata.maxpagesize=1000,odata.include-annotations="OData.Community.Display.V1.FormattedValue"' })
  const rows = await readDataverseRecordPages(orgUrl, PROGRAM_ENROLLMENT_TABLE_ALIAS, query, false, async (parameters, nextUrl) => {
    const url = new URL(nextUrl || `${orgUrl}/api/data/v9.2/${PROGRAM_ENROLLMENT_TABLE_ALIAS}`)
    // Retain the original assignment/program/archive boundaries even when a
    // continuation URL contains only the paging token.
    for (const [key, value] of Object.entries(parameters)) url.searchParams.set(key, String(value))
    const response = await fetch(url.href, { method: 'GET', credentials: 'include', headers })
    if (!response.ok) throw new Error(await response.text())
    return response.json()
  })
  return mapRows(rows)
}

export async function getProgramEnrollmentLookupDebug(clientRowId: string): Promise<string> {
  const cleanId = String(clientRowId || '').trim()
  const guidCandidate = cleanId.replace(/[{}]/g, '').trim()
  const normalizedTarget = normalizeGuid(guidCandidate)
  if (!normalizedTarget) return 'Program Enrollment lookup debug: client row id is empty.'

  const select = [
    PROGRAM_ENROLLMENT_PRIMARY_ID_FIELD,
    'cmps_recordid',
    'createdon',
    'modifiedon',
    '_cmps_clientid_value',
  ].join(',')

  const filters = [
    `_cmps_clientid_value eq ${guidCandidate}`,
    `_cmps_clientid_value eq '${guidCandidate}'`,
  ]

  const lines: string[] = []
  lines.push('Program Enrollment Lookup Debug')
  lines.push(`clientRowId='${cleanId}' normalized='${normalizedTarget}' table='${PROGRAM_ENROLLMENT_TABLE_ALIAS}'`)

  if (!isLocalHost()) {
    const token = getAuthToken()
    const orgUrl = getOrgUrl()
    lines.push('mode=runtime')

    for (const filter of filters) {
      try {
        const result = await runtimeDataClient.executeAsync<any, any>({
          connectorOperation: {
            tableName: 'commondataserviceforapps',
            operationName: 'ListRecordsWithOrganization',
            parameters: {
              organization: orgUrl,
              entityName: PROGRAM_ENROLLMENT_TABLE_ALIAS,
              '$select': select,
              '$filter': filter,
              '$top': 50,
              ...(token ? { token } : {}),
            },
          },
        } as any)

        const rows = result?.success ? rowsFromPayload(result.data) : []
        const reason = !result?.success ? parseConnectorErrorMessage(result?.error || result) : ''
        lines.push(`filter='${filter}' success=${!!result?.success} rows=${rows.length}${reason ? ` error='${reason}'` : ''}`)
      } catch (error) {
        lines.push(`filter='${filter}' error='${String((error as Error)?.message || error)}'`)
      }
    }

    try {
      const sampleResult = await runtimeDataClient.executeAsync<any, any>({
        connectorOperation: {
          tableName: 'commondataserviceforapps',
          operationName: 'ListRecordsWithOrganization',
          parameters: {
            organization: orgUrl,
            entityName: PROGRAM_ENROLLMENT_TABLE_ALIAS,
            '$select': select,
            '$orderby': 'createdon desc',
            '$top': 50,
            ...(token ? { token } : {}),
          },
        },
      } as any)

      const sampleRows: Array<Record<string, unknown>> = sampleResult?.success ? rowsFromPayload(sampleResult.data) : []
      const matched = sampleRows.filter((row) => rowMatchesClientLookup(row, guidCandidate)).length
      const sampleValues = sampleRows
        .slice(0, 5)
        .map((row) => normalizeGuid(row?._cmps_clientid_value || row?.cmps_clientid))
        .filter(Boolean)
      lines.push(`sampleRows=${sampleRows.length} matchedByClientSide=${matched}`)
      lines.push(`sampleLookupValues=[${sampleValues.join(', ')}]`)
    } catch (error) {
      lines.push(`sampleQueryError='${String((error as Error)?.message || error)}'`)
    }

    return lines.join('\n')
  }

  lines.push('mode=local')
  const token = await ensureAuthToken().catch(() => '')
  const orgUrl = getOrgUrl()
  if (!token || !orgUrl) {
    lines.push('missing local auth token or org url')
    return lines.join('\n')
  }

  const headers = new Headers()
  headers.set('Accept', 'application/json')
  headers.set('OData-Version', '4.0')
  headers.set('OData-MaxVersion', '4.0')
  headers.set('Authorization', `Bearer ${token}`)

  for (const filter of filters) {
    const response = await fetch(
      `${orgUrl}/api/data/v9.2/${PROGRAM_ENROLLMENT_TABLE_ALIAS}?$select=${encodeURIComponent(select)}&$filter=${encodeURIComponent(filter)}&$top=50`,
      {
        method: 'GET',
        credentials: 'include',
        headers,
      },
    ).catch(() => null)

    if (!response) {
      lines.push(`filter='${filter}' error='request failed'`)
      continue
    }

    if (!response.ok) {
      lines.push(`filter='${filter}' status=${response.status}`)
      continue
    }

    const body = await response.json().catch(() => ({}))
    const rows: Array<Record<string, unknown>> = Array.isArray(body?.value) ? body.value : []
    lines.push(`filter='${filter}' status=${response.status} rows=${rows.length}`)
  }

  const sampleResponse = await fetch(
    `${orgUrl}/api/data/v9.2/${PROGRAM_ENROLLMENT_TABLE_ALIAS}?$select=${encodeURIComponent(select)}&$orderby=createdon desc&$top=50`,
    {
      method: 'GET',
      credentials: 'include',
      headers,
    },
  ).catch(() => null)

  if (sampleResponse?.ok) {
    const body = await sampleResponse.json().catch(() => ({}))
    const sampleRows: Array<Record<string, unknown>> = Array.isArray(body?.value) ? body.value : []
    const matched = sampleRows.filter((row) => rowMatchesClientLookup(row, guidCandidate)).length
    const sampleValues = sampleRows
      .slice(0, 5)
      .map((row) => normalizeGuid(row?._cmps_clientid_value || row?.cmps_clientid))
      .filter(Boolean)
    lines.push(`sampleRows=${sampleRows.length} matchedByClientSide=${matched}`)
    lines.push(`sampleLookupValues=[${sampleValues.join(', ')}]`)
  } else {
    lines.push(`sampleQueryStatus=${sampleResponse?.status || 'request failed'}`)
  }

  return lines.join('\n')
}

export async function loadProgramEnrollmentDetailRecord(rowId: string, recordIdHint = ''): Promise<ProgramEnrollmentDetailRecord> {
  const cleanId = String(rowId || '').trim()
  const cleanRecordId = String(recordIdHint || '').trim()
  if (!cleanId && !cleanRecordId) throw new Error('Missing Program Enrollment row id and record id for detail load.')

  try {
    const detail = await loadProgramEnrollmentDetailLocal(cleanId, cleanRecordId)
    return hydrateProgramEnrollmentClientDisplay(detail)
  } catch {
    const detail = await loadProgramEnrollmentDetailRuntime(cleanId, cleanRecordId)
    return hydrateProgramEnrollmentClientDisplay(detail)
  }
}
