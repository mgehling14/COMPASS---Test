import assert from 'node:assert/strict'
import { readFileSync } from 'node:fs'
import test from 'node:test'
import vm from 'node:vm'
import ts from 'typescript'

test('REACH Center roles open the REACH SV hub without admitting partial names or unrelated SV roles', () => {
  const app = appHarness(), hub = app.HUB_DEFINITIONS.find((entry) => entry.id === 'sv')
  assert.equal(hub.title, 'REACH Center'); assert.equal(app.hubLabel(hub), 'REACH SV Hub')
  for (const role of ['REACH Center Manager', 'REACH Center', 'REACH Center Staff', 'REACH Center Supervisor', 'REACH Center (Both Staff and Supervisor)', '  reach CENTER manager  ']) {
    assert.equal(app.hubMatchesRole(hub, role), true, role)
  }
  for (const role of ['SV Staff', 'SV Supervisor', 'DV & SV Services Director', 'REACH', 'Center', 'REACH Centerpiece Manager', 'Other REACH Center Manager', 'REACH SV', 'Autumn House Manager']) {
    assert.equal(app.hubMatchesRole(hub, role), false, role)
  }
})

test('REACH staff assignment and caseload keys match the actual REACH Center enrollment program', () => {
  const entry = (name, roleName) => ({ name, email: `${name}@example.test`, roleNames: [roleName], memberships: [] })
  const entries = [entry('Manager', 'REACH Center Manager'), entry('Team', 'REACH Center'), entry('Supervisor', 'REACH Center Supervisor'), entry('Unrelated', 'DV & SV Services Director')]
  const app = appHarness(entries)
  assert.deepEqual(Array.from(app.getStaffOptionsForProgram('REACH Center')), ['Manager', 'Team', 'Supervisor'])
  assert.equal(app.getStaffProgramKeys(entries[0]).has('reach center'), true)
  assert.equal(app.getStaffProgramKeys(entries[1]).has('reach center'), true)
  assert.equal(app.getStaffProgramKeys(entries[3]).has('reach center'), false)
})


const formatted = (field) => `${field}@OData.Community.Display.V1.FormattedValue`
const id = '11111111-1111-1111-1111-111111111111'

function appHarness(staffDirectoryEntries = []) {
  const source = readFileSync(new URL('../App.tsx', import.meta.url), 'utf8')
  const tree = ts.createSourceFile('App.tsx', source, ts.ScriptTarget.Latest, true, ts.ScriptKind.TSX)
  const names = ['normalize', 'roleKey', 'hubMatchesRole', 'hubLabel', 'getStaffOptionsForProgram', 'getStaffProgramKeys']
  const snippets = []
  function visit(node) {
    if (ts.isVariableDeclaration(node) && node.name.getText(tree) === 'HUB_DEFINITIONS') snippets.push(`const HUB_DEFINITIONS = ${node.initializer.getText(tree)}`)
    if (ts.isFunctionDeclaration(node) && names.includes(node.name?.text)) snippets.push(node.getText(tree))
    ts.forEachChild(node, visit)
  }
  visit(tree)
  assert.equal(snippets.length, names.length + 1)
  const module = { exports: {} }
  const js = ts.transpileModule(`${snippets.join('\n')}\nmodule.exports = { HUB_DEFINITIONS, ${names.join(',')} }`, {
    compilerOptions: { module: ts.ModuleKind.CommonJS, target: ts.ScriptTarget.ES2022 },
  }).outputText
  vm.runInNewContext(js, { module, staffDirectoryEntries })
  return module.exports
}

function serviceHarness(row = {}) {
  const cache = new Map()
  function load(file) {
    if (cache.has(file)) return cache.get(file)
    const source = readFileSync(new URL(file, import.meta.url), 'utf8').replaceAll('import.meta.env', '({})')
    const module = { exports: {} }; cache.set(file, module.exports)
    const js = ts.transpileModule(source, { compilerOptions: { module: ts.ModuleKind.CommonJS, target: ts.ScriptTarget.ES2022 } }).outputText
    vm.runInNewContext(js, {
      module, exports: module.exports, Headers, URL, URLSearchParams,
      window: { location: { hostname: 'localhost' } },
      fetch: async (url, init) => {
        assert.equal(init?.method || 'GET', 'GET', 'No real updates during label tests')
        const single = new URL(url).pathname.endsWith(`(${id})`)
        return { ok: true, headers: new Headers(), json: async () => single ? row : { value: [row] } }
      },
      require(name) {
        if (name === '@microsoft/power-apps/data') return { getClient: () => ({ executeAsync: async () => { throw new Error('Unexpected connector request') } }) }
        if (name.includes('dataSourcesInfo')) return { dataSourcesInfo: {} }
        if (name === './auth') return { getAuthToken: () => 'test-token', ensureAuthToken: async () => 'test-token' }
        if (name === './archive') return { ARCHIVED_NO_VALUE: 125570001, excludeArchived: (filter = '') => filter }
        if (name.endsWith('.json')) return JSON.parse(readFileSync(new URL(name, import.meta.url), 'utf8'))
        if (name.startsWith('./')) return load(`${name}.ts`)
        throw new Error(`Unexpected dependency: ${name}`)
      },
    }, { filename: file })
    return module.exports
  }
  return { load }
}

