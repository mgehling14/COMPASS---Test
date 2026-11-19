import assert from 'node:assert/strict'
import test from 'node:test'
import { auditHarness } from './auditHarness.mjs'
function pageForLookup(call, recordId) {
  const filter = call.url ? new URL(call.url).searchParams.get('$filter') || '' : call.parameters.$filter || ''
  const minimumDigits = 1 + (filter.match(/\[0-9\]/g) || []).length
  const digits = recordId.match(/^[A-Z]+-\d{2}([1-9]\d*)$/i)?.[1] || ''
  return { value: digits.length >= minimumDigits ? [{ cmps_recordid: recordId }] : [] }
}
test('concurrent unsaved forms reserve different IDs within this app instance', async () => {
  const h = auditHarness((call) => pageForLookup(call, 'SV-0499'))
  const api = h.load('./recordIds.ts')
  assert.deepEqual(await Promise.all([api.generateSequentialRecordId('cmps_serviceses', 'SV'), api.generateSequentialRecordId('cmps_serviceses', 'SV')]), ['SV-04100', 'SV-04101'])
})
test('each allocation still rechecks persisted IDs and failures do not poison the local queue', async () => {
  let fail = true, recordId = 'CP-0410'
  const h = auditHarness((call) => { if (fail) throw Error('Denied'); return pageForLookup(call, recordId) })
  const api = h.load('./recordIds.ts')
  await assert.rejects(api.generateSequentialRecordId('cmps_clientprofiles', 'CP'))
  fail = false
  assert.equal(await api.generateSequentialRecordId('cmps_clientprofiles', 'CP'), 'CP-0411')
  recordId = 'CP-04100'
  assert.equal(await api.generateSequentialRecordId('cmps_clientprofiles', 'CP'), 'CP-04101')
})
