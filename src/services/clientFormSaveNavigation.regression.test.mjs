import assert from 'node:assert/strict'
import { readFileSync } from 'node:fs'
import test from 'node:test'
import vm from 'node:vm'
import ts from 'typescript'

const app = readFileSync(new URL('../App.tsx', import.meta.url), 'utf8')
const tree = ts.createSourceFile('App.tsx', app, ts.ScriptTarget.Latest, true, ts.ScriptKind.TSX)
const names = ['localDateValue', 'rememberFormReturnState', 'finishActiveFormSession', 'saveActiveForm', 'chooseRecordSaveDestination', 'canOpenSavedClient', 'canAccessRoleAdminForSave', 'saveFunderAdminEditor', 'canStartAnotherService', 'startAnotherService']
const snippets = []
function visit(node) {
  if (ts.isFunctionDeclaration(node) && names.includes(node.name?.text)) snippets.push(node.getText(tree))
  ts.forEachChild(node, visit)
}
visit(tree); assert.equal(snippets.length, names.length)
const shared = ['recordAudit.ts', 'recordSaveResult.ts'].map((name) => readFileSync(new URL(name, import.meta.url), 'utf8').replace(/\bexport\s+/g, '')).join('\n')
const bedTree = ts.createSourceFile('beds.ts', readFileSync(new URL('beds.ts', import.meta.url), 'utf8'), ts.ScriptTarget.Latest, true)
const bedHelpers = bedTree.statements.filter((node) => ts.isFunctionDeclaration(node) && ['isBedCheckoutDateValid', 'isBedSelectionRequired'].includes(node.name?.text)).map((node) => node.getText(bedTree).replace(/\bexport\s+/g, '')).join('\n')
const js = ts.transpileModule(`${shared}\n${bedHelpers}\n${snippets.join('\n')}`, { compilerOptions: { target: ts.ScriptTarget.ES2022 } }).outputText
const id = (n) => `11111111-1111-1111-1111-${String(n).padStart(12, '0')}`
const hubId = 'sv', client = { id: id(1), recordId: 'CP-046', values: { cmps_name: 'John', cmps_lastname: 'Smith' } }
const normalize = (value) => String(value || '').trim().toLowerCase()
const saveText = snippets.find((text) => text.startsWith('async function saveActiveForm'))
const formKinds = [...new Set([...saveText.matchAll(/session.kind === '([^']+)'/g)].map((m) => m[1]).concat('client-profile'))]
assert.ok(formKinds.length >= 28)

function harness(kind, { editing = false, failure = false, validation = '', origin = 'client', preview = false, createAllowed = true, editAllowed = true } = {}) {
  const calls = []
  const context = {
    canCreateForm: () => createAllowed,
    canEditClientLinkedForm: () => editAllowed,
    canAccessClientFormAction: (_name, action) => action === 'edit' ? editAllowed : true,
    isUserPreview: preview, USER_PREVIEW_READ_ONLY_MESSAGE: 'Preview cannot save', user: { name: 'Staff', rawRole: 'IT Admin' },
    roleProfiles: [], selectedHub: { id: hubId }, selectedHubPage: 'search', selectedAppNav: 'programs',
    HUB_DEFINITIONS: [{ id: hubId }, { id: 'autumn-house' }],
    activeSearchDetailByHub: { [hubId]: client }, selectedDetailRecord: client, selectedClientSectionByHub: { [hubId]: 'overview' },
    selectedHubPages: { [hubId]: 'search' }, selectedSearchFormByHub: {},
    selectedProgramEnrollmentDetail: { id: id(2) }, selectedServicesDetail: { id: id(3) },
    selectedBedEnrollmentDetail: null, selectedAdultAssessmentDetail: null, selectedChildSafetyPlanDetail: null,
    selectedFocusPlanDetail: null, selectedInitialSafetyPlanDetail: null, selectedHealthWellnessDetail: null,
    activeHelplineDetailByHub: { [hubId]: { id: id(4) } }, activeEventDetailByHub: {},
    showFullDetailByHub: { [hubId]: true }, formReturnState: null, activeFormSaving: false, activeFormError: '',
    clientLookupRefreshSignal: 0, eventUploadFiles: [], hubActionStatus: '', recordSaveResult: null,
    formSaveInFlight: { current: false }, pendingFormSaveConfirmation: { current: null }, pendingHouseholdHistorySaves: { current: new Map() },
    anotherServiceInFlight: { current: false },
    pendingInitialHouseholdSaves: { current: new Set() },
    pendingFunderSaveConfirmation: { current: null }, funderAdminSaveInFlight: { current: false },
    canAccessRoleAdmin: true, funderAdminExpanded: {},
    activeFormSession: { kind, formName: kind, tableAlias: `cmps_${kind.replaceAll('-', '')}s`, rowId: editing ? id(5) : '', recordId: 'TEST-046',
      values: { cmps_recordid: 'TEST-046', cmps_cpid: client.id, cmps_clientid: client.id, cmps_peid: id(2), cmps_programenrollment: id(2), cmps_checkindate: '2026-10-09', cmps_selectedbeds: id(7) } },
    getRequiredServicesMessage: () => validation, validateRequiredHelplineFields: () => validation,
    validateRequiredShelterScreeningFields: () => validation, validateRequiredEventFields: () => validation,
    validateRequiredHouseholdFields: () => validation, validateProgramEnrollment: () => validation,
    validateRequiredClientProfileFields: () => validation, getLiveRequiredMessage: () => validation,
    getFocusPlanRequiredMessage: () => validation, getActiveRequiredFields: () => new Map(),
    computeHelplineNumberOfYesAnswers: () => 0, getEventCalculatedTotals: () => ({ cmps_total: '3' }),
    getDerivedProgramEnrollmentType: () => 'Residential', householdMembersDraft: [], householdOriginalMemberRowIds: [], shelterChildAges: [],
    HEALTH_WELLNESS_FIELDS: [], INITIAL_SAFETY_PLAN_FIELDS: [], PROGRAM_ENROLLMENT_FIELD_NAME_SET: new Set(['cmps_recordid', 'cmps_clientid', 'cmps_programtype']),
    CLIENT_PROFILE_FIELD_NAME_SET: new Set(['cmps_recordid', 'cmps_clientid']), CLIENT_PROFILE_SYSTEM_MANAGED_READONLY_FIELDS: new Set(),
    programEnrollmentsForClient: [{ id: id(2), clientRowId: client.id, program: 'DVSTOP' }],
    activeProgramEnrollmentOptionsForServices: [{ value: id(2) }], activeVocaProgramEnrollmentOptions: [{ value: id(2) }], pendingVocaItems: [], activeFunderContractOptions: [],
    getPendingFormFileUpload: () => null, assignBedsToEnrollment: async () => {}, verifyBedEnrollmentDates: async () => {},
    listSelectableBedsForEnrollment: async () => ({ beds: [], assignedBedIds: [] }),
    createInitialHouseholdHistoryForClient: async () => {}, findClientProfileDuplicate: async () => null,
    resolveClientProfileRowIdByRecordId: async () => '', confirmSavedRecordId: async () => id(5),
    loadClientProfileDetailRecord: async (rowId) => { calls.push({ operation: 'open-client', rowId }); return { ...client, id: rowId } },
    loadProgramEnrollmentDetailRecord: async () => ({ id: id(2), values: { cmps_clientid: client.id } }),
    listProgramEnrollmentsForClientRecord: async () => [{ id: id(2), clientRowId: client.id, program: 'DVSTOP', serviceEndDate: '' }],
    generateAppRecordId: async () => 'SV-0479376', SERVICES_TABLE_ALIAS: 'cmps_serviceses',
    scrollToTopOfPage: () => calls.push('scroll'), normalize, normalizeGuidText: normalize,
    isGuidText: (value) => /^[a-f\d]{8}(?:-[a-f\d]{4}){3}-[a-f\d]{12}$/i.test(value),
    parseMultiValue: (value) => String(value).split(/[,;]+/).map((x) => x.trim()).filter(Boolean),
    isClientProfileForm: (name) => normalize(name) === 'client profile', hubMatchesRole: () => true,
    SaveConfirmationPendingError: class extends Error {}, FunderBalanceSyncError: class extends Error {},
    validateFunderAdminValues: () => '', FUNDER_ADMIN_TABLES: { funder: { label: 'Funder', tableAlias: 'cmps_funders' } },
  }
  for (const setter of new Set([...js.matchAll(/\b(set[A-Z]\w*)\(/g)].map((m) => m[1]))) {
    const property = setter[3].toLowerCase() + setter.slice(4)
    context[setter] = (value) => { context[property] = typeof value === 'function' ? value(context[property]) : value }
  }
  for (const operation of new Set([...saveText.matchAll(/\b((?:create|update)\w+Response)\(/g)].map((m) => m[1]))) {
    context[operation] = async (...args) => {
      calls.push({ operation, args })
      if (failure) throw new Error('Dataverse save failed')
      return operation === 'createReleaseOfInformationResponse' ? id(5) : operation.startsWith('create') ? { id: id(5), recordId: 'TEST-046' } : undefined
    }
  }
  vm.createContext(context); vm.runInContext(js, context)
  if (origin !== 'client') context.selectedHubPage = 'forms'
  context.rememberFormReturnState()
  context.selectedHubPage = 'forms'; context.selectedHubPages[hubId] = 'forms'
  return { context, calls }
}

for (const kind of formKinds) test(`${kind}: revoked Edit permission blocks an existing-record save without updating or uploading`, async () => {
  const { context, calls } = harness(kind, { editing: true, editAllowed: false })
  await context.saveActiveForm()
  assert.equal(context.recordSaveResult.status, 'failed')
  assert.match(context.activeFormError, /do not have Edit permission/)
  assert.equal(calls.some((call) => call.operation?.startsWith('create') || call.operation?.startsWith('update')), false)
})

for (const fail of [false, true]) test(`deferred save ${fail ? 'failure' : 'success'} cannot discard newer input or duplicate the request`, async () => {
  const { context: c } = harness('services', { editing: true })
  let resolve, reject, writes = 0
  const deferred = new Promise((yes, no) => { resolve = yes; reject = no })
  c.updateServicesResponse = () => { writes++; return deferred }
  c.activeFormSession.values.cmps_servicenotes = 'Posted notes'
  const running = c.saveActiveForm()
  await c.saveActiveForm(); assert.equal(writes, 1)
  c.activeFormSession = { ...c.activeFormSession, values: { ...c.activeFormSession.values, cmps_servicenotes: 'Newer queued input' } }
  if (fail) reject(Error('Deferred failure')); else resolve()
  await running
  assert.equal(c.activeFormSession.values.cmps_servicenotes, 'Newer queued input')
  assert.equal(c.activeFormSaving, false)
  c.updateServicesResponse = async () => { writes++ }
  await c.saveActiveForm(); assert.equal(writes, 2)
  assert.equal(c.recordSaveResult.status, 'saved')
})

test('a new Client Profile whose display ID already exists must not update that other profile', async () => {
  const { context: c, calls } = harness('client-profile', { editAllowed: false })
  c.resolveClientProfileRowIdByRecordId = async () => id(99)
  await c.saveActiveForm()
  assert.equal(c.recordSaveResult.status, 'failed')
  assert.match(c.activeFormError, /already exists/)
  assert.equal(c.activeFormSession.rowId, '')
  assert.equal(calls.some((call) => /^(create|update)/.test(call.operation || '')), false)
})

for (const kind of ['services', 'client-profile']) test(`late ${kind} create completion cannot replace a different open draft`, async () => {
  const { context: c } = harness(kind)
  let resolve, submitted = false
  const deferred = new Promise((yes) => { resolve = yes })
  const operation = kind === 'services' ? 'createServicesResponse' : 'createClientProfileResponse'
  c[operation] = () => { submitted = true; return deferred }
  const running = c.saveActiveForm()
  for (let i = 0; i < 12 && !submitted; i++) await Promise.resolve()
  assert.equal(submitted, true)
  c.activeFormSession = { ...c.activeFormSession, recordId: 'OTHER-DRAFT', values: { cmps_recordid: 'OTHER-DRAFT', notes: 'Keep this' } }
  resolve({ id: id(5), recordId: 'TEST-046' }); await running
  assert.equal(c.activeFormSession.recordId, 'OTHER-DRAFT')
  assert.equal(c.activeFormSession.rowId, '')
  assert.equal(c.activeFormSession.values.notes, 'Keep this')
})

for (const kind of formKinds) test(`${kind}: missing/revoked Create permission blocks a new draft save but not an existing-record update`, async () => {
  const { context: denied, calls } = harness(kind, { createAllowed: false })
  await denied.saveActiveForm()
  assert.equal(denied.recordSaveResult.status, 'failed')
  assert.match(denied.activeFormError, /do not have Create permission/)
  assert.equal(calls.some((call) => call.operation?.startsWith('create') || call.operation?.startsWith('update')), false)
  assert.equal(denied.activeFormSession.rowId, '')
  assert.equal(denied.activeFormSaving, false)
  const { context: existing } = harness(kind, { editing: true, createAllowed: false })
  await existing.saveActiveForm()
  assert.equal(existing.recordSaveResult.status, 'saved')
})

for (const kind of formKinds) for (const editing of [false, true]) {
  test(`${kind} ${editing ? 'update' : 'create'} shows a saved popup without navigating; Remain then saves the same row`, async () => {
    const { context: c, calls } = harness(kind, { editing })
    await c.saveActiveForm()
    assert.equal(c.activeFormError, '')
    assert.equal(c.recordSaveResult?.status, 'saved'); assert.equal(c.recordSaveResult.formName, kind)
    assert.equal(c.recordSaveResult.recordId, 'TEST-046'); assert.equal(c.recordSaveResult.isNew, !editing)
    assert.equal(c.activeFormSession.rowId, id(5)); assert.equal(c.activeFormSaving, false)
    assert.equal(c.selectedAppNav, 'programs'); assert.equal(c.selectedHubPages[hubId], 'forms')
    assert.equal(c.activeSearchDetailByHub[hubId], client); assert.ok(c.formReturnState)
    const writes = () => calls.filter((call) => /Response$/.test(call.operation || ''))
    assert.equal(writes().length, 1)
    assert.equal(writes()[0].args.at(-1).cmps_modifiedby, 'Staff')
    assert.equal(writes()[0].args.at(-1).cmps_createdby, editing ? undefined : 'Staff')
    await c.chooseRecordSaveDestination('remain'); assert.equal(c.recordSaveResult, null)
    await c.saveActiveForm(); assert.equal(c.recordSaveResult.status, 'saved')
    assert.equal(writes().length, 2); assert.match(writes()[1].operation, /^update/); assert.equal(writes()[1].args[0], id(5))
  })
  test(`${kind} ${editing ? 'update' : 'create'} failure retains the draft and provides a truthful popup`, async () => {
    const { context: c } = harness(kind, { editing, failure: true }), draft = c.activeFormSession
    await c.saveActiveForm()
    assert.equal(c.recordSaveResult?.status, 'failed'); assert.match(c.recordSaveResult.details, /Dataverse save failed/)
    assert.equal(c.activeFormSession, draft); assert.equal(c.formReturnState.clientProfileDetail, client)
    assert.equal(c.selectedHubPages[hubId], 'forms'); assert.equal(c.activeFormSaving, false)
    await c.chooseRecordSaveDestination('search'); assert.equal(c.activeFormSession, draft)
    await c.chooseRecordSaveDestination('client'); assert.equal(c.activeFormSession, draft)
    await c.chooseRecordSaveDestination('remain'); assert.equal(c.recordSaveResult, null)
  })
}

test('Back to search clears detail views only after the user chooses it', async () => {
  const { context: c } = harness('services')
  await c.saveActiveForm(); await c.chooseRecordSaveDestination('search')
  assert.equal(c.selectedAppNav, 'clients'); assert.equal(c.selectedHubPages[hubId], 'search')
  assert.equal(c.activeSearchDetailByHub[hubId], null); assert.equal(c.activeFormSession, null)
  assert.equal(c.selectedServicesDetail, null); assert.equal(c.selectedProgramEnrollmentDetail, null)
})
test('Open Client Profile loads the actual saved link, not an unrelated cached profile', async () => {
  const { context: c, calls } = harness('services')
  c.activeFormSession.values.cmps_cpid = id(9); c.activeFormSession.values.cmps_clientid = ''
  await c.saveActiveForm(); await c.chooseRecordSaveDestination('client')
  assert.equal(c.activeSearchDetailByHub[hubId].id, id(9)); assert.equal(c.selectedAppNav, 'clients')
  assert.equal(calls.find((call) => call.operation === 'open-client').rowId, id(9)); assert.equal(c.activeFormSession, null)
})
test('new Client Profile opens its newly saved row rather than the launch client', async () => {
  const { context: c } = harness('client-profile')
  await c.saveActiveForm(); await c.chooseRecordSaveDestination('client')
  assert.equal(c.activeSearchDetailByHub[hubId].id, id(5))
})
test('enrollment-only links resolve the client even when the enrollment was not in the loaded list', async () => {
  const { context: c } = harness('services')
  c.programEnrollmentsForClient = []; c.activeFormSession.values.cmps_cpid = ''; c.activeFormSession.values.cmps_clientid = ''
  await c.saveActiveForm(); assert.equal(c.recordSaveResult.enrollmentId, id(2))
  await c.chooseRecordSaveDestination('client'); assert.equal(c.activeSearchDetailByHub[hubId].id, client.id)
})
test('missing client and denied profile permissions cannot open an unrelated profile or close a saved draft', async () => {
  for (const missing of [false, true]) {
    const { context: c } = harness('helpline')
    if (missing) c.activeFormSession.values = { cmps_recordid: 'TEST-046' }
    else { c.user.rawRole = 'Staff'; c.roleProfiles = [{ roleName: 'Staff', entries: [{ formName: 'Client Profile', permissions: { view: false } }] }] }
    await c.saveActiveForm(); await assert.rejects(c.chooseRecordSaveDestination('client'), /role|linked Client Profile/)
    assert.ok(c.activeFormSession); assert.equal(c.recordSaveResult.status, 'saved')
  }
})
test('a failed destination load keeps the dialog and saved record open for another choice', async () => {
  const { context: c } = harness('services')
  await c.saveActiveForm(); c.loadClientProfileDetailRecord = async () => { throw Error('Read permission denied') }
  await assert.rejects(c.chooseRecordSaveDestination('client'), /permission denied/)
  assert.ok(c.activeFormSession); assert.equal(c.recordSaveResult.status, 'saved')
})
test('a submitted create without a row ID is confirmed before a retry; never creates a duplicate', async () => {
  const { context: c, calls } = harness('services')
  c.createServicesResponse = async () => { calls.push({ operation: 'create' }); return { id: '', recordId: 'TEST-046' } }
  c.confirmSavedRecordId = async () => { throw new c.SaveConfirmationPendingError('Confirmation pending') }
  await c.saveActiveForm(); assert.equal(c.recordSaveResult.status, 'unconfirmed'); assert.ok(c.pendingFormSaveConfirmation.current)
  await c.chooseRecordSaveDestination('remain'); await c.saveActiveForm()
  assert.equal(calls.filter((call) => call.operation === 'create').length, 1)
  c.confirmSavedRecordId = async () => id(5)
  await c.chooseRecordSaveDestination('remain'); await c.saveActiveForm()
  assert.equal(c.recordSaveResult.status, 'saved'); assert.equal(c.activeFormSession.rowId, id(5))
  assert.equal(calls.filter((call) => call.operation === 'create').length, 1)
  assert.equal(calls.filter((call) => call.operation === 'updateServicesResponse').length, 1)
})
test('partial bed saves preserve the enrollment row for retry rather than report complete success', async () => {
  const { context: c } = harness('bed-enrollment')
  c.assignBedsToEnrollment = async () => { throw Error('Bed assignment failed') }
  await c.saveActiveForm(); assert.equal(c.recordSaveResult.status, 'partial'); assert.equal(c.activeFormSession.rowId, id(5))
  c.assignBedsToEnrollment = async () => {}
  await c.chooseRecordSaveDestination('remain'); await c.saveActiveForm(); assert.equal(c.recordSaveResult.status, 'saved')
})

for (const editing of [false, true]) {
  test(`bed-enrollment ${editing ? 'update' : 'create'} permits no selection for a valid checkout without reading availability`, async () => {
    const { context: c, calls } = harness('bed-enrollment', { editing })
    c.programEnrollmentsForClient[0].program = 'Faith House'
    c.activeFormSession.values.cmps_selectedbeds = ''
    c.activeFormSession.values.cmps_checkoutdate = '2026-10-16'
    c.listSelectableBedsForEnrollment = async () => { throw Error('Availability must not block checkout') }
    await c.saveActiveForm()
    assert.equal(c.recordSaveResult.status, 'saved')
    const writes = calls.filter((call) => /Response$/.test(call.operation || ''))
    assert.equal(writes.length, 1)
    assert.equal(writes[0].args.at(-1).cmps_checkoutdate, '2026-10-16')
  })
  test(`bed-enrollment ${editing ? 'update' : 'create'} requires available beds only without a valid checkout`, async () => {
    for (const checkout of ['', '2026-02-30']) {
      const { context: c, calls } = harness('bed-enrollment', { editing })
      c.programEnrollmentsForClient[0].program = 'Faith House'
      c.activeFormSession.values.cmps_selectedbeds = ''
      c.activeFormSession.values.cmps_checkoutdate = checkout
      c.listSelectableBedsForEnrollment = async () => ({ beds: [{ status: 'Available' }], assignedBedIds: [] })
      await c.saveActiveForm()
      assert.equal(c.recordSaveResult.status, 'failed')
      assert.match(c.recordSaveResult.details, /required field\(s\): Beds/)
      assert.equal(calls.filter((call) => /Response$/.test(call.operation || '')).length, 0)
    }
    const { context: c } = harness('bed-enrollment', { editing })
    c.programEnrollmentsForClient[0].program = 'Faith House'
    c.activeFormSession.values.cmps_selectedbeds = ''
    await c.saveActiveForm()
    assert.equal(c.recordSaveResult.status, 'saved', 'No available beds must not require a selection')
  })
}
test('Household Remain retains created member histories and does not recreate them', async () => {
  const { context: c } = harness('household'); let creates = 0
  c.householdMembersDraft = [{ selected: true, historyRowId: '', clientRowId: client.id, relationshipToHoh: 'Self', status: 'Active' }]
  c.createHouseholdHistoryRecord = async () => { creates++; return { id: id(12), recordId: 'HHH-046' } }
  c.updateHouseholdHistoryRecord = async () => {}
  await c.saveActiveForm(); assert.equal(c.recordSaveResult.status, 'saved'); assert.equal(c.householdMembersDraft[0].historyRowId, id(12))
  await c.chooseRecordSaveDestination('remain'); await c.saveActiveForm(); assert.equal(c.recordSaveResult.status, 'saved'); assert.equal(creates, 1)
})
for (const editing of [false, true]) for (const copyNotes of [false, true]) test(`Services ${editing ? 'update' : 'create'} can start another for the same client; copy notes ${copyNotes}`, async () => {
  const { context: c, calls } = harness('services', { editing })
  Object.assign(c.activeFormSession.values, { cmps_servicenotes: '  Saved notes\nSecond line & <text>  ', cmps_service: 'Intake',
    cmps_dateofservice: '2026-10-19', cmps_time: '12:30', cmps_funder: 'VOCA', cmps_minutes: '15',
    cmps_clientresponsefeedback: 'Not the notes', cmps_wasinformationservicereceivedhelpful: 'Yes' })
  await c.saveActiveForm()
  const saved = c.activeFormSession, savedText = JSON.stringify(saved), origin = c.formReturnState
  assert.equal(c.canStartAnotherService(), true)
  await c.startAnotherService(copyNotes)
  assert.equal(c.recordSaveResult, null)
  assert.equal(c.activeFormSession.kind, 'services'); assert.equal(c.activeFormSession.rowId, '')
  assert.equal(c.activeFormSession.recordId, 'SV-0479376')
  assert.deepEqual(Object.keys(c.activeFormSession.values).sort(), ['cmps_programenrollment', 'cmps_recordid', ...(copyNotes ? ['cmps_servicenotes'] : [])].sort())
  assert.equal(c.activeFormSession.values.cmps_programenrollment, id(2))
  assert.equal(c.activeFormSession.values.cmps_servicenotes, copyNotes ? saved.values.cmps_servicenotes : undefined)
  assert.equal(c.formReturnState, origin, 'retain original return/search destination')
  assert.equal(c.selectedAppNav, 'programs'); assert.equal(c.selectedHubPages[hubId], 'forms')
  assert.equal(JSON.stringify(saved), savedText, 'never mutate the already-saved record')
  assert.equal(calls.filter((call) => /Response$/.test(call.operation || '')).length, 1, 'starting another is a draft, not a write')
  let newPayload
  c.createServicesResponse = async (payload) => { newPayload = payload; return { id: id(6), recordId: payload.cmps_recordid } }
  await c.saveActiveForm()
  assert.equal(c.recordSaveResult.status, 'saved'); assert.equal(c.activeFormSession.rowId, id(6))
  assert.equal(newPayload.cmps_recordid, 'SV-0479376'); assert.equal(newPayload.cmps_programenrollment, id(2))
  assert.equal(newPayload.cmps_servicenotes, copyNotes ? saved.values.cmps_servicenotes : undefined)
})

for (const rawLookup of [client.id, '{' + client.id.toUpperCase() + '}']) test(`Services continuation and Open Client use the raw lookup even when the enrollment shows CP-046 (${rawLookup})`, async () => {
  const { context: c } = harness('services'); await c.saveActiveForm()
  c.recordSaveResult.clientId = ''
  c.loadProgramEnrollmentDetailRecord = async () => ({ id: id(2), clientRowId: rawLookup, values: { cmps_clientid: 'CP-046' } })
  c.normalizeGuidText = (value) => String(value || '').trim().replace(/[{}]/g, '').toLowerCase()
  c.listProgramEnrollmentsForClientRecord = async (clientId) => {
    assert.equal(clientId, client.id)
    return [{ id: id(2), clientRowId: client.id, serviceEndDate: '' }]
  }
  await c.startAnotherService(true)
  assert.equal(c.activeFormSession.rowId, '')
  assert.equal(c.activeFormSession.values.cmps_programenrollment, id(2))
  await c.saveActiveForm(); c.recordSaveResult.clientId = ''
  await c.chooseRecordSaveDestination('client')
  assert.equal(c.activeSearchDetailByHub[hubId].id, client.id)
})

test('Services continuation rejects an actual client mismatch even when the hydrated display label matches the open client', async () => {
  const { context: c } = harness('services'); await c.saveActiveForm()
  const saved = c.activeFormSession, popup = c.recordSaveResult
  c.loadProgramEnrollmentDetailRecord = async () => ({ id: id(2), clientRowId: id(99), values: { cmps_clientid: 'CP-046' } })
  await assert.rejects(c.startAnotherService(true), /same Client Profile/)
  assert.equal(c.activeFormSession, saved); assert.equal(c.recordSaveResult, popup)
})

test('Services continuation resolves the real enrollment/client even when the cached open profile is unrelated', async () => {
  const { context: c } = harness('services', { origin: 'programs' })
  await c.saveActiveForm()
  c.recordSaveResult.clientId = ''
  c.selectedDetailRecord = { id: id(99) }; c.programEnrollmentsForClient = []
  c.loadProgramEnrollmentDetailRecord = async (enrollmentId) => { assert.equal(enrollmentId, id(2)); return { id: id(2), values: { cmps_clientid: client.id } } }
  c.listProgramEnrollmentsForClientRecord = async (clientId) => { assert.equal(clientId, client.id); return [{ id: id(2), clientRowId: client.id, serviceEndDate: '' }] }
  await c.startAnotherService()
  assert.equal(c.programEnrollmentsClientId, client.id)
  assert.equal(c.activeFormSession.values.cmps_programenrollment, id(2))
  assert.equal(c.activeFormSession.values.cmps_cpid, undefined, 'do not invent a Services client lookup or use the cached wrong client')
})

for (const status of ['failed', 'partial', 'unconfirmed']) test(`Services continuation is blocked after ${status} save`, async () => {
  const { context: c } = harness('services'); await c.saveActiveForm()
  c.recordSaveResult.status = status
  assert.equal(c.canStartAnotherService(), false)
  await assert.rejects(c.startAnotherService(true), /confirmed Services save/)
})

test('Services continuation rejects non-Services records, previews, revoked Create, stale record IDs and another hub', async () => {
  for (const mutate of [
    (c) => { c.recordSaveResult.formKind = 'helpline' }, (c) => { c.activeFormSession.kind = 'helpline' },
    (c) => { c.isUserPreview = true }, (c) => { c.canCreateForm = () => false },
    (c) => { c.recordSaveResult.rowId = id(99) }, (c) => { c.recordSaveResult.enrollmentId = '' },
    (c) => { c.selectedHub = { id: 'another-hub' } },
  ]) {
    const { context: c } = harness('services'); await c.saveActiveForm(); const saved = c.activeFormSession
    mutate(c); assert.equal(c.canStartAnotherService(), false)
    await assert.rejects(c.startAnotherService(true), /confirmed Services save/)
    assert.equal(c.activeFormSession, saved)
  }
})

test('parent read failures, ended enrollments, client mismatches and missing active links keep the saved service and popup intact', async () => {
  for (const mutate of [
    (c) => { c.loadProgramEnrollmentDetailRecord = async () => { throw Error('Read failed') } },
    (c) => { c.loadProgramEnrollmentDetailRecord = async () => ({ values: { cmps_clientid: id(99) } }) },
    (c) => { c.loadProgramEnrollmentDetailRecord = async () => ({ values: { cmps_clientid: client.id, cmps_serviceenddate: '2026-10-19' } }) },
    (c) => { c.listProgramEnrollmentsForClientRecord = async () => [] },
    (c) => { c.listProgramEnrollmentsForClientRecord = async () => [{ id: id(2), serviceEndDate: '2026-10-19' }] },
  ]) {
    const { context: c } = harness('services'); await c.saveActiveForm()
    const saved = c.activeFormSession, popup = c.recordSaveResult
    mutate(c); await assert.rejects(c.startAnotherService(true), /Read failed|same Client Profile|ended|active Program Enrollment/)
    assert.equal(c.activeFormSession, saved); assert.equal(c.recordSaveResult, popup)
    assert.equal(c.anotherServiceInFlight.current, false)
  }
})

test('Services continuation allocates the ID in the background without losing typing, reopening closed drafts or duplicating clicks', async () => {
  const { context: c } = harness('services'); await c.saveActiveForm()
  let resolveId, scans = 0
  c.generateAppRecordId = async () => { scans++; return new Promise((resolve) => { resolveId = resolve }) }
  const pending = c.startAnotherService(true)
  for (let index = 0; index < 8; index++) await Promise.resolve()
  assert.equal(c.recordSaveResult, null); assert.equal(c.activeFormSession.rowId, ''); assert.equal(c.activeFormSession.recordId, '')
  c.activeFormSession.values.cmps_minutes = '23'
  await c.startAnotherService(true); assert.equal(scans, 1)
  resolveId('SV-0479376'); await pending
  assert.equal(c.activeFormSession.values.cmps_minutes, '23'); assert.equal(c.activeFormSession.recordId, 'SV-0479376')
  await c.saveActiveForm()
  const second = c.startAnotherService()
  for (let index = 0; index < 8; index++) await Promise.resolve()
  c.activeFormSession = null; resolveId('SV-0479377'); await second
  assert.equal(c.activeFormSession, null)
})

test('Services continuation ID scan failure leaves an unsaved draft with an actionable error, not a copy of the saved row', async () => {
  const { context: c } = harness('services'); await c.saveActiveForm()
  c.generateAppRecordId = async () => { throw Error('ID scan failed') }
  await c.startAnotherService()
  assert.equal(c.activeFormSession.rowId, ''); assert.equal(c.activeFormSession.recordId, '')
  assert.equal(c.activeFormSession.recordIdError, 'ID scan failed')
  assert.equal(c.anotherServiceInFlight.current, false)
  await c.saveActiveForm(); assert.equal(c.recordSaveResult.status, 'failed')
  assert.match(c.recordSaveResult.details, /record ID is still being prepared/)
})

test('rapid duplicate Save clicks cannot issue a second create', async () => {
  const { context: c } = harness('services'); let finish, creates = 0
  c.createServicesResponse = async () => { creates++; await new Promise((resolve) => { finish = resolve }); return { id: id(5), recordId: 'TEST-046' } }
  const first = c.saveActiveForm(); await c.saveActiveForm(); assert.equal(creates, 1)
  finish(); await first; assert.equal(c.recordSaveResult.status, 'saved')
})
test('validation displays failure; View as User remains read-only and does not show a save success', async () => {
  for (const options of [{ validation: 'Date is required' }, { preview: true }]) {
    const { context: c, calls } = harness('helpline', options), draft = c.activeFormSession
    await c.saveActiveForm(); assert.equal(c.activeFormSession, draft)
    assert.equal(c.selectedHubPages[hubId], 'forms'); assert.equal(calls.filter((call) => /Response$/.test(call.operation || '')).length, 0)
    assert.equal(c.recordSaveResult?.status || null, options.preview ? null : 'failed')
  }
})
test('IT Admin funder Add/Edit retains the saved ID, shows the popup and updates on another save', async () => {
  const { context: c } = harness('services'); const rows = []
  c.funderAdminEditor = { kind: 'funder', rowId: '', values: { cmps_name: 'Funder', cmps_activechoice: 'Yes' } }
  c.saveFunderAdminRecord = async (_kind, rowId) => { rows.push(rowId); return { id: id(5) } }
  await c.saveFunderAdminEditor(); assert.equal(c.recordSaveResult.status, 'saved'); assert.equal(c.funderAdminEditor.rowId, id(5))
  await c.chooseRecordSaveDestination('remain'); await c.saveFunderAdminEditor(); assert.deepEqual(rows, ['', id(5)])
})
test('standalone Event and Household do not inherit a cached client as their destination', async () => {
  for (const kind of ['event', 'household']) {
    const { context: c } = harness(kind); await c.saveActiveForm()
    assert.equal(c.recordSaveResult.clientId, ''); assert.equal(c.recordSaveResult.enrollmentId, '')
  }
})
test('Back to search preserves a My Work search origin', async () => {
  const { context: c } = harness('services')
  c.formReturnState.appNav = 'my-work'
  await c.saveActiveForm(); await c.chooseRecordSaveDestination('search')
  assert.equal(c.selectedAppNav, 'my-work'); assert.equal(c.activeFormSession, null)
})
test('the launch hub determines profile permission even if the selected hub changes', async () => {
  const { context: c } = harness('services')
  c.selectedHub = { id: 'autumn-house' }; c.user.rawRole = 'Staff'
  c.roleProfiles = [{ roleName: 'Staff', entries: [{ formName: 'Client Profile', permissions: { view: true } }] }]
  c.hubMatchesRole = (hub) => hub.id === hubId
  await c.saveActiveForm(); await c.chooseRecordSaveDestination('client')
  assert.equal(c.selectedHubId, hubId); assert.equal(c.activeSearchDetailByHub[hubId].id, client.id)
})
test('a failed initial Client Profile household creation is retried on the saved profile, not duplicated', async () => {
  const { context: c, calls } = harness('client-profile'); let attempts = 0
  c.createInitialHouseholdHistoryForClient = async () => { if (++attempts === 1) throw Error('History failed') }
  await c.saveActiveForm(); assert.equal(c.recordSaveResult.status, 'partial'); assert.equal(c.activeFormSession.rowId, id(5))
  await c.chooseRecordSaveDestination('remain'); await c.saveActiveForm()
  assert.equal(c.recordSaveResult.status, 'saved'); assert.equal(attempts, 2)
  assert.equal(calls.filter((call) => call.operation === 'createClientProfileResponse').length, 1)
})
test('an unconfirmed Household member create is resolved on retry before another history can be created', async () => {
  const { context: c } = harness('household'); let creates = 0
  c.householdMembersDraft = [{ selected: true, historyRowId: '', clientRowId: client.id, relationshipToHoh: 'Self', status: 'Active' }]
  c.createHouseholdHistoryRecord = async () => { creates++; return { id: '', recordId: 'HHH-046' } }
  c.confirmSavedRecordId = async () => { throw new c.SaveConfirmationPendingError('Read unavailable') }
  await c.saveActiveForm(); assert.equal(c.recordSaveResult.status, 'partial'); assert.equal(c.activeFormSession.rowId, id(5))
  c.confirmSavedRecordId = async () => id(12)
  await c.chooseRecordSaveDestination('remain'); await c.saveActiveForm()
  assert.equal(c.recordSaveResult.status, 'saved'); assert.equal(creates, 1); assert.equal(c.householdMembersDraft[0].historyRowId, id(12))
})
test('imported VOCA with a direct client link can update without a program enrollment; new and foreign-client drafts cannot', async () => {
  for (const [editing, clientLink, expected] of [[true, client.id, 'saved'], [false, client.id, 'failed'], [true, id(9), 'failed']]) {
    const { context: c, calls } = harness('voca-form', { editing })
    c.activeFormSession.values.cmps_peid = ''
    c.activeFormSession.values.cmps_cpid = clientLink
    await c.saveActiveForm()
    assert.equal(c.recordSaveResult.status, expected)
    const writes = calls.filter((call) => /Response$/.test(call.operation || ''))
    assert.equal(writes.length, expected === 'saved' ? 1 : 0)
    if (writes.length) { assert.equal(writes[0].operation, 'updateVocaFormResponse'); assert.equal(writes[0].args[0], id(5)) }
  }
})
test('existing VOCA can retain an ended client enrollment but cannot switch to an unrelated enrollment', async () => {
  for (const foreign of [false, true]) {
    const { context: c, calls } = harness('voca-form', { editing: true })
    c.activeVocaProgramEnrollmentOptions = []
    c.programEnrollmentsForClient[0].serviceEndDate = '2025-01-01'
    if (foreign) c.activeFormSession.values.cmps_peid = id(9)
    await c.saveActiveForm()
    assert.equal(c.recordSaveResult.status, foreign ? 'failed' : 'saved')
    assert.equal(calls.filter((call) => /Response$/.test(call.operation || '')).length, foreign ? 0 : 1)
  }
})
