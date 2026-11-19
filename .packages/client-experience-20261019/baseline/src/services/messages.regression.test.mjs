import assert from 'node:assert/strict'
import { readFileSync, existsSync } from 'node:fs'
import test from 'node:test'
import vm from 'node:vm'
import ts from 'typescript'
import * as React from 'react'
import * as JSX from 'react/jsx-runtime'
import { renderToStaticMarkup } from 'react-dom/server'

const schemaSource = readFileSync(new URL('../../.power/schemas/appschemas/dataSourcesInfo.ts', import.meta.url), 'utf8')
const connectorSchema = JSON.parse(schemaSource.slice(schemaSource.indexOf('{'), schemaSource.lastIndexOf('}') + 1))
const id = (n) => `11111111-1111-1111-1111-${String(n).padStart(12, '0')}`
const now = Date.parse('2026-10-09T17:00:00Z')
const draft = () => ({ cmps_recordid: 'MSG-041', cmps_messagename: 'Admin-only name', cmps_startdatetime: '2026-10-09T16:00:00Z', cmps_enddatetime: '2026-10-09T18:00:00Z', cmps_type: '125570000', cmps_message: 'Hello COMPASS\nSecond line' })
const row = (n = 1, values = {}) => ({ ...draft(), cmps_actualmessageid: id(n), cmps_type: 125570000, cmps_isarchived: 125570001, createdon: '2026-10-08T16:00:00Z', modifiedon: '2026-10-08T16:00:00Z', ...values })
function metadata(optional = true) {
  return { PrimaryIdAttribute: 'cmps_actualmessageid', Attributes: Object.keys(draft()).map((LogicalName) => ({ LogicalName, AttributeType: LogicalName === 'cmps_type' ? 'Picklist' : LogicalName.endsWith('datetime') ? 'DateTime' : 'String' })).concat(optional ? [{ LogicalName: 'cmps_isarchived', AttributeType: 'Picklist' }, { LogicalName: 'cmps_createdby', AttributeType: 'String' }, { LogicalName: 'cmps_modifiedby', AttributeType: 'String' }] : []) }
}
function harness({ local = false, records = [row()], meta = metadata(), behavior = 'UserLocal', handler, metadataHandler, hooks = {}, browser = {} } = {}) {
  const calls = [], cache = new Map()
  function response(data) { return local ? { ok: true, json: async () => data, text: async () => '' } : { success: true, data } }
  async function handle(call) {
    calls.push(call)
    const entity = local ? decodeURIComponent(new URL(call.url).pathname.split('/api/data/v9.2/')[1].split('?')[0]) : call.parameters.entityName
    const parameters = local ? Object.fromEntries(new URL(call.url).searchParams) : call.parameters
    if (entity?.startsWith('EntityDefinitions')) {
      if (metadataHandler) {
        const intercepted = metadataHandler(call, parameters)
        if (intercepted) return intercepted
      }
      // Dataverse schema-definition requests accept select/filter/expand, not top or paging.
      for (const key of Object.keys(parameters).filter((key) => key.startsWith('$'))) assert.ok(['$select', '$filter', '$expand'].includes(key), `Unsupported metadata query parameter: ${key}`)
      assert.doesNotMatch(local ? call.init.headers.Prefer : parameters.prefer, /maxpagesize/)
    }
    if (entity === 'EntityDefinitions') return response({ value: [meta] }, call)
    if (entity?.includes('DateTimeAttributeMetadata')) return response({ value: ['cmps_startdatetime', 'cmps_enddatetime'].map((LogicalName) => ({ LogicalName, DateTimeBehavior: { Value: behavior } })) }, call)
    if (handler) return handler(call, parameters)
    const item = local ? call.init.body ? JSON.parse(call.init.body) : null : parameters.item
    return response(item ? { ...row(), ...item } : { value: records }, call)
  }
  function load(file) {
    if (cache.has(file)) return cache.get(file)
    const source = readFileSync(new URL(file, import.meta.url), 'utf8').replaceAll('import.meta.env', '({})')
    const javascript = ts.transpileModule(source, { compilerOptions: { module: ts.ModuleKind.CommonJS, target: ts.ScriptTarget.ES2022, jsx: ts.JsxEmit.ReactJSX } }).outputText
    const module = { exports: {} }; cache.set(file, module.exports)
    vm.runInNewContext(javascript, {
      module, exports: module.exports, URL, URLSearchParams, Headers, AbortController, DOMException, console,
      window: { location: { hostname: local ? 'localhost' : 'powerapps.example' }, confirm: () => true, ...browser },
      document: { visibilityState: 'visible', addEventListener() {}, removeEventListener() {} },
      fetch: async (url, init) => handle({ url, init }),
      require(name) {
        if (name === 'react') return { ...React, ...hooks }
        if (name === 'react/jsx-runtime') return JSX
        if (name.endsWith('.css')) return {}
        if (name === '@microsoft/power-apps/data') return { getClient: () => ({ executeAsync: async ({ connectorOperation: call }) => {
          const operation = connectorSchema.commondataserviceforapps.apis[call.operationName]
          assert.ok(operation, `Unsupported ${call.operationName}`)
          for (const parameter of operation.parameters.filter((p) => p.required && p.name !== 'connectionId')) assert.notEqual(call.parameters[parameter.name], undefined, parameter.name)
          return handle(call)
        } }) }
        if (name.includes('dataSourcesInfo')) return { dataSourcesInfo: connectorSchema }
        if (name === './auth') return { getAuthToken: () => 'test-token', ensureAuthToken: async () => 'test-token' }
        if (name.endsWith('.json')) return JSON.parse(readFileSync(new URL(name, import.meta.url), 'utf8'))
        if (name.startsWith('./')) return load(`${name}${existsSync(new URL(`${name}.tsx`, import.meta.url)) ? '.tsx' : '.ts'}`)
        throw Error(`Unexpected ${name}`)
      },
    }, { filename: file })
    return module.exports
  }
  return { load, calls, api: load('./messages.ts') }
}
const payload = (call) => call.parameters?.item || (call.init?.body ? JSON.parse(call.init.body) : null)
const writes = (h) => h.calls.filter((call) => payload(call))

