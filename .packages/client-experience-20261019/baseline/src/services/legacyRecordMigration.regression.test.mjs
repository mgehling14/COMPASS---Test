import assert from 'node:assert/strict'
import { readFileSync } from 'node:fs'
import test from 'node:test'
import vm from 'node:vm'
import ts from 'typescript'

for (const local of [true, false]) test(`${local ? 'local' : 'runtime'} funder translator uses verified option metadata, full continuation pages and version-protected lookup updates`, async () => {
  const source = { LogicalName: 'cmps_programenrollment1', EntitySetName: 'cmps_programenrollment1s', PrimaryIdAttribute: 'cmps_programenrollment1id',
    Attributes: [['cmps_funder', 'Picklist'], ['cmps_funder1', 'Lookup'], ['cmps_recordid', 'String'], ['cmps_modifiedby', 'String']].map(([LogicalName, AttributeType]) => ({ LogicalName, AttributeType, IsValidForUpdate: true })),
    ManyToOneRelationships: [{ ReferencingAttribute: 'cmps_funder1', ReferencingEntityNavigationPropertyName: 'cmps_Funder1', ReferencedEntity: 'cmps_funder' }] }
  const funds = { LogicalName: 'cmps_funder', EntitySetName: 'cmps_funders', PrimaryIdAttribute: 'cmps_funderid',
    Attributes: [{ LogicalName: 'cmps_name', AttributeType: 'String' }, { LogicalName: 'cmps_isarchived', AttributeType: 'Picklist' }], ManyToOneRelationships: [] }
  const records = [sourceId, otherId].map((rowId, index) => ({ cmps_programenrollment1id: rowId, cmps_recordid: `PE-${index + 46}`, cmps_funder: 125570006, '@odata.etag': `W/"${index + 1}"` }))
  const writes = []
  const h = harness({ local, respond(call) {
    const url = local ? new URL(call.url) : null
    const entity = local ? decodeURIComponent(url.pathname.split('/api/data/v9.2/')[1]) : call.parameters.entityName
    const parameters = local ? Object.fromEntries(url.searchParams) : call.parameters
    if (call.init?.method === 'PATCH' || call.operationName?.startsWith('Update')) {
      const rowId = local ? entity.match(/\(([^)]+)\)/)[1] : parameters.recordId
      const payload = local ? JSON.parse(call.init.body) : parameters.item
      const row = records.find((row) => row.cmps_programenrollment1id === rowId)
      assert.equal(local ? call.init.headers['If-Match'] : parameters['If-Match'], row['@odata.etag'])
      assert.equal(payload['cmps_Funder1@odata.bind'], `/cmps_funders(${parentId})`)
      assert.equal(payload.cmps_modifiedby, 'IT Admin'); assert.equal(payload.cmps_createdby, undefined)
      row._cmps_funder1_value = parentId; writes.push(rowId); return {}
    }
    if (entity.includes('/Attributes')) {
      assert.match(entity, /PicklistAttributeMetadata/)
      return { OptionSet: { Options: [{ Value: 125570006, Label: { UserLocalizedLabel: { Label: 'VOCA' } } }] } }
    }
    if (entity === 'EntityDefinitions') return { value: [parameters.$filter.includes('cmps_funders') ? funds : source] }
    if (entity === 'cmps_funders') return { value: [{ cmps_funderid: parentId, cmps_name: 'VOCA', cmps_isarchived: 125570001 }] }
    assert.equal(entity, 'cmps_programenrollment1s')
    assert.ok(parameters.$select.split(',').includes('_cmps_funder1_value'))
    assert.equal(parameters.$filter, undefined, 'include archived and imported records')
    const next = parameters.next || parameters.$skiptoken
    if (next) return { value: [records[1]] }
    const link = `${org}/api/data/v9.2/cmps_programenrollment1s?${new URLSearchParams({ '$select': parameters.$select, '$orderby': parameters.$orderby, '$skiptoken': 'page2' })}`
    return { value: [records[0]], '@odata.nextLink': local ? link : connectorLink(link) }
  } })
  const a = h.load('./funderTranslation.ts'), gateway = a.createFunderTranslationGateway(), signal = new AbortController().signal
  const plan = await a.previewFunderTranslation('program-enrollment', gateway, signal)
  assert.equal(plan.changes.length, 2); assert.equal(plan.progress.pages, 2); assert.equal(writes.length, 0)
  const result = await a.translateFunders(plan, gateway, 'IT Admin', signal)
  assert.equal(result.updated, 2); assert.equal(writes.length, 2)
  const again = await a.previewFunderTranslation('program-enrollment', gateway, signal)
  assert.equal(again.changes.length, 0); assert.equal(again.progress.unchanged, 2)
})


const org = 'https://org1f466e4e.crm.dynamics.com'
const appConfig = JSON.parse(readFileSync(new URL('../../power.config.json', import.meta.url), 'utf8'))
// The exact connector endpoint reported by the user, with deliberately opaque
// paging-cookie characters to catch accidental double decoding/encoding.
const connectorEndpoint = 'https://default0528c75bbb2a4718b02a1902cc340b.62.environment.api.powerplatform.com/connectors/runtime/invoke/scalegroups/usa/shards/00/apis/commondataserviceforapps/connections/62736235ca85441e9b4ecd279e60c1f7/nextLink'
function connectorLink(next, organization = org) {
  return `${connectorEndpoint}?${new URLSearchParams({ organization, next })}`
}
const schemaText = readFileSync(new URL('../../.power/schemas/appschemas/dataSourcesInfo.ts', import.meta.url), 'utf8')
const schema = JSON.parse(schemaText.slice(schemaText.indexOf('{'), schemaText.lastIndexOf('}') + 1))
const id = (value) => `11111111-1111-1111-1111-${value.toString(16).padStart(12, '0')}`
const sourceId = id(100)
const parentId = id(200)
const otherId = id(300)
const options = { preview: false, migrateLinks: true, lookupAttribute: 'cmps_cpid', replaceExisting: false }

