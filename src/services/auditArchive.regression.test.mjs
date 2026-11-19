import assert from 'node:assert/strict'
import test from 'node:test'
import { auditHarness, id, org, wrapped } from './auditHarness.mjs'

for (const archived of [true, false]) test(`${archived ? 'archive' : 'restore'}: failed child discovery prevents every mutation`, async () => {
  const h = auditHarness((call) => {
    if (call.write) throw Error('No writes should occur')
    if (call.alias === 'cmps_helplines') throw Error('Child read denied')
    return { value: call.alias === 'cmps_programenrollment1s' ? [{ cmps_programenrollment1id: id(2) }] : [] }
  })
  await assert.rejects(h.load('./archive.ts').setRecordArchived('cmps_clientprofiles', id(1), archived), /Child read denied/)
  assert.equal(h.calls.filter((call) => call.write).length, 0)
})

for (const archive of [true, false]) test(`${archive ? 'archive' : 'restore'} reports confirmed partial progress and leaves parent until children finish`, async () => {
  const h = auditHarness((call) => {
    if (call.write) { if (call.alias === 'cmps_serviceses') throw Error('Write denied'); return {} }
    return { value: call.alias === 'cmps_programenrollment1s' ? [{ cmps_programenrollment1id: id(2) }]
      : call.alias === 'cmps_serviceses' ? [{ cmps_servicesid: id(3) }] : [] }
  })
  await assert.rejects(h.load('./archive.ts').setRecordArchived('cmps_clientprofiles', id(1), archive), (error) => {
    assert.equal(error.updated, 1); assert.equal(error.total, 3)
    assert.match(error.message, /1 of 3/); return true
  })
  assert.equal(h.calls.filter((call) => call.write && call.alias === 'cmps_clientprofiles').length, 0)
})

for (const direct of [false, true]) for (const wrapper of [false, true]) test(`${direct ? 'Web API' : 'connector'} ${wrapper ? 'wrapped' : 'plain'} archive search reads every page`, async () => {
  const route = `api/data/v9.2/cmps_serviceses?$skiptoken=${encodeURIComponent('page+2 %3C')}`
  const h = auditHarness((call) => {
    if (direct && !call.url) throw Error('Connector unavailable')
    const next = call.parameters.next || call.parameters.$skiptoken
    assert.equal(call.parameters.$top, undefined, 'No overall row limit may truncate the archive search')
    if (next) return { value: [{ cmps_servicesid: id(3), cmps_recordid: 'SV-043' }] }
    return { value: [{ cmps_servicesid: id(2), cmps_recordid: 'SV-042' }], '@odata.nextLink': wrapper ? wrapped(route) : `${org}/${route}` }
  })
  const rows = await h.load('./archive.ts').searchArchivedRecords('services')
  assert.deepEqual(Array.from(rows, (row) => row.id).sort(), [id(2), id(3)])
  assert.equal(h.calls.filter((call) => call.operationName === 'GetNextPageWithOrganization').length, !direct && wrapper ? 1 : 0)
})

for (const next of ['https://evil.example/api/data/v9.2/cmps_serviceses?$skiptoken=bad', `${org}/api/data/v9.2/cmps_serviceses?$skiptoken=repeated`]) test('unsafe/repeated continuations never return a partial archive search', async () => {
  const h = auditHarness(() => ({ value: [{ cmps_servicesid: id(2) }], '@odata.nextLink': next }))
  await assert.rejects(h.load('./archive.ts').searchArchivedRecords('services'), /continuation|repeated/)
})

test('malformed child rows are incomplete discovery, not silently skipped records', async () => {
  const h = auditHarness((call) => ({ value: call.alias === 'cmps_programenrollment1s' ? [{ cmps_recordid: 'no-primary-id' }] : [] }))
  await assert.rejects(h.load('./archive.ts').setRecordArchived('cmps_clientprofiles', id(1), true), /identity|row ID/)
  assert.equal(h.calls.filter((call) => call.write).length, 0)
})

test('client cascade does not query the global Events table as client-linked', async () => {
  const h = auditHarness((call) => {
    if (!call.write && call.alias === 'cmps_events') throw Error('Events has no Client Profile lookup')
    return { value: [] }
  })
  const result = await h.load('./archive.ts').setRecordArchived('cmps_clientprofiles', id(1), true)
  assert.equal(result.updated, 1)
  assert.equal(h.calls.some((call) => !call.write && call.alias === 'cmps_events'), false)
})

for (const archived of [true, false]) test(`${archived ? 'archive' : 'restore'} discovers every child page before writing the parent last`, async () => {
  const h = auditHarness((call) => {
    if (call.write) { assert.equal(call.parameters.item.cmps_isarchived, archived ? 125570000 : 125570001); return {} }
    if (call.parameters.next) return { value: [{ cmps_servicesid: id(4) }] }
    if (call.alias === 'cmps_programenrollment1s') return { value: [{ cmps_programenrollment1id: id(2) }] }
    if (call.alias === 'cmps_serviceses') return { value: [{ cmps_servicesid: id(3) }], '@odata.nextLink': wrapped('api/data/v9.2/cmps_serviceses?$skiptoken=page2') }
    return { value: [] }
  })
  const result = await h.load('./archive.ts').setRecordArchived('cmps_clientprofiles', id(1), archived)
  assert.equal(result.updated, 4)
  const firstWrite = h.calls.findIndex((call) => call.write)
  assert.ok(h.calls.slice(firstWrite).every((call) => call.write))
  assert.equal(h.calls.at(-1).alias, 'cmps_clientprofiles')
})
