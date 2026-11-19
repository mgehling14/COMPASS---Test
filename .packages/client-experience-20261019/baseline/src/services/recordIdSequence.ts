export const APP_RECORD_ID_PREFIXES: Record<string, string> = {
  'client-profile': 'CP', 'program-enrollment': 'PE', services: 'SV',
  'adult-assessment': 'AA', 'release-of-information': 'ROI', 'acknowledgement-consent': 'ACC',
  'animal-agreement': 'AA', 'bed-enrollment': 'BE', 'child-assessment': 'CA',
  'child-safety-plan': 'CSP', 'child-shelter-intake': 'CSI', 'electronic-document': 'EDOC',
  'employment-benefits': 'EB', event: 'EVENT', 'financial-assistance': 'FA',
  'focus-plan': 'FP', goal: 'GOAL', 'health-wellness': 'HWQ', helpline: 'HL',
  household: 'HH', 'household-history': 'HHIST', 'initial-safety-plan': 'ISP',
  'medical-consent': 'MCF', 'person-fleeing-profile': 'PYFP', 'pet-companion-intake': 'PCI',
  'shelter-program-guidelines': 'SPG', 'shelter-screening': 'SS', 'service-animal-terms': 'TCSA',
  'voca-form': 'VOCA',
}

export function createRecordIdSequence(prefix: string, divisionCode: string) {
  if (typeof prefix !== 'string' || !/^[A-Z][A-Z0-9]*$/i.test(prefix) || !/^\d{2}$/.test(divisionCode)) throw new Error('Invalid app record-ID format.')
  const pattern = new RegExp(`^${prefix}-${divisionCode}([1-9]\\d*)$`, 'i')
  const timestampPattern = new RegExp(`^${prefix}-20\\d{12}$`, 'i')
  let highest = 0
  return {
    observe(value: unknown): void {
      const match = String(value ?? '').trim().match(pattern)
      if (!match) return
      const sequence = Number(match[1])
      if (!Number.isSafeInteger(sequence)) throw new Error('An existing app record ID exceeds the supported sequence range.')
      highest = Math.max(highest, sequence)
    },
    isAppId(value: unknown): boolean {
      const text = String(value ?? '').trim()
      // Keep older app-generated timestamp IDs too; they do not consume a
      // modern sequential number (CP-20260923164213 is not CP-04... ).
      return pattern.test(text) || timestampPattern.test(text)
    },
    allocate(): string {
      if (!Number.isSafeInteger(highest + 1)) throw new Error('The app record-ID sequence is exhausted.')
      highest += 1
      return `${prefix}-${divisionCode}${highest}`
    },
  }
}

export type RecordIdSequence = ReturnType<typeof createRecordIdSequence>
