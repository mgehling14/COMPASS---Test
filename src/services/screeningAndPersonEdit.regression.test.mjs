import assert from 'node:assert/strict'
import { readFileSync } from 'node:fs'
import { createRequire } from 'node:module'
import test from 'node:test'
import vm from 'node:vm'
import React from 'react'
import { renderToStaticMarkup } from 'react-dom/server'
import ts from 'typescript'

const realRequire = createRequire(import.meta.url)
const id = (n) => `11111111-1111-1111-1111-${String(n).padStart(12, '0')}`
const rowId = id(1), clientId = id(2), photoId = id(3)
const app = readFileSync(new URL('../App.tsx', import.meta.url), 'utf8')
const schemaText = readFileSync(new URL('../../.power/schemas/appschemas/dataSourcesInfo.ts', import.meta.url), 'utf8')
const schema = JSON.parse(schemaText.slice(schemaText.indexOf('{'), schemaText.lastIndexOf('}') + 1))
const compilerOptions = { module: ts.ModuleKind.CommonJS, target: ts.ScriptTarget.ES2022, jsx: ts.JsxEmit.ReactJSX }
function evaluate(source, context, expression) {
  const runtime = vm.createContext({ exports: {}, ...context, require: (name) => realRequire(name) })
  vm.runInContext(ts.transpileModule(source + `\nglobalThis.answer = ${expression}`, { compilerOptions }).outputText, runtime)
  return runtime.answer
}
function functionSource(name) {
  const ast = ts.createSourceFile('App.tsx', app, ts.ScriptTarget.Latest, true, ts.ScriptKind.TSX)
  let found
  function walk(node) { if (ts.isFunctionDeclaration(node) && node.name?.text === name) found = node.getText(ast); else ts.forEachChild(node, walk) }
  walk(ast); assert.ok(found, `Missing handler ${name}`); return found
}
function services({ local = false, row = {}, localFailure = false, failure = '' } = {}) {
  const calls = [], cache = new Map()
  function load(name) {
    if (cache.has(name)) return cache.get(name)
    const module = { exports: {} }; cache.set(name, module.exports)
    const source = readFileSync(new URL(`./${name}.ts`, import.meta.url), 'utf8').replaceAll('import.meta.env', '({})')
    vm.runInNewContext(ts.transpileModule(source, { compilerOptions }).outputText, {
      module, exports: module.exports, Headers, URL, URLSearchParams,
      window: { location: { hostname: local ? 'localhost' : 'powerapps.example' } },
      fetch: async (url, init) => {
        calls.push({ url, init }); if (localFailure) return { ok: false, text: async () => 'Web API unavailable' }
        const direct = new URL(url).pathname.includes('('), data = direct ? row : { value: Array.isArray(row) ? row : [row] }
        return { ok: true, json: async () => data }
      },
      require(key) {
        if (key === '@microsoft/power-apps/data') return { getClient: () => ({ executeAsync: async ({ connectorOperation: operation }) => {
          const definition = schema.commondataserviceforapps.apis[operation.operationName]
          assert.ok(definition, `${operation.operationName} does not exist: prevents undefined.path SDK error`)
          for (const param of definition.parameters.filter((p) => p.required && p.name !== 'connectionId')) assert.notEqual(operation.parameters[param.name], undefined, `Missing ${param.name}`)
          calls.push(operation)
          if (failure) return { success: false, error: { message: failure } }
          return { success: true, data: operation.operationName === 'GetItemWithOrganization' ? row : { value: Array.isArray(row) ? row : [row] } }
        } }) }
        if (key.includes('dataSourcesInfo')) return { dataSourcesInfo: schema }
        if (key === './auth') return { ensureAuthToken: async () => 'test-token', getAuthToken: () => 'test-token' }
        if (key === './archive') return { excludeArchived: (filter) => `(${filter}) and (cmps_isarchived ne 125570000 or cmps_isarchived eq null)` }
        if (key.startsWith('./')) return load(key.slice(2))
        throw Error(key)
      },
    }, { filename: name })
    return module.exports
  }
  return { load, calls }
}

