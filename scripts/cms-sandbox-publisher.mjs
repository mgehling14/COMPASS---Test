import { spawnSync } from 'node:child_process'
import { glob, lstat, open, readFile, realpath } from 'node:fs/promises'
import { basename, dirname, isAbsolute, relative, resolve, sep } from 'node:path'
import { fileURLToPath } from 'node:url'

const REPOSITORY = 'mgehling14/COMPASS---Test'
const ORIGIN = `https://github.com/${REPOSITORY}`
const MAIN = 'refs/heads/main'
const WORKFLOW = 'cms-sandbox-publisher.yml'
const APP_ID = '77b2c86e-31b0-4dcf-a2e0-b4efd9d8ad26'
const TENANT_ID = '0528c75b-bb2a-4718-b02a-1902cc340b62'
const CLIENT_ID = '73bc2627-cca1-4fb3-ae3c-7a09dc83b202'
const ENVIRONMENT_ID = `Default-${TENANT_ID}`
const ORG_URL = 'https://org1f466e4e.crm.dynamics.com/'
const CLI_PACKAGE = '@microsoft/power-apps-cli'
const CLI_VERSION = '1.4.2'
const MAX_VALIDATIONS = 5
const MAX_RECONCILIATIONS = 5

class PublisherError extends Error {}

function requireCondition(condition, message) {
  if (!condition) throw new PublisherError(message)
}

function fullSha(value, name) {
  requireCondition(typeof value === 'string' && /^[0-9a-f]{40}$/i.test(value), `${name} must be a full Git commit SHA`)
  return value.toLowerCase()
}

function getRequest(env) {
  // GitHub Actions owns serialization. This only checks the expected workflow context.
  requireCondition(env.GITHUB_ACTIONS === 'true' && env.GITHUB_REPOSITORY === REPOSITORY
    && env.GITHUB_REF === MAIN
    && env.GITHUB_WORKFLOW_REF === `${REPOSITORY}/.github/workflows/${WORKFLOW}@${MAIN}`,
  'The publisher requires the COMPASS---Test main GitHub Actions workflow')
  requireCondition(env.VITE_DATAVERSE_ORG_URL === ORG_URL, 'VITE_DATAVERSE_ORG_URL must match the CMS Sandbox organization')
  requireCondition(env.PUBLISHER_MODE === 'verify' || env.PUBLISHER_MODE === 'deploy', 'PUBLISHER_MODE must be verify or deploy')
  const eventSha = fullSha(env.GITHUB_SHA, 'GITHUB_SHA')
  const count = env.RECONCILE_COUNT || '0'
  requireCondition(/^[0-5]$/.test(count), 'RECONCILE_COUNT must be between 0 and 5')
  return { requiredSha: fullSha(env.REQUIRED_SHA || eventSha, 'REQUIRED_SHA'), reconcileCount: Number(count) }
}

async function fetchMain(io) {
  for (const direction of [[], ['--push']]) {
    const { stdout } = await io.git(['remote', 'get-url', '--all', ...direction, 'origin'])
    requireCondition(stdout === ORIGIN || stdout === `${ORIGIN}.git`, 'origin must have exactly one approved fetch URL and one approved push URL')
  }
  await io.git(['fetch', '--no-tags', '--no-recurse-submodules', 'origin', MAIN], { network: true })
  const { stdout } = await io.git(['rev-parse', '--verify', 'FETCH_HEAD^{commit}'])
  return fullSha(stdout, 'Fetched main')
}

async function assertClean(io, receipt) {
  const { stdout } = await io.git(['status', '--porcelain=v1', '--untracked-files=all'])
  receipt.clean = stdout === ''
  requireCondition(receipt.clean, 'The checkout must be clean, including untracked files')
}

async function assertSource(io, receipt, candidate) {
  await assertClean(io, receipt)
  const { stdout: head } = await io.git(['rev-parse', '--verify', 'HEAD'])
  requireCondition(head === candidate, 'HEAD must match the selected main commit')
  const config = await io.readAppConfig()
  requireCondition(config?.appId === APP_ID && config.environmentId === ENVIRONMENT_ID
    && config.buildPath === './dist' && config.buildEntryPoint === 'index.html',
  'power.config.json must target the CMS Sandbox app and environment with ./dist/index.html')
  receipt.sourceSha = candidate
}

async function validateCurrentMain(io, receipt) {
  await assertClean(io, receipt)
  let candidate = await fetchMain(io)
  for (let attempt = 0; attempt < MAX_VALIDATIONS; attempt++) {
    receipt.latestObservedMain = candidate
    await assertClean(io, receipt)
    const { stdout: head } = await io.git(['rev-parse', '--verify', 'HEAD'])
    if (head !== candidate) {
      await io.git(['checkout', '--detach', '--no-overwrite-ignore', '--no-recurse-submodules', candidate])
    }
    await assertSource(io, receipt, candidate)
    const { stdout: checkpoint } = await io.git(['rev-parse', '--verify', `${receipt.requiredSha}^{commit}`])
    requireCondition(checkpoint === receipt.requiredSha, 'The required checkpoint must identify a commit')
    const { status } = await io.git(['merge-base', '--is-ancestor', receipt.requiredSha, candidate], { allowOne: true })
    requireCondition(status === 0, 'The required checkpoint is absent from the selected main history')
    await io.validate()
    const latest = await fetchMain(io)
    receipt.latestObservedMain = latest
    if (latest === candidate) {
      await assertSource(io, receipt, candidate)
      return
    }
    candidate = latest
  }
  throw new PublisherError('Main advanced through five validation attempts')
}

