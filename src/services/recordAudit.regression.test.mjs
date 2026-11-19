import assert from 'node:assert/strict'
import { readFileSync } from 'node:fs'
import test from 'node:test'
import vm from 'node:vm'
import ts from 'typescript'
import { funderTestHarness } from './funderTestHarness.mjs'

const schemaSource = readFileSync(new URL('../../.power/schemas/appschemas/dataSourcesInfo.ts', import.meta.url), 'utf8')
const schema = JSON.parse(schemaSource.slice(schemaSource.indexOf('{'), schemaSource.lastIndexOf('}') + 1))
const id = '11111111-1111-1111-1111-111111111111'
const saved = { cmps_createdby: 'Original Creator', cmps_modifiedby: 'Last Editor', createdon: '2026-10-01T12:00:00Z', modifiedon: '2026-10-07T15:00:00Z' }

function harness({ local = false, failure = false, row = saved } = {}) {
  const calls = [], cache = new Map()
  function load(name) {
    if (cache.has(name)) return cache.get(name)
    let source = readFileSync(new URL(name, import.meta.url), 'utf8').replaceAll('import.meta.env', '({})')
    const tree = ts.createSourceFile(name, source, ts.ScriptTarget.Latest, true)
    const normalizers = tree.statements.filter((node) => ts.isFunctionDeclaration(node) && /^normalize.*Payload/.test(node.name?.text || ''))
    const normalize = normalizers.find((node) => /ForDataverse$/.test(node.name.text)) || normalizers[0]
    if (normalize) source += `\nexport const testNormalize = ${normalize.name.text}`
    const module = { exports: {} }; cache.set(name, module.exports)
    const javascript = ts.transpileModule(source, { compilerOptions: { module: ts.ModuleKind.CommonJS, target: ts.ScriptTarget.ES2022 } }).outputText
    vm.runInNewContext(javascript, {
      module, exports: module.exports, Headers, URL, URLSearchParams,
      window: { location: { hostname: local ? 'localhost' : 'apps.powerapps.com' } },
      fetch: async (url, options) => { calls.push({ url, options }); if (failure) throw Error('Denied'); return { ok: true, json: async () => row } },
      require(dependency) {
        if (dependency === '@microsoft/power-apps/data') return { getClient: () => ({ executeAsync: async ({ connectorOperation: operation }) => {
          calls.push(operation)
          const api = schema.commondataserviceforapps.apis[operation.operationName]
          assert.ok(api, `Unsupported ${operation.operationName}`)
          for (const param of api.parameters.filter((p) => p.required && p.name !== 'connectionId')) assert.notEqual(operation.parameters[param.name], undefined, `Missing ${param.name}`)
          return failure ? { success: false, error: { message: 'Denied' } } : { success: true, data: row }
        } }) }
        if (dependency.includes('dataSourcesInfo')) return { dataSourcesInfo: schema }
        if (dependency === '../../power.config.json') return JSON.parse(readFileSync(new URL(dependency, import.meta.url), 'utf8'))
        if (dependency === './auth') return { getAuthToken: () => 'test-token', ensureAuthToken: async () => 'test-token' }
        if (dependency.startsWith('./')) return load(`${dependency}.ts`)
        throw Error(`Unexpected ${dependency}`)
      },
    }, { filename: name })
    return module.exports
  }
  return { load, calls }
}

test('create stamps both custom user fields; edits preserve creator and never submit system audit columns', () => {
  const { withRecordAudit } = harness().load('./recordAudit.ts')
  const original = { ...saved, cmps_creationdate: 'stale', createdby: 'guid', modifiedby: 'guid', cmps_notes: 'Keep me' }
  const created = withRecordAudit(original, ' Current User ', false)
  assert.equal(created.cmps_createdby, 'Current User'); assert.equal(created.cmps_modifiedby, 'Current User')
  const edited = withRecordAudit(original, 'Current Editor', true)
  assert.equal(edited.cmps_modifiedby, 'Current Editor'); assert.equal(edited.cmps_notes, 'Keep me')
  for (const field of ['cmps_createdby', 'createdon', 'modifiedon', 'createdby', 'modifiedby', 'cmps_creationdate']) assert.ok(!(field in edited))
  assert.equal(original.cmps_createdby, 'Original Creator')
  assert.throws(() => withRecordAudit({}, '', false), /sign in again/)
})