for (const local of [true, false]) test(`${local ? 'local' : 'published connector'} Shelter Screening opens existing row and hydrates dates, choices and client GUID`, async () => {
  const h = services({ local, row: { cmps_shelterscreeningid: rowId, cmps_recordid: 'SS-046', _cmps_cpid_value: clientId, cmps_screendate: '2026-10-20T00:00:00Z', cmps_program: 125570003, cmps_areyoucurrentlypregnant: 125570001 } })
  const detail = await h.load('shelterScreening').loadShelterScreeningDetailRecord(rowId, 'SS-046')
  assert.equal(detail.id, rowId); assert.equal(detail.values.cmps_cpid, clientId)
  assert.equal(detail.values.cmps_screendate, '2026-10-20'); assert.equal(detail.values.cmps_program, 'DVSTOP'); assert.equal(detail.values.cmps_areyoucurrentlypregnant, 'No')
  if (!local) { assert.equal(h.calls.length, 1); assert.equal(h.calls[0].operationName, 'GetItemWithOrganization'); assert.equal(h.calls[0].parameters.recordId, rowId) }
})
test('Shelter Screening local fallback uses the supported connector and Record ID-only opening uses escaped list filter', async () => {
  const row = { cmps_shelterscreeningid: rowId, cmps_recordid: "SS-O'Brien" }
  const fallback = services({ local: true, localFailure: true, row })
  assert.equal((await fallback.load('shelterScreening').loadShelterScreeningDetailRecord(rowId)).id, rowId)
  assert.equal(fallback.calls[1].operationName, 'GetItemWithOrganization')
  const list = services({ row })
  await list.load('shelterScreening').loadShelterScreeningDetailRecord('', "SS-O'Brien")
  assert.equal(list.calls[0].operationName, 'ListRecordsWithOrganization'); assert.match(list.calls[0].parameters.$filter, /O''Brien/)
})
test('Shelter Screening save includes required connector headers and explicitly clears a removed date', async () => {
  const h = services(), api = h.load('shelterScreening')
  await api.updateShelterScreeningResponse(rowId, { cmps_recordid: 'SS-046', cmps_screendate: '', cmps_cpid: clientId })
  const operation = h.calls[0]
  assert.equal(operation.operationName, 'UpdateRecordWithOrganization'); assert.equal(operation.parameters.recordId, rowId)
  assert.equal(operation.parameters.item.cmps_screendate, null)
  assert.equal(operation.parameters.item['cmps_cpid@odata.bind'], `/cmps_clientprofiles(${clientId})`)
})

const personRow = { cmps_personyouarefleeingprofileid: rowId, cmps_recordid: 'PYFP-046', _cmps_cpid_value: clientId, _cmps_fileid1_value: photoId,
  cmps_profilecompletiondate: '2026-10-20T00:00:00Z', cmps_dateofbirth: '1985-01-02T00:00:00Z', cmps_raceethnicity: 125570001, cmps_doyoucurrentlyhaveanoop: 125570001,
  cmps_fullnameofpersonyouarefleeing: 'Existing Person', cmps_additionalinformationyouwanttoshare: 'Existing notes', cmps_age: 41 }
