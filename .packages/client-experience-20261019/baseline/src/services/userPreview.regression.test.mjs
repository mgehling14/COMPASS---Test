import assert from 'node:assert/strict'
import { readFileSync } from 'node:fs'
import test from 'node:test'
import vm from 'node:vm'
import ts from 'typescript'

test('REACH Center and Manager memberships load their own form flags for normal users and View as User', async () => {
  for (const roleName of ['REACH Center', 'REACH Center Manager', 'REACH Center (Both Staff and Supervisor)']) {
    const flags = { 'Client Profile': ['x', 'x', 'x', '', ''], Services: ['x', '', '', 'x', ''] }
    const h = dataHarness({ roles: [roleRow('IT Admin', [operator]), roleRow(roleName, [target], flags), roleRow('Autumn House Manager', [{ email: 'other@example.test' }])] })
    const profiles = await h.roles.loadRolePermissionsForUser(target)
    assert.deepEqual(Array.from(profiles, (profile) => profile.roleName), [roleName])
    const client = profiles[0].entries.find((entry) => entry.formName === 'Client Profile').permissions
    assert.equal(client.view, true); assert.equal(client.search, true); assert.equal(client.create, true); assert.equal(client.edit, false)
    const services = profiles[0].entries.find((entry) => entry.formName === 'Services').permissions
    assert.equal(services.search, false); assert.equal(services.create, false); assert.equal(services.edit, true)
    const preview = await h.api.loadUserPreviewSession(operator, h.api.userIdentityKey(target))
    assert.deepEqual(Array.from(preview.profiles, (profile) => profile.roleName), [roleName])
    assert.equal(preview.profiles[0].entries.find((entry) => entry.formName === 'Client Profile').permissions.edit, false)
  }
})


const organization = 'https://org1f466e4e.crm.dynamics.com'
const config = JSON.parse(readFileSync(new URL('../../power.config.json', import.meta.url), 'utf8'))
function wrappedUserPage(token) {
  const environment = config.environmentId.replaceAll('-', '').toLowerCase()
  const connection = Object.values(config.connectionReferences).find((entry) => entry.id === '/providers/Microsoft.PowerApps/apis/shared_commondataserviceforapps').sharedConnectionId.split('/').pop()
  const link = new URL(`https://${environment.slice(0, -2)}.${environment.slice(-2)}.environment.api.powerplatform.com/connectors/runtime/invoke/scalegroups/usa/shards/00/apis/commondataserviceforapps/connections/${connection}/nextLink`)
  const route = `/api/data/v9.1.0/ithd_userses?$select=ithd_userid,ithd_email,ithd_name&$skiptoken=${encodeURIComponent(token)}`
  link.searchParams.set('organization', organization)
  link.searchParams.set('next', route)
  return { link: link.href, route }
}
const schemaSource = readFileSync(new URL('../../.power/schemas/appschemas/dataSourcesInfo.ts', import.meta.url), 'utf8')
const schema = JSON.parse(schemaSource.slice(schemaSource.indexOf('{'), schemaSource.lastIndexOf('}') + 1))
const operator = { id: 'admin-id', email: 'admin@example.test', name: 'Administrator', role: 'admin', rawRole: 'IT Admin', roleSource: 'directory' }
const target = { id: 'staff-id', email: 'staff@example.test', name: 'Staff Member', role: 'user', roleSource: 'directory', active: true }
const directoryRow = (user, extras = {}) => ({ ithd_usersid: `directory-${user.id}`, ithd_entraobjectid: user.id, ithd_userprincipalname: user.email, ithd_email: user.email, ithd_displayname: user.name, ithd_isactive: true, ithd_accountenabled: true, statecode: 0, ...extras })
const roleRow = (name, members, data = { 'Client Profile': ['x', 'x', '', '', ''] }) => ({ cr52b_rolename: name, cr52b_jsonusers: JSON.stringify(members), cr52b_jsondata: JSON.stringify(data) })

