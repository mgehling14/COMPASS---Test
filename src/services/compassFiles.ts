import { getClient } from '@microsoft/power-apps/data'
import { dataSourcesInfo } from '../../.power/schemas/appschemas/dataSourcesInfo'
import { ensureAuthToken, getAuthToken } from './auth'

export const COMPASS_FILES_TABLE_ALIAS = 'cmps_compassfileses'
export const COMPASS_FILES_PRIMARY_ID_FIELD = 'cmps_compassfilesid'
export const COMPASS_FILES_PAYLOAD_FIELD = 'cmps_filepayload1'
export const COMPASS_FILES_MAX_SIZE_KB = 131072
export const COMPASS_FILES_MAX_SIZE_BYTES = COMPASS_FILES_MAX_SIZE_KB * 1024
const DATAVERSE_FILE_DOWNLOAD_CHUNK_BYTES = 4 * 1024 * 1024
const CLIENT_PROFILE_ENTITY_SET_NAME = 'cmps_clientprofiles'
const DEFAULT_DATAVERSE_ORG_URL = 'https://org1f466e4e.crm.dynamics.com'

// The generated connector metadata currently drops `format: binary` from the
// upload body definition. Restore it before constructing the client so the SDK
// decodes our base64 string into bytes instead of JSON-stringifying it.
const fileUploadApi = (dataSourcesInfo as any)?.commondataserviceforapps?.apis?.UpdateEntityFileImageFieldContentWithOrganization
const fileUploadBodyParameter = fileUploadApi?.parameters?.find((parameter: any) => parameter?.name === 'item' && parameter?.in === 'body')
if (fileUploadBodyParameter) {
  fileUploadBodyParameter.type = 'string'
  fileUploadBodyParameter.format = 'binary'
}
const runtimeDataClient = getClient(dataSourcesInfo as any)

export type CompassFileCreateInput = {
  file: File
  recordId: string
  relatedRecordId: string
  clientProfileRowId?: string
  savedBy?: string
}

export type CompassFileRecord = {
  id: string
  recordId: string
  filename: string
  filesize: number
  mimetype: string
}

export type CompassFileDownload = CompassFileRecord & {
  relatedRecordId: string
  blob: Blob
}

function sanitizeOrgUrl(value: unknown): string {
  const raw = String(value || '').trim().replace(/\/$/, '')
  const lowered = raw.toLowerCase()
  return !raw || lowered === 'null' || lowered === 'undefined' ? '' : raw
}

function getOrgUrl(): string {
  return sanitizeOrgUrl(import.meta.env.VITE_DATAVERSE_ORG_URL) || DEFAULT_DATAVERSE_ORG_URL
}

function isLocalHost(): boolean {
  if (typeof window === 'undefined') return false
  return window.location.hostname === 'localhost' || window.location.hostname === '127.0.0.1'
}

function normalizeGuid(value: unknown): string {
  return String(value || '').trim().replace(/[{}]/g, '')
}

function isGuid(value: unknown): boolean {
  return /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i.test(normalizeGuid(value))
}

