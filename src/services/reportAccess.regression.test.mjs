import assert from 'node:assert/strict'
import { readFileSync } from 'node:fs'
import test from 'node:test'
import vm from 'node:vm'
import ts from 'typescript'
import * as React from 'react'
import * as jsx from 'react/jsx-runtime'
import { renderToStaticMarkup } from 'react-dom/server'

function compile(source, dependencies = {}) {
  const module = { exports: {} }
  vm.runInNewContext(ts.transpileModule(source, { compilerOptions: { module: ts.ModuleKind.CommonJS, target: ts.ScriptTarget.ES2022, jsx: ts.JsxEmit.ReactJSX, esModuleInterop: false } }).outputText, {
    module, exports: module.exports, structuredClone, AbortController,
    require: (name) => { if (!(name in dependencies)) throw new Error('Unexpected dependency: ' + name); return dependencies[name] },
  })
  return module.exports
}
const access = compile(readFileSync(new URL('./reportAccess.ts', import.meta.url), 'utf8')).canViewReportLibrary
const profile = (roleName) => ({ roleName, entries: [] })
test('Reporting membership grants reports without form entries, hub access, or admin privileges', () => {
  for (const name of ['Reporting', ' reporting ', 'REPORTING']) assert.equal(access([profile(name)], false, false, '', false), true)
  for (const name of ['Reporting Assistant', 'Not Reporting', 'Autumn House Manager', '']) assert.equal(access([profile(name)], false, false, '', false), false)
  assert.equal(access([], true, false, '', false), true)
  assert.equal(access([], false, false, '', false), false)
  for (const flags of [[true, '', false], [false, 'Denied', false], [false, '', true]]) {
    assert.equal(access([profile('Reporting')], true, ...flags), false)
  }
})

const panelSource = readFileSync(new URL('./reporting/LegacyReportsPanel.tsx', import.meta.url), 'utf8')
const catalog = JSON.parse(readFileSync(new URL('./reporting/legacyReportCatalog.json', import.meta.url), 'utf8'))
const defaultMappings = { ProgramEnrollment: { alias: 'cmps_programenrollment1s', fields: {} } }
const defaultOptions = { outreachCountDate: 'service', allowClientTypeFallback: true }
function panel(native = true) {
  return compile(panelSource, {
    react: React, 'react/jsx-runtime': jsx,
    './legacyReportCatalog.json': { default: catalog },
    './reportMappings': { DEFAULT_REPORT_MAPPINGS: defaultMappings, legacyLabel: (value) => value },
    './reportDataverse': { readReportSchema() { throw new Error('No metadata reads during render') } },
    './reportPlan': { planLegacyReport: (report) => ({ datasets: Object.fromEntries(report.datasets.map((dataset) => [dataset.name, { tables: [] }])) }) },
    './ovwFiscalCalendar': { usesOvwFiscalCalendar: () => false },
    './runLegacyReport': { runLegacyReport() { throw new Error('No data reads during render') } },
    './LegacyReportView': { default: () => null }, '../desDvReport': { reportCsv: () => '' },
    './SaspMuskieReportView': { default: () => null },
    './saspMuskiePlan': { SASP_MUSKIE_REPORT: { id: 'sasp-muskie-report', title: 'SASP MUSKIE Report' }, isSaspMuskieReport: () => false, planSaspMuskieReport: () => ({ datasets: {} }) },
    './saspMuskieReport': { runSaspMuskieReport() { throw new Error('Unexpected SASP run') } },
    './GlendaleReportView': { default: () => null },
    './glendalePlan': { GLENDALE_REPORT: { id: 'city-of-glendale-monthly-report', title: 'City of Glendale Monthly Report' }, isGlendaleReport: () => false, planGlendaleReport: () => ({ datasets: {} }) },
    './glendaleReport': { runGlendaleReport() { throw new Error('Unexpected Glendale run') } },
    './DesBosReportView': { default: () => null },
    './desBosPlan': { DES_BOS_REPORTS: [], isDesBosReport: () => false, planDesBosReport: () => ({ datasets: {} }) },
    './desBosReport': { runDesBosReport() { throw new Error('Unexpected DES BOS run') } },
    './nativeDesDvPlan': { DEFAULT_NATIVE_DES_DV_OPTIONS: defaultOptions, isNativeDesDvReport: () => native, prepareNativeDesDvReport: (report) => report },
    './LegacyReports.css': {},
  }).default
}
test('Reporting users can select and run reports, but only admins see mapping/counting/SQL setup', () => {
  for (const native of [true, false]) {
    const Component = panel(native)
    const reader = renderToStaticMarkup(React.createElement(Component, { canView: true, canManage: false }))
    assert.match(reader, /Choose report and parameters/)
    assert.match(reader, /View Report/)
    assert.match(reader, /<article class="panel hub-card legacy-reports"><h3>Report Library<\/h3><p class="hint">Choose a legacy report, SASP MUSKIE, City of Glendale Monthly Report, or a DES BOS exhibit\./)
    assert.doesNotMatch(reader, /if \(!canView\) return|Reports require the Reporting or IT Admin role/)
    assert.equal((reader.match(/<article\b/g) || []).length, 1, 'Authorized report page must not contain a nested denial card')
    assert.doesNotMatch(reader, /Report Mapping Setup|Native DES DV Counting Setup|Source SQL and report dependencies/)
    const admin = renderToStaticMarkup(React.createElement(Component, { canView: true, canManage: true }))
    assert.match(admin, /Report Mapping Setup/)
    assert.doesNotMatch(admin, /if \(!canView\) return|Reports require the Reporting or IT Admin role/)
    if (native) assert.match(admin, /Native DES DV Counting Setup/)
    const denied = renderToStaticMarkup(React.createElement(Component, { canView: false, canManage: false }))
    assert.doesNotMatch(denied, /Choose report and parameters|View Report/)
  }
})

