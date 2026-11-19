import type { RolePermissionProfile } from './rolePermissions'

// Reporting is a screen-level role; it does not grant form or IT Admin access.
export function canViewReportLibrary(
  profiles: RolePermissionProfile[],
  canManage: boolean,
  loading: boolean,
  error: string,
  isUserPreview: boolean,
): boolean {
  if (loading || error || isUserPreview) return false
  return canManage || profiles.some((profile) => profile.roleName.trim().toLowerCase() === 'reporting')
}