async function publish(io, receipt, reconcileCount, cliPath) {
  receipt.uploadAttempted = true
  await io.upload(cliPath)
  receipt.publishedSha = receipt.sourceSha
  receipt.result = 'published-main-unconfirmed'
  const latest = await fetchMain(io)
  receipt.latestObservedMain = latest
  receipt.behind = latest !== receipt.publishedSha
  if (!receipt.behind) {
    receipt.result = 'published'
    return
  }
  receipt.result = 'published-behind'
  requireCondition(reconcileCount < MAX_RECONCILIATIONS, 'Published source is behind main and the reconciliation limit was reached')
  await io.dispatch({
    mode: 'deploy',
    required_sha: receipt.requiredSha,
    release_label: receipt.requestLabel,
    reconcile_count: String(reconcileCount + 1),
  })
  receipt.enqueued = true
  receipt.result = 'reconciliation-enqueued'
}

export async function runPublisher(env, io) {
  const receipt = {
    repository: REPOSITORY,
    ref: MAIN,
    actor: env.GITHUB_ACTOR || null,
    runId: env.GITHUB_RUN_ID || null,
    runAttempt: env.GITHUB_RUN_ATTEMPT || null,
    startedAt: new Date().toISOString(),
    finishedAt: null,
    timeZone: 'America/Phoenix',
    requestLabel: env.RELEASE_LABEL || '',
    mode: env.PUBLISHER_MODE || null,
    appId: APP_ID,
    environmentId: ENVIRONMENT_ID,
    organizationUrl: ORG_URL,
    cliVersion: null,
    clean: null,
    requiredSha: null,
    sourceSha: null,
    publishedSha: null,
    latestObservedMain: null,
    uploadAttempted: false,
    behind: null,
    enqueued: false,
    runtimeVerified: false,
    result: 'failed',
    error: null,
  }
  let writeReceipt
  try {
    writeReceipt = await io.openReceipt()
    const { requiredSha, reconcileCount } = getRequest(env)
    receipt.requiredSha = requiredSha
    let cliPath
    if (receipt.mode === 'deploy') {
      requireCondition(env.PA_CLI_USE_SP_AUTH === 'true' && env.PA_CLI_SP_TENANT_ID === TENANT_ID
        && env.PA_CLI_SP_CLIENT_ID === CLIENT_ID && env.PA_CLI_SP_CLIENT_SECRET && env.GH_TOKEN,
      'Deploy requires the approved CMS Sandbox service principal and a GitHub token')
      cliPath = await io.resolveCli()
      receipt.cliVersion = CLI_VERSION
    }
    await validateCurrentMain(io, receipt)
    if (receipt.mode === 'deploy') {
      await publish(io, receipt, reconcileCount, cliPath)
    } else {
      receipt.result = 'verified'
    }
  } catch (error) {
    receipt.error = error instanceof PublisherError ? error.message : 'Unexpected publisher operation failure'
  } finally {
    receipt.finishedAt = new Date().toISOString()
    if (writeReceipt) {
      try {
        await writeReceipt(receipt)
      } catch {
        receipt.error = [receipt.error, 'Could not write the publisher receipt'].filter(Boolean).join('. ')
      }
    }
  }
  return receipt
}

function isOutside(root, path) {
  const difference = relative(root, path)
  return difference === '..' || difference.startsWith(`..${sep}`) || isAbsolute(difference)
}

