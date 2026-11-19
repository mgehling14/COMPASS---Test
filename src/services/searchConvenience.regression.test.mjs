import assert from 'node:assert/strict'
import { readFileSync } from 'node:fs'
import test from 'node:test'
import vm from 'node:vm'
import ts from 'typescript'

function extract(file, name, globals = {}) {
  const source = readFileSync(new URL(file, import.meta.url), 'utf8')
  const tree = ts.createSourceFile(file, source, ts.ScriptTarget.Latest, true, ts.ScriptKind.TSX)
  let node
  function visit(current) {
    if (ts.isFunctionDeclaration(current) && current.name?.text === name) node = current
    ts.forEachChild(current, visit)
  }
  visit(tree); assert.ok(node)
  const context = { React: { createElement: (type, props, ...children) => ({ type, props, children }) }, ...globals }
  vm.createContext(context)
  vm.runInContext(ts.transpileModule(node.getText(tree), { compilerOptions: { target: ts.ScriptTarget.ES2022, jsx: ts.JsxEmit.React } }).outputText, context)
  return { run: context[name], context, source }
}

test('client search uses AND across separate name parts, preserving phrase, single-name and ID searches', () => {
  const { run } = extract('./clientProfile.ts', 'buildClientProfileSearchFilter', { escapeODataString: (text) => text.replaceAll("'", "''") })
  assert.equal(run(' '), '')
  assert.ok(run('John Smith').includes("((contains(cmps_name,'John') or contains(cmps_middlename,'John') or contains(cmps_lastname,'John')) and (contains(cmps_name,'Smith') or contains(cmps_middlename,'Smith') or contains(cmps_lastname,'Smith')))"))
  assert.ok(run('  John   Smith ').includes("contains(cmps_lastname,'Smith')"))
  assert.ok(run("Anne-Marie O'Neil").includes("contains(cmps_lastname,'O''Neil')"))
  assert.ok(run('John Michael Smith').includes(" and (contains(cmps_name,'Michael')"))
  assert.doesNotMatch(run('John'), / and /)
  assert.ok(run('CP-046').includes("contains(cmps_recordid,'CP-046')"))
})

test('top and bottom program pagers use the same cursors and disabled states', () => {
  const calls = [], { run, context, source } = extract('./ProgramTableSearchPanel.tsx', 'renderPagination', {
    busy: false, page: 1, cursors: [undefined, { page: 2 }], next: { page: 3 },
    movePage: (...args) => calls.push(args),
  })
  for (const position of ['top', 'bottom']) {
    const nav = run(position)
    assert.equal(nav.props['aria-label'], `Search result pages (${position})`)
    assert.equal(nav.children[0].props.disabled, false); assert.equal(nav.children[2].props.disabled, false)
    nav.children[0].props.onClick(); nav.children[2].props.onClick()
  }
  assert.deepEqual(calls.map(([page]) => page), [0, 2, 0, 2])
  assert.equal(calls[1][1], context.next)
  context.busy = true
  assert.equal(run('top').children[0].props.disabled, true); assert.equal(run('bottom').children[2].props.disabled, true)
  context.busy = false; context.page = 0; context.next = null
  assert.equal(run('top').children[0].props.disabled, true); assert.equal(run('bottom').children[2].props.disabled, true)
  assert.ok(source.indexOf("{renderPagination('top')}") < source.indexOf('<tbody>'))
  assert.ok(source.indexOf("{renderPagination('bottom')}") > source.indexOf('</tbody>'))
})

test('client list pager is shared above and below records without changing navigation', () => {
  let pages = { 'autumn-house': 2 }
  const { run, context, source } = extract('../App.tsx', 'renderClientSearchPagination', {
    selectedHub: { id: 'autumn-house' }, selectedSearchForm: 'Client Profile', selectedSearchPage: 2,
    selectedSearchHasNext: true, selectedDetailLoading: false,
    setSearchPageByHub: (update) => { pages = update(pages) },
  })
  run('top').children[0].props.onClick(); assert.equal(pages['autumn-house'], 1)
  run('bottom').children[2].props.onClick(); assert.equal(pages['autumn-house'], 2)
  context.selectedDetailLoading = true
  assert.equal(run('top').children[0].props.disabled, true); assert.equal(run('bottom').children[2].props.disabled, true)
  const start = source.indexOf('key={`${selectedHub.id}-search-results`}')
  const end = source.indexOf('{recordViewContext ? (', start), results = source.slice(start, end)
  assert.ok(results.indexOf("{renderClientSearchPagination('top')}") < results.indexOf('client-results-card-grid'))
  assert.ok(results.indexOf("{renderClientSearchPagination('bottom')}") > results.indexOf('</tbody>'))
})
