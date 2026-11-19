import assert from 'node:assert/strict'
import { readFileSync, existsSync } from 'node:fs'
import { createRequire } from 'node:module'
import { webcrypto } from 'node:crypto'
import vm from 'node:vm'
import test from 'node:test'
import React from 'react'
import { renderToStaticMarkup } from 'react-dom/server'
import ts from 'typescript'

const realRequire = createRequire(import.meta.url)
const schemaText = readFileSync(new URL('../../.power/schemas/appschemas/dataSourcesInfo.ts', import.meta.url), 'utf8')
const schema = JSON.parse(schemaText.slice(schemaText.indexOf('{'), schemaText.lastIndexOf('}') + 1))
const id = (n) => `11111111-1111-1111-1111-${n.toString(16).padStart(12, '0')}`
function harness({ local = false, respond = () => { throw Error('No real Dataverse access in tests') } } = {}) {
  const cache = new Map(), calls = []
  function load(file) {
    if (cache.has(file)) return cache.get(file)
    const module = { exports: {} }; cache.set(file, module.exports)
    const source = readFileSync(new URL(file, import.meta.url), 'utf8').replaceAll('import.meta.env', '({})')
    const js = ts.transpileModule(source, { compilerOptions: { module: ts.ModuleKind.CommonJS, target: ts.ScriptTarget.ES2022, jsx: ts.JsxEmit.ReactJSX } }).outputText
    vm.runInNewContext(js, { module, exports: module.exports, crypto: webcrypto, TextEncoder, URL, URLSearchParams, Headers, AbortController, setTimeout, clearTimeout,
      window: { location: { hostname: local ? 'localhost' : 'powerapps.example' } },
      fetch: async (url, init) => { const call = { url, init }; calls.push(call); return respond(call) },
      require(name) {
        if (name === '@microsoft/power-apps/data') return { getClient: () => ({ executeAsync: async ({ connectorOperation }) => {
          calls.push(connectorOperation)
          assert.ok(schema.commondataserviceforapps.apis[connectorOperation.operationName], 'use an existing connector operation')
          return respond(connectorOperation)
        } }) }
        if (name.includes('dataSourcesInfo')) return { dataSourcesInfo: structuredClone(schema) }
        if (name === '../../power.config.json') return JSON.parse(readFileSync(new URL('../../power.config.json', import.meta.url), 'utf8'))
        if (name === './auth') return { ensureAuthToken: async () => 'test', getAuthToken: () => 'test' }
        if (name === 'react' || name === 'react/jsx-runtime') return realRequire(name)
        if (name.startsWith('./')) return load(`${name}.${existsSync(new URL(`${name}.ts`, import.meta.url)) ? 'ts' : 'tsx'}`)
        throw Error(`Unexpected dependency ${name}`)
      },
    }, { filename: file })
    return module.exports
  }
  return { load, api: load('./compassFileCsvImport.ts'), calls }
}
const h = harness(), api = h.api
const header = 'cmps_filename,cmps_destinationtablename,cmps_migrationbatch,cmps_filesize,cmps_relatedrecordidlegacy'
const csv = (rows) => `${header}\r\n${rows.join('\r\n')}\r\n`
const signal = () => new AbortController().signal
function fixture() {
  const metadata = { LogicalName: 'cmps_compassfiles', EntitySetName: 'cmps_compassfileses', PrimaryIdAttribute: 'cmps_compassfilesid', ManyToOneRelationships: [],
    Attributes: ['cmps_recordid', 'cmps_createdby', 'cmps_modifiedby', ...Array.from(api.COMPASS_FILE_CSV_HEADERS)].map((LogicalName) => ({ LogicalName, AttributeType: LogicalName === 'cmps_filesize' ? 'Integer' : 'String', IsValidForCreate: true, IsValidForUpdate: true })) }
  const records = [], writes = [], pages = []
  const f = { metadata, records, writes, pages, onCreate: null, onFind: null, onPage: null }
  f.gateway = {
    async metadata() { return structuredClone(metadata) },
    async page(m, select, cursor, abort) {
      abort.throwIfAborted(); pages.push(cursor)
      assert.ok(!select.some((col) => /payload|content/i.test(col)))
      if (f.onPage) return f.onPage(m, select, cursor)
      const start = Number(cursor || 0), end = start + 1000
      return { rows: structuredClone(records.slice(start, end)), nextLink: end < records.length ? String(end) : '' }
    },
    async find(m, rowId, select, abort) {
      abort.throwIfAborted(); if (f.onFind) await f.onFind(m, rowId)
      return structuredClone(records.find((row) => row[m.PrimaryIdAttribute] === rowId) || null)
    },
    async create(m, payload, abort) {
      abort.throwIfAborted(); assert.ok(!records.some((row) => row[m.PrimaryIdAttribute] === payload[m.PrimaryIdAttribute]), 'create-only GUID, no upserts')
      assert.ok(!Object.keys(payload).some((key) => /payload|odata.bind|relatedrecordid$/.test(key)))
      if (f.onCreate) await f.onCreate(m, payload)
      writes.push(structuredClone(payload)); records.push(structuredClone(payload))
    },
  }
  f.preview = (content) => api.previewCompassFileCsv(content, f.gateway, signal())
  f.apply = (content, plan, abort = signal(), allowed = () => true, completed) => api.importCompassFileCsv(content, plan, f.gateway, abort, 'IT Admin', allowed, () => {}, completed)
  return f
}

