import { getClient } from '@microsoft/power-apps/data'
import { dataSourcesInfo } from '../../.power/schemas/appschemas/dataSourcesInfo'
import { ensureAuthToken, getAuthToken } from './auth'
import { excludeArchived } from './archive'

export const CLIENT_PROFILE_TABLE_ALIAS = 'cmps_clientprofiles'
export const CLIENT_PROFILE_PRIMARY_ID_FIELD = 'cmps_clientprofileid'
const DEFAULT_DATAVERSE_ORG_URL = 'https://org1f466e4e.crm.dynamics.com'

export const CLIENT_PROFILE_APRICOT_LABELS = [
  'RecordID',
  'HMIS ID',
  'Name Data Quality',
  'First Name',
  'Middle Name',
  'Last Name',
  'Suffix',
  'Alert List',
  'Alert List Reason',
  'Picture',
  'Aliases',
  'HMIS Alias',
  'Date of Birth Known?',
  'Date of Birth',
  "Today's Date",
  'Current Age',
  'Race (Up to 5 can be selected)',
  'Multi-racial (calculated from Race)',
  'Ethnicity',
  'Primary Language',
  'Gender',
  'Are you a US Military Veteran?',
  'Disability',
  'Address Line 1',
  'Address Line 2',
  'City',
  'State',
  'County',
  'Zip',
  'Safe Phone',
  'Safe Email',
  'Client Contact Information',
  'Email',
  'Best Day(s) to Contact',
  'Best Time(s) to Contact',
  'Notes',
  'Modification Date',
  'Modified By',
  'Creation Date',
  'Created By',
  'Assigned Programs',
] as const

export const CLIENT_PROFILE_FIELD_NAMES = [
  'cmps_recordid',
  'cmps_hmisid',
  'cmps_namedataquality',
  'cmps_name',
  'cmps_middlename',
  'cmps_lastname',
  'cmps_suffix',
  'cmps_alertlist',
  'cmps_alertlistreason',
  'cmps_picture',
  'cmps_aliases',
  'cmps_hmisaliases',
  'cmps_dateofbirthknown',
  'cmps_dateofbirth',
  'cmps_todaysdate',
  'cmps_currentage',
  'cmps_race',
  'cmps_isclientmultiracial',
  'cmps_ethnicity',
  'cmps_primarylanguage',
  'cmps_gender',
  'cmps_areyouausmilitaryveteran',
  'cmps_disability',
  'cmps_addressline1',
  'cmps_addressline2',
  'cmps_city',
  'cmps_state',
  'cmps_county',
  'cmps_zip',
  'cmps_safephone',
  'cmps_safeemail',
  'cmps_clientcontactinformation',
  'cmps_email',
  'cmps_bestdaystocontact',
  'cmps_besttimestocontact',
  'cmps_notes',
  'modifiedon',
  'cmps_modifiedby',
  'cmps_creationdate',
  'cmps_createdby',
  'cmps_assignedprograms',
] as const

export type ClientProfileFieldName = (typeof CLIENT_PROFILE_FIELD_NAMES)[number]
export type ClientProfilePayload = Partial<Record<ClientProfileFieldName, string>>
type ClientProfileDataversePayload = Partial<Record<ClientProfileFieldName, string | boolean>>

export type ClientProfileSearchRecord = {
  id: string
  recordId: string
  name: string
  hmisId: string
  dateOfBirth: string
  primaryLanguage: string
  gender: string
  alertList: string
  alertListReason: string
}

export type ClientProfileSearchPage = {
  rows: ClientProfileSearchRecord[]
  hasNext: boolean
}

export type ClientProfileDetailRecord = {
  id: string
  recordId: string
  values: Partial<Record<ClientProfileFieldName, string>>
  systemColumns: {
    createdby: string
    createdon: string
    modifiedon: string
    modifiedby: string
  }
}

export type ClientProfileFieldInput =
  | 'text'
  | 'textarea'
  | 'date'
  | 'number'
  | 'checkbox'
  | 'checkbox-group'
  | 'radio'
  | 'select'
  | 'readonly'
  | 'email'
  | 'phone'

export type ClientProfileFieldDefinition = {
  field: ClientProfileFieldName
  label: string
  input: ClientProfileFieldInput
  worksheetType: string
  worksheetOptionsRaw: string
  options: string[]
  usesExternalOptions: boolean
  visibleWhen: Array<{
    field: ClientProfileFieldName
    values: string[]
  }>
  section: 'Main' | 'Previous Location' | 'Notes'
  hiddenByDefault: boolean
  requiredByDefault: boolean
  reportingByDefault: boolean
  requiredWhen?: (values: Partial<Record<ClientProfileFieldName, string>>) => boolean
}

const FIELD_INPUT_OVERRIDES: Partial<Record<ClientProfileFieldName, ClientProfileFieldInput>> = {
  cmps_namedataquality: 'radio',
  cmps_dateofbirthknown: 'radio',
  cmps_race: 'checkbox-group',
  cmps_ethnicity: 'select',
  cmps_primarylanguage: 'radio',
  cmps_gender: 'radio',
  cmps_areyouausmilitaryveteran: 'select',
  cmps_disability: 'checkbox-group',
  cmps_alertlist: 'radio',
  cmps_isclientmultiracial: 'readonly',
  cmps_state: 'select',
  cmps_safephone: 'radio',
  cmps_safeemail: 'radio',
  cmps_bestdaystocontact: 'checkbox-group',
  cmps_besttimestocontact: 'checkbox-group',
  cmps_aliases: 'textarea',
  cmps_hmisaliases: 'textarea',
  cmps_notes: 'textarea',
  cmps_currentage: 'readonly',
  modifiedon: 'readonly',
  cmps_creationdate: 'readonly',
  cmps_createdby: 'readonly',
  cmps_modifiedby: 'readonly',
  cmps_assignedprograms: 'readonly',
}

const FIELD_OPTION_OVERRIDES: Partial<Record<ClientProfileFieldName, string[]>> = {
  cmps_namedataquality: [
    'Full Name Reported',
    'Partial, street name, or code name reported',
    'Unknown/Not Reported',
    'Anonymous Profile',
  ],
  cmps_dateofbirthknown: [
    'Full DOB',
    'Approximate or Partial DOB Reported',
    'Unknown/Not Reported',
  ],
  cmps_race: [
    'American Indian or Alaska Native',
    'Asian',
    'Black or African American',
    'Native Hawaiian or Pacific Islander',
    'White',
    'Unknown/Not Reported',
  ],
  cmps_ethnicity: [
    'Non-Hispanic/Non-Latin(a)(o)(x)',
    'Hispanic/Latin(a)(o)(x)',
    'Unknown/Not Reported',
  ],
  cmps_primarylanguage: [
    'English',
    'Spanish',
    'French',
    'Other',
  ],
  cmps_alertlist: ['Yes', 'No'],
  cmps_isclientmultiracial: ['Yes', 'No'],
  cmps_gender: [
    'Female',
    'Male',
    'A gender other than singularly female or male',
    'Transgender',
    'Questioning',
    'Unknown/Not Reported',
  ],
  cmps_areyouausmilitaryveteran: [
    'Yes',
    'No',
    'Unknown/Not Reported',
  ],
  cmps_safephone: ['Yes', 'No'],
  cmps_safeemail: ['Yes', 'No'],
  cmps_disability: [
    'Physical',
    'Mental',
    'Developmental',
    'Deaf/Hard of Hearing',
  ],
  cmps_bestdaystocontact: [
    'Monday',
    'Tuesday',
    'Wednesday',
    'Thursday',
    'Friday',
    'Saturday',
    'Sunday',
  ],
  cmps_besttimestocontact: [
    'Before 8AM',
    'Between 8AM - 10AM',
    'Between 10AM - 12PM',
    'Between 12PM - 2PM',
    'Between 2PM - 4PM',
    'Between 4PM - 6PM',
    'After 6PM',
    'Other',
  ],
  cmps_assignedprograms: [
    'Autumn House',
    'DV Outreach',
    'CAAFA Shelter',
    'DVSTOP',
    'Faith House',
    'REACH Center',
    'SV Helpline',
  ],
}

