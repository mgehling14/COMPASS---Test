import type { RecordAttachment } from './recordAttachments'
export default function RecordAttachmentButtons({ attachments, onOpenFile, disabled = false }: {
  attachments: readonly RecordAttachment[]; onOpenFile?: (fileId: string) => void; disabled?: boolean
}) {
  return <>{attachments.map((file) => <button key={file.field} type="button" className="secondary hub-search-open-button"
    aria-label={`View attached file: ${file.label}`} disabled={disabled || !onOpenFile}
    onClick={() => { if (!disabled && onOpenFile) onOpenFile(file.id) }}>{file.field === 'cmps_fileid2' || attachments.length > 1 ? 'View ' + file.label : 'View attached file'}</button>)}</>
}
