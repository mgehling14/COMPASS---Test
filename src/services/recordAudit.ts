// Dataverse owns the standard audit columns. Never send stale values loaded
// from a record back to the API, or replace its original creator on an edit.
export function withRecordAudit<T extends Record<string, unknown>>(values: T, actor: string, editing: boolean): T {
  const name = String(actor || '').trim()
  if (!name) throw new Error('Your signed-in identity could not be loaded. Please sign in again before saving.')
  const payload = { ...values } as Record<string, unknown>
  for (const field of ['createdon', 'modifiedon', 'createdby', 'modifiedby', '_createdby_value', '_modifiedby_value', 'cmps_creationdate', 'cmps_createdby', 'cmps_modifiedby']) delete payload[field]
  if (!editing) payload.cmps_createdby = name
  payload.cmps_modifiedby = name
  return payload as T
}
