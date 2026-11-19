import assert from 'node:assert/strict'
import { readFileSync } from 'node:fs'
import test from 'node:test'
import vm from 'node:vm'
import ts from 'typescript'

const workerAsset = '/assets/report.worker.js', wasmAsset = '/assets/report.wasm'
const shortTimeouts = { asset: 5_000, worker: 5_000, instantiate: 5_000, operation: 5_000 }
const never = () => new Promise(() => {})
function harness(options = {}) {
  const workers = [], blobs = new Map(), revoked = [], downloads = [], progress = [], databases = []
  class AssetURL extends URL {
    static createObjectURL(blob) { const url = `blob:report-${blobs.size}`; blobs.set(url, blob); return url }
    static revokeObjectURL(url) { revoked.push(url) }
  }
  class MockWorker extends EventTarget {
    constructor(url) { super(); this.url = url; this.terminated = false; workers.push(this); if (options.constructorError) throw Error('Worker blocked by CSP') }
    terminate() { this.terminated = true }
    crash(type = 'error') { const event = new Event(type); event.message = 'Script failed to load'; this.dispatchEvent(event) }
  }
  class MockDuckDB {
    constructor(_logger, worker) { this.worker = worker; this.detached = false; databases.push(this) }
    ping() {
      if (options.pingError === 'all' || (options.pingError === 'first' && workers.length === 1)) { setTimeout(() => this.worker.crash(), 1); return never() }
      return options.pingHang ? never() : Promise.resolve()
    }
    instantiate(url) { this.wasm = url; return options.instantiateHang ? never() : options.instantiateError ? Promise.reject(Error('WebAssembly compile blocked')) : Promise.resolve() }
    connect() { return options.connectHang ? never() : Promise.resolve({ query: () => Promise.resolve('query result') }) }
    detach() { this.detached = true }
  }
  const fetchAsset = async (url, { signal }) => {
    downloads.push(url)
    if (options.fetchHang) return new Promise((_resolve, reject) => signal.addEventListener('abort', () => reject(signal.reason), { once: true }))
    if (options.httpError) return new Response('missing', { status: 404 })
    if (options.html) return new Response('<!doctype html><html>App shell</html>', { headers: { 'content-type': 'text/html' } })
    if (url === workerAsset) return new Response(options.workerHtml ? '<html>App</html>' : 'self.onmessage = function () {}', { headers: { 'content-type': 'application/javascript' } })
    return new Response(options.invalidWasm ? new Uint8Array([1, 2, 3, 4]) : new Uint8Array([0, 97, 115, 109, 1, 0, 0, 0]))
  }
  const source = readFileSync(new URL('./reporting/reportSqlEngine.ts', import.meta.url), 'utf8')
  const module = { exports: {} }
  vm.runInNewContext(ts.transpileModule(source, { compilerOptions: { module: ts.ModuleKind.CommonJS, target: ts.ScriptTarget.ES2022 } }).outputText, {
    module, exports: module.exports, Blob, AbortController, DOMException, Date, Uint8Array, Set, URL: AssetURL, Worker: MockWorker, fetch: fetchAsset, setTimeout, clearTimeout,
    require(name) {
      if (name === '@duckdb/duckdb-wasm') return { AsyncDuckDB: MockDuckDB, VoidLogger: class {} }
      if (name.endsWith('worker.js?url')) return { __esModule: true, default: workerAsset }
      if (name.endsWith('wasm?url')) return { __esModule: true, default: wasmAsset }
      throw Error('Unexpected import ' + name)
    },
  })
  const controller = new AbortController()
  const start = (timeouts = shortTimeouts) => module.exports.startReportSqlEngine(controller.signal, (text) => progress.push(text), timeouts)
  return { start, controller, workers, databases, downloads, progress, blobs, revoked }
}

test('report engine fetches/validates packaged assets, reports download progress and terminates without waiting on close', async () => {
  const fixture = harness(), engine = await fixture.start()
  assert.deepEqual(fixture.downloads, [workerAsset, wasmAsset])
  assert.match(fixture.workers[0].url, /^blob:/)
  assert.equal(fixture.blobs.get(fixture.databases[0].wasm).type, 'application/wasm')
  assert.ok(fixture.progress.some((text) => /MB received/.test(text)))
  assert.match(fixture.progress.at(-1), /engine ready/)
  assert.equal(await engine.wait(() => engine.connection.query('select 1'), 'test query'), 'query result')
  engine.dispose(); engine.dispose()
  assert.equal(fixture.workers[0].terminated, true)
  assert.equal(fixture.databases[0].detached, true)
  assert.deepEqual(fixture.revoked, [...fixture.blobs.keys()])
})

