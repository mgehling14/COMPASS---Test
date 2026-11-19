import { getClient } from '@microsoft/power-apps/data'
import { dataSourcesInfo } from '../../.power/schemas/appschemas/dataSourcesInfo'
import { ensureAuthToken, getAuthToken } from './auth'
import { excludeArchived } from './archive'

export const HELPLINES_TABLE_ALIAS = 'cmps_helplines'
export const HELPLINES_OPTION_SET_BASE_VALUE = 125570000
export const HELPLINES_PRIMARY_ID_FIELD = 'cmps_helplineid'
const DEFAULT_DATAVERSE_ORG_URL = 'https://org1f466e4e.crm.dynamics.com'
const runtimeDataClient = getClient(dataSourcesInfo as any)

export type HelplineFieldInput =
  | 'select'
  | 'radio'
  | 'checkbox-group'
  | 'multi-select'
  | 'date'
  | 'time'
  | 'text'
  | 'textarea'
  | 'number'
  | 'readonly'

export type HelplineFieldDefinition = {
  field: string
  label: string
  input: HelplineFieldInput
  options: string[]
}

const YES_NO_OPTIONS = ['Yes', 'No']

export const HELPLINE_PROGRAM_OPTIONS = [
  'Autumn House',
  'DV Outreach',
  'CAAFA Shelter',
  'DVSTOP',
  'Faith House',
  'SV Helpline',
]

function isHistoricalSvHelplineProgram(value: unknown): boolean {
  const program = String(value || '').trim().toLowerCase()
  return program === 'sv helpline' || program === '125570005'
}

export function resolveHelplineProgramOptions(options: string[], creatingNew: boolean, selectedValue = ''): string[] {
  if (creatingNew) return options.filter((option) => !isHistoricalSvHelplineProgram(option))
  // Retain historical selections even if a configured dropdown omits SV Helpline.
  if (isHistoricalSvHelplineProgram(selectedValue) && !options.some(isHistoricalSvHelplineProgram)) return [...options, 'SV Helpline']
  return options
}

export const HELPLINE_CONTACT_TYPE_OPTIONS = [
  'Phone Call',
  'Email',
  'Website Contact',
  'Webchat',
  'Text Message',
]

export const HELPLINE_REASONS_FOR_CALL_OPTIONS = [
  'Homeless Services',
  'Requesting Crisis Shelter',
  'Requesting Other Community Services',
  'Seeking Other DV Services',
  'Information/Referral',
  'Legal Support',
  'Medical Support',
  'General Support',
  'Crisis Intervention',
]

export const HELPLINE_SV_CLIENT_TYPE_OPTIONS = [
  'Law Enforcement/FAC',
  'First-time Caller',
  'Hospital Contact',
  'Previous Caller (non-client)',
  'Shelter Resident',
  'Other Social Services Agency',
  'Current/Former REACH Client',
]

export const HELPLINE_ABUSE_STATUS_OPTIONS = ['Primary Victim', 'Secondary Victim', 'Other']

export const HELPLINE_HISTORY_OF_SV_OPTIONS = ['Yes', 'No']

export const HELPLINE_REFERRED_FROM_OPTIONS = [
  'Court Advocate',
  'Family/Friend',
  'Media',
  'Medical',
  'Medical Advocacy',
  'Mental Health',
  'Minister/Clergy',
  'Other Shelter',
  'Crisis Hotline',
  'Police Department',
  'Previous Client',
  'Prosecutor/Attorney',
  'Self-Referral',
  'Social Services',
  'Fire Department',
  'Family Advocacy Center',
  'Agency Website',
  'Social Media',
  'RAINN',
  'Outreach',
]

export const HELPLINE_REFERRED_TO_OPTIONS = [
  'CAAFA Shelter',
  'DVSTOP',
  'Faith House',
  'DV Outreach (Internal)',
  'Community Based DV Program',
  'Homeless Services',
  'Client refused service',
  'Other Community Services',
  'Other DV Shelter',
  'Banner Health',
  'Honor Health',
  'Internal to A New Leaf',
  'Law Enforcement/FAC',
  'Other Community Based SV Program',
  'Other Social Services',
  'REACH Center Services',
  'SafeDVS',
  'Solari Crisis',
  'No Referral Made',
]

export const HELPLINE_CALLOUTCOME_OPTIONS = [
  'Disconnected by Staff',
  'Dropped Call',
  'Provided Information',
  'Provided Screening',
  'Scheduled Intake',
  'Disconnected By Caller',
  'Transferred to Crisis',
  'Called 911',
  'Advocacy Provided',
  'Provided Referral',
]

