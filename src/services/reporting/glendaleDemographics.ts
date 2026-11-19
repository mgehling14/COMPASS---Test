import { reportDay } from '../desDvReport'
import type { ReportRow } from './reportTypes'

export const GLENDALE_UNKNOWN = 'Unknown / unmapped'
export const GLENDALE_RACES = ['White', 'Black/African-American', 'Black/African-American and White', 'Asian', 'Asian & White', 'American Indian or Alaska Native', 'Am. Indian/Alaska Native & White', 'Am. Indian/Alaska Native & Black/African American', 'Native Hawaiian/Other Pacific Islander', 'Other Multi-Racial', GLENDALE_UNKNOWN]
const normalize = (value: unknown) => String(value ?? '').trim().toLowerCase().replace(/\s+/g, ' ')
const values = (value: unknown) => [...new Set(String(value ?? '').split('|').map(normalize).filter(Boolean))]
const unknown = (value: string) => /^(unknown(?:\s*\/\s*(?:not reported|unmapped))?|data not collected|not reported)$/.test(value)
export function glendaleRace(value: unknown): string {
  const aliases: Record<string, string> = {
    white: 'W', 'black or african american': 'B', 'black/african-american': 'B', asian: 'A',
    'american indian or alaska native': 'I', 'native hawaiian or pacific islander': 'P', 'native hawaiian or other pacific islander': 'P',
  }
  const raw = values(value)
  if (!raw.length || raw.some((item) => unknown(item) || !aliases[item])) return GLENDALE_UNKNOWN
  const key = [...new Set(raw.map((item) => aliases[item]))].sort().join('')
  return ({ W: GLENDALE_RACES[0], B: GLENDALE_RACES[1], BW: GLENDALE_RACES[2], A: GLENDALE_RACES[3], AW: GLENDALE_RACES[4], I: GLENDALE_RACES[5], IW: GLENDALE_RACES[6], BI: GLENDALE_RACES[7], P: GLENDALE_RACES[8] } as Record<string, string>)[key] || (key.length > 1 ? 'Other Multi-Racial' : GLENDALE_UNKNOWN)
}
export function glendaleEthnicity(value: unknown): 'NonHispanic' | 'Hispanic' | 'EthnicityUnknown' {
  const items = values(value)
  if (items.length !== 1) return 'EthnicityUnknown'
  if (['non-hispanic/non-latin(a)(o)(x)', 'not hispanic/latino', 'not hispanic or latino', 'non-hispanic'].includes(items[0])) return 'NonHispanic'
  if (['hispanic/latin(a)(o)(x)', 'hispanic/latino', 'hispanic or latino', 'hispanic'].includes(items[0])) return 'Hispanic'
  return 'EthnicityUnknown'
}
function gender(value: unknown): string {
  const items = values(value)
  if (!items.length || items.some(unknown)) return GLENDALE_UNKNOWN
  if (items.length === 1 && ['male', 'female'].includes(items[0])) return items[0] === 'male' ? 'Male' : 'Female'
  return items.every((item) => ['male', 'female', 'a gender other than singularly female or male', 'transgender', 'questioning', 'other'].includes(item)) ? 'Other' : GLENDALE_UNKNOWN
}
export type GlendaleDemographicPerson = { client: ReportRow | null; when: number }
export function glendaleDemographics(entries: GlendaleDemographicPerson[], headOfHousehold: boolean): ReportRow[] {
  const rows: ReportRow[] = GLENDALE_RACES.map((Category) => ({ Demographic: 'Race / Ethnicity', Category, Count: 0, NonHispanic: 0, Hispanic: 0, EthnicityUnknown: 0 }))
  const groups: Record<string, string[]> = {
    Gender: ['Male', 'Female', 'Other', GLENDALE_UNKNOWN],
    'Seniors (over age 62)': ['Over 62', '62 or younger', GLENDALE_UNKNOWN],
    Disability: ['Recorded disability', 'Explicit No / none', GLENDALE_UNKNOWN],
    ...(headOfHousehold ? { 'Female-headed households': ['Female head', 'Head not female', GLENDALE_UNKNOWN] } : {}),
  }
  for (const [Demographic, categories] of Object.entries(groups)) for (const Category of categories) rows.push({ Demographic, Category, Count: 0 })
  function increment(dimension: string, category: string) { const row = rows.find((row) => row.Demographic === dimension && row.Category === category)!; row.Count = Number(row.Count) + 1 }
  for (const entry of entries) {
    const client = entry.client || {}, race = rows.find((row) => row.Demographic === 'Race / Ethnicity' && row.Category === glendaleRace(client.race))!
    race.Count = Number(race.Count) + 1
    const ethnicity = glendaleEthnicity(client.ethnicity); race[ethnicity] = Number(race[ethnicity]) + 1
    const sex = gender(client.gender); increment('Gender', sex)
    const dob = reportDay(String(client.dob ?? ''))
    let senior = GLENDALE_UNKNOWN
    if (dob !== null && dob <= entry.when) {
      const date = new Date(entry.when * 86400000), birth = new Date(dob * 86400000)
      let age = date.getUTCFullYear() - birth.getUTCFullYear()
      if (date.getUTCMonth() < birth.getUTCMonth() || date.getUTCMonth() === birth.getUTCMonth() && date.getUTCDate() < birth.getUTCDate()) age--
      senior = age > 62 ? 'Over 62' : '62 or younger'
    }
    increment('Seniors (over age 62)', senior)
    const disability = values(client.disability), positive = disability.some((item) => ['physical', 'mental', 'developmental', 'deaf/hard of hearing', 'yes'].includes(item))
    increment('Disability', positive ? 'Recorded disability' : disability.length && disability.every((item) => ['no', 'none', 'none of the above'].includes(item)) ? 'Explicit No / none' : GLENDALE_UNKNOWN)
    if (headOfHousehold) increment('Female-headed households', sex === GLENDALE_UNKNOWN ? sex : sex === 'Female' ? 'Female head' : 'Head not female')
  }
  for (const Demographic of ['Race / Ethnicity', ...Object.keys(groups)]) {
    const total: ReportRow = { Demographic, Category: 'Total', Count: entries.length, IsTotal: true }
    if (Demographic === 'Race / Ethnicity') for (const field of ['NonHispanic', 'Hispanic', 'EthnicityUnknown']) total[field] = rows.filter((row) => row.Demographic === Demographic).reduce((sum, row) => sum + Number(row[field]), 0)
    rows.push(total)
  }
  return rows
}
