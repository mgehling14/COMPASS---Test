import assert from 'node:assert/strict'
import { readFileSync } from 'node:fs'
import test from 'node:test'
import vm from 'node:vm'
import ts from 'typescript'

const id = '11111111-1111-1111-1111-111111111111'
const schemaText = readFileSync(new URL('../../.power/schemas/appschemas/dataSourcesInfo.ts', import.meta.url), 'utf8')
const schema = JSON.parse(schemaText.slice(schemaText.indexOf('{'), schemaText.lastIndexOf('}') + 1))
function harness(local, { definitions = [{ PrimaryIdAttribute: 'cmps_actualprimaryid' }], rows = [{ cmps_actualprimaryid: id, cmps_recordid: "ROI-O'Brien" }], failure } = {}) {
  const calls = [], module = { exports: {} }
  function reply(entityName, parameters) {
    calls.push({ entityName, parameters })
    if (entityName === 'EntityDefinitions') {
      assert.equal(parameters.$top, undefined); assert.equal(parameters.$skip, undefined)
      return { value: definitions }
    }
    return { value: rows }
  }
  const source = readFileSync(new URL('./savedRecordConfirmation.ts', import.meta.url), 'utf8').replaceAll('import.meta.env', '({})')
  const js = ts.transpileModule(source, { compilerOptions: { module: ts.ModuleKind.CommonJS, target: ts.ScriptTarget.ES2022 } }).outputText
  vm.runInNewContext(js, { module, exports: module.exports, URL, URLSearchParams,
    window: { location: { hostname: local ? 'localhost' : 'powerapps.example' } },
    fetch: async (url, init) => {
      assert.equal(init.body, undefined); assert.equal(init.method, undefined)
      const parsed = new URL(url), entity = parsed.pathname.split('/').at(-1)
      const data = reply(entity, Object.fromEntries(parsed.searchParams))
      return { ok: !failure, json: async () => data, text: async () => failure }
    }, require(name) {
      if (name.includes('dataSourcesInfo')) return { dataSourcesInfo: schema }
      if (name === './auth') return { ensureAuthToken: async () => 'token', getAuthToken: () => 'token' }
      if (name === '@microsoft/power-apps/data') return { getClient: () => ({ executeAsync: async ({ connectorOperation: operation }) => {
        assert.equal(operation.operationName, 'ListRecordsWithOrganization')
        for (const parameter of schema.commondataserviceforapps.apis[operation.operationName].parameters.filter((p) => p.required && p.name !== 'connectionId')) assert.notEqual(operation.parameters[parameter.name], undefined)
        const data = reply(operation.parameters.entityName, operation.parameters)
        return failure ? { success: false, error: { message: failure } } : { success: true, data }
      } }) }
      throw Error(`Unexpected ${name}`)
    },
  })
  return { api: module.exports, calls }
}
for (const local of [true, false]) {
  test(`${local ? 'local' : 'runtime'} save confirmation uses verified metadata and an exact escaped ID without writing`, async () => {
    const h = harness(local)
    assert.equal(await h.api.confirmSavedRecordId('cmps_forms', "ROI-O'Brien"), id)
    assert.equal(h.calls.length, 2); assert.equal(h.calls[1].parameters.$filter, "cmps_recordid eq 'ROI-O''Brien'")
    assert.equal(h.calls[1].parameters.$select, 'cmps_actualprimaryid,cmps_recordid')
    assert.equal(Number(h.calls[1].parameters.$top), 2)
  })
  test(`${local ? 'local' : 'runtime'} zero, duplicate, mismatched, and non-GUID matches fail closed`, async () => {
    for (const rows of [[], [{ cmps_actualprimaryid: id, cmps_recordid: 'wrong' }], [{ cmps_actualprimaryid: 'bad', cmps_recordid: "ROI-O'Brien" }], Array(2).fill({ cmps_actualprimaryid: id, cmps_recordid: "ROI-O'Brien" })]) {
      const h = harness(local, { rows })
      await assert.rejects(h.api.confirmSavedRecordId('cmps_forms', "ROI-O'Brien"), h.api.SaveConfirmationPendingError)
      assert.equal(h.calls.length, 2)
    }
  })
  test(`${local ? 'local' : 'runtime'} missing/ambiguous metadata and Dataverse failures report unconfirmed saves`, async () => {
    for (const options of [{ definitions: [] }, { definitions: [{ PrimaryIdAttribute: '' }] }, { definitions: Array(2).fill({ PrimaryIdAttribute: 'cmps_id' }) }, { failure: 'Read permission denied' }]) {
      const h = harness(local, options)
      await assert.rejects(h.api.confirmSavedRecordId('cmps_forms', "ROI-O'Brien"), /confirmation is pending/)
      assert.equal(h.calls.length, 1)
    }
  })
  test(`${local ? 'local' : 'runtime'} standalone Funder confirmation uses its name column only when explicitly selected`, async () => {
    const h = harness(local, { rows: [{ cmps_actualprimaryid: id, cmps_name: 'Funder' }] })
    assert.equal(await h.api.confirmSavedRecordId('cmps_funders', 'Funder', 'cmps_name'), id)
    assert.equal(h.calls[1].parameters.$filter, "cmps_name eq 'Funder'")
  })
}
test('invalid table names and blank identities cannot issue any confirmation requests', async () => {
  const h = harness(false)
  await assert.rejects(h.api.confirmSavedRecordId('invalid/tablename', 'ID'), /identified/)
  await assert.rejects(h.api.confirmSavedRecordId('cmps_forms', ' '), /identified/)
  assert.equal(h.calls.length, 0)
})
