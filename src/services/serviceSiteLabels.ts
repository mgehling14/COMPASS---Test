const CAAFA_SERVICE_SITE_LABELS = [
  'CAAFA - Crisis Response',
  'CAAFA - Legal',
  'CAAFA - DV',
  'CAAFA - SV',
  'CAAFA - Thrive',
]

// Dataverse may still return the original compact labels in formatted values.
// Canonicalize display text only; choice IDs and their order remain unchanged.
export function formatServiceSiteLabel(value: unknown): string {
  const text = String(value ?? '').trim()
  const key = text.toLowerCase().replace(/\s*-\s*/g, '-')
  return CAAFA_SERVICE_SITE_LABELS.find((label) => label.toLowerCase().replace(/\s*-\s*/g, '-') === key) || text
}
