import assert from 'node:assert/strict'
import { readFileSync } from 'node:fs'
import test from 'node:test'
import vm from 'node:vm'
import ts from 'typescript'

test('differently named funders require explicit reviewed mappings and never infer similar names', async () => {
  const a = api(), h = fixture({ rows: [record(1, 125570003)], options: [{ value: 125570003, label: 'OVW-Late Life' }],
    funders: [target(100, 'OVW Late-Life')] }), signal = new AbortController().signal
  const automatic = await a.previewFunderTranslation(definition.key, h.gateway, signal)
  assert.equal(automatic.changes.length, 0); assert.equal(automatic.issues.length, 1)
  const explicit = await a.previewFunderTranslation(definition.key, h.gateway, signal, undefined, { 125570003: id(100) })
  assert.equal(explicit.changes.length, 1); assert.equal(explicit.changes[0].funderName, 'OVW Late-Life')
  const result = await a.translateFunders(explicit, h.gateway, 'Admin', signal)
  assert.equal(result.updated, 1); assert.equal(h.writes[0].payload['cmps_Funder1@odata.bind'], `/cmps_funders(${id(100)})`)
})
test('explicit mappings cannot reference missing or archived records or unrelated choice values', async () => {
  for (const override of [{ 125570007: id(999) }, { 125570007: id(100) }, { 99: id(101) }]) {
    const h = fixture({ funders: [target(100, 'VOCA', { cmps_isarchived: 125570000 }), target(101, 'Thrive')] })
    await assert.rejects(api().previewFunderTranslation(definition.key, h.gateway, new AbortController().signal, undefined, override), /Explicit Funder mapping/)
    assert.equal(h.writes.length, 0)
  }
})


const id = (number) => `11111111-1111-1111-1111-${number.toString(16).padStart(12, '0')}`
const definition = { key: 'program-enrollment', label: 'Program Enrollment', tableAlias: 'cmps_programenrollment1s', primaryIdField: 'cmps_programenrollment1id', legacyIdField: 'cmps_programenrollmentid', recordIdPrefix: 'PE' }
const funder = { key: 'funder', label: 'Funder', tableAlias: 'cmps_funders', primaryIdField: 'cmps_funderid' }
function api() {
  const module = { exports: {} }
  const source = readFileSync(new URL('./funderTranslation.ts', import.meta.url), 'utf8')
  vm.runInNewContext(ts.transpileModule(source, { compilerOptions: { module: ts.ModuleKind.CommonJS, target: ts.ScriptTarget.ES2022 } }).outputText, {
    module, exports: module.exports, URL, AbortController,
    require(name) {
      if (name === './archive') return { ARCHIVE_TABLES: [funder] }
      if (name === './legacyRecordMigration') return { LEGACY_MIGRATION_TABLES: [definition], createMigrationGateway: () => { throw new Error('Inject test gateway') } }
      if (name === './programTableSearch') return { createProgramSearchGateway: () => { throw new Error('Inject test gateway') } }
      if (name === './dataverseContinuation') return { continuationPageKey: (value) => new URL(value).searchParams.get('$skiptoken') || value }
      throw new Error(name)
    },
  })
  return module.exports
}
const metadata = () => ({
  LogicalName: 'cmps_programenrollment1', EntitySetName: definition.tableAlias, PrimaryIdAttribute: definition.primaryIdField,
  Attributes: [['cmps_funder', 'Picklist'], ['cmps_funder1', 'Lookup'], ['cmps_recordid', 'String'], ['cmps_modifiedby', 'String']].map(([LogicalName, AttributeType]) => ({ LogicalName, AttributeType, IsValidForUpdate: true })),
  ManyToOneRelationships: [{ ReferencingAttribute: 'cmps_funder1', ReferencedEntity: 'cmps_funder', ReferencingEntityNavigationPropertyName: 'cmps_Funder1' }],
})
const funderMetadata = () => ({ LogicalName: 'cmps_funder', EntitySetName: funder.tableAlias, PrimaryIdAttribute: funder.primaryIdField,
  Attributes: [{ LogicalName: 'cmps_name', AttributeType: 'String' }, { LogicalName: 'cmps_isarchived', AttributeType: 'Picklist' }], ManyToOneRelationships: [] })