function dataHarness({ users = [directoryRow(target)], roles = [roleRow('IT Admin', [operator]), roleRow('Autumn House Staff', [target])], local = false, handler } = {}) {
  const cache = new Map(), calls = []
  function load(file) {
    if (cache.has(file)) return cache.get(file)
    const source = readFileSync(new URL(file, import.meta.url), 'utf8').replaceAll('import.meta.env', `({VITE_DATAVERSE_ORG_URL:${JSON.stringify(organization)}})`)
    const module = { exports: {} }; cache.set(file, module.exports)
    const js = ts.transpileModule(source, { compilerOptions: { module: ts.ModuleKind.CommonJS, target: ts.ScriptTarget.ES2022 } }).outputText
    async function request(operation) {
      calls.push(operation)
      assert.match(operation.operationName, /^(ListRecords(?:WithOrganization)?|GetNextPageWithOrganization)$/, 'Preview must never mutate records')
      const api = schema.commondataserviceforapps.apis[operation.operationName]
      assert.ok(api, 'Operation must exist in the generated connector schema')
      for (const parameter of api.parameters.filter((p) => p.required && p.name !== 'connectionId')) assert.notEqual(operation.parameters[parameter.name], undefined, `Missing parameter: ${parameter.name}`)
      if (handler) return handler(operation)
      return { success: true, data: { value: operation.parameters.entityName === 'ithd_userses' ? users : roles } }
    }
    vm.runInNewContext(js, {
      module, exports: module.exports, Headers, URL, URLSearchParams,
      window: { location: { hostname: local ? 'localhost' : 'powerapps.example' } },
      fetch: async (url, init) => {
        assert.equal(init.method || 'GET', 'GET')
        const parsed = new URL(url)
        const operation = { operationName: 'ListRecordsWithOrganization', parameters: { organization, entityName: parsed.pathname.split('/').at(-1), ...Object.fromEntries(parsed.searchParams) } }
        const result = await request(operation)
        return { ok: result.success, status: result.success ? 200 : 403, json: async () => result.data, text: async () => 'Denied' }
      },
      require(name) {
        if (name === '@microsoft/power-apps/data') return { getClient: () => ({ executeAsync: ({ connectorOperation }) => request(connectorOperation) }) }
        if (name.includes('dataSourcesInfo')) return { dataSourcesInfo: schema }
        if (name === './auth') return { ensureAuthToken: async () => 'original-token', getAuthToken: () => 'original-token' }
        if (name.endsWith('.json')) return JSON.parse(readFileSync(new URL(name, import.meta.url), 'utf8'))
        if (name.startsWith('./')) return load(`${name}.ts`)
        throw new Error(`Unexpected dependency: ${name}`)
      },
    }, { filename: file })
    return module.exports
  }
  return { api: load('./userPreview.ts'), roles: load('./rolePermissions.ts'), directory: load('./userDirectory.ts'), calls }
}

test('only IT Admin may begin a preview; denial occurs before the user directory is read', async () => {
  const h = dataHarness()
  for (const role of ['user', 'manager', 'admin', 'superadmin']) {
    await assert.rejects(h.api.loadUserPreviewSession({ ...target, role, rawRole: role }, h.api.userIdentityKey(target)), /Only the signed-in IT Admin/)
  }
  assert.equal(h.calls.some((call) => call.parameters.entityName === 'ithd_userses'), false)
  assert.equal(h.api.hasItAdminPermission({ ...target, rawRole: '' }, [{ roleName: ' IT Admin ', entries: [] }]), true)
})

test('preview roles come solely from selected email/ID assignments, including multiple and empty roles', async () => {
  const h = dataHarness({ roles: [
    roleRow('IT Admin', [operator]),
    roleRow('Autumn House Staff', [{ email: ' STAFF@EXAMPLE.TEST ' }]),
    roleRow('Faith House Staff', [{ id: 'STAFF-ID' }], {}),
    roleRow('Director', [{ name: target.name }]),
    roleRow('user', []),
  ] })
  const session = await h.api.loadUserPreviewSession(operator, h.api.userIdentityKey(target))
  assert.deepEqual(Array.from(session.profiles, (p) => p.roleName), ['Autumn House Staff', 'Faith House Staff'])
  assert.equal(session.profiles[1].entries.length, 0)
  assert.equal(session.user.rawRole, 'Autumn House Staff | Faith House Staff')
  assert.equal(session.profiles[0].entries[0].permissions.search, true)
  assert.equal(session.profiles[0].entries[0].permissions.create, false)
  assert.equal(session.operatorKey, h.api.userIdentityKey(operator))
  assert.equal(operator.rawRole, 'IT Admin', 'Operator identity must remain unchanged')
})