for (const local of [false, true]) test(`${local ? 'local' : 'runtime'} Home messages resolve metadata without unsupported top/paging parameters`, async () => {
  const h = harness({ local })
  const records = await h.api.loadMessages('home', now)
  assert.equal(records.length, 1); assert.equal(h.api.visibleHomeMessages(records, now)[0].cmps_message, draft().cmps_message)
  const metadataCalls = h.calls.filter((call) => local ? call.url.includes('/EntityDefinitions') : call.parameters.entityName.startsWith('EntityDefinitions'))
  assert.equal(metadataCalls.length, 2)
  for (const call of metadataCalls) {
    const query = local ? Object.fromEntries(new URL(call.url).searchParams) : call.parameters
    for (const key of ['$top', '$skip', '$skiptoken', '$orderby', '$count']) assert.equal(query[key], undefined, key)
  }
})

for (const local of [false, true]) test(`${local ? 'local' : 'runtime'} message errors identify table versus date metadata versus record reads and unwrap Dataverse JSON errors`, async () => {
  const error = { error: { code: '0x80060888', message: 'The query parameter is not supported' } }
  const rejected = () => local ? { ok: false, text: async () => JSON.stringify(error) } : { success: false, error: JSON.stringify(error) }
  for (const [stage, match] of [['EntityDefinitions', /Messages table metadata query failed: The query parameter is not supported/], ['DateTimeAttributeMetadata', /Messages schedule metadata query failed: The query parameter is not supported/], ['records', /Messages record query failed: The query parameter is not supported/]]) {
    const h = harness({ local, metadataHandler: (call, parameters) => {
      const entity = local ? decodeURIComponent(new URL(call.url).pathname) : parameters.entityName
      if (stage === 'EntityDefinitions' ? entity.endsWith('EntityDefinitions') : stage === 'DateTimeAttributeMetadata' && entity.includes(stage)) return rejected()
    }, handler: stage === 'records' ? rejected : undefined })
    await assert.rejects(h.api.loadMessages('home', now), match)
  }
})

