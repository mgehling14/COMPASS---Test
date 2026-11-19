import assert from 'node:assert/strict'
import { readFileSync } from 'node:fs'
import test from 'node:test'
import vm from 'node:vm'
import ts from 'typescript'

const source = readFileSync(new URL('../App.tsx', import.meta.url), 'utf8')
const tree = ts.createSourceFile('App.tsx', source, ts.ScriptTarget.Latest, true, ts.ScriptKind.TSX)
const functions = new Map(), variables = new Map()
function collect(node) {
  if (ts.isFunctionDeclaration(node) && node.name) functions.set(node.name.text, node)
  if (ts.isVariableDeclaration(node) && ts.isIdentifier(node.name)) variables.set(node.name.text, node)
  ts.forEachChild(node, collect)
}
collect(tree)
const helpers = ['normalizeClientProfileFormName', 'isCanonicalGoalFormName', 'getClientProfileFormCatalogEntry', 'canCreateForm', 'requireFormCreateAccess', 'canAccessClientFormAction']
const starters = {
  startFormResponse: ['Services', true],
  startHelplineForClient: [{ id: 'client', recordId: 'CP-046' }],
  startNewClientAfterSearch: [],
  startShelterScreeningFromClientDetail: [],
  startChildSafetyPlanFromClientDetail: [],
  startAdultAssessmentFromClientDetail: [],
  startHealthWellnessFromClientDetail: [],
  startFocusPlanFromClientDetail: [],
  startInitialSafetyPlanFromClientDetail: [],
  startProgramEnrollmentFromClientDetail: [],
  startVocaFromClientDetail: [],
  startServicesFromClientDetail: [],
  startBedEnrollmentFromClientDetail: [],
}
const compile = (code) => ts.transpileModule(code, { compilerOptions: { target: ts.ScriptTarget.ES2022 } }).outputText
const normalize = (value) => String(value || '').trim().toLowerCase()
function permissions(create = false, extra = {}) {
  return { view: true, search: true, create, edit: true, ignoreProgramAssignment: false, ...extra }
}
function harness(overrides = {}) {
  const context = {
    selectedHub: { id: 'autumn-house' }, roleProfilesLoading: false, canAccessRoleAdmin: false, isUserPreview: false,
    roleProfiles: [], roleEdits: [], hubFormAccess: [], asText: (value) => String(value || '').trim(), normalize,
    useMemo: (callback) => callback(),
    hubMatchesRole: (_hub, role) => role.startsWith('Autumn House'),
    setHubActionStatus: (value) => { context.status = value },
    setActiveFormError: (value) => { context.error = value },
    ...overrides,
  }
  vm.createContext(context)
  const code = `const CLIENT_PROFILE_FORM_CATALOG = ${variables.get('CLIENT_PROFILE_FORM_CATALOG').initializer.getText(tree)};\n`
    + helpers.map((name) => functions.get(name).getText(tree)).join('\n')
  vm.runInContext(compile(code), context)
  context.refreshCreateAccess = () => {
    context.hubFormAccess = vm.runInContext(compile(variables.get('hubFormAccess').initializer.getText(tree)), context)
  }
  context.refreshCreateAccess()
  return context
}

test('Create is independent of View, Search, Edit and Ignore Program; only assigned roles for the current hub can grant it', () => {
  const context = harness({ roleProfiles: [
    { roleName: 'Autumn House Staff', entries: [{ formName: 'Services', permissions: permissions(false, { ignoreProgramAssignment: true }) }] },
    { roleName: 'Faith House Staff', entries: [{ formName: 'Services', permissions: permissions(true) }] },
  ] })
  assert.equal(context.canCreateForm('Services'), false)
  context.roleProfiles[0].entries[0].permissions.create = true
  context.refreshCreateAccess()
  assert.equal(context.canCreateForm('Services'), true)
  assert.equal(context.canCreateForm('Bed Enrollment'), false)
  context.roleProfiles = []
  context.refreshCreateAccess()
  assert.equal(context.canCreateForm('Services'), false)
})

test('a Create grant from any assigned matching role is sufficient, without granting other forms', () => {
  const context = harness({ roleProfiles: [
    { roleName: 'Autumn House Staff', entries: [{ formName: 'Services', permissions: permissions(false) }] },
    { roleName: 'Autumn House Supervisor', entries: [{ formName: 'Services', permissions: permissions(true) }] },
  ] })
  assert.equal(context.canCreateForm('Services'), true)
  assert.equal(context.canCreateForm('Program Enrollment'), false)
  context.roleProfilesLoading = true
  assert.equal(context.canCreateForm('Services'), false, 'fail closed while roles load/change')
  context.roleProfilesLoading = false; context.selectedHub = null
  assert.equal(context.canCreateForm('Services'), false)
})

test('Edit is independently scoped to the current form/hub and fails closed in preview or during role loading', () => {
  const context = harness({ roleProfiles: [
    { roleName: 'Autumn House Staff', entries: [{ formName: 'Services', permissions: permissions(true, { edit: false }) }] },
    { roleName: 'Faith House Staff', entries: [{ formName: 'Services', permissions: permissions(true) }] },
  ] })
  assert.equal(context.canAccessClientFormAction('Services', 'edit'), false)
  context.roleProfiles[0].entries[0].permissions.edit = true
  assert.equal(context.canAccessClientFormAction('Services', 'edit'), true)
  assert.equal(context.canAccessClientFormAction('Program Enrollment', 'edit'), false)
  context.roleProfilesLoading = true
  assert.equal(context.canAccessClientFormAction('Services', 'edit'), false)
  context.roleProfilesLoading = false; context.canAccessRoleAdmin = true
  assert.equal(context.canAccessClientFormAction('Program Enrollment', 'edit'), true)
  context.isUserPreview = true
  assert.equal(context.canAccessClientFormAction('Services', 'edit'), false)
})