test('five-column CSV accepts BOM, quotes, embedded commas, CRLF/newlines and preserves textual legacy IDs', () => {
  const rows = api.parseCompassFileCsv('\uFEFF' + csv(['"report, \"\"signed\"\".pdf",cmps_electronicdocuments,PILOT-IMPORT-2026-10-20,13181,0037205', '"line\nname.pdf",NULL,PILOT,0,0001']))
  assert.equal(rows[0].values.cmps_filename, 'report, "signed".pdf')
  assert.equal(rows[0].values.cmps_relatedrecordidlegacy, '0037205'); assert.equal(rows[0].values.cmps_filesize, 13181)
  assert.equal(rows[1].values.cmps_destinationtablename, ''); assert.equal(rows[1].state, 'ready'); assert.match(rows[1].message, /before translating/)
  assert.equal(rows[1].line, 3)
})

test('header validation, malformed quoting and row validation never guess missing/misplaced values', () => {
  for (const content of ['', 'name,bytes\na,1', header + ',extra\na,b,c,1,d,e', header.replace('cmps_filename', 'cmps_filesize') + '\na,b,c,1,d']) assert.throws(() => api.parseCompassFileCsv(content), /CSV headers/)
  assert.throws(() => api.parseCompassFileCsv(csv(['"unterminated,b,c,1,d'])), /unterminated/)
  assert.throws(() => api.parseCompassFileCsv(csv(['"a"x,b,c,1,d'])), /Unexpected text/)
  const rows = api.parseCompassFileCsv(csv(['a.pdf,bad_alias,B,1.5,001', 'b.pdf,NULL,B,-1,001', 'c.pdf,NULL,,1,001', 'd.pdf,NULL,B,9007199254740992,001', 'e.pdf,NULL,B,1,001,extra']))
  assert.ok(rows.every((r) => r.state === 'issue'))
})

test('reordered headers work and duplicate filenames are all flagged, including case differences', () => {
  const rows = api.parseCompassFileCsv('cmps_filesize,cmps_relatedrecordidlegacy,cmps_migrationbatch,cmps_filename,cmps_destinationtablename\n1,001,B,A.pdf,NULL\n2,002,B,a.PDF,NULL')
  assert.ok(rows.every((row) => row.state === 'issue')); assert.equal(rows[0].values.cmps_relatedrecordidlegacy, '001')
})