const FIELD_VISIBILITY_OVERRIDES: Partial<Record<ClientProfileFieldName, Array<{
  field: ClientProfileFieldName
  values: string[]
}>>> = {
  cmps_hmisid: [{ field: 'cmps_assignedprograms', values: ['CAAFA Shelter'] }],
  cmps_hmisaliases: [{ field: 'cmps_assignedprograms', values: ['CAAFA Shelter'] }],
  cmps_alertlistreason: [
    {
      field: 'cmps_alertlist',
      values: ['Yes'],
    },
  ],
  cmps_dateofbirth: [
    {
      field: 'cmps_dateofbirthknown',
      values: ['Full DOB', 'Approximate or Partial DOB Reported'],
    },
  ],
  cmps_currentage: [
    {
      field: 'cmps_dateofbirthknown',
      values: ['Full DOB', 'Approximate or Partial DOB Reported'],
    },
  ],
  cmps_clientcontactinformation: [{ field: 'cmps_safephone', values: ['Yes'] }],
  cmps_email: [{ field: 'cmps_safeemail', values: ['Yes'] }],
}

const CLIENT_PROFILE_SECTION_BY_FIELD: Partial<Record<ClientProfileFieldName, ClientProfileFieldDefinition['section']>> = {
  cmps_addressline1: 'Previous Location',
  cmps_addressline2: 'Previous Location',
  cmps_city: 'Previous Location',
  cmps_state: 'Previous Location',
  cmps_county: 'Previous Location',
  cmps_zip: 'Previous Location',
  cmps_safephone: 'Previous Location',
  cmps_safeemail: 'Previous Location',
  cmps_clientcontactinformation: 'Previous Location',
  cmps_email: 'Previous Location',
  cmps_bestdaystocontact: 'Previous Location',
  cmps_besttimestocontact: 'Previous Location',
  cmps_notes: 'Notes',
}

const CLIENT_PROFILE_HIDDEN_BY_DEFAULT = new Set<ClientProfileFieldName>([
  // Retain the backend field without displaying it in create, edit, or view mode.
  'cmps_todaysdate',
])

const CLIENT_PROFILE_REQUIRED_BY_DEFAULT = new Set<ClientProfileFieldName>([
  'cmps_namedataquality', 'cmps_name', 'cmps_dateofbirthknown',
  'cmps_race', 'cmps_ethnicity', 'cmps_primarylanguage',
  'cmps_gender', 'cmps_areyouausmilitaryveteran',
  'cmps_city',
])

const CLIENT_PROFILE_REPORTING_BY_DEFAULT = new Set<ClientProfileFieldName>([
  'cmps_name', 'cmps_dateofbirth', 'cmps_race', 'cmps_isclientmultiracial',
  'cmps_ethnicity', 'cmps_gender', 'cmps_areyouausmilitaryveteran',
  'cmps_addressline1', 'cmps_addressline2', 'cmps_city', 'cmps_state',
  'cmps_county', 'cmps_zip',
])

const CLIENT_PROFILE_WORKSHEET_TYPES = [
  'System Field',
  'Radio Button',
  'Name',
  'Text',
  'Text',
  'Text',
  'Checkbox',
  'Text',
  'HTML Header',
  'Multi-line Text',
  'Text',
  'Radio Button',
  'Date',
  'Date',
  'Calculated Field',
  'Checkbox',
  'Text',
  'Radio Button',
  'Dropdown',
  'Radio Button',
  'Checkbox',
  'Dropdown',
  'Checkbox',
  'Text',
  'Text',
  'Text',
  'Dropdown',
  'Text',
  'Text',
  'Checkbox',
  'Checkbox',
  'Phone',
  'Link',
  'Checkbox',
  'Checkbox',
  'Multi-line Text',
  'Linking',
  'System Field',
  'System Field',
  'System Field',
  'System Field',
] as const

const CLIENT_PROFILE_WORKSHEET_OPTIONS = [
  '-',
  '-',
  'Picture',
  'Picture',
  '-',
  '-',
  '-',
  'Yes',
  '-',
  '-',
  '-',
  '-',
  'Picture',
  '-',
  '-',
  '-',
  'Picture',
  'Yes, No',
  'Picture',
  'Picture',
  'Picture',
  'Picture',
  'Picture',
  '-',
  '-',
  '-',
  'Picture',
  '-',
  '-',
  'Yes, No',
  'Yes, No',
  'Picture',
  '-',
  'Picture',
  'Picture',
  '-',
  '-',
  '-',
  '-',
  '-',
] as const

function parseWorksheetOptions(rawOptions: string): { options: string[]; usesExternalOptions: boolean } {
  const raw = String(rawOptions || '').trim()
  if (!raw || raw === '-') return { options: [], usesExternalOptions: false }

  if (normalizeText(raw) === 'picture') {
    return { options: [], usesExternalOptions: true }
  }

  const options = raw
    .split(',')
    .map((entry) => String(entry || '').trim())
    .filter(Boolean)

  return { options, usesExternalOptions: false }
}

function normalizeText(value: string): string {
  return String(value || '').trim().toLowerCase()
}

export function deriveClientMultiRacialValue(raceValue: unknown): 'Yes' | 'No' {
  const selectedRaces = String(raceValue ?? '')
    .split(/[;,]+/)
    .map((entry) => normalizeText(entry))
    .filter(Boolean)
  return new Set(selectedRaces).size > 1 ? 'Yes' : 'No'
}

function resolveFieldInput(fieldType: string, options: string[]): ClientProfileFieldInput {
  const type = normalizeText(fieldType)

  if (type === 'multi-line text') return 'textarea'
  if (type === 'date') return 'date'
  if (type === 'calculated field') return 'number'
  if (type === 'system field' || type === 'html header') return 'readonly'
  if (type === 'phone') return 'phone'
  if (type === 'link') return 'email'
  if (type === 'dropdown') return options.length > 0 ? 'select' : 'text'
  if (type === 'radio button') return options.length > 0 ? 'radio' : 'text'
  if (type === 'checkbox') return options.length > 1 ? 'checkbox-group' : 'checkbox'
  return 'text'
}

