import assert from 'node:assert/strict'
import { readFileSync, readdirSync, existsSync } from 'node:fs'
import test from 'node:test'
import vm from 'node:vm'
import { createRequire } from 'node:module'
import React from 'react'
import { renderToStaticMarkup } from 'react-dom/server'
import ts from 'typescript'

const id = (n) => `11111111-1111-1111-1111-${n.toString(16).padStart(12, '0')}`
const signal = () => new AbortController().signal
const options = { destination: 'all', eventSlot: 'empty-in-order' }
const realRequire = createRequire(import.meta.url)
function loadModules() {
  const cache = new Map()
  function load(file) {
    if (cache.has(file)) return cache.get(file)
    const module = { exports: {} }; cache.set(file, module.exports)
    const source = readFileSync(new URL(file, import.meta.url), 'utf8').replaceAll('import.meta.env', '({})')
    const js = ts.transpileModule(source, { compilerOptions: { module: ts.ModuleKind.CommonJS, target: ts.ScriptTarget.ES2022, jsx: ts.JsxEmit.ReactJSX } }).outputText
    vm.runInNewContext(js, { module, exports: module.exports, URL, URLSearchParams, Headers, AbortController, setTimeout, clearTimeout,
      require(name) {
        if (name === '@microsoft/power-apps/data') return { getClient: () => ({ executeAsync() { throw Error('No real Dataverse calls in tests') } }) }
        if (name.includes('dataSourcesInfo')) return { dataSourcesInfo: {} }
        if (name === '../../power.config.json') return JSON.parse(readFileSync(new URL('../../power.config.json', import.meta.url), 'utf8'))
        if (name === './auth') return { ensureAuthToken: async () => 'test', getAuthToken: () => 'test' }
        if (name === 'react' || name === 'react/jsx-runtime') return realRequire(name)
        if (name.startsWith('./')) return load(`${name}.${existsSync(new URL(`${name}.ts`, import.meta.url)) ? 'ts' : 'tsx'}`)
        throw Error(`Unexpected dependency ${name}`)
      },
    }, { filename: file })
    return module.exports
  }
  return load
}
const load = loadModules(), api = load('./legacyFileTranslation.ts')
function fixture() {
  const metadata = new Map(), rows = new Map(), writes = [], selects = []
  const source = { LogicalName: 'cmps_compassfiles', EntitySetName: 'cmps_compassfileses', PrimaryIdAttribute: 'cmps_compassfilesid',
    Attributes: ['cmps_recordid', 'cmps_relatedrecordidlegacy', 'cmps_destinationtablename', 'cmps_relatedrecordid', 'cmps_modifiedby'].map((LogicalName) => ({ LogicalName, AttributeType: 'String', IsValidForUpdate: true })), ManyToOneRelationships: [] }
  metadata.set(source.EntitySetName, source); rows.set(source.EntitySetName, [])
  for (const { definition, uploads } of api.FILE_TRANSLATION_TABLES) {
    const m = { LogicalName: definition.tableAlias.slice(0, -1), EntitySetName: definition.tableAlias, PrimaryIdAttribute: definition.primaryIdField,
      Attributes: [definition.legacyIdField, 'cmps_recordid', 'cmps_modifiedby'].map((LogicalName) => ({ LogicalName, AttributeType: 'String', IsValidForUpdate: true })),
      ManyToOneRelationships: uploads.map((ReferencingAttribute) => ({ ReferencingAttribute, ReferencingEntityNavigationPropertyName: `${ReferencingAttribute}_VerifiedNav`, ReferencedEntity: source.LogicalName })) }
    m.Attributes.push(...uploads.map((LogicalName) => ({ LogicalName, AttributeType: 'Lookup', IsValidForUpdate: true })))
    metadata.set(m.EntitySetName, m); rows.set(m.EntitySetName, [])
  }
  let seq = 1
  const f = { metadata, rows, source, writes, selects, pageSize: 1000, onRecord: null, onUpdate: null, onPage: null }
  f.target = (key, legacy = '001', attrs = {}) => {
    const d = api.FILE_TRANSLATION_TABLES.find((entry) => entry.definition.key === key).definition
    const row = { [d.primaryIdField]: id(seq++), [d.legacyIdField]: legacy, cmps_recordid: `${d.recordIdPrefix}-046`, '@odata.etag': 'W/"1"', ...attrs }
    rows.get(d.tableAlias).push(row); return row
  }
  f.file = (destination, legacy = '001', attrs = {}) => {
    const row = { cmps_compassfilesid: id(seq++), cmps_recordid: `FILE-${seq}`, cmps_destinationtablename: destination, cmps_relatedrecordidlegacy: legacy, cmps_relatedrecordid: '', '@odata.etag': 'W/"1"', ...attrs }
    rows.get(source.EntitySetName).push(row); return row
  }
  f.gateway = {
    async metadata(d) { return structuredClone(metadata.get(d.tableAlias)) },
    async page(m, select, cursor, abort) {
      abort.throwIfAborted(); assert.ok(!select.some((col) => /payload|content/i.test(col)), 'never download files')
      selects.push({ table: m.EntitySetName, select, cursor })
      if (f.onPage) return f.onPage(m, select, cursor)
      const start = Number(cursor || 0), all = rows.get(m.EntitySetName), end = start + f.pageSize
      return { rows: structuredClone(all.slice(start, end)), nextLink: end < all.length ? String(end) : '' }
    },
    async record(m, rowId, select, abort) {
      abort.throwIfAborted(); if (f.onRecord) await f.onRecord(m, rowId)
      return structuredClone(rows.get(m.EntitySetName).find((row) => row[m.PrimaryIdAttribute] === rowId))
    },
    async update(m, rowId, payload, etag, abort) {
      abort.throwIfAborted(); if (f.onUpdate) await f.onUpdate(m, rowId, payload)
      const row = rows.get(m.EntitySetName).find((r) => r[m.PrimaryIdAttribute] === rowId)
      assert.equal(etag, row['@odata.etag'], 'conditional update must use fresh ETag')
      assert.ok(!Object.keys(payload).some((key) => /payload|legacy|createdby|recordid$/i.test(key) && key !== 'cmps_relatedrecordid'))
      writes.push({ table: m.EntitySetName, id: rowId, payload })
      for (const [key, value] of Object.entries(payload)) {
        if (key.endsWith('@odata.bind')) {
          const rel = m.ManyToOneRelationships.find((r) => `${r.ReferencingEntityNavigationPropertyName}@odata.bind` === key)
          assert.ok(rel, 'must use verified navigation property, not guess lookup name')
          row[`_${rel.ReferencingAttribute}_value`] = value.match(/\(([^)]+)\)/)[1]
        } else row[key] = value
      }
      row['@odata.etag'] = `W/"${Number(row['@odata.etag'].match(/\d+/)[0]) + 1}"`
    },
  }
  f.preview = (opts = options) => api.previewFileTranslation(opts, f.gateway, signal())
  f.apply = (plan, abort = signal(), authorized = () => true) => api.applyFileTranslation(plan, f.gateway, abort, 'IT Admin', authorized)
  return f
}