test('message visibility uses inclusive start and exclusive end, section choices, archive flags and nonblank text', () => {
  const { api } = harness()
  const records = [
    { ...draft(), id: id(1), archived: false },
    { ...draft(), id: id(2), archived: false, cmps_startdatetime: new Date(now).toISOString(), cmps_type: '125570001' },
    { ...draft(), id: id(3), archived: false, cmps_startdatetime: new Date(now + 1).toISOString() },
    { ...draft(), id: id(4), archived: false, cmps_enddatetime: new Date(now).toISOString() },
    { ...draft(), id: id(5), archived: true },
    { ...draft(), id: id(6), archived: false, cmps_type: '125570002' },
    { ...draft(), id: id(7), archived: false, cmps_message: '  ' },
    { ...draft(), id: id(8), archived: false, cmps_startdatetime: '' },
    { ...draft(), id: id(9), archived: false, cmps_enddatetime: draft().cmps_startdatetime },
  ]
  assert.deepEqual(Array.from(api.visibleHomeMessages(records, now), (record) => record.id), [id(2), id(1)])
  assert.equal(api.messageStatus(records[2], now), 'Scheduled'); assert.equal(api.messageStatus(records[3], now), 'Expired')
  assert.equal(api.messageStatus(records[4], now), 'Archived'); assert.equal(api.messageStatus(records[8], now), 'Invalid schedule')
})

test('Home clock schedules exact start/end boundaries and caps idle checks at one minute', () => {
  const { api } = harness()
  assert.equal(api.nextMessageBoundaryDelay([], now), 60000)
  assert.equal(api.nextMessageBoundaryDelay([{ ...draft(), cmps_startdatetime: new Date(now + 501).toISOString(), cmps_enddatetime: new Date(now + 2500).toISOString() }], now), 501)
  assert.equal(api.nextMessageBoundaryDelay([{ ...draft(), cmps_enddatetime: new Date(now + 20).toISOString() }], now), 20)
  assert.equal(api.nextMessageBoundaryDelay([{ ...draft(), cmps_enddatetime: '' }], now), 60000)
})

test('message form rejects missing fields, invalid choices/dates and inverted or equal windows before any write', async () => {
  const { api, calls } = harness()
  for (const field of Object.keys(draft())) assert.ok(api.validateMessageDraft({ ...draft(), [field]: '' }), field)
  for (const changes of [{ cmps_type: 'Other' }, { cmps_type: '125570002' }, { cmps_startdatetime: '2026-02-30T12:00:00' }, { cmps_startdatetime: '2026-10-09' }, { cmps_startdatetime: '2026-10-09T24:00:00Z' }, { cmps_enddatetime: draft().cmps_startdatetime }, { cmps_enddatetime: '2026-10-09T15:00:00Z' }]) {
    assert.ok(api.validateMessageDraft({ ...draft(), ...changes }))
    await assert.rejects(api.saveMessage('', { ...draft(), ...changes }, 'Admin'))
  }
  await assert.rejects(api.saveMessage('not-a-guid', draft(), 'Admin'), /row ID/)
  assert.equal(calls.length, 0)
  assert.equal(api.validateMessageDraft(draft()), '')
})