test('preview is read-only, continues FILE IDs, creates typed metadata only, stamps audit fields, rerun skips unchanged', async () => {
  const f = fixture(); f.records.push({ cmps_compassfilesid: id(9), cmps_recordid: 'FILE-049', cmps_filename: 'existing.pdf' })
  const content = csv(['new.pdf,NULL,PILOT,13181,0037205', 'next.pdf,CMPS_EVENTS,PILOT,0,42'])
  const plan = await f.preview(content); assert.equal(f.writes.length, 0)
  assert.deepEqual(Array.from(plan.rows, (row) => row.recordId), ['FILE-0410', 'FILE-0411'])
  const result = await f.apply(content, plan); assert.ok(result.every((row) => row.state === 'imported')); assert.equal(f.writes.length, 2)
  assert.equal(f.writes[0].cmps_destinationtablename, null); assert.equal(f.writes[0].cmps_relatedrecordidlegacy, '0037205')
  assert.equal(f.writes[0].cmps_filesize, 13181); assert.equal(f.writes[0].cmps_createdby, 'IT Admin'); assert.equal(f.writes[0].cmps_modifiedby, 'IT Admin')
  assert.ok(!('createdon' in f.writes[0])); assert.equal(f.writes[1].cmps_destinationtablename, 'cmps_events')
  assert.ok((await f.preview(content)).rows.every((row) => row.state === 'existing'))
})

test('conflicting filenames and changed migration batch are issues, never overwrites; one invalid row does not block a reviewed valid row', async () => {
  const f = fixture(), content = csv(['a.pdf,NULL,B,1,001', 'bad.pdf,unknown,B,1,002'])
  await f.apply(content, await f.preview(content)); assert.equal(f.writes.length, 1)
  const changed = await f.preview(csv(['a.pdf,NULL,DIFFERENT_BATCH,1,001', 'bad.pdf,unknown,B,1,002']))
  assert.ok(changed.rows.every((row) => row.state === 'issue')); assert.equal(f.writes.length, 1)
})

test('reads every existing metadata page, including archives, and stops on repeated pages', async () => {
  const f = fixture()
  for (let n = 0; n < 2105; n++) f.records.push({ cmps_compassfilesid: id(n + 1), cmps_recordid: `FILE-04${n + 1}`, cmps_filename: `file${n}.pdf`, cmps_isarchived: 125570000 })
  const content = csv(['new.pdf,NULL,B,1,001']), plan = await f.preview(content)
  assert.equal(f.pages.length, 3); assert.equal(plan.rows[0].recordId, 'FILE-042106'); assert.equal(f.writes.length, 0)
  f.onPage = () => ({ rows: [f.records[0]], nextLink: 'repeat' })
  await assert.rejects(f.preview(content), /repeated/); assert.equal(f.writes.length, 0)
})

test('metadata/column types and creation permissions are verified before imports', async () => {
  const f = fixture(), content = csv(['a.pdf,NULL,B,1,001'])
  f.metadata.Attributes.find((col) => col.LogicalName === 'cmps_migrationbatch').IsValidForCreate = false
  await assert.rejects(f.preview(content), /cmps_migrationbatch/); assert.equal(f.writes.length, 0)
  f.metadata.Attributes.find((col) => col.LogicalName === 'cmps_migrationbatch').IsValidForCreate = true
  assert.equal((await f.preview(csv(['huge.pdf,NULL,B,2147483648,001']))).rows[0].state, 'issue')
})

test('apply detects CSV or existing FILE ID changes since preview before creating anything', async () => {
  const f = fixture(), content = csv(['a.pdf,NULL,B,1,001']), plan = await f.preview(content)
  await assert.rejects(f.apply(csv(['different.pdf,NULL,B,1,001']), plan), /changed/)
  f.records.push({ cmps_compassfilesid: id(9), cmps_recordid: 'FILE-0490', cmps_filename: 'other.pdf' })
  await assert.rejects(f.apply(content, plan), /changed/); assert.equal(f.writes.length, 0)
})

test('lost create response is confirmed with its stable GUID without duplicate POST retries', async () => {
  const f = fixture(), content = csv(['a.pdf,NULL,B,1,001'])
  f.onCreate = (m, payload) => { f.records.push(structuredClone(payload)); throw Error('Network response lost') }
  const plan = await f.preview(content), results = await f.apply(content, plan)
  assert.equal(results[0].state, 'imported'); assert.equal(f.records.length, 1); assert.equal((await f.preview(content)).rows[0].state, 'existing')
  const other = fixture(); assert.equal((await other.preview(content)).rows[0].id, plan.rows[0].id)
})