test('registry covers every developed file input and retains working aliases and legacy columns', () => {
  const actual = []
  for (const filename of readdirSync(new URL('.', import.meta.url)).filter((file) => file.endsWith('.ts'))) {
    const source = readFileSync(new URL(filename, import.meta.url), 'utf8')
    if (/input:\s*'file'/.test(source)) actual.push(filename)
  }
  assert.deepEqual(actual.sort(), ['childSafetyPlan.ts', 'electronicDocument.ts', 'event.ts', 'personYouAreFleeingProfile.ts'])
  assert.equal(api.FILE_TRANSLATION_TABLES.length, 4)
  assert.deepEqual(Array.from(api.FILE_TRANSLATION_TABLES.find((e) => e.definition.key === 'event').uploads), ['cmps_fileid1', 'cmps_fileid2'])
})

test('preview is read-only; all four forms link by exact legacy text, verified navigation, and app ID; rerun is unchanged', async () => {
  const f = fixture()
  for (const { definition } of api.FILE_TRANSLATION_TABLES) { f.target(definition.key); f.file(definition.tableAlias, ' 001 ') }
  const plan = await f.preview(); assert.equal(plan.rows.filter((r) => r.state === 'ready').length, 4); assert.equal(f.writes.length, 0)
  const result = await f.apply(plan); assert.ok(result.every((r) => r.state === 'updated')); assert.equal(f.writes.length, 8)
  assert.ok(f.writes.every((write) => write.payload.cmps_modifiedby === 'IT Admin'))
  assert.ok((await f.preview()).rows.every((r) => r.state === 'unchanged'))
})

