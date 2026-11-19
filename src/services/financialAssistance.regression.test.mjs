import assert from 'node:assert/strict'
import { readFileSync } from 'node:fs'
import test from 'node:test'
import vm from 'node:vm'
import ts from 'typescript'

const alias = 'cmps_financialassistances'
const rowId = '11111111-1111-1111-1111-111111111111'
const enrollmentId = '22222222-2222-2222-2222-222222222222'

function harness(local = false) {
  const calls = []
  const result = { cmps_financialassistanceid: rowId, cmps_recordid: 'FA-046' }
  function load(name) {
    const module = { exports: {} }
    const source = readFileSync(new URL(name, import.meta.url), 'utf8').replaceAll('import.meta.env', '({})')
    vm.runInNewContext(ts.transpileModule(source, { compilerOptions: { module: ts.ModuleKind.CommonJS, target: ts.ScriptTarget.ES2022 } }).outputText, {
      module, exports: module.exports,
      window: { location: { hostname: local ? 'localhost' : 'powerapps.example' } },
      fetch: async (url, init) => { calls.push({ url, init }); return { ok: true, json: async () => result } },
      require(key) {
        if (key === '@microsoft/power-apps/data') return { getClient: () => ({ executeAsync: async ({ connectorOperation }) => { calls.push(connectorOperation); return { success: true, data: result } } }) }
        if (key.includes('dataSourcesInfo')) return { dataSourcesInfo: {} }
        if (key === '../../power.config.json') return JSON.parse(readFileSync(new URL('../../power.config.json', import.meta.url), 'utf8'))
        if (['./dataverseRecordPages', './dataverseContinuation'].includes(key)) return load(key + '.ts')
        if (key === './auth') return { getAuthToken: () => 'test', ensureAuthToken: async () => 'test' }
        if (key === './serviceSiteLabels') return { formatServiceSiteLabel: (value) => String(value || '') }
        if (key === './funderContractIdentity') return {}
        throw Error('Unexpected dependency: ' + key)
      },
    })
    return module.exports
  }
  return { load, calls }
}

test('Financial Assistance form and shared archive/search catalog use the corrected alias without changing record/lookup column mappings', () => {
  const h = harness(), api = h.load('./financialAssistance.ts'), archive = h.load('./archive.ts')
  assert.equal(api.FINANCIAL_ASSISTANCES_TABLE_ALIAS, alias)
  assert.equal(api.FINANCIAL_ASSISTANCES_PRIMARY_ID_FIELD, 'cmps_financialassistanceid')
  const table = archive.ARCHIVE_TABLES.find((table) => table.key === 'financial-assistance')
  assert.equal(table.tableAlias, alias)
  assert.equal(table.primaryIdField, 'cmps_financialassistanceid')
  assert.equal(table.recordIdField, 'cmps_recordid')
  assert.equal(table.enrollmentLookupField, '_cmps_peid_value')
})

for (const local of [false, true]) test((local ? 'local' : 'connector') + ' Financial Assistance create and update target the corrected table and preserve parent linkage', async () => {
  const h = harness(local), api = h.load('./financialAssistance.ts')
  const values = { cmps_recordid: 'FA-046', cmps_peid: enrollmentId, cmps_date: '2026-10-19', cmps_dollarvalue: '125.50', cmps_cashcardinkind: 'Cash' }
  assert.equal((await api.createFinancialAssistanceResponse(values)).id, rowId)
  await api.updateFinancialAssistanceResponse(rowId, values)
  assert.equal(h.calls.length, 2)
  for (const [index, call] of h.calls.entries()) {
    if (local) {
      assert.equal(call.init.method, index ? 'PATCH' : 'POST')
      assert.ok(new URL(call.url).pathname.endsWith('/' + alias + (index ? '(' + rowId + ')' : '')))
    } else {
      assert.equal(call.operationName, index ? 'UpdateRecordWithOrganization' : 'CreateRecordWithOrganization')
      assert.equal(call.parameters.entityName, alias)
      if (index) assert.equal(call.parameters.recordId, rowId)
    }
    const payload = local ? JSON.parse(call.init.body) : call.parameters.item
    assert.equal(payload['cmps_peid@odata.bind'], '/cmps_programenrollment1s(' + enrollmentId + ')')
    assert.equal(payload.cmps_dollarvalue, 125.5)
    assert.equal(payload.cmps_cashcardinkind, 125570000)
  }
})
