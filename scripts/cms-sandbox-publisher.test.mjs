import assert from 'node:assert/strict'
import { test } from 'node:test'
import { runPublisher } from './cms-sandbox-publisher.mjs'

const REPO = 'mgehling14/COMPASS---Test'
const MAIN = 'refs/heads/main'
const TENANT = '0528c75b-bb2a-4718-b02a-1902cc340b62'
const EVENT = 'a'.repeat(40)
const FIRST = 'b'.repeat(40)
const SECOND = 'c'.repeat(40)
const CLI = '/runner/temp/node_modules/@microsoft/power-apps-cli/dist/Bin.js'
const LABEL = 'Team round `three` ${literal}'
const DEPLOY = {
  GITHUB_ACTIONS: 'true',
  GITHUB_REPOSITORY: REPO,
  GITHUB_REF: MAIN,
  GITHUB_WORKFLOW_REF: `${REPO}/.github/workflows/cms-sandbox-publisher.yml@${MAIN}`,
  GITHUB_SHA: EVENT,
  GITHUB_ACTOR: 'test-actor',
  GITHUB_RUN_ID: '123',
  GITHUB_RUN_ATTEMPT: '1',
  VITE_DATAVERSE_ORG_URL: 'https://org1f466e4e.crm.dynamics.com/',
  PUBLISHER_MODE: 'deploy',
  RELEASE_LABEL: LABEL,
  PA_CLI_USE_SP_AUTH: 'true',
  PA_CLI_SP_TENANT_ID: TENANT,
  PA_CLI_SP_CLIENT_ID: '73bc2627-cca1-4fb3-ae3c-7a09dc83b202',
  PA_CLI_SP_CLIENT_SECRET: 'fake-secret',
  GH_TOKEN: 'fake-github-token',
}

function simulate({
  env = {}, tips = [FIRST, FIRST, FIRST], target = {}, remote = {}, fail,
  dirty = '', dirtyAfterValidation = '', ancestor = true,
} = {}) {
  const events = []
  const receipts = []
  let head = EVENT
  let fetched
  let checkouts = 0
  let validations = 0
  const io = {
    async openReceipt() {
      return async value => receipts.push(structuredClone(value))
    },
    async git(args, options) {
      let stdout = ''
      let status = 0
      switch (args[0]) {
        case 'status':
          assert.deepEqual(args, ['status', '--porcelain=v1', '--untracked-files=all'])
          stdout = validations > 0 ? dirtyAfterValidation : dirty
          break
        case 'remote':
          assert.deepEqual(args, args.includes('--push')
            ? ['remote', 'get-url', '--all', '--push', 'origin']
            : ['remote', 'get-url', '--all', 'origin'])
          stdout = remote[args.includes('--push') ? 'push' : 'fetch'] ?? `https://github.com/${REPO}.git`
          break
        case 'fetch':
          assert.deepEqual(args, ['fetch', '--no-tags', '--no-recurse-submodules', 'origin', MAIN])
          assert.equal(options.network, true)
          events.push(['fetch'])
          if (fail === 'fetch' || (fail === 'post-fetch' && events.some(([step]) => step === 'upload'))) {
            throw new Error('simulated fetch failure')
          }
          fetched = tips.shift()
          assert.ok(fetched, 'Unexpected fetch in simulated workflow')
          break
        case 'rev-parse':
          assert.equal(args[1], '--verify')
          if (args[2] === 'HEAD') stdout = head
          else if (args[2] === 'FETCH_HEAD^{commit}') stdout = fetched
          else {
            assert.match(args[2], /^[a-f0-9]{40}\^\{commit\}$/)
            stdout = args[2].slice(0, 40)
          }
          break
        case 'checkout':
          assert.deepEqual(args, ['checkout', '--detach', '--no-overwrite-ignore', '--no-recurse-submodules', fetched])
          head = fetched
          ++checkouts
          events.push(['checkout', head])
          break
        case 'merge-base':
          assert.deepEqual(args, ['merge-base', '--is-ancestor', (env.REQUIRED_SHA || EVENT).toLowerCase(), head])
          assert.equal(options.allowOne, true)
          status = ancestor ? 0 : 1
          break
        default:
          assert.fail(`Unexpected Git command: ${args[0]}`)
      }
      return { stdout, status }
    },
    async readAppConfig() {
      return {
        appId: '77b2c86e-31b0-4dcf-a2e0-b4efd9d8ad26',
        environmentId: `Default-${TENANT}`,
        buildPath: './dist',
        buildEntryPoint: 'index.html',
        ...target,
      }
    },
    async resolveCli() {
      events.push(['resolve-cli'])
      return CLI
    },
    async validate() {
      ++validations
      events.push(['validate', head])
      if (fail === 'validation') throw new Error('simulated lint failure')
    },
    async upload(path) {
      assert.equal(path, CLI)
      events.push(['upload', head])
      if (fail === 'upload') throw new Error('simulated upload failure')
    },
    async dispatch(inputs) {
      events.push(['dispatch', inputs])
      if (fail === 'dispatch') throw new Error('simulated dispatch failure')
    },
  }
  return async () => {
    const receipt = await runPublisher({ ...DEPLOY, ...env }, io)
    assert.deepEqual(receipts, [receipt])
    return { receipt, events, checkouts, validations }
  }
}