test('Event fills File 1 then File 2, flags overflow, and refreshes ETag between same-owner writes', async () => {
  const f = fixture(), target = f.target('event')
  const files = [f.file('Event'), f.file('cmps_events'), f.file('cmps_event')]
  const plan = await f.preview(); assert.deepEqual(Array.from(plan.rows, (r) => r.state), ['ready', 'ready', 'issue'])
  assert.deepEqual(Array.from(plan.rows, (r) => r.slot), ['cmps_fileid1', 'cmps_fileid2', ''])
  await f.apply(plan)
  assert.equal(target._cmps_fileid1_value, files[0].cmps_compassfilesid); assert.equal(target._cmps_fileid2_value, files[1].cmps_compassfilesid)
  assert.equal((await f.preview()).rows[2].state, 'issue')
})

test('Event preserves occupied File 1, uses File 2, never replaces either on rerun', async () => {
  const f = fixture(), target = f.target('event', '001', { _cmps_fileid1_value: id(900) })
  const file = f.file('event'); const extra = f.file('event')
  const plan = await f.preview(); assert.equal(plan.rows[0].slot, 'cmps_fileid2'); assert.equal(plan.rows[1].state, 'issue')
  await f.apply(plan); assert.equal(target._cmps_fileid1_value, id(900)); assert.equal(target._cmps_fileid2_value, file.cmps_compassfilesid)
  assert.equal(extra.cmps_relatedrecordid, '')
})

test('single-slot competing files are all issues; duplicate target legacy IDs, unmatched IDs, unknown tables and leading zeros are not guessed', async () => {
  const f = fixture(); f.target('electronic-document'); f.file('Electronic Document'); f.file('Electronic Document')
  f.target('child-safety-plan'); f.target('child-safety-plan'); f.file('Child Safety Plan')
  f.target('person-fleeing-profile'); f.file('Person You Are Fleeing Profile', '1')
  f.file('no-such-table'); f.file('event', 'missing'); f.file('', '')
  const plan = await f.preview(); assert.deepEqual(Array.from(plan.rows, (r) => r.state), ['issue', 'issue', 'issue', 'issue', 'issue', 'issue', 'skipped'])
  await f.apply(plan); assert.equal(f.writes.length, 0)
})

test('existing different file backlink or attachment to another form is preserved, even outside selected scope', async () => {
  const f = fixture(); f.target('event'); f.file('event', '001', { cmps_relatedrecordid: 'EV-999' })
  const imported = f.file('event'); f.target('electronic-document', '999', { _cmps_fileid1_value: imported.cmps_compassfilesid })
  const plan = await f.preview({ ...options, destination: 'event' }); assert.ok(plan.rows.every((r) => r.state === 'issue'))
  assert.match(plan.rows[1].message, /different record/); assert.equal(f.writes.length, 0)
})

test('all continuation pages are indexed for both files and targets; repeated pages stop before writes', async () => {
  const f = fixture()
  for (let i = 0; i < 2105; i++) { f.target('electronic-document', String(i)); f.file('Electronic Document', String(i)) }
  const plan = await f.preview(); assert.equal(plan.rows.length, 2105); assert.ok(plan.rows.every((r) => r.state === 'ready'))
  assert.equal(f.selects.filter((r) => r.table === f.source.EntitySetName).length, 3)
  assert.equal(f.writes.length, 0)
  f.onPage = (m) => ({ rows: structuredClone(f.rows.get(m.EntitySetName).slice(0, 1)), nextLink: 'repeat' })
  await assert.rejects(f.preview(), /repeated/i); assert.equal(f.writes.length, 0)
})

test('missing ETag, untranslated owner IDs, and incorrect metadata are refused', async () => {
  const f = fixture(); f.target('event', '001', { '@odata.etag': '' }); f.file('event')
  f.target('electronic-document', '002', { cmps_recordid: '002' }); f.file('Electronic Document', '002')
  assert.ok((await f.preview()).rows.every((r) => r.state === 'issue'))
  f.source.Attributes.find((a) => a.LogicalName === 'cmps_relatedrecordid').IsValidForUpdate = false
  await assert.rejects(f.preview(), /writable text/); assert.equal(f.writes.length, 0)
})

test('apply re-previews globally and refuses changed plan before any writes', async () => {
  const f = fixture(); const target = f.target('event'); f.file('Event'); const plan = await f.preview()
  target._cmps_fileid1_value = id(990)
  await assert.rejects(f.apply(plan), /changed since preview/); assert.equal(f.writes.length, 0)
})

test('fresh per-pair recheck prevents overwriting an attachment changed after preflight', async () => {
  const f = fixture(); const target = f.target('event'); f.file('Event'); const plan = await f.preview()
  f.onRecord = (m) => { if (m.EntitySetName === 'cmps_events') target._cmps_fileid1_value = id(990) }
  const result = await f.apply(plan); assert.equal(result[0].state, 'failed'); assert.equal(f.writes.length, 0)
})

