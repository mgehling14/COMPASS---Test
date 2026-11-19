import { getClient } from '@microsoft/power-apps/data'
import { dataSourcesInfo } from '../../.power/schemas/appschemas/dataSourcesInfo'
import { ensureAuthToken, getAuthToken } from './auth'

export const ACKNOWLEDGEMENT_AND_CONSENT_TABLE_ALIAS = 'cmps_acknowledgementandconsentforms'
export const ACKNOWLEDGEMENT_AND_CONSENT_PRIMARY_ID_FIELD = 'cmps_acknowledgementandconsentformid'
const PROGRAM_ENROLLMENT_ENTITY_SET_NAME = 'cmps_programenrollment1s'
const CLIENT_PROFILE_ENTITY_SET_NAME = 'cmps_clientprofiles'
const DEFAULT_DATAVERSE_ORG_URL = 'https://org1f466e4e.crm.dynamics.com'
const OPTION_SET_BASE_VALUE = 125570000
const runtimeDataClient = getClient(dataSourcesInfo as any)

export type AcknowledgementAndConsentField = {
  field: string
  label: string
  input: 'lookup' | 'date' | 'datetime' | 'radio' | 'text' | 'textarea' | 'html'
  options: string[]
  section: 'Main' | 'Acknowledgments' | 'Internal Use Only'
  required?: boolean
}

const YES_NO = ['Yes', 'No']
const RECEIVED_COPY_OPTIONS = ['Yes, I have received a copy.', 'No, I have not received a copy.']

