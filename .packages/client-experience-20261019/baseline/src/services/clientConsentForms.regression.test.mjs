import assert from 'node:assert/strict'
import { readFileSync } from 'node:fs'
import test from 'node:test'
import vm from 'node:vm'
import ts from 'typescript'

const clientId = '11111111-1111-1111-1111-111111111111'
const rowId = '22222222-2222-2222-2222-222222222222'
const enrollmentId = '33333333-3333-3333-3333-333333333333'
const schemaText = readFileSync(new URL('../../.power/schemas/appschemas/dataSourcesInfo.ts', import.meta.url), 'utf8')
const schema = JSON.parse(schemaText.slice(schemaText.indexOf('{'), schemaText.lastIndexOf('}') + 1))
const appText = readFileSync(new URL('../App.tsx', import.meta.url), 'utf8')
const forms = [
  { kind: 'release-of-information', name: 'A New Leaf Limited Release of Information', prefix: 'ROI', table: 'cmps_anewleaflimitedreleaseofinformations', primary: 'cmps_anewleaflimitedreleaseofinformationid', file: './releaseOfInformation.ts', create: 'createReleaseOfInformationResponse' },
  { kind: 'acknowledgement-and-consent', name: 'Acknowledgement & Consent Form', prefix: 'ACC', table: 'cmps_acknowledgementandconsentforms', primary: 'cmps_acknowledgementandconsentformid', file: './acknowledgementAndConsent.ts', create: 'createAcknowledgementAndConsentResponse' },
]

function harness({ local, respond = () => ({ value: [] }), fail } = {}) {
  const calls = []
  const cache = new Map()
  function load(file) {
    if (cache.has(file)) return cache.get(file)
    const source = readFileSync(new URL(file, import.meta.url), 'utf8').replaceAll('import.meta.env', '({})')
    const js = ts.transpileModule(source, { compilerOptions: { module: ts.ModuleKind.CommonJS, target: ts.ScriptTarget.ES2022 } }).outputText
    const module = { exports: {} }
    cache.set(file, module.exports)
    vm.runInNewContext(js, {
      module, exports: module.exports, URL, URLSearchParams, Headers,
      window: { location: { hostname: local ? 'localhost' : 'powerapps.example' } },
      fetch: async (url, init) => {
        calls.push({ url, init })
        if (fail) return { ok: false, text: async () => fail }
        return { ok: true, headers: new Headers(), json: async () => respond({ url, init }) }
      },
      require(name) {
        if (name === '../../power.config.json') return JSON.parse(readFileSync(new URL(name, import.meta.url), 'utf8'))
        if (name === '@microsoft/power-apps/data') return { getClient: () => ({ executeAsync: async ({ connectorOperation: operation }) => {
          calls.push(operation)
          const api = schema.commondataserviceforapps.apis[operation.operationName]
          assert.ok(api, `Unsupported connector operation: ${operation.operationName}`)
          for (const parameter of api.parameters.filter((entry) => entry.required && entry.name !== 'connectionId')) assert.notEqual(operation.parameters[parameter.name], undefined)
          return fail ? { success: false, error: { message: fail } } : { success: true, data: respond(operation) }
        } }) }
        if (name.includes('dataSourcesInfo')) return { dataSourcesInfo: schema }
        if (name === './auth') return { ensureAuthToken: async () => 'test-token', getAuthToken: () => 'test-token' }
        if (name === './archive') return { excludeArchived: (filter) => `(${filter}) and (cmps_isarchived ne 125570000 or cmps_isarchived eq null)` }
        if (name.startsWith('./')) return load(`${name}.ts`)
        throw new Error(`Unexpected dependency: ${name}`)
      },
    }, { filename: file })
    return module.exports
  }
  return { load, calls }
}

function appFunction(name, context) {
  const source = ts.createSourceFile('App.tsx', appText, ts.ScriptTarget.Latest, true, ts.ScriptKind.TSX)
  let found
  function visit(node) {
    if (ts.isFunctionDeclaration(node) && node.name?.text === name) found = node
    else ts.forEachChild(node, visit)
  }
  visit(source)
  assert.ok(found, `Missing app function: ${name}`)
  const js = ts.transpileModule(found.getText(source), { compilerOptions: { target: ts.ScriptTarget.ES2022, module: ts.ModuleKind.CommonJS } }).outputText
  const runtime = vm.createContext(context)
  vm.runInContext(js, runtime)
  return runtime[name]
}