test('partial owner-first writes are reported and safe rerun repairs backlink without reattaching', async () => {
  const f = fixture(); const target = f.target('event'), file = f.file('Event')
  f.onUpdate = (m) => { if (m.EntitySetName === f.source.EntitySetName) throw Error('412 concurrent file change') }
  const result = await f.apply(await f.preview()); assert.equal(result[0].state, 'partial'); assert.equal(target._cmps_fileid1_value, file.cmps_compassfilesid)
  assert.equal(file.cmps_relatedrecordid, ''); f.onUpdate = null
  const again = await f.preview(); assert.equal(again.rows[0].state, 'ready'); assert.match(again.rows[0].message, /Repair/)
  await f.apply(again); assert.equal(f.writes.length, 2); assert.equal(file.cmps_relatedrecordid, target.cmps_recordid)
})

test('authorization is checked before writes and between owner and file updates', async () => {
  const f = fixture(); f.target('event'); f.file('Event'); const plan = await f.preview()
  await assert.rejects(f.apply(plan, signal(), () => false), /IT Admin/); assert.equal(f.writes.length, 0)
  let authorized = true; f.onUpdate = () => { authorized = false }
  const result = await f.apply(plan, signal(), () => authorized)
  assert.equal(result[0].state, 'partial'); assert.equal(f.writes.length, 1)
})

test('cancellation waits for in-flight requests, prevents subsequent writes, then permits a safe rerun', async () => {
  const f = fixture(); f.target('event'); f.file('event'); const abort = new AbortController()
  f.onUpdate = async () => { await new Promise((resolve) => setTimeout(resolve, 10)); abort.abort() }
  await assert.rejects(f.apply(await f.preview(), abort.signal), /abort/i)
  assert.equal(f.writes.length, 1); f.onUpdate = null
  await f.apply(await f.preview()); assert.equal(f.writes.length, 2)
})

test('writes are bounded to four concurrent owners and missing/incorrect relationships stop preflight', async () => {
  const f = fixture(); let active = 0, peak = 0
  for (let i = 0; i < 20; i++) { f.target('electronic-document', String(i)); f.file('Electronic Document', String(i)) }
  f.onUpdate = async () => { peak = Math.max(peak, ++active); await new Promise((resolve) => setTimeout(resolve, 1)); active-- }
  await f.apply(await f.preview()); assert.equal(f.writes.length, 40); assert.equal(peak, 4)
  const destination = f.metadata.get('cmps_events')
  destination.ManyToOneRelationships[0].ReferencedEntity = 'wrong_file_table'
  await assert.rejects(f.preview(), /unique writable lookup/)
  assert.equal(f.writes.length, 40)
})

test('admin panel renders the accepted mappings, Event default and read-only preview controls without fetching data', () => {
  const Panel = load('./LegacyFileTranslationPanel.tsx').default
  const html = renderToStaticMarkup(React.createElement(Panel, { canManage: true, savedBy: 'IT Admin' }))
  for (const term of ['cmps_compassfileses', 'cmps_relatedrecordidlegacy', 'cmps_destinationtablename', 'Preview File Translation', 'Fill empty File 1, then File 2; flag overflow']) assert.ok(html.includes(term))
  assert.match(html, /<button[^>]*disabled=""[^>]*>Link Imported Files/)
  const denied = renderToStaticMarkup(React.createElement(Panel, { canManage: false, savedBy: 'Staff' }))
  assert.ok(denied.includes('IT Admin-only')); assert.ok(!denied.includes('<button'))
})

test('CSV escapes quotes, newlines and formula-like legacy values; UI is IT Admin gated and requires review', () => {
  const csv = api.fileTranslationCsv([{ fileId: id(1), legacyId: '=IMPORTDATA("x")', message: 'line1\nline2' }])
  assert.ok(csv.includes('"\'=IMPORTDATA(""x"")"')); assert.ok(csv.includes('"line1\nline2"'))
  const panel = readFileSync(new URL('./LegacyFileTranslationPanel.tsx', import.meta.url), 'utf8')
  assert.match(panel, /if \(!canManage\) return/); assert.match(panel, /disabled=\{busy \|\| importBusy \|\| !reviewed \|\| !plan \|\| !counts.ready\}/)
  const app = readFileSync(new URL('../App.tsx', import.meta.url), 'utf8')
  assert.match(app, /canAccessRoleAdmin && adminPage === 'file-translation' && !isUserPreview \? <LegacyFileTranslationPanel/)
})