export const ACKNOWLEDGEMENT_AND_CONSENT_FIELDS: AcknowledgementAndConsentField[] = [
  { field: 'cmps_cpid', label: 'Client Profile', input: 'lookup', options: [], section: 'Main' },
  { field: 'cmps_peid', label: 'Program Enrollment', input: 'lookup', options: [], section: 'Main', required: true },
  { field: 'cmps_acknowledgementcompletiondate', label: 'Acknowledgement Completion Date', input: 'date', options: [], section: 'Main', required: true },
  { field: 'cmps_doestheresidentrefusetosign', label: 'Does the Resident Refuse to Sign?', input: 'radio', options: YES_NO, section: 'Main' },
  { field: 'ack-intro', label: "This form is to confirm you've received important documents you might need to look at later. Please review each item and answer \"Yes\" to confirm you have a copy. Copies of each document are provided in the Welcome Packet, received at the start of service.", input: 'html', options: [], section: 'Acknowledgments' },
  { field: 'ack-client-rights-header', label: 'CLIENT RIGHTS    This document explains your rights as a client and what you can expect from our services.', input: 'html', options: [], section: 'Acknowledgments' },
  { field: 'cmps_haveyoureceivedacopyoftheclientrights', label: 'Have You Received a Copy of the Client Rights?', input: 'radio', options: RECEIVED_COPY_OPTIONS, section: 'Acknowledgments' },
  { field: 'ack-privacy-notice-header', label: 'PRIVACY NOTICE    This notice explains how we protect your private information.', input: 'html', options: [], section: 'Acknowledgments' },
  { field: 'cmps_haveyoureceivedacopyoftheprivacynotice', label: 'Have You Received a Copy of the Privacy Notice?', input: 'radio', options: RECEIVED_COPY_OPTIONS, section: 'Acknowledgments' },
  { field: 'ack-grievance-header', label: 'GRIEVANCE PROCEDURE    This document tells you how to file a complaint if you ever have a concern.', input: 'html', options: [], section: 'Acknowledgments' },
  { field: 'cmps_haveyoureceivedacopyofthegrievanceprocedure', label: 'Have You Received a Copy of the Grievance Procedure?', input: 'radio', options: RECEIVED_COPY_OPTIONS, section: 'Acknowledgments' },
  { field: 'ack-important-numbers-header', label: 'AGENCY-DEFINED IMPORTANT NUMBERS    This is a list of important phone numbers for our agency and other helpful resources.', input: 'html', options: [], section: 'Acknowledgments' },
  { field: 'cmps_haveyoureceivedacopyoftheagencydefinedimporta', label: 'Have You Received a Copy of the Agency-Defined Important Numbers?', input: 'radio', options: RECEIVED_COPY_OPTIONS, section: 'Acknowledgments' },
  { field: 'ack-arizona-rights-header', label: "ARIZONA VICTIMS' BILL OF RIGHTS    This outlines the rights you have as a victim in Arizona.", input: 'html', options: [], section: 'Acknowledgments' },
  { field: 'cmps_haveyoureceivedacopyofthearizonavictimsbillof', label: "Have You Received a Copy of the Arizona Victims' Bill of Rights?", input: 'radio', options: RECEIVED_COPY_OPTIONS, section: 'Acknowledgments' },
  { field: 'ack-compensation-header', label: 'VICTIM COMPENSATION PROGRAM INFORMATION    This document provides information about financial assistance that may be available to you.', input: 'html', options: [], section: 'Acknowledgments' },
  { field: 'cmps_haveyoureceivedacopyaboutthecountysvictimcomp', label: 'Have You Received a Copy of the Victim Compensation Program Information?', input: 'radio', options: RECEIVED_COPY_OPTIONS, section: 'Acknowledgments' },
  { field: 'ack-demographic-header', label: 'CONSENT TO SHARE DEMOGRAPHIC INFORMATION    To help us secure funding and continue our services, we share general information about the people we serve (such as age, gender, race and ethnicity) with our grant partners. This information is always anonymous and will never include your name or any other personal details.', input: 'html', options: [], section: 'Acknowledgments' },
  { field: 'cmps_doyouagreetoallowustoincludeyouanonymousdemog', label: 'Do You Agree to Allow Us to Include Your Anonymous Demographic Information?', input: 'radio', options: ['Yes, I agree.', 'No, I do not agree.'], section: 'Acknowledgments' },
  { field: 'ack-monitoring-header', label: 'INFORM OF SITE MONITORING    Video cameras and other monitoring equipment, such as ring doorbells, electronic gates, two-way intercom systems, etc. are used as a safety tool in order to identify unknown guests and to monitor program properties. Cameras are installed in common areas of the programs and not in any private spaces. Video footage is only reviewed by A New Leaf staff based on a safety need for guests, staff, and/or program. Access to data is only available through agency approved computers that are password protected.', input: 'html', options: [], section: 'Acknowledgments' },
  { field: 'cmps_haveyoubeeninformedoftheuseofvideocamerasando', label: 'Have You Been Informed of the Use of Video Cameras and Other Monitoring Equipment?', input: 'radio', options: ['Yes, I have been informed.', 'No, I have not been informed.'], section: 'Acknowledgments' },
  { field: 'ack-signature-header', label: 'E-SIGNATURE    By typing your full name below and signing, you are providing your electronic signature. This serves as your official consent and is the legal equivalent of a handwritten signature.', input: 'html', options: [], section: 'Acknowledgments' },
  { field: 'cmps_residentnameandsignature', label: 'Resident Name and Signature', input: 'text', options: [], section: 'Acknowledgments' },
  { field: 'cmps_staffnameandsignature', label: 'Staff Name and Signature', input: 'text', options: [], section: 'Acknowledgments' },
  { field: 'cmps_werecopiesofallformsprovidedtotheclient', label: 'Were Copies of All Forms Provided to the Client?', input: 'radio', options: YES_NO, section: 'Internal Use Only' },
  { field: 'cmps_dateandtimepresented', label: 'Date and Time Presented', input: 'datetime', options: [], section: 'Internal Use Only' },
  { field: 'cmps_presentedby', label: 'Presented By', input: 'text', options: [], section: 'Internal Use Only' },
  { field: 'cmps_reasonforrefusal', label: 'Reason for Refusal', input: 'textarea', options: [], section: 'Internal Use Only' },
]

export type AcknowledgementAndConsentPayload = Partial<Record<string, string>>

function orgUrl(): string { return String(import.meta.env.VITE_DATAVERSE_ORG_URL || DEFAULT_DATAVERSE_ORG_URL).trim().replace(/\/$/, '') }
function local(): boolean { return typeof window !== 'undefined' && ['localhost', '127.0.0.1'].includes(window.location.hostname) }
function normalizeGuid(value: string): string { return String(value || '').trim().replace(/[{}]/g, '') }

function normalizePayload(seed: AcknowledgementAndConsentPayload): Record<string, unknown> {
  const payload: Record<string, unknown> = { ...seed }
  const clientId = normalizeGuid(String(payload.cmps_cpid || ''))
  delete payload.cmps_cpid
  if (clientId) payload['cmps_cpid@odata.bind'] = `/${CLIENT_PROFILE_ENTITY_SET_NAME}(${clientId})`
  const peid = String(payload.cmps_peid || '').trim().replace(/[{}]/g, '')
  if (peid) {
    delete payload.cmps_peid
    payload['cmps_peid@odata.bind'] = `/${PROGRAM_ENROLLMENT_ENTITY_SET_NAME}(${peid})`
  }

  ACKNOWLEDGEMENT_AND_CONSENT_FIELDS.filter((field) => field.input === 'radio').forEach((field) => {
    const value = String(payload[field.field] || '').trim()
    if (!value) {
      delete payload[field.field]
      return
    }
    const index = field.options.findIndex((option) => option.toLowerCase() === value.toLowerCase())
    if (index < 0) throw new Error(`Invalid choice for ${field.label}.`)
    payload[field.field] = OPTION_SET_BASE_VALUE + index
  })

  for (const [field, value] of Object.entries(payload)) {
    if (typeof value === 'string' && !value.trim()) delete payload[field]
  }
  return payload
}