for (const form of forms) {
  test(`${form.name}: actual Start Form navigates to the editor with current record ID and client linkage`, async () => {
    const state = { pages: { hub: 'search' } }
    const start = appFunction('startFormResponse', {
      normalize: (text) => String(text || '').trim().toLowerCase(),
      selectedDetailRecord: { id: clientId }, selectedHub: { id: 'hub' },
      RELEASE_OF_INFORMATION_TABLE_ALIAS: forms[0].table, ACKNOWLEDGEMENT_AND_CONSENT_TABLE_ALIAS: forms[1].table,
      rememberFormReturnState: () => {},
      setActiveFormError: (value) => { state.error = value },
      setHubActionStatus: (value) => { state.status = value },
      generateAppRecordId: async (table, prefix) => { assert.equal(table, form.table); assert.equal(prefix, form.prefix); return `${prefix}-046` },
      setActiveFormSession: (value) => { state.session = value },
      setSelectedHubPages: (update) => { state.pages = update(state.pages) },
      scrollToTopOfPage: () => { state.scrolled = true },
    })
    await start(form.name)
    assert.equal(state.pages.hub, 'forms')
    assert.equal(state.session.kind, form.kind)
    assert.equal(state.session.values.cmps_cpid, clientId)
    assert.equal(state.session.values.cmps_recordid, `${form.prefix}-046`)
    assert.equal(state.session.rowId, '')
    assert.equal(state.scrolled, true)
  })

  test(`${form.name}: ID lookup failure is visible instead of an unhandled Start Form rejection`, async () => {
    let status = ''
    const start = appFunction('startFormResponse', {
      normalize: (text) => String(text || '').trim().toLowerCase(), selectedDetailRecord: { id: clientId },
      RELEASE_OF_INFORMATION_TABLE_ALIAS: forms[0].table, ACKNOWLEDGEMENT_AND_CONSENT_TABLE_ALIAS: forms[1].table,
      setActiveFormError: () => {}, setHubActionStatus: (value) => { status = value }, rememberFormReturnState: () => {},
      generateAppRecordId: async () => { throw new Error('Read forbidden') },
    })
    await start(form.name)
    assert.match(status, /Unable to start.*Read forbidden/)
  })

  for (const local of [true, false]) {
    test(`${local ? 'local' : 'runtime'} ${form.name}: Open loads only its linked active row and decodes choices/dates`, async () => {
      const row = {
        [form.primary]: rowId, _cmps_cpid_value: clientId, _cmps_peid_value: enrollmentId, cmps_recordid: `${form.prefix}-046`,
        cmps_method: '125570000,125570004', cmps_programs1: '125570000,125570006', cmps_programs: '125570004', cmps_expirationdateandtime: '2026-10-20T12:30:00Z',
        cmps_doestheresidentrefusetosign: 125570001, cmps_haveyoureceivedacopyoftheclientrights: 125570000, cmps_acknowledgementcompletiondate: '2026-10-05',
      }
      const h = harness({ local, respond: () => ({ value: [row] }) })
      const detail = await h.load('./clientConsentForms.ts').loadClientConsentFormRecord(form.kind, rowId, clientId)
      assert.equal(detail.id, rowId)
      assert.equal(detail.recordId, `${form.prefix}-046`)
      assert.equal(detail.values.cmps_cpid, clientId)
      if (form.prefix === 'ROI') {
        assert.equal(detail.values.cmps_method, 'In Person, By E-mail')
        assert.equal(detail.values.cmps_programs1, 'Autumn House, Other')
        assert.equal(Object.hasOwn(detail.values, 'cmps_programs'), false)
        assert.equal(detail.values.cmps_expirationdateandtime, '2026-10-20T12:30:00Z')
      } else {
        assert.equal(detail.values.cmps_peid, enrollmentId)
        assert.equal(detail.values.cmps_doestheresidentrefusetosign, 'No')
        assert.equal(detail.values.cmps_haveyoureceivedacopyoftheclientrights, 'Yes, I have received a copy.')
        assert.equal(detail.values.cmps_acknowledgementcompletiondate, '2026-10-05')
      }
      const call = h.calls[0]
      const parameters = local ? Object.fromEntries(new URL(call.url).searchParams) : call.parameters
      assert.match(parameters.$filter, new RegExp(`${form.primary} eq ${rowId}`))
      assert.ok(parameters.$filter.includes(`_cmps_cpid_value eq ${clientId}`))
      assert.ok(parameters.$filter.includes('cmps_isarchived ne 125570000'))
      assert.ok(parameters.$select.includes('cmps_recordid'))
      if (form.prefix === 'ROI') {
        assert.ok(parameters.$select.split(',').includes('cmps_programs1'))
        assert.ok(!parameters.$select.split(',').includes('cmps_programs'))
      }
      assert.ok(!parameters.$select.includes('ack-intro'))
      if (!local) assert.equal(call.operationName, 'ListRecordsWithOrganization')
    })

    test(`${local ? 'local' : 'runtime'} ${form.name}: save keeps its generated display ID and client/enrollment lookup`, async () => {
      const h = harness({ local, respond: () => ({ [form.primary]: rowId }) })
      await h.load(form.file)[form.create]({ cmps_recordid: `${form.prefix}-046`, cmps_cpid: clientId, ...(form.prefix === 'ACC' ? { cmps_peid: enrollmentId, cmps_doestheresidentrefusetosign: 'No' } : { cmps_method: 'In Person, By E-mail', cmps_programs1: 'Autumn House, Other', cmps_programs: 'Faith House' }) })
      const call = h.calls[0]
      const payload = local ? JSON.parse(call.init.body) : call.parameters.item
      assert.equal(payload.cmps_recordid, `${form.prefix}-046`)
      assert.equal(payload['cmps_cpid@odata.bind'], `/cmps_clientprofiles(${clientId})`)
      assert.equal(payload.cmps_cpid, undefined)
      if (form.prefix === 'ACC') assert.equal(payload['cmps_peid@odata.bind'], `/cmps_programenrollment1s(${enrollmentId})`)
      else {
        assert.equal(payload.cmps_programs1, '125570000,125570006')
        assert.equal(Object.hasOwn(payload, 'cmps_programs'), false)
      }
    })
  }
}

