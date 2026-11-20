import { PROFILE_SOURCES } from './wave2ProfileSources'
import type { Wave2Program, PreviewMode } from './wave2PreviewModel'

export type ProfileValues = Record<string, string | string[]>
export type ProfileField = { key: string; label: string; source: string; section: string; input: 'text' | 'email' | 'tel' | 'date' | 'select' | 'checks' | 'textarea' | 'password'; programs: readonly Wave2Program[]; options?: readonly string[]; required?: readonly Wave2Program[]; when?: (v: ProfileValues) => boolean; note?: string; provisional?: boolean; disabled?: boolean }
export const ALL_PROFILE_PROGRAMS: Wave2Program[] = ['cap', 'ato', 'workforce', 'ged', 'financial-wellness']
const coreRequired: Wave2Program[] = ['cap', 'workforce', 'ged', 'financial-wellness']
export const MISSING_RESPONSES = ["Client Doesn't Know", 'Client Refused', 'Data not collected']
export const SSN_KNOWN_OPTIONS = ['Full SSN', 'Approximate or partial SSN reported', ...MISSING_RESPONSES]
export const DOB_KNOWN_OPTIONS = ['Full DOB', 'Approximate or partial DOB reported', ...MISSING_RESPONSES]
const yesNo = ['Yes', 'No']
export const EDUCATION_OPTIONS = ['No schooling completed', 'Nursery school (pre-school)', 'Grades 0 - 8', 'Grades 9 - 12 / no diploma', 'Regular high school diploma', 'GED or alternative credential', 'Some college credit, no degree', 'Vocational or trade school certification', 'Associates degree', 'Bachelors degree', 'Masters degree', 'Professional degree beyond bachelors degree', 'Doctorate degree', 'Certificate of Advanced Learning', 'Skilled Artisan', ...MISSING_RESPONSES]
export const ATO_REPORTING_OPTIONS = [
  'You are 16 or older and have earned income (regardless of who you are living with), you are considered your own household.',
  'You are 16 or older, do not have earned income and are living with parents/guardians or other working adults.',
]
export const INDUSTRY_OPTIONS = ['Architecture and Engineering', 'Arts, Design, Entertainment, Sports, and Media', 'Building and Grounds Cleaning and Maintenance', 'Business and Financial Operations', 'Community and Social Services', 'Computer and Mathematical', 'Construction and Extraction', 'Customer Service', 'Education, Training and Library', 'Farming, Fishing and Forestry', 'Finance and Accounting', 'Food Preparation and Serving Related', 'Government', 'Healthcare Practitioners and Technical', 'Healthcare Support', 'Hotel/Hospitality', 'Legal', 'Life, Physical and Social Sciences', 'Management', 'Office and Administrative Support', 'Personal Care and Service', 'Production and Operating Workers', 'Protective Service', 'Sales and Related', 'Supervisors of Installation, Maintenance and Repair', 'Technology', 'Transportation and Material Moving']
const sourceProgram: Record<string, Wave2Program> = { CAP: 'cap', ATO: 'ato', Workforce: 'workforce', GED: 'ged', 'Financial Wellness': 'financial-wellness' }
export const profileText = (v: ProfileValues, key: string) => typeof v[key] === 'string' ? v[key] as string : ''
export const profileList = (v: ProfileValues, key: string) => Array.isArray(v[key]) ? v[key] as string[] : []
function f(source: string, key: string, label: string, section: string, input: ProfileField['input'] = 'text', extra: Partial<ProfileField> = {}): ProfileField {
  const metadata = PROFILE_SOURCES.find(s => s.id === source)
  return { source, key, label, section, input, programs: metadata?.programs.map(p => sourceProgram[p]) || ALL_PROFILE_PROGRAMS, provisional: metadata?.basis.startsWith('Inferred') || false, ...extra }
}
function address(source: string, prefix: string, label: string, section: string, programs: readonly Wave2Program[], when?: ProfileField['when']): ProfileField[] {
  return [f(source, prefix + 'Line1', label + ' line 1', section, 'text', { programs, when }), f(source, prefix + 'Line2', label + ' line 2', section, 'text', { programs, when }), f(source, prefix + 'City', label + ' city', section, 'text', { programs, when }), f(source, prefix + 'State', label + ' state', section, 'text', { programs, when, note: 'Use a two-letter state abbreviation when supplied.' }), f(source, prefix + 'County', label + ' county', section, 'text', { programs, when }), f(source, prefix + 'Zip', label + ' ZIP', section, 'text', { programs, when })]
}
const workforce = ['workforce'] as const
const cap = ['cap'] as const
const educationPrograms = ['ato', 'ged', 'workforce'] as const
const isYes = (key: string) => (v: ProfileValues) => profileText(v, key) === 'Yes'
export const PROFILE_FIELDS: ProfileField[] = [
  f('COMPASS:cmps_namedataquality', 'nameQuality', 'Name data quality', 'Identity', 'select', { options: ['Full Name Reported', 'Partial, street name, or code name reported', 'Unknown/Not Reported', 'Anonymous Profile'], required: ALL_PROFILE_PROGRAMS, note: 'Reuses the current COMPASS name-quality concept; no new Apricot ID.' }),
  f('5384', 'firstName', 'First name', 'Identity'), f('5384', 'middleName', 'Middle name', 'Identity'), f('5384', 'lastName', 'Last name', 'Identity'),
  f('5385', 'preferredFirst', 'Preferred first name', 'Identity'), f('5385', 'preferredMiddle', 'Preferred middle name', 'Identity'), f('5385', 'preferredLast', 'Preferred last name', 'Identity'),
  f('5403', 'ssnKnown', 'SSN Known?', 'Identity', 'select', { options: SSN_KNOWN_OPTIONS, required: ALL_PROFILE_PROGRAMS }),
  f('5386', 'ssn', 'Social Security Number', 'Identity', 'password', { when: v => ['Full SSN', 'Approximate or partial SSN reported'].includes(profileText(v, 'ssnKnown')), note: 'Full SSN requires nine digits. Partial reporting never requires a full SSN; hidden values are retained only in this draft.' }),
  f('5404', 'dobKnown', 'DOB Known?', 'Identity', 'select', { options: DOB_KNOWN_OPTIONS, required: ALL_PROFILE_PROGRAMS }),
  f('5387', 'birthDate', 'Date of birth', 'Identity', 'date', { when: v => ['Full DOB', 'Approximate or partial DOB reported'].includes(profileText(v, 'dobKnown')) }),
  f('5387', 'birthYear', 'Birth year (approximate)', 'Identity', 'text', { when: v => profileText(v, 'dobKnown') === 'Approximate or partial DOB reported', note: 'Year-only precision is kept separately. No January 1 proxy date is invented.', provisional: true }),
  f('5389', 'homePhone', 'Home phone', 'Contact'), f('5388', 'email', 'Email', 'Contact', 'email'), f('5390', 'cellPhone', 'Cell phone', 'Contact', 'tel'),
  f('5391', 'workPhone', 'Work phone', 'Contact', 'tel'),
  f('7613', 'contactAllowed', 'OK to contact?', 'Contact', 'select', { options: yesNo, note: 'Optional: preferred-contact requiredness is not approved.' }),
  f('7614', 'contactMethods', 'Preferred contact method', 'Contact', 'checks', { options: ['Email', 'Home Phone (Call)', 'Work Phone (Call)', 'Work Phone (Text)', 'Cell Phone (Call)', 'Cell Phone (Text)'], when: isYes('contactAllowed') }),
  f('5402', 'residency', 'Residency status', 'Background', 'select', { programs: ['cap', 'ato', 'workforce', 'ged'], required: ['cap', 'workforce'], options: ['U.S. Citizen', 'Legal Resident', 'Legal Alien', 'Immigrant', 'Refugee', 'Asylum Seeker', 'Unknown/Not Reported'], note: 'Required in CAP/Workforce; optional in ATO/GED. Workforce and GED scope comes from narration despite missing flags.' }),
  f('dbo:uscis_nbr', 'uscisNumber', 'USCIS number', 'Background', 'text', { programs: workforce, when: v => !!profileText(v, 'residency') && !['U.S. Citizen', 'Unknown/Not Reported'].includes(profileText(v, 'residency')), note: 'Optional. Source dbo column uscis_nbr has no verified Apricot field ID; physical mapping deferred.', provisional: true }),
  f('5398', 'language', 'Preferred language', 'Background', 'select', { required: cap, options: ['English', 'Spanish', 'French', 'Unknown/Not Reported', 'Other'] }),
  f('5400', 'maritalStatus', 'Marital status (reported)', 'Background', 'text', { note: 'Choice vocabulary not supplied; optional verbatim preview value.', provisional: true }),
  f('5399', 'leafEmployee', 'Are you and/or a family member an ANL employee?', 'Background', 'select', { options: ['No, neither I nor anyone in my family is a Leaf employee', 'Yes, I am a Leaf employee', 'Yes, someone in my family is a Leaf employee', 'Yes, both myself and someone in my family is a Leaf employee'], provisional: true }),
  f('5401', 'familyEmployeeName', 'Name of family member', 'Background', 'text', { when: v => profileText(v, 'leafEmployee').startsWith('Yes') && profileText(v, 'leafEmployee').includes('family') }),
  f('5395', 'insurance', 'Type of insurance (reported)', 'Background', 'text', { programs: ['cap', 'ato', 'ged'], required: cap, note: 'CAP requires an answer; ATO/GED do not. Widget/choice vocabulary is provisional; record the reported answer verbatim.', provisional: true }),
  f('8345', 'ahcccs', 'AHCCCS ID', 'Background'),
  f('5405', 'foodBenefits', 'Do you receive SNAP or TANF?', 'Background', 'select', { options: yesNo }),
  f('5406', 'snapCase', 'Food Stamps (SNAP) case number', 'Background', 'text', { when: isYes('foodBenefits'), note: 'Identifier kept as text to preserve leading zeros.', provisional: true }),
  f('5396', 'birthPlace', 'Place of birth (reported)', 'Background', 'textarea', { note: 'Compound source address retained as a verbatim preview value; exact component metadata pending.', provisional: true }),
  f('5397', 'householdRelationship', 'Relationship to applicant / head of household', 'Background', 'select', { required: coreRequired, options: ['Self', 'Spouse/Partner', 'Family/Friend', 'Roommate', 'Child of HOH', 'Other'] }),
  ...address('5431', 'address', 'Current address', 'Address', ALL_PROFILE_PROGRAMS).map(field => ({ ...field, required: ['addressCity', 'addressZip'].includes(field.key) ? coreRequired : ['addressLine1', 'addressState'].includes(field.key) ? cap : undefined })),
  f('5432', 'countyDate', 'Date in county', 'Address', 'date', { required: cap }),
  f('7626', 'facility', 'Facility name', 'Address'),
  f('7627', 'mailingSame', 'Is the mailing address the same as the current address?', 'Address', 'select', { options: yesNo }),
  ...address('7628', 'mailing', 'Mailing address', 'Address', workforce, v => profileText(v, 'mailingSame') === 'No'),
  f('7629', 'mailFacility', 'Mailing facility name', 'Address', 'text', { when: v => profileText(v, 'mailingSame') === 'No', provisional: true }),
  ...address('9763', 'permanent', 'Last permanent address', 'Housing history', workforce),
  f('5429', 'homebound', 'Are you homebound?', 'Housing history', 'select', { options: yesNo }),
  f('5423', 'immigrantFarmWorker', 'Are you an immigrant farm worker?', 'Housing history', 'select', { options: yesNo }),
  f('5424', 'seasonalFarmWorker', 'Are you a seasonal farm worker?', 'Housing history', 'select', { options: yesNo }),
  f('5430', 'disability', 'Disability', 'Demographics', 'select', { required: coreRequired, options: ['Yes', 'No disability', 'Unknown/Not Reported'], note: 'Separate from Type of Disability. Source checkbox choices are mutually exclusive; this preview uses one answer.', provisional: true }),
  f('8344', 'disabilityType', 'Type of disability', 'Demographics', 'text', { when: v => profileText(v, 'disability') === 'Yes', disabled: true, note: 'Sensitive detailed vocabulary awaits review; new collection is disabled.', provisional: true }),
  f('5425', 'race', 'Race (up to five)', 'Demographics', 'checks', { required: coreRequired, options: ['American Indian or Alaska Native', 'Asian', 'Black or African American', 'Native Hawaiian or Pacific Islander', 'White', ...MISSING_RESPONSES] }),
  f('5427', 'ethnicity', 'Ethnicity', 'Demographics', 'select', { required: coreRequired, options: ['Non-Hispanic/Non-Latin(a)(o)(x)', 'Hispanic/Latin(a)(o)(x)', 'Unknown/Not Reported', 'Client Refused', 'Data not collected'], note: 'Shared COMPASS choices plus explicit missing-response states; final program vocabulary needs review.', provisional: true }),
  f('5413', 'gender', 'Current gender', 'Demographics', 'select', { required: coreRequired, options: ['Male', 'Female', 'Undifferentiated', 'Unknown'] }),
  f('5417', 'lgbtq', 'Is the client in the LGBTQ+ community?', 'Demographics', 'select', { required: coreRequired, options: ['Yes', 'No', 'Data not collected'] }),
  f('5419', 'military', 'Veteran / military status', 'Military', 'select', { required: coreRequired, options: ['Veteran', 'Active Military', 'Not a Veteran', ...MISSING_RESPONSES], note: 'Veteran/military status remains distinct from the current binary US-veteran mapping; missing-response states are explicit.', provisional: true }),
  ...[['7621', 'militaryBranches', 'Military branches served', 'text'], ['7622', 'enlisted', 'Enlistment date', 'date'], ['7623', 'militaryEras', 'Military service eras served', 'text'], ['7624', 'dischargeType', 'Discharge type (reported)', 'text'], ['7625', 'discharged', 'Discharge date', 'date']].map(([id, key, label, input]) => f(id, key, label, 'Military', input as ProfileField['input'], { when: v => ['Veteran', 'Active Military'].includes(profileText(v, 'military')) })),
  f('7988', 'atoReporting', 'Check 1 that applies', 'Education', 'select', { required: ['ato'], options: ATO_REPORTING_OPTIONS, note: 'Distinct from Client Type. Shared source choices are visible at CAP 14:35; ATO-specific vocabulary approval remains pending. No eligibility is inferred.', provisional: true }),
  f('5418', 'studentStatus', 'Student status (reported)', 'Education', 'text', { required: ['ato'], note: 'Required ATO answer; dropdown choices were not captured. Verbatim entry is provisional.', provisional: true }),
  f('5420', 'education', 'Education level', 'Education', 'select', { programs: educationPrograms, required: ['ato', 'workforce'], options: EDUCATION_OPTIONS, note: 'GED optional; Workforce scope/requiredness comes from narration. Observed GED dropdown choices retained.', provisional: true }),
  f('5811', 'workingSchool', 'Is this person working and/or in school?', 'Education', 'select', { programs: ['ato', 'workforce'], required: ['ato'], options: yesNo }),
  f('9782', 'attendanceMode', 'Do you attend school online or in-person?', 'Education', 'select', { options: ['Online', 'In-person'], note: 'Optional. No additional school fields are hidden based on this answer; the source did not prove that condition.' }),
  f('7982', 'highSchool', 'High school attended / attending', 'Education'), f('7983', 'college', 'College attended / attending / planning', 'Education'), f('9780', 'otherSchool', 'Preschool, elementary or middle school', 'Education'),
  f('7986', 'highSchoolGraduation', 'High school expected graduation date', 'Education', 'date'), f('7984', 'major', 'Current / future major', 'Education'), f('7985', 'collegeGraduation', 'College expected graduation date', 'Education', 'date'), f('7987', 'studyAbroad', 'Study abroad location', 'Education'), f('9783', 'schedule', 'Class schedule', 'Education', 'textarea'), f('9785', 'schoolGuardian', 'Parent / guardian on file at school', 'Education'), f('9784', 'schoolPhone', 'School contact phone', 'Education', 'tel'),
  ...address('9781', 'school', 'School address', 'Education', ['ato']),
  ...[1, 2, 3].flatMap((n, i) => [f(String(7655 + i), `emergency${n}Name`, `Emergency contact ${n} name`, 'Emergency contacts'), f(String(7658 + i), `emergency${n}Phone`, `Emergency contact ${n} phone`, 'Emergency contacts', 'tel'), f(String(7661 + i), `emergency${n}Relationship`, `Emergency contact ${n} relationship (reported)`, 'Emergency contacts', 'text', { note: 'Optional; relationship vocabulary/compound metadata remains provisional.', provisional: true })]),
  f('7191', 'banked', 'Are you currently banked?', 'Banking', 'select', { options: yesNo, note: 'Optional: no new universal banking requirement.' }),
  f('7192', 'accounts', 'Type of banking accounts', 'Banking', 'checks', { options: ['Checking', 'Savings', 'Certificate of Deposit (CD)', 'Money Market Account (MMA)', 'Other Investment Account', 'None', 'Other'], when: isYes('banked'), note: 'Optional observed choices; continued collection needs owner confirmation.', provisional: true }),
  f('7193', 'banks', 'Where do you do banking? (reported)', 'Banking', 'textarea', { when: isYes('banked'), note: 'Optional provisional verbatim institutions; final bank list/retention not approved.', provisional: true }),
  f('7640', 'felony', 'Were you ever convicted of a felony?', 'Justice screening', 'select', { required: workforce, options: yesNo }),
  f('9766', 'misdemeanor', 'Were you ever convicted of a misdemeanor?', 'Justice screening', 'select', { required: workforce, options: yesNo }),
  f('7641', 'convictions', 'Type of convictions (reported)', 'Justice screening', 'textarea', { when: v => profileText(v, 'felony') === 'Yes' || profileText(v, 'misdemeanor') === 'Yes', note: 'Optional; exact multi-select vocabulary pending. Verbatim preview only.', provisional: true }),
  f('9767', 'warrants', 'Current / active warrants?', 'Justice screening', 'select', { options: ['Yes', 'No', 'Unsure'] }),
  f('9768', 'protection', 'Order of protection against you or someone else?', 'Justice screening', 'select', { options: yesNo }),
  f('7686', 'reentry', 'Re-entry client?', 'Justice screening', 'select', { options: yesNo }),
  f('7642', 'releaseDate', 'Date of release', 'Justice screening', 'date', { when: isYes('reentry'), required: workforce }),
  f('7643', 'adcNumber', 'Arizona Department of Corrections number', 'Justice screening', 'text', { when: isYes('reentry') }), f('7758', 'bopNumber', 'Bureau of Prisons number', 'Justice screening', 'text', { when: isYes('reentry') }), f('7759', 'mcsoNumber', 'Maricopa County Sheriff number', 'Justice screening', 'text', { when: isYes('reentry') }),
  f('7644', 'probation', 'Currently on probation?', 'Justice screening', 'select', { options: yesNo }),
  f('7687', 'lifetimeProbation', 'Lifetime probation?', 'Justice screening', 'select', { when: isYes('probation'), options: yesNo, required: workforce }),
  f('7645', 'probationEnd', 'Probation end date', 'Justice screening', 'date', { when: v => profileText(v, 'probation') === 'Yes' && profileText(v, 'lifetimeProbation') === 'No', required: workforce }),
  f('7646', 'probationOfficer', 'Probation officer name', 'Justice screening', 'text', { when: isYes('probation') }), f('7647', 'probationPhone', 'Probation officer phone', 'Justice screening', 'tel', { when: isYes('probation') }),
  f('7648', 'parole', 'Currently on parole?', 'Justice screening', 'select', { options: yesNo }),
  f('7649', 'paroleEnd', 'Parole end date', 'Justice screening', 'date', { when: isYes('parole'), required: workforce }),
  f('7650', 'paroleOfficer', 'Parole officer name', 'Justice screening', 'text', { when: isYes('parole') }), f('7651', 'parolePhone', 'Parole officer phone', 'Justice screening', 'tel', { when: isYes('parole') }),
  f('7666', 'experience', 'Experience and training', 'Industry snapshot', 'checks', { options: INDUSTRY_OPTIONS, note: 'Optional observed industry vocabulary. Detailed Job Match assessment belongs to prompt 27.', provisional: true }),
  f('7667', 'jobPreferences', 'Job preferences', 'Industry snapshot', 'checks', { options: INDUSTRY_OPTIONS, provisional: true }),
]
export const UNCONFIRMED_WORKFORCE_FIELDS = ['7618', '7630', '7631', '7632', '7633', '7685', '7635', '7636', '7637', '7638', '9765', '9764']
export function visibleProfileFields(program: Wave2Program, values: ProfileValues) { return PROFILE_FIELDS.filter(f => f.programs.includes(program) && (!f.when || f.when(values))) }
export function requiredProfileField(field: ProfileField, program: Wave2Program, values: ProfileValues) {
  if (field.disabled || !field.programs.includes(program) || field.when && !field.when(values)) return false
  if (field.key === 'firstName') return profileText(values, 'nameQuality') === 'Full Name Reported'
  if (field.key === 'ssn') return profileText(values, 'ssnKnown') === 'Full SSN'
  if (field.key === 'birthDate') return profileText(values, 'dobKnown') === 'Full DOB'
  return !!field.required?.includes(program)
}
export function multiRacial(values: ProfileValues) {
  const race = profileList(values, 'race').filter(r => !MISSING_RESPONSES.includes(r))
  return race.length ? race.length > 1 ? 'Yes' : 'No' : 'Not calculated'
}
const validDate = (value: string) => { const date = new Date(value + 'T00:00:00Z'); return /^\d{4}-\d{2}-\d{2}$/.test(value) && Number.isFinite(date.getTime()) && date.toISOString().slice(0, 10) === value }
export function validateProfile(values: ProfileValues, program: Wave2Program, today = new Date().toISOString().slice(0, 10)) {
  const errors: Record<string, string> = {}
  for (const field of visibleProfileFields(program, values).filter(f => !f.disabled)) {
    const raw = values[field.key], value = profileText(values, field.key).trim(), list = profileList(values, field.key)
    if (requiredProfileField(field, program, values) && !(Array.isArray(raw) ? list.length : value)) errors[field.key] = `${field.label} is required for this context.`
    if (field.input === 'checks' && list.some(choice => !field.options?.includes(choice))) errors[field.key] = 'Choose from the listed preview answers.'
    if (!value) continue
    if (field.input === 'select' && !field.options?.includes(value)) errors[field.key] = 'Choose from the listed preview answers.'
    if (field.input === 'date' && !validDate(value)) errors[field.key] = 'Enter a valid calendar date.'
    if (field.input === 'email' && !/^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(value)) errors[field.key] = 'Enter a valid email address.'
    if (field.input === 'tel' || field.key === 'homePhone') { const digits = value.replace(/(?:ext\.?|x)\s*\d+$/i, '').replace(/\D/g, ''); if (digits.length < 7 || digits.length > 15) errors[field.key] = 'Enter a phone number with 7–15 digits, with an optional extension.' }
    if (field.key.endsWith('Zip') && !/^\d{5}(?:-\d{4})?$/.test(value)) errors[field.key] = 'Enter a five-digit ZIP or ZIP+4.'
    if (field.key.endsWith('State') && !/^[A-Za-z]{2}$/.test(value)) errors[field.key] = 'Use a two-letter state abbreviation.'
    if (value.length > 1000) errors[field.key] = 'Keep this preview value to 1,000 characters.'
  }
  const nameQuality = profileText(values, 'nameQuality')
  if (nameQuality === 'Partial, street name, or code name reported' && !['firstName', 'middleName', 'lastName'].some(k => profileText(values, k).trim())) errors.firstName = 'Enter at least one reported name part, or choose an explicit unknown/anonymous state.'
  const ssn = profileText(values, 'ssn')
  if (profileText(values, 'ssnKnown') === 'Full SSN' && ssn && (!/^[\d\s-]+$/.test(ssn) || ssn.replace(/\D/g, '').length !== 9)) errors.ssn = 'Full SSN requires nine digits; select partial reporting if only part is known.'
  if (profileText(values, 'ssnKnown') === 'Approximate or partial SSN reported' && ssn && (!/^[\dXx*\s-]+$/.test(ssn) || ssn.replace(/\D/g, '').length > 9)) errors.ssn = 'Use reported digits and optional X/* masking; a full SSN is not required.'
  const dobKnown = profileText(values, 'dobKnown'), date = profileText(values, 'birthDate'), year = profileText(values, 'birthYear')
  if (dobKnown === 'Approximate or partial DOB reported') {
    if (!date && !year) errors.birthYear = 'Enter a reported approximate date or birth year.'
    if (year && (!/^\d{4}$/.test(year) || Number(year) < 1 || Number(year) > Number(today.slice(0, 4)))) errors.birthYear = 'Enter a valid birth year, not a future year.'
    if (date && year && date.slice(0, 4) !== year) errors.birthYear = 'Birth year and approximate date must agree.'
  }
  if (['Full DOB', 'Approximate or partial DOB reported'].includes(dobKnown) && date && date > today) errors.birthDate = 'Date of birth cannot be in the future.'
  const race = profileList(values, 'race')
  if (race.length > 5) errors.race = 'Select at most five race choices.'
  if (race.some(r => MISSING_RESPONSES.includes(r)) && race.length > 1) errors.race = 'A missing-response state must stand alone.'
  if (profileList(values, 'accounts').includes('None') && profileList(values, 'accounts').length > 1 && profileText(values, 'banked') === 'Yes' && program === 'financial-wellness') errors.accounts = 'None cannot be combined with account types.'
  return errors
}
export function blankProfile(): ProfileValues { return {} }
export function exampleProfile(id = 'sample-alex'): ProfileValues {
  return { nameQuality: 'Full Name Reported', firstName: id === 'sample-jordan' ? 'Jordan' : 'Alex', lastName: id === 'sample-jordan' ? 'Example' : 'Sample', ssnKnown: 'Data not collected', dobKnown: 'Data not collected', residency: 'U.S. Citizen', language: 'English', insurance: 'Unknown / not reported (synthetic example)', householdRelationship: 'Self', addressLine1: '100 Example Street', addressLine2: 'Unit Demo', addressCity: 'Mesa', addressState: 'AZ', addressCounty: 'Maricopa', addressZip: '85201', countyDate: '2026-01-01', disability: 'Unknown/Not Reported', race: ["Client Doesn't Know"], ethnicity: 'Unknown/Not Reported', gender: 'Unknown', lgbtq: 'Data not collected', military: 'Data not collected', atoReporting: ATO_REPORTING_OPTIONS[0], workingSchool: 'No', studentStatus: 'Not currently a student (reported synthetic example)', education: "Client Doesn't Know", felony: 'No', misdemeanor: 'No' }
}
export type ProfileSession = { selectedId: string; values: Record<string, ProfileValues>; baseline: Record<string, ProfileValues> }
export function createProfileSession(mode: PreviewMode = 'new'): ProfileSession {
  const values = { 'new-profile': blankProfile(), 'sample-alex': exampleProfile(), 'sample-jordan': exampleProfile('sample-jordan') }
  return { selectedId: mode === 'new' ? 'new-profile' : 'sample-alex', values, baseline: structuredClone(values) }
}
export const profileSessionDirty = (session: ProfileSession) => JSON.stringify(session.values) !== JSON.stringify(session.baseline)
export const profileSourceLabel = (id: string) => id.includes(':') ? id : `107:${id}`