test('users without assignments do not inherit generic, named, or operator permissions', async () => {
  const h = dataHarness({ roles: [roleRow('IT Admin', [operator]), roleRow('user', []), roleRow('Autumn House Staff', [{ name: target.name }])] })
  const session = await h.api.loadUserPreviewSession(operator, h.api.userIdentityKey(target))
  assert.equal(session.profiles.length, 0)
  assert.equal(session.user.rawRole, '')
  const profiles = await h.roles.loadAssignedRolePermissionsForUser({ ...target, rawRole: 'IT Admin', role: 'admin' })
  assert.equal(profiles.length, 0, 'Even stale directory role strings must not grant access')
})

test('verified UPN and mail aliases resolve preview assignments without leaking another user\'s roles', async () => {
  const selected = { ...target, email: 'staff@prehab.org' }
  const h = dataHarness({ users: [directoryRow(selected, { ithd_email: 'staff@turnanewleaf.org' })], roles: [
    roleRow('IT Admin', [operator]),
    roleRow('Autumn House Staff', [{ email: 'staff@prehab.org' }]),
    roleRow('Faith House Staff', [{ email: 'staff@turnanewleaf.org' }]),
    roleRow('DV Outreach Staff', [{ id: 'directory-staff-id' }]),
    roleRow('Director', [{ email: 'other@prehab.org' }]),
  ] })
  const session = await h.api.loadUserPreviewSession(operator, h.api.userIdentityKey(selected))
  assert.equal(session.user.name, target.name); assert.equal(session.user.email, 'staff@prehab.org')
  assert.deepEqual(Array.from(session.profiles, (p) => p.roleName), ['Autumn House Staff', 'Faith House Staff', 'DV Outreach Staff'])
  assert.equal(session.user.id, target.id)
})

test('directory mapper uses actual column names, preserves inactive users for preview, and exposes failed mapping', async () => {
  const h = dataHarness()
  const mapped = h.directory.mapUserDirectoryRecord({
    ithd_usersid: 'directory-id', ithd_entraobjectid: 'entra-id', ithd_userprincipalname: 'staff@prehab.org', ithd_email: 'staff@turnanewleaf.org',
    ithd_displayname: 'Actual Display Name', statecode: 0, ithd_isactive: false, ithd_accountenabled: true,
  })
  assert.equal(mapped.name, 'Actual Display Name'); assert.equal(mapped.email, 'staff@prehab.org')
  assert.equal(mapped.id, 'entra-id'); assert.equal(mapped.active, false)
  assert.deepEqual(Array.from(mapped.identityIds), ['entra-id', 'directory-id'])
  const broken = dataHarness({ users: [{ unrelatedcolumn: 'Not an identity' }] })
  await assert.rejects(broken.api.loadPreviewUsers(), /Read 1 directory rows but none have a usable/)
})

test('the picker directory is ithd_userses, paginated, deduplicated, and includes inactive/unassigned users', async () => {
  const noRole = { ...target, id: 'no-role', email: 'no-role@example.test', name: 'No Role' }
  const h = dataHarness({ handler: (operation) => {
    assert.equal(operation.parameters.entityName, 'ithd_userses')
    assert.equal(operation.parameters.$top, undefined, 'The directory must not silently truncate')
    assert.equal(operation.parameters.prefer, 'odata.maxpagesize=1000')
    return { success: true, data: operation.parameters.$skiptoken
      ? { value: [directoryRow(target), directoryRow(noRole, { statecode: 1 })] }
      : { value: [directoryRow(target)], '@odata.nextLink': `${organization}/api/data/v9.2/ithd_userses?$skiptoken=page2` } }
  } })
  const entries = await h.api.loadPreviewUsers()
  assert.equal(entries.length, 2)
  assert.equal(entries.find((user) => user.id === 'no-role').active, false)
  assert.equal(h.calls.length, 2)
  assert.equal(h.calls[1].parameters.$skiptoken, 'page2')
  assert.equal(h.calls[0].parameters.token, 'original-token')
})

test('localhost uses the original authentication and rejects invalid directory continuation links', async () => {
  const local = dataHarness({ local: true })
  assert.equal((await local.api.loadUserPreviewSession(operator, local.api.userIdentityKey(target))).user.email, target.email)
  const bad = dataHarness({ handler: () => ({ success: true, data: { value: [], '@odata.nextLink': 'https://untrusted.example/api/data/v9.2/ithd_userses?$skiptoken=bad' } }) })
  await assert.rejects(bad.api.loadPreviewUsers(), /continuation|organization/i)
  assert.equal(bad.calls.length, 1)
})

