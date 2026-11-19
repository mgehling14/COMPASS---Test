import * as duckdb from '@duckdb/duckdb-wasm'
import workerUrl from '@duckdb/duckdb-wasm/dist/duckdb-browser-mvp.worker.js?url'
import wasmUrl from '@duckdb/duckdb-wasm/dist/duckdb-mvp.wasm?url'

export interface ReportEngineTimeouts { asset: number; worker: number; instantiate: number; operation: number }
const defaultTimeouts: ReportEngineTimeouts = { asset: 180_000, worker: 15_000, instantiate: 90_000, operation: 180_000 }
const message = (error: unknown) => String((error as Error)?.message || error)

// AsyncDuckDB's worker-error handler clears pending requests without rejecting
// them. Monitor the worker ourselves and bound every wait, including bootstrap.
export async function startReportSqlEngine(signal: AbortSignal, progress: (message: string) => void, timeouts = defaultTimeouts) {
  let worker: Worker | undefined, db: duckdb.AsyncDuckDB | undefined, fatal: Error | undefined, disposed = false
  const urls: string[] = [], pending = new Set<(error: unknown) => void>()
  const fail = (error: Error) => { fatal = error; for (const reject of [...pending]) reject(error) }
  const workerError = (event: ErrorEvent) => fail(new Error(`Report worker failed: ${event.message || 'The browser blocked or could not load the worker.'}`))
  const workerMessageError = () => fail(new Error('The browser could not read a report worker response.'))
  function assertHealthy() { signal.throwIfAborted(); if (fatal) throw fatal; if (disposed) throw new Error('Report engine has been stopped.') }
  function wait<T>(operation: () => Promise<T>, stage: string, timeout = timeouts.operation): Promise<T> {
    return new Promise((resolve, reject) => {
      let timer: ReturnType<typeof setTimeout> | undefined
      const cleanup = () => { clearTimeout(timer); pending.delete(rejectPending); signal.removeEventListener('abort', abort) }
      const rejectPending = (error: unknown) => { cleanup(); reject(error) }
      const abort = () => rejectPending(signal.reason || new DOMException('Aborted', 'AbortError'))
      try { assertHealthy() } catch (error) { reject(error); return }
      pending.add(rejectPending); signal.addEventListener('abort', abort, { once: true })
      timer = setTimeout(() => fail(new Error(`${stage} timed out after ${Math.round(timeout / 1000)} seconds. The report was stopped; no records were changed. Please retry. If this repeats, report this startup/operation message to IT Admin.`)), timeout)
      // Calling through a promise also captures synchronous SDK exceptions.
      Promise.resolve().then(() => { assertHealthy(); return operation() }).then((value) => { cleanup(); resolve(value) }, rejectPending)
    })
  }
  function detachWorker() {
    worker?.removeEventListener('error', workerError); worker?.removeEventListener('messageerror', workerMessageError)
    db?.detach(); worker?.terminate(); worker = undefined; db = undefined
  }
  function dispose() {
    if (disposed) return
    disposed = true
    fail(new Error('Report engine has been stopped.'))
    // Do not await close() on a crashed worker: that can hang as well. This is
    // an entirely in-memory, read-only database; termination releases it all.
    detachWorker(); urls.forEach((url) => URL.revokeObjectURL(url)); signal.removeEventListener('abort', dispose)
  }
  async function asset(url: string, label: string, type: string): Promise<Blob> {
    const download = new AbortController()
    const abort = () => download.abort(signal.reason)
    signal.addEventListener('abort', abort, { once: true })
    progress(`Downloading ${label}…`)
    try {
      return await wait(async () => {
        const response = await fetch(url, { signal: download.signal })
        if (!response.ok) throw new Error(`${label} download failed (HTTP ${response.status}). Check that all report assets were included in the Sandbox deployment.`)
        if (/text\/html/i.test(response.headers.get('content-type') || '')) throw new Error(`${label} returned an HTML page instead of a report asset. Check the Sandbox deployment's asset paths.`)
        if (!response.body) return new Blob([await response.arrayBuffer()], { type })
        const reader = response.body.getReader(), chunks: ArrayBuffer[] = []
        let bytes = 0, lastUpdate = 0
        while (true) {
          signal.throwIfAborted()
          const { done, value } = await reader.read()
          if (done) break
          chunks.push(new Uint8Array(value).buffer); bytes += value.byteLength
          if (Date.now() - lastUpdate >= 500) { progress(`Downloading ${label}: ${(bytes / 1_000_000).toFixed(1)} MB received…`); lastUpdate = Date.now() }
        }
        progress(`${label} downloaded (${(bytes / 1_000_000).toFixed(1)} MB).`)
        return new Blob(chunks, { type })
      }, `Downloading ${label}`, timeouts.asset)
    } catch (error) { signal.throwIfAborted(); throw new Error(`${label}: ${message(error)}`) }
    finally { download.abort(); signal.removeEventListener('abort', abort) }
  }
  function attach(url: string) {
    worker = new Worker(url)
    worker.addEventListener('error', workerError); worker.addEventListener('messageerror', workerMessageError)
    db = new duckdb.AsyncDuckDB(new duckdb.VoidLogger(), worker)
  }
  signal.addEventListener('abort', dispose, { once: true })
  try {
    assertHealthy()
    const workerSource = await asset(workerUrl, 'report worker', 'text/javascript')
    const source = await workerSource.text()
    if (!source.trim() || /^\s*</.test(source)) throw new Error('Report worker download did not contain JavaScript. Check the Sandbox deployment assets.')
    const workerBlob = URL.createObjectURL(workerSource); urls.push(workerBlob)
    progress('Starting report worker…')
    try {
      // Power Apps can serve app assets from a different origin. A locally
      // fetched Blob avoids Worker(url)'s same-origin restriction.
      attach(workerBlob); await wait(() => db!.ping(), 'Starting report worker', timeouts.worker)
    } catch (error) {
      signal.throwIfAborted(); detachWorker(); fatal = undefined
      progress('Retrying report worker using the packaged asset URL…')
      try { attach(workerUrl); await wait(() => db!.ping(), 'Starting packaged report worker', timeouts.worker) }
      catch (retryError) { signal.throwIfAborted(); throw new Error(`Report worker could not start. Local worker: ${message(error)} Packaged worker: ${message(retryError)}`) }
    }
    const wasm = await asset(wasmUrl, 'report SQL engine (approximately 41 MB)', 'application/wasm')
    const magic = new Uint8Array(await wasm.slice(0, 4).arrayBuffer())
    if (magic.length !== 4 || magic[0] !== 0 || magic[1] !== 97 || magic[2] !== 115 || magic[3] !== 109) throw new Error('Report SQL engine download was not a WebAssembly file. Check the Sandbox deployment assets.')
    const wasmBlob = URL.createObjectURL(wasm); urls.push(wasmBlob)
    progress('Initializing report SQL engine…')
    await wait(() => db!.instantiate(wasmBlob), 'Initializing report SQL engine', timeouts.instantiate)
    const connection = await wait(() => db!.connect(), 'Connecting to report SQL engine')
    progress('Report SQL engine ready. Reading report data…')
    return { db: db!, connection, wait, assertHealthy, dispose }
  } catch (error) { dispose(); signal.throwIfAborted(); throw error }
}