for (const local of [false, true]) {
  test(`${local ? 'local' : 'runtime'} Messages saves all six fields, numeric choices and audit names on create/edit without writing system dates`, async () => {
    const h = harness({ local })
    for (const type of ["What's New?", 'On The Horizon']) {
      await h.api.saveMessage('', { ...draft(), cmps_type: type }, 'IT Admin')
      const created = payload(writes(h).at(-1))
      assert.equal(created.cmps_type, type === "What's New?" ? 125570000 : 125570001)
      assert.equal(created.cmps_startdatetime, draft().cmps_startdatetime.replace('Z', '.000Z'))
      assert.equal(created.cmps_enddatetime, draft().cmps_enddatetime.replace('Z', '.000Z'))
      assert.equal(created.cmps_recordid, draft().cmps_recordid); assert.equal(created.cmps_messagename, draft().cmps_messagename); assert.equal(created.cmps_message, draft().cmps_message)
      assert.equal(created.cmps_createdby, 'IT Admin'); assert.equal(created.cmps_modifiedby, 'IT Admin'); assert.equal(created.cmps_isarchived, 125570001)
      assert.equal('createdon' in created, false); assert.equal('modifiedon' in created, false)
      await h.api.saveMessage(id(1), { ...draft(), cmps_type: String(created.cmps_type) }, 'Second Admin')
      const updated = payload(writes(h).at(-1))
      assert.equal(updated.cmps_type, created.cmps_type); assert.equal(updated.cmps_modifiedby, 'Second Admin')
      assert.equal('cmps_createdby' in updated, false); assert.equal('cmps_isarchived' in updated, false)
      const call = writes(h).at(-1)
      if (local) { assert.equal(call.init.method, 'PATCH'); assert.match(call.url, new RegExp(`cmps_messageses\\(${id(1)}\\)`)) }
      else { assert.equal(call.operationName, 'UpdateRecordWithOrganization'); assert.equal(call.parameters.entityName, 'cmps_messageses'); assert.equal(call.parameters.recordId, id(1)) }
    }
    assert.equal(h.calls.filter((call) => call.parameters?.entityName === 'EntityDefinitions' || call.url?.includes('/EntityDefinitions?')).length, 1, 'metadata is cached')
  })
  test(`${local ? 'local' : 'runtime'} Home reads are server-filtered, paged and retain future messages for boundary transitions`, async () => {
    const queries = []
    const h = harness({ local, handler: (call, parameters) => {
      queries.push(parameters)
      const continuation = parameters.$skiptoken || parameters.next
      const data = { value: [row(continuation ? 2 : 1, { cmps_startdatetime: continuation ? '2026-10-10T16:00:00Z' : draft().cmps_startdatetime })], ...(!continuation ? { '@odata.nextLink': 'https://org1f466e4e.crm.dynamics.com/api/data/v9.2/cmps_messageses?$skiptoken=message-page-two' } : {}) }
      return local ? { ok: true, json: async () => data } : { success: true, data }
    } })
    const records = await h.api.loadMessages('home', now)
    assert.equal(records.length, 2); assert.equal(records[1].id, id(2))
    assert.equal(h.api.visibleHomeMessages(records, now).length, 1)
    for (const query of queries) {
      assert.match(query.$filter, /cmps_enddatetime gt 2026-10-09T17:00:00.000Z/)
      assert.match(query.$filter, /cmps_isarchived ne 125570000 or cmps_isarchived eq null/)
      assert.match(query.$filter, /cmps_type eq 125570000 or cmps_type eq 125570001/)
      assert.doesNotMatch(query.$filter, /cmps_startdatetime le/, 'upcoming messages remain available')
      assert.ok(query.$select.includes('cmps_actualmessageid')); assert.ok(query.$select.includes('cmps_message'))
    }
  })
  test(`${local ? 'local' : 'runtime'} new message IDs scan all pages including archived IDs and continue the app sequence`, async () => {
    const h = harness({ local, handler: (_call, parameters) => {
      assert.equal(parameters.$filter, undefined)
      const second = parameters.$skiptoken
      const data = { value: [{ cmps_recordid: second ? 'MSG-049' : 'MSG-041' }], ...(!second ? { '@odata.nextLink': 'https://org1f466e4e.crm.dynamics.com/api/data/v9.2/cmps_messageses?$skiptoken=ids-two' } : {}) }
      return local ? { ok: true, json: async () => data } : { success: true, data }
    } })
    assert.equal(await h.api.generateNextMessageRecordId(), 'MSG-0410')
  })
  test(`${local ? 'local' : 'runtime'} archive/restore updates only the archive flag and last editor; archived reads use the proper alias`, async () => {
    const h = harness({ local, records: [row(1, { cmps_isarchived: 125570000 })] })
    for (const archived of [true, false]) {
      await h.api.archiveMessage(id(1), archived, 'Admin')
      assert.deepEqual(JSON.parse(JSON.stringify(payload(writes(h).at(-1)))), { cmps_isarchived: archived ? 125570000 : 125570001, cmps_modifiedby: 'Admin' })
    }
    const archived = await h.api.loadMessages('archived')
    assert.equal(archived[0].archived, true)
    const call = h.calls.at(-1), query = local ? Object.fromEntries(new URL(call.url).searchParams) : call.parameters
    assert.equal(query.$filter, 'cmps_isarchived eq 125570000')
  })
}

