import assert from 'node:assert/strict'
import { readFileSync } from 'node:fs'
import test from 'node:test'
import vm from 'node:vm'
import ts from 'typescript'

const rowId = '11111111-1111-1111-1111-111111111111'
const enrollmentId = '22222222-2222-2222-2222-222222222222'

function loadGoals(runtime) {
  const source = readFileSync(new URL('./goals.ts', import.meta.url), 'utf8').replaceAll('import.meta.env', '({})')
  const javascript = ts.transpileModule(source, { compilerOptions: { module: ts.ModuleKind.CommonJS, target: ts.ScriptTarget.ES2022 } }).outputText
  const module = { exports: {} }, writes = []
  const save = (item) => { writes.push(JSON.parse(JSON.stringify(item))) }
  vm.runInNewContext(javascript, {
    module, exports: module.exports, Headers, URL, URLSearchParams,
    window: { location: { hostname: runtime ? 'powerapps.example' : 'localhost' } },
    fetch: async (_url, init = {}) => {
      if (init.body) save(JSON.parse(init.body))
      return { ok: true, json: async () => ({ cmps_goalsid: rowId }) }
    },
    require(name) {
      if (name === '@microsoft/power-apps/data') return { getClient: () => ({ executeAsync: async ({ connectorOperation }) => {
        if (connectorOperation.parameters.item) save(connectorOperation.parameters.item)
        return { success: true, data: { cmps_goalsid: rowId } }
      } }) }
      if (name.includes('dataSourcesInfo')) return { dataSourcesInfo: {} }
      if (name === './auth') return { getAuthToken: () => 'test', ensureAuthToken: async () => 'test' }
      if (name === './archive') return { excludeArchived: (filter = '') => filter }
      if (name === './serviceSiteLabels') return { formatServiceSiteLabel: (value) => String(value || '').trim() }
      throw new Error(`Unexpected dependency: ${name}`)
    },
  }, { filename: 'goals.ts' })
  return { api: module.exports, writes }
}

for (const runtime of [false, true]) {
  test(`Goals ${runtime ? 'connector' : 'local'} create omits blank integer choices and dates`, async () => {
    const { api, writes } = loadGoals(runtime)
    await api.createGoalResponse({
      cmps_recordid: 'GOAL-001', cmps_peid: enrollmentId,
      cmps_goalcategory: 'Safety & Empowerment Goals', cmps_goal: 'Increase personal safety', cmps_goalstatus: 'No Change',
      cmps_servicesite: '', cmps_goaloutcomes: '', cmps_goalcompletiondate: '',
    })
    const item = writes.at(-1)
    assert.equal(item.cmps_goalcategory, '125570000')
    assert.equal(item.cmps_goal, '125570000')
    assert.equal(item.cmps_goalstatus, '125570000')
    assert.equal(Object.hasOwn(item, 'cmps_servicesite'), false)
    assert.equal(Object.hasOwn(item, 'cmps_goaloutcomes'), false)
    assert.equal(Object.hasOwn(item, 'cmps_goalcompletiondate'), false)
  })

  test(`Goals ${runtime ? 'connector' : 'local'} edit clears blank choices and dates with null`, async () => {
    const { api, writes } = loadGoals(runtime)
    await api.updateGoalResponse(rowId, { cmps_servicesite: '', cmps_goaloutcomes: '', cmps_goalcompletiondate: '' })
    const item = writes.at(-1)
    assert.equal(item.cmps_servicesite, null)
    assert.equal(item.cmps_goaloutcomes, null)
    assert.equal(item.cmps_goalcompletiondate, null)

    await api.updateGoalResponse(rowId, { cmps_servicesite: undefined, cmps_goaloutcomes: undefined, cmps_goalcompletiondate: undefined })
    const sparse = writes.at(-1)
    assert.equal(Object.hasOwn(sparse, 'cmps_servicesite'), false)
    assert.equal(Object.hasOwn(sparse, 'cmps_goaloutcomes'), false)
    assert.equal(Object.hasOwn(sparse, 'cmps_goalcompletiondate'), false)
  })

  test(`Goals ${runtime ? 'connector' : 'local'} saves one Goal Outcome as one Edm.Int32 choice and rejects multiple values`, async () => {
    const { api, writes } = loadGoals(runtime)
    const outcome = api.GOAL_OUTCOME_OPTIONS[3]
    assert.equal(api.GOAL_FIELDS.find((field) => field.field === 'cmps_goaloutcomes').input, 'select')
    await api.createGoalResponse({ cmps_recordid: 'GOAL-002', cmps_peid: enrollmentId, cmps_goaloutcomes: outcome })
    assert.equal(writes.at(-1).cmps_goaloutcomes, '125570003')
    const count = writes.length
    await assert.rejects(api.createGoalResponse({ cmps_recordid: 'GOAL-003', cmps_peid: enrollmentId, cmps_goaloutcomes: `${api.GOAL_OUTCOME_OPTIONS[0]}, ${outcome}` }), /allows one selection/)
    assert.equal(writes.length, count)
  })
}

test('Goals editor renders Goal Outcome as a single select control', () => {
  const source = readFileSync(new URL('../App.tsx', import.meta.url), 'utf8')
  assert.doesNotMatch(source, /function updateGoalOutcomes/)
  assert.doesNotMatch(source, /GOAL_OUTCOME_OPTIONS\.map/)
})
