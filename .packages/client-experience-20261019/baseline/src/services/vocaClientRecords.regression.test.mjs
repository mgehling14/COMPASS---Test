import assert from 'node:assert/strict'
import { readFileSync } from 'node:fs'
import test from 'node:test'
import vm from 'node:vm'
import ts from 'typescript'

const org = 'https://org1f466e4e.crm.dynamics.com'
const config = JSON.parse(readFileSync(new URL('../../power.config.json', import.meta.url), 'utf8'))
const schemaSource = readFileSync(new URL('../../.power/schemas/appschemas/dataSourcesInfo.ts', import.meta.url), 'utf8')
const schema = JSON.parse(schemaSource.slice(schemaSource.indexOf('{'), schemaSource.lastIndexOf('}') + 1))
const id = (value) => `11111111-1111-1111-1111-${value.toString(16).padStart(12, '0')}`
const clientId = id(1)
const enrollmentId = id(2)
const connectorEndpoint = 'https://default0528c75bbb2a4718b02a1902cc340b.62.environment.api.powerplatform.com/connectors/runtime/invoke/scalegroups/usa/shards/00/apis/commondataserviceforapps/connections/62736235ca85441e9b4ecd279e60c1f7/nextLink'
const connectorLink = (next) => `${connectorEndpoint}?${new URLSearchParams({ organization: org, next })}`

function harness(handler, { local = false } = {}) {
  const calls = []
  const cache = new Map()
  function load(file) {
    if (cache.has(file)) return cache.get(file)
    const source = readFileSync(new URL(file, import.meta.url), 'utf8').replaceAll('import.meta.env', '({})')
    const js = ts.transpileModule(source, { compilerOptions: { module: ts.ModuleKind.CommonJS, target: ts.ScriptTarget.ES2022 } }).outputText
    const module = { exports: {} }
    cache.set(file, module.exports)
    vm.runInNewContext(js, {
      module, exports: module.exports, URL, URLSearchParams, Headers,
      window: { location: { hostname: local ? 'localhost' : 'powerapps.example' } },
      fetch: async (url, init) => { calls.push({ url, init }); return handler({ url, init }) },
      require(name) {
        if (name === '@microsoft/power-apps/data') return { getClient: () => ({ executeAsync: async ({ connectorOperation: operation }) => {
          const api = schema.commondataserviceforapps.apis[operation.operationName]
          assert.ok(api, `Unsupported operation: ${operation.operationName}`)
          for (const parameter of api.parameters.filter((entry) => entry.required && entry.name !== 'connectionId')) assert.notEqual(operation.parameters[parameter.name], undefined, `Missing parameter: ${parameter.name}`)
          calls.push(operation)
          return handler(operation)
        } }) }
        if (name.includes('dataSourcesInfo')) return { dataSourcesInfo: schema }
        if (name === '../../power.config.json') return config
        if (name === './auth') return { getAuthToken: () => 'test-token', ensureAuthToken: async () => 'test-token' }
        if (name === './archive') return { ARCHIVED_YES_VALUE: 125570000, excludeArchived: (filter) => `(${filter}) and (cmps_isarchived ne 125570000 or cmps_isarchived eq null)` }
        if (name.startsWith('./')) return load(`${name}.ts`)
        throw new Error(`Unexpected dependency: ${name}`)
      },
    }, { filename: file })
    return module.exports
  }
  return { api: load('./vocaClientRecords.ts'), calls }
}

for (const local of [false, true]) {
  test(`${local ? 'local' : 'runtime'} client-only VOCA records load without enrollments, excluding archived and other clients`, async () => {
    const h = harness(() => {
      const data = { value: [
        { cmps_vocaformid: id(10), cmps_recordid: 'VOCA-041', _cmps_cpid_value: clientId, _cmps_peid_value: null },
        { cmps_vocaformid: id(11), _cmps_cpid_value: id(100) },
        { cmps_vocaformid: id(12), _cmps_cpid_value: clientId, cmps_isarchived: 125570000 },
        { cmps_vocaformid: id(13), _cmps_cpid_value: clientId, _cmps_peid_value: enrollmentId },
      ] }
      return local ? { ok: true, json: async () => data } : { success: true, data }
    }, { local })
    const records = await h.api.listVocaFormsForClient(clientId, [])
    assert.equal(records.length, 1); assert.equal(records[0].recordId, 'VOCA-041'); assert.equal(records[0].programEnrollmentId, '')
    assert.equal(h.calls.length, 1)
    const filter = local ? new URL(h.calls[0].url).searchParams.get('$filter') : h.calls[0].parameters.$filter
    assert.match(filter, new RegExp(`_cmps_cpid_value eq ${clientId} and _cmps_peid_value eq null`))
    assert.match(filter, /cmps_isarchived ne 125570000/)
    if (local) assert.equal(h.calls[0].init.headers.Authorization, 'Bearer test-token')
  })
}