for (const local of [true, false]) test(`${local ? 'local' : 'published connector'} Person You Are Fleeing editor scopes to client and preserves photos, dates, notes and choices on load/save`, async () => {
  const h = services({ local, row: personRow }), detail = await h.load('personFleeingRecord').loadPersonFleeingRecord(rowId, clientId)
  assert.equal(detail.id, rowId); assert.equal(detail.recordId, 'PYFP-046')
  assert.equal(detail.values.cmps_cpid, clientId); assert.equal(detail.values.cmps_fileid1, photoId)
  assert.equal(detail.values.cmps_profilecompletiondate, '2026-10-20'); assert.equal(detail.values.cmps_dateofbirth, '1985-01-02')
  assert.equal(detail.values.cmps_raceethnicity, 'Black/African American'); assert.equal(detail.values.cmps_doyoucurrentlyhaveanoop, 'No')
  assert.equal(detail.values.cmps_additionalinformationyouwanttoshare, 'Existing notes')
  const query = local ? Object.fromEntries(new URL(h.calls[0].url).searchParams) : h.calls[0].parameters
  assert.ok(query.$filter.includes(clientId)); assert.ok(query.$filter.includes(rowId)); assert.ok(query.$filter.includes('cmps_isarchived ne 125570000'))
  assert.ok(query.$select.includes('_cmps_fileid1_value')); assert.ok(!query.$select.includes('person-fleeing-oop-header'))
  await h.load('personYouAreFleeingProfile').updatePersonYouAreFleeingProfileResponse(detail.id, detail.values)
  const update = h.calls.at(-1), payload = local ? JSON.parse(update.init.body) : update.parameters.item
  assert.equal(payload['cmps_fileid1@odata.bind'], `/cmps_compassfileses(${photoId})`)
  assert.equal(payload['cmps_cpid@odata.bind'], `/cmps_clientprofiles(${clientId})`)
  assert.equal(payload.cmps_raceethnicity, 125570001); assert.equal(payload.cmps_recordid, 'PYFP-046')
})
for (const local of [true, false]) test(`${local ? 'local' : 'connector'} Person edit refuses foreign, archived, missing, duplicate and invalid records`, async () => {
  for (const row of [{ ...personRow, _cmps_cpid_value: id(9) }, { ...personRow, cmps_isarchived: 125570000 }, [], [personRow, personRow]]) {
    const h = services({ local, row }); await assert.rejects(h.load('personFleeingRecord').loadPersonFleeingRecord(rowId, clientId), /not found|archived|does not belong/)
  }
  const h = services({ local, row: personRow }); await assert.rejects(h.load('personFleeingRecord').loadPersonFleeingRecord('PYFP-046', clientId), /valid record ID/); assert.equal(h.calls.length, 0)
})