const record = (number, choice = 125570007, extras = {}) => ({ cmps_programenrollment1id: id(number), cmps_recordid: `PE-${number}`, cmps_funder: choice, '@odata.etag': `W/"${number}"`, ...extras })
const target = (number, name = 'VOCA', extras = {}) => ({ cmps_funderid: id(number), cmps_name: name, cmps_isarchived: 125570001, ...extras })
function fixture({ rows = [record(1)], funders = [target(100)], pageSize = 1000, options = [{ value: 125570007, label: 'VOCA' }] } = {}) {
  const calls = [], writes = [], source = metadata(), funds = funderMetadata()
  const gateway = {
    choices: async (meta, field) => { assert.equal(meta.LogicalName, source.LogicalName); assert.equal(field, 'cmps_funder'); return options },
    reader: {
      metadata: async (def) => def.key === 'funder' ? funds : source,
      async page(meta, select, next, signal) {
        signal.throwIfAborted(); calls.push({ meta, select, next })
        const list = meta.EntitySetName === funds.EntitySetName ? funders : rows
        const page = next ? Number(new URL(next).searchParams.get('$skiptoken')) : 0
        return { rows: list.slice(page * pageSize, (page + 1) * pageSize), nextLink: list.length > (page + 1) * pageSize ? `https://org.example/api/data/v9.2/${meta.EntitySetName}?$skiptoken=${page + 1}` : '' }
      },
      async update(meta, rowId, payload, etag, signal) {
        signal.throwIfAborted(); writes.push({ meta, rowId, payload, etag })
        const row = rows.find((row) => row.cmps_programenrollment1id === rowId)
        assert.equal(etag, row['@odata.etag']); assert.notEqual(etag, '*')
        row._cmps_funder1_value = payload['cmps_Funder1@odata.bind'].match(/\(([^)]+)\)/)[1]
      },
    },
  }
  return { gateway, calls, writes, rows, funders, source, funds }
}
test('verified choice labels map to exact Funder names, preserve legacy ID/choice and audit creator, and rerun is idempotent', async () => {
  const a = api(), h = fixture({ funders: [target(100, '  voca  ', { cmps_activechoice: 125570001 })] }), signal = new AbortController().signal
  const plan = await a.previewFunderTranslation(definition.key, h.gateway, signal)
  assert.equal(h.writes.length, 0); assert.equal(plan.changes.length, 1); assert.equal(plan.navigation, 'cmps_Funder1')
  const result = await a.translateFunders(plan, h.gateway, 'IT Admin', signal)
  assert.equal(result.updated, 1)
  assert.deepEqual(JSON.parse(JSON.stringify(h.writes[0].payload)), { 'cmps_Funder1@odata.bind': `/cmps_funders(${id(100)})`, cmps_modifiedby: 'IT Admin' })
  assert.equal(h.rows[0].cmps_funder, 125570007); assert.equal(h.rows[0].cmps_recordid, 'PE-1')
  const again = await a.previewFunderTranslation(definition.key, h.gateway, signal)
  assert.equal(again.changes.length, 0); assert.equal(again.progress.unchanged, 1)
})
test('unknown, duplicate, archived, unmatched, conflicting links and unavailable versions are issues, not guessed links', async () => {
  const h = fixture({ rows: [
    record(1, 99), record(2, 1), record(3, 2), record(4, 3), record(5, 4, { _cmps_funder1_value: id(999) }),
    record(6, 4, { '@odata.etag': undefined }), record(7, null), record(8, 4, { _cmps_funder1_value: id(100) }), record(9, 4),
  ], funders: [target(10, 'Duplicate'), target(11, 'duplicate'), target(12, 'Archived', { cmps_isarchived: 125570000 }), target(100)],
    options: [{ value: 1, label: 'Duplicate' }, { value: 2, label: 'Archived' }, { value: 3, label: 'Missing' }, { value: 4, label: 'VOCA' }] })
  const plan = await api().previewFunderTranslation(definition.key, h.gateway, new AbortController().signal)
  assert.equal(plan.issues.length, 6); assert.equal(plan.progress.empty, 1); assert.equal(plan.progress.unchanged, 1)
  assert.equal(plan.changes.length, 1); assert.equal(plan.changes[0].id, id(9)); assert.equal(h.writes.length, 0)
})
test('all 25,050 records are scanned through 26 pages and archived enrollments are included without a row limit', async () => {
  const h = fixture({ rows: Array.from({ length: 25050 }, (_, index) => record(index + 1, 125570007, { cmps_isarchived: 125570000 })) })
  const plan = await api().previewFunderTranslation(definition.key, h.gateway, new AbortController().signal)
  assert.equal(plan.progress.read, 25050); assert.equal(plan.progress.pages, 26); assert.equal(plan.changes.length, 25050)
  assert.equal(h.writes.length, 0); assert.ok(h.calls.every((call) => call.select.includes(call.meta.PrimaryIdAttribute)))
})
test('invalid metadata, repeated pages, and preflight read failures stop before any writes', async () => {
  for (const kind of ['lookup', 'choice', 'repeated', 'read', 'duplicate-options']) {
    const a = api(), h = fixture({ rows: [record(1), record(2)], pageSize: 1 }), controller = new AbortController()
    if (kind === 'lookup') h.source.ManyToOneRelationships[0].ReferencedEntity = 'wrong'
    if (kind === 'choice') h.source.Attributes[0].AttributeType = 'String'
    if (kind === 'duplicate-options') h.gateway.choices = async () => [{ value: 1, label: 'A' }, { value: 1, label: 'B' }]
    const original = h.gateway.reader.page
    if (kind === 'read' || kind === 'repeated') h.gateway.reader.page = async (...args) => {
      if (args[2] && kind === 'read') throw new Error('Read failure')
      if (args[2] && kind === 'repeated') return { rows: [h.rows[0]], nextLink: '' }
      return original(...args)
    }
    await assert.rejects(a.previewFunderTranslation(definition.key, h.gateway, controller.signal))
    assert.equal(h.writes.length, 0, kind)
  }
})
test('fresh preflight refuses unreviewed choice/link/version or target changes', async () => {
  for (const mutate of [(h) => { h.rows[0]['@odata.etag'] = 'W/"new"' }, (h) => { h.rows[0]._cmps_funder1_value = id(999) }, (h) => { h.funders[0].cmps_isarchived = 125570000 }]) {
    const a = api(), h = fixture(), signal = new AbortController().signal
    const plan = await a.previewFunderTranslation(definition.key, h.gateway, signal)
    mutate(h)
    await assert.rejects(a.translateFunders(plan, h.gateway, 'Admin', signal), /changed since preview/)
    assert.equal(h.writes.length, 0)
  }
})
test('updates are version protected, limited to four in flight, and individually failed writes are reported', async () => {
  const a = api(), h = fixture({ rows: Array.from({ length: 12 }, (_, index) => record(index + 1)) }), signal = new AbortController().signal
  const plan = await a.previewFunderTranslation(definition.key, h.gateway, signal), original = h.gateway.reader.update
  let inFlight = 0, maximum = 0
  const issues = [], updated = []
  h.gateway.reader.update = async (...args) => {
    maximum = Math.max(maximum, ++inFlight)
    try { await new Promise((resolve) => setTimeout(resolve, 1)); if (args[1] === id(5)) throw new Error('412 version changed'); await original(...args) }
    finally { inFlight-- }
  }
  const result = await a.translateFunders(plan, h.gateway, 'Admin', signal, undefined, (issue) => issues.push(issue), (change) => updated.push(change))
  assert.equal(maximum, 4); assert.equal(result.updated, 11); assert.equal(result.failed, 1); assert.equal(issues.length, 1); assert.equal(updated.length, 11)
  assert.match(issues[0].message, /412/)
})
test('Stop settles in-flight updates, starts no further writes, and allows a safe fresh preview', async () => {
  const a = api(), h = fixture({ rows: Array.from({ length: 20 }, (_, index) => record(index + 1)) }), controller = new AbortController()
  const plan = await a.previewFunderTranslation(definition.key, h.gateway, controller.signal), original = h.gateway.reader.update
  h.gateway.reader.update = async (...args) => { await original(...args); controller.abort() }
  await assert.rejects(a.translateFunders(plan, h.gateway, 'Admin', controller.signal), /abort/i)
  assert.ok(h.writes.length <= 4); const next = await a.previewFunderTranslation(definition.key, h.gateway, new AbortController().signal)
  assert.equal(next.changes.length, 20 - h.writes.length)
})
test('translation requires a signed-in actor and rejects concurrent runs', async () => {
  const a = api(), h = fixture(), signal = new AbortController().signal
  const plan = await a.previewFunderTranslation(definition.key, h.gateway, signal)
  await assert.rejects(a.translateFunders(plan, h.gateway, '', signal), /identity/)
  let resolve
  const original = h.gateway.reader.update
  h.gateway.reader.update = async (...args) => { await new Promise((done) => { resolve = done }); await original(...args) }
  const pending = a.translateFunders(plan, h.gateway, 'Admin', signal)
  while (!resolve) await new Promise((done) => setTimeout(done, 1))
  await assert.rejects(a.translateFunders(plan, h.gateway, 'Admin', signal), /already running/)
  resolve(); await pending; assert.equal(h.writes.length, 1)
})
test('the new section is IT Admin only and is not mounted during View as User', () => {
  const app = readFileSync(new URL('../App.tsx', import.meta.url), 'utf8')
  assert.match(app, /canAccessRoleAdmin && adminPage === 'funder-translation' && !isUserPreview \? <FunderTranslationPanel savedBy=/)
  assert.match(app, /canAccessRoleAdmin \? <button[^\n]+setAdminPage\('funder-translation'\)/)
})

