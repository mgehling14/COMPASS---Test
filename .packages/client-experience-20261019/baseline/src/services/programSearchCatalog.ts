import { ARCHIVE_TABLES, type ArchiveTableDefinition } from './archive'
import type { RolePermissionProfile } from './rolePermissions'

export type ProgramSearchHub = { id: string; title: string; displayTitle?: string; roleMatchers: string[] }
export type ProgramSearchGrant = { table: ArchiveTableDefinition; view: boolean; ignoreProgramAssignment: boolean; roleNames: string[] }
export type ProgramSearchField = { field: string; label: string }
export type ProgramSearchFields = Record<string, ReadonlyArray<ProgramSearchField>>

export function normalizeSearchName(value: string): string {
  return value.toLowerCase().replace(/&/g, ' and ').replace(/[^a-z0-9]+/g, ' ').replace(/\s+/g, ' ').trim()
}

const aliases: Record<string, string[]> = {
  'client-profile': ['Client Profile Form'], 'program-enrollment': ['Program Enrollment Form'],
  services: ['Service', 'Service Form', 'Services Form'], 'shelter-screening': ['Shelter Screening Form'],
  'voca-form': ['VOCA'], 'release-of-information': ['A New Leaf Limited Release of Information', 'Limited Release of Information', 'Release of Information Form'],
  'acknowledgement-consent': ['Acknowledgement & Consent Form', 'Acknowledgement and Consent Form'],
  goal: ['Goal', 'Goals Form', 'ANL Goal', 'ANL Goals', 'ANL Goals Form', 'A New Leaf Goal', 'A New Leaf Goals', 'A New Leaf Goals Form'],
  household: ['Househould'], 'medical-consent': ['Medical Consent'],
  'funder-contract': ['Contract', 'Contracts', 'Funder Contracts'], 'funder-transaction': ['Funder Transactions'],
  funder: ['Funders'], bed: ['Beds', 'Bed Management'], 'compass-file': ['Compass Files'],
}

// This allowlist contains only record tables actually implemented in COMPASS.
// Legacy role rows cannot manufacture a table/entity name or map Abuser Profile
// to Person You Are Fleeing Profile by a fuzzy/similar name.
export function resolveProgramSearchTable(formName: string): ArchiveTableDefinition | undefined {
  const normalized = normalizeSearchName(formName)
  return ARCHIVE_TABLES.find((table) => !table.adminOnly && [table.label, ...(aliases[table.key] || [])].some((name) => normalizeSearchName(name) === normalized))
}

export function roleMatchesSearchHub(hub: ProgramSearchHub, roleName: string): boolean {
  const role = normalizeSearchName(roleName)
  if (role === 'it admin') return true
  const matchers = hub.id === 'sv' ? hub.roleMatchers : [...hub.roleMatchers, hub.title, hub.displayTitle || '']
  return matchers.filter(Boolean).some((matcher) => {
    const normalized = normalizeSearchName(matcher)
    if (hub.id === 'sv') return role === normalized || role.startsWith(`${normalized} `)
    return normalized && (` ${role} `).includes(` ${normalized} `)
  })
}

export function programSearchGrants(profiles: RolePermissionProfile[], hub: ProgramSearchHub): ProgramSearchGrant[] {
  const eligible = profiles.filter((profile) => roleMatchesSearchHub(hub, profile.roleName))
  const grants = new Map<string, ProgramSearchGrant>()
  for (const profile of eligible) for (const entry of profile.entries) {
    if (entry.permissions.search !== true) continue
    const table = resolveProgramSearchTable(entry.formName)
    if (!table) continue
    const existing = grants.get(table.key)
    const view = eligible.some((role) => role.entries.some((permission) => permission.permissions.view === true && resolveProgramSearchTable(permission.formName)?.key === table.key))
    grants.set(table.key, { table, view, ignoreProgramAssignment: !!existing?.ignoreProgramAssignment || entry.permissions.ignoreProgramAssignment === true,
      roleNames: [...new Set([...(existing?.roleNames || []), profile.roleName])] })
  }
  return [...grants.values()].sort((left, right) => left.table.label.localeCompare(right.table.label))
}

export function programSearchLabels(hub: ProgramSearchHub): string[] {
  const alternatives: Record<string, string[]> = {
    // Old labels here are data compatibility aliases, never role matchers.
    'dv-outreach': ['DV Outreach', 'CAAFA Outreach'], sv: ['SV', 'REACH SV', 'REACH Center', 'SV Helpline'],
  }
  return [...new Set([hub.title, hub.displayTitle || '', ...(alternatives[hub.id] || [])].filter(Boolean))]
}