for (const name of ['editClientProfileFromDetail', 'editHelplineFromDetail', 'editHelplineRecordFromClient', 'editEventFromDetail', 'editProgramEnrollmentRecord', 'editServicesRecord', 'editBedEnrollmentRecord', 'editHouseholdRecord', 'editGoalRecord']) test(`${name} denies Edit before reads, navigation or editor initialization`, async () => {
  const context = { canAccessClientFormAction: () => false }
  vm.createContext(context)
  vm.runInContext(compile(functions.get(name).getText(tree)), context)
  await context[name]('row', 'record')
  assert.equal(context.activeFormSession, undefined)
})

test('every normal Edit button is gated by the existing action-permission predicate', () => {
  let count = 0
  function visit(node) {
    if (ts.isJsxElement(node) && node.openingElement.tagName.getText(tree) === 'button') {
      const click = node.openingElement.attributes.properties.find((x) => ts.isJsxAttribute(x) && x.name.getText(tree) === 'onClick')
      const handler = click?.initializer?.getText(tree) || ''
      if (/\bedit(?:ClientProfileFromDetail|HelplineFromDetail|HelplineRecordFromClient|EventFromDetail|ProgramEnrollmentRecord|ServicesRecord|BedEnrollmentRecord|HouseholdRecord|GoalRecord)\b/.test(handler)) {
        count++; let current = node.parent, guarded = false
        while (current && !ts.isJsxElement(current) && !ts.isArrowFunction(current)) {
          if (ts.isConditionalExpression(current) && /canAccessClientFormAction/.test(current.condition.getText(tree))) guarded = true
          current = current.parent
        }
        assert.equal(guarded, true)
      }
    }
    ts.forEachChild(node, visit)
  }
  visit(tree); assert.ok(count >= 20)
  assert.match(source, /<section inert=\{activeFormSaving\} aria-busy=\{activeFormSaving\}/)
})

test('canonical aliases retain their Create permission without confusing Goals and FOCUS Plan', () => {
  const aliases = [
    ['Release of Information', 'A New Leaf Limited Release of Information'],
    ['Acknowledgement and Consent Form', 'Acknowledgement & Consent Form'],
    ['Health and Wellness Questionnaire', 'Health & Wellness Questionnaire'],
    ['Employment and Benefits', 'Employment & Benefits'], ['Shelter Screening', 'Shelter Screening Form'],
    ['VOCA', 'VOCA Form'], ['A New Leaf Goals Form', 'Goals'], ['Funder Transaction', 'Funder Transactions'],
  ]
  for (const [assigned, canonical] of aliases) {
    const context = harness({ roleProfiles: [{ roleName: 'Autumn House Staff', entries: [{ formName: assigned, permissions: permissions(true) }] }] })
    assert.equal(context.canCreateForm(canonical), true, assigned)
    assert.equal(context.canCreateForm('Unassigned Form'), false)
    if (canonical === 'Goals') assert.equal(context.canCreateForm('FOCUS Plan'), false)
  }
})

for (const [name, args] of Object.entries(starters)) test(`${name} rejects missing Create permission before any ID scan, navigation, modal or draft mutation`, async () => {
  const context = harness()
  vm.runInContext(compile(functions.get(name).getText(tree)), context)
  // Dependencies beyond the permission check are intentionally absent: a denied
  // handler must not attempt to read client/enrollment data or start any work.
  await context[name](...args)
  assert.match(context.error, /do not have Create permission/)
  assert.equal(context.status, context.error)
  assert.equal(context.activeFormSession, undefined)
})

test('all Start/Create form buttons are conditionally rendered by the same Create predicate', () => {
  let count = 0
  function visit(node) {
    if (ts.isJsxElement(node) && node.openingElement.tagName.getText(tree) === 'button') {
      const click = node.openingElement.attributes.properties.find((entry) => ts.isJsxAttribute(entry) && entry.name.getText(tree) === 'onClick')
      const handler = click?.initializer?.getText(tree) || ''
      const starts = Object.keys(starters).some((name) => new RegExp(`\\b${name}\\b`).test(handler)) || node.getText(tree).includes('Start VOCA Record')
      if (starts) {
        count++
        let parent = node.parent, gated = false
        while (parent && !ts.isJsxElement(parent) && !ts.isArrowFunction(parent)) {
          if (ts.isConditionalExpression(parent) && /canCreateForm\(/.test(parent.condition.getText(tree))) gated = true
          parent = parent.parent
        }
        assert.equal(gated, true, node.getText(tree).slice(0, 180))
      }
    }
    ts.forEachChild(node, visit)
  }
  visit(tree)
  assert.equal(count, 31, 'audit every current client, program, modal, and My Work launcher')
})

test('My Work pending VOCA shortcut checks Create before navigating or allocating an ID', async () => {
  let handler
  function visit(node) {
    if (ts.isJsxElement(node) && node.openingElement.tagName.getText(tree) === 'button'
      && node.getText(tree).includes('Start VOCA Record')) {
      handler = node.openingElement.attributes.properties.find((entry) => ts.isJsxAttribute(entry) && entry.name.getText(tree) === 'onClick').initializer.expression.getText(tree)
    }
    ts.forEachChild(node, visit)
  }
  visit(tree); assert.ok(handler)
  const context = harness()
  vm.runInContext(compile(`const startPendingVoca = ${handler}; globalThis.startPendingVoca = startPendingVoca`), context)
  await context.startPendingVoca()
  assert.match(context.error, /Create permission for VOCA Form/)
})
