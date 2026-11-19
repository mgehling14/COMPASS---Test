import { loadRolePermissionsForUser, loadAssignedRolePermissionsForUser, type RolePermissionProfile } from './rolePermissions'
import { loadUserDirectory, type DirectoryUser } from './userDirectory'
import type { CompassUser } from '../types/auth'

export const USER_PREVIEW_READ_ONLY_MESSAGE = 'View as User is read-only. Records, permissions, uploads, and imports cannot be changed in this mode.'
export type PreviewDirectoryUser = DirectoryUser
export type UserPreviewSession = { user: PreviewDirectoryUser; profiles: RolePermissionProfile[]; operatorKey: string }
const text = (value: unknown) => String(value ?? '').trim()
const normalize = (value: unknown) => text(value).toLowerCase()

export function userIdentityKey(user: CompassUser): string {
  return `${normalize(user.id)}|${normalize(user.email)}`
}

export function hasItAdminPermission(user: CompassUser, profiles: RolePermissionProfile[]): boolean {
  return normalize(user.rawRole) === 'it admin' || profiles.some((profile) => normalize(profile.roleName) === 'it admin')
}

// Read the actual directory, including users with no COMPASS role assignments.
// Staff-assignment dropdowns deliberately exclude those users; this picker must not.
export async function loadPreviewUsers(): Promise<PreviewDirectoryUser[]> {
  return loadUserDirectory()
}

export async function loadUserPreviewSession(operator: CompassUser, selectedKey: string): Promise<UserPreviewSession> {
  const operatorProfiles = await loadRolePermissionsForUser(operator)
  if (!hasItAdminPermission(operator, operatorProfiles)) throw new Error('Only the signed-in IT Admin can use View as User.')
  const directory = await loadPreviewUsers()
  const selected = directory.find((entry) => userIdentityKey(entry) === selectedKey)
  if (!selected) throw new Error('This user is no longer present in ithd_userses. Refresh the user list.')
  const profiles = await loadAssignedRolePermissionsForUser(selected)
  // Never reuse the operator's raw role, profiles, tokens, or stored identity.
  const user = { ...selected, role: 'user' as const, rawRole: profiles.map((profile) => profile.roleName).join(' | ') }
  return { user, profiles, operatorKey: userIdentityKey(operator) }
}
