export type RecordAttachmentField = { field: string; label: string }
export type RecordAttachment = RecordAttachmentField & { id: string }
const fields: Record<string, readonly RecordAttachmentField[]> = {
  'child-safety-plan': [{ field: 'cmps_fileid1', label: 'Drawing Upload' }],
  'electronic-document': [{ field: 'cmps_fileid1', label: 'Upload Document' }],
  'person-you-are-fleeing': [{ field: 'cmps_fileid1', label: 'Photo' }],
  event: [{ field: 'cmps_fileid1', label: 'Upload File 1' }, { field: 'cmps_fileid2', label: 'Upload File 2' }],
}
const aliases: Record<string, string> = {
  cmps_childsafetyplans: 'child-safety-plan', cmps_electronicdocuments: 'electronic-document',
  cmps_personyouarefleeingprofiles: 'person-you-are-fleeing', 'person-you-are-fleeing-profile': 'person-you-are-fleeing',
  cmps_events: 'event',
}
export function recordAttachmentFields(key: string): readonly RecordAttachmentField[] { return fields[aliases[key] || key] || [] }
export function recordAttachments(key: string, values: Record<string, unknown>): RecordAttachment[] {
  return recordAttachmentFields(key).flatMap((field) => {
    const id = String(values['_' + field.field + '_value'] ?? values[field.field] ?? '').trim().replace(/[{}]/g, '').toLowerCase()
    return /^[a-f\d]{8}(?:-[a-f\d]{4}){3}-[a-f\d]{12}$/.test(id) ? [{ ...field, id }] : []
  })
}