test('connector-wrapped user pages use the next-page operation and preserve encoded cookies exactly', async () => {
  const page2 = wrappedUserPage('<cookie page="2" last="A&B+%25" />')
  const page3 = wrappedUserPage('<cookie page="3" last="C%D+%26" />')
  const second = { ...target, id: 'second-id', email: 'second@example.test', name: 'Second' }
  const third = { ...target, id: 'third-id', email: 'third@example.test', name: 'Third' }
  const h = dataHarness({ handler(operation) {
    // Mirror the real list endpoint: an unsupported `next` parameter does not
    // advance it. Before the fix this repeats page one and trips the guard.
    if (operation.operationName === 'ListRecordsWithOrganization') return { success: true, data: { value: [directoryRow(target)], '@odata.nextLink': page2.link } }
    assert.equal(operation.operationName, 'GetNextPageWithOrganization')
    assert.equal(operation.parameters.organization, organization)
    assert.deepEqual(Object.keys(operation.parameters).sort(), ['next', 'organization'])
    if (operation.parameters.next === page2.route) return { success: true, data: { value: [directoryRow(second)], '@odata.nextLink': page3.link } }
    assert.equal(operation.parameters.next, page3.route, 'Do not decode or re-encode the opaque cookie')
    return { success: true, data: { value: [directoryRow(third)] } }
  } })
  const users = await h.api.loadPreviewUsers()
  assert.deepEqual(Array.from(users, (user) => user.id).sort(), ['second-id', 'staff-id', 'third-id'])
  assert.deepEqual(h.calls.map((call) => call.operationName), ['ListRecordsWithOrganization', 'GetNextPageWithOrganization', 'GetNextPageWithOrganization'])
})

test('user directory can switch between connector-wrapped and direct Dataverse continuations', async () => {
  const page2 = wrappedUserPage('page2')
  const direct = `${organization.replace('.crm.', '.api.crm.')}/api/data/v9.2/ithd_userses?$skiptoken=page3`
  const h = dataHarness({ handler(operation) {
    if (operation.operationName === 'GetNextPageWithOrganization') {
      assert.equal(operation.parameters.next, page2.route)
      return { success: true, data: { value: [], '@odata.nextLink': direct } }
    }
    if (operation.parameters.$skiptoken === 'page3') return { success: true, data: { value: [directoryRow(target)] } }
    return { success: true, data: { value: [], '@odata.nextLink': page2.link } }
  } })
  assert.equal((await h.api.loadPreviewUsers()).length, 1)
  assert.equal(h.calls[2].operationName, 'ListRecordsWithOrganization')
  assert.equal(h.calls[2].parameters.$skiptoken, 'page3')
})

test('a genuinely repeated connector page still fails; no partial user directory is returned', async () => {
  const page2 = wrappedUserPage('same-page')
  const h = dataHarness({ handler: () => ({ success: true, data: { value: [directoryRow(target)], '@odata.nextLink': page2.link } }) })
  await assert.rejects(h.api.loadPreviewUsers(), /repeated record page for ithd_userses/)
  assert.equal(h.calls.length, 2)
  assert.equal(h.calls[1].operationName, 'GetNextPageWithOrganization')
})

test('next-page failures remain visible and cannot fall back to a first-page-only user list', async () => {
  const page2 = wrappedUserPage('page2')
  const h = dataHarness({ handler: (operation) => operation.operationName === 'GetNextPageWithOrganization'
    ? { success: false, error: { message: 'Continuation read denied' } }
    : { success: true, data: { value: [directoryRow(target)], '@odata.nextLink': page2.link } } })
  await assert.rejects(h.api.loadPreviewUsers(), /Continuation read denied/)
  assert.equal(h.calls.length, 2)
})

test('a deleted or unknown target fails without falling back to the operator', async () => {
  const h = dataHarness()
  await assert.rejects(h.api.loadUserPreviewSession(operator, 'missing|missing@example.test'), /no longer present/)
})