test('every developed form normalizer retains stamped custom user fields', () => {
  const { load } = harness(), { withRecordAudit } = load('./recordAudit.ts')
  const files = ['clientProfile', 'programEnrollment', 'services', 'helpline', 'event', 'household', 'householdHistory', 'shelterScreening', 'vocaForm', 'releaseOfInformation', 'acknowledgementAndConsent', 'animalAgreement', 'bedEnrollment', 'adultAssessment', 'childAssessment', 'childSafetyPlan', 'childShelterIntake', 'electronicDocument', 'employmentAndBenefits', 'financialAssistance', 'focusPlan', 'goals', 'healthAndWellnessQuestionnaire', 'initialSafetyPlan', 'medicalConsentForm', 'personYouAreFleeingProfile', 'petCompanionIntake', 'shelterProgramGuidelines', 'termsAndConditionsOfServiceAnimals', 'contract', 'funderTransaction']
  for (const file of files) for (const editing of [false, true]) {
    const seed = withRecordAudit({ ...saved }, 'Staff', editing)
    const output = load(`./${file}.ts`).testNormalize(seed)
    assert.equal(output.cmps_modifiedby, 'Staff', `${file} edit=${editing}`)
    assert.equal(output.cmps_createdby, editing ? undefined : 'Staff', `${file} creator`)
    assert.ok(!('createdon' in output) && !('modifiedon' in output), file)
  }
})

for (const local of [false, true]) {
  test(`${local ? 'local' : 'runtime'} system reader retrieves all four columns from the exact row, with a supported operation`, async () => {
    const h = harness({ local }), api = h.load('./systemFields.ts')
    const fields = await api.loadSystemFields('cmps_serviceses', `{${id}}`)
    assert.equal(fields.createdBy, saved.cmps_createdby); assert.equal(fields.modifiedBy, saved.cmps_modifiedby)
    assert.equal(fields.createdOn, saved.createdon); assert.equal(fields.modifiedOn, saved.modifiedon)
    if (local) {
      assert.ok(new URL(h.calls[0].url).pathname.endsWith(`cmps_serviceses(${id})`))
      assert.ok(new URL(h.calls[0].url).searchParams.get('$select').includes('createdon,modifiedon'))
    } else {
      assert.equal(h.calls[0].operationName, 'GetItemWithOrganization')
      assert.equal(h.calls[0].parameters.recordId, id)
      assert.ok(h.calls[0].parameters.$select.includes('cmps_createdby,cmps_modifiedby,createdon,modifiedon'))
    }
    await assert.rejects(api.loadSystemFields('cmps_helplines', 'not-a-guid'), /Invalid row ID/)
  })
  test(`${local ? 'local' : 'runtime'} failed audit reads surface the error without silently falling back to another connection`, async () => {
    const h = harness({ local, failure: true })
    await assert.rejects(h.load('./systemFields.ts').loadSystemFields('cmps_helplines', id), /Denied/)
    assert.equal(h.calls.length, 1)
  })
}

test('legacy records display native Dataverse user names and standard timestamps without fabricating custom audit history', async () => {
  const h = harness({ row: { createdby: { fullname: 'Platform Creator' }, '_modifiedby_value@OData.Community.Display.V1.FormattedValue': 'Platform Editor', createdon: saved.createdon, modifiedon: saved.modifiedon } })
  const fields = await h.load('./systemFields.ts').loadSystemFields('cmps_helplines', id)
  assert.equal(fields.createdBy, 'Platform Creator'); assert.equal(fields.modifiedBy, 'Platform Editor')
  assert.equal(fields.createdOn, saved.createdon)
})

for (const local of [false, true]) test(`${local ? 'local' : 'runtime'} funder admin saves retain audit fields and contract synchronization attributes the last editor`, async () => {
  const h = funderTestHarness({ local }), { withRecordAudit } = harness().load('./recordAudit.ts')
  await h.api.saveFunderAdminRecord('funder', '', withRecordAudit({ cmps_name: 'Audit Funder', cmps_activechoice: 'Yes' }, 'Admin', false))
  await h.api.saveFunderAdminRecord('contract', id, withRecordAudit({ cmps_contractname: 'Audit Contract', cmps_contractamount: '2500.50', cmps_contractstartdate: '2026-10-01', cmps_contractenddate: '2027-10-01', cmps_contractstatus: 'Open for Disbursements' }, 'Editor', true))
  const writes = h.calls.map((call) => call.parameters?.item || (call.init?.body ? JSON.parse(call.init.body) : null)).filter(Boolean)
  assert.equal(writes[0].cmps_createdby, 'Admin'); assert.equal(writes[0].cmps_modifiedby, 'Admin')
  assert.equal(writes[1].cmps_modifiedby, 'Editor'); assert.ok(!('cmps_createdby' in writes[1]))
  assert.equal(writes.at(-1).cmps_modifiedby, 'Editor')
})