export const CLIENT_PROFILE_FIELDS: ClientProfileFieldDefinition[] = CLIENT_PROFILE_FIELD_NAMES.map((field, index) => {
  const worksheetType = CLIENT_PROFILE_WORKSHEET_TYPES[index] || 'Text'
  const worksheetOptionsRaw = CLIENT_PROFILE_WORKSHEET_OPTIONS[index] || '-'
  const { options, usesExternalOptions } = parseWorksheetOptions(worksheetOptionsRaw)
  const overrideOptions = FIELD_OPTION_OVERRIDES[field]
  const finalOptions = overrideOptions || options
  const inputFromType = resolveFieldInput(worksheetType, finalOptions)

  return {
    field,
    label: CLIENT_PROFILE_APRICOT_LABELS[index] || field,
    input: FIELD_INPUT_OVERRIDES[field] || inputFromType,
    worksheetType,
    worksheetOptionsRaw,
    options: finalOptions,
    usesExternalOptions: overrideOptions ? false : usesExternalOptions,
    visibleWhen: FIELD_VISIBILITY_OVERRIDES[field] || [],
    section: CLIENT_PROFILE_SECTION_BY_FIELD[field] || 'Main',
    hiddenByDefault: CLIENT_PROFILE_HIDDEN_BY_DEFAULT.has(field),
    // Middle name is always optional, including when Name Data Quality is Full Name Reported.
    requiredByDefault: field !== 'cmps_middlename' && CLIENT_PROFILE_REQUIRED_BY_DEFAULT.has(field),
    reportingByDefault: CLIENT_PROFILE_REPORTING_BY_DEFAULT.has(field),
    requiredWhen: field === 'cmps_clientcontactinformation'
          ? (values) => normalizeText(values.cmps_safephone || '') === normalizeText('Yes')
          : field === 'cmps_email'
            ? (values) => normalizeText(values.cmps_safeemail || '') === normalizeText('Yes')
            : undefined,
  }
})

const OPTION_SET_BASE_VALUE = 125570000
const CHOICE_PLACEHOLDER_LABEL = '--Please Select--'
const LEGACY_COLLAPSED_CHOICE_FIELDS = new Set<ClientProfileFieldName>([
  'cmps_namedataquality',
  'cmps_gender',
  'cmps_ethnicity',
  'cmps_dateofbirthknown',
  'cmps_areyouausmilitaryveteran',
  'cmps_race',
])
const CLIENT_PROFILE_FIELD_DEF_BY_NAME = new Map<ClientProfileFieldName, ClientProfileFieldDefinition>(
  CLIENT_PROFILE_FIELDS.map((field) => [field.field, field]),
)

export function isAnonymousClientProfile(values: ClientProfilePayload): boolean {
  const nameDataQuality = normalizeText(values.cmps_namedataquality || '')
  return nameDataQuality === 'anonymous profile' || nameDataQuality === '125570003'
}

export function applyAnonymousClientProfileDefaults(values: ClientProfilePayload): ClientProfilePayload {
  const nextValues = { ...values }
  if (!isAnonymousClientProfile(nextValues)) return nextValues

  nextValues.cmps_lastname = 'Anonymous'
  for (const field of CLIENT_PROFILE_FIELDS) {
    // Name Data Quality remains Anonymous Profile; only unanswered choices get a default.
    if (field.field === 'cmps_namedataquality' || String(nextValues[field.field] || '').trim()) continue
    const unknownOption = field.options.find((option) => normalizeText(option) === 'unknown/not reported')
    if (unknownOption) nextValues[field.field] = unknownOption
  }
  return nextValues
}