// Exercise the actual controller with a small deterministic React hook harness.
// It never renders App or calls a real Dataverse/Power Apps connection.
function controllerHarness() {
  let hookIndex = 0, workspace, tree, currentOperator = operator, verifyRoles = [{ roleName: 'IT Admin', entries: [] }]
  const hooks = [], effects = [], listeners = new Map()
  const state = {
    loader: async (admin, key) => ({ user: { ...target, id: key }, profiles: [{ roleName: 'Autumn House Staff', entries: [] }], operatorKey: `${admin.id}|${admin.email}` }),
  }
  const react = {
    useState(initial) {
      const index = hookIndex++
      if (!(index in hooks)) hooks[index] = typeof initial === 'function' ? initial() : initial
      return [hooks[index], (next) => { hooks[index] = typeof next === 'function' ? next(hooks[index]) : next }]
    },
    useRef(initial) { const index = hookIndex++; return hooks[index] ||= { current: initial } },
    useEffect(callback, deps) {
      const index = hookIndex++, previous = hooks[index]
      if (!previous || deps.some((dep, i) => dep !== previous.deps[i])) {
        previous?.cleanup?.()
        effects.push(() => { hooks[index] = { deps, cleanup: callback() } })
      }
    },
  }
  const source = readFileSync(new URL('./UserPreviewControls.tsx', import.meta.url), 'utf8')
  const js = ts.transpileModule(source, { compilerOptions: { module: ts.ModuleKind.CommonJS, target: ts.ScriptTarget.ES2022, jsx: ts.JsxEmit.ReactJSX } }).outputText
  const module = { exports: {} }
  vm.runInNewContext(js, {
    module, exports: module.exports,
    window: { addEventListener: (name, cb) => listeners.set(name, cb), removeEventListener: (name) => listeners.delete(name), setInterval: () => 1, clearInterval() {} },
    document: { activeElement: null },
    require(name) {
      if (name === 'react') return react
      if (name === 'react/jsx-runtime') return { Fragment: 'fragment', jsx: (type, props, key) => ({ type, props, key }), jsxs: (type, props, key) => ({ type, props, key }) }
      if (name === './auth') return { getCurrentUser: () => currentOperator }
      if (name === './rolePermissions') return { loadRolePermissionsForUser: async () => verifyRoles }
      if (name === './userPreview') return {
        loadPreviewUsers: async () => [], loadUserPreviewSession: (...args) => state.loader(...args),
        userIdentityKey: (user) => `${user.id}|${user.email}`,
        hasItAdminPermission: (_user, profiles) => profiles.some((p) => p.roleName === 'IT Admin'),
      }
      if (name.endsWith('.css')) return {}
      throw new Error(`Unexpected dependency: ${name}`)
    },
  })
  function render() {
    hookIndex = 0
    tree = module.exports.UserPreviewRoot({ children: (next) => { workspace = next; return { type: 'workspace', props: {} } } })
    while (effects.length) effects.shift()()
    return workspace
  }
  function nodes() {
    const results = []
    function walk(node) {
      if (Array.isArray(node)) { node.forEach(walk); return }
      if (!node || typeof node !== 'object') return
      results.push(node); walk(node.props?.children)
    }
    walk(tree); return results
  }
  render()
  return {
    state, render, listeners,
    button: (label) => nodes().find((node) => node.type === 'button' && node.props.children === label),
    key: () => nodes().find((node) => node.type === 'div' && node.key)?.key,
    revoke: () => { verifyRoles = [] },
    changeOperator: () => { currentOperator = { ...operator, id: 'other-admin' } },
  }
}

test('entering, switching, refreshing, and exiting remount the workspace and restore normal identity', async () => {
  const h = controllerHarness(), initialKey = h.key()
  await h.render().onStart('user-one'); let workspace = h.render()
  assert.equal(workspace.session.user.id, 'user-one'); assert.notEqual(h.key(), initialKey)
  const firstKey = h.key()
  await workspace.onStart('user-two'); workspace = h.render()
  assert.equal(workspace.session.user.id, 'user-two'); assert.notEqual(h.key(), firstKey)
  const secondKey = h.key()
  await workspace.onStart('user-two'); h.render(); assert.notEqual(h.key(), secondKey)
  h.button('Exit View as User').props.onClick(); workspace = h.render()
  assert.equal(workspace.session, null); assert.equal(workspace.initialAdminPage, true)
})

