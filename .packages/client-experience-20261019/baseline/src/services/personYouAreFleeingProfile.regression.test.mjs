import assert from 'node:assert/strict'
import { readFileSync } from 'node:fs'
import test from 'node:test'
import vm from 'node:vm'
import ts from 'typescript'

const rowId = '11111111-1111-1111-1111-111111111111'
const additionalInformationField = 'cmps_additionalinformationyouwanttoshare'
const photoId = '22222222-2222-2222-2222-222222222222'
const app = readFileSync(new URL('../App.tsx', import.meta.url), 'utf8')
const editorStart = app.indexOf("activeFormSession?.kind === 'person-you-are-fleeing-profile' ? (")
const editor = app.slice(editorStart, app.indexOf("activeFormSession?.kind === 'financial-assistance'", editorStart))
const saveStart = app.indexOf("if (session.kind === 'person-you-are-fleeing-profile')", app.indexOf('async function saveActiveForm'))
const saveBlock = app.slice(saveStart, app.indexOf("if (session.kind === 'electronic-document')", saveStart))
const schemaText = readFileSync(new URL('../../.power/schemas/appschemas/dataSourcesInfo.ts', import.meta.url), 'utf8')
const schema = JSON.parse(schemaText.slice(schemaText.indexOf('{'), schemaText.lastIndexOf('}') + 1))

function evaluate(source, context, name) {
  const js = ts.transpileModule(source, { compilerOptions: { module: ts.ModuleKind.CommonJS, target: ts.ScriptTarget.ES2022 } }).outputText
  const runtime = vm.createContext(context)
  vm.runInContext(js, runtime)
  return runtime[name]
}

function service(local) {
  const calls = []
  const module = { exports: {} }
  evaluate(readFileSync(new URL('./personYouAreFleeingProfile.ts', import.meta.url), 'utf8').replaceAll('import.meta.env', '({})'), {
    module, exports: module.exports,
    window: { location: { hostname: local ? 'localhost' : 'powerapps.example' } },
    fetch: async (url, init) => { calls.push({ url, init }); return { ok: true, json: async () => ({ cmps_personyouarefleeingprofileid: rowId }) } },
    require(name) {
      if (name === '@microsoft/power-apps/data') return { getClient: () => ({ executeAsync: async ({ connectorOperation: operation }) => {
        const api = schema.commondataserviceforapps.apis[operation.operationName]
        assert.ok(api)
        for (const parameter of api.parameters.filter((entry) => entry.required && entry.name !== 'connectionId')) assert.notEqual(operation.parameters[parameter.name], undefined, `Missing ${parameter.name}`)
        calls.push(operation)
        return { success: true, data: { cmps_personyouarefleeingprofileid: rowId } }
      } }) }
      if (name.includes('dataSourcesInfo')) return { dataSourcesInfo: schema }
      if (name === './auth') return { getAuthToken: () => 'test-token', ensureAuthToken: async () => 'test-token' }
      throw new Error(`Unexpected dependency: ${name}`)
    },
  })
  return { api: module.exports, calls }
}

test('OOP uses the corrected column for rendering and hydration, with unchanged required Yes/No choices', () => {
  const { api } = service(true)
  const fields = api.PERSON_YOU_ARE_FLEEING_PROFILE_FIELDS
  const field = fields.find((field) => field.label === 'Do You Currently Have an OOP?')
  assert.equal(field.field, 'cmps_doyoucurrentlyhaveanoop')
  assert.equal(field.input, 'radio')
  assert.equal(field.required, true)
  assert.deepEqual(Array.from(field.options), ['Yes', 'No'])
  assert.equal(fields.some((field) => field.field === 'cmps_doyucurrentlyhaveanoop'), false)
})

test('Additional Information uses the corrected field for form rendering and record hydration', () => {
  const { api } = service(true)
  const field = api.PERSON_YOU_ARE_FLEEING_PROFILE_FIELDS.find((field) => field.label === 'Additional Information You Want to Share')
  assert.equal(field.field, additionalInformationField)
  assert.equal(field.input, 'textarea')
  assert.equal(field.section, 'Additional History/Background Details')
  assert.equal(api.PERSON_YOU_ARE_FLEEING_PROFILE_FIELDS.some((field) => field.field === 'cmps_additonalinformationyouwanttoshare'), false)
})

for (const local of [true, false]) test(`${local ? 'local' : 'runtime'} create and update save Additional Information to the corrected column`, async () => {
  const h = service(local)
  await h.api.createPersonYouAreFleeingProfileResponse({ cmps_recordid: 'PYFP-046', [additionalInformationField]: 'New additional information' })
  await h.api.updatePersonYouAreFleeingProfileResponse(rowId, { [additionalInformationField]: 'Edited additional information' })
  const payloads = h.calls.map((call) => local ? JSON.parse(call.init.body) : call.parameters.item)
  assert.equal(payloads[0][additionalInformationField], 'New additional information')
  assert.equal(payloads[1][additionalInformationField], 'Edited additional information')
  assert.equal(payloads.some((payload) => Object.hasOwn(payload, 'cmps_additonalinformationyouwanttoshare')), false)
})