function permissionContext(overrides = {}) {
  return { isUserPreview: false, roleProfilesLoading: false, selectedHub: { id: 'autumn-house' }, canAccessRoleAdmin: false,
    roleProfiles: [{ roleName: 'Autumn House Staff', entries: [{ formName: 'Person You Are Fleeing Profile', permissions: { edit: true } }] }],
    hubMatchesRole: (hub, role) => hub.id === 'autumn-house' && role.startsWith('Autumn House'), ...overrides }
}
test('Person edit requires matching program role Edit permission; View, Search, Create and another program grant no edit access', () => {
  const source = functionSource('getClientLinkedFormKey') + '\n' + functionSource('canEditClientLinkedForm')
  const check = (context) => evaluate(source, { normalize: (s) => s.toLowerCase().trim(), ...context }, "canEditClientLinkedForm('person-you-are-fleeing')")
  assert.equal(check(permissionContext()), true)
  for (const override of [{ isUserPreview: true }, { roleProfilesLoading: true }, { selectedHub: null }, { roleProfiles: [{ roleName: 'Other Program Staff', entries: [{ formName: 'Person You Are Fleeing Profile', permissions: { edit: true } }] }] }, { roleProfiles: [{ roleName: 'Autumn House Staff', entries: [{ formName: 'Person You Are Fleeing Profile', permissions: { view: true, create: true, search: true } }] }] }]) assert.equal(check(permissionContext(override)), false)
  assert.equal(check(permissionContext({ canAccessRoleAdmin: true, roleProfiles: [] })), true)
})
test('linked-record table renders Edit only for authorized Person records; button shares existing action cell without layout changes', () => {
  for (const allowed of [true, false]) {
    const render = evaluate(functionSource('renderClientLinkedRecordList'), {
      getClientLinkedFormKey: () => 'person-you-are-fleeing', canReadClientLinkedForm: () => true, canEditClientLinkedForm: () => allowed,
      canViewClientLinkedForm: () => allowed,
      renderClientRecordActions: () => allowed ? React.createElement(React.Fragment, null, React.createElement('button', null, 'View'), React.createElement('button', null, 'Edit')) : null,
      renderClientConsentRecordView: () => null,
      clientLinkedRecords: { 'person-you-are-fleeing': [{ id: rowId, recordId: 'PYFP-046' }] }, clientLinkedRecordsLoading: false, clientLinkedRecordsClientId: clientId,
      selectedDetailRecord: { id: clientId }, clientLinkedRecordsError: {}, CLIENT_LINKED_RECORD_SOURCES: { 'person-you-are-fleeing': { tableAlias: 'cmps_personyouarefleeingprofiles' } },
      canAccessRoleAdmin: false, personFleeingEdit: null, clientConsentView: null, renderArchiveRecordButton: () => null,
      SortableRecordTable: ({ children, ...props }) => React.createElement('table', props, children),
    }, 'renderClientLinkedRecordList')
    const html = renderToStaticMarkup(render('Person You Are Fleeing Profile'))
    assert.equal(html.includes('>Edit</button>'), allowed); assert.ok(html.includes('PYFP-046')); assert.ok(!html.includes('Start Form'))
  }
})
test('actual Person edit handler opens existing session with the original GUID; ignores stale loads when switching clients', async () => {
  for (const stale of [false, true]) {
    const request = { current: 0 }; let session = null, navigated = false
    const edit = evaluate(functionSource('editPersonFleeingRecord'), {
      selectedHub: { id: 'autumn-house' }, selectedDetailRecord: { id: clientId }, canEditClientLinkedForm: () => true,
      clientConsentRequest: request, setClientConsentView() {}, setPersonFleeingEdit() {},
      loadPersonFleeingRecord: async (id, parent) => { assert.equal(id, rowId); assert.equal(parent, clientId); if (stale) request.current++; return { id: rowId, recordId: 'PYFP-046', values: { cmps_fileid1: photoId } } },
      rememberFormReturnState() {}, setActiveFormError() {}, setActiveFormSession: (value) => { session = value },
      PERSON_YOU_ARE_FLEEING_PROFILES_TABLE_ALIAS: 'cmps_personyouarefleeingprofiles', setSelectedHubPages: () => { navigated = true }, setHubActionStatus() {}, scrollToTopOfPage() {},
    }, 'editPersonFleeingRecord')
    await edit({ id: rowId, recordId: 'PYFP-046' })
    assert.equal(navigated, !stale)
    if (stale) assert.equal(session, null)
    else { assert.equal(session.rowId, rowId); assert.equal(session.kind, 'person-you-are-fleeing-profile'); assert.equal(session.values.cmps_fileid1, photoId) }
  }
})
test('real shared View/Edit buttons honor permissions and dispatch to each existing editor', () => {
  const kinds = ['release-of-information', 'acknowledgement-and-consent', 'child-shelter-intake', 'medical-consent', 'shelter-program-guidelines', 'animal-agreement', 'employment-and-benefits', 'person-you-are-fleeing', 'pet-companion-intake', 'terms-and-conditions-of-service-animals', 'child-assessment', 'financial-assistance', 'shelter-screening', 'voca-form']
  for (const kind of kinds) for (const [view, edit] of [[true, true], [true, false], [false, true], [false, false]]) {
    const calls = []
    const render = evaluate(functionSource('renderClientRecordActions'), {
      clientConsentView: null, personFleeingEdit: null, canViewClientLinkedForm: () => view, canEditClientLinkedForm: () => edit,
      openClientConsentForm: (key, row) => calls.push(['view', key, row]),
      editClientConsentForm: (key, row) => calls.push(['edit', key, row]),
      editPersonFleeingRecord: (row) => calls.push(['edit', kind, row]),
      editShelterScreeningRecord: (row) => calls.push(['edit', kind, row]),
    }, 'renderClientRecordActions')
    const node = render(kind, { id: rowId, recordId: 'EXISTING-046' })
    const buttons = React.Children.toArray(node.props.children)
    assert.deepEqual(buttons.map((button) => button.props.children), [...(view ? ['View'] : []), ...(edit ? ['Edit'] : [])])
    for (const button of buttons) button.props.onClick()
    for (const [action, key, row] of calls) { assert.ok(['view', 'edit'].includes(action)); assert.equal(key, kind); assert.equal(row.id, rowId); assert.equal(row.recordId, 'EXISTING-046') }
  }
})