const HELPLINE_CALLOUTCOME_VALUE_BY_LABEL = new Map<string, number>([
  ['disconnected by staff', 125570000],
  ['dropped call', 125570001],
  ['provided information', 125570002],
  ['provided screening', 125570003],
  ['scheduled intake', 125570004],
  ['disconnected by caller', 125570005],
  ['transferred to crisis', 125570006],
  ['called 911', 125570007],
  ['advocacy provided', 125570008],
  ['provided referral', 125570009],
  // Preserve compatibility with records or cached form configuration that
  // used the former display label for the same Dataverse option.
  ['information/referral', 125570009],
])

function encodeCallOutcomeValue(rawValue: string): number | null {
  const text = String(rawValue || '').trim()
  if (!text) return null

  if (isNumericLiteral(text)) {
    const numeric = Number.parseInt(text, 10)
    return numeric >= 125570000 && numeric <= 125570009 ? numeric : null
  }

  return HELPLINE_CALLOUTCOME_VALUE_BY_LABEL.get(normalizeText(text)) ?? null
}

const SERVICES_NOT_APPROPRIATE_TURNAWAY_REASON = 'Services not appropriate for survivor'

export const HELPLINE_TURNAWAY_REASON_OPTIONS = [
  'No Vacancy',
  'Caller Declined Resources',
  'Caller Declined Shelter Space',
  'Other',
  SERVICES_NOT_APPROPRIATE_TURNAWAY_REASON,
]

export function resolveHelplineTurnawayReasonOptions(options: string[]): string[] {
  // Older configured dropdown lists must still expose the newly mapped choice.
  return [...options.filter((option) => normalizeText(option) !== normalizeText(SERVICES_NOT_APPROPRIATE_TURNAWAY_REASON)), SERVICES_NOT_APPROPRIATE_TURNAWAY_REASON]
}

export const HELPLINE_DANGER_ASSESSMENT_EVALUATION_OPTIONS = [
  'Variable Risk',
  'Elevated Risk',
  'High Risk',
]

