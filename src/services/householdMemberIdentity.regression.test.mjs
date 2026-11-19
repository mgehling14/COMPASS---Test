import assert from 'node:assert/strict'
import test from 'node:test'
import { normalizeDataverseRowId, sameDataverseRowId } from './householdMemberIdentity.ts'

test('household edit recognizes the same Dataverse GUID across casing and braces', () => {
  const householdFromForm = '9D32CE63-6AA6-4F85-A645-BBD92D2BCEAD'
  const householdFromHistory = '{9d32ce63-6aa6-4f85-a645-bbd92d2bcead}'

  assert.equal(sameDataverseRowId(householdFromForm, householdFromHistory), true)
})

test('household search result IDs normalize to the same visible option key', () => {
  const searchResultId = '{6EFCA456-E1C1-4AB8-8B0D-7F094747D25D}'
  const draftClientId = '6efca456-e1c1-4ab8-8b0d-7f094747d25d'

  const visibleIds = new Set([searchResultId].map(normalizeDataverseRowId))
  assert.equal(visibleIds.has(normalizeDataverseRowId(draftClientId)), true)
})

test('empty values never compare as a real Dataverse row ID', () => {
  assert.equal(sameDataverseRowId('', ''), false)
})