test('the actual field filter includes Photo for Yes, No and unanswered OOP; Photo stays optional', () => {
  const { api } = service(true)
  const fieldsStart = editor.indexOf('PERSON_YOU_ARE_FLEEING_PROFILE_FIELDS')
  const filter = editor.slice(fieldsStart, editor.indexOf('.map((fieldDef)', fieldsStart))
  const photo = api.PERSON_YOU_ARE_FLEEING_PROFILE_FIELDS.find((field) => field.field === 'cmps_fileid1')
  assert.equal(photo.input, 'file')
  assert.ok(!photo.required)
  for (const answer of ['Yes', 'No', '']) {
    const visible = evaluate(`globalThis.visible = ${filter}`, {
      PERSON_YOU_ARE_FLEEING_PROFILE_FIELDS: api.PERSON_YOU_ARE_FLEEING_PROFILE_FIELDS,
      section: photo.section, activeFormSession: { values: { cmps_doyoucurrentlyhaveanoop: answer } },
      normalize: (value) => String(value || '').trim().toLowerCase(),
    }, 'visible')
    assert.ok(visible.some((field) => field.field === 'cmps_fileid1'))
  }
})

test('changing OOP to No or clearing the answer preserves both a pending photo and the existing file link', () => {
  let session = { kind: 'person-you-are-fleeing-profile', values: { cmps_doyoucurrentlyhaveanoop: 'Yes', cmps_fileid1: photoId } }
  let clears = 0
  const start = editor.indexOf('const update = (nextValue: string) => {')
  const end = editor.indexOf("if (fieldDef.input === 'html')", start)
  const update = evaluate(`${editor.slice(start, end)}\nglobalThis.applyUpdate = update`, {
    activeFormSession: session, fieldDef: { field: 'cmps_doyoucurrentlyhaveanoop' },
    setActiveFormSession: (change) => { session = change(session) },
    updatePendingFormFileUpload: () => { clears += 1 },
    normalize: (value) => String(value || '').trim().toLowerCase(),
  }, 'applyUpdate')
  update('No')
  assert.equal(session.values.cmps_doyoucurrentlyhaveanoop, 'No')
  assert.equal(session.values.cmps_fileid1, photoId)
  update('')
  assert.equal(session.values.cmps_fileid1, photoId)
  assert.equal(clears, 0)
})

for (const answer of ['Yes', 'No']) {
  test(`actual create/edit save uploads and attaches Photo when OOP is ${answer}`, async () => {
    for (const editing of [false, true]) {
      const calls = []
      let session = { kind: 'person-you-are-fleeing-profile', rowId: editing ? rowId : '', values: { cmps_doyoucurrentlyhaveanoop: answer } }
      const save = evaluate(`async function save(session) { ${saveBlock} }`, {
        getActiveRequiredFields: () => new Map(), getPendingFormFileUpload: () => ({ name: 'photo.png' }),
        createPendingCompassFile: async () => { calls.push('upload'); return photoId },
        updatePendingFormFileUpload: (...args) => { assert.equal(args[2], null); calls.push('clear-pending') },
        setActiveFormSession: (change) => { session = change(session) },
        createPersonYouAreFleeingProfileResponse: async (payload) => { assert.equal(payload.cmps_fileid1, photoId); calls.push('create') },
        updatePersonYouAreFleeingProfileResponse: async (id, payload) => { assert.equal(id, rowId); assert.equal(payload.cmps_fileid1, photoId); calls.push('update') },
        setHubActionStatus: () => {}, reportSavedForm: () => {}, retainCreatedForm: (created) => created, retainUpdatedForm: () => {},
        normalize: (value) => String(value || '').trim().toLowerCase(),
      }, 'save')
      await save(session)
      assert.equal(session.values.cmps_fileid1, photoId)
      assert.deepEqual(calls, ['upload', 'clear-pending', editing ? 'update' : 'create'])
    }
  })
}

test('a failed photo upload is retained for retry and cannot save a missing attachment', async () => {
  let cleared = false
  let saved = false
  const save = evaluate(`async function save(session) { ${saveBlock} }`, {
    getActiveRequiredFields: () => new Map(), getPendingFormFileUpload: () => ({ name: 'photo.png' }),
    createPendingCompassFile: async () => { throw new Error('Upload failed') },
    updatePendingFormFileUpload: () => { cleared = true },
    createPersonYouAreFleeingProfileResponse: async () => { saved = true },
  }, 'save')
  await assert.rejects(save({ kind: 'person-you-are-fleeing-profile', rowId: '', values: { cmps_doyoucurrentlyhaveanoop: 'No' } }), /Upload failed/)
  assert.equal(cleared, false)
  assert.equal(saved, false)
})

for (const local of [true, false]) {
  test(`${local ? 'local' : 'runtime'} create and edit bind the photo independently of the OOP choice`, async () => {
    const h = service(local)
    const values = { cmps_recordid: 'PYFP-046', cmps_fileid1: photoId, cmps_doyoucurrentlyhaveanoop: 'No', cmps_doyucurrentlyhaveanoop: 'Yes' }
    await h.api.createPersonYouAreFleeingProfileResponse(values)
    await h.api.updatePersonYouAreFleeingProfileResponse(rowId, { ...values, cmps_doyoucurrentlyhaveanoop: 'Yes' })
    const payloads = h.calls.map((call) => local ? JSON.parse(call.init.body) : call.parameters.item)
    assert.ok(payloads.every((payload) => payload['cmps_fileid1@odata.bind'] === `/cmps_compassfileses(${photoId})`))
    assert.equal(payloads[0].cmps_doyoucurrentlyhaveanoop, 125570001)
    assert.equal(payloads[1].cmps_doyoucurrentlyhaveanoop, 125570000)
    assert.ok(payloads.every((payload) => !Object.hasOwn(payload, 'cmps_doyucurrentlyhaveanoop')), 'Retired draft columns must never be submitted')
  })
}