test('DV Outreach hub accepts renamed COMPASS roles, not the former role names', () => {
  const app = appHarness(), hub = app.HUB_DEFINITIONS.find((entry) => entry.id === 'dv-outreach')
  assert.ok(hub); assert.equal(hub.title, 'DV Outreach'); assert.equal(app.hubLabel(hub), 'DV Outreach Hub')
  assert.equal(app.HUB_DEFINITIONS.some((entry) => entry.id === 'caafa-outreach'), false)
  for (const suffix of ['Staff', 'Supervisor', 'Manager', 'Director']) {
    assert.equal(app.hubMatchesRole(hub, `DV Outreach ${suffix}`), true)
    assert.equal(app.hubMatchesRole(hub, `CAAFA Outreach ${suffix}`), false)
  }
  assert.equal(app.hubMatchesRole(hub, 'CAAFA Shelter Staff'), false)
})

test('staff assignment and caseload program keys use DV Outreach role names', () => {
  const entry = (name, roleName) => ({ name, email: `${name}@example.test`, roleNames: [roleName], memberships: [] })
  const entries = [entry('Staff', 'DV Outreach Staff'), entry('Manager', 'DV Outreach Manager'), entry('Old', 'CAAFA Outreach Staff'), entry('Other', 'Faith House Staff')]
  const app = appHarness(entries)
  assert.deepEqual(Array.from(app.getStaffOptionsForProgram('DV Outreach')), ['Staff', 'Manager'])
  assert.equal(app.getStaffProgramKeys(entries[0]).has('dv outreach'), true)
  assert.equal(app.getStaffProgramKeys(entries[2]).has('dv outreach'), false)
})

test('program choices and ID division retain their existing numeric positions with the new label', () => {
  const h = serviceHarness()
  const client = h.load('./clientProfile.ts'), household = h.load('./household.ts'), services = h.load('./services.ts'), funder = h.load('./funderAdmin.ts')
  for (const options of [client.CLIENT_PROFILE_FIELDS.find((field) => field.field === 'cmps_assignedprograms').options, household.HOUSEHOLD_PROGRAM_OPTIONS, services.WHERE_DID_YOU_REFER_INTERNAL_OPTIONS, funder.FUNDER_ADMIN_TABLES.funder.fields.find((field) => field.field === 'cmps_program').options]) {
    assert.equal(options[1], 'DV Outreach'); assert.equal(options.includes('CAAFA Outreach'), false)
  }
  assert.equal(services.WHERE_DID_YOU_REFER_OPTIONS.includes('DV Outreach'), true)
  assert.equal(services.WHERE_DID_YOU_REFER_OPTIONS.includes('CAAFA Outreach'), false)
  assert.equal(h.load('./recordIds.ts').PROGRAM_DIVISION_CODES['DV Outreach'], '04')
  assert.equal(funder.mapFunderAdminValues('funder', { cmps_program: 125570001 }).cmps_program, 'DV Outreach')
  for (const field of ['cmps_hmisid', 'cmps_hmisaliases']) {
    const required = client.CLIENT_PROFILE_FIELDS.find((entry) => entry.field === field).requiredWhen
    assert.equal(required({ cmps_assignedprograms: 'DV Outreach' }), true)
    assert.equal(required({ cmps_assignedprograms: 'Autumn House' }), false)
  }
})

test('existing bed, household and client program data display DV Outreach, including old formatted labels', async () => {
  const row = { cmps_bedid: id, cmps_householdid: id, cmps_clientprofileid: id, cmps_program: 125570001, [formatted('cmps_program')]: 'CAAFA Outreach', cmps_assignedprograms: '125570001', [formatted('cmps_assignedprograms')]: 'CAAFA Outreach', cmps_status: 125570000, [formatted('cmps_status')]: 'Available' }
  const h = serviceHarness(row)
  const beds = await h.load('./beds.ts').listAvailableBedsForProgram('DV Outreach')
  assert.equal(beds.length, 1); assert.equal(beds[0].program, 'DV Outreach')
  const households = await h.load('./household.ts').listHouseholdsByIds([id])
  assert.equal(households[0].program, 'DV Outreach')
  const client = await h.load('./clientProfile.ts').loadClientProfileDetailRecord(id)
  assert.equal(client.values.cmps_assignedprograms, 'DV Outreach')
})
