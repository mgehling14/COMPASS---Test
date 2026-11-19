import type { LegacyReport, ReportItem } from './reportTypes'
import type { ReportPlan } from './reportPlan'

export const NATIVE_DES_DV_ID = 'des-dv-monthly-report-exhibit-e-v26-0'
export const isNativeDesDvReport = (report: LegacyReport) => report.id === NATIVE_DES_DV_ID
export type NativeDesDvOptions = { outreachCountDate: 'service' | 'enrollment'; allowClientTypeFallback: boolean }
export const DEFAULT_NATIVE_DES_DV_OPTIONS: NativeDesDvOptions = {
  outreachCountDate: 'service', allowClientTypeFallback: true,
}
const core: Record<string, string[]> = {
  Client_Profile: ['document_id', 'first_name', 'last_name', 'dob'],
  ProgramEnrollment: ['RecordID', 'Program', 'ProgramType', 'ServiceStartDate', 'ServiceEndDate', 'EnrollmentStatus', 'ClientType', 'TANFEligible', 'ReasonTurnedAway', 'SafeLoc'],
}
const serviceFields = ['RecordID', 'DateofService', 'InHours', 'ServiceCategory', 'Service', 'ServiceSite', 'Wheredidyourefer', 'Funder', 'DirectServiceCategories', 'CriminalCivilJusticeAssistance', 'EmotionalSupportorSafetyServices', 'InformationandReferral', 'PersonalAdvocacyAccompaniment', 'ShelterHousingServices']
export const NATIVE_DES_DV_REQUIREMENTS: Record<string, string[]> = {
  ...core,
  Client_Profile: [...core.Client_Profile, 'race', 'multi_race_ind', 'gender', 'ethnicity', 'mil_veteran', 'disability'],
  ProgramEnrollment: [...core.ProgramEnrollment, 'AbuseStatus', 'ClientSpecialClassification', 'VictimType'],
  Services: serviceFields,
  BedEnrollment: ['RecordID', 'CheckInDate', 'CheckOutDate'],
}
export const NATIVE_DES_DV_DATASETS: Record<string, string[]> = {
  DES_DV_01_clients: ['Client_Profile', 'ProgramEnrollment', 'Services'],
  DES_DV_monthly_02_data: ['Client_Profile', 'ProgramEnrollment', 'Services'],
  DES_DV_02_bednights: ['Client_Profile', 'ProgramEnrollment', 'BedEnrollment'],
  DES_DV_exits: ['Client_Profile', 'ProgramEnrollment'],
  DES_DV_monthly_02_MCBAHours: ['Client_Profile', 'ProgramEnrollment', 'Services'],
  DVSV_Services_CO: ['Client_Profile', 'ProgramEnrollment', 'Services'],
  Native_DES_DV_turnaways: ['Client_Profile', 'ProgramEnrollment', 'Services'],
}
export function planNativeDesDvReport(report: LegacyReport): ReportPlan {
  return { required: NATIVE_DES_DV_REQUIREMENTS, datasets: Object.fromEntries(report.datasets.map((dataset) => [dataset.name, { tables: NATIVE_DES_DV_DATASETS[dataset.name] || [], unavailable: dataset.name in NATIVE_DES_DV_DATASETS ? '' : 'This DES DV dataset has not been converted to native calculations.' }])) }
}

// Keep the supplied layout, with only explicit current-system adaptations.
// Do not mutate the catalog shared by other reports or execute supplied SQL.
export function prepareNativeDesDvReport(source: LegacyReport): LegacyReport {
  if (!isNativeDesDvReport(source)) return source
  const report = structuredClone(source)
  const original = report.datasets.find((dataset) => dataset.name === 'DES_DV_monthly_02_data')!
  report.datasets.push({ ...structuredClone(original), name: 'Native_DES_DV_turnaways', sql: '', sourceSql: '', dependencies: [], requirements: {} })
  function visit(items: ReportItem[], yearlyPeople = false, programExits = false) {
    for (const item of items) {
      if (item.kind === 'text') {
        for (const paragraph of item.paragraphs) for (const run of paragraph) {
          // The source false-branch zero counts as a distinct phantom client.
          run.value = run.value.replaceAll('Fields!Client_RecordID.Value, 0)', 'Fields!Client_RecordID.Value, Nothing)')
          if (yearlyPeople) run.value = run.value.replaceAll('Fields!Client_RecordID.Value', 'Fields!NativeCountKey.Value')
          if (programExits) run.value = run.value.replaceAll('Fields!Client_RecordID.Value', 'Fields!NativeExitCountKey.Value')
          if (run.value.startsWith('=Sum(IIF(Fields!ServiceCategory.Value')) run.value = '=Sum(Fields!NativeMCBAHours.Value)'
        }
      } else {
        if (item.name === 'Tablix24') item.dataset = 'Native_DES_DV_turnaways'
        if (item.name === 'Tablix4' || item.name === 'Tablix26') {
          // Fixed category rows keep zeros visible without adding synthetic
          // client records that could inflate totals, audits, or CSV exports.
          if (item.rows.length !== 2 || item.rowMembers.length !== 2) throw new Error('Unexpected DES People Served row template; review the layout before reporting.')
          const template = item.rows[0], member = item.rowMembers[0]
          const categories = ['1-TANF Adult', '2-TANF Child', '3-non-TANF Adult', '4-non-TANF Child']
          const body = categories.map((category, categoryIndex) => {
            const cells = structuredClone(template)
            const condition = `Fields!TANF_Eligibility.Value = "${category}" AND Fields!Program_Name.Value ${item.name === 'Tablix26' ? '=' : '<>'} "CAAFA Outreach"`
            cells.forEach((cell, columnIndex) => cell.items.forEach((text) => {
              if (text.kind !== 'text') return
              text.name += `-category-${categoryIndex}`
              text.paragraphs = text.paragraphs.map((paragraph, paragraphIndex) => paragraph.map((run, runIndex) => ({ ...run, value: paragraphIndex || runIndex ? '' : columnIndex === 0 ? category.slice(2) : `=CountDistinct(IIf(${condition}, Fields!NativeCountKey.Value, Nothing))` })))
            }))
            return cells
          })
          item.rows = [...body, ...item.rows.slice(1)]
          item.rowMembers = [...categories.map(() => ({ ...structuredClone(member), name: '', expressions: [], filters: [], sorts: [], hidden: '', toggle: '', header: [], members: [] })), ...item.rowMembers.slice(1)]
        }
        const countByYear = item.name === 'Tablix4' || item.name === 'Tablix26'
        // Exit/destination totals must add the displayed program columns.
        // Keep their client/program key separate from People Served's yearly key.
        const countByProgramExit = item.name === 'Tablix1' || item.name === 'Tablix3'
        for (const row of item.rows) for (const cell of row) visit(cell.items, countByYear, countByProgramExit)
        const members = [...item.rowMembers, ...item.columnMembers]
        while (members.length) { const member = members.pop()!; visit(member.header, countByYear, countByProgramExit); members.push(...member.members) }
      }
    }
  }
  visit(report.items)
  report.items.sort((a, b) => parseFloat(a.top || '0') - parseFloat(b.top || '0'))
  // Read-only source/dependency inspector still uses the original SQL. The
  // runner supplies Bednights itself, clipped to today's completed nights.
  const bed = report.datasets.find((dataset) => dataset.name === 'DES_DV_02_bednights')!
  bed.fields = bed.fields.map((field) => field.name === 'Bednights' ? { ...field, source: 'Bednights', expression: '' } : field)
  return report
}
