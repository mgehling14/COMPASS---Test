export type CompassRole = 'guest' | 'user' | 'manager' | 'admin' | 'superadmin'

export type CompassUser = {
  id: string
  name: string
  email: string
  role: CompassRole
  rawRole?: string
  identityIds?: string[]
  identityEmails?: string[]
  roleSource: 'power' | 'directory' | 'fallback'
}

export type RoleLookupResult = {
  resolvedRole: CompassRole
  rawRole?: string
  source: 'mg_appuserses' | 'ithd_userses' | 'fallback'
}
