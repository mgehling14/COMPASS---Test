import { getFocusPlanGoalCount, GOAL_COLUMNS, GOAL_STATUS_OPTIONS, parseFocusGoalColumn } from './focusPlan'

export default function FocusPlanNeedsView({ values, idPrefix, printMode = false }: { values: Record<string, unknown>; idPrefix: string; printMode?: boolean }) {
  const parsed = GOAL_COLUMNS.map((column) => parseFocusGoalColumn(values[column]))
  return <div className="hub-form-field hub-form-field-wide"><div className="focus-goals-list">
    {Array.from({ length: getFocusPlanGoalCount(values) }, (_, index) => {
      const status = (parsed[2][index] || '').trim()
      return <div className="focus-goal-row" key={`${idPrefix}-goal-${index}`}>
        <h5>Goal {index + 1}</h5>
        <label className="hub-form-field"><span>Identified Need</span>{printMode ? <div className="record-print-value">{parsed[0][index] || '-'}</div> : <input value={parsed[0][index] || ''} readOnly disabled />}</label>
        <label className="hub-form-field"><span>Resources Given and Frequency Seen by Specialists</span>{printMode ? <div className="record-print-value">{parsed[1][index] || '-'}</div> : <input value={parsed[1][index] || ''} readOnly disabled />}</label>
        <div className="hub-form-field"><span>Goal Status</span><div className="hub-form-option-grid">
          {GOAL_STATUS_OPTIONS.map((option) => <label className="permission-check" key={option}>{printMode ? <span>{status === option ? '(x)' : '( )'}</span> : <input type="radio" name={`${idPrefix}-goal-status-${index}`} checked={status === option} readOnly disabled />}<span>{option}</span></label>)}
        </div>{status && !GOAL_STATUS_OPTIONS.includes(status) ? <span>{status}</span> : null}</div>
        {status === 'Complete' ? <label className="hub-form-field"><span>Goal Completion Date</span>{printMode ? <div className="record-print-value">{(parsed[3][index] || '').trim().slice(0, 10) || '-'}</div> : <input type="date" value={(parsed[3][index] || '').trim().slice(0, 10)} readOnly disabled />}</label> : null}
      </div>
    })}
  </div></div>
}
