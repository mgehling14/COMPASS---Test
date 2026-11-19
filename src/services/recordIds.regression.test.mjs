import assert from 'node:assert/strict'
import { readFileSync } from 'node:fs'
import test from 'node:test'
import vm from 'node:vm'
import ts from 'typescript'

const org = 'https://org1f466e4e.crm.dynamics.com'
const aliases = [...readFileSync(new URL('./archive.ts', import.meta.url), 'utf8').matchAll(/tableAlias: '([^']+)'/g)].map((match) => match[1])
const schemaText = readFileSync(new URL('../../.power/schemas/appschemas/dataSourcesInfo.ts', import.meta.url), 'utf8')
const schema = JSON.parse(schemaText.slice(schemaText.indexOf('{'), schemaText.lastIndexOf('}') + 1))
function compile(file, dependencies = {}, globals = {}) {
  const module = { exports: {} }
  const source = readFileSync(new URL(file, import.meta.url), 'utf8').replaceAll('import.meta.env', '({})')
  vm.runInNewContext(ts.transpileModule(source, { compilerOptions: { module: ts.ModuleKind.CommonJS, target: ts.ScriptTarget.ES2022 } }).outputText, {
    module, exports: module.exports, URL, ...globals,
    require(name) { assert.ok(name in dependencies, `Unexpected dependency: ${name}`); return dependencies[name] },
  })
  return module.exports
}
const sequences = compile('./recordIdSequence.ts')

// Model documented Dataverse wildcards independently from the generator. The
// simulated server filters/sorts its full table, but returns only the top row.
function wildcardRegex(pattern) {
  let regex = ''
  for (let index = 0; index < pattern.length; index++) {
    const char = pattern[index]
    if (char === '[') {
      const end = pattern.indexOf(']', index)
      assert.ok(end > index)
      regex += pattern.slice(index, end + 1); index = end
    } else regex += char === '%' ? '.*' : char === '_' ? '.' : char.replace(/[.*+?^${}()|\\]/g, '\\$&')
  }
  return new RegExp(`^${regex}$`, 'i')
}
function resultFor(query, rows) {
  assert.equal(query.$select, 'cmps_recordid')
  assert.equal(query.$orderby, 'cmps_recordid desc')
  assert.equal(Number(query.$top), 1)
  assert.equal(query.$skiptoken, undefined)
  const [, start, bad] = query.$filter.match(/^startswith\(cmps_recordid,'([^']+)'\) and not contains\(cmps_recordid,'([^']+)'\)$/) || []
  assert.ok(start && bad, 'Every lookup must restrict the prefix and numeric suffix on the server')
  const matches = rows.filter((row) => wildcardRegex(start + '%').test(row.cmps_recordid || '') && !wildcardRegex('%' + bad + '%').test(row.cmps_recordid || ''))
  matches.sort((a, b) => b.cmps_recordid.toUpperCase().localeCompare(a.cmps_recordid.toUpperCase()))
  return { value: matches.slice(0, 1).map((row) => ({ cmps_recordid: row.cmps_recordid })) }
}
function harness(rows = [], { fallback = false, token = 'token', respond } = {}) {
  const calls = []
  const handler = async (call) => {
    calls.push(call)
    if (fallback && !call.url) throw new Error('Connector unavailable')
    const query = call.url ? Object.fromEntries(new URL(call.url).searchParams) : call.parameters
    return respond ? respond(call, query, calls.length) : resultFor(query, rows)
  }
  const api = compile('./recordIds.ts', {
    '@microsoft/power-apps/data': { getClient: () => ({ executeAsync: async ({ connectorOperation }) => {
      assert.equal(connectorOperation.operationName, 'ListRecordsWithOrganization')
      const supported = schema.commondataserviceforapps.apis[connectorOperation.operationName].parameters.map((entry) => entry.name)
      for (const name of Object.keys(connectorOperation.parameters)) assert.ok(supported.includes(name) || name === 'token', `Unsupported SDK parameter ${name}`)
      return { success: true, data: await handler(connectorOperation) }
    } }) },
    '../../.power/schemas/appschemas/dataSourcesInfo': { dataSourcesInfo: schema },
    './auth': { getAuthToken: () => token, ensureAuthToken: async () => token },
    './recordIdSequence': sequences,
    './archive': { ARCHIVE_TABLES: aliases.map((tableAlias) => ({ tableAlias, primaryIdField: 'verified_id' })) },
  }, { fetch: async (url, init) => ({ ok: true, json: async () => handler({ url, init }) }) })
  return { ...api, rows, calls }
}

