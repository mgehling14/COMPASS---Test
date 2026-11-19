import type { LegacyReport, ReportRow } from './reportTypes'

export const GLENDALE_ID = 'city-of-glendale-monthly-report'
export const isGlendaleReport = (report: LegacyReport) => report.id === GLENDALE_ID
export const GLENDALE_REQUIREMENTS: Record<string, string[]> = {
  Client_Profile: ['document_id', 'dob', 'race', 'ethnicity', 'gender', 'disability'],
  ProgramEnrollment: ['RecordID', 'Program', 'ServiceStartDate', 'ServiceEndDate', 'EnrollmentStatus', 'ProgramType'],
  Services: ['RecordID', 'DateofService'],
  BedEnrollment: ['RecordID', 'CheckInDate', 'CheckOutDate'],
  Household: ['RecordID', 'MemberCount'],
  HouseholdHistory: ['RecordID', 'Status', 'RelationshipToHoH'],
}
const people = ['Client_Profile', 'ProgramEnrollment', 'Services']
const households = [...people, 'Household', 'HouseholdHistory']
const period = ['Month', 'PeriodStart', 'PeriodEnd', 'FiscalYear']
const demographics = [...period, 'Demographic', 'Category', 'Count', 'NonHispanic', 'Hispanic', 'EthnicityUnknown']
export const GLENDALE_SECTIONS = [
  { name: 'Glendale_Individuals', title: '1. Individuals Served', description: 'Every qualifying person is counted individually, including household members. First eligible count in the July-June year, across programs, with one DV Outreach transfer exception. This is not a count of all continuing clients each month.', tables: people, columns: [...period, 'IndividualsServed', 'FiscalYearToDate'] },
  { name: 'Glendale_Households', title: '2. Households Served', description: 'Separate count of households with at least two current eligible active members. The earliest qualifying Faith House person count establishes the household count month for that fiscal year. Current membership snapshot, not historical composition.', tables: households, columns: [...period, 'HouseholdsServed', 'FiscalYearToDate'] },
  { name: 'Glendale_IndividualDemographics', title: '3. Individual Demographics', description: 'Demographics of the people counted in section 1. Race is one mutually exclusive template category per person, split by Hispanic ethnicity. Unknown values remain visible.', tables: people, columns: demographics },
  { name: 'Glendale_HouseholdDemographics', title: '4. Household Demographics (Head of Household Only)', description: 'One demographic contribution per counted household, using only its current verified Self/Head of Household member. Other household members do not contribute demographics here. Missing/conflicting heads remain Unknown and are flagged.', tables: households, columns: demographics },
  { name: 'Glendale_BedNights', title: '5. Faith House Bed Nights', description: 'All eligible Faith House bed-enrollment stays, independent of first-year person counts. Check-in included; checkout and current unfinished night excluded. Each stay counts once, not once per selected physical bed; overlaps are flagged.', tables: ['Client_Profile', 'ProgramEnrollment', 'BedEnrollment'], columns: [...period, 'BedNights'] },
  { name: 'Glendale_DataNeeds', title: '6. Template Items Requiring Other Data', description: 'Unavailable measures and manual-completion items are identified, not shown as zero. Historical contracts, budgets, contact details and narratives are not reused.', tables: [], columns: ['Item', 'Status', 'NextStep'] },
] as const
export const GLENDALE_REPORT: LegacyReport = {
  id: GLENDALE_ID, title: 'City of Glendale Monthly Report - Faith House Shelter', sourceFile: 'FY 24-25 Reimbursement and Perf Measures Template_A New Leaf_FH_July 2025.xlsx / PERFORM REPORT',
  parameters: [
    { name: 'ReportPeriodStart', type: 'DateTime', prompt: 'Report Period Start', hidden: false, values: [] },
    { name: 'ReportPeriodEnd', type: 'DateTime', prompt: 'Report Period End', hidden: false, values: [] },
  ],
  datasets: GLENDALE_SECTIONS.map((section) => ({ name: section.name, sql: '', sourceSql: '', dependencies: [], requirements: Object.fromEntries(section.tables.map((table) => [table, GLENDALE_REQUIREMENTS[table]])), filters: [], fields: section.columns.map((name) => ({ name, source: name, expression: '' })) })),
  items: [],
}
export function planGlendaleReport() {
  return { required: GLENDALE_REQUIREMENTS, datasets: Object.fromEntries(GLENDALE_SECTIONS.map((section) => [section.name, { tables: [...section.tables], unavailable: '' }])) }
}
export const GLENDALE_DATA_NEEDS: ReportRow[] = [
  { Item: 'HUD income bands: 0-30%, 31-50%, 51-80%, 81%+', Status: 'Unavailable - not mapped', NextStep: 'Provide verified household income, household size, and applicable HUD area-median-income limits/effective dates, or a verified HUD-income category. Program Enrollment FPL bands cannot substitute for HUD AMI. The 2024 limits in the template are not assumed current.' },
  { Item: 'Reimbursement budget / cost allocation / payroll allocation', Status: 'Manual completion - no financial source mapped', NextStep: 'Use approved current grant budgets, expense records and payroll allocations. No reimbursement or budget amount is inferred from services or bed nights.' },
  { Item: 'Activity narrative and organization/contract/contact details', Status: 'Manual completion', NextStep: 'Prepare current-period narrative and verify current contract, grant code, IDIS number, preparer and reviewer. Historical template values are not copied.' },
  { Item: 'Historical household composition', Status: 'Current membership snapshot approved', NextStep: 'Household History lacks membership start/end dates. Household counts and head demographics use current active membership as of the report run, even for past months; reruns can change after membership edits.' },
  { Item: 'Race/ethnicity and disability completeness', Status: 'Unknown values retained', NextStep: 'Unknown race/ethnicity is shown explicitly rather than forced into a valid HUD category. Empty disability selections are Unknown, not No. Review Unknown rows before submitting the template.' },
]
