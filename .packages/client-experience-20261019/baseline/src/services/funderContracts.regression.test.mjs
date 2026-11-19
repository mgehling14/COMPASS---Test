import assert from 'node:assert/strict'
import { readFileSync } from 'node:fs'
import test from 'node:test'
import vm from 'node:vm'
import ts from 'typescript'

const contractIds = ['11111111-1111-1111-1111-111111111111', '22222222-2222-2222-2222-222222222222']
const funderId = '33333333-3333-3333-3333-333333333333'
const rows = contractIds.map((id, index) => ({
  cmps_actualcontractid: id,
  _cmps_funder_value: funderId,
  '_cmps_funder_value@OData.Community.Display.V1.FormattedValue': 'Shared Funder',
  cmps_contractname: `Contract ${index + 1}`,
  cmps_contractstatus: 125570000,
}))
const schemaSource = readFileSync(new URL('../../.power/schemas/appschemas/dataSourcesInfo.ts', import.meta.url), 'utf8')
const schema = JSON.parse(schemaSource.slice(schemaSource.indexOf('{'), schemaSource.lastIndexOf('}') + 1))

function harness({ local = true, headerOnly = false } = {}) {
  const calls = []
  const cache = new Map()
  function load(filename) {
    if (cache.has(filename)) return cache.get(filename)
    const source = readFileSync(new URL(filename, import.meta.url), 'utf8').replaceAll('import.meta.env', '({})')
    const javascript = ts.transpileModule(source, { compilerOptions: { module: ts.ModuleKind.CommonJS, target: ts.ScriptTarget.ES2022 } }).outputText
    const service = { exports: {} }
    cache.set(filename, service.exports)
    vm.runInNewContext(javascript, {
      module: service,
      exports: service.exports,
      Headers,
      URL,
      URLSearchParams,
      window: { location: { hostname: local ? 'localhost' : 'powerapps.example' } },
      fetch: async (url, init = {}) => {
        calls.push({ url, init })
        if (init.method === 'POST') return {
          ok: true,
          headers: new Headers({ 'OData-EntityId': `https://test.crm.dynamics.com/api/data/v9.2/cmps_fundercontracts(${contractIds[0]})` }),
          json: async () => headerOnly ? {} : rows[0],
        }
        return { ok: true, json: async () => ({ value: url.includes('/cmps_fundercontracts?') ? rows : [] }) }
      },
      require(name) {
        if (name === '@microsoft/power-apps/data') return { getClient: () => ({ executeAsync: async ({ connectorOperation: operation }) => {
          const api = schema.commondataserviceforapps.apis[operation.operationName]
          assert.ok(api, `Unsupported operation ${operation.operationName}`)
          for (const parameter of api.parameters.filter((entry) => entry.required && entry.name !== 'connectionId')) {
            assert.notEqual(operation.parameters[parameter.name], undefined, `Missing ${parameter.name}`)
          }
          calls.push(operation)
          return { success: true, data: operation.operationName.startsWith('List') ? { value: operation.parameters.entityName === 'cmps_fundercontracts' ? rows : [] } : rows[0] }
        } }) }
        if (name.includes('dataSourcesInfo')) return { dataSourcesInfo: schema }
        if (name === './auth') return { getAuthToken: () => 'test-token', ensureAuthToken: async () => 'test-token' }
        if (['./archive', './funderContractIdentity', './funderAdmin', './contract', './funderTransaction', './funderBalance'].includes(name)) return load(`${name}.ts`)
        throw new Error(`Unexpected dependency: ${name}`)
      },
    }, { filename })
    return service.exports
  }
  return { load, calls }
}

test('contract identity never falls back to the parent funder lookup', () => {
  const { load } = harness()
  const api = load('./funderContractIdentity.ts')
  assert.equal(api.funderContractIdentity(rows[0]).id, contractIds[0])
  assert.equal(api.funderContractIdentity({ _cmps_funder_value: funderId, cmps_funder: funderId }).id, '')
  assert.equal(api.funderContractIdentity({ '@odata.id': `cmps_fundercontracts(${contractIds[1]})`, _cmps_funder_value: funderId }).id, contractIds[1])
  assert.throws(() => api.funderContractIdentity({ cmps_firstid: contractIds[0], cmps_secondid: contractIds[1] }), /ambiguous/)
})

for (const local of [true, false]) {
  test(`${local ? 'local' : 'runtime'} funder lists use the funder lookup while retaining distinct contract row IDs`, async () => {
    const { load, calls } = harness({ local })
    const api = load('./funders.ts')
    const data = await api.loadFunderAdminData()
    assert.deepEqual(Array.from(data.contracts, (row) => row.id), contractIds)
    assert.deepEqual(Array.from(data.contracts, (row) => row.funderId), [funderId, funderId])
    assert.deepEqual(Array.from(data.contracts, (row) => row.funderName), ['Shared Funder', 'Shared Funder'])
    const options = await api.loadActiveFunderContracts()
    assert.deepEqual(Array.from(options, (row) => row.id), contractIds)
    for (const call of calls) {
      const select = call.parameters?.$select || new URL(call.url).searchParams.get('$select')
      assert.equal(select.includes('cmps_fundercontractsid'), false)
      if (call.parameters?.entityName === 'cmps_fundercontracts' || call.url?.includes('/cmps_fundercontracts?')) {
        assert.ok(select.includes('_cmps_funder_value'))
      }
    }
  })

  test(`${local ? 'local' : 'runtime'} contract create binds cmps_funder and reads the returned system row ID`, async () => {
    const { load, calls } = harness({ local })
    const created = await load('./contract.ts').createContractResponse({
      cmps_contractname: 'Contract 1', cmps_funder: funderId, cmps_fundercontractsid: funderId,
    })
    assert.equal(created.id, contractIds[0])
    const call = calls[0]
    const item = call.parameters?.item || JSON.parse(call.init.body)
    assert.equal(item['cmps_funder@odata.bind'], `/cmps_funders(${funderId})`)
    assert.equal(Object.hasOwn(item, 'cmps_fundercontractsid'), false)
    assert.equal(Object.hasOwn(item, 'cmps_funder'), false)
  })
}

test('contract create can resolve an empty response from its OData entity header', async () => {
  const { load } = harness({ headerOnly: true })
  const created = await load('./contract.ts').createContractResponse({ cmps_contractname: 'Contract 1', cmps_funder: funderId })
  assert.equal(created.id, contractIds[0])
})

test('archived contract restore targets only the selected contract, not its shared funder', async () => {
  const { load, calls } = harness({ local: false })
  const api = load('./archive.ts')
  const records = await api.searchArchivedRecords('funder-contract')
  assert.deepEqual(Array.from(records, (row) => row.id), contractIds)
  assert.equal(calls[0].parameters.$select.includes('cmps_fundercontractsid'), false)
  await api.setRecordArchived('cmps_fundercontracts', records[1].id, false)
  const update = calls.find((call) => call.operationName?.startsWith('Update'))
  assert.equal(update.parameters.entityName, 'cmps_fundercontracts')
  assert.equal(update.parameters.recordId, contractIds[1])
  assert.equal(update.parameters.item.cmps_isarchived, 125570001)
  assert.notEqual(update.parameters.recordId, funderId)
})