function createRunnerIo(env, cwd) {
  const childEnv = Object.fromEntries(Object.entries(env).filter(([key]) =>
    !/^(?:pa_cli_|gh_token$|github_token$|actions_runtime_token$|actions_id_token_request_)/i.test(key)))

  function run(file, args, options = {}) {
    const { label, processEnv = childEnv, quiet = false, allowOne = false } = options
    const { status, stdout, error } = spawnSync(file, args, {
      cwd,
      env: processEnv,
      encoding: 'utf8',
      stdio: ['ignore', quiet ? 'pipe' : 'inherit', quiet ? 'ignore' : 'inherit'],
    })
    const allowed = status === 0 || (allowOne && status === 1)
    requireCondition(!error && allowed, `${label} failed${status === null ? '' : ` (exit ${status})`}`)
    return { status, stdout: stdout?.replace(/\r?\n$/, '') || '' }
  }

  return {
    git(args, { network = false, allowOne = false } = {}) {
      let processEnv = { ...childEnv, GIT_TERMINAL_PROMPT: '0' }
      if (network && env.GH_TOKEN) {
        processEnv = {
          ...processEnv,
          GIT_CONFIG_COUNT: '1',
          GIT_CONFIG_KEY_0: 'http.https://github.com/.extraheader',
          GIT_CONFIG_VALUE_0: `AUTHORIZATION: basic ${Buffer.from(`x-access-token:${env.GH_TOKEN}`).toString('base64')}`,
        }
      }
      const gitArgs = network ? ['-c', 'http.followRedirects=false', ...args] : args
      return run('git', gitArgs, { label: `git ${args[0]}`, processEnv, quiet: true, allowOne })
    },
    async readAppConfig() {
      try {
        const path = resolve(cwd, 'power.config.json')
        requireCondition((await lstat(path)).isFile(), 'power.config.json must be a regular file')
        return JSON.parse(await readFile(path, 'utf8'))
      } catch {
        throw new PublisherError('Could not read power.config.json as a regular JSON file')
      }
    },
    async validate() {
      run('npm', ['ci', '--ignore-scripts'], { label: 'npm ci' })
      run('npm', ['run', 'build'], { label: 'npm run build' })
      run('npm', ['run', 'lint'], { label: 'npm run lint' })
      const tests = []
      for await (const path of glob(['src/**/*.regression.test.mjs', 'scripts/*.test.mjs'], { cwd })) tests.push(path)
      requireCondition(tests.length > 0, 'The validation test files were absent')
      run(process.execPath, ['--test', ...tests.sort()], { label: 'Node validation tests' })
      const entry = resolve(cwd, 'dist/index.html')
      try {
        requireCondition((await lstat(entry)).isFile() && await realpath(entry) === entry, 'Invalid build entry')
      } catch {
        throw new PublisherError('Validation requires a regular dist/index.html in the checkout')
      }
    },
    async resolveCli() {
      try {
        requireCondition(isAbsolute(env.PA_CLI_PATH || ''), 'Invalid CLI path')
        const path = await realpath(env.PA_CLI_PATH)
        requireCondition(isOutside(cwd, path), 'CLI must be installed outside the checkout')
        const dir = dirname(dirname(path))
        const pkg = JSON.parse(await readFile(resolve(dir, 'package.json'), 'utf8'))
        requireCondition(pkg.name === CLI_PACKAGE && pkg.version === CLI_VERSION
          && resolve(dir, pkg.bin.pa) === path, 'Invalid CLI package')
        return path
      } catch {
        throw new PublisherError(`PA_CLI_PATH must identify the ${CLI_PACKAGE} ${CLI_VERSION} executable installed outside the checkout`)
      }
    },
    upload(cliPath) {
      run(process.execPath, [cliPath, 'app', 'push', '--non-interactive'], {
        label: 'Power Apps CLI upload',
        quiet: true,
        processEnv: {
          ...childEnv,
          PA_CLI_USE_SP_AUTH: env.PA_CLI_USE_SP_AUTH,
          PA_CLI_SP_CLIENT_ID: env.PA_CLI_SP_CLIENT_ID,
          PA_CLI_SP_CLIENT_SECRET: env.PA_CLI_SP_CLIENT_SECRET,
          PA_CLI_SP_TENANT_ID: env.PA_CLI_SP_TENANT_ID,
        },
      })
    },
    async dispatch(inputs) {
      let response
      try {
        response = await fetch(`https://api.github.com/repos/${REPOSITORY}/actions/workflows/${WORKFLOW}/dispatches`, {
          method: 'POST',
          redirect: 'error',
          signal: AbortSignal.timeout(15_000),
          headers: {
            Accept: 'application/vnd.github+json',
            Authorization: `Bearer ${env.GH_TOKEN}`,
            'Content-Type': 'application/json',
            'X-GitHub-Api-Version': '2022-11-28',
          },
          body: JSON.stringify({ ref: 'main', inputs }),
        })
      } catch {
        throw new PublisherError('Published source is behind main and reconciliation dispatch failed')
      }
      requireCondition(response.status === 204 || response.status === 200,
        `Published source is behind main and reconciliation dispatch failed (HTTP ${response.status})`)
    },
    async openReceipt() {
      try {
        requireCondition(isAbsolute(env.RECEIPT_PATH || ''), 'Invalid receipt path')
        const directory = await realpath(dirname(env.RECEIPT_PATH))
        const path = resolve(directory, basename(env.RECEIPT_PATH))
        requireCondition(isOutside(cwd, path), 'Receipt must be outside the checkout')
        const file = await open(path, 'wx', 0o600)
        return async (receipt) => {
          try {
            await file.writeFile(`${JSON.stringify(receipt, null, 2)}\n`)
          } finally {
            await file.close()
          }
        }
      } catch {
        throw new PublisherError('RECEIPT_PATH must identify a new writable file outside the checkout')
      }
    },
  }
}

if (process.argv[1] && resolve(process.argv[1]) === fileURLToPath(import.meta.url)) {
  const env = process.env
  const receipt = await runPublisher(env, createRunnerIo(env, await realpath(process.cwd())))
  if (receipt.error) {
    console.error(receipt.error)
    process.exitCode = 1
  } else {
    console.log(`CMS Sandbox publisher result: ${receipt.result} (${receipt.sourceSha})`)
  }
}