function harness({ local = true, responses = [], runtimeFailure, respond } = {}) {
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
      fetch: async (url, init) => { calls.push({ url, init }); const data = respond ? await respond({ url, init }) : responses.shift(); return { ok: true, headers: new Headers(), json: async () => data } },
      require(name) {
        if (name === '@microsoft/power-apps/data') return { getClient: () => ({ executeAsync: async ({ connectorOperation: operation }) => {
          const api = schema.commondataserviceforapps.apis[operation.operationName]
          assert.ok(api, `Unsupported operation: ${operation.operationName}`)
          for (const parameter of api.parameters.filter((entry) => entry.required && entry.name !== 'connectionId')) assert.notEqual(operation.parameters[parameter.name], undefined, `Missing parameter: ${parameter.name}`)
          calls.push(operation)
          if (runtimeFailure) throw runtimeFailure
          return { success: true, data: respond ? await respond(operation) : responses.shift() }
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
  return { api: load('./legacyRecordMigration.ts'), calls, load }
}

function fixture(api, key = 'adult-assessment') {
  const definition = api.LEGACY_MIGRATION_TABLES.find((entry) => entry.key === key)
  const parentDefinition = api.LEGACY_MIGRATION_TABLES.find((entry) => entry.key === definition.parentKey)
  const metadata = (definition) => ({
    LogicalName: definition.key === 'client-profile' ? 'cmps_clientprofile' : definition.key === 'program-enrollment' ? 'cmps_programenrollment1' : 'cmps_adultassessment',
    EntitySetName: definition.tableAlias, PrimaryIdAttribute: definition.primaryIdField,
    Attributes: [
      { LogicalName: definition.legacyIdField, AttributeType: 'String', IsValidForUpdate: true },
      { LogicalName: 'cmps_recordid', AttributeType: 'String', IsValidForUpdate: true },
      ...(definition.parentLegacyField ? [{ LogicalName: definition.parentLegacyField, AttributeType: 'String' }] : []),
      { LogicalName: 'cmps_cpid', AttributeType: 'Lookup', IsValidForUpdate: true },
      { LogicalName: 'cmps_peid', AttributeType: 'Lookup', IsValidForUpdate: true },
    ],
    ManyToOneRelationships: [{ ReferencingAttribute: 'cmps_cpid', ReferencingEntityNavigationPropertyName: 'cmps_ClientProfileNavigation', ReferencedEntity: 'cmps_clientprofile' }],
  })
  const source = metadata(definition)
  const parent = parentDefinition ? metadata(parentDefinition) : undefined
  if (parentDefinition?.key === 'program-enrollment') source.ManyToOneRelationships = [{ ReferencingAttribute: 'cmps_peid', ReferencingEntityNavigationPropertyName: 'cmps_EnrollmentNavigation', ReferencedEntity: parent.LogicalName }]
  const lookups = [...source.ManyToOneRelationships]
  const plan = { definition, source, parent, parentDefinition, lookups }
  if (key === 'voca-form') {
    const clientDefinition = api.LEGACY_MIGRATION_TABLES.find((entry) => entry.key === 'client-profile')
    const clientMetadata = metadata(clientDefinition)
    source.Attributes.push({ LogicalName: 'cmps_clientid', AttributeType: 'String' })
    const lookup = { ReferencingAttribute: 'cmps_cpid', ReferencingEntityNavigationPropertyName: 'cmps_ClientProfileNavigation', ReferencedEntity: clientMetadata.LogicalName }
    source.ManyToOneRelationships.push(lookup)
    plan.additionalParents = [{ parentLegacyField: 'cmps_clientid', parentDefinition: clientDefinition, parent: clientMetadata, lookup, whenPrimaryUnresolved: true }]
  }
  return plan
}

function fakeGateway(plan, sourceRows, parentRows = [], pageSize = 2, additionalRows = []) {
  const sourceById = new Map(sourceRows.map((row) => [row[plan.source.PrimaryIdAttribute], row]))
  const calls = []
  const writes = []
  let active = 0
  let peak = 0
  const gateway = {
    metadata: async (definition) => definition.key === plan.definition.key ? plan.source : plan.additionalParents?.find((entry) => entry.parentDefinition.key === definition.key)?.parent || plan.parent,
    page: async (metadata, select, nextLink, signal) => {
      signal.throwIfAborted()
      const start = Number(nextLink || 0)
      const extraIndex = (plan.additionalParents || []).findIndex((entry) => entry.parent === metadata)
      const rows = metadata === plan.source ? sourceRows : extraIndex >= 0 ? additionalRows[extraIndex] || [] : parentRows
      const end = start + pageSize
      calls.push({ table: metadata.EntitySetName, select, start })
      return { rows: rows.slice(start, end).map((row) => ({ ...row })), nextLink: end < rows.length ? String(end) : '' }
    },
    update: async (metadata, rowId, payload, etag, signal) => {
      signal.throwIfAborted()
      active += 1; peak = Math.max(peak, active)
      await Promise.resolve()
      const row = sourceById.get(rowId)
      Object.assign(row, payload)
      const binding = payload[`${plan.lookups[0]?.ReferencingEntityNavigationPropertyName}@odata.bind`]
      if (binding) row[`_${plan.lookups[0].ReferencingAttribute}_value`] = binding.match(/\(([^)]+)\)/)[1]
      for (const entry of plan.additionalParents || []) {
        const extraBinding = payload[`${entry.lookup.ReferencingEntityNavigationPropertyName}@odata.bind`]
        if (extraBinding) row[`_${entry.lookup.ReferencingAttribute}_value`] = extraBinding.match(/\(([^)]+)\)/)[1]
      }
      writes.push({ table: metadata.EntitySetName, rowId, payload, etag })
      active -= 1
    },
  }
  return { gateway, calls, writes, peak: () => peak }
}

function householdHistoryFixture(api, rows, clients, households, pageSize = 2) {
  const plan = fixture(api, 'household-history')
  plan.source.LogicalName = 'cmps_householdhistory'
  const householdDefinition = api.LEGACY_MIGRATION_TABLES.find((entry) => entry.key === 'household')
  const household = {
    LogicalName: 'cmps_household', EntitySetName: householdDefinition.tableAlias, PrimaryIdAttribute: householdDefinition.primaryIdField,
    Attributes: [{ LogicalName: 'cmps_householdidlegacy', AttributeType: 'String' }], ManyToOneRelationships: [],
  }
  const relationship = { ReferencingAttribute: 'cmps_householdid', ReferencingEntityNavigationPropertyName: 'cmps_HouseholdNavigation', ReferencedEntity: 'cmps_household' }
  plan.source.Attributes.push({ LogicalName: 'cmps_householdid', AttributeType: 'Lookup', IsValidForUpdate: true })
  plan.source.ManyToOneRelationships.push(relationship)
  // Keep Client Profile as the independently selected primary destination.
  plan.lookups = [plan.source.ManyToOneRelationships[0]]
  plan.additionalParents = [{ parentLegacyField: 'cmps_householdidlegacy', parentDefinition: householdDefinition, parent: household, lookup: relationship }]
  const h = fakeGateway(plan, rows, clients, pageSize)
  const read = h.gateway.page
  const update = h.gateway.update
  h.gateway.metadata = async (definition) => definition.key === 'household-history' ? plan.source : definition.key === 'household' ? household : plan.parent
  h.gateway.page = async (metadata, select, nextLink, signal) => {
    if (metadata !== household) return read(metadata, select, nextLink, signal)
    signal.throwIfAborted()
    const start = Number(nextLink || 0)
    const end = start + pageSize
    h.calls.push({ table: metadata.EntitySetName, select, start })
    return { rows: households.slice(start, end).map((row) => ({ ...row })), nextLink: end < households.length ? String(end) : '' }
  }
  h.gateway.update = async (metadata, rowId, payload, etag, signal) => {
    await update(metadata, rowId, payload, etag, signal)
    const binding = payload['cmps_HouseholdNavigation@odata.bind']
    if (binding) rows.find((row) => row[plan.source.PrimaryIdAttribute] === rowId)._cmps_householdid_value = binding.match(/\(([^)]+)\)/)[1]
  }
  return { ...h, plan, household, relationship }
}

test('household history previews and saves Client Profile and Household links together with sequential app IDs', async () => {
  const { api } = harness()
  const rows = [
    { cmps_householdhistoryid: sourceId, cmps_householdidlegacy: ' 001 ', cmps_clientidlegacy: 'C1', cmps_recordid: '001' },
    { cmps_householdhistoryid: otherId, cmps_householdidlegacy: '001', cmps_clientidlegacy: 'C1', cmps_recordid: 'HHIST-045' },
  ]
  const h = householdHistoryFixture(api, rows, [{ cmps_clientprofileid: parentId, cmps_clientid: 'C1' }], [
    { cmps_householdid: id(400), cmps_householdidlegacy: '001', cmps_recordid: 'HH-040' },
    { cmps_householdid: id(401), cmps_householdidlegacy: '1', cmps_recordid: '001' },
  ], 1)
  const plan = await api.inspectLegacyMigrationTable('household-history', h.gateway, new AbortController().signal)
  assert.equal(plan.lookups.length, 1)
  assert.equal(plan.additionalParents[0].lookup.ReferencingAttribute, 'cmps_householdid')
  assert.equal(plan.additionalParents[0].lookup.ReferencingEntityNavigationPropertyName, 'cmps_HouseholdNavigation')
  const changes = []
  const preview = await api.runLegacyMigration(plan, { ...options, preview: true }, h.gateway, new AbortController().signal, { change: (value) => changes.push(value) })
  assert.equal(preview.counts.updated, 2); assert.equal(preview.counts.recordIds, 1); assert.equal(preview.counts.links, 4)
  assert.equal(preview.counts.issues, 0); assert.equal(h.writes.length, 0)
  assert.deepEqual(changes.map((change) => change.lookupField), ['cmps_cpid', 'cmps_householdid', 'cmps_cpid', 'cmps_householdid'])
  assert.equal(changes[1].lookupId, id(400)); assert.equal(changes[0].recordId, 'HHIST-046')
  const result = await api.runLegacyMigration(plan, options, h.gateway, new AbortController().signal, {})
  assert.equal(result.counts.links, 4); assert.equal(h.writes.length, 2)
  assert.deepEqual({ ...h.writes[0].payload }, { cmps_recordid: 'HHIST-046', 'cmps_ClientProfileNavigation@odata.bind': `/cmps_clientprofiles(${parentId})`, 'cmps_HouseholdNavigation@odata.bind': `/cmps_households(${id(400)})` })
  assert.equal(rows[1].cmps_recordid, 'HHIST-045'); assert.equal(rows[0].cmps_householdidlegacy, ' 001 ')
  assert.equal(rows[0].cmps_clientidlegacy, 'C1')
  const rerun = await api.runLegacyMigration(plan, options, h.gateway, new AbortController().signal, {})
  assert.equal(rerun.counts.updated, 0); assert.equal(h.writes.length, 2)
})

test('household duplicate, missing, blank and conflicting matches never guess or clear links', async () => {
  const { api } = harness()
  const rows = ['duplicate', 'missing', '', 'valid'].map((legacy, index) => ({ cmps_householdhistoryid: id(index + 1), cmps_householdidlegacy: legacy, cmps_clientidlegacy: 'C1', cmps_recordid: `HHIST-04${index + 1}`, _cmps_householdid_value: otherId }))
  const h = householdHistoryFixture(api, rows, [{ cmps_clientprofileid: parentId, cmps_clientid: 'C1' }], [
    { cmps_householdid: id(400), cmps_householdidlegacy: 'duplicate' },
    { cmps_householdid: id(401), cmps_householdidlegacy: 'valid' },
    { cmps_householdid: id(402), cmps_householdidlegacy: 'duplicate' },
  ], 1)
  const issues = []
  const result = await api.runLegacyMigration(h.plan, options, h.gateway, new AbortController().signal, { issue: (value) => issues.push(value) })
  assert.equal(result.counts.links, 4); assert.equal(result.counts.recordIds, 0)
  assert.equal(result.counts.issues, 4)
  for (const issue of issues) assert.match(issue.message, /cmps_householdid \(cmps_householdidlegacy=/)
  assert.match(issues[0].message, /Multiple parent/); assert.match(issues[1].message, /No parent/)
  assert.match(issues[2].message, /empty/); assert.match(issues[3].message, /Existing lookup differs/)
  assert.ok(rows.every((row) => row._cmps_householdid_value === otherId && row._cmps_cpid_value === parentId))
  const replacement = await api.runLegacyMigration(h.plan, { ...options, replaceExisting: true }, h.gateway, new AbortController().signal, {})
  assert.equal(replacement.counts.links, 1); assert.equal(rows[3]._cmps_householdid_value, id(401))
  assert.equal(rows[0]._cmps_householdid_value, otherId)
})

test('ambiguous client matches do not prevent an independently resolved household link', async () => {
  const { api } = harness()
  const h = householdHistoryFixture(api, [{ cmps_householdhistoryid: sourceId, cmps_householdidlegacy: 'H1', cmps_clientidlegacy: 'C1' }], [
    { cmps_clientprofileid: parentId, cmps_clientid: 'C1' }, { cmps_clientprofileid: otherId, cmps_clientid: 'C1' },
  ], [{ cmps_householdid: id(400), cmps_householdidlegacy: 'H1' }])
  const result = await api.runLegacyMigration(h.plan, options, h.gateway, new AbortController().signal, {})
  assert.equal(result.counts.links, 1); assert.equal(result.counts.issues, 1)
  assert.equal(h.writes[0].payload['cmps_ClientProfileNavigation@odata.bind'], undefined)
  assert.equal(h.writes[0].payload['cmps_HouseholdNavigation@odata.bind'], `/cmps_households(${id(400)})`)
})

test('household lookup schema must be verified; IDs-only mode does not inspect or read either parent', async () => {
  const { api } = harness()
  const h = householdHistoryFixture(api, [{ cmps_householdhistoryid: sourceId, cmps_householdidlegacy: 'H1' }], [], [])
  const attribute = h.plan.source.Attributes.find((entry) => entry.LogicalName === 'cmps_householdid')
  attribute.IsValidForUpdate = false
  await assert.rejects(api.inspectLegacyMigrationTable('household-history', h.gateway, new AbortController().signal), /cmps_householdid must be a unique writable lookup/)
  attribute.IsValidForUpdate = true
  h.relationship.ReferencedEntity = 'cmps_clientprofile'
  await assert.rejects(api.inspectLegacyMigrationTable('household-history', h.gateway, new AbortController().signal), /cmps_householdid must be a unique writable lookup/)
  h.relationship.ReferencedEntity = 'cmps_household'
  h.plan.source.ManyToOneRelationships.push({ ...h.relationship, ReferencingEntityNavigationPropertyName: 'ambiguous' })
  await assert.rejects(api.inspectLegacyMigrationTable('household-history', h.gateway, new AbortController().signal), /unique writable lookup/)
  assert.equal(h.writes.length, 0)
  const metadataCalls = []
  const metadata = h.gateway.metadata
  h.gateway.metadata = async (definition, signal) => { metadataCalls.push(definition.key); return metadata(definition, signal) }
  const plan = await api.inspectLegacyMigrationTable('household-history', h.gateway, new AbortController().signal, false)
  assert.deepEqual(metadataCalls, ['household-history'])
  await api.runLegacyMigration(plan, { ...options, migrateLinks: false }, h.gateway, new AbortController().signal, {})
  assert.ok(h.calls.every((call) => call.table === plan.source.EntitySetName))
  assert.deepEqual({ ...h.writes[0].payload }, { cmps_recordid: 'HHIST-041' })
})

test('large household-history migration indexes both paged parent tables once and counts two links per record', async () => {
  const { api } = harness()
  const rows = Array.from({ length: 10001 }, (_, index) => ({ cmps_householdhistoryid: id(index + 1), cmps_householdidlegacy: `H${index % 5201}`, cmps_clientidlegacy: `C${index % 5201}` }))
  const clients = Array.from({ length: 5201 }, (_, index) => ({ cmps_clientprofileid: id(index + 20000), cmps_clientid: `C${index}` }))
  const households = Array.from({ length: 5201 }, (_, index) => ({ cmps_householdid: id(index + 30000), cmps_householdidlegacy: `H${index}` }))
  const h = householdHistoryFixture(api, rows, clients, households, 1000)
  const result = await api.runLegacyMigration(h.plan, options, h.gateway, new AbortController().signal, {})
  assert.equal(result.counts.updated, 10001); assert.equal(result.counts.links, 20002); assert.equal(result.counts.issues, 0)
  assert.equal(h.calls.filter((call) => call.table === 'cmps_clientprofiles').length, 6)
  assert.equal(h.calls.filter((call) => call.table === 'cmps_households').length, 6)
  assert.equal(h.calls.filter((call) => call.table === 'cmps_householdhistories').length, 22)
  assert.equal(new Set(rows.map((row) => row.cmps_recordid)).size, 10001)
  assert.equal(rows.at(-1)._cmps_householdid_value, id(30000 + 10000 % 5201))
  assert.ok(h.calls.filter((call) => call.table === 'cmps_householdhistories' && call.select.includes('cmps_householdidlegacy')).every((call) => call.select.includes('_cmps_householdid_value') && call.select.includes('_cmps_cpid_value')))
})

test('old single-parent household-history checkpoints are rejected and missing additional mappings cannot write', async () => {
  const { api } = harness()
  const h = householdHistoryFixture(api, [], [], [])
  const oldFingerprint = JSON.parse(api.migrationFingerprint(h.plan, options))
  oldFingerprint.splice(-2, 1)
  const checkpoint = { version: 2, fingerprint: JSON.stringify(oldFingerprint), nextLink: '1000', counts: { ...api.EMPTY_MIGRATION_COUNTS }, complete: false }
  await assert.rejects(api.runLegacyMigration(h.plan, options, h.gateway, new AbortController().signal, {}, checkpoint), /checkpoint does not match/)
  await assert.rejects(api.runLegacyMigration({ ...h.plan, additionalParents: [] }, options, h.gateway, new AbortController().signal, {}), /Check all additional parent/)
  assert.equal(h.calls.length, 0); assert.equal(h.writes.length, 0)
  const idsOnlyFingerprint = JSON.parse(api.migrationFingerprint(h.plan, { ...options, migrateLinks: false }))
  assert.equal(idsOnlyFingerprint.length, oldFingerprint.length)
})

test('household-history stop and resume safely replay both lookups without renumbering completed records', async () => {
  const { api } = harness()
  const rows = Array.from({ length: 6 }, (_, index) => ({ cmps_householdhistoryid: id(index + 1), cmps_householdidlegacy: 'H1', cmps_clientidlegacy: 'C1' }))
  const h = householdHistoryFixture(api, rows, [{ cmps_clientprofileid: parentId, cmps_clientid: 'C1' }], [{ cmps_householdid: id(400), cmps_householdidlegacy: 'H1' }], 2)
  const controller = new AbortController()
  let checkpoint
  const update = h.gateway.update
  h.gateway.update = async (...args) => { await update(...args); if (h.writes.length >= 3) controller.abort() }
  await assert.rejects(api.runLegacyMigration(h.plan, options, h.gateway, controller.signal, { checkpoint: (value) => { checkpoint = value } }))
  assert.equal(checkpoint.nextLink, '2')
  const completedIds = rows.filter((row) => row.cmps_recordid).map((row) => [row.cmps_householdhistoryid, row.cmps_recordid])
  h.gateway.update = update
  const resumed = await api.runLegacyMigration(h.plan, options, h.gateway, new AbortController().signal, {}, checkpoint)
  assert.equal(resumed.complete, true)
  assert.ok(rows.every((row) => row._cmps_cpid_value === parentId && row._cmps_householdid_value === id(400)))
  for (const [rowId, recordId] of completedIds) assert.equal(rows.find((row) => row.cmps_householdhistoryid === rowId).cmps_recordid, recordId)
  assert.equal(new Set(rows.map((row) => row.cmps_recordid)).size, 6)
  const rerun = await api.runLegacyMigration(h.plan, options, h.gateway, new AbortController().signal, {})
  assert.equal(rerun.counts.updated, 0)
})

test('modern unassigned household histories stay unchanged while a remaining legacy client link is repaired', async () => {
  const { api } = harness()
  const rows = [
    { cmps_householdhistoryid: sourceId, cmps_recordid: 'HHIST-041', _cmps_cpid_value: parentId },
    { cmps_householdhistoryid: otherId, cmps_recordid: 'HHIST-042', cmps_clientidlegacy: 'C1' },
  ]
  const h = householdHistoryFixture(api, rows, [{ cmps_clientprofileid: parentId, cmps_clientid: 'C1' }], [])
  const issues = []
  const result = await api.runLegacyMigration(h.plan, options, h.gateway, new AbortController().signal, { issue: (value) => issues.push(value) })
  assert.equal(result.counts.unchanged, 1); assert.equal(result.counts.recordIds, 0); assert.equal(result.counts.links, 1)
  assert.equal(issues.length, 1); assert.match(issues[0].message, /cmps_householdid.*empty/)
  assert.equal(rows[0]._cmps_cpid_value, parentId); assert.equal(rows[1]._cmps_cpid_value, parentId)
})

test('a household preflight read failure stops before any household-history writes', async () => {
  const { api } = harness()
  const h = householdHistoryFixture(api, [{ cmps_householdhistoryid: sourceId, cmps_householdidlegacy: 'H1', cmps_clientidlegacy: 'C1' }], [{ cmps_clientprofileid: parentId, cmps_clientid: 'C1' }], [])
  const read = h.gateway.page
  h.gateway.page = async (...args) => { if (args[0] === h.household) throw new Error('Household page unavailable'); return read(...args) }
  await assert.rejects(api.runLegacyMigration(h.plan, options, h.gateway, new AbortController().signal, {}), /Parent legacy-ID scan failed on page 1 of cmps_households.*No records were changed/)
  assert.equal(h.writes.length, 0)
})

test('all 29 requested forms use the exact legacy columns and correct parent table', () => {
  const { api } = harness()
  assert.equal(api.LEGACY_MIGRATION_TABLES.length, 29)
  const expected = {
    'program-enrollment': ['cmps_programenrollmentid', 'cmps_clientidlegacy', 'client-profile'],
    services: ['cmps_serviceid', 'cmps_programenrollmentid', 'program-enrollment'],
    'client-profile': ['cmps_clientid'], 'adult-assessment': ['cmps_assessmentid', 'cmps_clientid', 'client-profile'],
    'release-of-information': ['cmps_limitedroiid', 'cmps_clientid', 'client-profile'],
    'acknowledgement-consent': ['cmps_ackconid', 'cmps_clientid', 'client-profile'],
    'animal-agreement': ['cmps_agreementid', 'cmps_clientid', 'client-profile'],
    'bed-enrollment': ['cmps_bedid', 'cmps_programenrollmentid', 'program-enrollment'],
    'child-assessment': ['cmps_assessmentid', 'cmps_programenrollmentid', 'program-enrollment'],
    'child-safety-plan': ['cmps_safetyplanid', 'cmps_programenrollmentid', 'program-enrollment'],
    'child-shelter-intake': ['cmps_childintakeid', 'cmps_programenrollmentid', 'program-enrollment'],
    'electronic-document': ['cmps_docid', 'cmps_clientid', 'client-profile'],
    'employment-benefits': ['cmps_employmentbenefitsid', 'cmps_clientid', 'client-profile'],
    event: ['cmps_eventidlegacy'], 'financial-assistance': ['cmps_finassistanceid', 'cmps_programenrollmentid', 'program-enrollment'],
    'focus-plan': ['cmps_focusid', 'cmps_programenrollmentid', 'program-enrollment'],
    goal: ['cmps_goallegacyid', 'cmps_programenrollmentid', 'program-enrollment'],
    'health-wellness': ['cmps_hwqid', 'cmps_clientid', 'client-profile'],
    helpline: ['cmps_helplineidlegacy', 'cmps_clientid', 'client-profile'], household: ['cmps_householdidlegacy'],
    'household-history': ['cmps_householdidlegacy', 'cmps_clientidlegacy', 'client-profile'],
    'initial-safety-plan': ['cmps_safetyplanid', 'cmps_programenrollmentid', 'program-enrollment'],
    'medical-consent': ['cmps_consentid', 'cmps_programenrollmentid', 'program-enrollment'],
    'person-fleeing-profile': ['cmps_personfleeprofileid', 'cmps_clientid', 'client-profile'],
    'pet-companion-intake': ['cmps_petintakeid', 'cmps_clientid', 'client-profile'],
    'shelter-program-guidelines': ['cmps_progguidelinesid', 'cmps_programenrollmentid', 'program-enrollment'],
    'shelter-screening': ['cmps_shelterscreenid', 'cmps_clientid', 'client-profile'],
    'service-animal-terms': ['cmps_termsid', 'cmps_clientid', 'client-profile'],
    'voca-form': ['cmps_vocaid', 'cmps_programenrollmentid', 'program-enrollment'],
  }
  for (const table of api.LEGACY_MIGRATION_TABLES) assert.deepEqual([table.legacyIdField, table.parentLegacyField, table.parentKey].filter((value) => value !== undefined), expected[table.key])
})

test('metadata verifies writable text destinations and client-specific lookup navigation properties', async () => {
  const { api } = harness()
  const plan = fixture(api)
  const { gateway } = fakeGateway(plan, [])
  const checked = await api.inspectLegacyMigrationTable(plan.definition.key, gateway, new AbortController().signal)
  assert.equal(checked.lookups[0].ReferencingAttribute, 'cmps_cpid')
  assert.equal(checked.lookups[0].ReferencingEntityNavigationPropertyName, 'cmps_ClientProfileNavigation')
  plan.source.Attributes.find((entry) => entry.LogicalName === 'cmps_clientid').AttributeType = 'Lookup'
  await assert.rejects(api.inspectLegacyMigrationTable(plan.definition.key, gateway, new AbortController().signal), /must be a text column/)
  // Record IDs-only mode does not need or inspect a parent lookup.
  assert.equal((await api.inspectLegacyMigrationTable(plan.definition.key, gateway, new AbortController().signal, false)).parent, undefined)
})

test('a program-enrollment relationship is never substituted for a required client lookup', async () => {
  const { api } = harness()
  const plan = fixture(api, 'shelter-screening')
  plan.source.ManyToOneRelationships = [{ ReferencingAttribute: 'cmps_peid', ReferencingEntityNavigationPropertyName: 'cmps_peid', ReferencedEntity: 'cmps_programenrollment1' }]
  const h = fakeGateway(plan, [])
  const checked = await api.inspectLegacyMigrationTable('shelter-screening', h.gateway, new AbortController().signal)
  assert.equal(checked.lookups.length, 0)
  await assert.rejects(api.runLegacyMigration(checked, options, h.gateway, new AbortController().signal, {}), /Choose a verified lookup/)
  assert.equal(h.writes.length, 0)
})

test('Shelter Screening previews and migrates SS IDs and metadata-verified Client Profile links', async () => {
  const { api } = harness()
  const plan = fixture(api, 'shelter-screening')
  const rows = [
    { [plan.source.PrimaryIdAttribute]: sourceId, cmps_shelterscreenid: 'SC-OLD', cmps_clientid: ' 001 ', cmps_recordid: 'SC-OLD' },
    { [plan.source.PrimaryIdAttribute]: otherId, cmps_shelterscreenid: 'SC-OTHER', cmps_clientid: '001', cmps_recordid: 'SS-045' },
  ]
  const h = fakeGateway(plan, rows, [
    { [plan.parent.PrimaryIdAttribute]: parentId, cmps_clientid: '001', cmps_recordid: 'CP-044' },
    { [plan.parent.PrimaryIdAttribute]: id(201), cmps_clientid: '1', cmps_recordid: '001' },
  ], 1)
  const checked = await api.inspectLegacyMigrationTable('shelter-screening', h.gateway, new AbortController().signal)
  assert.equal(checked.source.EntitySetName, 'cmps_shelterscreenings')
  assert.equal(checked.lookups[0].ReferencingAttribute, 'cmps_cpid')
  const changes = []
  const preview = await api.runLegacyMigration(checked, { ...options, preview: true }, h.gateway, new AbortController().signal, { change: (change) => changes.push(change) })
  assert.equal(preview.counts.recordIds, 1); assert.equal(preview.counts.links, 2)
  assert.equal(preview.counts.issues, 0); assert.equal(h.writes.length, 0)
  assert.equal(changes[0].recordId, 'SS-046'); assert.equal(changes[0].lookupId, parentId)
  const result = await api.runLegacyMigration(checked, options, h.gateway, new AbortController().signal, {})
  assert.equal(result.counts.updated, 2)
  assert.deepEqual({ ...h.writes[0].payload }, { cmps_recordid: 'SS-046', 'cmps_ClientProfileNavigation@odata.bind': `/cmps_clientprofiles(${parentId})` })
  assert.equal(rows[1].cmps_recordid, 'SS-045')
  assert.equal(rows[0].cmps_shelterscreenid, 'SC-OLD'); assert.equal(rows[0].cmps_clientid, ' 001 ')
  const rerun = await api.runLegacyMigration(checked, options, h.gateway, new AbortController().signal, {})
  assert.equal(rerun.counts.updated, 0)
})

test('VOCA resolves Program Enrollment legacy IDs into cmps_peid and never rewrites the client link', async () => {
  const { api } = harness()
  const plan = fixture(api, 'voca-form')
  const rows = [
    { [plan.source.PrimaryIdAttribute]: sourceId, cmps_vocaid: 'VOCA-OLD', cmps_programenrollmentid: ' 001 ', cmps_clientid: 'CLIENT-OLD', _cmps_cpid_value: otherId },
    { [plan.source.PrimaryIdAttribute]: id(101), cmps_vocaid: 'VOCA-OTHER', cmps_programenrollmentid: '001', cmps_recordid: 'VOCA-045' },
  ]
  const h = fakeGateway(plan, rows, [
    { [plan.parent.PrimaryIdAttribute]: parentId, cmps_programenrollmentid: '001', cmps_recordid: 'PE-044' },
    { [plan.parent.PrimaryIdAttribute]: id(201), cmps_programenrollmentid: '1', cmps_recordid: '001' },
  ], 1)
  const checked = await api.inspectLegacyMigrationTable('voca-form', h.gateway, new AbortController().signal)
  assert.equal(checked.parentDefinition.key, 'program-enrollment')
  assert.deepEqual(Array.from(checked.lookups, (lookup) => lookup.ReferencingAttribute), ['cmps_peid'])
  const settings = { ...options, lookupAttribute: 'cmps_peid' }
  const preview = await api.runLegacyMigration(checked, { ...settings, preview: true }, h.gateway, new AbortController().signal, {})
  assert.equal(preview.counts.recordIds, 1); assert.equal(preview.counts.links, 2); assert.equal(h.writes.length, 0)
  const result = await api.runLegacyMigration(checked, settings, h.gateway, new AbortController().signal, {})
  assert.equal(result.counts.issues, 0)
  assert.deepEqual({ ...h.writes[0].payload }, { cmps_recordid: 'VOCA-046', 'cmps_EnrollmentNavigation@odata.bind': `/cmps_programenrollment1s(${parentId})` })
  assert.equal(rows[0].cmps_programenrollmentid, ' 001 '); assert.equal(rows[0].cmps_clientid, 'CLIENT-OLD')
  assert.equal(rows[0]._cmps_cpid_value, otherId); assert.equal(rows[1].cmps_recordid, 'VOCA-045')
  const rerun = await api.runLegacyMigration(checked, settings, h.gateway, new AbortController().signal, {})
  assert.equal(rerun.counts.updated, 0)
})

test('VOCA migration previews 4,958 rows, preferring 3,380 enrollments and resolving 1,578 direct client fallbacks', async () => {
  const { api } = harness()
  const plan = fixture(api, 'voca-form')
  const rows = Array.from({ length: 4958 }, (_, index) => ({
    [plan.source.PrimaryIdAttribute]: id(index + 1), cmps_vocaid: `V${index}`,
    cmps_programenrollmentid: index < 3380 ? `PE${index}` : index % 2 ? '' : 'unmatched-enrollment',
    cmps_clientid: `C${index}`, cmps_recordid: index === 0 ? 'VOCA-045' : '',
  }))
  const enrollments = Array.from({ length: 3380 }, (_, index) => ({ [plan.parent.PrimaryIdAttribute]: id(index + 10000), cmps_programenrollmentid: `PE${index}` }))
  const clients = Array.from({ length: 4958 }, (_, index) => ({ cmps_clientprofileid: id(index + 20000), cmps_clientid: `C${index}`, cmps_recordid: 'unrelated-app-id' }))
  const h = fakeGateway(plan, rows, enrollments, 1000, [clients])
  const checked = await api.inspectLegacyMigrationTable('voca-form', h.gateway, new AbortController().signal)
  assert.equal(checked.additionalParents[0].whenPrimaryUnresolved, true)
  assert.equal(checked.additionalParents[0].lookup.ReferencingAttribute, 'cmps_cpid')
  const settings = { ...options, lookupAttribute: 'cmps_peid' }
  const changes = []
  const preview = await api.runLegacyMigration(checked, { ...settings, preview: true }, h.gateway, new AbortController().signal, { change: (change) => changes.push(change) })
  assert.equal(preview.counts.updated, 4958); assert.equal(preview.counts.links, 4958)
  assert.equal(preview.counts.recordIds, 4957); assert.equal(preview.counts.issues, 0); assert.equal(h.writes.length, 0)
  assert.equal(changes.filter((change) => change.lookupField === 'cmps_peid' && change.lookupId).length, 3380)
  assert.equal(changes.filter((change) => change.lookupField === 'cmps_cpid' && change.lookupId).length, 1578)
  const result = await api.runLegacyMigration(checked, settings, h.gateway, new AbortController().signal, {})
  assert.equal(result.counts.updated, 4958); assert.equal(result.counts.links, 4958); assert.equal(result.counts.issues, 0)
  assert.equal(h.writes.filter((write) => write.payload['cmps_EnrollmentNavigation@odata.bind']).length, 3380)
  assert.equal(h.writes.filter((write) => write.payload['cmps_ClientProfileNavigation@odata.bind']).length, 1578)
  assert.equal(rows[3380]._cmps_cpid_value, id(23380)); assert.equal(rows[3380]._cmps_peid_value, undefined)
  assert.equal(rows[0]._cmps_peid_value, id(10000)); assert.equal(rows[0]._cmps_cpid_value, undefined)
  assert.equal(rows[0].cmps_recordid, 'VOCA-045'); assert.equal(rows[1].cmps_recordid, 'VOCA-046')
  assert.equal(rows[3380].cmps_programenrollmentid, 'unmatched-enrollment'); assert.equal(rows[3380].cmps_clientid, 'C3380')
  assert.equal(new Set(rows.map((row) => row.cmps_recordid)).size, 4958)
  assert.equal(h.calls.filter((call) => call.table === 'cmps_clientprofiles').length, 10)
  assert.equal(h.calls.filter((call) => call.table === 'cmps_programenrollment1s').length, 8)
  const rerun = await api.runLegacyMigration(checked, settings, h.gateway, new AbortController().signal, {})
  assert.equal(rerun.counts.updated, 0); assert.equal(rerun.counts.issues, 0)
})

test('VOCA fallback never guesses duplicate clients, replaces conflicts by default, or overrides existing enrollment links', async () => {
  const { api } = harness()
  const plan = fixture(api, 'voca-form')
  const rows = ['missing', 'duplicate', '', 'C1', 'C1', 'C1'].map((legacy, index) => ({
    [plan.source.PrimaryIdAttribute]: id(index + 1), cmps_vocaid: `V${index}`, cmps_programenrollmentid: 'missing-enrollment', cmps_clientid: legacy,
    ...(index === 3 ? { _cmps_cpid_value: otherId } : {}),
    ...(index === 4 ? { _cmps_peid_value: otherId } : {}),
    ...(index === 5 ? { cmps_programenrollmentid: 'duplicate-enrollment' } : {}),
  }))
  const h = fakeGateway(plan, rows, [
    { [plan.parent.PrimaryIdAttribute]: id(1000), cmps_programenrollmentid: 'duplicate-enrollment' },
    { [plan.parent.PrimaryIdAttribute]: id(1001), cmps_programenrollmentid: 'duplicate-enrollment' },
  ], 1, [[
    { cmps_clientprofileid: parentId, cmps_clientid: 'C1' },
    { cmps_clientprofileid: id(201), cmps_clientid: 'duplicate' },
    { cmps_clientprofileid: id(202), cmps_clientid: 'duplicate' },
  ]])
  const issues = []
  const settings = { ...options, lookupAttribute: 'cmps_peid' }
  const result = await api.runLegacyMigration(plan, settings, h.gateway, new AbortController().signal, { issue: (issue) => issues.push(issue) })
  assert.equal(result.counts.issues, 5); assert.equal(result.counts.links, 1)
  assert.match(issues[0].message, /cmps_cpid.*No parent/)
  assert.match(issues[1].message, /cmps_cpid.*Multiple parent/)
  assert.match(issues[2].message, /cmps_cpid.*empty/)
  assert.match(issues[3].message, /cmps_cpid.*Existing lookup differs/)
  assert.equal(rows[3]._cmps_cpid_value, otherId); assert.equal(rows[4]._cmps_peid_value, otherId)
  assert.equal(rows[4]._cmps_cpid_value, undefined)
  assert.equal(rows[5]._cmps_cpid_value, parentId); assert.equal(rows[5]._cmps_peid_value, undefined)
  const replacement = await api.runLegacyMigration(plan, { ...settings, replaceExisting: true }, h.gateway, new AbortController().signal, {})
  assert.equal(replacement.counts.links, 1); assert.equal(rows[3]._cmps_cpid_value, parentId)
  assert.equal(rows[4]._cmps_peid_value, otherId); assert.equal(rows[4]._cmps_cpid_value, undefined)
})

test('VOCA fallback works on already migrated app IDs and rejects unverified client schema or old checkpoints', async () => {
  const { api } = harness()
  const plan = fixture(api, 'voca-form')
  const rows = [{ [plan.source.PrimaryIdAttribute]: sourceId, cmps_recordid: 'VOCA-045', cmps_clientid: ' 001 ' }]
  const h = fakeGateway(plan, rows, [], 1, [[{ cmps_clientprofileid: parentId, cmps_clientid: '001' }]])
  const settings = { ...options, lookupAttribute: 'cmps_peid' }
  const oldDefinition = { ...plan.definition, additionalParents: undefined }
  const oldPlan = { ...plan, definition: oldDefinition, additionalParents: undefined }
  const checkpoint = { version: 2, fingerprint: api.migrationFingerprint(oldPlan, settings), nextLink: '1000', counts: { ...api.EMPTY_MIGRATION_COUNTS }, complete: false }
  await assert.rejects(api.runLegacyMigration(plan, settings, h.gateway, new AbortController().signal, {}, checkpoint), /checkpoint does not match/)
  const clientAttribute = plan.source.Attributes.find((entry) => entry.LogicalName === 'cmps_cpid')
  clientAttribute.IsValidForUpdate = false
  await assert.rejects(api.inspectLegacyMigrationTable('voca-form', h.gateway, new AbortController().signal), /cmps_cpid must be a unique writable lookup/)
  clientAttribute.IsValidForUpdate = true
  const result = await api.runLegacyMigration(plan, settings, h.gateway, new AbortController().signal, {})
  assert.equal(result.counts.recordIds, 0); assert.equal(result.counts.links, 1); assert.equal(result.counts.issues, 0)
  assert.equal(rows[0].cmps_recordid, 'VOCA-045'); assert.equal(rows[0]._cmps_cpid_value, parentId)
})

test('VOCA migration refuses a Client Profile lookup and checkpoints from its previous parent mapping', async () => {
  const { api } = harness()
  const plan = fixture(api, 'voca-form')
  const h = fakeGateway(plan, [])
  const oldParent = fixture(api, 'adult-assessment')
  const oldPlan = { ...plan, definition: { ...plan.definition, parentLegacyField: 'cmps_clientid', parentKey: 'client-profile' }, parent: oldParent.parent, parentDefinition: oldParent.parentDefinition }
  const checkpoint = { version: 2, fingerprint: api.migrationFingerprint(oldPlan, options), nextLink: '1000', counts: { ...api.EMPTY_MIGRATION_COUNTS }, complete: false }
  await assert.rejects(api.runLegacyMigration(plan, { ...options, lookupAttribute: 'cmps_peid' }, h.gateway, new AbortController().signal, {}, checkpoint), /checkpoint does not match/)
  plan.source.ManyToOneRelationships = [{ ReferencingAttribute: 'cmps_cpid', ReferencingEntityNavigationPropertyName: 'cmps_cpid', ReferencedEntity: 'cmps_clientprofile' }]
  const checked = await api.inspectLegacyMigrationTable('voca-form', h.gateway, new AbortController().signal)
  assert.equal(checked.lookups.length, 0)
  await assert.rejects(api.runLegacyMigration(checked, options, h.gateway, new AbortController().signal, {}), /Choose a verified lookup/)
  assert.equal(h.calls.length, 0); assert.equal(h.writes.length, 0)
})

test('Shelter Screening and VOCA retain IDs-only mode without inspecting or scanning parents', async () => {
  const { api } = harness()
  for (const key of ['shelter-screening', 'voca-form']) {
    const plan = fixture(api, key)
    const rows = [{ [plan.source.PrimaryIdAttribute]: sourceId, [plan.definition.legacyIdField]: 'OLD' }]
    const h = fakeGateway(plan, rows)
    h.gateway.metadata = async (definition) => { assert.equal(definition.key, key); return plan.source }
    const checked = await api.inspectLegacyMigrationTable(key, h.gateway, new AbortController().signal, false)
    const result = await api.runLegacyMigration(checked, { ...options, migrateLinks: false }, h.gateway, new AbortController().signal, {})
    assert.equal(result.counts.recordIds, 1); assert.equal(result.counts.links, 0); assert.equal(result.counts.issues, 0)
    assert.equal(rows[0].cmps_recordid, key === 'shelter-screening' ? 'SS-041' : 'VOCA-041')
    assert.ok(h.calls.every((call) => call.table === plan.source.EntitySetName))
  }
})

test('leading zeros are preserved and matched only through the parent legacy column, not cmps_recordid', async () => {
  const { api } = harness()
  const plan = fixture(api)
  const h = fakeGateway(plan, [{ [plan.source.PrimaryIdAttribute]: sourceId, cmps_assessmentid: ' 0002 ', cmps_clientid: ' 001 ', '@odata.etag': 'W/"123"' }], [
    { [plan.parent.PrimaryIdAttribute]: parentId, cmps_clientid: '001', cmps_recordid: 'unrelated' },
    { [plan.parent.PrimaryIdAttribute]: otherId, cmps_clientid: '1', cmps_recordid: '001' },
  ])
  const result = await api.runLegacyMigration(plan, options, h.gateway, new AbortController().signal, {})
  assert.equal(result.counts.recordIds, 1); assert.equal(result.counts.links, 1)
  assert.deepEqual({ ...h.writes[0].payload }, { cmps_recordid: 'AA-041', 'cmps_ClientProfileNavigation@odata.bind': `/cmps_clientprofiles(${parentId})` })
  assert.equal(h.writes[0].etag, 'W/"123"')
  assert.equal(h.writes[0].table, plan.source.EntitySetName)
})

test('duplicate parents across pages, absent matches and empty legacy IDs are reported without guessed or cleared links', async () => {
  const { api } = harness()
  const plan = fixture(api)
  const rows = [
    { [plan.source.PrimaryIdAttribute]: id(1), cmps_assessmentid: 'A1', cmps_clientid: 'duplicate' },
    { [plan.source.PrimaryIdAttribute]: id(2), cmps_assessmentid: 'A2', cmps_clientid: 'missing' },
    { [plan.source.PrimaryIdAttribute]: id(3), cmps_assessmentid: '', cmps_clientid: '', _cmps_cpid_value: parentId },
  ]
  const h = fakeGateway(plan, rows, [
    { [plan.parent.PrimaryIdAttribute]: parentId, cmps_clientid: 'duplicate' },
    { [plan.parent.PrimaryIdAttribute]: id(201), cmps_clientid: 'other' },
    { [plan.parent.PrimaryIdAttribute]: otherId, cmps_clientid: 'duplicate' },
  ], 1)
  const issues = []
  const result = await api.runLegacyMigration(plan, { ...options, replaceExisting: true }, h.gateway, new AbortController().signal, { issue: (value) => issues.push(value) })
  assert.equal(result.counts.issues, 3); assert.equal(result.counts.recordIds, 2); assert.equal(result.counts.links, 0)
  assert.match(issues[0].message, /Multiple parent/); assert.match(issues[1].message, /No parent/); assert.match(issues[2].message, /empty/)
  assert.equal(rows[2]._cmps_cpid_value, parentId)
  assert.equal(h.writes.every((write) => Object.keys(write.payload).join() === 'cmps_recordid'), true)
})

test('preview never writes; conflicts are preserved by default and replaced only with explicit permission', async () => {
  const { api } = harness()
  const plan = fixture(api)
  const row = { [plan.source.PrimaryIdAttribute]: sourceId, cmps_assessmentid: 'A1', cmps_recordid: 'existing', cmps_clientid: 'C1', _cmps_cpid_value: otherId }
  const h = fakeGateway(plan, [row], [{ [plan.parent.PrimaryIdAttribute]: parentId, cmps_clientid: 'C1' }])
  let result = await api.runLegacyMigration(plan, options, h.gateway, new AbortController().signal, {})
  assert.equal(result.counts.updated, 0); assert.equal(result.counts.issues, 1)
  const changes = []
  result = await api.runLegacyMigration(plan, { ...options, preview: true, replaceExisting: true }, h.gateway, new AbortController().signal, { change: (value) => changes.push(value) })
  assert.equal(result.counts.updated, 1); assert.equal(h.writes.length, 0)
  assert.equal(changes[0].previousRecordId, 'existing'); assert.equal(changes[0].recordId, 'AA-041')
  assert.equal(changes[0].previousLookupId, otherId); assert.equal(changes[0].lookupId, parentId)
  assert.ok(api.migrationChangeCsv(changes[0]).includes('"existing","AA-041"'))
  assert.equal(row.cmps_recordid, 'existing')
  await api.runLegacyMigration(plan, { ...options, replaceExisting: true }, h.gateway, new AbortController().signal, {})
  assert.equal(row.cmps_recordid, 'AA-041'); assert.equal(row._cmps_cpid_value, parentId)
  result = await api.runLegacyMigration(plan, { ...options, replaceExisting: true }, h.gateway, new AbortController().signal, {})
  assert.equal(result.counts.updated, 0); assert.equal(result.counts.unchanged, 1)
})

test('client profiles receive CP-046 and CP-047; copied legacy IDs are repaired while existing app IDs stay unchanged', async () => {
  const { api } = harness()
  const plan = fixture(api, 'client-profile')
  const rows = [
    { [plan.source.PrimaryIdAttribute]: id(1), cmps_recordid: 'CP-20260923164213' },
    { [plan.source.PrimaryIdAttribute]: id(2), cmps_recordid: 'CP-045' },
    { [plan.source.PrimaryIdAttribute]: id(3), cmps_recordid: 'CP-044' },
    { [plan.source.PrimaryIdAttribute]: id(4), cmps_recordid: 'CP-043' },
    { [plan.source.PrimaryIdAttribute]: id(5), cmps_clientid: '12345', cmps_recordid: '12345' },
    { [plan.source.PrimaryIdAttribute]: id(6), cmps_clientid: '67890', cmps_recordid: '' },
  ]
  const h = fakeGateway(plan, rows, [], 2)
  const previewChanges = []
  await api.runLegacyMigration(plan, { ...options, preview: true }, h.gateway, new AbortController().signal, { change: (change) => previewChanges.push(change) })
  assert.deepEqual(previewChanges.map((change) => change.recordId), ['CP-046', 'CP-047'])
  assert.equal(rows[4].cmps_recordid, '12345')
  const result = await api.runLegacyMigration(plan, options, h.gateway, new AbortController().signal, {})
  assert.equal(result.counts.recordIds, 2); assert.equal(result.counts.issues, 0)
  assert.equal(rows[4].cmps_recordid, 'CP-046'); assert.equal(rows[5].cmps_recordid, 'CP-047')
  assert.equal(rows[4].cmps_clientid, '12345'); assert.equal(rows[5].cmps_clientid, '67890')
  assert.equal(rows[0].cmps_recordid, 'CP-20260923164213'); assert.equal(rows[1].cmps_recordid, 'CP-045')
  const again = await api.runLegacyMigration(plan, { ...options, replaceExisting: true }, h.gateway, new AbortController().signal, {})
  assert.equal(again.counts.recordIds, 0); assert.equal(h.writes.length, 2)
})

test('legacy imports do not inflate the sequence and the highest app ID beyond page 5,000 is reserved', async () => {
  const { api } = harness()
  const plan = fixture(api, 'client-profile')
  const rows = Array.from({ length: 5001 }, (_, index) => ({ [plan.source.PrimaryIdAttribute]: id(index + 1), cmps_recordid: String(10000 + index) }))
  rows.push({ [plan.source.PrimaryIdAttribute]: id(6000), cmps_recordid: 'CP-045' })
  rows.push({ [plan.source.PrimaryIdAttribute]: id(6001), cmps_clientid: '12345', cmps_recordid: '12345' })
  const h = fakeGateway(plan, rows, [], 1000)
  await api.runLegacyMigration(plan, options, h.gateway, new AbortController().signal, {})
  assert.equal(rows.at(-1).cmps_recordid, 'CP-046')
  assert.equal(h.writes.length, 1)
})

test('all form prefixes match current app generators and legacy-copy checkpoints cannot skip repairs', async () => {
  const { api } = harness()
  const expected = { 'client-profile': 'CP', 'program-enrollment': 'PE', services: 'SV', 'adult-assessment': 'AA', 'release-of-information': 'ROI', 'acknowledgement-consent': 'ACC', 'animal-agreement': 'AA', 'bed-enrollment': 'BE', 'child-assessment': 'CA', 'child-safety-plan': 'CSP', 'child-shelter-intake': 'CSI', 'electronic-document': 'EDOC', 'employment-benefits': 'EB', event: 'EVENT', 'financial-assistance': 'FA', 'focus-plan': 'FP', goal: 'GOAL', 'health-wellness': 'HWQ', helpline: 'HL', household: 'HH', 'household-history': 'HHIST', 'initial-safety-plan': 'ISP', 'medical-consent': 'MCF', 'person-fleeing-profile': 'PYFP', 'pet-companion-intake': 'PCI', 'shelter-program-guidelines': 'SPG', 'shelter-screening': 'SS', 'service-animal-terms': 'TCSA', 'voca-form': 'VOCA' }
  for (const table of api.LEGACY_MIGRATION_TABLES) assert.equal(table.recordIdPrefix, expected[table.key])
  const plan = fixture(api, 'client-profile')
  const h = fakeGateway(plan, [])
  await assert.rejects(api.runLegacyMigration(plan, options, h.gateway, new AbortController().signal, {}, { version: 1, fingerprint: api.migrationFingerprint(plan, options), nextLink: '1000', counts: {}, complete: false }), /old migration/)
  assert.equal(h.calls.length, 0)
})

test('normal app ID generation shares migration sequence rules and reads every connector page', async () => {
  const h = harness({ local: false, responses: [
    { value: Array.from({ length: 5000 }, (_, index) => ({ cmps_recordid: String(index + 1) })), '@odata.nextLink': `${org}/api/data/v9.2/cmps_clientprofiles?$skiptoken=next` },
    { value: [{ cmps_recordid: 'CP-045' }, { cmps_recordid: 'CP-20260923164213' }] },
  ] })
  assert.equal(await h.load('./recordIds.ts').generateSequentialRecordId('cmps_clientprofiles', 'CP'), 'CP-046')
  assert.equal(h.calls.length, 2); assert.equal(h.calls[1].parameters.$skiptoken, 'next')
  assert.equal(h.calls[0].parameters.$top, undefined)
})

test('normal app ID generation falls back to a complete authenticated Web API scan', async () => {
  const h = harness({ local: true, runtimeFailure: { message: 'Connector unavailable' }, responses: [
    { value: [{ cmps_recordid: 'CP-044' }], '@odata.nextLink': `${org}/api/data/v9.2/cmps_clientprofiles?$skiptoken=next` },
    { value: [{ cmps_recordid: 'CP-045' }] },
  ] })
  assert.equal(await h.load('./recordIds.ts').generateSequentialRecordId('cmps_clientprofiles', 'CP'), 'CP-046')
  const direct = h.calls.filter((call) => call.url)
  assert.equal(direct.length, 2); assert.equal(new URL(direct[1].url).searchParams.get('$skiptoken'), 'next')
})

test('client/event/household tables run Record IDs-only without reading unrelated tables', async () => {
  const { api } = harness()
  for (const key of ['client-profile', 'event', 'household']) {
    const plan = fixture(api, key)
    const h = fakeGateway(plan, [{ [plan.source.PrimaryIdAttribute]: sourceId, [plan.definition.legacyIdField]: 'LEGACY' }])
    const result = await api.runLegacyMigration(plan, options, h.gateway, new AbortController().signal, {})
    assert.equal(result.counts.updated, 1)
    assert.equal(h.calls.length, 2); assert.equal(h.calls.every((call) => call.table === plan.source.EntitySetName), true)
  }
})

test('enrollment-linked forms match enrollment legacy IDs and bind to their actual GUID', async () => {
  const { api } = harness()
  const plan = fixture(api, 'bed-enrollment')
  const h = fakeGateway(plan, [{ [plan.source.PrimaryIdAttribute]: sourceId, cmps_bedid: 'BED-OLD', cmps_programenrollmentid: 'PE-OLD' }], [{ [plan.parent.PrimaryIdAttribute]: parentId, cmps_programenrollmentid: 'PE-OLD', cmps_recordid: 'different' }])
  await api.runLegacyMigration(plan, { ...options, lookupAttribute: 'cmps_peid' }, h.gateway, new AbortController().signal, {})
  assert.equal(h.writes[0].payload['cmps_EnrollmentNavigation@odata.bind'], `/cmps_programenrollment1s(${parentId})`)
})

test('Services migration matches enrollment legacy IDs, fills cmps_programenrollment, and leaves client legacy fields untouched', async () => {
  const { api } = harness()
  const plan = fixture(api, 'services')
  plan.source.Attributes.push({ LogicalName: 'cmps_programenrollment', AttributeType: 'Lookup', IsValidForUpdate: true })
  plan.source.ManyToOneRelationships = [
    { ReferencingAttribute: 'cmps_programenrollment', ReferencingEntityNavigationPropertyName: 'cmps_programenrollment', ReferencedEntity: plan.parent.LogicalName },
    { ReferencingAttribute: 'cmps_cpid', ReferencingEntityNavigationPropertyName: 'cmps_cpid', ReferencedEntity: 'cmps_clientprofile' },
  ]
  plan.lookups = plan.source.ManyToOneRelationships.slice(0, 1)
  const rows = [
    { [plan.source.PrimaryIdAttribute]: id(1), cmps_recordid: 'SV-045' },
    { [plan.source.PrimaryIdAttribute]: sourceId, cmps_serviceid: 'SERVICE-OLD', cmps_programenrollmentid: 'PE-OLD', cmps_clientidlegacy: 'CLIENT-OLD', _cmps_cpid_value: otherId },
  ]
  const h = fakeGateway(plan, rows, [{ [plan.parent.PrimaryIdAttribute]: parentId, cmps_programenrollmentid: 'PE-OLD', cmps_recordid: 'PE-045' }])
  const checked = await api.inspectLegacyMigrationTable('services', h.gateway, new AbortController().signal)
  assert.equal(checked.parentDefinition.key, 'program-enrollment')
  assert.deepEqual(Array.from(checked.lookups, (lookup) => lookup.ReferencingAttribute), ['cmps_programenrollment'])
  const settings = { ...options, lookupAttribute: 'cmps_programenrollment' }
  await api.runLegacyMigration(checked, settings, h.gateway, new AbortController().signal, {})
  assert.equal(h.writes.length, 1)
  assert.deepEqual({ ...h.writes[0].payload }, { cmps_recordid: 'SV-046', 'cmps_programenrollment@odata.bind': `/cmps_programenrollment1s(${parentId})` })
  assert.equal(rows[1].cmps_serviceid, 'SERVICE-OLD')
  assert.equal(rows[1].cmps_programenrollmentid, 'PE-OLD')
  assert.equal(rows[1].cmps_clientidlegacy, 'CLIENT-OLD')
  assert.equal(rows[1]._cmps_cpid_value, otherId)
  assert.equal(h.calls.some((call) => call.table === 'cmps_clientprofiles'), false)
  assert.equal(h.calls.some((call) => call.select.includes('cmps_clientidlegacy')), false)
  await assert.rejects(api.runLegacyMigration(checked, options, h.gateway, new AbortController().signal, {}), /Choose a verified lookup/)
  const oldPlan = { ...checked, definition: { ...checked.definition, parentLegacyField: 'cmps_clientidlegacy' }, parent: { ...checked.parent, EntitySetName: 'cmps_clientprofiles' } }
  await assert.rejects(api.runLegacyMigration(checked, settings, h.gateway, new AbortController().signal, {}, { version: 2, fingerprint: api.migrationFingerprint(oldPlan, settings), nextLink: '1000', counts: { ...api.EMPTY_MIGRATION_COUNTS }, complete: false }), /does not match/)
})

test('Child Assessment previews and migrates legacy enrollment links, preserving client links and sequential CA IDs', async () => {
  const { api } = harness()
  const plan = fixture(api, 'child-assessment')
  plan.source.ManyToOneRelationships.push({ ReferencingAttribute: 'cmps_cpid', ReferencingEntityNavigationPropertyName: 'cmps_ClientProfileNavigation', ReferencedEntity: 'cmps_clientprofile' })
  const rows = [
    { [plan.source.PrimaryIdAttribute]: id(99), cmps_recordid: 'CA-045' },
    { [plan.source.PrimaryIdAttribute]: sourceId, cmps_assessmentid: 'ASSESSMENT-OLD', cmps_programenrollmentid: ' 001 ', cmps_clientid: 'CLIENT-OLD', _cmps_cpid_value: otherId },
  ]
  const h = fakeGateway(plan, rows, [
    { [plan.parent.PrimaryIdAttribute]: parentId, cmps_programenrollmentid: '001', cmps_recordid: 'PE-050' },
    { [plan.parent.PrimaryIdAttribute]: id(201), cmps_programenrollmentid: '1', cmps_recordid: 'PE-051' },
  ])
  const checked = await api.inspectLegacyMigrationTable('child-assessment', h.gateway, new AbortController().signal)
  assert.equal(checked.definition.legacyIdField, 'cmps_assessmentid')
  assert.equal(checked.definition.parentLegacyField, 'cmps_programenrollmentid')
  assert.equal(checked.parentDefinition.key, 'program-enrollment')
  assert.deepEqual(Array.from(checked.lookups, (lookup) => lookup.ReferencingAttribute), ['cmps_peid'])
  const settings = { ...options, lookupAttribute: 'cmps_peid' }
  const changes = []
  const preview = await api.runLegacyMigration(checked, { ...settings, preview: true }, h.gateway, new AbortController().signal, { change: (value) => changes.push(value) })
  assert.equal(preview.counts.links, 1); assert.equal(h.writes.length, 0)
  assert.equal(changes[0].recordId, 'CA-046'); assert.equal(changes[0].lookupId, parentId)
  await api.runLegacyMigration(checked, settings, h.gateway, new AbortController().signal, {})
  assert.equal(h.writes.length, 1)
  assert.deepEqual({ ...h.writes[0].payload }, { cmps_recordid: 'CA-046', 'cmps_EnrollmentNavigation@odata.bind': `/cmps_programenrollment1s(${parentId})` })
  assert.equal(rows[1].cmps_assessmentid, 'ASSESSMENT-OLD')
  assert.equal(rows[1].cmps_programenrollmentid, ' 001 ')
  assert.equal(rows[1].cmps_clientid, 'CLIENT-OLD'); assert.equal(rows[1]._cmps_cpid_value, otherId)
  assert.ok(!h.calls.some((call) => call.table === 'cmps_clientprofiles' || call.select.includes('cmps_clientid')))
  await api.runLegacyMigration(checked, settings, h.gateway, new AbortController().signal, {})
  assert.equal(h.writes.length, 1)
  await assert.rejects(api.runLegacyMigration(checked, options, h.gateway, new AbortController().signal, {}), /Choose a verified lookup/)
  const oldPlan = { ...checked, definition: { ...checked.definition, parentLegacyField: 'cmps_clientid', parentKey: 'client-profile' }, parent: { ...checked.parent, EntitySetName: 'cmps_clientprofiles' } }
  await assert.rejects(api.runLegacyMigration(checked, settings, h.gateway, new AbortController().signal, {}, { version: 2, fingerprint: api.migrationFingerprint(oldPlan, settings), nextLink: '1000', counts: { ...api.EMPTY_MIGRATION_COUNTS }, complete: false }), /does not match/)
})

test('Child Assessment missing, duplicate and conflicting enrollment matches report issues without guessing or clearing links', async () => {
  const { api } = harness(), plan = fixture(api, 'child-assessment')
  const rows = ['', 'missing', 'duplicate', 'valid'].map((legacy, index) => ({
    [plan.source.PrimaryIdAttribute]: id(index + 1), cmps_recordid: `CA-00${index + 1}`, cmps_assessmentid: `LEGACY-${index}`,
    cmps_programenrollmentid: legacy, cmps_clientid: 'CLIENT-OLD', _cmps_cpid_value: otherId,
    ...(index === 3 ? { _cmps_peid_value: otherId } : {}),
  }))
  const h = fakeGateway(plan, rows, [
    { [plan.parent.PrimaryIdAttribute]: parentId, cmps_programenrollmentid: 'valid' },
    { [plan.parent.PrimaryIdAttribute]: id(201), cmps_programenrollmentid: 'duplicate' },
    { [plan.parent.PrimaryIdAttribute]: id(202), cmps_programenrollmentid: 'duplicate' },
  ])
  const issues = []
  const result = await api.runLegacyMigration(plan, { ...options, lookupAttribute: 'cmps_peid' }, h.gateway, new AbortController().signal, { issue: (value) => issues.push(value) })
  assert.equal(h.writes.length, 0); assert.equal(result.counts.issues, 4); assert.equal(result.counts.links, 0)
  assert.equal(issues.length, 4); assert.equal(rows[3]._cmps_peid_value, otherId)
  assert.ok(rows.every((row) => row._cmps_cpid_value === otherId))
  plan.source.Attributes = plan.source.Attributes.filter((attribute) => attribute.LogicalName !== 'cmps_programenrollmentid')
  await assert.rejects(api.inspectLegacyMigrationTable('child-assessment', h.gateway, new AbortController().signal), /cmps_programenrollmentid must be.*text column/)
})

for (const [key, legacyField, prefix, label] of [
  ['child-safety-plan', 'cmps_safetyplanid', 'CSP', 'Child Safety Plan'],
  ['child-shelter-intake', 'cmps_childintakeid', 'CSI', 'Child Shelter Intake'],
  ['initial-safety-plan', 'cmps_safetyplanid', 'ISP', 'Initial Safety Plan'],
]) {
test(`${label} migrates legacy Program Enrollment links without any client legacy column`, async () => {
  const { api } = harness(), plan = fixture(api, key)
  assert.ok(!plan.source.Attributes.some((attribute) => attribute.LogicalName === 'cmps_clientid'))
  const rows = [
    { [plan.source.PrimaryIdAttribute]: id(99), cmps_recordid: `${prefix}-045` },
    { [plan.source.PrimaryIdAttribute]: sourceId, [legacyField]: 'SAFETY-OLD', cmps_programenrollmentid: ' 001 ' },
  ]
  const h = fakeGateway(plan, rows, [
    { [plan.parent.PrimaryIdAttribute]: parentId, cmps_programenrollmentid: '001', cmps_recordid: 'PE-050' },
    { [plan.parent.PrimaryIdAttribute]: id(201), cmps_programenrollmentid: '1', cmps_recordid: 'PE-051' },
  ])
  const checked = await api.inspectLegacyMigrationTable(key, h.gateway, new AbortController().signal)
  assert.equal(checked.definition.legacyIdField, legacyField)
  assert.equal(checked.definition.parentLegacyField, 'cmps_programenrollmentid')
  assert.equal(checked.parentDefinition.key, 'program-enrollment')
  assert.deepEqual(Array.from(checked.lookups, (lookup) => lookup.ReferencingAttribute), ['cmps_peid'])
  const settings = { ...options, lookupAttribute: 'cmps_peid' }, changes = []
  const preview = await api.runLegacyMigration(checked, { ...settings, preview: true }, h.gateway, new AbortController().signal, { change: (change) => changes.push(change) })
  assert.equal(h.writes.length, 0); assert.equal(preview.counts.links, 1)
  assert.equal(changes[0].recordId, `${prefix}-046`); assert.equal(changes[0].lookupId, parentId)
  await api.runLegacyMigration(checked, settings, h.gateway, new AbortController().signal, {})
  assert.equal(h.writes.length, 1)
  assert.deepEqual({ ...h.writes[0].payload }, { cmps_recordid: `${prefix}-046`, 'cmps_EnrollmentNavigation@odata.bind': `/cmps_programenrollment1s(${parentId})` })
  assert.equal(rows[1][legacyField], 'SAFETY-OLD'); assert.equal(rows[1].cmps_programenrollmentid, ' 001 ')
  assert.ok(!h.calls.some((call) => call.table === 'cmps_clientprofiles' || call.select.includes('cmps_clientid')))
  await api.runLegacyMigration(checked, settings, h.gateway, new AbortController().signal, {})
  assert.equal(h.writes.length, 1)
  await assert.rejects(api.runLegacyMigration(checked, options, h.gateway, new AbortController().signal, {}), /Choose a verified lookup/)
  const oldPlan = { ...checked, definition: { ...checked.definition, parentLegacyField: 'cmps_clientid', parentKey: 'client-profile' }, parent: { ...checked.parent, EntitySetName: 'cmps_clientprofiles' } }
  await assert.rejects(api.runLegacyMigration(checked, settings, h.gateway, new AbortController().signal, {}, { version: 2, fingerprint: api.migrationFingerprint(oldPlan, settings), nextLink: '1000', counts: { ...api.EMPTY_MIGRATION_COUNTS }, complete: false }), /does not match/)
})

test(`${label} preserves unresolved and conflicting enrollment links and verifies the parent legacy text column`, async () => {
  const { api } = harness(), plan = fixture(api, key)
  const rows = ['', 'missing', 'duplicate', 'valid'].map((legacy, index) => ({
    [plan.source.PrimaryIdAttribute]: id(index + 1), cmps_recordid: `${prefix}-00${index + 1}`, [legacyField]: `LEGACY-${index}`,
    cmps_programenrollmentid: legacy, ...(index === 3 ? { _cmps_peid_value: otherId } : {}),
  }))
  const h = fakeGateway(plan, rows, [
    { [plan.parent.PrimaryIdAttribute]: parentId, cmps_programenrollmentid: 'valid' },
    { [plan.parent.PrimaryIdAttribute]: id(201), cmps_programenrollmentid: 'duplicate' },
    { [plan.parent.PrimaryIdAttribute]: id(202), cmps_programenrollmentid: 'duplicate' },
  ])
  const result = await api.runLegacyMigration(plan, { ...options, lookupAttribute: 'cmps_peid' }, h.gateway, new AbortController().signal, {})
  assert.equal(h.writes.length, 0); assert.equal(result.counts.issues, 4); assert.equal(result.counts.links, 0)
  assert.equal(rows[3]._cmps_peid_value, otherId)
  plan.source.Attributes = plan.source.Attributes.filter((attribute) => attribute.LogicalName !== 'cmps_programenrollmentid')
  await assert.rejects(api.inspectLegacyMigrationTable(key, h.gateway, new AbortController().signal), /cmps_programenrollmentid must be.*text column/)
})
}

test('25,001 source and 10,001 parent records are fully paged with at most four updates in flight', async () => {
  const { api } = harness()
  const plan = fixture(api)
  const source = Array.from({ length: 25001 }, (_, index) => ({ [plan.source.PrimaryIdAttribute]: id(index + 1), cmps_assessmentid: `A-${index}`, cmps_clientid: `C-${index % 10001}` }))
  const parents = Array.from({ length: 10001 }, (_, index) => ({ [plan.parent.PrimaryIdAttribute]: id(index + 50000), cmps_clientid: `C-${index}` }))
  const h = fakeGateway(plan, source, parents, 1000)
  const result = await api.runLegacyMigration(plan, options, h.gateway, new AbortController().signal, {})
  assert.equal(result.counts.read, 25001); assert.equal(result.counts.updated, 25001); assert.equal(result.counts.links, 25001)
  assert.equal(result.counts.pages, 26); assert.equal(result.counts.issues, 0)
  assert.ok(h.peak() <= 4); assert.equal(h.peak(), 4)
  assert.equal(h.calls.filter((call) => call.table === plan.parent.EntitySetName).length, 11)
  assert.equal(h.calls.filter((call) => call.table === plan.source.EntitySetName).length, 52)
  assert.equal(new Set(source.map((row) => row.cmps_recordid)).size, 25001)
  assert.equal(h.writes.every((write) => write.table === plan.source.EntitySetName), true)
})

test('stopping mid-page resumes from the last complete page and replay is idempotent', async () => {
  const { api } = harness()
  const plan = fixture(api, 'client-profile')
  const rows = Array.from({ length: 15 }, (_, index) => ({ [plan.source.PrimaryIdAttribute]: id(index + 1), cmps_clientid: `C${index}` }))
  const h = fakeGateway(plan, rows, [], 5)
  const controller = new AbortController()
  const update = h.gateway.update
  h.gateway.update = async (...args) => { await update(...args); if (h.writes.length >= 7) controller.abort() }
  let checkpoint
  await assert.rejects(api.runLegacyMigration(plan, options, h.gateway, controller.signal, { checkpoint: (value) => { checkpoint = value } }))
  assert.equal(checkpoint.counts.pages, 1); assert.equal(checkpoint.nextLink, '5')
  h.gateway.update = update
  const result = await api.runLegacyMigration(plan, options, h.gateway, new AbortController().signal, {}, checkpoint)
  assert.equal(result.counts.read, 15); assert.equal(result.complete, true)
  assert.equal(h.writes.length, 15)
  assert.equal(rows.every((row) => /^CP-04\d+$/.test(row.cmps_recordid) && row.cmps_recordid !== row.cmps_clientid), true)
  await assert.rejects(api.runLegacyMigration(plan, { ...options, replaceExisting: true }, h.gateway, new AbortController().signal, {}, checkpoint), /does not match/)
})

test('read/auth failures preserve the unfinished page checkpoint; row-level failures are reported', async () => {
  const { api } = harness()
  const plan = fixture(api, 'client-profile')
  const rows = Array.from({ length: 4 }, (_, index) => ({ [plan.source.PrimaryIdAttribute]: id(index + 1), cmps_clientid: `C${index}` }))
  const h = fakeGateway(plan, rows, [], 2)
  const original = h.gateway.page
  h.gateway.page = async (...args) => { if (args[1].includes('cmps_clientid') && args[2] === '2') throw new Error('Read failure'); return original(...args) }
  let checkpoint
  await assert.rejects(api.runLegacyMigration(plan, options, h.gateway, new AbortController().signal, { checkpoint: (value) => { checkpoint = value } }), /Read failure/)
  assert.equal(checkpoint.nextLink, '2'); assert.equal(checkpoint.counts.read, 2)
  h.gateway.page = original
  h.gateway.update = async () => { throw new api.MigrationRequestError('Forbidden', 403) }
  await assert.rejects(api.runLegacyMigration(plan, options, h.gateway, new AbortController().signal, {}, checkpoint), /Forbidden/)
  h.gateway.update = async () => { throw new api.MigrationRequestError('Changed by another user', 412) }
  const issues = []
  const result = await api.runLegacyMigration(plan, options, h.gateway, new AbortController().signal, { issue: (value) => issues.push(value) }, checkpoint)
  assert.equal(result.counts.failed, 2); assert.equal(result.counts.issues, 2); assert.equal(issues.length, 2)
})

test('repeated page cursors and malformed parent GUIDs stop safely rather than looping or guessing', async () => {
  const { api } = harness()
  const plan = fixture(api)
  const h = fakeGateway(plan, [], [{ [plan.parent.PrimaryIdAttribute]: 'not-a-guid', cmps_clientid: 'C1' }])
  await assert.rejects(api.runLegacyMigration(plan, options, h.gateway, new AbortController().signal, {}), /invalid primary ID/)
  const sourcePlan = fixture(api, 'client-profile')
  h.gateway.page = async () => ({ rows: [], nextLink: 'repeat' })
  await assert.rejects(api.runLegacyMigration(sourcePlan, options, h.gateway, new AbortController().signal, {}), /paging repeated/)
  assert.equal(h.writes.length, 0)
})

test('only one migration can run at a time, including while a stopped request is settling', async () => {
  const { api } = harness()
  const plan = fixture(api, 'client-profile')
  const h = fakeGateway(plan, [])
  let release
  let held = false
  h.gateway.page = () => { if (held) return Promise.resolve({ rows: [], nextLink: '' }); held = true; return new Promise((resolve) => { release = () => resolve({ rows: [], nextLink: '' }) }) }
  const running = api.runLegacyMigration(plan, options, h.gateway, new AbortController().signal, {})
  await assert.rejects(api.runLegacyMigration(plan, options, h.gateway, new AbortController().signal, {}), /Another table migration/)
  release(); await running
})

for (const local of [true, false]) {
  test(`${local ? 'local' : 'runtime'} gateway uses verified metadata, complete paging, and update-only conditional PATCH`, async () => {
    const { api, calls } = harness({ local })
    const plan = fixture(api)
    const responses = [{ value: [plan.source] }, { value: [] }, {}]
    const h = harness({ local, responses })
    const gateway = h.api.createMigrationGateway()
    const signal = new AbortController().signal
    await gateway.metadata(plan.definition, signal)
    const token = 'cookie + % < >'
    const nextLink = `${org}/api/data/v9.2/${plan.source.EntitySetName}?$skiptoken=${encodeURIComponent(token)}`
    await gateway.page(plan.source, [plan.source.PrimaryIdAttribute, 'cmps_recordid'], nextLink, signal)
    await gateway.update(plan.source, sourceId, { cmps_recordid: 'A1' }, 'W/"123"', signal)
    assert.equal(h.calls.length, 3)
    if (local) {
      assert.equal(h.calls[1].url, nextLink)
      assert.equal(h.calls[2].init.headers['If-Match'], 'W/"123"')
      assert.equal(h.calls[2].init.method, 'PATCH')
      assert.equal(new URL(h.calls[0].url).searchParams.get('$top'), null)
    } else {
      assert.equal(h.calls[1].parameters.$skiptoken, token)
      assert.equal(h.calls[2].operationName, 'UpdateOnlyRecordWithOrganization')
      assert.equal(h.calls[2].parameters['If-Match'], 'W/"123"')
      assert.equal(h.calls[1].parameters.$top, undefined)
    }
    assert.equal(calls.length, 0)
    await assert.rejects(gateway.page(plan.source, [], 'https://evil.example/api/data/v9.2/clients?$skiptoken=1', signal), /Invalid continuation/)
  })
}

for (const local of [true, false]) {
  const mode = local ? 'local' : 'runtime'
  test(`${mode} continuation accepts only the same organization API hostname and preserves the opaque cookie`, async () => {
    const h = harness({ local, responses: [{ value: [] }, { value: [] }, { value: [] }] })
    const plan = fixture(h.api, 'client-profile')
    const gateway = h.api.createMigrationGateway()
    const cookie = '<cookie pagenumber="2" opaque="a+b %253C &amp; private-cookie" />'
    const links = [
      `https://org1f466e4e.api.crm.dynamics.com/api/data/v9.2/${plan.source.EntitySetName}?$skiptoken=${encodeURIComponent(cookie)}`,
      `${org}/api/data/v9.0/${plan.source.EntitySetName}?$skiptoken=${encodeURIComponent(cookie)}`,
      `/api/data/v9.1.0/${plan.source.EntitySetName}/?$skiptoken=${encodeURIComponent(cookie)}`,
    ]
    for (const link of links) {
      await gateway.page(plan.source, [plan.source.PrimaryIdAttribute], link, new AbortController().signal)
      const call = h.calls.at(-1)
      if (local) {
        assert.equal(call.url, new URL(link, `${org}/`).href)
        assert.equal(new URL(call.url).searchParams.get('$skiptoken'), cookie)
      } else {
        assert.equal(call.parameters.$skiptoken, cookie)
        assert.equal(call.parameters.organization, org)
      }
    }
    const unsafeLinks = [
      'https://other-org.api.crm.dynamics.com',
      'https://org1f466e4e.api.crm2.dynamics.com',
      'https://org1f466e4e.api.crm.dynamics.com.evil.example',
      'https://org1f466e4e.api.crm.dynamics.com:444',
      'http://org1f466e4e.crm.dynamics.com',
      'https://username:password@org1f466e4e.crm.dynamics.com',
    ].map((host) => `${host}/api/data/v9.2/${plan.source.EntitySetName}?$skiptoken=private-cookie`)
    unsafeLinks.push(
      `${org}/api/data/v9.2/cmps_serviceses?$skiptoken=private-cookie`,
      `${org}/api/data/v9.2/${plan.source.EntitySetName}?$skiptoken=private-cookie#fragment`,
      `${org}/api/data/v9.2/${plan.source.EntitySetName}?$skiptoken=private-cookie&$skiptoken=other`,
      `${org}/api/data/v9.2/${plan.source.EntitySetName}`,
      `${org}/api/data/v9.9/${plan.source.EntitySetName}?$skiptoken=private-cookie`,
    )
    for (const link of unsafeLinks) await assert.rejects(gateway.page(plan.source, [], link, new AbortController().signal), (error) => {
      assert.match(error.message, /Invalid continuation link/)
      assert.ok(!error.message.includes('private-cookie'))
      return true
    })
    assert.equal(h.calls.length, 3, 'Rejected URLs must never be requested')
  })

  test(`${mode} invalid returned cursor fails before this page can write or advance its checkpoint`, async () => {
    const h = harness({ local, responses: [{ value: [], '@odata.nextLink': `${org}/api/data/v9.2/cmps_serviceses?$skiptoken=private-cookie` }] })
    const plan = fixture(h.api, 'client-profile')
    let checkpoint
    await assert.rejects(h.api.runLegacyMigration(plan, options, h.api.createMigrationGateway(), new AbortController().signal, {
      checkpoint: (value) => { checkpoint = value },
    }), (error) => {
      assert.match(error.message, /Existing Record ID scan failed on page 1/)
      assert.match(error.message, /No records were changed during this preflight scan/)
      assert.ok(!error.message.includes('private-cookie'))
      return true
    })
    assert.equal(h.calls.length, 1)
    assert.equal(checkpoint.nextLink, '')
    assert.equal(checkpoint.counts.pages, 0)
  })

  for (const wrapped of local ? [false] : [false, true]) {
  test(`${mode} actual gateway previews and translates 5,229 profiles across ${wrapped ? 'Power Platform connector' : 'API-host'} continuations without skips or duplicate IDs`, async () => {
    const total = 5229
    let plan
    const writes = []
    const rows = Array.from({ length: total }, (_, index) => ({
      cmps_clientprofileid: id(index + 1), cmps_clientid: `LEGACY-${index}`,
      cmps_recordid: index >= total - 5 ? `CP-04${index - (total - 5) + 1}` : index === 0 ? 'LEGACY-0' : '',
      '@odata.etag': 'W/"123"',
    }))
    const h = harness({ local, respond: async (call) => {
      const url = call.url ? new URL(call.url) : null
      const nested = call.operationName === 'GetNextPageWithOrganization' ? new URL(call.parameters.next, `${org}/`) : null
      const parameters = url || nested ? Object.fromEntries((url || nested).searchParams) : call.parameters
      if (call.init?.method === 'PATCH' || call.operationName === 'UpdateOnlyRecordWithOrganization') {
        const rowId = url ? url.pathname.match(/\(([^)]+)\)/)[1] : parameters.recordId
        const payload = url ? JSON.parse(call.init.body) : parameters.item
        assert.equal(url ? call.init.headers['If-Match'] : parameters['If-Match'], 'W/"123"')
        const row = rows.find((record) => record.cmps_clientprofileid === rowId)
        assert.ok(row)
        Object.assign(row, payload)
        writes.push({ rowId, payload })
        return {}
      }
      const offset = Number(String(parameters.$skiptoken || '').match(/offset="(\d+)"/)?.[1] || 0)
      const end = Math.min(offset + 1000, total)
      const next = new URL(`https://org1f466e4e.api.crm.dynamics.com/api/data/v9.0/${plan.source.EntitySetName}`)
      next.searchParams.set('$select', parameters.$select)
      next.searchParams.set('$orderby', parameters.$orderby)
      next.searchParams.set('$skiptoken', `<cookie offset="${end}" opaque="a+b %253C &amp;" />`)
      assert.equal(parameters.$top, undefined)
      return { value: rows.slice(offset, end).map((row) => ({ ...row })), ...(end < total ? { '@odata.nextLink': wrapped ? connectorLink(next.pathname.slice(1) + next.search) : next.href } : {}) }
    } })
    plan = fixture(h.api, 'client-profile')
    const gateway = h.api.createMigrationGateway()
    const updates = []
    const preview = await h.api.runLegacyMigration(plan, { ...options, preview: true }, gateway, new AbortController().signal, { progress: (value) => updates.push(value) })
    assert.equal(preview.counts.read, total)
    assert.equal(preview.counts.updated, total - 5)
    assert.equal(preview.counts.pages, 6)
    assert.equal(writes.length, 0, 'Preview must remain read-only')
    assert.ok(updates.some((value) => value.phase === 'sequence' && value.sequenceRecords === total && value.phasePage === 6))
    const translated = await h.api.runLegacyMigration(plan, options, gateway, new AbortController().signal, {})
    assert.equal(translated.counts.read, total)
    assert.equal(translated.counts.updated, total - 5)
    assert.equal(translated.counts.pages, 6)
    assert.equal(translated.counts.issues, 0)
    assert.equal(writes.length, total - 5)
    assert.equal(new Set(writes.map((write) => write.rowId)).size, total - 5)
    assert.equal(new Set(rows.map((row) => row.cmps_recordid)).size, total)
    assert.equal(rows[0].cmps_recordid, 'CP-046', 'Highest existing ID on page 6 must be reserved before writing')
    assert.ok(rows.every((row, index) => row.cmps_clientid === `LEGACY-${index}`))
    const rerun = await h.api.runLegacyMigration(plan, options, gateway, new AbortController().signal, {})
    assert.equal(rerun.counts.updated, 0)
    assert.equal(writes.length, total - 5)
    if (wrapped) {
      assert.equal(h.calls.filter((call) => call.operationName === 'GetNextPageWithOrganization').length, 30, 'Six full scans should each follow five connector continuations')
      assert.equal(h.calls.filter((call) => call.url).length, 0, 'Connector routes must use the SDK, never fetch with a bearer token')
    }
  })
  }

  test(`${mode} normal app ID generation also follows same-organization API continuations`, async () => {
    const h = harness({ local, runtimeFailure: local ? { message: 'Connector unavailable' } : undefined, responses: [
      { value: [{ cmps_recordid: 'CP-044' }], '@odata.nextLink': 'https://org1f466e4e.api.crm.dynamics.com/api/data/v9.0/cmps_clientprofiles?$skiptoken=next' },
      { value: [{ cmps_recordid: 'CP-045' }] },
    ] })
    assert.equal(await h.load('./recordIds.ts').generateSequentialRecordId('cmps_clientprofiles', 'CP'), 'CP-046')
  })
}

for (const local of [true, false]) {
  test(`${local ? 'local' : 'runtime'} connector continuation validates environment, connection, organization and nested table`, async () => {
    const h = harness({ local, responses: [{ value: [] }] })
    const plan = fixture(h.api, 'client-profile')
    const gateway = h.api.createMigrationGateway()
    const cookie = '<cookie page="2" opaque="a+b %253C &amp; private-cookie" />'
    const next = `api/data/v9.1.0/cmps_clientprofiles?$select=cmps_recordid&$skiptoken=${encodeURIComponent(cookie)}`
    const link = connectorLink(next)
    await gateway.page(plan.source, ['cmps_recordid'], link, new AbortController().signal)
    const call = h.calls.at(-1)
    if (local) {
      assert.equal(call.url, new URL(next, `${org}/`).href)
      assert.equal(new URL(call.url).searchParams.get('$skiptoken'), cookie)
      assert.ok(!call.url.includes('powerplatform.com'))
    } else {
      assert.equal(call.operationName, 'GetNextPageWithOrganization')
      assert.equal(call.parameters.next, next, 'Pass the nested route untouched to the SDK')
      assert.equal(call.parameters.organization, org)
      // Mirror the SDK query encoder: one wrapper layer, not two.
      assert.equal(new URL(`https://sdk.invalid/?next=${encodeURIComponent(call.parameters.next)}`).searchParams.get('next'), next)
    }
    const unsafe = [
      link.replace('default0528', 'default9999'),
      link.replace('62736235ca85441e9b4ecd279e60c1f7', '00000000000000000000000000000000'),
      link.replace('/commondataserviceforapps/', '/otherconnector/'),
      link.replace('https://', 'http://'),
      link.replace('https://', 'https://user:password@'),
      link.replace('.powerplatform.com/', '.powerplatform.com.evil.example/'),
      `${link}#fragment`,
      `${link}&organization=${encodeURIComponent(org)}`,
      `${link}&next=${encodeURIComponent(next)}`,
      connectorEndpoint,
      connectorLink(next, 'https://other-org.crm.dynamics.com'),
      connectorLink(next, `${org}/unexpected`),
      connectorLink('https://evil.example/api/data/v9.2/cmps_clientprofiles?$skiptoken=private-cookie'),
      connectorLink(next.replace('cmps_clientprofiles', 'cmps_serviceses')),
      connectorLink('api/data/v9.2/cmps_clientprofiles'),
    ]
    for (const cursor of unsafe) await assert.rejects(gateway.page(plan.source, [], cursor, new AbortController().signal), (error) => {
      assert.match(error.message, /Invalid continuation link/)
      assert.ok(!error.message.includes('private-cookie'))
      return true
    })
    assert.equal(h.calls.length, 1, 'Unsafe continuations must never be requested')
    const parse = h.load('./dataverseContinuation.ts')
    assert.equal(parse.continuationPageKey(link), cookie)
    assert.equal(parse.continuationPageKey(new URL(next, `${org}/`).href), cookie)
  })
}

test('connector next-page failure keeps the unfinished migration checkpoint without skipping records', async () => {
  const cursor = connectorLink('api/data/v9.1.0/cmps_clientprofiles?$skiptoken=next')
  const h = harness({ local: false, respond: async (call) => {
    if (call.operationName === 'GetNextPageWithOrganization') throw { status: 403, message: 'Forbidden' }
    return { value: [{ cmps_clientprofileid: sourceId, cmps_clientid: '12345' }], '@odata.nextLink': cursor }
  } })
  let checkpoint
  await assert.rejects(h.api.runLegacyMigration(fixture(h.api, 'client-profile'), options, h.api.createMigrationGateway(), new AbortController().signal, {
    checkpoint: (value) => { checkpoint = value },
  }), /Existing Record ID scan failed on page 2.*after 1 records scanned/)
  assert.equal(checkpoint.counts.pages, 0)
  assert.equal(h.calls.length, 2)
  assert.ok(h.calls.every((call) => call.operationName !== 'UpdateOnlyRecordWithOrganization'))
})

test('normal record-ID allocation uses connector next pages and the highest ID beyond page one', async () => {
  const h = harness({ local: false, responses: [
    { value: [{ cmps_recordid: 'CP-044' }], '@odata.nextLink': connectorLink('api/data/v9.1.0/cmps_clientprofiles?$skiptoken=next') },
    { value: [{ cmps_recordid: 'CP-045' }] },
  ] })
  assert.equal(await h.load('./recordIds.ts').generateSequentialRecordId('cmps_clientprofiles', 'CP'), 'CP-046')
  assert.equal(h.calls[1].operationName, 'GetNextPageWithOrganization')
})

test('failed record-ID connector paging restarts the entire Web API scan, never allocates from a partial page', async () => {
  const h = harness({ local: false, respond: async (call) => {
    if (call.operationName === 'GetNextPageWithOrganization') throw { status: 403, message: 'Forbidden' }
    if (call.operationName) return { value: [{ cmps_recordid: 'CP-001' }], '@odata.nextLink': connectorLink('api/data/v9.1.0/cmps_clientprofiles?$skiptoken=next') }
    return { value: [{ cmps_recordid: 'CP-045' }] }
  } })
  assert.equal(await h.load('./recordIds.ts').generateSequentialRecordId('cmps_clientprofiles', 'CP'), 'CP-046')
  assert.equal(h.calls.length, 3)
  assert.equal(new URL(h.calls[2].url).searchParams.get('$skiptoken'), null)
})

test('errors identify the failing phase, page, and count while keeping the last complete checkpoint', async () => {
  const { api } = harness()
  const plan = fixture(api, 'client-profile')
  const rows = Array.from({ length: 1001 }, (_, index) => ({ [plan.source.PrimaryIdAttribute]: id(index + 1), cmps_clientid: `C${index}` }))
  const h = fakeGateway(plan, rows, [], 1000)
  const original = h.gateway.page
  let checkpoint
  h.gateway.page = async (...args) => {
    if (!args[1].includes('cmps_clientid') && args[2] === '1000') throw new Error('Invalid continuation link')
    return original(...args)
  }
  await assert.rejects(api.runLegacyMigration(plan, options, h.gateway, new AbortController().signal, { checkpoint: (value) => { checkpoint = value } }), /Existing Record ID scan failed on page 2.*after 1,000 records scanned/)
  assert.equal(h.writes.length, 0)
  assert.equal(checkpoint.counts.read, 0)
  h.gateway.page = async (...args) => {
    if (args[1].includes('cmps_clientid') && args[2] === '1000') throw new Error('Invalid continuation link')
    return original(...args)
  }
  await assert.rejects(api.runLegacyMigration(plan, options, h.gateway, new AbortController().signal, { checkpoint: (value) => { checkpoint = value } }), /Source record processing failed on page 2.*after 1,000 records processed/)
  assert.equal(checkpoint.nextLink, '1000')
  assert.equal(checkpoint.counts.read, 1000)
  assert.equal(h.writes.length, 1000)
  h.gateway.page = original
  const resumed = await api.runLegacyMigration(plan, options, h.gateway, new AbortController().signal, {}, checkpoint)
  assert.equal(resumed.complete, true)
  assert.equal(resumed.counts.read, 1001)
  assert.equal(h.writes.length, 1001)
})

test('repeated cookies are rejected even if the continuation hostname or version spelling changes', async () => {
  const { api } = harness()
  const plan = fixture(api, 'client-profile')
  let page = 0
  const gateway = { page: async () => ({ rows: [], nextLink: ++page === 1
    ? `${org}/api/data/v9.2/cmps_clientprofiles?$skiptoken=same-cookie`
    : 'https://org1f466e4e.api.crm.dynamics.com/api/data/v9.0/cmps_clientprofiles?$skiptoken=same-cookie' }) }
  await assert.rejects(api.runLegacyMigration(plan, options, gateway, new AbortController().signal, {}), /sequence paging repeated on page 2/)
  assert.equal(page, 2)
})

test('runtime throttling waits are interruptible, and authorization errors are not retried', async () => {
  const controller = new AbortController()
  const throttled = harness({ local: false, runtimeFailure: { status: 429, message: 'Throttled', retryAfter: 60 } })
  const plan = fixture(throttled.api)
  const request = throttled.api.createMigrationGateway().page(plan.source, [], '', controller.signal)
  setTimeout(() => controller.abort(), 10)
  await assert.rejects(request)
  assert.equal(throttled.calls.length, 1)
  const denied = harness({ local: false, runtimeFailure: { status: 403, message: 'Forbidden' } })
  await assert.rejects(denied.api.createMigrationGateway().page(plan.source, [], '', new AbortController().signal), /Forbidden/)
  assert.equal(denied.calls.length, 1)
})

test('issue CSV quotes special characters and neutralizes spreadsheet formulas', () => {
  const { api } = harness()
  const csv = api.migrationIssueCsv({ id: sourceId, legacyId: '=dangerous()', parentLegacyId: '001', message: 'Missing "parent", retry' })
  assert.ok(csv.includes('"\'=dangerous()"')); assert.ok(csv.includes('"001"')); assert.ok(csv.includes('"Missing ""parent"", retry"'))
})

test('admin-only UI includes table selection, preview, explicit replacement, pause/resume, and issue download', () => {
  const app = readFileSync(new URL('../App.tsx', import.meta.url), 'utf8')
  const panel = readFileSync(new URL('./LegacyRecordMigrationPanel.tsx', import.meta.url), 'utf8')
  assert.match(app, /canAccessRoleAdmin && adminPage === 'legacy-migration' && !isUserPreview \? <LegacyRecordMigrationPanel/)
  assert.match(panel, /<select value={tableKey}/)
  for (const label of ['Check Table Mapping', 'Preview Selected Table', 'Translate Selected Table', 'Resume Selected Table', 'Download Issue Report', 'Download Change Report']) assert.ok(panel.includes(label))
  assert.match(panel, /disabled={busy \|\| !reviewed \|\| !validLookup}/)
  assert.match(panel, /controller.current\?\.abort\(\)/)
  assert.match(panel, /sessionStorage.setItem\(storageKey, JSON.stringify\(value\)\)/)
  assert.match(panel, /cmps_cpid/)
})