for (const fallback of [false, true]) test(`${fallback ? 'Web API fallback' : 'connector'}: 100,000 rows require only bounded highest-ID lookups, not table paging`, async () => {
  const rows = Array.from({ length: 100000 }, (_, index) => ({ cmps_recordid: `SV-04${index + 1}` }))
  rows.push(...['999999999', 'SV-20261030123456', 'SV-0499999abc', 'SV-0401', 'SV-0499999-1', 'SV-05999999'].map((cmps_recordid) => ({ cmps_recordid })))
  const h = harness(rows, { fallback })
  assert.equal(await h.generateSequentialRecordId('cmps_serviceses', 'SV'), 'SV-04100001')
  const queries = h.calls.filter((call) => fallback ? call.url : !call.url)
  assert.equal(queries.length, 3, 'numeric 99999 then 100000, then confirm no longer suffix exists')
  if (fallback) for (const call of queries) {
    const url = new URL(call.url)
    assert.equal(url.origin, org)
    assert.equal(url.pathname, '/api/data/v9.2/cmps_serviceses')
    assert.equal(call.init.headers.Authorization, 'Bearer token')
  }
})

test('numeric maximum handles digit rollovers, gaps, archived IDs and case-insensitive prefixes', async () => {
  for (const [ids, expected] of [
    [[], 'CP-041'],
    [['12345', 'CP-20260923164213', 'CP-0401', 'CP-041-other'], 'CP-041'],
    [['CP-049', 'CP-0410'], 'CP-0411'],
    [['CP-0499', 'CP-04100', 'CP-047'], 'CP-04101'],
    [['CP-04999', 'CP-041000', 'cp-041004'], 'CP-041005'],
  ]) {
    const h = harness(ids.map((cmps_recordid) => ({ cmps_recordid, cmps_isarchived: 125570000 })))
    assert.equal(await h.generateSequentialRecordId('cmps_clientprofiles', 'CP'), expected)
  }
})

test('every registered form prefix uses the shared lookup without archive, program or record-count filtering', async () => {
  for (const [kind, prefix] of Object.entries(sequences.APP_RECORD_ID_PREFIXES)) {
    const alias = kind === 'services' ? 'cmps_serviceses' : 'cmps_clientprofiles'
    const h = harness([{ cmps_recordid: `${prefix}-04123` }])
    assert.equal(await h.generateSequentialRecordId(alias, prefix, 'REACH Center'), `${prefix}-04124`)
    for (const call of h.calls) assert.doesNotMatch(call.parameters.$filter, /isarchived|statecode|program|createdon/)
  }
})

test('same-session concurrent and unsaved drafts reserve separate numbers, while every allocation rechecks server changes', async () => {
  const h = harness([{ cmps_recordid: 'SV-049' }])
  assert.deepEqual(await Promise.all(Array.from({ length: 8 }, () => h.generateSequentialRecordId('cmps_serviceses', 'SV'))), Array.from({ length: 8 }, (_, index) => `SV-04${index + 10}`))
  h.rows.push({ cmps_recordid: 'SV-0410000' })
  assert.equal(await h.generateSequentialRecordId('cmps_serviceses', 'SV'), 'SV-0410001')
  h.rows.length = 0
  assert.equal(await h.generateSequentialRecordId('cmps_serviceses', 'SV'), 'SV-0410002', 'Do not reuse IDs belonging to unsaved drafts')
  assert.equal(await h.generateSequentialRecordId('cmps_serviceses', 'SV', '05'), 'SV-051')
  assert.equal(await h.generateSequentialRecordId('cmps_clientprofiles', 'SV'), 'SV-041')
})