export const HELPLINE_FIELD_DEFINITIONS: HelplineFieldDefinition[] = [
  { field: 'cmps_recordid', label: 'Record ID', input: 'readonly', options: [] },
  { field: 'cmps_cpid', label: 'Client Profile', input: 'readonly', options: [] },
  { field: 'cmps_program', label: 'Program', input: 'select', options: HELPLINE_PROGRAM_OPTIONS },
  { field: 'cmps_dateofcontact', label: 'Date Of Contact', input: 'date', options: [] },
  { field: 'cmps_timeofcontact', label: 'Time Of Contact', input: 'time', options: [] },
  { field: 'cmps_contacttype', label: 'Contact Type', input: 'select', options: HELPLINE_CONTACT_TYPE_OPTIONS },
  { field: 'cmps_calllengthminutes', label: 'Call Length (minutes)', input: 'number', options: [] },
  { field: 'cmps_svhelplineclienttype', label: 'SV Helpline Client Type', input: 'select', options: HELPLINE_SV_CLIENT_TYPE_OPTIONS },
  { field: 'cmps_reasonsforcall', label: 'Reason(s) for Call', input: 'checkbox-group', options: HELPLINE_REASONS_FOR_CALL_OPTIONS },
  { field: 'cmps_abusestatus', label: 'Abuse Status', input: 'radio', options: HELPLINE_ABUSE_STATUS_OPTIONS },
  { field: 'cmps_abusestatusother', label: 'Abuse Status - Other', input: 'text', options: [] },
  { field: 'cmps_historyofsv', label: 'History of SV?', input: 'radio', options: HELPLINE_HISTORY_OF_SV_OPTIONS },
  { field: 'cmps_wherewasthehelplinecallerreferredfrom', label: 'Where Was The Helpline Caller Referred From', input: 'select', options: HELPLINE_REFERRED_FROM_OPTIONS },
  { field: 'cmps_wherewasthehelplinecallerreferredto', label: 'Where Was The Helpline Caller Referred To', input: 'select', options: HELPLINE_REFERRED_TO_OPTIONS },
  { field: 'cmps_calloutcome1', label: 'Call Outcome', input: 'multi-select', options: HELPLINE_CALLOUTCOME_OPTIONS },
  { field: 'cmps_areyouinasafeplace', label: 'Are You In A Safe Place', input: 'radio', options: YES_NO_OPTIONS },
  { field: 'cmps_whereisthecaller', label: 'Where Is The Caller', input: 'textarea', options: [] },
  { field: 'cmps_doyouneedimmediatemedicalattention', label: 'Do You Need Immediate Medical Attention', input: 'radio', options: YES_NO_OPTIONS },
  { field: 'cmps_wouldyouliketobegintheshelterscreeningprocess', label: 'Would You Like To Begin The Shelter Screening Process', input: 'radio', options: YES_NO_OPTIONS },
  { field: 'cmps_wouldyouliketocompletetheovwlatelifeabusescre', label: 'Would You Like To Complete The OVW Late Life Abuse Screening', input: 'radio', options: YES_NO_OPTIONS },
  { field: 'cmps_wasthecallerturnedaway', label: 'Was The Caller Turned Away', input: 'radio', options: YES_NO_OPTIONS },
  { field: 'cmps_helplineturnawayreason', label: 'Helpline Turnaway Reason', input: 'select', options: HELPLINE_TURNAWAY_REASON_OPTIONS },
  { field: 'cmps_helplineturnawayreasonother', label: 'Helpline Turnaway Reason - Other', input: 'text', options: [] },
  { field: 'cmps_wastheserviceinformationreceivedhelpful', label: 'Was The Service Information Received Helpful', input: 'radio', options: YES_NO_OPTIONS },
  { field: 'cmps_callerresponse', label: 'Caller Feedback', input: 'textarea', options: [] },
  { field: 'cmps_whereareyoucurrentlystaying', label: 'Where Are You Currently Staying', input: 'textarea', options: [] },
  { field: 'cmps_doyouhaveasafealternativeforhousing', label: 'Do You Have A Safe Alternative For Housing', input: 'radio', options: YES_NO_OPTIONS },
  { field: 'cmps_ifyeshowlongcanyoustayatthissafelocation', label: 'If Yes, How Long Can You Stay At This Safe Location', input: 'textarea', options: [] },
  { field: 'cmps_doyoulivewiththepersonyouarefleeing', label: 'Do You Live With The Person You Are Fleeing', input: 'radio', options: YES_NO_OPTIONS },
  { field: 'cmps_dateoflastincident', label: 'Date Of Last Incident', input: 'date', options: [] },
  { field: 'cmps_canyoutellmeaboutthelastincident', label: 'Can You Tell Me About The Last Incident', input: 'textarea', options: [] },
  { field: 'cmps_hasphysicalviolenceincreasedrecentlyforyouora', label: 'Has Physical Violence Increased Recently', input: 'radio', options: YES_NO_OPTIONS },
  { field: 'cmps_doyoubelieveyourpartneriscapableofkillingyou', label: 'Do You Believe Your Partner Is Capable Of Killing You', input: 'radio', options: YES_NO_OPTIONS },
  { field: 'cmps_doesyourpartnerhaveaweaponoraccesstoaweapon', label: 'Does Your Partner Have A Weapon Or Access To A Weapon', input: 'radio', options: YES_NO_OPTIONS },
  { field: 'cmps_hasyourpartnerevertriedtochokeorsuffocateyou', label: 'Has Your Partner Ever Tried To Choke Or Suffocate You', input: 'radio', options: YES_NO_OPTIONS },
  { field: 'cmps_isyourpartnerviolentlycontrollingandconstantl', label: 'Is Your Partner Violently Controlling And Constantly Monitoring You', input: 'radio', options: YES_NO_OPTIONS },
  { field: 'cmps_havetheyeverbeenviolentwithyouwhileyouwerepre', label: 'Have They Been Violent While You Were Pregnant', input: 'radio', options: YES_NO_OPTIONS },
  { field: 'cmps_numberofyesanswers', label: 'Number Of Yes Answers', input: 'readonly', options: [] },
  { field: 'cmps_dangerassessmentevaluation', label: 'Danger Assessment Evaluation', input: 'select', options: HELPLINE_DANGER_ASSESSMENT_EVALUATION_OPTIONS },
  { field: 'cmps_issheltertheappropriateinterventionforthiscal', label: 'Is Shelter The Appropriate Intervention For This Caller', input: 'radio', options: YES_NO_OPTIONS },
  { field: 'cmps_arethereanyareasinmetrophoenixwhereyoufeeluns', label: 'Are There Areas In Metro Phoenix Where You Feel Unsafe', input: 'radio', options: YES_NO_OPTIONS },
  { field: 'cmps_isthiscallerover50yearsofage', label: 'Is This Caller Over 50 Years Of Age', input: 'radio', options: YES_NO_OPTIONS },
  { field: 'cmps_wasthecallerabusedbyaspousepartnerclosefamily', label: 'Was The Caller Abused By A Spouse, Partner, Or Close Family Member', input: 'radio', options: YES_NO_OPTIONS },
  { field: 'cmps_hasthecallerrecentlyexperienceddomesticviolen', label: 'Has The Caller Recently Experienced Domestic Violence', input: 'radio', options: YES_NO_OPTIONS },
  { field: 'cmps_notes', label: 'Notes', input: 'textarea', options: [] },
]

