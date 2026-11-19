import type { LegacyReport } from './reportTypes'

export const DES_BOS_EXHIBIT_A_ID = 'des-bos-exhibit-a'
export const DES_BOS_EXHIBIT_D_ID = 'des-bos-exhibit-d'
export const isDesBosReport = (report: LegacyReport) => [DES_BOS_EXHIBIT_A_ID, DES_BOS_EXHIBIT_D_ID].includes(report.id)

export const DES_BOS_EXHIBIT_A_REQUIREMENTS: Record<string, string[]> = {
  ShelterScreening: [
    'RecordID', 'ScreenDate', 'ProgramScreening', 'PlacedInShelter',
    'ShelterTurnawayReason', 'ShelterTurnawayReasonOther',
  ],
}

export const DES_BOS_EXHIBIT_D_REQUIREMENTS: Record<string, string[]> = {
  Client_Profile: ['document_id', 'HMISID'],
  ProgramEnrollment: ['RecordID', 'Program'],
  Services: [
    'RecordID', 'DateofService', 'ServiceCategory', 'ServiceCategoryOther',
    'Service', 'ServiceOther', 'Wheredidyourefer', 'Wheredidyoureferother',
  ],
}

export const DES_BOS_EXHIBIT_A_DATASET = 'DES_BOS_ExhibitA'
export const DES_BOS_EXHIBIT_D_DATASET = 'DES_BOS_ExhibitD'

const monthParameter = { name: 'ReportMonth', type: 'Month', prompt: 'Report Month', hidden: false, values: [] }

export const DES_BOS_EXHIBIT_A_REPORT: LegacyReport = {
  id: DES_BOS_EXHIBIT_A_ID,
  title: 'DES BOS Exhibit A - Unable to Serve Summary',
  sourceFile: 'Exhibit A_SEP_2026.xlsx',
  parameters: [monthParameter],
  datasets: [{
    name: DES_BOS_EXHIBIT_A_DATASET,
    sql: '',
    sourceSql: '',
    dependencies: [],
    requirements: DES_BOS_EXHIBIT_A_REQUIREMENTS,
    filters: [],
    fields: [
      { name: 'ReasonProgramWasUnableToServe', source: 'ReasonProgramWasUnableToServe', expression: '' },
      { name: 'HouseholdsAffected', source: 'HouseholdsAffected', expression: '' },
    ],
  }],
  items: [],
}

export const DES_BOS_EXHIBIT_D_REPORT: LegacyReport = {
  id: DES_BOS_EXHIBIT_D_ID,
  title: 'DES BOS Exhibit D - Mainstream Service Referral Log',
  sourceFile: 'Exhibit D_ August 2026.xlsx',
  parameters: [monthParameter],
  datasets: [{
    name: DES_BOS_EXHIBIT_D_DATASET,
    sql: '',
    sourceSql: '',
    dependencies: [],
    requirements: DES_BOS_EXHIBIT_D_REQUIREMENTS,
    filters: [],
    fields: [
      'TypeOfService', 'HMISNumber', 'NameOfAgency', 'DateReferred',
      'CommentsFollowUp', 'Other',
    ].map((name) => ({ name, source: name, expression: '' })),
  }],
  items: [],
}

export const DES_BOS_REPORTS = [DES_BOS_EXHIBIT_A_REPORT, DES_BOS_EXHIBIT_D_REPORT]

export function desBosRequirements(report: LegacyReport): Record<string, string[]> {
  if (report.id === DES_BOS_EXHIBIT_A_ID) return DES_BOS_EXHIBIT_A_REQUIREMENTS
  if (report.id === DES_BOS_EXHIBIT_D_ID) return DES_BOS_EXHIBIT_D_REQUIREMENTS
  throw new Error(`Unsupported DES BOS report ${report.id}.`)
}

export function planDesBosReport(report: LegacyReport) {
  const required = desBosRequirements(report)
  return {
    required,
    datasets: Object.fromEntries(report.datasets.map((dataset) => [dataset.name, { tables: Object.keys(required), unavailable: '' }])),
  }
}
