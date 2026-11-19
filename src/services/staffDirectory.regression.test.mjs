import assert from 'node:assert/strict'
import { readFileSync } from 'node:fs'
import test from 'node:test'
import vm from 'node:vm'
import ts from 'typescript'

const user = (id, name, values = {}) => ({ ithd_usersid: 'directory-' + id, ithd_entraobjectid: id, ithd_userprincipalname: id + '@example.test', ithd_email: id + '@example.test', ithd_displayname: name, ...values })
const role = (roleName, members, program = '') => ({ cr52b_rolename: roleName, cr52b_jsonusers: JSON.stringify(members), cr52b_program: program })

function harness(handler, local) {
  const calls = [], cache = new Map()
  function load(file) {
    if (cache.has(file)) return cache.get(file)
    const source = readFileSync(new URL(file, import.meta.url), 'utf8').replaceAll('import.meta.env', '({})')
    const js = ts.transpileModule(source, { compilerOptions: { module: ts.ModuleKind.CommonJS, target: ts.ScriptTarget.ES2022 } }).outputText
    const module = { exports: {} }; cache.set(file, module.exports)
    function request(call) {
      calls.push(call)
      const result = handler(call)
      return result.ok === false ? { success: false, error: { message: 'Simulated read error' } } : { success: true, data: result.data || { value: result.rows || [] } }
    }
    vm.runInNewContext(js, {
      module, exports: module.exports, Headers, URL, URLSearchParams,
      window: { location: { hostname: local ? 'localhost' : 'powerapps.example' } },
      fetch: async (url, init) => {
        const parsed = new URL(url)
        const result = request({ alias: parsed.pathname.split('/').pop(), select: parsed.searchParams.get('$select') || '', parameters: Object.fromEntries(parsed.searchParams), init })
        return { ok: result.success, status: result.success ? 200 : 403, json: async () => result.data, text: async () => 'Simulated read error' }
      },
      require(name) {
        if (name === '@microsoft/power-apps/data') return { getClient: () => ({ executeAsync: async ({ connectorOperation: operation }) => {
          assert.ok(['ListRecordsWithOrganization', 'GetNextPageWithOrganization'].includes(operation.operationName))
          return request({ alias: operation.parameters.entityName, select: operation.parameters.$select || '', parameters: operation.parameters, operationName: operation.operationName })
        } }) }
        if (name.includes('dataSourcesInfo')) return { dataSourcesInfo: {} }
        if (name === './auth') return { ensureAuthToken: async () => 'test-token', getAuthToken: () => 'test-token' }
        if (name.endsWith('.json')) return JSON.parse(readFileSync(new URL(name, import.meta.url), 'utf8'))
        if (name.startsWith('./')) return load(name + '.ts')
        throw new Error('Unexpected dependency ' + name)
      },
    })
    return module.exports
  }
  return { api: load('./staffDirectory.ts'), directory: load('./userDirectory.ts'), calls }
}