export const HELPLINE_FIELD_NAMES = HELPLINE_FIELD_DEFINITIONS.map((field) => field.field)

export const HELPLINE_FIELD_DEF_BY_NAME = new Map<string, HelplineFieldDefinition>(
  HELPLINE_FIELD_DEFINITIONS.map((field) => [field.field, field]),
)

export type HelplinePayload = Partial<Record<(typeof HELPLINE_FIELD_NAMES)[number], string>>

export type HelplineSearchRecord = {
  id: string
  recordId: string
  program: string
  dateOfContact: string
  contactType: string
  callLengthMinutes: string
  callNotes: string
}
export type HelplineClientListRecord = HelplineSearchRecord

export type HelplineDetailRecord = {
  id: string
  recordId: string
  values: HelplinePayload
}

type HelplineDataversePayload = Record<string, unknown>

function rowsFromPayload(payload: any): any[] {
  if (Array.isArray(payload)) return payload
  if (Array.isArray(payload?.value)) return payload.value
  return []
}

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

function normalizeText(value: unknown): string {
  return String(value || '').trim().toLowerCase()
}

function isNumericLiteral(value: string): boolean {
  return /^-?\d+$/.test(String(value || '').trim())
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
  const text = String(value || '').trim()
  if (!text) return ''
  if (isNumericLiteral(text)) return text

  const normalized = normalizeText(text)
  const index = options.findIndex((entry) => normalizeText(entry) === normalized)
  if (index >= 0) return String(HELPLINES_OPTION_SET_BASE_VALUE + index)
  return text
}

function decodeOptionLiteral(value: string, options: string[]): string {
  const text = String(value || '').trim()
  if (!text) return ''
  if (!isNumericLiteral(text)) return text

  const numeric = Number.parseInt(text, 10)
  const index = numeric - HELPLINES_OPTION_SET_BASE_VALUE
  if (index >= 0 && index < options.length) return options[index]
  return text
}

function decodeChoiceFieldValue(input: HelplineFieldInput, options: string[], rawValue: unknown, formattedValue?: unknown): string {
  const formatted = String(formattedValue || '').trim()
  if (formatted) return formatted

  const text = String(rawValue ?? '').trim()
  if (!text || options.length === 0) return text
  if (input === 'select' || input === 'radio') return decodeOptionLiteral(text, options)
  return text
}

function decodeMultiChoiceValue(rawValue: unknown, formattedValue: unknown, options: string[]): string {
  const formatted = String(formattedValue || '').trim()
  if (formatted) {
    return formatted
      .split(';')
      .map((entry) => entry.trim())
      .filter(Boolean)
      .join(', ')
  }

  const raw = String(rawValue || '').trim()
  if (!raw) return ''

  return raw
    .split(',')
    .map((entry) => decodeOptionLiteral(String(entry || '').trim(), options))
    .map((entry) => entry.trim())
    .filter(Boolean)
    .join(', ')
}

function parseMultiValue(text: string): string[] {
  return String(text || '')
    .split(/[,;]+/)
    .map((entry) => entry.trim())
    .filter(Boolean)
}