test('rejects unexpected Actions context and options before touching Git or upload', async () => {
  const cases = [
    { GITHUB_ACTIONS: '' },
    { GITHUB_REPOSITORY: 'mgehling14/COMPASS' },
    { GITHUB_REF: 'refs/heads/topic' },
    { GITHUB_WORKFLOW_REF: `${REPO}/.github/workflows/local.yml@${MAIN}` },
    { VITE_DATAVERSE_ORG_URL: 'https://org2.crm.dynamics.com/' },
    { PUBLISHER_MODE: 'publish' },
    { GITHUB_SHA: 'cafe' },
    { REQUIRED_SHA: 'main' },
    { RECONCILE_COUNT: '6' },
    { PA_CLI_SP_TENANT_ID: 'another-tenant' },
    { PA_CLI_SP_CLIENT_ID: 'another-client' },
    { PA_CLI_SP_CLIENT_SECRET: '' },
  ]
  for (const env of cases) {
    const { receipt, events } = await simulate({ env })()
    assert.equal(receipt.result, 'failed', JSON.stringify(env))
    assert.ok(receipt.error)
    assert.deepEqual(events, [])
  }
})

test('rejects alternate remote URLs, a dirty checkout, invalid app configuration, and missing checkpoint ancestry', async () => {
  const cases = [
    [{ remote: { fetch: 'https://github.com/mgehling14/COMPASS.git' } }, /approved fetch URL/],
    [{ remote: { push: `https://github.com/${REPO}.git\nhttps://other.example/app.git` } }, /approved push URL/],
    [{ dirty: '?? untracked.txt' }, /must be clean/],
    [{ dirty: ' M tracked.ts' }, /must be clean/],
    [{ target: { appId: 'wrong' } }, /power.config.json/],
    [{ target: { environmentId: 'wrong' } }, /power.config.json/],
    [{ target: { buildPath: '../dist' } }, /power.config.json/],
    [{ target: { buildEntryPoint: 'other.html' } }, /power.config.json/],
    [{ ancestor: false }, /required checkpoint is absent/],
  ]
  for (const [options, error] of cases) {
    const { receipt, validations, events } = await simulate(options)()
    assert.match(receipt.error, error)
    assert.equal(validations, 0)
    assert.ok(!events.some(([step]) => step === 'upload'))
  }
})

test('fetch failure, failed validation, and files changed by validation all prevent upload', async () => {
  for (const options of [{ fail: 'fetch' }, { fail: 'validation' }, { dirtyAfterValidation: ' M power.config.json' }]) {
    const { receipt, events } = await simulate(options)()
    assert.ok(receipt.error)
    assert.equal(receipt.uploadAttempted, false)
    assert.equal(receipt.publishedSha, null)
    assert.ok(!events.some(([step]) => step === 'upload'))
  }
})

