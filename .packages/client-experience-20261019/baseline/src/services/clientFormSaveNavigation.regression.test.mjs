import assert from 'node:assert/strict'
import { readFileSync } from 'node:fs'
import test from 'node:test'
import vm from 'node:vm'
import ts from 'typescript'

const app = readFileSync(new URL('../App.tsx', import.meta.url), 'utf8')
const tree = ts.createSourceFile('App.tsx', app, ts.ScriptTarget.Latest, true, ts.ScriptKind.TSX)
const names = ['rememberFormReturnState', 'finishActiveFormSession', 'saveActiveForm', 'chooseRecordSaveDestination', 'canOpenSavedClient', 'canAccessRoleAdminForSave', 'saveFunderAdminEditor']
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

function harness(kind, { editing = false, failure = false, validation = '', origin = 'client', preview = false } = {}) {
  const calls = []
  const context = {
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