test('exit and sign-in changes cancel in-flight identity switches; stale results cannot restore preview', async () => {
  const h = controllerHarness()
  await h.render().onStart('user-one'); h.render()
  let resolve
  h.state.loader = () => new Promise((done) => { resolve = done })
  const pending = h.render().onStart('user-two')
  h.listeners.get('compass:authChanged')(); h.render()
  resolve({ user: target, profiles: [], operatorKey: `${operator.id}|${operator.email}` }); await pending
  assert.equal(h.render().session, null)
  assert.equal(h.render().busy, false)
})

test('failed refresh or revoked operator permission exits instead of retaining stale grants', async () => {
  const h = controllerHarness()
  await h.render().onStart('user-one'); h.render()
  h.state.loader = async () => { throw new Error('Permissions cannot be verified') }
  await assert.rejects(h.render().onStart('user-one'), /cannot be verified/)
  assert.equal(h.render().session, null)
  h.state.loader = async () => ({ user: target, profiles: [], operatorKey: `${operator.id}|${operator.email}` })
  await h.render().onStart('user-one'); h.render()
  h.revoke(); await h.listeners.get('focus')()
  assert.equal(h.render().session, null)
})

test('App routes all permission, hub, and My Work access through the selected identity, never operator grants', () => {
  const app = readFileSync(new URL('../App.tsx', import.meta.url), 'utf8')
  assert.match(app, /const user = previewSession\?\.user \|\| authenticatedUser/)
  assert.match(app, /useState<RolePermissionProfile\[\]>\(previewSession\?\.profiles \|\| \[\]\)/)
  assert.match(app, /previewSession\?\.profiles \|\| (?:loadedProfiles|await loadRolePermissionsForUser\(user\))/)
  assert.equal((app.match(/getCurrentUser\(\)/g) || []).length, 2, 'No direct operator reads inside record/form filtering')
  assert.match(app, /\[user.id, user.email, user.name, \.\.\.\(user.identityIds \|\| \[\]\)/)
  assert.match(app, /return matched\s*\n/)
  assert.doesNotMatch(app, /matched.length\s*\?\s*matched\s*:\s*HUB_DEFINITIONS/)
  assert.match(app, /adminPage === 'view-as-user' && !isUserPreview \? <UserPreviewPicker/)
  assert.match(app, /canAccessRoleAdmin.*view-as-user.*View as User/)
})

test('all backend write handlers fail early and all save/archive/restore/import/upload controls are disabled in preview', () => {
  const source = readFileSync(new URL('../App.tsx', import.meta.url), 'utf8')
  const tree = ts.createSourceFile('App.tsx', source, ts.ScriptTarget.Latest, true, ts.ScriptKind.TSX)
  const writers = new Set(['saveActiveForm', 'createPendingCompassFile', 'archiveRecord', 'restoreArchivedRecord', 'saveFunderAdminEditor', 'onPickRoleWorkbook', 'onPickBedsCsv', 'saveRoleEdit', 'saveFormPicklistEdit'])
  const guarded = new Set(); let controls = 0
  function visit(node) {
    if (ts.isFunctionDeclaration(node) && writers.has(node.name?.text)) {
      const first = node.body.statements[0].getText(tree)
      assert.match(first, /if \(isUserPreview\)/)
      assert.match(first, /USER_PREVIEW_READ_ONLY_MESSAGE/)
      assert.match(first, /(?:return|throw)/)
      guarded.add(node.name.text)
    }
    if (ts.isJsxOpeningElement(node) || ts.isJsxSelfClosingElement(node)) {
      const tag = node.tagName.getText(tree)
      const attrs = new Map(node.attributes.properties.filter(ts.isJsxAttribute).map((a) => [a.name.getText(tree), a.initializer?.getText(tree) || '']))
      const writes = tag === 'button' && [...writers].some((name) => attrs.get('onClick')?.includes(name))
      const upload = tag === 'input' && attrs.get('type') === '"file"'
      if (writes || upload) { assert.match(attrs.get('disabled') || '', /isUserPreview/, node.getText(tree)); controls++ }
    }
    ts.forEachChild(node, visit)
  }
  visit(tree)
  assert.equal(guarded.size, writers.size); assert.ok(controls >= 40)
  assert.match(source, /adminPage === 'legacy-migration' && !isUserPreview \? <LegacyRecordMigrationPanel/)
  assert.match(source, /adminPage === 'household-history' && !isUserPreview \? <HouseholdHistoryBackfillPanel/)
})