test('all detail loaders use supported connector read operations', () => {
  for (const file of ['adultAssessment', 'childSafetyPlan', 'clientProfile', 'electronicDocument', 'event', 'focusPlan', 'healthAndWellnessQuestionnaire', 'initialSafetyPlan', 'programEnrollment', 'shelterScreening']) {
    const source = readFileSync(new URL('./' + file + '.ts', import.meta.url), 'utf8')
    assert.ok(!source.includes("'GetRecordWithOrganization'"), file + ' must not invoke an undefined SDK operation')
    assert.ok(source.includes("'GetItemWithOrganization'"), file + ' uses the generated connector schema')
  }
})
test('shared record view disables editing and offers only Close and file viewing actions', () => {
  const fields = [
    { field: 'cmps_name', label: 'Name', input: 'text', section: 'Main' },
    { field: 'cmps_date', label: 'Date', input: 'date', section: 'Main' },
    { field: 'cmps_status', label: 'Status', input: 'radio', options: ['Yes', 'No'], section: 'Main' },
    { field: 'cmps_choices', label: 'Choices', input: 'checkbox-group', options: ['One', 'Two'], section: 'Main' },
    { field: 'cmps_notes', label: 'Notes', input: 'textarea', section: 'Main' },
    { field: 'cmps_fileid1', label: 'Photo', input: 'file', section: 'Main' },
  ]
  const render = evaluate(functionSource('ReadOnlyFormSections') + '\n' + functionSource('renderClientConsentRecordView'), {
    normalize: (s) => String(s || '').trim().toLowerCase(), parseMultiValue: (s) => String(s || '').split(','),
    FormInput: (props) => React.createElement('input', props), getClientConsentFormFields: () => fields,
    selectedDetailRecord: { id: clientId }, canViewClientLinkedForm: () => true, canEditClientLinkedForm: () => false,
    CLIENT_RECORD_LABELS: { 'person-you-are-fleeing': 'Person You Are Fleeing Profile' },
    clientConsentView: { kind: 'person-you-are-fleeing', clientId, detail: { id: rowId, recordId: 'PYFP-046',
      values: { cmps_name: 'Existing Person', cmps_date: '2026-10-20', cmps_status: 'Yes', cmps_choices: 'One, Two', cmps_notes: 'Original notes', cmps_fileid1: photoId, cmps_doyoucurrentlyhaveanoop: 'No' } } },
    clientConsentRequest: { current: 0 }, setClientConsentView: () => {}, openCompassFileViewer: () => {},
  }, 'renderClientConsentRecordView')
  const html = renderToStaticMarkup(render('person-you-are-fleeing'))
  assert.ok(html.includes('PYFP-046')); assert.ok(html.includes('Existing Person')); assert.ok(html.includes('Original notes'))
  assert.ok(html.includes('View attached file'), 'Photo remains visible when OOP is No')
  assert.ok(html.includes('Close Record')); assert.ok(!html.includes('Save Form'))
  for (const control of html.matchAll(/<(?:input|textarea|select)\b[^>]*>/g)) assert.ok(control[0].includes('disabled'), control[0])
})

test('Household View loads only the selected client household and active members without opening an editor', async () => {
  let view, reads = 0
  const context = {
    selectedDetailRecord: { id: clientId }, canAccessClientFormAction: () => true, householdsForClient: [{ id: rowId }],
    clientConsentRequest: { current: 0 }, setHouseholdView: (value) => { view = value },
    openRecordFormView: () => {},
    normalize: (s) => String(s).toLowerCase(), normalizeGuidText: (s) => String(s).toLowerCase(),
    loadHouseholdDetailRecord: async (requested) => { reads++; assert.equal(requested, rowId); return { id: rowId, recordId: 'HH-046' } },
    listHouseholdMembersForHousehold: async (requested) => { reads++; assert.equal(requested, rowId); return [{ id: id(4), status: 'Active' }, { id: id(5), status: 'Inactive' }] },
  }
  const open = evaluate(functionSource('viewHouseholdRecord'), context, 'viewHouseholdRecord')
  await open({ id: rowId, recordId: 'HH-046' })
  assert.equal(view.loading, false); assert.equal(view.detail.id, rowId); assert.equal(view.members.length, 1); assert.equal(reads, 2)
  await open({ id: id(9), recordId: 'HH-999' })
  assert.equal(reads, 2, 'Unrelated households cannot be opened')
})