test('direct and enrollment VOCA records are merged, deduplicated, and ordered by modification date', async () => {
  const h = harness(({ parameters }) => ({ success: true, data: { value: parameters.$filter.includes('_cmps_cpid_value') ? [
    { cmps_vocaformid: id(10), _cmps_cpid_value: clientId, modifiedon: '2026-10-01' },
  ] : [
    { cmps_vocaformid: id(11), _cmps_peid_value: enrollmentId, modifiedon: '2026-10-06' },
    { cmps_vocaformid: id(11), _cmps_peid_value: enrollmentId, modifiedon: '2026-10-06' },
    { cmps_vocaformid: id(12), _cmps_peid_value: id(999) },
  ] } }))
  const records = await h.api.listVocaFormsForClient(clientId, [enrollmentId, enrollmentId, 'invalid'])
  assert.deepEqual(Array.from(records, (record) => record.id), [id(11), id(10)])
  assert.equal(h.calls.length, 2)
  assert.match(h.calls[1].parameters.$filter, new RegExp(`_cmps_peid_value eq ${enrollmentId}`))
  for (const call of h.calls) {
    assert.equal(call.parameters.$top, undefined)
    assert.equal(call.parameters.prefer, 'odata.maxpagesize=1000')
    assert.equal(call.parameters.accept, 'application/json')
  }
})

for (const local of [false, true]) {
  test(`${local ? 'local' : 'runtime'} VOCA reader follows all pages past 5,000, including connector continuation wrappers`, async () => {
    const total = 5201
    const h = harness((call) => {
      const url = local ? new URL(call.url) : null
      const next = local ? url.searchParams.get('$skiptoken') : call.parameters.next ? new URL(call.parameters.next, org).searchParams.get('$skiptoken') : call.parameters.$skiptoken
      const start = Number(next || 0)
      const end = Math.min(start + 1000, total)
      const data = { value: Array.from({ length: end - start }, (_, index) => ({ cmps_vocaformid: id(start + index + 10), _cmps_cpid_value: clientId })) }
      if (end < total) data['@odata.nextLink'] = connectorLink(`/api/data/v9.2/cmps_vocaforms?$skiptoken=${end}`)
      return local ? { ok: true, json: async () => data } : { success: true, data }
    }, { local })
    const records = await h.api.listVocaFormsForClient(clientId, [])
    assert.equal(records.length, total); assert.equal(h.calls.length, 6)
    assert.equal(new Set(records.map((record) => record.id)).size, total)
    if (!local) assert.equal(h.calls[1].operationName, 'GetNextPageWithOrganization')
    else assert.ok(h.calls.every((call) => new URL(call.url).hostname === 'org1f466e4e.crm.dynamics.com'))
  })
}

test('large enrollment lists are batched into scoped queries instead of an unfiltered table scan', async () => {
  const h = harness(() => ({ success: true, data: { value: [] } }))
  const enrollments = Array.from({ length: 121 }, (_, index) => id(index + 1000))
  await h.api.listVocaFormsForClient(clientId, enrollments)
  assert.equal(h.calls.length, 4)
  assert.deepEqual(h.calls.slice(1).map((call) => (call.parameters.$filter.match(/_cmps_peid_value eq/g) || []).length), [50, 50, 21])
  assert.ok(h.calls.every((call) => call.parameters.$filter))
})

test('VOCA read errors, wrong-tenant links and repeated cursors fail rather than return an incomplete list', async () => {
  const denied = harness(() => ({ success: false, error: { message: 'Forbidden' } }))
  await assert.rejects(denied.api.listVocaFormsForClient(clientId, []), /Forbidden/)
  const foreign = harness(() => ({ success: true, data: { value: [], '@odata.nextLink': 'https://foreign.crm.dynamics.com/api/data/v9.2/cmps_vocaforms?$skiptoken=1' } }))
  await assert.rejects(foreign.api.listVocaFormsForClient(clientId, []), /host does not belong/)
  const repeated = harness(() => ({ success: true, data: { value: [], '@odata.nextLink': `${org}/api/data/v9.2/cmps_vocaforms?$skiptoken=1` } }))
  await assert.rejects(repeated.api.listVocaFormsForClient(clientId, []), /VOCA paging repeated/)
  assert.equal(repeated.calls.length, 2)
  const malformed = harness(() => ({ success: true, data: {} }))
  await assert.rejects(malformed.api.listVocaFormsForClient(clientId, []), /did not return VOCA records/)
  const invalid = harness(() => { throw new Error('Should not request') })
  await assert.rejects(invalid.api.listVocaFormsForClient('invalid', []), /valid Client Profile/)
  assert.equal(invalid.calls.length, 0)
})

test('opened profiles use the new VOCA reader without an enrollment-count gate; the client lookup stays off the form', () => {
  const app = readFileSync(new URL('../App.tsx', import.meta.url), 'utf8')
  assert.match(app, /listVocaFormsForClient\(clientRowId, enrollmentIds\)/)
  const start = app.indexOf('setVocaFormsForClient([])')
  assert.doesNotMatch(app.slice(start - 150, start), /enrollmentIds.length === 0/)
  assert.match(app, /Client Profile link \(legacy record\)/)
  assert.match(app, /programEnrollmentsForClient.filter\(\(row\) => normalizeGuidText\(String\(row.clientRowId/)
  const service = readFileSync(new URL('./vocaForm.ts', import.meta.url), 'utf8')
  const fields = service.slice(service.indexOf('export const VOCA_FORM_FIELD_DEFINITIONS'), service.indexOf('export const VOCA_FORM_FIELD_NAMES'))
  assert.doesNotMatch(fields, /cmps_cpid/)
  const archive = readFileSync(new URL('./archive.ts', import.meta.url), 'utf8')
  assert.match(archive, /enrollment\(\{ key: 'voca-form'.*clientLookupField: '_cmps_cpid_value'/)
})