export function updateClientProfileDraftValue(values: ClientProfilePayload, field: ClientProfileFieldName, value: string): ClientProfilePayload {
  const nextValues = { ...values, [field]: value }
  if (field === 'cmps_race') nextValues.cmps_isclientmultiracial = deriveClientMultiRacialValue(value)
  if (field === 'cmps_namedataquality' && isAnonymousClientProfile(nextValues)) {
    return applyAnonymousClientProfileDefaults(nextValues)
  }
  // Enforce the locked last name without reapplying defaults after users edit choices.
  if (isAnonymousClientProfile(nextValues)) nextValues.cmps_lastname = 'Anonymous'
  return nextValues
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
  return false
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

function encodeChoiceFieldValue(input: ClientProfileFieldInput, options: string[], rawValue: string): string {
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

function normalizeDateForInput(value: unknown): string {
  const text = String(value ?? '').trim()
  if (!text) return ''

  // Dataverse raw date/datetime values are typically ISO-like; date inputs require YYYY-MM-DD.
  if (/^\d{4}-\d{2}-\d{2}/.test(text)) return text.slice(0, 10)

  const parsed = new Date(text)
  if (Number.isNaN(parsed.getTime())) return ''
  const year = parsed.getFullYear()
  const month = String(parsed.getMonth() + 1).padStart(2, '0')
  const day = String(parsed.getDate()).padStart(2, '0')
  return `${year}-${month}-${day}`
}

function parseLegacyAddressParts(value: unknown): {
  line1: string
  line2: string
  city: string
  state: string
  county: string
  zip: string
} {
  const lines = String(value ?? '').split(/\r?\n/).map((line) => line.trim())
  const find = (prefix: string): string => {
    const line = lines.find((entry) => normalizeText(entry).startsWith(normalizeText(prefix))) || ''
    return line.includes(':') ? line.slice(line.indexOf(':') + 1).trim() : ''
  }

  return {
    line1: find('Address line 1:'),
    line2: find('Address line 2:'),
    city: find('City:'),
    state: find('State:'),
    county: find('County:'),
    zip: find('Zip:'),
  }
}

function decodeChoiceFieldValue(
  input: ClientProfileFieldInput,
  options: string[],
  rawValue: unknown,
  formattedValue?: unknown,
): string {
  if (input === 'date') {
    return normalizeDateForInput(rawValue)
  }

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

function normalizeClientProfilePayloadForDataverse(seed: ClientProfilePayload): ClientProfileDataversePayload {
  const payload: ClientProfileDataversePayload = {
    ...seed,
    cmps_isclientmultiracial: deriveClientMultiRacialValue(seed.cmps_race),
  }
  if (isAnonymousClientProfile(seed)) payload.cmps_lastname = 'Anonymous'

  // Dataverse rejects empty-string literals for non-string columns (e.g., Int32).
  // Remove blank values so optional fields are omitted from create/update payloads.
  for (const [field, value] of Object.entries(payload)) {
    if (value === null || value === undefined) {
      delete payload[field as ClientProfileFieldName]
      continue
    }

    if (typeof value === 'string' && !value.trim()) {
      delete payload[field as ClientProfileFieldName]
    }
  }

  for (const field of CLIENT_PROFILE_FIELD_NAMES) {
    const fieldDef = CLIENT_PROFILE_FIELD_DEF_BY_NAME.get(field)
    if (!fieldDef) continue
    const encodingInput: ClientProfileFieldInput = field === 'cmps_isclientmultiracial' ? 'radio' : fieldDef.input
    if (
      encodingInput !== 'radio'
      && encodingInput !== 'select'
      && encodingInput !== 'checkbox-group'
      && encodingInput !== 'checkbox'
      && encodingInput !== 'date'
    ) continue

    const rawValue = String(payload[field] || '').trim()
    if (!rawValue) continue
    if (encodingInput === 'date') {
      if (isEmptyDateValue(rawValue)) {
        delete payload[field]
        continue
      }
      payload[field] = rawValue
      continue
    }
    // Only collapse legacy numeric choices; labels can themselves contain commas.
    const collapsedRawValue = LEGACY_COLLAPSED_CHOICE_FIELDS.has(field) && rawValue.split(/[;,]+/).every(isNumericLiteral)
      ? rawValue.split(/[;,]+/).map((entry) => {
        const numeric = Number.parseInt(entry.trim(), 10)
        const maxValid = OPTION_SET_BASE_VALUE + getDataverseChoiceOptions(fieldDef.options).length - 1
        return Number.isInteger(numeric) && numeric > maxValid ? String(maxValid) : entry.trim()
      }).join(',')
      : rawValue
    payload[field] = encodeChoiceFieldValue(encodingInput, fieldDef.options, collapsedRawValue)
  }

  return payload
}

const CLIENT_PROFILE_SELECT_COLUMNS = [
  CLIENT_PROFILE_PRIMARY_ID_FIELD,
  ...CLIENT_PROFILE_FIELD_NAMES.filter(
    (field) =>
      field !== 'cmps_picture'
      && field !== 'modifiedon'
      && field !== 'cmps_creationdate',
  ),
  'createdby',
  'createdon',
  'modifiedon',
  'modifiedby',
  '_createdby_value',
  '_modifiedby_value',
  'cmps_previousaddress',
].join(',')

const runtimeDataClient = getClient(dataSourcesInfo as any)

function sanitizeOrgUrl(value: unknown): string {
  const raw = String(value || '').trim().replace(/\/$/, '')
  if (!raw) return ''
  const lowered = raw.toLowerCase()
  if (lowered === 'null' || lowered === 'undefined') return ''
  return raw
}

function extractOrgUrlFromWindow(): string {
  if (typeof window === 'undefined') return ''

  const w = window as typeof window & {
    PowerApps?: any
    powerAppsContext?: any
    __POWER_CONTEXT__?: any
    __APP_ORG_URL?: string
  }

  const candidates = [
    w?.PowerApps?.context?.organization?.url,
    w?.PowerApps?.context?.organizationUrl,
    w?.__APP_ORG_URL,
    w?.powerAppsContext?.organization?.url,
    w?.powerAppsContext?.organizationUrl,
    w?.__POWER_CONTEXT__?.organization?.url,
    w?.__POWER_CONTEXT__?.organizationUrl,
  ]

  for (const candidate of candidates) {
    const normalized = sanitizeOrgUrl(candidate)
    if (!normalized) continue
    if (/\.crm\d*\./i.test(normalized) || /\.crm\./i.test(normalized)) {
      return normalized
    }
  }

  return ''
}

function extractOrgUrlFromStorage(): string {
  if (typeof window === 'undefined') return ''

  const read = (store: Storage | undefined, key: string): string => {
    try {
      return sanitizeOrgUrl(store?.getItem(key) || '')
    } catch {
      return ''
    }
  }

  const keys = [
    'compass_org_url',
    'inventory_org_url',
    'dataverse_org_url',
    'VITE_DATAVERSE_ORG_URL',
  ]

  for (const key of keys) {
    const sessionValue = read(typeof sessionStorage !== 'undefined' ? sessionStorage : undefined, key)
    if (sessionValue) return sessionValue

    const localValue = read(typeof localStorage !== 'undefined' ? localStorage : undefined, key)
    if (localValue) return localValue
  }

  return ''
}

function extractOrgUrlFromOrganizationsPayload(data: any): string {
  const rows = Array.isArray(data)
    ? data
    : Array.isArray(data?.value)
      ? data.value
      : Array.isArray(data?.organizations)
        ? data.organizations
        : []

  for (const row of rows) {
    const candidate = sanitizeOrgUrl(
      row?.organization || row?.organizationUrl || row?.url || row?.instanceUrl || row?.ApiUrl,
    )
    if (!candidate) continue
    if (/^https:\/\//i.test(candidate)) return candidate
  }

  return ''
}

function parseConnectorErrorMessage(err: unknown): string {
  if (err && typeof err === 'object') {
    const anyErr = err as Record<string, unknown>
    const nested = anyErr.error as Record<string, unknown> | undefined
    const directMessage = String(anyErr.message || nested?.message || '').trim()
    if (directMessage) return directMessage

    try {
      const serialized = JSON.stringify(err)
      if (serialized && serialized !== '{}') return serialized
    } catch {
      // no-op
    }
  }

  const text = String((err as Error)?.message || err || '').trim()
  try {
    const parsed = JSON.parse(text)
    const nested = parsed?.error?.message || parsed?.message || ''
    if (nested) return String(nested)
  } catch {
    // no-op
  }
  return text
}

async function resolveRuntimeOrganizationUrl(): Promise<string> {
  const envUrl = sanitizeOrgUrl(import.meta.env.VITE_DATAVERSE_ORG_URL)
  if (envUrl) return envUrl

  const windowUrl = extractOrgUrlFromWindow()
  if (windowUrl) return windowUrl

  const storageUrl = extractOrgUrlFromStorage()
  if (storageUrl) return storageUrl

  const token = getAuthToken()

  try {
    const result = await runtimeDataClient.executeAsync<any, any>({
      connectorOperation: {
        tableName: 'commondataserviceforapps',
        operationName: 'GetOrganizations',
        parameters: {
          ...(token ? { token } : {}),
        },
      },
    } as any)

    if (result?.success) {
      const fromPayload = extractOrgUrlFromOrganizationsPayload(result.data)
      if (fromPayload) return fromPayload
    }
  } catch {
    // no-op
  }

  const defaultUrl = sanitizeOrgUrl(DEFAULT_DATAVERSE_ORG_URL)
  if (defaultUrl) return defaultUrl

  return ''
}

function nowRecordId(): string {
  return `CP-${new Date().toISOString().replace(/[-:.TZ]/g, '').slice(0, 14)}`
}

function buildClientFullName(first: unknown, middle: unknown, last: unknown): string {
  return [first, middle, last]
    .map((entry) => String(entry || '').trim())
    .filter(Boolean)
    .join(' ')
}

export function generateClientProfileRecordId(): string {
  return nowRecordId()
}

function parseRuntimeCreatedId(data: any): string {
  if (!data) return ''

  if (typeof data === 'string') {
    const match = data.match(/\(([0-9a-fA-F-]{36})\)/)
    return match?.[1] || ''
  }

  const direct = data[CLIENT_PROFILE_PRIMARY_ID_FIELD] || data.id || data.recordId
  if (direct) return String(direct).trim()

  const entityId = data['@odata.id'] || data['@odata.editLink']
  if (entityId && typeof entityId === 'string') {
    const match = entityId.match(/\(([0-9a-fA-F-]{36})\)/)
    return match?.[1] || ''
  }

  return ''
}

async function createRuntime(payload: ClientProfileDataversePayload): Promise<string> {
  const orgUrl = await resolveRuntimeOrganizationUrl()
  const token = getAuthToken()

  const invoke = async (operationName: string, parameters: Record<string, unknown>) => {
    const result = await runtimeDataClient.executeAsync<any, any>({
      connectorOperation: {
        tableName: 'commondataserviceforapps',
        operationName,
        parameters,
      },
    } as any)

    if (!result?.success) throw new Error(JSON.stringify(result || {}))
    return parseRuntimeCreatedId(result.data)
  }

  if (!orgUrl) {
    throw new Error('Connector fallback create failed: Dataverse organization URL could not be resolved.')
  }

  try {
    return await invoke('CreateRecordWithOrganization', { prefer: 'return=representation', accept: 'application/json', 
      organization: orgUrl,
      entityName: CLIENT_PROFILE_TABLE_ALIAS,
      item: payload,
      ...(token ? { token } : {}),
    })
  } catch (err) {
    const reason = parseConnectorErrorMessage(err)
    throw new Error(`Connector fallback create failed: ${reason}`)
  }
}

function escapeODataString(value: string): string {
  return String(value || '').replace(/'/g, "''")
}

function normalizeGuidValue(value: unknown): string {
  return String(value || '').trim().replace(/[{}]/g, '')
}

function rowsFromPayload(payload: any): any[] {
  if (Array.isArray(payload)) return payload
  if (Array.isArray(payload?.value)) return payload.value
  return []
}

async function findRuntimeRowIdByRecordId(recordId: string): Promise<string> {
  const cleaned = String(recordId || '').trim()
  if (!cleaned) return ''

  const orgUrl = await resolveRuntimeOrganizationUrl()
  const token = getAuthToken()

  const invoke = async (operationName: string, parameters: Record<string, unknown>) => {
    const result = await runtimeDataClient.executeAsync<any, any>({
      connectorOperation: {
        tableName: 'commondataserviceforapps',
        operationName,
        parameters,
      },
    } as any)

    if (!result?.success) throw new Error(JSON.stringify(result || {}))
    const rows = rowsFromPayload(result.data)
    const first = rows[0] || {}
    return String(first[CLIENT_PROFILE_PRIMARY_ID_FIELD] || first.id || '').trim()
  }

  const filter = `cmps_recordid eq '${escapeODataString(cleaned)}'`

  if (!orgUrl) return ''

  try {
    return await invoke('ListRecordsWithOrganization', {
      organization: orgUrl,
      entityName: CLIENT_PROFILE_TABLE_ALIAS,
      '$select': `${CLIENT_PROFILE_PRIMARY_ID_FIELD},cmps_recordid`,
      '$filter': filter,
      '$top': 1,
      ...(token ? { token } : {}),
    })
  } catch {
    return ''
  }
}

async function updateRuntime(recordId: string, payload: ClientProfileDataversePayload): Promise<void> {
  const orgUrl = await resolveRuntimeOrganizationUrl()
  const token = getAuthToken()

  const invoke = async (operationName: string, parameters: Record<string, unknown>) => {
    const result = await runtimeDataClient.executeAsync<any, any>({
      connectorOperation: {
        tableName: 'commondataserviceforapps',
        operationName,
        parameters,
      },
    } as any)

    if (!result?.success) throw new Error(JSON.stringify(result || {}))
  }

  if (!orgUrl) {
    throw new Error('Connector fallback update failed: Dataverse organization URL could not be resolved.')
  }

  try {
    await invoke('UpdateOnlyRecordWithOrganization', {
      organization: orgUrl,
      entityName: CLIENT_PROFILE_TABLE_ALIAS,
      recordId,
      item: payload,
      ...(token ? { token } : {}),
    })
  } catch (err) {
    const reason = parseConnectorErrorMessage(err)
    throw new Error(`Connector fallback update failed: ${reason}`)
  }
}

async function findLocalRowIdByRecordId(recordId: string): Promise<string> {
  const cleaned = String(recordId || '').trim()
  if (!cleaned) return ''

  const token = await ensureAuthToken()
  const orgUrl = await resolveRuntimeOrganizationUrl()
  if (!token || !orgUrl) return ''

  const headers = new Headers()
  headers.set('Accept', 'application/json')
  headers.set('OData-Version', '4.0')
  headers.set('OData-MaxVersion', '4.0')
  headers.set('Authorization', `Bearer ${token}`)

  const filter = `cmps_recordid eq '${escapeODataString(cleaned)}'`
  const url = `${orgUrl}/api/data/v9.2/${CLIENT_PROFILE_TABLE_ALIAS}?$select=${CLIENT_PROFILE_PRIMARY_ID_FIELD},cmps_recordid&$filter=${encodeURIComponent(filter)}&$top=1`
  const response = await fetch(url, {
    method: 'GET',
    credentials: 'include',
    headers,
  })

  if (!response.ok) return ''

  const payload = await response.json()
  const rows = rowsFromPayload(payload)
  const first = rows[0] || {}
  return String(first[CLIENT_PROFILE_PRIMARY_ID_FIELD] || first.id || '').trim()
}

async function createLocal(payload: ClientProfileDataversePayload): Promise<string> {
  const token = await ensureAuthToken()
  const orgUrl = await resolveRuntimeOrganizationUrl()
  if (!token || !orgUrl) throw new Error('Missing Dataverse connection info for local create.')

  const headers = new Headers()
  headers.set('Accept', 'application/json')
  headers.set('Content-Type', 'application/json')
  headers.set('OData-Version', '4.0')
  headers.set('OData-MaxVersion', '4.0')
  headers.set('Authorization', `Bearer ${token}`)
  headers.set('Prefer', 'return=representation')

  const response = await fetch(`${orgUrl}/api/data/v9.2/${CLIENT_PROFILE_TABLE_ALIAS}`, {
    method: 'POST',
    credentials: 'include',
    headers,
    body: JSON.stringify(payload),
  })

  if (!response.ok) throw new Error(await response.text())

  try {
    const payloadBody = await response.json()
    const direct = payloadBody?.[CLIENT_PROFILE_PRIMARY_ID_FIELD] || payloadBody?.id
    if (direct) return String(direct).trim()
  } catch {
    // body may be empty depending on API behavior
  }

  const odataEntityId = response.headers.get('OData-EntityId') || response.headers.get('odata-entityid') || ''
  const match = odataEntityId.match(/\(([0-9a-fA-F-]{36})\)/)
  return match?.[1] || ''
}

async function updateLocal(recordId: string, payload: ClientProfileDataversePayload): Promise<void> {
  const token = await ensureAuthToken()
  const orgUrl = await resolveRuntimeOrganizationUrl()
  if (!token || !orgUrl) throw new Error('Missing Dataverse connection info for local update.')

  const headers = new Headers()
  headers.set('Accept', 'application/json')
  headers.set('Content-Type', 'application/json')
  headers.set('OData-Version', '4.0')
  headers.set('OData-MaxVersion', '4.0')
  headers.set('Authorization', `Bearer ${token}`)

  const response = await fetch(`${orgUrl}/api/data/v9.2/${CLIENT_PROFILE_TABLE_ALIAS}(${recordId})`, {
    method: 'PATCH',
    credentials: 'include',
    headers,
    body: JSON.stringify(payload),
  })

  if (!response.ok) throw new Error(await response.text())
}

export async function createClientProfileResponse(seed: ClientProfilePayload = {}): Promise<{ id: string; recordId: string }> {
  const recordId = String(seed.cmps_recordid || '').trim() || nowRecordId()
  const payload = normalizeClientProfilePayloadForDataverse({
    cmps_recordid: recordId,
    ...seed,
  })

  let id = ''
  try {
    // Prefer direct Dataverse Web API first, matching the inventory/task pattern.
    id = await createLocal(payload)
  } catch {
    // fall back to runtime connector
    id = await createRuntime(payload)
  }

  if (id) return { id, recordId }

  const fallbackId = await findRuntimeRowIdByRecordId(recordId)
  if (fallbackId) return { id: fallbackId, recordId }

  return { id: '', recordId }
}

export async function resolveClientProfileRowIdByRecordId(recordId: string): Promise<string> {
  const localMatch = await findLocalRowIdByRecordId(recordId)
  if (localMatch) return normalizeGuidValue(localMatch)
  const runtimeMatch = await findRuntimeRowIdByRecordId(recordId)
  return normalizeGuidValue(runtimeMatch)
}

export async function updateClientProfileResponse(recordId: string, payload: ClientProfilePayload): Promise<void> {
  if (!recordId) throw new Error('Missing client profile row id for update.')
  const normalizedPayload = normalizeClientProfilePayloadForDataverse(payload)
  // PATCH must explicitly clear dates; omitting a blank date preserves its old value.
  for (const field of CLIENT_PROFILE_FIELDS) {
    const value = (payload as Record<string, unknown>)[field.field]
    if (['date', 'datetime'].includes(field.input) && Object.prototype.hasOwnProperty.call(payload, field.field)
      && (value === null || (typeof value === 'string' && !value.trim()))) (normalizedPayload as Record<string, unknown>)[field.field] = null
  }
  try {
    // Prefer direct Dataverse Web API first, matching the inventory/task pattern.
    await updateLocal(recordId, normalizedPayload)
    return
  } catch {
    // fall back to runtime connector
  }

  await updateRuntime(recordId, normalizedPayload)
}

const CLIENT_PROFILE_SEARCH_MAX_RESULTS = 5000

function extractClientProfileRowIdFromSearchRow(row: any): string {
  const direct = normalizeGuidValue(row?.[CLIENT_PROFILE_PRIMARY_ID_FIELD] || row?.id || '')
  if (direct) return direct

  const entityId = String(row?.['@odata.id'] || row?.['@odata.editLink'] || '').trim()
  if (entityId) {
    const match = entityId.match(/\(([0-9a-fA-F-]{36})\)/)
    if (match?.[1]) return normalizeGuidValue(match[1])
  }

  const rawLookup = normalizeGuidValue(row?.[`_${CLIENT_PROFILE_PRIMARY_ID_FIELD}_value`] || '')
  if (rawLookup) return rawLookup

  return ''
}

export function mapClientProfileSearchRows(rows: any[]): ClientProfileSearchRecord[] {
  return rows.map((row) => ({
    id: extractClientProfileRowIdFromSearchRow(row),
    recordId: String(row.cmps_recordid || '').trim(),
    name: buildClientFullName(row.cmps_name, row.cmps_middlename, row.cmps_lastname),
    hmisId: String(row.cmps_hmisid || '').trim(),
    dateOfBirth: String(row.cmps_dateofbirth || '').trim(),
    primaryLanguage: decodeChoiceFieldValue('radio', FIELD_OPTION_OVERRIDES.cmps_primarylanguage || [], row.cmps_primarylanguage, row?.['cmps_primarylanguage@OData.Community.Display.V1.FormattedValue']),
    gender: decodeChoiceFieldValue('radio', FIELD_OPTION_OVERRIDES.cmps_gender || [], row.cmps_gender, row?.['cmps_gender@OData.Community.Display.V1.FormattedValue']),
    alertList: decodeChoiceFieldValue('radio', ['Yes', 'No'], row.cmps_alertlist, row?.['cmps_alertlist@OData.Community.Display.V1.FormattedValue']),
    alertListReason: String(row.cmps_alertlistreason || '').trim(),
  }))
}

function buildClientProfileSearchFilter(query: string): string {
  const cleaned = String(query || '').trim()
  if (!cleaned) return ''

  const escaped = escapeODataString(cleaned)
  const conditions = [
    `contains(cmps_recordid,'${escaped}')`,
    `contains(cmps_name,'${escaped}')`,
    `contains(cmps_middlename,'${escaped}')`,
    `contains(cmps_lastname,'${escaped}')`,
    `contains(cmps_hmisid,'${escaped}')`,
  ]
  const nameParts = cleaned.split(/\s+/).filter(Boolean)
  if (nameParts.length > 1) {
    conditions.push(`(${nameParts.map((part) => {
      const escapedPart = escapeODataString(part)
      return `(${['cmps_name', 'cmps_middlename', 'cmps_lastname'].map((column) => `contains(${column},'${escapedPart}')`).join(' or ')})`
    }).join(' and ')})`)
  }
  return conditions.join(' or ')
}

async function searchClientProfilesLocal(query: string, limit: number, skip = 0): Promise<ClientProfileSearchRecord[]> {
  const token = await ensureAuthToken()
  const orgUrl = await resolveRuntimeOrganizationUrl()
  if (!token || !orgUrl) throw new Error('Missing Dataverse connection info for local search.')

  const headers = new Headers()
  headers.set('Accept', 'application/json')
  headers.set('OData-Version', '4.0')
  headers.set('OData-MaxVersion', '4.0')
  headers.set('Authorization', `Bearer ${token}`)

  const select = [
    CLIENT_PROFILE_PRIMARY_ID_FIELD,
    'cmps_recordid',
    'cmps_name',
    'cmps_middlename',
    'cmps_lastname',
    'cmps_hmisid',
    'cmps_dateofbirth',
    'cmps_primarylanguage',
    'cmps_gender',
    'cmps_alertlist',
    'cmps_alertlistreason',
  ].join(',')

  const clauses = [
    `$select=${encodeURIComponent(select)}`,
    `$top=${Math.max(1, Math.min(CLIENT_PROFILE_SEARCH_MAX_RESULTS, limit))}`,
    `$orderby=${encodeURIComponent(`${CLIENT_PROFILE_PRIMARY_ID_FIELD} asc`)}`,
  ]
  if (skip > 0) clauses.push(`$skip=${Math.max(0, Math.floor(skip))}`)
  const filter = excludeArchived(buildClientProfileSearchFilter(query))
  clauses.push(`$filter=${encodeURIComponent(filter)}`)

  const url = `${orgUrl}/api/data/v9.2/${CLIENT_PROFILE_TABLE_ALIAS}?${clauses.join('&')}`
  const response = await fetch(url, {
    method: 'GET',
    credentials: 'include',
    headers,
  })

  if (!response.ok) throw new Error(await response.text())
  const payload = await response.json()
  return mapClientProfileSearchRows(rowsFromPayload(payload))
}

async function searchClientProfilesRuntime(query: string, limit: number, skip = 0): Promise<ClientProfileSearchRecord[]> {
  const orgUrl = await resolveRuntimeOrganizationUrl()
  const token = getAuthToken()
  if (!orgUrl) throw new Error('Dataverse organization URL could not be resolved for runtime search.')

  const clampedLimit = Math.max(1, Math.min(CLIENT_PROFILE_SEARCH_MAX_RESULTS, Math.floor(limit)))
  const clampedSkip = Math.max(0, Math.floor(skip))
  const effectiveTop = Math.max(1, Math.min(CLIENT_PROFILE_SEARCH_MAX_RESULTS, clampedLimit + clampedSkip))

  const result = await runtimeDataClient.executeAsync<any, any>({
    connectorOperation: {
      tableName: 'commondataserviceforapps',
      operationName: 'ListRecordsWithOrganization',
      parameters: {
        organization: orgUrl,
        entityName: CLIENT_PROFILE_TABLE_ALIAS,
        '$select': `${CLIENT_PROFILE_PRIMARY_ID_FIELD},cmps_recordid,cmps_name,cmps_middlename,cmps_lastname,cmps_hmisid,cmps_dateofbirth,cmps_primarylanguage,cmps_gender,cmps_alertlist,cmps_alertlistreason`,
        '$top': effectiveTop,
        '$orderby': `${CLIENT_PROFILE_PRIMARY_ID_FIELD} asc`,
        '$filter': excludeArchived(buildClientProfileSearchFilter(query)),
        ...(token ? { token } : {}),
      },
    },
  } as any)

  if (!result?.success) throw new Error(JSON.stringify(result || {}))
  const mapped = mapClientProfileSearchRows(rowsFromPayload(result.data))
  return clampedSkip > 0 ? mapped.slice(clampedSkip, clampedSkip + clampedLimit) : mapped.slice(0, clampedLimit)
}

export async function searchClientProfileRecords(query: string, limit = 25): Promise<ClientProfileSearchRecord[]> {
  try {
    return await searchClientProfilesLocal(query, limit)
  } catch {
    return searchClientProfilesRuntime(query, limit)
  }
}

function normalizeDuplicateDate(value: string): string {
  const text = String(value || '').trim()
  const isoMatch = text.match(/^\d{4}-\d{2}-\d{2}/)
  if (isoMatch) return isoMatch[0]

  const slashMatch = text.match(/^(\d{1,2})\/(\d{1,2})\/(\d{4})/)
  if (!slashMatch) return text
  return `${slashMatch[3]}-${String(Number(slashMatch[1])).padStart(2, '0')}-${String(Number(slashMatch[2])).padStart(2, '0')}`
}

function normalizeDuplicateText(value: string): string {
  return String(value || '').trim().replace(/\s+/g, ' ').toLowerCase()
}

export async function findClientProfileDuplicate(seed: ClientProfilePayload): Promise<ClientProfileSearchRecord | null> {
  const name = normalizeDuplicateText(seed.cmps_name || '')
  const dateOfBirth = normalizeDuplicateDate(seed.cmps_dateofbirth || '')
  const hmisId = normalizeDuplicateText(seed.cmps_hmisid || '')

  if (!name && !hmisId) return null

  const query = hmisId || name
  const candidates = await searchClientProfileRecords(query, 100)
  const exactHmisMatch = hmisId
    ? candidates.find((candidate) => normalizeDuplicateText(candidate.hmisId) === hmisId)
    : null
  if (exactHmisMatch) return exactHmisMatch

  if (!name || !dateOfBirth) return null

  return candidates.find((candidate) => {
    if (!candidate.hmisId) return false
    const candidateName = normalizeDuplicateText(candidate.name)
    const candidateFirstName = candidateName.split(' ')[0] || ''
    return (candidateName === name || candidateFirstName === name)
      && normalizeDuplicateDate(candidate.dateOfBirth) === dateOfBirth
  }) || null
}

export async function searchClientProfileRecordsPaged(
  query: string,
  page = 1,
  pageSize = 20,
): Promise<ClientProfileSearchPage> {
  const safePageSize = Math.max(1, Math.min(CLIENT_PROFILE_SEARCH_MAX_RESULTS, Math.floor(pageSize)))
  const safePage = Math.max(1, Math.floor(page))
  const skip = (safePage - 1) * safePageSize
  const requestLimit = Math.min(CLIENT_PROFILE_SEARCH_MAX_RESULTS, safePageSize + 1)

  let rows: ClientProfileSearchRecord[] = []
  try {
    rows = await searchClientProfilesLocal(query, requestLimit, skip)
  } catch {
    rows = await searchClientProfilesRuntime(query, requestLimit, skip)
  }

  const hasNext = rows.length > safePageSize
  return {
    rows: hasNext ? rows.slice(0, safePageSize) : rows,
    hasNext,
  }
}

function mapClientProfileDetailRow(row: any): ClientProfileDetailRecord {
  const values: Partial<Record<ClientProfileFieldName, string>> = {}
  CLIENT_PROFILE_FIELD_NAMES.forEach((field) => {
    const fieldDef = CLIENT_PROFILE_FIELD_DEF_BY_NAME.get(field)
    const rawValue = row?.[field]
    if (!fieldDef) {
      values[field] = String(rawValue || '').trim()
      return
    }

    const formattedValue = row?.[`${field}@OData.Community.Display.V1.FormattedValue`]
    const decodeInput: ClientProfileFieldInput = field === 'cmps_assignedprograms'
      ? 'checkbox-group'
      : field === 'cmps_isclientmultiracial'
        ? 'radio'
        : fieldDef.input
    values[field] = decodeChoiceFieldValue(decodeInput, fieldDef.options, rawValue, formattedValue)
    // Dataverse may still return the historical formatted program label.
    if (field === 'cmps_assignedprograms') values[field] = String(values[field] || '').replace(/\bCAAFA Outreach\b/gi, 'DV Outreach')
  })
  values.cmps_isclientmultiracial = deriveClientMultiRacialValue(values.cmps_race)

  const lookupDisplay = (base: string): string => {
    const formatted = row?.[`${base}@OData.Community.Display.V1.FormattedValue`]
    if (formatted) return String(formatted).trim()

    const lookupValue = row?.[`_${base}_value@OData.Community.Display.V1.FormattedValue`]
    if (lookupValue) return String(lookupValue).trim()

    const rawLookup = row?.[`_${base}_value`]
    if (rawLookup) return String(rawLookup).trim()

    const direct = row?.[base]
    if (direct) return String(direct).trim()

    return ''
  }

  const dateDisplay = (column: 'createdon' | 'modifiedon'): string => {
    const formatted = row?.[`${column}@OData.Community.Display.V1.FormattedValue`]
    if (formatted) return String(formatted).trim()
    return String(row?.[column] || '').trim()
  }

  const recordId = String(values.cmps_recordid || row?.cmps_recordid || '').trim()
  const createdby = String(row?.cmps_createdby || '').trim() || lookupDisplay('createdby')
  const createdon = dateDisplay('createdon')
  const modifiedon = dateDisplay('modifiedon')
  const modifiedby = String(row?.cmps_modifiedby || '').trim() || lookupDisplay('modifiedby')

  // Show Dataverse system metadata inside the existing capitalized slots in the UI.
  values.cmps_createdby = createdby || values.cmps_createdby || ''
  values.cmps_creationdate = createdon || values.cmps_creationdate || ''
  values.cmps_modifiedby = modifiedby || values.cmps_modifiedby || ''
  values.modifiedon = modifiedon || values.modifiedon || ''

  const hasStructuredAddress = [
    values.cmps_addressline1,
    values.cmps_addressline2,
    values.cmps_city,
    values.cmps_state,
    values.cmps_county,
    values.cmps_zip,
  ].some((entry) => String(entry || '').trim())

  if (!hasStructuredAddress) {
    const legacy = parseLegacyAddressParts(row?.cmps_previousaddress)
    values.cmps_addressline1 = values.cmps_addressline1 || legacy.line1
    values.cmps_addressline2 = values.cmps_addressline2 || legacy.line2
    values.cmps_city = values.cmps_city || legacy.city
    values.cmps_state = values.cmps_state || legacy.state
    values.cmps_county = values.cmps_county || legacy.county
    values.cmps_zip = values.cmps_zip || legacy.zip
  }

  return {
    id: normalizeGuidValue(row?.[CLIENT_PROFILE_PRIMARY_ID_FIELD] || row?.id || ''),
    recordId,
    values,
    systemColumns: {
      createdby,
      createdon,
      modifiedon,
      modifiedby,
    },
  }
}

async function loadClientProfileDetailLocal(rowId: string, recordIdHint = ''): Promise<ClientProfileDetailRecord> {
  const token = await ensureAuthToken()
  const orgUrl = await resolveRuntimeOrganizationUrl()
  if (!token || !orgUrl) throw new Error('Missing Dataverse connection info for local detail load.')

  const headers = new Headers()
  headers.set('Accept', 'application/json')
  headers.set('OData-Version', '4.0')
  headers.set('OData-MaxVersion', '4.0')
  headers.set('Authorization', `Bearer ${token}`)

  const cleanId = normalizeGuidValue(rowId)
  if (cleanId) {
    const response = await fetch(
      `${orgUrl}/api/data/v9.2/${CLIENT_PROFILE_TABLE_ALIAS}(${cleanId})?$select=${encodeURIComponent(CLIENT_PROFILE_SELECT_COLUMNS)}`,
      {
        method: 'GET',
        credentials: 'include',
        headers,
      },
    )

    if (response.ok) {
      const row = await response.json()
      return mapClientProfileDetailRow(row)
    }
  }

  const recordId = String(recordIdHint || '').trim()
  if (!recordId) throw new Error('Missing row id and record id for detail load.')

  const filter = `cmps_recordid eq '${escapeODataString(recordId)}'`
  const response = await fetch(
    `${orgUrl}/api/data/v9.2/${CLIENT_PROFILE_TABLE_ALIAS}?$select=${encodeURIComponent(CLIENT_PROFILE_SELECT_COLUMNS)}&$filter=${encodeURIComponent(filter)}&$top=1`,
    {
      method: 'GET',
      credentials: 'include',
      headers,
    },
  )

  if (!response.ok) throw new Error(await response.text())
  const payload = await response.json()
  const rows = rowsFromPayload(payload)
  if (rows.length === 0) throw new Error(`No Client Profile record found for Record ID ${recordId}.`)
  return mapClientProfileDetailRow(rows[0])
}

async function loadClientProfileDetailRuntime(rowId: string, recordIdHint = ''): Promise<ClientProfileDetailRecord> {
  const orgUrl = await resolveRuntimeOrganizationUrl()
  const token = getAuthToken()
  if (!orgUrl) throw new Error('Dataverse organization URL could not be resolved for runtime detail load.')

  const cleanId = normalizeGuidValue(rowId)

  if (cleanId) {
    const directResult = await runtimeDataClient.executeAsync<any, any>({
      connectorOperation: {
        tableName: 'commondataserviceforapps',
        operationName: 'GetItemWithOrganization',
        parameters: {
          prefer: 'odata.include-annotations="OData.Community.Display.V1.FormattedValue"',
          accept: 'application/json',
          organization: orgUrl,
          entityName: CLIENT_PROFILE_TABLE_ALIAS,
          recordId: cleanId,
          '$select': CLIENT_PROFILE_SELECT_COLUMNS,
          ...(token ? { token } : {}),
        },
      },
    } as any)

    if (directResult?.success) {
      return mapClientProfileDetailRow(directResult.data || {})
    }

    // Some connector/runtime combinations fail GetRecord for imported rows.
    // Fall back to ListRecords filtered by the primary key GUID.
    const byIdResult = await runtimeDataClient.executeAsync<any, any>({
      connectorOperation: {
        tableName: 'commondataserviceforapps',
        operationName: 'ListRecordsWithOrganization',
        parameters: {
          organization: orgUrl,
          entityName: CLIENT_PROFILE_TABLE_ALIAS,
          '$select': CLIENT_PROFILE_SELECT_COLUMNS,
          '$top': 1,
          '$filter': `${CLIENT_PROFILE_PRIMARY_ID_FIELD} eq ${cleanId}`,
          ...(token ? { token } : {}),
        },
      },
    } as any)

    if (byIdResult?.success) {
      const byIdRows = rowsFromPayload(byIdResult.data)
      if (byIdRows.length > 0) return mapClientProfileDetailRow(byIdRows[0])
    }
  }

  const cleanRecordId = String(recordIdHint || '').trim()
  const filter = cleanRecordId
    ? `cmps_recordid eq '${escapeODataString(cleanRecordId)}'`
    : ''

  // Never query with an empty filter here; otherwise $top=1 can incorrectly return
  // an unrelated "first" client profile when ID resolution fails.
  if (!filter) {
    if (cleanId) {
      throw new Error(`Unable to load Client Profile by row ID ${cleanId}.`)
    }
    throw new Error('Unable to load Client Profile: missing usable row ID and record ID.')
  }

  const result = await runtimeDataClient.executeAsync<any, any>({
    connectorOperation: {
      tableName: 'commondataserviceforapps',
      operationName: 'ListRecordsWithOrganization',
      parameters: {
        organization: orgUrl,
        entityName: CLIENT_PROFILE_TABLE_ALIAS,
        '$select': CLIENT_PROFILE_SELECT_COLUMNS,
        '$top': 1,
        ...(filter ? { '$filter': filter } : {}),
        ...(token ? { token } : {}),
      },
    },
  } as any)

  if (!result?.success) throw new Error(parseConnectorErrorMessage(result?.error || result))
  const rows = rowsFromPayload(result.data)

  if (rows.length > 0) return mapClientProfileDetailRow(rows[0])
  throw new Error(`No Client Profile record found for Record ID ${cleanRecordId || '(blank)'}.`)
}

export async function loadClientProfileDetailRecord(rowId: string, recordIdHint = ''): Promise<ClientProfileDetailRecord> {
  const cleanId = normalizeGuidValue(rowId)
  const cleanRecordId = String(recordIdHint || '').trim()
  if (!cleanId && !cleanRecordId) throw new Error('Missing client profile row id and record id for detail load.')

  try {
    return await loadClientProfileDetailLocal(cleanId, cleanRecordId)
  } catch {
    return loadClientProfileDetailRuntime(cleanId, cleanRecordId)
  }
}