test('unconfirmed creates stop safely; cancellation and revoked access prevent further creates', async () => {
  const f = fixture(), content = csv(['a.pdf,NULL,B,1,001', 'b.pdf,NULL,B,1,002']), plan = await f.preview(content), report = []
  f.onCreate = () => { throw Error('429 throttled') }
  await assert.rejects(f.apply(content, plan, signal(), () => true, (row) => report.push(row)), /Import stopped/)
  assert.equal(report[0].state, 'unconfirmed'); assert.equal(f.writes.length, 0)
  await assert.rejects(f.apply(content, plan, signal(), () => false), /IT Admin/)
  f.onCreate = null; const abort = new AbortController(); f.onCreate = () => abort.abort()
  await assert.rejects(f.apply(content, plan, abort.signal), /abort|stopped/i); assert.equal(f.writes.length, 1)
  f.onCreate = null; await f.apply(content, await f.preview(content)); assert.equal(f.records.length, 2)
})

test('large imports use at most four concurrent creates and wait for in-flight work before releasing the import lock', async () => {
  const f = fixture(), content = csv(Array.from({ length: 24 }, (_, n) => `file${n}.pdf,NULL,B,1,00${n}`))
  let active = 0, peak = 0
  f.onCreate = async () => { peak = Math.max(peak, ++active); await new Promise((resolve) => setTimeout(resolve, 2)); active-- }
  const plan = await f.preview(content)
  const run = f.apply(content, plan)
  await assert.rejects(f.apply(content, plan), /already running/)
  await run; assert.equal(active, 0); assert.equal(peak, 4); assert.equal(f.writes.length, 24)
  assert.equal(new Set(f.writes.map((row) => row.cmps_recordid)).size, 24)
  assert.equal(new Set(f.writes.map((row) => row.cmps_compassfilesid)).size, 24)
})

for (const local of [true, false]) test(`${local ? 'local' : 'runtime'} gateway uses authenticated create-only POST and narrow GUID confirmation; no payload upload or updates`, async () => {
  const payload = { cmps_compassfilesid: id(1), cmps_filename: 'a.pdf' }
  let found = []
  const g = harness({ local, respond(call) {
    if (local) {
      assert.equal(call.init.headers.Authorization, 'Bearer test')
      if (call.init.method === 'POST') { assert.equal(JSON.parse(call.init.body).cmps_filename, 'a.pdf'); return { ok: true } }
      const url = new URL(call.url); assert.equal(url.searchParams.get('$filter'), `cmps_compassfilesid eq ${id(1)}`)
      return { ok: true, json: async () => ({ value: found }) }
    }
    if (call.operationName === 'CreateRecordWithOrganization') { assert.equal(call.parameters.item.cmps_compassfilesid, id(1)); return { success: true } }
    assert.equal(call.operationName, 'ListRecordsWithOrganization'); assert.equal(call.parameters.$filter, `cmps_compassfilesid eq ${id(1)}`)
    return { success: true, data: { value: found } }
  } })
  const gateway = g.api.createCompassFileCsvGateway(), metadata = fixture().metadata
  await gateway.create(metadata, payload, signal()); assert.equal(await gateway.find(metadata, id(1), ['cmps_filename'], signal()), null)
  found = [payload]; assert.equal((await gateway.find(metadata, id(1), ['cmps_filename'], signal())).cmps_filename, 'a.pdf')
  found = [{ cmps_compassfilesid: id(2) }]; await assert.rejects(gateway.find(metadata, id(1), ['cmps_filename'], signal()), /unique/)
})

test('UI renders metadata-only warning/template, prevents unreviewed imports and hides from non-admins; reports escape formulas', () => {
  const Panel = h.load('./CompassFileCsvImportPanel.tsx').default
  const props = { canManage: true, savedBy: 'IT Admin', onBusyChange() {}, onDataChange() {} }
  const html = renderToStaticMarkup(React.createElement(Panel, props))
  for (const label of ['Download CSV Template', 'Preview CSV Import', 'Import Ready Metadata Rows', 'metadata records only', ...Array.from(api.COMPASS_FILE_CSV_HEADERS)]) assert.ok(html.includes(label))
  assert.match(html, /<button[^>]*disabled=""[^>]*>Import Ready Metadata Rows/)
  assert.equal(renderToStaticMarkup(React.createElement(Panel, { ...props, canManage: false })), '')
  const rows = api.parseCompassFileCsv(csv(['=danger.pdf,NULL,B,1,001']))
  assert.ok(api.compassFileCsvResults(rows).includes('"\'=danger.pdf"'))
})
