const GUID_PATTERN = /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i

function guid(value: unknown): string {
  const text = String(value ?? '').trim().replace(/[{}]/g, '')
  return GUID_PATTERN.test(text) ? text.toLowerCase() : ''
}

// Dataverse automatically returns the primary key even when it is not in $select.
// Never use _cmps_funder_value (the parent funder's ID) as a contract row ID.
export function funderContractIdentity(row: Record<string, unknown> | null | undefined = {}): { id: string; primaryIdField: string } {
  if (!row) return { id: '', primaryIdField: '' }
  const directId = guid(row.id)
  const entityLink = String(row['@odata.id'] || row['@odata.editLink'] || '')
  const linkedId = guid(entityLink.match(/(?:^|\/)cmps_fundercontracts\(([0-9a-f-]{36})\)/i)?.[1])
  const candidates = Object.entries(row)
    .filter(([field, value]) => /^cmps_[a-z0-9_]+id$/i.test(field) && !!guid(value))
    .map(([field, value]) => ({ id: guid(value), primaryIdField: field }))

  const authoritativeId = directId || linkedId
  if (authoritativeId) {
    const match = candidates.find((candidate) => candidate.id === authoritativeId)
    return { id: authoritativeId, primaryIdField: match?.primaryIdField || (directId ? 'id' : '') }
  }
  if (candidates.length === 1) return candidates[0]
  if (candidates.length > 1) throw new Error('The contract row ID is ambiguous. No funder lookup will be used as a contract ID.')
  return { id: '', primaryIdField: '' }
}