for (const local of [false, true]) {
  const mode = local ? 'local' : 'runtime'
  test(`${mode}: ithd_userses alone determines eligible staff; role-only and inactive users are excluded`, async () => {
    const users = [user('active', 'Active Staff', { statecode: 0 }), user('inactive', 'Inactive Staff', { statecode: 1 }), user('unassigned', 'Unassigned Staff', { statecode: 0 })]
    const members = [...users.filter((row) => row.ithd_entraobjectid !== 'unassigned').map((row) => ({ email: row.ithd_email })), { email: 'legacy-only@example.test' }]
    const h = harness(({ alias }) => ({ rows: alias === 'ithd_userses' ? users : alias === 'cr52b_compassroletables' ? [role('Autumn House Manager', members)] : [] }), local)
    const entries = await h.api.loadStaffDirectoryEntries()
    assert.deepEqual(Array.from(entries, (entry) => entry.name), ['Active Staff'])
    assert.equal(entries[0].memberships[0].roleName, 'Autumn House Manager')
    assert.equal(h.calls.filter((call) => call.alias === 'ithd_userses').length, 1)
    assert.equal(h.calls.some((call) => ['ithd_users', 'mg_appuserses'].includes(call.alias)), false)
    if (local) assert.equal(new Headers(h.calls[0].init.headers).get('Authorization'), 'Bearer test-token')
  })

  test(`${mode}: active flags are read from ithd_userses and COMPASS memberships still match by email or ID`, async () => {
    const users = [
      user('a', 'Active', { ithd_isactive: true }), user('b', 'Disabled Boolean', { ithd_isactive: false }),
      user('c', 'Disabled Text', { ithd_status: 'Inactive' }), user('d', 'Disabled Zero', { ithd_isactive: 0 }),
      user('e', 'Not A Member', { ithd_isactive: true }), user('f', 'By ID', { statecode: 0 }),
    ]
    const h = harness(({ alias }) => ({ rows: alias === 'ithd_userses' ? users : alias === 'cr52b_compassroletables' ? [role('Faith House Staff', [
      ...users.filter((row) => row.ithd_entraobjectid !== 'e' && row.ithd_entraobjectid !== 'f').map((row) => ({ email: row.ithd_email.toUpperCase() })), { id: 'f' },
    ], 'Faith House')] : [] }), local)
    const entries = await h.api.loadStaffDirectoryEntries()
    assert.deepEqual(Array.from(entries, (entry) => entry.name), ['Active', 'By ID'])
    for (const entry of entries) { assert.equal(entry.memberships[0].program, 'Faith House'); assert.equal(entry.roleNames.includes('Faith House Staff'), true) }
  })

  test(`${mode}: user reads select verified columns with no legacy table or column fallback`, async () => {
    const h = harness(({ alias, select }) => {
      if (alias === 'ithd_userses') {
        const columns = select.split(',')
        for (const field of ['ithd_usersid', 'ithd_displayname', 'ithd_userprincipalname', 'ithd_entraobjectid', 'ithd_isactive', 'ithd_accountenabled']) assert.ok(columns.includes(field), field)
        assert.equal(columns.includes('ithd_userid'), false); assert.equal(columns.includes('ithd_name'), false)
        return { rows: [user('a', 'Current Staff', { statecode: 0 })] }
      }
      return { rows: alias === 'cr52b_compassroletables' ? [role('DV Outreach Staff', [{ email: 'a@example.test' }])] : [] }
    }, local)
    const entries = await h.api.loadStaffDirectoryEntries()
    assert.equal(entries.length, 1)
    assert.equal(h.calls.filter((call) => call.alias === 'ithd_userses').length, 1)
    assert.equal(h.calls.some((call) => ['ithd_users', 'mg_appuserses'].includes(call.alias)), false)
  })

  test(`${mode}: failure or empty ithd_userses cannot be replaced with a legacy active-user record`, async () => {
    for (const fail of [false, true]) {
      const h = harness(({ alias }) => alias === 'ithd_userses' ? { ok: !fail, rows: [] } : { rows: alias === 'cr52b_compassroletables' ? [role('REACH Center Staff', [{ email: 'legacy@example.test' }])] : [user('legacy', 'Legacy Active Staff', { statecode: 0 })] }, local)
      if (fail) await assert.rejects(h.api.loadStaffDirectoryEntries(), /Simulated read error/)
      else assert.equal((await h.api.loadStaffDirectoryEntries()).length, 0)
      assert.equal(h.calls.some((call) => ['ithd_users', 'mg_appuserses'].includes(call.alias)), false)
    }
  })

  test(`${mode}: actual display name, UPN, mail, Entra ID and directory ID resolve the same staff member`, async () => {
    const active = user('entra-id', 'Real Display Name', {
      ithd_usersid: 'directory-id', ithd_userprincipalname: 'staff@prehab.org', ithd_email: 'staff@turnanewleaf.org',
      statecode: 0, ithd_isactive: true, ithd_accountenabled: true,
    })
    const h = harness(({ alias }) => ({ rows: alias === 'ithd_userses' ? [active] : alias === 'cr52b_compassroletables' ? [
      role('Autumn House Staff', [{ email: 'STAFF@PREHAB.ORG' }]),
      role('Faith House Staff', [{ email: 'staff@turnanewleaf.org' }]),
      role('DV Outreach Staff', [{ id: 'directory-id' }]),
      role('REACH Center Staff', [{ id: 'entra-id' }]),
    ] : [] }), local)
    const entries = await h.api.loadStaffDirectoryEntries()
    assert.equal(entries.length, 1)
    assert.equal(entries[0].name, 'Real Display Name'); assert.equal(entries[0].email, 'staff@prehab.org')
    assert.equal(entries[0].id, 'entra-id'); assert.equal(entries[0].memberships.length, 4)
    assert.deepEqual(Array.from(entries[0].identityEmails), ['staff@prehab.org', 'staff@turnanewleaf.org'])
  })

  test(`${mode}: Active Dataverse row state never overrides disabled user or account flags`, async () => {
    const users = [
      user('enabled', 'Enabled', { statecode: 0, ithd_isactive: true, ithd_accountenabled: true }),
      user('inactive', 'Inactive', { statecode: 0, ithd_isactive: false, ithd_accountenabled: true }),
      user('disabled', 'Disabled', { statecode: 0, ithd_isactive: true, ithd_accountenabled: false }),
      user('text-no', 'Text No', { statecode: 'Active', ithd_isactive: 'No', ithd_accountenabled: 'Yes' }),
      user('inactive-row', 'Inactive Row', { statecode: 1, ithd_isactive: true, ithd_accountenabled: true }),
    ]
    const h = harness(({ alias }) => ({ rows: alias === 'ithd_userses' ? users : alias === 'cr52b_compassroletables' ? [role('Autumn House Staff', users.map((row) => ({ email: row.ithd_userprincipalname })))] : [] }), local)
    assert.deepEqual(Array.from(await h.api.loadStaffDirectoryEntries(), (entry) => entry.name), ['Enabled'])
  })

  test(`${mode}: staff eligibility includes directory users beyond the old 5,000-row cap`, async () => {
    const h = harness(({ alias, parameters }) => {
      if (alias !== 'ithd_userses') return { rows: alias === 'cr52b_compassroletables' ? [role('Autumn House Staff', [{ email: 'last@example.test' }])] : [] }
      assert.equal(parameters.$top, undefined)
      if (parameters.$skiptoken) return { rows: [user('last', 'Last Eligible Staff', { statecode: 0, ithd_isactive: true, ithd_accountenabled: true })] }
      return { data: { value: Array.from({ length: 5000 }, (_, i) => user(`unassigned-${i}`, `Unassigned ${i}`)), '@odata.nextLink': 'https://org1f466e4e.crm.dynamics.com/api/data/v9.2/ithd_userses?$skiptoken=last-page' } }
    }, local)
    assert.deepEqual(Array.from(await h.api.loadStaffDirectoryEntries(), (entry) => entry.name), ['Last Eligible Staff'])
    assert.equal(h.calls.filter((call) => call.alias === 'ithd_userses').length, 2)
  })
}
