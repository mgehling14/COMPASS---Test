import assert from 'node:assert/strict'
import { webcrypto } from 'node:crypto'
import { readFileSync } from 'node:fs'
import vm from 'node:vm'
import ts from 'typescript'

const schemaSource = readFileSync(new URL('../../.power/schemas/appschemas/dataSourcesInfo.ts', import.meta.url), 'utf8')
const schema = JSON.parse(schemaSource.slice(schemaSource.indexOf('{'), schemaSource.lastIndexOf('}') + 1))

export function funderTestHarness({ local = true, rowsByAlias = {}, pageSize = Infinity } = {}) {
  const calls = []
  const state = {
    cmps_fundercontracts: [
      { cmps_actualcontractid: '11111111-1111-1111-1111-111111111111', cmps_contractamount: 2500.50, cmps_remainingpoolofmoney: 2500.50 },
      { cmps_actualcontractid: '33333333-3333-3333-3333-333333333333', cmps_contractamount: 2500.50, cmps_remainingpoolofmoney: 2500.50 },
    ],
    cmps_fundertransactions: [],
    ...rowsByAlias,
  }
  let balanceFailures = 0
  let afterBalanceWrite = null
  function respond(name, alias, parameters) {
    const rows = state[alias] ||= []
    const identity = (row) => row.id || row.cmps_actualcontractid || row.cmps_fundertransactionid || row.cmps_funderid
    if (name.startsWith('List')) {
      const linkedId = String(parameters.$filter || '').match(/_cmps_activecontract_value eq ([\da-f-]+)/i)?.[1]
      const filtered = linkedId ? rows.filter((row) => row._cmps_activecontract_value === linkedId) : rows
      const start = Number(parameters.$skiptoken || 0)
      const end = start + pageSize
      return { value: filtered.slice(start, end), ...(end < filtered.length ? { '@odata.nextLink': `https://test.crm.dynamics.com/api/data/v9.2/${alias}?$skiptoken=${end}` } : {}) }
    }
    if (name.startsWith('Get')) {
      const row = rows.find((row) => identity(row) === parameters.recordId)
      if (!row) throw new Error('Record not found')
      return { ...row }
    }
    const balanceOnly = alias === 'cmps_fundercontracts' && Object.keys(parameters.item).length === 1 && 'cmps_remainingpoolofmoney' in parameters.item
    if (balanceOnly && balanceFailures-- > 0) throw new Error('Balance update permission denied')
    const id = parameters.recordId || parameters.item.cmps_fundertransactionid || webcrypto.randomUUID()
    let row = rows.find((row) => identity(row) === id)
    if (!row) { row = { [alias === 'cmps_fundercontracts' ? 'cmps_actualcontractid' : alias === 'cmps_fundertransactions' ? 'cmps_fundertransactionid' : 'cmps_funderid']: id }; rows.push(row) }
    Object.assign(row, parameters.item)
    for (const [key, value] of Object.entries(parameters.item)) {
      if (key.endsWith('@odata.bind')) row[`_${key.replace('@odata.bind', '')}_value`] = value.match(/\(([^)]+)\)/)[1]
    }
    if (balanceOnly && afterBalanceWrite) { const hook = afterBalanceWrite; afterBalanceWrite = null; hook(state) }
    return { ...row }
  }
  const cache = new Map()
  function load(filename) {
    if (cache.has(filename)) return cache.get(filename)
    const source = readFileSync(new URL(filename, import.meta.url), 'utf8').replaceAll('import.meta.env', '({})')
    const javascript = ts.transpileModule(source, { compilerOptions: { module: ts.ModuleKind.CommonJS, target: ts.ScriptTarget.ES2022 } }).outputText
    const service = { exports: {} }
    cache.set(filename, service.exports)
    vm.runInNewContext(javascript, {
      module: service, exports: service.exports, Headers, URL, URLSearchParams, crypto: webcrypto,
      window: { location: { hostname: local ? 'localhost' : 'powerapps.example' } },
      fetch: async (url, init = {}) => {
        calls.push({ url, init })
        const parsed = new URL(url)
        const path = parsed.pathname.split('/').at(-1)
        const [alias, id] = path.replace(')', '').split('(')
        const parameters = { ...Object.fromEntries(parsed.searchParams), ...(id ? { recordId: id } : {}), ...(init.body ? { item: JSON.parse(init.body) } : {}) }
        const operation = init.method === 'POST' ? 'CreateRecordWithOrganization' : init.method === 'PATCH' ? 'UpdateRecordWithOrganization' : id ? 'GetItemWithOrganization' : 'ListRecordsWithOrganization'
        const data = respond(operation, alias, parameters)
        return { ok: true, headers: new Headers(), json: async () => data }
      },
      require(name) {
        if (name === '@microsoft/power-apps/data') return { getClient: () => ({ executeAsync: async ({ connectorOperation: operation }) => {
          const api = schema.commondataserviceforapps.apis[operation.operationName]
          assert.ok(api, `Unsupported operation ${operation.operationName}`)
          for (const parameter of api.parameters.filter((entry) => entry.required && entry.name !== 'connectionId')) assert.notEqual(operation.parameters[parameter.name], undefined, `Missing ${parameter.name}`)
          calls.push(operation)
          return { success: true, data: respond(operation.operationName, operation.parameters.entityName, operation.parameters) }
        } }) }
        if (name.includes('dataSourcesInfo')) return { dataSourcesInfo: schema }
        if (name === './auth') return { getAuthToken: () => 'test-token', ensureAuthToken: async () => 'test-token' }
        if (name.startsWith('./')) return load(`${name}.ts`)
        throw new Error(`Unexpected dependency: ${name}`)
      },
    }, { filename })
    return service.exports
  }
  return {
    api: load('./funderAdmin.ts'), load, calls, state,
    failBalanceWrites(count = 1) { balanceFailures = count },
    afterNextBalanceWrite(hook) { afterBalanceWrite = hook },
  }
}