test('message metadata does not guess primary IDs or silently accept missing columns', async () => {
  for (const meta of [{ ...metadata(), PrimaryIdAttribute: '' }, { ...metadata(), Attributes: [] }, { ...metadata(), Attributes: metadata().Attributes.map((attribute) => attribute.LogicalName === 'cmps_type' ? { ...attribute, AttributeType: 'MultiSelectPicklist' } : attribute) }]) {
    const h = harness({ meta }); await assert.rejects(h.api.loadMessages('admin'), /metadata|column/)
    assert.equal(writes(h).length, 0)
  }
  await assert.rejects(harness({ behavior: 'DateOnly' }).api.loadMessages('admin'), /date-and-time/)
})
test('messages work with exactly the six supplied columns; absent optional archive/audit fields are never sent', async () => {
  const h = harness({ meta: metadata(false) })
  await h.api.saveMessage('', draft(), 'Admin')
  assert.deepEqual(Object.keys(payload(writes(h).at(-1))).sort(), Object.keys(draft()).sort())
  assert.equal(await h.api.messagesSupportArchive(), false)
  assert.equal((await h.api.loadMessages('archived')).length, 0)
  await assert.rejects(h.api.archiveMessage(id(1), true, 'Admin'), /cmps_isarchived/)
  const records = await h.api.loadMessages('admin')
  assert.equal(records[0].id, id(1))
  assert.equal('cmps_isarchived' in payload(writes(h)[0]), false)
})
test('message local date inputs round-trip instants; independent columns preserve their wall clock', async () => {
  const h = harness(), source = draft().cmps_startdatetime
  assert.equal(new Date(h.api.messageDateTimeForInput(source)).getTime(), Date.parse(source))
  assert.equal(h.api.messageDateTimeForInput('bad'), '')
  await h.api.saveMessage('', { ...draft(), cmps_startdatetime: h.api.messageDateTimeForInput(source), cmps_enddatetime: h.api.messageDateTimeForInput(draft().cmps_enddatetime) }, 'Admin')
  assert.equal(payload(writes(h)[0]).cmps_startdatetime, new Date(source).toISOString())
  const independent = harness({ behavior: 'TimeZoneIndependent' })
  const values = { ...draft(), cmps_startdatetime: '2026-10-09T10:00:00', cmps_enddatetime: '2026-10-09T12:00:00' }
  await independent.api.saveMessage('', values, 'Admin')
  assert.equal(payload(writes(independent)[0]).cmps_startdatetime, '2026-10-09T10:00:00Z')
  const records = await independent.api.loadMessages('admin')
  assert.equal(records[0].cmps_startdatetime, source.replace('Z', ''))
})
test('connector-wrapped message pagination uses the next-page operation and invalid/repeated continuations fail visibly', async () => {
  const next = `https://default0528c75bbb2a4718b02a1902cc340b.62.environment.api.powerplatform.com/connectors/runtime/invoke/scalegroups/usa/shards/00/apis/commondataserviceforapps/connections/62736235ca85441e9b4ecd279e60c1f7/nextLink?organization=https%3A%2F%2Forg1f466e4e.crm.dynamics.com&next=${encodeURIComponent('https://org1f466e4e.crm.dynamics.com/api/data/v9.2/cmps_messageses?$skiptoken=encoded-cookie')}`
  const h = harness({ handler: (call) => ({ success: true, data: { value: [row(call.operationName.startsWith('GetNext') ? 2 : 1)], ...(!call.operationName.startsWith('GetNext') ? { '@odata.nextLink': next } : {}) } }) })
  assert.equal((await h.api.loadMessages('home', now)).length, 2)
  assert.equal(h.calls.at(-1).operationName, 'GetNextPageWithOrganization')
  for (const continuation of ['https://evil.example/api/data/v9.2/cmps_messageses?$skiptoken=bad', 'https://org1f466e4e.crm.dynamics.com/api/data/v9.2/cmps_serviceses?$skiptoken=bad', next]) {
    const broken = harness({ handler: () => ({ success: true, data: { value: [row()], '@odata.nextLink': continuation } }) })
    await assert.rejects(broken.api.loadMessages('home', now), /continuation|repeated|link/i)
  }
})
test('message reads and saves surface Dataverse failures rather than claim success; aborted reads do not fetch record pages', async () => {
  const h = harness({ handler: () => ({ success: false, error: { message: 'Messages permission denied' } }) })
  await assert.rejects(h.api.loadMessages('admin'), /permission denied/)
  await assert.rejects(h.api.saveMessage('', draft(), 'Admin'), /permission denied/)
  const canceled = harness(), controller = new AbortController(); controller.abort()
  await assert.rejects(canceled.api.loadMessages('home', now, controller.signal), /Aborted/)
  assert.equal(canceled.calls.length, 2, 'only metadata was fetched')
})
test('Home sections render message text only, preserve whitespace and escape HTML; archived/expired/unknown types never render', () => {
  const h = harness(), sections = h.load('./HomeMessages.tsx').HomeMessageSections
  const messages = [
    { ...draft(), id: id(1), archived: false, cmps_message: '<script>alert(1)</script>\nText only' },
    { ...draft(), id: id(2), archived: false, cmps_type: '125570001', cmps_message: 'Upcoming feature' },
    { ...draft(), id: id(3), archived: true, cmps_message: 'Archived secret' },
    { ...draft(), id: id(4), archived: false, cmps_enddatetime: new Date(now).toISOString(), cmps_message: 'Expired secret' },
  ]
  const html = renderToStaticMarkup(React.createElement(sections, { messages, now }))
  assert.match(html, /What&#x27;s New\?/); assert.match(html, /On The Horizon/)
  assert.match(html, /&lt;script&gt;/); assert.match(html, /Upcoming feature/)
  assert.doesNotMatch(html, /<script>|Admin-only name|MSG-041|Archived secret|Expired secret|<input|<select/)
  const empty = renderToStaticMarkup(React.createElement(sections, { messages: [], now }))
  assert.match(empty, /No new updates right now/); assert.match(empty, /More is on the horizon/)
})

function hookRenderer(props = { canManage: true, savedBy: 'Admin' }, extra = {}) {
  const slots = [], deps = [], effects = [], cleanups = new Map(); let index = 0, dirty = false, tree
  const h = harness({ ...extra, hooks: {
    useState(initial) { const i = index++; if (!(i in slots)) slots[i] = typeof initial === 'function' ? initial() : initial; return [slots[i], (value) => { const next = typeof value === 'function' ? value(slots[i]) : value; if (!Object.is(next, slots[i])) { slots[i] = next; dirty = true } }] },
    useRef(initial) { const i = index++; return slots[i] ||= { current: initial } },
    useEffect(effect, next) { const i = index++; if (!deps[i] || !next || next.some((value, k) => !Object.is(value, deps[i][k]))) { deps[i] = next; effects.push(() => { cleanups.get(i)?.(); cleanups.set(i, effect()) }) } },
  } })
  const component = h.load('./MessagesAdminPanel.tsx').default
  return { ...h, props, render() { let count = 0; do { dirty = false; index = 0; tree = component(props); while (effects.length) effects.shift()(); assert.ok(++count < 15) } while (dirty); return tree }, unmount() { for (const cleanup of cleanups.values()) cleanup?.() } }
}
const text = (node) => typeof node === 'string' || typeof node === 'number' ? String(node) : Array.isArray(node) ? node.map(text).join('') : React.isValidElement(node) ? text(node.props.children) : ''
function descendants(node, type) {
  const rows = []; function visit(item) { if (Array.isArray(item)) item.forEach(visit); else if (React.isValidElement(item)) { if (item.type === type) rows.push(item); visit(item.props.children) } }
  visit(node); return rows
}
const button = (tree, label) => descendants(tree, 'button').find((node) => text(node) === label)
const flush = async () => { for (let i = 0; i < 30; i++) await Promise.resolve() }
test('IT Admin Add/Edit handlers build the form, require all fields, save without duplicate clicks and preserve existing row IDs', async () => {
  const h = hookRenderer(); h.render(); await flush(); let tree = h.render()
  assert.ok(button(tree, 'Add Message')); assert.ok(button(tree, 'Edit')); assert.ok(button(tree, 'Archive'))
  button(tree, 'Add Message').props.onClick(); button(tree, 'Add Message').props.onClick(); await flush(); tree = h.render()
  assert.equal(descendants(tree, 'input').find((input) => input.props.readOnly).props.value, 'MSG-042')
  assert.equal(descendants(tree, 'input').filter((input) => input.props.required).length, 3)
  assert.equal(descendants(tree, 'textarea')[0].props.required, true); assert.equal(descendants(tree, 'select')[0].props.required, true)
  button(tree, 'Cancel').props.onClick(); tree = h.render()
  button(tree, 'Edit').props.onClick(); tree = h.render()
  assert.equal(descendants(tree, 'input').find((input) => input.props.type === 'datetime-local').props.value, h.api.messageDateTimeForInput(draft().cmps_startdatetime))
  descendants(tree, 'form')[0].props.onSubmit({ preventDefault() {} }); descendants(tree, 'form')[0].props.onSubmit({ preventDefault() {} })
  await flush(); tree = h.render()
  assert.equal(writes(h).length, 1); assert.equal(writes(h)[0].parameters.recordId, id(1)); assert.equal(payload(writes(h)[0]).cmps_type, 125570000)
  assert.match(text(tree), /Saved message MSG-041/); assert.equal(descendants(tree, 'form').length, 1)
  const dialog = descendants(tree, h.load('./RecordSaveDialog.tsx').default)[0]
  assert.equal(dialog.props.result.status, 'saved'); assert.equal(dialog.props.result.rowId, id(1))
  dialog.props.onChoose('remain'); tree = h.render(); assert.equal(descendants(tree, 'form').length, 1)
  descendants(tree, 'form')[0].props.onSubmit({ preventDefault() {} }); await flush(); tree = h.render()
  assert.equal(writes(h).length, 2); assert.equal(writes(h)[1].parameters.recordId, id(1))
  descendants(tree, h.load('./RecordSaveDialog.tsx').default)[0].props.onChoose('search'); tree = h.render()
  assert.equal(descendants(tree, 'form').length, 0)
  h.unmount()
})
test('message administration is invisible/inert without IT Admin permissions, including stale handlers after access changes', async () => {
  const denied = hookRenderer({ canManage: false, savedBy: 'User' })
  assert.equal(denied.render(), null); await flush(); assert.equal(denied.calls.length, 0)
  const h = hookRenderer(); h.render(); await flush(); const tree = h.render()
  const staleAdd = button(tree, 'Add Message'), staleEdit = button(tree, 'Edit'), staleArchive = button(tree, 'Archive')
  h.props.canManage = false; assert.equal(h.render(), null)
  const count = h.calls.length
  staleAdd.props.onClick(); staleEdit.props.onClick(); staleArchive.props.onClick(); await flush()
  assert.equal(h.calls.length, count); assert.equal(writes(h).length, 0)
  const app = readFileSync(new URL('../App.tsx', import.meta.url), 'utf8')
  assert.match(app, /canAccessRoleAdmin && adminPage === 'messages' && !isUserPreview \? <MessagesAdminPanel/)
  assert.match(app, /canManage=\{canAccessRoleAdmin && !isUserPreview\}/)
  assert.match(app, /canAccessRoleAdmin \? <button[^\n]*>Home Messages<\/button>/)
  h.unmount(); denied.unmount()
})

test('a new Message remains editable with its saved row ID; saving again is an update', async () => {
  const h = hookRenderer(); h.render(); await flush(); let tree = h.render()
  button(tree, 'Add Message').props.onClick(); await flush(); tree = h.render()
  for (const [type, value] of [['text', 'New message'], ['datetime-local', '2026-10-09T10:00'], ['datetime-local', '2026-10-10T10:00']]) {
    const inputs = descendants(tree, 'input').filter((input) => !input.props.readOnly && (input.props.type || 'text') === type)
    const input = type === 'datetime-local' && value.includes('10-10') ? inputs[1] : inputs[0]
    input.props.onChange({ target: { value } }); tree = h.render()
  }
  descendants(tree, 'textarea')[0].props.onChange({ target: { value: 'User-facing text' } }); tree = h.render()
  descendants(tree, 'form')[0].props.onSubmit({ preventDefault() {} }); await flush(); tree = h.render()
  const Dialog = h.load('./RecordSaveDialog.tsx').default
  const dialog = descendants(tree, Dialog)[0]
  assert.equal(dialog.props.result.status, 'saved'); assert.equal(dialog.props.result.isNew, true)
  assert.equal(writes(h).length, 1); assert.equal(writes(h)[0].parameters.recordId, undefined)
  dialog.props.onChoose('remain'); tree = h.render()
  descendants(tree, 'form')[0].props.onSubmit({ preventDefault() {} }); await flush(); tree = h.render()
  assert.equal(writes(h).length, 2); assert.equal(writes(h)[1].parameters.recordId, id(1))
  assert.equal(descendants(tree, Dialog)[0].props.result.isNew, false)
  assert.equal(descendants(tree, 'textarea')[0].props.value, 'User-facing text'); h.unmount()
})

test('a failed Message update shows a failure popup and keeps its editable values', async () => {
  const h = hookRenderer(undefined, { handler: (call) => call.parameters.item ? { success: false, error: { message: 'Write denied' } } : { success: true, data: { value: [row()] } } })
  h.render(); await flush(); let tree = h.render()
  button(tree, 'Edit').props.onClick(); tree = h.render()
  descendants(tree, 'textarea')[0].props.onChange({ target: { value: 'Draft kept' } }); tree = h.render()
  descendants(tree, 'form')[0].props.onSubmit({ preventDefault() {} }); await flush(); tree = h.render()
  const Dialog = h.load('./RecordSaveDialog.tsx').default
  assert.equal(descendants(tree, Dialog)[0].props.result.status, 'failed')
  assert.match(descendants(tree, Dialog)[0].props.result.details, /Write denied/)
  assert.equal(descendants(tree, 'textarea')[0].props.value, 'Draft kept'); h.unmount()
})
test('Home refreshes updates in the background and on focus, with cleanup; message styling supports mobile and plain multiline text', () => {
  const source = readFileSync(new URL('./HomeMessages.tsx', import.meta.url), 'utf8')
  assert.match(source, /setInterval\([\s\S]*60000\)/); assert.match(source, /nextMessageBoundaryDelay\(messages, now\)/)
  assert.match(source, /window.addEventListener\('focus'/); assert.match(source, /visibilitychange/)
  assert.match(source, /controller.abort\(\)/); assert.match(source, /window.clearInterval/); assert.match(source, /window.clearTimeout/)
  const css = readFileSync(new URL('./Messages.css', import.meta.url), 'utf8')
  assert.match(css, /white-space: pre-wrap/); assert.match(css, /@media \(max-width: 640px\)/)
  const archive = readFileSync(new URL('./archive.ts', import.meta.url), 'utf8')
  assert.match(archive, /key: 'message', label: 'Home Messages', tableAlias: 'cmps_messageses'/)
  assert.match(archive, /await archiveMessage\(rowId, archived, savedBy\)/)
})

test('Archived Records searches message names/text and restores through the metadata-verified Messages writer', async () => {
  const h = harness({ records: [row(1, { cmps_isarchived: 125570000 }), row(2, { cmps_messagename: 'Different update', cmps_message: 'Another item', cmps_isarchived: 125570000 })] })
  const archive = h.load('./archive.ts')
  const results = await archive.searchArchivedRecords('message', 'second line')
  assert.equal(results.length, 1); assert.equal(results[0].id, id(1)); assert.equal(results[0].tableAlias, 'cmps_messageses')
  assert.equal(results[0].displayName, draft().cmps_messagename)
  const result = await archive.setRecordArchived('cmps_messageses', id(1), false, 'Restoring Admin')
  assert.equal(result.updated, 1)
  assert.equal(payload(writes(h).at(-1)).cmps_isarchived, 125570001)
  assert.equal(payload(writes(h).at(-1)).cmps_modifiedby, 'Restoring Admin')
})