for (const local of [true, false]) {
  test(`${local ? 'local' : 'runtime'} Release of Information updates the saved row without another POST`, async () => {
    const h = harness({ local })
    await h.load('./releaseOfInformation.ts').updateReleaseOfInformationResponse(rowId, { cmps_recordid: 'ROI-046', cmps_cpid: clientId, cmps_method: 'In Person, By E-mail', cmps_programs1: 'Autumn House', cmps_modifiedby: 'Staff' })
    assert.equal(h.calls.length, 1)
    const call = h.calls[0], payload = local ? JSON.parse(call.init.body) : call.parameters.item
    if (local) { assert.equal(call.init.method, 'PATCH'); assert.ok(call.url.endsWith(`(${rowId})`)) }
    else { assert.equal(call.operationName, 'UpdateRecordWithOrganization'); assert.equal(call.parameters.recordId, rowId) }
    assert.equal(payload.cmps_recordid, 'ROI-046'); assert.equal(payload.cmps_modifiedby, 'Staff')
    assert.equal(payload['cmps_cpid@odata.bind'], `/cmps_clientprofiles(${clientId})`)
    assert.equal(payload.cmps_programs1, '125570000'); assert.equal(payload.cmps_method, '125570000,125570004')
    await assert.rejects(h.load('./releaseOfInformation.ts').updateReleaseOfInformationResponse('ROI-046', {}), /valid/)
    assert.equal(h.calls.length, 1)
  })
  test(`${local ? 'local' : 'runtime'} Open rejects another client's row, archived rows, missing rows and malformed responses`, async () => {
    for (const payload of [
      { value: [{ cmps_anewleaflimitedreleaseofinformationid: rowId, _cmps_cpid_value: enrollmentId }] },
      { value: [{ cmps_anewleaflimitedreleaseofinformationid: rowId, _cmps_cpid_value: clientId, cmps_isarchived: 125570000 }] },
      { value: [] }, {},
    ]) {
      const h = harness({ local, respond: () => payload })
      await assert.rejects(h.load('./clientConsentForms.ts').loadClientConsentFormRecord('release-of-information', rowId, clientId), /not found|did not return/)
      assert.equal(h.calls.length, 1, 'No unscoped fallback or write is allowed')
    }
    const denied = harness({ local, fail: 'Read forbidden' })
    await assert.rejects(denied.load('./clientConsentForms.ts').loadClientConsentFormRecord('release-of-information', rowId, clientId), /Read forbidden/)
    const badId = harness({ local })
    await assert.rejects(badId.load('./clientConsentForms.ts').loadClientConsentFormRecord('release-of-information', 'ROI-046', clientId), /invalid/)
    assert.equal(badId.calls.length, 0)
  })

  test(`${local ? 'local' : 'runtime'} Pet Companion Intake create and edit use cmps_dosages and never send the retired column`, async () => {
    const h = harness({ local, respond: () => ({ cmps_petcompanionintakeid: rowId }) })
    const api = h.load('./petCompanionIntake.ts')
    const values = { cmps_recordid: 'PCI-046', cmps_cpid: clientId, cmps_istheanimalcurrentlyonanymedications: 'Yes', cmps_numberofmedicationstolist: '1', cmps_medications: 'Medication A', cmps_reasons: 'Reason A', cmps_dosages: '5 mg', cmps_doseages: 'retired', cmps_frequencies: 'Daily' }
    await api.createPetCompanionIntakeResponse(values)
    await api.updatePetCompanionIntakeResponse(rowId, { ...values, cmps_dosages: '10 mg' })
    await api.updatePetCompanionIntakeResponse(rowId, { ...values, cmps_istheanimalcurrentlyonanymedications: 'No' })
    const payloads = h.calls.map((call) => local ? JSON.parse(call.init.body) : call.parameters.item)
    assert.equal(payloads[0].cmps_dosages, '5 mg')
    assert.equal(payloads[1].cmps_dosages, '10 mg')
    assert.equal(payloads[2].cmps_dosages, undefined)
    assert.ok(payloads.every((payload) => !('cmps_doseages' in payload)))
  })
}