test('report sections stack full-width while report controls use a responsive horizontal grid', () => {
  const css = readFileSync(new URL('./reporting/LegacyReports.css', import.meta.url), 'utf8')
  assert.match(css, /\.legacy-reports\.hub-card\s*\{[^}]*grid-template-columns:\s*minmax\(0,\s*1fr\)/)
  assert.match(css, /\.legacy-reports\s*>\s*\*\s*\{[^}]*grid-column:\s*1\s*\/\s*-1/)
  assert.match(css, /\.legacy-report-controls\s*\{[^}]*grid-template-columns:\s*repeat\(auto-fit,\s*minmax\(230px,\s*1fr\)\)/)
})
test('report execution checks view permission and uses default mappings/options for non-admins', async () => {
  const file = ts.createSourceFile('panel.tsx', panelSource, ts.ScriptTarget.Latest, true, ts.ScriptKind.TSX)
  let runSource
  function visit(node) {
    if (ts.isFunctionDeclaration(node) && node.name?.text === 'run') runSource = node.getText(file)
    ts.forEachChild(node, visit)
  }
  visit(file)
  assert.ok(runSource)
  for (const canView of [true, false]) {
    let calls = 0
    const sandbox = {
      canView, canManage: false, sasp: false, glendale: false, desBos: false, busy: false, schemaBusy: false, parameters: {}, report: { parameters: [], datasets: [] }, catalog,
      mappings: { unsafe: true }, nativeOptions: { unsafe: true }, DEFAULT_REPORT_MAPPINGS: defaultMappings, DEFAULT_NATIVE_DES_DV_OPTIONS: defaultOptions,
      request: { current: null }, AbortController,
      setBusy() {}, setError() {}, setResult() {}, setProgress() {},
      runLegacyReport: async (_report, _catalog, _params, mappings, _signal, _progress, options) => {
        calls++; assert.equal(mappings, defaultMappings); assert.equal(options, defaultOptions); return { datasets: {} }
      },
      runDesBosReport() { throw new Error('Unexpected DES BOS run') },
    }
    vm.runInNewContext(ts.transpileModule(runSource + '; globalThis.run = run', { compilerOptions: { target: ts.ScriptTarget.ES2022 } }).outputText, sandbox)
    await sandbox.run()
    assert.equal(calls, canView ? 1 : 0)
  }
})
test('Reports navigation exposes Impact Management without report permissions while report data stays permission-gated', () => {
  const app = readFileSync(new URL('../App.tsx', import.meta.url), 'utf8')
  assert.match(app, /canViewReportLibrary\(roleProfiles, canAccessRoleAdmin, roleProfilesLoading, roleProfilesError, isUserPreview\)/)
  assert.match(app, /className=\{`hub-nav-item app-nav-reports/)
  assert.match(app, /setSelectedReportsPage\(page\)/)
  assert.match(app, /selectedReportsPage === 'impact-management'/)
  assert.match(app, /<ImpactManagementPanel[\s\S]*?staffName=\{String\(user\.name \|\| user\.email \|\| ''\)\.trim\(\)\}/)
  const entry = app.indexOf(": selectedAppNav === 'reports' ? selectedReportsPage === 'reporting' ? (")
  assert.ok(entry > 0)
  assert.ok(app.indexOf('canView={canViewReports}', entry) < app.indexOf(') : selectedHub ? (', entry))
  assert.match(panelSource, /if \(!canView\) \{ request.current\?\.abort\(\); schemaRequest.current\?\.abort\(\); setResult\(null\)/)
  assert.match(panelSource, /controller.signal.throwIfAborted\(\); setResult\(current\)/)
})

test('Compass logo is bundled as an application asset for Power Apps runtime paths', () => {
  const app = readFileSync(new URL('../App.tsx', import.meta.url), 'utf8')
  const logo = readFileSync(new URL('../assets/compass-logo.png', import.meta.url))
  assert.ok(logo.length > 0)
  assert.match(app, /import compassLogo from '\.\/assets\/compass-logo\.png\?inline'/)
  assert.match(app, /const headerLogoSrc = compassLogo/)
})