test('validates again when main moves, then uploads the rebuilt tip exactly once', async () => {
  const { receipt, events, checkouts } = await simulate({ tips: [FIRST, SECOND, SECOND, SECOND] })()
  assert.equal(checkouts, 2)
  assert.deepEqual(events.filter(([step]) => ['validate', 'upload'].includes(step)), [
    ['validate', FIRST], ['validate', SECOND], ['upload', SECOND],
  ])
  assert.equal(receipt.result, 'published')
  assert.equal(receipt.error, null)
  assert.equal(receipt.sourceSha, SECOND)
  assert.equal(receipt.publishedSha, SECOND)
  assert.equal(receipt.latestObservedMain, SECOND)
  assert.equal(receipt.requiredSha, EVENT)
  assert.equal(receipt.runtimeVerified, false)
  assert.equal(receipt.behind, false)
  assert.equal(receipt.clean, true)
  assert.equal(receipt.cliVersion, '1.4.2')
  assert.equal(receipt.timeZone, 'America/Phoenix')
  assert.equal(new Date(receipt.startedAt).toISOString(), receipt.startedAt)
  assert.equal(new Date(receipt.finishedAt).toISOString(), receipt.finishedAt)
  assert.ok(receipt.finishedAt >= receipt.startedAt)
})

test('stops after five validation attempts when main keeps changing', async () => {
  const tips = ['b', 'c', 'd', 'e', 'f', '1'].map(char => char.repeat(40))
  const { receipt, validations } = await simulate({ tips })()
  assert.equal(validations, 5)
  assert.match(receipt.error, /advanced through five validation attempts/)
  assert.equal(receipt.uploadAttempted, false)
})

test('verify mode needs no cloud credentials or CLI and cannot upload', async () => {
  const { receipt, events } = await simulate({
    env: { PUBLISHER_MODE: 'verify', GH_TOKEN: '', PA_CLI_SP_CLIENT_SECRET: '', REQUIRED_SHA: FIRST.toUpperCase() },
    tips: [FIRST, FIRST],
  })()
  assert.equal(receipt.result, 'verified')
  assert.equal(receipt.requiredSha, FIRST)
  assert.equal(receipt.cliVersion, null)
  assert.deepEqual(events, [['fetch'], ['checkout', FIRST], ['validate', FIRST], ['fetch']])
})

test('fails when upload success could not be observed and never retries the upload', async () => {
  const { receipt, events } = await simulate({ fail: 'upload' })()
  assert.equal(receipt.result, 'failed')
  assert.equal(receipt.uploadAttempted, true)
  assert.equal(receipt.publishedSha, null)
  assert.ok(receipt.error)
  assert.deepEqual(events.filter(([step]) => ['upload', 'dispatch'].includes(step)), [['upload', FIRST]])
})

test('dispatches reconciliation once after a newer main tip appears during upload', async () => {
  const { receipt, events } = await simulate({
    env: { REQUIRED_SHA: FIRST, RECONCILE_COUNT: '4' }, tips: [FIRST, FIRST, SECOND],
  })()
  assert.equal(receipt.result, 'reconciliation-enqueued')
  assert.equal(receipt.behind, true)
  assert.equal(receipt.enqueued, true)
  assert.equal(receipt.publishedSha, FIRST)
  assert.equal(receipt.latestObservedMain, SECOND)
  assert.deepEqual(events.filter(([step]) => ['upload', 'dispatch'].includes(step)), [
    ['upload', FIRST],
    ['dispatch', { mode: 'deploy', required_sha: FIRST, release_label: LABEL, reconcile_count: '5' }],
  ])
})

test('records an observed upload if main cannot be checked afterward', async () => {
  const { receipt, events } = await simulate({ fail: 'post-fetch' })()
  assert.equal(receipt.result, 'published-main-unconfirmed')
  assert.equal(receipt.publishedSha, FIRST)
  assert.equal(receipt.behind, null)
  assert.ok(receipt.error)
  assert.deepEqual(events.filter(([step]) => ['upload', 'dispatch'].includes(step)), [['upload', FIRST]])
})

test('reports a confirmed published SHA and behind status if reconciliation fails or reaches its cap', async () => {
  for (const options of [{ fail: 'dispatch' }, { env: { RECONCILE_COUNT: '5' } }]) {
    const { receipt, events } = await simulate({ ...options, tips: [FIRST, FIRST, SECOND] })()
    assert.equal(receipt.result, 'published-behind')
    assert.equal(receipt.publishedSha, FIRST)
    assert.equal(receipt.latestObservedMain, SECOND)
    assert.equal(receipt.behind, true)
    assert.equal(receipt.enqueued, false)
    assert.ok(receipt.error)
    assert.equal(events.filter(([step]) => step === 'upload').length, 1)
    assert.equal(events.filter(([step]) => step === 'dispatch').length, options.fail ? 1 : 0)
  }
})