export function generateAcknowledgementAndConsentRecordId(): string {
  return `ACC-${new Date().toISOString().replace(/[-:T]/g, '').slice(0, 15)}`
}

export async function createAcknowledgementAndConsentResponse(seed: AcknowledgementAndConsentPayload): Promise<{ id: string }> {
  const payload = normalizePayload(seed)
  if (local()) {
    const token = await ensureAuthToken()
    if (!token) throw new Error('Missing Dataverse connection info for Acknowledgement and Consent create.')
    const response = await fetch(`${orgUrl()}/api/data/v9.2/${ACKNOWLEDGEMENT_AND_CONSENT_TABLE_ALIAS}`, { method: 'POST', credentials: 'include', headers: { Accept: 'application/json', 'Content-Type': 'application/json', 'OData-Version': '4.0', 'OData-MaxVersion': '4.0', Authorization: `Bearer ${token}`, Prefer: 'return=representation' }, body: JSON.stringify(payload) })
    if (!response.ok) throw new Error(await response.text())
    const body = await response.json().catch(() => ({}))
    return { id: normalizeGuid(String(body?.[ACKNOWLEDGEMENT_AND_CONSENT_PRIMARY_ID_FIELD] || body?.id || '')) }
  }

  const token = getAuthToken()
  const result = await runtimeDataClient.executeAsync<any, any>({ connectorOperation: { tableName: 'commondataserviceforapps', operationName: 'CreateRecordWithOrganization', parameters: { organization: orgUrl(), entityName: ACKNOWLEDGEMENT_AND_CONSENT_TABLE_ALIAS, item: payload, prefer: 'return=representation', accept: 'application/json', ...(token ? { token } : {}) } } } as any)
  if (!result?.success) throw new Error(String(result?.error?.message || result?.error || 'Acknowledgement and Consent create failed.'))
  return { id: normalizeGuid(String(result?.data?.[ACKNOWLEDGEMENT_AND_CONSENT_PRIMARY_ID_FIELD] || result?.data?.id || '')) }
}

export async function updateAcknowledgementAndConsentResponse(rowId: string, values: AcknowledgementAndConsentPayload): Promise<void> {
  const cleanId = normalizeGuid(rowId)
  if (!cleanId) throw new Error('Missing Acknowledgement and Consent row id for update.')
  const payload = normalizePayload(values)
  // PATCH must explicitly clear dates; omitting a blank date preserves its old value.
  for (const field of ACKNOWLEDGEMENT_AND_CONSENT_FIELDS) {
    const value = (values as Record<string, unknown>)[field.field]
    if (['date', 'datetime'].includes(field.input) && Object.prototype.hasOwnProperty.call(values, field.field)
      && (value === null || (typeof value === 'string' && !value.trim()))) (payload as Record<string, unknown>)[field.field] = null
  }

  if (local()) {
    const token = await ensureAuthToken()
    if (!token) throw new Error('Missing Dataverse connection info for Acknowledgement and Consent update.')
    const response = await fetch(`${orgUrl()}/api/data/v9.2/${ACKNOWLEDGEMENT_AND_CONSENT_TABLE_ALIAS}(${cleanId})`, { method: 'PATCH', credentials: 'include', headers: { Accept: 'application/json', 'Content-Type': 'application/json', 'OData-Version': '4.0', 'OData-MaxVersion': '4.0', Authorization: `Bearer ${token}` }, body: JSON.stringify(payload) })
    if (!response.ok) throw new Error(await response.text())
    return
  }

  const token = getAuthToken()
  const result = await runtimeDataClient.executeAsync<any, any>({ connectorOperation: { tableName: 'commondataserviceforapps', operationName: 'UpdateRecordWithOrganization', parameters: { organization: orgUrl(), entityName: ACKNOWLEDGEMENT_AND_CONSENT_TABLE_ALIAS, recordId: cleanId, item: payload, prefer: 'return=minimal', accept: 'application/json', ...(token ? { token } : {}) } } } as any)
  if (!result?.success) throw new Error(String(result?.error?.message || result?.error || 'Acknowledgement and Consent update failed.'))
}
