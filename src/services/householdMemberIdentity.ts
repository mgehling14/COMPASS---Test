export function normalizeDataverseRowId(value: unknown): string {
  return String(value || '').trim().replace(/[{}]/g, '').toLowerCase()
}

export function sameDataverseRowId(left: unknown, right: unknown): boolean {
  const normalizedLeft = normalizeDataverseRowId(left)
  const normalizedRight = normalizeDataverseRowId(right)
  return !!normalizedLeft && normalizedLeft === normalizedRight
}