test('failed, malformed, oversized or unbounded responses stop allocation; later retries are not locked out', async () => {
  for (const payload of [undefined, {}, { value: [{ nope: 'SV-041' }] }, { value: [{ cmps_recordid: 'SV-04oops' }] }, { value: [{ cmps_recordid: 'SV-041' }, { cmps_recordid: 'SV-042' }] }, { value: [], '@odata.nextLink': 'https://evil.example/' }, { value: [{ cmps_recordid: 'SV-049007199254740992' }] }]) {
    let fail = true
    const h = harness([], { respond: (_call, query) => fail ? payload : resultFor(query, []) })
    await assert.rejects(h.generateSequentialRecordId('cmps_serviceses', 'SV'))
    fail = false
    assert.equal(await h.generateSequentialRecordId('cmps_serviceses', 'SV'), 'SV-041')
  }
  const h = harness([], { fallback: true, token: '' })
  await assert.rejects(h.generateSequentialRecordId('cmps_serviceses', 'SV'), /sign in and retry/)
  assert.equal(h.calls.length, 1)
})

test('exhausted sequences and ignored filters cannot loop or silently allocate a timestamp fallback', async () => {
  const h = harness([{ cmps_recordid: `CP-04${Number.MAX_SAFE_INTEGER}` }])
  await assert.rejects(h.generateSequentialRecordId('cmps_clientprofiles', 'CP'), /exhausted/)
  const ignored = harness([], { respond: () => ({ value: [{ cmps_recordid: 'CP-041' }] }) })
  await assert.rejects(ignored.generateSequentialRecordId('cmps_clientprofiles', 'CP'), /unexpected record ID/)
  assert.equal(ignored.calls.length, 2)
})

test('invalid aliases and formats fail before any request', async () => {
  const h = harness()
  for (const [alias, prefix] of [['missing_table', 'CP'], ['cmps_serviceses', "SV'"], ['cmps_serviceses', 'SV_%']]) {
    await assert.rejects(h.generateSequentialRecordId(alias, prefix))
  }
  assert.equal(h.calls.length, 0)
})

test('all form saves stop before writes when a generated record ID is still pending', async () => {
  const source = readFileSync(new URL('../App.tsx', import.meta.url), 'utf8')
  const tree = ts.createSourceFile('App.tsx', source, ts.ScriptTarget.Latest, true, ts.ScriptKind.TSX)
  let declaration
  function visit(node) { if (ts.isFunctionDeclaration(node) && node.name?.text === 'saveActiveForm') declaration = node; ts.forEachChild(node, visit) }
  visit(tree); assert.ok(declaration)
  for (const kind of Object.keys(sequences.APP_RECORD_ID_PREFIXES)) {
    let error = '', result, saving
    const context = {
      isUserPreview: false, activeFormSession: { kind, formName: kind, values: { cmps_recordid: 'must-not-be-used' }, rowId: '', recordId: '' },
      formSaveInFlight: { current: false }, user: { name: 'Tester' },
      withRecordAudit: (values) => ({ ...values }), savedFormClientTarget: () => ({}), programEnrollmentsForClient: [],
      canCreateForm: () => true, pendingFormSaveConfirmation: { current: null },
      setActiveFormError: (value) => { error = value }, setActiveFormSaving: (value) => { saving = value }, setHubActionStatus() {},
      setRecordSaveResult: (value) => { result = value },
      FunderBalanceSyncError: class extends Error {}, SaveConfirmationPendingError: class extends Error {},
    }
    vm.createContext(context)
    vm.runInContext(ts.transpileModule(declaration.getText(tree), { compilerOptions: { target: ts.ScriptTarget.ES2022 } }).outputText, context)
    await context.saveActiveForm()
    assert.match(error, /record ID is still being prepared/)
    assert.equal(result.status, 'failed')
    assert.equal(saving, false)
    assert.equal(context.formSaveInFlight.current, false)
  }
})
