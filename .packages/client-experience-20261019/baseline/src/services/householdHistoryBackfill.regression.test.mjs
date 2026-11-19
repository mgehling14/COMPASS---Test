import assert from 'node:assert/strict'
import { readFileSync } from 'node:fs'
import test from 'node:test'
import vm from 'node:vm'
import ts from 'typescript'

const id = (number) => `11111111-1111-1111-1111-${number.toString(16).padStart(12, '0')}`
const org = 'https://org1f466e4e.crm.dynamics.com'
const appConfig = JSON.parse(readFileSync(new URL('../../power.config.json', import.meta.url), 'utf8'))
const schemaText = readFileSync(new URL('../../.power/schemas/appschemas/dataSourcesInfo.ts', import.meta.url), 'utf8')
const schema = JSON.parse(schemaText.slice(schemaText.indexOf('{'), schemaText.lastIndexOf('}') + 1))
const connector = (next) => `https://default0528c75bbb2a4718b02a1902cc340b.62.environment.api.powerplatform.com/connectors/runtime/invoke/scalegroups/usa/shards/00/apis/commondataserviceforapps/connections/62736235ca85441e9b4ecd279e60c1f7/nextLink?${new URLSearchParams({ organization: org, next })}`

function harness({ local = true, respond = () => ({ value: [] }), failure } = {}) {
  const calls = []
  const cache = new Map()
  function load(file) {
    if (cache.has(file)) return cache.get(file)
    const source = readFileSync(new URL(file, import.meta.url), 'utf8').replaceAll('import.meta.env', '({})')
    const js = ts.transpileModule(source, { compilerOptions: { module: ts.ModuleKind.CommonJS, target: ts.ScriptTarget.ES2022 } }).outputText
    const module = { exports: {} }
    cache.set(file, module.exports)
    vm.runInNewContext(js, {
      module, exports: module.exports, URL, URLSearchParams, Headers, AbortController, setTimeout, clearTimeout,
      window: { location: { hostname: local ? 'localhost' : 'powerapps.example' } },
      fetch: async (url, init) => {
        calls.push({ url, init })
        if (failure) return { ok: false, text: async () => failure }
        return { ok: true, headers: new Headers(), json: async () => respond({ url, init }) }
      },
      require(name) {
        if (name === '@microsoft/power-apps/data') return { getClient: () => ({ executeAsync: async ({ connectorOperation: operation }) => {
          calls.push(operation)
          const api = schema.commondataserviceforapps.apis[operation.operationName]
          assert.ok(api)
          for (const parameter of api.parameters.filter((entry) => entry.required && entry.name !== 'connectionId')) assert.notEqual(operation.parameters[parameter.name], undefined, `Missing ${parameter.name}`)
          return failure ? { success: false, error: { message: failure } } : { success: true, data: await respond(operation) }
        } }) }
        if (name.includes('dataSourcesInfo')) return { dataSourcesInfo: schema }
        if (name === '../../power.config.json') return appConfig
        if (name === './auth') return { ensureAuthToken: async () => 'test-token', getAuthToken: () => 'test-token' }
        if (name.startsWith('./')) return load(`${name}.ts`)
        throw new Error(`Unexpected dependency: ${name}`)
      },
    }, { filename: file })
    return module.exports
  }
  return { api: load('./householdHistoryBackfill.ts'), load, calls }
}

