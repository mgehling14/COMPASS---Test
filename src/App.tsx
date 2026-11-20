import { Fragment, Suspense, lazy, useEffect, useMemo, useRef, useState, type ChangeEvent, type InputHTMLAttributes } from 'react'
import { getCurrentUser } from './services/auth'
import { IS_WAVE2_SANDBOX } from './services/wave2Boundary'
import { openWave2Preview } from './services/wave2Navigation'
import ClientReportExclusionControl from './services/reporting/ClientReportExclusionControl'
import { canViewReportLibrary } from './services/reportAccess'
const LegacyReportsPanel = lazy(() => import('./services/reporting/LegacyReportsPanel'))
import { UserPreviewRoot, UserPreviewPicker } from './services/UserPreviewControls'
import MultiSelectDropdown from './services/MultiSelectDropdown'
import RecordAttachmentButtons from './services/RecordAttachmentButtons'
import { recordAttachments } from './services/recordAttachments'
import { USER_PREVIEW_READ_ONLY_MESSAGE, type UserPreviewSession } from './services/userPreview'
import { importRolesWorkbook } from './services/roleImport'
import { loadRoleRowsForAdmin, saveRoleRow } from './services/roleAdmin'
import {
  type ClientProfileDetailRecord,
  CLIENT_PROFILE_FIELDS,
  type ClientProfileFieldName,
  type ClientProfilePayload,
  type ClientProfileSearchRecord,
  CLIENT_PROFILE_FIELD_NAMES,
  CLIENT_PROFILE_TABLE_ALIAS,
  createClientProfileResponse,
  findClientProfileDuplicate,
  isAnonymousClientProfile,
  loadClientProfileDetailRecord,
  resolveClientProfileRowIdByRecordId,
  searchClientProfileRecordsPaged,
  updateClientProfileResponse,
  updateClientProfileDraftValue,
} from './services/clientProfile'
import {
  createProgramEnrollmentResponse,
  getProgramEnrollmentDischargeRules,
  isOvwLateLifeEnrollmentFunder,
  loadProgramEnrollmentDetailRecord,
  listProgramEnrollmentsForClientRecord,
  listActiveProgramEnrollments,
  updateProgramEnrollmentResponse,
  type ProgramEnrollmentDetailRecord,
  type ProgramEnrollmentListRecord,
  PROGRAM_ENROLLMENT_FIELDS,
  PROGRAM_ENROLLMENT_TABLE_ALIAS,
  type ProgramEnrollmentPayload,
} from './services/programEnrollment'
import {
  createServicesResponse,
  listServicesForProgramEnrollmentRecord,
  loadServicesDetailRecord,
  SERVICE_OPTIONS_BY_CATEGORY,
  resolveServiceAdditionalDetailOptions,
  SERVICES_FIELD_DEFINITIONS,
  type ServicesDetailRecord,
  type ServicesListRecord,
  SERVICES_TABLE_ALIAS,
  type ServicesPayload,
  updateServicesResponse,
  WHERE_DID_YOU_REFER_OPTIONS_BY_SERVICE,
} from './services/services'
import { getPendingVocaReason, type PendingVocaReason } from './services/pendingVoca'
import {
  BED_ENROLLMENT_FIELD_DEFINITIONS,
  BED_ENROLLMENTS_TABLE_ALIAS,
  createBedEnrollmentResponse,
  listBedEnrollmentsForProgramEnrollmentRecord,
  loadBedEnrollmentDetailRecord,
  type BedEnrollmentDetailRecord,
  type BedEnrollmentListRecord,
  type BedEnrollmentPayload,
  updateBedEnrollmentResponse,
  verifyBedEnrollmentDates,
} from './services/bedEnrollment'
import {
  createHelplineResponse,
  loadHelplineDetailRecord,
  resolveHelplineTurnawayReasonOptions,
  resolveHelplineProgramOptions,
  listHelplinesForClient,
  HELPLINE_FIELD_DEFINITIONS,
  HELPLINES_TABLE_ALIAS,
  searchHelplineRecords,
  type HelplineDetailRecord,
  type HelplinePayload,
  type HelplineSearchRecord,
  type HelplineClientListRecord,
  updateHelplineResponse,
} from './services/helpline'
import {
  createShelterScreeningResponse,
  listShelterScreeningsForClient,
  loadShelterScreeningDetailRecord,
  SHELTER_SCREENING_FIELD_DEFINITIONS,
  SHELTER_SCREENINGS_TABLE_ALIAS,
  type ShelterScreeningListRecord,
  type ShelterScreeningPayload,
  updateShelterScreeningResponse,
} from './services/shelterScreening'
import {
  createVocaFormResponse,
  VOCA_FORM_FIELD_DEFINITIONS,
  VOCA_FORMS_TABLE_ALIAS,
  listExistingVocaProgramEnrollmentIds,
  type VocaFormPayload,
  type VocaFormListRecord,
  updateVocaFormResponse,
} from './services/vocaForm'
import { listVocaFormsForClient } from './services/vocaClientRecords'
import HomeMessages, { AppVersionBadge, MessageRefreshBanner, useHomeMessages } from './services/HomeMessages'
import MessagesAdminPanel from './services/MessagesAdminPanel'
import ClientMergePanel from './services/ClientMergePanel'
import RecordSaveDialog from './services/RecordSaveDialog'
import RecordPrintDialog from './services/RecordPrintDialog'
import { listClientPrintCatalog, loadClientPrintRecord, printRecordRef, PRINT_FORM_NAMES, PRINT_TABLE_KINDS, type PrintRecordDetail, type PrintRecordRef } from './services/recordPrinting'
import { savedFormClientTarget, type RecordSaveChoice, type RecordSaveResult } from './services/recordSaveResult'
import { confirmSavedRecordId, SaveConfirmationPendingError } from './services/savedRecordConfirmation'
import {
  createEventResponse,
  EVENT_FIELD_DEFINITIONS,
  EVENTS_TABLE_ALIAS,
  loadEventDetailRecord,
  searchEventRecords,
  type EventDetailRecord,
  type EventPayload,
  type EventSearchRecord,
  updateEventResponse,
} from './services/event'
import {
  COMPASS_FILES_TABLE_ALIAS,
  createCompassFileRecord,
  loadCompassFileRecord,
  type CompassFileDownload,
} from './services/compassFiles'
import {
  createReleaseOfInformationResponse,
  RELEASE_OF_INFORMATION_PRIMARY_ID_FIELD,
  RELEASE_OF_INFORMATION_FIELDS,
  updateReleaseOfInformationResponse,
  RELEASE_OF_INFORMATION_TABLE_ALIAS,
  type ReleaseOfInformationPayload,
} from './services/releaseOfInformation'
import {
  CHILD_SAFETY_PLAN_FIELDS,
  CHILD_SAFETY_PLANS_TABLE_ALIAS,
  createChildSafetyPlanResponse,
  listChildSafetyPlansForProgramEnrollments,
  loadChildSafetyPlanDetailRecord,
  updateChildSafetyPlanResponse,
  type ChildSafetyPlanDetailRecord,
  type ChildSafetyPlanListRecord,
  type ChildSafetyPlanPayload,
} from './services/childSafetyPlan'
import {
  CHILD_ASSESSMENT_FIELDS,
  CHILD_ASSESSMENTS_TABLE_ALIAS,
  createChildAssessmentResponse,
  generateChildAssessmentRecordId,
  updateChildAssessmentResponse,
  type ChildAssessmentPayload,
} from './services/childAssessment'
import {
  CHILD_SHELTER_INTAKE_FIELDS,
  CHILD_SHELTER_INTAKES_PRIMARY_ID_FIELD,
  CHILD_SHELTER_INTAKES_TABLE_ALIAS,
  createChildShelterIntakeResponse,
  generateChildShelterIntakeRecordId,
  updateChildShelterIntakeResponse,
  type ChildShelterIntakePayload,
} from './services/childShelterIntake'
import {
  EMPLOYMENT_AND_BENEFITS_FIELDS,
  parsePublicAssistanceTypes,
  EMPLOYMENT_AND_BENEFITS_PRIMARY_ID_FIELD,
  EMPLOYMENT_AND_BENEFITS_TABLE_ALIAS,
  createEmploymentAndBenefitsResponse,
  generateEmploymentAndBenefitsRecordId,
  updateEmploymentAndBenefitsResponse,
  type EmploymentAndBenefitsPayload,
} from './services/employmentAndBenefits'
import {
  FINANCIAL_ASSISTANCE_FIELDS,
  FINANCIAL_ASSISTANCES_TABLE_ALIAS,
  createFinancialAssistanceResponse,
  generateFinancialAssistanceRecordId,
  updateFinancialAssistanceResponse,
  type FinancialAssistancePayload,
} from './services/financialAssistance'
import {
  MEDICAL_CONSENT_FORM_FIELDS,
  MEDICAL_CONSENT_FORMS_PRIMARY_ID_FIELD,
  MEDICAL_CONSENT_FORMS_TABLE_ALIAS,
  createMedicalConsentFormResponse,
  generateMedicalConsentFormRecordId,
  updateMedicalConsentFormResponse,
  type MedicalConsentFormPayload,
} from './services/medicalConsentForm'
import {
  PERSON_YOU_ARE_FLEEING_PROFILE_FIELDS,
  PERSON_YOU_ARE_FLEEING_PROFILES_PRIMARY_ID_FIELD,
  PERSON_YOU_ARE_FLEEING_PROFILES_TABLE_ALIAS,
  createPersonYouAreFleeingProfileResponse,
  generatePersonYouAreFleeingProfileRecordId,
  updatePersonYouAreFleeingProfileResponse,
  type PersonYouAreFleeingProfilePayload,
} from './services/personYouAreFleeingProfile'
import { loadPersonFleeingRecord } from './services/personFleeingRecord'
import ReadOnlyRecordDialog from './services/ReadOnlyRecordDialog'
import { listHouseholdMembersForHousehold } from './services/householdHistory'
import { normalizeDataverseRowId, sameDataverseRowId } from './services/householdMemberIdentity'
import {
  ELECTRONIC_DOCUMENT_FIELDS,
  ELECTRONIC_DOCUMENT_PROGRAM_OPTIONS,
  ELECTRONIC_DOCUMENTS_TABLE_ALIAS,
  createElectronicDocumentResponse,
  generateElectronicDocumentRecordId,
  listElectronicDocumentsForClient,
  loadElectronicDocumentDetailRecord,
  updateElectronicDocumentResponse,
  type ElectronicDocumentDetailRecord,
  type ElectronicDocumentListRecord,
  type ElectronicDocumentPayload,
} from './services/electronicDocument'
import {
  TERMS_AND_CONDITIONS_OF_SERVICE_ANIMALS_FIELDS,
  TERMS_AND_CONDITIONS_OF_SERVICE_ANIMALS_PRIMARY_ID_FIELD,
  TERMS_AND_CONDITIONS_OF_SERVICE_ANIMALS_TABLE_ALIAS,
  createTermsAndConditionsOfServiceAnimalsResponse,
  generateTermsAndConditionsOfServiceAnimalsRecordId,
  updateTermsAndConditionsOfServiceAnimalsResponse,
  type TermsAndConditionsOfServiceAnimalsPayload,
} from './services/termsAndConditionsOfServiceAnimals'
import {
  CONTRACT_FIELDS,
  CONTRACTS_TABLE_ALIAS,
  createContractResponse,
  updateContractResponse,
  type ContractPayload,
} from './services/contract'
import {
  PET_COMPANION_INTAKE_FIELDS,
  PET_COMPANION_INTAKES_PRIMARY_ID_FIELD,
  PET_COMPANION_INTAKES_TABLE_ALIAS,
  createPetCompanionIntakeResponse,
  generatePetCompanionIntakeRecordId,
  updatePetCompanionIntakeResponse,
  type PetCompanionIntakePayload,
} from './services/petCompanionIntake'
import {
  FUNDER_TRANSACTION_FIELDS,
  FUNDER_TRANSACTIONS_TABLE_ALIAS,
  createFunderTransactionResponse,
  updateFunderTransactionResponse,
  type FunderTransactionPayload,
} from './services/funderTransaction'
import {
  SHELTER_PROGRAM_GUIDELINES_FIELDS,
  SHELTER_PROGRAM_GUIDELINES_PRIMARY_ID_FIELD,
  SHELTER_PROGRAM_GUIDELINES_TABLE_ALIAS,
  createShelterProgramGuidelinesResponse,
  generateShelterProgramGuidelinesRecordId,
  updateShelterProgramGuidelinesResponse,
  type ShelterProgramGuidelinesPayload,
} from './services/shelterProgramGuidelines'
import {
  ADULT_ASSESSMENT_FIELDS,
  ADULT_ASSESSMENTS_TABLE_ALIAS,
  createAdultAssessmentResponse,
  listAdultAssessmentsForProgramEnrollments,
  loadAdultAssessmentDetailRecord,
  updateAdultAssessmentResponse,
  type AdultAssessmentDetailRecord,
  type AdultAssessmentListRecord,
  type AdultAssessmentPayload,
} from './services/adultAssessment'
import {
  createHealthWellnessResponse,
  HEALTH_WELLNESS_FIELDS,
  HEALTH_WELLNESS_TABLE_ALIAS,
  listHealthWellnessForClient,
  loadHealthWellnessDetailRecord,
  updateHealthWellnessResponse,
  type HealthWellnessDetailRecord,
  type HealthWellnessListRecord,
  type HealthWellnessPayload,
} from './services/healthAndWellnessQuestionnaire'
import {
  createFocusPlanResponse,
  FOCUS_PLAN_FIELDS,
  FOCUS_PLAN_GOAL_FIELDS,
  FOCUS_PLANS_TABLE_ALIAS,
  getFocusPlanGoalCount,
  GOAL_COLUMNS,
  GOAL_STATUS_OPTIONS,
  parseFocusGoalColumn,
  serializeFocusGoalColumn,
  listFocusPlansForProgramEnrollments,
  loadFocusPlanDetailRecord,
  updateFocusPlanResponse,
  type FocusPlanDetailRecord,
  type FocusPlanListRecord,
  type FocusPlanPayload,
} from './services/focusPlan'
import FocusPlanNeedsView from './services/FocusPlanNeedsView'
import {
  createInitialSafetyPlanResponse,
  INITIAL_SAFETY_PLAN_FIELDS,
  INITIAL_SAFETY_PLANS_TABLE_ALIAS,
  listInitialSafetyPlansForProgramEnrollments,
  loadInitialSafetyPlanDetailRecord,
  updateInitialSafetyPlanResponse,
  type InitialSafetyPlanDetailRecord,
  type InitialSafetyPlanListRecord,
  type InitialSafetyPlanPayload,
} from './services/initialSafetyPlan'
import {
  ACKNOWLEDGEMENT_AND_CONSENT_FIELDS,
  ACKNOWLEDGEMENT_AND_CONSENT_PRIMARY_ID_FIELD,
  ACKNOWLEDGEMENT_AND_CONSENT_TABLE_ALIAS,
  createAcknowledgementAndConsentResponse,
  updateAcknowledgementAndConsentResponse,
  type AcknowledgementAndConsentPayload,
} from './services/acknowledgementAndConsent'
import {
  ANIMAL_AGREEMENT_FIELDS,
  ANIMAL_AGREEMENT_PRIMARY_ID_FIELD,
  ANIMAL_AGREEMENT_TABLE_ALIAS,
  createAnimalAgreementResponse,
  generateAnimalAgreementRecordId,
  updateAnimalAgreementResponse,
  type AnimalAgreementPayload,
} from './services/animalAgreement'
import {
  createHouseholdResponse,
  HOUSEHOLD_FIELD_DEFINITIONS,
  HOUSEHOLDS_TABLE_ALIAS,
  type HouseholdListRecord,
  type HouseholdPayload,
  loadHouseholdDetailRecord,
  resolveHouseholdRowIdByRecordId,
  updateHouseholdResponse,
  listHouseholdsByIds,
} from './services/household'
import {
  createHouseholdHistoryRecord,
  createInitialHouseholdHistoryForClient,
  HOUSEHOLD_HISTORY_RELATIONSHIP_OPTIONS,
  listHouseholdHistoriesByHouseholdOrActivePool,
  listHouseholdHistoriesForClient,
  type HouseholdHistoryRecord,
  updateHouseholdHistoryRecord,
} from './services/householdHistory'
import {
  loadRolePermissionsForUser,
  type RolePermissionProfile,
} from './services/rolePermissions'
import {
  saveFormPicklistRow,
  type FormPicklistAdminPayload,
} from './services/formPicklists'
import type { CompassUser } from './types/auth'
import { loadStaffDirectoryEntries, type StaffDirectoryEntry } from './services/staffDirectory'
import { FUNDERS_TABLE_ALIAS, loadActiveFunderContracts, loadActiveFunders, loadFunderAdminData, type ActiveFunderContractOption, type ActiveFunderOption, type FunderAdminData } from './services/funders'
import { FUNDER_ADMIN_TABLES, saveFunderAdminRecord, validateFunderAdminValues, type FunderAdminKind } from './services/funderAdmin'
import { FunderBalanceSyncError } from './services/funderBalance'
import LegacyRecordMigrationPanel from './services/LegacyRecordMigrationPanel'
import LegacyFileTranslationPanel from './services/LegacyFileTranslationPanel'
import { BEDS_TABLE_ALIAS, assignBedsToEnrollment, importBedsCsv, isBedCheckoutDateValid, isBedSelectionRequired, listSelectableBedsForEnrollment, listBedManagementRecords, type AvailableBed, type BedManagementRecord } from './services/beds'
import {
  createGoalResponse,
  GOAL_FIELDS,
  GOAL_OPTIONS_BY_CATEGORY,
  GOAL_OTHER_OPTION,
  GOALS_TABLE_ALIAS,
  loadGoalDetailRecord,
  listGoalsForProgramEnrollments,
  type GoalDetailRecord,
  type GoalListRecord,
  type GoalPayload,
  updateGoalResponse,
} from './services/goals'
import { generateSequentialRecordId } from './services/recordIds'
import { EMPTY_SYSTEM_FIELDS, loadSystemFields, type SystemFields } from './services/systemFields'
import { withRecordAudit } from './services/recordAudit'
import RecordSystemFields from './services/RecordSystemFields'
import { listClientLinkedRecords, type ClientLinkedRecord, type ClientLinkedRecordSource } from './services/clientLinkedRecords'
import HouseholdHistoryBackfillPanel from './services/HouseholdHistoryBackfillPanel'
import FunderTranslationPanel from './services/FunderTranslationPanel'
import { loadClientConsentFormRecord, getClientConsentFormFields, CLIENT_RECORD_SOURCES, CLIENT_RECORD_EDIT_KINDS, CLIENT_RECORD_LABELS, type ClientConsentFormKind, type ClientConsentFormRecord } from './services/clientConsentForms'
import { ARCHIVE_TABLES, searchArchivedRecords, setRecordArchived, type ArchivedRecord } from './services/archive'
import ProgramTableSearchPanel from './services/ProgramTableSearchPanel'
import DataverseAdvancedSearch from './services/DataverseAdvancedSearch'
import { createClientAdvancedSearch } from './services/clientAdvancedSearch'
import type { AdvancedSearchCriterion } from './services/advancedSearch'
import WorkRecordSearch from './services/WorkRecordSearch'
import { mapWorkRecords } from './services/workSearch'
import SortableRecordTable from './services/SortableRecordTable'
import { getFormClientContext } from './services/formClientContext'
import type { ProgramSearchFields } from './services/programSearchCatalog'

const SERVICES_BY_CATEGORY_LOOKUP = buildNormalizedOptionMap(SERVICE_OPTIONS_BY_CATEGORY)
const WHERE_DID_YOU_REFER_BY_SERVICE_LOOKUP = buildNormalizedOptionMap(WHERE_DID_YOU_REFER_OPTIONS_BY_SERVICE)

function normalize(text: string): string {
  return String(text || '').trim().toLowerCase()
}

function canOpenAttachmentInBrowser(filename: string, mimetype: string): boolean {
  const normalizedMime = normalize(mimetype).split(';')[0]
  if (normalizedMime === 'application/pdf' || normalizedMime.startsWith('image/')) return true
  return /\.(pdf|png|jpe?g|gif|bmp|webp|svg|tiff?|avif|heic|heif)$/i.test(String(filename || '').trim())
}

type FormInputProps = InputHTMLAttributes<HTMLInputElement>

function localDateValue(now = new Date()): string {
  const year = now.getFullYear()
  const month = String(now.getMonth() + 1).padStart(2, '0')
  const day = String(now.getDate()).padStart(2, '0')
  return `${year}-${month}-${day}`
}

function localTimeValue(now = new Date()): string {
  const hours = String(now.getHours()).padStart(2, '0')
  const minutes = String(now.getMinutes()).padStart(2, '0')
  return `${hours}:${minutes}`
}

function formatSystemTimestamp(value: string): string {
  const cleanValue = String(value || '').trim()
  if (!cleanValue) return ''
  const parsed = new Date(cleanValue)
  return Number.isNaN(parsed.getTime()) ? cleanValue : parsed.toLocaleString()
}

function FormInput({ type = 'text', onChange, disabled, readOnly, ...props }: FormInputProps) {
  const temporalType = type === 'date' || type === 'time' || type === 'datetime-local'
  if (!temporalType) {
    return <input {...props} type={type} onChange={onChange} disabled={disabled} readOnly={readOnly} />
  }

  const shortcutLabel = type === 'date' ? 'TODAY' : 'NOW'
  const applyShortcut = () => {
    if (!onChange || disabled || readOnly) return
    const now = new Date()
    const nextValue = type === 'date'
      ? localDateValue(now)
      : type === 'time'
        ? localTimeValue(now)
        : `${localDateValue(now)}T${localTimeValue(now)}`
    const target = { value: nextValue } as HTMLInputElement
    onChange({ target, currentTarget: target } as ChangeEvent<HTMLInputElement>)
  }

  return (
    <div className="form-temporal-control">
      <input {...props} type={type} onChange={onChange} disabled={disabled} readOnly={readOnly} />
      {!disabled && !readOnly ? (
        <button
          type="button"
          className="form-temporal-shortcut"
          onMouseDown={(event) => event.preventDefault()}
          onClick={(event) => {
            event.preventDefault()
            event.stopPropagation()
            applyShortcut()
          }}
          aria-label={type === 'date' ? 'Set date to today' : 'Set time to now'}
        >
          {shortcutLabel}
        </button>
      ) : null}
    </div>
  )
}

type ReadOnlyFormFieldDefinition = {
  field: string
  label: string
  input: string
  options?: readonly string[]
  section?: string
  title?: string
}

type ReadOnlyFormSectionsProps = {
  printMode?: boolean
  fields: readonly ReadOnlyFormFieldDefinition[]
  values: Record<string, unknown>
  sections: readonly string[]
  idPrefix: string
  getSection?: (field: ReadOnlyFormFieldDefinition) => string
  isVisible?: (field: ReadOnlyFormFieldDefinition) => boolean
  formatValue?: (field: ReadOnlyFormFieldDefinition, value: string) => string
  onOpenFile?: (fileId: string) => void
}

function ReadOnlyFormSections({
  printMode = false,
  fields,
  values,
  sections,
  idPrefix,
  getSection = (field) => String(field.section || 'Main'),
  isVisible = () => true,
  formatValue = (_field, value) => value,
  onOpenFile,
}: ReadOnlyFormSectionsProps) {
  const parseSelections = (value: string) => String(value || '').split(/[,;]+/).map((entry) => entry.trim()).filter(Boolean)

  return (
    <div className="hub-form-sections hub-readonly-form">
      {sections.map((section) => {
        const sectionFields = fields
          .filter((field) => getSection(field) === section)
          .filter(isVisible)
        if (sectionFields.length === 0) return null

        return (
          <section className="hub-form-section" key={`${idPrefix}-${section}`}>
            <h4 className="hub-form-section-title">{section}</h4>
            <div className="hub-form-grid">
              {sectionFields.map((fieldDef) => {
                const rawValue = String(values[fieldDef.field] ?? '')
                const formattedValue = formatValue(fieldDef, rawValue)
                const input = String(fieldDef.input || 'text')
                const fieldId = `${idPrefix}-${fieldDef.field}`
                const options = Array.from(fieldDef.options || [])
                const isWide = ['textarea', 'checkbox-group', 'radio', 'html', 'goals', 'file'].includes(input)

                if (input === 'html') {
                  return fieldDef.title ? (
                    <div key={fieldDef.field} className="hub-form-field hub-form-field-wide guidelines-html-header">
                      <div className="guidelines-html-title">{fieldDef.title}</div>
                      <div className="guidelines-html-content">{fieldDef.label}</div>
                    </div>
                  ) : (
                    <div key={fieldDef.field} className="hub-form-field hub-form-field-wide acknowledgement-html-header">{fieldDef.label}</div>
                  )
                }

                if (printMode && input !== 'goals') {
                  const selections = parseSelections(formattedValue)
                  const choice = input === 'radio' || input === 'checkbox-group'
                  return <div key={fieldDef.field} className={`hub-form-field${isWide ? ' hub-form-field-wide' : ''}`}><span>{fieldDef.label}</span>
                    <div className={`record-print-value${choice ? ' options' : ''}`}>
                      {choice ? options.map((option) => <span key={option}>{input === 'radio' ? (normalize(formattedValue) === normalize(option) ? '(x) ' : '( ) ') : (selections.some((entry) => normalize(entry) === normalize(option)) ? '[x] ' : '[ ] ')}{option}</span>)
                        : input === 'file' ? (rawValue ? 'Attached file (not included in this printout)' : 'No file attached')
                        : input === 'checkbox' ? (['yes', 'true', '1', 'checked'].includes(normalize(formattedValue)) ? 'Yes' : 'No')
                        : formattedValue || '-'}
                    </div>
                  </div>
                }

                if (input === 'file') {
                  return (
                    <div key={fieldDef.field} className="hub-form-field hub-form-field-wide">
                      <span>{fieldDef.label}</span>
                      <button type="button" className="secondary" disabled={!rawValue || !onOpenFile} onClick={() => { if (rawValue && onOpenFile) onOpenFile(rawValue) }}>
                        {rawValue ? 'View attached file' : 'No file attached'}
                      </button>
                    </div>
                  )
                }

                if (input === 'radio') {
                  return (
                    <div key={fieldDef.field} className="hub-form-field hub-form-field-wide">
                      <span>{fieldDef.label}</span>
                      <div className="hub-form-option-grid">
                        {options.map((option) => (
                          <label key={`${fieldDef.field}-${option}`} className="permission-check">
                            <input type="radio" name={fieldId} checked={normalize(formattedValue) === normalize(option)} disabled readOnly />
                            <span>{option}</span>
                          </label>
                        ))}
                      </div>
                    </div>
                  )
                }

                if (input === 'checkbox-group') {
                  const selections = parseSelections(formattedValue)
                  return (
                    <div key={fieldDef.field} className="hub-form-field hub-form-field-wide">
                      <span>{fieldDef.label}</span>
                      <div className="hub-form-option-grid">
                        {options.map((option) => (
                          <label key={`${fieldDef.field}-${option}`} className="permission-check">
                            <input type="checkbox" checked={selections.some((entry) => normalize(entry) === normalize(option))} disabled readOnly />
                            <span>{option}</span>
                          </label>
                        ))}
                      </div>
                    </div>
                  )
                }

                if (input === 'checkbox') {
                  const checked = ['yes', 'true', '1', 'checked'].includes(normalize(formattedValue))
                  return (
                    <label key={fieldDef.field} className="hub-form-field hub-form-field-wide permission-check" htmlFor={fieldId}>
                      <input id={fieldId} type="checkbox" checked={checked} disabled readOnly />
                      <span>{fieldDef.label}</span>
                    </label>
                  )
                }

                if (input === 'select') {
                  const hasCurrentOption = options.some((option) => normalize(option) === normalize(formattedValue))
                  return (
                    <label key={fieldDef.field} className="hub-form-field" htmlFor={fieldId}>
                      <span>{fieldDef.label}</span>
                      <select id={fieldId} value={formattedValue} disabled>
                        <option value="">--Please Select--</option>
                        {formattedValue && !hasCurrentOption ? <option value={formattedValue}>{formattedValue}</option> : null}
                        {options.filter((option) => option !== '--Please Select--').map((option) => <option key={`${fieldDef.field}-${option}`} value={option}>{option}</option>)}
                      </select>
                    </label>
                  )
                }

                if (input === 'goals') return <FocusPlanNeedsView key={fieldDef.field} values={values} idPrefix={fieldId} printMode={printMode} />

                if (input === 'textarea') {
                  return (
                    <label key={fieldDef.field} className="hub-form-field hub-form-field-wide" htmlFor={fieldId}>
                      <span>{fieldDef.label}</span>
                      <textarea id={fieldId} value={formattedValue} readOnly disabled />
                    </label>
                  )
                }

                const temporalValue = input === 'date'
                  ? formattedValue.slice(0, 10)
                  : input === 'datetime'
                    ? formattedValue.replace(/Z$/i, '').slice(0, 16)
                    : formattedValue
                const inputType = input === 'date'
                  ? 'date'
                  : input === 'datetime'
                    ? 'datetime-local'
                    : input === 'time'
                      ? 'time'
                      : input === 'number' || input === 'currency'
                        ? 'number'
                        : input === 'email'
                          ? 'email'
                          : input === 'phone'
                            ? 'tel'
                            : 'text'

                return (
                  <label key={fieldDef.field} className={`hub-form-field${isWide ? ' hub-form-field-wide' : ''}`} htmlFor={fieldId}>
                    <span>{fieldDef.label}</span>
                    <FormInput id={fieldId} type={inputType} step={input === 'currency' ? '0.01' : undefined} value={temporalValue} readOnly disabled />
                  </label>
                )
              })}
            </div>
          </section>
        )
      })}
    </div>
  )
}

function getRequiredFieldLabels(message: string): string[] | null {
  const match = String(message || '').match(/^Please complete(?: or correct)? required field\(s\):\s*(.+)$/)
  if (!match) return null

  return match[1]
    .split(/,\s*/)
    .map((label) => label.trim())
    .filter(Boolean)
}

function dedupeOptions(options: string[]): string[] {
  const seen = new Set<string>()
  const result: string[] = []

  for (const option of options) {
    const value = String(option || '').trim()
    if (!value) continue

    const key = normalize(value)
    if (seen.has(key)) continue
    seen.add(key)
    result.push(value)
  }

  return result
}

function normalizeGuidText(value: string): string {
  return String(value || '').trim().replace(/[{}]/g, '').toLowerCase()
}

function isGuidText(value: string): boolean {
  return /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i.test(String(value || '').trim())
}

function formatProgramEnrollmentLookupLabel(row: Pick<ProgramEnrollmentListRecord, 'recordId' | 'program' | 'serviceStartDate'>): string {
  const recordId = String(row.recordId || '').trim()
  if (recordId) return recordId

  const fallback = [row.program || 'Program Enrollment', row.serviceStartDate || '']
    .map((entry) => String(entry || '').trim())
    .filter(Boolean)
    .join(' | ')
  return fallback || 'Program Enrollment'
}

function buildNormalizedOptionMap(optionMap: Record<string, string[]>): Record<string, string[]> {
  return Object.fromEntries(
    Object.entries(optionMap).map(([key, options]) => [normalize(key), dedupeOptions(options)]),
  )
}

const SERVICES_RADIO_FIELD_NAMES = new Set([
  'cmps_meetingmode',
  'cmps_wasinformationservicereceivedhelpful',
])

const SERVICES_IMPORT_ONLY_OTHER_FIELDS = new Set([
  'cmps_servicecategory',
  'cmps_servicesite',
  'cmps_service',
])

const PROGRAMS_WITH_SHELTER_QUESTIONS = new Set([
  'dvstop',
  'autumn house',
  'faith house',
  'caafa shelter',
])

const PROGRAMS_FOR_SV_HEAR_ABOUT_US = new Set([
  'reach center',
  'sv helpline',
])

const DISCHARGE_SUMMARY_FIELDS = new Set([
  'cmps_lengthofstay',
  'cmps_dischargestatus',
  'cmps_dischargenotes',
  'cmps_exitdestination',
  'cmps_isthisasafepermanentortransitionalhousin1',
  'cmps_staffnameandsignature',
])

const SPECIAL_CLASSIFICATION_DISABILITY_TAGS = new Set([
  'deaf/hard of hearing',
  'victims with disabilities: cognitive/physical/mental',
])

const HELPLINE_SAFETY_ASSESSMENT_FIELDS = [
  'cmps_dateoflastincident',
  'cmps_canyoutellmeaboutthelastincident',
  'cmps_hasphysicalviolenceincreasedrecentlyforyouora',
  'cmps_doyoubelieveyourpartneriscapableofkillingyou',
  'cmps_doesyourpartnerhaveaweaponoraccesstoaweapon',
  'cmps_hasyourpartnerevertriedtochokeorsuffocateyou',
  'cmps_isyourpartnerviolentlycontrollingandconstantl',
  'cmps_havetheyeverbeenviolentwithyouwhileyouwerepre',
  'cmps_numberofyesanswers',
  'cmps_dangerassessmentevaluation',
  'cmps_issheltertheappropriateinterventionforthiscal',
  'cmps_arethereanyareasinmetrophoenixwhereyoufeeluns',
] as const

const HELPLINE_CURRENT_LIVING_SITUATION_FIELDS = [
  'cmps_whereareyoucurrentlystaying',
  'cmps_doyouhaveasafealternativeforhousing',
  'cmps_doyoulivewiththepersonyouarefleeing',
  'cmps_ifyeshowlongcanyoustayatthissafelocation',
] as const

const HELPLINE_OVW_LATE_LIFE_FIELDS = [
  'cmps_isthiscallerover50yearsofage',
  'cmps_wasthecallerabusedbyaspousepartnerclosefamily',
  'cmps_hasthecallerrecentlyexperienceddomesticviolen',
] as const

const HELPLINE_SV_REQUIRED_FIELDS = new Set([
  'cmps_svhelplineclienttype',
  'cmps_reasonsforcall',
  'cmps_abusestatus',
  'cmps_abusestatusother',
  'cmps_historyofsv',
  'cmps_wherewasthehelplinecallerreferredfrom',
  'cmps_wherewasthehelplinecallerreferredto',
  'cmps_calloutcome1',
])

const HELPLINE_DV_DETAILS_FIELDS = new Set([
  'cmps_areyouinasafeplace',
  'cmps_whereisthecaller',
  'cmps_doyouneedimmediatemedicalattention',
  'cmps_wouldyouliketobegintheshelterscreeningprocess',
  'cmps_wouldyouliketocompletetheovwlatelifeabusescre',
  'cmps_wasthecallerturnedaway',
  'cmps_helplineturnawayreason',
  'cmps_helplineturnawayreasonother',
])

const HELPLINE_SHARED_DETAILS_FIELDS = new Set([
  'cmps_reasonsforcall',
  'cmps_abusestatus',
  'cmps_abusestatusother',
  'cmps_wherewasthehelplinecallerreferredfrom',
  'cmps_wherewasthehelplinecallerreferredto',
  'cmps_calloutcome1',
])

const HELPLINE_SV_ONLY_DETAILS_FIELDS = new Set([
  'cmps_svhelplineclienttype',
  'cmps_historyofsv',
])

const HELPLINE_SHARED_RESPONSE_FIELDS = new Set([
  'cmps_wastheserviceinformationreceivedhelpful',
  'cmps_callerresponse',
])

const HELPLINE_ALWAYS_REQUIRED_FIELDS = [
  'cmps_program',
  'cmps_dateofcontact',
  'cmps_timeofcontact',
  'cmps_contacttype',
  'cmps_calllengthminutes',
] as const

const HELPLINE_OPTIONAL_DV_DETAILS_FIELDS = new Set([
  'cmps_wherewasthehelplinecallerreferredto',
  'cmps_whereisthecaller',
  'cmps_callerresponse',
])


const SHELTER_SCREENING_HOUSEHOLD_FIELDS = [
  'cmps_istthereanyoneelseyouneedtobringtoshelterwith',
  'cmps_areyoucurrentlypregnant',
  'cmps_numberofchildrencomingtotheshelter',
  'cmps_agesofchildren',
  'cmps_doyouneedtobringanypetswithyoutoshelter',
  'cmps_numberofpets',
  'cmps_wasanyinformationdisclosedthatrequiresareport',
] as const

const SHELTER_SCREENING_SAFETY_FIELDS = [
  'cmps_doyouhaveanymedicalconditionsthesheltershould',
  'cmps_doyouhaveanyfoodallergiesordietaryrestriction',
  'cmps_doyouoryourchildrenhaveanyphysicalormedicatio',
  'cmps_willyourequireanyspecialaccommodationsuponent',
  'cmps_listspecialaccommodations',
] as const

const SHELTER_SCREENING_OTHER_INFORMATION_FIELDS = [
  'cmps_isthereanyonewhoneedstoknowyourwhereabouts',
  'cmps_ifyespleaseexplain',
  'cmps_doyouhaveanycurrentorpendinglegalorcustodyiss',
  'cmps_legalorcustodyissuenotes',
  'cmps_doyouoryourchildrenhaveanymedicalconditionsth',
  'cmps_wascallerplacedinshelter',
  'cmps_shelterturnawayreason',
  'cmps_shelterturnawayreasonother',
] as const

function getHelplineFormSection(field: string, values: HelplinePayload = {}): 'Main' | 'DV Helpline Details' | 'SV Helpline Details' | 'Current Living Situation' | 'Safety Assessment' | 'OVW Late Life Abuse Screening' | 'Notes' {
  if (HELPLINE_CURRENT_LIVING_SITUATION_FIELDS.includes(field as any)) return 'Current Living Situation'
  if (HELPLINE_SAFETY_ASSESSMENT_FIELDS.includes(field as any)) return 'Safety Assessment'
  if (HELPLINE_OVW_LATE_LIFE_FIELDS.includes(field as any)) return 'OVW Late Life Abuse Screening'
  if (HELPLINE_DV_DETAILS_FIELDS.has(field)) return 'DV Helpline Details'
  if (HELPLINE_SV_ONLY_DETAILS_FIELDS.has(field)) return 'SV Helpline Details'
  if (HELPLINE_SHARED_DETAILS_FIELDS.has(field) || HELPLINE_SHARED_RESPONSE_FIELDS.has(field)) {
    return normalize(String(values.cmps_program || '')) === normalize('SV Helpline')
      ? 'SV Helpline Details'
      : 'DV Helpline Details'
  }
  if (field === 'cmps_notes') return 'Notes'
  return 'Main'
}

function getShelterScreeningFormSection(field: string): 'Main' | 'Household Makeup' | 'Safety Assessment' | 'Other Information' {
  if (SHELTER_SCREENING_HOUSEHOLD_FIELDS.includes(field as any)) return 'Household Makeup'
  if (SHELTER_SCREENING_SAFETY_FIELDS.includes(field as any)) return 'Safety Assessment'
  if (SHELTER_SCREENING_OTHER_INFORMATION_FIELDS.includes(field as any)) return 'Other Information'
  return 'Main'
}

function getDerivedProgramEnrollmentType(program: string): string {
  const selectedProgram = String(program || '').trim()
  if (!selectedProgram) return ''
  return normalize(selectedProgram) === normalize('Autumn House') ? 'Residential' : 'Non-Residential'
}

function getDefaultProgramEnrollmentProjectType(program: string): string {
  const selectedProgram = normalize(String(program || '').trim())
  if (selectedProgram === normalize('DV Outreach') || selectedProgram === normalize('REACH') || selectedProgram === normalize('REACH Center')) {
    return 'Services Only'
  }
  if (selectedProgram === normalize('Autumn House')) return 'Transitional Housing'
  return ''
}

type NameParts = {
  first: string
  middle: string
  last: string
}

type PhoneParts = {
  part1: string
  part2: string
  part3: string
}

type AddressParts = {
  line1: string
  line2: string
  city: string
  state: string
  county: string
  zip: string
}

const US_STATE_OPTIONS = [
  'AL', 'AK', 'AZ', 'AR', 'CA', 'CO', 'CT', 'DE', 'FL', 'GA',
  'HI', 'ID', 'IL', 'IN', 'IA', 'KS', 'KY', 'LA', 'ME', 'MD',
  'MA', 'MI', 'MN', 'MS', 'MO', 'MT', 'NE', 'NV', 'NH', 'NJ',
  'NM', 'NY', 'NC', 'ND', 'OH', 'OK', 'OR', 'PA', 'RI', 'SC',
  'SD', 'TN', 'TX', 'UT', 'VT', 'VA', 'WA', 'WV', 'WI', 'WY',
]

const EMPTY_NAME_PARTS: NameParts = { first: '', middle: '', last: '' }
const EMPTY_PHONE_PARTS: PhoneParts = { part1: '', part2: '', part3: '' }
const EMPTY_ADDRESS_PARTS: AddressParts = { line1: '', line2: '', city: '', state: '', county: '', zip: '' }

function parseNameParts(value: string): NameParts {
  const tokens = String(value || '').trim().split(/\s+/).filter(Boolean)
  if (tokens.length === 0) return EMPTY_NAME_PARTS
  if (tokens.length === 1) return { first: tokens[0], middle: '', last: '' }
  if (tokens.length === 2) return { first: tokens[0], middle: '', last: tokens[1] }
  return {
    first: tokens[0],
    middle: tokens.slice(1, -1).join(' '),
    last: tokens[tokens.length - 1],
  }
}

function formatNameParts(parts: NameParts): string {
  return [parts.first, parts.middle, parts.last].map((entry) => entry.trim()).filter(Boolean).join(' ')
}

function getClientProfileNameParts(values: Partial<Record<ClientProfileFieldName, string>> | undefined): NameParts {
  const first = String(values?.cmps_name || '').trim()
  const middle = String(values?.cmps_middlename || '').trim()
  const last = String(values?.cmps_lastname || '').trim()

  // Backward compatibility for older records where full name was stored in cmps_name only.
  if (!middle && !last && first.includes(' ')) {
    return parseNameParts(first)
  }

  return { first, middle, last }
}

function getClientProfileDisplayName(values: Partial<Record<ClientProfileFieldName, string>> | undefined): string {
  return formatNameParts(getClientProfileNameParts(values))
}

function parsePhoneParts(value: string): PhoneParts {
  const digits = String(value || '').replace(/\D/g, '').slice(0, 10)
  return {
    part1: digits.slice(0, 3),
    part2: digits.slice(3, 6),
    part3: digits.slice(6, 10),
  }
}

function formatPhoneParts(parts: PhoneParts): string {
  const part1 = parts.part1.trim()
  const part2 = parts.part2.trim()
  const part3 = parts.part3.trim()
  if (!part1 && !part2 && !part3) return ''
  return [part1, part2, part3].filter(Boolean).join('-')
}

function calculateLengthOfStay(startDate: string, endDate: string): string {
  const start = String(startDate || '').trim()
  const end = String(endDate || '').trim()
  if (!start || !end) return ''

  const startTime = Date.parse(`${start.slice(0, 10)}T00:00:00Z`)
  const endTime = Date.parse(`${end.slice(0, 10)}T00:00:00Z`)
  if (Number.isNaN(startTime) || Number.isNaN(endTime) || endTime < startTime) return ''
  return String(Math.floor((endTime - startTime) / 86400000))
}

function parsePrimaryLanguage(value: string): { selected: string; otherText: string } {
  const raw = String(value || '').trim()
  if (!raw) return { selected: '', otherText: '' }
  const normalized = normalize(raw)
  if (normalized.startsWith('other:')) {
    return { selected: 'Other', otherText: raw.slice(raw.indexOf(':') + 1).trim() }
  }
  if (normalized === 'other') return { selected: 'Other', otherText: '' }
  return { selected: raw, otherText: '' }
}

function getClientProfileAddressParts(values: Partial<Record<ClientProfileFieldName, string>> | undefined): AddressParts {
  // Also hydrates the live draft after each keystroke: keep spaces as typed.
  const current: AddressParts = {
    line1: String(values?.cmps_addressline1 || ''),
    line2: String(values?.cmps_addressline2 || ''),
    city: String(values?.cmps_city || ''),
    state: String(values?.cmps_state || ''),
    county: String(values?.cmps_county || ''),
    zip: String(values?.cmps_zip || ''),
  }

  if (Object.values(current).some(Boolean)) return current

  // Backward compatibility for older records where address was saved in cmps_previousaddress.
  const legacyRaw = String((values as Record<string, string> | undefined)?.cmps_previousaddress || '')
  const lines = legacyRaw.split(/\r?\n/).map((line) => line.trim())
  const find = (prefix: string): string => {
    const line = lines.find((entry) => normalize(entry).startsWith(normalize(prefix))) || ''
    return line.includes(':') ? line.slice(line.indexOf(':') + 1).trim() : ''
  }

  return {
    line1: find('Address line 1:'),
    line2: find('Address line 2:'),
    city: find('City:'),
    state: find('State:'),
    county: find('County:'),
    zip: find('Zip:'),
  }
}

function calculateAgeFromDateOfBirth(dob: string): string {
  const input = String(dob || '').trim()
  const match = input.match(/^(\d{4})-(\d{2})-(\d{2})(?:T.*)?$/)
  if (!match) return ''
  const year = Number(match[1]), month = Number(match[2]), day = Number(match[3])
  const leap = year % 4 === 0 && (year % 100 !== 0 || year % 400 === 0)
  const days = [31, leap ? 29 : 28, 31, 30, 31, 30, 31, 31, 30, 31, 30, 31]
  if (year < 1 || month < 1 || month > 12 || day < 1 || day > days[month - 1]) return ''

  const today = new Date()
  let age = today.getFullYear() - year
  const hasHadBirthdayThisYear =
    today.getMonth() + 1 > month ||
    (today.getMonth() + 1 === month && today.getDate() >= day)

  if (!hasHadBirthdayThisYear) age -= 1
  return age >= 0 ? String(age) : ''
}

function toDateTimeLocalInputValue(rawValue: string): string {
  const text = String(rawValue || '').trim()
  if (!text) return ''
  const dateOnlyMatch = text.match(/^(\d{4}-\d{2}-\d{2})$/)
  if (dateOnlyMatch) return `${dateOnlyMatch[1]}T00:00`

  const dateTimeMatch = text.match(/^(\d{4}-\d{2}-\d{2})T(\d{2}:\d{2})/)
  if (dateTimeMatch) return `${dateTimeMatch[1]}T${dateTimeMatch[2]}`

  return text
}

function resolveServicesDependentOptions(field: string, baseOptions: string[], values: Record<string, string>): string[] {
  const canonicalOptions = baseOptions.map((option) => normalize(option) === normalize('Legal Advocacy') ? 'Legal & Medical Advocacy' : option)
  if (field === 'cmps_additionalservicedetail') return resolveServiceAdditionalDetailOptions(canonicalOptions)
  if (field === 'cmps_service') {
    const category = normalize(values.cmps_servicecategory || '')
    if (!category) return dedupeOptions(canonicalOptions)
    const options = SERVICES_BY_CATEGORY_LOOKUP[category] || []
    return [...options.filter((option) => normalize(option) !== normalize('Other')), 'Other']
  }

  if (field === 'cmps_wheredidyourefer') {
    const service = normalize(values.cmps_service || '')
    if (!service) return []
    return WHERE_DID_YOU_REFER_BY_SERVICE_LOOKUP[service] || []
  }

  return dedupeOptions(canonicalOptions)
}

const VOCA_DIRECT_CATEGORY_TO_FIELD: Record<string, string> = {
  'information and referral': 'cmps_informationandreferral',
  'personal advocacy/accompaniment': 'cmps_personaladvocacyaccompaniment',
  'emotional support or safety services': 'cmps_emotionalsupportorsafetyservices',
  'shelter/housing services': 'cmps_shelterhousingservices',
  'criminal justice system assistance': 'cmps_criminalciviljusticeassistance',
}

function startsWithReachCenter(value: string): boolean {
  return normalize(value).startsWith(normalize('REACH Center'))
}

function isReachCenterProgramEnrollment(
  values: Record<string, string>,
  programEnrollmentsForClient: ProgramEnrollmentListRecord[],
): boolean {
  const selected = String(values.cmps_programenrollment || '').trim()
  if (!selected) return false
  if (startsWithReachCenter(selected)) return true

  const selectedKey = normalizeGuidText(selected)
  const linkedRow = programEnrollmentsForClient.find((row) => normalizeGuidText(String(row.id || '')) === selectedKey)
  if (!linkedRow) return startsWithReachCenter(selected)

  return startsWithReachCenter(String(linkedRow.program || ''))
}

function isServicesFieldVisible(
  field: string,
  values: Record<string, string>,
  programEnrollmentsForClient: ProgramEnrollmentListRecord[],
): boolean {
  const funder = normalize(String(values.cmps_funder || ''))
  const directServiceCategory = normalize(String(values.cmps_directservicecategories || ''))

  if (field === 'cmps_servicecost') {
    return normalize(String(values.cmps_servicecategory || '')) === normalize('OVW Client Assistance')
  }

  if (field === 'cmps_clientresponsefeedback' || field === 'cmps_wasinformationservicereceivedhelpful') {
    return isReachCenterProgramEnrollment(values, programEnrollmentsForClient)
  }

  if (field === 'cmps_meetingmodeother') {
    return normalize(String(values.cmps_meetingmode || '')) === normalize('Other')
  }

  if (Object.values(VOCA_DIRECT_CATEGORY_TO_FIELD).includes(field)) {
    if (funder !== normalize('VOCA') && funder !== normalize('OVW-Late Life')) return false
    const mappedField = VOCA_DIRECT_CATEGORY_TO_FIELD[directServiceCategory]
    return mappedField === field
  }

  if (field === 'cmps_wheredidyourefer') {
    const service = normalize(String(values.cmps_service || ''))
    return service === normalize('External Referral') || service === normalize('Internal Referral')
  }

  if (field === 'cmps_wheredidyoureferother') {
    return normalize(String(values.cmps_wheredidyourefer || '')) === normalize('Other')
  }

  if (field === 'cmps_serviceother') {
    return normalize(String(values.cmps_service || '')) === normalize('Other')
  }

  if (field === 'cmps_servicecategoryother') {
    return normalize(String(values.cmps_servicecategory || '')) === normalize('Other')
  }

  if (field === 'cmps_servicesiteother') {
    return normalize(String(values.cmps_servicesite || '')) === normalize('Other')
  }

  if (field === 'cmps_additionalservicedetail') {
    const isSupportGroupDetail = normalize(String(values.cmps_servicecategory || '')) === normalize('Emotional Wellness & Healing')
      && normalize(String(values.cmps_service || '')) === normalize('Support Groups')
    const isImportedOther = normalize(String(values.cmps_additionalservicedetail || '')) === normalize('Other')
      || !!String(values.cmps_additionalservicedetailother || '').trim()
    return isSupportGroupDetail || isImportedOther
  }

  if (field === 'cmps_additionalservicedetailother') {
    return normalize(String(values.cmps_additionalservicedetail || '')) === normalize('Other')
  }

  return true
}

type AdminMember = {
  id: string
  email: string
  name: string
}

type AdminPermissionRow = {
  formName: string
  view: boolean
  search: boolean
  create: boolean
  edit: boolean
  ignoreProgramAssignment: boolean
}

type RoleEditRow = {
  originalRoleName: string
  id: string
  roleName: string
  members: AdminMember[]
  permissions: AdminPermissionRow[]
}

type HubSection = {
  title: string
  body: string
  bullets: string[]
}

type ClientServicesListRecord = ServicesListRecord & {
  programEnrollmentRowId: string
  programEnrollmentRecordId: string
  programEnrollmentProgram: string
}

type ClientBedEnrollmentListRecord = BedEnrollmentListRecord & {
  programEnrollmentRowId: string
  programEnrollmentRecordId: string
  programEnrollmentProgram: string
}

type CaseLoadRecord = ClientProfileSearchRecord & {
  searchValues?: Record<string, string>
  enrollments: Array<{
    enrollmentId: string
    program: string
    startDate: string
    endDate: string
    recordId: string
    staffAssigned: string
  }>
}

type WorkHierarchyLevel = 'staff' | 'supervisor' | 'manager' | 'director'

type PendingVocaItem = {
  client: ClientProfileSearchRecord & { searchValues?: Record<string, string> }
  program: string
  enrollmentRecordId: string
  startDate: string
  endDate: string
  enrollmentId: string
  reason: PendingVocaReason
}

function getWorkHierarchyLevel(roleNames: string[], authRole = ''): WorkHierarchyLevel {
  const roleText = [...roleNames, authRole].map(roleKey).join(' ')
  if (roleText.includes('director') || roleText.includes('superadmin') || roleText.includes('admin')) return 'director'
  if (roleText.includes('manager')) return 'manager'
  if (roleText.includes('supervisor')) return 'supervisor'
  return 'staff'
}

function getStaffProgramKeys(entry: StaffDirectoryEntry): Set<string> {
  const programs = new Set(
    (entry.memberships || [])
      .map((membership) => normalize(membership.program))
      .filter(Boolean),
  )
  HUB_DEFINITIONS
    .filter((hub) => entry.roleNames.some((roleName) => hubMatchesRole(hub, roleName)))
    .forEach((hub) => programs.add(normalize(hub.title)))
  return programs
}

async function buildCaseLoadRecords(enrollments: ProgramEnrollmentListRecord[]): Promise<CaseLoadRecord[]> {
  const clientIds = Array.from(new Set(enrollments.map((enrollment) => enrollment.clientRowId || '').filter(Boolean)))
  const clientDetails = await mapWorkRecords(clientIds, async (clientRowId) => {
    try {
      return await loadClientProfileDetailRecord(clientRowId)
    } catch {
      return null
    }
  })
  const clientById = new Map<string, ClientProfileSearchRecord & { searchValues: Record<string, string> }>()
  clientDetails.forEach((detail) => {
    if (!detail) return
    const values = detail.values as Record<string, string>
    clientById.set(normalize(detail.id), {
      id: detail.id,
      recordId: detail.recordId,
      name: [values.cmps_name, values.cmps_middlename, values.cmps_lastname].filter(Boolean).join(' '),
      hmisId: values.cmps_hmisid || '',
      dateOfBirth: values.cmps_dateofbirth || '',
      primaryLanguage: values.cmps_primarylanguage || '',
      gender: values.cmps_gender || '',
      alertList: values.cmps_alertlist || '',
      alertListReason: values.cmps_alertlistreason || '',
      searchValues: values,
    })
  })

  const byClient = new Map<string, CaseLoadRecord>()
  enrollments.forEach((enrollment) => {
    const client = clientById.get(normalize(String(enrollment.clientRowId || '')))
    if (!client) return
    const key = normalize(client.id || client.recordId)
    if (!key) return
    const existing = byClient.get(key) || { ...client, enrollments: [] }
    const enrollmentId = String(enrollment.id || enrollment.recordId || '').trim()
    if (!existing.enrollments.some((entry) => normalize(entry.enrollmentId) === normalize(enrollmentId))) {
      existing.enrollments.push({
        enrollmentId,
        program: enrollment.program,
        startDate: enrollment.serviceStartDate,
        endDate: enrollment.serviceEndDate,
        recordId: formatProgramEnrollmentLookupLabel(enrollment),
        staffAssigned: String(enrollment.staffAssigned || ''),
      })
    }
    byClient.set(key, existing)
  })

  return Array.from(byClient.values()).sort((a, b) => a.name.localeCompare(b.name))
}

type HubDefinition = {
  id: string
  title: string
  displayTitle?: string
  audience: string
  summary: string
  roleMatchers: string[]
  sections: HubSection[]
}

type HubPageKey = 'search' | 'forms' | 'workflows'
type MyWorkPageKey = 'case-load' | 'all-work' | 'pending-items'
type AdminPageKey = 'roles' | 'form-picklists' | 'funders' | 'beds' | 'legacy-migration' | 'file-translation' | 'household-history' | 'funder-translation' | 'client-merge' | 'view-as-user' | 'messages'
type SearchFormOption = 'Client Profile' | 'Helpline' | 'Event'
type AppNavKey = 'home' | 'clients' | 'my-work' | 'programs' | 'reports' | 'bed-management' | 'archived-records'
type ClientDetailSectionKey =
  | 'overview'
  | 'face-sheet'
  | 'folder-summary'
  | 'helpline'
  | 'intake'
  | 'service-delivery'
  | 'other'

type ClientProfileFormCatalogEntry = {
  name: string
  section: 'helpline' | 'intake' | 'service-delivery' | 'other'
  aliases?: string[]
}

type FormHeaderPlacement = {
  formKind: HubFormSession['kind']
  section: string
  src?: string
  text?: string
  modalOnly?: boolean
  beforeField?: string
  afterField?: string
}

const FORM_HEADER_PLACEMENTS: FormHeaderPlacement[] = [
  { formKind: 'program-enrollment', section: 'Household Demographics', afterField: 'cmps_householdreportedincomelevel', src: 'Program Enrollment/header1.png', modalOnly: true },
  { formKind: 'program-enrollment', section: 'Household Demographics', afterField: 'cmps_householdreportedincomelevel', src: 'Program Enrollment/header2.png', modalOnly: true },
  { formKind: 'helpline', section: 'Safety Assessment', text: 'Reminder\nOnly complete for survivors of intimate partner violence.' },
  { formKind: 'helpline', section: 'Safety Assessment', beforeField: 'cmps_dangerassessmentevaluation', text: 'Danger Assessment Evaluation\n\nYes to 1 or less questions = Variable Risk\nYes to 2 or 3 questions = Elevated Risk\nYes to 4 or more questions = High Risk' },
  { formKind: 'shelter-screening', section: 'Safety Assessment', beforeField: 'cmps_doyouoryourchildrenhaveanyphysicalormedicatio', text: 'Reminder\nLet caller know it can be unsafe to be placed on a top bunk if you\'re over 180 pounds, have certain conditions or injuries, or are on certain medications.' },
  { formKind: 'shelter-screening', section: 'Other Information', beforeField: 'cmps_doyouhaveanycurrentorpendinglegalorcustodyiss', text: 'Reminder\nLet caller know that our programs do not allow drug or alcohol use in hotel rooms or in any A New Leaf shelter programs.' },
  { formKind: 'release-of-information', section: 'Read First', text: 'A New Leaf must keep information about you private. The only time your personal information should be shared is when you want us to for specific services or if we are compelled by law or court order.\n\n• You never have to agree to share your information. We will still help you and provide our services.\n• If you do want A New Leaf to share some information about you, use this form to give instructions about what you do and don\'t want shared, and with whom you want it shared.\n• Before you sign this, someone at A New Leaf will discuss your goals/needs, your choices for how to meet those, and the pros and cons of having us share the information for you.\n• You can change your mind about what you want shared at any time, and we will update this form to reflect your decision.' },
  { formKind: 'release-of-information', section: 'Release of Information', text: 'These are my instructions for A New Leaf to share my information:' },
  { formKind: 'release-of-information', section: 'Release of Information', beforeField: 'cmps_name', text: 'I want my information shared with this person or agency:' },
  { formKind: 'release-of-information', section: 'Release of Information', beforeField: 'cmps_method', text: 'My information may be shared:' },
  { formKind: 'release-of-information', section: 'Release of Information', beforeField: 'cmps_programs1', text: 'I want my information shared from this program:' },
  { formKind: 'release-of-information', section: 'Attestation', beforeField: 'cmps_expirationdateandtime', text: 'This release expires on:' },
  { formKind: 'release-of-information', section: 'Attestation', afterField: 'cmps_expirationdateandtime', text: 'Expiration should meet the needs of the individual, which is typically no more than 15–30 days, but may be shorter or longer.' },
  { formKind: 'release-of-information', section: 'Attestation', afterField: 'cmps_expirationdateandtime', text: 'I understand that this release is valid when I sign it and that I may withdraw my consent to this release at any time, either verbally or in writing.' },
  { formKind: 'release-of-information', section: 'Reaffirmation & Extension', text: 'REAFFIRMATION AND EXTENSION\n\nIf additional time is necessary to meet the purpose of this release.' },
  { formKind: 'release-of-information', section: 'Reaffirmation & Extension', text: 'I confirm that this release is still valid and I would like to extend the release until the following date and time:' },
  { formKind: 'adult-assessment', section: 'Acknowledgement', text: 'E-Signature Disclaimer / Notice\n\nBy signing below, I hereby agree and understand that all electronic signatures are the equivalent of my manual/handwritten signature. This is to be used in conjunction with the use of electronic signatures on all forms in this database with a signature requirement, should I elect to have signed electronically.\n\nBy signing I affirm I was involved in the creation and ongoing review of this document.' },
  { formKind: 'child-safety-plan', section: 'Planning', text: 'You are an important person, and you deserve to be safe.' },
  { formKind: 'child-safety-plan', section: 'Emotions', src: 'Child Safety Plan/header2.png' },
  { formKind: 'child-safety-plan', section: 'Emotions', beforeField: 'cmps_whendealingwithstrongemotionswhatareyourthoug', text: 'Remember, how a person behaves is their choice and you are not to blame.' },
  { formKind: 'child-safety-plan', section: 'Acknowledgement', text: 'I made this safety plan!' },
  { formKind: 'child-safety-plan', section: 'Acknowledgement', text: 'E-Signature Disclaimer / Notice\n\nBy signing below, I hereby agree and understand that all electronic signatures are the equivalent of my manual/handwritten signature. This is to be used in conjunction with the use of electronic signatures on all forms in this database with a signature requirement, should I elect to have signed electronically.\n\nBy signing I affirm I was involved in the creation and ongoing review of this document.' },
  { formKind: 'focus-plan', section: 'FOCUS Plan Checklist', beforeField: 'cmps_projectedexitdate', text: 'Discharge Plan\n\nYou, the resident (client), entered the shelter on the date listed, with estimated exit date also listed, at which time you will have increased feelings of safety and well-being and secured a safe living environment.' },
  { formKind: 'focus-plan', section: 'FOCUS Plan Checklist', beforeField: 'cmps_residentnameandsignature', text: 'E-Signature Disclaimer / Notice\n\nBy signing below, I hereby agree and understand that all electronic signatures are the equivalent of my manual/handwritten signature. This is to be used in conjunction with the use of electronic signatures on all forms in this database with a signature requirement, should I elect to have signed electronically.\n\nBy signing I affirm I was involved in the creation and ongoing review of this document.' },
  { formKind: 'health-wellness', section: 'Main', src: 'Health & Wellness Questionnaire/header1.png' },
  { formKind: 'health-wellness', section: 'Seizure Information', beforeField: 'cmps_physicianname', text: 'REMINDER\nRelease of Information (ROI) must be obtained to authorize staff to contact the treating physician.' },
  { formKind: 'health-wellness', section: 'Medications', text: 'Please list all current medications, including over-the-counter meds.' },
  { formKind: 'health-wellness', section: 'Emergency Contact Information', beforeField: 'cmps_emergencycontactname', text: 'REMINDER\nRelease of Information (ROI) must be obtained to authorize staff to contact the emergency contact.' },
  { formKind: 'initial-safety-plan', section: 'Main', beforeField: 'cmps_whatisyourplan', text: 'TIP:\nA safe option is a police standby.' },
  { formKind: 'initial-safety-plan', section: 'Main', beforeField: 'cmps_doyouusepublictransportationforworkschoolorha', text: 'TIP:\nIt is recommended to use a buddy system, if possible.\nKeep your OOP with you at all times and stay in public areas.\nRemember to look for signs that read “Safe Place”.' },
  { formKind: 'initial-safety-plan', section: 'Main', beforeField: 'cmps_doyoucurrentlyhavesocialmediaaccounts', text: 'TIP:\nTry changing your routes.\nTry to change your arrival and departure times and use safety while traveling.\nAlso screen your incoming calls.' },
  { formKind: 'initial-safety-plan', section: 'Main', beforeField: 'cmps_doesthepersonharmingyouhaveaccesstoyourbankac', text: 'TIP:\nPlease remember to turn off your location.\nThink about changing your privacy settings.\nDecide if it is safe for you to continue being friends with the person harming you and be aware of mutual friends in common.\nBe aware of posting pictures that show surrounding areas.' },
  { formKind: 'initial-safety-plan', section: 'Main', beforeField: 'cmps_willyourchildrenattendthesameschoolordaycare', text: 'TIP:\nRemember locations of purchases often appear on bank statements.\nIn addition, depositing checks at bank branches located near the shelter may not be safe.' },
  { formKind: 'initial-safety-plan', section: 'Main', beforeField: 'cmps_programphonenumber', text: 'TIP:\nInform school/daycare of situation.\nPractice safety planning with your family.' },
  { formKind: 'initial-safety-plan', section: 'Main', afterField: 'cmps_programphonenumber', text: 'Please save the phone numbers given to you above under a safe name in your phone.\nPlease call Program staff to update them in case of an emergency, change in plans, or if you are going to be late.\n\nReview your safety plan daily, use your instincts and judgment.\nRemind those that watch your children that the person harming you is not permitted to pick up your children.' },
  { formKind: 'initial-safety-plan', section: 'Main', afterField: 'cmps_programphonenumber', text: 'E-Signature Disclaimer / Notice\n\nBy signing below, I hereby agree and understand that all electronic signatures are the equivalent of my manual/handwritten signature. This is to be used in conjunction with the use of electronic signatures on all forms in this database with a signature requirement, should I elect to have signed electronically.\n\nBy signing I affirm I was involved in the creation and ongoing review of this document.' },
]

type HubPageDefinition = {
  title: string
  summary: string
  cards: Array<{
    title: string
    body: string
    bullets: string[]
  }>
}

type HubFormAccess = {
  formName: string
  roleName: string
}

type ClientProfileFormSession = {
  kind: 'client-profile'
  formName: string
  tableAlias: string
  rowId: string
  recordId: string
  values: Record<string, string>
}

type ProgramEnrollmentFormSession = {
  kind: 'program-enrollment'
  formName: string
  tableAlias: string
  rowId: string
  recordId: string
  values: ProgramEnrollmentPayload
}

type ServicesFormSession = {
  kind: 'services'
  draftKey?: symbol
  recordIdError?: string
  formName: string
  tableAlias: string
  rowId: string
  recordId: string
  values: ServicesPayload
}

type BedEnrollmentFormSession = {
  kind: 'bed-enrollment'
  formName: string
  tableAlias: string
  rowId: string
  recordId: string
  values: BedEnrollmentPayload
}

type HelplineFormSession = {
  kind: 'helpline'
  formName: string
  tableAlias: string
  rowId: string
  recordId: string
  values: HelplinePayload
}

type ShelterScreeningFormSession = {
  kind: 'shelter-screening'
  formName: string
  tableAlias: string
  rowId: string
  recordId: string
  values: ShelterScreeningPayload
}

type VocaFormSession = {
  kind: 'voca-form'
  formName: string
  tableAlias: string
  rowId: string
  recordId: string
  values: VocaFormPayload
}

type EventFormSession = {
  kind: 'event'
  formName: string
  tableAlias: string
  rowId: string
  recordId: string
  values: EventPayload
}

type HouseholdFormSession = {
  kind: 'household'
  formName: string
  tableAlias: string
  rowId: string
  recordId: string
  values: HouseholdPayload
}

type ReleaseOfInformationFormSession = {
  kind: 'release-of-information'
  formName: string
  tableAlias: string
  rowId: string
  recordId: string
  values: ReleaseOfInformationPayload
}

type ChildSafetyPlanFormSession = {
  kind: 'child-safety-plan'
  formName: string
  tableAlias: string
  rowId: string
  recordId: string
  values: ChildSafetyPlanPayload
}

type AdultAssessmentFormSession = {
  kind: 'adult-assessment'
  formName: string
  tableAlias: string
  rowId: string
  recordId: string
  values: AdultAssessmentPayload
}

type HealthWellnessFormSession = {
  kind: 'health-wellness'
  formName: string
  tableAlias: string
  rowId: string
  recordId: string
  values: HealthWellnessPayload
}

type FocusPlanFormSession = {
  kind: 'focus-plan'
  formName: string
  tableAlias: string
  rowId: string
  recordId: string
  values: FocusPlanPayload
}

type InitialSafetyPlanFormSession = {
  kind: 'initial-safety-plan'
  formName: string
  tableAlias: string
  rowId: string
  recordId: string
  values: InitialSafetyPlanPayload
}

type AcknowledgementAndConsentFormSession = {
  kind: 'acknowledgement-and-consent'
  formName: string
  tableAlias: string
  rowId: string
  recordId: string
  values: AcknowledgementAndConsentPayload
}

type AnimalAgreementFormSession = {
  kind: 'animal-agreement'
  formName: string
  tableAlias: string
  rowId: string
  recordId: string
  values: AnimalAgreementPayload
}

type ChildAssessmentFormSession = {
  kind: 'child-assessment'
  formName: string
  tableAlias: string
  rowId: string
  recordId: string
  values: ChildAssessmentPayload
}

type ChildShelterIntakeFormSession = {
  kind: 'child-shelter-intake'
  formName: string
  tableAlias: string
  rowId: string
  recordId: string
  values: ChildShelterIntakePayload
}

type EmploymentAndBenefitsFormSession = {
  kind: 'employment-and-benefits'
  formName: string
  tableAlias: string
  rowId: string
  recordId: string
  values: EmploymentAndBenefitsPayload
}

type FinancialAssistanceFormSession = {
  kind: 'financial-assistance'
  formName: string
  tableAlias: string
  rowId: string
  recordId: string
  values: FinancialAssistancePayload
}

type MedicalConsentFormSession = {
  kind: 'medical-consent-form'
  formName: string
  tableAlias: string
  rowId: string
  recordId: string
  values: MedicalConsentFormPayload
}

type PersonYouAreFleeingProfileFormSession = {
  kind: 'person-you-are-fleeing-profile'
  formName: string
  tableAlias: string
  rowId: string
  recordId: string
  values: PersonYouAreFleeingProfilePayload
}

type ElectronicDocumentFormSession = {
  kind: 'electronic-document'
  formName: string
  tableAlias: string
  rowId: string
  recordId: string
  values: ElectronicDocumentPayload
}

type TermsAndConditionsOfServiceAnimalsFormSession = {
  kind: 'terms-and-conditions-of-service-animals'
  formName: string
  tableAlias: string
  rowId: string
  recordId: string
  values: TermsAndConditionsOfServiceAnimalsPayload
}

type ContractFormSession = {
  kind: 'contract'
  formName: string
  tableAlias: string
  rowId: string
  recordId: string
  values: ContractPayload
}

type PetCompanionIntakeFormSession = {
  kind: 'pet-companion-intake'
  formName: string
  tableAlias: string
  rowId: string
  recordId: string
  values: PetCompanionIntakePayload
}

type FunderTransactionFormSession = {
  kind: 'funder-transaction'
  formName: string
  tableAlias: string
  rowId: string
  recordId: string
  values: FunderTransactionPayload
}

type ShelterProgramGuidelinesFormSession = {
  kind: 'shelter-program-guidelines'
  formName: string
  tableAlias: string
  rowId: string
  recordId: string
  values: ShelterProgramGuidelinesPayload
}

type GoalFormSession = {
  kind: 'goal'
  formName: string
  tableAlias: string
  rowId: string
  recordId: string
  values: GoalPayload
}

type HouseholdMemberDraft = {
  historyRowId: string
  historyRecordId: string
  clientRowId: string
  clientRecordId: string
  clientName: string
  householdRowId: string
  selected: boolean
  status: string
  relationshipToHoh: string
  relationshipToHohOther: string
}

const SEARCH_PAGE_SIZE = 20
const NO_ADVANCED_FILTERS: AdvancedSearchCriterion[] = []

type HubFormSession = ClientProfileFormSession | ProgramEnrollmentFormSession | ServicesFormSession | BedEnrollmentFormSession | HelplineFormSession | ShelterScreeningFormSession | VocaFormSession | EventFormSession | HouseholdFormSession | ReleaseOfInformationFormSession | ChildSafetyPlanFormSession | ChildAssessmentFormSession | ChildShelterIntakeFormSession | EmploymentAndBenefitsFormSession | FinancialAssistanceFormSession | MedicalConsentFormSession | PersonYouAreFleeingProfileFormSession | ElectronicDocumentFormSession | TermsAndConditionsOfServiceAnimalsFormSession | ContractFormSession | PetCompanionIntakeFormSession | FunderTransactionFormSession | ShelterProgramGuidelinesFormSession | AdultAssessmentFormSession | HealthWellnessFormSession | FocusPlanFormSession | InitialSafetyPlanFormSession | AcknowledgementAndConsentFormSession | AnimalAgreementFormSession | GoalFormSession

type FormReturnState = {
  clientProfileDetail?: ClientProfileDetailRecord | null
  hubId: string
  page: HubPageKey
  appNav: AppNavKey
  clientSection: ClientDetailSectionKey
  programEnrollmentDetail: ProgramEnrollmentDetailRecord | null
  servicesDetail: ServicesDetailRecord | null
  bedEnrollmentDetail: BedEnrollmentDetailRecord | null
  adultAssessmentDetail: AdultAssessmentDetailRecord | null
  childSafetyPlanDetail: ChildSafetyPlanDetailRecord | null
  focusPlanDetail: FocusPlanDetailRecord | null
  initialSafetyPlanDetail: InitialSafetyPlanDetailRecord | null
  healthWellnessDetail: HealthWellnessDetailRecord | null
}

type SupplementalPicklistField = {
  key: string
  label: string
  input: 'text' | 'select' | 'radio' | 'checkbox-group'
  options: string[]
}

type FormPicklistFieldKind = 'drop down' | 'radio button' | 'checkboxes'

type FormPicklistOptionEdit = {
  value: string
  active: boolean
}

type FormPicklistFieldEdit = {
  label: string
  picklistType: FormPicklistFieldKind
  active: boolean
  options: FormPicklistOptionEdit[]
}

type FormPicklistEditRow = {
  id: string
  originalFormName: string
  formName: string
  optionBucket1Count: number
  fields: FormPicklistFieldEdit[]
}

const CLIENT_DETAIL_SECTION_ORDER: ClientDetailSectionKey[] = [
  'overview',
  'face-sheet',
  'folder-summary',
  'helpline',
  'intake',
  'service-delivery',
  'other',
]
const CLIENT_DETAIL_SECTION_LABELS: Record<ClientDetailSectionKey, string> = {
  overview: 'Overview',
  'face-sheet': 'Face Sheet',
  'folder-summary': 'Folder Summary',
  helpline: 'Helpline',
  intake: 'Intake',
  'service-delivery': 'Service Delivery',
  other: 'Other',
}

const PROGRAM_SEARCH_FIELDS: ProgramSearchFields = {
  'client-profile': CLIENT_PROFILE_FIELDS,
  'program-enrollment': PROGRAM_ENROLLMENT_FIELDS,
  services: SERVICES_FIELD_DEFINITIONS,
  'bed-enrollment': BED_ENROLLMENT_FIELD_DEFINITIONS,
  helpline: HELPLINE_FIELD_DEFINITIONS,
  'shelter-screening': SHELTER_SCREENING_FIELD_DEFINITIONS,
  'voca-form': VOCA_FORM_FIELD_DEFINITIONS,
  event: EVENT_FIELD_DEFINITIONS,
  'release-of-information': RELEASE_OF_INFORMATION_FIELDS,
  'acknowledgement-consent': ACKNOWLEDGEMENT_AND_CONSENT_FIELDS,
  'adult-assessment': ADULT_ASSESSMENT_FIELDS,
  'animal-agreement': ANIMAL_AGREEMENT_FIELDS,
  goal: GOAL_FIELDS,
  'child-assessment': CHILD_ASSESSMENT_FIELDS,
  'child-safety-plan': CHILD_SAFETY_PLAN_FIELDS,
  'child-shelter-intake': CHILD_SHELTER_INTAKE_FIELDS,
  'electronic-document': ELECTRONIC_DOCUMENT_FIELDS,
  'employment-benefits': EMPLOYMENT_AND_BENEFITS_FIELDS,
  'financial-assistance': FINANCIAL_ASSISTANCE_FIELDS,
  'focus-plan': [...FOCUS_PLAN_FIELDS, ...FOCUS_PLAN_GOAL_FIELDS],
  'health-wellness': HEALTH_WELLNESS_FIELDS,
  'initial-safety-plan': INITIAL_SAFETY_PLAN_FIELDS,
  'medical-consent': MEDICAL_CONSENT_FORM_FIELDS,
  'person-fleeing-profile': PERSON_YOU_ARE_FLEEING_PROFILE_FIELDS,
  'pet-companion-intake': PET_COMPANION_INTAKE_FIELDS,
  'shelter-program-guidelines': SHELTER_PROGRAM_GUIDELINES_FIELDS,
  'service-animal-terms': TERMS_AND_CONDITIONS_OF_SERVICE_ANIMALS_FIELDS,
  household: HOUSEHOLD_FIELD_DEFINITIONS,
  'funder-contract': CONTRACT_FIELDS,
  'funder-transaction': FUNDER_TRANSACTION_FIELDS,
  funder: FUNDER_ADMIN_TABLES.funder.fields,
  'household-history': [
    { field: 'cmps_recordid', label: 'Record ID' }, { field: 'cmps_clientid', label: 'Client Profile' },
    { field: 'cmps_householdid', label: 'Household' }, { field: 'cmps_status', label: 'Status' },
    { field: 'cmps_relationshiptohoh', label: 'Relationship to Head of Household' },
    { field: 'cmps_relationshiptohohother', label: 'Other Relationship' },
  ],
  bed: [
    { field: 'cmps_bedname', label: 'Bed' }, { field: 'cmps_program', label: 'Program' },
    { field: 'cmps_unit', label: 'Unit' }, { field: 'cmps_unittype', label: 'Unit Type' },
    { field: 'cmps_floor', label: 'Floor' }, { field: 'cmps_status', label: 'Status' },
  ],
  'compass-file': [
    { field: 'cmps_recordid', label: 'Record ID' }, { field: 'cmps_filename', label: 'File Name' },
    { field: 'cmps_filesize', label: 'File Size' }, { field: 'cmps_mimetype', label: 'File Type' },
    { field: 'cmps_relatedrecordid', label: 'Related Record ID' },
  ],
}

const CLIENT_PROFILE_FORM_CATALOG: ClientProfileFormCatalogEntry[] = [
  { name: 'Client Profile', section: 'intake' },
  { name: 'Program Enrollment', section: 'intake' },
  { name: 'Services', section: 'service-delivery' },
  { name: 'Bed Enrollment', section: 'intake' },
  { name: 'Helpline', section: 'helpline' },
  { name: 'Shelter Screening Form', section: 'helpline', aliases: ['Shelter Screening'] },
  { name: 'Household', section: 'intake', aliases: ['Househould'] },
  { name: 'VOCA Form', section: 'other', aliases: ['VOCA'] },
  { name: 'Event', section: 'service-delivery' },
  { name: 'A New Leaf Limited Release of Information', section: 'other', aliases: ['Limited Release of Information', 'Release of Information'] },
  { name: 'Acknowledgement & Consent Form', section: 'intake', aliases: ['Acknowledgement and Consent Form'] },
  { name: 'Adult Assessment', section: 'service-delivery' },
  { name: 'Animal Agreement', section: 'other' },
  { name: 'Goals', section: 'service-delivery', aliases: ['Goal', 'Goals Form', 'ANL Goal', 'ANL Goals', 'ANL Goals Form', 'A New Leaf Goal', 'A New Leaf Goals', 'A New Leaf Goals Form'] },
  { name: 'Child Assessment', section: 'other' },
  { name: 'Child Safety Plan', section: 'service-delivery' },
  { name: 'Child Shelter Intake', section: 'other' },
  { name: 'Electronic Document', section: 'other' },
  { name: 'Employment & Benefits', section: 'other', aliases: ['Employment and Benefits'] },
  { name: 'Financial Assistance', section: 'other' },
  { name: 'FOCUS Plan', section: 'service-delivery' },
  { name: 'Health & Wellness Questionnaire', section: 'service-delivery', aliases: ['Health and Wellness Questionnaire'] },
  { name: 'Initial Safety Plan', section: 'service-delivery' },
  { name: 'Medical Consent Form', section: 'other', aliases: ['Medical Consent'] },
  { name: 'Person You Are Fleeing Profile', section: 'other' },
  { name: 'Pet Companion Intake', section: 'other' },
  { name: 'Shelter Program Guidelines', section: 'other' },
  { name: 'Terms & Conditions of Service Animals', section: 'other', aliases: ['Terms and Conditions of Service Animals'] },
  { name: 'Contract', section: 'other' },
  { name: 'Funder Transactions', section: 'other', aliases: ['Funder Transaction'] },
]

function normalizeClientProfileFormName(formName: string): string {
  return normalize(formName)
    .replace(/\s*&\s*/g, ' and ')
    .replace(/[^a-z0-9]+/g, ' ')
    .replace(/\s+/g, ' ')
    .trim()
}

function isCanonicalGoalFormName(formName: string): boolean {
  const key = normalizeClientProfileFormName(formName)
  if (key.includes('focus')) return false
  return /(^|\s)goals?(\s|$)/.test(key)
}

function getClientProfileFormCatalogEntry(formName: string): ClientProfileFormCatalogEntry | undefined {
  const key = normalizeClientProfileFormName(formName)
  if (isCanonicalGoalFormName(key)) return CLIENT_PROFILE_FORM_CATALOG.find((entry) => entry.name === 'Goals')
  return CLIENT_PROFILE_FORM_CATALOG.find((entry) => (
    [entry.name, ...(entry.aliases || [])].some((candidate) => normalizeClientProfileFormName(candidate) === key)
  ))
}

const APP_NAV_LABELS: Record<AppNavKey, string> = {
  home: 'Home',
  clients: 'Clients',
  'my-work': 'My Work',
  programs: 'Programs',
  reports: 'Reports',
  'bed-management': 'Bed Management',
  'archived-records': 'Archived Records',
}

const HUB_DEFINITIONS: HubDefinition[] = [
  {
    id: 'autumn-house',
    title: 'Autumn House',
    audience: 'Staff and Supervisor',
    summary: 'Daily coordination hub for Autumn House staffing, client follow-up, and center activity.',
    roleMatchers: ['autumn house', 'autumn house staff', 'autumn house supervisor'],
    sections: [
      {
        title: 'Today',
        body: 'Use this hub to stay oriented on the current shift and to keep the team aligned.',
        bullets: ['Review overnight notes and handoffs', 'Check coverage and open tasks', 'Close out exceptions before end of shift'],
      },
      {
        title: 'Focus areas',
        body: 'Keep attention on communication, documentation, and follow-through.',
        bullets: ['Client notes', 'Shift updates', 'Escalations and follow-up'],
      },
    ],
  },
  {
    id: 'dv-outreach',
    title: 'DV Outreach',
    audience: 'Staff and Supervisor',
    summary: 'Outreach coordination hub for community contact, scheduling, and activity tracking.',
    roleMatchers: ['dv outreach', 'dv outreach staff', 'dv outreach supervisor'],
    sections: [
      {
        title: 'Today',
        body: 'Use this hub to manage outreach activity and current engagement priorities.',
        bullets: ['Track contacts and callbacks', 'Plan outreach routes and visits', 'Document notes and outcomes'],
      },
      {
        title: 'Focus areas',
        body: 'Keep the team aligned around recent outreach work and next steps.',
        bullets: ['Engagement follow-up', 'Appointment scheduling', 'Documentation cleanup'],
      },
    ],
  },
  {
    id: 'caafa-shelter',
    title: 'CAAFA Shelter',
    audience: 'Staff and Supervisor',
    summary: 'Shelter coordination hub for resident activity, staffing, and daily operations.',
    roleMatchers: ['caafa shelter', 'caafa shelter staff', 'caafa shelter supervisor'],
    sections: [
      {
        title: 'Today',
        body: 'Use this hub to stay ahead of resident needs and shift expectations.',
        bullets: ['Review occupancy and room flow', 'Check staff assignments', 'Log incidents and follow-up tasks'],
      },
      {
        title: 'Focus areas',
        body: 'Keep attention on smooth handoff and resident care documentation.',
        bullets: ['Intake and discharge support', 'Incident notes', 'Team handoff'],
      },
    ],
  },
  {
    id: 'dv-sv-services',
    title: 'DV & SV Services',
    audience: 'Director',
    summary: 'Leadership hub for DV & SV Services oversight, reporting, and program direction.',
    roleMatchers: ['dv & sv services', 'dv and sv services', 'dv & sv services director', 'dv and sv services director'],
    sections: [
      {
        title: 'Today',
        body: 'Use this hub to track program direction and review high-level service needs.',
        bullets: ['Review active service trends', 'Check team performance and capacity', 'Confirm reporting priorities'],
      },
      {
        title: 'Focus areas',
        body: 'Keep leadership visibility on staffing, outcomes, and program health.',
        bullets: ['Executive reporting', 'Program review', 'Escalation oversight'],
      },
    ],
  },
  {
    id: 'dvstop',
    title: 'DVSTOP',
    audience: 'Staff and Supervisor',
    summary: 'DVSTOP operations hub for case coordination, task tracking, and staff follow-up.',
    roleMatchers: ['dvstop', 'dvstop staff', 'dvstop supervisor'],
    sections: [
      {
        title: 'Today',
        body: 'Use this hub to manage current cases and keep the team in sync.',
        bullets: ['Review open cases', 'Confirm staffing coverage', 'Complete follow-up notes'],
      },
      {
        title: 'Focus areas',
        body: 'Keep the workflow moving through timely updates and clear documentation.',
        bullets: ['Case review', 'Documentation', 'Escalation routing'],
      },
    ],
  },
  {
    id: 'faith-house',
    title: 'Faith House',
    audience: 'Staff and Supervisor',
    summary: 'Faith House coordination hub for daily operations and resident support.',
    roleMatchers: ['faith house', 'faith house staff', 'faith house supervisor'],
    sections: [
      {
        title: 'Today',
        body: 'Use this hub to keep resident activity and shift priorities organized.',
        bullets: ['Review handoff notes', 'Check staffing and coverage', 'Close out action items'],
      },
      {
        title: 'Focus areas',
        body: 'Keep communication and documentation clean across the team.',
        bullets: ['Resident support', 'Team communication', 'Operational follow-up'],
      },
    ],
  },
  {
    id: 'sv',
    title: 'REACH Center',
    displayTitle: 'REACH SV',
    audience: 'Staff and Supervisor',
    summary: 'Shared REACH SV hub for both staff and supervisors to manage current work and handoffs.',
    roleMatchers: ['reach center'],
    sections: [
      {
        title: 'Today',
        body: 'Use this hub to stay aligned on active work and team handoffs.',
        bullets: ['Check current assignments', 'Review incoming updates', 'Complete end-of-day notes'],
      },
      {
        title: 'Focus areas',
        body: 'Keep the shared REACH SV workflow predictable and easy to hand off.',
        bullets: ['Assignment visibility', 'Work tracking', 'Supervisor review'],
      },
    ],
  },
  {
    id: 'counselor',
    title: 'Counselor',
    audience: 'Counselor',
    summary: 'Counselor hub for caseload visibility, notes, and client follow-up.',
    roleMatchers: ['counselor'],
    sections: [
      {
        title: 'Today',
        body: 'Use this hub to focus on client work, documentation, and next steps.',
        bullets: ['Review caseload queue', 'Update session notes', 'Track next appointment or action'],
      },
      {
        title: 'Focus areas',
        body: 'Keep client-centered tasks visible and easy to complete.',
        bullets: ['Notes and records', 'Follow-up tasks', 'Appointment tracking'],
      },
    ],
  },
]

function roleKey(text: string): string {
  return normalize(text).replace(/[^a-z0-9]+/g, ' ').replace(/\s+/g, ' ').trim()
}

function hubMatchesRole(hub: HubDefinition, roleName: string): boolean {
  const candidate = roleKey(roleName)
  if (!candidate) return false
  return hub.roleMatchers.some((matcher) => {
    const normalizedMatcher = roleKey(matcher)
    // REACH roles must match the complete program name, not a partial
    // "REACH"/"Center" name or an unrelated role containing "SV".
    if (hub.id === 'sv') return candidate === normalizedMatcher || candidate.startsWith(`${normalizedMatcher} `)
    return candidate === normalizedMatcher || candidate.includes(normalizedMatcher) || normalizedMatcher.includes(candidate)
  })
}

function hubLabel(hub: HubDefinition): string {
  return `${hub.displayTitle || hub.title} Hub`
}

const HUB_PAGE_DEFINITIONS: Record<HubPageKey, HubPageDefinition> = {
  search: {
    title: 'Search',
    summary: 'Find clients, notes, tasks, and recent activity for the selected hub.',
    cards: [
      {
        title: 'Search quick start',
        body: 'Use search to jump directly to the thing you need instead of browsing through lists.',
        bullets: ['Look up a client by name or ID', 'Search recent notes and tasks', 'Filter by date or status'],
      },
      {
        title: 'Recent results',
        body: 'Your last-used results can live here for fast repeat access.',
        bullets: ['Pinned searches', 'Recent client records', 'Saved filters'],
      },
    ],
  },
  forms: {
    title: 'Forms',
    summary: 'Open the forms tied to this hub and complete or review entries.',
    cards: [
      {
        title: 'Forms quick start',
        body: 'Use forms to enter or review the hub-specific data you work with most often.',
        bullets: ['Open intake or follow-up forms', 'Review in-progress drafts', 'Complete required fields'],
      },
      {
        title: 'Form actions',
        body: 'The admin layer can later grow more form shortcuts here.',
        bullets: ['New form', 'Drafts', 'Submitted items'],
      },
    ],
  },
  workflows: {
    title: 'Workflows',
    summary: 'Track tasks and process steps for this hub from start to finish.',
    cards: [
      {
        title: 'Workflow queue',
        body: 'Use workflows to see what is waiting, what is in progress, and what is done.',
        bullets: ['Open items', 'Assigned tasks', 'Completed steps'],
      },
      {
        title: 'Workflow actions',
        body: 'This is the place to organize the work that moves a case or request forward.',
        bullets: ['Start a workflow', 'Advance a step', 'Review completion'],
      },
    ],
  },
}

function hubPageLabel(page: HubPageKey): string {
  return HUB_PAGE_DEFINITIONS[page].title
}

function asText(value: unknown): string {
  return String(value || '').trim()
}

function parseJsonMaybeTwice(value: unknown): unknown {
  if (value === null || value === undefined || value === '') return null

  try {
    const parsed = JSON.parse(String(value))
    if (typeof parsed === 'string') {
      try {
        return JSON.parse(parsed)
      } catch {
        return parsed
      }
    }
    return parsed
  } catch {
    return value
  }
}

function parseAdminMembers(raw: unknown): AdminMember[] {
  const parsed = parseJsonMaybeTwice(raw)

  const objectToMember = (entry: Record<string, unknown>): AdminMember => ({
    id: asText(entry.id || entry.userid || entry.userId || entry.mg_userid || entry.ithd_userid),
    email: asText(entry.email || entry['e-mail'] || entry.mail || entry.mg_email || entry.ithd_email),
    name: asText(entry.name || entry.fullname || entry.fullName || entry.displayname || entry.displayName || entry.mg_name || entry.ithd_name),
  })

  if (Array.isArray(parsed)) {
    const members = parsed
      .map((entry) => {
        if (typeof entry === 'string') {
          const email = asText(entry).replace(/^[\s\[\](){"']+|[\s\[\](){"']+$/g, '')
          return email ? { id: '', email, name: '' } : null
        }

        if (entry && typeof entry === 'object') {
          return objectToMember(entry as Record<string, unknown>)
        }

        return null
      })
      .filter((entry): entry is AdminMember => !!entry && !!entry.email)

    if (members.length > 0) return members
  }

  if (parsed && typeof parsed === 'object') {
    const objectValue = parsed as Record<string, unknown>
    const nested = objectValue.users || objectValue.value
    if (Array.isArray(nested)) return parseAdminMembers(nested)
    return [objectToMember(objectValue)].filter((entry) => !!entry.email)
  }

  const rawText = asText(raw)
  if (!rawText) return []

  return rawText
    .split(/[;,\n\r]+/)
    .map((entry) => asText(entry).replace(/^[\s\[\](){"']+|[\s\[\](){"']+$/g, ''))
    .filter(Boolean)
    .map((email) => ({ id: '', email, name: '' }))
}

function serializeAdminMembers(members: AdminMember[]): string {
  const payload = members
    .map((member) => ({
      id: asText(member.id),
      email: asText(member.email),
      name: asText(member.name),
    }))
    .filter((member) => member.email)

  return JSON.stringify(payload)
}

function flagToMarker(value: boolean): string {
  return value ? 'x' : ''
}

function parseAdminPermissions(raw: unknown): AdminPermissionRow[] {
  const parsed = parseJsonMaybeTwice(raw)
  if (!parsed || typeof parsed !== 'object' || Array.isArray(parsed)) return []

  return Object.entries(parsed as Record<string, unknown>).map(([formName, markerSet]) => {
    const values = Array.isArray(markerSet) ? markerSet : []
    const marker = (index: number): boolean => normalize(values[index] || '') === 'x' || normalize(values[index] || '') === 'true' || normalize(values[index] || '') === 'yes' || normalize(values[index] || '') === '1'

    return {
      formName,
      view: marker(0),
      search: marker(1),
      create: marker(2),
      edit: marker(3),
      ignoreProgramAssignment: marker(4),
    }
  })
}

function serializeAdminPermissions(rows: AdminPermissionRow[]): string {
  const payload = rows.reduce<Record<string, [string, string, string, string, string]>>((accumulator, row) => {
    const formName = asText(row.formName)
    if (!formName) return accumulator

    accumulator[formName] = [
      flagToMarker(row.view),
      flagToMarker(row.search),
      flagToMarker(row.create),
      flagToMarker(row.edit),
      flagToMarker(row.ignoreProgramAssignment),
    ]

    return accumulator
  }, {})

  return JSON.stringify(payload)
}

const CLIENT_PROFILE_FIELD_NAME_SET = new Set<string>(CLIENT_PROFILE_FIELD_NAMES)
const CLIENT_PROFILE_SYSTEM_MANAGED_READONLY_FIELDS = new Set<ClientProfileFieldName>([
  // These values are calculated or maintained by the system and are displayed
  // on the form, but must not be sent back in an edit payload.
  'cmps_todaysdate',
  'cmps_currentage',
  'cmps_assignedprograms',
  'cmps_creationdate',
  'cmps_createdby',
  'modifiedon',
  'cmps_modifiedby',
])
const PROGRAM_ENROLLMENT_FIELD_NAME_SET = new Set<string>(PROGRAM_ENROLLMENT_FIELDS.map((field) => field.field))

type ClientLinkedFormKey = ClientConsentFormKind

const CLIENT_LINKED_RECORD_SOURCES: Record<ClientLinkedFormKey, ClientLinkedRecordSource> = {
  'child-assessment': CLIENT_RECORD_SOURCES['child-assessment'],
  'financial-assistance': CLIENT_RECORD_SOURCES['financial-assistance'],
  'shelter-screening': CLIENT_RECORD_SOURCES['shelter-screening'],
  'voca-form': CLIENT_RECORD_SOURCES['voca-form'],
  'release-of-information': { tableAlias: RELEASE_OF_INFORMATION_TABLE_ALIAS, primaryIdField: RELEASE_OF_INFORMATION_PRIMARY_ID_FIELD, recordIdField: 'cmps_recordid' },
  'acknowledgement-and-consent': { tableAlias: ACKNOWLEDGEMENT_AND_CONSENT_TABLE_ALIAS, primaryIdField: ACKNOWLEDGEMENT_AND_CONSENT_PRIMARY_ID_FIELD, recordIdField: 'cmps_recordid', clientLookup: 'cmps_cpid', enrollmentLookup: 'cmps_peid' },
  'child-shelter-intake': { tableAlias: CHILD_SHELTER_INTAKES_TABLE_ALIAS, primaryIdField: CHILD_SHELTER_INTAKES_PRIMARY_ID_FIELD, recordIdField: 'cmps_recordid', enrollmentLookup: 'cmps_peid' },
  'medical-consent': { tableAlias: MEDICAL_CONSENT_FORMS_TABLE_ALIAS, primaryIdField: MEDICAL_CONSENT_FORMS_PRIMARY_ID_FIELD, recordIdField: 'cmps_recordid', enrollmentLookup: 'cmps_peid' },
  'shelter-program-guidelines': { tableAlias: SHELTER_PROGRAM_GUIDELINES_TABLE_ALIAS, primaryIdField: SHELTER_PROGRAM_GUIDELINES_PRIMARY_ID_FIELD, recordIdField: 'cmps_recordid', enrollmentLookup: 'cmps_peid', verifyRelationships: true },
  'animal-agreement': { tableAlias: ANIMAL_AGREEMENT_TABLE_ALIAS, primaryIdField: ANIMAL_AGREEMENT_PRIMARY_ID_FIELD, recordIdField: 'cmps_recordid', clientLookup: 'cmps_cpid' },
  'employment-and-benefits': { tableAlias: EMPLOYMENT_AND_BENEFITS_TABLE_ALIAS, primaryIdField: EMPLOYMENT_AND_BENEFITS_PRIMARY_ID_FIELD, recordIdField: 'cmps_recordid' },
  'person-you-are-fleeing': { tableAlias: PERSON_YOU_ARE_FLEEING_PROFILES_TABLE_ALIAS, primaryIdField: PERSON_YOU_ARE_FLEEING_PROFILES_PRIMARY_ID_FIELD, recordIdField: 'cmps_recordid' },
  'pet-companion-intake': { tableAlias: PET_COMPANION_INTAKES_TABLE_ALIAS, primaryIdField: PET_COMPANION_INTAKES_PRIMARY_ID_FIELD, recordIdField: 'cmps_recordid' },
  'terms-and-conditions-of-service-animals': { tableAlias: TERMS_AND_CONDITIONS_OF_SERVICE_ANIMALS_TABLE_ALIAS, primaryIdField: TERMS_AND_CONDITIONS_OF_SERVICE_ANIMALS_PRIMARY_ID_FIELD, recordIdField: 'cmps_recordid' },
}

function serializeFormPicklistEdit(row: FormPicklistEditRow): FormPicklistAdminPayload {
  const sanitizedFields = row.fields
    .map((field) => ({
      label: asText(field.label),
      picklistType: field.picklistType,
      active: !!field.active,
      options: field.options
        .map((option) => ({
          value: asText(option.value),
          active: !!option.active,
        }))
        .filter((option) => option.value),
    }))
    .filter((field) => field.label || field.options.length > 0)

  if (sanitizedFields.some((field) => !field.label)) {
    throw new Error('Each pick list field needs a label before it can be saved.')
  }

  const bucket1Count = row.optionBucket1Count > 0
    ? Math.min(row.optionBucket1Count, sanitizedFields.length)
    : sanitizedFields.length

  const options1 = sanitizedFields.slice(0, bucket1Count).map((field) => field.options.filter((option) => option.active).map((option) => option.value))
  const options2 = sanitizedFields.slice(bucket1Count).map((field) => field.options.filter((option) => option.active).map((option) => option.value))
  const kinds: FormPicklistFieldKind[] = ['drop down', 'radio button', 'checkboxes']
  const info: Record<FormPicklistFieldKind, number[]> = {
    'drop down': [],
    'radio button': [],
    'checkboxes': [],
  }

  sanitizedFields.forEach((field) => {
    for (const kind of kinds) {
      info[kind].push(kind === field.picklistType ? (field.active ? 1 : 0) : 0)
    }
  })

  return {
    cmps_formname: asText(row.formName),
    cmps_jsonpicklist: JSON.stringify(sanitizedFields.map((field) => field.label)),
    cmps_jsonpicklistoptions: JSON.stringify(options1),
    cmps_jsonpicklistoptions2: JSON.stringify(options2),
    cmps_jsonpicklistinfo: JSON.stringify(info),
  }
}

function AppWorkspace({ previewSession, onStartPreview, previewBusy, initialPreviewAdminPage }: {
  previewSession: UserPreviewSession | null
  onStartPreview: (key: string) => Promise<void>
  previewBusy: boolean
  initialPreviewAdminPage: boolean
}) {
  const rolesFileRef = useRef<HTMLInputElement | null>(null)
  const [recordFormView, setRecordFormView] = useState<{ kind: string; detail: PrintRecordDetail; hubId: string; client: ClientProfileDetailRecord | null; appNav: AppNavKey } | null>(null)
  const recordFormLocation = useRef({ hubId: '', clientId: '' })
  const [recordPrint, setRecordPrint] = useState<{ scope: string; mode: 'client' | 'record'; record?: { ref: PrintRecordRef; detail: PrintRecordDetail } } | null>(null)
  const homeMessages = useHomeMessages()
  const bedsCsvFileRef = useRef<HTMLInputElement | null>(null)
  const [authenticatedUser, setUser] = useState<CompassUser>(() => getCurrentUser())
  const user = previewSession?.user || authenticatedUser
  const isUserPreview = !!previewSession
  const [theme, setTheme] = useState<'light' | 'dark'>(() => {
    if (typeof window === 'undefined') return 'light'
    return window.localStorage.getItem('compass-theme') === 'dark' ? 'dark' : 'light'
  })
  const [view, setView] = useState<'home' | 'admin'>(initialPreviewAdminPage && !isUserPreview ? 'admin' : 'home')
  const [adminPage, setAdminPage] = useState<AdminPageKey>(initialPreviewAdminPage ? 'view-as-user' : 'roles')
  const [importingRoles, setImportingRoles] = useState(false)
  const [importStatus, setImportStatus] = useState('')
  const [importError, setImportError] = useState('')
  const [roleProfiles, setRoleProfiles] = useState<RolePermissionProfile[]>(previewSession?.profiles || [])
  const [roleProfilesLoading, setRoleProfilesLoading] = useState(false)
  const [roleProfilesError, setRoleProfilesError] = useState('')
  const [staffDirectoryEntries, setStaffDirectoryEntries] = useState<StaffDirectoryEntry[]>([])
  const [roleEdits, setRoleEdits] = useState<RoleEditRow[]>([])
  const [adminStatus, setAdminStatus] = useState('')
  const [adminError, setAdminError] = useState('')
  const [funderAdminData, setFunderAdminData] = useState<FunderAdminData | null>(null)
  const [funderAdminLoading, setFunderAdminLoading] = useState(false)
  const [funderAdminError, setFunderAdminError] = useState('')
  const [funderAdminExpanded, setFunderAdminExpanded] = useState<Record<FunderAdminKind, boolean>>({ funder: true, contract: true, transaction: true })
  const [funderAdminEditor, setFunderAdminEditor] = useState<{ kind: FunderAdminKind; rowId: string; values: Record<string, string> } | null>(null)
  const [funderAdminEditorError, setFunderAdminEditorError] = useState('')
  const [funderAdminSaving, setFunderAdminSaving] = useState(false)
  const funderAdminSaveInFlight = useRef(false)
  const [activeFunderOptions, setActiveFunderOptions] = useState<ActiveFunderOption[]>([])
  const [activeFunderContractOptions, setActiveFunderContractOptions] = useState<ActiveFunderContractOption[]>([])
  const [availableBedsForEnrollment, setAvailableBedsForEnrollment] = useState<AvailableBed[]>([])
  const [bedsLoading, setBedsLoading] = useState(false)
  const [bedsError, setBedsError] = useState('')
  const [bedAdminRecords, setBedAdminRecords] = useState<BedManagementRecord[]>([])
  const [bedAdminLoading, setBedAdminLoading] = useState(false)
  const [bedAdminError, setBedAdminError] = useState('')
  const [bedAdminStatus, setBedAdminStatus] = useState('')
  const [importingBeds, setImportingBeds] = useState(false)
  const [savingRoleIndex, setSavingRoleIndex] = useState<number | null>(null)
  const [savingPicklistIndex, setSavingPicklistIndex] = useState<number | null>(null)
  const [refreshAdminSignal, setRefreshAdminSignal] = useState(0)
  const [selectedHubId, setSelectedHubId] = useState('')
  const [selectedHubPages, setSelectedHubPages] = useState<Record<string, HubPageKey>>({})
  const [selectedAppNav, setSelectedAppNav] = useState<AppNavKey>('home')
  const [expandedProgramNavId, setExpandedProgramNavId] = useState('')
  const [myWorkNavExpanded, setMyWorkNavExpanded] = useState(false)
  const [selectedMyWorkPage, setSelectedMyWorkPage] = useState<MyWorkPageKey>('case-load')
  const [caseLoadRecords, setCaseLoadRecords] = useState<CaseLoadRecord[]>([])
  const [caseLoadLoading, setCaseLoadLoading] = useState(false)
  const [caseLoadError, setCaseLoadError] = useState('')
  const [allWorkRecords, setAllWorkRecords] = useState<CaseLoadRecord[]>([])
  const [allWorkLoading, setAllWorkLoading] = useState(false)
  const [allWorkError, setAllWorkError] = useState('')
  const [pendingVocaItems, setPendingVocaItems] = useState<PendingVocaItem[]>([])
  const [pendingVocaLoading, setPendingVocaLoading] = useState(false)
  const [pendingVocaError, setPendingVocaError] = useState('')
  const [hubActionStatus, setHubActionStatus] = useState('')
  const [activeFormSession, setActiveFormSession] = useState<HubFormSession | null>(null)
  const [activeSystemFields, setActiveSystemFields] = useState<SystemFields>(EMPTY_SYSTEM_FIELDS)
  const [activeSystemFieldsLoading, setActiveSystemFieldsLoading] = useState(false)
  const [activeSystemFieldsError, setActiveSystemFieldsError] = useState('')
  const [recordViewSystemFields, setRecordViewSystemFields] = useState<SystemFields>(EMPTY_SYSTEM_FIELDS)
  const [recordViewSystemFieldsLoading, setRecordViewSystemFieldsLoading] = useState(false)
  const [recordViewSystemFieldsError, setRecordViewSystemFieldsError] = useState('')
  const [archiveActionLoading, setArchiveActionLoading] = useState(false)
  const [archiveActionError, setArchiveActionError] = useState('')
  const [archivedTableKey, setArchivedTableKey] = useState(ARCHIVE_TABLES[0]?.key || '')
  const [archivedSearchQuery, setArchivedSearchQuery] = useState('')
  const [archivedRecords, setArchivedRecords] = useState<ArchivedRecord[]>([])
  const [archivedRecordsLoading, setArchivedRecordsLoading] = useState(false)
  const [archivedRecordsError, setArchivedRecordsError] = useState('')
  const [archivedRecordsStatus, setArchivedRecordsStatus] = useState('')
  const [referenceTableModalSrc, setReferenceTableModalSrc] = useState('')
  const [clientSearchModalPurpose, setClientSearchModalPurpose] = useState<'helpline' | 'client-profile' | null>(null)
  const [helplineClientSearch, setHelplineClientSearch] = useState('')
  const [helplineClientResults, setHelplineClientResults] = useState<ClientProfileSearchRecord[]>([])
  const [helplineClientSearchLoading, setHelplineClientSearchLoading] = useState(false)
  const [helplineClientSearchError, setHelplineClientSearchError] = useState('')
  const [helplineClientSearchCompleted, setHelplineClientSearchCompleted] = useState(false)
  const [, setCreatingHelplineClientProfile] = useState(false)
  const [formReturnState, setFormReturnState] = useState<FormReturnState | null>(null)
  const [activeFormSaving, setActiveFormSaving] = useState(false)
  const [recordSaveResult, setRecordSaveResult] = useState<RecordSaveResult | null>(null)
  const anotherServiceInFlight = useRef(false)
  const formSaveInFlight = useRef(false)
  const pendingFormSaveConfirmation = useRef<{ kind: string; tableAlias: string; recordId: string } | null>(null)
  const pendingFunderSaveConfirmation = useRef<{ kind: FunderAdminKind; identity: string } | null>(null)
  const pendingHouseholdHistorySaves = useRef(new Map<string, string>())
  const pendingInitialHouseholdSaves = useRef(new Set<string>())
  const [activeFormError, setActiveFormError] = useState('')
  const [nameParts, setNameParts] = useState<NameParts>(EMPTY_NAME_PARTS)
  const [phoneParts, setPhoneParts] = useState<PhoneParts>(EMPTY_PHONE_PARTS)
  const [addressParts, setAddressParts] = useState<AddressParts>(EMPTY_ADDRESS_PARTS)
  const [primaryLanguageOther, setPrimaryLanguageOther] = useState('')
  const [svHelplineNameParts, setSvHelplineNameParts] = useState<NameParts>(EMPTY_NAME_PARTS)
  const [shelterChildAges, setShelterChildAges] = useState<string[]>([])
  const [eventUploadFiles, setEventUploadFiles] = useState<[File | null, File | null]>([null, null])
  const [pendingFormFileUploads, setPendingFormFileUploads] = useState<Record<string, File | null>>({})
  const [compassFileViewer, setCompassFileViewer] = useState<{
    loading: boolean
    error: string
    file: CompassFileDownload | null
    objectUrl: string
    openObjectUrl: string
  }>({ loading: false, error: '', file: null, objectUrl: '', openObjectUrl: '' })
  const compassFileViewerRequestRef = useRef(0)
  const [searchQueryByHub, setSearchQueryByHub] = useState<Record<string, string>>({})
  const [advancedClientFiltersByHub, setAdvancedClientFiltersByHub] = useState<Record<string, AdvancedSearchCriterion[]>>({})
  const clientAdvancedSearch = useRef(createClientAdvancedSearch())
  const hubSearchRequest = useRef(0)
  const hubSearchController = useRef<AbortController | null>(null)
  useEffect(() => () => { hubSearchController.current?.abort(); clientAdvancedSearch.current.clear() }, [])
  const [selectedSearchFormByHub, setSelectedSearchFormByHub] = useState<Record<string, SearchFormOption>>({})
  const [searchResultsByHub, setSearchResultsByHub] = useState<Record<string, ClientProfileSearchRecord[]>>({})
  const [helplineSearchResultsByHub, setHelplineSearchResultsByHub] = useState<Record<string, HelplineSearchRecord[]>>({})
  const [eventSearchResultsByHub, setEventSearchResultsByHub] = useState<Record<string, EventSearchRecord[]>>({})
  const [searchStatusByHub, setSearchStatusByHub] = useState<Record<string, string>>({})
  const [searchErrorByHub, setSearchErrorByHub] = useState<Record<string, string>>({})
  const [searchPageByHub, setSearchPageByHub] = useState<Record<string, number>>({})
  const [searchHasNextByHub, setSearchHasNextByHub] = useState<Record<string, boolean>>({})
  const [activeSearchDetailByHub, setActiveSearchDetailByHub] = useState<Record<string, ClientProfileDetailRecord | null>>({})
  const [activeHelplineDetailByHub, setActiveHelplineDetailByHub] = useState<Record<string, HelplineDetailRecord | null>>({})
  const [activeEventDetailByHub, setActiveEventDetailByHub] = useState<Record<string, EventDetailRecord | null>>({})
  const [detailLoadingByHub, setDetailLoadingByHub] = useState<Record<string, boolean>>({})
  const [detailErrorByHub, setDetailErrorByHub] = useState<Record<string, string>>({})
  const [showFullDetailByHub, setShowFullDetailByHub] = useState<Record<string, boolean>>({})
  const [formPicklistEdits, setFormPicklistEdits] = useState<FormPicklistEditRow[]>([])
  const [programEnrollmentsForClient, setProgramEnrollmentsForClient] = useState<ProgramEnrollmentListRecord[]>([])
  const [programEnrollmentsLoading, setProgramEnrollmentsLoading] = useState(false)
  const [programEnrollmentsError, setProgramEnrollmentsError] = useState('')
  const [selectedProgramEnrollmentDetail, setSelectedProgramEnrollmentDetail] = useState<ProgramEnrollmentDetailRecord | null>(null)
  const [programEnrollmentDetailLoading, setProgramEnrollmentDetailLoading] = useState(false)
  const [programEnrollmentDetailError, setProgramEnrollmentDetailError] = useState('')
  const [servicesForProgramEnrollment, setServicesForProgramEnrollment] = useState<ServicesListRecord[]>([])
  const [servicesLoading, setServicesLoading] = useState(false)
  const [servicesError, setServicesError] = useState('')
  const [bedEnrollmentsForProgramEnrollment, setBedEnrollmentsForProgramEnrollment] = useState<BedEnrollmentListRecord[]>([])
  const [bedEnrollmentLoading, setBedEnrollmentLoading] = useState(false)
  const [bedEnrollmentError, setBedEnrollmentError] = useState('')
  const [servicesForClient, setServicesForClient] = useState<ClientServicesListRecord[]>([])
  const [servicesForClientLoading, setServicesForClientLoading] = useState(false)
  const [servicesForClientError, setServicesForClientError] = useState('')
  const [helplinesForClient, setHelplinesForClient] = useState<HelplineClientListRecord[]>([])
  const [helplinesForClientLoading, setHelplinesForClientLoading] = useState(false)
  const [helplinesForClientError, setHelplinesForClientError] = useState('')
  const [shelterScreeningsForClient, setShelterScreeningsForClient] = useState<ShelterScreeningListRecord[]>([])
  const [shelterScreeningsForClientLoading, setShelterScreeningsForClientLoading] = useState(false)
  const [shelterScreeningsForClientError, setShelterScreeningsForClientError] = useState('')
  const [vocaFormsForClient, setVocaFormsForClient] = useState<VocaFormListRecord[]>([])
  const [vocaFormsForClientLoading, setVocaFormsForClientLoading] = useState(false)
  const [vocaFormsForClientError, setVocaFormsForClientError] = useState('')
  const [selectedServicesDetail, setSelectedServicesDetail] = useState<ServicesDetailRecord | null>(null)
  const [servicesDetailLoading, setServicesDetailLoading] = useState(false)
  const [servicesDetailError, setServicesDetailError] = useState('')
  const [bedEnrollmentsForClient, setBedEnrollmentsForClient] = useState<ClientBedEnrollmentListRecord[]>([])
  const [bedEnrollmentsForClientLoading, setBedEnrollmentsForClientLoading] = useState(false)
  const [bedEnrollmentsForClientError, setBedEnrollmentsForClientError] = useState('')
  const [adultAssessmentsForClient, setAdultAssessmentsForClient] = useState<AdultAssessmentListRecord[]>([])
  const [adultAssessmentsForClientLoading, setAdultAssessmentsForClientLoading] = useState(false)
  const [adultAssessmentsForClientError, setAdultAssessmentsForClientError] = useState('')
  const [selectedAdultAssessmentDetail, setSelectedAdultAssessmentDetail] = useState<AdultAssessmentDetailRecord | null>(null)
  const [adultAssessmentDetailLoading, setAdultAssessmentDetailLoading] = useState(false)
  const [adultAssessmentDetailError, setAdultAssessmentDetailError] = useState('')
  const [childSafetyPlansForClient, setChildSafetyPlansForClient] = useState<ChildSafetyPlanListRecord[]>([])
  const [childSafetyPlansForClientLoading, setChildSafetyPlansForClientLoading] = useState(false)
  const [childSafetyPlansForClientError, setChildSafetyPlansForClientError] = useState('')
  const [selectedChildSafetyPlanDetail, setSelectedChildSafetyPlanDetail] = useState<ChildSafetyPlanDetailRecord | null>(null)
  const [childSafetyPlanDetailLoading, setChildSafetyPlanDetailLoading] = useState(false)
  const [childSafetyPlanDetailError, setChildSafetyPlanDetailError] = useState('')
  const [electronicDocumentsForClient, setElectronicDocumentsForClient] = useState<ElectronicDocumentListRecord[]>([])
  const [electronicDocumentsForClientLoading, setElectronicDocumentsForClientLoading] = useState(false)
  const [electronicDocumentsForClientError, setElectronicDocumentsForClientError] = useState('')
  const [selectedElectronicDocumentDetail, setSelectedElectronicDocumentDetail] = useState<ElectronicDocumentDetailRecord | null>(null)
  const [electronicDocumentDetailLoading, setElectronicDocumentDetailLoading] = useState(false)
  const [electronicDocumentDetailError, setElectronicDocumentDetailError] = useState('')
  const [clientLinkedRecords, setClientLinkedRecords] = useState<Partial<Record<ClientLinkedFormKey, ClientLinkedRecord[]>>>({})
  const [clientLinkedRecordsLoading, setClientLinkedRecordsLoading] = useState(false)
  const [clientLinkedRecordsClientId, setClientLinkedRecordsClientId] = useState('')
  const [clientLinkedRecordsError, setClientLinkedRecordsError] = useState<Partial<Record<ClientLinkedFormKey, string>>>({})
  const [programEnrollmentsClientId, setProgramEnrollmentsClientId] = useState('')
  const clientConsentRequest = useRef(0)
  const [householdView, setHouseholdView] = useState<{ clientId: string; loading: boolean; detail: Awaited<ReturnType<typeof loadHouseholdDetailRecord>> | null; members: HouseholdHistoryRecord[]; error: string } | null>(null)
  const [personFleeingEdit, setPersonFleeingEdit] = useState<{ clientId: string; loading: boolean; error: string } | null>(null)
  const [clientConsentView, setClientConsentView] = useState<{ kind: ClientConsentFormKind; clientId: string; loading: boolean; detail: ClientConsentFormRecord | null; error: string } | null>(null)
  const [focusPlansForClient, setFocusPlansForClient] = useState<FocusPlanListRecord[]>([])
  const [focusPlansForClientLoading, setFocusPlansForClientLoading] = useState(false)
  const [focusPlansForClientError, setFocusPlansForClientError] = useState('')
  const [selectedFocusPlanDetail, setSelectedFocusPlanDetail] = useState<FocusPlanDetailRecord | null>(null)
  const [focusPlanDetailLoading, setFocusPlanDetailLoading] = useState(false)
  const [focusPlanDetailError, setFocusPlanDetailError] = useState('')
  const [goalsForClient, setGoalsForClient] = useState<GoalListRecord[]>([])
  const [goalsForClientLoading, setGoalsForClientLoading] = useState(false)
  const [goalsForClientError, setGoalsForClientError] = useState('')
  const [selectedGoalDetail, setSelectedGoalDetail] = useState<GoalDetailRecord | null>(null)
  const [goalDetailLoading, setGoalDetailLoading] = useState(false)
  const [goalDetailError, setGoalDetailError] = useState('')
  const [initialSafetyPlansForClient, setInitialSafetyPlansForClient] = useState<InitialSafetyPlanListRecord[]>([])
  const [initialSafetyPlansForClientLoading, setInitialSafetyPlansForClientLoading] = useState(false)
  const [initialSafetyPlansForClientError, setInitialSafetyPlansForClientError] = useState('')
  const [selectedInitialSafetyPlanDetail, setSelectedInitialSafetyPlanDetail] = useState<InitialSafetyPlanDetailRecord | null>(null)
  const [initialSafetyPlanDetailLoading, setInitialSafetyPlanDetailLoading] = useState(false)
  const [initialSafetyPlanDetailError, setInitialSafetyPlanDetailError] = useState('')
  const [healthWellnessForClient, setHealthWellnessForClient] = useState<HealthWellnessListRecord[]>([])
  const [healthWellnessForClientLoading, setHealthWellnessForClientLoading] = useState(false)
  const [healthWellnessForClientError, setHealthWellnessForClientError] = useState('')
  const [selectedHealthWellnessDetail, setSelectedHealthWellnessDetail] = useState<HealthWellnessDetailRecord | null>(null)
  const [healthWellnessDetailLoading, setHealthWellnessDetailLoading] = useState(false)
  const [healthWellnessDetailError, setHealthWellnessDetailError] = useState('')
  const [selectedBedEnrollmentDetail, setSelectedBedEnrollmentDetail] = useState<BedEnrollmentDetailRecord | null>(null)
  const [bedEnrollmentDetailLoading, setBedEnrollmentDetailLoading] = useState(false)
  const [bedEnrollmentDetailError, setBedEnrollmentDetailError] = useState('')
  const [householdsForClient, setHouseholdsForClient] = useState<HouseholdListRecord[]>([])
  const [householdsForClientLoading, setHouseholdsForClientLoading] = useState(false)
  const [householdsForClientError, setHouseholdsForClientError] = useState('')
  const [householdMembersDraft, setHouseholdMembersDraft] = useState<HouseholdMemberDraft[]>([])
  const [householdMembersLoading, setHouseholdMembersLoading] = useState(false)
  const [householdMembersError, setHouseholdMembersError] = useState('')
  const [householdOriginalMemberRowIds, setHouseholdOriginalMemberRowIds] = useState<string[]>([])
  const [householdClientSearchQuery, setHouseholdClientSearchQuery] = useState('')
  const [householdClientSearchApplied, setHouseholdClientSearchApplied] = useState('')
  const [householdClientSearchResults, setHouseholdClientSearchResults] = useState<ClientProfileSearchRecord[]>([])
  const [householdClientSearchLoading, setHouseholdClientSearchLoading] = useState(false)
  const [householdClientSearchError, setHouseholdClientSearchError] = useState('')
  const [clientLookupRefreshSignal, setClientLookupRefreshSignal] = useState(0)
  const [selectedClientSectionByHub, setSelectedClientSectionByHub] = useState<Record<string, ClientDetailSectionKey>>({})

  function scrollToTopOfPage() {
    if (typeof window === 'undefined') return
    window.requestAnimationFrame(() => {
      window.scrollTo({ top: 0, left: 0, behavior: 'auto' })
    })
  }

  function rememberFormReturnState() {
    if (!selectedHub) return

    const hasOpenClientProfile = selectedHubPage === 'search' && !!activeSearchDetailByHub[selectedHub.id]

    setFormReturnState({
      hubId: selectedHub.id,
      // A client record is the authoritative origin while its profile page is
      // open, even if another navigation value has not finished updating yet.
      page: hasOpenClientProfile ? 'search' : selectedHubPage,
      appNav: hasOpenClientProfile ? 'clients' : selectedAppNav,
      clientSection: selectedClientSectionByHub[selectedHub.id] || 'overview',
      clientProfileDetail: hasOpenClientProfile ? activeSearchDetailByHub[selectedHub.id] : null,
      programEnrollmentDetail: selectedProgramEnrollmentDetail,
      servicesDetail: selectedServicesDetail,
      bedEnrollmentDetail: selectedBedEnrollmentDetail,
      adultAssessmentDetail: selectedAdultAssessmentDetail,
      childSafetyPlanDetail: selectedChildSafetyPlanDetail,
      focusPlanDetail: selectedFocusPlanDetail,
      initialSafetyPlanDetail: selectedInitialSafetyPlanDetail,
      healthWellnessDetail: selectedHealthWellnessDetail,
    })
  }

  function finishActiveFormSession() {
    pendingFormSaveConfirmation.current = null
    setActiveFormSession(null)
    setFormReturnState(null)
    setEventUploadFiles([null, null])
  }

  function canOpenSavedClient() {
    const hub = formReturnState?.hubId && formReturnState.hubId !== selectedHub?.id
      ? HUB_DEFINITIONS.find((entry) => entry.id === formReturnState.hubId) : selectedHub
    return !!hub && (canAccessRoleAdminForSave() || roleProfiles.some((profile) =>
      hubMatchesRole(hub, profile.roleName) && profile.entries.some((entry) => isClientProfileForm(entry.formName) && entry.permissions.view)))
  }

  function canAccessRoleAdminForSave() {
    return normalize(user.rawRole || '') === 'it admin' || roleProfiles.some((profile) => normalize(profile.roleName) === 'it admin')
  }

  function canStartAnotherService(): boolean {
    return !isUserPreview && !!selectedHub && canCreateForm('Services')
      && (!formReturnState?.hubId || formReturnState.hubId === selectedHub.id)
      && recordSaveResult?.status === 'saved' && recordSaveResult.formKind === 'services'
      && activeFormSession?.kind === 'services' && !!activeFormSession.rowId
      && activeFormSession.rowId === recordSaveResult.rowId
      && isGuidText(recordSaveResult.enrollmentId || '')
  }

  async function startAnotherService(copyServiceNotes = false) {
    if (anotherServiceInFlight.current) return
    if (!canStartAnotherService()) throw new Error('A confirmed Services save and Create permission for Services are required to start another service.')
    const savedSession = activeFormSession!
    const savedResult = recordSaveResult!
    const enrollmentId = normalizeGuidText(savedResult.enrollmentId || '')
    anotherServiceInFlight.current = true
    try {
      // Verify the saved record's actual parent; never use an unrelated cached
      // client profile as the next record's client.
      const enrollment = await loadProgramEnrollmentDetailRecord(enrollmentId)
      const clientId = normalizeGuidText(enrollment.clientRowId || enrollment.values.cmps_clientid || enrollment.values.cmps_cpid || '')
      if (!isGuidText(clientId) || savedResult.clientId && normalizeGuidText(savedResult.clientId) !== clientId) {
        throw new Error('The saved service could not be linked to the same Client Profile. Your saved record is still open.')
      }
      if (String(enrollment.values.cmps_serviceenddate || '').trim()) {
        throw new Error('This Program Enrollment has ended. Choose an active enrollment before starting a new service. Your saved record is still open.')
      }
      const enrollments = await listProgramEnrollmentsForClientRecord(clientId)
      if (!enrollments.some((row) => normalizeGuidText(row.id) === enrollmentId && !String(row.serviceEndDate || '').trim())) {
        throw new Error('An active Program Enrollment for this client could not be verified. Your saved record is still open.')
      }
      if (!canStartAnotherService()) throw new Error('Create access or the saved Services record changed. Remain on the current record and try again.')

      const draftKey = Symbol('services draft')
      setProgramEnrollmentsForClient(enrollments)
      setProgramEnrollmentsClientId(clientId)
      setProgramEnrollmentsError('')
      pendingFormSaveConfirmation.current = null
      setActiveFormError('')
      setHubActionStatus('Started a new Services record for the same client. Complete the service details before saving.')
      setSelectedServicesDetail(null)
      // Keep the original return destination and only carry the parent link
      // plus the explicitly requested notes. Never copy IDs or audit values.
      setActiveFormSession({
        kind: 'services', formName: 'Services', tableAlias: SERVICES_TABLE_ALIAS,
        rowId: '', recordId: '', draftKey,
        values: { cmps_recordid: '', cmps_programenrollment: enrollmentId,
          ...(copyServiceNotes ? { cmps_servicenotes: String(savedSession.values.cmps_servicenotes || '') } : {}) },
      })
      setRecordSaveResult(null)
      scrollToTopOfPage()
      try {
        const recordId = await generateAppRecordId(SERVICES_TABLE_ALIAS, 'SV')
        setActiveFormSession((current) => current?.kind === 'services' && current.draftKey === draftKey
          ? { ...current, recordId, values: { ...current.values, cmps_recordid: recordId } } : current)
      } catch (error) {
        setActiveFormSession((current) => current?.kind === 'services' && current.draftKey === draftKey
          ? { ...current, recordIdError: String((error as Error)?.message || error) } : current)
      }
    } finally {
      anotherServiceInFlight.current = false
    }
  }

  async function chooseRecordSaveDestination(choice: RecordSaveChoice) {
    const result = recordSaveResult
    if (!result) return
    if (choice === 'remain') { setRecordSaveResult(null); return }
    if (result.status !== 'saved') return
    const hubId = formReturnState?.hubId || selectedHub?.id || ''
    if (!hubId) throw new Error('Choose a program workspace before opening search.')
    if (choice === 'client') {
      if (!canOpenSavedClient()) throw new Error('Your COMPASS role does not allow viewing Client Profiles in this program.')
      let clientId = result.clientId || ''
      if (!clientId && result.enrollmentId) {
        const enrollment = await loadProgramEnrollmentDetailRecord(result.enrollmentId)
        clientId = normalizeGuidText(enrollment?.clientRowId || enrollment?.values.cmps_clientid || enrollment?.values.cmps_cpid || '')
      }
      if (!isGuidText(clientId)) throw new Error('This record does not have a valid linked Client Profile.')
      const client = await loadClientProfileDetailRecord(clientId)
      if (!client) throw new Error('The linked Client Profile could not be opened. Your saved record is still open.')
      setActiveSearchDetailByHub((current) => ({ ...current, [hubId]: client }))
      setSelectedClientSectionByHub((current) => ({ ...current, [hubId]: 'overview' }))
      setSelectedSearchFormByHub((current) => ({ ...current, [hubId]: 'Client Profile' }))
      setSelectedAppNav('clients')
    } else {
      setActiveSearchDetailByHub((current) => ({ ...current, [hubId]: null }))
      const origin = formReturnState?.appNav
      setSelectedAppNav(origin === 'clients' || activeFormSession?.kind === 'client-profile' ? 'clients' : origin === 'my-work' || origin === 'archived-records' ? origin : 'programs')
    }
    setSelectedHubId(hubId)
    setSelectedHubPages((current) => ({ ...current, [hubId]: 'search' }))
    setShowFullDetailByHub((current) => ({ ...current, [hubId]: false }))
    setActiveHelplineDetailByHub((current) => ({ ...current, [hubId]: null }))
    setActiveEventDetailByHub((current) => ({ ...current, [hubId]: null }))
    setSelectedServicesDetail(null)
    setSelectedProgramEnrollmentDetail(null)
    setSelectedBedEnrollmentDetail(null)
    setSelectedAdultAssessmentDetail(null)
    setSelectedChildSafetyPlanDetail(null)
    setSelectedFocusPlanDetail(null)
    setSelectedInitialSafetyPlanDetail(null)
    setSelectedHealthWellnessDetail(null)
    setFunderAdminEditor(null)
    setRecordSaveResult(null)
    finishActiveFormSession()
    scrollToTopOfPage()
  }

  const canAccessRoleAdmin = useMemo(() => {
    return normalize(user.rawRole || '') === 'it admin' || roleProfiles.some((profile) => normalize(profile.roleName) === 'it admin')
  }, [roleProfiles, user.rawRole])

  const canMergeClientProfiles = useMemo(() => !isUserPreview && (
    normalize(user.rawRole || '') === 'it admin'
    || roleProfiles.some((profile) => normalize(profile.roleName) === 'it admin')
  ), [isUserPreview, roleProfiles, user.rawRole])

  const canViewReports = canViewReportLibrary(roleProfiles, canAccessRoleAdmin, roleProfilesLoading, roleProfilesError, isUserPreview)

  async function runArchivedRecordSearch() {
    if (!canAccessRoleAdmin || !archivedTableKey) return
    setArchivedRecordsLoading(true)
    setArchivedRecordsError('')
    setArchivedRecordsStatus('')
    try {
      const rows = await searchArchivedRecords(archivedTableKey, archivedSearchQuery)
      setArchivedRecords(rows)
      setArchivedRecordsStatus(rows.length === 1 ? 'Found 1 archived record.' : `Found ${rows.length} archived records.`)
    } catch (error) {
      setArchivedRecords([])
      setArchivedRecordsError(String((error as Error)?.message || error || 'Unable to search archived records.'))
    } finally {
      setArchivedRecordsLoading(false)
    }
  }

  async function archiveRecord(tableAlias: string, rowId: string, recordLabel = '') {
    if (isUserPreview) { setAdminError(USER_PREVIEW_READ_ONLY_MESSAGE); return }
    if (!canAccessRoleAdmin || archiveActionLoading) return
    const definition = ARCHIVE_TABLES.find((entry) => entry.tableAlias === tableAlias)
    const cascadeMessage = tableAlias === CLIENT_PROFILE_TABLE_ALIAS
      ? ' This will also archive every record directly linked to this client and every record linked through the client\'s Program Enrollments.'
      : ''
    if (typeof window !== 'undefined' && !window.confirm(`Archive ${recordLabel || definition?.label || 'this record'}?${cascadeMessage}`)) return

    setArchiveActionLoading(true)
    setArchiveActionError('')
    try {
      const result = await setRecordArchived(tableAlias, rowId, true, String(user.name || user.email || user.id || ''))
      setHubActionStatus(result.updated > 1 ? `Archived ${result.updated} linked records.` : 'Record archived.')
      setActiveFormSession(null)
      if (tableAlias === CLIENT_PROFILE_TABLE_ALIAS) closeClientProfileDetail()
      else closeCurrentRecordView()
      setClientLookupRefreshSignal((current) => current + 1)
      setRefreshAdminSignal((current) => current + 1)
      if (selectedHub && selectedHubPage === 'search') void runHubSearch()
    } catch (error) {
      setArchiveActionError(String((error as Error)?.message || error || 'Unable to archive this record.'))
    } finally {
      setArchiveActionLoading(false)
    }
  }

  async function restoreArchivedRecord(record: ArchivedRecord) {
    if (isUserPreview) { setAdminError(USER_PREVIEW_READ_ONLY_MESSAGE); return }
    if (!canAccessRoleAdmin || archiveActionLoading) return
    const cascadeMessage = record.tableAlias === CLIENT_PROFILE_TABLE_ALIAS
      ? ' This will also restore every record directly linked to this client and every record linked through the client\'s Program Enrollments.'
      : ''
    if (typeof window !== 'undefined' && !window.confirm(`Restore ${record.recordId || record.displayName || record.tableLabel}?${cascadeMessage}`)) return

    setArchiveActionLoading(true)
    setArchivedRecordsError('')
    try {
      const result = await setRecordArchived(record.tableAlias, record.id, false, String(user.name || user.email || user.id || ''))
      setArchivedRecordsStatus(result.updated > 1 ? `Restored ${result.updated} linked records.` : 'Record restored.')
      setArchivedRecords((current) => current.filter((entry) => !(entry.tableAlias === record.tableAlias && entry.id === record.id)))
      setClientLookupRefreshSignal((current) => current + 1)
      setRefreshAdminSignal((current) => current + 1)
    } catch (error) {
      setArchivedRecordsError(String((error as Error)?.message || error || 'Unable to restore this record.'))
    } finally {
      setArchiveActionLoading(false)
    }
  }

  const availableHubs = useMemo(() => {
    if (canAccessRoleAdmin) return HUB_DEFINITIONS

    const matchingRoles = roleProfiles.map((profile) => profile.roleName).concat(user.rawRole || '')
    const matched = HUB_DEFINITIONS.filter((hub) => matchingRoles.some((roleName) => hubMatchesRole(hub, roleName)))
    return matched
  }, [canAccessRoleAdmin, roleProfiles, user.rawRole])

  const selectedHub = useMemo(() => {
    if (availableHubs.length === 0) return null
    return availableHubs.find((hub) => hub.id === selectedHubId) || availableHubs[0]
  }, [availableHubs, selectedHubId])

  const currentStaffEntries = useMemo(() => {
    const identities = new Set([user.id, user.email, user.name, ...(user.identityIds || []), ...(user.identityEmails || [])].map((value) => normalize(String(value || ''))).filter(Boolean))
    return staffDirectoryEntries.filter((entry) => (
      [entry.id, entry.email, entry.name, ...(entry.identityIds || []), ...(entry.identityEmails || [])].some((value) => identities.has(normalize(String(value || ''))))
    ))
  }, [staffDirectoryEntries, user])

  const currentWorkHierarchyLevel = useMemo(() => getWorkHierarchyLevel(
    currentStaffEntries.flatMap((entry) => entry.roleNames),
    user.rawRole || user.role,
  ), [currentStaffEntries, user.rawRole, user.role])
  const canViewAllWork = currentWorkHierarchyLevel !== 'staff'
  const canViewStaffApprovals = currentWorkHierarchyLevel === 'manager' || currentWorkHierarchyLevel === 'director'

  useEffect(() => {
    if (!canViewAllWork && selectedMyWorkPage === 'all-work') setSelectedMyWorkPage('case-load')
  }, [canViewAllWork, selectedMyWorkPage])

  async function generateAppRecordId(tableAlias: string, prefix: string, program?: string): Promise<string> {
    return generateSequentialRecordId(tableAlias, prefix, program || selectedHub?.title)
  }

  const selectedHubPage = useMemo(() => {
    if (!selectedHub) return 'search'
    return selectedHubPages[selectedHub.id] || 'search'
  }, [selectedHub, selectedHubPages])

  const hubFormAccess = useMemo<HubFormAccess[]>(() => {
    if (!selectedHub) return []

    const results: HubFormAccess[] = []
    const seen = new Set<string>()

    const addForm = (formName: string, roleName: string) => {
      const cleanForm = asText(formName)
      if (!cleanForm) return
      const key = normalize(cleanForm)
      if (seen.has(key)) return
      seen.add(key)
      results.push({ formName: cleanForm, roleName })
    }

    if (canAccessRoleAdmin) {
      roleEdits
        .filter((row) => hubMatchesRole(selectedHub, row.roleName))
        .forEach((row) => {
          row.permissions
            .filter((entry) => entry.create)
            .forEach((entry) => addForm(entry.formName, row.roleName))
        })

      return results.sort((a, b) => a.formName.localeCompare(b.formName))
    }

    roleProfiles
      .filter((profile) => hubMatchesRole(selectedHub, profile.roleName))
      .forEach((profile) => {
        profile.entries
          .filter((entry) => entry.permissions.create)
          .forEach((entry) => addForm(entry.formName, profile.roleName))
      })

    return results.sort((a, b) => a.formName.localeCompare(b.formName))
  }, [canAccessRoleAdmin, roleEdits, roleProfiles, selectedHub])

  const hubClientForms = useMemo<HubFormAccess[]>(() => {
    if (!selectedHub) return []

    const results: HubFormAccess[] = []
    const seen = new Set<string>()

    const addForm = (formName: string, roleName: string) => {
      const cleanForm = asText(formName)
      if (!cleanForm) return
      const key = normalize(cleanForm)
      if (seen.has(key)) return
      seen.add(key)
      results.push({ formName: cleanForm, roleName })
    }

    if (canAccessRoleAdmin) {
      roleEdits
        .filter((row) => hubMatchesRole(selectedHub, row.roleName))
        .forEach((row) => {
          row.permissions
            .filter((entry) => entry.view || entry.search || entry.create || entry.edit)
            .forEach((entry) => addForm(entry.formName, row.roleName))
        })

      return results.sort((a, b) => a.formName.localeCompare(b.formName))
    }

    roleProfiles
      .filter((profile) => hubMatchesRole(selectedHub, profile.roleName))
      .forEach((profile) => {
        profile.entries
          .filter((entry) => entry.permissions.view || entry.permissions.search || entry.permissions.create || entry.permissions.edit)
          .forEach((entry) => addForm(entry.formName, profile.roleName))
      })

    return results.sort((a, b) => a.formName.localeCompare(b.formName))
  }, [canAccessRoleAdmin, roleEdits, roleProfiles, selectedHub])

  const hubClientProfileCreateAccess = useMemo<HubFormAccess[]>(
    () => hubFormAccess.filter((form) => isClientProfileForm(form.formName) || isHelplineForm(form.formName) || isHouseholdForm(form.formName) || isEventForm(form.formName)),
    [hubFormAccess],
  )

  function canCreateForm(formName: string): boolean {
    if (!selectedHub || roleProfilesLoading) return false
    const formKey = normalizeClientProfileFormName(getClientProfileFormCatalogEntry(formName)?.name || formName)
    return !!formKey && hubFormAccess.some((entry) => (
      normalizeClientProfileFormName(getClientProfileFormCatalogEntry(entry.formName)?.name || entry.formName) === formKey
    ))
  }

  function getCreateFormsForProgram(programName: string): HubFormAccess[] {
    const hub = HUB_DEFINITIONS.find((entry) => normalize(entry.title) === normalize(programName))
    if (!hub || roleProfilesLoading) return []

    const permitted: HubFormAccess[] = []
    if (canAccessRoleAdmin) {
      roleEdits
        .filter((row) => hubMatchesRole(hub, row.roleName))
        .forEach((row) => row.permissions
          .filter((permission) => permission.create)
          .forEach((permission) => permitted.push({ formName: permission.formName, roleName: row.roleName })))
    } else {
      roleProfiles
        .filter((profile) => hubMatchesRole(hub, profile.roleName))
        .forEach((profile) => profile.entries
          .filter((entry) => entry.permissions.create)
          .forEach((entry) => permitted.push({ formName: entry.formName, roleName: profile.roleName })))
    }

    const byCatalogName = new Map<string, HubFormAccess>()
    for (const form of permitted) {
      const catalogEntry = getClientProfileFormCatalogEntry(form.formName)
      if (catalogEntry && !byCatalogName.has(catalogEntry.name)) {
        byCatalogName.set(catalogEntry.name, { ...form, formName: catalogEntry.name })
      }
    }
    return CLIENT_PROFILE_FORM_CATALOG
      .map((entry) => byCatalogName.get(entry.name))
      .filter((form): form is HubFormAccess => !!form)
  }

  function requireFormCreateAccess(formName: string): boolean {
    if (canCreateForm(formName)) return true
    const message = `You do not have Create permission for ${formName} in this program.`
    setHubActionStatus(message)
    setActiveFormError(message)
    return false
  }

  const activeVocaProgramEnrollmentOptions = useMemo(() => {
    return programEnrollmentsForClient
      .filter((row) => !String(row.serviceEndDate || '').trim() || !!activeFormSession?.rowId && activeFormSession.kind === 'voca-form' && row.id === activeFormSession.values.cmps_peid)
      .map((row) => ({
        value: row.id,
        label: [formatProgramEnrollmentLookupLabel(row), row.program || '', row.serviceStartDate || '']
          .map((entry) => String(entry || '').trim())
          .filter(Boolean)
          .join(' | '),
      }))
  }, [programEnrollmentsForClient, activeFormSession])

  const selectedClientSection: ClientDetailSectionKey = selectedHub
    ? (selectedClientSectionByHub[selectedHub.id] || 'overview')
    : 'overview'

  function resolveClientDetailSection(formName: string): ClientDetailSectionKey {
    return getClientProfileFormCatalogEntry(formName)?.section || 'other'
  }

  const canonicalClientForms = useMemo<HubFormAccess[]>(() => {
    const formsByCatalogName = new Map<string, HubFormAccess>()

    for (const form of hubClientForms) {
      const catalogEntry = getClientProfileFormCatalogEntry(form.formName)
      if (!catalogEntry) continue
      if (!formsByCatalogName.has(catalogEntry.name)) {
        formsByCatalogName.set(catalogEntry.name, { ...form, formName: catalogEntry.name })
      }
    }

    return CLIENT_PROFILE_FORM_CATALOG
      .map((entry) => formsByCatalogName.get(entry.name))
      .filter((form): form is HubFormAccess => !!form)
  }, [hubClientForms])

  const clientFormsBySection = useMemo<Record<ClientDetailSectionKey, HubFormAccess[]>>(() => {
    const bucket: Record<ClientDetailSectionKey, HubFormAccess[]> = {
      overview: [],
      'face-sheet': [],
      'folder-summary': [],
      helpline: [],
      intake: [],
      'service-delivery': [],
      other: [],
    }

    for (const form of canonicalClientForms) {
      if (isClientProfileForm(form.formName) || isHouseholdForm(form.formName)) continue
      bucket[resolveClientDetailSection(form.formName)].push(form)
    }

    return bucket
  }, [canonicalClientForms])

  const visibleClientForms = selectedClientSection === 'overview'
    ? canonicalClientForms.filter((form) => !isClientProfileForm(form.formName) && !isHouseholdForm(form.formName) && !isEventForm(form.formName))
    : clientFormsBySection[selectedClientSection]
  const clientDetailTabs = CLIENT_DETAIL_SECTION_ORDER

  const currentAppNavLabel = APP_NAV_LABELS[selectedAppNav]
  const isProgramsContext = selectedAppNav === 'programs' || selectedHubPage === 'forms'
  const heroTitle = selectedHub
    ? (isProgramsContext ? hubLabel(selectedHub) : currentAppNavLabel)
    : currentAppNavLabel
  const heroSummary = selectedHub
    ? selectedAppNav === 'home'
      ? 'See the latest COMPASS updates and what is on the horizon.'
      : selectedAppNav === 'clients'
        ? 'Browse and open client records for the current hub context.'
        : selectedAppNav === 'my-work'
          ? 'Your assigned work queue will live here.'
          : selectedAppNav === 'reports'
            ? 'Review reporting periods, calculation rules and record-level report details.'
          : selectedAppNav === 'bed-management'
            ? 'Review active beds and import bed records into Dataverse.'
            : selectedAppNav === 'archived-records'
              ? 'Search and restore archived business records.'
            : selectedHub.summary
    : 'No hub is available for the current role yet.'
  const heroContextLabel = selectedHubPage === 'forms'
    ? 'Forms'
    : selectedAppNav === 'clients'
      ? 'Client List'
        : selectedAppNav === 'bed-management'
          ? 'Beds'
      : isProgramsContext
        ? hubPageLabel(selectedHubPage)
        : 'Search'

  const selectedSearchForm: SearchFormOption = selectedHub ? (selectedSearchFormByHub[selectedHub.id] || 'Client Profile') : 'Client Profile'
  const isClientsCardView = selectedAppNav === 'clients' && selectedSearchForm === 'Client Profile'
  const selectedSearchQuery = selectedHub ? (searchQueryByHub[selectedHub.id] || '') : ''
  const selectedAdvancedClientFilters = selectedHub ? advancedClientFiltersByHub[selectedHub.id] || NO_ADVANCED_FILTERS : NO_ADVANCED_FILTERS
  const selectedSearchResults = selectedHub
    ? (selectedSearchForm === 'Helpline'
      ? (helplineSearchResultsByHub[selectedHub.id] || [])
      : selectedSearchForm === 'Event'
        ? (eventSearchResultsByHub[selectedHub.id] || [])
        : (searchResultsByHub[selectedHub.id] || []))
    : []
  const selectedSearchStatus = selectedHub ? (searchStatusByHub[selectedHub.id] || '') : ''
  const selectedSearchError = selectedHub ? (searchErrorByHub[selectedHub.id] || '') : ''
  const selectedSearchPage = selectedHub ? (searchPageByHub[selectedHub.id] || 1) : 1
  const selectedSearchHasNext = selectedHub ? !!searchHasNextByHub[selectedHub.id] : false
  const selectedDetailRecord = selectedHub ? (activeSearchDetailByHub[selectedHub.id] || null) : null
  const activeFormClientContext = getFormClientContext(activeFormSession, selectedDetailRecord, formReturnState?.clientProfileDetail, programEnrollmentsForClient)
  const formBackButtonLabel = formReturnState?.page === 'forms'
    ? 'Back to Forms'
    : formReturnState?.appNav === 'clients'
      && !!activeSearchDetailByHub[formReturnState.hubId]
      ? 'Back to Client Profile'
      : formReturnState?.appNav === 'my-work'
        ? 'Back to My Work'
        : 'Back'
  const selectedHelplineDetail = selectedHub ? (activeHelplineDetailByHub[selectedHub.id] || null) : null
  const selectedEventDetail = selectedHub ? (activeEventDetailByHub[selectedHub.id] || null) : null
  const selectedDetailLoading = selectedHub ? !!detailLoadingByHub[selectedHub.id] : false
  const selectedDetailError = selectedHub ? (detailErrorByHub[selectedHub.id] || '') : ''
  const selectedShowFullDetail = selectedHub ? !!showFullDetailByHub[selectedHub.id] : false
  const activeFolderEnrollments = programEnrollmentsForClient.filter((row) => !String(row.serviceEndDate || '').trim())
  const inProgressGoals = goalsForClient.filter((row) => normalize(row.status) !== normalize('Complete'))
  const faceSheetSuggestedForms = (selectedHub ? getCreateFormsForProgram(selectedHub.title) : [])
    .filter((form) => !isClientProfileForm(form.formName) && !isProgramEnrollmentForm(form.formName) && !isEventForm(form.formName))
    .filter((form) => getClientFormRecordCount(form.formName) === 0)
  const folderSummaryEntries = activeFolderEnrollments.map((enrollment) => ({
    enrollment,
    forms: getCreateFormsForProgram(enrollment.program).map((form) => ({
      ...form,
      recordCount: getClientFormRecordCountForEnrollment(form.formName, enrollment.id),
    })),
  }))
  const clientFolderSummaryLoading = programEnrollmentsLoading
    || goalsForClientLoading
    || clientLinkedRecordsLoading
    || servicesForClientLoading
    || bedEnrollmentsForClientLoading
    || adultAssessmentsForClientLoading
    || childSafetyPlansForClientLoading
    || electronicDocumentsForClientLoading
    || focusPlansForClientLoading
    || vocaFormsForClientLoading
    || initialSafetyPlansForClientLoading
    || healthWellnessForClientLoading
  const clientFolderSummaryError = [
    programEnrollmentsError,
    goalsForClientError,
    servicesForClientError,
    bedEnrollmentsForClientError,
    adultAssessmentsForClientError,
    childSafetyPlansForClientError,
    electronicDocumentsForClientError,
    focusPlansForClientError,
    vocaFormsForClientError,
    initialSafetyPlansForClientError,
    healthWellnessForClientError,
    ...Object.values(clientLinkedRecordsError),
  ].map((value) => String(value || '').trim()).filter(Boolean).join(' ')
  const recordViewBackButtonLabel = recordFormView?.client || selectedDetailRecord
      ? 'Back to Client Profile'
      : 'Back to Search Results'
  const recordViewContext: { tableAlias: string; rowId: string; recordId: string } | null = recordFormView
    ? { tableAlias: Object.keys(PRINT_TABLE_KINDS).find((alias) => PRINT_TABLE_KINDS[alias] === recordFormView.kind) || '', rowId: recordFormView.detail.id, recordId: recordFormView.detail.recordId }
    : selectedServicesDetail
    ? { tableAlias: SERVICES_TABLE_ALIAS, rowId: selectedServicesDetail.id, recordId: selectedServicesDetail.recordId }
    : selectedBedEnrollmentDetail
      ? { tableAlias: BED_ENROLLMENTS_TABLE_ALIAS, rowId: selectedBedEnrollmentDetail.id, recordId: selectedBedEnrollmentDetail.recordId }
      : selectedProgramEnrollmentDetail
        ? { tableAlias: PROGRAM_ENROLLMENT_TABLE_ALIAS, rowId: selectedProgramEnrollmentDetail.id, recordId: selectedProgramEnrollmentDetail.recordId }
        : selectedHelplineDetail
          ? { tableAlias: HELPLINES_TABLE_ALIAS, rowId: selectedHelplineDetail.id, recordId: selectedHelplineDetail.recordId }
          : selectedEventDetail
            ? { tableAlias: EVENTS_TABLE_ALIAS, rowId: selectedEventDetail.id, recordId: selectedEventDetail.recordId }
            : selectedChildSafetyPlanDetail
              ? { tableAlias: CHILD_SAFETY_PLANS_TABLE_ALIAS, rowId: selectedChildSafetyPlanDetail.id, recordId: selectedChildSafetyPlanDetail.recordId }
              : selectedAdultAssessmentDetail
                ? { tableAlias: ADULT_ASSESSMENTS_TABLE_ALIAS, rowId: selectedAdultAssessmentDetail.id, recordId: selectedAdultAssessmentDetail.recordId }
                : selectedHealthWellnessDetail
                  ? { tableAlias: HEALTH_WELLNESS_TABLE_ALIAS, rowId: selectedHealthWellnessDetail.id, recordId: selectedHealthWellnessDetail.recordId }
                  : selectedGoalDetail
                    ? { tableAlias: GOALS_TABLE_ALIAS, rowId: selectedGoalDetail.id, recordId: selectedGoalDetail.recordId }
                    : selectedFocusPlanDetail
                      ? { tableAlias: FOCUS_PLANS_TABLE_ALIAS, rowId: selectedFocusPlanDetail.id, recordId: selectedFocusPlanDetail.recordId }
                      : selectedInitialSafetyPlanDetail
                        ? { tableAlias: INITIAL_SAFETY_PLANS_TABLE_ALIAS, rowId: selectedInitialSafetyPlanDetail.id, recordId: selectedInitialSafetyPlanDetail.recordId }
                      : selectedElectronicDocumentDetail
                        ? { tableAlias: ELECTRONIC_DOCUMENTS_TABLE_ALIAS, rowId: selectedElectronicDocumentDetail.id, recordId: selectedElectronicDocumentDetail.recordId }
                        : selectedShowFullDetail && selectedDetailRecord
                          ? { tableAlias: CLIENT_PROFILE_TABLE_ALIAS, rowId: selectedDetailRecord.id, recordId: selectedDetailRecord.recordId }
                          : null
  const activeFormValueMap = (activeFormSession?.values || {}) as Record<string, string>
  const displayedSystemFields: SystemFields = {
    createdBy: activeSystemFields.createdBy || String(activeFormValueMap.cmps_createdby || activeFormValueMap.createdby || '').trim(),
    createdOn: activeSystemFields.createdOn || String(activeFormValueMap.createdon || '').trim(),
    modifiedBy: activeSystemFields.modifiedBy || String(activeFormValueMap.cmps_modifiedby || activeFormValueMap.modifiedby || '').trim(),
    modifiedOn: activeSystemFields.modifiedOn || String(activeFormValueMap.modifiedon || '').trim(),
  }

  useEffect(() => {
    const rowId = String(activeFormSession?.rowId || '').trim()
    const tableAlias = String(activeFormSession?.tableAlias || '').trim()
    if (!activeFormSession || !rowId || !tableAlias) {
      setActiveSystemFields(EMPTY_SYSTEM_FIELDS)
      setActiveSystemFieldsLoading(false)
      setActiveSystemFieldsError('')
      return
    }

    let disposed = false
    setActiveSystemFieldsLoading(true)
    setActiveSystemFieldsError('')
    void loadSystemFields(tableAlias, rowId)
      .then((fields) => {
        if (!disposed) setActiveSystemFields(fields)
      })
      .catch((error) => {
        if (disposed) return
        setActiveSystemFields(EMPTY_SYSTEM_FIELDS)
        setActiveSystemFieldsError(String((error as Error)?.message || error || 'Unable to load system fields.'))
      })
      .finally(() => {
        if (!disposed) setActiveSystemFieldsLoading(false)
      })

    return () => { disposed = true }
  }, [activeFormSession?.rowId, activeFormSession?.tableAlias, clientLookupRefreshSignal])

  useEffect(() => {
    const rowId = String(recordViewContext?.rowId || '').trim()
    const tableAlias = String(recordViewContext?.tableAlias || '').trim()
    if (!rowId || !tableAlias) {
      setRecordViewSystemFields(EMPTY_SYSTEM_FIELDS)
      setRecordViewSystemFieldsLoading(false)
      setRecordViewSystemFieldsError('')
      return
    }

    let disposed = false
    setRecordViewSystemFieldsLoading(true)
    setRecordViewSystemFieldsError('')
    void loadSystemFields(tableAlias, rowId)
      .then((fields) => {
        if (!disposed) setRecordViewSystemFields(fields)
      })
      .catch((error) => {
        if (disposed) return
        setRecordViewSystemFields(EMPTY_SYSTEM_FIELDS)
        setRecordViewSystemFieldsError(String((error as Error)?.message || error || 'Unable to load system fields.'))
      })
      .finally(() => {
        if (!disposed) setRecordViewSystemFieldsLoading(false)
      })

    return () => { disposed = true }
  }, [recordViewContext?.rowId, recordViewContext?.tableAlias, clientLookupRefreshSignal])

  useEffect(() => {
    if (availableHubs.length === 0) {
      if (selectedHubId) setSelectedHubId('')
      return
    }

    const hasSelection = availableHubs.some((hub) => hub.id === selectedHubId)
    if (!hasSelection) {
      setSelectedHubId(availableHubs[0].id)
    }
  }, [availableHubs, selectedHubId])

  useEffect(() => {
    const hasClient = !!String(selectedDetailRecord?.id || selectedDetailRecord?.recordId || '').trim()
    const clientRowId = String(selectedDetailRecord?.id || '').trim()
    if (!hasClient || !clientRowId) {
      setHelplinesForClient([])
      setHelplinesForClientError('')
      setHelplinesForClientLoading(false)
      return
    }
    let disposed = false
    const run = async () => {
      setHelplinesForClientLoading(true)
      setHelplinesForClientError('')
      try {
        const rows = await listHelplinesForClient(clientRowId)
        if (!disposed) setHelplinesForClient(rows)
      } catch (err) {
        if (!disposed) {
          setHelplinesForClient([])
          setHelplinesForClientError(String((err as Error)?.message || err))
        }
      } finally {
        if (!disposed) setHelplinesForClientLoading(false)
      }
    }
    void run()
    return () => { disposed = true }
  }, [selectedDetailRecord?.id, selectedDetailRecord?.recordId, clientLookupRefreshSignal])

useEffect(() => {
    const clientRowId = String(selectedDetailRecord?.id || '').trim()
    clientConsentRequest.current += 1
    setClientConsentView(null)
    setPersonFleeingEdit(null)
    setHouseholdView(null)
    setClientLinkedRecords({})
    setClientLinkedRecordsClientId('')
    setClientLinkedRecordsError({})
    if (!clientRowId) { setClientLinkedRecordsLoading(false); return }
    // Do not query using the previous client's enrollment IDs while switching profiles.
    if (programEnrollmentsClientId !== clientRowId || programEnrollmentsLoading) { setClientLinkedRecordsLoading(true); return }
    let disposed = false
    const run = async () => {
      setClientLinkedRecordsLoading(true)
      const enrollmentIds = programEnrollmentsForClient.map((entry) => entry.id)
      const entries = await Promise.all((Object.entries(CLIENT_LINKED_RECORD_SOURCES) as Array<[ClientLinkedFormKey, ClientLinkedRecordSource]>).map(async ([key, source]) => {
        try {
          if (!canReadClientLinkedForm(key)) return { key, rows: [] as ClientLinkedRecord[], error: '' }
          if (source.enrollmentLookup && programEnrollmentsError) throw new Error('Enrollment records could not be loaded; this record count is unavailable. ' + programEnrollmentsError)
          return { key, rows: await listClientLinkedRecords(source, clientRowId, enrollmentIds), error: '' }
        } catch (error) { return { key, rows: [] as ClientLinkedRecord[], error: String((error as Error)?.message || error) } }
      }))
      if (disposed) return
      setClientLinkedRecords(Object.fromEntries(entries.map((entry) => [entry.key, entry.rows])))
      setClientLinkedRecordsClientId(clientRowId)
      setClientLinkedRecordsError(Object.fromEntries(entries.filter((entry) => entry.error).map((entry) => [entry.key, entry.error])))
      setClientLinkedRecordsLoading(false)
    }
    void run()
    return () => { disposed = true }
  }, [selectedDetailRecord?.id, selectedDetailRecord?.recordId, programEnrollmentsForClient, programEnrollmentsClientId, programEnrollmentsLoading, programEnrollmentsError, clientLookupRefreshSignal, roleProfiles, selectedHub, canAccessRoleAdmin])

  useEffect(() => {
    const clientRowId = String(selectedDetailRecord?.id || '').trim()
    if (!clientRowId) {
      setShelterScreeningsForClient([])
      setShelterScreeningsForClientError('')
      setShelterScreeningsForClientLoading(false)
      return
    }
    let disposed = false
    const run = async () => {
      setShelterScreeningsForClientLoading(true)
      setShelterScreeningsForClientError('')
      try {
        const rows = await listShelterScreeningsForClient(clientRowId)
        if (!disposed) setShelterScreeningsForClient(rows)
      } catch (err) {
        if (!disposed) {
          setShelterScreeningsForClient([])
          setShelterScreeningsForClientError(String((err as Error)?.message || err))
        }
      } finally {
        if (!disposed) setShelterScreeningsForClientLoading(false)
      }
    }
    void run()
    return () => { disposed = true }
  }, [selectedDetailRecord?.id, selectedDetailRecord?.recordId, clientLookupRefreshSignal])

  useEffect(() => {
    const clientRowId = String(selectedDetailRecord?.id || '').trim()
    const enrollmentIds = programEnrollmentsForClient.filter((row) => normalizeGuidText(String(row.clientRowId || '')) === normalizeGuidText(clientRowId)).map((row) => String(row.id || '').trim()).filter(Boolean)
    if (!clientRowId) {
      setVocaFormsForClient([])
      setVocaFormsForClientError('')
      setVocaFormsForClientLoading(false)
      return
    }
    let disposed = false
    const run = async () => {
      setVocaFormsForClientLoading(true)
      setVocaFormsForClientError('')
      try {
        const rows = await listVocaFormsForClient(clientRowId, enrollmentIds)
        if (!disposed) setVocaFormsForClient(rows)
      } catch (err) {
        if (!disposed) {
          setVocaFormsForClient([])
          setVocaFormsForClientError(String((err as Error)?.message || err))
        }
      } finally {
        if (!disposed) setVocaFormsForClientLoading(false)
      }
    }
    void run()
    return () => { disposed = true }
  }, [selectedDetailRecord?.id, selectedDetailRecord?.recordId, programEnrollmentsForClient, clientLookupRefreshSignal])

  useEffect(() => {
    const clientRowId = String(selectedDetailRecord?.id || '').trim()
    if (!clientRowId) {
      setElectronicDocumentsForClient([])
      setElectronicDocumentsForClientError('')
      setElectronicDocumentsForClientLoading(false)
      return
    }

    let disposed = false
    const run = async () => {
      setElectronicDocumentsForClientLoading(true)
      setElectronicDocumentsForClientError('')
      try {
        const rows = await listElectronicDocumentsForClient(clientRowId)
        if (!disposed) setElectronicDocumentsForClient(rows)
      } catch (err) {
        if (!disposed) {
          setElectronicDocumentsForClient([])
          setElectronicDocumentsForClientError(String((err as Error)?.message || err))
        }
      } finally {
        if (!disposed) setElectronicDocumentsForClientLoading(false)
      }
    }

    void run()
    return () => {
      disposed = true
    }
  }, [selectedDetailRecord?.id, selectedDetailRecord?.recordId, clientLookupRefreshSignal])

  useEffect(() => {
    const hasClient = !!String(selectedDetailRecord?.id || selectedDetailRecord?.recordId || '').trim()
    const enrollmentIds = programEnrollmentsForClient.map((row) => String(row.id || '').trim()).filter(Boolean)
    if (!hasClient || enrollmentIds.length === 0) {
      setGoalsForClient([])
      setGoalsForClientError('')
      setGoalsForClientLoading(false)
      return
    }
    let disposed = false
    const run = async () => {
      setGoalsForClientLoading(true)
      setGoalsForClientError('')
      try {
        const rows = await listGoalsForProgramEnrollments(enrollmentIds)
        if (!disposed) setGoalsForClient(rows)
      } catch (err) {
        if (!disposed) {
          setGoalsForClient([])
          setGoalsForClientError(String((err as Error)?.message || err))
        }
      } finally {
        if (!disposed) setGoalsForClientLoading(false)
      }
    }
    void run()
    return () => { disposed = true }
  }, [selectedDetailRecord?.id, selectedDetailRecord?.recordId, programEnrollmentsForClient, clientLookupRefreshSignal])

  useEffect(() => {
    if (!selectedHub) return
    setSelectedHubPages((current) =>
      current[selectedHub.id]
        ? current
        : { ...current, [selectedHub.id]: 'search' },
    )

    setSelectedSearchFormByHub((current) =>
      current[selectedHub.id]
        ? current
        : { ...current, [selectedHub.id]: 'Client Profile' },
    )

    setSearchPageByHub((current) =>
      current[selectedHub.id]
        ? current
        : { ...current, [selectedHub.id]: 1 },
    )

    setSearchHasNextByHub((current) =>
      current[selectedHub.id] !== undefined
        ? current
        : { ...current, [selectedHub.id]: false },
    )

    setSelectedClientSectionByHub((current) =>
      current[selectedHub.id]
        ? current
        : { ...current, [selectedHub.id]: 'overview' },
    )

    setExpandedProgramNavId((current) => current || selectedHub.id)
  }, [selectedHub])

  useEffect(() => {
    if (selectedHubPage === 'forms') {
      setSelectedAppNav('programs')
    }
  }, [selectedHubPage])

  useEffect(() => {
    const refreshUser = () => setUser(getCurrentUser())
    window.addEventListener('compass:authChanged', refreshUser)
    return () => window.removeEventListener('compass:authChanged', refreshUser)
  }, [])

  useEffect(() => {
    if (!activeFormSession) {
      setNameParts(EMPTY_NAME_PARTS)
      setPhoneParts(EMPTY_PHONE_PARTS)
      setAddressParts(EMPTY_ADDRESS_PARTS)
      setPrimaryLanguageOther('')
      setSvHelplineNameParts(EMPTY_NAME_PARTS)
      setShelterChildAges([])
      setHouseholdMembersDraft([])
      setHouseholdMembersError('')
      setHouseholdOriginalMemberRowIds([])
      return
    }

    if (activeFormSession.kind !== 'household') {
      setHouseholdMembersDraft([])
      setHouseholdMembersError('')
      setHouseholdOriginalMemberRowIds([])
    }

    if (activeFormSession.kind === 'program-enrollment') {
      setNameParts(EMPTY_NAME_PARTS)
      setPhoneParts(EMPTY_PHONE_PARTS)
      setAddressParts(EMPTY_ADDRESS_PARTS)
      setPrimaryLanguageOther('')
      setSvHelplineNameParts(parseNameParts(activeFormSession.values.cmps_nameofsvhelplineclient || ''))
      setShelterChildAges([])
      const derivedProgramType = getDerivedProgramEnrollmentType(activeFormSession.values.cmps_program || '')
      const programEnrollmentUpdates: Record<string, string> = {}
      if (derivedProgramType !== (activeFormSession.values.cmps_programtype || '')) {
        programEnrollmentUpdates.cmps_programtype = derivedProgramType
      }
      const defaultProjectType = getDefaultProgramEnrollmentProjectType(activeFormSession.values.cmps_program || '')
      if (defaultProjectType && !String(activeFormSession.values.cmps_projecttype || '').trim()) {
        programEnrollmentUpdates.cmps_projecttype = defaultProjectType
      }
      if (activeFormSession.rowId) {
        const calculatedLengthOfStay = calculateLengthOfStay(
          activeFormSession.values.cmps_servicestartdate || '',
          activeFormSession.values.cmps_serviceenddate || '',
        )
        if (calculatedLengthOfStay !== (activeFormSession.values.cmps_lengthofstay || '')) {
          programEnrollmentUpdates.cmps_lengthofstay = calculatedLengthOfStay
        }
      }
      if (Object.keys(programEnrollmentUpdates).length > 0) {
        setActiveFormSession((current) => current && current.kind === 'program-enrollment'
          ? { ...current, values: { ...current.values, ...programEnrollmentUpdates } }
          : current)
      }
      return
    }

    if (activeFormSession.kind === 'shelter-screening') {
      const childCountRaw = String(activeFormSession.values.cmps_numberofchildrencomingtotheshelter || '').trim()
      const childCount = Math.max(0, Math.min(20, Number.parseInt(childCountRaw || '0', 10) || 0))
      const existingAges = String(activeFormSession.values.cmps_agesofchildren || '')
        .split(',')
        .map((entry) => entry.trim())
      const nextAges = Array.from({ length: childCount }, (_, index) => existingAges[index] || '')

      setNameParts(EMPTY_NAME_PARTS)
      setPhoneParts(EMPTY_PHONE_PARTS)
      setAddressParts(EMPTY_ADDRESS_PARTS)
      setPrimaryLanguageOther('')
      setSvHelplineNameParts(EMPTY_NAME_PARTS)
      setShelterChildAges(nextAges)
      return
    }

    if (activeFormSession.kind === 'services' || activeFormSession.kind === 'bed-enrollment' || activeFormSession.kind === 'helpline' || activeFormSession.kind === 'voca-form') {
      setNameParts(EMPTY_NAME_PARTS)
      setPhoneParts(EMPTY_PHONE_PARTS)
      setAddressParts(EMPTY_ADDRESS_PARTS)
      setPrimaryLanguageOther('')
      setSvHelplineNameParts(EMPTY_NAME_PARTS)
      setShelterChildAges([])
      return
    }

    if (activeFormSession.kind === 'household') {
      setNameParts(EMPTY_NAME_PARTS)
      setAddressParts(EMPTY_ADDRESS_PARTS)
      setPrimaryLanguageOther('')
      setSvHelplineNameParts(EMPTY_NAME_PARTS)
      setShelterChildAges([])
      return
    }

    setNameParts(getClientProfileNameParts(activeFormSession.values))
    setPhoneParts(parsePhoneParts(activeFormSession.values.cmps_clientcontactinformation || ''))
    setAddressParts(getClientProfileAddressParts(activeFormSession.values))
    setPrimaryLanguageOther(parsePrimaryLanguage(activeFormSession.values.cmps_primarylanguage || '').otherText)
    setSvHelplineNameParts(EMPTY_NAME_PARTS)
    setShelterChildAges([])
  }, [activeFormSession])

  useEffect(() => {
    let disposed = false

    const run = async () => {
      setRoleProfilesLoading(true)
      setRoleProfilesError('')
      setAdminError('')
      try {
        const profiles = previewSession?.profiles || await loadRolePermissionsForUser(user)
        const pulledRows = await loadRoleRowsForAdmin()
        const staffEntries = await loadStaffDirectoryEntries()
        if (!disposed) {
          setRoleProfiles(profiles)
          setStaffDirectoryEntries(staffEntries)
          setRoleEdits(pulledRows.map((row) => ({
            originalRoleName: row.roleName,
            id: row.id,
            roleName: row.roleName,
            members: parseAdminMembers(row.jsonUsersRaw),
            permissions: parseAdminPermissions(row.jsonDataRaw),
          })))
          setFormPicklistEdits([])
        }
      } catch (err) {
        if (!disposed) {
          setRoleProfiles([])
          setStaffDirectoryEntries([])
          setRoleEdits([])
          setFormPicklistEdits([])
          const message = String((err as Error)?.message || err)
          setRoleProfilesError(message)
          setAdminError(message)
        }
      } finally {
        if (!disposed) {
          setRoleProfilesLoading(false)
        }
      }
    }

    void run()

    return () => {
      disposed = true
    }
  }, [user, refreshAdminSignal])

  useEffect(() => {
    if (view !== 'admin' || adminPage !== 'funders' || !canAccessRoleAdmin) return
    let disposed = false
    setFunderAdminLoading(true)
    setFunderAdminError('')
    void loadFunderAdminData()
      .then((data) => { if (!disposed) setFunderAdminData(data) })
      .catch((error) => { if (!disposed) { setFunderAdminData(null); setFunderAdminError(String((error as Error)?.message || error || 'Unable to load funder data.')) } })
      .finally(() => { if (!disposed) setFunderAdminLoading(false) })
    return () => { disposed = true }
  }, [adminPage, canAccessRoleAdmin, refreshAdminSignal, view])

  useEffect(() => {
    if (view !== 'admin' || adminPage !== 'funders' || !canAccessRoleAdmin) {
      setFunderAdminEditor(null)
      setFunderAdminEditorError('')
    }
  }, [adminPage, canAccessRoleAdmin, view])

  useEffect(() => {
    const isBedManagementPage = (view === 'admin' && adminPage === 'beds') || (view === 'home' && selectedAppNav === 'bed-management')
    if (!isBedManagementPage || !canAccessRoleAdmin) return
    let disposed = false
    setBedAdminLoading(true)
    void listBedManagementRecords()
      .then((records) => { if (!disposed) setBedAdminRecords(records) })
      .catch((error) => {
        if (!disposed) {
          setBedAdminRecords([])
          setBedAdminError(String((error as Error)?.message || error || 'Unable to load bed records.'))
        }
      })
      .finally(() => { if (!disposed) setBedAdminLoading(false) })
    return () => { disposed = true }
  }, [adminPage, canAccessRoleAdmin, refreshAdminSignal, selectedAppNav, view])

  useEffect(() => {
    let disposed = false
    void loadActiveFunders()
      .then((options) => { if (!disposed) setActiveFunderOptions(options) })
      .catch(() => { if (!disposed) setActiveFunderOptions([]) })
    void loadActiveFunderContracts()
      .then((options) => { if (!disposed) setActiveFunderContractOptions(options) })
      .catch(() => { if (!disposed) setActiveFunderContractOptions([]) })
    return () => { disposed = true }
  }, [refreshAdminSignal])

  useEffect(() => {
    if (selectedAppNav !== 'my-work' || selectedMyWorkPage !== 'case-load') return

    let disposed = false
    const normalizeCaseLoadValue = (value: unknown) => normalize(String(value || ''))
    const run = async () => {
      setCaseLoadLoading(true)
      setCaseLoadError('')
      try {
        const staffNames = new Set(
          [user.id, user.email, user.name]
            .map(normalizeCaseLoadValue)
            .filter(Boolean),
        )
        staffDirectoryEntries
          .filter((entry) => [entry.id, entry.email, entry.name].some((value) => staffNames.has(normalizeCaseLoadValue(value))))
          .flatMap((entry) => [entry.id, entry.email, entry.name])
          .map(normalizeCaseLoadValue)
          .filter(Boolean)
          .forEach((value) => staffNames.add(value))

        const matchingStaffEntries = staffDirectoryEntries.filter((entry) => [entry.id, entry.email, entry.name].some((value) => staffNames.has(normalizeCaseLoadValue(value))))
        const userPrograms = HUB_DEFINITIONS
          .filter((hub) => matchingStaffEntries.some((entry) => entry.roleNames.some((roleName) => hubMatchesRole(hub, roleName))))
          .map((hub) => normalizeCaseLoadValue(hub.title))
        const enrollments = await listActiveProgramEnrollments({ staffIdentities: Array.from(staffNames), programs: userPrograms })
        const assigned = enrollments.filter((enrollment) =>
          userPrograms.includes(normalizeCaseLoadValue(enrollment.program))
          && staffNames.has(normalizeCaseLoadValue(enrollment.staffAssigned)),
        )
        const records = await buildCaseLoadRecords(assigned)
        if (!disposed) setCaseLoadRecords(records)
      } catch (error) {
        if (!disposed) {
          setCaseLoadRecords([])
          setCaseLoadError(String((error as Error)?.message || error || 'Unable to load your case load.'))
        }
      } finally {
        if (!disposed) setCaseLoadLoading(false)
      }
    }

    void run()
    return () => { disposed = true }
  }, [selectedAppNav, selectedMyWorkPage, staffDirectoryEntries, user, clientLookupRefreshSignal])

  useEffect(() => {
    if (selectedAppNav !== 'my-work' || selectedMyWorkPage !== 'all-work' || !canViewAllWork) return

    let disposed = false
    const run = async () => {
      setAllWorkLoading(true)
      setAllWorkError('')
      try {
        const currentPrograms = new Set<string>()
        currentStaffEntries.forEach((entry) => getStaffProgramKeys(entry).forEach((program) => currentPrograms.add(program)))
        if (currentPrograms.size === 0 && selectedHub?.title) currentPrograms.add(normalize(selectedHub.title))

        const sharesCurrentProgram = (entry: StaffDirectoryEntry) => {
          if (currentPrograms.size === 0) return true
          const entryPrograms = getStaffProgramKeys(entry)
          return Array.from(entryPrograms).some((program) => currentPrograms.has(program))
        }
        const isCurrentUser = (entry: StaffDirectoryEntry) => currentStaffEntries.some((current) => (
          [current.id, current.email, current.name]
            .map((value) => normalize(String(value || '')))
            .filter(Boolean)
            .some((identity) => [entry.id, entry.email, entry.name].some((value) => normalize(String(value || '')) === identity))
        ))

        const targetEntries = staffDirectoryEntries.filter((entry) => {
          const entryLevel = getWorkHierarchyLevel(entry.roleNames)
          if (currentWorkHierarchyLevel === 'supervisor') {
            return isCurrentUser(entry) || entryLevel === 'staff' && sharesCurrentProgram(entry)
          }
          if (currentWorkHierarchyLevel === 'manager') {
            return entryLevel === 'supervisor' && sharesCurrentProgram(entry)
          }
          return entryLevel === 'manager' && sharesCurrentProgram(entry)
        })

        const targetIdentities = new Set(
          targetEntries
            .flatMap((entry) => [entry.id, entry.email, entry.name])
            .map((value) => normalize(String(value || '')))
            .filter(Boolean),
        )
        const targetPrograms = new Set<string>()
        targetEntries.forEach((entry) => getStaffProgramKeys(entry).forEach((program) => targetPrograms.add(program)))

        const enrollments = await listActiveProgramEnrollments({ staffIdentities: Array.from(targetIdentities), ...(targetPrograms.size ? { programs: Array.from(targetPrograms) } : {}) })
        const assigned = enrollments.filter((enrollment) => (
          targetIdentities.has(normalize(String(enrollment.staffAssigned || '')))
          && (targetPrograms.size === 0 || targetPrograms.has(normalize(String(enrollment.program || ''))))
        ))
        const records = await buildCaseLoadRecords(assigned)
        if (!disposed) setAllWorkRecords(records)
      } catch (error) {
        if (!disposed) {
          setAllWorkRecords([])
          setAllWorkError(String((error as Error)?.message || error || 'Unable to load team work.'))
        }
      } finally {
        if (!disposed) setAllWorkLoading(false)
      }
    }

    void run()
    return () => { disposed = true }
  }, [canViewAllWork, currentStaffEntries, currentWorkHierarchyLevel, selectedAppNav, selectedHub?.title, selectedMyWorkPage, staffDirectoryEntries, clientLookupRefreshSignal])

  useEffect(() => {
    let disposed = false
    const normalizePendingValue = (value: unknown) => normalize(String(value || ''))
    const run = async () => {
      setPendingVocaLoading(true)
      setPendingVocaError('')
      try {
        const userIdentity = new Set([user.id, user.email, user.name].map(normalizePendingValue).filter(Boolean))
        const matchingStaffEntries = staffDirectoryEntries.filter((entry) => [entry.id, entry.email, entry.name].some((value) => userIdentity.has(normalizePendingValue(value))))
        const staffNames = new Set(userIdentity)
        matchingStaffEntries.flatMap((entry) => [entry.id, entry.email, entry.name]).map(normalizePendingValue).filter(Boolean).forEach((value) => staffNames.add(value))
        const [enrollments, existingVocaIds] = await Promise.all([listActiveProgramEnrollments({ staffIdentities: Array.from(staffNames) }), listExistingVocaProgramEnrollmentIds()])
        const existingVoca = new Set(existingVocaIds.map(normalizePendingValue))
        const vocaFunderIds = new Set(activeFunderOptions.filter((option) => normalizePendingValue(option.name) === 'voca').map((option) => normalizePendingValue(option.id)))
        const eligibleEnrollments = enrollments.filter((enrollment) =>
          staffNames.has(normalizePendingValue(enrollment.staffAssigned))
          && !existingVoca.has(normalizePendingValue(enrollment.id)),
        )
        const classifiedCandidates = await mapWorkRecords(eligibleEnrollments, async (enrollment) => {
          const enrollmentReason = getPendingVocaReason(enrollment.funder, [], vocaFunderIds)
          if (enrollmentReason) return { enrollment, reason: enrollmentReason }
          const services = await listServicesForProgramEnrollmentRecord(enrollment.id)
          const serviceReason = getPendingVocaReason(enrollment.funder, services.map((service) => service.funder), vocaFunderIds)
          return serviceReason ? { enrollment, reason: serviceReason } : null
        })
        const candidates = classifiedCandidates.filter((candidate): candidate is { enrollment: ProgramEnrollmentListRecord; reason: PendingVocaReason } => !!candidate)
        const details = await mapWorkRecords(candidates, async ({ enrollment, reason }) => {
          if (!enrollment.clientRowId) return null
          try {
            const detail = await loadClientProfileDetailRecord(enrollment.clientRowId)
            const values = detail.values as Record<string, string>
            return {
              client: {
                id: detail.id,
                recordId: detail.recordId,
                name: [values.cmps_name, values.cmps_middlename, values.cmps_lastname].filter(Boolean).join(' '),
                hmisId: values.cmps_hmisid || '', dateOfBirth: values.cmps_dateofbirth || '', primaryLanguage: values.cmps_primarylanguage || '', gender: values.cmps_gender || '', alertList: values.cmps_alertlist || '', alertListReason: values.cmps_alertlistreason || '',
                searchValues: { cmps_race: values.cmps_race || '' },
              },
              program: enrollment.program,
              enrollmentRecordId: enrollment.recordId,
              startDate: enrollment.serviceStartDate,
              endDate: enrollment.serviceEndDate,
              enrollmentId: enrollment.id,
              reason,
            } as PendingVocaItem
          } catch {
            return null
          }
        })
        if (!disposed) setPendingVocaItems(details.filter((item): item is PendingVocaItem => !!item))
      } catch (error) {
        if (!disposed) { setPendingVocaItems([]); setPendingVocaError(String((error as Error)?.message || error || 'Unable to load pending items.')) }
      } finally {
        if (!disposed) setPendingVocaLoading(false)
      }
    }
    void run()
    return () => { disposed = true }
  }, [activeFunderOptions, clientLookupRefreshSignal, staffDirectoryEntries, user])

  useEffect(() => {
    if (activeFormSession?.kind !== 'bed-enrollment') {
      setAvailableBedsForEnrollment([])
      setBedsError('')
      return
    }
    const enrollmentId = String(activeFormSession.values.cmps_programenrollment || '').trim()
    const enrollment = programEnrollmentsForClient.find((entry) => normalize(entry.id) === normalize(enrollmentId))
    if (!enrollment?.program) {
      setAvailableBedsForEnrollment([])
      return
    }

    let disposed = false
    setBedsLoading(true)
    setBedsError('')
    const bedEnrollmentId = String(activeFormSession.rowId || '').trim()
    void listSelectableBedsForEnrollment(enrollment.program, bedEnrollmentId)
      .then(({ beds, assignedBedIds }) => {
        if (disposed) return
        setAvailableBedsForEnrollment(beds)
        if (assignedBedIds.length > 0) {
          setActiveFormSession((current) => {
            if (!current || current.kind !== 'bed-enrollment' || current.rowId !== bedEnrollmentId) return current
            if (String(current.values.cmps_selectedbeds || '').trim()) return current
            return { ...current, values: { ...current.values, cmps_selectedbeds: assignedBedIds.join(', ') } }
          })
        }
      })
      .catch((error) => { if (!disposed) { setAvailableBedsForEnrollment([]); setBedsError(String((error as Error)?.message || error || 'Unable to load available beds.')) } })
      .finally(() => { if (!disposed) setBedsLoading(false) })
    return () => { disposed = true }
  }, [activeFormSession?.kind, activeFormSession?.rowId, activeFormSession?.values.cmps_programenrollment, programEnrollmentsForClient])

  useEffect(() => {
    if (!selectedHub || selectedHubPage !== 'search' || selectedDetailRecord || selectedHelplineDetail || selectedEventDetail) return
    if (selectedAppNav === 'home') return
    if (selectedAppNav === 'programs') return
    if (selectedAppNav === 'my-work') return

    const query = String(selectedSearchQuery || '').trim()
    if (query.length > 0 && query.length < 2) {
      setSearchStatusByHub((current) => ({
        ...current,
        [selectedHub.id]: 'Type at least 2 characters to search quickly.',
      }))
      setSearchResultsByHub((current) => ({ ...current, [selectedHub.id]: [] }))
      setHelplineSearchResultsByHub((current) => ({ ...current, [selectedHub.id]: [] }))
      setEventSearchResultsByHub((current) => ({ ...current, [selectedHub.id]: [] }))
      setSearchHasNextByHub((current) => ({ ...current, [selectedHub.id]: false }))
      return
    }

    const timer = window.setTimeout(() => {
      void runHubSearch()
    }, 350)

    return () => { window.clearTimeout(timer); hubSearchController.current?.abort(); ++hubSearchRequest.current }
  }, [selectedHub, selectedHubPage, selectedSearchQuery, selectedAdvancedClientFilters, selectedSearchForm, selectedSearchPage, selectedDetailRecord, selectedHelplineDetail, selectedEventDetail, selectedAppNav, user])

useEffect(() => {
    const clientRowId = selectedDetailRecord?.id || ''
    setProgramEnrollmentsClientId('')
    const clientRecordId = selectedDetailRecord?.recordId || ''
    if (!clientRowId && !clientRecordId) {
      setProgramEnrollmentsForClient([])
      setProgramEnrollmentsError('')
      setProgramEnrollmentsLoading(false)
      setSelectedProgramEnrollmentDetail(null)
      setProgramEnrollmentDetailError('')
      setProgramEnrollmentDetailLoading(false)
      return
    }

    let disposed = false
    const run = async () => {
      setProgramEnrollmentsLoading(true)
      setProgramEnrollmentsError('')
      setSelectedProgramEnrollmentDetail(null)
      setProgramEnrollmentDetailError('')
      try {
        let resolvedClientRowId = clientRowId
        if (!resolvedClientRowId && clientRecordId) {
          resolvedClientRowId = await resolveClientProfileRowIdByRecordId(clientRecordId)
        }

        if (!resolvedClientRowId) {
          if (!disposed) setProgramEnrollmentsForClient([])
          return
        }

        const rows = await listProgramEnrollmentsForClientRecord(resolvedClientRowId)
        if (!disposed) setProgramEnrollmentsForClient(rows)
      } catch (err) {
        if (!disposed) {
          setProgramEnrollmentsForClient([])
          setProgramEnrollmentsError(String((err as Error)?.message || err))
        }
      } finally {
        if (!disposed) { setProgramEnrollmentsClientId(clientRowId); setProgramEnrollmentsLoading(false) }
      }
    }

    void run()
    return () => {
      disposed = true
    }
  }, [selectedDetailRecord?.id, clientLookupRefreshSignal])

  useEffect(() => {
    const programEnrollmentRowId = String(selectedProgramEnrollmentDetail?.id || '').trim()
    if (!programEnrollmentRowId) {
      setServicesForProgramEnrollment([])
      setServicesError('')
      setServicesLoading(false)
      setBedEnrollmentsForProgramEnrollment([])
      setBedEnrollmentError('')
      setBedEnrollmentLoading(false)
      setSelectedServicesDetail(null)
      setServicesDetailError('')
      setServicesDetailLoading(false)
      setSelectedBedEnrollmentDetail(null)
      setBedEnrollmentDetailError('')
      setBedEnrollmentDetailLoading(false)
      return
    }

    let disposed = false
    const run = async () => {
      setServicesLoading(true)
      setServicesError('')
      setSelectedServicesDetail(null)
      setServicesDetailError('')
      try {
        const rows = await listServicesForProgramEnrollmentRecord(programEnrollmentRowId)
        if (!disposed) setServicesForProgramEnrollment(rows)
      } catch (err) {
        if (!disposed) {
          setServicesForProgramEnrollment([])
          setServicesError(String((err as Error)?.message || err))
        }
      } finally {
        if (!disposed) setServicesLoading(false)
      }
    }

    void run()
    return () => {
      disposed = true
    }
  }, [selectedProgramEnrollmentDetail?.id, clientLookupRefreshSignal])

  useEffect(() => {
    const programEnrollmentRowId = String(selectedProgramEnrollmentDetail?.id || '').trim()
    if (!programEnrollmentRowId) {
      setBedEnrollmentsForProgramEnrollment([])
      setBedEnrollmentError('')
      setBedEnrollmentLoading(false)
      return
    }

    let disposed = false
    const run = async () => {
      setBedEnrollmentLoading(true)
      setBedEnrollmentError('')
      setSelectedBedEnrollmentDetail(null)
      setBedEnrollmentDetailError('')
      try {
        const rows = await listBedEnrollmentsForProgramEnrollmentRecord(programEnrollmentRowId)
        if (!disposed) setBedEnrollmentsForProgramEnrollment(rows)
      } catch (err) {
        if (!disposed) {
          setBedEnrollmentsForProgramEnrollment([])
          setBedEnrollmentError(String((err as Error)?.message || err))
        }
      } finally {
        if (!disposed) setBedEnrollmentLoading(false)
      }
    }

    void run()
    return () => {
      disposed = true
    }
  }, [selectedProgramEnrollmentDetail?.id, clientLookupRefreshSignal])

  useEffect(() => {
    const hasClient = !!String(selectedDetailRecord?.id || selectedDetailRecord?.recordId || '').trim()
    if (!hasClient) {
      setServicesForClient([])
      setServicesForClientError('')
      setServicesForClientLoading(false)
      return
    }

    const enrollmentRows = programEnrollmentsForClient
      .filter((row) => String(row.id || '').trim())

    if (enrollmentRows.length === 0) {
      setServicesForClient([])
      setServicesForClientError('')
      setServicesForClientLoading(false)
      return
    }

    let disposed = false
    const run = async () => {
      setServicesForClientLoading(true)
      setServicesForClientError('')
      try {
        const grouped = await Promise.all(
          enrollmentRows.map(async (enrollment) => {
            const rows = await listServicesForProgramEnrollmentRecord(String(enrollment.id || '').trim())
            return rows.map((service) => ({
              ...service,
              programEnrollmentRowId: enrollment.id,
              programEnrollmentRecordId: enrollment.recordId,
              programEnrollmentProgram: enrollment.program,
            }))
          }),
        )

        const deduped = new Map<string, ClientServicesListRecord>()
        for (const row of grouped.flat()) {
          const key = String(row.id || row.recordId || '').trim()
          if (!key || deduped.has(key)) continue
          deduped.set(key, row)
        }

        if (!disposed) setServicesForClient(Array.from(deduped.values()))
      } catch (err) {
        if (!disposed) {
          setServicesForClient([])
          setServicesForClientError(String((err as Error)?.message || err))
        }
      } finally {
        if (!disposed) setServicesForClientLoading(false)
      }
    }

    void run()
    return () => {
      disposed = true
    }
  }, [selectedDetailRecord?.id, selectedDetailRecord?.recordId, programEnrollmentsForClient, clientLookupRefreshSignal])

  useEffect(() => {
    const hasClient = !!String(selectedDetailRecord?.id || selectedDetailRecord?.recordId || '').trim()
    if (!hasClient) {
      setBedEnrollmentsForClient([])
      setBedEnrollmentsForClientError('')
      setBedEnrollmentsForClientLoading(false)
      return
    }

    const enrollmentRows = programEnrollmentsForClient
      .filter((row) => String(row.id || '').trim())

    if (enrollmentRows.length === 0) {
      setBedEnrollmentsForClient([])
      setBedEnrollmentsForClientError('')
      setBedEnrollmentsForClientLoading(false)
      return
    }

    let disposed = false
    const run = async () => {
      setBedEnrollmentsForClientLoading(true)
      setBedEnrollmentsForClientError('')
      try {
        const grouped = await Promise.all(
          enrollmentRows.map(async (enrollment) => {
            const rows = await listBedEnrollmentsForProgramEnrollmentRecord(String(enrollment.id || '').trim())
            return rows.map((bedEnrollment) => ({
              ...bedEnrollment,
              programEnrollmentRowId: enrollment.id,
              programEnrollmentRecordId: enrollment.recordId,
              programEnrollmentProgram: enrollment.program,
            }))
          }),
        )

        const deduped = new Map<string, ClientBedEnrollmentListRecord>()
        for (const row of grouped.flat()) {
          const key = String(row.id || row.recordId || '').trim()
          if (!key || deduped.has(key)) continue
          deduped.set(key, row)
        }

        if (!disposed) setBedEnrollmentsForClient(Array.from(deduped.values()))
      } catch (err) {
        if (!disposed) {
          setBedEnrollmentsForClient([])
          setBedEnrollmentsForClientError(String((err as Error)?.message || err))
        }
      } finally {
        if (!disposed) setBedEnrollmentsForClientLoading(false)
      }
    }

    void run()
    return () => {
      disposed = true
    }
  }, [selectedDetailRecord?.id, selectedDetailRecord?.recordId, programEnrollmentsForClient, clientLookupRefreshSignal])

useEffect(() => {
    const hasClient = !!String(selectedDetailRecord?.id || selectedDetailRecord?.recordId || '').trim()
    const enrollmentIds = programEnrollmentsForClient
      .map((row) => String(row.id || '').trim())
      .filter(Boolean)

    const clientId = String(selectedDetailRecord?.id || '').trim()
    if (hasClient && (programEnrollmentsClientId !== clientId || programEnrollmentsLoading)) { setAdultAssessmentsForClient([]); setAdultAssessmentsForClientLoading(true); return }
    if (!hasClient) {
      setAdultAssessmentsForClient([])
      setAdultAssessmentsForClientError('')
      setAdultAssessmentsForClientLoading(false)
      return
    }

    let disposed = false
    const run = async () => {
      setAdultAssessmentsForClientLoading(true)
      setAdultAssessmentsForClientError('')
      try {
        if (programEnrollmentsError) throw new Error('Enrollment records could not be loaded; the Adult Assessment count is unavailable. ' + programEnrollmentsError)
        const rows = await listAdultAssessmentsForProgramEnrollments(enrollmentIds, clientId)
        if (!disposed) setAdultAssessmentsForClient(rows)
      } catch (err) {
        if (!disposed) {
          setAdultAssessmentsForClient([])
          setAdultAssessmentsForClientError(String((err as Error)?.message || err))
        }
      } finally {
        if (!disposed) setAdultAssessmentsForClientLoading(false)
      }
    }

    void run()
    return () => {
      disposed = true
    }
  }, [selectedDetailRecord?.id, selectedDetailRecord?.recordId, programEnrollmentsForClient, programEnrollmentsClientId, programEnrollmentsLoading, programEnrollmentsError, clientLookupRefreshSignal])

  useEffect(() => {
    const hasClient = !!String(selectedDetailRecord?.id || selectedDetailRecord?.recordId || '').trim()
    const enrollmentIds = programEnrollmentsForClient
      .map((row) => String(row.id || '').trim())
      .filter(Boolean)

    if (!hasClient || enrollmentIds.length === 0) {
      setChildSafetyPlansForClient([])
      setChildSafetyPlansForClientError('')
      setChildSafetyPlansForClientLoading(false)
      return
    }

    let disposed = false
    const run = async () => {
      setChildSafetyPlansForClientLoading(true)
      setChildSafetyPlansForClientError('')
      try {
        const rows = await listChildSafetyPlansForProgramEnrollments(enrollmentIds)
        if (!disposed) setChildSafetyPlansForClient(rows)
      } catch (err) {
        if (!disposed) {
          setChildSafetyPlansForClient([])
          setChildSafetyPlansForClientError(String((err as Error)?.message || err))
        }
      } finally {
        if (!disposed) setChildSafetyPlansForClientLoading(false)
      }
    }

    void run()
    return () => {
      disposed = true
    }
  }, [selectedDetailRecord?.id, selectedDetailRecord?.recordId, programEnrollmentsForClient, clientLookupRefreshSignal])

  useEffect(() => {
    const hasClient = !!String(selectedDetailRecord?.id || selectedDetailRecord?.recordId || '').trim()
    const enrollmentIds = programEnrollmentsForClient
      .map((row) => String(row.id || '').trim())
      .filter(Boolean)

    if (!hasClient || enrollmentIds.length === 0) {
      setFocusPlansForClient([])
      setFocusPlansForClientError('')
      setFocusPlansForClientLoading(false)
      return
    }

    let disposed = false
    const run = async () => {
      setFocusPlansForClientLoading(true)
      setFocusPlansForClientError('')
      try {
        const rows = await listFocusPlansForProgramEnrollments(enrollmentIds)
        if (!disposed) setFocusPlansForClient(rows)
      } catch (err) {
        if (!disposed) {
          setFocusPlansForClient([])
          setFocusPlansForClientError(String((err as Error)?.message || err))
        }
      } finally {
        if (!disposed) setFocusPlansForClientLoading(false)
      }
    }

    void run()
    return () => {
      disposed = true
    }
  }, [selectedDetailRecord?.id, selectedDetailRecord?.recordId, programEnrollmentsForClient, clientLookupRefreshSignal])

  useEffect(() => {
    const hasClient = !!String(selectedDetailRecord?.id || selectedDetailRecord?.recordId || '').trim()
    const enrollmentIds = programEnrollmentsForClient
      .map((row) => String(row.id || '').trim())
      .filter(Boolean)

    if (!hasClient || enrollmentIds.length === 0) {
      setInitialSafetyPlansForClient([])
      setInitialSafetyPlansForClientError('')
      setInitialSafetyPlansForClientLoading(false)
      return
    }

    let disposed = false
    const run = async () => {
      setInitialSafetyPlansForClientLoading(true)
      setInitialSafetyPlansForClientError('')
      try {
        const rows = await listInitialSafetyPlansForProgramEnrollments(enrollmentIds)
        if (!disposed) setInitialSafetyPlansForClient(rows)
      } catch (err) {
        if (!disposed) {
          setInitialSafetyPlansForClient([])
          setInitialSafetyPlansForClientError(String((err as Error)?.message || err))
        }
      } finally {
        if (!disposed) setInitialSafetyPlansForClientLoading(false)
      }
    }

    void run()
    return () => {
      disposed = true
    }
  }, [selectedDetailRecord?.id, selectedDetailRecord?.recordId, programEnrollmentsForClient, clientLookupRefreshSignal])

  useEffect(() => {
    const clientRowId = String(selectedDetailRecord?.id || '').trim()

    if (!clientRowId) {
      setHealthWellnessForClient([])
      setHealthWellnessForClientError('')
      setHealthWellnessForClientLoading(false)
      return
    }

    let disposed = false
    const run = async () => {
      setHealthWellnessForClientLoading(true)
      setHealthWellnessForClientError('')
      try {
        const rows = await listHealthWellnessForClient(clientRowId)
        if (!disposed) setHealthWellnessForClient(rows)
      } catch (err) {
        if (!disposed) {
          setHealthWellnessForClient([])
          setHealthWellnessForClientError(String((err as Error)?.message || err))
        }
      } finally {
        if (!disposed) setHealthWellnessForClientLoading(false)
      }
    }

    void run()
    return () => {
      disposed = true
    }
  }, [selectedDetailRecord?.id, clientLookupRefreshSignal])

  useEffect(() => {
    const clientRowId = String(selectedDetailRecord?.id || '').trim()
    if (!clientRowId) {
      setHouseholdsForClient([])
      setHouseholdsForClientError('')
      setHouseholdsForClientLoading(false)
      return
    }

    let disposed = false
    const run = async () => {
      setHouseholdsForClientLoading(true)
      setHouseholdsForClientError('')

      try {
        const histories = await listHouseholdHistoriesForClient(clientRowId)
        const activeHistories = histories.filter((row) => normalize(String(row.status || '')) === normalize('Active'))

        const householdIds = activeHistories
          .map((row) => String(row.householdRowId || '').trim())
          .filter(Boolean)

        if (householdIds.length === 0) {
          if (!disposed) setHouseholdsForClient([])
          return
        }

        const baseRows = await listHouseholdsByIds(householdIds)

        const statusByHousehold = new Map<string, string>()
        for (const history of activeHistories) {
          const householdId = String(history.householdRowId || '').trim()
          if (!householdId) continue
          const status = String(history.status || '').trim() || '-'
          if (!statusByHousehold.has(householdId) || normalize(status) === normalize('Active')) {
            statusByHousehold.set(householdId, status)
          }
        }

        if (!disposed) {
          setHouseholdsForClient(baseRows.map((row) => ({
            ...row,
            statusSummary: statusByHousehold.get(String(row.id || '').trim()) || '',
          })))
        }
      } catch (err) {
        if (!disposed) {
          setHouseholdsForClient([])
          setHouseholdsForClientError(String((err as Error)?.message || err))
        }
      } finally {
        if (!disposed) setHouseholdsForClientLoading(false)
      }
    }

    void run()
    return () => {
      disposed = true
    }
  }, [selectedDetailRecord?.id, clientLookupRefreshSignal])

  function resolveDynamicPicklistField(_formName: string, _label: string): {
    options: string[]
    inputOverride: 'select' | 'radio' | 'checkbox-group' | null
    active: boolean
  } | null {
    return null
  }

  function getSupplementalPicklistFields(_formName: string, _knownLabels: string[]): SupplementalPicklistField[] {
    return []
  }

  function openFunderAdminEditor(kind: FunderAdminKind, row?: { id: string; values: Record<string, string> }) {
    if (!canAccessRoleAdmin || funderAdminSaving || funderAdminLoading) return
    const defaults: Record<FunderAdminKind, Record<string, string>> = {
      funder: { cmps_activechoice: 'Yes' },
      contract: { cmps_contractstatus: 'Open for Disbursements' },
      transaction: { cmps_dateoftransaction: localDateValue(), cmps_transactiontype: 'Charge' },
    }
    setFunderAdminEditor({ kind, rowId: row?.id || '', values: { ...(row?.values || defaults[kind]) } })
    pendingFunderSaveConfirmation.current = null
    setFunderAdminEditorError('')
    setAdminStatus('')
  }

  async function saveFunderAdminEditor() {
    if (isUserPreview) { setAdminError(USER_PREVIEW_READ_ONLY_MESSAGE); return }
    const editor = funderAdminEditor
    if (!canAccessRoleAdmin || !editor || funderAdminSaveInFlight.current) return
    const validation = validateFunderAdminValues(editor.kind, editor.values)
    const formName = FUNDER_ADMIN_TABLES[editor.kind].label
    const outcome = (status: RecordSaveResult['status'], rowId: string, details = ''): RecordSaveResult => ({ status, rowId, formName, recordId: editor.values.cmps_recordid || rowId, isNew: !editor.rowId, details })
    if (validation) { setFunderAdminEditorError(validation); setRecordSaveResult(outcome('failed', editor.rowId, validation)); return }
    funderAdminSaveInFlight.current = true
    setFunderAdminSaving(true)
    setFunderAdminEditorError('')
    try {
      let rowId = editor.rowId
      const pending = pendingFunderSaveConfirmation.current
      if (!rowId && pending?.kind === editor.kind) {
        rowId = await confirmSavedRecordId(FUNDER_ADMIN_TABLES[editor.kind].tableAlias, pending.identity, editor.kind === 'funder' ? 'cmps_name' : 'cmps_recordid')
        pendingFunderSaveConfirmation.current = null
        setFunderAdminEditor((current) => current ? { ...current, rowId } : current)
      }
      const created = await saveFunderAdminRecord(editor.kind, rowId, withRecordAudit(editor.values, String(user.name || user.email || user.id || ''), !!rowId))
      rowId = created.id || rowId
      if (!rowId) {
        const identity = editor.values.cmps_recordid || (editor.kind === 'funder' ? editor.values.cmps_name : '')
        pendingFunderSaveConfirmation.current = { kind: editor.kind, identity }
        rowId = await confirmSavedRecordId(FUNDER_ADMIN_TABLES[editor.kind].tableAlias, identity, editor.kind === 'funder' ? 'cmps_name' : 'cmps_recordid')
      }
      pendingFunderSaveConfirmation.current = null
      setFunderAdminEditor((current) => current ? { ...current, rowId } : current)
      setRecordSaveResult(outcome('saved', rowId))
      setAdminStatus(`${editor.rowId ? 'Updated' : 'Added'} ${FUNDER_ADMIN_TABLES[editor.kind].label}.`)
      setFunderAdminExpanded((current) => ({ ...current, [editor.kind]: true }))
      setRefreshAdminSignal((current) => current + 1)
    } catch (error) {
      if (error instanceof FunderBalanceSyncError) {
        setFunderAdminEditor((current) => current ? { ...current, rowId: error.savedRecordId } : current)
        setRefreshAdminSignal((current) => current + 1)
      }
      setFunderAdminEditorError(String((error as Error)?.message || error || 'Unable to save the record.'))
      setRecordSaveResult(outcome(error instanceof SaveConfirmationPendingError ? 'unconfirmed' : error instanceof FunderBalanceSyncError ? 'partial' : 'failed', error instanceof FunderBalanceSyncError ? error.savedRecordId : editor.rowId, String((error as Error)?.message || error)))
    } finally {
      funderAdminSaveInFlight.current = false
      setFunderAdminSaving(false)
    }
  }

  function updateClientProfileValue(field: string, value: string) {
    setActiveFormSession((current) => {
      if (!current || current.kind !== 'client-profile') return current
      if (field === 'cmps_currentage') return current

      const nextValues: Record<string, string> = updateClientProfileDraftValue(
        current.values, field as ClientProfileFieldName, value,
      )

      if (field === 'cmps_dateofbirth') {
        nextValues.cmps_currentage = calculateAgeFromDateOfBirth(value)
      }

      return {
        ...current,
        values: nextValues,
      }
    })
  }

  function updateClientProfileMultiSelectValue(field: string, option: string, checked: boolean) {
    const session = activeFormSession
    if (!session || session.kind !== 'client-profile') return

    const current = parseMultiValue(session.values[field] || '')
    const normalizedOption = normalize(option)
    const next = checked
      ? Array.from(new Set([...current, option]))
      : current.filter((entry) => normalize(entry) !== normalizedOption)

    updateClientProfileValue(field, next.join(', '))
  }

  function renderSupplementalPicklistField(
    _formPrefix: string,
    _field: SupplementalPicklistField,
    _value: string,
    _onChange: (nextValue: string) => void,
    _onMultiSelectChange: (option: string, checked: boolean) => void,
  ) {
    return null
  }

  function onClickImportRoles() {
    rolesFileRef.current?.click()
  }

  function updateRoleEdit(index: number, field: keyof RoleEditRow, value: string) {
    setRoleEdits((current) => current.map((row, rowIndex) => rowIndex === index ? { ...row, [field]: value } : row))
  }

  async function onPickRoleWorkbook(event: ChangeEvent<HTMLInputElement>) {
    if (isUserPreview) { setAdminError(USER_PREVIEW_READ_ONLY_MESSAGE); return }
    const file = event.target.files?.[0]
    if (!file) return

    setImportingRoles(true)
    try {
      const summary = await importRolesWorkbook(file)
      setImportStatus(`Imported ${summary.imported} role row(s).`)
      setImportError('')
      setRefreshAdminSignal((value) => value + 1)
    } catch (err) {
      setImportError(String((err as Error)?.message || err))
    } finally {
      setImportingRoles(false)
      event.target.value = ''
    }
  }

  function onClickImportBeds() {
    bedsCsvFileRef.current?.click()
  }

  async function onPickBedsCsv(event: ChangeEvent<HTMLInputElement>) {
    if (isUserPreview) { setAdminError(USER_PREVIEW_READ_ONLY_MESSAGE); return }
    const file = event.target.files?.[0]
    if (!file) return

    setImportingBeds(true)
    setBedAdminStatus('')
    setBedAdminError('')
    try {
      const summary = await importBedsCsv(file, String(user.name || user.email || user.id || ''))
      if (summary.failed > 0) {
        setBedAdminStatus(summary.imported > 0
          ? `Imported ${summary.imported} of ${summary.total} bed record(s).`
          : `Read ${summary.total} CSV row(s), but no bed records were imported.`)
        const details = summary.errors.slice(0, 10).join(' | ')
        setBedAdminError(`${summary.failed} row(s) could not be imported. ${details}${summary.errors.length > 10 ? ' | Additional errors were omitted.' : ''}`)
      } else {
        setBedAdminStatus(`Imported ${summary.imported} of ${summary.total} bed record(s).`)
      }
      if (summary.imported > 0) setRefreshAdminSignal((value) => value + 1)
    } catch (error) {
      setBedAdminError(String((error as Error)?.message || error || 'Bed import failed.'))
    } finally {
      setImportingBeds(false)
      event.target.value = ''
    }
  }

  function updateRoleMember(index: number, memberIndex: number, field: keyof AdminMember, value: string) {
    setRoleEdits((current) =>
      current.map((row, rowIndex) => {
        if (rowIndex !== index) return row
        const members = row.members.map((member, currentMemberIndex) =>
          currentMemberIndex === memberIndex ? { ...member, [field]: value } : member,
        )
        return { ...row, members }
      }),
    )
  }

  function addRoleMember(index: number) {
    setRoleEdits((current) =>
      current.map((row, rowIndex) =>
        rowIndex === index
          ? { ...row, members: [...row.members, { id: '', email: '', name: '' }] }
          : row,
      ),
    )
  }

  function removeRoleMember(index: number, memberIndex: number) {
    setRoleEdits((current) =>
      current.map((row, rowIndex) =>
        rowIndex === index
          ? { ...row, members: row.members.filter((_, currentMemberIndex) => currentMemberIndex !== memberIndex) }
          : row,
      ),
    )
  }

  function updateRolePermission(index: number, permissionIndex: number, field: keyof AdminPermissionRow, value: string | boolean) {
    setRoleEdits((current) =>
      current.map((row, rowIndex) => {
        if (rowIndex !== index) return row
        const permissions = row.permissions.map((permission, currentPermissionIndex) =>
          currentPermissionIndex === permissionIndex ? { ...permission, [field]: value } : permission,
        )
        return { ...row, permissions }
      }),
    )
  }

  function addRolePermission(index: number) {
    setRoleEdits((current) =>
      current.map((row, rowIndex) =>
        rowIndex === index
          ? {
              ...row,
              permissions: [...row.permissions, { formName: '', view: false, search: false, create: false, edit: false, ignoreProgramAssignment: false }],
            }
          : row,
      ),
    )
  }

  function removeRolePermission(index: number, permissionIndex: number) {
    setRoleEdits((current) =>
      current.map((row, rowIndex) =>
        rowIndex === index
          ? { ...row, permissions: row.permissions.filter((_, currentPermissionIndex) => currentPermissionIndex !== permissionIndex) }
          : row,
      ),
    )
  }

  async function saveRoleEdit(index: number) {
    if (isUserPreview) { setAdminError(USER_PREVIEW_READ_ONLY_MESSAGE); return }
    const row = roleEdits[index]
    if (!row) return

    setSavingRoleIndex(index)
    setAdminError('')
    setAdminStatus('')

    try {
      const payload = {
        cr52b_rolename: row.roleName,
        cr52b_jsonusers: serializeAdminMembers(row.members),
        cr52b_jsondata: serializeAdminPermissions(row.permissions),
      }

      await saveRoleRow(row.originalRoleName, payload)

      setAdminStatus(`Saved ${row.roleName}`)
      setRoleEdits((current) =>
        current.map((currentRow, currentIndex) =>
          currentIndex === index ? { ...currentRow, originalRoleName: row.roleName } : currentRow,
        ),
      )
      setRefreshAdminSignal((value) => value + 1)
    } catch (err) {
      setAdminError(String((err as Error)?.message || err))
    } finally {
      setSavingRoleIndex(null)
    }
  }

  function updateFormPicklistEdit(index: number, field: keyof FormPicklistEditRow, value: string) {
    setFormPicklistEdits((current) => current.map((row, rowIndex) => (rowIndex === index ? { ...row, [field]: value } : row)))
  }

  function updateFormPicklistField(index: number, fieldIndex: number, field: keyof FormPicklistFieldEdit, value: string | boolean) {
    setFormPicklistEdits((current) =>
      current.map((row, rowIndex) => {
        if (rowIndex !== index) return row
        return {
          ...row,
          fields: row.fields.map((entry, currentFieldIndex) =>
            currentFieldIndex === fieldIndex ? { ...entry, [field]: value } : entry,
          ),
        }
      }),
    )
  }

  function updateFormPicklistOption(index: number, fieldIndex: number, optionIndex: number, field: keyof FormPicklistOptionEdit, value: string | boolean) {
    setFormPicklistEdits((current) =>
      current.map((row, rowIndex) => {
        if (rowIndex !== index) return row
        return {
          ...row,
          fields: row.fields.map((entry, currentFieldIndex) => {
            if (currentFieldIndex !== fieldIndex) return entry
            return {
              ...entry,
              options: entry.options.map((option, currentOptionIndex) =>
                currentOptionIndex === optionIndex ? { ...option, [field]: value } : option,
              ),
            }
          }),
        }
      }),
    )
  }

  function addFormPicklistOption(index: number, fieldIndex: number) {
    setFormPicklistEdits((current) =>
      current.map((row, rowIndex) => {
        if (rowIndex !== index) return row
        return {
          ...row,
          fields: row.fields.map((entry, currentFieldIndex) =>
            currentFieldIndex === fieldIndex
              ? { ...entry, options: [...entry.options, { value: '', active: true }] }
              : entry,
          ),
        }
      }),
    )
  }

  function removeFormPicklistOption(index: number, fieldIndex: number, optionIndex: number) {
    setFormPicklistEdits((current) =>
      current.map((row, rowIndex) => {
        if (rowIndex !== index) return row
        return {
          ...row,
          fields: row.fields.map((entry, currentFieldIndex) =>
            currentFieldIndex === fieldIndex
              ? { ...entry, options: entry.options.filter((_, currentOptionIndex) => currentOptionIndex !== optionIndex) }
              : entry,
          ),
        }
      }),
    )
  }

  function addFormPicklistField(index: number) {
    setFormPicklistEdits((current) =>
      current.map((row, rowIndex) =>
        rowIndex === index
          ? {
              ...row,
              fields: [...row.fields, { label: '', picklistType: 'drop down', active: true, options: [] }],
            }
          : row,
      ),
    )
  }

  function removeFormPicklistField(index: number, fieldIndex: number) {
    setFormPicklistEdits((current) =>
      current.map((row, rowIndex) => {
        if (rowIndex !== index) return row
        const nextFields = row.fields.filter((_, currentFieldIndex) => currentFieldIndex !== fieldIndex)
        return {
          ...row,
          fields: nextFields,
          optionBucket1Count: Math.min(row.optionBucket1Count, nextFields.length),
        }
      }),
    )
  }

  function addFormPicklistEdit() {
    setFormPicklistEdits((current) => [
      ...current,
      {
        id: '',
        originalFormName: '',
        formName: '',
        optionBucket1Count: 0,
        fields: [],
      },
    ])
  }

  async function saveFormPicklistEdit(index: number) {
    if (isUserPreview) { setAdminError(USER_PREVIEW_READ_ONLY_MESSAGE); return }
    const row = formPicklistEdits[index]
    if (!row) return

    const formName = asText(row.formName)
    if (!formName) {
      setAdminError('Form name is required for Form Pick Lists.')
      return
    }

    try {
      const payload = serializeFormPicklistEdit({ ...row, formName })

      setSavingPicklistIndex(index)
      setAdminError('')
      setAdminStatus('')

      try {
        await saveFormPicklistRow(row.originalFormName || formName, payload)

        setAdminStatus(`Saved form pick list for ${formName}`)
        setFormPicklistEdits((current) =>
          current.map((entry, entryIndex) =>
            entryIndex === index
              ? { ...entry, originalFormName: formName }
              : entry,
          ),
        )
        setRefreshAdminSignal((value) => value + 1)
      } catch (err) {
        setAdminError(String((err as Error)?.message || err))
      } finally {
        setSavingPicklistIndex(null)
      }
    } catch (err) {
      setAdminError(String((err as Error)?.message || err))
    }
  }

  async function searchClientsForHelpline() {
    const query = helplineClientSearch.trim()
    if (query.length < 2) {
      setHelplineClientSearchError('Enter at least 2 characters to search.')
      setHelplineClientResults([])
      setHelplineClientSearchCompleted(false)
      return
    }

    setHelplineClientSearchLoading(true)
    setHelplineClientSearchError('')
    setHelplineClientSearchCompleted(false)
    try {
      const result = await searchClientProfileRecordsPaged(query, 1, 20)
      setHelplineClientResults(result.rows)
      setHelplineClientSearchCompleted(true)
      if (result.rows.length === 0) setHelplineClientSearchError('No matching Client Profile records found.')
    } catch (err) {
      setHelplineClientResults([])
      setHelplineClientSearchCompleted(false)
      setHelplineClientSearchError(String((err as Error)?.message || err))
    } finally {
      setHelplineClientSearchLoading(false)
    }
  }

  async function startHelplineForClient(client: { id: string; recordId: string; name?: string }) {
    if (!requireFormCreateAccess('Helpline')) return
    if (selectedHubPage === 'search' && selectedHub && activeSearchDetailByHub[selectedHub.id]) {
      rememberFormReturnState()
    }
    const recordId = await generateAppRecordId(HELPLINES_TABLE_ALIAS, 'HL', 'SV Helpline')
    setClientSearchModalPurpose(null)
    setCreatingHelplineClientProfile(false)
    setActiveFormSession({
      kind: 'helpline',
      formName: 'Helpline',
      tableAlias: HELPLINES_TABLE_ALIAS,
      rowId: '',
      recordId,
      values: { cmps_recordid: recordId, cmps_cpid: client.id, cmps_program: '' },
    })
    if (selectedHub) setSelectedHubPages((current) => ({ ...current, [selectedHub.id]: 'forms' }))
    setHubActionStatus(`Started Helpline response for ${client.name || client.recordId || 'selected client'}.`)
    scrollToTopOfPage()
  }

  async function selectClientFromSearchModal(client: ClientProfileSearchRecord) {
    if (clientSearchModalPurpose === 'helpline') {
      await startHelplineForClient(client)
      return
    }

    setClientSearchModalPurpose(null)
    setCreatingHelplineClientProfile(false)
    if (selectedHub) {
      setSelectedSearchFormByHub((current) => ({ ...current, [selectedHub.id]: 'Client Profile' }))
    }
    const detail = await openClientProfileDetail(client.id, client.recordId)
    if (!detail || !selectedHub) return
    setSelectedAppNav('clients')
    setSelectedHubPages((current) => ({ ...current, [selectedHub.id]: 'search' }))
    scrollToTopOfPage()
  }

  function startNewClientAfterSearch() {
    if (!requireFormCreateAccess('Client Profile')) return
    if (!helplineClientSearchCompleted) return
    const shouldContinueToHelpline = clientSearchModalPurpose === 'helpline'
    setClientSearchModalPurpose(null)
    setCreatingHelplineClientProfile(shouldContinueToHelpline)
    void startFormResponse('Client Profile', true)
  }

  async function startShelterScreeningFromClientDetail() {
    if (!requireFormCreateAccess('Shelter Screening Form')) return
    if (!selectedHub || !selectedDetailRecord?.id) {
      setHubActionStatus('Open a Client Profile first, then start Shelter Screening from the Intake section.')
      return
    }

    const recordId = await generateAppRecordId(SHELTER_SCREENINGS_TABLE_ALIAS, 'SS')
    rememberFormReturnState()
    setActiveFormError('')
    setActiveFormSession({
      kind: 'shelter-screening',
      formName: 'Shelter Screening Form',
      tableAlias: SHELTER_SCREENINGS_TABLE_ALIAS,
      rowId: '',
      recordId,
      values: {
        cmps_recordid: recordId,
        cmps_screendate: localDateValue(),
        cmps_cpid: selectedDetailRecord.id,
      },
    })
    setSelectedHubPages((current) => ({
      ...current,
      [selectedHub.id]: 'forms',
    }))
    setHubActionStatus(`Started Shelter Screening response for ${selectedDetailRecord.recordId || 'the open client'}.`)
    scrollToTopOfPage()
  }

  async function editShelterScreeningRecord(row: ShelterScreeningListRecord) {
    if (!selectedHub || !canEditClientLinkedForm('shelter-screening')) return
    const cleanId = String(row.id || '').trim()
    const cleanRecordId = String(row.recordId || '').trim()
    if (!cleanId && !cleanRecordId) {
      setShelterScreeningsForClientError('Unable to open this Shelter Screening because required record information is missing.')
      return
    }

    setShelterScreeningsForClientLoading(true)
    setShelterScreeningsForClientError('')
    try {
      const detail = await loadShelterScreeningDetailRecord(cleanId, cleanRecordId)
      rememberFormReturnState()
      setActiveFormError('')
      setActiveFormSession({
        kind: 'shelter-screening',
        formName: 'Shelter Screening Form',
        tableAlias: SHELTER_SCREENINGS_TABLE_ALIAS,
        rowId: detail.id,
        recordId: detail.recordId,
        values: { ...detail.values },
      })
      setSelectedHubPages((current) => ({ ...current, [selectedHub.id]: 'forms' }))
      setHubActionStatus(`Opened Shelter Screening ${detail.recordId || cleanRecordId} for editing.`)
      scrollToTopOfPage()
    } catch (err) {
      setShelterScreeningsForClientError(String((err as Error)?.message || err))
    } finally {
      setShelterScreeningsForClientLoading(false)
    }
  }

  async function startChildSafetyPlanFromClientDetail() {
    if (!requireFormCreateAccess('Child Safety Plan')) return
    if (!selectedHub || !selectedDetailRecord?.id) {
      setHubActionStatus('Open a Client Profile first, then start Child Safety Plan from Service Delivery.')
      return
    }

    const recordId = await generateAppRecordId(CHILD_SAFETY_PLANS_TABLE_ALIAS, 'CSP')
    rememberFormReturnState()
    setActiveFormError('')
    setActiveFormSession({
      kind: 'child-safety-plan',
      formName: 'Child Safety Plan',
      tableAlias: CHILD_SAFETY_PLANS_TABLE_ALIAS,
      rowId: '',
      recordId,
      values: { cmps_recordid: recordId, cmps_peid: '' },
    })
    setSelectedHubPages((current) => ({ ...current, [selectedHub.id]: 'forms' }))
    setHubActionStatus('Started Child Safety Plan. Choose an active Program Enrollment for this client.')
    scrollToTopOfPage()
  }

  async function openChildSafetyPlanDetailFromClient(row: ChildSafetyPlanListRecord) {
    const cleanId = String(row.id || '').trim()
    const cleanRecordId = String(row.recordId || '').trim()
    if (!cleanId && !cleanRecordId) {
      setChildSafetyPlanDetailError('Unable to open this Child Safety Plan because required record information is missing.')
      return
    }

    setChildSafetyPlanDetailLoading(true)
    setChildSafetyPlanDetailError('')
    try {
      const detail = await loadChildSafetyPlanDetailRecord(cleanId, cleanRecordId)
      setSelectedChildSafetyPlanDetail(detail)
      openRecordFormView('child-safety-plan', detail)
      scrollToTopOfPage()
    } catch (err) {
      setSelectedChildSafetyPlanDetail(null)
      setChildSafetyPlanDetailError(String((err as Error)?.message || err))
    } finally {
      setChildSafetyPlanDetailLoading(false)
    }
  }

  async function editChildSafetyPlanRecord(rowId: string, recordIdHint: string, preferredEnrollmentRowId = '') {
    if (!canAccessClientFormAction('Child Safety Plan', 'edit')) return
    const cleanId = String(rowId || '').trim()
    const cleanRecordId = String(recordIdHint || '').trim()
    if (!cleanId && !cleanRecordId) {
      setChildSafetyPlanDetailError('Unable to open this Child Safety Plan because required record information is missing.')
      return
    }

    setChildSafetyPlanDetailLoading(true)
    rememberFormReturnState()
    setChildSafetyPlanDetailError('')
    try {
      const detail = await loadChildSafetyPlanDetailRecord(cleanId, cleanRecordId)
      const enrollmentRowId = String(preferredEnrollmentRowId || selectedChildSafetyPlanDetail?.values.cmps_peid || '').trim()
      const values: ChildSafetyPlanPayload = {
        ...detail.values,
        ...(enrollmentRowId ? { cmps_peid: enrollmentRowId } : {}),
      }
      setActiveFormError('')
      setActiveFormSession({
        kind: 'child-safety-plan',
        formName: 'Child Safety Plan',
        tableAlias: CHILD_SAFETY_PLANS_TABLE_ALIAS,
        rowId: detail.id,
        recordId: detail.recordId,
        values,
      })
      if (selectedHub) setSelectedHubPages((current) => ({ ...current, [selectedHub.id]: 'forms' }))
      setSelectedChildSafetyPlanDetail(null)
      setChildSafetyPlanDetailError('')
      scrollToTopOfPage()
    } catch (err) {
      setChildSafetyPlanDetailError(String((err as Error)?.message || err))
    } finally {
      setChildSafetyPlanDetailLoading(false)
    }
  }

  async function openElectronicDocumentDetailFromClient(row: ElectronicDocumentListRecord) {
    const cleanId = String(row.id || '').trim()
    const cleanRecordId = String(row.recordId || '').trim()
    if (!cleanId && !cleanRecordId) {
      setElectronicDocumentDetailError('Unable to open this Electronic Document because required record information is missing.')
      return
    }
    setElectronicDocumentDetailLoading(true)
    setElectronicDocumentDetailError('')
    try {
      const detail = await loadElectronicDocumentDetailRecord(cleanId, cleanRecordId)
      setSelectedElectronicDocumentDetail(detail)
      openRecordFormView('electronic-document', detail)
      scrollToTopOfPage()
    } catch (err) {
      setSelectedElectronicDocumentDetail(null)
      setElectronicDocumentDetailError(String((err as Error)?.message || err))
    } finally {
      setElectronicDocumentDetailLoading(false)
    }
  }

  async function editElectronicDocumentRecord(rowId: string, recordIdHint: string) {
    if (!canAccessClientFormAction('Electronic Document', 'edit')) return
    const cleanId = String(rowId || '').trim()
    const cleanRecordId = String(recordIdHint || '').trim()
    if (!cleanId && !cleanRecordId) {
      setElectronicDocumentDetailError('Unable to edit this Electronic Document because required record information is missing.')
      return
    }
    setElectronicDocumentDetailLoading(true)
    rememberFormReturnState()
    setElectronicDocumentDetailError('')
    try {
      const detail = await loadElectronicDocumentDetailRecord(cleanId, cleanRecordId)
      setActiveFormError('')
      setActiveFormSession({
        kind: 'electronic-document',
        formName: 'Electronic Document',
        tableAlias: ELECTRONIC_DOCUMENTS_TABLE_ALIAS,
        rowId: detail.id,
        recordId: detail.recordId,
        values: { ...detail.values },
      })
      if (selectedHub) setSelectedHubPages((current) => ({ ...current, [selectedHub.id]: 'forms' }))
      setSelectedElectronicDocumentDetail(null)
      setElectronicDocumentDetailError('')
      scrollToTopOfPage()
    } catch (err) {
      setElectronicDocumentDetailError(String((err as Error)?.message || err))
    } finally {
      setElectronicDocumentDetailLoading(false)
    }
  }

  async function startAdultAssessmentFromClientDetail() {
    if (!requireFormCreateAccess('Adult Assessment')) return
    if (!selectedHub || !selectedDetailRecord?.id) {
      setHubActionStatus('Open a Client Profile first, then start Adult Assessment from Service Delivery.')
      return
    }

    const recordId = await generateAppRecordId(ADULT_ASSESSMENTS_TABLE_ALIAS, 'AA')
    rememberFormReturnState()
    setActiveFormError('')
    setActiveFormSession({
      kind: 'adult-assessment', formName: 'Adult Assessment', tableAlias: ADULT_ASSESSMENTS_TABLE_ALIAS,
      rowId: '', recordId, values: { cmps_recordid: recordId, cmps_cpid: selectedDetailRecord.id, cmps_peid: '', cmps_assessmentdate: localDateValue() },
    })
    setSelectedHubPages((current) => ({ ...current, [selectedHub.id]: 'forms' }))
    setHubActionStatus('Started Adult Assessment. Choose an active Program Enrollment for this client.')
    scrollToTopOfPage()
  }

  async function openAdultAssessmentDetailFromClient(row: AdultAssessmentListRecord) {
    const cleanId = String(row.id || '').trim()
    const cleanRecordId = String(row.recordId || '').trim()
    if (!cleanId && !cleanRecordId) {
      setAdultAssessmentDetailError('Unable to open this Adult Assessment because required record information is missing.')
      return
    }

    setAdultAssessmentDetailLoading(true)
    setAdultAssessmentDetailError('')
    try {
      const detail = await loadAdultAssessmentDetailRecord(cleanId, cleanRecordId)
      setSelectedAdultAssessmentDetail(detail)
      openRecordFormView('adult-assessment', detail)
      scrollToTopOfPage()
    } catch (err) {
      setSelectedAdultAssessmentDetail(null)
      setAdultAssessmentDetailError(String((err as Error)?.message || err))
    } finally {
      setAdultAssessmentDetailLoading(false)
    }
  }

  async function editAdultAssessmentRecord(rowId: string, recordIdHint: string, preferredEnrollmentRowId = '') {
    if (!canAccessClientFormAction('Adult Assessment', 'edit')) return
    const cleanId = String(rowId || '').trim()
    const cleanRecordId = String(recordIdHint || '').trim()
    if (!cleanId && !cleanRecordId) {
      setAdultAssessmentDetailError('Unable to open this Adult Assessment because required record information is missing.')
      return
    }

    setAdultAssessmentDetailLoading(true)
    rememberFormReturnState()
    setAdultAssessmentDetailError('')
    try {
      const detail = await loadAdultAssessmentDetailRecord(cleanId, cleanRecordId)
      const enrollmentRowId = String(preferredEnrollmentRowId || selectedAdultAssessmentDetail?.values.cmps_peid || '').trim()
      const values: AdultAssessmentPayload = {
        ...detail.values,
        ...(enrollmentRowId ? { cmps_peid: enrollmentRowId } : {}),
      }
      setActiveFormError('')
      setActiveFormSession({
        kind: 'adult-assessment',
        formName: 'Adult Assessment',
        tableAlias: ADULT_ASSESSMENTS_TABLE_ALIAS,
        rowId: detail.id,
        recordId: detail.recordId,
        values,
      })
      if (selectedHub) setSelectedHubPages((current) => ({ ...current, [selectedHub.id]: 'forms' }))
      setSelectedAdultAssessmentDetail(null)
      setAdultAssessmentDetailError('')
      scrollToTopOfPage()
    } catch (err) {
      setAdultAssessmentDetailError(String((err as Error)?.message || err))
    } finally {
      setAdultAssessmentDetailLoading(false)
    }
  }

  async function startHealthWellnessFromClientDetail() {
    if (!requireFormCreateAccess('Health & Wellness Questionnaire')) return
    if (!selectedHub || !selectedDetailRecord?.id) {
      setHubActionStatus('Open a Client Profile first, then start Health and Wellness Questionnaire from Service Delivery.')
      return
    }
    const recordId = await generateAppRecordId(HEALTH_WELLNESS_TABLE_ALIAS, 'HWQ')
    rememberFormReturnState()
    setActiveFormError('')
    setActiveFormSession({
      kind: 'health-wellness', formName: 'Health & Wellness Questionnaire', tableAlias: HEALTH_WELLNESS_TABLE_ALIAS,
      rowId: '', recordId, values: { cmps_recordid: recordId, cmps_cpid: selectedDetailRecord.id, cmps_questionnairecompletiondate: localDateValue() },
    })
    setSelectedHubPages((current) => ({ ...current, [selectedHub.id]: 'forms' }))
    setHubActionStatus('Started Health and Wellness Questionnaire for the open client.')
    scrollToTopOfPage()
  }

  async function openHealthWellnessDetailFromClient(row: HealthWellnessListRecord) {
    const cleanId = String(row.id || '').trim()
    const cleanRecordId = String(row.recordId || '').trim()
    if (!cleanId && !cleanRecordId) {
      setHealthWellnessDetailError('Unable to open this questionnaire because required record information is missing.')
      return
    }

    setHealthWellnessDetailLoading(true)
    setHealthWellnessDetailError('')
    try {
      const detail = await loadHealthWellnessDetailRecord(cleanId, cleanRecordId)
      setSelectedHealthWellnessDetail(detail)
      openRecordFormView('health-wellness', detail)
      scrollToTopOfPage()
    } catch (err) {
      setSelectedHealthWellnessDetail(null)
      setHealthWellnessDetailError(String((err as Error)?.message || err))
    } finally {
      setHealthWellnessDetailLoading(false)
    }
  }

  async function editHealthWellnessRecord(rowId: string, recordIdHint: string) {
    if (!canAccessClientFormAction('Health & Wellness Questionnaire', 'edit')) return
    const cleanId = String(rowId || '').trim()
    const cleanRecordId = String(recordIdHint || '').trim()
    if (!cleanId && !cleanRecordId) {
      setHealthWellnessDetailError('Unable to open this questionnaire because required record information is missing.')
      return
    }

    setHealthWellnessDetailLoading(true)
    rememberFormReturnState()
    setHealthWellnessDetailError('')
    try {
      const detail = await loadHealthWellnessDetailRecord(cleanId, cleanRecordId)
      const clientRowId = String(selectedDetailRecord?.id || detail.values.cmps_cpid || '').trim()
      const values: HealthWellnessPayload = {
        ...detail.values,
        ...(clientRowId ? { cmps_cpid: clientRowId } : {}),
      }
      setActiveFormError('')
      setActiveFormSession({
        kind: 'health-wellness',
        formName: 'Health & Wellness Questionnaire',
        tableAlias: HEALTH_WELLNESS_TABLE_ALIAS,
        rowId: detail.id,
        recordId: detail.recordId,
        values,
      })
      if (selectedHub) setSelectedHubPages((current) => ({ ...current, [selectedHub.id]: 'forms' }))
      setSelectedHealthWellnessDetail(null)
      setHealthWellnessDetailError('')
      scrollToTopOfPage()
    } catch (err) {
      setHealthWellnessDetailError(String((err as Error)?.message || err))
    } finally {
      setHealthWellnessDetailLoading(false)
    }
  }

  async function startFocusPlanFromClientDetail() {
    if (!requireFormCreateAccess('FOCUS Plan')) return
    if (!selectedHub || !selectedDetailRecord?.id) {
      setHubActionStatus('Open a Client Profile first, then start FOCUS Plan from Service Delivery.')
      return
    }
    if (activeProgramEnrollmentOptionsForServices.length === 0) {
      setHubActionStatus('An active Program Enrollment is required before starting a FOCUS Plan.')
      return
    }
    const recordId = await generateAppRecordId(FOCUS_PLANS_TABLE_ALIAS, 'FP')
    rememberFormReturnState()
    setActiveFormError('')
    setActiveFormSession({ kind: 'focus-plan', formName: 'FOCUS Plan', tableAlias: FOCUS_PLANS_TABLE_ALIAS, rowId: '', recordId, values: { cmps_recordid: recordId, cmps_peid: '', cmps_numberofidentifiedneeds: '1' } })
    setSelectedHubPages((current) => ({ ...current, [selectedHub.id]: 'forms' }))
    setHubActionStatus('Started FOCUS Plan. Choose an active Program Enrollment for this client.')
    scrollToTopOfPage()
  }

  async function openFocusPlanDetailFromClient(row: FocusPlanListRecord) {
    const cleanId = String(row.id || '').trim()
    const cleanRecordId = String(row.recordId || '').trim()
    if (!cleanId && !cleanRecordId) {
      setFocusPlanDetailError('Unable to open this FOCUS Plan because required record information is missing.')
      return
    }

    setFocusPlanDetailLoading(true)
    setFocusPlanDetailError('')
    try {
      const detail = await loadFocusPlanDetailRecord(cleanId, cleanRecordId)
      setSelectedFocusPlanDetail(detail)
      openRecordFormView('focus-plan', detail)
      scrollToTopOfPage()
    } catch (err) {
      setSelectedFocusPlanDetail(null)
      setFocusPlanDetailError(String((err as Error)?.message || err))
    } finally {
      setFocusPlanDetailLoading(false)
    }
  }

  async function editFocusPlanRecord(rowId: string, recordIdHint: string, preferredEnrollmentRowId = '') {
    if (!canAccessClientFormAction('FOCUS Plan', 'edit')) return
    const cleanId = String(rowId || '').trim()
    const cleanRecordId = String(recordIdHint || '').trim()
    if (!cleanId && !cleanRecordId) {
      setFocusPlanDetailError('Unable to open this FOCUS Plan because required record information is missing.')
      return
    }

    setFocusPlanDetailLoading(true)
    rememberFormReturnState()
    setFocusPlanDetailError('')
    try {
      const detail = await loadFocusPlanDetailRecord(cleanId, cleanRecordId)
      const enrollmentRowId = String(preferredEnrollmentRowId || selectedFocusPlanDetail?.values.cmps_peid || '').trim()
      const values: FocusPlanPayload = {
        ...detail.values,
        ...(enrollmentRowId ? { cmps_peid: enrollmentRowId } : {}),
      }
      setActiveFormError('')
      setActiveFormSession({
        kind: 'focus-plan',
        formName: 'FOCUS Plan',
        tableAlias: FOCUS_PLANS_TABLE_ALIAS,
        rowId: detail.id,
        recordId: detail.recordId,
        values,
      })
      if (selectedHub) setSelectedHubPages((current) => ({ ...current, [selectedHub.id]: 'forms' }))
      setSelectedFocusPlanDetail(null)
      setFocusPlanDetailError('')
      scrollToTopOfPage()
    } catch (err) {
      setFocusPlanDetailError(String((err as Error)?.message || err))
    } finally {
      setFocusPlanDetailLoading(false)
    }
  }

  function getInitialSafetyPlanPhone(enrollmentId: string): string {
    const program = programEnrollmentsForClient.find((row) => row.id === enrollmentId)?.program || ''
    if (normalize(program) === normalize('Autumn House')) return '480-835-5555'
    if (normalize(program) === normalize('Faith House')) return '623-939-6798'
    if (normalize(program) === normalize('CAAFA Shelter')) return '480-773-2359'
    return ''
  }

  async function startInitialSafetyPlanFromClientDetail() {
    if (!requireFormCreateAccess('Initial Safety Plan')) return
    if (!selectedHub || !selectedDetailRecord?.id) return
    if (activeProgramEnrollmentOptionsForServices.length === 0) { setHubActionStatus('An active Program Enrollment is required before starting an Initial Safety Plan.'); return }
    const recordId = await generateAppRecordId(INITIAL_SAFETY_PLANS_TABLE_ALIAS, 'ISP')
    rememberFormReturnState()
    setActiveFormSession({ kind: 'initial-safety-plan', formName: 'Initial Safety Plan', tableAlias: INITIAL_SAFETY_PLANS_TABLE_ALIAS, rowId: '', recordId, values: { cmps_recordid: recordId, cmps_peid: '', cmps_initialsafetyplancompletiondate: localDateValue() } })
    setSelectedHubPages((current) => ({ ...current, [selectedHub.id]: 'forms' }))
    scrollToTopOfPage()
  }

  async function openInitialSafetyPlanDetailFromClient(row: InitialSafetyPlanListRecord) {
    const cleanId = String(row.id || '').trim()
    const cleanRecordId = String(row.recordId || '').trim()
    if (!cleanId && !cleanRecordId) {
      setInitialSafetyPlanDetailError('Unable to open this Initial Safety Plan because required record information is missing.')
      return
    }

    setInitialSafetyPlanDetailLoading(true)
    setInitialSafetyPlanDetailError('')
    try {
      const detail = await loadInitialSafetyPlanDetailRecord(cleanId, cleanRecordId)
      setSelectedInitialSafetyPlanDetail(detail)
      openRecordFormView('initial-safety-plan', detail)
      scrollToTopOfPage()
    } catch (err) {
      setSelectedInitialSafetyPlanDetail(null)
      setInitialSafetyPlanDetailError(String((err as Error)?.message || err))
    } finally {
      setInitialSafetyPlanDetailLoading(false)
    }
  }

  async function editInitialSafetyPlanRecord(rowId: string, recordIdHint: string, preferredEnrollmentRowId = '') {
    if (!canAccessClientFormAction('Initial Safety Plan', 'edit')) return
    const cleanId = String(rowId || '').trim()
    const cleanRecordId = String(recordIdHint || '').trim()
    if (!cleanId && !cleanRecordId) {
      setInitialSafetyPlanDetailError('Unable to open this Initial Safety Plan because required record information is missing.')
      return
    }

    setInitialSafetyPlanDetailLoading(true)
    rememberFormReturnState()
    setInitialSafetyPlanDetailError('')
    try {
      const detail = await loadInitialSafetyPlanDetailRecord(cleanId, cleanRecordId)
      const enrollmentRowId = String(preferredEnrollmentRowId || selectedInitialSafetyPlanDetail?.values.cmps_peid || '').trim()
      const values: InitialSafetyPlanPayload = {
        ...detail.values,
        ...(enrollmentRowId ? { cmps_peid: enrollmentRowId } : {}),
      }
      setActiveFormError('')
      setActiveFormSession({
        kind: 'initial-safety-plan',
        formName: 'Initial Safety Plan',
        tableAlias: INITIAL_SAFETY_PLANS_TABLE_ALIAS,
        rowId: detail.id,
        recordId: detail.recordId,
        values,
      })
      if (selectedHub) setSelectedHubPages((current) => ({ ...current, [selectedHub.id]: 'forms' }))
      setSelectedInitialSafetyPlanDetail(null)
      setInitialSafetyPlanDetailError('')
      scrollToTopOfPage()
    } catch (err) {
      setInitialSafetyPlanDetailError(String((err as Error)?.message || err))
    } finally {
      setInitialSafetyPlanDetailLoading(false)
    }
  }

  async function startFormResponse(formName: string, bypassClientSearch = false) {
    if (!requireFormCreateAccess(formName)) return
    setHubActionStatus('')
    setActiveFormError('')

    const normalizedName = normalize(formName)
    const isClientProfile = normalizedName.includes('client profile')
    const isProgramEnrollment = normalizedName.includes('program enrollment')
    const isServices = normalizedName === 'services' || normalizedName.includes('services')
    const isBedEnrollment = normalizedName === 'bed enrollment' || normalizedName.includes('bed enrollment')
    const isHelpline = normalizedName === 'helpline' || normalizedName.includes('helpline')
    const isShelterScreening = normalizedName === 'shelter screening' || normalizedName.includes('shelter screening')
          const isVoca = normalizedName === 'voca' || normalizedName.includes('voca')
    const isGoal = normalizedName === 'goal' || normalizedName === 'goals' || normalizedName.includes('goal')
    const isReleaseOfInformation = normalizedName.includes('release of information')
    const isEmploymentAndBenefits = normalizedName.replace(/&/g, 'and').includes('employment and benefits')
    const isFinancialAssistance = normalizedName.includes('financial assistance')
    const isMedicalConsent = normalizedName.includes('medical consent')
    const isPersonYouAreFleeingProfile = normalizedName.includes('person you are fleeing profile')
    const isElectronicDocument = normalizedName.includes('electronic document')
    const isTermsAndConditionsOfServiceAnimals = normalizedName.replace(/&/g, 'and').includes('terms and conditions of service animals')
    const isContract = normalizedName === 'contract'
    const isPetCompanionIntake = normalizedName.includes('pet companion intake')
    const isFunderTransaction = normalizedName.includes('funder transaction')
    const isShelterProgramGuidelines = normalizedName.includes('shelter program guidelines')
    const isChildAssessment = normalizedName.includes('child assessment')
    const isChildShelterIntake = normalizedName.includes('child shelter intake')
    const isChildSafetyPlan = normalizedName.includes('child safety plan')
    const isEvent = normalizedName === 'event' || normalizedName.includes('event')
    const isHousehold = normalizedName === 'household' || normalizedName.includes('household')
    const isAcknowledgementAndConsent = normalizedName.includes('acknowledgement') && normalizedName.includes('consent')
    const isAnimalAgreement = normalizedName.includes('animal agreement')

    if (isClientProfile && !bypassClientSearch) {
      setHelplineClientSearch('')
      setHelplineClientResults([])
      setHelplineClientSearchError('')
      setHelplineClientSearchCompleted(false)
      setCreatingHelplineClientProfile(false)
      setClientSearchModalPurpose('client-profile')
      return
    }

    rememberFormReturnState()

    if (!isClientProfile) {
      if (isHelpline) {
        setHelplineClientSearch('')
        setHelplineClientResults([])
        setHelplineClientSearchError('')
        setHelplineClientSearchCompleted(false)
        setClientSearchModalPurpose('helpline')
        return
      }

      if (isProgramEnrollment) {
        try {
          const recordId = await generateAppRecordId(PROGRAM_ENROLLMENT_TABLE_ALIAS, 'PE')
          setActiveFormSession({
            kind: 'program-enrollment',
            formName: 'Program Enrollment',
            tableAlias: PROGRAM_ENROLLMENT_TABLE_ALIAS,
            rowId: '',
            recordId,
            values: {
              cmps_recordid: recordId,
              cmps_enrollmentstatus: 'Enrolled',
            },
          })
          setHubActionStatus('Started Program Enrollment.')
        } catch (err) {
          setHubActionStatus(`Unable to start Program Enrollment: ${String((err as Error)?.message || err)}`)
        }
        return
      }

      if (isShelterScreening) {
        if (!selectedDetailRecord) {
          setHubActionStatus('Open a Client Profile first, then start Shelter Screening from the Intake section.')
          return
        }

        try {
          const recordId = await generateAppRecordId(SHELTER_SCREENINGS_TABLE_ALIAS, 'SS')
          const todayIso = localDateValue()
          setActiveFormSession({
            kind: 'shelter-screening',
            formName: 'Shelter Screening Form',
            tableAlias: SHELTER_SCREENINGS_TABLE_ALIAS,
            rowId: '',
            recordId,
            values: {
              cmps_recordid: recordId,
              cmps_screendate: todayIso,
              cmps_cpid: selectedDetailRecord.id,
            },
          })
          setHubActionStatus('Started Shelter Screening.')
        } catch (err) {
          setHubActionStatus(`Failed to start Shelter Screening response: ${String((err as Error)?.message || err)}`)
        }
        return
      }

      if (isVoca) {
        if (!selectedDetailRecord) {
          setHubActionStatus('Open a Client Profile first, then start VOCA from the client detail page.')
          return
        }
        if (activeVocaProgramEnrollmentOptions.length === 0) {
          setHubActionStatus('An active Program Enrollment is required before starting a VOCA Form.')
          return
        }

        try {
          const recordId = await generateAppRecordId(VOCA_FORMS_TABLE_ALIAS, 'VOCA')
          setActiveFormSession({
            kind: 'voca-form',
            formName: 'VOCA Form',
            tableAlias: VOCA_FORMS_TABLE_ALIAS,
            rowId: '',
            recordId,
            values: {
              cmps_recordid: recordId,
              cmps_peid: '',
            },
          })
          setHubActionStatus('Started VOCA Form. Choose an active Program Enrollment for this client.')
        } catch (err) {
          setHubActionStatus(`Failed to start VOCA Form: ${String((err as Error)?.message || err)}`)
        }
        return
      }

      if (isGoal) {
        if (!selectedDetailRecord) {
          setHubActionStatus('Open a Client Profile first, then start Goals from the client detail page.')
          return
        }
        try {
          const recordId = await generateAppRecordId(GOALS_TABLE_ALIAS, 'GOAL')
          setActiveFormSession({ kind: 'goal', formName: 'Goals', tableAlias: GOALS_TABLE_ALIAS, rowId: '', recordId, values: { cmps_recordid: recordId, cmps_peid: '' } })
          if (selectedHub) setSelectedHubPages((current) => ({ ...current, [selectedHub.id]: 'forms' }))
          setHubActionStatus('Started Goals form. Choose an active Program Enrollment for this client.')
          scrollToTopOfPage()
        } catch (err) {
          setHubActionStatus(`Failed to start Goals form: ${String((err as Error)?.message || err)}`)
        }
        return
      }
      if (isReleaseOfInformation) {
        if (!selectedDetailRecord?.id) {
          setHubActionStatus('Open a Client Profile first, then start Release of Information from the client forms.')
          return
        }
        try {
          const recordId = await generateAppRecordId(RELEASE_OF_INFORMATION_TABLE_ALIAS, 'ROI')
          setActiveFormSession({
            kind: 'release-of-information',
            formName: 'Release of Information',
            tableAlias: RELEASE_OF_INFORMATION_TABLE_ALIAS,
            rowId: '',
            recordId,
            values: { cmps_recordid: recordId, cmps_cpid: selectedDetailRecord.id },
          })
          if (selectedHub) setSelectedHubPages((current) => ({ ...current, [selectedHub.id]: 'forms' }))
          scrollToTopOfPage()
          setHubActionStatus('Started Release of Information form.')
        } catch (err) {
          setHubActionStatus(`Unable to start Release of Information: ${String((err as Error)?.message || err)}`)
        }
        return
      }

      if (isEmploymentAndBenefits) {
        if (!selectedDetailRecord?.id) {
          setHubActionStatus('Open a Client Profile first, then start Employment & Benefits from the client forms.')
          return
        }
        const recordId = await generateAppRecordId(EMPLOYMENT_AND_BENEFITS_TABLE_ALIAS, 'EB')
          .catch(() => generateEmploymentAndBenefitsRecordId())
        setActiveFormSession({
          kind: 'employment-and-benefits',
          formName: 'Employment & Benefits',
          tableAlias: EMPLOYMENT_AND_BENEFITS_TABLE_ALIAS,
          rowId: '',
          recordId,
          values: {
            cmps_recordid: recordId,
            cmps_cpid: selectedDetailRecord.id,
            cmps_date: localDateValue(),
          },
        })
        if (selectedHub) setSelectedHubPages((current) => ({ ...current, [selectedHub.id]: 'forms' }))
        scrollToTopOfPage()
        setHubActionStatus('Started Employment & Benefits.')
        return
      }

      if (isFinancialAssistance) {
        if (!selectedDetailRecord?.id) {
          setHubActionStatus('Open a Client Profile first, then start Financial Assistance from the client forms.')
          return
        }
        if (activeProgramEnrollmentOptionsForServices.length === 0) {
          setHubActionStatus('An active Program Enrollment is required before starting Financial Assistance.')
          return
        }
        const recordId = await generateAppRecordId(FINANCIAL_ASSISTANCES_TABLE_ALIAS, 'FA')
          .catch(() => generateFinancialAssistanceRecordId())
        setActiveFormSession({
          kind: 'financial-assistance',
          formName: 'Financial Assistance',
          tableAlias: FINANCIAL_ASSISTANCES_TABLE_ALIAS,
          rowId: '',
          recordId,
          values: {
            cmps_recordid: recordId,
            cmps_peid: '',
            cmps_date: localDateValue(),
          },
        })
        if (selectedHub) setSelectedHubPages((current) => ({ ...current, [selectedHub.id]: 'forms' }))
        scrollToTopOfPage()
        setHubActionStatus('Started Financial Assistance. Select an active Program Enrollment to populate assigned staff.')
        return
      }

      if (isMedicalConsent) {
        if (!selectedDetailRecord?.id) {
          setHubActionStatus('Open a Client Profile first, then start Medical Consent Form from the client forms.')
          return
        }
        if (activeProgramEnrollmentOptionsForServices.length === 0) {
          setHubActionStatus('An active Program Enrollment is required before starting Medical Consent Form.')
          return
        }
        const recordId = await generateAppRecordId(MEDICAL_CONSENT_FORMS_TABLE_ALIAS, 'MCF')
          .catch(() => generateMedicalConsentFormRecordId())
        setActiveFormSession({
          kind: 'medical-consent-form',
          formName: 'Medical Consent Form',
          tableAlias: MEDICAL_CONSENT_FORMS_TABLE_ALIAS,
          rowId: '',
          recordId,
          values: {
            cmps_recordid: recordId,
            cmps_peid: '',
            cmps_completiondate: localDateValue(),
          },
        })
        if (selectedHub) setSelectedHubPages((current) => ({ ...current, [selectedHub.id]: 'forms' }))
        scrollToTopOfPage()
        setHubActionStatus('Started Medical Consent Form. Choose an active Program Enrollment for this client.')
        return
      }

      if (isPersonYouAreFleeingProfile) {
        if (!selectedDetailRecord?.id) {
          setHubActionStatus('Open a Client Profile first, then start Person You Are Fleeing Profile from the client forms.')
          return
        }
        const recordId = await generateAppRecordId(PERSON_YOU_ARE_FLEEING_PROFILES_TABLE_ALIAS, 'PYFP')
          .catch(() => generatePersonYouAreFleeingProfileRecordId())
        setActiveFormSession({
          kind: 'person-you-are-fleeing-profile',
          formName: 'Person You Are Fleeing Profile',
          tableAlias: PERSON_YOU_ARE_FLEEING_PROFILES_TABLE_ALIAS,
          rowId: '',
          recordId,
          values: {
            cmps_recordid: recordId,
            cmps_cpid: selectedDetailRecord.id,
            cmps_profilecompletiondate: localDateValue(),
          },
        })
        if (selectedHub) setSelectedHubPages((current) => ({ ...current, [selectedHub.id]: 'forms' }))
        scrollToTopOfPage()
        setHubActionStatus('Started Person You Are Fleeing Profile.')
        return
      }

      if (isElectronicDocument) {
        if (!selectedDetailRecord?.id) {
          setHubActionStatus('Open a Client Profile first, then start Electronic Document from the client forms.')
          return
        }
        const recordId = await generateAppRecordId(ELECTRONIC_DOCUMENTS_TABLE_ALIAS, 'EDOC')
          .catch(() => generateElectronicDocumentRecordId())
        setActiveFormSession({
          kind: 'electronic-document',
          formName: 'Electronic Document',
          tableAlias: ELECTRONIC_DOCUMENTS_TABLE_ALIAS,
          rowId: '',
          recordId,
          values: {
            cmps_recordid: recordId,
            cmps_cpid: selectedDetailRecord.id,
            cmps_dateofdocument: localDateValue(),
          },
        })
        if (selectedHub) setSelectedHubPages((current) => ({ ...current, [selectedHub.id]: 'forms' }))
        scrollToTopOfPage()
        setHubActionStatus('Started Electronic Document.')
        return
      }

      if (isTermsAndConditionsOfServiceAnimals) {
        if (!selectedDetailRecord?.id) {
          setHubActionStatus('Open a Client Profile first, then start Terms & Conditions of Service Animals from the client forms.')
          return
        }
        const recordId = await generateAppRecordId(TERMS_AND_CONDITIONS_OF_SERVICE_ANIMALS_TABLE_ALIAS, 'TCSA')
          .catch(() => generateTermsAndConditionsOfServiceAnimalsRecordId())
        setActiveFormSession({
          kind: 'terms-and-conditions-of-service-animals',
          formName: 'Terms & Conditions of Service Animals',
          tableAlias: TERMS_AND_CONDITIONS_OF_SERVICE_ANIMALS_TABLE_ALIAS,
          rowId: '',
          recordId,
          values: {
            cmps_recordid: recordId,
            cmps_cpid: selectedDetailRecord.id,
            cmps_completiondate: localDateValue(),
          },
        })
        if (selectedHub) setSelectedHubPages((current) => ({ ...current, [selectedHub.id]: 'forms' }))
        scrollToTopOfPage()
        setHubActionStatus('Started Terms & Conditions of Service Animals.')
        return
      }

      if (isContract) {
        setActiveFormSession({
          kind: 'contract',
          formName: 'Contract',
          tableAlias: CONTRACTS_TABLE_ALIAS,
          rowId: '',
          recordId: '',
          values: {},
        })
        if (selectedHub) setSelectedHubPages((current) => ({ ...current, [selectedHub.id]: 'forms' }))
        scrollToTopOfPage()
        setHubActionStatus('Started Contract.')
        return
      }

      if (isPetCompanionIntake) {
        if (!selectedDetailRecord?.id) {
          setHubActionStatus('Open a Client Profile first, then start Pet Companion Intake from the client forms.')
          return
        }
        const recordId = await generateAppRecordId(PET_COMPANION_INTAKES_TABLE_ALIAS, 'PCI')
          .catch(() => generatePetCompanionIntakeRecordId())
        setActiveFormSession({
          kind: 'pet-companion-intake',
          formName: 'Pet Companion Intake',
          tableAlias: PET_COMPANION_INTAKES_TABLE_ALIAS,
          rowId: '',
          recordId,
          values: {
            cmps_recordid: recordId,
            cmps_cpid: selectedDetailRecord.id,
            cmps_intakecompletiondate: localDateValue(),
          },
        })
        if (selectedHub) setSelectedHubPages((current) => ({ ...current, [selectedHub.id]: 'forms' }))
        scrollToTopOfPage()
        setHubActionStatus('Started Pet Companion Intake.')
        return
      }

      if (isFunderTransaction) {
        if (activeFunderContractOptions.length === 0) {
          setHubActionStatus('An open Funder Contract without an end date is required before starting a Funder Transaction.')
          return
        }
        setActiveFormSession({
          kind: 'funder-transaction',
          formName: 'Funder Transactions',
          tableAlias: FUNDER_TRANSACTIONS_TABLE_ALIAS,
          rowId: '',
          recordId: '',
          values: { cmps_dateoftransaction: localDateValue() },
        })
        if (selectedHub) setSelectedHubPages((current) => ({ ...current, [selectedHub.id]: 'forms' }))
        scrollToTopOfPage()
        setHubActionStatus('Started Funder Transaction.')
        return
      }

      if (isShelterProgramGuidelines) {
        if (!selectedDetailRecord?.id) {
          setHubActionStatus('Open a Client Profile first, then start Shelter Program Guidelines from the client forms.')
          return
        }
        if (activeProgramEnrollmentOptionsForServices.length === 0) {
          setHubActionStatus('An active Program Enrollment is required before starting Shelter Program Guidelines.')
          return
        }
        const recordId = await generateAppRecordId(SHELTER_PROGRAM_GUIDELINES_TABLE_ALIAS, 'SPG')
          .catch(() => generateShelterProgramGuidelinesRecordId())
        setActiveFormSession({
          kind: 'shelter-program-guidelines',
          formName: 'Shelter Program Guidelines',
          tableAlias: SHELTER_PROGRAM_GUIDELINES_TABLE_ALIAS,
          rowId: '',
          recordId,
          values: {
            cmps_recordid: recordId,
            cmps_peid: '',
            cmps_guidlinecompletiondate: localDateValue(),
          },
        })
        if (selectedHub) setSelectedHubPages((current) => ({ ...current, [selectedHub.id]: 'forms' }))
        scrollToTopOfPage()
        setHubActionStatus('Started Shelter Program Guidelines. Choose an active Program Enrollment for this client.')
        return
      }

      if (isAcknowledgementAndConsent) {
        if (!selectedDetailRecord?.id) {
          setHubActionStatus('Open a Client Profile first, then start Acknowledgement and Consent from the client forms.')
          return
        }
        try {
          const recordId = await generateAppRecordId(ACKNOWLEDGEMENT_AND_CONSENT_TABLE_ALIAS, 'ACC')
          setActiveFormSession({
            kind: 'acknowledgement-and-consent',
            formName: 'Acknowledgement and Consent Form',
            tableAlias: ACKNOWLEDGEMENT_AND_CONSENT_TABLE_ALIAS,
            rowId: '',
            recordId,
            values: { cmps_recordid: recordId, cmps_cpid: selectedDetailRecord.id },
          })
          if (selectedHub) setSelectedHubPages((current) => ({ ...current, [selectedHub.id]: 'forms' }))
          scrollToTopOfPage()
          setHubActionStatus('Started Acknowledgement and Consent Form. Choose an active Program Enrollment for this client.')
        } catch (err) {
          setHubActionStatus(`Unable to start Acknowledgement and Consent: ${String((err as Error)?.message || err)}`)
        }
        return
      }

      if (isAnimalAgreement) {
        if (!selectedDetailRecord?.id) {
          setHubActionStatus('Open a Client Profile first, then start Animal Agreement from the client forms.')
          return
        }
        const recordId = await generateAppRecordId(ANIMAL_AGREEMENT_TABLE_ALIAS, 'AA')
          .catch(() => generateAnimalAgreementRecordId())
        setActiveFormSession({
          kind: 'animal-agreement',
          formName: 'Animal Agreement',
          tableAlias: ANIMAL_AGREEMENT_TABLE_ALIAS,
          rowId: '',
          recordId,
          values: {
            cmps_recordid: recordId,
            cmps_cpid: selectedDetailRecord.id,
            cmps_animalagreementcompletiondate: localDateValue(),
          },
        })
        if (selectedHub) setSelectedHubPages((current) => ({ ...current, [selectedHub.id]: 'forms' }))
        scrollToTopOfPage()
        setHubActionStatus('Started Animal Agreement.')
        return
      }

      if (isChildAssessment) {
        if (!selectedDetailRecord?.id) {
          setHubActionStatus('Open a Client Profile first, then start Child Assessment from the client forms.')
          return
        }
        if (activeProgramEnrollmentOptionsForServices.length === 0) {
          setHubActionStatus('An active Program Enrollment is required before starting Child Assessment.')
          return
        }
        const recordId = await generateAppRecordId(CHILD_ASSESSMENTS_TABLE_ALIAS, 'CA')
          .catch(() => generateChildAssessmentRecordId())
        setActiveFormSession({
          kind: 'child-assessment',
          formName: 'Child Assessment',
          tableAlias: CHILD_ASSESSMENTS_TABLE_ALIAS,
          rowId: '',
          recordId,
          values: {
            cmps_recordid: recordId,
            cmps_peid: '',
            cmps_assessmentdate: localDateValue(),
          },
        })
        if (selectedHub) setSelectedHubPages((current) => ({ ...current, [selectedHub.id]: 'forms' }))
        scrollToTopOfPage()
        setHubActionStatus('Started Child Assessment. Choose an active Program Enrollment for this client.')
        return
      }

      if (isChildShelterIntake) {
        if (!selectedDetailRecord?.id) {
          setHubActionStatus('Open a Client Profile first, then start Child Shelter Intake from the client forms.')
          return
        }
        if (activeProgramEnrollmentOptionsForServices.length === 0) {
          setHubActionStatus('An active Program Enrollment is required before starting Child Shelter Intake.')
          return
        }
        const recordId = await generateAppRecordId(CHILD_SHELTER_INTAKES_TABLE_ALIAS, 'CSI')
          .catch(() => generateChildShelterIntakeRecordId())
        setActiveFormSession({
          kind: 'child-shelter-intake',
          formName: 'Child Shelter Intake',
          tableAlias: CHILD_SHELTER_INTAKES_TABLE_ALIAS,
          rowId: '',
          recordId,
          values: {
            cmps_recordid: recordId,
            cmps_peid: '',
            cmps_intakedate: localDateValue(),
          },
        })
        if (selectedHub) setSelectedHubPages((current) => ({ ...current, [selectedHub.id]: 'forms' }))
        scrollToTopOfPage()
        setHubActionStatus('Started Child Shelter Intake. Choose an active Program Enrollment for this client.')
        return
      }

      if (isChildSafetyPlan) {
        if (!selectedDetailRecord?.id) {
          setHubActionStatus('Open a Client Profile first, then start Child Safety Plan from Service Delivery.')
          return
        }
        const recordId = await generateAppRecordId(CHILD_SAFETY_PLANS_TABLE_ALIAS, 'CSP')
        setActiveFormSession({ kind: 'child-safety-plan', formName: 'Child Safety Plan', tableAlias: CHILD_SAFETY_PLANS_TABLE_ALIAS, rowId: '', recordId, values: { cmps_recordid: recordId, cmps_peid: '' } })
        setHubActionStatus('Started Child Safety Plan. Choose an active Program Enrollment for this client.')
        return
      }

      if (isEvent) {
        const recordId = await generateAppRecordId(EVENTS_TABLE_ALIAS, 'EVENT')
        setEventUploadFiles([null, null])
        setActiveFormSession({
          kind: 'event',
          formName: 'Event',
          tableAlias: EVENTS_TABLE_ALIAS,
          rowId: '',
          recordId,
          values: { cmps_recordid: recordId },
        })
        setHubActionStatus('Started Event.')
        return
      }

      if (isServices) {
        setHubActionStatus('Open a Client Profile, then use the Services row to start a Services form.')
        return
      }

      if (isBedEnrollment) {
        setHubActionStatus('Open a Client Profile, then use the Bed Enrollment row to start a Bed Enrollment form.')
        return
      }

      if (isHousehold) {
        try {
          setHouseholdMembersLoading(true)
          setHouseholdMembersError('')

          const recordId = await generateAppRecordId(HOUSEHOLDS_TABLE_ALIAS, 'HH')
          const candidates = await listHouseholdHistoriesByHouseholdOrActivePool('')
          const drafts = mapHouseholdMemberDrafts(candidates, '', '')

          setHouseholdMembersDraft(drafts)
          setHouseholdOriginalMemberRowIds([])

          setActiveFormSession({
            kind: 'household',
            formName: 'Household',
            tableAlias: HOUSEHOLDS_TABLE_ALIAS,
            rowId: '',
            recordId,
            values: {
              cmps_recordid: recordId,
              cmps_headofhouseholdname: '',
              cmps_effectivestartdate: localDateValue(),
              cmps_effectiveenddate: '',
              cmps_numberofhhmembers: '0',
            },
          })
          setHubActionStatus('Started Household form. Select household members from the dropdown.')
        } catch (err) {
          setHubActionStatus(`Failed to start Household response: ${String((err as Error)?.message || err)}`)
        } finally {
          setHouseholdMembersLoading(false)
        }
        return
      }

      setHubActionStatus(`${formName} is not available yet.`)
      return
    }

    try {
      const recordId = await generateAppRecordId(CLIENT_PROFILE_TABLE_ALIAS, 'CP')
      const todayIso = localDateValue()
      const initialValues: Record<string, string> = {
        cmps_recordid: recordId,
        cmps_todaysdate: todayIso,
        cmps_currentage: '',
        cmps_isclientmultiracial: 'No',
        cmps_assignedprograms: selectedHub?.title || '',
      }

      setActiveFormSession({
        kind: 'client-profile',
        formName: 'Client Profile',
        tableAlias: CLIENT_PROFILE_TABLE_ALIAS,
        rowId: '',
        recordId,
        values: initialValues,
      })

      setHubActionStatus(`Started Client Profile ${recordId}.`)
    } catch (err) {
      setHubActionStatus(`Failed to start Client Profile response: ${String((err as Error)?.message || err)}`)
    }
  }

  async function runHubSearch() {
    if (!selectedHub || selectedAppNav === 'home') return
    if (selectedAppNav === 'programs') return
    if (selectedAppNav === 'my-work') return
    hubSearchController.current?.abort()
    const abort = new AbortController()
    hubSearchController.current = abort
    const request = ++hubSearchRequest.current

    const formName = selectedSearchForm
    const query = searchQueryByHub[selectedHub.id] || ''
    const page = searchPageByHub[selectedHub.id] || 1

    setSearchErrorByHub((current) => ({ ...current, [selectedHub.id]: '' }))
    setDetailErrorByHub((current) => ({ ...current, [selectedHub.id]: '' }))
    setActiveSearchDetailByHub((current) => ({ ...current, [selectedHub.id]: null }))
    setActiveHelplineDetailByHub((current) => ({ ...current, [selectedHub.id]: null }))
    setActiveEventDetailByHub((current) => ({ ...current, [selectedHub.id]: null }))

    setSearchStatusByHub((current) => ({ ...current, [selectedHub.id]: `Searching ${formName} records...` }))

    try {
      if (selectedSearchForm === 'Helpline') {
        const rows = await searchHelplineRecords(query, SEARCH_PAGE_SIZE)
        if (abort.signal.aborted || request !== hubSearchRequest.current) return
        setHelplineSearchResultsByHub((current) => ({ ...current, [selectedHub.id]: rows }))
        setSearchHasNextByHub((current) => ({ ...current, [selectedHub.id]: false }))
        setSearchStatusByHub((current) => ({
          ...current,
          [selectedHub.id]: rows.length > 0
            ? `Found ${rows.length} Helpline record(s).`
            : 'No matching Helpline records found.',
        }))
      } else if (selectedSearchForm === 'Event') {
        const rows = await searchEventRecords(query, SEARCH_PAGE_SIZE)
        if (abort.signal.aborted || request !== hubSearchRequest.current) return
        setEventSearchResultsByHub((current) => ({ ...current, [selectedHub.id]: rows }))
        setSearchHasNextByHub((current) => ({ ...current, [selectedHub.id]: false }))
        setSearchStatusByHub((current) => ({
          ...current,
          [selectedHub.id]: rows.length > 0
            ? `Found ${rows.length} Event record(s).`
            : 'No matching Event records found.',
        }))
      } else {
        const result = selectedAdvancedClientFilters.length
          ? await clientAdvancedSearch.current.search(query, page, SEARCH_PAGE_SIZE, selectedAdvancedClientFilters, abort.signal)
          : await searchClientProfileRecordsPaged(query, page, SEARCH_PAGE_SIZE)
        if (abort.signal.aborted || request !== hubSearchRequest.current) return
        const rows = result.rows
        setSearchResultsByHub((current) => ({ ...current, [selectedHub.id]: rows }))
        setSearchHasNextByHub((current) => ({ ...current, [selectedHub.id]: result.hasNext }))
        setSearchStatusByHub((current) => ({
          ...current,
          [selectedHub.id]: rows.length > 0
            ? `Showing page ${page} with ${rows.length} Client Profile record(s).`
            : 'No matching Client Profile records found.',
        }))
      }
    } catch (err) {
      if (abort.signal.aborted || request !== hubSearchRequest.current) return
      if (selectedSearchForm === 'Helpline') {
        setHelplineSearchResultsByHub((current) => ({ ...current, [selectedHub.id]: [] }))
      } else if (selectedSearchForm === 'Event') {
        setEventSearchResultsByHub((current) => ({ ...current, [selectedHub.id]: [] }))
      } else {
        setSearchResultsByHub((current) => ({ ...current, [selectedHub.id]: [] }))
        setSearchHasNextByHub((current) => ({ ...current, [selectedHub.id]: false }))
      }
      setSearchErrorByHub((current) => ({ ...current, [selectedHub.id]: String((err as Error)?.message || err) }))
      setSearchStatusByHub((current) => ({ ...current, [selectedHub.id]: '' }))
    }
  }

  async function openClientProfileDetail(rowId: string, recordIdHint: string): Promise<ClientProfileDetailRecord | null> {
    if (!selectedHub) return null

    let cleanId = String(rowId || '').trim().replace(/[{}]/g, '')
    const cleanRecordId = String(recordIdHint || '').trim()
    if (!cleanId && !cleanRecordId) {
      setDetailErrorByHub((current) => ({ ...current, [selectedHub.id]: 'Unable to open this record because required information is missing.' }))
      return null
    }

    setDetailLoadingByHub((current) => ({ ...current, [selectedHub.id]: true }))
    setDetailErrorByHub((current) => ({ ...current, [selectedHub.id]: '' }))

    try {
      if (!cleanId && cleanRecordId) {
        cleanId = await resolveClientProfileRowIdByRecordId(cleanRecordId)
      }
      const detail = await loadClientProfileDetailRecord(cleanId, cleanRecordId)

      const normalizedSelectedId = String(cleanId || '').trim().toLowerCase()
      const normalizedLoadedId = String(detail.id || '').trim().toLowerCase()
      const normalizedSelectedRecordId = String(cleanRecordId || '').trim().toLowerCase()
      const normalizedLoadedRecordId = String(detail.recordId || '').trim().toLowerCase()
      const idMismatch = normalizedSelectedId && normalizedLoadedId && normalizedSelectedId !== normalizedLoadedId
      const recordIdMismatch = normalizedSelectedRecordId && normalizedLoadedRecordId && normalizedSelectedRecordId !== normalizedLoadedRecordId
      if (idMismatch || recordIdMismatch) {
        throw new Error('Selected client could not be opened reliably. The loaded record did not match the selected row.')
      }

      setActiveSearchDetailByHub((current) => ({ ...current, [selectedHub.id]: detail }))
      setActiveHelplineDetailByHub((current) => ({ ...current, [selectedHub.id]: null }))
      setShowFullDetailByHub((current) => ({ ...current, [selectedHub.id]: false }))
      setSelectedClientSectionByHub((current) => ({ ...current, [selectedHub.id]: 'overview' }))
      setSelectedProgramEnrollmentDetail(null)
      setProgramEnrollmentDetailError('')
      return detail
    } catch (err) {
      setDetailErrorByHub((current) => ({ ...current, [selectedHub.id]: String((err as Error)?.message || err) }))
      return null
    } finally {
      setDetailLoadingByHub((current) => ({ ...current, [selectedHub.id]: false }))
    }
  }

  async function openHelplineDetail(rowId: string, recordIdHint: string, preserveClientProfile = false) {
    if (!selectedHub) return

    const cleanId = String(rowId || '').trim()
    const cleanRecordId = String(recordIdHint || '').trim()
    if (!cleanId && !cleanRecordId) {
      setDetailErrorByHub((current) => ({ ...current, [selectedHub.id]: 'Unable to open this record because required information is missing.' }))
      return
    }

    setDetailLoadingByHub((current) => ({ ...current, [selectedHub.id]: true }))
    setDetailErrorByHub((current) => ({ ...current, [selectedHub.id]: '' }))

    try {
      const detail = await loadHelplineDetailRecord(cleanId, cleanRecordId)
      setActiveHelplineDetailByHub((current) => ({ ...current, [selectedHub.id]: detail }))
      if (!preserveClientProfile) setActiveSearchDetailByHub((current) => ({ ...current, [selectedHub.id]: null }))
      openRecordFormView('helpline', detail, preserveClientProfile ? selectedDetailRecord?.id || '' : '')
      scrollToTopOfPage()
    } catch (err) {
      setDetailErrorByHub((current) => ({ ...current, [selectedHub.id]: String((err as Error)?.message || err) }))
    } finally {
      setDetailLoadingByHub((current) => ({ ...current, [selectedHub.id]: false }))
    }
  }

  async function openHelplineDetailFromClient(row: HelplineClientListRecord) {
    await openHelplineDetail(row.id, row.recordId, true)
  }

  function closeClientProfileDetail() {
    if (!selectedHub) return
    setActiveSearchDetailByHub((current) => ({ ...current, [selectedHub.id]: null }))
    setActiveHelplineDetailByHub((current) => ({ ...current, [selectedHub.id]: null }))
    setActiveEventDetailByHub((current) => ({ ...current, [selectedHub.id]: null }))
    setDetailErrorByHub((current) => ({ ...current, [selectedHub.id]: '' }))
    setShowFullDetailByHub((current) => ({ ...current, [selectedHub.id]: false }))
    setSelectedProgramEnrollmentDetail(null)
    setProgramEnrollmentDetailError('')
  }

  function closeHelplineDetail() {
    if (!selectedHub) return
    setActiveHelplineDetailByHub((current) => ({ ...current, [selectedHub.id]: null }))
    setDetailErrorByHub((current) => ({ ...current, [selectedHub.id]: '' }))
  }

  function editHelplineFromDetail() {
    if (!canAccessClientFormAction('Helpline', 'edit')) return
    if (!selectedHub || !selectedHelplineDetail) return

    rememberFormReturnState()
    setActiveFormError('')
    setActiveFormSession({
      kind: 'helpline',
      formName: 'Helpline',
      tableAlias: HELPLINES_TABLE_ALIAS,
      rowId: selectedHelplineDetail.id,
      recordId: selectedHelplineDetail.recordId,
      values: { ...selectedHelplineDetail.values },
    })
    setSelectedHubPages((current) => ({
      ...current,
      [selectedHub.id]: 'forms',
    }))
  }

  async function editHelplineRecordFromClient(row: HelplineClientListRecord) {
    if (!canAccessClientFormAction('Helpline', 'edit')) return
    await openHelplineDetailFromClient(row)
    const detail = await loadHelplineDetailRecord(row.id, row.recordId)
    if (!selectedHub) return
    rememberFormReturnState()
    setActiveFormError('')
    setActiveFormSession({ kind: 'helpline', formName: 'Helpline', tableAlias: HELPLINES_TABLE_ALIAS, rowId: detail.id, recordId: detail.recordId, values: { ...detail.values } })
    setSelectedHubPages((current) => ({ ...current, [selectedHub.id]: 'forms' }))
    scrollToTopOfPage()
  }

  async function openEventDetail(rowId: string, recordIdHint: string) {
    if (!selectedHub) return

    const cleanId = String(rowId || '').trim()
    const cleanRecordId = String(recordIdHint || '').trim()
    if (!cleanId && !cleanRecordId) {
      setDetailErrorByHub((current) => ({ ...current, [selectedHub.id]: 'Unable to open this record because required information is missing.' }))
      return
    }

    setDetailLoadingByHub((current) => ({ ...current, [selectedHub.id]: true }))
    setDetailErrorByHub((current) => ({ ...current, [selectedHub.id]: '' }))

    try {
      const detail = await loadEventDetailRecord(cleanId, cleanRecordId)
      setActiveEventDetailByHub((current) => ({ ...current, [selectedHub.id]: detail }))
      setActiveSearchDetailByHub((current) => ({ ...current, [selectedHub.id]: null }))
      setActiveHelplineDetailByHub((current) => ({ ...current, [selectedHub.id]: null }))
      openRecordFormView('event', detail, '')
      scrollToTopOfPage()
    } catch (err) {
      setDetailErrorByHub((current) => ({ ...current, [selectedHub.id]: String((err as Error)?.message || err) }))
    } finally {
      setDetailLoadingByHub((current) => ({ ...current, [selectedHub.id]: false }))
    }
  }

  function closeEventDetail() {
    if (!selectedHub) return
    setActiveEventDetailByHub((current) => ({ ...current, [selectedHub.id]: null }))
    setDetailErrorByHub((current) => ({ ...current, [selectedHub.id]: '' }))
  }

  async function openCompassFileViewer(rowId: string) {
    const requestId = compassFileViewerRequestRef.current + 1
    compassFileViewerRequestRef.current = requestId
    setCompassFileViewer({ loading: true, error: '', file: null, objectUrl: '', openObjectUrl: '' })
    try {
      const file = await loadCompassFileRecord(rowId)
      const objectUrl = URL.createObjectURL(file.blob)
      const openObjectUrl = canOpenAttachmentInBrowser(file.filename, file.mimetype) ? objectUrl : ''
      if (compassFileViewerRequestRef.current !== requestId) {
        URL.revokeObjectURL(objectUrl)
        return
      }
      setCompassFileViewer({ loading: false, error: '', file, objectUrl, openObjectUrl })
    } catch (error) {
      if (compassFileViewerRequestRef.current !== requestId) return
      setCompassFileViewer({ loading: false, error: String((error as Error)?.message || error), file: null, objectUrl: '', openObjectUrl: '' })
    }
  }

  function closeCompassFileViewer() {
    compassFileViewerRequestRef.current += 1
    setCompassFileViewer({ loading: false, error: '', file: null, objectUrl: '', openObjectUrl: '' })
  }

  useEffect(() => {
    const objectUrl = compassFileViewer.objectUrl
    const openObjectUrl = compassFileViewer.openObjectUrl
    return () => {
      if (objectUrl) URL.revokeObjectURL(objectUrl)
      if (openObjectUrl && openObjectUrl !== objectUrl) URL.revokeObjectURL(openObjectUrl)
    }
  }, [compassFileViewer.objectUrl, compassFileViewer.openObjectUrl])

  function editEventFromDetail() {
    if (!canAccessClientFormAction('Event', 'edit')) return
    if (!selectedHub || !selectedEventDetail) return

    rememberFormReturnState()
    setActiveFormError('')
    setEventUploadFiles([null, null])
    setActiveFormSession({
      kind: 'event',
      formName: 'Event',
      tableAlias: EVENTS_TABLE_ALIAS,
      rowId: selectedEventDetail.id,
      recordId: selectedEventDetail.recordId,
      values: { ...selectedEventDetail.values },
    })
    setSelectedHubPages((current) => ({
      ...current,
      [selectedHub.id]: 'forms',
    }))
  }

  function openFullClientProfileDetail() {
    if (!selectedHub) return

    setShowFullDetailByHub((current) => ({ ...current, [selectedHub.id]: true }))
    if (selectedDetailRecord) openRecordFormView('client-profile', selectedDetailRecord)
  }

  function closeFullClientProfileDetail() {
    if (!selectedHub) return
    setShowFullDetailByHub((current) => ({ ...current, [selectedHub.id]: false }))
  }

  function editClientProfileFromDetail() {
    if (!canAccessClientFormAction('Client Profile', 'edit')) return
    if (!selectedHub || !selectedDetailRecord) return

    rememberFormReturnState()
    setActiveFormError('')
    setActiveFormSession({
      kind: 'client-profile',
      formName: 'Client Profile',
      tableAlias: CLIENT_PROFILE_TABLE_ALIAS,
      rowId: selectedDetailRecord.id,
      recordId: selectedDetailRecord.recordId,
      values: { ...selectedDetailRecord.values },
    })
    setSelectedHubPages((current) => ({
      ...current,
      [selectedHub.id]: 'forms',
    }))
  }

  function resetHubSearchSurface(hubId: string) {
    if (!hubId) return
    setActiveSearchDetailByHub((current) => ({ ...current, [hubId]: null }))
    setActiveHelplineDetailByHub((current) => ({ ...current, [hubId]: null }))
    setDetailErrorByHub((current) => ({ ...current, [hubId]: '' }))
    setShowFullDetailByHub((current) => ({ ...current, [hubId]: false }))
    setSelectedClientSectionByHub((current) => ({ ...current, [hubId]: 'overview' }))
    setSelectedProgramEnrollmentDetail(null)
    setProgramEnrollmentDetailError('')
  }

  function openHomeNav() {
    if (!selectedHub) return
    setSelectedAppNav('home')
    resetHubSearchSurface(selectedHub.id)
    setSelectedHubPages((current) => ({ ...current, [selectedHub.id]: 'search' }))
    setSearchStatusByHub((current) => ({ ...current, [selectedHub.id]: '' }))
    setSearchErrorByHub((current) => ({ ...current, [selectedHub.id]: '' }))
    setSearchResultsByHub((current) => ({ ...current, [selectedHub.id]: [] }))
    setHelplineSearchResultsByHub((current) => ({ ...current, [selectedHub.id]: [] }))
  }

  function openClientsNav() {
    if (!selectedHub) return
    setSelectedAppNav('clients')
    resetHubSearchSurface(selectedHub.id)
    setSelectedHubPages((current) => ({ ...current, [selectedHub.id]: 'search' }))
    setSelectedSearchFormByHub((current) => ({ ...current, [selectedHub.id]: 'Client Profile' }))
    setSearchQueryByHub((current) => ({ ...current, [selectedHub.id]: '' }))
  }

  function openProgramsNav(hubId: string, page: HubPageKey) {
    setSelectedAppNav('programs')
    setSelectedHubId(hubId)
    setExpandedProgramNavId(hubId)
    resetHubSearchSurface(hubId)
    setSelectedHubPages((current) => ({ ...current, [hubId]: page }))
  }

  function openMyWorkNav(page: MyWorkPageKey) {
    setSelectedAppNav('my-work')
    setSelectedMyWorkPage(page)
    setMyWorkNavExpanded(true)
    if (selectedHub) setSelectedHubPages((current) => ({ ...current, [selectedHub.id]: 'search' }))
  }

  function renderWorkRecordCards(records: CaseLoadRecord[], showAssignedStaff = false) {
    return (
      <div className="client-results-card-grid">
        {records.map((row) => (
          <article className="client-result-card" key={`${row.id || row.recordId}-${row.hmisId || row.name}`}>
            {normalize(row.alertList) === 'yes' ? (
              <div className="client-alert-notice">
                <div className="client-alert-notice-head">** NOTICE **</div>
                <div className="client-alert-notice-body">
                  <div>This client is on the ALERT LIST.</div>
                  <div>{row.alertListReason ? `See reason below: ${row.alertListReason}` : 'See reason below.'}</div>
                </div>
              </div>
            ) : null}
            <div className="client-result-card-head">
              <h4>{row.name || 'Client Record'}</h4>
              <span className="chip subtle">{row.recordId || 'No Record ID'}</span>
            </div>
            <div className="client-result-card-meta">
              <div className="client-result-card-item"><span>HMIS ID</span><strong>{row.hmisId || '-'}</strong></div>
              <div className="client-result-card-item"><span>Date of Birth</span><strong>{row.dateOfBirth || '-'}</strong></div>
              <div className="client-result-card-item"><span>Primary Language</span><strong>{row.primaryLanguage || '-'}</strong></div>
              <div className="client-result-card-item"><span>Gender</span><strong>{row.gender || '-'}</strong></div>
            </div>
            <div className="client-result-card-item case-load-enrollment-meta">
              <span>Program Enrollment Start Date</span>
              {row.enrollments.map((enrollment) => (
                <strong key={`${enrollment.enrollmentId}-${enrollment.startDate}`}>
                  {enrollment.program || 'Program'} — {enrollment.startDate || '-'}
                  {showAssignedStaff ? ` · Assigned to ${enrollment.staffAssigned || 'Unassigned'}` : ''}
                </strong>
              ))}
            </div>
            <div className="client-result-card-actions">
              <button type="button" className="secondary" onClick={() => { setSelectedAppNav('clients'); if (selectedHub) setSelectedSearchFormByHub((current) => ({ ...current, [selectedHub.id]: 'Client Profile' })); void openClientProfileDetail(row.id, row.recordId) }} disabled={selectedDetailLoading}>Open Profile</button>
              {renderArchiveRecordButton(CLIENT_PROFILE_TABLE_ALIAS, row.id, row.recordId || row.name)}
            </div>
          </article>
        ))}
      </div>
    )
  }

  function isProgramEnrollmentForm(formName: string): boolean {
    return normalize(formName).includes('program enrollment')
  }

  function isServicesForm(formName: string): boolean {
    return normalize(formName) === 'services' || normalize(formName).includes('services')
  }

  function isBedEnrollmentForm(formName: string): boolean {
    return normalize(formName) === 'bed enrollment' || normalize(formName).includes('bed enrollment')
  }

  function isHelplineForm(formName: string): boolean {
    return normalize(formName) === 'helpline' || normalize(formName).includes('helpline')
  }

  function isShelterScreeningForm(formName: string): boolean {
    const key = normalize(formName)
    return key === 'shelter screening' || key.includes('shelter screening')
  }

  function isVocaForm(formName: string): boolean {
    return normalize(formName).includes('voca')
  }

  function isGoalForm(formName: string): boolean {
    return isCanonicalGoalFormName(formName)
  }

  function isHealthWellnessForm(formName: string): boolean {
    return normalize(formName).replace(/&/g, 'and').replace(/\s+/g, ' ').includes('health and wellness')
  }

  function isEventForm(formName: string): boolean {
    const key = normalize(formName)
    return key === 'event' || key.includes('event')
  }

  function isHouseholdForm(formName: string): boolean {
    const key = normalize(formName)
    return key === 'household' || key.includes('household') || key.includes('househould')
  }

  function getStaffOptionsForProgram(program: string): string[] {
    const selectedProgram = normalize(program)
    if (!selectedProgram) return []
    const matchingHub = HUB_DEFINITIONS.find((hub) => normalize(hub.title) === selectedProgram)
    return staffDirectoryEntries
      .filter((entry) => entry.roleNames.some((roleName) => matchingHub
        ? hubMatchesRole(matchingHub, roleName)
        : normalize(roleName).includes(selectedProgram)))
      .map((entry) => entry.name || entry.email)
      .filter(Boolean)
      .filter((name, index, values) => values.findIndex((entry) => normalize(entry) === normalize(name)) === index)
  }

  function isAcknowledgementAndConsentForm(formName: string): boolean {
    const key = normalize(formName).replace(/&/g, 'and')
    return key.includes('acknowledgement') && key.includes('consent')
  }

  function isAnimalAgreementForm(formName: string): boolean {
    return normalize(formName).includes('animal agreement')
  }

  function isChildAssessmentForm(formName: string): boolean {
    return normalize(formName).includes('child assessment')
  }

  function isChildShelterIntakeForm(formName: string): boolean {
    return normalize(formName).includes('child shelter intake')
  }

  function isEmploymentAndBenefitsForm(formName: string): boolean {
    const key = normalize(formName).replace(/&/g, 'and')
    return key.includes('employment') && key.includes('benefits')
  }

  function isFinancialAssistanceForm(formName: string): boolean {
    return normalize(formName).includes('financial assistance')
  }

  function isMedicalConsentForm(formName: string): boolean {
    return normalize(formName).includes('medical consent')
  }

  function isPersonYouAreFleeingProfileForm(formName: string): boolean {
    return normalize(formName).includes('person you are fleeing profile')
  }

  function isElectronicDocumentForm(formName: string): boolean {
    return normalize(formName).includes('electronic document')
  }

  function isTermsAndConditionsOfServiceAnimalsForm(formName: string): boolean {
    const key = normalize(formName).replace(/&/g, 'and')
    return key.includes('terms and conditions') && key.includes('service animals')
  }

  function isContractForm(formName: string): boolean {
    return normalize(formName) === 'contract'
  }

  function isPetCompanionIntakeForm(formName: string): boolean {
    return normalize(formName).includes('pet companion intake')
  }

  function isFunderTransactionForm(formName: string): boolean {
    return normalize(formName).includes('funder transaction')
  }

  function isShelterProgramGuidelinesForm(formName: string): boolean {
    return normalize(formName).includes('shelter program guidelines')
  }

  function mapHouseholdMemberDrafts(
    rows: HouseholdHistoryRecord[],
    householdRowId: string,
    headOfHouseholdClientRowId: string,
  ): HouseholdMemberDraft[] {
    const cleanHouseholdId = normalizeDataverseRowId(householdRowId)
    const cleanHeadOfHouseholdClientRowId = normalizeDataverseRowId(headOfHouseholdClientRowId)

    const byClient = new Map<string, HouseholdHistoryRecord>()
    for (const row of rows) {
      const clientKey = normalizeDataverseRowId(row.clientRowId) || normalize(String(row.clientRecordId || ''))
      if (!clientKey) continue

      const existing = byClient.get(clientKey)
      if (!existing) {
        byClient.set(clientKey, row)
        continue
      }

      const rowInCurrentHousehold = !!cleanHouseholdId && normalizeDataverseRowId(row.householdRowId) === cleanHouseholdId
      const existingInCurrentHousehold = !!cleanHouseholdId && normalizeDataverseRowId(existing.householdRowId) === cleanHouseholdId
      if (rowInCurrentHousehold && !existingInCurrentHousehold) {
        byClient.set(clientKey, row)
        continue
      }

      const rowActive = normalize(String(row.status || '')) === normalize('Active')
      const existingActive = normalize(String(existing.status || '')) === normalize('Active')
      if (rowActive && !existingActive) {
        byClient.set(clientKey, row)
        continue
      }

      const existingHasName = !!String(existing.clientName || '').trim()
      const rowHasName = !!String(row.clientName || '').trim()
      if (rowHasName && !existingHasName) {
        byClient.set(clientKey, row)
      }
    }

    return Array.from(byClient.values())
      .map((row) => {
        const rowHouseholdId = normalizeDataverseRowId(row.householdRowId)
        const isFromCurrentHousehold = !!cleanHouseholdId && rowHouseholdId === cleanHouseholdId
        const isHeadOfHousehold = normalizeDataverseRowId(row.clientRowId) === cleanHeadOfHouseholdClientRowId
        const selected = isFromCurrentHousehold || (!cleanHouseholdId && isHeadOfHousehold)

        return {
          historyRowId: row.id,
          historyRecordId: row.recordId,
          clientRowId: row.clientRowId,
          clientRecordId: row.clientRecordId,
          clientName: String(row.clientName || '').trim(),
          householdRowId: row.householdRowId,
          selected,
          status: isFromCurrentHousehold ? (row.status || 'Active') : 'Active',
          relationshipToHoh: isFromCurrentHousehold
            ? (row.relationshipToHoh || (isHeadOfHousehold ? 'Self' : ''))
            : (isHeadOfHousehold ? 'Self' : ''),
          relationshipToHohOther: isFromCurrentHousehold ? (row.relationshipToHohOther || '') : '',
        }
      })
      .sort((a, b) => {
        const aActiveSelected = a.selected && normalize(a.status) !== normalize('Inactive') ? 0 : 1
        const bActiveSelected = b.selected && normalize(b.status) !== normalize('Inactive') ? 0 : 1
        if (aActiveSelected !== bActiveSelected) return aActiveSelected - bActiveSelected
        const aIsHead = normalize(a.relationshipToHoh) === normalize('Self') || normalizeDataverseRowId(a.clientRowId) === cleanHeadOfHouseholdClientRowId
        const bIsHead = normalize(b.relationshipToHoh) === normalize('Self') || normalizeDataverseRowId(b.clientRowId) === cleanHeadOfHouseholdClientRowId
        if (aIsHead !== bIsHead) return aIsHead ? -1 : 1
        const aSelected = a.selected ? 0 : 1
        const bSelected = b.selected ? 0 : 1
        if (aSelected !== bSelected) return aSelected - bSelected
        return a.clientName.localeCompare(b.clientName)
      })
  }

  function getHouseholdHeadName(drafts: HouseholdMemberDraft[]) {
    const headOfHousehold = drafts.find((entry) => (
      entry.selected
      && normalize(entry.status) !== normalize('Inactive')
      && normalize(entry.relationshipToHoh) === normalize('Self')
    ))

    return String(headOfHousehold?.clientName || headOfHousehold?.clientRecordId || '').trim()
  }

  function syncHouseholdDerivedValues(drafts: HouseholdMemberDraft[]) {
    const activeSelectedCount = drafts.filter((entry) => entry.selected && normalize(entry.status) !== normalize('Inactive')).length
    const headOfHouseholdName = getHouseholdHeadName(drafts)

    setActiveFormSession((current) => {
      if (!current || current.kind !== 'household') return current
      return {
        ...current,
        values: {
          ...current.values,
          cmps_numberofhhmembers: String(activeSelectedCount),
          cmps_headofhouseholdname: headOfHouseholdName,
        },
      }
    })
  }

  function updateHouseholdValue(field: string, value: string) {
    setActiveFormSession((current) => {
      if (!current || current.kind !== 'household') return current
      return {
        ...current,
        values: {
          ...current.values,
          [field]: value,
        },
      }
    })
  }

  function updateHouseholdMultiSelectValue(field: string, option: string, checked: boolean) {
    const session = activeFormSession
    if (!session || session.kind !== 'household') return

    const current = parseMultiValue(String(session.values[field] || ''))
    const normalizedOption = normalize(option)
    const next = checked
      ? Array.from(new Set([...current, option]))
      : current.filter((entry) => normalize(entry) !== normalizedOption)

    updateHouseholdValue(field, next.join(', '))
  }

  function updateHouseholdSelectedMembers(clientRowIds: string[]) {
    const selectedIds = new Set(clientRowIds.map(normalizeDataverseRowId).filter(Boolean))

    setHouseholdMembersDraft((current) => {
      const next = current.map((entry) => {
        const isSelected = selectedIds.has(normalizeDataverseRowId(entry.clientRowId))
        return {
          ...entry,
          selected: isSelected,
          status: isSelected ? (entry.status || 'Active') : 'Active',
          relationshipToHoh: isSelected ? entry.relationshipToHoh : '',
          relationshipToHohOther: isSelected ? entry.relationshipToHohOther : '',
        }
      })

      const headClientRowId = normalizeDataverseRowId(selectedDetailRecord?.id)
      next.sort((a, b) => {
        const aActiveSelected = a.selected && normalize(a.status) !== normalize('Inactive') ? 0 : 1
        const bActiveSelected = b.selected && normalize(b.status) !== normalize('Inactive') ? 0 : 1
        if (aActiveSelected !== bActiveSelected) return aActiveSelected - bActiveSelected
        const aIsHead = normalize(a.relationshipToHoh) === normalize('Self') || normalizeDataverseRowId(a.clientRowId) === headClientRowId
        const bIsHead = normalize(b.relationshipToHoh) === normalize('Self') || normalizeDataverseRowId(b.clientRowId) === headClientRowId
        if (aIsHead !== bIsHead) return aIsHead ? -1 : 1
        const aSelected = a.selected ? 0 : 1
        const bSelected = b.selected ? 0 : 1
        if (aSelected !== bSelected) return aSelected - bSelected
        return a.clientName.localeCompare(b.clientName)
      })

      syncHouseholdDerivedValues(next)
      return next
    })
  }

  async function searchHouseholdClients() {
    const query = String(householdClientSearchQuery || '').trim()
    if (query.length < 2) {
      setHouseholdClientSearchApplied('')
      setHouseholdClientSearchResults([])
      setHouseholdClientSearchError('Enter at least 2 characters to search clients.')
      return
    }

    setHouseholdClientSearchLoading(true)
    setHouseholdClientSearchError('')
    setHouseholdClientSearchApplied(query)
    try {
      const result = await searchClientProfileRecordsPaged(query, 1, SEARCH_PAGE_SIZE)
      const currentHouseholdId = normalizeDataverseRowId(activeFormSession?.kind === 'household' ? activeFormSession.rowId : '')
      const availableResults: ClientProfileSearchRecord[] = []

      for (const client of result.rows) {
        const histories = await listHouseholdHistoriesForClient(client.id)
        const activeHistory = histories.find((row) => normalize(row.status) === normalize('Active'))
        const linkedHouseholdId = normalizeDataverseRowId(activeHistory?.householdRowId)
        if (linkedHouseholdId && linkedHouseholdId !== currentHouseholdId) continue
        availableResults.push(client)
      }

      setHouseholdClientSearchResults(availableResults)
      setHouseholdMembersDraft((current) => {
        const next = [...current]
        for (const client of availableResults) {
          if (next.some((entry) => sameDataverseRowId(entry.clientRowId, client.id))) continue
          next.push({
            historyRowId: '',
            historyRecordId: '',
            clientRowId: client.id,
            clientRecordId: client.recordId || '',
            clientName: client.name || '',
            householdRowId: '',
            selected: false,
            status: 'Active',
            relationshipToHoh: '',
            relationshipToHohOther: '',
          })
        }
        return next
      })

      if (result.rows.length === 0) setHouseholdClientSearchError('No clients matched that search.')
      else if (availableResults.length === 0) setHouseholdClientSearchError('No available clients matched that search.')
    } catch (err) {
      setHouseholdClientSearchResults([])
      setHouseholdClientSearchError(String((err as Error)?.message || err || 'Unable to search clients.'))
    } finally {
      setHouseholdClientSearchLoading(false)
    }
  }

  function updateHouseholdMemberStatus(clientRowId: string, status: string) {
    setHouseholdMembersDraft((current) => {
      const cleanClientRowId = String(clientRowId || '').trim()
      const next = current.map((entry) => {
        if (String(entry.clientRowId || '').trim() !== cleanClientRowId) return entry
        return {
          ...entry,
          status,
        }
      })

      syncHouseholdDerivedValues(next)
      return next
    })
  }

  function updateHouseholdMemberRelationship(clientRowId: string, relationshipToHoh: string) {
    setHouseholdMembersDraft((current) => {
      const cleanClientRowId = String(clientRowId || '').trim()
      const selectingSelf = normalize(relationshipToHoh) === normalize('Self')
      const next = current.map((entry) => {
        const isCurrentMember = String(entry.clientRowId || '').trim() === cleanClientRowId

        if (!isCurrentMember) {
          return selectingSelf && normalize(entry.relationshipToHoh) === normalize('Self')
            ? { ...entry, relationshipToHoh: '', relationshipToHohOther: '' }
            : entry
        }

        return {
          ...entry,
          relationshipToHoh,
          relationshipToHohOther: normalize(relationshipToHoh) === normalize('Other')
            ? entry.relationshipToHohOther
            : '',
        }
      })

      syncHouseholdDerivedValues(next)
      return next
    })
  }

  function updateHouseholdMemberRelationshipOther(clientRowId: string, relationshipToHohOther: string) {
    setHouseholdMembersDraft((current) => {
      const cleanClientRowId = String(clientRowId || '').trim()
      return current.map((entry) => {
        if (String(entry.clientRowId || '').trim() !== cleanClientRowId) return entry
        return {
          ...entry,
          relationshipToHohOther,
        }
      })
    })
  }

  async function editHouseholdRecord(rowId: string, recordIdHint: string) {
    if (!canAccessClientFormAction('Household', 'edit')) return
    const cleanId = String(rowId || '').trim()
    const cleanRecordId = String(recordIdHint || '').trim()
    if (!cleanId && !cleanRecordId) return

    const headOfHouseholdClientRowId = String(selectedDetailRecord?.id || '').trim()

    setHouseholdMembersLoading(true)
    setHouseholdMembersError('')
    setHouseholdClientSearchQuery('')
    setHouseholdClientSearchApplied('')
    setHouseholdClientSearchResults([])
    setHouseholdClientSearchError('')
    setActiveFormError('')

    try {
      const [detail, candidateRows] = await Promise.all([
        loadHouseholdDetailRecord(cleanId, cleanRecordId),
        listHouseholdHistoriesByHouseholdOrActivePool(cleanId),
      ])

      const drafts = mapHouseholdMemberDrafts(candidateRows, cleanId, headOfHouseholdClientRowId)
      const originalMemberRowIds = drafts
        .filter((entry) => sameDataverseRowId(entry.householdRowId, cleanId) && normalize(entry.status) === normalize('Active'))
        .map((entry) => entry.historyRowId)

      setHouseholdMembersDraft(drafts)
      setHouseholdOriginalMemberRowIds(originalMemberRowIds)
      rememberFormReturnState()
      setActiveFormSession({
        kind: 'household',
        formName: 'Household',
        tableAlias: HOUSEHOLDS_TABLE_ALIAS,
        rowId: detail.id,
        recordId: detail.recordId,
        values: {
          ...detail.values,
          cmps_headofhouseholdname: getHouseholdHeadName(drafts) || detail.values.cmps_headofhouseholdname || '',
          cmps_numberofhhmembers: String(drafts.filter((entry) => entry.selected && normalize(entry.status) !== normalize('Inactive')).length),
        },
      })

      if (selectedHub) {
        setSelectedHubPages((current) => ({
          ...current,
          [selectedHub.id]: 'forms',
        }))
      }

      scrollToTopOfPage()
    } catch (err) {
      setHouseholdMembersError(String((err as Error)?.message || err))
    } finally {
      setHouseholdMembersLoading(false)
    }
  }

  async function startProgramEnrollmentFromClientDetail() {
    if (!requireFormCreateAccess('Program Enrollment')) return
    if (!selectedHub || !selectedDetailRecord) return

    rememberFormReturnState()
    const clientRecordId = selectedDetailRecord.recordId || ''
    const recordId = await generateAppRecordId(PROGRAM_ENROLLMENT_TABLE_ALIAS, 'PE')

    setActiveFormError('')
    setActiveFormSession({
      kind: 'program-enrollment',
      formName: 'Program Enrollment',
      tableAlias: PROGRAM_ENROLLMENT_TABLE_ALIAS,
      rowId: '',
      recordId,
      values: {
        cmps_recordid: recordId,
        cmps_clientid: selectedDetailRecord.id,
        cmps_enrollmentstatus: 'Enrolled',
        ...(getProgramEnrollmentClassificationsFromClient(selectedDetailRecord)
          ? { cmps_clientspecialclassification1: getProgramEnrollmentClassificationsFromClient(selectedDetailRecord) }
          : {}),
      },
    })

    setSelectedHubPages((current) => ({
      ...current,
      [selectedHub.id]: 'forms',
    }))
    setHubActionStatus(`Started Program Enrollment for client ${clientRecordId || 'Unknown'}.`)
    scrollToTopOfPage()
  }

  async function startVocaFromClientDetail() {
    if (!requireFormCreateAccess('VOCA Form')) return
    if (!selectedHub || !selectedDetailRecord) return
    if (activeVocaProgramEnrollmentOptions.length === 0) {
      setHubActionStatus('An active Program Enrollment is required before starting a VOCA Form.')
      return
    }

    rememberFormReturnState()
    const recordId = await generateAppRecordId(VOCA_FORMS_TABLE_ALIAS, 'VOCA')
    setActiveFormError('')
    setActiveFormSession({
      kind: 'voca-form',
      formName: 'VOCA Form',
      tableAlias: VOCA_FORMS_TABLE_ALIAS,
      rowId: '',
      recordId,
      values: {
        cmps_recordid: recordId,
        cmps_peid: '',
      },
    })

    setSelectedHubPages((current) => ({
      ...current,
      [selectedHub.id]: 'forms',
    }))
    setHubActionStatus('Started VOCA Form. Choose an active Program Enrollment for this client.')
    scrollToTopOfPage()
  }

  async function startServicesFromClientDetail() {
    if (!requireFormCreateAccess('Services')) return
    if (!selectedHub || !selectedDetailRecord) return

    const activeProgramEnrollments = programEnrollmentsForClient.filter((row) => !String(row.serviceEndDate || '').trim())
    if (activeProgramEnrollments.length === 0) {
      setHubActionStatus('No active Program Enrollment found for this client. Start or reactivate Program Enrollment first.')
      return
    }

    const draftKey = Symbol('services draft')
    rememberFormReturnState()
    setActiveFormError('')
    setActiveFormSession({
      kind: 'services',
      draftKey,
      formName: 'Services',
      tableAlias: SERVICES_TABLE_ALIAS,
      rowId: '',
      recordId: '',
      values: {
        cmps_recordid: '',
        cmps_programenrollment: '',
      },
    })

    setSelectedHubPages((current) => ({
      ...current,
      [selectedHub.id]: 'forms',
    }))
    setHubActionStatus('Started Services form. Choose an active Program Enrollment in the Program Enrollment field.')
    scrollToTopOfPage()
    // Show the editable form immediately while the complete ID scan runs.
    // A stale scan must never update a different form or discard draft edits.
    try {
      const recordId = await generateAppRecordId(SERVICES_TABLE_ALIAS, 'SV')
      setActiveFormSession((current) => current?.kind === 'services' && current.draftKey === draftKey
        ? { ...current, recordId, values: { ...current.values, cmps_recordid: recordId } }
        : current)
    } catch (error) {
      setActiveFormSession((current) => current?.kind === 'services' && current.draftKey === draftKey
        ? { ...current, recordIdError: String((error as Error)?.message || error) }
        : current)
    }
  }

  async function startBedEnrollmentFromClientDetail() {
    if (!requireFormCreateAccess('Bed Enrollment')) return
    if (!selectedHub || !selectedDetailRecord) return

    const activeProgramEnrollments = programEnrollmentsForClient.filter((row) => !String(row.serviceEndDate || '').trim())
    if (activeProgramEnrollments.length === 0) {
      setHubActionStatus('No active Program Enrollment found for this client. Start or reactivate Program Enrollment first.')
      return
    }

    const recordId = await generateAppRecordId(BED_ENROLLMENTS_TABLE_ALIAS, 'BE')
    rememberFormReturnState()
    setActiveFormError('')
    setActiveFormSession({
      kind: 'bed-enrollment',
      formName: 'Bed Enrollment',
      tableAlias: BED_ENROLLMENTS_TABLE_ALIAS,
      rowId: '',
      recordId,
      values: {
        cmps_recordid: recordId,
        cmps_programenrollment: '',
      },
    })

    setSelectedHubPages((current) => ({
      ...current,
      [selectedHub.id]: 'forms',
    }))
    setHubActionStatus('Started Bed Enrollment form. Choose an active Program Enrollment in the Program Enrollment field.')
    scrollToTopOfPage()
  }

  async function openProgramEnrollmentDetail(rowId: string, recordIdHint: string) {
    const cleanId = String(rowId || '').trim()
    const cleanRecordId = String(recordIdHint || '').trim()
    if (!cleanId && !cleanRecordId) {
      setProgramEnrollmentDetailError('Unable to open this Program Enrollment because required record information is missing.')
      return
    }

    setProgramEnrollmentDetailLoading(true)
    setProgramEnrollmentDetailError('')
    try {
      const detail = await loadProgramEnrollmentDetailRecord(cleanId, cleanRecordId)
      setSelectedProgramEnrollmentDetail(detail)
      openRecordFormView('program-enrollment', detail)
      scrollToTopOfPage()
    } catch (err) {
      setSelectedProgramEnrollmentDetail(null)
      setProgramEnrollmentDetailError(String((err as Error)?.message || err))
    } finally {
      setProgramEnrollmentDetailLoading(false)
    }
  }

  async function editProgramEnrollmentRecord(rowId: string, recordIdHint: string) {
    if (!canAccessClientFormAction('Program Enrollment', 'edit')) return
    const cleanId = String(rowId || '').trim()
    const cleanRecordId = String(recordIdHint || '').trim()
    if (!cleanId && !cleanRecordId) {
      setProgramEnrollmentDetailError('Unable to open this Program Enrollment because required record information is missing.')
      return
    }

    setProgramEnrollmentDetailLoading(true)
    rememberFormReturnState()
    setProgramEnrollmentDetailError('')
    try {
      const detail = await loadProgramEnrollmentDetailRecord(cleanId, cleanRecordId)
      const currentClientRowId = String(selectedDetailRecord?.id || '').trim()
      const values = {
        ...detail.values,
        ...(currentClientRowId ? { cmps_clientid: currentClientRowId } : {}),
      }

      setActiveFormError('')
      setActiveFormSession({
        kind: 'program-enrollment',
        formName: 'Program Enrollment',
        tableAlias: PROGRAM_ENROLLMENT_TABLE_ALIAS,
        rowId: detail.id,
        recordId: detail.recordId,
        values,
      })

      if (selectedHub) {
        setSelectedHubPages((current) => ({
          ...current,
          [selectedHub.id]: 'forms',
        }))
      }

      setSelectedProgramEnrollmentDetail(null)
      setProgramEnrollmentDetailError('')
      scrollToTopOfPage()
    } catch (err) {
      setProgramEnrollmentDetailError(String((err as Error)?.message || err))
    } finally {
      setProgramEnrollmentDetailLoading(false)
    }
  }

  async function openServicesDetail(rowId: string, recordIdHint: string) {
    const cleanId = String(rowId || '').trim()
    const cleanRecordId = String(recordIdHint || '').trim()
    if (!cleanId && !cleanRecordId) {
      setServicesDetailError('Unable to open this Services record because required record information is missing.')
      return
    }

    setServicesDetailLoading(true)
    setServicesDetailError('')
    try {
      const detail = await loadServicesDetailRecord(cleanId, cleanRecordId)
      setSelectedServicesDetail(detail)
      openRecordFormView('services', detail)
      scrollToTopOfPage()
    } catch (err) {
      setSelectedServicesDetail(null)
      setServicesDetailError(String((err as Error)?.message || err))
    } finally {
      setServicesDetailLoading(false)
    }
  }

  async function openServicesDetailFromClient(row: ClientServicesListRecord) {
    const cleanServiceId = String(row.id || '').trim()
    const cleanServiceRecordId = String(row.recordId || '').trim()
    const cleanEnrollmentId = String(row.programEnrollmentRowId || '').trim()
    const cleanEnrollmentRecordId = String(row.programEnrollmentRecordId || '').trim()

    if (!cleanServiceId && !cleanServiceRecordId) {
      setServicesDetailError('Unable to open this Services record because required record information is missing.')
      return
    }

    if (!cleanEnrollmentId && !cleanEnrollmentRecordId) {
      setServicesDetailError('Missing Program Enrollment linkage for this Services record.')
      return
    }

    setProgramEnrollmentDetailLoading(true)
    setProgramEnrollmentDetailError('')
    setServicesDetailLoading(true)
    setServicesDetailError('')
    try {
      const enrollmentDetail = await loadProgramEnrollmentDetailRecord(cleanEnrollmentId, cleanEnrollmentRecordId)
      setSelectedProgramEnrollmentDetail(enrollmentDetail)

      const serviceDetail = await loadServicesDetailRecord(cleanServiceId, cleanServiceRecordId)
      setSelectedServicesDetail(serviceDetail)
      openRecordFormView('services', serviceDetail)
      scrollToTopOfPage()
    } catch (err) {
      setSelectedServicesDetail(null)
      setServicesDetailError(String((err as Error)?.message || err))
    } finally {
      setProgramEnrollmentDetailLoading(false)
      setServicesDetailLoading(false)
    }
  }

  async function editServicesRecord(rowId: string, recordIdHint: string, preferredEnrollmentRowId = '') {
    if (!canAccessClientFormAction('Services', 'edit')) return
    const cleanId = String(rowId || '').trim()
    const cleanRecordId = String(recordIdHint || '').trim()
    if (!cleanId && !cleanRecordId) {
      setServicesDetailError('Unable to open this Services record because required record information is missing.')
      return
    }

    setServicesDetailLoading(true)
    rememberFormReturnState()
    setServicesDetailError('')
    try {
      const detail = await loadServicesDetailRecord(cleanId, cleanRecordId)
      const enrollmentRowId = String(preferredEnrollmentRowId || selectedProgramEnrollmentDetail?.id || '').trim()
      const values: ServicesPayload = {
        ...detail.values,
        ...(enrollmentRowId ? { cmps_programenrollment: enrollmentRowId } : {}),
      }

      setActiveFormError('')
      setActiveFormSession({
        kind: 'services',
        formName: 'Services',
        tableAlias: SERVICES_TABLE_ALIAS,
        rowId: detail.id,
        recordId: detail.recordId,
        values,
      })

      if (selectedHub) {
        setSelectedHubPages((current) => ({
          ...current,
          [selectedHub.id]: 'forms',
        }))
      }

      setSelectedServicesDetail(null)
      setServicesDetailError('')
      scrollToTopOfPage()
    } catch (err) {
      setServicesDetailError(String((err as Error)?.message || err))
    } finally {
      setServicesDetailLoading(false)
    }
  }

  async function openBedEnrollmentDetail(rowId: string, recordIdHint: string) {
    const cleanId = String(rowId || '').trim()
    const cleanRecordId = String(recordIdHint || '').trim()
    if (!cleanId && !cleanRecordId) {
      setBedEnrollmentDetailError('Unable to open this Bed Enrollment because required record information is missing.')
      return
    }

    setBedEnrollmentDetailLoading(true)
    setBedEnrollmentDetailError('')
    try {
      const detail = await loadBedEnrollmentDetailRecord(cleanId, cleanRecordId)
      setSelectedBedEnrollmentDetail(detail)
      openRecordFormView('bed-enrollment', detail)
      scrollToTopOfPage()
    } catch (err) {
      setSelectedBedEnrollmentDetail(null)
      setBedEnrollmentDetailError(String((err as Error)?.message || err))
    } finally {
      setBedEnrollmentDetailLoading(false)
    }
  }

  async function openBedEnrollmentDetailFromClient(row: ClientBedEnrollmentListRecord) {
    const cleanId = String(row.id || '').trim()
    const cleanRecordId = String(row.recordId || '').trim()
    const cleanEnrollmentId = String(row.programEnrollmentRowId || '').trim()
    const cleanEnrollmentRecordId = String(row.programEnrollmentRecordId || '').trim()

    if (!cleanId && !cleanRecordId) {
      setBedEnrollmentDetailError('Unable to open this Bed Enrollment because required record information is missing.')
      return
    }

    if (!cleanEnrollmentId && !cleanEnrollmentRecordId) {
      setBedEnrollmentDetailError('Missing Program Enrollment linkage for this Bed Enrollment record.')
      return
    }

    setProgramEnrollmentDetailLoading(true)
    setProgramEnrollmentDetailError('')
    setBedEnrollmentDetailLoading(true)
    setBedEnrollmentDetailError('')
    try {
      const enrollmentDetail = await loadProgramEnrollmentDetailRecord(cleanEnrollmentId, cleanEnrollmentRecordId)
      setSelectedProgramEnrollmentDetail(enrollmentDetail)

      const detail = await loadBedEnrollmentDetailRecord(cleanId, cleanRecordId)
      setSelectedBedEnrollmentDetail(detail)
      openRecordFormView('bed-enrollment', detail)
      scrollToTopOfPage()
    } catch (err) {
      setSelectedBedEnrollmentDetail(null)
      setBedEnrollmentDetailError(String((err as Error)?.message || err))
    } finally {
      setProgramEnrollmentDetailLoading(false)
      setBedEnrollmentDetailLoading(false)
    }
  }

  async function editBedEnrollmentRecord(rowId: string, recordIdHint: string, preferredEnrollmentRowId = '') {
    if (!canAccessClientFormAction('Bed Enrollment', 'edit')) return
    const cleanId = String(rowId || '').trim()
    const cleanRecordId = String(recordIdHint || '').trim()
    if (!cleanId && !cleanRecordId) {
      setBedEnrollmentDetailError('Unable to open this Bed Enrollment because required record information is missing.')
      return
    }

    setBedEnrollmentDetailLoading(true)
    rememberFormReturnState()
    setBedEnrollmentDetailError('')
    try {
      const detail = await loadBedEnrollmentDetailRecord(cleanId, cleanRecordId)
      const enrollmentRowId = String(preferredEnrollmentRowId || selectedProgramEnrollmentDetail?.id || '').trim()
      const values: BedEnrollmentPayload = {
        ...detail.values,
        ...(enrollmentRowId ? { cmps_programenrollment: enrollmentRowId } : {}),
      }

      setActiveFormError('')
      setActiveFormSession({
        kind: 'bed-enrollment',
        formName: 'Bed Enrollment',
        tableAlias: BED_ENROLLMENTS_TABLE_ALIAS,
        rowId: detail.id,
        recordId: detail.recordId,
        values,
      })

      if (selectedHub) {
        setSelectedHubPages((current) => ({
          ...current,
          [selectedHub.id]: 'forms',
        }))
      }

      setSelectedBedEnrollmentDetail(null)
      setBedEnrollmentDetailError('')
      scrollToTopOfPage()
    } catch (err) {
      setBedEnrollmentDetailError(String((err as Error)?.message || err))
    } finally {
      setBedEnrollmentDetailLoading(false)
    }
  }

  function closeFullBedEnrollmentDetail() {
    setSelectedBedEnrollmentDetail(null)
    setBedEnrollmentDetailError('')
  }

  function closeFullServicesDetail() {
    setSelectedServicesDetail(null)
    setServicesDetailError('')
  }

  function closeFullProgramEnrollmentDetail() {
    setSelectedProgramEnrollmentDetail(null)
    setProgramEnrollmentDetailError('')
  }

  function closeCurrentRecordView() {
    if (recordFormView) { closeRecordFormView(); return }
    if (selectedServicesDetail) closeFullServicesDetail()
    else if (selectedBedEnrollmentDetail) closeFullBedEnrollmentDetail()
    else if (selectedChildSafetyPlanDetail) {
      setSelectedChildSafetyPlanDetail(null)
      setChildSafetyPlanDetailError('')
    } else if (selectedElectronicDocumentDetail) {
      setSelectedElectronicDocumentDetail(null)
      setElectronicDocumentDetailError('')
    } else if (selectedAdultAssessmentDetail) {
      setSelectedAdultAssessmentDetail(null)
      setAdultAssessmentDetailError('')
    } else if (selectedHealthWellnessDetail) {
      setSelectedHealthWellnessDetail(null)
      setHealthWellnessDetailError('')
    } else if (selectedGoalDetail) {
      setSelectedGoalDetail(null)
      setGoalDetailError('')
    } else if (selectedFocusPlanDetail) {
      setSelectedFocusPlanDetail(null)
      setFocusPlanDetailError('')
    } else if (selectedInitialSafetyPlanDetail) {
      setSelectedInitialSafetyPlanDetail(null)
      setInitialSafetyPlanDetailError('')
    } else if (selectedShowFullDetail) closeFullClientProfileDetail()
    else if (selectedProgramEnrollmentDetail) closeFullProgramEnrollmentDetail()
    else if (selectedHelplineDetail) closeHelplineDetail()
    else if (selectedEventDetail) closeEventDetail()
    scrollToTopOfPage()
  }

  function updateActiveFormValue(field: ClientProfileFieldName, value: string) {
    updateClientProfileValue(field, value)
  }

  function updateNameValue(part: keyof NameParts, value: string) {
    const isAnonymous = activeFormSession?.kind === 'client-profile' && isAnonymousClientProfile(activeFormSession.values)
    if (part === 'last' && isAnonymous) return
    setNameParts((current) => {
      const next: NameParts = { ...current, [part]: value }
      if (isAnonymous) next.last = 'Anonymous'
      updateActiveFormValue('cmps_name', next.first.trim())
      updateActiveFormValue('cmps_middlename', next.middle.trim())
      updateActiveFormValue('cmps_lastname', next.last.trim())
      return next
    })
  }


  function updatePhoneValue(part: keyof PhoneParts, value: string) {
    const maxLength: Record<keyof PhoneParts, number> = { part1: 3, part2: 3, part3: 4 }
    const numericValue = String(value || '').replace(/\D/g, '').slice(0, maxLength[part])

    setPhoneParts((current) => {
      const next: PhoneParts = { ...current, [part]: numericValue }
      updateActiveFormValue('cmps_clientcontactinformation', formatPhoneParts(next))
      return next
    })
  }

  function updateAddressValue(part: keyof AddressParts, value: string) {
    setAddressParts((current) => {
      const next: AddressParts = { ...current, [part]: value }
      // Do not trim the separator space before the user types the next word.
      updateActiveFormValue('cmps_addressline1', next.line1)
      updateActiveFormValue('cmps_addressline2', next.line2)
      updateActiveFormValue('cmps_city', next.city)
      updateActiveFormValue('cmps_state', next.state)
      updateActiveFormValue('cmps_county', next.county)
      updateActiveFormValue('cmps_zip', next.zip)
      return next
    })
  }

  function updatePrimaryLanguageValue(selected: string) {
    const normalizedSelection = normalize(selected)
    if (normalizedSelection !== 'other') {
      setPrimaryLanguageOther('')
      updateActiveFormValue('cmps_primarylanguage', selected)
      return
    }

    const value = primaryLanguageOther.trim() ? `Other: ${primaryLanguageOther.trim()}` : 'Other'
    updateActiveFormValue('cmps_primarylanguage', value)
  }

  function updatePrimaryLanguageOtherValue(value: string) {
    setPrimaryLanguageOther(value)
    updateActiveFormValue('cmps_primarylanguage', value.trim() ? `Other: ${value.trim()}` : 'Other')
  }

  function updateProgramEnrollmentValue(field: string, value: string) {
    setActiveFormSession((current) => {
      if (!current || current.kind !== 'program-enrollment') return current
      const nextValues = {
        ...current.values,
        [field]: value,
      }
      if (field === 'cmps_program') {
        nextValues.cmps_programtype = getDerivedProgramEnrollmentType(value)
        nextValues.cmps_projecttype = getDefaultProgramEnrollmentProjectType(value)
      }
      if (field === 'cmps_program' && normalize(value) !== normalize('DVSTOP') && normalize(nextValues.cmps_funder || '') === normalize('OVW-Late Life')) {
        nextValues.cmps_funder = ''
      }
      if (field === 'cmps_program' && nextValues.cmps_staffassigned) {
        const staffOptions = getStaffOptionsForProgram(value)
        if (!staffOptions.some((option) => normalize(option) === normalize(nextValues.cmps_staffassigned || ''))) {
          nextValues.cmps_staffassigned = ''
        }
      }
      if (field === 'cmps_servicestartdate' || field === 'cmps_serviceenddate') {
        nextValues.cmps_lengthofstay = calculateLengthOfStay(
          nextValues.cmps_servicestartdate || '',
          nextValues.cmps_serviceenddate || '',
        )
      }
      return {
        ...current,
        values: nextValues,
      }
    })
  }

  function updateProgramEnrollmentNameValue(part: keyof NameParts, value: string) {
    setSvHelplineNameParts((current) => {
      const next: NameParts = { ...current, [part]: value }
      updateProgramEnrollmentValue('cmps_nameofsvhelplineclient', formatNameParts(next))
      return next
    })
  }

  function updateProgramEnrollmentMultiSelectValue(field: string, option: string, checked: boolean) {
    const session = activeFormSession
    if (!session || session.kind !== 'program-enrollment') return

    const current = parseMultiValue(session.values[field] || '')
    const normalizedOption = normalize(option)
    const next = checked
      ? Array.from(new Set([...current, option]))
      : current.filter((entry) => normalize(entry) !== normalizedOption)

    updateProgramEnrollmentValue(field, next.join(', '))
  }

  function updateServicesValue(field: string, value: string) {
    setActiveFormSession((current) => {
      if (!current || current.kind !== 'services') return current

      const nextValues: ServicesPayload = {
        ...current.values,
        [field]: field === 'cmps_servicecategory' && normalize(value) === normalize('Legal Advocacy') ? 'Legal & Medical Advocacy' : value,
      }

      if (field === 'cmps_servicecategory') {
        const serviceField = SERVICES_FIELD_DEFINITIONS.find((entry) => entry.field === 'cmps_service')
        const allowedServices = resolveServicesDependentOptions('cmps_service', serviceField?.options || [], nextValues as Record<string, string>)
        const selectedService = String(nextValues.cmps_service || '').trim()
        if (selectedService && !allowedServices.some((entry) => normalize(entry) === normalize(selectedService))) {
          nextValues.cmps_service = ''
          nextValues.cmps_wheredidyourefer = ''
          nextValues.cmps_wheredidyoureferother = ''
        }
      }

      if (field === 'cmps_service') {
        const referField = SERVICES_FIELD_DEFINITIONS.find((entry) => entry.field === 'cmps_wheredidyourefer')
        const allowedRefs = resolveServicesDependentOptions('cmps_wheredidyourefer', referField?.options || [], nextValues as Record<string, string>)
        const selectedRefer = String(nextValues.cmps_wheredidyourefer || '').trim()
        if (selectedRefer && !allowedRefs.some((entry) => normalize(entry) === normalize(selectedRefer))) {
          nextValues.cmps_wheredidyourefer = ''
          nextValues.cmps_wheredidyoureferother = ''
        }
      }

      if (field === 'cmps_wheredidyourefer' && normalize(value) !== normalize('Other')) {
        nextValues.cmps_wheredidyoureferother = ''
      }

      if (field === 'cmps_service' && normalize(value) !== normalize('Other')) {
        nextValues.cmps_serviceother = ''
      }
      if (field === 'cmps_servicecategory' && normalize(value) !== normalize('Other')) {
        nextValues.cmps_servicecategoryother = ''
      }
      if (field === 'cmps_servicesite' && normalize(value) !== normalize('Other')) {
        nextValues.cmps_servicesiteother = ''
      }
      if (field === 'cmps_meetingmode' && normalize(value) !== normalize('Other')) {
        nextValues.cmps_meetingmodeother = ''
      }
      if (field === 'cmps_additionalservicedetail' && normalize(value) !== normalize('Other')) {
        nextValues.cmps_additionalservicedetailother = ''
      }
      if (field === 'cmps_servicecategory' || field === 'cmps_service') {
        const category = normalize(String(nextValues.cmps_servicecategory || ''))
        const service = normalize(String(nextValues.cmps_service || ''))
        if (category !== normalize('Emotional Wellness & Healing') || service !== normalize('Support Groups')) {
          nextValues.cmps_additionalservicedetail = ''
          nextValues.cmps_additionalservicedetailother = ''
        }
      }

      return {
        ...current,
        values: nextValues,
      }
    })
  }

  function updateServicesMultiSelectValue(field: string, option: string, checked: boolean) {
    const session = activeFormSession
    if (!session || session.kind !== 'services') return

    const current = parseMultiValue(String(session.values[field] || ''))
    const normalizedOption = normalize(option)
    const next = checked
      ? Array.from(new Set([...current, option]))
      : current.filter((entry) => normalize(entry) !== normalizedOption)

    updateServicesValue(field, next.join(', '))
  }

  function updateBedEnrollmentValue(field: string, value: string) {
    setActiveFormSession((current) => {
      if (!current || current.kind !== 'bed-enrollment') return current
      return {
        ...current,
        values: {
          ...current.values,
          [field]: value,
          ...(field === 'cmps_programenrollment' ? { cmps_selectedbeds: '' } : {}),
        },
      }
    })
  }

  async function openGoalDetailFromClient(row: GoalListRecord) {
    setGoalDetailLoading(true)
    setGoalDetailError('')
    try {
      const detail = await loadGoalDetailRecord(row.id, row.recordId)
      setSelectedGoalDetail(detail)
      openRecordFormView('goals', detail)
    } catch (err) {
      setSelectedGoalDetail(null)
      setGoalDetailError(String((err as Error)?.message || err))
    } finally {
      setGoalDetailLoading(false)
    }
  }

  async function editGoalRecord(row: GoalListRecord) {
    if (!canAccessClientFormAction('Goals', 'edit')) return
    rememberFormReturnState()
    setGoalDetailLoading(true)
    setGoalDetailError('')
    try {
      const detail = await loadGoalDetailRecord(row.id, row.recordId)
      const values = { ...detail.values }
      for (const field of ['cmps_goalstartdate', 'cmps_goalcompletiondate', 'cmps_goaltargetdate', 'cmps_goalprogressreportdate']) {
        if (values[field]) values[field] = String(values[field]).slice(0, 10)
      }
      setActiveFormSession({ kind: 'goal', formName: 'Goals', tableAlias: GOALS_TABLE_ALIAS, rowId: detail.id, recordId: detail.recordId, values })
      setSelectedGoalDetail(null)
      setSelectedHubPages((current) => selectedHub ? { ...current, [selectedHub.id]: 'forms' } : current)
      scrollToTopOfPage()
    } catch (err) {
      setGoalDetailError(String((err as Error)?.message || err))
    } finally {
      setGoalDetailLoading(false)
    }
  }

  function updateGoalValue(field: string, value: string) {
    setActiveFormSession((current) => {
      if (!current || current.kind !== 'goal') return current
      const nextValues = { ...current.values, [field]: value }
      if (field === 'cmps_goalcategory') nextValues.cmps_goal = ''
      if (field === 'cmps_goal' && normalize(value) !== normalize(GOAL_OTHER_OPTION)) nextValues.cmps_othergoal = ''
      if (field === 'cmps_goalstatus' && normalize(value) !== normalize('Complete')) {
        nextValues.cmps_goalcompletiondate = ''
        nextValues.cmps_goaloutcomes = ''
      }
      if (field === 'cmps_goalstatus' && normalize(value) !== normalize('Barrier Identified')) {
        nextValues.cmps_barrieridentified = ''
        nextValues.cmps_plantoaddressbarrier = ''
      }
      return { ...current, values: nextValues }
    })
  }

  function updateHelplineValue(field: string, value: string) {
    setActiveFormSession((current) => {
      if (!current || current.kind !== 'helpline') return current

      const nextValues: HelplinePayload = {
        ...current.values,
        [field]: value,
      }

      const programUsesSvFields = normalize(value) === normalize('SV Helpline')
      if (field === 'cmps_program' && !programUsesSvFields) {
        for (const fieldName of HELPLINE_SV_ONLY_DETAILS_FIELDS) {
          nextValues[fieldName] = ''
        }
      }
      if (field === 'cmps_program' && programUsesSvFields) {
        for (const fieldName of HELPLINE_DV_DETAILS_FIELDS) {
          nextValues[fieldName] = ''
        }
      }

      if (field === 'cmps_abusestatus' && normalize(value) !== normalize('Other')) {
        nextValues.cmps_abusestatusother = ''
      }

      if (field === 'cmps_program' && normalize(value) !== normalize('DVSTOP')) {
        nextValues.cmps_wouldyouliketocompletetheovwlatelifeabusescre = ''
        nextValues.cmps_isthiscallerover50yearsofage = ''
        nextValues.cmps_wasthecallerabusedbyaspousepartnerclosefamily = ''
        nextValues.cmps_hasthecallerrecentlyexperienceddomesticviolen = ''
      }

      if (field === 'cmps_wouldyouliketocompletetheovwlatelifeabusescre' && normalize(value) !== normalize('Yes')) {
        nextValues.cmps_isthiscallerover50yearsofage = ''
        nextValues.cmps_wasthecallerabusedbyaspousepartnerclosefamily = ''
        nextValues.cmps_hasthecallerrecentlyexperienceddomesticviolen = ''
      }

      if (field === 'cmps_isthiscallerover50yearsofage' && normalize(value) !== normalize('Yes')) {
        nextValues.cmps_wasthecallerabusedbyaspousepartnerclosefamily = ''
        nextValues.cmps_hasthecallerrecentlyexperienceddomesticviolen = ''
      }

      if (field === 'cmps_wasthecallerturnedaway' && normalize(value) !== normalize('Yes')) {
        nextValues.cmps_helplineturnawayreason = ''
        nextValues.cmps_helplineturnawayreasonother = ''
      }

      nextValues.cmps_numberofyesanswers = String(computeHelplineNumberOfYesAnswers(nextValues))

      if (field === 'cmps_helplineturnawayreason' && normalize(value) !== normalize('Other')) {
        nextValues.cmps_helplineturnawayreasonother = ''
      }

      if (field === 'cmps_doyouhaveasafealternativeforhousing' && normalize(value) !== normalize('Yes')) {
        nextValues.cmps_ifyeshowlongcanyoustayatthissafelocation = ''
      }

      return {
        ...current,
        values: nextValues,
      }
    })
  }

  function updateHelplineMultiSelectValue(field: string, option: string, checked: boolean) {
    const session = activeFormSession
    if (!session || session.kind !== 'helpline') return

    const current = parseMultiValue(String(session.values[field] || ''))
    const normalizedOption = normalize(option)
    const next = checked
      ? Array.from(new Set([...current, option]))
      : current.filter((entry) => normalize(entry) !== normalizedOption)

    updateHelplineValue(field, next.join(', '))
  }

  function updateShelterScreeningValue(field: string, value: string) {
    setActiveFormSession((current) => {
      if (!current || current.kind !== 'shelter-screening') return current

      const nextValues: ShelterScreeningPayload = {
        ...current.values,
        [field]: value,
      }

      if (field === 'cmps_doyouneedtobringanypetswithyoutoshelter' && normalize(value) !== normalize('Yes')) {
        nextValues.cmps_numberofpets = ''
      }

      if (field === 'cmps_doyouhaveanycurrentorpendinglegalorcustodyiss' && normalize(value) !== normalize('Yes')) {
        nextValues.cmps_legalorcustodyissuenotes = ''
      }

      if (field === 'cmps_isthereanyonewhoneedstoknowyourwhereabouts' && normalize(value) !== normalize('Yes')) {
        nextValues.cmps_ifyespleaseexplain = ''
      }

      if (field === 'cmps_wascallerplacedinshelter' && normalize(value) !== normalize('No')) {
        nextValues.cmps_shelterturnawayreason = ''
        nextValues.cmps_shelterturnawayreasonother = ''
      }

      if (field === 'cmps_shelterturnawayreason' && normalize(value) !== normalize('Other')) {
        nextValues.cmps_shelterturnawayreasonother = ''
      }

      if (field === 'cmps_numberofchildrencomingtotheshelter') {
        const childCount = Math.max(0, Math.min(20, Number.parseInt(String(value || '').trim() || '0', 10) || 0))
        const nextAges = Array.from({ length: childCount }, (_, index) => shelterChildAges[index] || '')
        nextValues.cmps_agesofchildren = nextAges.map((entry) => entry.trim()).filter(Boolean).join(', ')
        setShelterChildAges(nextAges)
      }

      return {
        ...current,
        values: nextValues,
      }
    })
  }

  function updateShelterScreeningChildAge(index: number, value: string) {
    setShelterChildAges((current) => {
      const next = [...current]
      next[index] = value
      updateShelterScreeningValue('cmps_agesofchildren', next.map((entry) => entry.trim()).filter(Boolean).join(', '))
      return next
    })
  }

  function getShelterScreeningFieldLabel(field: string): string {
    return SHELTER_SCREENING_FIELD_DEFINITIONS.find((entry) => entry.field === field)?.label || field
  }

  function isShelterScreeningFieldVisible(field: string, values: ShelterScreeningPayload): boolean {
    const pets = normalize(String(values.cmps_doyouneedtobringanypetswithyoutoshelter || ''))
    const legal = normalize(String(values.cmps_doyouhaveanycurrentorpendinglegalorcustodyiss || ''))
    const whereabouts = normalize(String(values.cmps_isthereanyonewhoneedstoknowyourwhereabouts || ''))
    const placed = normalize(String(values.cmps_wascallerplacedinshelter || ''))
    const turnaway = normalize(String(values.cmps_shelterturnawayreason || ''))
    const accommodations = normalize(String(values.cmps_willyourequireanyspecialaccommodationsuponent || ''))

    if (field === 'cmps_numberofpets') return pets === normalize('Yes')
    if (field === 'cmps_legalorcustodyissuenotes') return legal === normalize('Yes')
    if (field === 'cmps_ifyespleaseexplain') return whereabouts === normalize('Yes')
    if (field === 'cmps_listspecialaccommodations') return accommodations === normalize('Yes')
    if (field === 'cmps_shelterturnawayreason') return placed === normalize('No')
    if (field === 'cmps_shelterturnawayreasonother') return placed === normalize('No') && turnaway === normalize('Other')
    return true
  }

  function validateRequiredShelterScreeningFields(values: ShelterScreeningPayload): string {
    const missing: string[] = []

    const requiredBaseFields = [
      'cmps_screendate',
      'cmps_program',
    ] as const

    for (const fieldName of requiredBaseFields) {
      if (!String(values[fieldName] || '').trim()) {
        missing.push(getShelterScreeningFieldLabel(fieldName))
      }
    }

    if (normalize(String(values.cmps_doyouneedtobringanypetswithyoutoshelter || '')) === normalize('Yes')) {
      if (!String(values.cmps_numberofpets || '').trim()) {
        missing.push(getShelterScreeningFieldLabel('cmps_numberofpets'))
      }
    }

    if (normalize(String(values.cmps_wascallerplacedinshelter || '')) === normalize('No')) {
      if (!String(values.cmps_shelterturnawayreason || '').trim()) {
        missing.push(getShelterScreeningFieldLabel('cmps_shelterturnawayreason'))
      }

      if (normalize(String(values.cmps_shelterturnawayreason || '')) === normalize('Other') && !String(values.cmps_shelterturnawayreasonother || '').trim()) {
        missing.push(getShelterScreeningFieldLabel('cmps_shelterturnawayreasonother'))
      }
    }

    const childCountRaw = String(values.cmps_numberofchildrencomingtotheshelter || '').trim()
    const childCount = Math.max(0, Number.parseInt(childCountRaw || '0', 10) || 0)
    if (childCount > 0) {
      const entered = shelterChildAges.map((entry) => entry.trim()).filter(Boolean)
      if (entered.length < childCount) {
        missing.push(getShelterScreeningFieldLabel('cmps_agesofchildren'))
      }
    }

    if (missing.length === 0) return ''
    return `Please complete required field(s): ${missing.join(', ')}`
  }

  function getHouseholdFieldLabel(field: string): string {
    return HOUSEHOLD_FIELD_DEFINITIONS.find((entry) => entry.field === field)?.label || field
  }

  function getEventFieldLabel(field: string): string {
    return EVENT_FIELD_DEFINITIONS.find((entry) => entry.field === field)?.label || field
  }

  function getEventNumber(values: EventPayload, field: string): number {
    const parsed = Number.parseInt(String(values[field] || '').trim(), 10)
    return Number.isFinite(parsed) && parsed >= 0 ? parsed : 0
  }

  function getEventCalculatedTotals(values: EventPayload): Record<string, string> {
    return {
      cmps_totalgenderattendance: String(getEventNumber(values, 'cmps_totalfemaleattendance') + getEventNumber(values, 'cmps_totalmaleattendance') + getEventNumber(values, 'cmps_totalothergenderattendance') + getEventNumber(values, 'cmps_totalunknownnotreportedgenderattendance')),
      cmps_totalattendancebyagerange: String(['cmps_under18', 'cmps_18to19', 'cmps_20to29', 'cmps_30to39', 'cmps_40to49', 'cmps_50to59', 'cmps_60to69', 'cmps_70plus', 'cmps_ageunknownnotreported'].reduce((total, field) => total + getEventNumber(values, field), 0)),
      cmps_totalattendancebyrace: String(['cmps_blackafricanamerican', 'cmps_asian', 'cmps_white', 'cmps_multiracial', 'cmps_otherrace', 'cmps_raceunknownnotreported'].reduce((total, field) => total + getEventNumber(values, field), 0)),
      cmps_totalattendancebyethnicity: String(['cmps_hispanic', 'cmps_nonhispanic', 'cmps_ethnicityunknownnotreported'].reduce((total, field) => total + getEventNumber(values, field), 0)),
    }
  }

  function updateEventValue(field: string, value: string) {
    setActiveFormSession((current) => {
      if (!current || current.kind !== 'event') return current
      const values = { ...current.values, [field]: value }
      return { ...current, values: { ...values, ...getEventCalculatedTotals(values) } }
    })
  }

  function updateEventUploadFile(slot: 0 | 1, file: File | null) {
    setEventUploadFiles((current) => {
      const next: [File | null, File | null] = [...current]
      next[slot] = file
      return next
    })
  }

  function pendingFormFileUploadKey(session: HubFormSession, field: string): string {
    return `${session.kind}:${session.recordId || session.rowId || 'new'}:${field}`
  }

  function getPendingFormFileUpload(session: HubFormSession, field: string): File | null {
    return pendingFormFileUploads[pendingFormFileUploadKey(session, field)] || null
  }

  function updatePendingFormFileUpload(session: HubFormSession, field: string, file: File | null) {
    const key = pendingFormFileUploadKey(session, field)
    setPendingFormFileUploads((current) => ({ ...current, [key]: file }))
  }

  async function createPendingCompassFile(session: HubFormSession, file: File): Promise<string> {
    if (isUserPreview) throw new Error(USER_PREVIEW_READ_ONLY_MESSAGE)
    const relatedRecordId = String(session.recordId || session.values.cmps_recordid || '').trim()
    let clientProfileRowId = ''
    const openedFromClientProfile = formReturnState?.appNav === 'clients'
      && formReturnState.page === 'search'
      && !!selectedDetailRecord
    if (openedFromClientProfile && selectedDetailRecord) {
      const selectedClientId = String(selectedDetailRecord.id || '').trim()
      if (isGuidText(selectedClientId)) {
        clientProfileRowId = normalizeGuidText(selectedClientId)
      } else if (selectedDetailRecord.recordId) {
        clientProfileRowId = await resolveClientProfileRowIdByRecordId(selectedDetailRecord.recordId)
      }
    }

    const fileRecordId = await generateAppRecordId(COMPASS_FILES_TABLE_ALIAS, 'FILE')
    const createdFile = await createCompassFileRecord({
      file,
      recordId: fileRecordId,
      relatedRecordId,
      clientProfileRowId,
      savedBy: String(user.name || user.email || user.id || ''),
    })
    return createdFile.id
  }

  function validateRequiredEventFields(values: EventPayload): string {
    const missing: string[] = []
    if (!String(values.cmps_program || '').trim()) missing.push(getEventFieldLabel('cmps_program'))
    if (!String(values.cmps_eventdate || '').trim()) missing.push(getEventFieldLabel('cmps_eventdate'))
    if (!String(values.cmps_eventtitle || '').trim()) missing.push(getEventFieldLabel('cmps_eventtitle'))

    const program = String(values.cmps_program || '').trim()
    if (program === 'REACH Center' && !String(values.cmps_numberofmaterialshandedout || '').trim()) missing.push(getEventFieldLabel('cmps_numberofmaterialshandedout'))
    if (['Autumn House', 'Faith House', 'CAAFA Shelter', 'DVSTOP', 'DV Outreach'].includes(program)) {
      for (const field of ['cmps_totalfemaleattendance', 'cmps_totalmaleattendance', 'cmps_totaladultattendance', 'cmps_totalyouthattendance']) {
        if (!String(values[field] || '').trim()) missing.push(getEventFieldLabel(field))
      }
    }

    const calculated = getEventCalculatedTotals(values)
    if (String(values.cmps_totalattendance || '').trim()) {
      for (const field of ['cmps_totalgenderattendance', 'cmps_totalattendancebyagerange', 'cmps_totalattendancebyrace', 'cmps_totalattendancebyethnicity']) {
        if (calculated[field] !== String(values.cmps_totalattendance).trim()) missing.push(`${getEventFieldLabel(field)} must equal ${getEventFieldLabel('cmps_totalattendance')}`)
      }
    }
    return missing.length ? `Please complete or correct required field(s): ${missing.join(', ')}` : ''
  }

  function validateRequiredHouseholdFields(values: HouseholdPayload, members: HouseholdMemberDraft[], allowNoActiveMembers = false): string {
    const missing: string[] = []

    const requiredFields = ['cmps_householdincludes'] as const

    for (const fieldName of requiredFields) {
      if (!String(values[fieldName] || '').trim()) {
        missing.push(getHouseholdFieldLabel(fieldName))
      }
    }

    const selectedMembers = members.filter((member) => member.selected)
    if (selectedMembers.length === 0 && !allowNoActiveMembers) {
      missing.push('Members of Household')
    }

    for (const member of selectedMembers) {
      if (normalize(member.status) === normalize('Inactive')) continue

      if (!String(member.relationshipToHoh || '').trim()) {
        missing.push(`Relationship to HOH for ${member.clientName || member.clientRecordId || 'member'}`)
        continue
      }

      if (normalize(member.relationshipToHoh) === normalize('Other') && !String(member.relationshipToHohOther || '').trim()) {
        missing.push(`Relationship to HOH - Other for ${member.clientName || member.clientRecordId || 'member'}`)
      }
    }

    if (missing.length === 0) return ''
    return `Please complete required field(s): ${missing.join(', ')}`
  }

  function getServicesFieldLabel(field: string): string {
    return SERVICES_FIELD_DEFINITIONS.find((entry) => entry.field === field)?.label || field
  }

  function getHelplineFieldLabel(field: string): string {
    return HELPLINE_FIELD_DEFINITIONS.find((entry) => entry.field === field)?.label || field
  }

  function computeHelplineNumberOfYesAnswers(values: HelplinePayload): number {
    const trackedFields = [
      'cmps_hasphysicalviolenceincreasedrecentlyforyouora',
      'cmps_doyoubelieveyourpartneriscapableofkillingyou',
      'cmps_doesyourpartnerhaveaweaponoraccesstoaweapon',
      'cmps_hasyourpartnerevertriedtochokeorsuffocateyou',
      'cmps_isyourpartnerviolentlycontrollingandconstantl',
      'cmps_havetheyeverbeenviolentwithyouwhileyouwerepre',
    ] as const

    return trackedFields.reduce((count, fieldName) => {
      const raw = String(values[fieldName] || '').trim()
      return normalize(raw) === normalize('Yes') ? count + 1 : count
    }, 0)
  }

  function isHelplineFieldVisible(field: string, values: HelplinePayload): boolean {
    const shelterscreening = normalize(String(values.cmps_wouldyouliketobegintheshelterscreeningprocess || ''))
    const turnedAway = normalize(String(values.cmps_wasthecallerturnedaway || ''))
    const safeAlternative = normalize(String(values.cmps_doyouhaveasafealternativeforhousing || ''))
    const program = normalize(String(values.cmps_program || ''))
    const ovwLateLife = normalize(String(values.cmps_wouldyouliketocompletetheovwlatelifeabusescre || ''))
    const hasProgram = Boolean(program)
    const programUsesSvFields = program === normalize('SV Helpline')

    if (HELPLINE_SHARED_DETAILS_FIELDS.has(field) || HELPLINE_SHARED_RESPONSE_FIELDS.has(field)) {
      if (!hasProgram) return false
      if (field === 'cmps_abusestatusother') {
        return normalize(String(values.cmps_abusestatus || '')) === normalize('Other')
      }
      return true
    }

    if (HELPLINE_SV_ONLY_DETAILS_FIELDS.has(field)) {
      if (!programUsesSvFields) return false
      return true
    }

    if (HELPLINE_DV_DETAILS_FIELDS.has(field) && (!hasProgram || programUsesSvFields)) return false

    if (field === 'cmps_wouldyouliketocompletetheovwlatelifeabusescre') {
      return program === normalize('DVSTOP')
    }

    if (HELPLINE_OVW_LATE_LIFE_FIELDS.includes(field as any)) {
      if (program !== normalize('DVSTOP') || ovwLateLife !== normalize('Yes')) return false
      if (field === 'cmps_isthiscallerover50yearsofage') return true
      return normalize(String(values.cmps_isthiscallerover50yearsofage || '')) === normalize('Yes')
    }

    if (field === 'cmps_helplineturnawayreason') {
      return turnedAway === normalize('Yes')
    }

    if (field === 'cmps_helplineturnawayreasonother') {
      return turnedAway === normalize('Yes') && normalize(String(values.cmps_helplineturnawayreason || '')) === normalize('Other')
    }

    if (field === 'cmps_ifyeshowlongcanyoustayatthissafelocation') {
      return hasProgram && !programUsesSvFields && shelterscreening === normalize('Yes') && safeAlternative === normalize('Yes')
    }

    if (HELPLINE_SAFETY_ASSESSMENT_FIELDS.includes(field as any)) {
      return hasProgram && !programUsesSvFields && shelterscreening === normalize('Yes')
    }

    if (HELPLINE_CURRENT_LIVING_SITUATION_FIELDS.includes(field as any)) {
      return hasProgram && !programUsesSvFields && shelterscreening === normalize('Yes')
    }

    return true
  }

  function validateRequiredHelplineFields(values: HelplinePayload): string {
    const missing: string[] = []
    const program = normalize(String(values.cmps_program || ''))
    const ovwLateLife = normalize(String(values.cmps_wouldyouliketocompletetheovwlatelifeabusescre || ''))
    const programUsesSvFields = program === normalize('SV Helpline')

    for (const fieldName of HELPLINE_ALWAYS_REQUIRED_FIELDS) {
      if (!String(values[fieldName] || '').trim()) missing.push(getHelplineFieldLabel(fieldName))
    }

    if (program && !programUsesSvFields) {
      HELPLINE_FIELD_DEFINITIONS
        .filter((field) => getHelplineFormSection(field.field, values) === 'DV Helpline Details')
        .filter((field) => field.input !== 'readonly' && !HELPLINE_OPTIONAL_DV_DETAILS_FIELDS.has(field.field))
        .filter((field) => isHelplineFieldVisible(field.field, values))
        .forEach((field) => {
          if (!String(values[field.field] || '').trim()) missing.push(field.label)
        })
    }

    if (programUsesSvFields) {
      for (const fieldName of HELPLINE_SV_REQUIRED_FIELDS) {
        if (!isHelplineFieldVisible(fieldName, values)) continue
        if (fieldName === 'cmps_abusestatusother' && normalize(String(values.cmps_abusestatus || '')) !== normalize('Other')) continue
        if (!String(values[fieldName] || '').trim()) {
          missing.push(getHelplineFieldLabel(fieldName))
        }
      }
    }

    if (program === normalize('DVSTOP') && !String(values.cmps_wouldyouliketocompletetheovwlatelifeabusescre || '').trim()) {
      missing.push(getHelplineFieldLabel('cmps_wouldyouliketocompletetheovwlatelifeabusescre'))
    }

    if (program === normalize('DVSTOP') && ovwLateLife === normalize('Yes')) {
      for (const fieldName of HELPLINE_OVW_LATE_LIFE_FIELDS) {
        if (isHelplineFieldVisible(fieldName, values) && !String(values[fieldName] || '').trim()) missing.push(getHelplineFieldLabel(fieldName))
      }
    }

    HELPLINE_FIELD_DEFINITIONS
      .filter((field) => getHelplineFormSection(field.field, values) === 'Safety Assessment' && field.input !== 'readonly')
      .filter((field) => isHelplineFieldVisible(field.field, values))
      .forEach((field) => {
        if (!String(values[field.field] || '').trim()) missing.push(field.label)
      })

    const uniqueMissing = Array.from(new Set(missing))
    if (uniqueMissing.length === 0) return ''
    return `Please complete required field(s): ${uniqueMissing.join(', ')}`
  }

  function getRequiredServicesMessage(session: ServicesFormSession): string {
    const missing = Array.from(getActiveRequiredFields(session).entries())
      .filter(([field]) => !String(session.values[field] || '').trim())
      .map(([, label]) => label)
    return missing.length ? `Please complete required field(s): ${missing.join(', ')}` : ''
  }

  function getActiveRequiredFields(session: HubFormSession): Map<string, string> {
    const required = new Map<string, string>()
    const add = (field: string, label: string) => required.set(field, label)

    if (session.kind === 'client-profile') {
      const contextValues = getClientProfileContextValues(session.values)
      CLIENT_PROFILE_FIELDS
        .filter((fieldDef) => fieldDef.field !== 'cmps_middlename')
        .filter((fieldDef) => isClientProfileFieldVisible(fieldDef, contextValues))
        .filter((fieldDef) => fieldDef.requiredByDefault || fieldDef.requiredWhen?.(contextValues))
        .forEach((fieldDef) => add(fieldDef.field, fieldDef.label))
    } else if (session.kind === 'program-enrollment') {
      const values = session.values
      const program = normalize(String(values.cmps_program || ''))
      const classifications = parseMultiValue(String(values.cmps_clientspecialclassification1 || ''))
      const addProgramField = (field: string) => add(field, PROGRAM_ENROLLMENT_FIELDS.find((entry) => entry.field === field)?.label || field)
      PROGRAM_ENROLLMENT_FIELDS
        .filter((fieldDef) => fieldDef.required)
        .filter((fieldDef) => isProgramEnrollmentFieldVisible(fieldDef, values))
        .forEach((fieldDef) => add(fieldDef.field, fieldDef.label))
      if (normalize(String(values.cmps_enrollmentstatus || '')) === normalize('Turnaway')) addProgramField('cmps_reasonturnedaway')
      if (PROGRAMS_WITH_SHELTER_QUESTIONS.has(program)) addProgramField('cmps_isthisclientbringinganypetstoshelter1')
      if (normalize(String(values.cmps_isthisclientbringinganypetstoshelter1 || '')) === normalize('Yes')) addProgramField('cmps_numberofpets')
      if (isOvwLateLifeEnrollmentFunder(values.cmps_funder, activeFunderOptions)) addProgramField('cmps_ovwclientservedstatus')
      if (classifications.some((entry) => SPECIAL_CLASSIFICATION_DISABILITY_TAGS.has(normalize(entry)))) addProgramField('cmps_didthisclientreceiveanydisabilityaccommo1')
    } else if (session.kind === 'services') {
      SERVICES_FIELD_DEFINITIONS.forEach((field) => {
        if (!field.required) return
        if (isServicesFieldVisible(field.field, session.values as Record<string, string>, programEnrollmentsForClient)) {
          add(field.field, field.label)
        }
      })
      if (isReachCenterProgramEnrollment(session.values as Record<string, string>, programEnrollmentsForClient)) {
        add('cmps_minutes', getServicesFieldLabel('cmps_minutes'))
        add('cmps_meetingmode', getServicesFieldLabel('cmps_meetingmode'))
      }
      if (normalize(String(session.values.cmps_funder || '')) === normalize('VOCA')) {
        add('cmps_directservicecategories', getServicesFieldLabel('cmps_directservicecategories'))
        const relatedField = VOCA_DIRECT_CATEGORY_TO_FIELD[normalize(String(session.values.cmps_directservicecategories || ''))]
        if (relatedField) add(relatedField, getServicesFieldLabel(relatedField))
      }
      if (normalize(String(session.values.cmps_service || '')) === normalize('Other')) add('cmps_serviceother', 'Service - Other')
      if (normalize(String(session.values.cmps_servicecategory || '')) === normalize('Emotional Wellness & Healing')
        && normalize(String(session.values.cmps_service || '')) === normalize('Support Groups')) {
        add('cmps_additionalservicedetail', 'Additional Service Detail')
      }
    } else if (session.kind === 'helpline') {
      const program = normalize(String(session.values.cmps_program || ''))
      HELPLINE_ALWAYS_REQUIRED_FIELDS.forEach((field) => add(field, getHelplineFieldLabel(field)))
      if (program && program !== normalize('SV Helpline')) {
        HELPLINE_FIELD_DEFINITIONS
          .filter((field) => getHelplineFormSection(field.field, session.values) === 'DV Helpline Details')
          .filter((field) => field.input !== 'readonly' && !HELPLINE_OPTIONAL_DV_DETAILS_FIELDS.has(field.field))
          .filter((field) => isHelplineFieldVisible(field.field, session.values))
          .forEach((field) => add(field.field, field.label))
      }
      if (program === normalize('SV Helpline')) {
        HELPLINE_SV_REQUIRED_FIELDS.forEach((field) => {
          if (!isHelplineFieldVisible(field, session.values)) return
          if (field !== 'cmps_abusestatusother' || normalize(String(session.values.cmps_abusestatus || '')) === normalize('Other')) add(field, getHelplineFieldLabel(field))
        })
      }
      if (program === normalize('DVSTOP')) {
        add('cmps_wouldyouliketocompletetheovwlatelifeabusescre', getHelplineFieldLabel('cmps_wouldyouliketocompletetheovwlatelifeabusescre'))
        if (normalize(String(session.values.cmps_wouldyouliketocompletetheovwlatelifeabusescre || '')) === normalize('Yes')) {
          HELPLINE_OVW_LATE_LIFE_FIELDS.filter((field) => isHelplineFieldVisible(field, session.values)).forEach((field) => add(field, getHelplineFieldLabel(field)))
        }
      }
      HELPLINE_FIELD_DEFINITIONS
        .filter((field) => getHelplineFormSection(field.field, session.values) === 'Safety Assessment' && field.input !== 'readonly')
        .filter((field) => isHelplineFieldVisible(field.field, session.values))
        .forEach((field) => add(field.field, field.label))
    } else if (session.kind === 'shelter-screening') {
      ;['cmps_screendate', 'cmps_program'].forEach((field) => add(field, getShelterScreeningFieldLabel(field)))
      if (normalize(String(session.values.cmps_doyouneedtobringanypetswithyoutoshelter || '')) === normalize('Yes')) add('cmps_numberofpets', getShelterScreeningFieldLabel('cmps_numberofpets'))
      if (Number.parseInt(String(session.values.cmps_numberofchildrencomingtotheshelter || '0'), 10) > 0) add('cmps_agesofchildren', getShelterScreeningFieldLabel('cmps_agesofchildren'))
      if (normalize(String(session.values.cmps_wascallerplacedinshelter || '')) === normalize('No')) {
        add('cmps_shelterturnawayreason', getShelterScreeningFieldLabel('cmps_shelterturnawayreason'))
        if (normalize(String(session.values.cmps_shelterturnawayreason || '')) === normalize('Other')) add('cmps_shelterturnawayreasonother', getShelterScreeningFieldLabel('cmps_shelterturnawayreasonother'))
      }
    } else if (session.kind === 'event') {
      ;['cmps_program', 'cmps_eventdate', 'cmps_eventtitle'].forEach((field) => add(field, getEventFieldLabel(field)))
      if (String(session.values.cmps_program || '') === 'REACH Center') add('cmps_numberofmaterialshandedout', getEventFieldLabel('cmps_numberofmaterialshandedout'))
      if (['Autumn House', 'Faith House', 'CAAFA Shelter', 'DVSTOP', 'DV Outreach'].includes(String(session.values.cmps_program || ''))) {
        ;['cmps_totalfemaleattendance', 'cmps_totalmaleattendance', 'cmps_totaladultattendance', 'cmps_totalyouthattendance'].forEach((field) => add(field, getEventFieldLabel(field)))
      }
    } else if (session.kind === 'household') {
      add('cmps_householdincludes', getHouseholdFieldLabel('cmps_householdincludes'))
      add('members-of-household', 'Members of Household')
    } else if (session.kind === 'release-of-information') {
      const methods = parseMultiValue(String(session.values.cmps_method || '')).map(normalize)
      const programs = parseMultiValue(String(session.values.cmps_programs1 || '')).map(normalize)
      if (methods.includes(normalize('By E-mail'))) add('cmps_email', 'E-mail')
      if (methods.includes(normalize('By Mail'))) add('cmps_address', 'Address')
      if (methods.includes(normalize('By Fax'))) add('cmps_fax', 'Fax')
      if (programs.includes(normalize('Other'))) add('cmps_programsother', 'Programs - Other')
    } else if (session.kind === 'voca-form') {
      if (!session.rowId || !session.values.cmps_cpid) add('cmps_peid', 'Program Enrollment')
    } else if (session.kind === 'goal') {
      GOAL_FIELDS.filter((field) => field.required).forEach((field) => add(field.field, field.label))
      if (normalize(String(session.values.cmps_goal || '')) === normalize(GOAL_OTHER_OPTION)) add('cmps_othergoal', 'Other Goal')
      if (normalize(String(session.values.cmps_goalstatus || '')) === normalize('Complete')) {
        add('cmps_goalcompletiondate', 'Goal Completion Date')
        add('cmps_goaloutcomes', 'Goal Outcomes')
      }
      if (normalize(String(session.values.cmps_goalstatus || '')) === normalize('Barrier Identified')) {
        add('cmps_barrieridentified', 'Barrier Identified')
        add('cmps_plantoaddressbarrier', 'Plan to Address Barrier')
      }
    } else if (session.kind === 'adult-assessment') {
      ADULT_ASSESSMENT_FIELDS.forEach((field) => {
        if (!field.required) return
        const visible = !field.visibleWhen || parseMultiValue(String(session.values[field.visibleWhen.field] || '')).some((item) => field.visibleWhen?.values.some((expected) => normalize(item) === normalize(expected)))
        if (visible) add(field.field, field.label)
      })
    } else if (session.kind === 'child-safety-plan') {
      CHILD_SAFETY_PLAN_FIELDS.forEach((field) => {
        if (field.required) add(field.field, field.label)
      })
    } else if (session.kind === 'health-wellness') {
      HEALTH_WELLNESS_FIELDS.forEach((field) => {
        if (!field.required) return
        if (field.section === 'Seizure Information' && normalize(String(session.values.cmps_doyouexperienceseizures || '')) !== 'yes') return
        if (field.section === 'Emergency Contact Information' && !parseMultiValue(String(session.values.cmps_seizureemergencyprotocol1 || '')).some((item) => normalize(item) === normalize('Notify emergency contact'))) return
        const visible = !field.visibleWhen || parseMultiValue(String(session.values[field.visibleWhen.field] || '')).some((item) => field.visibleWhen?.values.some((expected) => normalize(item) === normalize(expected)))
        if (visible) add(field.field, field.label)
      })
    } else if (session.kind === 'focus-plan') {
      FOCUS_PLAN_FIELDS.forEach((field) => {
        if (!field.required || field.input === 'goals') return
        const visible = !field.visibleWhen || parseMultiValue(String(session.values[field.visibleWhen.field] || '')).some((item) => field.visibleWhen?.values.some((expected) => normalize(item) === normalize(expected)))
        if (visible) add(field.field, field.label)
      })
    } else if (session.kind === 'initial-safety-plan') {
      INITIAL_SAFETY_PLAN_FIELDS.forEach((field) => {
        if (field.required) add(field.field, field.label)
      })
    } else if (session.kind === 'acknowledgement-and-consent') {
      ACKNOWLEDGEMENT_AND_CONSENT_FIELDS.forEach((field) => {
        if (field.required) add(field.field, field.label)
      })
      if (normalize(String(session.values.cmps_doestheresidentrefusetosign || '')) === normalize('No')) {
        ACKNOWLEDGEMENT_AND_CONSENT_FIELDS
          .filter((field) => field.section === 'Acknowledgments' && field.input !== 'html')
          .forEach((field) => add(field.field, field.label))
      }
    } else if (session.kind === 'animal-agreement') {
      ANIMAL_AGREEMENT_FIELDS.forEach((field) => {
        if (field.required) add(field.field, field.label)
      })
    } else if (session.kind === 'child-assessment') {
      CHILD_ASSESSMENT_FIELDS.forEach((field) => {
        if (field.required) add(field.field, field.label)
      })
    } else if (session.kind === 'child-shelter-intake') {
      CHILD_SHELTER_INTAKE_FIELDS.forEach((field) => {
        if (field.required) add(field.field, field.label)
      })
    } else if (session.kind === 'employment-and-benefits') {
      EMPLOYMENT_AND_BENEFITS_FIELDS.forEach((field) => {
        if (field.required) add(field.field, field.label)
      })
    } else if (session.kind === 'financial-assistance') {
      FINANCIAL_ASSISTANCE_FIELDS.forEach((field) => {
        if (field.required) add(field.field, field.label)
      })
    } else if (session.kind === 'medical-consent-form') {
      MEDICAL_CONSENT_FORM_FIELDS.forEach((field) => {
        if (field.required) add(field.field, field.label)
      })
    } else if (session.kind === 'person-you-are-fleeing-profile') {
      PERSON_YOU_ARE_FLEEING_PROFILE_FIELDS.forEach((field) => {
        if (field.required) add(field.field, field.label)
      })
    } else if (session.kind === 'electronic-document') {
      ELECTRONIC_DOCUMENT_FIELDS.forEach((field) => {
        if (field.required) add(field.field, field.label)
      })
    } else if (session.kind === 'terms-and-conditions-of-service-animals') {
      TERMS_AND_CONDITIONS_OF_SERVICE_ANIMALS_FIELDS.forEach((field) => {
        if (field.required) add(field.field, field.label)
      })
    } else if (session.kind === 'contract') {
      CONTRACT_FIELDS.forEach((field) => {
        if (field.required) add(field.field, field.label)
      })
    } else if (session.kind === 'pet-companion-intake') {
      PET_COMPANION_INTAKE_FIELDS.forEach((field) => {
        if (!field.required) return
        const visible = !field.visibleWhen || field.visibleWhen.values.some((expected) => normalize(String(session.values[field.visibleWhen!.field] || '')) === normalize(expected))
        if (visible) add(field.field, field.label)
      })
    } else if (session.kind === 'funder-transaction') {
      FUNDER_TRANSACTION_FIELDS.forEach((field) => {
        if (field.required) add(field.field, field.label)
      })
    } else if (session.kind === 'shelter-program-guidelines') {
      SHELTER_PROGRAM_GUIDELINES_FIELDS.forEach((field) => {
        if (field.required) add(field.field, field.label)
      })
    }

    return required
  }

  function getFocusPlanRequiredMessage(session: FocusPlanFormSession): string {
    const values = session.values
    const goalCount = getFocusPlanGoalCount(values)
    const needs = parseFocusGoalColumn(values.cmps_identifiedneeds).map((item) => item.trim())
    const resources = parseFocusGoalColumn(values.cmps_resourcesgivenandfrequencyseenbyspecialists).map((item) => item.trim())
    const statuses = parseFocusGoalColumn(values.cmps_goalstatuses).map((item) => item.trim())
    const completionDates = parseFocusGoalColumn(values.cmps_goalcompletiondates).map((item) => item.trim())
    const missing = Array.from(getActiveRequiredFields(session).entries())
      .filter(([field]) => !String(values[field] || '').trim())
      .map(([, label]) => label)

    if (!needs[0]) missing.push('Identified Need 1')
    if (!resources[0]) missing.push('Resources Given and Frequency Seen by Specialists 1')
    if (!statuses[0]) missing.push('Goal Status 1')
    for (let index = 0; index < goalCount; index += 1) {
      if (statuses[index] === 'Complete' && !completionDates[index]) missing.push(`Goal Completion Date ${index + 1}`)
    }

    const allGoalsComplete = statuses.slice(0, goalCount).length === goalCount
      && statuses.slice(0, goalCount).every((status) => status === 'Complete')
    if (allGoalsComplete && !String(values.cmps_focusplancompletiondate || '').trim()) missing.push('FOCUS Plan Completion Date')

    return missing.length ? `Please complete required field(s): ${Array.from(new Set(missing)).join(', ')}` : ''
  }

  function getLiveRequiredMessage(session: HubFormSession): string {
    if (session.kind === 'client-profile') return validateRequiredClientProfileFields(session.values)
    if (session.kind === 'program-enrollment') return validateProgramEnrollment(session.values as Record<string, string>)
    if (session.kind === 'services') return getRequiredServicesMessage(session)
    if (session.kind === 'helpline') return validateRequiredHelplineFields(session.values)
    if (session.kind === 'shelter-screening') return validateRequiredShelterScreeningFields(session.values)
    if (session.kind === 'event') return validateRequiredEventFields(session.values)
    if (session.kind === 'household') return validateRequiredHouseholdFields(session.values, householdMembersDraft, !!session.rowId)
    if (session.kind === 'voca-form') {
      return String(session.values.cmps_peid || '').trim() || session.rowId && session.values.cmps_cpid ? '' : 'Please complete required field(s): Program Enrollment'
    }
    if (session.kind === 'release-of-information') {
      const required = getActiveRequiredFields(session)
      const missing = Array.from(required.entries()).filter(([field]) => !String(session.values[field] || '').trim()).map(([, label]) => label)
      return missing.length ? `Please complete required field(s): ${missing.join(', ')}` : ''
    }
    if (session.kind === 'goal') {
      const required = getActiveRequiredFields(session)
      const missing = Array.from(required.entries()).filter(([field]) => !String(session.values[field] || '').trim()).map(([, label]) => label)
      return missing.length ? `Please complete required field(s): ${missing.join(', ')}` : ''
    }
    if (session.kind === 'adult-assessment' || session.kind === 'child-assessment' || session.kind === 'child-shelter-intake' || session.kind === 'child-safety-plan' || session.kind === 'contract' || session.kind === 'pet-companion-intake' || session.kind === 'funder-transaction' || session.kind === 'shelter-program-guidelines' || session.kind === 'employment-and-benefits' || session.kind === 'financial-assistance' || session.kind === 'medical-consent-form' || session.kind === 'person-you-are-fleeing-profile' || session.kind === 'electronic-document' || session.kind === 'terms-and-conditions-of-service-animals' || session.kind === 'health-wellness' || session.kind === 'initial-safety-plan' || session.kind === 'acknowledgement-and-consent' || session.kind === 'animal-agreement') {
      const required = getActiveRequiredFields(session)
      const missing = Array.from(required.entries()).filter(([field]) => (
        !String(session.values[field] || '').trim()
        && !(session.kind === 'electronic-document' && field === 'cmps_fileid1' && getPendingFormFileUpload(session, field))
      )).map(([, label]) => label)
      return missing.length ? `Please complete required field(s): ${missing.join(', ')}` : ''
    }
    if (session.kind === 'focus-plan') return getFocusPlanRequiredMessage(session)
    return ''
  }

  async function saveActiveForm() {
    if (isUserPreview) { setActiveFormError(USER_PREVIEW_READ_ONLY_MESSAGE); return }
    const sourceSession = activeFormSession
    if (!sourceSession || formSaveInFlight.current) return
    const currentUserName = String(user.name || user.email || user.id || '').trim()
    if (!currentUserName) { setActiveFormError('Your signed-in identity could not be loaded. Please sign in again before saving.'); return }
    const draftAtSave = { ...sourceSession.values }
    const session = {
      ...sourceSession,
      values: withRecordAudit(sourceSession.values, currentUserName, !!sourceSession.rowId),
    } as HubFormSession

    formSaveInFlight.current = true
    setActiveFormSaving(true)
    setActiveFormError('')
    setHubActionStatus('')

    let baseSaved = false
    let relatedSaveWarning = ''
    const isNew = !sourceSession.rowId
    const result = (status: RecordSaveResult['status'], details = ''): RecordSaveResult => ({
      status, formName: session.formName, formKind: session.kind, recordId: session.recordId || session.rowId,
      rowId: session.rowId, isNew, details, ...savedFormClientTarget(session, programEnrollmentsForClient),
    })
    const showFormSaveError = (details: string) => {
      setActiveFormError(details)
      setRecordSaveResult(result('failed', details))
    }
    const updateSavingSession = (update: (current: HubFormSession | null) => HubFormSession | null) => {
      setActiveFormSession((current) => {
        if (!current || current.kind !== sourceSession.kind || ![sourceSession.recordId, session.recordId].includes(current.recordId)) return current
        return update(current)
      })
    }
    const retainValues = (postedValues: Record<string, string | undefined>) => {
      Object.assign(session.values, postedValues)
      updateSavingSession((current) => current?.kind === session.kind && (current.recordId === sourceSession.recordId || current.recordId === session.recordId) ? {
        ...current, rowId: session.rowId, recordId: session.recordId,
        values: { ...current.values, ...Object.fromEntries(Object.entries(postedValues).filter(([field]) => current.values[field] === draftAtSave[field])), ...(session.recordId ? { cmps_recordid: session.recordId } : {}) },
      } as HubFormSession : current)
    }
    const retainCreatedForm = async (created: { id: string; recordId?: string } | string, postedValues: Record<string, string | undefined>) => {
      baseSaved = true
      const identity = typeof created === 'string' ? { id: created } : created
      session.recordId = identity.recordId || session.recordId || String(postedValues.cmps_recordid || '')
      session.rowId = identity.id || ''
      retainValues(postedValues)
      if (!session.rowId) {
        pendingFormSaveConfirmation.current = { kind: session.kind, tableAlias: session.tableAlias, recordId: session.recordId }
        session.rowId = await confirmSavedRecordId(session.tableAlias, session.recordId)
      }
      pendingFormSaveConfirmation.current = null
      retainValues(postedValues)
      return { id: session.rowId, recordId: session.recordId }
    }
    const retainUpdatedForm = (_updated: void, postedValues: Record<string, string | undefined>, rowId: string) => {
      baseSaved = true
      session.rowId = rowId
      retainValues(postedValues)
    }
    const reportSavedForm = () => {
      setRecordSaveResult(result(relatedSaveWarning ? 'partial' : 'saved', relatedSaveWarning))
      setClientLookupRefreshSignal((current) => current + 1)
    }

    try {
      if (isNew && !canCreateForm(session.formName)) {
        throw new Error(`You do not have Create permission for ${session.formName} in this program.`)
      }
      if (!isNew && !canAccessClientFormAction(session.formName, 'edit')) {
        throw new Error(`You do not have Edit permission for ${session.formName} in this program.`)
      }
      const pending = pendingFormSaveConfirmation.current
      if (pending && pending.kind === session.kind && pending.recordId === session.recordId) {
        session.rowId = await confirmSavedRecordId(pending.tableAlias, pending.recordId)
        if (session.kind === 'client-profile') pendingInitialHouseholdSaves.current.add(session.rowId)
        pendingFormSaveConfirmation.current = null
        retainValues(session.values)
      }
      if (!session.rowId && !String(session.recordId || '').trim()) {
        showFormSaveError(`The ${session.formName} record ID is still being prepared. Please try again shortly; do not submit a second form.`)
        return
      }
      if (!session.rowId) session.values.cmps_recordid = session.recordId
      if (session.kind === 'services') {
        const payload = Object.entries(session.values).reduce<ServicesPayload>((accumulator, [field, value]) => {
          accumulator[field as keyof ServicesPayload] = value
          return accumulator
        }, {})

        const validationMessage = getRequiredServicesMessage({ ...session, values: payload })
        if (validationMessage) {
          showFormSaveError(validationMessage)
          return
        }

        if (session.rowId) {
          await retainUpdatedForm(await updateServicesResponse(session.rowId, payload), payload, session.rowId)
          setHubActionStatus(`Saved Services response ${session.recordId || session.rowId}.`)
          reportSavedForm()
          return
        }

        const created = await retainCreatedForm(await createServicesResponse(payload), payload)
        setHubActionStatus(
          created.id
            ? `Created and saved Services response ${created.recordId}.`
            : `Services ${created.recordId} was submitted, but the save could not be confirmed. Please try again.`,
        )
        reportSavedForm()
        return
      }

      if (session.kind === 'bed-enrollment') {
        const payload = Object.entries(session.values).reduce<BedEnrollmentPayload>((accumulator, [field, value]) => {
          if (field === 'cmps_selectedbeds') return accumulator
          accumulator[field as keyof BedEnrollmentPayload] = value
          return accumulator
        }, {})
        const selectedBedIds = parseMultiValue(String(session.values.cmps_selectedbeds || ''))
        const programEnrollmentId = String(payload.cmps_programenrollment || '').trim()
        const programEnrollment = programEnrollmentsForClient.find((row) => normalize(row.id) === normalize(programEnrollmentId))
        const clientProfileId = String(
          selectedDetailRecord?.id
          || programEnrollment?.clientRowId
          || selectedProgramEnrollmentDetail?.values.cmps_clientid
          || '',
        ).trim()
        const missing: string[] = []
        if (!programEnrollmentId) missing.push('Program Enrollment')
        if (!clientProfileId) missing.push('Client Profile')
        if (!String(payload.cmps_checkindate || '').trim()) missing.push('Check In Date')
        if (!missing.length && !isBedCheckoutDateValid(String(payload.cmps_checkoutdate || '')) && normalize(String(programEnrollment?.program || '')) !== normalize('DVSTOP') && selectedBedIds.length === 0) {
          // Recheck before writing: an empty/unloaded picker is not proof that
          // the program has no available beds. Read failures must stop the save.
          const { beds } = await listSelectableBedsForEnrollment(String(programEnrollment?.program || ''), session.rowId || '')
          if (isBedSelectionRequired(String(programEnrollment?.program || ''), beds, String(payload.cmps_checkoutdate || ''))) missing.push('Beds')
        }
        if (missing.length) {
          showFormSaveError(`Please complete required field(s): ${missing.join(', ')}`)
          return
        }

        if (session.rowId) {
          await retainUpdatedForm(await updateBedEnrollmentResponse(session.rowId, payload), payload, session.rowId)
          await assignBedsToEnrollment(selectedBedIds, session.rowId, clientProfileId, currentUserName)
          setHubActionStatus(`Saved Bed Enrollment response ${session.recordId || session.rowId}.`)
          setClientLookupRefreshSignal((current) => current + 1)
          reportSavedForm()
          return
        }

        const created = await retainCreatedForm(await createBedEnrollmentResponse(payload), payload)
        // Retain the saved row if verification or a bed update fails, so retrying
        // updates this enrollment instead of creating a duplicate.
        updateSavingSession((current) => current?.kind === 'bed-enrollment'
          ? { ...current, rowId: created.id, recordId: created.recordId }
          : current)
        await verifyBedEnrollmentDates(created.id, payload)
        if (created.id) await assignBedsToEnrollment(selectedBedIds, created.id, clientProfileId, currentUserName)
        setHubActionStatus(
          created.id
            ? `Created and saved Bed Enrollment response ${created.recordId}.`
            : `Bed Enrollment ${created.recordId} was submitted, but the save could not be confirmed. Please try again.`,
        )
        setClientLookupRefreshSignal((current) => current + 1)
        reportSavedForm()
        return
      }

      if (session.kind === 'helpline') {
        const payload = Object.entries(session.values).reduce<HelplinePayload>((accumulator, [field, value]) => {
          accumulator[field as keyof HelplinePayload] = value
          return accumulator
        }, {})

        payload.cmps_numberofyesanswers = String(computeHelplineNumberOfYesAnswers(payload))

        const validationMessage = validateRequiredHelplineFields(payload)
        if (validationMessage) {
          showFormSaveError(validationMessage)
          return
        }

        if (session.rowId) {
          await retainUpdatedForm(await updateHelplineResponse(session.rowId, payload), payload, session.rowId)
          setHubActionStatus(`Saved Helpline response ${session.recordId || session.rowId}.`)
          reportSavedForm()
          return
        }

        const created = await retainCreatedForm(await createHelplineResponse(payload), payload)
        setHubActionStatus(
          created.id
            ? `Created and saved Helpline response ${created.recordId}.`
            : `Helpline ${created.recordId} was submitted, but the save could not be confirmed. Please try again.`,
        )
        reportSavedForm()
        return
      }

      if (session.kind === 'shelter-screening') {
        const payload = Object.entries(session.values).reduce<ShelterScreeningPayload>((accumulator, [field, value]) => {
          accumulator[field as keyof ShelterScreeningPayload] = value
          return accumulator
        }, {})

        payload.cmps_agesofchildren = shelterChildAges.map((entry) => entry.trim()).filter(Boolean).join(', ')

        const validationMessage = validateRequiredShelterScreeningFields(payload)
        if (validationMessage) {
          showFormSaveError(validationMessage)
          return
        }

        if (session.rowId) {
          await retainUpdatedForm(await updateShelterScreeningResponse(session.rowId, payload), payload, session.rowId)
          setHubActionStatus(`Saved Shelter Screening response ${session.recordId || session.rowId}.`)
          reportSavedForm()
          return
        }

        const created = await retainCreatedForm(await createShelterScreeningResponse(payload), payload)
        setHubActionStatus(
          created.id
            ? `Created and saved Shelter Screening response ${created.recordId}.`
            : `Shelter Screening ${created.recordId} was submitted, but the save could not be confirmed. Please try again.`,
        )
        reportSavedForm()
        return
      }

      if (session.kind === 'voca-form') {
        const payload = Object.entries(session.values).reduce<VocaFormPayload>((accumulator, [field, value]) => {
          accumulator[field as keyof VocaFormPayload] = value
          return accumulator
        }, {})

        const selectedProgramEnrollmentId = String(payload.cmps_peid || '').trim()
        const legacyClientLink = !!session.rowId && !!selectedDetailRecord?.id
          && normalizeGuidText(String(payload.cmps_cpid || '')) === normalizeGuidText(selectedDetailRecord.id)
        if (!selectedProgramEnrollmentId && !legacyClientLink) {
          showFormSaveError('Please select a Program Enrollment before saving VOCA.')
          return
        }

        const selectedProgramEnrollment = activeVocaProgramEnrollmentOptions.find((entry) => entry.value === selectedProgramEnrollmentId)
          || pendingVocaItems.find((entry) => entry.enrollmentId === selectedProgramEnrollmentId)
          || (session.rowId ? programEnrollmentsForClient.find((entry) => entry.id === selectedProgramEnrollmentId) : undefined)
        if (!selectedProgramEnrollment && (selectedProgramEnrollmentId || !legacyClientLink)) {
          showFormSaveError('Please select an active Program Enrollment for this client.')
          return
        }

        if (session.rowId) {
          await retainUpdatedForm(await updateVocaFormResponse(session.rowId, payload), payload, session.rowId)
          setHubActionStatus(`Saved VOCA form response ${session.recordId || session.rowId}.`)
          setClientLookupRefreshSignal((current) => current + 1)
          reportSavedForm()
          return
        }

        const created = await retainCreatedForm(await createVocaFormResponse(payload), payload)
        setHubActionStatus(
          created.id
            ? `Created and saved VOCA form response ${created.recordId}.`
            : `VOCA Form ${created.recordId} was submitted, but the save could not be confirmed. Please try again.`,
        )
        setClientLookupRefreshSignal((current) => current + 1)
        reportSavedForm()
        return
      }

      if (session.kind === 'goal') {
        const payload = Object.entries(session.values).reduce<GoalPayload>((accumulator, [field, value]) => {
          accumulator[field] = value
          return accumulator
        }, {})
        const validationMessage = getLiveRequiredMessage({ ...session, values: payload })
        if (validationMessage) {
          showFormSaveError(validationMessage)
          return
        }
        if (session.rowId) {
          await retainUpdatedForm(await updateGoalResponse(session.rowId, payload), payload, session.rowId)
          setHubActionStatus(`Saved Goal response ${session.recordId || session.rowId}.`)
        } else {
          const created = await retainCreatedForm(await createGoalResponse(payload), payload)
          setHubActionStatus(created.id ? `Created and saved Goal response ${created.recordId}.` : `Goal ${created.recordId} was submitted, but the save could not be confirmed. Please try again.`)
        }
        reportSavedForm()
        return
      }

      if (session.kind === 'event') {
        const payload = Object.entries(session.values).reduce<EventPayload>((accumulator, [field, value]) => {
          accumulator[field] = value
          return accumulator
        }, {})
        Object.assign(payload, getEventCalculatedTotals(payload))

        const validationMessage = validateRequiredEventFields(payload)
        if (validationMessage) {
          showFormSaveError(validationMessage)
          return
        }

        const relatedRecordId = String(session.recordId || payload.cmps_recordid || '').trim()
        let clientProfileRowId = ''
        const openedFromClientProfile = formReturnState?.appNav === 'clients'
          && formReturnState.page === 'search'
          && !!selectedDetailRecord
        if (openedFromClientProfile && selectedDetailRecord) {
          const selectedClientId = String(selectedDetailRecord.id || '').trim()
          if (isGuidText(selectedClientId)) {
            clientProfileRowId = normalizeGuidText(selectedClientId)
          } else if (selectedDetailRecord.recordId) {
            clientProfileRowId = await resolveClientProfileRowIdByRecordId(selectedDetailRecord.recordId)
          }
        }

        for (const [slot, field] of [[0, 'cmps_fileid1'], [1, 'cmps_fileid2']] as const) {
          const file = eventUploadFiles[slot]
          if (!file) continue
          const fileRecordId = await generateAppRecordId(COMPASS_FILES_TABLE_ALIAS, 'FILE')
          const createdFile = await createCompassFileRecord({
            file,
            recordId: fileRecordId,
            relatedRecordId,
            clientProfileRowId,
            savedBy: currentUserName,
          })
          payload[field] = createdFile.id
          updateSavingSession((current) => current?.kind === 'event'
            ? { ...current, values: { ...current.values, [field]: createdFile.id } }
            : current)
          updateEventUploadFile(slot, null)
        }

        if (session.rowId) {
          await retainUpdatedForm(await updateEventResponse(session.rowId, payload), payload, session.rowId)
          setHubActionStatus(`Saved Event response ${session.recordId || session.rowId}.`)
          reportSavedForm()
          return
        }

        const created = await retainCreatedForm(await createEventResponse(payload), payload)
        setHubActionStatus(
          created.id
            ? `Created and saved Event response ${created.recordId}.`
            : `Event ${created.recordId} was submitted, but the save could not be confirmed. Please try again.`,
        )
        reportSavedForm()
        return
      }

      if (session.kind === 'household') {
        const payload = Object.entries(session.values).reduce<HouseholdPayload>((accumulator, [field, value]) => {
          accumulator[field as keyof HouseholdPayload] = value
          return accumulator
        }, {})

        const validationMessage = validateRequiredHouseholdFields(payload, householdMembersDraft, !!session.rowId)
        if (validationMessage) {
          showFormSaveError(validationMessage)
          return
        }

        const activeSelectedMembers = householdMembersDraft.filter((entry) => entry.selected && normalize(entry.status) !== normalize('Inactive'))
        const selectedHeadOfHousehold = activeSelectedMembers.find((entry) => normalize(String(entry.relationshipToHoh || '')) === normalize('Self'))
        const selectedHeadName = String(selectedHeadOfHousehold?.clientName || selectedHeadOfHousehold?.clientRecordId || '').trim()
        if (activeSelectedMembers.length > 0) {
          if (!selectedHeadOfHousehold) {
            showFormSaveError('One active household member must have a Relationship to HOH of Self.')
            return
          }
        }

        payload.cmps_headofhouseholdname = selectedHeadName
        payload.cmps_numberofhhmembers = String(activeSelectedMembers.length)
        payload.cmps_effectiveenddate = activeSelectedMembers.length === 0
          ? localDateValue()
          : ''

        let householdRowId = String(session.rowId || '').trim()

        if (householdRowId) {
          await retainUpdatedForm(await updateHouseholdResponse(householdRowId, payload), payload, householdRowId)
        } else {
          const created = await retainCreatedForm(await createHouseholdResponse(payload), payload)
          householdRowId = String(created.id || '').trim()

          if (!householdRowId) {
            householdRowId = await resolveHouseholdRowIdByRecordId(String(created.recordId || payload.cmps_recordid || session.recordId || '').trim())
          }
        }

        if (!householdRowId) {
          throw new Error('The Household could not be saved completely. Please try again.')
        }

        const selectedHistoryIds = new Set<string>()

        for (const member of householdMembersDraft) {
          if (!member.selected || !member.historyRowId) continue
          selectedHistoryIds.add(member.historyRowId)

          const nextStatus = normalize(member.status) === normalize('Inactive') ? 'Inactive' : 'Active'
          await updateHouseholdHistoryRecord(member.historyRowId, {
            cmps_modifiedby: currentUserName,
            householdRowId: householdRowId,
            cmps_status: nextStatus,
            cmps_relationshiptohoh: String(member.relationshipToHoh || '').trim(),
            cmps_relationshiptohohother: String(member.relationshipToHohOther || '').trim(),
          })

          if (nextStatus === 'Inactive') {
            await createInitialHouseholdHistoryForClient(member.clientRowId, currentUserName)
          }
        }

        for (const member of householdMembersDraft) {
          if (!member.selected || member.historyRowId) continue
          const pendingKey = `${householdRowId}:${member.clientRowId}`
          const pendingId = pendingHouseholdHistorySaves.current.get(pendingKey)
          const createdHistory = pendingId ? { id: '', recordId: pendingId } : await createHouseholdHistoryRecord({
            cmps_createdby: currentUserName, cmps_modifiedby: currentUserName,
            clientRowId: member.clientRowId,
            householdRowId,
            cmps_status: 'Active',
            cmps_relationshiptohoh: String(member.relationshipToHoh || '').trim(),
            cmps_relationshiptohohother: String(member.relationshipToHohOther || '').trim(),
          })
          pendingHouseholdHistorySaves.current.set(pendingKey, createdHistory.recordId)
          const historyRowId = createdHistory.id || await confirmSavedRecordId('cmps_householdhistories', createdHistory.recordId)
          selectedHistoryIds.add(historyRowId)
          pendingHouseholdHistorySaves.current.delete(pendingKey)
          setHouseholdMembersDraft((current) => current.map((entry) => entry.clientRowId === member.clientRowId && !entry.historyRowId ? { ...entry, historyRowId, historyRecordId: createdHistory.recordId, householdRowId, status: 'Active' } : entry))
          setHouseholdOriginalMemberRowIds((current) => Array.from(new Set([...current, historyRowId])))
        }

        const removedOriginalMembers = householdMembersDraft.filter((member) => {
          if (!member.historyRowId) return false
          if (!householdOriginalMemberRowIds.includes(member.historyRowId)) return false
          return !selectedHistoryIds.has(member.historyRowId)
        })

        for (const removedMember of removedOriginalMembers) {
          await updateHouseholdHistoryRecord(removedMember.historyRowId, {
            cmps_modifiedby: currentUserName,
            householdRowId: householdRowId,
            cmps_status: 'Inactive',
            cmps_relationshiptohoh: String(removedMember.relationshipToHoh || '').trim(),
            cmps_relationshiptohohother: String(removedMember.relationshipToHohOther || '').trim(),
          })

          await createInitialHouseholdHistoryForClient(removedMember.clientRowId, currentUserName)
          setHouseholdOriginalMemberRowIds((current) => current.filter((id) => id !== removedMember.historyRowId))
        }

        setHubActionStatus(`Saved Household response ${session.recordId || householdRowId}.`)
        setClientLookupRefreshSignal((current) => current + 1)
        reportSavedForm()
        return
      }

      if (session.kind === 'program-enrollment') {
        const valuesWithDerivedProgramType = {
          ...session.values,
          cmps_programtype: getDerivedProgramEnrollmentType(session.values.cmps_program || ''),
        }
        const payload = Object.entries(valuesWithDerivedProgramType).reduce<Record<string, string>>((accumulator, [field, value]) => {
          if (PROGRAM_ENROLLMENT_FIELD_NAME_SET.has(field) || field === 'cmps_createdby' || field === 'cmps_modifiedby') {
            accumulator[field] = value
          }
          return accumulator
        }, {})

        const validationMessage = validateProgramEnrollment(payload)
        if (validationMessage) {
          showFormSaveError(validationMessage)
          return
        }

        if (session.rowId) {
          await retainUpdatedForm(await updateProgramEnrollmentResponse(session.rowId, payload), payload, session.rowId)
          setHubActionStatus(`Saved Program Enrollment response ${session.recordId || session.rowId}.`)

          const fromOpenedClientProfile = !!selectedDetailRecord?.id
            && String(session.values.cmps_clientid || '').trim() === String(selectedDetailRecord.id || '').trim()

          if (fromOpenedClientProfile) {
            reportSavedForm()
            return
          }

          reportSavedForm()
          return
        }

        const created = await retainCreatedForm(await createProgramEnrollmentResponse(payload), payload)
        updateSavingSession((current) => {
          if (!current || current.kind !== 'program-enrollment') return current
          return {
            ...current,
            rowId: created.id,
            recordId: created.recordId,
            values: {
              ...current.values,
              cmps_recordid: created.recordId,
            },
          }
        })

        setHubActionStatus(
          created.id
            ? `Created and saved Program Enrollment response ${created.recordId}.`
            : `Program Enrollment ${created.recordId} was submitted, but the save could not be confirmed. Please try again.`,
        )

        const fromOpenedClientProfile = !!selectedDetailRecord?.id
          && String(session.values.cmps_clientid || '').trim() === String(selectedDetailRecord.id || '').trim()

        if (fromOpenedClientProfile) {
          reportSavedForm()
          return
        }

        if (created.id) {
          reportSavedForm()
        }

        return
      }

      if (session.kind === 'release-of-information') {
        const payload = { ...session.values }
        const hasMethod = (value: string) => parseMultiValue(String(payload.cmps_method || '')).some((item) => normalize(item) === normalize(value))
        const hasProgram = (value: string) => parseMultiValue(String(payload.cmps_programs1 || '')).some((item) => normalize(item) === normalize(value))
        const missing = [
          hasMethod('By E-mail') && !String(payload.cmps_email || '').trim() ? 'E-mail' : '',
          hasMethod('By Mail') && !String(payload.cmps_address || '').trim() ? 'Address' : '',
          hasMethod('By Fax') && !String(payload.cmps_fax || '').trim() ? 'Fax' : '',
          hasProgram('Other') && !String(payload.cmps_programsother || '').trim() ? 'Programs - Other' : '',
        ].filter(Boolean)
        if (missing.length) {
          showFormSaveError(`Please complete required field(s): ${missing.join(', ')}`)
          return
        }
        if (session.rowId) await retainUpdatedForm(await updateReleaseOfInformationResponse(session.rowId, payload), payload, session.rowId)
        else await retainCreatedForm(await createReleaseOfInformationResponse(payload), payload)
        setHubActionStatus('Saved Release of Information form.')
        setClientLookupRefreshSignal((current) => current + 1)
        reportSavedForm()
        return
      }

      if (session.kind === 'child-safety-plan') {
        const required = getActiveRequiredFields(session)
        const missing = Array.from(required.entries()).filter(([field]) => !String(session.values[field] || '').trim()).map(([, label]) => label)
        if (missing.length) {
          showFormSaveError(`Please complete required field(s): ${missing.join(', ')}`)
          return
        }
        const programEnrollmentId = String(session.values.cmps_peid || '').trim()
        const isKnownEnrollment = session.rowId
          ? programEnrollmentsForClient.some((entry) => entry.id === programEnrollmentId)
          : activeProgramEnrollmentOptionsForServices.some((entry) => entry.value === programEnrollmentId)
        if (!isKnownEnrollment) {
          showFormSaveError('Please select an active Program Enrollment before saving Child Safety Plan.')
          return
        }
        const payload: ChildSafetyPlanPayload = { ...session.values }
        const drawingUpload = getPendingFormFileUpload(session, 'cmps_fileid1')
        if (drawingUpload) {
          const fileRowId = await createPendingCompassFile(session, drawingUpload)
          payload.cmps_fileid1 = fileRowId
          updateSavingSession((current) => current?.kind === 'child-safety-plan'
            ? { ...current, values: { ...current.values, cmps_fileid1: fileRowId } }
            : current)
          updatePendingFormFileUpload(session, 'cmps_fileid1', null)
        }
        if (session.rowId) {
          await retainUpdatedForm(await updateChildSafetyPlanResponse(session.rowId, payload), payload, session.rowId)
        } else {
          await retainCreatedForm(await createChildSafetyPlanResponse(payload), payload)
        }
        setHubActionStatus('Saved Child Safety Plan.')
        setClientLookupRefreshSignal((current) => current + 1)
        reportSavedForm()
        return
      }

      if (session.kind === 'acknowledgement-and-consent') {
        const required = getActiveRequiredFields(session)
        const missing = Array.from(required.entries())
          .filter(([field]) => !String(session.values[field] || '').trim())
          .map(([, label]) => label)
        const programEnrollmentId = String(session.values.cmps_peid || '').trim()
        const isKnownEnrollment = session.rowId
          ? programEnrollmentsForClient.some((entry) => entry.id === programEnrollmentId)
          : activeProgramEnrollmentOptionsForServices.some((entry) => entry.value === programEnrollmentId)
        if (!isKnownEnrollment) missing.unshift('Program Enrollment')
        if (missing.length) {
          showFormSaveError(`Please complete required field(s): ${Array.from(new Set(missing)).join(', ')}`)
          return
        }
        if (session.rowId) {
          await retainUpdatedForm(await updateAcknowledgementAndConsentResponse(session.rowId, session.values), session.values, session.rowId)
        } else {
          await retainCreatedForm(await createAcknowledgementAndConsentResponse(session.values), session.values)
        }
        setHubActionStatus('Saved Acknowledgement and Consent Form.')
        setClientLookupRefreshSignal((current) => current + 1)
        reportSavedForm()
        return
      }

      if (session.kind === 'animal-agreement') {
        const required = getActiveRequiredFields(session)
        const missing = Array.from(required.entries())
          .filter(([field]) => !String(session.values[field] || '').trim())
          .map(([, label]) => label)
        if (missing.length) {
          showFormSaveError(`Please complete required field(s): ${missing.join(', ')}`)
          return
        }
        if (session.rowId) {
          await retainUpdatedForm(await updateAnimalAgreementResponse(session.rowId, session.values), session.values, session.rowId)
        } else {
          await retainCreatedForm(await createAnimalAgreementResponse(session.values), session.values)
        }
        setHubActionStatus('Saved Animal Agreement.')
        setClientLookupRefreshSignal((current) => current + 1)
        reportSavedForm()
        return
      }

      if (session.kind === 'child-assessment') {
        const required = getActiveRequiredFields(session)
        const missing = Array.from(required.entries())
          .filter(([field]) => !String(session.values[field] || '').trim())
          .map(([, label]) => label)
        const programEnrollmentId = String(session.values.cmps_peid || '').trim()
        const isKnownEnrollment = session.rowId
          ? programEnrollmentsForClient.some((entry) => entry.id === programEnrollmentId)
          : activeProgramEnrollmentOptionsForServices.some((entry) => entry.value === programEnrollmentId)
        if (!isKnownEnrollment) missing.unshift('Program Enrollment')
        if (missing.length) {
          showFormSaveError(`Please complete required field(s): ${Array.from(new Set(missing)).join(', ')}`)
          return
        }
        if (session.rowId) {
          await retainUpdatedForm(await updateChildAssessmentResponse(session.rowId, session.values), session.values, session.rowId)
        } else {
          await retainCreatedForm(await createChildAssessmentResponse(session.values), session.values)
        }
        setHubActionStatus('Saved Child Assessment.')
        setClientLookupRefreshSignal((current) => current + 1)
        reportSavedForm()
        return
      }

      if (session.kind === 'child-shelter-intake') {
        const required = getActiveRequiredFields(session)
        const missing = Array.from(required.entries())
          .filter(([field]) => !String(session.values[field] || '').trim())
          .map(([, label]) => label)
        const programEnrollmentId = String(session.values.cmps_peid || '').trim()
        const isKnownEnrollment = session.rowId
          ? programEnrollmentsForClient.some((entry) => entry.id === programEnrollmentId)
          : activeProgramEnrollmentOptionsForServices.some((entry) => entry.value === programEnrollmentId)
        if (!isKnownEnrollment) missing.unshift('Program Enrollment')
        if (missing.length) {
          showFormSaveError(`Please complete required field(s): ${Array.from(new Set(missing)).join(', ')}`)
          return
        }
        if (session.rowId) {
          await retainUpdatedForm(await updateChildShelterIntakeResponse(session.rowId, session.values), session.values, session.rowId)
        } else {
          await retainCreatedForm(await createChildShelterIntakeResponse(session.values), session.values)
        }
        setHubActionStatus('Saved Child Shelter Intake.')
        setClientLookupRefreshSignal((current) => current + 1)
        reportSavedForm()
        return
      }

      if (session.kind === 'employment-and-benefits') {
        const required = getActiveRequiredFields(session)
        const missing = Array.from(required.entries())
          .filter(([field]) => !String(session.values[field] || '').trim())
          .map(([, label]) => label)
        if (missing.length) {
          showFormSaveError(`Please complete required field(s): ${missing.join(', ')}`)
          return
        }
        if (session.rowId) {
          await retainUpdatedForm(await updateEmploymentAndBenefitsResponse(session.rowId, session.values), session.values, session.rowId)
        } else {
          await retainCreatedForm(await createEmploymentAndBenefitsResponse(session.values), session.values)
        }
        setHubActionStatus('Saved Employment & Benefits.')
        reportSavedForm()
        return
      }

      if (session.kind === 'financial-assistance') {
        const required = getActiveRequiredFields(session)
        const missing = Array.from(required.entries())
          .filter(([field]) => !String(session.values[field] || '').trim())
          .map(([, label]) => label)
        const programEnrollmentId = String(session.values.cmps_peid || '').trim()
        if (!activeProgramEnrollmentOptionsForServices.some((entry) => entry.value === programEnrollmentId)) missing.unshift('Program Enrollment')
        if (missing.length) {
          showFormSaveError(`Please complete required field(s): ${Array.from(new Set(missing)).join(', ')}`)
          return
        }
        if (session.rowId) {
          await retainUpdatedForm(await updateFinancialAssistanceResponse(session.rowId, session.values), session.values, session.rowId)
        } else {
          await retainCreatedForm(await createFinancialAssistanceResponse(session.values), session.values)
        }
        setHubActionStatus('Saved Financial Assistance.')
        setClientLookupRefreshSignal((current) => current + 1)
        reportSavedForm()
        return
      }

      if (session.kind === 'medical-consent-form') {
        const required = getActiveRequiredFields(session)
        const missing = Array.from(required.entries())
          .filter(([field]) => !String(session.values[field] || '').trim())
          .map(([, label]) => label)
        const programEnrollmentId = String(session.values.cmps_peid || '').trim()
        if (!activeProgramEnrollmentOptionsForServices.some((entry) => entry.value === programEnrollmentId)) missing.unshift('Program Enrollment')
        if (missing.length) {
          showFormSaveError(`Please complete required field(s): ${Array.from(new Set(missing)).join(', ')}`)
          return
        }
        if (session.rowId) {
          await retainUpdatedForm(await updateMedicalConsentFormResponse(session.rowId, session.values), session.values, session.rowId)
        } else {
          await retainCreatedForm(await createMedicalConsentFormResponse(session.values), session.values)
        }
        setHubActionStatus('Saved Medical Consent Form.')
        setClientLookupRefreshSignal((current) => current + 1)
        reportSavedForm()
        return
      }

      if (session.kind === 'person-you-are-fleeing-profile') {
        if (session.rowId && !canEditClientLinkedForm('person-you-are-fleeing')) {
          showFormSaveError('You do not have Edit permission for Person You Are Fleeing Profile in this program.')
          return
        }
        const required = getActiveRequiredFields(session)
        const missing = Array.from(required.entries())
          .filter(([field]) => !String(session.values[field] || '').trim())
          .map(([, label]) => label)
        if (missing.length) {
          showFormSaveError(`Please complete required field(s): ${missing.join(', ')}`)
          return
        }
        const payload: PersonYouAreFleeingProfilePayload = { ...session.values }
        const photoUpload = getPendingFormFileUpload(session, 'cmps_fileid1')
        if (photoUpload) {
          const fileRowId = await createPendingCompassFile(session, photoUpload)
          payload.cmps_fileid1 = fileRowId
          updateSavingSession((current) => current?.kind === 'person-you-are-fleeing-profile'
            ? { ...current, values: { ...current.values, cmps_fileid1: fileRowId } }
            : current)
          updatePendingFormFileUpload(session, 'cmps_fileid1', null)
        }
        if (session.rowId) {
          await retainUpdatedForm(await updatePersonYouAreFleeingProfileResponse(session.rowId, payload), payload, session.rowId)
        } else {
          await retainCreatedForm(await createPersonYouAreFleeingProfileResponse(payload), payload)
        }
        setHubActionStatus('Saved Person You Are Fleeing Profile.')
        reportSavedForm()
        return
      }

      if (session.kind === 'electronic-document') {
        const required = getActiveRequiredFields(session)
        const missing = Array.from(required.entries())
          .filter(([field]) => !String(session.values[field] || '').trim()
            && !(field === 'cmps_fileid1' && getPendingFormFileUpload(session, field)))
          .map(([, label]) => label)
        if (missing.length) {
          showFormSaveError(`Please complete required field(s): ${missing.join(', ')}`)
          return
        }

        const payload: ElectronicDocumentPayload = { ...session.values }
        const documentUpload = getPendingFormFileUpload(session, 'cmps_fileid1')
        if (documentUpload) {
          const fileRowId = await createPendingCompassFile(session, documentUpload)
          payload.cmps_fileid1 = fileRowId
          updateSavingSession((current) => current?.kind === 'electronic-document'
            ? { ...current, values: { ...current.values, cmps_fileid1: fileRowId } }
            : current)
          updatePendingFormFileUpload(session, 'cmps_fileid1', null)
        }

        if (session.rowId) {
          await retainUpdatedForm(await updateElectronicDocumentResponse(session.rowId, payload), payload, session.rowId)
        } else {
          await retainCreatedForm(await createElectronicDocumentResponse(payload), payload)
        }
        setHubActionStatus('Saved Electronic Document.')
        setClientLookupRefreshSignal((current) => current + 1)
        reportSavedForm()
        return
      }

      if (session.kind === 'terms-and-conditions-of-service-animals') {
        const required = getActiveRequiredFields(session)
        const missing = Array.from(required.entries())
          .filter(([field]) => !String(session.values[field] || '').trim())
          .map(([, label]) => label)
        if (missing.length) {
          showFormSaveError(`Please complete required field(s): ${missing.join(', ')}`)
          return
        }
        if (session.rowId) {
          await retainUpdatedForm(await updateTermsAndConditionsOfServiceAnimalsResponse(session.rowId, session.values), session.values, session.rowId)
        } else {
          await retainCreatedForm(await createTermsAndConditionsOfServiceAnimalsResponse(session.values), session.values)
        }
        setHubActionStatus('Saved Terms & Conditions of Service Animals.')
        reportSavedForm()
        return
      }

      if (session.kind === 'contract') {
        const required = getActiveRequiredFields(session)
        const missing = Array.from(required.entries())
          .filter(([field]) => !String(session.values[field] || '').trim())
          .map(([, label]) => label)
        if (missing.length) {
          showFormSaveError(`Please complete required field(s): ${missing.join(', ')}`)
          return
        }
        if (session.rowId) {
          await retainUpdatedForm(await updateContractResponse(session.rowId, session.values), session.values, session.rowId)
        } else {
          await retainCreatedForm(await createContractResponse(session.values), session.values)
        }
        setHubActionStatus('Saved Contract.')
        setRefreshAdminSignal((current) => current + 1)
        reportSavedForm()
        return
      }

      if (session.kind === 'pet-companion-intake') {
        const required = getActiveRequiredFields(session)
        const missing = Array.from(required.entries())
          .filter(([field]) => !String(session.values[field] || '').trim())
          .map(([, label]) => label)
        if (missing.length) {
          showFormSaveError(`Please complete required field(s): ${missing.join(', ')}`)
          return
        }
        if (session.rowId) {
          await retainUpdatedForm(await updatePetCompanionIntakeResponse(session.rowId, session.values), session.values, session.rowId)
        } else {
          await retainCreatedForm(await createPetCompanionIntakeResponse(session.values), session.values)
        }
        setHubActionStatus('Saved Pet Companion Intake.')
        reportSavedForm()
        return
      }

      if (session.kind === 'funder-transaction') {
        const required = getActiveRequiredFields(session)
        const missing = Array.from(required.entries())
          .filter(([field]) => !String(session.values[field] || '').trim())
          .map(([, label]) => label)
        const contractId = String(session.values.cmps_activecontract || '').trim()
        if (contractId && !activeFunderContractOptions.some((option) => normalize(option.id) === normalize(contractId))) missing.push('Active Contract')
        if (missing.length) {
          showFormSaveError(`Please complete required field(s): ${Array.from(new Set(missing)).join(', ')}`)
          return
        }
        if (session.rowId) {
          await retainUpdatedForm(await updateFunderTransactionResponse(session.rowId, session.values), session.values, session.rowId)
        } else {
          await retainCreatedForm(await createFunderTransactionResponse(session.values), session.values)
        }
        setHubActionStatus('Saved Funder Transaction.')
        setRefreshAdminSignal((current) => current + 1)
        reportSavedForm()
        return
      }

      if (session.kind === 'shelter-program-guidelines') {
        const required = getActiveRequiredFields(session)
        const missing = Array.from(required.entries())
          .filter(([field]) => !String(session.values[field] || '').trim())
          .map(([, label]) => label)
        const programEnrollmentId = String(session.values.cmps_peid || '').trim()
        if (!activeProgramEnrollmentOptionsForServices.some((entry) => normalize(entry.value) === normalize(programEnrollmentId))) missing.unshift('Program Enrollment')
        if (missing.length) {
          showFormSaveError(`Please complete required field(s): ${Array.from(new Set(missing)).join(', ')}`)
          return
        }
        if (session.rowId) {
          await retainUpdatedForm(await updateShelterProgramGuidelinesResponse(session.rowId, session.values), session.values, session.rowId)
        } else {
          await retainCreatedForm(await createShelterProgramGuidelinesResponse(session.values), session.values)
        }
        setHubActionStatus('Saved Shelter Program Guidelines.')
        setClientLookupRefreshSignal((current) => current + 1)
        reportSavedForm()
        return
      }

      if (session.kind === 'adult-assessment') {
        const required = getActiveRequiredFields(session)
        const missing = Array.from(required.entries()).filter(([field]) => !String(session.values[field] || '').trim()).map(([, label]) => label)
        if (missing.length) {
          showFormSaveError(`Please complete required field(s): ${missing.join(', ')}`)
          return
        }
        const programEnrollmentId = String(session.values.cmps_peid || '').trim()
        const isKnownEnrollment = session.rowId
          ? programEnrollmentsForClient.some((entry) => entry.id === programEnrollmentId)
          : activeProgramEnrollmentOptionsForServices.some((entry) => entry.value === programEnrollmentId)
        if (!isKnownEnrollment) {
          showFormSaveError('Please select an active Program Enrollment before saving Adult Assessment.')
          return
        }
        if (session.rowId) {
          await retainUpdatedForm(await updateAdultAssessmentResponse(session.rowId, session.values), session.values, session.rowId)
        } else {
          await retainCreatedForm(await createAdultAssessmentResponse(session.values), session.values)
        }
        setHubActionStatus('Saved Adult Assessment.')
        setClientLookupRefreshSignal((current) => current + 1)
        reportSavedForm()
        return
      }

      if (session.kind === 'health-wellness') {
        const values = session.values
        const missing = HEALTH_WELLNESS_FIELDS.filter((field) => {
          if (field.section === 'Seizure Information' && normalize(String(values.cmps_doyouexperienceseizures || '')) !== 'yes') return false
          if (field.section === 'Emergency Contact Information' && !parseMultiValue(String(values.cmps_seizureemergencyprotocol1 || '')).some((item) => normalize(item) === normalize('Notify emergency contact'))) return false
          const visible = !field.visibleWhen || parseMultiValue(String(values[field.visibleWhen.field] || '')).some((item) => field.visibleWhen?.values.some((expected) => normalize(item) === normalize(expected)))
          return visible && field.required && !String(values[field.field] || '').trim()
        }).map((field) => field.label)
        if (missing.length) {
          showFormSaveError(`Please complete required field(s): ${missing.join(', ')}`)
          return
        }
        if (session.rowId) {
          await retainUpdatedForm(await updateHealthWellnessResponse(session.rowId, values), values, session.rowId)
        } else {
          await retainCreatedForm(await createHealthWellnessResponse(values), values)
        }
        setHubActionStatus('Saved Health and Wellness Questionnaire.')
        setClientLookupRefreshSignal((current) => current + 1)
        reportSavedForm()
        return
      }

      if (session.kind === 'focus-plan') {
        const values = session.values
        const requiredMessage = getFocusPlanRequiredMessage(session)
        if (requiredMessage) { showFormSaveError(requiredMessage); return }
        if (session.rowId) {
          await retainUpdatedForm(await updateFocusPlanResponse(session.rowId, values), values, session.rowId)
        } else {
          await retainCreatedForm(await createFocusPlanResponse(values), values)
        }
        setHubActionStatus('Saved FOCUS Plan.')
        setClientLookupRefreshSignal((current) => current + 1)
        reportSavedForm()
        return
      }

      if (session.kind === 'initial-safety-plan') {
        const missing = INITIAL_SAFETY_PLAN_FIELDS.filter((field) => field.required && !String(session.values[field.field] || '').trim()).map((field) => field.label)
        const isKnownEnrollment = session.rowId
          ? programEnrollmentsForClient.some((entry) => entry.id === session.values.cmps_peid)
          : activeProgramEnrollmentOptionsForServices.some((entry) => entry.value === session.values.cmps_peid)
        if (!isKnownEnrollment) missing.unshift('Program Enrollment')
        if (missing.length) { showFormSaveError(`Please complete required field(s): ${Array.from(new Set(missing)).join(', ')}`); return }
        if (session.rowId) {
          await retainUpdatedForm(await updateInitialSafetyPlanResponse(session.rowId, session.values), session.values, session.rowId)
        } else {
          await retainCreatedForm(await createInitialSafetyPlanResponse(session.values), session.values)
        }
        setHubActionStatus('Saved Initial Safety Plan.')
        setClientLookupRefreshSignal((current) => current + 1)
        reportSavedForm()
        return
      }

      let targetRowId = session.rowId
      if (!targetRowId && session.recordId) {
        targetRowId = await resolveClientProfileRowIdByRecordId(session.recordId)
        if (targetRowId) {
          throw new Error('This Client Profile record ID already exists. No existing profile was changed. Close and reopen the new form to prepare another ID.')
        }
      }

      const payload = Object.entries(session.values).reduce<ClientProfilePayload>((accumulator, [field, value]) => {
        if (CLIENT_PROFILE_FIELD_NAME_SET.has(field)) {
          const typedField = field as ClientProfileFieldName
          if (CLIENT_PROFILE_SYSTEM_MANAGED_READONLY_FIELDS.has(typedField)) {
            return accumulator
          }
          accumulator[typedField] = value
        }
        return accumulator
      }, {})
      const auditPayload = payload as ClientProfilePayload & Record<string, string>
      if (!targetRowId && currentUserName) auditPayload.cmps_createdby = currentUserName
      if (currentUserName) auditPayload.cmps_modifiedby = currentUserName

      const validationMessage = validateRequiredClientProfileFields(session.values)
      if (validationMessage) {
        showFormSaveError(validationMessage)
        return
      }

      if (targetRowId) {
        await retainUpdatedForm(await updateClientProfileResponse(targetRowId, payload), payload, targetRowId)
        if (pendingInitialHouseholdSaves.current.has(targetRowId)) {
          await createInitialHouseholdHistoryForClient(targetRowId, currentUserName)
          pendingInitialHouseholdSaves.current.delete(targetRowId)
        }
        setHubActionStatus(`Saved Client Profile response ${session.recordId}.`)
        setClientLookupRefreshSignal((current) => current + 1)

        reportSavedForm()
      } else {
        const duplicate = await findClientProfileDuplicate(payload)
        if (duplicate) {
          showFormSaveError(
            `A possible duplicate Client Profile already exists: ${duplicate.name || 'Unnamed client'}${duplicate.recordId ? ` (${duplicate.recordId})` : ''}. Review the existing profile before creating another.`,
          )
          return
        }

        const created = await retainCreatedForm(await createClientProfileResponse(payload), payload)
        updateSavingSession((current) => {
          if (!current || current.kind !== 'client-profile') return current
          return {
            ...current,
            rowId: created.id,
            recordId: created.recordId,
            values: {
              ...current.values,
              cmps_recordid: created.recordId,
            },
          }
        })
        setHubActionStatus(
          created.id
            ? `Created and saved Client Profile response ${created.recordId}.`
            : `Client Profile ${created.recordId} was submitted, but the save could not be confirmed. Please try again.`,
        )
        if (created.id) {
          pendingInitialHouseholdSaves.current.add(created.id)
          try {
            await createInitialHouseholdHistoryForClient(created.id, currentUserName)
            pendingInitialHouseholdSaves.current.delete(created.id)
          } catch {
            relatedSaveWarning = 'The Client Profile was saved, but its initial household history could not be created. IT Admin can repair it using Household History.'
            setHubActionStatus(`Created Client Profile ${created.recordId}, but the initial household record could not be created. Please try again from the client profile.`)
          }
        }
        reportSavedForm()
      }
    } catch (err) {
      if (err instanceof FunderBalanceSyncError) {
        baseSaved = true
        session.rowId = err.savedRecordId
        retainValues(session.values)
        setRefreshAdminSignal((current) => current + 1)
      }
      const details = String((err as Error)?.message || err)
      setActiveFormError(details)
      setRecordSaveResult(result(err instanceof SaveConfirmationPendingError && !session.rowId ? 'unconfirmed' : baseSaved ? 'partial' : 'failed', details))
    } finally {
      formSaveInFlight.current = false
      setActiveFormSaving(false)
    }
  }

  function closeActiveForm() {
    setActiveFormSession(null)
    setActiveFormError('')
    setEventUploadFiles([null, null])
    if (formReturnState) {
      setSelectedHubId(formReturnState.hubId)
      setSelectedAppNav(formReturnState.appNav)
      setSelectedHubPages((current) => ({
        ...current,
        [formReturnState.hubId]: formReturnState.page,
      }))
      setSelectedClientSectionByHub((current) => ({
        ...current,
        [formReturnState.hubId]: formReturnState.clientSection,
      }))
      setSelectedProgramEnrollmentDetail(formReturnState.programEnrollmentDetail)
      setSelectedServicesDetail(formReturnState.servicesDetail)
      setSelectedBedEnrollmentDetail(formReturnState.bedEnrollmentDetail)
      setSelectedAdultAssessmentDetail(formReturnState.adultAssessmentDetail)
      setSelectedChildSafetyPlanDetail(formReturnState.childSafetyPlanDetail)
      setSelectedFocusPlanDetail(formReturnState.focusPlanDetail)
      setSelectedInitialSafetyPlanDetail(formReturnState.initialSafetyPlanDetail)
      setSelectedHealthWellnessDetail(formReturnState.healthWellnessDetail)
    } else if (selectedHub && activeSearchDetailByHub[selectedHub.id]) {
      // Defensive fallback for any older or indirect launch path that did not
      // create a return snapshot.
      setSelectedAppNav('clients')
      setSelectedHubPages((current) => ({
        ...current,
        [selectedHub.id]: 'search',
      }))
    }
    setFormReturnState(null)
    scrollToTopOfPage()
  }

  function parseMultiValue(value: string): string[] {
    return String(value || '')
      .split(',')
      .map((entry) => entry.trim())
      .filter(Boolean)
  }

  function hasDisplayValue(value: unknown): boolean {
    return String(value || '').trim().length > 0
  }

  function fieldValueMatches(currentValue: string, expectedValues: string[]): boolean {
    const normalizedCurrent = normalize(currentValue)
    if (expectedValues.some((value) => normalize(value) === normalizedCurrent)) {
      return true
    }

    const multiValues = parseMultiValue(currentValue)
    return multiValues.some((entry) => expectedValues.some((value) => normalize(value) === normalize(entry)))
  }

  function isFieldVisible(
    visibleWhen: Array<{ field: string; values: string[] }> | undefined,
    values: Record<string, string | undefined>,
  ): boolean {
    if (!visibleWhen?.length) return true

    return visibleWhen.every((rule) => fieldValueMatches(values[rule.field] || '', rule.values))
  }

  function getClientProfileContextValues(
    values: Record<string, string | undefined>,
  ): Record<string, string | undefined> {
    if (String(selectedHub?.title || '').trim().toLowerCase() !== 'caafa shelter') return values

    const assignedPrograms = String(values.cmps_assignedprograms || '').trim()
    const alreadyIncludesCaafaShelter = assignedPrograms
      .split(/[;,]+/)
      .some((program) => program.trim().toLowerCase() === 'caafa shelter')
    if (alreadyIncludesCaafaShelter) return values

    return {
      ...values,
      cmps_assignedprograms: [assignedPrograms, 'CAAFA Shelter'].filter(Boolean).join(', '),
    }
  }

  function isClientProfileFieldVisible(
    fieldDef: { hiddenByDefault?: boolean; visibleWhen?: Array<{ field: string; values: string[] }> },
    values: Record<string, string | undefined>,
  ): boolean {
    const contextValues = getClientProfileContextValues(values)
    if (!isFieldVisible(fieldDef.visibleWhen, contextValues)) return false
    return !fieldDef.hiddenByDefault || !!fieldDef.visibleWhen?.length && isFieldVisible(fieldDef.visibleWhen, contextValues)
  }

  function validateRequiredClientProfileFields(values: Record<string, string>): string {
    const contextValues = getClientProfileContextValues(values)
    const missing = CLIENT_PROFILE_FIELDS
      .filter((fieldDef) => fieldDef.field !== 'cmps_middlename')
      .filter((fieldDef) => isClientProfileFieldVisible(fieldDef, contextValues))
      .filter((fieldDef) => fieldDef.requiredByDefault || fieldDef.requiredWhen?.(contextValues))
      .filter((fieldDef) => !String(values[fieldDef.field] || '').trim())
      .map((fieldDef) => fieldDef.label)

    return missing.length ? `Please complete required field(s): ${missing.join(', ')}` : ''
  }

  function isProgramEnrollmentFieldVisible(
    fieldDef: { field: string; visibleWhen?: Array<{ field: string; values: string[] }> },
    values: Record<string, string | undefined>,
  ): boolean {
    const field = fieldDef.field
    const program = normalize(String(values.cmps_program || ''))
    const enrollmentStatus = normalize(String(values.cmps_enrollmentstatus || ''))
    const petsAnswer = normalize(String(values.cmps_isthisclientbringinganypetstoshelter1 || ''))
    const classifications = parseMultiValue(String(values.cmps_clientspecialclassification1 || ''))
    const hasDisabilityClassification = classifications.some((entry) => SPECIAL_CLASSIFICATION_DISABILITY_TAGS.has(normalize(entry)))

    if (DISCHARGE_SUMMARY_FIELDS.has(field)) {
      return getProgramEnrollmentDischargeRules(values).showSummary
    }

    if (field === 'cmps_reasonturnedaway') {
      return enrollmentStatus === normalize('Turnaway')
    }

    if (field === 'cmps_isthisclientbringinganypetstoshelter1') {
      return PROGRAMS_WITH_SHELTER_QUESTIONS.has(program)
    }

    if (field === 'cmps_numberofpets') {
      return petsAnswer === normalize('Yes')
    }

    if (field === 'cmps_ovwclientservedstatus') {
      return isOvwLateLifeEnrollmentFunder(values.cmps_funder, activeFunderOptions)
    }

    if (field === 'cmps_didthisclientreceiveanydisabilityaccommo1') {
      return hasDisabilityClassification
    }

    if (field === 'cmps_isthesurroundingareaofthisshelterasafelo1') {
      return PROGRAMS_WITH_SHELTER_QUESTIONS.has(program)
    }

    if (field === 'cmps_howdidsvclienthearaboutusreferredby') {
      return PROGRAMS_FOR_SV_HEAR_ABOUT_US.has(program)
    }

    return isFieldVisible(fieldDef.visibleWhen, values)
  }

  function validateProgramEnrollment(values: Record<string, string>): string {
    const missing: string[] = []
    const requiredWhenVisible = (field: string, condition: boolean) => {
      if (!condition) return
      if (String(values[field] || '').trim()) return
      const label = PROGRAM_ENROLLMENT_FIELDS.find((entry) => entry.field === field)?.label || field
      if (!missing.includes(label)) missing.push(label)
    }

    PROGRAM_ENROLLMENT_FIELDS
      .filter((fieldDef) => fieldDef.required)
      .filter((fieldDef) => isProgramEnrollmentFieldVisible(fieldDef, values))
      .forEach((fieldDef) => requiredWhenVisible(fieldDef.field, true))

    const program = normalize(String(values.cmps_program || ''))
    const enrollmentStatus = normalize(String(values.cmps_enrollmentstatus || ''))
    const petsAnswer = normalize(String(values.cmps_isthisclientbringinganypetstoshelter1 || ''))
    const classifications = parseMultiValue(String(values.cmps_clientspecialclassification1 || ''))
    const hasDisabilityClassification = classifications.some((entry) => SPECIAL_CLASSIFICATION_DISABILITY_TAGS.has(normalize(entry)))

    requiredWhenVisible('cmps_reasonturnedaway', enrollmentStatus === normalize('Turnaway'))
    requiredWhenVisible('cmps_isthisclientbringinganypetstoshelter1', PROGRAMS_WITH_SHELTER_QUESTIONS.has(program))
    requiredWhenVisible('cmps_numberofpets', petsAnswer === normalize('Yes'))
    requiredWhenVisible('cmps_ovwclientservedstatus', isOvwLateLifeEnrollmentFunder(values.cmps_funder, activeFunderOptions))
    requiredWhenVisible('cmps_didthisclientreceiveanydisabilityaccommo1', hasDisabilityClassification)

    const numberOfPetsRaw = String(values.cmps_numberofpets || '').trim()
    if (petsAnswer === normalize('Yes') && numberOfPetsRaw) {
      const parsed = Number.parseInt(numberOfPetsRaw, 10)
      if (Number.isNaN(parsed) || parsed < 1 || parsed > 10) {
        return 'Number of pets must be a whole number between 1 and 10.'
      }
    }

    if (missing.length === 0) return ''
    return `Please complete required field(s): ${missing.join(', ')}`
  }

  function isClientProfileForm(formName: string): boolean {
    return normalize(formName).includes('client profile')
  }

  function getClientLinkedFormKey(formName: string): ClientLinkedFormKey | '' {
    const normalizedName = normalize(formName).replace(/&/g, 'and')
    if (normalizedName.includes('shelter screening')) return 'shelter-screening'
    if (normalizedName === 'voca' || normalizedName.includes('voca form')) return 'voca-form'
    if (normalizedName.includes('child assessment')) return 'child-assessment'
    if (normalizedName.includes('financial assistance')) return 'financial-assistance'
    if (normalizedName.includes('release of information')) return 'release-of-information'
    if (normalizedName.includes('acknowledgement') && normalizedName.includes('consent')) return 'acknowledgement-and-consent'
    if (normalizedName.includes('employment and benefits')) return 'employment-and-benefits'
    if (normalizedName.includes('person you are fleeing')) return 'person-you-are-fleeing'
    if (normalizedName.includes('pet companion intake')) return 'pet-companion-intake'
    if (normalizedName.includes('terms and conditions of service animals')) return 'terms-and-conditions-of-service-animals'
    if (normalizedName.includes('child shelter intake')) return 'child-shelter-intake'
    if (normalizedName.includes('medical') && normalizedName.includes('consent')) return 'medical-consent'
    if (normalizedName.includes('shelter program guidelines')) return 'shelter-program-guidelines'
    if (normalizedName.includes('animal agreement')) return 'animal-agreement'
    return ''
  }

  function canEditClientLinkedForm(key: ClientLinkedFormKey): boolean {
    if (isUserPreview || roleProfilesLoading || !selectedHub) return false
    if (canAccessRoleAdmin) return true
    return roleProfiles.some((profile) => hubMatchesRole(selectedHub, profile.roleName)
      && profile.entries.some((entry) => getClientLinkedFormKey(entry.formName) === key && entry.permissions.edit === true))
  }

  function canReadClientLinkedForm(key: ClientLinkedFormKey, allowSearch = true): boolean {
    if (canAccessRoleAdmin) return true
    return !!selectedHub && roleProfiles.some((profile) => hubMatchesRole(selectedHub, profile.roleName)
      && profile.entries.some((entry) => getClientLinkedFormKey(entry.formName) === key
        && (entry.permissions.view || entry.permissions.edit || (allowSearch && entry.permissions.search))))
  }

  function canViewClientLinkedForm(key: ClientLinkedFormKey): boolean {
    if (roleProfilesLoading || !selectedHub) return false
    if (canAccessRoleAdmin) return true
    return roleProfiles.some((profile) => hubMatchesRole(selectedHub, profile.roleName)
      && profile.entries.some((entry) => getClientLinkedFormKey(entry.formName) === key && entry.permissions.view === true))
  }

  function canAccessClientFormAction(formName: string, action: 'view' | 'edit'): boolean {
    if (!selectedHub || roleProfilesLoading || action === 'edit' && isUserPreview) return false
    if (canAccessRoleAdmin) return true
    const name = normalizeClientProfileFormName(getClientProfileFormCatalogEntry(formName)?.name || formName)
    return roleProfiles.some((profile) => hubMatchesRole(selectedHub, profile.roleName) && profile.entries.some((entry) =>
      entry.permissions[action] === true && normalizeClientProfileFormName(getClientProfileFormCatalogEntry(entry.formName)?.name || entry.formName) === name))
  }

  async function viewHouseholdRecord(row: { id: string; recordId: string }) {
    if (!selectedDetailRecord?.id || !canAccessClientFormAction('Household', 'view') || !householdsForClient.some((entry) => entry.id === row.id)) return
    const clientId = selectedDetailRecord.id, request = ++clientConsentRequest.current
    setHouseholdView({ clientId, loading: true, detail: null, members: [], error: '' })
    try {
      const [detail, members] = await Promise.all([loadHouseholdDetailRecord(row.id, row.recordId), listHouseholdMembersForHousehold(row.id)])
      if (request !== clientConsentRequest.current) return
      if (normalizeGuidText(detail.id) !== normalizeGuidText(row.id)) throw new Error('The requested Household could not be verified.')
      setHouseholdView({ clientId, loading: false, detail, members: members.filter((member) => normalize(member.status) === 'active'), error: '' })
      openRecordFormView('household', detail, clientId)
    } catch (error) {
      if (request === clientConsentRequest.current) setHouseholdView({ clientId, loading: false, detail: null, members: [], error: String((error as Error)?.message || error) })
    }
  }

  function renderClientSearchPagination(position: 'top' | 'bottom') {
    if (!selectedHub || selectedSearchForm !== 'Client Profile' || !(selectedSearchPage > 1 || selectedSearchHasNext)) return null
    return (
      <nav aria-label={`Client search result pages (${position})`} className="hub-form-editor-actions" style={{ marginBlock: '0.75rem' }}>
        <button
          type="button"
          className="secondary"
          onClick={() => {
            setSearchPageByHub((current) => ({
              ...current,
              [selectedHub.id]: Math.max(1, (current[selectedHub.id] || 1) - 1),
            }))
          }}
          disabled={selectedSearchPage <= 1 || selectedDetailLoading}
        >
          Previous Page
        </button>
        <span className="hint">Page {selectedSearchPage}</span>
        <button
          type="button"
          className="secondary"
          onClick={() => {
            setSearchPageByHub((current) => ({
              ...current,
              [selectedHub.id]: (current[selectedHub.id] || 1) + 1,
            }))
          }}
          disabled={!selectedSearchHasNext || selectedDetailLoading}
        >
          Next Page
        </button>
      </nav>
    )
  }

  function renderArchiveRecordButton(tableAlias: string, rowId: string, recordLabel = '') {
    if (!canAccessRoleAdmin || !rowId) return null
    return (
      <button type="button" className="secondary hub-search-open-button danger" onClick={() => { void archiveRecord(tableAlias, rowId, recordLabel) }} disabled={isUserPreview || (archiveActionLoading)}>
        Archive
      </button>
    )
  }

  async function editPersonFleeingRecord(row: ClientLinkedRecord) {
    if (!selectedHub || !selectedDetailRecord?.id || !canEditClientLinkedForm('person-you-are-fleeing')) return
    const clientId = selectedDetailRecord.id
    const request = ++clientConsentRequest.current
    setClientConsentView(null)
    setPersonFleeingEdit({ clientId, loading: true, error: '' })
    try {
      const detail = await loadPersonFleeingRecord(row.id, clientId)
      if (request !== clientConsentRequest.current) return
      rememberFormReturnState()
      setActiveFormError('')
      setActiveFormSession({
        kind: 'person-you-are-fleeing-profile', formName: 'Person You Are Fleeing Profile',
        tableAlias: PERSON_YOU_ARE_FLEEING_PROFILES_TABLE_ALIAS, rowId: detail.id,
        recordId: detail.recordId, values: { ...detail.values },
      })
      setSelectedHubPages((current) => ({ ...current, [selectedHub.id]: 'forms' }))
      setPersonFleeingEdit({ clientId, loading: false, error: '' })
      setHubActionStatus(`Opened Person You Are Fleeing Profile ${detail.recordId || row.recordId} for editing.`)
      scrollToTopOfPage()
    } catch (error) {
      if (request === clientConsentRequest.current) setPersonFleeingEdit({ clientId, loading: false, error: String((error as Error)?.message || error) })
    }
  }

  async function openClientConsentForm(kind: ClientConsentFormKind, row: ClientLinkedRecord) {
    if (!canViewClientLinkedForm(kind)) return
    const clientId = String(selectedDetailRecord?.id || '').trim()
    if (!clientId) return
    const request = ++clientConsentRequest.current
    setClientConsentView({ kind, clientId, loading: true, detail: null, error: '' })
    try {
      const detail = await loadClientConsentFormRecord(kind, row.id, clientId, programEnrollmentsClientId === clientId ? programEnrollmentsForClient.map((entry) => entry.id) : [])
      if (request === clientConsentRequest.current) {
        setClientConsentView({ kind, clientId, loading: false, detail, error: '' })
        openRecordFormView(kind, detail, clientId)
      }
    } catch (err) {
      if (request === clientConsentRequest.current) setClientConsentView({ kind, clientId, loading: false, detail: null, error: String((err as Error)?.message || err) })
    }
  }

  async function editClientConsentForm(kind: ClientConsentFormKind, row: Pick<ClientLinkedRecord, 'id' | 'recordId'>) {
    if (!selectedHub || !selectedDetailRecord?.id || !canEditClientLinkedForm(kind)) return
    const clientId = selectedDetailRecord.id, request = ++clientConsentRequest.current
    setClientConsentView({ kind, clientId, loading: true, detail: null, error: '' })
    try {
      const detail = await loadClientConsentFormRecord(kind, row.id, clientId, programEnrollmentsClientId === clientId ? programEnrollmentsForClient.map((entry) => entry.id) : [])
      if (request !== clientConsentRequest.current) return
      rememberFormReturnState()
      setActiveFormError('')
      setActiveFormSession({
        kind: CLIENT_RECORD_EDIT_KINDS[kind], formName: CLIENT_RECORD_LABELS[kind],
        tableAlias: CLIENT_RECORD_SOURCES[kind].tableAlias, rowId: detail.id, recordId: detail.recordId, values: { ...detail.values },
      } as HubFormSession)
      setClientConsentView(null)
      setSelectedHubPages((current) => ({ ...current, [selectedHub.id]: 'forms' }))
      scrollToTopOfPage()
    } catch (error) {
      if (request === clientConsentRequest.current) setClientConsentView({ kind, clientId, loading: false, detail: null, error: String((error as Error)?.message || error) })
    }
  }

  function renderClientRecordActions(kind: ClientConsentFormKind, row: Pick<ClientLinkedRecord, 'id' | 'recordId'> & { data?: Record<string, unknown> }) {
    const busy = clientConsentView?.loading || personFleeingEdit?.loading
    return <>
      {canViewClientLinkedForm(kind) ? <button type="button" className="secondary hub-search-open-button" disabled={!!busy} onClick={() => { void openClientConsentForm(kind, { ...row, createdOn: '', modifiedOn: '' }) }}>View</button> : null}
      {kind === 'person-you-are-fleeing' && row.data && canViewClientLinkedForm(kind) ? <RecordAttachmentButtons attachments={recordAttachments(kind, row.data)} onOpenFile={(id) => { void openCompassFileViewer(id) }} disabled={!!busy} /> : null}
      {canEditClientLinkedForm(kind) ? <button type="button" className="secondary hub-search-open-button" disabled={!!busy} onClick={() => {
        if (kind === 'person-you-are-fleeing') void editPersonFleeingRecord({ ...row, createdOn: '', modifiedOn: '' })
        else if (kind === 'shelter-screening') void editShelterScreeningRecord({ ...row, program: '', screenDate: '' })
        else void editClientConsentForm(kind, row)
      }}>Edit</button> : null}
    </>
  }

  function renderClientConsentRecordView(kind: ClientConsentFormKind) {
    const view = clientConsentView?.kind === kind && clientConsentView.clientId === selectedDetailRecord?.id ? clientConsentView : null
    if (!view || !canViewClientLinkedForm(kind) && !canEditClientLinkedForm(kind)) return null
    const fields = getClientConsentFormFields(kind)
    return <section className="hub-client-quick-record">
      <div className="hub-client-quick-record-head">
        <h4>{CLIENT_RECORD_LABELS[kind]}{view.detail ? ` | ${view.detail.recordId || view.detail.id.slice(0, 8)}` : ''}</h4>
        <button type="button" className="secondary" onClick={() => { clientConsentRequest.current += 1; setClientConsentView(null) }}>Close Record</button>
      </div>
      {view.loading ? <p className="hint">Opening form...</p> : null}
      {view.error ? <p className="error" role="alert">{view.error}</p> : null}
      {view.detail ? <ReadOnlyFormSections fields={fields} values={view.detail.values}
        sections={kind === 'shelter-screening' ? ['Main', 'Household Makeup', 'Safety Assessment', 'Other Information'] : [...new Set(fields.map((field) => field.section))]}
        idPrefix={`client-record-${view.detail.id}`}
        getSection={kind === 'shelter-screening' ? (field) => getShelterScreeningFormSection(field.field) : undefined}
        isVisible={(field) => {
          if (kind === 'shelter-screening') return isShelterScreeningFieldVisible(field.field, view.detail!.values)
          if (kind === 'person-you-are-fleeing' && field.field === 'person-fleeing-oop-header') return normalize(view.detail!.values.cmps_doyoucurrentlyhaveanoop || '') === 'yes'
          const definition = fields.find((entry) => entry.field === field.field)
          const condition = definition && 'visibleWhen' in definition ? definition.visibleWhen : undefined
          const conditions = Array.isArray(condition) ? condition : condition ? [condition] : []
          return conditions.every((entry) => entry.values.some((value: string) => parseMultiValue(view.detail!.values[entry.field] || '').some((selected) => normalize(selected) === normalize(value))))
        }}
        formatValue={(field, value) => field.input === 'lookup' || field.field === 'cmps_peid' || field.field === 'cmps_cpid' ? formatLookupDisplayValue(field.field, value) : value}
        onOpenFile={(id) => { void openCompassFileViewer(id) }}
      /> : null}
    </section>
  }

  function renderPrintableRecord(kind: string, detail: PrintRecordDetail, printMode = true) {
    switch (kind) {
      case 'client-profile': return <ReadOnlyFormSections
                            fields={CLIENT_PROFILE_FIELDS.filter((fieldDef) => fieldDef.field !== 'cmps_picture')}
                            values={detail.values}
                            sections={['Main', 'Previous Location', 'Notes']}
                            idPrefix={'print-' + kind + '-' + detail.id}
                            isVisible={(field) => {
                              const definition = CLIENT_PROFILE_FIELDS.find((entry) => entry.field === field.field)
                              return !!definition && isClientProfileFieldVisible(definition, detail.values)
                            }}
                          printMode={printMode} />
      case 'program-enrollment': return <ReadOnlyFormSections
                            fields={PROGRAM_ENROLLMENT_FIELDS.filter((fieldDef, index, all) => all.findIndex((entry) => entry.field === fieldDef.field) === index)}
                            values={detail.values}
                            sections={['Enrollment Details', 'Incident Information', 'Program Notes', 'Discharge Summary', 'Household Demographics']}
                            idPrefix={'print-' + kind + '-' + detail.id}
                            isVisible={(field) => isProgramEnrollmentFieldVisible(field, detail.values)}
                            formatValue={(field, value) => field.field === 'cmps_clientid' ? formatLookupDisplayValue(field.field, value) : value}
                          printMode={printMode} />
      case 'services': return <ReadOnlyFormSections
                                fields={SERVICES_FIELD_DEFINITIONS}
                                values={detail.values}
                                sections={['Main', 'Service Details', 'Service Notes', 'VOCA Direct Services']}
                                idPrefix={'print-' + kind + '-' + detail.id}
                                isVisible={(field) => isServicesFieldVisible(field.field, detail.values as Record<string, string>, programEnrollmentsForClient)}
                                formatValue={(field, value) => formatServicesDetailValue(field.field, value)}
                              printMode={printMode} />
      case 'bed-enrollment': return <ReadOnlyFormSections
                                fields={BED_ENROLLMENT_FIELD_DEFINITIONS}
                                values={detail.values}
                                sections={['Main']}
                                idPrefix={'print-' + kind + '-' + detail.id}
                                getSection={() => 'Main'}
                                formatValue={(field, value) => formatServicesDetailValue(field.field, value)}
                              printMode={printMode} />
      case 'helpline': return <ReadOnlyFormSections
                            fields={HELPLINE_FIELD_DEFINITIONS}
                            formatValue={(field, value) => formatLookupDisplayValue(field.field, value)}
                            values={detail.values}
                            sections={['Main', 'DV Helpline Details', 'SV Helpline Details', 'Current Living Situation', 'Safety Assessment', 'OVW Late Life Abuse Screening', 'Notes']}
                            idPrefix={'print-' + kind + '-' + detail.id}
                            getSection={(field) => getHelplineFormSection(field.field, detail.values)}
                            isVisible={(field) => isHelplineFieldVisible(field.field, detail.values)}
                          printMode={printMode} />
      case 'child-safety-plan': return <ReadOnlyFormSections fields={CHILD_SAFETY_PLAN_FIELDS} values={detail.values} sections={['Main', 'Planning', 'Emotions', 'Acknowledgement']} idPrefix={'print-' + kind + '-' + detail.id} formatValue={(field, value) => field.field === 'cmps_peid' ? formatLookupDisplayValue(field.field, value) : value} onOpenFile={(fileId) => { void openCompassFileViewer(fileId) }} printMode={printMode} />
      case 'electronic-document': return <ReadOnlyFormSections
                            fields={ELECTRONIC_DOCUMENT_FIELDS}
                            values={detail.values}
                            sections={['Main', 'Document Details', 'Notes']}
                            idPrefix={'print-' + kind + '-' + detail.id}
                            formatValue={(field, value) => field.field === 'cmps_cpid' ? formatLookupDisplayValue(field.field, value) : value}
                            onOpenFile={(fileId) => { void openCompassFileViewer(fileId) }}
                          printMode={printMode} />
      case 'adult-assessment': return <ReadOnlyFormSections
                            fields={ADULT_ASSESSMENT_FIELDS}
                            values={detail.values}
                            sections={['Main', 'Assessment', 'Acknowledgement']}
                            idPrefix={'print-' + kind + '-' + detail.id}
                            isVisible={(field) => {
                              const definition = ADULT_ASSESSMENT_FIELDS.find((entry) => entry.field === field.field)
                              return !definition?.visibleWhen || fieldValueMatches(String(detail.values[definition.visibleWhen.field] || ''), definition.visibleWhen.values)
                            }}
                            formatValue={(field, value) => formatLookupDisplayValue(field.field, value)}
                          printMode={printMode} />
      case 'health-wellness': return <ReadOnlyFormSections
                            fields={HEALTH_WELLNESS_FIELDS}
                            values={detail.values}
                            sections={['Main', 'Medical History', 'Seizure Information', 'Medications', 'Additional Medications', 'Emergency Contact Information']}
                            idPrefix={'print-' + kind + '-' + detail.id}
                            isVisible={(field) => {
                              const definition = HEALTH_WELLNESS_FIELDS.find((entry) => entry.field === field.field)
                              if (definition?.section === 'Seizure Information' && normalize(String(detail.values.cmps_doyouexperienceseizures || '')) !== normalize('Yes')) return false
                              if (definition?.section === 'Additional Medications' && normalize(String(detail.values.cmps_doyouhavemoremedicationsyouwouldliketodocumen || '')) !== normalize('Yes')) return false
                              return !definition?.visibleWhen || fieldValueMatches(String(detail.values[definition.visibleWhen.field] || ''), definition.visibleWhen.values)
                            }}
                            formatValue={(field, value) => field.field === 'cmps_cpid' ? formatLookupDisplayValue(field.field, value) : value}
                          printMode={printMode} />
      case 'goals': return <ReadOnlyFormSections fields={GOAL_FIELDS} values={detail.values} sections={['Main', 'Goal Information', 'Goal Outcomes', 'Goal Notes']} idPrefix={'print-' + kind + '-' + detail.id} isVisible={(field) => field.field !== 'cmps_othergoal' || normalize(String(detail.values.cmps_goal || '')) === normalize(GOAL_OTHER_OPTION)} formatValue={(field, value) => field.field === 'cmps_peid' ? formatLookupDisplayValue(field.field, value) : value} printMode={printMode} />
      case 'focus-plan': return <ReadOnlyFormSections
                            fields={FOCUS_PLAN_FIELDS}
                            values={detail.values}
                            sections={['Main', 'Goals/Person-Family Vision', "Person's/Family Strengths & Goals", 'FOCUS Meeting Notes', 'FOCUS Plan Checklist']}
                            idPrefix={'print-' + kind + '-' + detail.id}
                            isVisible={(field) => {
                              const definition = FOCUS_PLAN_FIELDS.find((entry) => entry.field === field.field)
                              return !definition?.visibleWhen || fieldValueMatches(String(detail.values[definition.visibleWhen.field] || ''), definition.visibleWhen.values)
                            }}
                            formatValue={(field, value) => field.field === 'cmps_peid' ? formatLookupDisplayValue(field.field, value) : value}
                          printMode={printMode} />
      case 'initial-safety-plan': return <ReadOnlyFormSections fields={INITIAL_SAFETY_PLAN_FIELDS} values={detail.values} sections={['Main', 'Acknowledgement']} idPrefix={'print-' + kind + '-' + detail.id} formatValue={(field, value) => field.field === 'cmps_peid' ? formatLookupDisplayValue(field.field, value) : value} printMode={printMode} />
      case 'event': return <ReadOnlyFormSections
                          fields={EVENT_FIELD_DEFINITIONS}
                          values={detail.values}
                          sections={['Event Details', 'Attendance by Demographic', 'Notes']}
                          idPrefix={'print-' + kind + '-' + detail.id}
                          onOpenFile={(fileId) => { void openCompassFileViewer(fileId) }}
                        printMode={printMode} />
      case 'household': return <ReadOnlyFormSections fields={HOUSEHOLD_FIELD_DEFINITIONS} values={detail.values} sections={['Main']} idPrefix={'print-' + kind + '-' + detail.id} printMode={printMode} />
      default: {
        if (!CLIENT_RECORD_SOURCES[kind as ClientConsentFormKind]) throw new Error('Unsupported print layout.')
        const fields = getClientConsentFormFields(kind as ClientConsentFormKind)
        return <ReadOnlyFormSections fields={fields} values={detail.values}
        sections={kind === 'shelter-screening' ? ['Main', 'Household Makeup', 'Safety Assessment', 'Other Information'] : [...new Set(fields.map((field) => field.section))]}
        idPrefix={'print-' + kind + '-' + detail.id}
        getSection={kind === 'shelter-screening' ? (field) => getShelterScreeningFormSection(field.field) : undefined}
        isVisible={(field) => {
          if (kind === 'shelter-screening') return isShelterScreeningFieldVisible(field.field, detail.values)
          if (kind === 'person-you-are-fleeing' && field.field === 'person-fleeing-oop-header') return normalize(detail.values.cmps_doyoucurrentlyhaveanoop || '') === 'yes'
          const definition = fields.find((entry) => entry.field === field.field)
          const condition = definition && 'visibleWhen' in definition ? definition.visibleWhen : undefined
          const conditions = Array.isArray(condition) ? condition : condition ? [condition] : []
          return conditions.every((entry) => entry.values.some((value: string) => parseMultiValue(detail.values[entry.field] || '').some((selected) => normalize(selected) === normalize(value))))
        }}
        formatValue={(field, value) => field.input === 'lookup' || field.field === 'cmps_peid' || field.field === 'cmps_cpid' ? formatLookupDisplayValue(field.field, value) : value}
        onOpenFile={(id) => { void openCompassFileViewer(id) }}
      printMode={printMode} />
      }
    }
  }

  function renderClientLinkedRecordList(formName: string) {
    const key = getClientLinkedFormKey(formName)
    if (!key) return null
    if (!canReadClientLinkedForm(key)) return <p className="hint">Your role does not have access to read existing records for this form.</p>
    const rows = clientLinkedRecords[key] || []
    if (clientLinkedRecordsLoading || clientLinkedRecordsClientId !== selectedDetailRecord?.id) return <p className="hint">Loading linked records...</p>
    if (clientLinkedRecordsError[key]) return <p className="error">{clientLinkedRecordsError[key]}</p>
    if (rows.length === 0) return <p className="hint">No records linked to this client yet.</p>
    const source = CLIENT_LINKED_RECORD_SOURCES[key]
    const canAct = canAccessRoleAdmin || canViewClientLinkedForm(key) || canEditClientLinkedForm(key)
    const editState = key === 'person-you-are-fleeing' && personFleeingEdit?.clientId === selectedDetailRecord?.id ? personFleeingEdit : null
    return <>
      <div className="hub-search-results-table-wrap">
        <SortableRecordTable className="hub-search-results-table">
          <thead><tr>{canAct ? <th>Action</th> : null}<th>Record ID</th><th>Created</th><th>Modified</th></tr></thead>
          <tbody>{rows.map((row) => <tr key={row.id}>
            {canAct ? <td>{renderClientRecordActions(key, row)}{renderArchiveRecordButton(source.tableAlias, row.id, row.recordId || row.id)}</td> : null}
            <td>{row.recordId || row.id.slice(0, 8)}</td><td>{row.createdOn ? row.createdOn.slice(0, 10) : '-'}</td><td>{row.modifiedOn ? row.modifiedOn.slice(0, 10) : '-'}</td>
          </tr>)}</tbody>
        </SortableRecordTable>
      </div>
      {editState?.loading ? <p className="hint">Opening Person You Are Fleeing Profile for editing...</p> : null}
      {editState?.error ? <p className="error" role="alert">{editState.error}</p> : null}
      {renderClientConsentRecordView(key)}
    </>
  }

  function getClientFormRecordCount(formName: string): number {
    const linkedForm = getClientLinkedFormKey(formName)
    if (linkedForm) return clientLinkedRecordsClientId === selectedDetailRecord?.id ? (clientLinkedRecords[linkedForm] || []).length : 0
    if (isClientProfileForm(formName)) {
      return selectedDetailRecord ? 1 : 0
    }
    if (isHouseholdForm(formName)) {
      return householdsForClient.length
    }
    if (isProgramEnrollmentForm(formName)) {
      return programEnrollmentsForClient.length
    }
    if (isServicesForm(formName)) {
      return servicesForClient.length
    }
    if (isHelplineForm(formName)) {
      return helplinesForClient.length
    }
    if (isShelterScreeningForm(formName)) {
      return shelterScreeningsForClient.length
    }
    if (isBedEnrollmentForm(formName)) {
      return bedEnrollmentsForClient.length
    }
    if (normalize(formName).includes('adult assessment')) {
      return adultAssessmentsForClient.length
    }
    if (normalize(formName).includes('child safety plan')) {
      return childSafetyPlansForClient.length
    }
    if (isElectronicDocumentForm(formName)) {
      return electronicDocumentsForClient.length
    }
    if (normalize(formName).includes('focus plan')) {
      return focusPlansForClient.length
    }
    if (isGoalForm(formName)) {
      return goalsForClient.length
    }
    if (isVocaForm(formName)) {
      return vocaFormsForClient.length
    }
    if (normalize(formName).includes('initial safety plan')) {
      return initialSafetyPlansForClient.length
    }
    if (isHealthWellnessForm(formName)) {
      return healthWellnessForClient.length
    }
    const clientLinkedKey = getClientLinkedFormKey(formName)
    if (clientLinkedKey) return clientLinkedRecordsClientId === selectedDetailRecord?.id ? (clientLinkedRecords[clientLinkedKey] || []).length : 0
    return 0
  }

  function getClientFormRecordCountForEnrollment(formName: string, programEnrollmentRowId: string): number {
    const enrollmentId = normalizeGuidText(programEnrollmentRowId)
    if (!enrollmentId) return 0

    const linkedForm = getClientLinkedFormKey(formName)
    if (linkedForm) {
      const rows = clientLinkedRecordsClientId === selectedDetailRecord?.id ? (clientLinkedRecords[linkedForm] || []) : []
      const source = CLIENT_LINKED_RECORD_SOURCES[linkedForm]
      const enrollmentLinked = !!source.enrollmentLookup || !!source.enrollmentLookups?.length
      if (!enrollmentLinked) return rows.length
      return rows.filter((row) => Object.entries(row.data || {}).some(([field, value]) => (
        field.startsWith('_') && field.endsWith('_value') && normalizeGuidText(String(value || '')) === enrollmentId
      ))).length
    }

    const countEnrollmentRows = (rows: unknown[], field = 'programEnrollmentRowId') => rows.filter((row) => (
      normalizeGuidText(String((row as Record<string, unknown>)?.[field] || '')) === enrollmentId
    )).length

    if (isClientProfileForm(formName)) return selectedDetailRecord ? 1 : 0
    if (isProgramEnrollmentForm(formName)) return programEnrollmentsForClient.some((row) => normalizeGuidText(row.id) === enrollmentId) ? 1 : 0
    if (isServicesForm(formName)) return countEnrollmentRows(servicesForClient)
    if (isBedEnrollmentForm(formName)) return countEnrollmentRows(bedEnrollmentsForClient)
    if (normalize(formName).includes('adult assessment')) return countEnrollmentRows(adultAssessmentsForClient)
    if (normalize(formName).includes('child safety plan')) return countEnrollmentRows(childSafetyPlansForClient)
    if (normalize(formName).includes('focus plan')) return countEnrollmentRows(focusPlansForClient)
    if (isGoalForm(formName)) return countEnrollmentRows(goalsForClient)
    if (isVocaForm(formName)) return countEnrollmentRows(vocaFormsForClient, 'programEnrollmentId')
    if (normalize(formName).includes('initial safety plan')) return countEnrollmentRows(initialSafetyPlansForClient)

    // Client-level forms are shared across the client's active program folders.
    return getClientFormRecordCount(formName)
  }

  function formatServicesDetailValue(field: string, rawValue: string): string {
    if (field !== 'cmps_programenrollment') return rawValue

    const value = String(rawValue || '').trim()
    if (!value) return ''
    if (!isGuidText(value)) return value

    const target = normalizeGuidText(value)
    const match = programEnrollmentsForClient.find((row) => normalizeGuidText(String(row.id || '')) === target)
    if (match) {
      const parts = [match.recordId, match.program, match.serviceStartDate]
        .map((entry) => String(entry || '').trim())
        .filter(Boolean)
      return parts.length > 0 ? parts.join(' | ') : value
    }

    if (selectedProgramEnrollmentDetail && normalizeGuidText(String(selectedProgramEnrollmentDetail.id || '')) === target) {
      const parts = [
        selectedProgramEnrollmentDetail.recordId,
        selectedProgramEnrollmentDetail.values.cmps_program,
        selectedProgramEnrollmentDetail.values.cmps_servicestartdate,
      ]
        .map((entry) => String(entry || '').trim())
        .filter(Boolean)
      return parts.length > 0 ? parts.join(' | ') : value
    }

    return value
  }

  function renderClientProfileLookupField(fieldDef: { field: string; label: string; required?: boolean }, value: string) {
    return <label key={fieldDef.field} className="hub-form-field">
      <span>{fieldDef.label}{fieldDef.required ? <span className="required-inline"> *</span> : null}</span>
      <input type="text" value={formatLookupDisplayValue(fieldDef.field, value)} readOnly disabled />
    </label>
  }

  function formatLookupDisplayValue(field: string, rawValue: string): string {
    const value = String(rawValue || '').trim()
    if (!value) return ''

    const normalizedValue = normalizeGuidText(value)
    const isClientLookup = field === 'cmps_clientid' || field === 'cmps_cpid'
    if (isClientLookup) {
      const profile = [selectedDetailRecord, formReturnState?.clientProfileDetail, recordFormView?.client]
        .find((entry) => entry?.recordId && normalizeGuidText(entry.id) === normalizedValue)
      if (profile?.recordId) return profile.recordId
      return isGuidText(value) ? 'Client Profile' : value
    }

    const isProgramEnrollmentLookup = field === 'cmps_peid' || field === 'cmps_programenrollment'
    if (isProgramEnrollmentLookup) {
      const match = programEnrollmentsForClient.find((row) => normalizeGuidText(String(row.id || '')) === normalizedValue)
      if (match) return formatProgramEnrollmentLookupLabel(match)

      if (selectedProgramEnrollmentDetail && normalizeGuidText(String(selectedProgramEnrollmentDetail.id || '')) === normalizedValue) {
        return String(selectedProgramEnrollmentDetail.recordId || '').trim() || 'Program Enrollment'
      }

      return isGuidText(value) ? 'Program Enrollment' : value
    }

    return value
  }

  function mapVocaVictimizationTypes(rawValue: string): string {
    const mapped: string[] = []
    String(rawValue || '')
      .split(/[,;]+/)
      .map((entry) => entry.trim())
      .filter(Boolean)
      .forEach((entry) => {
        const source = normalize(entry)
        const options = source.includes('domestic') || source.includes('family violence')
          ? ['Domestic and/or Family Violence']
          : source.includes('adult survivor') || source.includes('sexually abused')
            ? ['Adults Sexually Abused/Assaulted as Children']
            : source.includes('elder')
              ? ['Elder Abuse or Neglect']
              : source.includes('child physical') || source.includes('physical abuse') || source.includes('neglect')
                ? ['Child Physical Abuse or Neglect']
                : source.includes('child sa') || source.includes('child sexual')
                  ? ['Child Sexual Abuse/Assault']
                  : source.includes('sexual assault')
                    ? ['Adult Sexual Assault']
                    : source.includes('labor') && source.includes('traffick')
                      ? ['Human Trafficking: Labor']
                      : source.includes('sex') && source.includes('traffick')
                        ? ['Human Trafficking: Sex']
                        : []
        options.forEach((option) => {
          if (!mapped.includes(option)) mapped.push(option)
        })
      })
    return mapped.join(', ')
  }

  function mapVocaRaceEthnicity(clientDetail: ClientProfileDetailRecord | null = selectedDetailRecord): string {
    const clientValues = clientDetail?.values as Record<string, string> | undefined
    if (!clientValues) return ''

    const ethnicity = normalize(String(clientValues.cmps_ethnicity || ''))
    if (ethnicity.includes('hispanic') || ethnicity.includes('latin')) return 'Hispanic or Latino'

    const raceMappings: Record<string, string> = {
      'american indian or alaska native': 'American Indian/Alaska Native',
      asian: 'Asian',
      'black or african american': 'Black/African American',
      'native hawaiian or pacific islander': 'Native Hawaiian and Other Pacific Islander',
      white: 'White Non-Latino/Caucasian',
    }
    const races = String(clientValues.cmps_race || '')
      .split(/[,;]+/)
      .map((entry) => entry.trim())
      .filter(Boolean)
    if (races.length > 1) return 'Multiple Races'
    if (races.length === 1) return raceMappings[normalize(races[0])] || (normalize(races[0]).includes('unknown') ? 'Not Reported' : '')
    return normalize(String(clientValues.cmps_ethnicity || '')).includes('unknown') ? 'Not Reported' : ''
  }

  function mapVocaSpecialClassifications(rawValue: string): string {
    const allowed = new Set([
      'Deaf/Hard of Hearing',
      'Homeless',
      'LGBTQ',
      'Veterans',
      'Victims with Disabilities: Cognitive/Physical/Mental',
      'Victims with Limited English Proficiency',
      'Immigrants/Refugees/Asylum Seekers',
      'Other',
    ])
    return String(rawValue || '')
      .split(/[,;]+/)
      .map((entry) => entry.trim())
      .map((entry) => Array.from(allowed).find((option) => normalize(option) === normalize(entry)) || '')
      .filter(Boolean)
      .filter((entry, index, entries) => entries.indexOf(entry) === index)
      .join(', ')
  }

  function getProgramEnrollmentClassificationsFromClient(clientDetail: ClientProfileDetailRecord): string {
    const selectedDisabilities = parseMultiValue(String(clientDetail.values.cmps_disability || ''))
    const classifications: string[] = []
    if (selectedDisabilities.some((entry) => {
      const disability = normalize(entry)
      return disability.includes('physical') || disability.includes('mental') || disability.includes('developmental')
    })) {
      classifications.push('Victims with Disabilities: Cognitive/Physical/Mental')
    }
    if (selectedDisabilities.some((entry) => normalize(entry).includes('deaf') || normalize(entry).includes('hard of hearing'))) {
      classifications.push('Deaf/Hard of Hearing')
    }
    return classifications.join(', ')
  }

  async function populateVocaFromProgramEnrollment(enrollmentId: string, clientDetail: ClientProfileDetailRecord | null = selectedDetailRecord) {
    const cleanEnrollmentId = String(enrollmentId || '').trim()
    if (!cleanEnrollmentId) return

    try {
      const enrollmentSummary = programEnrollmentsForClient.find((row) => normalizeGuidText(String(row.id || '')) === normalizeGuidText(cleanEnrollmentId))
      let victimizationSource = String(enrollmentSummary?.victimizationTypes || '')
      let specialClassificationSource = String(enrollmentSummary?.specialClassifications || '')
      try {
        const enrollmentDetail = await loadProgramEnrollmentDetailRecord(cleanEnrollmentId)
        victimizationSource = String(enrollmentDetail.values.cmps_victimtype1 || victimizationSource)
        specialClassificationSource = String(enrollmentDetail.values.cmps_clientspecialclassification1 || specialClassificationSource)
      } catch {
        // The enrollment list already carries these values when the detail request is unavailable.
      }

      const nextVictimizationTypes = mapVocaVictimizationTypes(victimizationSource)
      const nextSpecialClassifications = mapVocaSpecialClassifications(specialClassificationSource)
      const nextRaceEthnicity = mapVocaRaceEthnicity(clientDetail)
      setActiveFormSession((current) => {
        if (!current || current.kind !== 'voca-form' || String(current.values.cmps_peid || '').trim() !== cleanEnrollmentId) return current
        return {
          ...current,
          values: {
            ...current.values,
            cmps_vocavictimizationtype1: nextVictimizationTypes,
            cmps_specialclassificationofindividuals1: nextSpecialClassifications,
            cmps_vocaraceethnicity: nextRaceEthnicity,
          },
        }
      })
    } catch {
      // Keep the VOCA form usable if the enrollment detail cannot be reloaded.
    }
  }

  const activeProgramEnrollmentOptionsForServices = useMemo(() => {
    return programEnrollmentsForClient
      .filter((row) => !String(row.serviceEndDate || '').trim() || !!activeFormSession?.rowId && row.id === activeFormSession.values.cmps_peid)
      .map((row) => ({
        value: row.id,
        label: [formatProgramEnrollmentLookupLabel(row), row.program || '', row.serviceStartDate || '']
          .map((entry) => String(entry || '').trim())
          .filter(Boolean)
          .join(' | '),
        displayLabel: [formatProgramEnrollmentLookupLabel(row), row.program || '', row.serviceStartDate || '']
          .map((entry) => String(entry || '').trim())
          .filter(Boolean)
          .join(' | '),
      }))
  }, [programEnrollmentsForClient, activeFormSession])
  const activeProgramEnrollmentOptionsForGoals = useMemo(() => {
    return programEnrollmentsForClient
      .filter((row) => !String(row.serviceEndDate || '').trim())
      .map((row) => ({
        value: row.id,
        label: [formatProgramEnrollmentLookupLabel(row), row.program || '', row.serviceStartDate || '']
          .map((entry) => String(entry || '').trim())
          .filter(Boolean)
          .join(' | '),
      }))
  }, [programEnrollmentsForClient])
  const programEnrollmentSupplementalFields = getSupplementalPicklistFields(
    'Program Enrollment',
    PROGRAM_ENROLLMENT_FIELDS.map((field) => field.label),
  )

  const servicesSupplementalFields = getSupplementalPicklistFields(
    'Services',
    SERVICES_FIELD_DEFINITIONS.map((field) => field.label),
  )

  const householdSupplementalFields = getSupplementalPicklistFields(
    'Household',
    HOUSEHOLD_FIELD_DEFINITIONS.map((field) => field.label),
  )
  const householdVisibleMemberDrafts = householdClientSearchApplied
    ? householdMembersDraft.filter((member) => member.selected || householdClientSearchResults.some((client) => sameDataverseRowId(client.id, member.clientRowId)))
    : householdMembersDraft

  function updateMultiSelectValue(field: ClientProfileFieldName, option: string, checked: boolean) {
    updateClientProfileMultiSelectValue(field, option, checked)
  }

  const liveRequiredMessage = activeFormSession ? getLiveRequiredMessage(activeFormSession) : ''
  const displayedFormError = activeFormError
    && !activeFormError.startsWith('Please complete required field')
    && !activeFormError.startsWith('Please select an active Program Enrollment')
    ? activeFormError
    : liveRequiredMessage

  const recentClientActivity = useMemo(() => {
    type ActivityItem = { label: string; description: string; timestamp: string }
    const items: ActivityItem[] = []
    const add = (label: string, description: string, timestamp: unknown) => {
      const value = String(timestamp || '').trim()
      if (value && !Number.isNaN(Date.parse(value))) items.push({ label, description, timestamp: value })
    }
    if (selectedDetailRecord) {
      add('Client Profile', 'Client profile created or updated', selectedDetailRecord.values.modifiedon || selectedDetailRecord.values.cmps_creationdate)
    }
    for (const row of programEnrollmentsForClient) {
      add('Enrollment', `Program enrollment updated${row.program ? ` — ${row.program}` : ''}`, row.modifiedOn || row.createdOn)
    }
    for (const row of servicesForClient) {
      add('Service', `Service updated${row.service ? ` — ${row.service}` : ''}`, row.modifiedOn || row.createdOn)
    }
    return items.sort((a, b) => Date.parse(b.timestamp) - Date.parse(a.timestamp)).slice(0, 2)
  }, [programEnrollmentsForClient, selectedDetailRecord, servicesForClient])

  const selectedBedEnrollmentProgram = activeFormSession?.kind === 'bed-enrollment'
    ? programEnrollmentsForClient.find((row) => normalizeGuidText(String(row.id || '')) === normalizeGuidText(String(activeFormSession.values.cmps_programenrollment || '')))
    : null
  const showBedPicker = activeFormSession?.kind === 'bed-enrollment'
    && normalize(String(selectedBedEnrollmentProgram?.program || '')) !== normalize('DVSTOP')

  useEffect(() => {
    if (!selectedDetailRecord || activeFormSession?.kind !== 'program-enrollment' || activeFormSession.rowId) return
    const classifications = getProgramEnrollmentClassificationsFromClient(selectedDetailRecord)
    if (!classifications) return

    setActiveFormSession((current) => {
      if (!current || current.kind !== 'program-enrollment' || current.rowId || String(current.values.cmps_clientid || '').trim() !== String(selectedDetailRecord.id || '').trim()) return current
      if (String(current.values.cmps_clientspecialclassification1 || '').trim()) return current
      return { ...current, values: { ...current.values, cmps_clientspecialclassification1: classifications } }
    })
  }, [activeFormSession?.kind, activeFormSession?.rowId, selectedDetailRecord?.id, selectedDetailRecord?.values.cmps_disability])

  useEffect(() => {
    if (!activeFormSession) return
    const required = getActiveRequiredFields(activeFormSession)
    const requiredLabels = new Set(Array.from(required.values()).map(normalize))
    const frame = window.requestAnimationFrame(() => {
      document.querySelectorAll<HTMLElement>('.hub-form-editor .hub-form-field').forEach((container) => {
        container.classList.remove('required-field')
        const directLabel = Array.from(container.children).find((child) => child.tagName === 'SPAN')?.textContent || ''
        const controls = Array.from(container.querySelectorAll<HTMLInputElement | HTMLSelectElement | HTMLTextAreaElement>('input, select, textarea'))
        const matchesField = Array.from(required.keys()).some((field) => controls.some((control) => (
          control.name === field
          || control.id === field
          || control.id.endsWith(`-${field}`)
        )))
        const matchesLabel = requiredLabels.has(normalize(directLabel))
        if (matchesField || matchesLabel) container.classList.add('required-field')
      })
    })
    return () => window.cancelAnimationFrame(frame)
  }, [activeFormSession, liveRequiredMessage, householdMembersDraft, shelterChildAges])

  useEffect(() => {
    if (!activeFormSession) return

    const fieldDefinitions = activeFormSession.kind === 'program-enrollment' ? PROGRAM_ENROLLMENT_FIELDS
      : activeFormSession.kind === 'helpline' ? HELPLINE_FIELD_DEFINITIONS
        : activeFormSession.kind === 'shelter-screening' ? SHELTER_SCREENING_FIELD_DEFINITIONS
          : activeFormSession.kind === 'release-of-information' ? RELEASE_OF_INFORMATION_FIELDS
            : activeFormSession.kind === 'adult-assessment' ? ADULT_ASSESSMENT_FIELDS
              : activeFormSession.kind === 'child-safety-plan' ? CHILD_SAFETY_PLAN_FIELDS
                : activeFormSession.kind === 'child-assessment' ? CHILD_ASSESSMENT_FIELDS
                  : activeFormSession.kind === 'child-shelter-intake' ? CHILD_SHELTER_INTAKE_FIELDS
                    : activeFormSession.kind === 'employment-and-benefits' ? EMPLOYMENT_AND_BENEFITS_FIELDS
                      : activeFormSession.kind === 'financial-assistance' ? FINANCIAL_ASSISTANCE_FIELDS
                        : activeFormSession.kind === 'medical-consent-form' ? MEDICAL_CONSENT_FORM_FIELDS
                          : activeFormSession.kind === 'person-you-are-fleeing-profile' ? PERSON_YOU_ARE_FLEEING_PROFILE_FIELDS
                            : activeFormSession.kind === 'electronic-document' ? ELECTRONIC_DOCUMENT_FIELDS
                              : activeFormSession.kind === 'terms-and-conditions-of-service-animals' ? TERMS_AND_CONDITIONS_OF_SERVICE_ANIMALS_FIELDS
                              : activeFormSession.kind === 'contract' ? CONTRACT_FIELDS
                                : activeFormSession.kind === 'pet-companion-intake' ? PET_COMPANION_INTAKE_FIELDS
                                  : activeFormSession.kind === 'funder-transaction' ? FUNDER_TRANSACTION_FIELDS
                                    : activeFormSession.kind === 'shelter-program-guidelines' ? SHELTER_PROGRAM_GUIDELINES_FIELDS
                                      : activeFormSession.kind === 'focus-plan' ? FOCUS_PLAN_FIELDS
                                  : activeFormSession.kind === 'health-wellness' ? HEALTH_WELLNESS_FIELDS
                                    : activeFormSession.kind === 'initial-safety-plan' ? INITIAL_SAFETY_PLAN_FIELDS
                                      : activeFormSession.kind === 'acknowledgement-and-consent' ? ACKNOWLEDGEMENT_AND_CONSENT_FIELDS
                                        : activeFormSession.kind === 'animal-agreement' ? ANIMAL_AGREEMENT_FIELDS
                                          : []
    const labelForField = (field: string) => fieldDefinitions.find((definition) => definition.field === field)?.label || ''
    const formEditor = document.querySelector<HTMLElement>('.hub-form-editor')
    if (!formEditor) return

    const systemFieldNames = new Set([
      'cmps_recordid',
      'createdon',
      'createdby',
      'modifiedon',
      'modifiedby',
      'cmps_creationdate',
      'cmps_createdby',
      'cmps_modifiedby',
    ])
    const systemFieldLabels = new Set(['recordid', 'createdby', 'createdtime', 'creationdate', 'modifiedby', 'modifiedtime', 'modificationdate'])
    formEditor.querySelectorAll<HTMLElement>('.hub-form-field').forEach((container) => {
      const label = Array.from(container.children).find((child) => child.tagName === 'SPAN')?.textContent || ''
      const compactLabel = normalize(label).replace(/\s+/g, '')
      const controls = Array.from(container.querySelectorAll<HTMLInputElement | HTMLSelectElement | HTMLTextAreaElement>('input, select, textarea'))
      const isSystemField = systemFieldLabels.has(compactLabel)
        || controls.some((control) => {
          const controlName = String(control.name || '').trim()
          const controlId = String(control.id || '').trim()
          return Array.from(systemFieldNames).some((field) => controlName === field || controlId === field || controlId.endsWith(`-${field}`))
        })
      container.classList.toggle('hub-form-system-source-field', isSystemField)
    })
    formEditor.querySelectorAll<HTMLElement>('.hub-form-editor-head .hint').forEach((hint) => {
      hint.classList.toggle('hub-form-record-id-header', normalize(hint.textContent || '').startsWith('record id:'))
    })

    formEditor.querySelectorAll('.hub-form-header-image, .hub-form-text-header, .hub-form-reference-button').forEach((header) => header.remove())
    const sections = Array.from(formEditor.querySelectorAll<HTMLElement>('.hub-form-section'))
    const insertAfter = (reference: Element, header: HTMLElement) => reference.parentElement?.insertBefore(header, reference.nextSibling)
    const afterReferences = new Map<string, Element>()

    for (const header of FORM_HEADER_PLACEMENTS.filter((entry) => entry.formKind === activeFormSession.kind)) {
      const section = sections.find((element) => element.querySelector('.hub-form-section-title')?.textContent?.trim() === header.section)
      if (!section) continue

      const headerElement = header.text
        ? document.createElement('div')
        : header.modalOnly
          ? document.createElement('button')
        : document.createElement('img')
      headerElement.className = header.text ? 'hub-form-text-header' : header.modalOnly ? 'hub-form-reference-button' : 'hub-form-header-image'
      if (header.text) {
        headerElement.textContent = header.text
        headerElement.setAttribute('role', 'note')
      } else if (header.modalOnly && headerElement instanceof HTMLButtonElement && header.src) {
        const isYearTable = header.src.toLowerCase().includes('year') || header.src.toLowerCase().includes('header1')
        headerElement.type = 'button'
        headerElement.textContent = isYearTable ? 'View Dollars Per Year Reference Table' : 'View Dollars Per Month Reference Table'
        headerElement.setAttribute('aria-label', headerElement.textContent)
        headerElement.addEventListener('click', () => setReferenceTableModalSrc(header.src || ''))
      } else if (headerElement instanceof HTMLImageElement && header.src) {
        headerElement.src = encodeURI(`${import.meta.env.BASE_URL}form-headers/${header.src}`)
        headerElement.alt = 'Form instructions'
      }
      headerElement.dataset.position = header.beforeField ? 'before-field' : header.afterField ? 'after-field' : 'section-start'

      if (!header.beforeField && !header.afterField) {
        const previous = afterReferences.get(`section:${header.section}`) || section.querySelector('.hub-form-section-title')
        if (previous) {
          insertAfter(previous, headerElement)
          afterReferences.set(`section:${header.section}`, headerElement)
        }
        continue
      }

      const anchorField = header.beforeField || header.afterField || ''
      const anchorLabel = labelForField(anchorField)
      const fieldContainer = Array.from(section.querySelectorAll<HTMLElement>('.hub-form-field')).find((element) => {
        const label = Array.from(element.children).find((child) => child.tagName === 'SPAN')?.textContent?.trim() || ''
        return label.startsWith(anchorLabel)
      })
      if (!fieldContainer) continue

      if (header.beforeField) {
        fieldContainer.parentElement?.insertBefore(headerElement, fieldContainer)
      } else {
        const previous = afterReferences.get(`field:${anchorField}`) || fieldContainer
        insertAfter(previous, headerElement)
        afterReferences.set(`field:${anchorField}`, headerElement)
      }
    }
  }, [activeFormSession])

  recordFormLocation.current = { hubId: selectedHub?.id || '', clientId: selectedDetailRecord?.id || '' }
  useEffect(() => {
    if (recordFormView && (selectedHubPage !== 'forms' || selectedHub?.id !== recordFormView.hubId || recordFormView.client && recordFormView.client.id !== selectedDetailRecord?.id || !canAccessClientFormAction(PRINT_FORM_NAMES[recordFormView.kind], 'view'))) setRecordFormView(null)
  }, [selectedHubPage, selectedHub?.id, selectedDetailRecord?.id, roleProfiles, roleProfilesLoading, isUserPreview])
  function openRecordFormView(kind: string, detail: { id: string; recordId: string; values: Record<string, string | undefined> }, clientId = selectedDetailRecord?.id || '') {
    if (!selectedHub || !canAccessClientFormAction(PRINT_FORM_NAMES[kind] || kind, 'view')) return
    if (recordFormLocation.current.hubId !== selectedHub.id || clientId && recordFormLocation.current.clientId !== clientId) return
    const normalized: PrintRecordDetail = { id: detail.id, recordId: detail.recordId, values: Object.fromEntries(Object.entries(detail.values).map(([field, value]) => [field, String(value ?? '')])) }
    setRecordFormView({ kind, detail: normalized, hubId: selectedHub.id, client: clientId ? selectedDetailRecord : null, appNav: selectedAppNav })
    setActiveFormSession(null)
    setActiveFormError('')
    setSelectedHubPages((current) => ({ ...current, [selectedHub.id]: 'forms' }))
    scrollToTopOfPage()
  }

  function closeRecordFormView() {
    if (!recordFormView) return
    const origin = recordFormView
    clientConsentRequest.current += 1
    setRecordPrint(null)
    setRecordFormView(null)
    setClientConsentView(null)
    setHouseholdView(null)
    setSelectedProgramEnrollmentDetail(null)
    setSelectedServicesDetail(null)
    setSelectedBedEnrollmentDetail(null)
    setSelectedChildSafetyPlanDetail(null)
    setSelectedElectronicDocumentDetail(null)
    setSelectedAdultAssessmentDetail(null)
    setSelectedHealthWellnessDetail(null)
    setSelectedGoalDetail(null)
    setSelectedFocusPlanDetail(null)
    setSelectedInitialSafetyPlanDetail(null)
    setProgramEnrollmentDetailError('')
    setServicesDetailError('')
    setBedEnrollmentDetailError('')
    setChildSafetyPlanDetailError('')
    setElectronicDocumentDetailError('')
    setAdultAssessmentDetailError('')
    setHealthWellnessDetailError('')
    setGoalDetailError('')
    setFocusPlanDetailError('')
    setInitialSafetyPlanDetailError('')
    setShowFullDetailByHub((current) => ({ ...current, [origin.hubId]: false }))
    setActiveHelplineDetailByHub((current) => ({ ...current, [origin.hubId]: null }))
    setActiveEventDetailByHub((current) => ({ ...current, [origin.hubId]: null }))
    if (origin.client) setActiveSearchDetailByHub((current) => ({ ...current, [origin.hubId]: origin.client }))
    setSelectedAppNav(origin.client ? 'clients' : origin.appNav)
    setSelectedHubPages((current) => ({ ...current, [origin.hubId]: 'search' }))
    scrollToTopOfPage()
  }

  const recordPrintScope = JSON.stringify([selectedHub?.id, selectedAppNav, selectedHubPage, selectedDetailRecord?.id, selectedShowFullDetail, recordViewContext?.rowId, recordFormView?.detail.id, clientConsentView?.detail?.id, householdView?.detail?.id, user.id, user.email, isUserPreview, roleProfilesLoading, roleProfiles, activeFormSession?.kind])
  useEffect(() => { setRecordPrint((current) => current && current.scope !== recordPrintScope ? null : current) }, [recordPrintScope])

  function getViewedRecordForPrint(): { ref: PrintRecordRef; detail: PrintRecordDetail } | null {
    if (recordFormView && !activeFormSession && selectedHubPage === 'forms') return { ref: printRecordRef(recordFormView.kind, recordFormView.detail), detail: recordFormView.detail }
    if (view !== 'home' || selectedHubPage !== 'search') return null
    if (householdView?.detail && householdView.clientId === selectedDetailRecord?.id) return { ref: printRecordRef('household', householdView.detail), detail: householdView.detail as PrintRecordDetail }
    if (selectedShowFullDetail && selectedDetailRecord) return { ref: printRecordRef('client-profile', selectedDetailRecord), detail: selectedDetailRecord as PrintRecordDetail }
    if (!recordViewContext) {
      if (clientConsentView?.detail && clientConsentView.clientId === selectedDetailRecord?.id) return { ref: printRecordRef(clientConsentView.kind, clientConsentView.detail), detail: clientConsentView.detail }
      return null
    }
    const kind = PRINT_TABLE_KINDS[recordViewContext.tableAlias]
    const details = {
      'client-profile': selectedShowFullDetail ? selectedDetailRecord : null, 'program-enrollment': selectedProgramEnrollmentDetail,
      services: selectedServicesDetail, 'bed-enrollment': selectedBedEnrollmentDetail, helpline: selectedHelplineDetail, event: selectedEventDetail,
      'child-safety-plan': selectedChildSafetyPlanDetail, 'electronic-document': selectedElectronicDocumentDetail, 'adult-assessment': selectedAdultAssessmentDetail,
      'health-wellness': selectedHealthWellnessDetail, goals: selectedGoalDetail, 'focus-plan': selectedFocusPlanDetail, 'initial-safety-plan': selectedInitialSafetyPlanDetail,
    } as Record<string, PrintRecordDetail | null>
    const detail = details[kind]
    return kind && detail && isGuidText(detail.id) ? { ref: printRecordRef(kind, detail), detail } : null
  }
  const viewedPrintRecord = getViewedRecordForPrint()
  const canPrintViewedRecord = !!viewedPrintRecord && canAccessClientFormAction(viewedPrintRecord.ref.formName, 'view')
  function openRecordPrint() {
    if (!viewedPrintRecord || !canPrintViewedRecord) return
    setRecordPrint({ scope: recordPrintScope, mode: 'record', record: { ref: { ...viewedPrintRecord.ref }, detail: { ...viewedPrintRecord.detail, values: { ...viewedPrintRecord.detail.values } } } })
  }
  function openClientPrint() {
    if (!selectedDetailRecord || !canAccessClientFormAction('Client Profile', 'view')) return
    setRecordPrint({ scope: recordPrintScope, mode: 'client' })
  }
  function editViewedRecord() {
    if (!viewedPrintRecord || !canAccessClientFormAction(viewedPrintRecord.ref.formName, 'edit')) return
    const { ref } = viewedPrintRecord
    switch (ref.kind) {
      case 'client-profile': editClientProfileFromDetail(); break
      case 'program-enrollment': void editProgramEnrollmentRecord(ref.id, ref.recordId); break
      case 'services': void editServicesRecord(ref.id, ref.recordId); break
      case 'bed-enrollment': void editBedEnrollmentRecord(ref.id, ref.recordId); break
      case 'helpline': editHelplineFromDetail(); break
      case 'event': editEventFromDetail(); break
      case 'household': setHouseholdView(null); void editHouseholdRecord(ref.id, ref.recordId); break
      case 'child-safety-plan': void editChildSafetyPlanRecord(ref.id, ref.recordId); break
      case 'electronic-document': void editElectronicDocumentRecord(ref.id, ref.recordId); break
      case 'adult-assessment': void editAdultAssessmentRecord(ref.id, ref.recordId); break
      case 'health-wellness': void editHealthWellnessRecord(ref.id, ref.recordId); break
      case 'focus-plan': void editFocusPlanRecord(ref.id, ref.recordId); break
      case 'initial-safety-plan': void editInitialSafetyPlanRecord(ref.id, ref.recordId); break
      case 'goals': { const row = goalsForClient.find((entry) => entry.id === ref.id); if (row) void editGoalRecord(row); break }
      default: void editClientConsentForm(ref.kind as ClientConsentFormKind, ref)
    }
  }
  function closeViewedRecordActions() {
    if (recordFormView) { closeRecordFormView(); return }
    if (householdView) { clientConsentRequest.current++; setHouseholdView(null) }
    else if (clientConsentView) { clientConsentRequest.current++; setClientConsentView(null) }
    else closeCurrentRecordView()
  }
  function renderViewFormActions() {
    if (!viewedPrintRecord) return null
    return <aside className="hub-form-fixed-actions hub-view-form-actions" aria-label="Form actions">
      <div><p className="eyebrow">Form actions</p><h3>{viewedPrintRecord.ref.formName}</h3><p className="hint">Record: {viewedPrintRecord.ref.recordId}</p></div>
      <div className="hub-form-fixed-actions-buttons">
        <button type="button" className="secondary" onClick={closeViewedRecordActions}>{clientConsentView || householdView ? 'Back to Client Profile' : recordViewBackButtonLabel}</button>
        {canAccessClientFormAction(viewedPrintRecord.ref.formName, 'edit') ? <button type="button" className="secondary" onClick={editViewedRecord}>Edit</button> : null}
        {canPrintViewedRecord ? <button type="button" className="primary" onClick={openRecordPrint}>Print record</button> : null}
      </div>
    </aside>
  }

  const headerLogoSrc = `${import.meta.env.BASE_URL}compass-logo.png`

  useEffect(() => {
    window.localStorage.setItem('compass-theme', theme)
  }, [theme])

  return (
    <div className={`compass-app theme-${theme}`}>
      {recordSaveResult ? <RecordSaveDialog result={recordSaveResult}
        canOpenClient={canOpenSavedClient() && !!(recordSaveResult.clientId || recordSaveResult.enrollmentId)}
        clientUnavailableReason={!canOpenSavedClient() ? 'Your assigned COMPASS role does not allow viewing Client Profiles in this program.' : undefined}
        canCreateAnotherService={canStartAnotherService()}
        onCreateAnotherService={startAnotherService}
        onChoose={chooseRecordSaveDestination} /> : null}
      <div className="aurora" aria-hidden="true" />

      <header className="top-nav">
        <div className="top-nav-main">
          <div className="top-nav-brand-wrap">
            <img
              src={headerLogoSrc}
              alt="Compass"
              className="top-nav-logo"
            />
          </div>

          {view === 'home' ? (
            selectedHub ? <span className="chip subtle top-nav-context-chip">{hubLabel(selectedHub)}</span> : null
          ) : (
            <span className="chip subtle top-nav-context-chip">IT Admin</span>
          )}
        </div>

        <MessageRefreshBanner messages={homeMessages.messages} now={homeMessages.now} />

        <div className="actions">
          <AppVersionBadge />
          {IS_WAVE2_SANDBOX ? <button type="button" className="secondary"
            disabled={activeFormSaving || importingRoles || importingBeds || funderAdminSaving || savingRoleIndex !== null || savingPicklistIndex !== null || archiveActionLoading}
            onClick={() => {
              if (activeFormSession && !window.confirm('Opening Wave 2 preview will discard the open, unsaved form. Continue?')) return
              openWave2Preview()
            }}>Wave 2 preview</button> : null}
          <button
            className="theme-toggle"
            type="button"
            aria-pressed={theme === 'dark'}
            aria-label={`Switch to ${theme === 'light' ? 'dark' : 'light'} mode`}
            onClick={() => setTheme(theme === 'light' ? 'dark' : 'light')}
          >
            <span aria-hidden="true">{theme === 'light' ? '☾' : '☀'}</span>
            {theme === 'light' ? 'Dark mode' : 'Light mode'}
          </button>
          {canAccessRoleAdmin ? (
            <button className="secondary top-nav-admin-button" onClick={() => setView(view === 'home' ? 'admin' : 'home')}>
              {view === 'home' ? 'IT Admin' : 'Back to Home'}
            </button>
          ) : null}
          <input
            ref={rolesFileRef}
            className="hidden-input"
            type="file"
            accept=".xlsx,.xls"
            onChange={(event) => { void onPickRoleWorkbook(event) }} disabled={isUserPreview}
          />
        </div>
      </header>

      {view === 'home' ? (
        <main className="dashboard-shell">
          <aside className="dashboard-sidebar">
            <section className="panel sidebar-panel app-nav-panel">
              <div className="sidebar-head">
                <p className="eyebrow">Workspace</p>
                <h2>Navigation</h2>
                <p className="hint">Move between search, client lists, programs, and placeholder work areas.</p>
              </div>

              <div className="hub-nav-list app-nav-list">
                <button
                  type="button"
                  className={`hub-nav-item app-nav-item${selectedAppNav === 'home' ? ' active' : ''}`}
                  onClick={openHomeNav}
                >
                  <span className="hub-nav-title">Home</span>
                  <span className="hub-nav-meta">Our Home space is being refreshed.</span>
                </button>

                <button
                  type="button"
                  className={`hub-nav-item app-nav-item${selectedAppNav === 'clients' ? ' active' : ''}`}
                  onClick={openClientsNav}
                >
                  <span className="hub-nav-title">Clients</span>
                  <span className="hub-nav-meta">List and open client records.</span>
                </button>

                <div className={`hub-nav-item app-nav-my-work${selectedAppNav === 'my-work' ? ' active' : ''}`}>
                  <button
                    type="button"
                    className="app-nav-my-work-trigger"
                    onClick={() => {
                      setSelectedAppNav('my-work')
                      setMyWorkNavExpanded((current) => !current)
                      if (selectedHub) setSelectedHubPages((current) => ({ ...current, [selectedHub.id]: 'search' }))
                    }}
                  >
                    <span className="hub-nav-title">My Work</span>
                    <span className="hub-nav-meta">Open personal queues and assignments.</span>
                  </button>

                  {selectedAppNav === 'my-work' && myWorkNavExpanded ? (
                    <div className="hub-nav-dropdown app-nav-my-work-dropdown">
                      <span className="hub-nav-dropdown-label">My Work Tools</span>
                      <div className="hub-nav-dropdown-actions">
                        <button type="button" className={`hub-nav-dropdown-item${selectedMyWorkPage === 'case-load' ? ' active' : ''}`} onClick={() => openMyWorkNav('case-load')}>
                          Case Load
                        </button>
                        {canViewAllWork ? (
                          <button type="button" className={`hub-nav-dropdown-item${selectedMyWorkPage === 'all-work' ? ' active' : ''}`} onClick={() => openMyWorkNav('all-work')}>
                            All Work
                          </button>
                        ) : null}
                        <button type="button" className={`hub-nav-dropdown-item${selectedMyWorkPage === 'pending-items' ? ' active' : ''}`} onClick={() => openMyWorkNav('pending-items')}>
                          Pending Items {pendingVocaItems.length > 0 ? <span className="pending-item-count">{pendingVocaItems.length}</span> : null}
                        </button>
                      </div>
                    </div>
                  ) : null}
                </div>

                <div className={`hub-nav-item app-nav-programs${selectedAppNav === 'programs' || selectedHubPage === 'forms' ? ' active' : ''}`}>
                  <button
                    type="button"
                    className="app-nav-programs-trigger"
                    onClick={() => {
                      setSelectedAppNav('programs')
                      if (selectedHub) setExpandedProgramNavId((current) => current || selectedHub.id)
                    }}
                  >
                    <span className="hub-nav-title">Programs</span>
                    <span className="hub-nav-meta">Open search, forms, and workflow views for available hubs.</span>
                  </button>

                  {selectedAppNav === 'programs' || selectedHubPage === 'forms' ? (
                    <div className="app-nav-subtree">
                      {availableHubs.map((hub) => {
                        const isExpanded = expandedProgramNavId === hub.id
                        const isHubActive = selectedHub?.id === hub.id
                        return (
                          <details
                            key={`program-nav-${hub.id}`}
                            className={`hub-nav-item app-nav-program-item${isHubActive ? ' active' : ''}`}
                            open={isExpanded}
                          >
                            <summary
                              onClick={(event) => {
                                event.preventDefault()
                                setSelectedAppNav('programs')
                                setExpandedProgramNavId((current) => current === hub.id ? '' : hub.id)
                                setSelectedHubId(hub.id)
                              }}
                            >
                              <span className="hub-nav-title">{hub.displayTitle || hub.title}</span>
                              <span className="hub-nav-meta">{hub.audience}</span>
                            </summary>
                            <div className="hub-nav-dropdown">
                              <span className="hub-nav-dropdown-label">Program Tools</span>
                              <div className="hub-nav-dropdown-actions">
                                <button
                                  type="button"
                                  className={`hub-nav-dropdown-item${isHubActive && selectedHubPage === 'search' ? ' active' : ''}`}
                                  onClick={() => openProgramsNav(hub.id, 'search')}
                                >
                                  Search
                                </button>
                                <button
                                  type="button"
                                  className={`hub-nav-dropdown-item${isHubActive && selectedHubPage === 'forms' ? ' active' : ''}`}
                                  onClick={() => openProgramsNav(hub.id, 'forms')}
                                >
                                  Forms
                                </button>
                                <button
                                  type="button"
                                  className={`hub-nav-dropdown-item${isHubActive && selectedHubPage === 'workflows' ? ' active' : ''}`}
                                  onClick={() => openProgramsNav(hub.id, 'workflows')}
                                >
                                  Workflow
                                </button>
                              </div>
                            </div>
                          </details>
                        )
                      })}
                    </div>
                  ) : null}
                </div>

                {canViewReports ? <button
                  type="button"
                  className={`hub-nav-item app-nav-item${selectedAppNav === 'reports' ? ' active' : ''}`}
                  onClick={() => { setSelectedAppNav('reports'); if (selectedHub) setSelectedHubPages((current) => ({ ...current, [selectedHub.id]: 'search' })) }}
                >
                  <span className="hub-nav-title">Reports</span>
                  <span className="hub-nav-meta">Run reports and export results.</span>
                </button> : null}

                {canAccessRoleAdmin ? (
                  <>
                    <button
                      type="button"
                      className={`hub-nav-item app-nav-item${selectedAppNav === 'bed-management' ? ' active' : ''}`}
                      onClick={() => {
                        setSelectedAppNav('bed-management')
                        if (selectedHub) setSelectedHubPages((current) => ({ ...current, [selectedHub.id]: 'search' }))
                      }}
                    >
                      <span className="hub-nav-title">Bed Management</span>
                      <span className="hub-nav-meta">Review and import bed records.</span>
                    </button>
                    <button
                      type="button"
                      className={`hub-nav-item app-nav-item${selectedAppNav === 'archived-records' ? ' active' : ''}`}
                      onClick={() => {
                        setSelectedAppNav('archived-records')
                        if (selectedHub) setSelectedHubPages((current) => ({ ...current, [selectedHub.id]: 'search' }))
                      }}
                    >
                      <span className="hub-nav-title">Archived Records</span>
                      <span className="hub-nav-meta">Search and restore archived business records.</span>
                    </button>
                  </>
                ) : null}
              </div>
            </section>
          </aside>

          <section className="hub-main">
            {selectedAppNav === 'home' ? <HomeMessages state={homeMessages} /> : selectedAppNav === 'reports' ? (
              <>
                <section className="panel spotlight hub-hero"><p className="eyebrow">Reports</p><h2>Reports</h2><p className="subtitle">Run reports and export results.</p></section>
                <Suspense fallback={<p className="hint">Loading the report library…</p>}><LegacyReportsPanel canManage={canAccessRoleAdmin && !isUserPreview} canView={canViewReports} /></Suspense>
              </>
            ) : selectedHub ? (
              <>
                {roleProfilesLoading ? <p className="hint">Loading role permissions...</p> : null}
                {roleProfilesError ? <p className="error">{roleProfilesError}</p> : null}

                <section className="panel spotlight hub-hero">
                  <p className="eyebrow">{currentAppNavLabel}</p>
                  <h2>{heroTitle}</h2>
                  <p className="subtitle">{heroSummary}</p>
                  <div className="inline hub-audience-row">
                    <span className="chip">{selectedHub.displayTitle || selectedHub.title}</span>
                    <span className="chip subtle">{selectedHub.audience}</span>
                    <span className="chip subtle">{heroContextLabel}</span>
                  </div>
                </section>

                <section inert={activeFormSaving} aria-busy={activeFormSaving} className={`hub-section-grid${activeFormSession && selectedHubPage === 'forms' ? ' hub-section-grid-with-actions' : ''}${viewedPrintRecord ? ' hub-view-actions-layout' : ''}`}>
                  {viewedPrintRecord ? renderViewFormActions() : null}
                  {selectedAppNav === 'my-work' && selectedHubPage !== 'forms' ? (
                    <>
                      {selectedMyWorkPage === 'case-load' ? (
                        <article className="panel wide hub-card" key="my-work-case-load">
                          <h3>Case Load</h3>
                          <p className="hint">Clients currently assigned to {user.name || user.email || 'the logged-in user'} through Program Enrollment.</p>
                          {caseLoadLoading ? <p className="hint">Loading your case load...</p> : null}
                          {caseLoadError ? <p className="error">{caseLoadError}</p> : null}
                          {!caseLoadLoading && !caseLoadError && caseLoadRecords.length === 0 ? <p className="hint">No clients are currently assigned to you.</p> : null}
                          <WorkRecordSearch key={`case-load-${user.id || user.email}`} identity="case-load" records={caseLoadRecords} getRecord={(row) => row} fullProfile busy={caseLoadLoading}>{(rows) => renderWorkRecordCards(rows)}</WorkRecordSearch>
                        </article>
                      ) : selectedMyWorkPage === 'all-work' ? (
                        <article className="panel wide hub-card" key="my-work-all-work">
                          <h3>All Work</h3>
                          <p className="hint">
                            {currentWorkHierarchyLevel === 'supervisor'
                              ? 'Your active work and active work assigned to staff in your program.'
                              : currentWorkHierarchyLevel === 'manager'
                                ? 'Active work assigned to supervisors in your program.'
                                : 'Active work assigned to managers in your program scope.'}
                          </p>
                          {allWorkLoading ? <p className="hint">Loading team work...</p> : null}
                          {allWorkError ? <p className="error">{allWorkError}</p> : null}
                          {!allWorkLoading && !allWorkError && allWorkRecords.length === 0 ? <p className="hint">No active team work was found.</p> : null}
                          <WorkRecordSearch key={`all-work-${user.id || user.email}`} identity="all-work" records={allWorkRecords} getRecord={(row) => row} fullProfile busy={allWorkLoading}>{(rows) => renderWorkRecordCards(rows, true)}</WorkRecordSearch>
                        </article>
                      ) : (
                        <article className="panel wide hub-card" key="my-work-pending-items">
                          <h3>Pending Items</h3>
                          <p className="hint">Items requiring follow-up for your assigned clients.</p>
                          {canViewStaffApprovals ? (
                            <section className="hub-client-quick-record" aria-label="Staff approvals">
                              <h4>Staff Approvals</h4>
                              <p className="hint">Items requiring staff approval will appear here and are intentionally excluded from All Work.</p>
                            </section>
                          ) : null}
                          {pendingVocaLoading ? <p className="hint">Loading pending items...</p> : null}
                          {pendingVocaError ? <p className="error">{pendingVocaError}</p> : null}
                          {!pendingVocaLoading && !pendingVocaError && pendingVocaItems.length === 0 ? <p className="hint">No pending items.</p> : null}
                          <WorkRecordSearch key={`pending-items-${user.id || user.email}`} identity="pending-items" records={pendingVocaItems} busy={pendingVocaLoading} getRecord={(item) => ({ ...item.client, enrollments: [{ enrollmentId: item.enrollmentId, program: item.program, recordId: item.enrollmentRecordId, startDate: item.startDate, endDate: item.endDate }] })}>{(rows) => <>{rows.map((item) => (
                            <article className="client-result-card pending-item-card" key={item.enrollmentId}>
                              <div className="client-result-card-head"><h4>VOCA Record Needed</h4><span className="chip subtle">{item.client.recordId || 'Client Profile'}</span></div>
                              <p>{item.reason === 'linked-service'
                                ? 'A VOCA record needs to be created because a linked Service is VOCA funded while this Program Enrollment is funded differently.'
                                : 'A VOCA record needs to be created for this client and Program Enrollment.'}</p>
                              <div className="client-result-card-meta">
                                <div className="client-result-card-item"><span>Client</span><strong>{item.client.name || '-'}</strong></div>
                                <div className="client-result-card-item"><span>HMIS ID</span><strong>{item.client.hmisId || '-'}</strong></div>
                                <div className="client-result-card-item"><span>Program</span><strong>{item.program || '-'}</strong></div>
                                <div className="client-result-card-item"><span>Enrollment Start Date</span><strong>{item.startDate || '-'}</strong></div>
                              </div>
                              <div className="client-result-card-actions">
                                {canCreateForm('VOCA Form') ? (<button type="button" className="primary" onClick={() => {
                                  if (!requireFormCreateAccess('VOCA Form')) return
                                  rememberFormReturnState()
                                  setSelectedAppNav('clients')
                                  if (selectedHub) setSelectedSearchFormByHub((current) => ({ ...current, [selectedHub.id]: 'Client Profile' }))
                                  void openClientProfileDetail(item.client.id, item.client.recordId).then(async (detail) => {
                                    if (!detail) return
                                    const recordId = await generateAppRecordId(VOCA_FORMS_TABLE_ALIAS, 'VOCA')
                                    setActiveFormSession({ kind: 'voca-form', formName: 'VOCA Form', tableAlias: VOCA_FORMS_TABLE_ALIAS, rowId: '', recordId, values: { cmps_recordid: recordId, cmps_peid: item.enrollmentId } })
                                    void populateVocaFromProgramEnrollment(item.enrollmentId, detail)
                                    if (selectedHub) setSelectedHubPages((current) => ({ ...current, [selectedHub.id]: 'forms' }))
                                  })
                                }}>
                                  Start VOCA Record
                                </button>) : null}
                              </div>
                            </article>
                          ))}</>}</WorkRecordSearch>
                        </article>
                      )}
                    </>
                  ) : selectedAppNav === 'bed-management' && selectedHubPage !== 'forms' && canAccessRoleAdmin ? (
                    <article className="panel wide hub-card" key="bed-management">
                      <div className="hub-form-editor-head">
                        <div>
                          <h3>Bed Management</h3>
                          <p className="hint">Active records from the cmps_bedses table. Import a CSV using the six Dataverse column headers shown below.</p>
                        </div>
                        <div className="role-admin-toolbar">
                          <button className="secondary" type="button" onClick={onClickImportBeds} disabled={importingBeds || bedAdminLoading}>
                            {importingBeds ? 'Importing Beds...' : 'Import CSV'}
                          </button>
                          <input
                            ref={bedsCsvFileRef}
                            className="hidden-input"
                            type="file"
                            accept=".csv,text/csv"
                            onChange={(event) => { void onPickBedsCsv(event) }} disabled={isUserPreview}
                          />
                        </div>
                      </div>

                      <p className="hint">Required headers: cmps_status, cmps_program, cmps_unit, cmps_unittype, cmps_bedname, cmps_floor.</p>
                      {bedAdminStatus ? <p className="success">{bedAdminStatus}</p> : null}
                      {bedAdminError ? <p className="error">{bedAdminError}</p> : null}
                      {bedAdminLoading ? <p className="hint">Loading bed records...</p> : null}

                      {!bedAdminLoading ? (
                        <div className="hub-search-results-table-wrap">
                          <table className="hub-search-results-table">
                            <thead>
                              <tr><th>Action</th><th>Bed</th><th>Program</th><th>Unit</th><th>Unit Type</th><th>Floor</th><th>Status</th></tr>
                            </thead>
                            <tbody>
                              {bedAdminRecords.map((bed) => (
                                <tr key={bed.id}>
                                  <td>{renderArchiveRecordButton(BEDS_TABLE_ALIAS, bed.id, `Bed ${bed.name}`)}</td>
                                  <td>{bed.name || '-'}</td>
                                  <td>{bed.program || '-'}</td>
                                  <td>{bed.unit || '-'}</td>
                                  <td>{bed.unitType || '-'}</td>
                                  <td>{bed.floor || '-'}</td>
                                  <td>{bed.status || '-'}</td>
                                </tr>
                              ))}
                              {bedAdminRecords.length === 0 ? <tr><td colSpan={7}>No active bed records found.</td></tr> : null}
                            </tbody>
                          </table>
                        </div>
                      ) : null}
                    </article>
                  ) : selectedAppNav === 'archived-records' && selectedHubPage !== 'forms' && canAccessRoleAdmin ? (
                    <article className="panel wide hub-card" key="archived-records">
                      <div className="hub-form-editor-head">
                        <div>
                          <h3>Archived Records</h3>
                          <p className="hint">Choose a table, then search its archived records by record ID, name, HMIS ID, or Dataverse row ID.</p>
                        </div>
                      </div>

                      <div className="hub-search-controls">
                        <label className="hub-form-field">
                          <span>Table</span>
                          <select
                            value={archivedTableKey}
                            onChange={(event) => {
                              setArchivedTableKey(event.target.value)
                              setArchivedRecords([])
                              setArchivedRecordsError('')
                              setArchivedRecordsStatus('')
                            }}
                          >
                            {ARCHIVE_TABLES.map((table) => <option key={table.key} value={table.key}>{table.label}</option>)}
                          </select>
                        </label>
                        <label className="hub-form-field">
                          <span>Search archived records</span>
                          <input
                            type="search"
                            value={archivedSearchQuery}
                            onChange={(event) => setArchivedSearchQuery(event.target.value)}
                            onKeyDown={(event) => { if (event.key === 'Enter') void runArchivedRecordSearch() }}
                            placeholder="Record ID, name, HMIS ID, or row ID"
                          />
                        </label>
                        <button type="button" className="primary" onClick={() => { void runArchivedRecordSearch() }} disabled={archivedRecordsLoading || archiveActionLoading}>
                          {archivedRecordsLoading ? 'Searching...' : 'Search'}
                        </button>
                      </div>

                      {archivedRecordsError ? <p className="error">{archivedRecordsError}</p> : null}
                      {archivedRecordsStatus ? <p className="success">{archivedRecordsStatus}</p> : null}
                      {archivedRecords.length > 0 ? (
                        <div className="hub-search-results-table-wrap">
                          <table className="hub-search-results-table">
                            <thead><tr><th>Action</th><th>Record ID</th><th>Name</th><th>Row ID</th><th>Modified</th></tr></thead>
                            <tbody>
                              {archivedRecords.map((record) => (
                                <tr key={`${record.tableAlias}-${record.id}`}>
                                  <td><button type="button" className="secondary hub-search-open-button" onClick={() => { void restoreArchivedRecord(record) }} disabled={isUserPreview || (archiveActionLoading)}>Restore</button></td>
                                  <td>{record.recordId || '-'}</td>
                                  <td>{record.displayName || '-'}</td>
                                  <td>{record.id}</td>
                                  <td>{formatSystemTimestamp(record.modifiedOn || record.createdOn) || '-'}</td>
                                </tr>
                              ))}
                            </tbody>
                          </table>
                        </div>
                      ) : null}
                    </article>
                  ) : selectedHubPage === 'search' ? (
                    <>
                    {selectedDetailRecord ? (
                      selectedShowFullDetail ? (
                        <article className="panel wide hub-card hub-form-editor hub-view-record-editor" key={`${selectedHub.id}-search-full-record`}>
                          <div className="hub-form-editor-head">
                            <div>
                              <h3>Client Profile Full Record</h3>
                              <p className="hint">Record ID: {selectedDetailRecord.recordId || 'Unknown'}</p>
                            </div>
                            <div className="hub-form-editor-actions">
                              <button type="button" className="secondary" onClick={closeCurrentRecordView}>{recordViewBackButtonLabel}</button>
                              {canAccessClientFormAction('Client Profile', 'edit') ? (<button type="button" className="secondary" onClick={editClientProfileFromDetail}>Edit</button>) : null}
                              <ClientReportExclusionControl profileId={selectedDetailRecord.id} canManage={canAccessRoleAdmin && !isUserPreview} savedBy={String(authenticatedUser.name || authenticatedUser.email || authenticatedUser.id || '')} />
                            </div>
                          </div>

                          {normalize(selectedDetailRecord.values.cmps_alertlist || '') === 'yes' ? (
                            <div className="client-alert-notice">
                              <div className="client-alert-notice-head">** NOTICE **</div>
                              <div className="client-alert-notice-body">
                                <div>This client is on the ALERT LIST.</div>
                                <div>{selectedDetailRecord.values.cmps_alertlistreason ? `See reason below: ${selectedDetailRecord.values.cmps_alertlistreason}` : 'See reason below.'}</div>
                              </div>
                            </div>
                          ) : null}

                          <ReadOnlyFormSections
                            fields={CLIENT_PROFILE_FIELDS.filter((fieldDef) => fieldDef.field !== 'cmps_picture')}
                            values={selectedDetailRecord.values}
                            sections={['Main', 'Previous Location', 'Notes']}
                            idPrefix="client-profile-view"
                            isVisible={(field) => {
                              const definition = CLIENT_PROFILE_FIELDS.find((entry) => entry.field === field.field)
                              return !!definition && isClientProfileFieldVisible(definition, selectedDetailRecord.values)
                            }}
                          />
                        </article>
                      ) : selectedProgramEnrollmentDetail ? (
                        <article className={`panel wide hub-card hub-form-editor hub-view-record-editor${selectedServicesDetail || selectedBedEnrollmentDetail ? ' hub-program-child-view-active' : ''}`} key={`${selectedHub.id}-search-program-full-record`}>
                          <div className="hub-form-editor-head">
                            <div>
                              <h3>Program Enrollment Full Record</h3>
                              <p className="hint">Record ID: {selectedProgramEnrollmentDetail.recordId || 'Unknown'}</p>
                            </div>
                            <div className="hub-form-editor-actions">
                              <button type="button" className="secondary" onClick={closeCurrentRecordView}>{recordViewBackButtonLabel}</button>
                              {canAccessClientFormAction('Program Enrollment', 'edit') ? (<button
                                type="button"
                                className="secondary"
                                onClick={() => { void editProgramEnrollmentRecord(selectedProgramEnrollmentDetail.id, selectedProgramEnrollmentDetail.recordId) }}
                              >
                                Edit
                              </button>) : null}
                            </div>
                          </div>

                          <ReadOnlyFormSections
                            fields={PROGRAM_ENROLLMENT_FIELDS.filter((fieldDef, index, all) => all.findIndex((entry) => entry.field === fieldDef.field) === index)}
                            values={selectedProgramEnrollmentDetail.values}
                            sections={['Enrollment Details', 'Incident Information', 'Program Notes', 'Discharge Summary', 'Household Demographics']}
                            idPrefix="program-enrollment-view"
                            isVisible={(field) => isProgramEnrollmentFieldVisible(field, selectedProgramEnrollmentDetail.values)}
                            formatValue={(field, value) => field.field === 'cmps_clientid' ? formatLookupDisplayValue(field.field, value) : value}
                          />

                          {selectedServicesDetail ? (
                            <section className="hub-client-quick-record hub-program-child-view" style={{ marginTop: '1rem' }}>
                              <div className="hub-client-quick-record-head">
                                <h4>Services Full Record</h4>
                                <div className="hub-form-editor-actions">
                                  <button type="button" className="secondary" onClick={closeCurrentRecordView}>{recordViewBackButtonLabel}</button>
                                  {canAccessClientFormAction('Services', 'edit') ? (<button
                                    type="button"
                                    className="secondary"
                                    onClick={() => { void editServicesRecord(selectedServicesDetail.id, selectedServicesDetail.recordId) }}
                                  >
                                    Edit
                                  </button>) : null}
                                </div>
                              </div>
                              <ReadOnlyFormSections
                                fields={SERVICES_FIELD_DEFINITIONS}
                                values={selectedServicesDetail.values}
                                sections={['Main', 'Service Details', 'Service Notes', 'VOCA Direct Services']}
                                idPrefix="program-services-view"
                                isVisible={(field) => isServicesFieldVisible(field.field, selectedServicesDetail.values as Record<string, string>, programEnrollmentsForClient)}
                                formatValue={(field, value) => formatServicesDetailValue(field.field, value)}
                              />
                            </section>
                          ) : (
                            <section className="hub-client-quick-record hub-program-related-list" style={{ marginTop: '1rem' }}>
                              <div className="hub-client-quick-record-head">
                                <h4>Services For This Program Enrollment</h4>
                              </div>

                              {servicesLoading ? <p className="hint">Loading Services records...</p> : null}
                              {servicesError ? <p className="error">{servicesError}</p> : null}
                              {servicesDetailLoading ? <p className="hint">Loading Services record...</p> : null}
                              {servicesDetailError ? <p className="error">{servicesDetailError}</p> : null}

                              {!servicesLoading && !servicesError ? (
                                servicesForProgramEnrollment.length > 0 ? (
                                  <div className="hub-search-results-table-wrap">
                                    <SortableRecordTable className="hub-search-results-table">
                                      <thead>
                                        <tr>
                                          <th>Open</th>
                                          <th>Record ID</th>
                                          <th>Service Category</th>
                                          <th>Service</th>
                                          <th>Date of Services</th>
                                          <th>Funder</th>
                                          <th>Minutes</th>
                                          <th>Service Time</th>
                                        </tr>
                                      </thead>
                                      <tbody>
                                        {servicesForProgramEnrollment.map((row) => (
                                          <tr key={row.id || row.recordId}>
                                            <td>
                                              <button
                                                type="button"
                                                className="secondary hub-search-open-button"
                                                onClick={() => { void openServicesDetail(row.id, row.recordId) }}
                                              >
                                                View Full Record
                                              </button>
                                              {canAccessClientFormAction('Services', 'edit') ? (<button
                                                type="button"
                                                className="secondary hub-search-open-button"
                                                onClick={() => { void editServicesRecord(row.id, row.recordId) }}
                                              >
                                                Edit
                                              </button>) : null}
                                              {renderArchiveRecordButton(SERVICES_TABLE_ALIAS, row.id, row.recordId)}
                                            </td>
                                            <td>{row.recordId || '-'}</td>
                                            <td>{row.serviceCategory || '-'}</td>
                                            <td>{row.service || '-'}</td>
                                            <td>{row.dateOfServices || '-'}</td>
                                            <td>{row.funder || '-'}</td>
                                            <td>{row.minutes || '-'}</td>
                                            <td>{row.serviceTime || '-'}</td>
                                          </tr>
                                        ))}
                                      </tbody>
                                    </SortableRecordTable>
                                  </div>
                                ) : <p className="hint">No Services records linked to this Program Enrollment yet.</p>
                              ) : null}
                            </section>
                          )}

                          {selectedBedEnrollmentDetail ? (
                            <section className="hub-client-quick-record hub-program-child-view" style={{ marginTop: '1rem' }}>
                              <div className="hub-client-quick-record-head">
                                <h4>Bed Enrollment Full Record</h4>
                                <div className="hub-form-editor-actions">
                                  <button type="button" className="secondary" onClick={closeCurrentRecordView}>{recordViewBackButtonLabel}</button>
                                  {canAccessClientFormAction('Bed Enrollment', 'edit') ? (<button
                                    type="button"
                                    className="secondary"
                                    onClick={() => { void editBedEnrollmentRecord(selectedBedEnrollmentDetail.id, selectedBedEnrollmentDetail.recordId) }}
                                  >
                                    Edit
                                  </button>) : null}
                                </div>
                              </div>
                              <ReadOnlyFormSections
                                fields={BED_ENROLLMENT_FIELD_DEFINITIONS}
                                values={selectedBedEnrollmentDetail.values}
                                sections={['Main']}
                                idPrefix="program-bed-enrollment-view"
                                getSection={() => 'Main'}
                                formatValue={(field, value) => formatServicesDetailValue(field.field, value)}
                              />
                            </section>
                          ) : (
                            <section className="hub-client-quick-record hub-program-related-list" style={{ marginTop: '1rem' }}>
                              <div className="hub-client-quick-record-head">
                                <h4>Bed Enrollments For This Program Enrollment</h4>
                              </div>

                              {bedEnrollmentLoading ? <p className="hint">Loading Bed Enrollment records...</p> : null}
                              {bedEnrollmentError ? <p className="error">{bedEnrollmentError}</p> : null}
                              {bedEnrollmentDetailLoading ? <p className="hint">Loading Bed Enrollment record...</p> : null}
                              {bedEnrollmentDetailError ? <p className="error">{bedEnrollmentDetailError}</p> : null}

                              {!bedEnrollmentLoading && !bedEnrollmentError ? (
                                bedEnrollmentsForProgramEnrollment.length > 0 ? (
                                  <div className="hub-search-results-table-wrap">
                                    <SortableRecordTable className="hub-search-results-table">
                                      <thead>
                                        <tr>
                                          <th>Open</th>
                                          <th>Record ID</th>
                                          <th>Service Site</th>
                                          <th>Check In Date</th>
                                          <th>Check Out Date</th>
                                        </tr>
                                      </thead>
                                      <tbody>
                                        {bedEnrollmentsForProgramEnrollment.map((row) => (
                                          <tr key={`program-bed-enrollment-${row.id || row.recordId}`}>
                                            <td>
                                              <button
                                                type="button"
                                                className="secondary hub-search-open-button"
                                                onClick={() => { void openBedEnrollmentDetail(row.id, row.recordId) }}
                                              >
                                                View Full Record
                                              </button>
                                              {canAccessClientFormAction('Bed Enrollment', 'edit') ? (<button
                                                type="button"
                                                className="secondary hub-search-open-button"
                                                onClick={() => { void editBedEnrollmentRecord(row.id, row.recordId) }}
                                              >
                                                Edit
                                              </button>) : null}
                                              {renderArchiveRecordButton(BED_ENROLLMENTS_TABLE_ALIAS, row.id, row.recordId)}
                                            </td>
                                            <td>{row.recordId || '-'}</td>
                                            <td>{row.serviceSite || '-'}</td>
                                            <td>{row.checkInDate || '-'}</td>
                                            <td>{row.checkOutDate || '-'}</td>
                                          </tr>
                                        ))}
                                      </tbody>
                                    </SortableRecordTable>
                                  </div>
                                ) : <p className="hint">No Bed Enrollment records linked to this Program Enrollment yet.</p>
                              ) : null}
                            </section>
                          )}
                        </article>
                      ) : selectedHelplineDetail ? (
                        <article className="panel wide hub-card hub-form-editor hub-view-record-editor" key={`${selectedHub.id}-client-helpline-view`}>
                          <div className="hub-form-editor-head">
                            <div><h3>Helpline</h3><p className="hint">Record ID: {selectedHelplineDetail.recordId || 'Unknown'}</p></div>
                            <div className="hub-form-editor-actions">
                              <button type="button" className="secondary" onClick={closeCurrentRecordView}>{recordViewBackButtonLabel}</button>
                              {canAccessClientFormAction('Helpline', 'edit') ? (<button type="button" className="secondary" onClick={editHelplineFromDetail}>Edit</button>) : null}
                            </div>
                          </div>
                          <ReadOnlyFormSections
                            fields={HELPLINE_FIELD_DEFINITIONS}
                            formatValue={(field, value) => formatLookupDisplayValue(field.field, value)}
                            values={selectedHelplineDetail.values}
                            sections={['Main', 'DV Helpline Details', 'SV Helpline Details', 'Current Living Situation', 'Safety Assessment', 'OVW Late Life Abuse Screening', 'Notes']}
                            idPrefix="client-helpline-full-view"
                            getSection={(field) => getHelplineFormSection(field.field, selectedHelplineDetail.values)}
                            isVisible={(field) => isHelplineFieldVisible(field.field, selectedHelplineDetail.values)}
                          />
                        </article>
                      ) : selectedChildSafetyPlanDetail ? (
                        <article className="panel wide hub-card hub-form-editor hub-view-record-editor" key={`${selectedHub.id}-client-child-safety-plan-view`}>
                          <div className="hub-form-editor-head">
                            <div><h3>Child Safety Plan</h3><p className="hint">Record ID: {selectedChildSafetyPlanDetail.recordId || 'Unknown'}</p></div>
                            <div className="hub-form-editor-actions">
                              <button type="button" className="secondary" onClick={closeCurrentRecordView}>{recordViewBackButtonLabel}</button>
                              {canAccessClientFormAction('Child Safety Plan', 'edit') ? (<button type="button" className="secondary" onClick={() => { void editChildSafetyPlanRecord(selectedChildSafetyPlanDetail.id, selectedChildSafetyPlanDetail.recordId) }}>Edit</button>) : null}
                            </div>
                          </div>
                          <ReadOnlyFormSections fields={CHILD_SAFETY_PLAN_FIELDS} values={selectedChildSafetyPlanDetail.values} sections={['Main', 'Planning', 'Emotions', 'Acknowledgement']} idPrefix="child-safety-plan-full-view" formatValue={(field, value) => field.field === 'cmps_peid' ? formatLookupDisplayValue(field.field, value) : value} onOpenFile={(fileId) => { void openCompassFileViewer(fileId) }} />
                        </article>
                      ) : selectedElectronicDocumentDetail ? (
                        <article className="panel wide hub-card hub-form-editor hub-view-record-editor" key={`${selectedHub.id}-client-electronic-document-view`}>
                          <div className="hub-form-editor-head">
                            <div><h3>Electronic Document</h3><p className="hint">Record ID: {selectedElectronicDocumentDetail.recordId || 'Unknown'}</p></div>
                            <div className="hub-form-editor-actions">
                              <button type="button" className="secondary" onClick={closeCurrentRecordView}>{recordViewBackButtonLabel}</button>
                              {canAccessClientFormAction('Electronic Document', 'edit') ? (<button type="button" className="secondary" onClick={() => { void editElectronicDocumentRecord(selectedElectronicDocumentDetail.id, selectedElectronicDocumentDetail.recordId) }}>Edit</button>) : null}
                            </div>
                          </div>
                          <ReadOnlyFormSections
                            fields={ELECTRONIC_DOCUMENT_FIELDS}
                            values={selectedElectronicDocumentDetail.values}
                            sections={['Main', 'Document Details', 'Notes']}
                            idPrefix="electronic-document-full-view"
                            formatValue={(field, value) => field.field === 'cmps_cpid' ? formatLookupDisplayValue(field.field, value) : value}
                            onOpenFile={(fileId) => { void openCompassFileViewer(fileId) }}
                          />
                        </article>
                      ) : selectedAdultAssessmentDetail ? (
                        <article className="panel wide hub-card hub-form-editor hub-view-record-editor" key={`${selectedHub.id}-client-adult-assessment-view`}>
                          <div className="hub-form-editor-head">
                            <div><h3>Adult Assessment</h3><p className="hint">Record ID: {selectedAdultAssessmentDetail.recordId || 'Unknown'}</p></div>
                            <div className="hub-form-editor-actions">
                              <button type="button" className="secondary" onClick={closeCurrentRecordView}>{recordViewBackButtonLabel}</button>
                              {canAccessClientFormAction('Adult Assessment', 'edit') ? (<button type="button" className="secondary" onClick={() => { void editAdultAssessmentRecord(selectedAdultAssessmentDetail.id, selectedAdultAssessmentDetail.recordId) }}>Edit</button>) : null}
                            </div>
                          </div>
                          <ReadOnlyFormSections
                            fields={ADULT_ASSESSMENT_FIELDS}
                            values={selectedAdultAssessmentDetail.values}
                            sections={['Main', 'Assessment', 'Acknowledgement']}
                            idPrefix="adult-assessment-full-view"
                            isVisible={(field) => {
                              const definition = ADULT_ASSESSMENT_FIELDS.find((entry) => entry.field === field.field)
                              return !definition?.visibleWhen || fieldValueMatches(String(selectedAdultAssessmentDetail.values[definition.visibleWhen.field] || ''), definition.visibleWhen.values)
                            }}
                            formatValue={(field, value) => formatLookupDisplayValue(field.field, value)}
                          />
                        </article>
                      ) : selectedHealthWellnessDetail ? (
                        <article className="panel wide hub-card hub-form-editor hub-view-record-editor" key={`${selectedHub.id}-client-health-wellness-view`}>
                          <div className="hub-form-editor-head">
                            <div><h3>Health &amp; Wellness Questionnaire</h3><p className="hint">Record ID: {selectedHealthWellnessDetail.recordId || 'Unknown'}</p></div>
                            <div className="hub-form-editor-actions">
                              <button type="button" className="secondary" onClick={closeCurrentRecordView}>{recordViewBackButtonLabel}</button>
                              {canAccessClientFormAction('Health & Wellness Questionnaire', 'edit') ? (<button type="button" className="secondary" onClick={() => { void editHealthWellnessRecord(selectedHealthWellnessDetail.id, selectedHealthWellnessDetail.recordId) }}>Edit</button>) : null}
                            </div>
                          </div>
                          <ReadOnlyFormSections
                            fields={HEALTH_WELLNESS_FIELDS}
                            values={selectedHealthWellnessDetail.values}
                            sections={['Main', 'Medical History', 'Seizure Information', 'Medications', 'Additional Medications', 'Emergency Contact Information']}
                            idPrefix="health-wellness-full-view"
                            isVisible={(field) => {
                              const definition = HEALTH_WELLNESS_FIELDS.find((entry) => entry.field === field.field)
                              if (definition?.section === 'Seizure Information' && normalize(String(selectedHealthWellnessDetail.values.cmps_doyouexperienceseizures || '')) !== normalize('Yes')) return false
                              if (definition?.section === 'Additional Medications' && normalize(String(selectedHealthWellnessDetail.values.cmps_doyouhavemoremedicationsyouwouldliketodocumen || '')) !== normalize('Yes')) return false
                              return !definition?.visibleWhen || fieldValueMatches(String(selectedHealthWellnessDetail.values[definition.visibleWhen.field] || ''), definition.visibleWhen.values)
                            }}
                            formatValue={(field, value) => field.field === 'cmps_cpid' ? formatLookupDisplayValue(field.field, value) : value}
                          />
                        </article>
                      ) : selectedGoalDetail ? (
                        <article className="panel wide hub-card hub-form-editor hub-view-record-editor" key={`${selectedHub.id}-client-goal-view`}>
                          <div className="hub-form-editor-head">
                            <div><h3>Goal</h3><p className="hint">Record ID: {selectedGoalDetail.recordId || 'Unknown'}</p></div>
                            <div className="hub-form-editor-actions">
                              <button type="button" className="secondary" onClick={closeCurrentRecordView}>{recordViewBackButtonLabel}</button>
                              {canAccessClientFormAction('Goals', 'edit') ? (<button type="button" className="secondary" onClick={() => { const row = goalsForClient.find((item) => item.id === selectedGoalDetail.id); if (row) void editGoalRecord(row) }}>Edit</button>) : null}
                            </div>
                          </div>
                          <ReadOnlyFormSections fields={GOAL_FIELDS} values={selectedGoalDetail.values} sections={['Main', 'Goal Information', 'Goal Outcomes', 'Goal Notes']} idPrefix="goal-full-view" isVisible={(field) => field.field !== 'cmps_othergoal' || normalize(String(selectedGoalDetail.values.cmps_goal || '')) === normalize(GOAL_OTHER_OPTION)} formatValue={(field, value) => field.field === 'cmps_peid' ? formatLookupDisplayValue(field.field, value) : value} />
                        </article>
                      ) : selectedFocusPlanDetail ? (
                        <article className="panel wide hub-card hub-form-editor hub-view-record-editor" key={`${selectedHub.id}-client-focus-plan-view`}>
                          <div className="hub-form-editor-head">
                            <div><h3>FOCUS Plan</h3><p className="hint">Record ID: {selectedFocusPlanDetail.recordId || 'Unknown'}</p></div>
                            <div className="hub-form-editor-actions">
                              <button type="button" className="secondary" onClick={closeCurrentRecordView}>{recordViewBackButtonLabel}</button>
                              {canAccessClientFormAction('FOCUS Plan', 'edit') ? (<button type="button" className="secondary" onClick={() => { void editFocusPlanRecord(selectedFocusPlanDetail.id, selectedFocusPlanDetail.recordId) }}>Edit</button>) : null}
                            </div>
                          </div>
                          <ReadOnlyFormSections
                            fields={FOCUS_PLAN_FIELDS}
                            values={selectedFocusPlanDetail.values}
                            sections={['Main', 'Goals/Person-Family Vision', "Person's/Family Strengths & Goals", 'FOCUS Meeting Notes', 'FOCUS Plan Checklist']}
                            idPrefix="focus-plan-full-view"
                            isVisible={(field) => {
                              const definition = FOCUS_PLAN_FIELDS.find((entry) => entry.field === field.field)
                              return !definition?.visibleWhen || fieldValueMatches(String(selectedFocusPlanDetail.values[definition.visibleWhen.field] || ''), definition.visibleWhen.values)
                            }}
                            formatValue={(field, value) => field.field === 'cmps_peid' ? formatLookupDisplayValue(field.field, value) : value}
                          />
                        </article>
                      ) : selectedInitialSafetyPlanDetail ? (
                        <article className="panel wide hub-card hub-form-editor hub-view-record-editor" key={`${selectedHub.id}-client-initial-safety-plan-view`}>
                          <div className="hub-form-editor-head">
                            <div><h3>Initial Safety Plan</h3><p className="hint">Record ID: {selectedInitialSafetyPlanDetail.recordId || 'Unknown'}</p></div>
                            <div className="hub-form-editor-actions">
                              <button type="button" className="secondary" onClick={closeCurrentRecordView}>{recordViewBackButtonLabel}</button>
                              {canAccessClientFormAction('Initial Safety Plan', 'edit') ? (<button type="button" className="secondary" onClick={() => { void editInitialSafetyPlanRecord(selectedInitialSafetyPlanDetail.id, selectedInitialSafetyPlanDetail.recordId) }}>Edit</button>) : null}
                            </div>
                          </div>
                          <ReadOnlyFormSections fields={INITIAL_SAFETY_PLAN_FIELDS} values={selectedInitialSafetyPlanDetail.values} sections={['Main', 'Acknowledgement']} idPrefix="initial-safety-plan-full-view" formatValue={(field, value) => field.field === 'cmps_peid' ? formatLookupDisplayValue(field.field, value) : value} />
                        </article>
                      ) : (
                        <div className="client-profile-shell" key={`${selectedHub.id}-search-detail-shell`}>
                          <article className="panel wide hub-card hub-search-detail-card client-profile-main-card" key={`${selectedHub.id}-search-detail`}>
                            <div className="client-profile-hero-bar">
                              <button type="button" className="link-button" onClick={closeClientProfileDetail}>Back to Clients</button>
                            </div>

                            <div className="client-profile-hero">
                              <div className="client-profile-identity">
                                <div className="client-profile-avatar">
                                  {String(getClientProfileDisplayName(selectedDetailRecord.values) || selectedDetailRecord.recordId || 'CP')
                                    .split(/\s+/)
                                    .filter(Boolean)
                                    .slice(0, 2)
                                    .map((part) => part.slice(0, 1).toUpperCase())
                                    .join('') || 'CP'}
                                </div>
                                <div className="client-profile-identity-copy">
                                  <h3 className="client-profile-name">{getClientProfileDisplayName(selectedDetailRecord.values) || 'Client Record'}</h3>
                                  <div className="client-profile-meta-row">
                                    <span className="chip">Record: {selectedDetailRecord.recordId || 'Unknown'}</span>
                                    {selectedDetailRecord.values.cmps_hmisid ? <span className="chip subtle">HMIS: {selectedDetailRecord.values.cmps_hmisid}</span> : null}
                                    {selectedDetailRecord.values.cmps_gender ? <span className="chip subtle">{selectedDetailRecord.values.cmps_gender}</span> : null}
                                  </div>
                                </div>
                              </div>

                              <div className="client-profile-top-records">
                                <div className="hub-form-editor-actions client-profile-primary-actions">
                                  {canAccessClientFormAction('Client Profile', 'view') ? <button type="button" className="secondary" onClick={openClientPrint}>Print client records</button> : null}
                                  {canAccessClientFormAction('Client Profile', 'edit') ? (<button type="button" className="secondary" onClick={editClientProfileFromDetail}>Edit Profile</button>) : null}
                                  <button type="button" className="secondary" onClick={openFullClientProfileDetail}>View Full Record</button>
                                  <ClientReportExclusionControl profileId={selectedDetailRecord.id} canManage={canAccessRoleAdmin && !isUserPreview} savedBy={String(authenticatedUser.name || authenticatedUser.email || authenticatedUser.id || '')} />
                                </div>
                                {selectedClientSection === 'overview' ? (
                                  <div className="client-profile-household-records" aria-label="Linked household records">
                                    {householdsForClientLoading ? <span className="hint">Loading household records...</span> : null}
                                    {householdsForClientError ? <span className="error">{householdsForClientError}</span> : null}
                                    {!householdsForClientLoading && !householdsForClientError ? householdsForClient.map((row) => (
                                      <div className="client-profile-household-record" key={`profile-household-action-${row.id || row.recordId}`}>
                                        <span className="client-profile-household-summary">
                                          <strong>{row.recordId || 'Household record'}</strong>
                                          <small>
                                            {[row.headOfHouseholdName, row.program, row.statusSummary]
                                              .map((value) => String(value || '').trim())
                                              .filter(Boolean)
                                              .join(' | ') || 'Linked household'}
                                          </small>
                                        </span>
                                        {canAccessClientFormAction('Household', 'view') ? <button type="button" className="secondary" onClick={() => { void viewHouseholdRecord(row) }}>View Household</button> : null}
                                        {canAccessClientFormAction('Household', 'edit') ? (<button type="button" className="secondary" onClick={() => { void editHouseholdRecord(row.id, row.recordId) }}>
                                          Edit Household
                                        </button>) : null}
                                        {renderArchiveRecordButton(HOUSEHOLDS_TABLE_ALIAS, row.id, row.recordId)}
                                      </div>
                                    )) : null}
                                  </div>
                                ) : null}
                              </div>
                            </div>

                            <div className="client-profile-tabs" role="tablist" aria-label="Client sections">
                              {clientDetailTabs.map((section) => {
                                const isActive = selectedClientSection === section
                                return (
                                  <button
                                    key={`client-detail-tab-${section}`}
                                    type="button"
                                    className={`client-profile-tab${isActive ? ' active' : ''}`}
                                    onClick={() => {
                                      setSelectedClientSectionByHub((current) => ({
                                        ...current,
                                        [selectedHub.id]: section,
                                      }))
                                    }}
                                  >
                                    {CLIENT_DETAIL_SECTION_LABELS[section]}
                                  </button>
                                )
                              })}
                            </div>

                            {selectedClientSection === 'overview' ? (
                              <>
                                <section className="client-profile-overview-grid" aria-label="Overview panels">
                                  <article className="client-overview-card client-overview-card-wide">
                                    <div className="client-overview-card-head">
                                      <h4>Current Programs</h4>
                                      {canCreateForm('Program Enrollment') && !programEnrollmentsLoading && programEnrollmentsForClient.filter((row) => !String(row.serviceEndDate || '').trim()).length === 0 ? (
                                        (canCreateForm("Program Enrollment") ? (<button type="button" className="secondary" onClick={startProgramEnrollmentFromClientDetail}>
                                          Start Program Enrollment
                                        </button>) : null)
                                      ) : null}
                                    </div>
                                    {programEnrollmentsLoading ? <p className="hint">Loading current programs...</p> : null}
                                    {!programEnrollmentsLoading && programEnrollmentsForClient.filter((row) => !String(row.serviceEndDate || '').trim()).length === 0 ? (
                                      <p className="hint">No current program enrollments found.</p>
                                    ) : (
                                      <ul className="client-overview-list">
                                        {programEnrollmentsForClient
                                          .filter((row) => !String(row.serviceEndDate || '').trim())
                                          .map((row) => (
                                            <li key={`overview-program-${row.id || row.recordId}`}>
                                              {row.program || 'Program not specified'}
                                              {row.enrollmentStatus ? ` (${row.enrollmentStatus})` : ''}
                                            </li>
                                          ))}
                                      </ul>
                                    )}
                                  </article>

                                </section>

                                <section className="client-activity-card" aria-label="Recent activity">
                                  <div className="client-activity-head">
                                    <h4>Recent Activity</h4>
                                  </div>
                                  <div className="client-activity-list">
                                    {recentClientActivity.length === 0 ? <p className="hint">No dated activity found for this client.</p> : recentClientActivity.map((item) => (
                                      <div className="client-activity-item" key={`${item.label}-${item.timestamp}-${item.description}`}>
                                        <span className="chip subtle">{item.label}</span>
                                        <span>{item.description} · {new Date(item.timestamp).toLocaleString()}</span>
                                      </div>
                                    ))}
                                  </div>
                                </section>
                              </>
                            ) : null}

                            {selectedClientSection === 'face-sheet' ? (
                              <section className="hub-client-forms-section client-profile-forms-section" aria-label="Client face sheet">
                                <h3>Face Sheet</h3>
                                <p className="hint">A quick view of active work and possible next forms for this client.</p>

                                <article className="hub-client-quick-record">
                                  <div className="hub-client-quick-record-head">
                                    <h4>Goals Still in Progress</h4>
                                    <span className="chip subtle">{inProgressGoals.length}</span>
                                  </div>
                                  {goalsForClientLoading ? <p className="hint">Loading goals...</p> : null}
                                  {goalsForClientError ? <p className="error">{goalsForClientError}</p> : null}
                                  {!goalsForClientLoading && !goalsForClientError ? (
                                    inProgressGoals.length > 0 ? (
                                      <div className="hub-search-results-table-wrap">
                                        <SortableRecordTable className="hub-search-results-table">
                                          <thead><tr><th>Goal</th><th>Category</th><th>Status</th><th>Start Date</th><th>Program</th><th></th></tr></thead>
                                          <tbody>{inProgressGoals.map((goal) => {
                                            const enrollment = programEnrollmentsForClient.find((row) => normalizeGuidText(row.id) === normalizeGuidText(goal.programEnrollmentRowId))
                                            return <tr key={`face-sheet-goal-${goal.id || goal.recordId}`}>
                                              <td>{goal.goal || goal.recordId || '-'}</td>
                                              <td>{goal.category || '-'}</td>
                                              <td><span className="chip subtle">{goal.status || 'In progress'}</span></td>
                                              <td>{goal.startDate || '-'}</td>
                                              <td>{enrollment?.program || '-'}</td>
                                              <td>{canAccessClientFormAction('Goals', 'view') ? <button type="button" className="secondary hub-search-open-button" onClick={() => { void openGoalDetailFromClient(goal) }}>View</button> : null}</td>
                                            </tr>
                                          })}</tbody>
                                        </SortableRecordTable>
                                      </div>
                                    ) : <p className="hint">No goals are currently in progress.</p>
                                  ) : null}
                                </article>

                                <article className="hub-client-quick-record">
                                  <div className="hub-client-quick-record-head">
                                    <h4>Suggested Next Forms</h4>
                                    <span className="chip subtle">{selectedHub?.title || 'Current program'}</span>
                                  </div>
                                  <p className="hint">Suggestions are forms your role can create in this program that do not yet have a record in this client folder.</p>
                                  {clientFolderSummaryLoading ? <p className="hint">Checking available forms...</p> : faceSheetSuggestedForms.length > 0 ? (
                                    <ul className="client-overview-list">
                                      {faceSheetSuggestedForms.map((form) => <li key={`face-sheet-suggestion-${form.formName}`}>{form.formName}</li>)}
                                    </ul>
                                  ) : <p className="hint">No next-form suggestions are available right now.</p>}
                                </article>
                              </section>
                            ) : null}

                            {selectedClientSection === 'folder-summary' ? (
                              <section className="hub-client-forms-section client-profile-forms-section" aria-label="Client folder summary">
                                <h3>Folder Summary</h3>
                                <p className="hint">Completion is based on forms the signed-in user can create for each active program enrollment.</p>
                                {clientFolderSummaryLoading ? <p className="hint">Loading active enrollments and linked forms...</p> : null}
                                {clientFolderSummaryError ? <p className="error">Folder Summary could not be completed: {clientFolderSummaryError}</p> : null}
                                {!clientFolderSummaryLoading && !clientFolderSummaryError && folderSummaryEntries.length === 0 ? <p className="hint">No active program enrollments found.</p> : null}
                                {!clientFolderSummaryLoading && !clientFolderSummaryError ? folderSummaryEntries.map(({ enrollment, forms }) => {
                                  const completedCount = forms.filter((form) => form.recordCount > 0).length
                                  return <article className="hub-client-quick-record" key={`folder-summary-${enrollment.id || enrollment.recordId}`}>
                                    <div className="hub-client-quick-record-head">
                                      <div>
                                        <h4>{enrollment.program || 'Program not specified'}</h4>
                                        <p className="hint">Enrollment: {enrollment.recordId || '-'}{enrollment.serviceStartDate ? ` | Started ${enrollment.serviceStartDate}` : ''}</p>
                                      </div>
                                      <span className="chip subtle">{completedCount} of {forms.length} completed</span>
                                    </div>
                                    {forms.length === 0 ? <p className="hint">Your role has no create-enabled client forms configured for this program.</p> : (
                                      <div className="hub-search-results-table-wrap">
                                        <SortableRecordTable className="hub-search-results-table">
                                          <thead><tr><th>Form</th><th>Status</th><th>Records</th></tr></thead>
                                          <tbody>{forms.map((form) => <tr key={`folder-summary-${enrollment.id}-${form.formName}`}>
                                            <td>{form.formName}</td>
                                            <td><span className={`chip${form.recordCount > 0 ? '' : ' subtle'}`}>{form.recordCount > 0 ? 'Completed' : 'Not completed'}</span></td>
                                            <td>{form.recordCount}</td>
                                          </tr>)}</tbody>
                                        </SortableRecordTable>
                                      </div>
                                    )}
                                  </article>
                                }) : null}
                              </section>
                            ) : null}

                            {selectedClientSection !== 'face-sheet' && selectedClientSection !== 'folder-summary' ? (
                              <section className="hub-client-forms-section client-profile-forms-section">
                                <h3>{selectedClientSection === 'overview' ? 'Forms' : `${CLIENT_DETAIL_SECTION_LABELS[selectedClientSection]} Forms`}</h3>
                                <p className="hint">Expand each form to view available records for this client.</p>

                                {visibleClientForms.length === 0 ? (
                                  <p className="hint">No forms are available in this section.</p>
                                ) : (
                                  <div className="hub-client-form-accordion-list">
                                    {visibleClientForms.map((form) => {
                                  const recordCount = getClientFormRecordCount(form.formName)
                                  const linkedCountKey = getClientLinkedFormKey(form.formName)
                                  const countLoading = linkedCountKey ? canReadClientLinkedForm(linkedCountKey) && (clientLinkedRecordsLoading || clientLinkedRecordsClientId !== selectedDetailRecord?.id) : normalize(form.formName).includes('adult assessment') && (adultAssessmentsForClientLoading || programEnrollmentsClientId !== selectedDetailRecord?.id)
                                  const countError = linkedCountKey ? clientLinkedRecordsError[linkedCountKey] : normalize(form.formName).includes('adult assessment') ? adultAssessmentsForClientError : ''
                                  const clientProfile = isClientProfileForm(form.formName)
                                  const householdForm = isHouseholdForm(form.formName)
                                  const programEnrollment = isProgramEnrollmentForm(form.formName)
                                  const servicesForm = isServicesForm(form.formName)
                                  const helplineForm = isHelplineForm(form.formName)
                                  const bedEnrollmentForm = isBedEnrollmentForm(form.formName)
                                  const vocaForm = isVocaForm(form.formName)
                                  const goalForm = isGoalForm(form.formName)
                                  const childSafetyPlanForm = normalize(form.formName).includes('child safety plan')
                                  const childAssessmentForm = isChildAssessmentForm(form.formName)
                                  const childShelterIntakeForm = isChildShelterIntakeForm(form.formName)
                                  const employmentAndBenefitsForm = isEmploymentAndBenefitsForm(form.formName)
                                  const financialAssistanceForm = isFinancialAssistanceForm(form.formName)
                                  const medicalConsentForm = isMedicalConsentForm(form.formName)
                                  const personYouAreFleeingProfileForm = isPersonYouAreFleeingProfileForm(form.formName)
                                  const electronicDocumentForm = isElectronicDocumentForm(form.formName)
                                  const termsAndConditionsOfServiceAnimalsForm = isTermsAndConditionsOfServiceAnimalsForm(form.formName)
                                  const contractForm = isContractForm(form.formName)
                                  const petCompanionIntakeForm = isPetCompanionIntakeForm(form.formName)
                                  const funderTransactionForm = isFunderTransactionForm(form.formName)
                                  const shelterProgramGuidelinesForm = isShelterProgramGuidelinesForm(form.formName)
                                  const adultAssessmentForm = normalize(form.formName).includes('adult assessment')
                                  const healthWellnessForm = isHealthWellnessForm(form.formName)
                                  const focusPlanForm = normalize(form.formName).includes('focus plan')
                                  const initialSafetyPlanForm = normalize(form.formName).includes('initial safety plan')
                                  const acknowledgementAndConsentForm = isAcknowledgementAndConsentForm(form.formName)
                                  const animalAgreementForm = isAnimalAgreementForm(form.formName)
                                  const releaseOfInformationForm = normalize(form.formName).includes('release of information')
                                  const quickItems = [
                                    { label: 'Record ID', value: selectedDetailRecord.recordId || '-' },
                                    { label: 'Name', value: getClientProfileDisplayName(selectedDetailRecord.values) || '-' },
                                    { label: 'HMIS ID', value: selectedDetailRecord.values.cmps_hmisid || '-' },
                                    { label: 'Date of Birth', value: selectedDetailRecord.values.cmps_dateofbirth || '-' },
                                    { label: 'Primary Language', value: selectedDetailRecord.values.cmps_primarylanguage || '-' },
                                    { label: 'Gender', value: selectedDetailRecord.values.cmps_gender || '-' },
                                  ].filter((item) => item.label === 'Record ID' || hasDisplayValue(item.value))
                                  return (
                                    <details
                                      key={`client-form-${selectedHub.id}-${form.formName}`}
                                      className="hub-client-form-accordion"
                                    >
                                      <summary className="hub-client-form-accordion-summary">
                                        <span className="hub-client-form-accordion-title">{form.formName}</span>
                                        <span className="chip subtle">{countLoading ? 'Loading…' : countError ? 'Unavailable' : <>{recordCount} record{recordCount === 1 ? '' : 's'}</>}</span>
                                      </summary>

                                      <div className="hub-client-form-accordion-body">
                                        {clientProfile ? (
                                          <article className="hub-client-quick-record">
                                            <div className="hub-client-quick-record-head">
                                              <h4>Quick View</h4>
                                              <div className="hub-form-editor-actions">
                                                <button type="button" className="secondary" onClick={openFullClientProfileDetail}>View Full Record</button>
                                                {canAccessClientFormAction('Client Profile', 'edit') ? (<button type="button" className="secondary" onClick={editClientProfileFromDetail}>Edit</button>) : null}
                                                {renderArchiveRecordButton(CLIENT_PROFILE_TABLE_ALIAS, selectedDetailRecord.id, selectedDetailRecord.recordId)}
                                              </div>
                                            </div>
                                            <div className="hub-client-quick-grid">
                                              {quickItems.map((item) => (
                                                <div key={`quick-${selectedHub.id}-${form.formName}-${item.label}`} className="hub-client-quick-item">
                                                  <span className="hub-search-detail-label">{item.label}</span>
                                                  <span className="hub-search-detail-value">{item.value}</span>
                                                </div>
                                              ))}
                                            </div>
                                          </article>
                                        ) : householdForm ? (
                                          <article className="hub-client-quick-record">
                                            <div className="hub-client-quick-record-head">
                                              <h4>Households For This Client</h4>
                                            </div>

                                            {householdsForClientLoading ? <p className="hint">Loading Household records...</p> : null}
                                            {householdsForClientError ? <p className="error">{householdsForClientError}</p> : null}

                                            {!householdsForClientLoading && !householdsForClientError ? (
                                              householdsForClient.length > 0 ? (
                                                <div className="hub-search-results-table-wrap">
                                                  <SortableRecordTable className="hub-search-results-table">
                                                    <thead>
                                                      <tr>
                                                        <th>Open</th>
                                                        <th>Record ID</th>
                                                        <th>Head of Household</th>
                                                        <th>Program</th>
                                                        <th>This Client Status</th>
                                                      </tr>
                                                    </thead>
                                                    <tbody>
                                                      {householdsForClient.map((row) => (
                                                        <tr key={`client-household-${row.id || row.recordId}`}>
                                                          <td>
                                                            {canAccessClientFormAction('Household', 'view') ? <button type="button" className="secondary hub-search-open-button" onClick={() => { void viewHouseholdRecord(row) }}>View</button> : null}
                                                            {canAccessClientFormAction('Household', 'edit') ? (<button
                                                              type="button"
                                                              className="secondary hub-search-open-button"
                                                              onClick={() => { void editHouseholdRecord(row.id, row.recordId) }}
                                                            >
                                                              Edit
                                                            </button>) : null}
                                                            {renderArchiveRecordButton(HOUSEHOLDS_TABLE_ALIAS, row.id, row.recordId)}
                                                          </td>
                                                          <td>{row.recordId || '-'}</td>
                                                          <td>{row.headOfHouseholdName || '-'}</td>
                                                          <td>{row.program || '-'}</td>
                                                          <td>{row.statusSummary || '-'}</td>
                                                        </tr>
                                                      ))}
                                                    </tbody>
                                                  </SortableRecordTable>
                                                </div>
                                              ) : <p className="hint">No Household records linked to this client yet.</p>
                                            ) : null}
                                          </article>
                                        ) : programEnrollment ? (
                                          <article className="hub-client-quick-record">
                                            <div className="hub-client-quick-record-head">
                                              <h4>Program Enrollments For This Client</h4>
                                              <div className="hub-form-editor-actions">
                                                {canCreateForm("Program Enrollment") ? (<button type="button" className="secondary" onClick={startProgramEnrollmentFromClientDetail}>Start Program Enrollment</button>) : null}
                                              </div>
                                            </div>

                                            {programEnrollmentsLoading ? <p className="hint">Loading Program Enrollment records...</p> : null}
                                            {programEnrollmentsError ? <p className="error">{programEnrollmentsError}</p> : null}
                                            {programEnrollmentDetailLoading ? <p className="hint">Loading Program Enrollment record...</p> : null}
                                            {programEnrollmentDetailError ? <p className="error">{programEnrollmentDetailError}</p> : null}

                                            {!programEnrollmentsLoading && !programEnrollmentsError ? (
                                              programEnrollmentsForClient.length > 0 ? (
                                                <div className="hub-search-results-table-wrap">
                                                  <SortableRecordTable className="hub-search-results-table">
                                                    <thead>
                                                      <tr>
                                                        <th>Open</th>
                                                        <th>Record ID</th>
                                                        <th>Program</th>
                                                        <th>Status</th>
                                                        <th>Start Date</th>
                                                        <th>End Date</th>
                                                      </tr>
                                                    </thead>
                                                    <tbody>
                                                      {programEnrollmentsForClient.map((row) => (
                                                        <tr key={row.id || row.recordId}>
                                                          <td>
                                                            <button
                                                              type="button"
                                                              className="secondary hub-search-open-button"
                                                              onClick={() => { void openProgramEnrollmentDetail(row.id, row.recordId) }}
                                                            >
                                                              View Full Record
                                                            </button>
                                                            {canAccessClientFormAction('Program Enrollment', 'edit') ? (<button
                                                              type="button"
                                                              className="secondary hub-search-open-button"
                                                              onClick={() => { void editProgramEnrollmentRecord(row.id, row.recordId) }}
                                                            >
                                                              Edit
                                                            </button>) : null}
                                                            {renderArchiveRecordButton(PROGRAM_ENROLLMENT_TABLE_ALIAS, row.id, row.recordId)}
                                                          </td>
                                                          <td>{row.recordId || '-'}</td>
                                                          <td>{row.program || '-'}</td>
                                                          <td>{row.enrollmentStatus || '-'}</td>
                                                          <td>{row.serviceStartDate || '-'}</td>
                                                          <td>{row.serviceEndDate || '-'}</td>
                                                        </tr>
                                                      ))}
                                                    </tbody>
                                                  </SortableRecordTable>
                                                </div>
                                              ) : <p className="hint">No Program Enrollment records linked to this client yet.</p>
                                            ) : null}
                                          </article>
) : isShelterScreeningForm(form.formName) ? (
                                          <article className="hub-client-quick-record">
                                            <div className="hub-client-quick-record-head">
                                              <h4>Shelter Screening Forms For This Client</h4>
                                              <div className="hub-form-editor-actions">
                                                {canCreateForm("Shelter Screening Form") ? (<button type="button" className="secondary" onClick={startShelterScreeningFromClientDetail}>Start Shelter Screening</button>) : null}
                                              </div>
                                            </div>
                                            {shelterScreeningsForClientLoading ? <p className="hint">Loading Shelter Screening records...</p> : null}
                                            {shelterScreeningsForClientError ? <p className="error">{shelterScreeningsForClientError}</p> : null}
                                            {!shelterScreeningsForClientLoading && !shelterScreeningsForClientError ? (
                                              shelterScreeningsForClient.length > 0 ? (
                                                <div className="hub-search-results-table-wrap">
                                                  <SortableRecordTable className="hub-search-results-table">
                                                    <thead>
                                                      <tr><th>Open</th><th>Record ID</th><th>Program</th><th>Screen Date</th></tr>
                                                    </thead>
                                                    <tbody>
                                                      {shelterScreeningsForClient.map((row) => (
                                                        <tr key={row.id || row.recordId}>
                                                          <td>{renderClientRecordActions('shelter-screening', row)}{renderArchiveRecordButton(SHELTER_SCREENINGS_TABLE_ALIAS, row.id, row.recordId)}</td>
                                                          <td>{row.recordId || '-'}</td>
                                                          <td>{row.program || '-'}</td>
                                                          <td>{row.screenDate || '-'}</td>
                                                        </tr>
                                                      ))}
                                                    </tbody>
                                                  </SortableRecordTable>
                                                </div>
                                              ) : <p className="hint">No Shelter Screening records linked to this client yet.</p>
                                            ) : null}
                                          {renderClientConsentRecordView('shelter-screening')}
                                          </article>
                                        ) : helplineForm ? (
                                          <article className={`hub-client-quick-record${selectedHelplineDetail ? ' hub-record-view-active' : ''}`}>
                                            <div className="hub-client-quick-record-head">
                                              <h4>Helpline Records For This Client</h4>
                                              {canCreateForm("Helpline") ? (<button type="button" className="secondary" onClick={() => startHelplineForClient({ id: selectedDetailRecord.id, recordId: selectedDetailRecord.recordId })}>Start Helpline</button>) : null}
                                            </div>
                                            {helplinesForClientLoading ? <p className="hint">Loading Helpline records...</p> : null}
                                            {helplinesForClientError ? <p className="error">{helplinesForClientError}</p> : null}
                                            {!helplinesForClientLoading && !helplinesForClientError ? helplinesForClient.length > 0 ? (
                                              <div className="hub-search-results-table-wrap">
                                                <SortableRecordTable className="hub-search-results-table">
                                                  <thead><tr><th></th><th>Record ID</th><th>Program</th><th>Date of Contact</th><th>Contact Type</th><th>Minutes</th><th>Call Notes</th></tr></thead>
                                                  <tbody>{helplinesForClient.map((row) => <tr key={row.id || row.recordId}><td><button type="button" className="secondary hub-search-open-button" onClick={() => { void openHelplineDetailFromClient(row) }}>View</button>{canAccessClientFormAction('Helpline', 'edit') ? (<button type="button" className="secondary hub-search-open-button" onClick={() => { void editHelplineRecordFromClient(row) }}>Edit</button>) : null}{renderArchiveRecordButton(HELPLINES_TABLE_ALIAS, row.id, row.recordId)}</td><td>{row.recordId || '-'}</td><td>{row.program || '-'}</td><td>{row.dateOfContact || '-'}</td><td>{row.contactType || '-'}</td><td>{row.callLengthMinutes || '-'}</td><td className="record-quick-notes">{row.callNotes || '-'}</td></tr>)}</tbody>
                                                </SortableRecordTable>
                                              </div>
                                            ) : <p className="hint">No Helpline records linked to this client yet.</p> : null}
                                          </article>
) : vocaForm ? (
                                          <article className="hub-client-quick-record">
                                            <div className="hub-client-quick-record-head">
                                              <h4>VOCA Forms For This Client</h4>
                                              <div className="hub-form-editor-actions">
                                                {canCreateForm("VOCA Form") ? (<button type="button" className="secondary" onClick={startVocaFromClientDetail} disabled={activeVocaProgramEnrollmentOptions.length === 0}>Start VOCA Form</button>) : null}
                                              </div>
                                            </div>
                                            <p className="hint">New VOCA forms require an active Program Enrollment. Imported legacy records may be linked directly to this Client Profile.</p>
                                            {vocaFormsForClientLoading ? <p className="hint">Loading VOCA records...</p> : null}
                                            {vocaFormsForClientError ? <p className="error">{vocaFormsForClientError}</p> : null}
                                            {!vocaFormsForClientLoading && !vocaFormsForClientError && vocaFormsForClient.length > 0 ? (
                                              <div className="hub-search-results-table-wrap">
                                                <SortableRecordTable className="hub-search-results-table">
                                                  <thead><tr><th>Record ID</th><th>Program Enrollment</th><th>Last Modified</th></tr></thead>
                                                  <tbody>{vocaFormsForClient.map((row) => {
                                                    const enrollment = programEnrollmentsForClient.find((entry) => normalizeGuidText(String(entry.id || '')) === normalizeGuidText(row.programEnrollmentId))
                                                    return <tr key={row.id || row.recordId}><td>{renderClientRecordActions('voca-form', row)}{renderArchiveRecordButton(VOCA_FORMS_TABLE_ALIAS, row.id, row.recordId)}{row.recordId || '-'}</td><td>{enrollment ? [formatProgramEnrollmentLookupLabel(enrollment), enrollment.program, enrollment.serviceStartDate].filter(Boolean).join(' | ') : row.programEnrollmentId ? 'Program Enrollment' : 'Client Profile link (legacy record)'}</td><td>{row.modifiedOn || row.createdOn || '-'}</td></tr>
                                                  })}</tbody>
                                                </SortableRecordTable>
                                              </div>
                                            ) : null}
                                            {!vocaFormsForClientLoading && !vocaFormsForClientError && vocaFormsForClient.length === 0 ? <p className="hint">No VOCA records linked to this client yet.</p> : null}
                                            {activeVocaProgramEnrollmentOptions.length === 0 ? (
                                              <p className="hint">No active Program Enrollment records found for this client.</p>
                                            ) : (
                                              <p className="hint">{activeVocaProgramEnrollmentOptions.length} active Program Enrollment record{activeVocaProgramEnrollmentOptions.length === 1 ? '' : 's'} available.</p>
                                            )}
                                          {renderClientConsentRecordView('voca-form')}
                                          </article>
                                        ) : childSafetyPlanForm ? (
                                          <article className={`hub-client-quick-record${selectedChildSafetyPlanDetail ? ' hub-record-view-active' : ''}`}>
                                            <div className="hub-client-quick-record-head">
                                              <h4>Child Safety Plan</h4>
                                              <div className="hub-form-editor-actions">
                                                {canCreateForm("Child Safety Plan") ? (<button type="button" className="secondary" onClick={startChildSafetyPlanFromClientDetail}>Start Child Safety Plan</button>) : null}
                                              </div>
                                            </div>
                                            <p className="hint">This plan is linked to the open Client Profile and requires an active Program Enrollment.</p>
                                            {childSafetyPlansForClientLoading ? <p className="hint">Loading Child Safety Plan records...</p> : null}
                                            {childSafetyPlansForClientError ? <p className="error">{childSafetyPlansForClientError}</p> : null}
                                            {!childSafetyPlansForClientLoading && !childSafetyPlansForClientError ? (
                                              childSafetyPlansForClient.length > 0 ? (
                                                <div className="hub-search-results-table-wrap">
                                                  <SortableRecordTable className="hub-search-results-table">
                                                    <thead>
                                                      <tr>
                                                        <th></th>
                                                        <th>Record ID</th>
                                                        <th>Plan Completion Date</th>
                                                        <th>Program Enrollment</th>
                                                      </tr>
                                                    </thead>
                                                    <tbody>
                                                      {childSafetyPlansForClient.map((row) => {
                                                        const enrollment = programEnrollmentsForClient.find((entry) => String(entry.id || '').trim().toLowerCase() === row.programEnrollmentRowId.toLowerCase())
                                                        const enrollmentLabel = enrollment ? [enrollment.program, enrollment.recordId].filter(Boolean).join(' - ') : ''
                                                        return (
                                                          <tr key={row.id || row.recordId}>
                                                            <td>
                                                              <button
                                                                type="button"
                                                                className="secondary hub-search-open-button"
                                                                onClick={() => { void openChildSafetyPlanDetailFromClient(row) }}
                                                              >
                                                                View Full Record
                                                              </button>
                                                              {canAccessClientFormAction('Child Safety Plan', 'view') ? <RecordAttachmentButtons attachments={recordAttachments('child-safety-plan', { cmps_fileid1: row.fileRowId })} onOpenFile={(id) => { void openCompassFileViewer(id) }} /> : null}
                                                              {canAccessClientFormAction('Child Safety Plan', 'edit') ? (<button
                                                                type="button"
                                                                className="secondary hub-search-open-button"
                                                                onClick={() => { void editChildSafetyPlanRecord(row.id, row.recordId, row.programEnrollmentRowId) }}
                                                              >
                                                                Edit
                                                              </button>) : null}
                                                            {renderArchiveRecordButton(CHILD_SAFETY_PLANS_TABLE_ALIAS, row.id, row.recordId)}
                                                            </td>
                                                            <td>{row.recordId || '-'}</td>
                                                            <td>{row.planCompletionDate || '-'}</td>
                                                            <td>{enrollmentLabel || '-'}</td>
                                                          </tr>
                                                        )
                                                      })}
                                                    </tbody>
                                                  </SortableRecordTable>
                                                </div>
                                              ) : (
                                                <p className="hint">No Child Safety Plan records linked to this client yet.</p>
                                              )
                                            ) : null}
                                            {childSafetyPlanDetailLoading ? <p className="hint">Loading Child Safety Plan record...</p> : null}
                                            {childSafetyPlanDetailError ? <p className="error">{childSafetyPlanDetailError}</p> : null}
                                          </article>
                                        ) : adultAssessmentForm ? (
                                          <article className={`hub-client-quick-record${selectedAdultAssessmentDetail ? ' hub-record-view-active' : ''}`}>
                                            <div className="hub-client-quick-record-head"><h4>Adult Assessment</h4><div className="hub-form-editor-actions">{canCreateForm("Adult Assessment") ? (<button type="button" className="secondary" onClick={startAdultAssessmentFromClientDetail}>Start Adult Assessment</button>) : null}</div></div>
                                            <p className="hint">This assessment is linked to the open Client Profile and requires an active Program Enrollment.</p>
                                            {adultAssessmentsForClientLoading || programEnrollmentsClientId !== selectedDetailRecord?.id ? <p className="hint">Loading Adult Assessment records...</p> : null}
                                            {adultAssessmentsForClientError ? <p className="error">{adultAssessmentsForClientError}</p> : null}
                                            {!adultAssessmentsForClientLoading && programEnrollmentsClientId === selectedDetailRecord?.id && !adultAssessmentsForClientError ? (
                                              adultAssessmentsForClient.length > 0 ? (
                                                <div className="hub-search-results-table-wrap">
                                                  <SortableRecordTable className="hub-search-results-table">
                                                    <thead>
                                                      <tr>
                                                        <th></th>
                                                        <th>Record ID</th>
                                                        <th>Assessment Date</th>
                                                        <th>Initial Assessment</th>
                                                        <th>Program Enrollment</th>
                                                      </tr>
                                                    </thead>
                                                    <tbody>
                                                      {adultAssessmentsForClient.map((row) => {
                                                        const enrollment = programEnrollmentsForClient.find((entry) => String(entry.id || '').trim().toLowerCase() === row.programEnrollmentRowId.toLowerCase())
                                                        const enrollmentLabel = enrollment ? [enrollment.program, enrollment.recordId].filter(Boolean).join(' - ') : ''
                                                        return (
                                                          <tr key={row.id || row.recordId}>
                                                            <td>
                                                              <button
                                                                type="button"
                                                                className="secondary hub-search-open-button"
                                                                onClick={() => { void openAdultAssessmentDetailFromClient(row) }}
                                                              >
                                                                View Full Record
                                                              </button>
                                                              {canAccessClientFormAction('Adult Assessment', 'edit') ? (<button
                                                                type="button"
                                                                className="secondary hub-search-open-button"
                                                                onClick={() => { void editAdultAssessmentRecord(row.id, row.recordId, row.programEnrollmentRowId) }}
                                                              >
                                                                Edit
                                                              </button>) : null}
                                                            {renderArchiveRecordButton(ADULT_ASSESSMENTS_TABLE_ALIAS, row.id, row.recordId)}
                                                            </td>
                                                            <td>{row.recordId || '-'}</td>
                                                            <td>{row.assessmentDate || '-'}</td>
                                                            <td>{row.isInitialAssessment || '-'}</td>
                                                            <td>{enrollmentLabel || '-'}</td>
                                                          </tr>
                                                        )
                                                      })}
                                                    </tbody>
                                                  </SortableRecordTable>
                                                </div>
                                              ) : (
                                                <p className="hint">No Adult Assessment records linked to this client yet.</p>
                                              )
                                            ) : null}
                                            {adultAssessmentDetailLoading ? <p className="hint">Loading Adult Assessment record...</p> : null}
                                            {adultAssessmentDetailError ? <p className="error">{adultAssessmentDetailError}</p> : null}
                                          </article>
                                        ) : healthWellnessForm ? (
                                          <article className={`hub-client-quick-record${selectedHealthWellnessDetail ? ' hub-record-view-active' : ''}`}>
                                            <div className="hub-client-quick-record-head">
                                              <h4>Health &amp; Wellness Questionnaire</h4>
                                              <div className="hub-form-editor-actions">
                                                {canCreateForm("Health & Wellness Questionnaire") ? (<button type="button" className="secondary" onClick={startHealthWellnessFromClientDetail}>Start Health &amp; Wellness Questionnaire</button>) : null}
                                              </div>
                                            </div>
                                            <p className="hint">This questionnaire will be linked to the open Client Profile.</p>
                                            {healthWellnessForClientLoading ? <p className="hint">Loading Health and Wellness Questionnaire records...</p> : null}
                                            {healthWellnessForClientError ? <p className="error">{healthWellnessForClientError}</p> : null}
                                            {!healthWellnessForClientLoading && !healthWellnessForClientError ? (
                                              healthWellnessForClient.length > 0 ? (
                                                <div className="hub-search-results-table-wrap">
                                                  <SortableRecordTable className="hub-search-results-table">
                                                    <thead>
                                                      <tr>
                                                        <th></th>
                                                        <th>Record ID</th>
                                                        <th>Completion Date</th>
                                                      </tr>
                                                    </thead>
                                                    <tbody>
                                                      {healthWellnessForClient.map((row) => (
                                                        <tr key={row.id || row.recordId}>
                                                          <td>
                                                            <button
                                                              type="button"
                                                              className="secondary hub-search-open-button"
                                                              onClick={() => { void openHealthWellnessDetailFromClient(row) }}
                                                            >
                                                              View Full Record
                                                            </button>
                                                            {canAccessClientFormAction('Health & Wellness Questionnaire', 'edit') ? (<button
                                                              type="button"
                                                              className="secondary hub-search-open-button"
                                                              onClick={() => { void editHealthWellnessRecord(row.id, row.recordId) }}
                                                            >
                                                              Edit
                                                            </button>) : null}
                                                            {renderArchiveRecordButton(HEALTH_WELLNESS_TABLE_ALIAS, row.id, row.recordId)}
                                                          </td>
                                                          <td>{row.recordId || '-'}</td>
                                                          <td>{row.completionDate || '-'}</td>
                                                        </tr>
                                                      ))}
                                                    </tbody>
                                                  </SortableRecordTable>
                                                </div>
                                              ) : (
                                                <p className="hint">No Health and Wellness Questionnaire records linked to this client yet.</p>
                                              )
                                            ) : null}
                                            {healthWellnessDetailLoading ? <p className="hint">Loading Health and Wellness Questionnaire record...</p> : null}
                                            {healthWellnessDetailError ? <p className="error">{healthWellnessDetailError}</p> : null}
                                          </article>
                                        ) : goalForm ? (
                                          <article className={`hub-client-quick-record${selectedGoalDetail ? ' hub-record-view-active' : ''}`}>
                                            <div className="hub-client-quick-record-head">
                                              <h4>Goals</h4>
                                              {canCreateForm('Goals') ? (<button type="button" className="secondary" onClick={() => { void startFormResponse('Goals') }} disabled={activeProgramEnrollmentOptionsForGoals.length === 0}>Start Goal</button>) : null}
                                            </div>
                                            {activeProgramEnrollmentOptionsForGoals.length === 0 ? <p className="hint">An active Program Enrollment is required before creating a goal.</p> : null}
                                            {goalsForClientLoading ? <p className="hint">Loading Goals records...</p> : null}
                                            {goalsForClientError ? <p className="error">{goalsForClientError}</p> : null}
                                            {!goalsForClientLoading && !goalsForClientError ? goalsForClient.length > 0 ? (
                                              <div className="hub-search-results-table-wrap">
                                                <SortableRecordTable className="hub-search-results-table">
                                                  <thead><tr><th></th><th>Record ID</th><th>Goal</th><th>Category</th><th>Status</th><th>Start Date</th><th>Program Enrollment</th></tr></thead>
                                                  <tbody>{goalsForClient.map((row) => {
                                                    const enrollment = programEnrollmentsForClient.find((entry) => normalizeGuidText(String(entry.id || '')) === row.programEnrollmentRowId)
                                                    return <tr key={row.id || row.recordId}><td><button type="button" className="secondary hub-search-open-button" onClick={() => { void openGoalDetailFromClient(row) }}>View</button>{canAccessClientFormAction('Goals', 'edit') ? (<button type="button" className="secondary hub-search-open-button" onClick={() => { void editGoalRecord(row) }}>Edit</button>) : null}{renderArchiveRecordButton(GOALS_TABLE_ALIAS, row.id, row.recordId)}</td><td>{row.recordId || '-'}</td><td>{row.goal || '-'}</td><td>{row.category || '-'}</td><td>{row.status || '-'}</td><td>{row.startDate || '-'}</td><td>{enrollment ? [enrollment.program, enrollment.recordId].filter(Boolean).join(' - ') : '-'}</td></tr>
                                                  })}</tbody>
                                                </SortableRecordTable>
                                              </div>
                                            ) : <p className="hint">No Goal records linked to this client yet.</p> : null}
                                            {goalDetailLoading ? <p className="hint">Loading Goal record...</p> : null}
                                            {goalDetailError ? <p className="error">{goalDetailError}</p> : null}
                                          </article>
                                        ) : focusPlanForm ? (
                                          <article className={`hub-client-quick-record${selectedFocusPlanDetail ? ' hub-record-view-active' : ''}`}>
                                            <div className="hub-client-quick-record-head">
                                              <h4>FOCUS Plan</h4>
                                              <div className="hub-form-editor-actions">
                                                {canCreateForm("FOCUS Plan") ? (<button type="button" className="secondary" onClick={startFocusPlanFromClientDetail} disabled={activeProgramEnrollmentOptionsForServices.length === 0}>Start FOCUS Plan</button>) : null}
                                              </div>
                                            </div>
                                            {activeProgramEnrollmentOptionsForServices.length === 0 ? <p className="hint">An active Program Enrollment is required before starting this form.</p> : <p className="hint">Start a plan linked to one of this client's active Program Enrollments.</p>}
                                            {focusPlansForClientLoading ? <p className="hint">Loading FOCUS Plan records...</p> : null}
                                            {focusPlansForClientError ? <p className="error">{focusPlansForClientError}</p> : null}
                                            {!focusPlansForClientLoading && !focusPlansForClientError ? (
                                              focusPlansForClient.length > 0 ? (
                                                <div className="hub-search-results-table-wrap">
                                                  <SortableRecordTable className="hub-search-results-table">
                                                    <thead>
                                                      <tr>
                                                        <th></th>
                                                        <th>Record ID</th>
                                                        <th>Initial Date/Time</th>
                                                        <th>Program Enrollment</th>
                                                      </tr>
                                                    </thead>
                                                    <tbody>
                                                      {focusPlansForClient.map((row) => {
                                                        const enrollment = programEnrollmentsForClient.find((entry) => String(entry.id || '').trim().toLowerCase() === row.programEnrollmentRowId.toLowerCase())
                                                        const enrollmentLabel = enrollment ? [enrollment.program, enrollment.recordId].filter(Boolean).join(' - ') : ''
                                                        return (
                                                          <tr key={row.id || row.recordId}>
                                                            <td>
                                                              <button
                                                                type="button"
                                                                className="secondary hub-search-open-button"
                                                                onClick={() => { void openFocusPlanDetailFromClient(row) }}
                                                              >
                                                                View Full Record
                                                              </button>
                                                              {canAccessClientFormAction('FOCUS Plan', 'edit') ? (<button
                                                                type="button"
                                                                className="secondary hub-search-open-button"
                                                                onClick={() => { void editFocusPlanRecord(row.id, row.recordId, row.programEnrollmentRowId) }}
                                                              >
                                                                Edit
                                                              </button>) : null}
                                                            {renderArchiveRecordButton(FOCUS_PLANS_TABLE_ALIAS, row.id, row.recordId)}
                                                            </td>
                                                            <td>{row.recordId || '-'}</td>
                                                            <td>{row.initialDateAndTime || '-'}</td>
                                                            <td>{enrollmentLabel || '-'}</td>
                                                          </tr>
                                                        )
                                                      })}
                                                    </tbody>
                                                  </SortableRecordTable>
                                                </div>
                                              ) : (
                                                <p className="hint">No FOCUS Plan records linked to this client yet.</p>
                                              )
                                            ) : null}
                                            {focusPlanDetailLoading ? <p className="hint">Loading FOCUS Plan record...</p> : null}
                                            {focusPlanDetailError ? <p className="error">{focusPlanDetailError}</p> : null}
                                          </article>
                                        ) : initialSafetyPlanForm ? (
                                          <article className={`hub-client-quick-record${selectedInitialSafetyPlanDetail ? ' hub-record-view-active' : ''}`}>
                                            <div className="hub-client-quick-record-head">
                                              <h4>Initial Safety Plan</h4>
                                              {canCreateForm("Initial Safety Plan") ? (<button type="button" className="secondary" onClick={startInitialSafetyPlanFromClientDetail} disabled={activeProgramEnrollmentOptionsForServices.length === 0}>Start Initial Safety Plan</button>) : null}
                                            </div>
                                            {activeProgramEnrollmentOptionsForServices.length === 0 ? <p className="hint">An active Program Enrollment is required before starting this form.</p> : null}
                                            {initialSafetyPlansForClientLoading ? <p className="hint">Loading Initial Safety Plan records...</p> : null}
                                            {initialSafetyPlansForClientError ? <p className="error">{initialSafetyPlansForClientError}</p> : null}
                                            {!initialSafetyPlansForClientLoading && !initialSafetyPlansForClientError ? (
                                              initialSafetyPlansForClient.length > 0 ? (
                                                <div className="hub-search-results-table-wrap">
                                                  <SortableRecordTable className="hub-search-results-table">
                                                    <thead>
                                                      <tr>
                                                        <th></th>
                                                        <th>Record ID</th>
                                                        <th>Completion Date</th>
                                                        <th>Program Enrollment</th>
                                                      </tr>
                                                    </thead>
                                                    <tbody>
                                                      {initialSafetyPlansForClient.map((row) => {
                                                        const enrollment = programEnrollmentsForClient.find((entry) => String(entry.id || '').trim().toLowerCase() === row.programEnrollmentRowId.toLowerCase())
                                                        const enrollmentLabel = enrollment ? [enrollment.program, enrollment.recordId].filter(Boolean).join(' - ') : ''
                                                        return (
                                                          <tr key={row.id || row.recordId}>
                                                            <td>
                                                              <button
                                                                type="button"
                                                                className="secondary hub-search-open-button"
                                                                onClick={() => { void openInitialSafetyPlanDetailFromClient(row) }}
                                                              >
                                                                View Full Record
                                                              </button>
                                                              {canAccessClientFormAction('Initial Safety Plan', 'edit') ? (<button
                                                                type="button"
                                                                className="secondary hub-search-open-button"
                                                                onClick={() => { void editInitialSafetyPlanRecord(row.id, row.recordId, row.programEnrollmentRowId) }}
                                                              >
                                                                Edit
                                                              </button>) : null}
                                                            {renderArchiveRecordButton(INITIAL_SAFETY_PLANS_TABLE_ALIAS, row.id, row.recordId)}
                                                            </td>
                                                            <td>{row.recordId || '-'}</td>
                                                            <td>{row.completionDate || '-'}</td>
                                                            <td>{enrollmentLabel || '-'}</td>
                                                          </tr>
                                                        )
                                                      })}
                                                    </tbody>
                                                  </SortableRecordTable>
                                                </div>
                                              ) : (
                                                <p className="hint">No Initial Safety Plan records linked to this client yet.</p>
                                              )
                                            ) : null}
                                            {initialSafetyPlanDetailLoading ? <p className="hint">Loading Initial Safety Plan record...</p> : null}
                                            {initialSafetyPlanDetailError ? <p className="error">{initialSafetyPlanDetailError}</p> : null}
                                          </article>
                                        ) : shelterProgramGuidelinesForm ? (
                                          <article className="hub-client-quick-record">
                                            <div className="hub-client-quick-record-head">
                                              <h4>Shelter Program Guidelines</h4>
                                              {canCreateForm(form.formName) ? (<button type="button" className="secondary" onClick={() => { void startFormResponse(form.formName) }} disabled={activeProgramEnrollmentOptionsForServices.length === 0}>Start Form</button>) : null}
                                            </div>
                                            {activeProgramEnrollmentOptionsForServices.length === 0 ? <p className="hint">An active Program Enrollment is required before starting this form.</p> : <p className="hint">Start Shelter Program Guidelines for this client and select an active Program Enrollment.</p>}
                                            {renderClientLinkedRecordList(form.formName)}
                                          </article>
                                        ) : funderTransactionForm ? (
                                          <article className="hub-client-quick-record">
                                            <div className="hub-client-quick-record-head">
                                              <h4>Funder Transactions</h4>
                                              {canCreateForm(form.formName) ? (<button type="button" className="secondary" onClick={() => { void startFormResponse(form.formName) }} disabled={activeFunderContractOptions.length === 0}>Start Form</button>) : null}
                                            </div>
                                            {activeFunderContractOptions.length === 0 ? <p className="hint">An open contract without an end date is required before starting this form.</p> : <p className="hint">Start a new Funder Transaction.</p>}
                                          </article>
                                        ) : releaseOfInformationForm ? (
                                          <article className="hub-client-quick-record">
                                            <div className="hub-client-quick-record-head">
                                              <h4>Release of Information</h4>
                                              {canCreateForm(form.formName) ? (<button type="button" className="secondary" onClick={() => { void startFormResponse(form.formName) }}>Start Form</button>) : null}
                                            </div>
                                            <p className="hint">Start a new Release of Information response for this client.</p>
                                            {renderClientLinkedRecordList(form.formName)}
                                          </article>
                                        ) : petCompanionIntakeForm ? (
                                          <article className="hub-client-quick-record">
                                            <div className="hub-client-quick-record-head">
                                              <h4>Pet Companion Intake</h4>
                                              {canCreateForm(form.formName) ? (<button type="button" className="secondary" onClick={() => { void startFormResponse(form.formName) }}>Start Form</button>) : null}
                                            </div>
                                            <p className="hint">Start a new Pet Companion Intake response.</p>
                                            {renderClientLinkedRecordList(form.formName)}
                                          </article>
                                        ) : contractForm ? (
                                          <article className="hub-client-quick-record">
                                            <div className="hub-client-quick-record-head">
                                              <h4>Contract</h4>
                                              {canCreateForm(form.formName) ? (<button type="button" className="secondary" onClick={() => { void startFormResponse(form.formName) }}>Start Form</button>) : null}
                                            </div>
                                            <p className="hint">Start a new Contract response.</p>
                                          </article>
                                        ) : electronicDocumentForm ? (
                                          <article className={`hub-client-quick-record${selectedElectronicDocumentDetail ? ' hub-record-view-active' : ''}`}>
                                            <div className="hub-client-quick-record-head">
                                              <h4>Electronic Document</h4>
                                              {canCreateForm(form.formName) ? (<button type="button" className="secondary" onClick={() => { void startFormResponse(form.formName) }}>Start Form</button>) : null}
                                            </div>
                                            <p className="hint">Upload and link a document to this client profile.</p>
                                            {electronicDocumentsForClientLoading ? <p className="hint">Loading Electronic Document records...</p> : null}
                                            {electronicDocumentsForClientError ? <p className="error">{electronicDocumentsForClientError}</p> : null}
                                            {!electronicDocumentsForClientLoading && !electronicDocumentsForClientError ? (
                                              electronicDocumentsForClient.length > 0 ? (
                                                <div className="hub-search-results-table-wrap">
                                                  <SortableRecordTable className="hub-search-results-table">
                                                    <thead><tr><th></th><th>Record ID</th><th>Date of Document</th><th>Name of Document</th><th>Type of Document</th><th>File</th></tr></thead>
                                                    <tbody>
                                                      {electronicDocumentsForClient.map((row) => (
                                                        <tr key={row.id || row.recordId}>
                                                          <td>
                                                            <button type="button" className="secondary hub-search-open-button" onClick={() => { void openElectronicDocumentDetailFromClient(row) }}>View Full Record</button>
                                                            {canAccessClientFormAction('Electronic Document', 'edit') ? (<button type="button" className="secondary hub-search-open-button" onClick={() => { void editElectronicDocumentRecord(row.id, row.recordId) }}>Edit</button>) : null}
                                                            {renderArchiveRecordButton(ELECTRONIC_DOCUMENTS_TABLE_ALIAS, row.id, row.recordId)}
                                                          </td>
                                                          <td>{row.recordId || '-'}</td>
                                                          <td>{row.dateOfDocument || '-'}</td>
                                                          <td>{row.nameOfDocument || '-'}</td>
                                                          <td>{row.typeOfDocument || '-'}</td>
                                                          <td>{row.fileRowId ? <button type="button" className="secondary hub-search-open-button" onClick={() => { void openCompassFileViewer(row.fileRowId) }}>View attached file</button> : '-'}</td>
                                                        </tr>
                                                      ))}
                                                    </tbody>
                                                  </SortableRecordTable>
                                                </div>
                                              ) : <p className="hint">No Electronic Document records linked to this client yet.</p>
                                            ) : null}
                                            {electronicDocumentDetailLoading ? <p className="hint">Loading Electronic Document record...</p> : null}
                                            {electronicDocumentDetailError ? <p className="error">{electronicDocumentDetailError}</p> : null}
                                          </article>
                                        ) : termsAndConditionsOfServiceAnimalsForm ? (
                                          <article className="hub-client-quick-record">
                                            <div className="hub-client-quick-record-head">
                                              <h4>Terms &amp; Conditions of Service Animals</h4>
                                              {canCreateForm(form.formName) ? (<button type="button" className="secondary" onClick={() => { void startFormResponse(form.formName) }}>Start Form</button>) : null}
                                            </div>
                                            <p className="hint">Start a new Terms &amp; Conditions of Service Animals response.</p>
                                            {renderClientLinkedRecordList(form.formName)}
                                          </article>
                                        ) : personYouAreFleeingProfileForm ? (
                                          <article className="hub-client-quick-record">
                                            <div className="hub-client-quick-record-head">
                                              <h4>Person You Are Fleeing Profile</h4>
                                              {canCreateForm(form.formName) ? (<button type="button" className="secondary" onClick={() => { void startFormResponse(form.formName) }}>Start Form</button>) : null}
                                            </div>
                                            <p className="hint">Start a new Person You Are Fleeing Profile.</p>
                                            {renderClientLinkedRecordList(form.formName)}
                                          </article>
                                        ) : medicalConsentForm ? (
                                          <article className="hub-client-quick-record">
                                            <div className="hub-client-quick-record-head">
                                              <h4>Medical Consent Form</h4>
                                              {canCreateForm(form.formName) ? (<button type="button" className="secondary" onClick={() => { void startFormResponse(form.formName) }} disabled={activeProgramEnrollmentOptionsForServices.length === 0}>Start Form</button>) : null}
                                            </div>
                                            {activeProgramEnrollmentOptionsForServices.length === 0 ? <p className="hint">An active Program Enrollment is required before starting this form.</p> : <p className="hint">Start a Medical Consent Form linked to one of this client's active Program Enrollments.</p>}
                                            {renderClientLinkedRecordList(form.formName)}
                                          </article>
) : financialAssistanceForm ? (
                                          <article className="hub-client-quick-record">
                                            <div className="hub-client-quick-record-head">
                                              <h4>Financial Assistance</h4>
                                              {canCreateForm(form.formName) ? (<button type="button" className="secondary" onClick={() => { void startFormResponse(form.formName) }} disabled={activeProgramEnrollmentOptionsForServices.length === 0}>Start Form</button>) : null}
                                            </div>
                                            {activeProgramEnrollmentOptionsForServices.length === 0 ? <p className="hint">An active Program Enrollment is required before starting this form.</p> : <p className="hint">Start Financial Assistance for this client and select an active Program Enrollment.</p>}
                                          {renderClientLinkedRecordList(form.formName)}
                                          </article>
                                        ) : employmentAndBenefitsForm ? (
                                          <article className="hub-client-quick-record">
                                            <div className="hub-client-quick-record-head">
                                              <h4>Employment &amp; Benefits</h4>
                                              {canCreateForm(form.formName) ? (<button type="button" className="secondary" onClick={() => { void startFormResponse(form.formName) }}>Start Form</button>) : null}
                                            </div>
                                            <p className="hint">Start a new Employment &amp; Benefits response.</p>
                                            {renderClientLinkedRecordList(form.formName)}
                                          </article>
                                        ) : childShelterIntakeForm ? (
                                          <article className="hub-client-quick-record">
                                            <div className="hub-client-quick-record-head">
                                              <h4>Child Shelter Intake</h4>
                                              {canCreateForm(form.formName) ? (<button type="button" className="secondary" onClick={() => { void startFormResponse(form.formName) }} disabled={activeProgramEnrollmentOptionsForServices.length === 0}>Start Form</button>) : null}
                                            </div>
                                            {activeProgramEnrollmentOptionsForServices.length === 0 ? <p className="hint">An active Program Enrollment is required before starting this form.</p> : <p className="hint">Start a Child Shelter Intake linked to one of this client's active Program Enrollments.</p>}
                                            {renderClientLinkedRecordList(form.formName)}
                                          </article>
) : childAssessmentForm ? (
                                          <article className="hub-client-quick-record">
                                            <div className="hub-client-quick-record-head">
                                              <h4>Child Assessment</h4>
                                              {canCreateForm(form.formName) ? (<button type="button" className="secondary" onClick={() => { void startFormResponse(form.formName) }} disabled={activeProgramEnrollmentOptionsForServices.length === 0}>Start Form</button>) : null}
                                            </div>
                                            {activeProgramEnrollmentOptionsForServices.length === 0 ? <p className="hint">An active Program Enrollment is required before starting this form.</p> : <p className="hint">Start a Child Assessment linked to one of this client's active Program Enrollments.</p>}
                                          {renderClientLinkedRecordList(form.formName)}
                                          </article>
                                        ) : animalAgreementForm ? (
                                          <article className="hub-client-quick-record">
                                            <div className="hub-client-quick-record-head">
                                              <h4>Animal Agreement</h4>
                                              {canCreateForm(form.formName) ? (<button type="button" className="secondary" onClick={() => { void startFormResponse(form.formName) }}>Start Form</button>) : null}
                                            </div>
                                            <p className="hint">Start a new Animal Agreement.</p>
                                            {renderClientLinkedRecordList(form.formName)}
                                          </article>
                                        ) : acknowledgementAndConsentForm ? (
                                          <article className="hub-client-quick-record">
                                            <div className="hub-client-quick-record-head">
                                              <h4>Acknowledgement and Consent</h4>
                                              {canCreateForm(form.formName) ? (<button type="button" className="secondary" onClick={() => { void startFormResponse(form.formName) }} disabled={activeProgramEnrollmentOptionsForServices.length === 0}>Start Form</button>) : null}
                                            </div>
                                            {activeProgramEnrollmentOptionsForServices.length === 0 ? <p className="hint">An active Program Enrollment is required before starting this form.</p> : <p className="hint">Start an acknowledgement and consent form linked to one of this client's active Program Enrollments.</p>}
                                            {renderClientLinkedRecordList(form.formName)}
                                          </article>
                                        ) : servicesForm ? (
                                          <article className="hub-client-quick-record">
                                            <div className="hub-client-quick-record-head">
                                              <h4>Services For This Client</h4>
                                              <div className="hub-form-editor-actions">
                                                {canCreateForm("Services") ? (<button type="button" className="secondary" onClick={startServicesFromClientDetail}>Start Services</button>) : null}
                                              </div>
                                            </div>
                                            <p className="hint">A Services form requires selecting an active Program Enrollment (no End Date).</p>
                                            {selectedServicesDetail ? (
                                              <section className="hub-client-quick-record" style={{ marginTop: '1rem' }}>
                                                <div className="hub-client-quick-record-head">
                                                  <h4>Services Full Record</h4>
                                                  <div className="hub-form-editor-actions">
                                                    <button type="button" className="secondary" onClick={closeCurrentRecordView}>{recordViewBackButtonLabel}</button>
                                                    {canAccessClientFormAction('Services', 'edit') ? (<button
                                                      type="button"
                                                      className="secondary"
                                                      onClick={() => {
                                                        const linkedEnrollment = servicesForClient.find((entry) => {
                                                          const sameId = String(entry.id || '').trim() && String(entry.id || '').trim() === String(selectedServicesDetail.id || '').trim()
                                                          const sameRecordId = normalize(String(entry.recordId || '')) === normalize(String(selectedServicesDetail.recordId || ''))
                                                          return sameId || sameRecordId
                                                        })
                                                        void editServicesRecord(
                                                          selectedServicesDetail.id,
                                                          selectedServicesDetail.recordId,
                                                          String(linkedEnrollment?.programEnrollmentRowId || ''),
                                                        )
                                                      }}
                                                    >
                                                      Edit
                                                    </button>) : null}
                                                  </div>
                                                </div>
                                                <ReadOnlyFormSections
                                                  fields={SERVICES_FIELD_DEFINITIONS}
                                                  values={selectedServicesDetail.values}
                                                  sections={['Main', 'Service Details', 'Service Notes', 'VOCA Direct Services']}
                                                  idPrefix="client-services-view"
                                                  isVisible={(field) => isServicesFieldVisible(field.field, selectedServicesDetail.values as Record<string, string>, programEnrollmentsForClient)}
                                                  formatValue={(field, value) => formatServicesDetailValue(field.field, value)}
                                                />
                                              </section>
                                            ) : (
                                              <>
                                                {servicesForClientLoading ? <p className="hint">Loading Services records...</p> : null}
                                                {servicesForClientError ? <p className="error">{servicesForClientError}</p> : null}
                                                {servicesDetailLoading ? <p className="hint">Loading Services record...</p> : null}
                                                {servicesDetailError ? <p className="error">{servicesDetailError}</p> : null}

                                                {!servicesForClientLoading && !servicesForClientError ? (
                                                  servicesForClient.length > 0 ? (
                                                    <div className="hub-search-results-table-wrap">
                                                      <SortableRecordTable className="hub-search-results-table">
                                                        <thead>
                                                          <tr>
                                                            <th>Open</th>
                                                            <th>Record ID</th>
                                                            <th>Program Enrollment</th>
                                                            <th>Program</th>
                                                            <th>Service Category</th>
                                                            <th>Service</th>
                                                            <th>Date of Services</th>
                                                            <th>Funder</th>
                                                            <th>Minutes</th>
                                                            <th>Service Time</th>
                                                          </tr>
                                                        </thead>
                                                        <tbody>
                                                          {servicesForClient.map((row) => (
                                                            <tr key={`client-services-${row.id || row.recordId}`}>
                                                              <td>
                                                                <button
                                                                  type="button"
                                                                  className="secondary hub-search-open-button"
                                                                  onClick={() => { void openServicesDetailFromClient(row) }}
                                                                >
                                                                  View Full Record
                                                                </button>
                                                                {canAccessClientFormAction('Services', 'edit') ? (<button
                                                                  type="button"
                                                                  className="secondary hub-search-open-button"
                                                                  onClick={() => { void editServicesRecord(row.id, row.recordId, row.programEnrollmentRowId) }}
                                                                >
                                                                  Edit
                                                                </button>) : null}
                                                                {renderArchiveRecordButton(SERVICES_TABLE_ALIAS, row.id, row.recordId)}
                                                              </td>
                                                              <td>{row.recordId || '-'}</td>
                                                              <td>{row.programEnrollmentRecordId || '-'}</td>
                                                              <td>{row.programEnrollmentProgram || '-'}</td>
                                                              <td>{row.serviceCategory || '-'}</td>
                                                              <td>{row.service || '-'}</td>
                                                              <td>{row.dateOfServices || '-'}</td>
                                                              <td>{row.funder || '-'}</td>
                                                              <td>{row.minutes || '-'}</td>
                                                              <td>{row.serviceTime || '-'}</td>
                                                            </tr>
                                                          ))}
                                                        </tbody>
                                                      </SortableRecordTable>
                                                    </div>
                                                  ) : <p className="hint">No Services records linked to this client yet.</p>
                                                ) : null}
                                              </>
                                            )}
                                            {activeProgramEnrollmentOptionsForServices.length > 0 ? (
                                              <div className="hub-search-detail-grid">
                                                {activeProgramEnrollmentOptionsForServices.map((entry) => (
                                                  <div key={`active-pe-${entry.value}`} className="hub-search-detail-item">
                                                    <span className="hub-search-detail-label">Active Program Enrollment</span>
                                                    <span className="hub-search-detail-value">{entry.displayLabel}</span>
                                                  </div>
                                                ))}
                                              </div>
                                            ) : <p className="hint">No active Program Enrollment records found for this client.</p>}
                                          </article>
                                        ) : bedEnrollmentForm ? (
                                          <article className="hub-client-quick-record">
                                            <div className="hub-client-quick-record-head">
                                              <h4>Bed Enrollments For This Client</h4>
                                              <div className="hub-form-editor-actions">
                                                {canCreateForm("Bed Enrollment") ? (<button type="button" className="secondary" onClick={startBedEnrollmentFromClientDetail}>Start Bed Enrollment</button>) : null}
                                              </div>
                                            </div>
                                            <p className="hint">A Bed Enrollment form requires selecting an active Program Enrollment (no End Date).</p>
                                            {bedEnrollmentsForClientLoading ? <p className="hint">Loading Bed Enrollment records...</p> : null}
                                            {bedEnrollmentsForClientError ? <p className="error">{bedEnrollmentsForClientError}</p> : null}
                                            {bedEnrollmentDetailLoading ? <p className="hint">Loading Bed Enrollment record...</p> : null}
                                            {bedEnrollmentDetailError ? <p className="error">{bedEnrollmentDetailError}</p> : null}
                                            {!bedEnrollmentsForClientLoading && !bedEnrollmentsForClientError ? (
                                              bedEnrollmentsForClient.length > 0 ? (
                                                <div className="hub-search-results-table-wrap">
                                                  <SortableRecordTable className="hub-search-results-table">
                                                    <thead>
                                                      <tr>
                                                        <th>Open</th>
                                                        <th>Record ID</th>
                                                        <th>Program Enrollment</th>
                                                        <th>Program</th>
                                                        <th>Service Site</th>
                                                        <th>Check In Date</th>
                                                        <th>Check Out Date</th>
                                                      </tr>
                                                    </thead>
                                                    <tbody>
                                                      {bedEnrollmentsForClient.map((row) => (
                                                        <tr key={`client-bed-enrollment-${row.id || row.recordId}`}>
                                                          <td>
                                                            <button
                                                              type="button"
                                                              className="secondary hub-search-open-button"
                                                              onClick={() => { void openBedEnrollmentDetailFromClient(row) }}
                                                            >
                                                              View Full Record
                                                            </button>
                                                            {canAccessClientFormAction('Bed Enrollment', 'edit') ? (<button
                                                              type="button"
                                                              className="secondary hub-search-open-button"
                                                              onClick={() => { void editBedEnrollmentRecord(row.id, row.recordId, row.programEnrollmentRowId) }}
                                                            >
                                                              Edit
                                                            </button>) : null}
                                                            {renderArchiveRecordButton(BED_ENROLLMENTS_TABLE_ALIAS, row.id, row.recordId)}
                                                          </td>
                                                          <td>{row.recordId || '-'}</td>
                                                          <td>{row.programEnrollmentRecordId || '-'}</td>
                                                          <td>{row.programEnrollmentProgram || '-'}</td>
                                                          <td>{row.serviceSite || '-'}</td>
                                                          <td>{row.checkInDate || '-'}</td>
                                                          <td>{row.checkOutDate || '-'}</td>
                                                        </tr>
                                                      ))}
                                                    </tbody>
                                                  </SortableRecordTable>
                                                </div>
                                              ) : <p className="hint">No Bed Enrollment records linked to this client yet.</p>
                                            ) : null}
                                          </article>
                                        ) : (
                                          <p className="hint">No client records are available for this form yet.</p>
                                        )}
                                      </div>
                                    </details>
                                      )
                                    })}
                                  </div>
                                )}
                              </section>
                            ) : null}
                          </article>

                        </div>
                      )
                    ) : selectedHelplineDetail ? (
                      <article className="panel wide hub-card hub-form-editor hub-view-record-editor" key={`${selectedHub.id}-search-helpline-detail`}>
                        <div className="hub-form-editor-head">
                          <div>
                            <h3>Helpline Record</h3>
                            <p className="hint">Record ID: {selectedHelplineDetail.recordId || 'Unknown'}</p>
                          </div>
                          <div className="hub-form-editor-actions">
                            <button type="button" className="secondary" onClick={closeCurrentRecordView}>{recordViewBackButtonLabel}</button>
                            {canAccessClientFormAction('Helpline', 'edit') ? (<button type="button" className="secondary" onClick={editHelplineFromDetail}>Edit</button>) : null}
                          </div>
                        </div>

                        <ReadOnlyFormSections
                          fields={HELPLINE_FIELD_DEFINITIONS}
                            formatValue={(field, value) => formatLookupDisplayValue(field.field, value)}
                          values={selectedHelplineDetail.values}
                          sections={['Main', 'DV Helpline Details', 'SV Helpline Details', 'Current Living Situation', 'Safety Assessment', 'OVW Late Life Abuse Screening', 'Notes']}
                          idPrefix="helpline-search-view"
                          getSection={(field) => getHelplineFormSection(field.field, selectedHelplineDetail.values)}
                          isVisible={(field) => isHelplineFieldVisible(field.field, selectedHelplineDetail.values)}
                        />
                      </article>
                    ) : selectedEventDetail ? (
                      <article className="panel wide hub-card hub-form-editor hub-view-record-editor" key={`${selectedHub.id}-search-event-detail`}>
                        <div className="hub-form-editor-head">
                          <div>
                            <h3>Event</h3>
                            <p className="hint">Record ID: {selectedEventDetail.recordId || 'Unknown'}</p>
                          </div>
                          <div className="hub-form-editor-actions">
                            <button type="button" className="secondary" onClick={closeCurrentRecordView}>{recordViewBackButtonLabel}</button>
                            {canAccessClientFormAction('Event', 'edit') ? (<button type="button" className="secondary" onClick={editEventFromDetail}>Edit</button>) : null}
                          </div>
                        </div>

                        <ReadOnlyFormSections
                          fields={EVENT_FIELD_DEFINITIONS}
                          values={selectedEventDetail.values}
                          sections={['Event Details', 'Attendance by Demographic', 'Notes']}
                          idPrefix="event-view"
                          onOpenFile={(fileId) => { void openCompassFileViewer(fileId) }}
                        />
                      </article>
                    ) : selectedAppNav === 'programs' ? (
                      <ProgramTableSearchPanel
                        key={selectedHub.id}
                        hub={selectedHub}
                        profiles={roleProfiles}
                        rolesLoading={roleProfilesLoading}
                        rolesError={roleProfilesError}
                        fields={PROGRAM_SEARCH_FIELDS}
                        refreshSignal={clientLookupRefreshSignal}
                        onOpenClientProfile={async (row) => !!await openClientProfileDetail(row.id, row.recordId)}
                        onOpenFile={(id) => { void openCompassFileViewer(id) }}
                        renderArchiveButton={renderArchiveRecordButton}
                      />
                    ) : (
                    <>
                      <article className="panel wide hub-card" key={`${selectedHub.id}-search-tools`}>
                        <h3>Search Records</h3>
                        <p className="hint">Choose which table to search from the Form/Table selector.</p>

                        <div className="hub-search-controls">
                          {selectedAppNav === 'clients' ? (
                            <div className="hub-form-field" aria-label="Clients table type">
                              <span>Form/Table</span>
                              <div className="inline-status">Client Profile</div>
                            </div>
                          ) : (
                            <label className="hub-form-field" htmlFor="hub-search-form-select">
                              <span>Form/Table</span>
                              <select
                                id="hub-search-form-select"
                                value={selectedSearchForm}
                                onChange={(event) => {
                                  const nextForm = event.target.value === 'Helpline' ? 'Helpline' : event.target.value === 'Event' ? 'Event' : 'Client Profile'
                                  setSelectedSearchFormByHub((current) => ({
                                    ...current,
                                    [selectedHub.id]: nextForm,
                                  }))
                                  setActiveSearchDetailByHub((current) => ({ ...current, [selectedHub.id]: null }))
                                  setActiveHelplineDetailByHub((current) => ({ ...current, [selectedHub.id]: null }))
                                  setActiveEventDetailByHub((current) => ({ ...current, [selectedHub.id]: null }))
                                  setDetailErrorByHub((current) => ({ ...current, [selectedHub.id]: '' }))
                                  setShowFullDetailByHub((current) => ({ ...current, [selectedHub.id]: false }))
                                  setSelectedProgramEnrollmentDetail(null)
                                  setProgramEnrollmentDetailError('')
                                  setSearchPageByHub((current) => ({ ...current, [selectedHub.id]: 1 }))
                                  setSearchHasNextByHub((current) => ({ ...current, [selectedHub.id]: false }))
                                }}
                              >
                                <option value="Client Profile">Client Profile</option>
                                <option value="Helpline">Helpline</option>
                                <option value="Event">Event</option>
                              </select>
                            </label>
                          )}

                          <label className="hub-form-field" htmlFor="hub-search-query-input">
                            <span>Search text</span>
                            <input
                              id="hub-search-query-input"
                              type="text"
                              maxLength={250}
                              value={selectedSearchQuery}
                              onChange={(event) => {
                                const nextQuery = event.target.value
                                setSearchQueryByHub((current) => ({
                                  ...current,
                                  [selectedHub.id]: nextQuery,
                                }))
                                setSearchPageByHub((current) => ({ ...current, [selectedHub.id]: 1 }))
                                setSearchHasNextByHub((current) => ({ ...current, [selectedHub.id]: false }))
                              }}
                              placeholder={selectedSearchForm === 'Helpline' ? 'Record ID, caller location, or notes' : selectedSearchForm === 'Event' ? 'Record ID, event title, or location' : 'Record ID, name, or HMIS ID'}
                            />
                          </label>

                          <div className="hub-search-actions">
                            <span className="hint">Results load automatically.</span>
                            {selectedSearchForm === 'Client Profile' ? <DataverseAdvancedSearch
                              tableKey="client-profile" developedFields={PROGRAM_SEARCH_FIELDS['client-profile']}
                              applied={selectedAdvancedClientFilters} onApply={(criteria) => {
                                setAdvancedClientFiltersByHub((current) => ({ ...current, [selectedHub.id]: criteria }))
                                setSearchPageByHub((current) => ({ ...current, [selectedHub.id]: 1 }))
                                setSearchHasNextByHub((current) => ({ ...current, [selectedHub.id]: false }))
                                setSearchResultsByHub((current) => ({ ...current, [selectedHub.id]: [] }))
                              }} /> : null}
                          </div>
                        </div>

                        {selectedSearchStatus ? <p className="success">{selectedSearchStatus}</p> : null}
                        {selectedSearchError ? <p className="error">{selectedSearchError}</p> : null}
                        {selectedDetailError ? <p className="error">{selectedDetailError}</p> : null}
                      </article>

                      <article className="panel wide hub-card" key={`${selectedHub.id}-search-results`}>
                        <h3>Search Results</h3>
                        {selectedDetailLoading ? <p className="hint">Loading record details...</p> : null}
                        {renderClientSearchPagination('top')}
                        {selectedSearchResults.length === 0 ? (
                          <p className="hint">No results to show yet.</p>
                        ) : (
                          isClientsCardView ? (
                            <div className="client-results-card-grid">
                              {(selectedSearchResults as ClientProfileSearchRecord[]).map((row) => (
                                <article className="client-result-card" key={`${row.id || row.recordId}-${row.hmisId || row.name}`}>
                                  {normalize(row.alertList) === 'yes' ? (
                                    <div className="client-alert-notice">
                                      <div className="client-alert-notice-head">** NOTICE **</div>
                                      <div className="client-alert-notice-body">
                                        <div>This client is on the ALERT LIST.</div>
                                        <div>{row.alertListReason ? `See reason below: ${row.alertListReason}` : 'See reason below.'}</div>
                                      </div>
                                    </div>
                                  ) : null}

                                  <div className="client-result-card-head">
                                    <h4>{row.name || 'Client Record'}</h4>
                                    <span className="chip subtle">{row.recordId || 'No Record ID'}</span>
                                  </div>

                                  <div className="client-result-card-meta">
                                    <div className="client-result-card-item">
                                      <span>HMIS ID</span>
                                      <strong>{row.hmisId || '-'}</strong>
                                    </div>
                                    <div className="client-result-card-item">
                                      <span>Date of Birth</span>
                                      <strong>{row.dateOfBirth || '-'}</strong>
                                    </div>
                                    <div className="client-result-card-item">
                                      <span>Primary Language</span>
                                      <strong>{row.primaryLanguage || '-'}</strong>
                                    </div>
                                    <div className="client-result-card-item">
                                      <span>Gender</span>
                                      <strong>{row.gender || '-'}</strong>
                                    </div>
                                  </div>

                                  <div className="client-result-card-actions">
                                    <button
                                      type="button"
                                      className="secondary"
                                      onClick={() => { void openClientProfileDetail(row.id, row.recordId) }}
                                      disabled={selectedDetailLoading}
                                    >
                                      Open Profile
                                    </button>
                                    {renderArchiveRecordButton(CLIENT_PROFILE_TABLE_ALIAS, row.id, row.recordId || row.name)}
                                  </div>
                                </article>
                              ))}
                            </div>
                          ) : (
                            <div className="hub-search-results-table-wrap">
                              {selectedSearchForm === 'Helpline' ? (
                              <table className="hub-search-results-table">
                                <thead>
                                  <tr>
                                    <th>Open</th>
                                    <th>Record ID</th>
                                    <th>Program</th>
                                    <th>Date Of Contact</th>
                                    <th>Contact Type</th>
                                    <th>Call Length (minutes)</th>
                                  </tr>
                                </thead>
                                <tbody>
                                  {(selectedSearchResults as HelplineSearchRecord[]).map((row) => (
                                    <tr key={`${row.id || row.recordId}`}>
                                      <td>
                                        <button
                                          type="button"
                                          className="secondary hub-search-open-button"
                                          onClick={() => { void openHelplineDetail(row.id, row.recordId) }}
                                          disabled={selectedDetailLoading}
                                        >
                                          Open
                                        </button>
                                        {renderArchiveRecordButton(HELPLINES_TABLE_ALIAS, row.id, row.recordId)}
                                      </td>
                                      <td>{row.recordId || '-'}</td>
                                      <td>{row.program || '-'}</td>
                                      <td>{row.dateOfContact || '-'}</td>
                                      <td>{row.contactType || '-'}</td>
                                      <td>{row.callLengthMinutes || '-'}</td>
                                    </tr>
                                  ))}
                                </tbody>
                              </table>
                              ) : selectedSearchForm === 'Event' ? (
                              <table className="hub-search-results-table">
                                <thead>
                                  <tr>
                                    <th>Open</th>
                                    <th>Record ID</th>
                                    <th>Program</th>
                                    <th>Event Date</th>
                                    <th>Event Title</th>
                                  </tr>
                                </thead>
                                <tbody>
                                  {(selectedSearchResults as EventSearchRecord[]).map((row) => (
                                    <tr key={`${row.id || row.recordId}`}>
                                      <td>
                                        <button
                                          type="button"
                                          className="secondary hub-search-open-button"
                                          onClick={() => { void openEventDetail(row.id, row.recordId) }}
                                          disabled={selectedDetailLoading}
                                        >
                                          Open
                                        </button>
                                        {canAccessClientFormAction('Event', 'view') ? <RecordAttachmentButtons attachments={recordAttachments('event', { cmps_fileid1: row.fileRowId1, cmps_fileid2: row.fileRowId2 })} onOpenFile={(id) => { void openCompassFileViewer(id) }} /> : null}
                                        {renderArchiveRecordButton(EVENTS_TABLE_ALIAS, row.id, row.recordId)}
                                      </td>
                                      <td>{row.recordId || '-'}</td>
                                      <td>{row.program || '-'}</td>
                                      <td>{row.eventDate || '-'}</td>
                                      <td>{row.eventTitle || '-'}</td>
                                    </tr>
                                  ))}
                                </tbody>
                              </table>
                              ) : (
                                <table className="hub-search-results-table">
                                <thead>
                                  <tr>
                                    <th>Open</th>
                                    <th>Record ID</th>
                                    <th>Name</th>
                                    <th>HMIS ID</th>
                                    <th>Date of Birth</th>
                                    <th>Primary Language</th>
                                    <th>Gender</th>
                                  </tr>
                                </thead>
                                <tbody>
                                  {(selectedSearchResults as ClientProfileSearchRecord[]).map((row) => (
                                    <Fragment key={`${row.id || row.recordId}-${row.hmisId}`}>
                                      {normalize(row.alertList) === 'yes' ? (
                                        <tr>
                                          <td colSpan={6}>
                                            <div className="client-alert-notice">
                                              <div className="client-alert-notice-head">** NOTICE **</div>
                                              <div className="client-alert-notice-body">
                                                <div>This client is on the ALERT LIST.</div>
                                                <div>{row.alertListReason ? `See reason below: ${row.alertListReason}` : 'See reason below.'}</div>
                                              </div>
                                            </div>
                                          </td>
                                        </tr>
                                      ) : null}
                                      <tr>
                                        <td>
                                          <button
                                            type="button"
                                            className="secondary hub-search-open-button"
                                            onClick={() => { void openClientProfileDetail(row.id, row.recordId) }}
                                            disabled={selectedDetailLoading}
                                          >
                                            Open
                                          </button>
                                          {renderArchiveRecordButton(CLIENT_PROFILE_TABLE_ALIAS, row.id, row.recordId || row.name)}
                                        </td>
                                        <td>{row.recordId || '-'}</td>
                                        <td>{row.name || '-'}</td>
                                        <td>{row.hmisId || '-'}</td>
                                        <td>{row.dateOfBirth || '-'}</td>
                                        <td>{row.primaryLanguage || '-'}</td>
                                        <td>{row.gender || '-'}</td>
                                      </tr>
                                    </Fragment>
                                  ))}
                                </tbody>
                              </table>
                              )}
                            </div>
                          )
                        )}
                        {renderClientSearchPagination('bottom')}
                      </article>
                    </>
                    )}
                    {recordViewContext ? (
                      <section className="panel wide hub-card hub-form-system-fields" aria-label="System Fields">
                        <div className="hub-client-quick-record-head">
                          <h4 className="hub-form-section-title">System Fields</h4>
                          {canAccessRoleAdmin ? (
                            <button type="button" className="secondary danger" onClick={() => { void archiveRecord(recordViewContext.tableAlias, recordViewContext.rowId, recordViewContext.recordId) }} disabled={isUserPreview || (archiveActionLoading)}>
                              {archiveActionLoading ? 'Archiving...' : 'Archive'}
                            </button>
                          ) : null}
                        </div>
                        <div className="hub-form-grid">
                          <label className="hub-form-field">
                            <span>Record ID</span>
                            <input type="text" value={recordViewContext.recordId || 'Unknown'} readOnly disabled />
                          </label>
                          <label className="hub-form-field">
                            <span>Created By</span>
                            <input type="text" value={recordViewSystemFields.createdBy || '-'} readOnly disabled />
                          </label>
                          <label className="hub-form-field">
                            <span>Created Time</span>
                            <input type="text" value={formatSystemTimestamp(recordViewSystemFields.createdOn) || '-'} readOnly disabled />
                          </label>
                          <label className="hub-form-field">
                            <span>Modified By</span>
                            <input type="text" value={recordViewSystemFields.modifiedBy || '-'} readOnly disabled />
                          </label>
                          <label className="hub-form-field">
                            <span>Modified Time</span>
                            <input type="text" value={formatSystemTimestamp(recordViewSystemFields.modifiedOn) || '-'} readOnly disabled />
                          </label>
                        </div>
                        {recordViewSystemFieldsLoading ? <p className="hint">Loading system fields...</p> : null}
                        {recordViewSystemFieldsError ? <p className="error">Unable to load the latest system information.</p> : null}
                        {archiveActionError ? <p className="error">{archiveActionError}</p> : null}
                      </section>
                    ) : null}
                    </>
                  ) : selectedHubPage === 'forms' ? (
                    <>
                    {activeFormSession ? (
                      <aside className="hub-form-fixed-actions" aria-label="Form actions">
                        <div>
                          <p className="eyebrow">Form actions</p>
                          <h3>{activeFormSession.formName}</h3>{activeFormClientContext ? <p className="form-client-context">Client: {activeFormClientContext.recordId} {"\u2014"} {activeFormClientContext.name}</p> : null}
                        </div>
                        <div className="hub-form-fixed-actions-buttons">
                          <button type="button" className="secondary" onClick={closeActiveForm} disabled={activeFormSaving}>{formBackButtonLabel}</button>
                          <button type="button" className="primary" onClick={() => { void saveActiveForm() }} disabled={isUserPreview || (activeFormSaving)}>
                            {activeFormSaving ? 'Saving...' : 'Save Form'}
                          </button>
                        </div>
                        {displayedFormError ? (() => {
                          const requiredFieldLabels = getRequiredFieldLabels(displayedFormError)
                          if (!requiredFieldLabels) {
                            return <p className="error hub-form-fixed-error">{displayedFormError}</p>
                          }

                          return (
                            <div className="error hub-form-fixed-error" role="alert">
                              <details className="required-fields-details" open>
                                <summary>Please complete required field(s) ({requiredFieldLabels.length})</summary>
                                <ul className="required-fields-list">
                                  {requiredFieldLabels.map((label) => <li key={label}>{label}</li>)}
                                </ul>
                              </details>
                            </div>
                          )
                        })() : null}
                      </aside>
                    ) : null}
                    {recordFormView && !activeFormSession ? (
                      <article className="panel wide hub-card hub-form-editor hub-view-record-editor">
                        <div className="hub-form-editor-head">
                          <div>
                            <h3>{PRINT_FORM_NAMES[recordFormView.kind]}</h3>
                            <p className="hint">Record ID: {recordFormView.detail.recordId}</p>
                            {recordFormView.client ? <p className="form-client-context">Client: {recordFormView.client.recordId} {"\u2014"} {getClientProfileDisplayName(recordFormView.client.values)}</p> : null}
                          </div>
                        </div>
                        <p className="hint">Read-only form view.</p>
                        {renderPrintableRecord(recordFormView.kind, recordFormView.detail, false)}
                        {recordFormView.kind === 'household' && householdView?.detail?.id === recordFormView.detail.id ? <>
                          <h3>Active Household Members</h3>
                          <div className="hub-search-results-table-wrap"><table className="hub-search-results-table">
                            <thead><tr><th>Client</th><th>Relationship to Head of Household</th><th>Status</th></tr></thead>
                            <tbody>{householdView.members.map((member) => <tr key={member.id}><td>{member.clientName || member.clientRecordId || 'Client Profile'}</td><td>{member.relationshipToHohOther || member.relationshipToHoh || '-'}</td><td>{member.status}</td></tr>)}</tbody>
                          </table></div>
                        </> : null}
                        <section className="hub-form-section hub-form-system-fields" aria-label="System Fields">
                          <div className="hub-client-quick-record-head">
                            <h4 className="hub-form-section-title">System Fields</h4>
                            {canAccessRoleAdmin && recordViewContext?.tableAlias ? <button type="button" className="secondary danger" onClick={() => { void archiveRecord(recordViewContext.tableAlias, recordViewContext.rowId, recordViewContext.recordId) }} disabled={isUserPreview || archiveActionLoading}>{archiveActionLoading ? 'Archiving...' : 'Archive'}</button> : null}
                          </div>
                          <div className="hub-form-grid">
                            <label className="hub-form-field"><span>Created By</span><input value={recordViewSystemFields.createdBy || '-'} readOnly disabled /></label>
                            <label className="hub-form-field"><span>Created Time</span><input value={formatSystemTimestamp(recordViewSystemFields.createdOn) || '-'} readOnly disabled /></label>
                            <label className="hub-form-field"><span>Modified By</span><input value={recordViewSystemFields.modifiedBy || '-'} readOnly disabled /></label>
                            <label className="hub-form-field"><span>Modified Time</span><input value={formatSystemTimestamp(recordViewSystemFields.modifiedOn) || '-'} readOnly disabled /></label>
                          </div>
                          {recordViewSystemFieldsLoading ? <p className="hint">Loading system fields...</p> : null}
                          {recordViewSystemFieldsError ? <p className="error">Unable to load the latest system information.</p> : null}
                          {archiveActionError ? <p className="error">{archiveActionError}</p> : null}
                        </section>
                      </article>
                    ) : activeFormSession?.kind === 'client-profile' ? (
                      <article className="panel wide hub-card hub-form-editor" key={`${selectedHub.id}-forms-editor`}>
                        <div className="hub-form-editor-head">
                          <div>
                            <h3>{activeFormSession.formName}</h3>{activeFormClientContext ? <p className="form-client-context">Client: {activeFormClientContext.recordId} {"\u2014"} {activeFormClientContext.name}</p> : null}
                            <p className="hint">Record ID: {activeFormSession.recordId || 'Pending'}</p>
                          </div>
                          <div className="hub-form-editor-actions">
                            <button type="button" className="secondary" onClick={closeActiveForm} disabled={activeFormSaving}>Back</button>
                            <button type="button" className="primary" onClick={() => { void saveActiveForm() }} disabled={isUserPreview || (activeFormSaving)}>
                              {activeFormSaving ? 'Saving...' : 'Save Form'}
                            </button>
                          </div>
                        </div>

                        <div className="hub-form-sections">
                          {(['Main', 'Previous Location', 'Notes'] as const).map((section) => (
                            <section className="hub-form-section" key={`client-profile-section-${section}`}>
                              <h4 className="hub-form-section-title">{section}</h4>
                              <div className="hub-form-grid">
                          {CLIENT_PROFILE_FIELDS.filter((fieldDef) => fieldDef.section === section && fieldDef.field !== 'cmps_picture' && isClientProfileFieldVisible(fieldDef, activeFormSession.values)).map((fieldDef) => {
                            const value = activeFormSession.values[fieldDef.field] || ''
                            const fieldId = `client-profile-${fieldDef.field}`
                            const dynamicPicklist = resolveDynamicPicklistField('Client Profile', fieldDef.label)
                            const effectiveOptions = fieldDef.field === 'cmps_areyouausmilitaryveteran'
                              ? fieldDef.options
                              : dynamicPicklist?.active === false
                              ? []
                              : (dynamicPicklist?.options.length ? dynamicPicklist.options : fieldDef.options)
                            const selectOptions = effectiveOptions.filter((option) => option !== '--Please Select--')
                            const effectiveInput = fieldDef.field === 'cmps_areyouausmilitaryveteran'
                              ? 'select'
                              : fieldDef.field === 'cmps_alertlistreason'
                              ? 'text'
                              : dynamicPicklist?.active === false
                              ? 'text'
                              : (dynamicPicklist?.inputOverride || fieldDef.input)
                            const hasOptions = effectiveOptions.length > 0
                            const multiSelections = parseMultiValue(value)
                            const primaryLanguage = parsePrimaryLanguage(activeFormSession.values.cmps_primarylanguage || '')

                            const meta = null

                            if (fieldDef.field === 'cmps_name') {
                              return (
                                <div key={fieldDef.field} className="hub-form-field hub-form-field-wide">
                                  <div className="hub-form-inline-grid3">
                                    <label className="hub-form-field" htmlFor={`${fieldId}-first`}>
                                      <span>First Name</span>
                                      <input
                                        id={`${fieldId}-first`}
                                        type="text"
                                        value={nameParts.first}
                                        onChange={(event) => updateNameValue('first', event.target.value)}
                                      />
                                    </label>
                                    <label className="hub-form-field" htmlFor={`${fieldId}-middle`}>
                                      <span>Middle Name</span>
                                      <input
                                        id={`${fieldId}-middle`}
                                        type="text"
                                        value={nameParts.middle}
                                        onChange={(event) => updateNameValue('middle', event.target.value)}
                                      />
                                    </label>
                                    <label className="hub-form-field" htmlFor={`${fieldId}-last`}>
                                      <span>Last Name</span>
                                      <input
                                        id={`${fieldId}-last`}
                                        type="text"
                                        value={isAnonymousClientProfile(activeFormSession.values) ? 'Anonymous' : nameParts.last}
                                        className={isAnonymousClientProfile(activeFormSession.values) ? 'anonymous-profile-lastname' : undefined}
                                        disabled={isAnonymousClientProfile(activeFormSession.values)}
                                        readOnly={isAnonymousClientProfile(activeFormSession.values)}
                                        onChange={(event) => updateNameValue('last', event.target.value)}
                                      />
                                    </label>
                                  </div>
                                  {meta}
                                </div>
                              )
                            }

                            if (fieldDef.field === 'cmps_middlename' || fieldDef.field === 'cmps_lastname') {
                              return null
                            }

                            if (fieldDef.field === 'cmps_clientcontactinformation') {
                              return (
                                <div key={fieldDef.field} className="hub-form-field hub-form-field-wide">
                                  <span>{fieldDef.label}</span>
                                  <div className="hub-form-inline-grid-ssn">
                                    <input
                                      id={`${fieldId}-1`}
                                      type="text"
                                      inputMode="numeric"
                                      maxLength={3}
                                      value={phoneParts.part1}
                                      onChange={(event) => updatePhoneValue('part1', event.target.value)}
                                      placeholder="555"
                                      aria-label="Phone area code"
                                    />
                                    <span className="hub-form-ssn-divider">-</span>
                                    <input
                                      id={`${fieldId}-2`}
                                      type="text"
                                      inputMode="numeric"
                                      maxLength={3}
                                      value={phoneParts.part2}
                                      onChange={(event) => updatePhoneValue('part2', event.target.value)}
                                      placeholder="555"
                                      aria-label="Phone prefix"
                                    />
                                    <span className="hub-form-ssn-divider">-</span>
                                    <input
                                      id={`${fieldId}-3`}
                                      type="text"
                                      inputMode="numeric"
                                      maxLength={4}
                                      value={phoneParts.part3}
                                      onChange={(event) => updatePhoneValue('part3', event.target.value)}
                                      placeholder="5555"
                                      aria-label="Phone line number"
                                    />
                                  </div>
                                  {meta}
                                </div>
                              )
                            }

                            if (fieldDef.field === 'cmps_addressline1') {
                              return (
                                <div key={fieldDef.field} className="hub-form-field hub-form-field-wide">
                                  <div className="hub-form-address-grid">
                                    <label className="hub-form-field hub-form-field-wide" htmlFor={`${fieldId}-line1`}>
                                      <span>Address line 1</span>
                                      <input
                                        id={`${fieldId}-line1`}
                                        type="text"
                                        value={addressParts.line1}
                                        onChange={(event) => updateAddressValue('line1', event.target.value)}
                                      />
                                    </label>
                                    <label className="hub-form-field hub-form-field-wide" htmlFor={`${fieldId}-line2`}>
                                      <span>Address line 2</span>
                                      <input
                                        id={`${fieldId}-line2`}
                                        type="text"
                                        value={addressParts.line2}
                                        onChange={(event) => updateAddressValue('line2', event.target.value)}
                                      />
                                    </label>
                                    <label className="hub-form-field" htmlFor={`${fieldId}-city`}>
                                      <span>City</span>
                                      <input
                                        id={`${fieldId}-city`}
                                        type="text"
                                        value={addressParts.city}
                                        onChange={(event) => updateAddressValue('city', event.target.value)}
                                      />
                                    </label>
                                    <label className="hub-form-field" htmlFor={`${fieldId}-state`}>
                                      <span>State</span>
                                      <select
                                        id={`${fieldId}-state`}
                                        value={addressParts.state}
                                        onChange={(event) => updateAddressValue('state', event.target.value)}
                                      >
                                        <option value="">--Please Select--</option>
                                        {US_STATE_OPTIONS.map((stateCode) => (
                                          <option key={`${fieldDef.field}-${stateCode}`} value={stateCode}>{stateCode}</option>
                                        ))}
                                      </select>
                                    </label>
                                    <label className="hub-form-field" htmlFor={`${fieldId}-county`}>
                                      <span>County</span>
                                      <input
                                        id={`${fieldId}-county`}
                                        type="text"
                                        value={addressParts.county}
                                        onChange={(event) => updateAddressValue('county', event.target.value)}
                                      />
                                    </label>
                                    <label className="hub-form-field" htmlFor={`${fieldId}-zip`}>
                                      <span>Zip</span>
                                      <input
                                        id={`${fieldId}-zip`}
                                        type="text"
                                        value={addressParts.zip}
                                        onChange={(event) => updateAddressValue('zip', event.target.value)}
                                      />
                                    </label>
                                  </div>
                                  {meta}
                                </div>
                              )
                            }

                            if (
                              fieldDef.field === 'cmps_addressline2'
                              || fieldDef.field === 'cmps_city'
                              || fieldDef.field === 'cmps_state'
                              || fieldDef.field === 'cmps_county'
                              || fieldDef.field === 'cmps_zip'
                            ) {
                              return null
                            }

                            if (fieldDef.field === 'cmps_currentage') {
                              return (
                                <label key={fieldDef.field} className="hub-form-field" htmlFor={fieldId}>
                                  <span>{fieldDef.label}</span>
                                  <input id={fieldId} type="text" value={value} readOnly disabled />
                                  <span className="hub-form-meta">Auto-calculated from Date of Birth and today's date.</span>
                                  {meta}
                                </label>
                              )
                            }

                            if (effectiveInput === 'readonly') {
                              if (fieldDef.field === 'cmps_recordid') {
                                return (
                                  <label key={fieldDef.field} className="hub-form-field" htmlFor={fieldId}>
                                      <span>{fieldDef.label}</span>
                                      <input id={fieldId} type="text" value={value} readOnly disabled />
                                      {meta}
                                  </label>
                                )
                              }
                              return (
                                <label key={fieldDef.field} className="hub-form-field" htmlFor={fieldId}>
                                  <span>{fieldDef.label}</span>
                                  <input id={fieldId} type="text" value={value} readOnly disabled />
                                  {meta}
                                </label>
                              )
                            }

                            if (effectiveInput === 'textarea') {
                              if (fieldDef.field === 'cmps_notes') {
                                return (
                                  <label key={fieldDef.field} className="hub-form-field hub-form-field-wide" htmlFor={fieldId}>
                                      <span>{fieldDef.label}</span>
                                      <textarea id={fieldId} value={value} onChange={(event) => updateActiveFormValue(fieldDef.field, event.target.value)} />
                                      {meta}
                                  </label>
                                )
                              }
                              return (
                                <label key={fieldDef.field} className="hub-form-field hub-form-field-wide" htmlFor={fieldId}>
                                  <span>{fieldDef.label}</span>
                                  <textarea
                                    id={fieldId}
                                    value={value}
                                    onChange={(event) => updateActiveFormValue(fieldDef.field, event.target.value)}
                                  />
                                  {meta}
                                </label>
                              )
                            }

                            if (effectiveInput === 'checkbox') {
                              const checkedValue = effectiveOptions[0] || 'Yes'
                              const isChecked = normalize(value) === normalize(checkedValue)
                              return (
                                <label key={fieldDef.field} className="hub-form-field" htmlFor={fieldId}>
                                  <span>{fieldDef.label}</span>
                                  <label className="permission-check">
                                    <input
                                      id={fieldId}
                                      type="checkbox"
                                      checked={isChecked}
                                      onChange={(event) => updateActiveFormValue(fieldDef.field, event.target.checked ? checkedValue : '')}
                                    />
                                    <span>{checkedValue}</span>
                                  </label>
                                  {meta}
                                </label>
                              )
                            }

                            if (effectiveInput === 'checkbox-group') {
                              return (
                                <div key={fieldDef.field} className="hub-form-field hub-form-field-wide">
                                  <span>{fieldDef.label}</span>
                                  {hasOptions ? (
                                    <div className="hub-form-option-grid" role="group" aria-label={fieldDef.label}>
                                      {effectiveOptions.map((option) => {
                                        const checked = multiSelections.some((entry) => normalize(entry) === normalize(option))
                                        return (
                                          <label key={`${fieldDef.field}-${option}`} className="permission-check">
                                            <input
                                              type="checkbox"
                                              checked={checked}
                                              onChange={(event) => updateMultiSelectValue(fieldDef.field, option, event.target.checked)}
                                            />
                                            <span>{option}</span>
                                          </label>
                                        )
                                      })}
                                    </div>
                                  ) : (
                                    <textarea
                                      id={fieldId}
                                      value={value}
                                      onChange={(event) => updateActiveFormValue(fieldDef.field, event.target.value)}
                                      placeholder="Enter selected values separated by commas"
                                    />
                                  )}
                                  {meta}
                                </div>
                              )
                            }

                            if (effectiveInput === 'radio') {
                              return (
                                <div key={fieldDef.field} className="hub-form-field">
                                  <span>{fieldDef.label}</span>
                                  {hasOptions ? (
                                    <div className={`hub-form-option-grid${fieldDef.field === 'cmps_gender' ? ' client-profile-gender-options' : ''}`} role="radiogroup" aria-label={fieldDef.label}>
                                      {effectiveOptions.map((option) => (
                                        <label key={`${fieldDef.field}-${option}`} className="permission-check">
                                          <input
                                            type="radio"
                                            name={fieldId}
                                            checked={
                                              fieldDef.field === 'cmps_primarylanguage'
                                                ? (option === 'Other'
                                                  ? normalize(primaryLanguage.selected) === 'other'
                                                  : normalize(primaryLanguage.selected) === normalize(option))
                                                : normalize(value) === normalize(option)
                                            }
                                            onChange={() => {
                                              if (fieldDef.field === 'cmps_primarylanguage') {
                                                updatePrimaryLanguageValue(option)
                                                return
                                              }
                                              updateActiveFormValue(fieldDef.field, option)
                                            }}
                                          />
                                          <span>{option}</span>
                                        </label>
                                      ))}
                                    </div>
                                  ) : (
                                    <input
                                      id={fieldId}
                                      type="text"
                                      value={value}
                                      onChange={(event) => updateActiveFormValue(fieldDef.field, event.target.value)}
                                    />
                                  )}
                                  {fieldDef.field === 'cmps_primarylanguage' && normalize(primaryLanguage.selected) === 'other' ? (
                                    <label className="hub-form-field" htmlFor={`${fieldId}-other`}>
                                      <span>Other language</span>
                                      <input
                                        id={`${fieldId}-other`}
                                        type="text"
                                        value={primaryLanguageOther}
                                        onChange={(event) => updatePrimaryLanguageOtherValue(event.target.value)}
                                      />
                                    </label>
                                  ) : null}
                                  {meta}
                                </div>
                              )
                            }

                            if (effectiveInput === 'select') {
                              return (
                                <label key={fieldDef.field} className="hub-form-field" htmlFor={fieldId}>
                                  <span>{fieldDef.label}</span>
                                  {hasOptions ? (
                                    <select
                                      id={fieldId}
                                      value={value}
                                      onChange={(event) => updateActiveFormValue(fieldDef.field, event.target.value)}
                                    >
                                      <option value="" disabled hidden>
                                        --Please Select--
                                      </option>
                                      {selectOptions.map((option) => (
                                        <option key={`${fieldDef.field}-${option}`} value={option}>{option}</option>
                                      ))}
                                    </select>
                                  ) : (
                                    <input
                                      id={fieldId}
                                      type="text"
                                      value={value}
                                      onChange={(event) => updateActiveFormValue(fieldDef.field, event.target.value)}
                                    />
                                  )}
                                  {meta}
                                </label>
                              )
                            }

                            const inputType =
                              effectiveInput === 'date'
                                ? 'date'
                                : effectiveInput === 'number'
                                  ? 'number'
                                  : effectiveInput === 'email'
                                    ? 'email'
                                    : effectiveInput === 'phone'
                                      ? 'tel'
                                      : 'text'
                            return (
                              <label key={fieldDef.field} className="hub-form-field" htmlFor={fieldId}>
                                <span>{fieldDef.label}</span>
                                <FormInput
                                  id={fieldId}
                                  type={inputType}
                                  value={value}
                                  onChange={(event) => updateActiveFormValue(fieldDef.field, event.target.value)}
                                />
                                {meta}
                              </label>
                            )
                          })}
                              </div>
                            </section>
                          ))}
                        </div>

                        {activeFormError ? <p className="error">{activeFormError}</p> : null}
                        {hubActionStatus ? <p className="success">{hubActionStatus}</p> : null}
                      </article>
                    ) : activeFormSession?.kind === 'household' ? (
                      <article className="panel wide hub-card hub-form-editor" key={`${selectedHub.id}-household-editor`}>
                        <div className="hub-form-editor-head">
                          <div>
                            <h3>{activeFormSession.formName}</h3>{activeFormClientContext ? <p className="form-client-context">Client: {activeFormClientContext.recordId} {"\u2014"} {activeFormClientContext.name}</p> : null}
                            <p className="hint">Record ID: {activeFormSession.recordId || 'Pending'}</p>
                          </div>
                          <div className="hub-form-editor-actions">
                            <button type="button" className="secondary" onClick={closeActiveForm} disabled={activeFormSaving}>Back</button>
                            <button type="button" className="primary" onClick={() => { void saveActiveForm() }} disabled={isUserPreview || (activeFormSaving)}>
                              {activeFormSaving ? 'Saving...' : 'Save Form'}
                            </button>
                          </div>
                        </div>

                        <div className="hub-form-sections">
                          <section className="hub-form-section">
                            <h4 className="hub-form-section-title">Main</h4>
                            <div className="hub-form-grid">
                          {HOUSEHOLD_FIELD_DEFINITIONS.map((fieldDef) => {
                            const value = String(activeFormSession.values[fieldDef.field] || '')
                            const fieldId = `household-${fieldDef.field}`
                            const dynamicPicklist = resolveDynamicPicklistField('Household', fieldDef.label)
                            const baseOptions = dynamicPicklist?.active === false
                              ? []
                              : (dynamicPicklist?.options.length ? dynamicPicklist.options : fieldDef.options)
                            const effectiveOptions = baseOptions
                            const selectOptions = effectiveOptions.filter((option) => option !== '--Please Select--')
                            const effectiveInput = dynamicPicklist?.active === false
                              ? 'text'
                              : (dynamicPicklist?.inputOverride || fieldDef.input)

                            if (fieldDef.readOnly || fieldDef.field === 'cmps_numberofhhmembers' || effectiveInput === 'readonly') {
                              return (
                                <label key={fieldDef.field} className="hub-form-field" htmlFor={fieldId}>
                                  <span>{fieldDef.label}</span>
                                  <FormInput id={fieldId} type={fieldDef.input === 'date' ? 'date' : 'text'} value={value} readOnly disabled />
                                </label>
                              )
                            }

                            if (effectiveInput === 'radio') {
                              return (
                                <div key={fieldDef.field} className="hub-form-field hub-form-field-wide">
                                  <span>{fieldDef.label}</span>
                                  <div className="hub-form-option-grid">
                                    {effectiveOptions.map((option) => (
                                      <label key={`${fieldDef.field}-${option}`} className="permission-check">
                                        <input
                                          type="radio"
                                          name={fieldDef.field}
                                          checked={normalize(value) === normalize(option)}
                                          onChange={() => updateHouseholdValue(fieldDef.field, option)}
                                        />
                                        <span>{option}</span>
                                      </label>
                                    ))}
                                  </div>
                                </div>
                              )
                            }

                            if (effectiveInput === 'select') {
                              return (
                                <label key={fieldDef.field} className="hub-form-field" htmlFor={fieldId}>
                                  <span>{fieldDef.label}</span>
                                  <select id={fieldId} value={value} onChange={(event) => updateHouseholdValue(fieldDef.field, event.target.value)}>
                                    <option value="" disabled hidden>
                                      --Please Select--
                                    </option>
                                    {selectOptions.map((option) => (
                                      <option key={`${fieldDef.field}-${option}`} value={option}>{option}</option>
                                    ))}
                                  </select>
                                </label>
                              )
                            }

                            return (
                              <label key={fieldDef.field} className="hub-form-field" htmlFor={fieldId}>
                                <span>{fieldDef.label}</span>
                                <FormInput
                                  id={fieldId}
                                  type={effectiveInput === 'date' ? 'date' : effectiveInput === 'number' ? 'number' : 'text'}
                                  step={effectiveInput === 'number' ? '1' : undefined}
                                  min={effectiveInput === 'number' ? 0 : undefined}
                                  value={value}
                                  onChange={(event) => updateHouseholdValue(fieldDef.field, event.target.value)}
                                />
                              </label>
                            )
                          })}

                          {householdSupplementalFields.map((field) => renderSupplementalPicklistField(
                            'household',
                            field,
                            String(activeFormSession.values[field.key] || ''),
                            (nextValue) => updateHouseholdValue(field.key, nextValue),
                            (option, checked) => updateHouseholdMultiSelectValue(field.key, option, checked),
                          ))}
                            </div>
                          </section>
                        </div>

                        <section className="hub-form-section" style={{ marginTop: '1rem' }}>
                          <div className="hub-client-quick-record-head">
                            <h4>Members of Household</h4>
                            <span className="hint">Select members, then edit Household History fields for selected clients.</span>
                          </div>

                          {householdMembersLoading ? <p className="hint">Loading Household History candidates...</p> : null}
                          {householdMembersError ? <p className="error">{householdMembersError}</p> : null}

                          {!householdMembersLoading ? (
                            <>
                              <div className="hub-form-field hub-form-field-wide">
                                <span>Search available clients</span>
                                <div className="hub-form-inline-actions">
                                  <input
                                    type="search"
                                    value={householdClientSearchQuery}
                                    placeholder="Search by name or Record ID"
                                    onChange={(event) => {
                                      setHouseholdClientSearchQuery(event.target.value)
                                      setHouseholdClientSearchApplied('')
                                    }}
                                    onKeyDown={(event) => {
                                      if (event.key === 'Enter') {
                                        event.preventDefault()
                                        void searchHouseholdClients()
                                      }
                                    }}
                                  />
                                  <button type="button" className="secondary" onClick={() => { void searchHouseholdClients() }} disabled={householdClientSearchLoading}>
                                    {householdClientSearchLoading ? 'Searching...' : 'Search'}
                                  </button>
                                </div>
                                {householdClientSearchError ? <span className="hub-form-meta">{householdClientSearchError}</span> : null}
                                {householdClientSearchResults.length > 0 ? <span className="hub-form-meta">{householdClientSearchResults.length} available client{householdClientSearchResults.length === 1 ? '' : 's'} added to the selector below.</span> : null}
                              </div>
                              <MultiSelectDropdown
                                  id="household-members-select"
                                  label="Members of Household"
                                  options={householdVisibleMemberDrafts.map((member) => member.clientRowId)}
                                  optionLabels={Object.fromEntries(householdVisibleMemberDrafts.map((member) => [member.clientRowId, member.clientName || member.clientRecordId || 'Client (name unavailable)']))}
                                  value={householdMembersDraft.filter((member) => member.selected).map((member) => member.clientRowId)}
                                  disabled={isUserPreview || activeFormSaving}
                                  onChange={updateHouseholdSelectedMembers}
                                  hint="Click each client to select or deselect them."
                              />

                              {householdMembersDraft.some((member) => member.selected) ? (
                                <div className="hub-search-results-table-wrap" style={{ marginTop: '0.75rem' }}>
                                  <table className="hub-search-results-table">
                                    <thead>
                                      <tr>
                                        <th>Client</th>
                                        <th>Status</th>
                                        <th>Relationship to HOH</th>
                                        <th>Relationship Other</th>
                                      </tr>
                                    </thead>
                                    <tbody>
                                      {householdMembersDraft.filter((member) => member.selected).map((member) => (
                                        <tr key={`household-member-edit-${member.historyRowId || member.clientRowId}`}>
                                          <td>{member.clientName || member.clientRecordId || '-'}</td>
                                          <td>
                                            {activeFormSession.rowId ? (
                                              <select
                                                value={member.status}
                                                onChange={(event) => updateHouseholdMemberStatus(member.clientRowId, event.target.value)}
                                              >
                                                <option value="Active">Active</option>
                                                <option value="Inactive">Inactive</option>
                                              </select>
                                            ) : (
                                              <span className="chip subtle">Active</span>
                                            )}
                                          </td>
                                          <td>
                                            <select
                                              value={member.relationshipToHoh}
                                              onChange={(event) => updateHouseholdMemberRelationship(member.clientRowId, event.target.value)}
                                            >
                                              <option value="" disabled hidden>
                                                --Please Select--
                                              </option>
                                              {HOUSEHOLD_HISTORY_RELATIONSHIP_OPTIONS.map((option) => (
                                                <option key={`member-relationship-${member.clientRowId}-${option}`} value={option}>{option}</option>
                                              ))}
                                            </select>
                                          </td>
                                          <td>
                                            {normalize(member.relationshipToHoh) === normalize('Other') ? (
                                              <input
                                                type="text"
                                                value={member.relationshipToHohOther}
                                                onChange={(event) => updateHouseholdMemberRelationshipOther(member.clientRowId, event.target.value)}
                                              />
                                            ) : <span className="hint">n/a</span>}
                                          </td>
                                        </tr>
                                      ))}
                                    </tbody>
                                  </table>
                                </div>
                              ) : <p className="hint">No members selected yet.</p>}
                            </>
                          ) : null}
                        </section>

                        {activeFormError ? <p className="error">{activeFormError}</p> : null}
                        {hubActionStatus ? <p className="success">{hubActionStatus}</p> : null}
                      </article>
                    ) : activeFormSession?.kind === 'program-enrollment' ? (
                      <article className="panel wide hub-card hub-form-editor" key={`${selectedHub.id}-program-enrollment-editor`}>
                        <div className="hub-form-editor-head">
                          <div>
                            <h3>{activeFormSession.formName}</h3>{activeFormClientContext ? <p className="form-client-context">Client: {activeFormClientContext.recordId} {"\u2014"} {activeFormClientContext.name}</p> : null}
                            <p className="hint">Record ID: {activeFormSession.recordId || 'Pending'}</p>
                          </div>
                          <div className="hub-form-editor-actions">
                            <button type="button" className="secondary" onClick={closeActiveForm} disabled={activeFormSaving}>{formBackButtonLabel}</button>
                            <button type="button" className="primary" onClick={() => { void saveActiveForm() }} disabled={isUserPreview || (activeFormSaving)}>
                              {activeFormSaving ? 'Saving...' : 'Save Form'}
                            </button>
                          </div>
                        </div>

                        <section className="hub-client-quick-record">
                          <div className="hub-client-quick-record-head">
                            <h4>Client Context</h4>
                            <span className="hint">Client Profile linkage</span>
                          </div>
                          <div className="hub-search-detail-grid">
                            <div className="hub-client-quick-item">
                              <span className="hub-search-detail-label">Client ID</span>
                              <span className="hub-search-detail-value">{selectedDetailRecord?.recordId || activeFormSession.values.cmps_clientid || '-'}</span>
                            </div>
                          </div>
                        </section>

                        <div className="hub-form-sections">
                          {(['Enrollment Details', 'Incident Information', 'Program Notes', 'Discharge Summary', 'Household Demographics'] as const).map((section) => {
                            const sectionFields = PROGRAM_ENROLLMENT_FIELDS
                              .filter((fieldDef) => fieldDef.section === section)
                              .filter((fieldDef) => activeFormSession.rowId || (fieldDef.field !== 'cmps_serviceenddate' && fieldDef.field !== 'cmps_lengthofstay'))
                              .filter((fieldDef) => isProgramEnrollmentFieldVisible(fieldDef, activeFormSession.values))
                            if (sectionFields.length === 0) return null
                            return (
                          <section className="hub-form-section" key={section}>
                            <h4 className="hub-form-section-title">{section}</h4>
                            <div className="hub-form-grid">
                          {sectionFields
                            .map((fieldDef) => {
                            const value = activeFormSession.values[fieldDef.field] || ''
                            if (fieldDef.field === 'cmps_cpid' || fieldDef.field === 'cmps_clientid') return renderClientProfileLookupField(fieldDef, value)
                            const fieldId = `program-enrollment-${fieldDef.field}`
                            const dynamicPicklist = resolveDynamicPicklistField('Program Enrollment', fieldDef.label)
                            const baseOptions = dynamicPicklist?.active === false
                              ? []
                              : (dynamicPicklist?.options.length ? dynamicPicklist.options : fieldDef.options)
                            const effectiveOptions = fieldDef.field === 'cmps_funder'
                              && normalize(activeFormSession.values.cmps_program || '') !== normalize('DVSTOP')
                              ? baseOptions.filter((option) => normalize(option) !== normalize('OVW-Late Life'))
                              : baseOptions
                            const selectOptions = effectiveOptions.filter((option) => option !== '--Please Select--')
                            const effectiveInput = dynamicPicklist?.active === false
                              ? 'text'
                              : (dynamicPicklist?.inputOverride || fieldDef.input)

                            if (fieldDef.field === 'cmps_nameofsvhelplineclient') {
                              return (
                                <div key={fieldDef.field} className="hub-form-field hub-form-field-wide">
                                  <span>{fieldDef.label}</span>
                                  <div className="hub-form-inline-grid3">
                                    <label className="hub-form-field" htmlFor={`${fieldId}-first`}>
                                      <span>First Name</span>
                                      <input
                                        id={`${fieldId}-first`}
                                        type="text"
                                        value={svHelplineNameParts.first}
                                        onChange={(event) => updateProgramEnrollmentNameValue('first', event.target.value)}
                                      />
                                    </label>
                                    <label className="hub-form-field" htmlFor={`${fieldId}-middle`}>
                                      <span>Middle Name</span>
                                      <input
                                        id={`${fieldId}-middle`}
                                        type="text"
                                        value={svHelplineNameParts.middle}
                                        onChange={(event) => updateProgramEnrollmentNameValue('middle', event.target.value)}
                                      />
                                    </label>
                                    <label className="hub-form-field" htmlFor={`${fieldId}-last`}>
                                      <span>Last Name</span>
                                      <input
                                        id={`${fieldId}-last`}
                                        type="text"
                                        value={svHelplineNameParts.last}
                                        onChange={(event) => updateProgramEnrollmentNameValue('last', event.target.value)}
                                      />
                                    </label>
                                  </div>
                                </div>
                              )
                            }

                            if (fieldDef.field === 'cmps_staffassigned') {
                              const selectedProgram = String(activeFormSession.values.cmps_program || '')
                              const staffOptions = getStaffOptionsForProgram(selectedProgram)
                              return (
                                <label key={fieldDef.field} className="hub-form-field" htmlFor={fieldId}>
                                  <span>{fieldDef.label}</span>
                                  <select id={fieldId} value={value} onChange={(event) => updateProgramEnrollmentValue(fieldDef.field, event.target.value)}>
                                    <option value="" disabled hidden>--Please Select--</option>
                                    {staffOptions.map((option) => <option key={`${fieldDef.field}-${option}`} value={option}>{option}</option>)}
                                  </select>
                                  {selectedProgram && staffOptions.length === 0 ? <span className="hub-form-meta">No active app users are assigned to this program.</span> : null}
                                </label>
                              )
                            }

                            if (fieldDef.field === 'cmps_funder') {
                              return (
                                <label key={fieldDef.field} className="hub-form-field" htmlFor={fieldId}>
                                  <span>{fieldDef.label}</span>
                                  <select id={fieldId} value={value} onChange={(event) => updateProgramEnrollmentValue(fieldDef.field, event.target.value)}>
                                    <option value="" disabled hidden>--Please Select--</option>
                                    {activeFunderOptions.map((option) => <option key={option.id} value={option.id}>{option.name}</option>)}
                                  </select>
                                  {activeFunderOptions.length === 0 ? <span className="hub-form-meta">No active funders are available.</span> : null}
                                </label>
                              )
                            }

                            if (fieldDef.field === 'cmps_programtype') {
                              const derivedProgramType = getDerivedProgramEnrollmentType(activeFormSession.values.cmps_program || '')
                              return (
                                <label key={fieldDef.field} className="hub-form-field" htmlFor={fieldId}>
                                  <span>{fieldDef.label}</span>
                                  <input id={fieldId} type="text" value={derivedProgramType} placeholder="Select a Program first" readOnly disabled />
                                </label>
                              )
                            }

                            if (effectiveInput === 'checkbox-group') {
                              const selections = parseMultiValue(value)
                              const savedSelections = selections.filter((selection) => !effectiveOptions.some((option) => normalize(option) === normalize(selection)))
                              return (
                                <div key={fieldDef.field} className="hub-form-field hub-form-field-wide">
                                  <span>{fieldDef.label}</span>
                                  <div className="hub-form-option-grid">
                                    {[...effectiveOptions, ...savedSelections].map((option) => (
                                      <label key={`${fieldDef.field}-${option}`} className="permission-check">
                                        <input
                                          type="checkbox"
                                          checked={selections.some((entry) => normalize(entry) === normalize(option))}
                                          onChange={(event) => updateProgramEnrollmentMultiSelectValue(fieldDef.field, option, event.target.checked)}
                                        />
                                        <span>{option}{savedSelections.includes(option) ? ' (saved choice not in current list)' : ''}</span>
                                      </label>
                                    ))}
                                  </div>
                                </div>
                              )
                            }

                            if (effectiveInput === 'radio') {
                              return (
                                <div key={fieldDef.field} className="hub-form-field hub-form-field-wide">
                                  <span>{fieldDef.label}</span>
                                  <div className="hub-form-option-grid">
                                    {effectiveOptions.map((option) => (
                                      <label key={`${fieldDef.field}-${option}`} className="permission-check">
                                        <input
                                          type="radio"
                                          name={fieldDef.field}
                                          checked={normalize(value) === normalize(option)}
                                          onChange={() => updateProgramEnrollmentValue(fieldDef.field, option)}
                                        />
                                        <span>{option}</span>
                                      </label>
                                    ))}
                                  </div>
                                </div>
                              )
                            }

                            if (effectiveInput === 'select') {
                              return (
                                <label key={fieldDef.field} className="hub-form-field" htmlFor={fieldId}>
                                  <span>{fieldDef.label}</span>
                                  <select
                                    id={fieldId}
                                    value={value}
                                    onChange={(event) => updateProgramEnrollmentValue(fieldDef.field, event.target.value)}
                                  >
                                    <option value="" disabled hidden>
                                      --Please Select--
                                    </option>
                                    {selectOptions.map((option) => (
                                      <option key={`${fieldDef.field}-${option}`} value={option}>{option}</option>
                                    ))}
                                  </select>
                                </label>
                              )
                            }

                            if (effectiveInput === 'textarea') {
                              return (
                                <label key={fieldDef.field} className="hub-form-field hub-form-field-wide" htmlFor={fieldId}>
                                  <span>{fieldDef.label}</span>
                                  <textarea
                                    id={fieldId}
                                    value={value}
                                    onChange={(event) => updateProgramEnrollmentValue(fieldDef.field, event.target.value)}
                                  />
                                </label>
                              )
                            }

                            if (effectiveInput === 'readonly') {
                              return (
                                <label key={fieldDef.field} className="hub-form-field" htmlFor={fieldId}>
                                  <span>{fieldDef.label}</span>
                                  <input id={fieldId} type="text" value={fieldDef.field === 'cmps_clientid' ? formatLookupDisplayValue(fieldDef.field, value) : value} readOnly disabled />
                                </label>
                              )
                            }

                            if (fieldDef.field === 'cmps_lengthofstay') {
                              return (
                                <label key={fieldDef.field} className="hub-form-field" htmlFor={fieldId}>
                                  <span>{fieldDef.label}</span>
                                  <input id={fieldId} type="text" value={value} readOnly disabled />
                                </label>
                              )
                            }

                            return (
                              <label key={fieldDef.field} className="hub-form-field" htmlFor={fieldId}>
                                <span>{fieldDef.label}</span>
                                <FormInput
                                  id={fieldId}
                                  type={
                                    fieldDef.field === 'cmps_numberofpets'
                                      ? 'number'
                                      : (effectiveInput === 'date'
                                        ? 'date'
                                        : effectiveInput === 'datetime'
                                          ? 'datetime-local'
                                          : effectiveInput === 'email'
                                            ? 'email'
                                            : effectiveInput === 'phone'
                                              ? 'tel'
                                              : 'text')
                                  }
                                  min={fieldDef.field === 'cmps_numberofpets' ? 1 : undefined}
                                  max={fieldDef.field === 'cmps_numberofpets' ? 10 : undefined}
                                  value={effectiveInput === 'datetime' ? toDateTimeLocalInputValue(value) : value}
                                  onChange={(event) => updateProgramEnrollmentValue(fieldDef.field, event.target.value)}
                                />
                              </label>
                            )
                          })}

                          {programEnrollmentSupplementalFields.map((field) => renderSupplementalPicklistField(
                            'program-enrollment',
                            field,
                            activeFormSession.values[field.key] || '',
                            (nextValue) => updateProgramEnrollmentValue(field.key, nextValue),
                            (option, checked) => updateProgramEnrollmentMultiSelectValue(field.key, option, checked),
                          ))}
                            </div>
                          </section>
                            )
                          })}
                        </div>

                        {activeFormError ? <p className="error">{activeFormError}</p> : null}
                        {hubActionStatus ? <p className="success">{hubActionStatus}</p> : null}
                      </article>
                    ) : activeFormSession?.kind === 'services' ? (
                      <article className="panel wide hub-card hub-form-editor" key={`${selectedHub.id}-services-editor`}>
                        <div className="hub-form-editor-head">
                          <div>
                            <h3>{activeFormSession.formName}</h3>{activeFormClientContext ? <p className="form-client-context">Client: {activeFormClientContext.recordId} {"\u2014"} {activeFormClientContext.name}</p> : null}
                            <p className="hint">Record ID: {activeFormSession.recordId || 'Pending'}</p>
                          </div>
                          <div className="hub-form-editor-actions">
                            <button type="button" className="secondary" onClick={closeActiveForm} disabled={activeFormSaving}>{formBackButtonLabel}</button>
                            <button type="button" className="primary" onClick={() => { void saveActiveForm() }} disabled={isUserPreview || activeFormSaving || (!activeFormSession.rowId && !activeFormSession.recordId)}>
                              {activeFormSaving ? 'Saving...' : !activeFormSession.rowId && !activeFormSession.recordId ? 'Preparing Record ID...' : 'Save Form'}
                            </button>
                          </div>
                        </div>
                        {activeFormSession.recordIdError && <p className="error-text" role="alert">Could not prepare the record ID: {activeFormSession.recordIdError}. Close and reopen the form to retry.</p>}

                        <div className="hub-form-sections">
                          {(['Main', 'Service Details', 'Service Notes', 'VOCA Direct Services'] as const).map((section) => {
                            const sectionFields = SERVICES_FIELD_DEFINITIONS
                              .filter((fieldDef) => fieldDef.section === section)
                              .filter((fieldDef) => isServicesFieldVisible(
                                fieldDef.field,
                                activeFormSession.values as Record<string, string>,
                                programEnrollmentsForClient,
                              ))
                            if (sectionFields.length === 0) return null
                            return (
                              <section className="hub-form-section" key={section}>
                                <h4 className="hub-form-section-title">{section}</h4>
                                <div className="hub-form-grid">
                          {sectionFields
                            .map((fieldDef) => {
                              const value = fieldDef.field === 'cmps_servicecategory' && normalize(String(activeFormSession.values[fieldDef.field] || '')) === normalize('Legal Advocacy')
                                ? 'Legal & Medical Advocacy'
                                : String(activeFormSession.values[fieldDef.field] || '')
                              const fieldId = `services-${fieldDef.field}`
                              const forcedRadio = SERVICES_RADIO_FIELD_NAMES.has(fieldDef.field)
                              const dynamicPicklist = resolveDynamicPicklistField('Services', fieldDef.label)
                              const baseOptions = forcedRadio
                                ? (dynamicPicklist?.options.length ? dynamicPicklist.options : fieldDef.options)
                                : (dynamicPicklist?.active === false
                                  ? []
                                  : (dynamicPicklist?.options.length ? dynamicPicklist.options : fieldDef.options))
                              const effectiveOptions = resolveServicesDependentOptions(fieldDef.field, baseOptions, activeFormSession.values as Record<string, string>)
                              const importOnlyOther = SERVICES_IMPORT_ONLY_OTHER_FIELDS.has(fieldDef.field)
                              const showsImportedOther = importOnlyOther && normalize(value) === normalize('Other')
                              const selectOptions = effectiveOptions.filter((option) => option !== '--Please Select--'
                                && (!importOnlyOther || normalize(option) !== normalize('Other')))
                              const effectiveInput = dynamicPicklist?.active === false
                                ? (forcedRadio ? 'radio' : 'text')
                                : (forcedRadio ? 'radio' : (dynamicPicklist?.inputOverride || fieldDef.input))

                              if (effectiveInput === 'lookup' && fieldDef.field === 'cmps_programenrollment') {
                                return (
                                  <label key={fieldDef.field} className="hub-form-field" htmlFor={fieldId}>
                                    <span>{fieldDef.label}</span>
                                    <select id={fieldId} value={value} onChange={(event) => updateServicesValue(fieldDef.field, event.target.value)}>
                                      <option value="" disabled hidden>
                                        --Please Select--
                                      </option>
                                      {activeProgramEnrollmentOptionsForServices.map((entry) => (
                                        <option key={`${fieldDef.field}-${entry.value}`} value={entry.value}>{entry.label}</option>
                                      ))}
                                    </select>
                                    {activeProgramEnrollmentOptionsForServices.length === 0 ? (
                                      <span className="hub-form-meta">No active Program Enrollment records available for this client.</span>
                                    ) : null}
                                  </label>
                                )
                              }

                              if (effectiveInput === 'readonly') {
                                return (
                                  <label key={fieldDef.field} className="hub-form-field" htmlFor={fieldId}>
                                    <span>{fieldDef.label}</span>
                                    <input id={fieldId} type="text" value={formatLookupDisplayValue(fieldDef.field, value)} readOnly disabled />
                                  </label>
                                )
                              }

                              if (effectiveInput === 'select') {
                                return (
                                  <label key={fieldDef.field} className="hub-form-field" htmlFor={fieldId}>
                                    <span>{fieldDef.label}</span>
                                    <select id={fieldId} value={value} onChange={(event) => updateServicesValue(fieldDef.field, event.target.value)}>
                                      <option value="" disabled hidden>
                                        --Please Select--
                                      </option>
                                      {showsImportedOther ? <option value="Other" disabled>Other</option> : null}
                                      {selectOptions.map((option) => (
                                        <option key={`${fieldDef.field}-${option}`} value={option}>{option}</option>
                                      ))}
                                    </select>
                                  </label>
                                )
                              }

                              if (effectiveInput === 'checkbox-group') {
                                const selections = parseMultiValue(value)
                                return (
                                  <div key={fieldDef.field} className="hub-form-field hub-form-field-wide">
                                    <span>{fieldDef.label}</span>
                                    <div className="hub-form-option-grid">
                                      {effectiveOptions.map((option) => (
                                        <label key={`${fieldDef.field}-${option}`} className="permission-check">
                                          <input
                                            type="checkbox"
                                            checked={selections.some((entry) => normalize(entry) === normalize(option))}
                                            onChange={(event) => updateServicesMultiSelectValue(fieldDef.field, option, event.target.checked)}
                                          />
                                          <span>{option}</span>
                                        </label>
                                      ))}
                                    </div>
                                  </div>
                                )
                              }

                              if (effectiveInput === 'radio') {
                                return (
                                  <div key={fieldDef.field} className="hub-form-field hub-form-field-wide">
                                    <span>{fieldDef.label}</span>
                                    <div className="hub-form-option-grid">
                                      {effectiveOptions.map((option) => (
                                        <label key={`${fieldDef.field}-${option}`} className="permission-check">
                                          <input
                                            type="radio"
                                            name={fieldDef.field}
                                            checked={normalize(value) === normalize(option)}
                                            onChange={() => updateServicesValue(fieldDef.field, option)}
                                          />
                                          <span>{option}</span>
                                        </label>
                                      ))}
                                    </div>
                                  </div>
                                )
                              }

                              if (effectiveInput === 'textarea') {
                                return (
                                  <label key={fieldDef.field} className="hub-form-field hub-form-field-wide" htmlFor={fieldId}>
                                    <span>{fieldDef.label}</span>
                                    <textarea
                                      id={fieldId}
                                      value={value}
                                      onChange={(event) => updateServicesValue(fieldDef.field, event.target.value)}
                                    />
                                  </label>
                                )
                              }

                              return (
                                <label key={fieldDef.field} className="hub-form-field" htmlFor={fieldId}>
                                  <span>{fieldDef.label}</span>
                                  <FormInput
                                    id={fieldId}
                                    type={effectiveInput === 'date' ? 'date' : effectiveInput === 'time' ? 'time' : effectiveInput === 'number' || effectiveInput === 'currency' ? 'number' : 'text'}
                                    step={effectiveInput === 'currency' ? '0.01' : undefined}
                                    value={value}
                                    onChange={(event) => updateServicesValue(fieldDef.field, event.target.value)}
                                  />
                                </label>
                              )
                            })}

                          {section === 'Main' ? servicesSupplementalFields.map((field) => renderSupplementalPicklistField(
                            'services',
                            field,
                            String(activeFormSession.values[field.key] || ''),
                            (nextValue) => updateServicesValue(field.key, nextValue),
                            (option, checked) => updateServicesMultiSelectValue(field.key, option, checked),
                          )) : null}
                                </div>
                              </section>
                            )
                          })}
                        </div>

                        {activeFormError ? <p className="error">{activeFormError}</p> : null}
                        {hubActionStatus ? <p className="success">{hubActionStatus}</p> : null}
                      </article>
                    ) : activeFormSession?.kind === 'bed-enrollment' ? (
                      <article className="panel wide hub-card hub-form-editor" key={`${selectedHub.id}-bed-enrollment-editor`}>
                        <div className="hub-form-editor-head">
                          <div>
                            <h3>{activeFormSession.formName}</h3>{activeFormClientContext ? <p className="form-client-context">Client: {activeFormClientContext.recordId} {"\u2014"} {activeFormClientContext.name}</p> : null}
                            <p className="hint">Record ID: {activeFormSession.recordId || 'Pending'}</p>
                          </div>
                          <div className="hub-form-editor-actions">
                            <button type="button" className="secondary" onClick={closeActiveForm} disabled={activeFormSaving}>{formBackButtonLabel}</button>
                            <button type="button" className="primary" onClick={() => { void saveActiveForm() }} disabled={isUserPreview || (activeFormSaving)}>
                              {activeFormSaving ? 'Saving...' : 'Save Form'}
                            </button>
                          </div>
                        </div>

                        <div className="hub-form-sections">
                          <section className="hub-form-section">
                            <h4 className="hub-form-section-title">Main</h4>
                            <div className="hub-form-grid">
                          {BED_ENROLLMENT_FIELD_DEFINITIONS
                            .filter((fieldDef) => activeFormSession.rowId || fieldDef.field !== 'cmps_checkoutdate')
                            .map((fieldDef) => {
                            const value = String(activeFormSession.values[fieldDef.field] || '')
                            const fieldId = `bed-enrollment-${fieldDef.field}`

                            if (fieldDef.input === 'lookup' && fieldDef.field === 'cmps_programenrollment') {
                              return (
                                <label key={fieldDef.field} style={{ order: 1 }} className="hub-form-field" htmlFor={fieldId}>
                                  <span>{fieldDef.label}</span>
                                  <select id={fieldId} value={value} onChange={(event) => updateBedEnrollmentValue(fieldDef.field, event.target.value)}>
                                    <option value="" disabled hidden>
                                      --Please Select--
                                    </option>
                                    {activeProgramEnrollmentOptionsForServices.map((entry) => (
                                      <option key={`${fieldDef.field}-${entry.value}`} value={entry.value}>{entry.label}</option>
                                    ))}
                                  </select>
                                  {activeProgramEnrollmentOptionsForServices.length === 0 ? (
                                    <span className="hub-form-meta">No active Program Enrollment records available for this client.</span>
                                  ) : null}
                                </label>
                              )
                            }

                            if (fieldDef.input === 'readonly') {
                              return (
                                <label key={fieldDef.field} style={{ order: fieldDef.field === 'cmps_checkoutdate' ? 6 : fieldDef.field === 'cmps_notes' ? 7 : 1 }} className="hub-form-field" htmlFor={fieldId}>
                                  <span>{fieldDef.label}</span>
                                  <input id={fieldId} type="text" value={value} readOnly disabled />
                                </label>
                              )
                            }

                            if (fieldDef.input === 'select') {
                              return (
                                <label key={fieldDef.field} className="hub-form-field" htmlFor={fieldId}>
                                  <span>{fieldDef.label}</span>
                                  <select id={fieldId} value={value} onChange={(event) => updateBedEnrollmentValue(fieldDef.field, event.target.value)}>
                                    <option value="" disabled hidden>
                                      --Please Select--
                                    </option>
                                    {fieldDef.options.map((option) => (
                                      <option key={`${fieldDef.field}-${option}`} value={option}>{option}</option>
                                    ))}
                                  </select>
                                </label>
                              )
                            }

                            return (
                                <label key={fieldDef.field} style={{ order: fieldDef.field === 'cmps_checkoutdate' ? 6 : fieldDef.field === 'cmps_notes' ? 7 : 1 }} className={`hub-form-field${fieldDef.field === 'cmps_notes' ? ' hub-form-field-wide' : ''}`} htmlFor={fieldId}>
                                <span>{fieldDef.label}</span>
                                <FormInput
                                  id={fieldId}
                                  type={fieldDef.input === 'date' ? 'date' : 'text'}
                                  value={value}
                                  onChange={(event) => updateBedEnrollmentValue(fieldDef.field, event.target.value)}
                                />
                              </label>
                            )
                          })}
                          {showBedPicker ? (
<div className="hub-form-field hub-form-field-wide" style={{ order: 5 }}>
                              <MultiSelectDropdown
                                id="bed-enrollment-selected-beds"
                                label={`Beds${isBedSelectionRequired(String(selectedBedEnrollmentProgram?.program || ''), availableBedsForEnrollment, String(activeFormSession.values.cmps_checkoutdate || '')) ? ' *' : ''}`}
                                options={availableBedsForEnrollment.map((bed) => bed.id)}
                                optionLabels={Object.fromEntries(availableBedsForEnrollment.map((bed) => [bed.id, `${bed.unit ? bed.unit + ' - ' : ''}${bed.name} (${bed.unitType})${bed.status.toLowerCase() !== 'available' ? ' — assigned to this enrollment' : ''}`]))}
                                value={parseMultiValue(String(activeFormSession.values.cmps_selectedbeds || ''))}
                                disabled={isUserPreview || activeFormSaving || bedsLoading}
                                onChange={(selected) => updateBedEnrollmentValue('cmps_selectedbeds', selected.join(', '))}
                                hint="Click each bed to select or deselect it."
                              />
                              {bedsLoading ? <span className="hub-form-meta">Loading available beds...</span> : null}
                              {bedsError ? <span className="error">{bedsError}</span> : null}
                              {isBedCheckoutDateValid(String(activeFormSession.values.cmps_checkoutdate || '')) ? <span className="hub-form-meta">Beds are optional when a valid Check Out Date is entered.</span> : null}
                              {!bedsLoading && !bedsError && String(activeFormSession.values.cmps_programenrollment || '').trim() && !isBedSelectionRequired(String(selectedBedEnrollmentProgram?.program || ''), availableBedsForEnrollment) ? <span className="hub-form-meta">No available beds were found for this program. You may save without selecting a bed.</span> : null}
                            </div>
                          ) : null}
                            </div>
                          </section>
                        </div>

                        {activeFormError ? <p className="error">{activeFormError}</p> : null}
                        {hubActionStatus ? <p className="success">{hubActionStatus}</p> : null}
                      </article>
                    ) : activeFormSession?.kind === 'helpline' ? (
                      <article className="panel wide hub-card hub-form-editor" key={`${selectedHub.id}-helpline-editor`}>
                        <div className="hub-form-editor-head">
                          <div>
                            <h3>{activeFormSession.formName}</h3>{activeFormClientContext ? <p className="form-client-context">Client: {activeFormClientContext.recordId} {"\u2014"} {activeFormClientContext.name}</p> : null}
                            <p className="hint">Record ID: {activeFormSession.recordId || 'Pending'}</p>
                          </div>
                          <div className="hub-form-editor-actions">
                            <button type="button" className="secondary" onClick={closeActiveForm} disabled={activeFormSaving}>{formBackButtonLabel}</button>
                            <button type="button" className="primary" onClick={() => { void saveActiveForm() }} disabled={isUserPreview || (activeFormSaving)}>
                              {activeFormSaving ? 'Saving...' : 'Save Form'}
                            </button>
                          </div>
                        </div>

                        <div className="hub-form-sections">
                          {(['Main', 'DV Helpline Details', 'SV Helpline Details', 'Current Living Situation', 'Safety Assessment', 'OVW Late Life Abuse Screening', 'Notes'] as const).map((section) => {
                            const sectionFields = HELPLINE_FIELD_DEFINITIONS
                            .filter((fieldDef) => isHelplineFieldVisible(fieldDef.field, activeFormSession.values))
                            .filter((fieldDef) => getHelplineFormSection(fieldDef.field, activeFormSession.values) === section)
                            if (sectionFields.length === 0) return null
                            return (
                              <section className="hub-form-section" key={section}>
                                <h4 className="hub-form-section-title">{section}</h4>
                                <div className="hub-form-grid">
                          {sectionFields
                            .map((fieldDef) => {
                              const value = fieldDef.field === 'cmps_numberofyesanswers'
                                ? String(computeHelplineNumberOfYesAnswers(activeFormSession.values))
                                : String(activeFormSession.values[fieldDef.field] || '')
                              if (fieldDef.field === 'cmps_cpid' || fieldDef.field === 'cmps_clientid') return renderClientProfileLookupField(fieldDef, value)
                              const fieldId = `helpline-${fieldDef.field}`
                              if (fieldDef.input === 'multi-select') {
                                return <MultiSelectDropdown key={fieldDef.field} id={fieldId} label={fieldDef.label}
                                  options={fieldDef.options} value={parseMultiValue(value)} disabled={isUserPreview || activeFormSaving}
                                  onChange={(next) => updateHelplineValue(fieldDef.field, next.join(', '))} />
                              }
                              const dynamicPicklist = resolveDynamicPicklistField('Helpline', fieldDef.label)
                              const effectiveOptions = dynamicPicklist?.active === false
                                ? []
                                : fieldDef.field === 'cmps_program'
                                  ? resolveHelplineProgramOptions(dynamicPicklist?.options.length ? dynamicPicklist.options : fieldDef.options, !activeFormSession.rowId, value)
                                  : fieldDef.field === 'cmps_helplineturnawayreason'
                                    ? resolveHelplineTurnawayReasonOptions(dynamicPicklist?.options.length ? dynamicPicklist.options : fieldDef.options)
                                    : (dynamicPicklist?.options.length ? dynamicPicklist.options : fieldDef.options)
                              const selectOptions = effectiveOptions.filter((option) => option !== '--Please Select--')
                              const effectiveInput = dynamicPicklist?.active === false
                                ? 'text'
                                : (dynamicPicklist?.inputOverride || fieldDef.input)

                              if (effectiveInput === 'readonly') {
                                return (
                                  <label key={fieldDef.field} className="hub-form-field" htmlFor={fieldId}>
                                    <span>{fieldDef.label}</span>
                                    <input id={fieldId} type="text" value={formatLookupDisplayValue(fieldDef.field, value)} readOnly disabled />
                                  </label>
                                )
                              }

                              if (effectiveInput === 'select') {
                                return (
                                  <label key={fieldDef.field} className="hub-form-field" htmlFor={fieldId}>
                                    <span>{fieldDef.label}</span>
                                    <select id={fieldId} value={value} onChange={(event) => updateHelplineValue(fieldDef.field, event.target.value)}>
                                      <option value="" disabled hidden>
                                        --Please Select--
                                      </option>
                                      {selectOptions.map((option) => (
                                        <option key={`${fieldDef.field}-${option}`} value={option}>{option}</option>
                                      ))}
                                    </select>
                                  </label>
                                )
                              }

                              if (effectiveInput === 'checkbox-group') {
                                const selections = parseMultiValue(value)
                                return (
                                  <div key={fieldDef.field} className="hub-form-field hub-form-field-wide">
                                    <span>{fieldDef.label}</span>
                                    <div className="hub-form-option-grid">
                                      {effectiveOptions.map((option) => (
                                        <label key={`${fieldDef.field}-${option}`} className="permission-check">
                                          <input
                                            type="checkbox"
                                            checked={selections.some((entry) => normalize(entry) === normalize(option))}
                                            onChange={(event) => updateHelplineMultiSelectValue(fieldDef.field, option, event.target.checked)}
                                          />
                                          <span>{option}</span>
                                        </label>
                                      ))}
                                    </div>
                                  </div>
                                )
                              }

                              if (effectiveInput === 'radio') {
                                return (
                                  <div key={fieldDef.field} className="hub-form-field hub-form-field-wide">
                                    <span>{fieldDef.label}</span>
                                    <div className="hub-form-option-grid">
                                      {effectiveOptions.map((option) => (
                                        <label key={`${fieldDef.field}-${option}`} className="permission-check">
                                          <input
                                            type="radio"
                                            name={fieldDef.field}
                                            checked={normalize(value) === normalize(option)}
                                            onChange={() => updateHelplineValue(fieldDef.field, option)}
                                          />
                                          <span>{option}</span>
                                        </label>
                                      ))}
                                    </div>
                                  </div>
                                )
                              }

                              if (effectiveInput === 'textarea') {
                                return (
                                  <label key={fieldDef.field} className="hub-form-field hub-form-field-wide" htmlFor={fieldId}>
                                    <span>{fieldDef.label}</span>
                                    <textarea id={fieldId} value={value} onChange={(event) => updateHelplineValue(fieldDef.field, event.target.value)} />
                                  </label>
                                )
                              }

                              return (
                                <label key={fieldDef.field} className={`hub-form-field${fieldDef.field === 'cmps_notes' || fieldDef.field === 'cmps_canyoutellmeaboutthelastincident' ? ' hub-form-field-wide' : ''}`} htmlFor={fieldId}>
                                  <span>{fieldDef.label}</span>
                                  <FormInput
                                    id={fieldId}
                                    type={effectiveInput === 'date' ? 'date' : effectiveInput === 'time' ? 'time' : effectiveInput === 'number' ? 'number' : 'text'}
                                    value={value}
                                    onChange={(event) => updateHelplineValue(fieldDef.field, event.target.value)}
                                  />
                                </label>
                              )
                            })}
                                </div>
                              </section>
                            )
                          })}
                        </div>

                        {activeFormError ? <p className="error">{activeFormError}</p> : null}
                        {hubActionStatus ? <p className="success">{hubActionStatus}</p> : null}
                      </article>
                    ) : activeFormSession?.kind === 'shelter-screening' ? (
                      <article className="panel wide hub-card hub-form-editor" key={`${selectedHub.id}-shelter-screening-editor`}>
                        <div className="hub-form-editor-head">
                          <div>
                            <h3>{activeFormSession.formName}</h3>{activeFormClientContext ? <p className="form-client-context">Client: {activeFormClientContext.recordId} {"\u2014"} {activeFormClientContext.name}</p> : null}
                            <p className="hint">Record ID: {activeFormSession.recordId || 'Pending'}</p>
                          </div>
                          <div className="hub-form-editor-actions">
                            <button type="button" className="secondary" onClick={closeActiveForm} disabled={activeFormSaving}>{formBackButtonLabel}</button>
                            <button type="button" className="primary" onClick={() => { void saveActiveForm() }} disabled={isUserPreview || (activeFormSaving)}>
                              {activeFormSaving ? 'Saving...' : 'Save Form'}
                            </button>
                          </div>
                        </div>

                        <div className="hub-form-sections">
                          {(['Main', 'Household Makeup', 'Safety Assessment', 'Other Information'] as const).map((section) => {
                            const sectionFields = SHELTER_SCREENING_FIELD_DEFINITIONS
                            .filter((fieldDef) => isShelterScreeningFieldVisible(fieldDef.field, activeFormSession.values))
                            .filter((fieldDef) => getShelterScreeningFormSection(fieldDef.field) === section)
                            if (sectionFields.length === 0) return null
                            return <section className="hub-form-section" key={section}><h4 className="hub-form-section-title">{section}</h4><div className="hub-form-grid">{sectionFields.map((fieldDef) => {

                              const value = String(activeFormSession.values[fieldDef.field] || '')
                              if (fieldDef.field === 'cmps_cpid' || fieldDef.field === 'cmps_clientid') return renderClientProfileLookupField(fieldDef, value)
                              const fieldId = `shelter-screening-${fieldDef.field}`
                              const dynamicPicklist = resolveDynamicPicklistField('Shelter Screening', fieldDef.label)
                              const effectiveOptions = dynamicPicklist?.active === false
                                ? []
                                : (dynamicPicklist?.options.length ? dynamicPicklist.options : fieldDef.options)
                              const selectOptions = effectiveOptions.filter((option) => option !== '--Please Select--')
                              const effectiveInput = dynamicPicklist?.active === false
                                ? 'text'
                                : (dynamicPicklist?.inputOverride || fieldDef.input)

                              const isWide = fieldDef.field === 'cmps_agesofchildren'
                                || fieldDef.field === 'cmps_ifyespleaseexplain'
                                || fieldDef.field === 'cmps_legalorcustodyissuenotes'
                                || fieldDef.field === 'cmps_shelterturnawayreasonother'
                                || fieldDef.field === 'cmps_listspecialaccommodations'

                              if (fieldDef.field === 'cmps_agesofchildren') {
                                const childCount = Math.max(0, Math.min(20, Number.parseInt(String(activeFormSession.values.cmps_numberofchildrencomingtotheshelter || '').trim() || '0', 10) || 0))
                                return (
                                  <div key={fieldDef.field} className="hub-form-field hub-form-field-wide">
                                    <span>{fieldDef.label}</span>
                                    {childCount === 0 ? (
                                      <span className="hub-form-meta">Enter the number of children first to add age fields.</span>
                                    ) : (
                                      <div className="hub-form-grid">
                                        {Array.from({ length: childCount }, (_, index) => (
                                          <label key={`child-age-${index + 1}`} className="hub-form-field" htmlFor={`child-age-${index + 1}`}>
                                            <span>Child {index + 1} Age</span>
                                            <input
                                              id={`child-age-${index + 1}`}
                                              type="text"
                                              value={shelterChildAges[index] || ''}
                                              onChange={(event) => updateShelterScreeningChildAge(index, event.target.value)}
                                            />
                                          </label>
                                        ))}
                                      </div>
                                    )}
                                  </div>
                                )
                              }

                              if (effectiveInput === 'readonly') {
                                return (
                                  <label key={fieldDef.field} className="hub-form-field" htmlFor={fieldId}>
                                    <span>{fieldDef.label}</span>
                                    <input id={fieldId} type="text" value={formatLookupDisplayValue(fieldDef.field, value)} readOnly disabled />
                                  </label>
                                )
                              }

                              if (effectiveInput === 'select') {
                                return (
                                  <label key={fieldDef.field} className="hub-form-field" htmlFor={fieldId}>
                                    <span>{fieldDef.label}</span>
                                    <select id={fieldId} value={value} onChange={(event) => updateShelterScreeningValue(fieldDef.field, event.target.value)}>
                                      <option value="" disabled hidden>
                                        --Please Select--
                                      </option>
                                      {selectOptions.map((option) => (
                                        <option key={`${fieldDef.field}-${option}`} value={option}>{option}</option>
                                      ))}
                                    </select>
                                  </label>
                                )
                              }

                              if (effectiveInput === 'radio') {
                                return (
                                  <div key={fieldDef.field} className="hub-form-field hub-form-field-wide">
                                    <span>{fieldDef.label}</span>
                                    <div className="hub-form-option-grid">
                                      {effectiveOptions.map((option) => (
                                        <label key={`${fieldDef.field}-${option}`} className="permission-check">
                                          <input
                                            type="radio"
                                            name={fieldDef.field}
                                            checked={normalize(value) === normalize(option)}
                                            onChange={() => updateShelterScreeningValue(fieldDef.field, option)}
                                          />
                                          <span>{option}</span>
                                        </label>
                                      ))}
                                    </div>
                                  </div>
                                )
                              }

                              return (
                                <label key={fieldDef.field} className={`hub-form-field${isWide ? ' hub-form-field-wide' : ''}`} htmlFor={fieldId}>
                                  <span>{fieldDef.label}</span>
                                  <FormInput
                                    id={fieldId}
                                    type={effectiveInput === 'date' ? 'date' : effectiveInput === 'number' ? 'number' : 'text'}
                                    step={effectiveInput === 'number' ? '1' : undefined}
                                    min={effectiveInput === 'number' ? 0 : undefined}
                                    value={value}
                                    onChange={(event) => updateShelterScreeningValue(fieldDef.field, event.target.value)}
                                  />
                                </label>
                              )
                            })}</div></section>
                          })}
                        </div>

                        {activeFormError ? <p className="error">{activeFormError}</p> : null}
                        {hubActionStatus ? <p className="success">{hubActionStatus}</p> : null}
                      </article>
                    ) : activeFormSession?.kind === 'initial-safety-plan' ? (
                      <article className="panel wide hub-card hub-form-editor" key={`${selectedHub.id}-initial-safety-plan-editor`}>
                        <div className="hub-form-editor-head"><div><h3>{activeFormSession.formName}</h3>{activeFormClientContext ? <p className="form-client-context">Client: {activeFormClientContext.recordId} {"\u2014"} {activeFormClientContext.name}</p> : null}</div><div className="hub-form-editor-actions"><button type="button" className="secondary" onClick={closeActiveForm}>Back</button><button type="button" className="primary" onClick={() => { void saveActiveForm() }} disabled={isUserPreview || (activeFormSaving)}>{activeFormSaving ? 'Saving...' : 'Save Form'}</button></div></div>
                        <div className="hub-form-sections">{(['Main', 'Acknowledgement'] as const).map((section) => <section className="hub-form-section" key={section}><h4 className="hub-form-section-title">{section}</h4><div className="hub-form-grid">{INITIAL_SAFETY_PLAN_FIELDS.filter((field) => field.section === section).map((fieldDef) => {
                          const value = String(activeFormSession.values[fieldDef.field] || '')
                          const update = (field: string, nextValue: string) => setActiveFormSession((current) => current?.kind === 'initial-safety-plan' ? { ...current, values: { ...current.values, [field]: nextValue, ...(field === 'cmps_peid' ? { cmps_programphonenumber: getInitialSafetyPlanPhone(nextValue) } : {}) } } : current)
                          if (fieldDef.input === 'readonly') return <label key={fieldDef.field} className="hub-form-field"><span>{fieldDef.label}</span><input value={value} readOnly disabled /></label>
                          if (fieldDef.input === 'lookup') return <label key={fieldDef.field} className="hub-form-field hub-form-field-wide"><span>{fieldDef.label}{fieldDef.required ? <span className="required-inline"> *</span> : null}</span><select value={value} onChange={(event) => update(fieldDef.field, event.target.value)}><option value="">--Please Select--</option>{activeProgramEnrollmentOptionsForServices.map((entry) => <option key={entry.value} value={entry.value}>{entry.label}</option>)}</select></label>
                          if (fieldDef.input === 'radio') return <div key={fieldDef.field} className="hub-form-field"><span>{fieldDef.label}{fieldDef.required ? <span className="required-inline"> *</span> : null}</span><div className="hub-form-option-grid">{fieldDef.options.map((option) => <label className="permission-check" key={option}><input type="radio" name={fieldDef.field} checked={normalize(value) === normalize(option)} onChange={() => update(fieldDef.field, option)} /><span>{option}</span></label>)}</div></div>
                          if (fieldDef.input === 'textarea') return <label key={fieldDef.field} className="hub-form-field hub-form-field-wide"><span>{fieldDef.label}{fieldDef.required ? <span className="required-inline"> *</span> : null}</span><textarea value={value} onChange={(event) => update(fieldDef.field, event.target.value)} /></label>
                          return <label key={fieldDef.field} className={`hub-form-field${fieldDef.label.length > 48 ? ' hub-form-field-wide' : ''}`}><span>{fieldDef.label}{fieldDef.required ? <span className="required-inline"> *</span> : null}</span><FormInput type={fieldDef.input === 'date' ? 'date' : fieldDef.input === 'phone' ? 'tel' : 'text'} value={value} onChange={(event) => update(fieldDef.field, event.target.value)} /></label>
                        })}</div></section>)}</div>{activeFormError ? <p className="error">{activeFormError}</p> : null}
                      </article>
                    ) : activeFormSession?.kind === 'animal-agreement' ? (
                      <article className="panel wide hub-card hub-form-editor" key={`${selectedHub.id}-animal-agreement-editor`}>
                        <div className="hub-form-editor-head"><div><h3>{activeFormSession.formName}</h3>{activeFormClientContext ? <p className="form-client-context">Client: {activeFormClientContext.recordId} {"\u2014"} {activeFormClientContext.name}</p> : null}</div><div className="hub-form-editor-actions"><button type="button" className="secondary" onClick={closeActiveForm}>Back</button><button type="button" className="primary" onClick={() => { void saveActiveForm() }} disabled={isUserPreview || (activeFormSaving)}>{activeFormSaving ? 'Saving...' : 'Save Form'}</button></div></div>
                        <div className="hub-form-sections">
                          {(['Main', 'Signature'] as const).map((section) => (
                            <section className="hub-form-section" key={section}>
                              <h4 className="hub-form-section-title">{section}</h4>
                              <div className="hub-form-grid">
                                {ANIMAL_AGREEMENT_FIELDS.filter((fieldDef) => fieldDef.section === section).map((fieldDef) => {
                                  const value = String(activeFormSession.values[fieldDef.field] || '')
                                  if (fieldDef.field === 'cmps_cpid' || fieldDef.field === 'cmps_clientid') return renderClientProfileLookupField(fieldDef, value)
                                  const label = <span>{fieldDef.label}{fieldDef.required ? <span className="required-inline"> *</span> : null}</span>
                                  const update = (nextValue: string) => setActiveFormSession((current) => current?.kind === 'animal-agreement' ? { ...current, values: { ...current.values, [fieldDef.field]: nextValue } } : current)

                                  if (fieldDef.input === 'html') return <div key={fieldDef.field} className="hub-form-field hub-form-field-wide acknowledgement-html-header">{fieldDef.label}</div>
                                  if (fieldDef.input === 'readonly') return <label key={fieldDef.field} className="hub-form-field">{label}<input type="text" value={formatLookupDisplayValue(fieldDef.field, value)} readOnly disabled /></label>
                                  if (fieldDef.input === 'radio') return <div key={fieldDef.field} className="hub-form-field hub-form-field-wide">{label}<div className="hub-form-option-grid">{fieldDef.options.map((option) => <label className="permission-check" key={`${fieldDef.field}-${option}`}><input type="radio" name={fieldDef.field} checked={normalize(value) === normalize(option)} onChange={() => update(option)} /><span>{option}</span></label>)}</div></div>
                                  return <label key={fieldDef.field} className={`hub-form-field${fieldDef.label.length > 48 ? ' hub-form-field-wide' : ''}`}>{label}<FormInput type={fieldDef.input === 'date' ? 'date' : 'text'} value={value} onChange={(event) => update(event.target.value)} /></label>
                                })}
                              </div>
                            </section>
                          ))}
                        </div>
                        {activeFormError ? <p className="error">{activeFormError}</p> : null}
                      </article>
                    ) : activeFormSession?.kind === 'acknowledgement-and-consent' ? (
                      <article className="panel wide hub-card hub-form-editor" key={`${selectedHub.id}-acknowledgement-and-consent-editor`}>
                        <div className="hub-form-editor-head"><div><h3>{activeFormSession.formName}</h3>{activeFormClientContext ? <p className="form-client-context">Client: {activeFormClientContext.recordId} {"\u2014"} {activeFormClientContext.name}</p> : null}</div><div className="hub-form-editor-actions"><button type="button" className="secondary" onClick={closeActiveForm}>Back</button><button type="button" className="primary" onClick={() => { void saveActiveForm() }} disabled={isUserPreview || (activeFormSaving)}>{activeFormSaving ? 'Saving...' : 'Save Form'}</button></div></div>
                        <div className="hub-form-sections">
                          {(['Main', 'Acknowledgments', 'Internal Use Only'] as const).map((section) => (
                            <section className="hub-form-section" key={section}>
                              <h4 className="hub-form-section-title">{section}</h4>
                              <div className="hub-form-grid">
                                {ACKNOWLEDGEMENT_AND_CONSENT_FIELDS.filter((fieldDef) => fieldDef.section === section).map((fieldDef) => {
                                  const value = String(activeFormSession.values[fieldDef.field] || '')
                                  if (fieldDef.field === 'cmps_cpid' || fieldDef.field === 'cmps_clientid') return renderClientProfileLookupField(fieldDef, value)
                                  const acknowledgmentsRequired = normalize(String(activeFormSession.values.cmps_doestheresidentrefusetosign || '')) === normalize('No')
                                    && fieldDef.section === 'Acknowledgments'
                                    && fieldDef.input !== 'html'
                                  const isRequired = fieldDef.required || acknowledgmentsRequired
                                  const label = <span>{fieldDef.label}{isRequired ? <span className="required-inline"> *</span> : null}</span>
                                  const update = (nextValue: string) => setActiveFormSession((current) => current?.kind === 'acknowledgement-and-consent' ? { ...current, values: { ...current.values, [fieldDef.field]: nextValue } } : current)

                                  if (fieldDef.input === 'html') return <div key={fieldDef.field} className="hub-form-field hub-form-field-wide acknowledgement-html-header">{fieldDef.label}</div>
                                  if (fieldDef.input === 'lookup' && fieldDef.field === 'cmps_cpid') return <label key={fieldDef.field} className="hub-form-field">{label}<input type="text" value={formatLookupDisplayValue(fieldDef.field, value)} readOnly disabled /></label>
                                  if (fieldDef.input === 'lookup') return <label key={fieldDef.field} className="hub-form-field hub-form-field-wide">{label}<select value={value} onChange={(event) => update(event.target.value)}><option value="">--Please Select--</option>{activeProgramEnrollmentOptionsForServices.map((entry) => <option key={entry.value} value={entry.value}>{entry.label}</option>)}</select></label>
                                  if (fieldDef.input === 'radio') return <div key={fieldDef.field} className="hub-form-field hub-form-field-wide">{label}<div className="hub-form-option-grid">{fieldDef.options.map((option) => <label className="permission-check" key={`${fieldDef.field}-${option}`}><input type="radio" name={fieldDef.field} checked={normalize(value) === normalize(option)} onChange={() => update(option)} /><span>{option}</span></label>)}</div></div>
                                  if (fieldDef.input === 'textarea') return <label key={fieldDef.field} className="hub-form-field hub-form-field-wide">{label}<textarea value={value} onChange={(event) => update(event.target.value)} /></label>
                                  return <label key={fieldDef.field} className={`hub-form-field${fieldDef.label.length > 48 ? ' hub-form-field-wide' : ''}`}>{label}<FormInput type={fieldDef.input === 'date' ? 'date' : fieldDef.input === 'datetime' ? 'datetime-local' : 'text'} value={value} onChange={(event) => update(event.target.value)} /></label>
                                })}
                              </div>
                            </section>
                          ))}
                        </div>
                        {activeFormError ? <p className="error">{activeFormError}</p> : null}
                      </article>
                    ) : activeFormSession?.kind === 'focus-plan' ? (
                      <article className="panel wide hub-card hub-form-editor" key={`${selectedHub.id}-focus-plan-editor`}>
                        <div className="hub-form-editor-head"><div><h3>{activeFormSession.formName}</h3>{activeFormClientContext ? <p className="form-client-context">Client: {activeFormClientContext.recordId} {"\u2014"} {activeFormClientContext.name}</p> : null}</div><div className="hub-form-editor-actions"><button type="button" className="secondary" onClick={closeActiveForm}>Back</button><button type="button" className="primary" onClick={() => { void saveActiveForm() }} disabled={isUserPreview || (activeFormSaving)}>{activeFormSaving ? 'Saving...' : 'Save Form'}</button></div></div>
                        <div className="hub-form-sections">{(['Main', 'Goals/Person-Family Vision', "Person's/Family Strengths & Goals", 'FOCUS Meeting Notes', 'FOCUS Plan Checklist'] as const).map((section) => {
                          const values = activeFormSession.values
                          const update = (field: string, value: string) => setActiveFormSession((current) => current?.kind === 'focus-plan' ? { ...current, values: { ...current.values, [field]: value } } : current)
                          return <section className="hub-form-section" key={section}><h4 className="hub-form-section-title">{section}</h4><div className="hub-form-grid">{FOCUS_PLAN_FIELDS.filter((field) => field.section === section).map((fieldDef) => {
                            const visible = !fieldDef.visibleWhen || parseMultiValue(String(values[fieldDef.visibleWhen.field] || '')).some((item) => fieldDef.visibleWhen?.values.some((expected) => normalize(item) === normalize(expected)))
                            if (!visible) return null
                            const value = String(values[fieldDef.field] || '')
                            const goalCount = getFocusPlanGoalCount(values)
                            const goalStatuses = parseFocusGoalColumn(values.cmps_goalstatuses).map((item) => item.trim())
                            const completionDateRequired = fieldDef.field === 'cmps_focusplancompletiondate'
                              && goalStatuses.slice(0, goalCount).length === goalCount
                              && goalStatuses.slice(0, goalCount).every((status) => status === 'Complete')
                            const label = <span>{fieldDef.label}{fieldDef.required || completionDateRequired ? <span className="required-inline"> *</span> : null}{fieldDef.tooltip ? <span className="field-tooltip" title={fieldDef.tooltip} aria-label={fieldDef.tooltip} role="img" tabIndex={0}>?</span> : null}</span>
                            if (fieldDef.input === 'goals') {
                              const count = getFocusPlanGoalCount(values); const columns = GOAL_COLUMNS; const parsed = columns.map((column) => parseFocusGoalColumn(values[column]))
                              return <div key={fieldDef.field} className="hub-form-field hub-form-field-wide"><div className="focus-goals-list">{Array.from({ length: count }, (_, index) => <div className="focus-goal-row" key={`focus-goal-${index}`}><h5>Goal {index + 1}</h5><label className="hub-form-field"><span>Identified Need{index === 0 ? <span className="required-inline"> *</span> : null}</span><input value={parsed[0][index] || ''} onChange={(event) => { const next = [...parsed[0]]; next[index] = event.target.value; update(columns[0], serializeFocusGoalColumn(next.slice(0, count))) }} /></label><label className="hub-form-field"><span>Resources Given and Frequency Seen by Specialists{index === 0 ? <span className="required-inline"> *</span> : null}</span><input value={parsed[1][index] || ''} onChange={(event) => { const next = [...parsed[1]]; next[index] = event.target.value; update(columns[1], serializeFocusGoalColumn(next.slice(0, count))) }} /></label><div className="hub-form-field"><span>Goal Status{index === 0 ? <span className="required-inline"> *</span> : null}</span><div className="hub-form-option-grid">{GOAL_STATUS_OPTIONS.map((option) => <label className="permission-check" key={option}><input type="radio" name={`goal-status-${index}`} checked={parsed[2][index] === option} onChange={() => { const next = [...parsed[2]]; next[index] = option; update(columns[2], serializeFocusGoalColumn(next.slice(0, count))) }} /><span>{option}</span></label>)}</div></div>{parsed[2][index] === 'Complete' ? <label className="hub-form-field"><span>Goal Completion Date <span className="required-inline">*</span></span><FormInput type="date" value={parsed[3][index] || ''} onChange={(event) => { const next = [...parsed[3]]; next[index] = event.target.value; update(columns[3], serializeFocusGoalColumn(next.slice(0, count))) }} /></label> : null}</div>)}</div></div>
                            }
                            if (fieldDef.input === 'readonly') return <label key={fieldDef.field} className="hub-form-field">{label}<input value={value} readOnly disabled /></label>
                            if (fieldDef.input === 'lookup') return <label key={fieldDef.field} className="hub-form-field hub-form-field-wide">{label}<select value={value} onChange={(event) => update(fieldDef.field, event.target.value)}><option value="">--Please Select--</option>{activeProgramEnrollmentOptionsForServices.map((entry) => <option key={entry.value} value={entry.value}>{entry.label}</option>)}</select></label>
                            if (fieldDef.input === 'radio' || fieldDef.input === 'checkbox-group') { const selected = parseMultiValue(value); return <div key={fieldDef.field} className="hub-form-field hub-form-field-wide">{label}<div className="hub-form-option-grid">{fieldDef.options.map((option) => <label className="permission-check" key={option}><input type={fieldDef.input === 'radio' ? 'radio' : 'checkbox'} name={fieldDef.input === 'radio' ? fieldDef.field : undefined} checked={selected.some((item) => normalize(item) === normalize(option))} onChange={(event) => update(fieldDef.field, fieldDef.input === 'radio' ? option : event.target.checked ? Array.from(new Set([...selected, option])).join(', ') : selected.filter((item) => normalize(item) !== normalize(option)).join(', '))} /><span>{option}</span></label>)}</div></div> }
                            if (fieldDef.input === 'textarea') return <label key={fieldDef.field} className="hub-form-field hub-form-field-wide">{label}<textarea value={value} onChange={(event) => update(fieldDef.field, event.target.value)} /></label>
                            return <label key={fieldDef.field} className={`hub-form-field${fieldDef.label.length > 48 ? ' hub-form-field-wide' : ''}`}>{label}<FormInput type={fieldDef.input === 'date' ? 'date' : fieldDef.input === 'datetime' ? 'datetime-local' : fieldDef.input === 'number' ? 'number' : 'text'} min={fieldDef.field === 'cmps_numberofidentifiedneeds' ? 1 : undefined} max={fieldDef.field === 'cmps_numberofidentifiedneeds' ? 6 : undefined} value={value} onChange={(event) => update(fieldDef.field, event.target.value)} /></label>
                          })}</div></section>
                        })}</div>{activeFormError ? <p className="error">{activeFormError}</p> : null}
                      </article>
                    ) : activeFormSession?.kind === 'health-wellness' ? (
                      <article className="panel wide hub-card hub-form-editor" key={`${selectedHub.id}-health-wellness-editor`}>
                        <div className="hub-form-editor-head"><div><h3>{activeFormSession.formName}</h3>{activeFormClientContext ? <p className="form-client-context">Client: {activeFormClientContext.recordId} {"\u2014"} {activeFormClientContext.name}</p> : null}</div><div className="hub-form-editor-actions"><button type="button" className="secondary" onClick={closeActiveForm} disabled={activeFormSaving}>Back</button><button type="button" className="primary" onClick={() => { void saveActiveForm() }} disabled={isUserPreview || (activeFormSaving)}>{activeFormSaving ? 'Saving...' : 'Save Form'}</button></div></div>
                        <div className="hub-form-sections">{(['Main', 'Medical History', 'Seizure Information', 'Medications', 'Additional Medications', 'Emergency Contact Information'] as const).map((section) => {
                          const values = activeFormSession.values
                          if (section === 'Seizure Information' && normalize(String(values.cmps_doyouexperienceseizures || '')) !== 'yes') return null
                          if (section === 'Additional Medications' && normalize(String(values.cmps_doyouhavemoremedicationsyouwouldliketodocumen || '')) !== 'yes') return null
                          if (section === 'Emergency Contact Information' && !parseMultiValue(String(values.cmps_seizureemergencyprotocol1 || '')).some((item) => normalize(item) === normalize('Notify emergency contact'))) return null
                          const update = (field: string, nextValue: string) => setActiveFormSession((current) => current?.kind === 'health-wellness' ? { ...current, values: { ...current.values, [field]: nextValue } } : current)
                          const sectionFields = HEALTH_WELLNESS_FIELDS.filter((field) => field.section === section)
                          return <section className="hub-form-section" key={section}><h4 className="hub-form-section-title">{section}</h4><div className="hub-form-grid">{sectionFields.map((fieldDef) => {
                            const emergencyAnswer = normalize(String(values.cmps_incaseofamedicalemergencydoyouhaveanemergency || ''))
                            if (section === 'Emergency Contact Information' && fieldDef.field !== 'cmps_incaseofamedicalemergencydoyouhaveanemergency' && emergencyAnswer !== 'yes') return null
                            const visible = !fieldDef.visibleWhen || parseMultiValue(String(values[fieldDef.visibleWhen.field] || '')).some((item) => fieldDef.visibleWhen?.values.some((expected) => normalize(item) === normalize(expected)))
                            if (!visible) return null
                            const value = String(values[fieldDef.field] || '')
                            if (fieldDef.field === 'cmps_cpid' || fieldDef.field === 'cmps_clientid') return renderClientProfileLookupField(fieldDef, value)
                            if (fieldDef.input === 'medications') {
                              const additional = fieldDef.field === 'medications-additional'
                              const count = additional ? 6 : 4
                              const start = additional ? 5 : 1
                              const columns = additional ? ['cmps_moremedications', 'cmps_moredoseofmedications', 'cmps_morefrequencytakenformedications', 'cmps_morereasonfortakingmedications'] : ['cmps_medications', 'cmps_doseofmedications', 'cmps_frequencytakenformedications', 'cmps_reasonfortakingmedications']
                              const columnLabels = ['Medication', 'Dose', 'Frequency Taken', 'Reason for Taking']
                              const parsed = columns.map((column) => String(values[column] || '').split(',').map((item) => item.trim()))
                              return <div key={fieldDef.field} className="hub-form-field hub-form-field-wide"><div className="medication-grid">{Array.from({ length: count }, (_, rowIndex) => <Fragment key={`medication-${start + rowIndex}`}>{columns.map((column, columnIndex) => <label className="hub-form-field" key={`${column}-${rowIndex}`}><span>{columnLabels[columnIndex]} {start + rowIndex}</span><input type="text" value={parsed[columnIndex][rowIndex] || ''} onChange={(event) => { const next = [...parsed[columnIndex]]; next[rowIndex] = event.target.value; update(column, next.slice(0, count).join(', ')) }} /></label>)}</Fragment>)}</div></div>
                            }
                            if (fieldDef.input === 'readonly') return <label key={fieldDef.field} className="hub-form-field"><span>{fieldDef.label}</span><input type="text" value={formatLookupDisplayValue(fieldDef.field, value)} readOnly disabled /></label>
                            if (fieldDef.input === 'radio') return <div key={fieldDef.field} className="hub-form-field"><span>{fieldDef.label}</span><div className="hub-form-option-grid">{fieldDef.options.map((option) => <label className="permission-check" key={`${fieldDef.field}-${option}`}><input type="radio" name={fieldDef.field} checked={normalize(value) === normalize(option)} onChange={() => update(fieldDef.field, option)} /><span>{option}</span></label>)}</div></div>
                            if (fieldDef.input === 'checkbox-group') { const selected = parseMultiValue(value); return <div key={fieldDef.field} className="hub-form-field hub-form-field-wide"><span>{fieldDef.label}</span><div className="hub-form-option-grid">{fieldDef.options.map((option) => <label className="permission-check" key={`${fieldDef.field}-${option}`}><input type="checkbox" checked={selected.some((item) => normalize(item) === normalize(option))} onChange={(event) => update(fieldDef.field, event.target.checked ? Array.from(new Set([...selected, option])).join(', ') : selected.filter((item) => normalize(item) !== normalize(option)).join(', '))} /><span>{option}</span></label>)}</div></div> }
                            if (fieldDef.input === 'select') return <label key={fieldDef.field} className="hub-form-field"><span>{fieldDef.label}</span><select value={value} onChange={(event) => update(fieldDef.field, event.target.value)}><option value="">--Please Select--</option>{fieldDef.options.map((option) => <option key={option} value={option}>{option}</option>)}</select></label>
                            if (fieldDef.input === 'textarea') return <label key={fieldDef.field} className="hub-form-field hub-form-field-wide"><span>{fieldDef.label}</span><textarea value={value} onChange={(event) => update(fieldDef.field, event.target.value)} /></label>
                            return <label key={fieldDef.field} className={`hub-form-field${fieldDef.label.length > 52 ? ' hub-form-field-wide' : ''}`}><span>{fieldDef.label}</span><FormInput type={fieldDef.input === 'date' ? 'date' : fieldDef.input === 'phone' ? 'tel' : 'text'} value={value} onChange={(event) => update(fieldDef.field, event.target.value)} /></label>
                          })}</div></section>
                        })}</div>
                        {activeFormError ? <p className="error">{activeFormError}</p> : null}
                      </article>
                    ) : activeFormSession?.kind === 'adult-assessment' ? (
                      <article className="panel wide hub-card hub-form-editor" key={`${selectedHub.id}-adult-assessment-editor`}>
                        <div className="hub-form-editor-head"><div><h3>{activeFormSession.formName}</h3>{activeFormClientContext ? <p className="form-client-context">Client: {activeFormClientContext.recordId} {"\u2014"} {activeFormClientContext.name}</p> : null}</div><div className="hub-form-editor-actions"><button type="button" className="secondary" onClick={closeActiveForm} disabled={activeFormSaving}>Back</button><button type="button" className="primary" onClick={() => { void saveActiveForm() }} disabled={isUserPreview || (activeFormSaving)}>{activeFormSaving ? 'Saving...' : 'Save Form'}</button></div></div>
                        <div className="hub-form-sections">{(['Main', 'Assessment', 'Acknowledgement'] as const).map((section) => <section className="hub-form-section" key={section}><h4 className="hub-form-section-title">{section}</h4><div className="hub-form-grid">{ADULT_ASSESSMENT_FIELDS.filter((fieldDef) => fieldDef.section === section).map((fieldDef) => {
                          const value = String(activeFormSession.values[fieldDef.field] || '')
                          if (fieldDef.field === 'cmps_cpid' || fieldDef.field === 'cmps_clientid') return renderClientProfileLookupField(fieldDef, value)
                          const visible = !fieldDef.visibleWhen || normalize(String(activeFormSession.values[fieldDef.visibleWhen.field] || '')) === 'yes'
                          if (!visible) return null
                          const update = (nextValue: string) => setActiveFormSession((current) => current?.kind === 'adult-assessment' ? { ...current, values: { ...current.values, [fieldDef.field]: nextValue } } : current)
                          if (fieldDef.input === 'readonly') return <label key={fieldDef.field} className="hub-form-field"><span>{fieldDef.label}</span><input type="text" value={value} readOnly disabled /></label>
                          if (fieldDef.input === 'lookup' && fieldDef.field === 'cmps_cpid') return <label key={fieldDef.field} className="hub-form-field"><span>{fieldDef.label}</span><input type="text" value={formatLookupDisplayValue(fieldDef.field, value)} readOnly disabled /></label>
                          if (fieldDef.input === 'lookup') return <label key={fieldDef.field} className="hub-form-field hub-form-field-wide"><span>{fieldDef.label}</span><select value={value} onChange={(event) => update(event.target.value)}><option value="" disabled>--Please Select--</option>{activeProgramEnrollmentOptionsForServices.map((entry) => <option key={entry.value} value={entry.value}>{entry.label}</option>)}</select></label>
                          if (fieldDef.input === 'radio') return <div key={fieldDef.field} className="hub-form-field"><span>{fieldDef.label}</span><div className="hub-form-option-grid">{fieldDef.options.map((option) => <label key={`${fieldDef.field}-${option}`} className="permission-check"><input type="radio" name={fieldDef.field} checked={normalize(value) === normalize(option)} onChange={() => update(option)} /><span>{option}</span></label>)}</div></div>
                          if (fieldDef.input === 'textarea') return <label key={fieldDef.field} className="hub-form-field hub-form-field-wide"><span>{fieldDef.label}</span><textarea value={value} onChange={(event) => update(event.target.value)} /></label>
                          return <label key={fieldDef.field} className={`hub-form-field${fieldDef.label.length > 44 ? ' hub-form-field-wide' : ''}`}><span>{fieldDef.label}</span><FormInput type={fieldDef.input === 'date' ? 'date' : 'text'} value={value} onChange={(event) => update(event.target.value)} /></label>
                        })}</div></section>)}</div>
                        {activeFormError ? <p className="error">{activeFormError}</p> : null}
                      </article>
                    ) : activeFormSession?.kind === 'pet-companion-intake' ? (
                      <article className="panel wide hub-card hub-form-editor" key={`${selectedHub.id}-pet-companion-intake-editor`}>
                        <div className="hub-form-editor-head"><div><h3>{activeFormSession.formName}</h3>{activeFormClientContext ? <p className="form-client-context">Client: {activeFormClientContext.recordId} {"\u2014"} {activeFormClientContext.name}</p> : null}</div><div className="hub-form-editor-actions"><button type="button" className="secondary" onClick={closeActiveForm} disabled={activeFormSaving}>Back</button><button type="button" className="primary" onClick={() => { void saveActiveForm() }} disabled={isUserPreview || (activeFormSaving)}>{activeFormSaving ? 'Saving...' : 'Save Form'}</button></div></div>
                        <div className="hub-form-sections">
                          {(['Animal Demographics', 'Animal Background Information', 'Signature'] as const).map((section) => (
                            <section className="hub-form-section" key={section}>
                              <h4 className="hub-form-section-title">{section}</h4>
                              <div className="hub-form-grid">
                                {PET_COMPANION_INTAKE_FIELDS.filter((fieldDef) => fieldDef.section === section).map((fieldDef) => {
                                  const value = String(activeFormSession.values[fieldDef.field] || '')
                                  if (fieldDef.field === 'cmps_cpid' || fieldDef.field === 'cmps_clientid') return renderClientProfileLookupField(fieldDef, value)
                                  const visible = !fieldDef.visibleWhen || fieldDef.visibleWhen.values.some((expected) => normalize(String(activeFormSession.values[fieldDef.visibleWhen!.field] || '')) === normalize(expected))
                                  if (!visible) return null
                                  const label = <span>{fieldDef.label}{fieldDef.required ? <span className="required-inline"> *</span> : null}</span>
                                  const update = (nextValue: string) => setActiveFormSession((current) => {
                                    if (current?.kind !== 'pet-companion-intake') return current
                                    const nextValues = { ...current.values, [fieldDef.field]: nextValue }
                                    if (fieldDef.field === 'cmps_numberofmedicationstolist') {
                                      const count = Math.max(0, Math.min(10, Number.parseInt(nextValue || '0', 10) || 0))
                                      ;['cmps_medications', 'cmps_reasons', 'cmps_dosages', 'cmps_frequencies'].forEach((column) => {
                                        nextValues[column] = String(nextValues[column] || '').split(',').map((entry) => entry.trim()).slice(0, count).join(', ')
                                      })
                                    }
                                    return { ...current, values: nextValues }
                                  })

                                  if (fieldDef.input === 'html') return <div key={fieldDef.field} className="hub-form-field hub-form-field-wide acknowledgement-html-header">{fieldDef.label}</div>
                                  if (fieldDef.input === 'readonly') return <label key={fieldDef.field} className="hub-form-field">{label}<input type="text" value={value} readOnly disabled /></label>
                                  if (fieldDef.input === 'lookup') return <label key={fieldDef.field} className="hub-form-field">{label}<input type="text" value={formatLookupDisplayValue(fieldDef.field, value)} readOnly disabled /></label>
                                  if (fieldDef.input === 'radio') return <div key={fieldDef.field} className="hub-form-field hub-form-field-wide">{label}<div className="hub-form-option-grid">{fieldDef.options.map((option) => <label className="permission-check" key={`${fieldDef.field}-${option}`}><input type="radio" name={fieldDef.field} checked={normalize(value) === normalize(option)} onChange={() => update(option)} /><span>{option}</span></label>)}</div></div>
                                  if (fieldDef.input === 'textarea') return <label key={fieldDef.field} className="hub-form-field hub-form-field-wide">{label}<textarea value={value} onChange={(event) => update(event.target.value)} /></label>
                                  if (fieldDef.input === 'number') return <label key={fieldDef.field} className="hub-form-field">{label}<FormInput type="number" min={0} max={fieldDef.field === 'cmps_numberofmedicationstolist' ? 10 : undefined} step={fieldDef.field === 'cmps_numberofmedicationstolist' ? 1 : 'any'} value={value} onChange={(event) => update(event.target.value)} /></label>
                                  if (fieldDef.input === 'medications') {
                                    const medicationCount = Math.max(0, Math.min(10, Number.parseInt(String(activeFormSession.values.cmps_numberofmedicationstolist || '0'), 10) || 0))
                                    const columns = [
                                      { field: 'cmps_medications', label: 'Medication' },
                                      { field: 'cmps_reasons', label: 'Reason' },
                                      { field: 'cmps_dosages', label: 'Dosage' },
                                      { field: 'cmps_frequencies', label: 'Frequency' },
                                    ]
                                    return <div key={fieldDef.field} className="hub-form-field hub-form-field-wide">
                                      {medicationCount === 0 ? <span className="hub-form-meta">Enter the number of medications to add medication details.</span> : null}
                                      <div className="hub-form-grid">
                                        {Array.from({ length: medicationCount }, (_, index) => <Fragment key={`pet-medication-${index}`}>
                                          {columns.map((column) => {
                                            const entries = String(activeFormSession.values[column.field] || '').split(',').map((entry) => entry.trim())
                                            return <label key={`${column.field}-${index}`} className="hub-form-field"><span>{column.label} {index + 1}</span><FormInput type="text" value={entries[index] || ''} onChange={(event) => {
                                              const nextValue = event.target.value
                                              setActiveFormSession((current) => {
                                                if (current?.kind !== 'pet-companion-intake') return current
                                                const count = Math.max(0, Math.min(10, Number.parseInt(String(current.values.cmps_numberofmedicationstolist || '0'), 10) || 0))
                                                const nextEntries = String(current.values[column.field] || '').split(',').map((entry) => entry.trim()).slice(0, count)
                                                while (nextEntries.length < count) nextEntries.push('')
                                                nextEntries[index] = nextValue
                                                return { ...current, values: { ...current.values, [column.field]: nextEntries.join(', ') } }
                                              })
                                            }} /></label>
                                          })}
                                        </Fragment>)}
                                      </div>
                                    </div>
                                  }
                                  return <label key={fieldDef.field} className={`hub-form-field${fieldDef.label.length > 48 ? ' hub-form-field-wide' : ''}`}>{label}<FormInput type={fieldDef.input === 'date' ? 'date' : 'text'} value={value} onChange={(event) => update(event.target.value)} /></label>
                                })}
                              </div>
                            </section>
                          ))}
                        </div>
                        {activeFormError ? <p className="error">{activeFormError}</p> : null}
                      </article>
                    ) : activeFormSession?.kind === 'shelter-program-guidelines' ? (
                      <article className="panel wide hub-card hub-form-editor" key={`${selectedHub.id}-shelter-program-guidelines-editor`}>
                        <div className="hub-form-editor-head"><div><h3>{activeFormSession.formName}</h3>{activeFormClientContext ? <p className="form-client-context">Client: {activeFormClientContext.recordId} {"\u2014"} {activeFormClientContext.name}</p> : null}</div><div className="hub-form-editor-actions"><button type="button" className="secondary" onClick={closeActiveForm} disabled={activeFormSaving}>Back</button><button type="button" className="primary" onClick={() => { void saveActiveForm() }} disabled={isUserPreview || (activeFormSaving)}>{activeFormSaving ? 'Saving...' : 'Save Form'}</button></div></div>
                        <div className="hub-form-sections">
                          {(['Main', 'Autumn House Guidlines', 'CAAFA Shelter Guidelines', 'Faith House Guidelines', 'Children Guidelines', 'Acknowledgement'] as const).map((section) => {
                            const enrollment = programEnrollmentsForClient.find((entry) => normalize(entry.id) === normalize(String(activeFormSession.values.cmps_peid || '')))
                            const selectedProgram = normalize(enrollment?.program || '')
                            if (section === 'Autumn House Guidlines' && selectedProgram !== normalize('Autumn House')) return null
                            if (section === 'CAAFA Shelter Guidelines' && selectedProgram !== normalize('CAAFA Shelter')) return null
                            if (section === 'Faith House Guidelines' && selectedProgram !== normalize('Faith House')) return null
                            if (section === 'Children Guidelines' && normalize(String(activeFormSession.values.cmps_arechildrenalsoenteringtheshelter || '')) !== normalize('Yes')) return null
                            return <section className="hub-form-section" key={section}>
                              <h4 className="hub-form-section-title">{section}</h4>
                              <div className="hub-form-grid">
                                {SHELTER_PROGRAM_GUIDELINES_FIELDS.filter((fieldDef) => fieldDef.section === section).map((fieldDef) => {
                                  const value = String(activeFormSession.values[fieldDef.field] || '')
                                  const label = <span>{fieldDef.label}{fieldDef.required ? <span className="required-inline"> *</span> : null}</span>
                                  const update = (nextValue: string) => setActiveFormSession((current) => current?.kind === 'shelter-program-guidelines' ? { ...current, values: { ...current.values, [fieldDef.field]: nextValue } } : current)

                                  if (fieldDef.input === 'html' && fieldDef.title) return <div key={fieldDef.field} className="hub-form-field hub-form-field-wide guidelines-html-header"><div className="guidelines-html-title">{fieldDef.title}</div><div className="guidelines-html-content">{fieldDef.label}</div></div>
                                  if (fieldDef.input === 'html') return <div key={fieldDef.field} className="hub-form-field hub-form-field-wide acknowledgement-html-header">{fieldDef.label}</div>
                                  if (fieldDef.input === 'readonly') return <label key={fieldDef.field} className="hub-form-field">{label}<input type="text" value={value} readOnly disabled /></label>
                                  if (fieldDef.input === 'lookup') return <label key={fieldDef.field} className="hub-form-field hub-form-field-wide">{label}<select value={value} onChange={(event) => update(event.target.value)}><option value="">--Please Select--</option>{activeProgramEnrollmentOptionsForServices.map((entry) => <option key={entry.value} value={entry.value}>{entry.label}</option>)}</select></label>
                                  if (fieldDef.input === 'radio') return <div key={fieldDef.field} className="hub-form-field hub-form-field-wide">{label}<div className="hub-form-option-grid">{fieldDef.options.map((option) => <label className="permission-check" key={`${fieldDef.field}-${option}`}><input type="radio" name={fieldDef.field} checked={normalize(value) === normalize(option)} onChange={() => update(option)} /><span>{option}</span></label>)}</div></div>
                                  return <label key={fieldDef.field} className="hub-form-field">{label}<FormInput type={fieldDef.input === 'date' ? 'date' : 'text'} value={value} onChange={(event) => update(event.target.value)} /></label>
                                })}
                              </div>
                            </section>
                          })}
                        </div>
                        {activeFormError ? <p className="error">{activeFormError}</p> : null}
                      </article>
                    ) : activeFormSession?.kind === 'funder-transaction' ? (
                      <article className="panel wide hub-card hub-form-editor" key={`${selectedHub.id}-funder-transaction-editor`}>
                        <div className="hub-form-editor-head"><div><h3>{activeFormSession.formName}</h3>{activeFormClientContext ? <p className="form-client-context">Client: {activeFormClientContext.recordId} {"\u2014"} {activeFormClientContext.name}</p> : null}</div><div className="hub-form-editor-actions"><button type="button" className="secondary" onClick={closeActiveForm} disabled={activeFormSaving}>Back</button><button type="button" className="primary" onClick={() => { void saveActiveForm() }} disabled={isUserPreview || (activeFormSaving)}>{activeFormSaving ? 'Saving...' : 'Save Form'}</button></div></div>
                        <div className="hub-form-sections">
                          <section className="hub-form-section">
                            <h4 className="hub-form-section-title">Main</h4>
                            <div className="hub-form-grid">
                              {FUNDER_TRANSACTION_FIELDS.map((fieldDef) => {
                                const value = String(activeFormSession.values[fieldDef.field] || '')
                                const label = <span>{fieldDef.label}{fieldDef.required ? <span className="required-inline"> *</span> : null}</span>
                                const update = (nextValue: string) => setActiveFormSession((current) => current?.kind === 'funder-transaction' ? { ...current, values: { ...current.values, [fieldDef.field]: nextValue } } : current)

                                if (fieldDef.input === 'lookup') return <label key={fieldDef.field} className="hub-form-field hub-form-field-wide">{label}<select value={value} onChange={(event) => update(event.target.value)}><option value="">--Please Select--</option>{activeFunderContractOptions.map((option) => <option key={`${fieldDef.field}-${option.id}`} value={option.id}>{option.name}</option>)}</select>{activeFunderContractOptions.length === 0 ? <span className="hub-form-meta">No open contracts without an end date are available.</span> : null}</label>
                                if (fieldDef.input === 'radio') return <div key={fieldDef.field} className="hub-form-field hub-form-field-wide">{label}<div className="hub-form-option-grid">{fieldDef.options.map((option) => <label className="permission-check" key={`${fieldDef.field}-${option}`}><input type="radio" name={fieldDef.field} checked={normalize(value) === normalize(option)} onChange={() => update(option)} /><span>{option}</span></label>)}</div></div>
                                if (fieldDef.input === 'textarea') return <label key={fieldDef.field} className="hub-form-field hub-form-field-wide">{label}<textarea value={value} onChange={(event) => update(event.target.value)} /></label>
                                if (fieldDef.input === 'currency') return <label key={fieldDef.field} className="hub-form-field">{label}<FormInput type="number" step="0.01" value={value} onChange={(event) => update(event.target.value)} /></label>
                                return <label key={fieldDef.field} className="hub-form-field">{label}<FormInput type="date" value={value} onChange={(event) => update(event.target.value)} /></label>
                              })}
                            </div>
                          </section>
                        </div>
                        {activeFormError ? <p className="error">{activeFormError}</p> : null}
                      </article>
                    ) : activeFormSession?.kind === 'contract' ? (
                      <article className="panel wide hub-card hub-form-editor" key={`${selectedHub.id}-contract-editor`}>
                        <div className="hub-form-editor-head"><div><h3>{activeFormSession.formName}</h3>{activeFormClientContext ? <p className="form-client-context">Client: {activeFormClientContext.recordId} {"\u2014"} {activeFormClientContext.name}</p> : null}</div><div className="hub-form-editor-actions"><button type="button" className="secondary" onClick={closeActiveForm} disabled={activeFormSaving}>Back</button><button type="button" className="primary" onClick={() => { void saveActiveForm() }} disabled={isUserPreview || (activeFormSaving)}>{activeFormSaving ? 'Saving...' : 'Save Form'}</button></div></div>
                        <div className="hub-form-sections">
                          <section className="hub-form-section">
                            <h4 className="hub-form-section-title">Main</h4>
                            <div className="hub-form-grid">
                              {CONTRACT_FIELDS.map((fieldDef) => {
                                const value = String(activeFormSession.values[fieldDef.field] || '')
                                const label = <span>{fieldDef.label}{fieldDef.required ? <span className="required-inline"> *</span> : null}</span>
                                const update = (nextValue: string) => setActiveFormSession((current) => current?.kind === 'contract' ? { ...current, values: { ...current.values, [fieldDef.field]: nextValue } } : current)

                                if (fieldDef.input === 'lookup') return <label key={fieldDef.field} className="hub-form-field">{label}<select value={value} onChange={(event) => update(event.target.value)}><option value="">--Please Select--</option>{activeFunderOptions.map((option) => <option key={`${fieldDef.field}-${option.id}`} value={option.id}>{option.name}</option>)}</select>{activeFunderOptions.length === 0 ? <span className="hub-form-meta">No active funders are available.</span> : null}</label>
                                if (fieldDef.input === 'select') return <label key={fieldDef.field} className="hub-form-field">{label}<select value={value} onChange={(event) => update(event.target.value)}><option value="">--Please Select--</option>{fieldDef.options.map((option) => <option key={`${fieldDef.field}-${option}`} value={option}>{option}</option>)}</select></label>
                                if (fieldDef.input === 'textarea') return <label key={fieldDef.field} className="hub-form-field hub-form-field-wide">{label}<textarea value={value} onChange={(event) => update(event.target.value)} /></label>
                                if (fieldDef.input === 'currency') return <label key={fieldDef.field} className="hub-form-field">{label}<FormInput type="number" min={0} step="0.01" value={value} onChange={(event) => update(event.target.value)} /></label>
                                return <label key={fieldDef.field} className="hub-form-field">{label}<FormInput type={fieldDef.input === 'date' ? 'date' : 'text'} value={value} onChange={(event) => update(event.target.value)} /></label>
                              })}
                            </div>
                          </section>
                        </div>
                        {activeFormError ? <p className="error">{activeFormError}</p> : null}
                      </article>
                    ) : activeFormSession?.kind === 'terms-and-conditions-of-service-animals' ? (
                      <article className="panel wide hub-card hub-form-editor" key={`${selectedHub.id}-terms-and-conditions-of-service-animals-editor`}>
                        <div className="hub-form-editor-head"><div><h3>{activeFormSession.formName}</h3>{activeFormClientContext ? <p className="form-client-context">Client: {activeFormClientContext.recordId} {"\u2014"} {activeFormClientContext.name}</p> : null}</div><div className="hub-form-editor-actions"><button type="button" className="secondary" onClick={closeActiveForm} disabled={activeFormSaving}>Back</button><button type="button" className="primary" onClick={() => { void saveActiveForm() }} disabled={isUserPreview || (activeFormSaving)}>{activeFormSaving ? 'Saving...' : 'Save Form'}</button></div></div>
                        <div className="hub-form-sections">
                          {(['Main', 'Signature'] as const).map((section) => (
                            <section className="hub-form-section" key={section}>
                              <h4 className="hub-form-section-title">{section}</h4>
                              <div className="hub-form-grid">
                                {TERMS_AND_CONDITIONS_OF_SERVICE_ANIMALS_FIELDS.filter((fieldDef) => fieldDef.section === section).map((fieldDef) => {
                                  const value = String(activeFormSession.values[fieldDef.field] || '')
                                  if (fieldDef.field === 'cmps_cpid' || fieldDef.field === 'cmps_clientid') return renderClientProfileLookupField(fieldDef, value)
                                  const label = <span>{fieldDef.label}{fieldDef.required ? <span className="required-inline"> *</span> : null}</span>
                                  const update = (nextValue: string) => setActiveFormSession((current) => current?.kind === 'terms-and-conditions-of-service-animals' ? { ...current, values: { ...current.values, [fieldDef.field]: nextValue } } : current)

                                  if (fieldDef.input === 'html') return <div key={fieldDef.field} className="hub-form-field hub-form-field-wide acknowledgement-html-header">{fieldDef.label}</div>
                                  if (fieldDef.input === 'readonly') return <label key={fieldDef.field} className="hub-form-field">{label}<input type="text" value={value} readOnly disabled /></label>
                                  if (fieldDef.input === 'lookup') return <label key={fieldDef.field} className="hub-form-field">{label}<input type="text" value={formatLookupDisplayValue(fieldDef.field, value)} readOnly disabled /></label>
                                  return <label key={fieldDef.field} className={`hub-form-field${fieldDef.label.length > 48 ? ' hub-form-field-wide' : ''}`}>{label}<FormInput type={fieldDef.input === 'date' ? 'date' : 'text'} value={value} onChange={(event) => update(event.target.value)} /></label>
                                })}
                              </div>
                            </section>
                          ))}
                        </div>
                        {activeFormError ? <p className="error">{activeFormError}</p> : null}
                      </article>
                    ) : activeFormSession?.kind === 'electronic-document' ? (
                      <article className="panel wide hub-card hub-form-editor" key={`${selectedHub.id}-electronic-document-editor`}>
                        <div className="hub-form-editor-head">
                          <div><h3>{activeFormSession.formName}</h3>{activeFormClientContext ? <p className="form-client-context">Client: {activeFormClientContext.recordId} {"\u2014"} {activeFormClientContext.name}</p> : null}</div>
                          <div className="hub-form-editor-actions">
                            <button type="button" className="secondary" onClick={closeActiveForm} disabled={activeFormSaving}>{formBackButtonLabel}</button>
                            <button type="button" className="primary" onClick={() => { void saveActiveForm() }} disabled={isUserPreview || (activeFormSaving)}>{activeFormSaving ? 'Saving...' : 'Save Form'}</button>
                          </div>
                        </div>
                        <div className="hub-form-sections">
                          {(['Main', 'Document Details', 'Notes'] as const).map((section) => (
                            <section className="hub-form-section" key={section}>
                              <h4 className="hub-form-section-title">{section}</h4>
                              <div className="hub-form-grid">
                                {ELECTRONIC_DOCUMENT_FIELDS.filter((fieldDef) => fieldDef.section === section).map((fieldDef) => {
                                  const value = String(activeFormSession.values[fieldDef.field] || '')
                                  if (fieldDef.field === 'cmps_cpid' || fieldDef.field === 'cmps_clientid') return renderClientProfileLookupField(fieldDef, value)
                                  const label = <span>{fieldDef.label}{fieldDef.required ? <span className="required-inline"> *</span> : null}</span>
                                  const update = (nextValue: string) => setActiveFormSession((current) => {
                                    if (current?.kind !== 'electronic-document') return current
                                    const nextValues = { ...current.values, [fieldDef.field]: nextValue }
                                    if (fieldDef.field === 'cmps_program') {
                                      const staffOptions = getStaffOptionsForProgram(nextValue)
                                      if (nextValues.cmps_staff && !staffOptions.some((option) => normalize(option) === normalize(nextValues.cmps_staff || ''))) nextValues.cmps_staff = ''
                                    }
                                    return { ...current, values: nextValues }
                                  })

                                  if (fieldDef.input === 'readonly') return <label key={fieldDef.field} className="hub-form-field">{label}<input type="text" value={value} readOnly disabled /></label>
                                  if (fieldDef.input === 'lookup') return <label key={fieldDef.field} className="hub-form-field">{label}<input type="text" value={formatLookupDisplayValue(fieldDef.field, value)} readOnly disabled /></label>
                                  if (fieldDef.input === 'select') {
                                    const options = fieldDef.field === 'cmps_program'
                                      ? ELECTRONIC_DOCUMENT_PROGRAM_OPTIONS.filter((option) => normalize(option) !== normalize('DVHEART'))
                                      : fieldDef.options
                                    return <label key={fieldDef.field} className="hub-form-field">{label}<select name={fieldDef.field} value={value} onChange={(event) => update(event.target.value)}><option value="">--Please Select--</option>{options.map((option) => <option key={`${fieldDef.field}-${option}`} value={option}>{option}</option>)}</select></label>
                                  }
                                  if (fieldDef.input === 'staff') {
                                    const staffOptions = getStaffOptionsForProgram(String(activeFormSession.values.cmps_program || ''))
                                    return <label key={fieldDef.field} className="hub-form-field">{label}<select name={fieldDef.field} value={value} onChange={(event) => update(event.target.value)}><option value="">--Please Select--</option>{staffOptions.map((option) => <option key={`${fieldDef.field}-${option}`} value={option}>{option}</option>)}</select>{activeFormSession.values.cmps_program && staffOptions.length === 0 ? <span className="hub-form-meta">No active app users are assigned to this program.</span> : null}</label>
                                  }
                                  if (fieldDef.input === 'file') {
                                    const selectedFile = getPendingFormFileUpload(activeFormSession, fieldDef.field)
                                    return <label key={fieldDef.field} className="hub-form-field hub-form-field-wide">{label}<input name={fieldDef.field} type="file" onChange={(event) => updatePendingFormFileUpload(activeFormSession, fieldDef.field, event.target.files?.[0] || null)} disabled={isUserPreview} />{selectedFile ? <span className="hub-form-meta">{selectedFile.name} ({selectedFile.size.toLocaleString()} bytes)</span> : value ? <><span className="hub-form-meta">A file is already attached. Choose another file to replace it.</span></> : null}{value ? <RecordAttachmentButtons attachments={recordAttachments(activeFormSession.kind, { [fieldDef.field]: value })} onOpenFile={(id) => { void openCompassFileViewer(id) }} /> : null}</label>
                                  }
                                  if (fieldDef.input === 'textarea') return <label key={fieldDef.field} className="hub-form-field hub-form-field-wide">{label}<textarea name={fieldDef.field} value={value} onChange={(event) => update(event.target.value)} /></label>
                                  return <label key={fieldDef.field} className="hub-form-field">{label}<FormInput name={fieldDef.field} type={fieldDef.input === 'date' ? 'date' : 'text'} value={value} onChange={(event) => update(event.target.value)} /></label>
                                })}
                              </div>
                            </section>
                          ))}
                        </div>
                        {activeFormError ? <p className="error">{activeFormError}</p> : null}
                      </article>
                    ) : activeFormSession?.kind === 'person-you-are-fleeing-profile' ? (
                      <article className="panel wide hub-card hub-form-editor" key={`${selectedHub.id}-person-you-are-fleeing-profile-editor`}>
                        <div className="hub-form-editor-head"><div><h3>{activeFormSession.formName}</h3>{activeFormClientContext ? <p className="form-client-context">Client: {activeFormClientContext.recordId} {"\u2014"} {activeFormClientContext.name}</p> : null}</div><div className="hub-form-editor-actions"><button type="button" className="secondary" onClick={closeActiveForm} disabled={activeFormSaving}>Back</button><button type="button" className="primary" onClick={() => { void saveActiveForm() }} disabled={isUserPreview || (activeFormSaving)}>{activeFormSaving ? 'Saving...' : 'Save Form'}</button></div></div>
                        <div className="hub-form-sections">
                          {(['Main', 'Vehicle Details', 'Additional History/Background Details'] as const).map((section) => (
                            <section className="hub-form-section" key={section}>
                              <h4 className="hub-form-section-title">{section}</h4>
                              <div className="hub-form-grid">
                                {PERSON_YOU_ARE_FLEEING_PROFILE_FIELDS
                                  .filter((fieldDef) => fieldDef.section === section)
                                  .map((fieldDef) => {
                                  const value = String(activeFormSession.values[fieldDef.field] || '')
                                  if (fieldDef.field === 'cmps_cpid' || fieldDef.field === 'cmps_clientid') return renderClientProfileLookupField(fieldDef, value)
                                  const label = <span>{fieldDef.label}{fieldDef.required ? <span className="required-inline"> *</span> : null}</span>
                                  const update = (nextValue: string) => {
                                    setActiveFormSession((current) => {
                                      if (current?.kind !== 'person-you-are-fleeing-profile') return current
                                      const nextValues = { ...current.values, [fieldDef.field]: nextValue }
                                      if (fieldDef.field === 'cmps_dateofbirth') nextValues.cmps_age = calculateAgeFromDateOfBirth(nextValue)
                                      return { ...current, values: nextValues }
                                    })
                                  }

                                  if (fieldDef.input === 'html') return <div key={fieldDef.field} className="hub-form-field hub-form-field-wide acknowledgement-html-header">{fieldDef.label}</div>
                                  if (fieldDef.input === 'readonly' || fieldDef.field === 'cmps_age') return <label key={fieldDef.field} className="hub-form-field">{label}<input type={fieldDef.field === 'cmps_age' ? 'number' : 'text'} value={value} readOnly disabled /></label>
                                  if (fieldDef.input === 'select') return <label key={fieldDef.field} className="hub-form-field">{label}<select value={value} onChange={(event) => update(event.target.value)}><option value="">--Please Select--</option>{fieldDef.options.map((option) => <option key={`${fieldDef.field}-${option}`} value={option}>{option}</option>)}</select></label>
                                  if (fieldDef.input === 'radio') return <div key={fieldDef.field} className="hub-form-field hub-form-field-wide">{label}<div className="hub-form-option-grid">{fieldDef.options.map((option) => <label className="permission-check" key={`${fieldDef.field}-${option}`}><input type="radio" name={fieldDef.field} checked={normalize(value) === normalize(option)} onChange={() => update(option)} /><span>{option}</span></label>)}</div></div>
                                  if (fieldDef.input === 'file') {
                                    const selectedFile = getPendingFormFileUpload(activeFormSession, fieldDef.field)
                                    return <label key={fieldDef.field} className="hub-form-field hub-form-field-wide">{label}<input type="file" onChange={(event) => updatePendingFormFileUpload(activeFormSession, fieldDef.field, event.target.files?.[0] || null)} disabled={isUserPreview} />{selectedFile ? <span className="hub-form-meta">{selectedFile.name} ({selectedFile.size.toLocaleString()} bytes)</span> : value ? <span className="hub-form-meta">A file is already attached. Choose another file to replace it.</span> : null}{value ? <RecordAttachmentButtons attachments={recordAttachments(activeFormSession.kind, { [fieldDef.field]: value })} onOpenFile={(id) => { void openCompassFileViewer(id) }} /> : null}</label>
                                  }
                                  if (fieldDef.input === 'textarea') return <label key={fieldDef.field} className="hub-form-field hub-form-field-wide">{label}<textarea value={value} onChange={(event) => update(event.target.value)} /></label>
                                  return <label key={fieldDef.field} className={`hub-form-field${fieldDef.label.length > 48 ? ' hub-form-field-wide' : ''}`}>{label}<FormInput type={fieldDef.input === 'date' ? 'date' : fieldDef.input === 'phone' ? 'tel' : 'text'} value={value} onChange={(event) => update(event.target.value)} /></label>
                                })}
                              </div>
                            </section>
                          ))}
                        </div>
                        {activeFormError ? <p className="error">{activeFormError}</p> : null}
                      </article>
                    ) : activeFormSession?.kind === 'medical-consent-form' ? (
                      <article className="panel wide hub-card hub-form-editor" key={`${selectedHub.id}-medical-consent-form-editor`}>
                        <div className="hub-form-editor-head"><div><h3>{activeFormSession.formName}</h3>{activeFormClientContext ? <p className="form-client-context">Client: {activeFormClientContext.recordId} {"\u2014"} {activeFormClientContext.name}</p> : null}</div><div className="hub-form-editor-actions"><button type="button" className="secondary" onClick={closeActiveForm} disabled={activeFormSaving}>Back</button><button type="button" className="primary" onClick={() => { void saveActiveForm() }} disabled={isUserPreview || (activeFormSaving)}>{activeFormSaving ? 'Saving...' : 'Save Form'}</button></div></div>
                        <div className="hub-form-sections">
                          {(['Main', 'Medical Information', 'Internal User Only'] as const).map((section) => (
                            <section className="hub-form-section" key={section}>
                              <h4 className="hub-form-section-title">{section}</h4>
                              <div className="hub-form-grid">
                                {MEDICAL_CONSENT_FORM_FIELDS.filter((fieldDef) => fieldDef.section === section).map((fieldDef) => {
                                  const value = String(activeFormSession.values[fieldDef.field] || '')
                                  const label = <span>{fieldDef.label}{fieldDef.required ? <span className="required-inline"> *</span> : null}</span>
                                  const update = (nextValue: string) => setActiveFormSession((current) => current?.kind === 'medical-consent-form' ? { ...current, values: { ...current.values, [fieldDef.field]: nextValue } } : current)

                                  if (fieldDef.input === 'html') return <div key={fieldDef.field} className="hub-form-field hub-form-field-wide acknowledgement-html-header">{fieldDef.label}</div>
                                  if (fieldDef.input === 'readonly') return <label key={fieldDef.field} className="hub-form-field">{label}<input type="text" value={value} readOnly disabled /></label>
                                  if (fieldDef.input === 'lookup') return <label key={fieldDef.field} className="hub-form-field hub-form-field-wide">{label}<select value={value} onChange={(event) => { const nextValue = event.target.value; setActiveFormSession((current) => current?.kind === 'medical-consent-form' ? { ...current, values: { ...current.values, cmps_peid: nextValue, cmps_presentedby: '' } } : current) }}><option value="">--Please Select--</option>{activeProgramEnrollmentOptionsForServices.map((entry) => <option key={entry.value} value={entry.value}>{entry.label}</option>)}</select></label>
                                  if (fieldDef.input === 'staff') {
                                    const enrollment = programEnrollmentsForClient.find((entry) => normalize(entry.id) === normalize(String(activeFormSession.values.cmps_peid || '')))
                                    const staffOptions = getStaffOptionsForProgram(enrollment?.program || '')
                                    return <label key={fieldDef.field} className="hub-form-field">{label}<select value={value} onChange={(event) => update(event.target.value)}><option value="">--Please Select--</option>{staffOptions.map((option) => <option key={`${fieldDef.field}-${option}`} value={option}>{option}</option>)}</select>{enrollment?.program && staffOptions.length === 0 ? <span className="hub-form-meta">No active app users are assigned to this program.</span> : null}</label>
                                  }
                                  if (fieldDef.input === 'radio') return <div key={fieldDef.field} className="hub-form-field hub-form-field-wide">{label}<div className="hub-form-option-grid">{fieldDef.options.map((option) => <label className="permission-check" key={`${fieldDef.field}-${option}`}><input type="radio" name={fieldDef.field} checked={normalize(value) === normalize(option)} onChange={() => update(option)} /><span>{option}</span></label>)}</div></div>
                                  if (fieldDef.input === 'textarea') return <label key={fieldDef.field} className="hub-form-field hub-form-field-wide">{label}<textarea value={value} onChange={(event) => update(event.target.value)} /></label>
                                  return <label key={fieldDef.field} className={`hub-form-field${fieldDef.label.length > 48 ? ' hub-form-field-wide' : ''}`}>{label}<FormInput type={fieldDef.input === 'date' ? 'date' : fieldDef.input === 'datetime' ? 'datetime-local' : 'text'} value={value} onChange={(event) => update(event.target.value)} /></label>
                                })}
                              </div>
                            </section>
                          ))}
                        </div>
                        {activeFormError ? <p className="error">{activeFormError}</p> : null}
                      </article>
                    ) : activeFormSession?.kind === 'financial-assistance' ? (
                      <article className="panel wide hub-card hub-form-editor" key={`${selectedHub.id}-financial-assistance-editor`}>
                        <div className="hub-form-editor-head"><div><h3>{activeFormSession.formName}</h3>{activeFormClientContext ? <p className="form-client-context">Client: {activeFormClientContext.recordId} {"\u2014"} {activeFormClientContext.name}</p> : null}</div><div className="hub-form-editor-actions"><button type="button" className="secondary" onClick={closeActiveForm} disabled={activeFormSaving}>Back</button><button type="button" className="primary" onClick={() => { void saveActiveForm() }} disabled={isUserPreview || (activeFormSaving)}>{activeFormSaving ? 'Saving...' : 'Save Form'}</button></div></div>
                        <div className="hub-form-sections">
                          <section className="hub-form-section">
                            <h4 className="hub-form-section-title">Main</h4>
                            <div className="hub-form-grid">
                              {FINANCIAL_ASSISTANCE_FIELDS.map((fieldDef) => {
                                const value = String(activeFormSession.values[fieldDef.field] || '')
                                const label = <span>{fieldDef.label}{fieldDef.required ? <span className="required-inline"> *</span> : null}</span>
                                const update = (nextValue: string) => setActiveFormSession((current) => current?.kind === 'financial-assistance' ? { ...current, values: { ...current.values, [fieldDef.field]: nextValue } } : current)

                                if (fieldDef.input === 'readonly') return <label key={fieldDef.field} className="hub-form-field">{label}<input type="text" value={value} readOnly disabled /></label>
                                if (fieldDef.input === 'lookup') return <label key={fieldDef.field} className="hub-form-field hub-form-field-wide">{label}<select value={value} onChange={(event) => { const nextValue = event.target.value; setActiveFormSession((current) => current?.kind === 'financial-assistance' ? { ...current, values: { ...current.values, cmps_peid: nextValue, cmps_staff: '' } } : current) }}><option value="">--Please Select--</option>{activeProgramEnrollmentOptionsForServices.map((entry) => <option key={entry.value} value={entry.value}>{entry.label}</option>)}</select></label>
                                if (fieldDef.input === 'staff') {
                                  const enrollment = programEnrollmentsForClient.find((entry) => normalize(entry.id) === normalize(String(activeFormSession.values.cmps_peid || '')))
                                  const staffOptions = getStaffOptionsForProgram(enrollment?.program || '')
                                  return <label key={fieldDef.field} className="hub-form-field">{label}<select value={value} onChange={(event) => update(event.target.value)}><option value="">--Please Select--</option>{staffOptions.map((option) => <option key={`${fieldDef.field}-${option}`} value={option}>{option}</option>)}</select>{enrollment?.program && staffOptions.length === 0 ? <span className="hub-form-meta">No active app users are assigned to this program.</span> : null}</label>
                                }
                                if (fieldDef.input === 'select') return <label key={fieldDef.field} className="hub-form-field">{label}<select value={value} onChange={(event) => update(event.target.value)}><option value="">--Please Select--</option>{fieldDef.options.map((option) => <option key={`${fieldDef.field}-${option}`} value={option}>{option}</option>)}</select></label>
                                if (fieldDef.input === 'radio') return <div key={fieldDef.field} className="hub-form-field hub-form-field-wide">{label}<div className="hub-form-option-grid">{fieldDef.options.map((option) => <label className="permission-check" key={`${fieldDef.field}-${option}`}><input type="radio" name={fieldDef.field} checked={normalize(value) === normalize(option)} onChange={() => update(option)} /><span>{option}</span></label>)}</div></div>
                                if (fieldDef.input === 'textarea') return <label key={fieldDef.field} className="hub-form-field hub-form-field-wide">{label}<textarea value={value} onChange={(event) => update(event.target.value)} /></label>
                                if (fieldDef.input === 'currency') return <label key={fieldDef.field} className="hub-form-field">{label}<FormInput type="number" min={0} step="0.01" value={value} onChange={(event) => update(event.target.value)} /></label>
                                if (fieldDef.input === 'number') return <label key={fieldDef.field} className="hub-form-field">{label}<FormInput type="number" min={0} step="1" value={value} onChange={(event) => update(event.target.value)} /></label>
                                return <label key={fieldDef.field} className="hub-form-field">{label}<FormInput type={fieldDef.input === 'date' ? 'date' : 'text'} value={value} onChange={(event) => update(event.target.value)} /></label>
                              })}
                            </div>
                          </section>
                        </div>
                        {activeFormError ? <p className="error">{activeFormError}</p> : null}
                      </article>
                    ) : activeFormSession?.kind === 'employment-and-benefits' ? (
                      <article className="panel wide hub-card hub-form-editor" key={`${selectedHub.id}-employment-and-benefits-editor`}>
                        <div className="hub-form-editor-head"><div><h3>{activeFormSession.formName}</h3>{activeFormClientContext ? <p className="form-client-context">Client: {activeFormClientContext.recordId} {"\u2014"} {activeFormClientContext.name}</p> : null}</div><div className="hub-form-editor-actions"><button type="button" className="secondary" onClick={closeActiveForm} disabled={activeFormSaving}>Back</button><button type="button" className="primary" onClick={() => { void saveActiveForm() }} disabled={isUserPreview || (activeFormSaving)}>{activeFormSaving ? 'Saving...' : 'Save Form'}</button></div></div>
                        <div className="hub-form-sections">
                          {(['Main', 'Benefits'] as const).map((section) => (
                            <section className="hub-form-section" key={section}>
                              <h4 className="hub-form-section-title">{section}</h4>
                              <div className="hub-form-grid">
                                {EMPLOYMENT_AND_BENEFITS_FIELDS.filter((fieldDef) => fieldDef.section === section).map((fieldDef) => {
                                  const visible = !fieldDef.visibleWhen || (fieldDef.visibleWhen.field === 'cmps_publicassistancetype1' ? parsePublicAssistanceTypes(activeFormSession.values.cmps_publicassistancetype1) : parseMultiValue(String(activeFormSession.values[fieldDef.visibleWhen.field] || ''))).some((item) => fieldDef.visibleWhen?.values.some((expected) => normalize(item) === normalize(expected)))
                                  if (!visible) return null
                                  const value = String(activeFormSession.values[fieldDef.field] || '')
                                  if (fieldDef.field === 'cmps_cpid' || fieldDef.field === 'cmps_clientid') return renderClientProfileLookupField(fieldDef, value)
                                  const label = <span>{fieldDef.label}{fieldDef.required ? <span className="required-inline"> *</span> : null}</span>
                                  const update = (nextValue: string) => setActiveFormSession((current) => current?.kind === 'employment-and-benefits' ? { ...current, values: { ...current.values, [fieldDef.field]: nextValue } } : current)

                                  if (fieldDef.input === 'readonly') return <label key={fieldDef.field} className="hub-form-field">{label}<input type="text" value={value} readOnly disabled /></label>
                                  if (fieldDef.input === 'lookup') return <label key={fieldDef.field} className="hub-form-field">{label}<input type="text" value={formatLookupDisplayValue(fieldDef.field, value)} readOnly disabled /></label>
                                  if (fieldDef.input === 'checkbox-group') {
                                    const selected = parsePublicAssistanceTypes(value)
                                    return <div key={fieldDef.field} className="hub-form-field hub-form-field-wide">{label}<div className="hub-form-option-grid">{fieldDef.options.map((option) => <label className="permission-check" key={`${fieldDef.field}-${option}`}><input type="checkbox" disabled={isUserPreview || activeFormSaving} checked={selected.includes(option)} onChange={(event) => update(event.target.checked ? Array.from(new Set([...selected, option])).join(', ') : selected.filter((item) => item !== option).join(', '))} /><span>{option}</span></label>)}</div></div>
                                  }
                                  if (fieldDef.input === 'radio') return <div key={fieldDef.field} className="hub-form-field hub-form-field-wide">{label}<div className="hub-form-option-grid">{fieldDef.options.map((option) => <label className="permission-check" key={`${fieldDef.field}-${option}`}><input type="radio" name={fieldDef.field} checked={normalize(value) === normalize(option)} onChange={() => update(option)} /><span>{option}</span></label>)}</div></div>
                                  if (fieldDef.input === 'textarea') return <label key={fieldDef.field} className="hub-form-field hub-form-field-wide">{label}<textarea value={value} onChange={(event) => update(event.target.value)} /></label>
                                  if (fieldDef.input === 'currency') return <label key={fieldDef.field} className="hub-form-field">{label}<FormInput type="number" min={0} step="0.01" value={value} onChange={(event) => update(event.target.value)} /></label>
                                  if (fieldDef.input === 'number') return <label key={fieldDef.field} className="hub-form-field">{label}<FormInput type="number" min={1} max={31} step="1" value={value} onChange={(event) => update(event.target.value)} /></label>
                                  return <label key={fieldDef.field} className="hub-form-field">{label}<FormInput type="date" value={value} onChange={(event) => update(event.target.value)} /></label>
                                })}
                              </div>
                            </section>
                          ))}
                        </div>
                        {activeFormError ? <p className="error">{activeFormError}</p> : null}
                      </article>
                    ) : activeFormSession?.kind === 'child-shelter-intake' ? (
                      <article className="panel wide hub-card hub-form-editor" key={`${selectedHub.id}-child-shelter-intake-editor`}>
                        <div className="hub-form-editor-head"><div><h3>{activeFormSession.formName}</h3>{activeFormClientContext ? <p className="form-client-context">Client: {activeFormClientContext.recordId} {"\u2014"} {activeFormClientContext.name}</p> : null}</div><div className="hub-form-editor-actions"><button type="button" className="secondary" onClick={closeActiveForm} disabled={activeFormSaving}>Back</button><button type="button" className="primary" onClick={() => { void saveActiveForm() }} disabled={isUserPreview || (activeFormSaving)}>{activeFormSaving ? 'Saving...' : 'Save Form'}</button></div></div>
                        <div className="hub-form-sections">
                          {(["Child's Intake Details - To Be Completed with Parent", 'Acknowledgement'] as const).map((section) => (
                            <section className="hub-form-section" key={section}>
                              <h4 className="hub-form-section-title">{section}</h4>
                              <div className="hub-form-grid">
                                {CHILD_SHELTER_INTAKE_FIELDS.filter((fieldDef) => fieldDef.section === section).map((fieldDef) => {
                                  const visible = !fieldDef.visibleWhen || fieldDef.visibleWhen.values.some((expected) => normalize(String(activeFormSession.values[fieldDef.visibleWhen?.field || ''] || '')) === normalize(expected))
                                  if (!visible) return null
                                  const value = String(activeFormSession.values[fieldDef.field] || '')
                                  const label = <span>{fieldDef.label}{fieldDef.required ? <span className="required-inline"> *</span> : null}</span>
                                  const update = (nextValue: string) => setActiveFormSession((current) => current?.kind === 'child-shelter-intake' ? { ...current, values: { ...current.values, [fieldDef.field]: nextValue } } : current)

                                  if (fieldDef.input === 'html') return <div key={fieldDef.field} className="hub-form-field hub-form-field-wide acknowledgement-html-header">{fieldDef.label}</div>
                                  if (fieldDef.input === 'readonly') return <label key={fieldDef.field} className="hub-form-field">{label}<input type="text" value={value} readOnly disabled /></label>
                                  if (fieldDef.input === 'lookup') return <label key={fieldDef.field} className="hub-form-field hub-form-field-wide">{label}<select value={value} onChange={(event) => update(event.target.value)}><option value="">--Please Select--</option>{activeProgramEnrollmentOptionsForServices.map((entry) => <option key={entry.value} value={entry.value}>{entry.label}</option>)}</select></label>
                                  if (fieldDef.input === 'radio') return <div key={fieldDef.field} className="hub-form-field hub-form-field-wide">{label}<div className="hub-form-option-grid">{fieldDef.options.map((option) => <label className="permission-check" key={`${fieldDef.field}-${option}`}><input type="radio" name={fieldDef.field} checked={normalize(value) === normalize(option)} onChange={() => update(option)} /><span>{option}</span></label>)}</div></div>
                                  if (fieldDef.input === 'textarea') return <label key={fieldDef.field} className="hub-form-field hub-form-field-wide">{label}<textarea value={value} onChange={(event) => update(event.target.value)} /></label>
                                  return <label key={fieldDef.field} className={`hub-form-field${fieldDef.label.length > 48 ? ' hub-form-field-wide' : ''}`}>{label}<FormInput type={fieldDef.input === 'date' ? 'date' : fieldDef.input === 'phone' ? 'tel' : 'text'} value={value} onChange={(event) => update(event.target.value)} /></label>
                                })}
                              </div>
                            </section>
                          ))}
                        </div>
                        {activeFormError ? <p className="error">{activeFormError}</p> : null}
                      </article>
                    ) : activeFormSession?.kind === 'child-assessment' ? (
                      <article className="panel wide hub-card hub-form-editor" key={`${selectedHub.id}-child-assessment-editor`}>
                        <div className="hub-form-editor-head"><div><h3>{activeFormSession.formName}</h3>{activeFormClientContext ? <p className="form-client-context">Client: {activeFormClientContext.recordId} {"\u2014"} {activeFormClientContext.name}</p> : null}</div><div className="hub-form-editor-actions"><button type="button" className="secondary" onClick={closeActiveForm} disabled={activeFormSaving}>Back</button><button type="button" className="primary" onClick={() => { void saveActiveForm() }} disabled={isUserPreview || (activeFormSaving)}>{activeFormSaving ? 'Saving...' : 'Save Form'}</button></div></div>
                        <div className="hub-form-sections">
                          {(['Main', 'Child Assessment'] as const).map((section) => (
                            <section className="hub-form-section" key={section}>
                              <h4 className="hub-form-section-title">{section}</h4>
                              <div className="hub-form-grid">
                                {CHILD_ASSESSMENT_FIELDS.filter((fieldDef) => fieldDef.section === section).map((fieldDef) => {
                                  const visible = !fieldDef.visibleWhen || fieldDef.visibleWhen.values.some((expected) => normalize(String(activeFormSession.values[fieldDef.visibleWhen?.field || ''] || '')) === normalize(expected))
                                  if (!visible) return null
                                  const value = String(activeFormSession.values[fieldDef.field] || '')
                                  const label = <span>{fieldDef.label}{fieldDef.required ? <span className="required-inline"> *</span> : null}</span>
                                  const update = (nextValue: string) => setActiveFormSession((current) => current?.kind === 'child-assessment' ? { ...current, values: { ...current.values, [fieldDef.field]: nextValue } } : current)

                                  if (fieldDef.input === 'html') return <div key={fieldDef.field} className="hub-form-field hub-form-field-wide acknowledgement-html-header">{fieldDef.label}</div>
                                  if (fieldDef.input === 'readonly') return <label key={fieldDef.field} className="hub-form-field">{label}<input type="text" value={value} readOnly disabled /></label>
                                  if (fieldDef.input === 'lookup') return <label key={fieldDef.field} className="hub-form-field hub-form-field-wide">{label}<select value={value} onChange={(event) => update(event.target.value)}><option value="">--Please Select--</option>{activeProgramEnrollmentOptionsForServices.map((entry) => <option key={entry.value} value={entry.value}>{entry.label}</option>)}</select></label>
                                  if (fieldDef.input === 'radio') return <div key={fieldDef.field} className="hub-form-field hub-form-field-wide">{label}<div className="hub-form-option-grid">{fieldDef.options.map((option) => <label className="permission-check" key={`${fieldDef.field}-${option}`}><input type="radio" name={fieldDef.field} checked={normalize(value) === normalize(option)} onChange={() => update(option)} /><span>{option}</span></label>)}</div></div>
                                  if (fieldDef.input === 'textarea') return <label key={fieldDef.field} className="hub-form-field hub-form-field-wide">{label}<textarea value={value} onChange={(event) => update(event.target.value)} /></label>
                                  return <label key={fieldDef.field} className={`hub-form-field${fieldDef.label.length > 48 ? ' hub-form-field-wide' : ''}`}>{label}<FormInput type={fieldDef.input === 'date' ? 'date' : 'text'} value={value} onChange={(event) => update(event.target.value)} /></label>
                                })}
                              </div>
                            </section>
                          ))}
                        </div>
                        {activeFormError ? <p className="error">{activeFormError}</p> : null}
                      </article>
                    ) : activeFormSession?.kind === 'child-safety-plan' ? (
                      <article className="panel wide hub-card hub-form-editor" key={`${selectedHub.id}-child-safety-plan-editor`}>
                        <div className="hub-form-editor-head"><div><h3>{activeFormSession.formName}</h3>{activeFormClientContext ? <p className="form-client-context">Client: {activeFormClientContext.recordId} {"\u2014"} {activeFormClientContext.name}</p> : null}</div><div className="hub-form-editor-actions"><button type="button" className="secondary" onClick={closeActiveForm} disabled={activeFormSaving}>Back</button><button type="button" className="primary" onClick={() => { void saveActiveForm() }} disabled={isUserPreview || (activeFormSaving)}>{activeFormSaving ? 'Saving...' : 'Save Form'}</button></div></div>
                        <div className="hub-form-sections">
                          {(['Main', 'Planning', 'Emotions', 'Acknowledgement'] as const).map((section) => <section className="hub-form-section" key={section}><h4 className="hub-form-section-title">{section}</h4><div className="hub-form-grid">{CHILD_SAFETY_PLAN_FIELDS.filter((fieldDef) => fieldDef.section === section).map((fieldDef) => {
                            const value = String(activeFormSession.values[fieldDef.field] || '')
                            const update = (nextValue: string) => setActiveFormSession((current) => {
                              if (!current || current.kind !== 'child-safety-plan') return current
                              const nextValues = { ...current.values, [fieldDef.field]: nextValue }
                              if (fieldDef.field === 'cmps_peid') {
                                const enrollment = programEnrollmentsForClient.find((entry) => normalize(entry.id) === normalize(nextValue))
                                const staffOptions = getStaffOptionsForProgram(enrollment?.program || '')
                                if (nextValues.cmps_administeredby && !staffOptions.some((option) => normalize(option) === normalize(nextValues.cmps_administeredby || ''))) {
                                  nextValues.cmps_administeredby = ''
                                }
                              }
                              return { ...current, values: nextValues }
                            })
                            if (fieldDef.input === 'readonly') return <label key={fieldDef.field} className="hub-form-field"><span>{fieldDef.label}</span><input type="text" value={value} readOnly disabled /></label>
                            if (fieldDef.input === 'lookup') return <label key={fieldDef.field} className="hub-form-field hub-form-field-wide"><span>{fieldDef.label}</span><select value={value} onChange={(event) => update(event.target.value)}><option value="" disabled>--Please Select--</option>{activeProgramEnrollmentOptionsForServices.map((entry) => <option key={entry.value} value={entry.value}>{entry.label}</option>)}</select></label>
                            if (fieldDef.field === 'cmps_administeredby') {
                              const enrollment = programEnrollmentsForClient.find((entry) => normalize(entry.id) === normalize(String(activeFormSession.values.cmps_peid || '')))
                              const staffOptions = getStaffOptionsForProgram(enrollment?.program || '')
                              return <label key={fieldDef.field} className="hub-form-field" htmlFor={`child-safety-plan-${fieldDef.field}`}><span>{fieldDef.label}</span><select id={`child-safety-plan-${fieldDef.field}`} value={value} onChange={(event) => update(event.target.value)}><option value="" disabled hidden>--Please Select--</option>{staffOptions.map((option) => <option key={`${fieldDef.field}-${option}`} value={option}>{option}</option>)}</select>{enrollment?.program && staffOptions.length === 0 ? <span className="hub-form-meta">No active app users are assigned to this program.</span> : null}</label>
                            }
                            if (fieldDef.input === 'file') {
                              const selectedFile = getPendingFormFileUpload(activeFormSession, fieldDef.field)
                              return <label key={fieldDef.field} className="hub-form-field hub-form-field-wide"><span>{fieldDef.label}</span><input type="file" onChange={(event) => updatePendingFormFileUpload(activeFormSession, fieldDef.field, event.target.files?.[0] || null)} disabled={isUserPreview} />{selectedFile ? <span className="hub-form-meta">{selectedFile.name} ({selectedFile.size.toLocaleString()} bytes)</span> : value ? <span className="hub-form-meta">A file is already attached. Choose another file to replace it.</span> : null}{value ? <RecordAttachmentButtons attachments={recordAttachments(activeFormSession.kind, { [fieldDef.field]: value })} onOpenFile={(id) => { void openCompassFileViewer(id) }} /> : null}</label>
                            }
                            if (fieldDef.input === 'textarea') return <label key={fieldDef.field} className="hub-form-field hub-form-field-wide"><span>{fieldDef.label}</span><textarea value={value} onChange={(event) => update(event.target.value)} /></label>
                            return <label key={fieldDef.field} className={`hub-form-field${fieldDef.label.length > 42 ? ' hub-form-field-wide' : ''}`}><span>{fieldDef.label}</span><FormInput type={fieldDef.input === 'date' ? 'date' : 'text'} value={value} onChange={(event) => update(event.target.value)} /></label>
                          })}</div></section>)}
                        </div>
                        {activeFormError ? <p className="error">{activeFormError}</p> : null}
                      </article>
                    ) : activeFormSession?.kind === 'goal' ? (
                      <article className="panel wide hub-card hub-form-editor" key={`${selectedHub.id}-goal-editor`}>
                        <div className="hub-form-editor-head"><div><h3>Goals</h3><p className="hint">Record ID: {activeFormSession.recordId || 'Pending'}</p></div><div className="hub-form-editor-actions"><button type="button" className="secondary" onClick={closeActiveForm} disabled={activeFormSaving}>{formBackButtonLabel}</button><button type="button" className="primary" onClick={() => { void saveActiveForm() }} disabled={isUserPreview || (activeFormSaving)}>{activeFormSaving ? 'Saving...' : 'Save Form'}</button></div></div>
                        <div className="hub-form-sections">
                          {(['Main', 'Goal Information', 'Goal Outcomes', 'Goal Notes'] as const)
                            .filter((section) => section !== 'Goal Outcomes' || normalize(activeFormSession.values.cmps_goalstatus || '') === normalize('Complete'))
                            .map((section) => (
                            <section className="hub-form-section" key={section}><h4 className="hub-form-section-title">{section}</h4><div className="hub-form-grid">
                              {GOAL_FIELDS.filter((field) => field.section === section).filter((field) => field.field !== 'cmps_goalcompletiondate' || normalize(activeFormSession.values.cmps_goalstatus || '') === normalize('Complete')).filter((field) => field.field !== 'cmps_othergoal' || normalize(activeFormSession.values.cmps_goal || '') === normalize(GOAL_OTHER_OPTION)).filter((field) => !['cmps_barrieridentified', 'cmps_plantoaddressbarrier'].includes(field.field) || normalize(activeFormSession.values.cmps_goalstatus || '') === normalize('Barrier Identified')).map((field) => {
                                const value = String(activeFormSession.values[field.field] || '')
                                const fieldId = `goal-${field.field}`
                                if (field.field === 'cmps_peid') return <label className="hub-form-field" key={field.field} htmlFor={fieldId}><span>{field.label}</span><select id={fieldId} value={value} onChange={(event) => updateGoalValue(field.field, event.target.value)}><option value="" disabled hidden>--Please Select--</option>{activeProgramEnrollmentOptionsForGoals.map((entry) => <option key={entry.value} value={entry.value}>{entry.label}</option>)}</select></label>
                                if (field.field === 'cmps_goal') { const options = [...(GOAL_OPTIONS_BY_CATEGORY[activeFormSession.values.cmps_goalcategory || ''] || []), GOAL_OTHER_OPTION]; return <label className="hub-form-field" key={field.field} htmlFor={fieldId}><span>{field.label}</span><select id={fieldId} value={value} onChange={(event) => updateGoalValue(field.field, event.target.value)}><option value="" disabled hidden>--Please Select--</option>{options.map((option) => <option key={option} value={option}>{option}</option>)}</select></label> }
                                if (field.input === 'select') return <label className="hub-form-field" key={field.field} htmlFor={fieldId}><span>{field.label}</span><select id={fieldId} value={value} onChange={(event) => updateGoalValue(field.field, event.target.value)}><option value="" disabled hidden>--Please Select--</option>{field.options.map((option) => <option key={option} value={option}>{option}</option>)}</select></label>
                                if (field.input === 'textarea') return <label className="hub-form-field hub-form-field-wide" key={field.field} htmlFor={fieldId}><span>{field.label}</span><textarea id={fieldId} value={value} onChange={(event) => updateGoalValue(field.field, event.target.value)} /></label>
                                return <label className="hub-form-field" key={field.field} htmlFor={fieldId}><span>{field.label}{field.tooltip ? <span className="field-tooltip" title={field.tooltip} aria-label={field.tooltip} role="img" tabIndex={0}>?</span> : null}</span><FormInput id={fieldId} type={field.input === 'date' ? 'date' : 'text'} value={value} onChange={(event) => updateGoalValue(field.field, event.target.value)} /></label>
                              })}
                            </div></section>
                          ))}
                        </div>
                        {activeFormError ? <p className="error">{activeFormError}</p> : null}{hubActionStatus ? <p className="success">{hubActionStatus}</p> : null}
                      </article>
                    ) : activeFormSession?.kind === 'event' ? (
                      <article className="panel wide hub-card hub-form-editor" key={`${selectedHub.id}-event-editor`}>
                        <div className="hub-form-editor-head">
                          <div>
                            <h3>{activeFormSession.formName}</h3>{activeFormClientContext ? <p className="form-client-context">Client: {activeFormClientContext.recordId} {"\u2014"} {activeFormClientContext.name}</p> : null}
                            <p className="hint">Record ID: {activeFormSession.recordId || 'Pending'}</p>
                          </div>
                          <div className="hub-form-editor-actions">
                            <button type="button" className="secondary" onClick={closeActiveForm} disabled={activeFormSaving}>{formBackButtonLabel}</button>
                            <button type="button" className="primary" onClick={() => { void saveActiveForm() }} disabled={isUserPreview || (activeFormSaving)}>
                              {activeFormSaving ? 'Saving...' : 'Save Form'}
                            </button>
                          </div>
                        </div>

                        <div className="hub-form-sections">
                          {(['Event Details', 'Attendance by Demographic', 'Notes'] as const).map((section) => (
                            <section className="hub-form-section" key={section}>
                              <h4 className="hub-form-section-title">{section}</h4>
                              <div className="hub-form-grid">
                              {EVENT_FIELD_DEFINITIONS.filter((fieldDef) => fieldDef.section === section).map((fieldDef) => {
                                const value = String(activeFormSession.values[fieldDef.field] || '')
                                const fieldId = `event-${fieldDef.field}`
                                const isCalculated = ['cmps_totalgenderattendance', 'cmps_totalattendancebyagerange', 'cmps_totalattendancebyrace', 'cmps_totalattendancebyethnicity'].includes(fieldDef.field)
                                const isWide = fieldDef.field === 'cmps_notes' || fieldDef.field === 'cmps_eventtitle' || fieldDef.field === 'cmps_eventlocation'
                                if (fieldDef.input === 'readonly' || isCalculated) {
                                  return <label key={fieldDef.field} className={`hub-form-field${isWide ? ' hub-form-field-wide' : ''}`} htmlFor={fieldId}><span>{fieldDef.label}</span><input id={fieldId} type="text" value={isCalculated ? getEventCalculatedTotals(activeFormSession.values)[fieldDef.field] : value} readOnly disabled /></label>
                                }
                                if (fieldDef.input === 'select') {
                                  return <label key={fieldDef.field} className="hub-form-field" htmlFor={fieldId}><span>{fieldDef.label}</span><select id={fieldId} value={value} onChange={(event) => updateEventValue(fieldDef.field, event.target.value)}><option value="" disabled hidden>--Please Select--</option>{fieldDef.options.map((option) => <option key={`${fieldDef.field}-${option}`} value={option}>{option}</option>)}</select></label>
                                }
                                if (fieldDef.input === 'file') {
                                  const slot: 0 | 1 = fieldDef.field === 'cmps_fileid1' ? 0 : 1
                                  const selectedFile = eventUploadFiles[slot]
                                  return (
                                    <label key={fieldDef.field} className="hub-form-field hub-form-field-wide" htmlFor={fieldId}>
                                      <span>{fieldDef.label}</span>
                                      <input
                                        id={fieldId}
                                        type="file"
                                        onChange={(event) => updateEventUploadFile(slot, event.target.files?.[0] || null)} disabled={isUserPreview}
                                      />
                                      {selectedFile ? (
                                        <span className="hub-form-meta">{selectedFile.name} ({selectedFile.size.toLocaleString()} bytes)</span>
                                      ) : value ? (
                                        <span className="hub-form-meta">A file is already attached. Choose another file to replace it.</span>
                                      ) : null}
                                    {value ? <RecordAttachmentButtons attachments={recordAttachments(activeFormSession.kind, { [fieldDef.field]: value })} onOpenFile={(id) => { void openCompassFileViewer(id) }} /> : null}</label>
                                  )
                                }
                                if (fieldDef.input === 'textarea') {
                                  return <label key={fieldDef.field} className="hub-form-field hub-form-field-wide" htmlFor={fieldId}><span>{fieldDef.label}</span><textarea id={fieldId} value={value} onChange={(event) => updateEventValue(fieldDef.field, event.target.value)} /></label>
                                }
                                return <label key={fieldDef.field} className={`hub-form-field${isWide ? ' hub-form-field-wide' : ''}`} htmlFor={fieldId}><span>{fieldDef.label}</span><FormInput id={fieldId} type={fieldDef.input === 'date' ? 'date' : fieldDef.input === 'number' ? 'number' : 'text'} min={fieldDef.input === 'number' ? 0 : undefined} step={fieldDef.input === 'number' ? 1 : undefined} value={value} onChange={(event) => updateEventValue(fieldDef.field, event.target.value)} /></label>
                              })}
                              </div>
                            </section>
                          ))}
                        </div>

                        {activeFormError ? <p className="error">{activeFormError}</p> : null}
                        {hubActionStatus ? <p className="success">{hubActionStatus}</p> : null}
                      </article>
                    ) : activeFormSession?.kind === 'release-of-information' ? (
                      <article className="panel wide hub-card hub-form-editor" key={`${selectedHub.id}-release-of-information-editor`}>
                        <div className="hub-form-editor-head">
                          <div><h3>{activeFormSession.formName}</h3>{activeFormClientContext ? <p className="form-client-context">Client: {activeFormClientContext.recordId} {"\u2014"} {activeFormClientContext.name}</p> : null}</div>
                          <div className="hub-form-editor-actions"><button type="button" className="secondary" onClick={closeActiveForm} disabled={activeFormSaving}>Back</button><button type="button" className="primary" onClick={() => { void saveActiveForm() }} disabled={isUserPreview || (activeFormSaving)}>{activeFormSaving ? 'Saving...' : 'Save Form'}</button></div>
                        </div>
                        <div className="hub-form-sections">
                          {(['Read First', 'Release of Information', 'Attestation', 'Reaffirmation & Extension'] as const).map((section) => (
                            <section className="hub-form-section" key={section}>
                              <h4 className="hub-form-section-title">{section}</h4>
                              <div className="hub-form-grid">
                              {RELEASE_OF_INFORMATION_FIELDS.filter((fieldDef) => fieldDef.section === section).map((fieldDef) => {
                                const value = String(activeFormSession.values[fieldDef.field] || '')
                                if (fieldDef.field === 'cmps_cpid' || fieldDef.field === 'cmps_clientid') return renderClientProfileLookupField(fieldDef, value)
                                const visible = !fieldDef.visibleWhen || parseMultiValue(String(activeFormSession.values[fieldDef.visibleWhen.field] || '')).some((item) => fieldDef.visibleWhen?.values.some((expected) => normalize(item) === normalize(expected)))
                                if (!visible) return null
                                const update = (nextValue: string) => setActiveFormSession((current) => current?.kind === 'release-of-information' ? { ...current, values: { ...current.values, [fieldDef.field]: nextValue } } : current)
                                if (fieldDef.input === 'readonly') {
                                  return <label key={fieldDef.field} className="hub-form-field"><span>{fieldDef.label}</span><input type="text" value={value} readOnly disabled /></label>
                                }
                                if (fieldDef.input === 'lookup') {
                                  return <label key={fieldDef.field} className="hub-form-field"><span>{fieldDef.label}</span><input type="text" value={formatLookupDisplayValue(fieldDef.field, value)} readOnly disabled /></label>
                                }
                                if (fieldDef.input === 'checkbox-group') {
                                  const selected = parseMultiValue(value)
                                  return <div key={fieldDef.field} className="hub-form-field hub-form-field-wide"><span>{fieldDef.label}</span><div className="hub-form-option-grid">{fieldDef.options.map((option) => <label key={`${fieldDef.field}-${option}`} className="permission-check"><input type="checkbox" checked={selected.some((item) => normalize(item) === normalize(option))} onChange={(event) => update(event.target.checked ? Array.from(new Set([...selected, option])).join(', ') : selected.filter((item) => normalize(item) !== normalize(option)).join(', '))} /><span>{option}</span></label>)}</div></div>
                                }
                                if (fieldDef.input === 'textarea') {
                                  return <label key={fieldDef.field} className="hub-form-field hub-form-field-wide"><span>{fieldDef.label}</span><textarea value={value} onChange={(event) => update(event.target.value)} /></label>
                                }
                                return <label key={fieldDef.field} className={`hub-form-field${fieldDef.input === 'text' && fieldDef.label.length > 45 ? ' hub-form-field-wide' : ''}`}><span>{fieldDef.label}</span><FormInput type={fieldDef.input === 'email' ? 'email' : fieldDef.input === 'phone' ? 'tel' : fieldDef.input === 'datetime' ? 'datetime-local' : 'text'} value={value} onChange={(event) => update(event.target.value)} /></label>
                              })}
                              </div>
                            </section>
                          ))}
                        </div>
                        {activeFormError ? <p className="error">{activeFormError}</p> : null}
                      </article>
                    ) : activeFormSession?.kind === 'voca-form' ? (
                      <article className="panel wide hub-card hub-form-editor" key={`${selectedHub.id}-voca-form-editor`}>
                        <div className="hub-form-editor-head">
                          <div>
                            <h3>{activeFormSession.formName}</h3>{activeFormClientContext ? <p className="form-client-context">Client: {activeFormClientContext.recordId} {"\u2014"} {activeFormClientContext.name}</p> : null}
                            <p className="hint">Record ID: {activeFormSession.recordId || 'Pending'}</p>
                          </div>
                          <div className="hub-form-editor-actions">
                            <button type="button" className="secondary" onClick={closeActiveForm} disabled={activeFormSaving}>{formBackButtonLabel}</button>
                            <button type="button" className="primary" onClick={() => { void saveActiveForm() }} disabled={isUserPreview || (activeFormSaving)}>
                              {activeFormSaving ? 'Saving...' : 'Save Form'}
                            </button>
                          </div>
                        </div>

                        <section className="hub-client-quick-record">
                          <div className="hub-client-quick-record-head">
                            <h4>Client Context</h4>
                            <span className="hint">Only active Program Enrollments for this client are available.</span>
                          </div>
                          <div className="hub-search-detail-grid">
                            <div className="hub-client-quick-item">
                              <span className="hub-search-detail-label">Client ID</span>
                              <span className="hub-search-detail-value">{selectedDetailRecord?.recordId || '-'}</span>
                            </div>
                          </div>
                        </section>

                        <div className="hub-form-sections">
                          <section className="hub-form-section">
                            <h4 className="hub-form-section-title">Main</h4>
                            <div className="hub-form-grid">
                          {VOCA_FORM_FIELD_DEFINITIONS.map((fieldDef) => {
                            if (!isFieldVisible(fieldDef.visibleWhen, activeFormSession.values)) return null

                            const value = String(activeFormSession.values[fieldDef.field] || '')
                            const fieldId = `voca-form-${fieldDef.field}`

                            if (fieldDef.field === 'cmps_peid') {
                              return (
                                <label key={fieldDef.field} className="hub-form-field hub-form-field-wide" htmlFor={fieldId}>
                                  <span>{fieldDef.label}</span>
                                  <select
                                    id={fieldId}
                                    value={value}
                                    onChange={(event) => {
                                      const nextEnrollmentId = event.target.value
                                      setActiveFormSession((current) => {
                                        if (!current || current.kind !== 'voca-form') return current
                                        return { ...current, values: { ...current.values, cmps_peid: nextEnrollmentId } }
                                      })
                                      void populateVocaFromProgramEnrollment(nextEnrollmentId)
                                    }}
                                  >
                                    <option value="" disabled hidden>
                                      --Please Select--
                                    </option>
                                    {activeVocaProgramEnrollmentOptions.map((entry) => (
                                      <option key={`voca-pe-${entry.value}`} value={entry.value}>{entry.label}</option>
                                    ))}
                                  </select>
                                  {activeVocaProgramEnrollmentOptions.length === 0 ? (
                                    <span className="hub-form-meta">No active Program Enrollment records found for this client.</span>
                                  ) : null}
                                </label>
                              )
                            }

                            if (fieldDef.input === 'readonly') {
                              return (
                                <label key={fieldDef.field} className="hub-form-field" htmlFor={fieldId}>
                                  <span>{fieldDef.label}</span>
                                  <input id={fieldId} type="text" value={value} readOnly disabled />
                                </label>
                              )
                            }

                            if (fieldDef.input === 'select') {
                              return (
                                <label key={fieldDef.field} className="hub-form-field" htmlFor={fieldId}>
                                  <span>{fieldDef.label}</span>
                                  <select
                                    id={fieldId}
                                    value={value}
                                    onChange={(event) => setActiveFormSession((current) => {
                                      if (!current || current.kind !== 'voca-form') return current
                                      return { ...current, values: { ...current.values, [fieldDef.field]: event.target.value } }
                                    })}
                                  >
                                    <option value="" disabled hidden>
                                      --Please Select--
                                    </option>
                                    {fieldDef.options.map((option) => (
                                      <option key={`${fieldDef.field}-${option}`} value={option}>{option}</option>
                                    ))}
                                  </select>
                                </label>
                              )
                            }

                            if (fieldDef.input === 'checkbox-group') {
                              const selections = parseMultiValue(value)
                              return (
                                <div key={fieldDef.field} className="hub-form-field hub-form-field-wide">
                                  <span>{fieldDef.label}{fieldDef.tooltip ? <span className="field-tooltip" title={fieldDef.tooltip} aria-label={fieldDef.tooltip} role="img" tabIndex={0}>?</span> : null}</span>
                                  <div className="hub-form-option-grid">
                                    {fieldDef.options.map((option) => (
                                      <label key={`${fieldDef.field}-${option}`} className="permission-check">
                                        <input
                                          type="checkbox"
                                          checked={selections.some((entry) => normalize(entry) === normalize(option))}
                                          onChange={(event) => setActiveFormSession((current) => {
                                            if (!current || current.kind !== 'voca-form') return current
                                            const nextSelections = event.target.checked
                                              ? Array.from(new Set([...selections, option]))
                                              : selections.filter((entry) => normalize(entry) !== normalize(option))
                                            return { ...current, values: { ...current.values, [fieldDef.field]: nextSelections.join(', ') } }
                                          })}
                                        />
                                        <span>{option}</span>
                                      </label>
                                    ))}
                                  </div>
                                </div>
                              )
                            }

                            return (
                              <label key={fieldDef.field} className={`hub-form-field${fieldDef.field.includes('other') ? ' hub-form-field-wide' : ''}`} htmlFor={fieldId}>
                                <span>{fieldDef.label}</span>
                                <input
                                  id={fieldId}
                                  type="text"
                                  value={value}
                                  onChange={(event) => setActiveFormSession((current) => {
                                    if (!current || current.kind !== 'voca-form') return current
                                    return { ...current, values: { ...current.values, [fieldDef.field]: event.target.value } }
                                  })}
                                />
                              </label>
                            )
                          })}
                            </div>
                          </section>
                        </div>

                        {activeFormError ? <p className="error">{activeFormError}</p> : null}
                        {hubActionStatus ? <p className="success">{hubActionStatus}</p> : null}
                      </article>
                    ) : (
                      <article className="panel hub-card hub-form-launcher" key={`${selectedHub.id}-forms-launcher`}>
                        <h3>Start New Form Response</h3>
                        <p className="hint">Client Profile, Helpline, Household, and Event can be started from this page when Create access exists. All other forms are available from an opened Client Profile or one of the client's Program Enrollments.</p>

                        {hubClientProfileCreateAccess.length === 0 ? (
                          <p className="hint">No supported form create access found for this hub yet.</p>
                        ) : (
                          <div className="hub-form-button-list">
                            {hubClientProfileCreateAccess.map((form) => (
                              (canCreateForm(form.formName) ? (<button
                                key={`${selectedHub.id}-${form.formName}`}
                                type="button"
                                className="secondary hub-form-launch-button"
                                onClick={() => { void startFormResponse(form.formName) }}
                              >
                                Start {form.formName}
                              </button>) : null)
                            ))}
                          </div>
                        )}

                        {hubActionStatus ? <p className="success">{hubActionStatus}</p> : null}
                      </article>
                    )}
                    {activeFormSession ? (
                      <section className="panel wide hub-card hub-form-system-fields" aria-label="System Fields">
                        <div className="hub-client-quick-record-head">
                          <h4 className="hub-form-section-title">System Fields</h4>
                          {canAccessRoleAdmin && activeFormSession.rowId ? (
                            <button type="button" className="secondary danger" onClick={() => { void archiveRecord(activeFormSession.tableAlias, activeFormSession.rowId, activeFormSession.recordId) }} disabled={isUserPreview || (archiveActionLoading)}>
                              {archiveActionLoading ? 'Archiving...' : 'Archive'}
                            </button>
                          ) : null}
                        </div>
                        <div className="hub-form-grid">
                          <label className="hub-form-field">
                            <span>Record ID</span>
                            <input type="text" value={activeFormSession.recordId || activeFormValueMap.cmps_recordid || 'Pending'} readOnly disabled />
                          </label>
                          <label className="hub-form-field">
                            <span>Created By</span>
                            <input type="text" value={displayedSystemFields.createdBy || 'Set after first save'} readOnly disabled />
                          </label>
                          <label className="hub-form-field">
                            <span>Created Time</span>
                            <input type="text" value={formatSystemTimestamp(displayedSystemFields.createdOn) || 'Set after first save'} readOnly disabled />
                          </label>
                          <label className="hub-form-field">
                            <span>Modified By</span>
                            <input type="text" value={displayedSystemFields.modifiedBy || 'Set after first save'} readOnly disabled />
                          </label>
                          <label className="hub-form-field">
                            <span>Modified Time</span>
                            <input type="text" value={formatSystemTimestamp(displayedSystemFields.modifiedOn) || 'Set after first save'} readOnly disabled />
                          </label>
                        </div>
                        {activeSystemFieldsLoading ? <p className="hint">Loading system fields...</p> : null}
                        {activeSystemFieldsError ? <p className="error">Unable to load the latest system information.</p> : null}
                        {archiveActionError ? <p className="error">{archiveActionError}</p> : null}
                      </section>
                    ) : null}
                    </>
                  ) : (
                    HUB_PAGE_DEFINITIONS[selectedHubPage].cards.map((card) => (
                      <article className="panel hub-card" key={`${selectedHub.id}-${selectedHubPage}-${card.title}`}>
                        <h3>{card.title}</h3>
                        <p className="hint">{card.body}</p>
                        <ul className="hub-card-list">
                          {card.bullets.map((bullet) => (
                            <li key={bullet}>{bullet}</li>
                          ))}
                        </ul>
                      </article>
                    ))
                  )}
                </section>

                <section className="panel">
                  <h2>{selectedAppNav === 'my-work' ? 'My Work Notes' : `${heroContextLabel} Notes`}</h2>
                  <p>
                    {selectedAppNav === 'my-work'
                      ? 'Use this space later for personal queue notes, reminders, and assignment guidance.'
                      : HUB_PAGE_DEFINITIONS[selectedHubPage].summary}
                  </p>
                </section>
              </>
            ) : (
              <section className="panel spotlight hub-hero">
                <p className="eyebrow">Hub</p>
                <h2>No workspace available</h2>
                <p className="hint">No workspace is currently available for your account.</p>
              </section>
            )}
          </section>
        </main>
      ) : null}

      {view === 'admin' ? (
        <main className="grid">
          <section className="panel wide spotlight">
            <h2>IT Admin</h2>
              <p className="hint">Choose a section to manage application access and administrative data.</p>
            {!canAccessRoleAdmin ? <p className="error">You do not have access to this page.</p> : null}
            {adminStatus ? <p className="success">{adminStatus}</p> : null}
            {adminError ? <p className="error">{adminError}</p> : null}

            <div className="admin-page-nav">
              <button
                type="button"
                className={`secondary${adminPage === 'roles' ? ' active-admin-page' : ''}`}
                onClick={() => setAdminPage('roles')}
              >
                Roles
              </button>
              <button
                type="button"
                className={`secondary${adminPage === 'funders' ? ' active-admin-page' : ''}`}
                onClick={() => setAdminPage('funders')}
              >
                Manage Funders
              </button>
              <button
                type="button"
                className={`secondary${adminPage === 'beds' ? ' active-admin-page' : ''}`}
                onClick={() => setAdminPage('beds')}
              >
                Bed Management
              </button>
              {canAccessRoleAdmin ? <button type="button" className={`secondary${adminPage === 'legacy-migration' ? ' active-admin-page' : ''}`} onClick={() => setAdminPage('legacy-migration')}>Legacy Record Migration</button> : null}
              {canAccessRoleAdmin && !isUserPreview ? <button type="button" className={`secondary${adminPage === 'file-translation' ? ' active-admin-page' : ''}`} onClick={() => setAdminPage('file-translation')}>Legacy File Translation</button> : null}
              {canAccessRoleAdmin ? <button type="button" className={`secondary${adminPage === 'household-history' ? ' active-admin-page' : ''}`} onClick={() => setAdminPage('household-history')}>Household History</button> : null}
              {canAccessRoleAdmin ? <button type="button" className={`secondary${adminPage === 'funder-translation' ? ' active-admin-page' : ''}`} onClick={() => setAdminPage('funder-translation')}>Imported Funder Translation</button> : null}
              {canMergeClientProfiles ? <button type="button" className={`secondary${adminPage === 'client-merge' ? ' active-admin-page' : ''}`} onClick={() => setAdminPage('client-merge')}>Merge Client Profiles</button> : null}
              {canAccessRoleAdmin ? <button type="button" className={`secondary${adminPage === 'view-as-user' ? ' active-admin-page' : ''}`} onClick={() => setAdminPage('view-as-user')}>View as User</button> : null}
              {canAccessRoleAdmin ? <button type="button" className={`secondary${adminPage === 'messages' ? ' active-admin-page' : ''}`} onClick={() => setAdminPage('messages')}>Home Messages</button> : null}
            </div>

            {canAccessRoleAdmin && adminPage === 'legacy-migration' && !isUserPreview ? <LegacyRecordMigrationPanel userIdentity={user.id || user.email} /> : null}
            {canAccessRoleAdmin && adminPage === 'file-translation' && !isUserPreview ? <LegacyFileTranslationPanel canManage={canAccessRoleAdmin && !isUserPreview} savedBy={String(user.name || user.email || user.id || '')} /> : null}
            {canAccessRoleAdmin && adminPage === 'household-history' && !isUserPreview ? <HouseholdHistoryBackfillPanel savedBy={String(user.name || user.email || user.id || '')} /> : null}
            {canAccessRoleAdmin && adminPage === 'funder-translation' && !isUserPreview ? <FunderTranslationPanel savedBy={String(user.name || user.email || user.id || '')} /> : null}
            {canMergeClientProfiles && adminPage === 'client-merge' ? <ClientMergePanel canManage={canMergeClientProfiles} savedBy={String(user.name || user.email || user.id || '')} onMerged={() => setClientLookupRefreshSignal((current) => current + 1)} /> : null}
            {canAccessRoleAdmin && adminPage === 'messages' && !isUserPreview ? <MessagesAdminPanel canManage={canAccessRoleAdmin && !isUserPreview} savedBy={String(user.name || user.email || user.id || '')} onBackToSearch={() => { setSelectedAppNav('programs'); if (selectedHub) setSelectedHubPages((current) => ({ ...current, [selectedHub.id]: 'search' })) }} /> : null}
            {canAccessRoleAdmin && isUserPreview && ['legacy-migration', 'file-translation', 'household-history', 'funder-translation', 'client-merge', 'view-as-user', 'messages'].includes(adminPage) ? <p className="hint">{USER_PREVIEW_READ_ONLY_MESSAGE} Use the preview banner to change users or exit.</p> : null}
            {canAccessRoleAdmin && adminPage === 'view-as-user' && !isUserPreview ? <UserPreviewPicker busy={previewBusy} onStart={async (key) => {
              if (activeFormSaving || importingRoles || importingBeds || funderAdminSaving || savingRoleIndex !== null || savingPicklistIndex !== null || archiveActionLoading) throw new Error('Wait for the current save or import to finish before entering View as User.')
              if (activeFormSession && !window.confirm('Entering View as User will discard the open, unsaved form. Continue?')) return
              await onStartPreview(key)
            }} /> : null}

            {canAccessRoleAdmin && adminPage === 'roles' ? (
              <>
                <div className="role-admin-toolbar">
                  <button className="secondary" onClick={onClickImportRoles} disabled={importingRoles}>
                    {importingRoles ? 'Importing Roles...' : 'Import Roles'}
                  </button>
                </div>

                {(importStatus || importError) ? (
                  <section className="panel inline-status">
                    <h3>Role Import Status</h3>
                    {importStatus ? <p className="success">{importStatus}</p> : null}
                    {importError ? <p className="error">{importError}</p> : null}
                  </section>
                ) : null}

                <div className="role-admin-list">
                  {roleEdits.map((row, index) => (
                    <details className="role-admin-card" key={`${row.roleName}-${index}`}>
                      <summary className="role-admin-card-head">
                        <div className="role-admin-title-group">
                          <label className="role-admin-field role-admin-field-inline" onClick={(event) => event.preventDefault()}>
                            <span>Role name</span>
                            <input
                              className="role-admin-input"
                              value={row.roleName}
                              onChange={(event) => updateRoleEdit(index, 'roleName', event.target.value)}
                              aria-label={`Role name ${row.roleName}`}
                            />
                          </label>
                        </div>
                        <span className="role-admin-summary-hint">Expand to edit</span>
                      </summary>

                      <div className="role-admin-card-body">
                        <div className="role-admin-card-actions">
                          <button className="secondary" onClick={() => { void saveRoleEdit(index) }} disabled={isUserPreview || (savingRoleIndex === index)}>
                            {savingRoleIndex === index ? 'Saving...' : 'Save role'}
                          </button>
                        </div>

                        <section className="role-admin-section">
                          <div className="role-admin-section-head">
                            <div>
                              <h3>Members</h3>
                              <p className="hint">Add the people who should belong to this role.</p>
                            </div>
                            <button className="secondary" onClick={() => addRoleMember(index)}>Add member</button>
                          </div>

                          <div className="role-member-list">
                            {row.members.length > 0 ? row.members.map((member, memberIndex) => (
                              <div className="role-member-row" key={`${row.roleName}-member-${memberIndex}`}>
                                <label className="role-admin-field">
                                  <span>Email</span>
                                  <input
                                    className="role-admin-input"
                                    value={member.email}
                                    onChange={(event) => updateRoleMember(index, memberIndex, 'email', event.target.value)}
                                    placeholder="person@company.com"
                                  />
                                </label>

                                <label className="role-admin-field">
                                  <span>Name</span>
                                  <input
                                    className="role-admin-input"
                                    value={member.name}
                                    onChange={(event) => updateRoleMember(index, memberIndex, 'name', event.target.value)}
                                    placeholder="Display name"
                                  />
                                </label>

                                <label className="role-admin-field">
                                  <span>ID</span>
                                  <input
                                    className="role-admin-input"
                                    value={member.id}
                                    onChange={(event) => updateRoleMember(index, memberIndex, 'id', event.target.value)}
                                    placeholder="Optional user ID"
                                  />
                                </label>

                                <button className="ghost danger" onClick={() => removeRoleMember(index, memberIndex)}>Remove</button>
                              </div>
                            )) : <p className="hint">No members yet.</p>}
                          </div>
                        </section>

                        <section className="role-admin-section">
                          <div className="role-admin-section-head">
                            <div>
                              <h3>Permissions</h3>
                              <p className="hint">Each form gets its own access row.</p>
                            </div>
                            <button className="secondary" onClick={() => addRolePermission(index)}>Add form</button>
                          </div>

                          <div className="permission-table" role="table" aria-label={`Permissions for ${row.roleName}`}>
                            <div className="permission-table-head" role="row">
                              <span role="columnheader">Form</span>
                              <span role="columnheader">View</span>
                              <span role="columnheader">Search</span>
                              <span role="columnheader">Create</span>
                              <span role="columnheader">Edit</span>
                              <span role="columnheader">Ignore Program</span>
                              <span role="columnheader" />
                            </div>

                            {row.permissions.length > 0 ? row.permissions.map((permission, permissionIndex) => (
                              <div className="permission-table-row" role="row" key={`${row.roleName}-permission-${permissionIndex}`}>
                                <input
                                  className="permission-form-input"
                                  value={permission.formName}
                                  onChange={(event) => updateRolePermission(index, permissionIndex, 'formName', event.target.value)}
                                  placeholder="Form name"
                                />
                                <label className="permission-check"><input type="checkbox" checked={permission.view} onChange={(event) => updateRolePermission(index, permissionIndex, 'view', event.target.checked)} /> <span>View</span></label>
                                <label className="permission-check"><input type="checkbox" checked={permission.search} onChange={(event) => updateRolePermission(index, permissionIndex, 'search', event.target.checked)} /> <span>Search</span></label>
                                <label className="permission-check"><input type="checkbox" checked={permission.create} onChange={(event) => updateRolePermission(index, permissionIndex, 'create', event.target.checked)} /> <span>Create</span></label>
                                <label className="permission-check"><input type="checkbox" checked={permission.edit} onChange={(event) => updateRolePermission(index, permissionIndex, 'edit', event.target.checked)} /> <span>Edit</span></label>
                                <label className="permission-check"><input type="checkbox" checked={permission.ignoreProgramAssignment} onChange={(event) => updateRolePermission(index, permissionIndex, 'ignoreProgramAssignment', event.target.checked)} /> <span>Ignore</span></label>
                                <button className="ghost danger" onClick={() => removeRolePermission(index, permissionIndex)}>Remove</button>
                              </div>
                            )) : <p className="hint">No permission rows yet.</p>}
                          </div>
                        </section>

                      </div>
                    </details>
                  ))}
                </div>
              </>
            ) : null}

            {canAccessRoleAdmin && adminPage === 'funders' ? (
              <section className="funder-admin-panel">
                <h3>Manage Funders</h3>
                <p className="hint">Manage funders, contracts, and transactions.</p>
                {funderAdminLoading ? <p className="hint">Loading funder information...</p> : null}
                {funderAdminError ? <p className="error">{funderAdminError}</p> : null}
                {funderAdminData ? (
                  <div className="funder-admin-tables">
                    <section className="role-admin-section">
                      <div className="role-admin-section-head">
                        <h4><button type="button" className="funder-admin-section-toggle" aria-expanded={funderAdminExpanded.funder} aria-controls="funder-admin-funders" onClick={() => setFunderAdminExpanded((current) => ({ ...current, funder: !current.funder }))}>
                          <span aria-hidden="true">{funderAdminExpanded.funder ? '▾' : '▸'}</span> Funders ({funderAdminData.funders.length})
                        </button></h4>
                        <button type="button" className="secondary" onClick={() => openFunderAdminEditor('funder')} disabled={funderAdminLoading || funderAdminSaving}>Add Funder</button>
                      </div>
                      {funderAdminExpanded.funder ? (
                        <div id="funder-admin-funders" className="hub-search-results-table-wrap"><table className="hub-search-results-table"><thead><tr><th>Action</th><th>Name</th><th>Program</th><th>Start Date</th><th>End Date</th><th>Active</th></tr></thead><tbody>{funderAdminData.funders.map((row) => <tr key={row.id}><td><div className="funder-admin-record-actions"><button type="button" className="secondary" onClick={() => openFunderAdminEditor('funder', row)} disabled={!row.id || funderAdminLoading || funderAdminSaving}>Edit</button>{renderArchiveRecordButton(FUNDERS_TABLE_ALIAS, row.id, row.name)}</div></td><td>{row.name || '-'}</td><td>{row.program || '-'}</td><td>{row.startDate || '-'}</td><td>{row.endDate || '-'}</td><td>{row.active || '-'}</td></tr>)}{!funderAdminData.funders.length ? <tr><td colSpan={6}>No funders found.</td></tr> : null}</tbody></table></div>
                      ) : null}
                    </section>
                    <section className="role-admin-section">
                      <div className="role-admin-section-head">
                        <h4><button type="button" className="funder-admin-section-toggle" aria-expanded={funderAdminExpanded.contract} aria-controls="funder-admin-contracts" onClick={() => setFunderAdminExpanded((current) => ({ ...current, contract: !current.contract }))}>
                          <span aria-hidden="true">{funderAdminExpanded.contract ? '▾' : '▸'}</span> Funder Contracts ({funderAdminData.contracts.length})
                        </button></h4>
                        <button type="button" className="secondary" onClick={() => openFunderAdminEditor('contract')} disabled={funderAdminLoading || funderAdminSaving}>Add Contract</button>
                      </div>
                      {funderAdminExpanded.contract ? (
                        <div id="funder-admin-contracts" className="hub-search-results-table-wrap"><table className="hub-search-results-table"><thead><tr><th>Action</th><th>Contract Name</th><th>Funder</th><th>Start Date</th><th>End Date</th><th>Contract Amount</th><th>Remaining Pool of Money</th><th>Status</th><th>Closed/Suspended Date</th><th>Notes</th></tr></thead><tbody>{funderAdminData.contracts.map((row) => <tr key={row.id}><td><div className="funder-admin-record-actions"><button type="button" className="secondary" onClick={() => openFunderAdminEditor('contract', row)} disabled={!row.id || funderAdminLoading || funderAdminSaving}>Edit</button>{renderArchiveRecordButton(CONTRACTS_TABLE_ALIAS, row.id, row.name || row.funderName || row.funderId)}</div></td><td>{row.name || '-'}</td><td>{row.funderName || row.funderId || '-'}</td><td>{row.startDate || '-'}</td><td>{row.endDate || '-'}</td><td>{row.amount || '-'}</td><td>{row.remainingPool || 'Not initialized'}</td><td>{row.status || '-'}</td><td>{row.closedSuspendedDate || '-'}</td><td>{row.notes || '-'}</td></tr>)}{!funderAdminData.contracts.length ? <tr><td colSpan={10}>No contracts found.</td></tr> : null}</tbody></table></div>
                      ) : null}
                    </section>
                    <section className="role-admin-section">
                      <div className="role-admin-section-head">
                        <h4><button type="button" className="funder-admin-section-toggle" aria-expanded={funderAdminExpanded.transaction} aria-controls="funder-admin-transactions" onClick={() => setFunderAdminExpanded((current) => ({ ...current, transaction: !current.transaction }))}>
                          <span aria-hidden="true">{funderAdminExpanded.transaction ? '▾' : '▸'}</span> Funder Transactions ({funderAdminData.transactions.length})
                        </button></h4>
                        <button type="button" className="secondary" onClick={() => openFunderAdminEditor('transaction')} disabled={funderAdminLoading || funderAdminSaving}>Add Transaction</button>
                      </div>
                      {funderAdminExpanded.transaction ? (
                        <div id="funder-admin-transactions" className="hub-search-results-table-wrap"><table className="hub-search-results-table"><thead><tr><th>Action</th><th>Active Contract</th><th>Date</th><th>Amount</th><th>Transaction Type</th><th>Notes</th></tr></thead><tbody>{funderAdminData.transactions.map((row) => <tr key={row.id}><td><div className="funder-admin-record-actions"><button type="button" className="secondary" onClick={() => openFunderAdminEditor('transaction', row)} disabled={!row.id || funderAdminLoading || funderAdminSaving}>Edit</button>{renderArchiveRecordButton(FUNDER_TRANSACTIONS_TABLE_ALIAS, row.id, row.contractName || row.contractId)}</div></td><td>{row.contractName || row.contractId || '-'}</td><td>{row.date || '-'}</td><td>{row.amount || '-'}</td><td>{row.type || '-'}</td><td>{row.notes || '-'}</td></tr>)}{!funderAdminData.transactions.length ? <tr><td colSpan={6}>No transactions found.</td></tr> : null}</tbody></table></div>
                      ) : null}
                    </section>
                  </div>
                ) : null}
              </section>
            ) : null}

            {canAccessRoleAdmin && adminPage === 'beds' ? (
              <section className="funder-admin-panel">
                <div className="role-admin-section-head">
                  <div>
                    <h3>Bed Management</h3>
                    <p className="hint">Active records from the cmps_bedses table. Import a CSV using the six Dataverse column headers shown below.</p>
                  </div>
                  <div className="role-admin-toolbar">
                    <button className="secondary" type="button" onClick={onClickImportBeds} disabled={importingBeds || bedAdminLoading}>
                      {importingBeds ? 'Importing Beds...' : 'Import CSV'}
                    </button>
                    <input
                      ref={bedsCsvFileRef}
                      className="hidden-input"
                      type="file"
                      accept=".csv,text/csv"
                      onChange={(event) => { void onPickBedsCsv(event) }} disabled={isUserPreview}
                    />
                  </div>
                </div>

                <p className="hint">Required headers: cmps_status, cmps_program, cmps_unit, cmps_unittype, cmps_bedname, cmps_floor.</p>
                {bedAdminStatus ? <p className="success">{bedAdminStatus}</p> : null}
                {bedAdminError ? <p className="error">{bedAdminError}</p> : null}
                {bedAdminLoading ? <p className="hint">Loading bed records...</p> : null}

                {!bedAdminLoading ? (
                  <section className="role-admin-section">
                    <h4>Beds ({bedAdminRecords.length})</h4>
                    {bedAdminRecords.length > 0 ? (
                      <div className="hub-search-results-table-wrap">
                        <table className="hub-search-results-table">
                          <thead>
                            <tr><th>Action</th><th>Bed</th><th>Program</th><th>Unit</th><th>Unit Type</th><th>Floor</th><th>Status</th></tr>
                          </thead>
                          <tbody>
                            {bedAdminRecords.map((bed) => (
                              <tr key={bed.id}>
                                <td>{renderArchiveRecordButton(BEDS_TABLE_ALIAS, bed.id, `Bed ${bed.name}`)}</td>
                                <td>{bed.name || '-'}</td>
                                <td>{bed.program || '-'}</td>
                                <td>{bed.unit || '-'}</td>
                                <td>{bed.unitType || '-'}</td>
                                <td>{bed.floor || '-'}</td>
                                <td>{bed.status || '-'}</td>
                              </tr>
                            ))}
                          </tbody>
                        </table>
                      </div>
                    ) : <p className="hint">No active bed records found.</p>}
                  </section>
                ) : null}
              </section>
            ) : null}

            {false && canAccessRoleAdmin && adminPage === 'form-picklists' ? (
              <>
                <div className="role-admin-toolbar">
                  <button className="secondary" onClick={addFormPicklistEdit}>Add Form Pick List</button>
                </div>

                <div className="role-admin-list">
                  {formPicklistEdits.length === 0 ? <p className="hint">No form pick list rows found yet.</p> : null}

                  {formPicklistEdits.map((row, index) => (
                    <details className="role-admin-card" key={`picklist-${row.formName || 'new'}-${index}`}>
                      <summary className="role-admin-card-head">
                        <div className="role-admin-title-group">
                          <label className="role-admin-field role-admin-field-inline" onClick={(event) => event.preventDefault()}>
                            <span>Form name</span>
                            <input
                              className="role-admin-input"
                              value={row.formName}
                              onChange={(event) => updateFormPicklistEdit(index, 'formName', event.target.value)}
                              aria-label={`Pick list form name ${row.formName || 'new row'}`}
                              placeholder="Client Profile"
                            />
                          </label>
                        </div>
                        <span className="role-admin-summary-hint">Expand to edit</span>
                      </summary>

                      <div className="role-admin-card-body">
                        <div className="role-admin-card-actions">
                          <button className="secondary" onClick={() => { void saveFormPicklistEdit(index) }} disabled={isUserPreview || (savingPicklistIndex === index)}>
                            {savingPicklistIndex === index ? 'Saving...' : 'Save pick list'}
                          </button>
                        </div>

                        <section className="role-admin-section">
                          <div className="role-admin-section-head">
                            <div>
                              <h3>Pick List Fields</h3>
                              <p className="hint">Each row becomes one saved option. Put one option per line.</p>
                            </div>
                            <button className="secondary" onClick={() => addFormPicklistField(index)}>Add field</button>
                          </div>

                          <div className="role-member-list">
                            {row.fields.length > 0 ? row.fields.map((field, fieldIndex) => (
                              <div className="role-admin-card" key={`${row.formName || 'picklist'}-field-${fieldIndex}`}>
                                <div className="role-admin-section-head">
                                  <h3>Field {fieldIndex + 1}</h3>
                                  <button className="ghost danger" onClick={() => removeFormPicklistField(index, fieldIndex)}>Remove</button>
                                </div>

                                <div className="hub-form-grid">
                                  <label className="role-admin-field">
                                    <span>Field label</span>
                                    <input
                                      className="role-admin-input"
                                      value={field.label}
                                      onChange={(event) => updateFormPicklistField(index, fieldIndex, 'label', event.target.value)}
                                      placeholder="Primary Language"
                                    />
                                  </label>

                                  <label className="role-admin-field">
                                    <span>Control type</span>
                                    <select
                                      className="role-admin-input"
                                      value={field.picklistType}
                                      onChange={(event) => updateFormPicklistField(index, fieldIndex, 'picklistType', event.target.value)}
                                    >
                                      <option value="drop down">Drop Down</option>
                                      <option value="radio button">Radio Button</option>
                                      <option value="checkboxes">Checkboxes</option>
                                    </select>
                                  </label>

                                  <label className="permission-check">
                                    <input
                                      type="checkbox"
                                      checked={field.active}
                                      onChange={(event) => updateFormPicklistField(index, fieldIndex, 'active', event.target.checked)}
                                    />
                                    <span>Active</span>
                                  </label>
                                </div>

                                <section className="role-admin-section">
                                  <div className="role-admin-section-head">
                                    <div>
                                      <h3>Options</h3>
                                      <p className="hint">Each option has its own value and active setting. Inactive options will not appear in the form.</p>
                                    </div>
                                    <button className="secondary" onClick={() => addFormPicklistOption(index, fieldIndex)}>Add option</button>
                                  </div>

                                  <div className="picklist-option-list">
                                    {field.options.length > 0 ? field.options.map((option, optionIndex) => (
                                      <div className="picklist-option-row" key={`${row.formName || 'picklist'}-field-${fieldIndex}-option-${optionIndex}`}>
                                        <label className="role-admin-field">
                                          <span>Option value</span>
                                          <input
                                            className="role-admin-input"
                                            value={option.value}
                                            onChange={(event) => updateFormPicklistOption(index, fieldIndex, optionIndex, 'value', event.target.value)}
                                            placeholder="Option label"
                                          />
                                        </label>

                                        <label className="permission-check picklist-option-active">
                                          <input
                                            type="checkbox"
                                            checked={option.active}
                                            onChange={(event) => updateFormPicklistOption(index, fieldIndex, optionIndex, 'active', event.target.checked)}
                                          />
                                          <span>Active</span>
                                        </label>

                                        <button className="ghost danger" onClick={() => removeFormPicklistOption(index, fieldIndex, optionIndex)}>Remove</button>
                                      </div>
                                    )) : <p className="hint">No options yet.</p>}
                                  </div>
                                </section>
                              </div>
                            )) : <p className="hint">No pick list fields yet.</p>}
                          </div>
                        </section>

                      </div>
                    </details>
                  ))}
                </div>
              </>
            ) : null}
          </section>
        </main>
      ) : null}

      {compassFileViewer.loading || compassFileViewer.error || compassFileViewer.file ? (
        <div className="modal-backdrop" role="presentation">
          <section className="panel modal-card compass-file-modal" role="dialog" aria-modal="true" aria-labelledby="compass-file-modal-title">
            <div className="hub-form-editor-head">
              <div>
                <p className="eyebrow">Attached file</p>
                <h2 id="compass-file-modal-title">{compassFileViewer.file?.filename || 'Loading file...'}</h2>
                {compassFileViewer.file ? (
                  <p className="hint">
                    {compassFileViewer.file.mimetype} · {compassFileViewer.file.filesize.toLocaleString()} bytes
                  </p>
                ) : null}
              </div>
              <div className="hub-form-editor-actions">
                {compassFileViewer.file && compassFileViewer.objectUrl ? (
                  <>
                    {compassFileViewer.openObjectUrl ? (
                      <a className="secondary compass-file-download" href={compassFileViewer.openObjectUrl} target="_blank" rel="noreferrer">Open</a>
                    ) : null}
                    <a className="secondary compass-file-download" href={compassFileViewer.objectUrl} download={compassFileViewer.file.filename}>Download</a>
                  </>
                ) : null}
                <button type="button" className="secondary" onClick={closeCompassFileViewer}>Close</button>
              </div>
            </div>

            {compassFileViewer.loading ? <p className="hint">Loading the attached file...</p> : null}
            {compassFileViewer.error ? <p className="error">{compassFileViewer.error}</p> : null}
            {compassFileViewer.file && compassFileViewer.objectUrl ? (
              <p className="hint compass-file-actions-hint">
                {compassFileViewer.openObjectUrl
                  ? 'Use Open to view the image or PDF in a separate browser tab, or Download to save a copy.'
                  : 'Use Download to save a copy of this file.'}
              </p>
            ) : null}
          </section>
        </div>
      ) : null}

      {canAccessRoleAdmin && view === 'admin' && adminPage === 'funders' && funderAdminEditor ? (
        <div className="modal-backdrop" role="presentation">
          <section className="panel modal-card funder-admin-editor" role="dialog" aria-modal="true" aria-labelledby="funder-admin-editor-title" onKeyDown={(event) => {
            if (event.key === 'Escape' && !funderAdminSaving) setFunderAdminEditor(null)
          }}>
            <form onSubmit={(event) => { event.preventDefault(); void saveFunderAdminEditor() }}>
              <div className="hub-form-editor-head">
                <div>
                  <h2 id="funder-admin-editor-title">{funderAdminEditor.rowId ? 'Edit' : 'Add'} {FUNDER_ADMIN_TABLES[funderAdminEditor.kind].label}</h2>
                  <p className="hint">Fields marked * are required.</p>
                </div>
                <button type="button" className="secondary" onClick={() => setFunderAdminEditor(null)} disabled={funderAdminSaving}>Cancel</button>
              </div>
              <div className="hub-form-grid">
                {FUNDER_ADMIN_TABLES[funderAdminEditor.kind].fields.map((field, index) => {
                  const fieldId = `funder-admin-editor-${field.field}`
                  const value = funderAdminEditor.values[field.field] || ''
                  const update = (nextValue: string) => setFunderAdminEditor((current) => current ? { ...current, values: { ...current.values, [field.field]: nextValue } } : current)
                  const lookupOptions = field.field === 'cmps_funder'
                    ? (funderAdminData?.funders || []).map((row) => ({ value: row.id, label: row.name || row.id }))
                    : (funderAdminData?.contracts || []).map((row) => ({ value: row.id, label: row.name || row.funderName || row.id }))
                  const options = field.input === 'lookup'
                    ? lookupOptions.filter((option) => !!option.value)
                    : field.options.map((option) => ({ value: option, label: option }))
                  const label = `${field.label}${field.required ? ' *' : ''}`
                  if (field.input === 'radio') {
                    return <div key={field.field} className="hub-form-field"><span>{label}</span><div className="hub-form-option-grid" role="radiogroup" aria-label={field.label}>
                      {options.map((option) => <label className="permission-check" key={option.value}><input type="radio" name={fieldId} value={option.value} checked={value === option.value} onChange={() => update(option.value)} required={field.required} disabled={funderAdminSaving} /><span>{option.label}</span></label>)}
                    </div></div>
                  }
                  return <label key={field.field} className={`hub-form-field${field.input === 'textarea' ? ' hub-form-field-wide' : ''}`} htmlFor={fieldId}>
                    <span>{label}</span>
                    {field.input === 'lookup' || field.input === 'select' ? (
                      <select id={fieldId} value={value} onChange={(event) => update(event.target.value)} required={field.required} disabled={funderAdminSaving} autoFocus={index === 0}>
                        <option value="">--Please Select--</option>
                        {value && !options.some((option) => option.value === value) ? <option value={value}>Current selection ({value})</option> : null}
                        {options.map((option) => <option key={option.value} value={option.value}>{option.label}</option>)}
                      </select>
                    ) : field.input === 'textarea' ? (
                      <textarea id={fieldId} value={value} onChange={(event) => update(event.target.value)} required={field.required} disabled={funderAdminSaving} />
                    ) : (
                      <FormInput id={fieldId} type={field.input === 'currency' ? 'number' : field.input === 'date' ? 'date' : 'text'} step={field.input === 'currency' ? '0.01' : undefined} min={field.input === 'currency' && funderAdminEditor.kind === 'contract' ? 0 : undefined} value={value} onChange={(event) => update(event.target.value)} required={field.required} disabled={funderAdminSaving} autoFocus={index === 0} />
                    )}
                  </label>
                })}
                {funderAdminEditor.kind === 'contract' ? (
                  <label className="hub-form-field">
                    <span>Remaining Pool of Money (calculated)</span>
                    <input readOnly value={funderAdminEditor.rowId ? funderAdminEditor.values.cmps_remainingpoolofmoney || 'Calculated on Save' : funderAdminEditor.values.cmps_contractamount || ''} />
                    <span className="hint">Contract amount minus all linked transactions. Updated when you save.</span>
                  </label>
                ) : null}
              </div>
              <RecordSystemFields tableAlias={FUNDER_ADMIN_TABLES[funderAdminEditor.kind].tableAlias} rowId={funderAdminEditor.rowId} />
              {funderAdminEditorError ? <p className="error" role="alert">{funderAdminEditorError}</p> : null}
              <div className="funder-admin-editor-actions">
                <button type="button" className="secondary" onClick={() => setFunderAdminEditor(null)} disabled={funderAdminSaving}>Cancel</button>
                <button type="submit" className="primary" disabled={funderAdminSaving}>{funderAdminSaving ? 'Saving...' : 'Save'}</button>
              </div>
            </form>
          </section>
        </div>
      ) : null}

      {recordPrint?.scope === recordPrintScope ? <RecordPrintDialog key={recordPrintScope + recordPrint.mode}
        includeProfile={recordPrint.mode === 'client'}
        clientLabel={selectedDetailRecord ? [selectedDetailRecord.recordId, getClientProfileDisplayName(selectedDetailRecord.values)].filter(Boolean).join(' - ') : viewedPrintRecord?.ref.formName || 'COMPASS record'}
        onClose={() => setRecordPrint(null)}
        loadCatalog={async () => {
          if (recordPrint.mode === 'client') {
            if (!selectedDetailRecord) throw new Error('Open a Client Profile first.')
            return listClientPrintCatalog(selectedDetailRecord.id, selectedDetailRecord.recordId, (name) => canAccessClientFormAction(name, 'view'))
          }
          const record = recordPrint.record
          if (!record || !canAccessClientFormAction(record.ref.formName, 'view')) throw new Error('This record is not available to print.')
          return { clientId: selectedDetailRecord?.id || '', enrollmentIds: [], groups: [{ kind: record.ref.kind, formName: record.ref.formName, records: [record.ref] }] }
        }}
        loadRecord={async (ref, catalog) => {
          if (!canAccessClientFormAction(ref.formName, 'view')) throw new Error('View permission is required to print this form.')
          const detail = recordPrint.mode === 'record' && recordPrint.record?.ref.key === ref.key ? recordPrint.record.detail
            : await loadClientPrintRecord(ref, catalog, (name) => canAccessClientFormAction(name, 'view'))
          return renderPrintableRecord(ref.kind, detail)
        }}
      /> : null}

      {referenceTableModalSrc ? (
        <div className="modal-backdrop reference-table-backdrop" role="presentation">
          <section className="panel modal-card reference-table-modal" role="dialog" aria-modal="true" aria-labelledby="reference-table-modal-title">
            <div className="hub-form-editor-head">
              <div>
                <p className="eyebrow">Program Enrollment reference</p>
                <h2 id="reference-table-modal-title">{referenceTableModalSrc.toLowerCase().includes('header1') ? 'Dollars Per Year' : 'Dollars Per Month'}</h2>
              </div>
              <button type="button" className="secondary" onClick={() => setReferenceTableModalSrc('')}>Close</button>
            </div>
            <img
              className="reference-table-image"
              src={encodeURI(`${import.meta.env.BASE_URL}form-headers/${referenceTableModalSrc}`)}
              alt={referenceTableModalSrc.toLowerCase().includes('header1') ? 'Dollars per year reference table' : 'Dollars per month reference table'}
            />
          </section>
        </div>
      ) : null}

      {!recordFormView && householdView?.clientId === selectedDetailRecord?.id && householdView && canAccessClientFormAction('Household', 'view') ? <ReadOnlyRecordDialog title={householdView.detail ? `Household | ${householdView.detail.recordId || householdView.detail.id}` : 'Household'} onClose={() => { clientConsentRequest.current += 1; setHouseholdView(null) }}>
        {householdView.detail ? <div className="hub-form-editor-actions"><button type="button" className="secondary" onClick={closeViewedRecordActions}>Back to Client Profile</button>{canAccessClientFormAction('Household', 'edit') ? <button type="button" className="secondary" onClick={editViewedRecord}>Edit</button> : null}<button type="button" className="primary" onClick={openRecordPrint}>Print record</button></div> : null}
        {householdView.loading ? <p className="hint">Loading Household...</p> : null}
        {householdView.error ? <p className="error" role="alert">{householdView.error}</p> : null}
        {householdView.detail ? <ReadOnlyFormSections fields={HOUSEHOLD_FIELD_DEFINITIONS} values={householdView.detail.values} sections={['Main']} idPrefix="household-record-view" /> : null}
        {householdView.detail ? <><h3>Active Household Members</h3><div className="hub-search-results-table-wrap"><table className="hub-search-results-table"><thead><tr><th>Client</th><th>Relationship to Head of Household</th><th>Status</th></tr></thead><tbody>{householdView.members.map((member) => <tr key={member.id}><td>{member.clientName || member.clientRecordId || 'Client Profile'}</td><td>{member.relationshipToHohOther || member.relationshipToHoh || '-'}</td><td>{member.status}</td></tr>)}</tbody></table></div></> : null}
      </ReadOnlyRecordDialog> : null}

      {clientSearchModalPurpose ? (
        <div className="modal-backdrop" role="presentation">
          <section className="panel modal-card" role="dialog" aria-modal="true" aria-labelledby="client-search-modal-title">
            <div className="hub-form-editor-head">
              <div>
                <p className="eyebrow">{clientSearchModalPurpose === 'helpline' ? 'Helpline intake' : 'Client intake'}</p>
                <h2 id="client-search-modal-title">Find Client Profile</h2>
                <p className="hint">
                  {clientSearchModalPurpose === 'helpline'
                    ? 'Search for and select an existing client to link this Helpline record. If no client is found, you can create a new Client Profile.'
                    : 'Search for an existing client before creating a new Client Profile.'}
                </p>
              </div>
              <button type="button" className="secondary" onClick={() => setClientSearchModalPurpose(null)}>Cancel</button>
            </div>

            <div className="hub-search-controls modal-search-controls">
              <label className="hub-form-field">
                <span>Search Client Profiles</span>
                <input
                  type="search"
                  value={helplineClientSearch}
                  onChange={(event) => {
                    setHelplineClientSearch(event.target.value)
                    setHelplineClientResults([])
                    setHelplineClientSearchError('')
                    setHelplineClientSearchCompleted(false)
                  }}
                  onKeyDown={(event) => { if (event.key === 'Enter') void searchClientsForHelpline() }}
                  placeholder="Name, HMIS ID, or Record ID"
                  autoFocus
                />
              </label>
              <button type="button" className="primary" onClick={() => { void searchClientsForHelpline() }} disabled={helplineClientSearchLoading}>
                {helplineClientSearchLoading ? 'Searching...' : 'Search'}
              </button>
            </div>

            {helplineClientSearchError ? <p className="error">{helplineClientSearchError}</p> : null}
            {helplineClientResults.length > 0 ? (
              <div className="hub-search-results-table-wrap modal-results">
                <table className="hub-search-results-table">
                  <thead>
                    <tr><th>Open</th><th>Name</th><th>Record ID</th><th>HMIS ID</th><th>Date of Birth</th></tr>
                  </thead>
                  <tbody>
                    {helplineClientResults.map((client) => (
                      <tr key={client.id || client.recordId}>
                        <td><button type="button" className="secondary hub-search-open-button" onClick={() => { void selectClientFromSearchModal(client) }}>{clientSearchModalPurpose === 'helpline' ? 'Use Client' : 'Open Profile'}</button></td>
                        <td>{client.name || '-'}</td>
                        <td>{client.recordId || '-'}</td>
                        <td>{client.hmisId || '-'}</td>
                        <td>{client.dateOfBirth || '-'}</td>
                      </tr>
                    ))}
                  </tbody>
                </table>
              </div>
            ) : null}

            {helplineClientSearchCompleted ? (
              <div className="modal-create-client">
                <span>Client Profile not found in these results?</span>
                {canCreateForm("Client Profile") ? (<button type="button" className="secondary" onClick={startNewClientAfterSearch}>Create New Client Profile</button>) : null}
              </div>
            ) : !helplineClientSearchCompleted ? (
              <p className="hint">Complete a client search to enable new profile creation.</p>
            ) : null}
          </section>
        </div>
      ) : null}
    </div>
  )
}

function App() {
  return <UserPreviewRoot>{({ session, initialAdminPage, onStart, busy }) => (
    <AppWorkspace previewSession={session} onStartPreview={onStart} previewBusy={busy} initialPreviewAdminPage={initialAdminPage} />
  )}</UserPreviewRoot>
}

export default App
