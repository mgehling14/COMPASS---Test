import assert from 'node:assert/strict'
import { readFileSync } from 'node:fs'
import vm from 'node:vm'
import ts from 'typescript'
export const org = 'https://org1f466e4e.crm.dynamics.com'
export const id = (n) => `11111111-1111-1111-1111-${String(n).padStart(12, '0')}`
const text = readFileSync(new URL('../../.power/schemas/appschemas/dataSourcesInfo.ts', import.meta.url), 'utf8')
const schema = JSON.parse(text.slice(text.indexOf('{'), text.lastIndexOf('}') + 1))
const config = JSON.parse(readFileSync(new URL('../../power.config.json', import.meta.url), 'utf8'))
export function wrapped(next) {
  const environment = config.environmentId.replaceAll('-', '')
  const host = `${environment.slice(0, -2)}.${environment.slice(-2)}.environment.api.powerplatform.com`
  const connection = Object.values(config.connectionReferences).find((x) => x.id.endsWith('/shared_commondataserviceforapps')).sharedConnectionId.split('/').at(-1)
  return `https://${host}/connectors/runtime/invoke/scalegroups/usa/shards/00/apis/commondataserviceforapps/connections/${connection}/nextLink?${new URLSearchParams({ organization: org, next })}`
}
export function auditHarness(handler, local = false) {
  const calls = [], cache = new Map()
  function load(file) {
    if (cache.has(file)) return cache.get(file)
    const module = { exports: {} }; cache.set(file, module.exports)
    const source = readFileSync(new URL(file, import.meta.url), 'utf8').replaceAll('import.meta.env', '({})')
    vm.runInNewContext(ts.transpileModule(source, { compilerOptions: { module: ts.ModuleKind.CommonJS, target: ts.ScriptTarget.ES2022 } }).outputText, {
      module, exports: module.exports, URL, URLSearchParams, Headers,
      window: { location: { hostname: local ? 'localhost' : 'host.powerapps.com' } },
      fetch: async (url, init = {}) => {
        const parsed = new URL(url), path = parsed.pathname.split('/').at(-1), [alias, recordId] = path.replace(')', '').split('(')
        const call = { url, init, alias, write: init.method === 'PATCH', parameters: { ...Object.fromEntries(parsed.searchParams), ...(recordId ? { recordId } : {}), ...(init.body ? { item: JSON.parse(init.body) } : {}) } }
        calls.push(call); const data = await handler(call)
        return { ok: true, json: async () => data }
      },
      require(name) {
        if (name === '@microsoft/power-apps/data') return { getClient: () => ({ executeAsync: async ({ connectorOperation }) => {
          assert.ok(schema.commondataserviceforapps.apis[connectorOperation.operationName])
          const call = { ...connectorOperation, alias: connectorOperation.parameters.entityName, write: connectorOperation.operationName.startsWith('Update') }
          calls.push(call); return { success: true, data: await handler(call) }
        } }) }
        if (name.includes('dataSourcesInfo')) return { dataSourcesInfo: schema }
        if (name === '../../power.config.json') return config
        if (name === './auth') return { getAuthToken: () => 'mock', ensureAuthToken: async () => 'mock' }
        if (name.startsWith('./')) return load(name + '.ts')
        throw Error(`Unexpected dependency ${name}`)
      },
    })
    return module.exports
  }
  return { calls, load }
}