function escapeODataString(value: string): string {
  return String(value || '').replace(/'/g, "''")
}

function parseConnectorErrorMessage(error: unknown): string {
  if (typeof error === 'string') return error
  const nested = (error as any)?.innerError?.message || (error as any)?.message
  return nested ? String(nested) : 'Connector operation failed.'
}

async function fileToBase64(file: File): Promise<string> {
  const bytes = new Uint8Array(await file.arrayBuffer())
  const chunks: string[] = []
  const chunkSize = 0x8000
  for (let offset = 0; offset < bytes.length; offset += chunkSize) {
    chunks.push(String.fromCharCode(...bytes.subarray(offset, offset + chunkSize)))
  }
  return window.btoa(chunks.join(''))
}

function base64TextToBytes(payload: string, expectedByteLength = 0): Uint8Array | null {
  let candidate = String(payload || '').trim()
  if (!candidate) return null

  if (candidate.startsWith('{')) {
    try {
      const parsed = JSON.parse(candidate)
      const nested = parsed?.$content ?? parsed?.contentBytes ?? parsed?.fileContent ?? parsed?.value ?? parsed?.body
      return typeof nested === 'string' ? base64TextToBytes(nested, expectedByteLength) : null
    } catch {
      return null
    }
  }

  let explicitlyEncoded = false
  if (candidate.startsWith('"')) {
    try {
      const parsed = JSON.parse(candidate)
      if (typeof parsed !== 'string') return null
      candidate = parsed.trim()
      explicitlyEncoded = true
    } catch {
      return null
    }
  }

  const dataUrlMatch = candidate.match(/^data:[^;]+;base64,(.*)$/is)
  if (dataUrlMatch) {
    candidate = dataUrlMatch[1]
    explicitlyEncoded = true
  }
  candidate = candidate.replace(/\s+/g, '')
  if (!candidate || candidate.length % 4 !== 0 || !/^[A-Za-z0-9+/]*={0,2}$/.test(candidate)) return null

  try {
    const decoded = window.atob(candidate)
    if (!explicitlyEncoded && expectedByteLength > 0 && Math.abs(decoded.length - expectedByteLength) > 2) return null
    const bytes = new Uint8Array(decoded.length)
    for (let index = 0; index < decoded.length; index += 1) bytes[index] = decoded.charCodeAt(index)
    return bytes
  } catch {
    return null
  }
}

function copyBytesToArrayBuffer(bytes: Uint8Array): ArrayBuffer {
  const buffer = new ArrayBuffer(bytes.byteLength)
  new Uint8Array(buffer).set(bytes)
  return buffer
}

function binaryBytesToBlob(bytes: Uint8Array, mimetype: string, expectedByteLength = 0): Blob {
  const firstNonWhitespace = bytes.findIndex((byte) => ![9, 10, 13, 32].includes(byte))
  const beginsLikeEncodedText = firstNonWhitespace >= 0 && [34, 123, 91].includes(bytes[firstNonWhitespace])
  const possibleBase64Length = expectedByteLength > 0 && bytes.length > expectedByteLength
    && Math.abs(bytes.length - Math.ceil(expectedByteLength / 3) * 4) <= 8
  if (beginsLikeEncodedText || possibleBase64Length) {
    const decoded = base64TextToBytes(new TextDecoder().decode(bytes), expectedByteLength)
    if (decoded) return new Blob([copyBytesToArrayBuffer(decoded)], { type: mimetype })
  }
  return new Blob([copyBytesToArrayBuffer(bytes)], { type: mimetype })
}

function connectorBinaryToBlob(payload: unknown, mimetype: string, expectedByteLength = 0): Blob {
  if (payload instanceof Blob) return payload.type === mimetype ? payload : payload.slice(0, payload.size, mimetype)
  if (payload instanceof ArrayBuffer) return binaryBytesToBlob(new Uint8Array(payload), mimetype, expectedByteLength)
  if (ArrayBuffer.isView(payload)) {
    const bytes = Uint8Array.from(new Uint8Array(payload.buffer, payload.byteOffset, payload.byteLength))
    return binaryBytesToBlob(bytes, mimetype, expectedByteLength)
  }
  if (typeof payload === 'string' && payload.trim()) {
    const bytes = base64TextToBytes(payload, expectedByteLength)
    if (bytes) return new Blob([copyBytesToArrayBuffer(bytes)], { type: mimetype })
  }
  if (payload && typeof payload === 'object') {
    const nested = (payload as any)?.$content
      ?? (payload as any)?.contentBytes
      ?? (payload as any)?.fileContent
      ?? (payload as any)?.value
      ?? (payload as any)?.body
      ?? (payload as any)?.data
    if (nested !== undefined && nested !== payload) return connectorBinaryToBlob(nested, mimetype, expectedByteLength)
  }
  throw new Error('Dataverse returned the file without readable binary content.')
}

function rowsFromPayload(payload: any): Array<Record<string, unknown>> {
  if (Array.isArray(payload)) return payload
  if (Array.isArray(payload?.value)) return payload.value
  return []
}

function extractCreatedRowId(data: any): string {
  const direct = normalizeGuid(data?.[COMPASS_FILES_PRIMARY_ID_FIELD] || data?.id || data?.recordId)
  if (isGuid(direct)) return direct
  const nested = normalizeGuid(data?.value?.[COMPASS_FILES_PRIMARY_ID_FIELD] || data?.value?.id)
  return isGuid(nested) ? nested : ''
}

async function resolveCompassFileRowId(recordId: string): Promise<string> {
  const orgUrl = getOrgUrl()
  const token = getAuthToken()
  const filter = `cmps_recordid eq '${escapeODataString(recordId)}'`

  if (!isLocalHost()) {
    const result = await runtimeDataClient.executeAsync<any, any>({
      connectorOperation: {
        tableName: 'commondataserviceforapps',
        operationName: 'ListRecordsWithOrganization',
        parameters: {
          organization: orgUrl,
          entityName: COMPASS_FILES_TABLE_ALIAS,
          '$select': COMPASS_FILES_PRIMARY_ID_FIELD,
          '$filter': filter,
          '$top': 1,
          ...(token ? { token } : {}),
        },
      },
    } as any)
    if (result?.success) {
      const row = rowsFromPayload(result.data)[0]
      const id = normalizeGuid(row?.[COMPASS_FILES_PRIMARY_ID_FIELD] || row?.id)
      if (isGuid(id)) return id
    }
  }

  const localToken = await ensureAuthToken()
  if (!orgUrl || !localToken) return ''
  const params = new URLSearchParams({
    '$select': COMPASS_FILES_PRIMARY_ID_FIELD,
    '$filter': filter,
    '$top': '1',
  })
  const response = await fetch(`${orgUrl}/api/data/v9.2/${COMPASS_FILES_TABLE_ALIAS}?${params.toString()}`, {
    method: 'GET',
    credentials: 'include',
    headers: {
      Accept: 'application/json',
      'OData-Version': '4.0',
      'OData-MaxVersion': '4.0',
      Authorization: `Bearer ${localToken}`,
    },
  })
  if (!response.ok) return ''
  const row = rowsFromPayload(await response.json().catch(() => ({})))[0]
  const id = normalizeGuid(row?.[COMPASS_FILES_PRIMARY_ID_FIELD] || row?.id)
  return isGuid(id) ? id : ''
}

async function createCompassFileMetadata(input: CompassFileCreateInput): Promise<string> {
  const orgUrl = getOrgUrl()
  const token = getAuthToken()
  const clientId = normalizeGuid(input.clientProfileRowId)
  const payload: Record<string, unknown> = {
    cmps_filename: input.file.name,
    cmps_filesize: input.file.size,
    cmps_mimetype: input.file.type || 'application/octet-stream',
    cmps_recordid: input.recordId,
    cmps_relatedrecordid: input.relatedRecordId,
    ...(input.savedBy ? { cmps_createdby: input.savedBy, cmps_modifiedby: input.savedBy } : {}),
  }
  if (isGuid(clientId)) payload['cmps_cpid@odata.bind'] = `/${CLIENT_PROFILE_ENTITY_SET_NAME}(${clientId})`

  if (!isLocalHost()) {
    const result = await runtimeDataClient.executeAsync<any, any>({
      connectorOperation: {
        tableName: 'commondataserviceforapps',
        operationName: 'CreateRecordWithOrganization',
        parameters: { prefer: 'return=representation', accept: 'application/json', 
          organization: orgUrl,
          entityName: COMPASS_FILES_TABLE_ALIAS,
          item: payload,
          ...(token ? { token } : {}),
        },
      },
    } as any)
    if (!result?.success) throw new Error(parseConnectorErrorMessage(result?.error || result))
    const createdId = extractCreatedRowId(result.data)
    if (createdId) return createdId
    const resolvedId = await resolveCompassFileRowId(input.recordId)
    if (resolvedId) return resolvedId
    throw new Error(`The file record ${input.recordId} was created, but its Dataverse row ID could not be resolved.`)
  }

  const localToken = await ensureAuthToken()
  if (!orgUrl || !localToken) throw new Error('Missing Dataverse connection info for file create.')
  const response = await fetch(`${orgUrl}/api/data/v9.2/${COMPASS_FILES_TABLE_ALIAS}`, {
    method: 'POST',
    credentials: 'include',
    headers: {
      Accept: 'application/json',
      'Content-Type': 'application/json',
      'OData-Version': '4.0',
      'OData-MaxVersion': '4.0',
      Authorization: `Bearer ${localToken}`,
      Prefer: 'return=representation',
    },
    body: JSON.stringify(payload),
  })
  if (!response.ok) throw new Error(await response.text())
  const body = await response.json().catch(() => ({}))
  const createdId = extractCreatedRowId(body)
  if (createdId) return createdId
  const resolvedId = await resolveCompassFileRowId(input.recordId)
  if (resolvedId) return resolvedId
  throw new Error(`The file record ${input.recordId} was created, but its Dataverse row ID could not be resolved.`)
}

async function uploadCompassFilePayload(rowId: string, file: File): Promise<void> {
  const orgUrl = getOrgUrl()
  const token = getAuthToken()
  const cleanId = normalizeGuid(rowId)
  if (!isGuid(cleanId)) throw new Error('Missing Dataverse row ID for file upload.')

  let runtimeError = ''
  if (!isLocalHost()) {
    const encodedFile = await fileToBase64(file)
    const result = await runtimeDataClient.executeAsync<any, any>({
      connectorOperation: {
        tableName: 'commondataserviceforapps',
        operationName: 'UpdateEntityFileImageFieldContentWithOrganization',
        parameters: {
          organization: orgUrl,
          entityName: COMPASS_FILES_TABLE_ALIAS,
          recordId: cleanId,
          fileImageFieldName: COMPASS_FILES_PAYLOAD_FIELD,
          item: encodedFile,
          'x-ms-file-name': file.name,
          ...(token ? { token } : {}),
        },
      },
    } as any)
    if (result?.success) return
    runtimeError = parseConnectorErrorMessage(result?.error || result)
  }

  const localToken = await ensureAuthToken()
  if (!orgUrl || !localToken) throw new Error(runtimeError || 'Missing Dataverse connection info for file upload.')
  const params = new URLSearchParams({ 'x-ms-file-name': file.name })
  const response = await fetch(`${orgUrl}/api/data/v9.2/${COMPASS_FILES_TABLE_ALIAS}(${cleanId})/${COMPASS_FILES_PAYLOAD_FIELD}?${params.toString()}`, {
    method: 'PUT',
    credentials: 'include',
    headers: {
      Accept: 'application/json',
      'Content-Type': 'application/octet-stream',
      'OData-Version': '4.0',
      'OData-MaxVersion': '4.0',
      Authorization: `Bearer ${localToken}`,
    },
    body: file,
  })
  if (!response.ok) {
    const detail = await response.text()
    throw new Error(detail || runtimeError || `File upload failed with status ${response.status}.`)
  }
}

async function deleteCompassFileRecord(rowId: string): Promise<void> {
  const cleanId = normalizeGuid(rowId)
  if (!isGuid(cleanId)) return
  const orgUrl = getOrgUrl()
  const token = getAuthToken()

  if (!isLocalHost()) {
    const result = await runtimeDataClient.executeAsync<any, any>({
      connectorOperation: {
        tableName: 'commondataserviceforapps',
        operationName: 'DeleteRecordWithOrganization',
        parameters: {
          organization: orgUrl,
          entityName: COMPASS_FILES_TABLE_ALIAS,
          recordId: cleanId,
          ...(token ? { token } : {}),
        },
      },
    } as any)
    if (result?.success) return
  }

  const localToken = await ensureAuthToken()
  if (!orgUrl || !localToken) return
  await fetch(`${orgUrl}/api/data/v9.2/${COMPASS_FILES_TABLE_ALIAS}(${cleanId})`, {
    method: 'DELETE',
    credentials: 'include',
    headers: {
      Accept: 'application/json',
      'OData-Version': '4.0',
      'OData-MaxVersion': '4.0',
      Authorization: `Bearer ${localToken}`,
    },
  }).catch(() => null)
}

export async function createCompassFileRecord(input: CompassFileCreateInput): Promise<CompassFileRecord> {
  const recordId = String(input.recordId || '').trim()
  const relatedRecordId = String(input.relatedRecordId || '').trim()
  if (!recordId) throw new Error('A Record ID is required for the uploaded file.')
  if (!relatedRecordId) throw new Error('The related form Record ID is required for the uploaded file.')
  if (!input.file) throw new Error('Choose a file to upload.')
  if (input.file.size > COMPASS_FILES_MAX_SIZE_BYTES) {
    throw new Error(`The selected file exceeds the ${COMPASS_FILES_MAX_SIZE_KB.toLocaleString()} KB upload limit.`)
  }

  const rowId = await createCompassFileMetadata({ ...input, recordId, relatedRecordId })
  try {
    await uploadCompassFilePayload(rowId, input.file)
  } catch (error) {
    await deleteCompassFileRecord(rowId).catch(() => null)
    throw error
  }

  return {
    id: rowId,
    recordId,
    filename: input.file.name,
    filesize: input.file.size,
    mimetype: input.file.type || 'application/octet-stream',
  }
}

async function loadCompassFileMetadata(rowId: string): Promise<Omit<CompassFileDownload, 'blob'>> {
  const cleanId = normalizeGuid(rowId)
  if (!isGuid(cleanId)) throw new Error('The attached file reference is invalid.')
  const orgUrl = getOrgUrl()
  const token = getAuthToken() || await ensureAuthToken().catch(() => '')
  const select = [
    COMPASS_FILES_PRIMARY_ID_FIELD,
    'cmps_recordid',
    'cmps_filename',
    'cmps_filesize',
    'cmps_mimetype',
    'cmps_relatedrecordid',
  ].join(',')
  let directFailure = ''

  if (orgUrl && token) {
    const response = await fetch(`${orgUrl}/api/data/v9.2/${COMPASS_FILES_TABLE_ALIAS}(${cleanId})?$select=${encodeURIComponent(select)}`, {
      method: 'GET',
      credentials: 'include',
      headers: {
        Accept: 'application/json',
        'OData-Version': '4.0',
        'OData-MaxVersion': '4.0',
        Authorization: `Bearer ${token}`,
      },
    }).catch((error) => {
      directFailure = String((error as Error)?.message || error)
      return null
    })
    if (response?.ok) {
      const row = await response.json().catch(() => ({}))
      return {
        id: cleanId,
        recordId: String(row?.cmps_recordid || '').trim(),
        filename: String(row?.cmps_filename || 'Attached file').trim(),
        filesize: Number(row?.cmps_filesize || 0),
        mimetype: String(row?.cmps_mimetype || 'application/octet-stream').trim(),
        relatedRecordId: String(row?.cmps_relatedrecordid || '').trim(),
      }
    }
    if (response && !response.ok) {
      const detail = await response.text().catch(() => '')
      directFailure = detail || `Dataverse returned status ${response.status}.`
    }
  }

  try {
    const result = await runtimeDataClient.executeAsync<any, any>({
      connectorOperation: {
        tableName: 'commondataserviceforapps',
        operationName: 'ListRecordsWithOrganization',
        parameters: {
          organization: orgUrl,
          entityName: COMPASS_FILES_TABLE_ALIAS,
          '$select': select,
          '$filter': `${COMPASS_FILES_PRIMARY_ID_FIELD} eq ${cleanId}`,
          '$top': 1,
          ...(token ? { token } : {}),
        },
      },
    } as any)
    if (result?.success) {
      const row = rowsFromPayload(result.data)[0]
      if (row) {
        return {
          id: cleanId,
          recordId: String(row?.cmps_recordid || '').trim(),
          filename: String(row?.cmps_filename || 'Attached file').trim(),
          filesize: Number(row?.cmps_filesize || 0),
          mimetype: String(row?.cmps_mimetype || 'application/octet-stream').trim(),
          relatedRecordId: String(row?.cmps_relatedrecordid || '').trim(),
        }
      }
    }
    const connectorFailure = parseConnectorErrorMessage(result?.error || result)
    throw new Error(`Unable to load the attached file metadata.${directFailure ? ` Dataverse: ${directFailure}` : ''}${connectorFailure ? ` Connector: ${connectorFailure}` : ''}`)
  } catch (error) {
    const connectorFailure = String((error as Error)?.message || error)
    if (connectorFailure.startsWith('Unable to load the attached file metadata.')) throw error
    throw new Error(`Unable to load the attached file metadata.${directFailure ? ` Dataverse: ${directFailure}` : ''} Connector: ${connectorFailure}`)
  }
}

async function downloadCompassFilePayload(metadata: Omit<CompassFileDownload, 'blob'>): Promise<Blob> {
  const orgUrl = getOrgUrl()
  const token = getAuthToken() || await ensureAuthToken().catch(() => '')
  const fileUrl = `${orgUrl}/api/data/v9.2/${COMPASS_FILES_TABLE_ALIAS}(${metadata.id})/${COMPASS_FILES_PAYLOAD_FIELD}/$value`
  const baseHeaders = {
    Accept: 'application/octet-stream',
    'OData-Version': '4.0',
    'OData-MaxVersion': '4.0',
    ...(token ? { Authorization: `Bearer ${token}` } : {}),
  }
  let lastFailure = ''
  if (orgUrl && token) {
    const attempts: Array<Record<string, string>> = [baseHeaders]
    if (metadata.filesize > 0) attempts.push({ ...baseHeaders, Range: `bytes=0-${metadata.filesize - 1}` })
    for (const headers of attempts) {
      try {
        const response = await fetch(fileUrl, {
          method: 'GET',
          credentials: 'include',
          headers,
        })
        if (response.ok) {
          return connectorBinaryToBlob(await response.arrayBuffer(), metadata.mimetype, metadata.filesize)
        }
        const detail = await response.text().catch(() => '')
        lastFailure = detail || `Dataverse returned status ${response.status}.`
      } catch (error) {
        lastFailure = String((error as Error)?.message || error)
      }
    }
  }

  try {
    const chunkRanges = metadata.filesize > 0
      ? Array.from(
          { length: Math.ceil(metadata.filesize / DATAVERSE_FILE_DOWNLOAD_CHUNK_BYTES) },
          (_, index) => {
            const start = index * DATAVERSE_FILE_DOWNLOAD_CHUNK_BYTES
            const end = Math.min(metadata.filesize - 1, start + DATAVERSE_FILE_DOWNLOAD_CHUNK_BYTES - 1)
            return { start, end }
          },
        )
      : [{ start: 0, end: DATAVERSE_FILE_DOWNLOAD_CHUNK_BYTES - 1 }]
    const chunks: Blob[] = []

    for (const range of chunkRanges) {
      const result = await runtimeDataClient.executeAsync<any, any>({
        connectorOperation: {
          tableName: 'commondataserviceforapps',
          operationName: 'GetEntityFileImageFieldContentWithOrganization',
          parameters: {
            organization: orgUrl,
            entityName: COMPASS_FILES_TABLE_ALIAS,
            recordId: metadata.id,
            fileImageFieldName: COMPASS_FILES_PAYLOAD_FIELD,
            Range: `bytes=${range.start}-${range.end}`,
            size: 'full',
            ...(token ? { token } : {}),
          },
        },
      } as any)
      if (!result?.success) throw new Error(parseConnectorErrorMessage(result?.error || result))
      chunks.push(connectorBinaryToBlob(result.data, metadata.mimetype, range.end - range.start + 1))
    }

    return new Blob(chunks, { type: metadata.mimetype })
  } catch (error) {
    const connectorFailure = String((error as Error)?.message || error)
    throw new Error(`Unable to download ${metadata.filename} from Dataverse.${lastFailure ? ` Direct request: ${lastFailure}` : ''} Connector: ${connectorFailure}`)
  }
}

export async function loadCompassFileRecord(rowId: string): Promise<CompassFileDownload> {
  const metadata = await loadCompassFileMetadata(rowId)
  const blob = await downloadCompassFilePayload(metadata)
  return { ...metadata, blob }
}