function encodeMultiChoiceValue(rawValue: string, options: string[]): string {
  const selections = parseMultiValue(rawValue)
  if (selections.length === 0) return ''

  const encoded = selections.map((entry) => encodeOptionLiteral(entry, options))
  if (encoded.some((entry) => !isNumericLiteral(entry))) {
    throw new Error('Invalid multi-select choice value. Expected one of the configured option labels for this field.')
  }

  return encoded.join(',')
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

function escapeODataString(value: string): string {
  return String(value || '').replace(/'/g, "''")
}

function buildHelplineSearchFilter(query: string): string {
  const clean = String(query || '').trim()
  if (!clean) return ''
  const escaped = escapeODataString(clean)

  return [
    `contains(cmps_recordid,'${escaped}')`,
    `contains(cmps_whereisthecaller,'${escaped}')`,
    `contains(cmps_notes,'${escaped}')`,
  ].join(' or ')
}

function mapHelplineSearchRows(rows: any[]): HelplineSearchRecord[] {
  return rows.map((row) => {
    const programRaw = row?.cmps_program
    const programFormatted = row?.['cmps_program@OData.Community.Display.V1.FormattedValue']
    const contactTypeRaw = row?.cmps_contacttype
    const contactTypeFormatted = row?.['cmps_contacttype@OData.Community.Display.V1.FormattedValue']

    return {
      id: String(row?.[HELPLINES_PRIMARY_ID_FIELD] || row?.id || '').trim(),
      recordId: String(row?.cmps_recordid || '').trim(),
      program: decodeChoiceFieldValue('select', HELPLINE_PROGRAM_OPTIONS, programRaw, programFormatted),
      dateOfContact: String(row?.['cmps_dateofcontact@OData.Community.Display.V1.FormattedValue'] || row?.cmps_dateofcontact || '').trim(),
      contactType: decodeChoiceFieldValue('select', HELPLINE_CONTACT_TYPE_OPTIONS, contactTypeRaw, contactTypeFormatted),
      callLengthMinutes: String(row?.cmps_calllengthminutes ?? '').trim(),
      callNotes: String(row?.cmps_notes ?? '').trim(),
    }
  })
}

function mapHelplineDetailRow(row: Record<string, unknown>): HelplineDetailRecord {
  const values: HelplinePayload = {}

  for (const field of HELPLINE_FIELD_NAMES) {
    if (field === 'cmps_cpid') {
      values[field] = String(row?.['_cmps_cpid_value'] || '').trim()
      continue
    }

    const fieldDef = HELPLINE_FIELD_DEF_BY_NAME.get(field)
    const raw = row?.[field]
    const formatted = (row as Record<string, unknown>)[`${field}@OData.Community.Display.V1.FormattedValue`]

    if (!fieldDef) {
      values[field] = String(raw ?? '').trim()
      continue
    }

    if (fieldDef.input === 'checkbox-group' || fieldDef.input === 'multi-select') {
      values[field] = decodeMultiChoiceValue(raw, formatted, fieldDef.options)
      continue
    }

    values[field] = decodeChoiceFieldValue(fieldDef.input, fieldDef.options, raw, formatted)
  }

  return {
    id: String(row?.[HELPLINES_PRIMARY_ID_FIELD] || row?.id || '').trim(),
    recordId: String(values.cmps_recordid || row?.cmps_recordid || '').trim(),
    values,
  }
}

function normalizeHelplinePayloadForDataverse(seed: HelplinePayload): HelplineDataversePayload {
  const payload: HelplineDataversePayload = { ...seed }
  delete payload.cmps_calloutcome

  const clientProfileId = String(payload.cmps_cpid || '').trim()
  if (clientProfileId) {
    delete payload.cmps_cpid
    payload['cmps_cpid@odata.bind'] = `/cmps_clientprofiles(${clientProfileId})`
  }

  for (const fieldName of HELPLINE_FIELD_NAMES) {
    if (!Object.prototype.hasOwnProperty.call(payload, fieldName)) continue
    const fieldDef = HELPLINE_FIELD_DEF_BY_NAME.get(fieldName)
    if (!fieldDef) continue

    const rawValue = String(payload[fieldName] ?? '').trim()
    if (!rawValue) {
      if (fieldDef.input === 'multi-select') payload[fieldName] = null
      else delete payload[fieldName]
      continue
    }

    if (fieldDef.input === 'multi-select') {
      const encoded = parseMultiValue(rawValue).map(encodeCallOutcomeValue)
      if (encoded.some((value) => value === null)) throw new Error('Invalid Call Outcome. Select one of the ten configured outcomes.')
      payload[fieldName] = Array.from(new Set(encoded)).join(',')
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

    if (fieldDef.input === 'number') {
      const parsed = Number.parseInt(rawValue, 10)
      if (!Number.isNaN(parsed)) payload[fieldName] = parsed
      continue
    }

    if (fieldDef.input === 'select' || fieldDef.input === 'radio') {
      const encoded = encodeOptionLiteral(rawValue, fieldDef.options)
      if (!isNumericLiteral(encoded)) {
        throw new Error(`Invalid choice value for ${fieldName}: "${rawValue}". Expected one of the configured option labels for this field.`)
      }
      payload[fieldName] = encoded
      continue
    }

    if (fieldDef.input === 'checkbox-group') {
      payload[fieldName] = encodeMultiChoiceValue(rawValue, fieldDef.options)
      continue
    }
  }

  return payload
}

export function generateHelplineRecordId(): string {
  const now = new Date()
  const datePart = now.toISOString().slice(0, 10).replace(/-/g, '')
  const timePart = now.toISOString().slice(11, 19).replace(/:/g, '')
  return `HL-${datePart}${timePart}`
}

async function searchHelplinesLocal(query: string, limit = 25): Promise<HelplineSearchRecord[]> {
  const token = await ensureAuthToken()
  const orgUrl = getOrgUrl()
  if (!token || !orgUrl) throw new Error('Missing Dataverse connection info for Helpline search.')

  const filter = excludeArchived(buildHelplineSearchFilter(query))
  const headers = new Headers()
  headers.set('Accept', 'application/json')
  headers.set('OData-Version', '4.0')
  headers.set('OData-MaxVersion', '4.0')
  headers.set('Authorization', `Bearer ${token}`)

  const selectColumns = [
    HELPLINES_PRIMARY_ID_FIELD,
    'cmps_recordid',
    'cmps_program',
    'cmps_dateofcontact',
    'cmps_contacttype',
    'cmps_calllengthminutes',
  ].join(',')

  const searchParams = new URLSearchParams()
  searchParams.set('$select', selectColumns)
  searchParams.set('$top', String(Math.max(1, Math.min(100, limit))))
  searchParams.set('$filter', filter)

  const response = await fetch(`${orgUrl}/api/data/v9.2/${HELPLINES_TABLE_ALIAS}?${searchParams.toString()}`, {
    method: 'GET',
    credentials: 'include',
    headers,
  })

  if (!response.ok) throw new Error(await response.text())
  const payload = await response.json()
  return mapHelplineSearchRows(rowsFromPayload(payload))
}

async function searchHelplinesRuntime(query: string, limit = 25): Promise<HelplineSearchRecord[]> {
  const token = getAuthToken()
  const orgUrl = getOrgUrl()

  const result = await runtimeDataClient.executeAsync<any, any>({
    connectorOperation: {
      tableName: 'commondataserviceforapps',
      operationName: 'ListRecordsWithOrganization',
      parameters: {
        organization: orgUrl,
        entityName: HELPLINES_TABLE_ALIAS,
        '$select': `${HELPLINES_PRIMARY_ID_FIELD},cmps_recordid,cmps_program,cmps_dateofcontact,cmps_contacttype,cmps_calllengthminutes`,
        '$top': Math.max(1, Math.min(100, limit)),
        '$filter': excludeArchived(buildHelplineSearchFilter(query)),
        ...(token ? { token } : {}),
      },
    },
  } as any)

  if (!result?.success) throw new Error(parseConnectorErrorMessage(result?.error || result))
  return mapHelplineSearchRows(rowsFromPayload(result.data))
}

export async function searchHelplineRecords(query: string, limit = 25): Promise<HelplineSearchRecord[]> {
  try {
    return await searchHelplinesLocal(query, limit)
  } catch {
    return searchHelplinesRuntime(query, limit)
  }
}

export async function listHelplinesForClient(clientRowId: string): Promise<HelplineClientListRecord[]> {
  const clientId = String(clientRowId || '').trim().replace(/[{}]/g, '')
  if (!clientId) return []
  const select = [HELPLINES_PRIMARY_ID_FIELD, 'cmps_recordid', 'cmps_program', 'cmps_dateofcontact', 'cmps_contacttype', 'cmps_calllengthminutes', 'cmps_notes', '_cmps_cpid_value'].join(',')
  const filter = excludeArchived(`_cmps_cpid_value eq ${clientId}`)
  const map = (rows: any[]) => mapHelplineSearchRows(rows)

  if (isLocalHost()) {
    const token = await ensureAuthToken().catch(() => '')
    if (!token) return []
    const headers = new Headers({ Accept: 'application/json', 'OData-Version': '4.0', 'OData-MaxVersion': '4.0', Authorization: `Bearer ${token}` })
    const response = await fetch(`${getOrgUrl()}/api/data/v9.2/${HELPLINES_TABLE_ALIAS}?$select=${encodeURIComponent(select)}&$filter=${encodeURIComponent(filter)}&$top=200`, { credentials: 'include', headers }).catch(() => null)
    return response?.ok ? map(rowsFromPayload(await response.json().catch(() => ({})))) : []
  }

  const token = getAuthToken()
  const result = await runtimeDataClient.executeAsync<any, any>({
    connectorOperation: {
      tableName: 'commondataserviceforapps',
      operationName: 'ListRecordsWithOrganization',
      parameters: { organization: getOrgUrl(), entityName: HELPLINES_TABLE_ALIAS, '$select': select, '$filter': filter, '$top': 200, ...(token ? { token } : {}) },
    },
  } as any).catch(() => null)
  if (result?.success) return map(rowsFromPayload(result.data))
  return []
}

async function loadHelplineDetailLocal(rowId: string, recordIdHint = ''): Promise<HelplineDetailRecord> {
  const token = await ensureAuthToken()
  const orgUrl = getOrgUrl()
  if (!token || !orgUrl) throw new Error('Missing Dataverse connection info for Helpline detail load.')

  const headers = new Headers()
  headers.set('Accept', 'application/json')
  headers.set('OData-Version', '4.0')
  headers.set('OData-MaxVersion', '4.0')
  headers.set('Authorization', `Bearer ${token}`)

  const selectColumns = [HELPLINES_PRIMARY_ID_FIELD, ...HELPLINE_FIELD_NAMES.filter((field) => field !== 'cmps_cpid'), '_cmps_cpid_value'].join(',')
  const cleanId = String(rowId || '').trim()

  if (cleanId) {
    const response = await fetch(
      `${orgUrl}/api/data/v9.2/${HELPLINES_TABLE_ALIAS}(${cleanId})?$select=${encodeURIComponent(selectColumns)}`,
      {
        method: 'GET',
        credentials: 'include',
        headers,
      },
    )

    if (response.ok) {
      const row = await response.json()
      return mapHelplineDetailRow(row)
    }
  }

  const recordId = String(recordIdHint || '').trim()
  if (!recordId) throw new Error('Missing row id and record id for Helpline detail load.')

  const filter = `cmps_recordid eq '${escapeODataString(recordId)}'`
  const response = await fetch(
    `${orgUrl}/api/data/v9.2/${HELPLINES_TABLE_ALIAS}?$select=${encodeURIComponent(selectColumns)}&$filter=${encodeURIComponent(filter)}&$top=1`,
    {
      method: 'GET',
      credentials: 'include',
      headers,
    },
  )

  if (!response.ok) throw new Error(await response.text())
  const payload = await response.json()
  const rows = rowsFromPayload(payload)
  if (rows.length === 0) throw new Error(`No Helpline record found for Record ID ${recordId}.`)
  return mapHelplineDetailRow(rows[0])
}

async function loadHelplineDetailRuntime(rowId: string, recordIdHint = ''): Promise<HelplineDetailRecord> {
  const orgUrl = getOrgUrl()
  const token = getAuthToken()
  const cleanId = String(rowId || '').trim()

  const cleanRecordId = String(recordIdHint || '').trim()
  const id = cleanId.replace(/[{}]/g, '').toLowerCase()
  if (id && !/^[a-f\d]{8}(?:-[a-f\d]{4}){3}-[a-f\d]{12}$/.test(id)) throw new Error('A Helpline Dataverse row ID is required, not its display ID.')
  if (!id && !cleanRecordId) throw new Error('No matching Helpline record found.')
  const filter = id ? `${HELPLINES_PRIMARY_ID_FIELD} eq ${id}` : `cmps_recordid eq '${escapeODataString(cleanRecordId)}'`

  const result = await runtimeDataClient.executeAsync<any, any>({
    connectorOperation: {
      tableName: 'commondataserviceforapps',
      operationName: 'ListRecordsWithOrganization',
      parameters: {
        organization: orgUrl,
        entityName: HELPLINES_TABLE_ALIAS,
        '$select': [HELPLINES_PRIMARY_ID_FIELD, ...HELPLINE_FIELD_NAMES.filter((field) => field !== 'cmps_cpid'), '_cmps_cpid_value'].join(','),
        '$top': 2,
        '$filter': excludeArchived(filter),
        ...(token ? { token } : {}),
      },
    },
  } as any)

  if (!result?.success) throw new Error(parseConnectorErrorMessage(result?.error || result))
  const rows = rowsFromPayload(result.data)
  if (rows.length !== 1 || (id && String(rows[0]?.[HELPLINES_PRIMARY_ID_FIELD] || '').toLowerCase() !== id)) throw new Error('The Helpline record could not be uniquely identified.')
  return mapHelplineDetailRow(rows[0])
}

export async function loadHelplineDetailRecord(rowId: string, recordIdHint = ''): Promise<HelplineDetailRecord> {
  const cleanId = String(rowId || '').trim()
  const cleanRecordId = String(recordIdHint || '').trim()
  if (!cleanId && !cleanRecordId) throw new Error('Missing Helpline row id and record id for detail load.')
  if (!isLocalHost()) return loadHelplineDetailRuntime(cleanId, cleanRecordId)

  try {
    return await loadHelplineDetailLocal(cleanId, cleanRecordId)
  } catch {
    return loadHelplineDetailRuntime(cleanId, cleanRecordId)
  }
}

export async function createHelplineResponse(values: HelplinePayload): Promise<{ id: string; recordId: string }> {
  if (isHistoricalSvHelplineProgram(values.cmps_program)) {
    throw new Error('SV Helpline is available for historical records only. Choose another program for a new Helpline record.')
  }
  const recordId = String(values.cmps_recordid || '').trim() || generateHelplineRecordId()
  const payload = normalizeHelplinePayloadForDataverse({ ...values, cmps_recordid: recordId })
  const orgUrl = getOrgUrl()
  const token = getAuthToken()

  if (!isLocalHost()) {
    const result = await runtimeDataClient.executeAsync<any, any>({
      connectorOperation: {
        tableName: 'commondataserviceforapps',
        operationName: orgUrl ? 'CreateRecordWithOrganization' : 'CreateRecord',
        parameters: { prefer: 'return=representation', accept: 'application/json', 
          ...(orgUrl ? { organization: orgUrl } : {}),
          entityName: HELPLINES_TABLE_ALIAS,
          item: payload,
          ...(token ? { token } : {}),
        },
      },
    } as any)

    if (!result?.success) throw new Error(parseConnectorErrorMessage(result?.error || result))
    const id = String(result?.data?.[HELPLINES_PRIMARY_ID_FIELD] || result?.data?.id || '').trim()
    return { id, recordId }
  }

  const localToken = await ensureAuthToken()
  if (!orgUrl || !localToken) throw new Error('Missing Dataverse connection info for Helpline create.')

  const headers = new Headers()
  headers.set('Accept', 'application/json')
  headers.set('Content-Type', 'application/json')
  headers.set('OData-Version', '4.0')
  headers.set('OData-MaxVersion', '4.0')
  headers.set('Authorization', `Bearer ${localToken}`)
  headers.set('Prefer', 'return=representation')

  const response = await fetch(`${orgUrl}/api/data/v9.2/${HELPLINES_TABLE_ALIAS}`, {
    method: 'POST',
    credentials: 'include',
    headers,
    body: JSON.stringify(payload),
  })

  if (!response.ok) throw new Error(await response.text())
  const body = await response.json().catch(() => ({}))
  const id = String(body?.[HELPLINES_PRIMARY_ID_FIELD] || body?.id || '').trim()
  return { id, recordId }
}

export async function updateHelplineResponse(rowId: string, values: HelplinePayload): Promise<void> {
  const cleanId = String(rowId || '').trim()
  if (!cleanId) throw new Error('Missing Helpline row id for update.')

  const payload = normalizeHelplinePayloadForDataverse(values)
  // PATCH must explicitly clear dates; omitting a blank date preserves its old value.
  for (const field of HELPLINE_FIELD_DEFINITIONS) {
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
          entityName: HELPLINES_TABLE_ALIAS,
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
  if (!orgUrl || !localToken) throw new Error('Missing Dataverse connection info for Helpline update.')

  const headers = new Headers()
  headers.set('Accept', 'application/json')
  headers.set('Content-Type', 'application/json')
  headers.set('OData-Version', '4.0')
  headers.set('OData-MaxVersion', '4.0')
  headers.set('Authorization', `Bearer ${localToken}`)
  headers.set('If-Match', '*')

  const response = await fetch(`${orgUrl}/api/data/v9.2/${HELPLINES_TABLE_ALIAS}(${cleanId})`, {
    method: 'PATCH',
    credentials: 'include',
    headers,
    body: JSON.stringify(payload),
  })

  if (!response.ok) throw new Error(await response.text())
}