function fakeGateway(clientCount = 8, historyCount = 5, pageSize = 2) {
  const clients = Array.from({ length: clientCount }, (_, index) => ({ cmps_clientprofileid: id(index + 1), cmps_recordid: `CP-04${index + 1}`, cmps_clientid: `L${index + 1}`, cmps_isarchived: index === 5 ? 125570000 : null }))
  const histories = Array.from({ length: historyCount }, (_, index) => ({ cmps_householdhistoryid: id(10000 + index), cmps_recordid: index === historyCount - 1 ? 'HHIST-045' : '',
    _cmps_clientid_value: index < 4 ? id(index + 1) : '', cmps_clientidlegacy: index === 4 ? 'L5' : '',
    _cmps_householdid_value: index === 1 ? id(20000) : null, cmps_status: index === 2 ? 125570001 : 125570000, cmps_isarchived: index === 3 ? 125570000 : null,
  }))
  const clientMetadata = { LogicalName: 'cmps_clientprofile', EntitySetName: 'cmps_clientprofiles', PrimaryIdAttribute: 'cmps_clientprofileid',
    Attributes: [{ LogicalName: 'cmps_isarchived', AttributeType: 'Picklist' }, { LogicalName: 'cmps_clientid', AttributeType: 'String' }], ManyToOneRelationships: [] }
  const historyMetadata = { LogicalName: 'cmps_householdhistory', EntitySetName: 'cmps_householdhistories', PrimaryIdAttribute: 'cmps_householdhistoryid',
    Attributes: [['cmps_recordid', 'String'], ['cmps_clientid', 'Lookup'], ['cmps_householdid', 'Lookup'], ['cmps_status', 'Picklist'], ['cmps_isarchived', 'Picklist'], ['cmps_clientidlegacy', 'String']].map(([LogicalName, AttributeType]) => ({ LogicalName, AttributeType })),
    ManyToOneRelationships: [{ ReferencingAttribute: 'cmps_clientid', ReferencedEntity: 'cmps_clientprofile' }] }
  const writes = []
  const scans = []
  let active = 0
  let peak = 0
  const gateway = {
    reader: {
      metadata: async (definition) => definition.key === 'client-profile' ? clientMetadata : historyMetadata,
      page: async (metadata, select, cursor, signal) => {
        signal.throwIfAborted()
        const rows = metadata === clientMetadata ? clients : histories
        const offset = Number(cursor || 0)
        scans.push({ table: metadata.EntitySetName, offset, select })
        return { rows: rows.slice(offset, offset + pageSize).map((row) => ({ ...row })), nextLink: offset + pageSize < rows.length ? String(offset + pageSize) : '' }
      },
    },
    eligible: async (client) => !histories.some((row) => row._cmps_clientid_value === client.id || row.cmps_clientidlegacy === client.legacyId),
    create: async (payload) => {
      active += 1; peak = Math.max(peak, active)
      await Promise.resolve()
      writes.push(payload)
      histories.push({ cmps_householdhistoryid: id(100000 + writes.length), _cmps_clientid_value: payload.clientRowId, cmps_recordid: payload.cmps_recordid, cmps_status: 125570000, _cmps_householdid_value: null })
      active -= 1
    },
  }
  return { gateway, clients, histories, writes, scans, peak: () => peak, clientMetadata, historyMetadata }
}

test('preview preserves all existing histories and skips archived clients, including legacy matches', async () => {
  const { api } = harness()
  const h = fakeGateway()
  const before = JSON.stringify(h.histories)
  const plan = await api.previewHouseholdHistoryBackfill(h.gateway, new AbortController().signal)
  assert.equal(plan.progress.clientsScanned, 8)
  assert.equal(plan.progress.historiesScanned, 5)
  assert.equal(plan.progress.existing, 5)
  assert.equal(plan.progress.archived, 1)
  assert.equal(plan.progress.eligible, 2)
  assert.equal(h.writes.length, 0)
  assert.equal(JSON.stringify(h.histories), before)
})

test('5,229 clients and 8,001 histories are completely paged; only missing histories get unique app IDs and reruns are idempotent', async () => {
  const { api } = harness()
  const h = fakeGateway(5229, 8001, 1000)
  const clientsBefore = JSON.stringify(h.clients)
  const originalHistories = JSON.stringify(h.histories)
  const result = await api.createMissingHouseholdHistories(h.gateway, new AbortController().signal)
  assert.equal(result.created, 5223)
  assert.equal(result.clientsScanned, 5229)
  assert.equal(result.historiesScanned, 8001)
  assert.ok(h.scans.some((page) => page.table === 'cmps_householdhistories' && page.offset === 8000))
  assert.ok(h.scans.some((page) => page.table === 'cmps_clientprofiles' && page.offset === 5000))
  assert.equal(h.writes[0].cmps_recordid, 'HHIST-046')
  assert.equal(new Set(h.writes.map((row) => row.cmps_recordid)).size, 5223)
  assert.equal(new Set(h.writes.map((row) => row.clientRowId)).size, 5223)
  assert.ok(h.writes.every((row) => row.cmps_status === 'Active' && !row.householdRowId))
  assert.ok(h.peak() <= 4)
  assert.equal(JSON.stringify(h.clients), clientsBefore)
  assert.equal(JSON.stringify(h.histories.slice(0, 8001)), originalHistories)
  const rerun = await api.createMissingHouseholdHistories(h.gateway, new AbortController().signal)
  assert.equal(rerun.created, 0)
  assert.equal(h.writes.length, 5223)
})

test('creation refreshes preview and rechecks each client so newly assigned/archived clients are skipped', async () => {
  const { api } = harness()
  const h = fakeGateway()
  await api.previewHouseholdHistoryBackfill(h.gateway, new AbortController().signal)
  h.gateway.eligible = async (client) => client.id !== id(7)
  const result = await api.createMissingHouseholdHistories(h.gateway, new AbortController().signal)
  assert.equal(result.created, 1)
  assert.equal(result.skipped, 1)
  assert.equal(h.writes[0].clientRowId, id(8))
})

