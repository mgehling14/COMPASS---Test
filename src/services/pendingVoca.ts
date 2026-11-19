export type PendingVocaReason = 'program-enrollment' | 'linked-service'

function normalizeVocaValue(value: unknown): string {
  return String(value || '').trim().toLocaleLowerCase()
}

export function isVocaFunder(value: unknown, vocaFunderIds: Iterable<string> = []): boolean {
  const normalizedValue = normalizeVocaValue(value)
  if (!normalizedValue) return false
  if (normalizedValue === 'voca') return true
  for (const funderId of vocaFunderIds) {
    if (normalizeVocaValue(funderId) === normalizedValue) return true
  }
  return false
}

export function getPendingVocaReason(
  programEnrollmentFunder: unknown,
  linkedServiceFunders: Iterable<unknown> = [],
  vocaFunderIds: Iterable<string> = [],
): PendingVocaReason | null {
  if (isVocaFunder(programEnrollmentFunder, vocaFunderIds)) return 'program-enrollment'
  for (const serviceFunder of linkedServiceFunders) {
    if (isVocaFunder(serviceFunder, vocaFunderIds)) return 'linked-service'
  }
  return null
}
