import assert from 'node:assert/strict'
import { readFileSync } from 'node:fs'
import vm from 'node:vm'
import test from 'node:test'
import ts from 'typescript'

const forms = [
  {
    "file": "acknowledgementAndConsent",
    "fields": "ACKNOWLEDGEMENT_AND_CONSENT_FIELDS",
    "update": "updateAcknowledgementAndConsentResponse"
  },
  {
    "file": "adultAssessment",
    "fields": "ADULT_ASSESSMENT_FIELDS",
    "update": "updateAdultAssessmentResponse"
  },
  {
    "file": "animalAgreement",
    "fields": "ANIMAL_AGREEMENT_FIELDS",
    "update": "updateAnimalAgreementResponse"
  },
  {
    "file": "bedEnrollment",
    "fields": "BED_ENROLLMENT_FIELD_DEFINITIONS",
    "update": "updateBedEnrollmentResponse"
  },
  {
    "file": "childAssessment",
    "fields": "CHILD_ASSESSMENT_FIELDS",
    "update": "updateChildAssessmentResponse"
  },
  {
    "file": "childSafetyPlan",
    "fields": "CHILD_SAFETY_PLAN_FIELDS",
    "update": "updateChildSafetyPlanResponse"
  },
  {
    "file": "childShelterIntake",
    "fields": "CHILD_SHELTER_INTAKE_FIELDS",
    "update": "updateChildShelterIntakeResponse"
  },
  {
    "file": "clientProfile",
    "fields": "CLIENT_PROFILE_FIELDS",
    "update": "updateClientProfileResponse"
  },
  {
    "file": "contract",
    "fields": "CONTRACT_FIELDS",
    "update": "updateContractResponse"
  },
  {
    "file": "electronicDocument",
    "fields": "ELECTRONIC_DOCUMENT_FIELDS",
    "update": "updateElectronicDocumentResponse"
  },
  {
    "file": "employmentAndBenefits",
    "fields": "EMPLOYMENT_AND_BENEFITS_FIELDS",
    "update": "updateEmploymentAndBenefitsResponse"
  },
  {
    "file": "event",
    "fields": "EVENT_FIELD_DEFINITIONS",
    "update": "updateEventResponse"
  },
  {
    "file": "financialAssistance",
    "fields": "FINANCIAL_ASSISTANCE_FIELDS",
    "update": "updateFinancialAssistanceResponse"
  },
  {
    "file": "focusPlan",
    "fields": "FOCUS_PLAN_FIELDS",
    "update": "updateFocusPlanResponse"
  },
  {
    "file": "funderTransaction",
    "fields": "FUNDER_TRANSACTION_FIELDS",
    "update": "updateFunderTransactionResponse"
  },
  {
    "file": "goals",
    "fields": "GOAL_FIELDS",
    "update": "updateGoalResponse"
  },
  {
    "file": "healthAndWellnessQuestionnaire",
    "fields": "HEALTH_WELLNESS_FIELDS",
    "update": "updateHealthWellnessResponse"
  },
  {
    "file": "helpline",
    "fields": "HELPLINE_FIELD_DEFINITIONS",
    "update": "updateHelplineResponse"
  },
  {
    "file": "household",
    "fields": "HOUSEHOLD_FIELD_DEFINITIONS",
    "update": "updateHouseholdResponse"
  },
  {
    "file": "initialSafetyPlan",
    "fields": "INITIAL_SAFETY_PLAN_FIELDS",
    "update": "updateInitialSafetyPlanResponse"
  },
  {
    "file": "medicalConsentForm",
    "fields": "MEDICAL_CONSENT_FORM_FIELDS",
    "update": "updateMedicalConsentFormResponse"
  },
  {
    "file": "personYouAreFleeingProfile",
    "fields": "PERSON_YOU_ARE_FLEEING_PROFILE_FIELDS",
    "update": "updatePersonYouAreFleeingProfileResponse"
  },
  {
    "file": "petCompanionIntake",
    "fields": "PET_COMPANION_INTAKE_FIELDS",
    "update": "updatePetCompanionIntakeResponse"
  },
  {
    "file": "programEnrollment",
    "fields": "PROGRAM_ENROLLMENT_FIELDS",
    "update": "updateProgramEnrollmentResponse"
  },
  {
    "file": "releaseOfInformation",
    "fields": "RELEASE_OF_INFORMATION_FIELDS",
    "update": "updateReleaseOfInformationResponse"
  },
  {
    "file": "services",
    "fields": "SERVICES_FIELD_DEFINITIONS",
    "update": "updateServicesResponse"
  },
  {
    "file": "shelterProgramGuidelines",
    "fields": "SHELTER_PROGRAM_GUIDELINES_FIELDS",
    "update": "updateShelterProgramGuidelinesResponse"
  },
  {
    "file": "shelterScreening",
    "fields": "SHELTER_SCREENING_FIELD_DEFINITIONS",
    "update": "updateShelterScreeningResponse"
  },
  {
    "file": "termsAndConditionsOfServiceAnimals",
    "fields": "TERMS_AND_CONDITIONS_OF_SERVICE_ANIMALS_FIELDS",
    "update": "updateTermsAndConditionsOfServiceAnimalsResponse"
  },
  {
    "file": "vocaForm",
    "fields": "VOCA_FORM_FIELD_DEFINITIONS",
    "update": "updateVocaFormResponse"
  }
]
const rowId = '11111111-1111-1111-1111-111111111111'
function harness(form, runtime) {
  const cache = new Map(), writes = [], state = { record: { id: rowId, cmps_recordid: 'REC-001' } }
  function save(item) { const body = JSON.parse(JSON.stringify(item)); writes.push(body); Object.assign(state.record, body); return { id: rowId } }
  function load(file) {
    if (cache.has(file)) return cache.get(file)
    const source = readFileSync(new URL('./' + file + '.ts', import.meta.url), 'utf8').replaceAll('import.meta.env', '({VITE_DATAVERSE_ORG_URL:"https://example.crm.dynamics.com"})')
    const module = { exports: {} }; cache.set(file, module.exports)
    vm.runInNewContext(ts.transpileModule(source, { compilerOptions: { module: ts.ModuleKind.CommonJS, target: ts.ScriptTarget.ES2022 } }).outputText, {
      module, exports: module.exports, URL, URLSearchParams, Headers, console,
      window: { location: { hostname: runtime ? 'powerapps.example' : 'localhost' } },
      fetch: async (url, init = {}) => {
        if (runtime && file === 'clientProfile') throw Error('Use connector for this test')
        if (init.body) save(JSON.parse(init.body))
        return { ok: true, status: 200, headers: new Headers(), text: async () => '', json: async () => String(url).includes('EntityDefinitions') ? { value: [] } : { ...state.record, value: [state.record] } }
      },
      require(name) {
        if (name === '@microsoft/power-apps/data') return { getClient: () => ({ executeAsync: async ({ connectorOperation: op }) => {
          if (op.parameters?.item) save(op.parameters.item)
          return { success: true, data: String(op.parameters?.entityName || '').includes('EntityDefinitions') ? { value: [] } : { ...state.record, value: [state.record] } }
        } }) }
        if (name.includes('dataSourcesInfo')) return { dataSourcesInfo: {} }
        if (name === './auth') return { getAuthToken: () => 'test', ensureAuthToken: async () => 'test' }
        if (name === './archive') return { excludeArchived: (value = '') => value || 'cmps_isarchived ne 125570000' }
        if (name === './funderBalance') return { saveFunderFinancialRecord: async (_kind, _id, item) => save(item) }
        if (name === './dataverseRecordPages') return { readDataverseRecordPages: async (_org, _table, parameters, _runtime, request) => (await request(parameters)).value }
        if (name.startsWith('./')) return load(name.slice(2))
        throw Error('Unexpected dependency ' + name)
      },
    }, { filename: file })
    for (const [key, value] of Object.entries(module.exports)) if (key.includes('PRIMARY_ID_FIELD')) state.record[value] = rowId
    return module.exports
  }
  const api = load(form.file), dates = Array.from(api[form.fields]).filter((field) => ['date', 'datetime'].includes(field.input))
  return { api, dates, writes, state, update: (values) => api[form.update](rowId, values) }
}
for (const form of forms.filter((form) => form.file !== 'vocaForm')) for (const runtime of [false, true]) test(form.file + ': ' + (runtime ? 'connector' : 'local') + ' explicit cleared dates become null; omitted/undefined dates and non-date blanks are not changed', async () => {
  const h = harness(form, runtime)
  for (const field of h.dates) h.state.record[field.field] = '2026-01-01'
  for (const empty of ['', '   ', null]) {
    const values = Object.fromEntries(h.dates.map((field) => [field.field, empty]))
    await h.update(values)
    const item = h.writes.at(-1)
    assert.ok(item, 'Update must reach the write boundary')
    for (const field of h.dates) {
      assert.equal(item[field.field], null, field.field)
      assert.equal(h.state.record[field.field], null, 'Saved date must remain empty: ' + field.field)
    }
  }
  // Sparse background updates must not clear untouched dates.
  const dateValues = Object.fromEntries(h.dates.map((field) => [field.field, undefined]))
  await h.update(dateValues)
  for (const field of h.dates) {
    // Household already intentionally sends null for Effective End Date.
    if (form.file === 'household' && field.field === 'cmps_effectiveenddate') continue
    assert.equal(Object.hasOwn(h.writes.at(-1), field.field), false, field.field)
  }
  await h.update({ cmps_modifiedby: 'Admin' })
  for (const field of h.dates) {
    if (form.file === 'household' && field.field === 'cmps_effectiveenddate') continue
    assert.equal(Object.hasOwn(h.writes.at(-1), field.field), false, field.field)
  }
  const values = Object.fromEntries(h.dates.map((field) => [field.field, field.input === 'datetime' ? '2026-10-14T12:30' : '2026-10-14']))
  await h.update(values)
  for (const field of h.dates) assert.match(String(h.writes.at(-1)[field.field]), /^2026-10-14/, field.field)
})
test('every editable date-bearing form with an update entry point is covered', () => {
  for (const form of forms) {
    const h = harness(form, false)
    if (form.file === 'vocaForm') assert.equal(h.dates.length, 0, 'VOCA Creation Date is read-only, not an editable date')
    else assert.ok(h.dates.length > 0, form.file + ' date definitions must be covered')
  }
})

test('clearing is confined to update entry points, and creates retain their original normalization', () => {
  for (const form of forms.filter((form) => form.file !== 'vocaForm')) {
    const source = readFileSync(new URL('./' + form.file + '.ts', import.meta.url), 'utf8')
    const tree = ts.createSourceFile(form.file + '.ts', source, ts.ScriptTarget.Latest, true)
    const update = tree.statements.find((node) => ts.isFunctionDeclaration(node) && node.name?.text === form.update)
    assert.match(update.getText(tree), /PATCH must explicitly clear dates/)
    for (const fn of tree.statements.filter((node) => ts.isFunctionDeclaration(node) && node.name?.text.startsWith('create'))) assert.doesNotMatch(fn.getText(tree), /PATCH must explicitly clear dates/)
  }
})