test('asynchronous worker bootstrap errors trigger the packaged URL fallback, not a permanent spinner', async () => {
  const fixture = harness({ pingError: 'first' }), engine = await fixture.start()
  assert.equal(fixture.workers.length, 2)
  assert.equal(fixture.workers[0].terminated, true)
  assert.equal(fixture.workers[1].url, workerAsset)
  assert.ok(fixture.progress.some((text) => /Retrying/.test(text)))
  engine.dispose()
})

test('errors from both worker bootstraps reject with actionable errors before downloading wasm', async () => {
  const fixture = harness({ pingError: 'all' })
  await assert.rejects(fixture.start(), /could not start.*Script failed to load/)
  assert.deepEqual(fixture.downloads, [workerAsset])
  assert.equal(fixture.workers.every((worker) => worker.terminated), true)
})

test('synchronous worker restrictions and wasm compile failures reject startup and release Blob URLs', async () => {
  for (const [options, expected] of [[{ constructorError: true }, /Worker blocked by CSP/], [{ instantiateError: true }, /WebAssembly compile blocked/]]) {
    const fixture = harness(options)
    await assert.rejects(fixture.start(), expected)
    assert.deepEqual(fixture.revoked, [...fixture.blobs.keys()])
    if (options.instantiateError) assert.equal(fixture.workers[0].terminated, true)
  }
})

test('nonresponding worker and nonresponding wasm initialization both time out and release resources', async () => {
  for (const options of [{ pingHang: true }, { instantiateHang: true }, { connectHang: true }]) {
    const fixture = harness(options)
    await assert.rejects(fixture.start({ ...shortTimeouts, worker: 20, instantiate: 20, operation: 20 }), /timed out/)
    assert.equal(fixture.workers.every((worker) => worker.terminated), true)
    assert.deepEqual(fixture.revoked, [...fixture.blobs.keys()])
  }
})

test('missing, HTML and invalid binary assets fail clearly instead of being handed to wasm', async () => {
  for (const [options, expected] of [[{ httpError: true }, /HTTP 404/], [{ html: true }, /HTML page/], [{ workerHtml: true }, /did not contain JavaScript/], [{ invalidWasm: true }, /not a WebAssembly file/]]) {
    const fixture = harness(options)
    await assert.rejects(fixture.start(), expected)
    assert.equal(fixture.workers.every((worker) => worker.terminated), true)
    assert.deepEqual(fixture.revoked, [...fixture.blobs.keys()])
  }
})

test('a stalled asset download is timed out and cancellation interrupts worker startup immediately', async () => {
  const download = harness({ fetchHang: true })
  await assert.rejects(download.start({ ...shortTimeouts, asset: 20 }), /Downloading report worker timed out/)
  const startup = harness({ instantiateHang: true })
  const operation = startup.start({ ...shortTimeouts, instantiate: 10_000 })
  setTimeout(() => startup.controller.abort(), 10)
  await assert.rejects(operation, { name: 'AbortError' })
  assert.equal(startup.workers.every((worker) => worker.terminated), true)
  assert.deepEqual(startup.revoked, [...startup.blobs.keys()])
})

test('worker error and messageerror events reject pending report queries even when SDK promises never settle', async () => {
  for (const type of ['error', 'messageerror']) {
    const fixture = harness(), engine = await fixture.start()
    const query = engine.wait(never, 'Calculating dataset', 10_000)
    fixture.workers[0].crash(type)
    await assert.rejects(query, type === 'error' ? /Report worker failed/ : /could not read a report worker response/)
    await assert.rejects(engine.wait(() => Promise.resolve('wrong'), 'next query'), /worker/)
    engine.dispose()
  }
})

test('hung query timeouts poison the engine, and abort disposes an idle engine without a close promise', async () => {
  const fixture = harness(), engine = await fixture.start()
  await assert.rejects(engine.wait(never, 'Calculating dataset', 20), /Calculating dataset timed out/)
  assert.throws(() => engine.assertHealthy(), /timed out/)
  fixture.controller.abort()
  assert.equal(fixture.workers[0].terminated, true)
  assert.deepEqual(fixture.revoked, [...fixture.blobs.keys()])
})

test('report runtime uses native plans only, with no worker startup or cleanup dependency', () => {
  const source = readFileSync(new URL('./reporting/runLegacyReport.ts', import.meta.url), 'utf8')
  assert.match(source, /new NativeReportEvaluator/)
  assert.doesNotMatch(source, /startReportSqlEngine|import\(['"]\.\/reportSqlEngine/)
  assert.doesNotMatch(source, /await connection\??\.close|await db\??\.terminate/)
})
