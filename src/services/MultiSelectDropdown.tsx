import './MultiSelectDropdown.css'

type Props = {
  id: string
  label: string
  options: string[]
  optionLabels?: Record<string, string>
  hint?: string
  value: string[]
  disabled?: boolean
  onChange: (value: string[]) => void
}

export default function MultiSelectDropdown({ id, label, options, optionLabels, hint = 'Select all that apply.', value, disabled = false, onChange }: Props) {
  const selected = new Set(value.map((item) => item.trim().toLowerCase()))
  const displayLabel = (option: string) => optionLabels ? optionLabels[option] || 'Saved selection unavailable' : option
  return <div className="hub-form-field">
    <span id={`${id}-label`}>{label}</span>
    <details className="compass-multiselect" onClick={(event) => { if (disabled) event.preventDefault() }}>
      <summary id={id} aria-labelledby={`${id}-label ${id}-selection`} aria-disabled={disabled}>
        <span id={`${id}-selection`}>{value.length ? value.map(displayLabel).join(', ') : '--Please Select--'}</span>
      </summary>
      <div className="compass-multiselect-options" role="group" aria-labelledby={`${id}-label`}>
        {options.map((option) => <label className="permission-check" key={option}>
          <input type="checkbox" disabled={disabled} checked={selected.has(option.toLowerCase())}
            onChange={(event) => { if (disabled) return; onChange(event.target.checked
              ? [...value.filter((item) => item.trim().toLowerCase() !== option.toLowerCase()), option]
              : value.filter((item) => item.trim().toLowerCase() !== option.toLowerCase())) }} />
          <span>{displayLabel(option)}</span>
        </label>)}
        <button type="button" className="secondary" disabled={disabled || !value.length} onClick={() => { if (!disabled) onChange([]) }}>Clear selections</button>
      </div>
    </details>
    <span className="hub-form-meta">{hint}</span>
  </div>
}
