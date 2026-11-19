import assert from 'node:assert/strict'
import { readFileSync } from 'node:fs'
import test from 'node:test'

const app = readFileSync(new URL('../App.tsx', import.meta.url), 'utf8')

test('opened Client Profiles include Face Sheet and Folder Summary tabs', () => {
  assert.match(app, /\| 'face-sheet'/)
  assert.match(app, /\| 'folder-summary'/)
  assert.match(app, /'face-sheet': 'Face Sheet'/)
  assert.match(app, /'folder-summary': 'Folder Summary'/)
  assert.match(app, /<h3>Face Sheet<\/h3>/)
  assert.match(app, /<h3>Folder Summary<\/h3>/)
})

test('Face Sheet shows only unfinished goals and suggests create-enabled forms without records', () => {
  assert.match(app, /const inProgressGoals = goalsForClient\.filter\(\(row\) => normalize\(row\.status\) !== normalize\('Complete'\)\)/)
  assert.match(app, /getCreateFormsForProgram\(selectedHub\.title\)/)
  assert.match(app, /getClientFormRecordCount\(form\.formName\) === 0/)
  assert.match(app, /Goals Still in Progress/)
  assert.match(app, /Suggested Next Forms/)
  assert.ok(
    app.indexOf('const selectedDetailRecord =') < app.indexOf('const faceSheetSuggestedForms ='),
    'record-count summaries must run after selectedDetailRecord is initialized to avoid a render-time TDZ crash',
  )
})

test('Folder Summary uses active enrollments and each program role create permission', () => {
  assert.match(app, /activeFolderEnrollments = programEnrollmentsForClient\.filter\(\(row\) => !String\(row\.serviceEndDate/)
  assert.match(app, /hubMatchesRole\(hub, profile\.roleName\)/)
  assert.match(app, /filter\(\(entry\) => entry\.permissions\.create\)/)
  assert.match(app, /getCreateFormsForProgram\(enrollment\.program\)/)
  assert.match(app, /getClientFormRecordCountForEnrollment\(form\.formName, enrollment\.id\)/)
  assert.match(app, /form\.recordCount > 0 \? 'Completed' : 'Not completed'/)
})

test('enrollment-linked records are not credited to a different program enrollment', () => {
  const start = app.indexOf('function getClientFormRecordCountForEnrollment')
  const end = app.indexOf('function formatServicesDetailValue', start)
  assert.ok(start >= 0 && end > start)
  const source = app.slice(start, end)
  assert.match(source, /normalizeGuidText\(programEnrollmentRowId\)/)
  assert.match(source, /normalizeGuidText\(String\(value \|\| ''\)\) === enrollmentId/)
  assert.match(source, /countEnrollmentRows\(servicesForClient\)/)
  assert.match(source, /countEnrollmentRows\(goalsForClient\)/)
  assert.match(source, /return getClientFormRecordCount\(formName\)/)
})