test('preflight read, repeated paging and metadata failures cause zero creates', async () => {
  const { api } = harness()
  for (const kind of ['read', 'repeat', 'metadata']) {
    const h = fakeGateway()
    if (kind === 'metadata') h.historyMetadata.ManyToOneRelationships = []
    else h.gateway.reader.page = async () => { if (kind === 'read') throw new Error('Read forbidden'); return { rows: [], nextLink: 'same' } }
    await assert.rejects(api.createMissingHouseholdHistories(h.gateway, new AbortController().signal), /Read forbidden|paging repeated|verify/)
    assert.equal(h.writes.length, 0)
  }
})

test('an uncertain create is not retried and a fresh run recognizes the row that landed', async () => {
  const { api } = harness()
  const h = fakeGateway(7)
  const create = h.gateway.create
  let attempts = 0
  h.gateway.create = async (payload) => { attempts += 1; await create(payload); throw new Error('Response lost') }
  await assert.rejects(api.createMissingHouseholdHistories(h.gateway, new AbortController().signal), /Response lost.*run Preview again/)
  assert.equal(attempts, 1)
  h.gateway.create = create
  const rerun = await api.createMissingHouseholdHistories(h.gateway, new AbortController().signal)
  assert.equal(rerun.created, 0)
  assert.equal(h.writes.length, 1)
})

test('Stop settles in-flight writes and a rerun fills only the remaining histories', async () => {
  const { api } = harness()
  const h = fakeGateway(20)
  const abort = new AbortController()
  const create = h.gateway.create
  h.gateway.create = async (payload) => { await create(payload); abort.abort() }
  await assert.rejects(api.createMissingHouseholdHistories(h.gateway, abort.signal))
  const completed = h.writes.length
  assert.ok(completed > 0 && completed <= 4)
  h.gateway.create = create
  const rerun = await api.createMissingHouseholdHistories(h.gateway, new AbortController().signal)
  assert.equal(rerun.created, 14 - completed)
  assert.equal(new Set(h.writes.map((row) => row.clientRowId)).size, 14)
})

test('another create run cannot overlap a running or stopping backfill', async () => {
  const { api } = harness()
  const h = fakeGateway()
  const metadata = h.gateway.reader.metadata
  let release
  let held = false
  h.gateway.reader.metadata = async (...args) => { if (!held) { held = true; await new Promise((resolve) => { release = resolve }) } return metadata(...args) }
  const first = api.createMissingHouseholdHistories(h.gateway, new AbortController().signal)
  await assert.rejects(api.createMissingHouseholdHistories(h.gateway, new AbortController().signal), /already running/)
  release(); await first
})