test('Overview alone excludes Event; standalone Forms and other client sections retain their existing behavior', () => {
  assert.match(appText, /selectedClientSection === 'overview'\s*\? canonicalClientForms\.filter\([^\n]+!isEventForm\(form\.formName\)/)
  assert.match(appText, /hubFormAccess\.filter\([^\n]+isEventForm\(form\.formName\)/)
  assert.match(appText, /name: 'Event', section: 'service-delivery'/)
  assert.ok(!appText.includes('cmps_doseages'))
  assert.ok(appText.includes("{ field: 'cmps_dosages', label: 'Dosage' }"))
  assert.match(appText, /onClick=\{\(\) => \{ void openClientConsentForm\(key as ClientConsentFormKind, row\)/)
  const save = appText.slice(appText.indexOf("if (session.kind === 'release-of-information')", appText.indexOf('async function saveActiveForm')))
  assert.match(save.slice(0, save.indexOf('reportSavedForm()')), /setClientLookupRefreshSignal/)
})

test('Release of Information Programs mapping and Other validation use only cmps_programs1', () => {
  const fields = harness().load('./releaseOfInformation.ts').RELEASE_OF_INFORMATION_FIELDS
  const programs = fields.find((field) => field.label === 'Programs')
  assert.equal(programs.field, 'cmps_programs1')
  assert.equal(programs.input, 'checkbox-group')
  assert.deepEqual(Array.from(programs.options), ['Autumn House', 'DV Outreach', 'CAAFA Shelter', 'DVSTOP', 'Faith House', 'REACH Center', 'Other'])
  assert.equal(fields.find((field) => field.field === 'cmps_programsother').visibleWhen.field, 'cmps_programs1')
  assert.doesNotMatch(appText, /\bcmps_programs\b/)
  assert.match(appText, /beforeField: 'cmps_programs1'/)
  const marker = "} else if (session.kind === 'release-of-information') {"
  const start = appText.indexOf(marker), end = appText.indexOf("} else if (session.kind === 'voca-form') {", start)
  assert.ok(start >= 0 && end > start)
  const branch = appText.slice(start + marker.length, end)
  const requiredFor = (selected, retired = '') => {
    const required = new Map()
    vm.runInNewContext(branch, {
      session: { values: { cmps_programs1: selected, cmps_programs: retired } },
      parseMultiValue: (value) => value.split(',').map((item) => item.trim()).filter(Boolean),
      normalize: (value) => String(value || '').trim().toLowerCase(), add: (field, label) => required.set(field, label),
    })
    return required
  }
  assert.equal(requiredFor('Autumn House, Other').has('cmps_programsother'), true)
  assert.equal(requiredFor('Autumn House', 'Other').has('cmps_programsother'), false)
  assert.match(appText, /const hasProgram = \(value: string\) => parseMultiValue\(String\(payload.cmps_programs1/)
})

test('late Open responses cannot replace a newer record or a different client view', async () => {
  const request = { current: 0 }
  const pending = []
  let view
  const open = appFunction('openClientConsentForm', {
    canReadClientLinkedForm: () => true, programEnrollmentsClientId: clientId, programEnrollmentsForClient: [],
    selectedDetailRecord: { id: clientId }, clientConsentRequest: request,
    setClientConsentView: (value) => { view = value },
    loadClientConsentFormRecord: () => new Promise((resolve) => pending.push(resolve)),
  })
  const older = open('release-of-information', { id: rowId })
  const newer = open('acknowledgement-and-consent', { id: enrollmentId })
  pending[1]({ id: enrollmentId, recordId: 'ACC-046', values: {} })
  await newer
  pending[0]({ id: rowId, recordId: 'ROI-046', values: {} })
  await older
  assert.equal(view.detail.recordId, 'ACC-046')
  const profileChanged = open('release-of-information', { id: rowId })
  request.current += 1
  view = null
  pending[2]({ id: rowId, recordId: 'ROI-046', values: {} })
  await profileChanged
  assert.equal(view, null)
})