for (const local of [true, false]) {
  test(`${local ? 'local' : 'runtime'} eligibility checks current archive status and includes inactive/archived and escaped legacy histories`, async () => {
    const fixture = fakeGateway()
    const plan = { clientMetadata: fixture.clientMetadata, historyMetadata: fixture.historyMetadata, legacyMatch: true }
    const h = harness({ local, respond: (call) => {
      const table = call.url ? new URL(call.url).pathname.split('/').pop() : call.parameters.entityName
      if (table === 'cmps_clientprofiles') return { value: [{ cmps_clientprofileid: id(7), cmps_isarchived: null, cmps_clientid: "L'7" }] }
      return { value: [{ cmps_householdhistoryid: id(100), cmps_clientidlegacy: "L'7", cmps_isarchived: 125570000, cmps_status: 125570001 }] }
    } })
    assert.equal(await h.api.createHouseholdBackfillGateway().eligible({ id: id(7) }, plan, new AbortController().signal), false)
    const filter = local ? new URL(h.calls[1].url).searchParams.get('$filter') : h.calls[1].parameters.$filter
    assert.ok(filter.includes("cmps_clientidlegacy eq 'L''7'"))
    assert.ok(!filter.includes('cmps_isarchived') && !filter.includes('cmps_status'))
  })

  test(`${local ? 'local' : 'runtime'} active member pool loads all 5,201 histories through valid continuation links`, async () => {
    const all = Array.from({ length: 5201 }, (_, index) => ({ cmps_householdhistoryid: id(10000 + index), _cmps_clientid_value: id(index + 1), cmps_status: 125570000, _cmps_householdid_value: null }))
    let page = 0
    const route = 'api/data/v9.1.0/cmps_householdhistories?$skiptoken=opaque%2B%25253C'
    const h = harness({ local, respond: () => ++page === 1 ? { value: all.slice(0, 5000), '@odata.nextLink': local ? `${org}/${route}` : connector(route) } : { value: all.slice(5000) } })
    const rows = await h.load('./householdHistory.ts').listActiveHouseholdCandidates()
    assert.equal(rows.length, 5201)
    assert.equal(new Set(rows.map((row) => row.clientRowId)).size, 5201)
    const first = local ? Object.fromEntries(new URL(h.calls[0].url).searchParams) : h.calls[0].parameters
    assert.ok(first.$filter.includes('cmps_status eq 125570000 and _cmps_householdid_value eq null'))
    assert.ok(first.$filter.includes('cmps_isarchived ne 125570000'))
    if (!local) { assert.equal(h.calls[1].operationName, 'GetNextPageWithOrganization'); assert.equal(h.calls[1].parameters.next, route) }
  })

  test(`${local ? 'local' : 'runtime'} automatic initial history creation is idempotent and writes Active with the correct client lookup`, async () => {
    let exists = false
    const h = harness({ local, respond: (call) => {
      const write = call.init?.method === 'POST' || call.operationName === 'CreateRecordWithOrganization'
      if (write) { exists = true; return { cmps_householdhistoryid: id(100) } }
      return { value: exists ? [{ cmps_householdhistoryid: id(100), _cmps_clientid_value: id(7), cmps_status: 125570001, cmps_isarchived: 125570000 }] : [] }
    } })
    const api = h.load('./householdHistory.ts')
    await api.createInitialHouseholdHistoryForClient(id(7))
    await api.createInitialHouseholdHistoryForClient(id(7))
    const writes = h.calls.filter((call) => call.init?.method === 'POST' || call.operationName === 'CreateRecordWithOrganization')
    assert.equal(writes.length, 1)
    const payload = local ? JSON.parse(writes[0].init.body) : writes[0].parameters.item
    assert.equal(payload.cmps_status, 125570000)
    assert.equal(payload.cmps_isarchived, 125570001)
    assert.equal(payload['cmps_clientid@odata.bind'], `/cmps_clientprofiles(${id(7)})`)
    assert.equal(payload['cmps_householdid@odata.bind'], null)
    const lastFilter = local ? new URL(h.calls.at(-1).url).searchParams.get('$filter') : h.calls.at(-1).parameters.$filter
    assert.ok(!lastFilter.includes('cmps_isarchived'), 'An archived previous history must not cause a duplicate initial row')
  })

  test(`${local ? 'local' : 'runtime'} unsafe/malformed history pages fail visibly and eligibility permission failures cannot create`, async () => {
    const bad = harness({ local, respond: () => ({ value: [], '@odata.nextLink': 'https://evil.example/api/data/v9.2/cmps_householdhistories?$skiptoken=private-cookie' }) })
    await assert.rejects(bad.load('./householdHistory.ts').listActiveHouseholdCandidates(), /Invalid continuation link/)
    assert.equal(bad.calls.length, 1)
    const malformed = harness({ local, respond: () => ({ unexpected: [] }) })
    await assert.rejects(malformed.load('./householdHistory.ts').listActiveHouseholdCandidates(), /did not return/)
    const denied = harness({ local, failure: 'Read forbidden' })
    const fixture = fakeGateway()
    await assert.rejects(denied.api.createHouseholdBackfillGateway().eligible({ id: id(7) }, { clientMetadata: fixture.clientMetadata, historyMetadata: fixture.historyMetadata }, new AbortController().signal), /Read forbidden/)
    assert.equal(denied.calls.length, 1)
  })
}

test('the backfill nav and panel are IT Admin-only; creation requires preview and offers Stop', () => {
  const app = readFileSync(new URL('../App.tsx', import.meta.url), 'utf8')
  const panel = readFileSync(new URL('./HouseholdHistoryBackfillPanel.tsx', import.meta.url), 'utf8')
  assert.match(app, /canAccessRoleAdmin \? <button[^\n]+setAdminPage\('household-history'\)/)
  assert.match(app, /canAccessRoleAdmin && adminPage === 'household-history' && !isUserPreview \? <HouseholdHistoryBackfillPanel/)
  assert.ok(panel.includes('Preview Missing Histories'))
  assert.match(panel, /disabled=\{busy \|\| !reviewed \|\| !progress\?\.eligible\}/)
  assert.ok(panel.includes('controller.current?.abort()'))
  assert.ok(panel.includes('No records were changed.'))
})
