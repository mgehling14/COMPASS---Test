import { environmentId, connectionReferences } from '../../power.config.json'

function sameOrganization(configured: URL, next: URL): boolean {
  const host = configured.hostname.match(/^([a-z\d-]+)\.(?:api\.)?(crm\d*\.(?:dynamics\.com|microsoftdynamics\.us|dynamics\.cn)|crm\.appsplatform\.us)$/i)
  return next.origin === configured.origin || (!!host && next.port === configured.port
    && [`${host[1]}.${host[2]}`, `${host[1]}.api.${host[2]}`].includes(next.hostname))
}

export type DataverseContinuation =
  | { kind: 'dataverse'; url: URL }
  | { kind: 'connector'; url: URL; organization: string; next: string }

// Connector links wrap a Dataverse route in organization/next query parameters.
// Only accept this app's configured environment and Dataverse connection. The
// SDK uses its bound connection; never fetch the wrapper with a Dataverse token.
export function parseRuntimeDataverseContinuation(link: string, organization: string, entitySetName: string): DataverseContinuation {
  let outer: URL
  try { outer = new URL(link, `${new URL(organization).origin}/`) } catch {
    return { kind: 'dataverse', url: parseDataverseContinuation(link, organization, entitySetName) }
  }
  if (!outer.pathname.endsWith('/nextLink')) return { kind: 'dataverse', url: parseDataverseContinuation(link, organization, entitySetName) }
  const endpoint = `${outer.origin}${outer.pathname}`.slice(0, 220)
  const reject = (reason: string): never => {
    throw new Error(`Invalid continuation link for ${entitySetName}: ${reason} (endpoint ${endpoint}; paging cookie omitted). Migration stopped rather than skipping records.`)
  }
  const compactEnvironment = environmentId.replaceAll('-', '').toLowerCase()
  const expectedHost = `${compactEnvironment.slice(0, -2)}.${compactEnvironment.slice(-2)}.environment.api.powerplatform.com`
  if (outer.protocol !== 'https:' || outer.username || outer.password || outer.hash || outer.port || outer.hostname !== expectedHost) reject('connector environment does not match this app')
  const route = outer.pathname.match(/^\/connectors\/runtime\/invoke\/scalegroups\/[a-z\d-]+\/shards\/[a-z\d-]+\/apis\/commondataserviceforapps\/connections\/([a-z\d-]+)\/nextLink$/i)
  const connections = Object.values(connectionReferences).filter((entry) => entry.id === '/providers/Microsoft.PowerApps/apis/shared_commondataserviceforapps')
    .map((entry) => entry.sharedConnectionId.split('/').pop())
  if (!route || !connections.includes(route[1])) reject('connector route or connection does not match this app')
  const organizations = outer.searchParams.getAll('organization')
  const routes = outer.searchParams.getAll('next')
  if (organizations.length !== 1 || !organizations[0] || routes.length !== 1 || !routes[0]) reject('exactly one organization and continuation route are required')
  let wrappedOrganization: URL
  try { wrappedOrganization = new URL(organizations[0]) } catch { return reject('malformed connector organization') }
  if (wrappedOrganization.protocol !== 'https:' || wrappedOrganization.username || wrappedOrganization.password || wrappedOrganization.hash
    || wrappedOrganization.search || wrappedOrganization.pathname !== '/' || !sameOrganization(new URL(organization), wrappedOrganization)) reject('connector organization does not match the configured Dataverse organization')
  // Decode only the wrapper query layer. Leave the original nested route and
  // its encoded cookie intact; the SDK encodes the next parameter once.
  const url = parseDataverseContinuation(routes[0], organization, entitySetName)
  return { kind: 'connector', url, organization: organizations[0], next: routes[0] }
}

// Dataverse's application and API URLs can name the same organization using
// org.crm.dynamics.com and org.api.crm.dynamics.com. Never trust other tenants.
export function parseDataverseContinuation(link: string, organization: string, entitySetName: string): URL {
  let configured: URL
  let next: URL
  try {
    configured = new URL(organization)
    next = new URL(link, `${configured.origin}/`)
  } catch {
    throw new Error(`Invalid continuation link for ${entitySetName}: malformed URL. Migration stopped rather than skipping records.`)
  }
  // Diagnostics deliberately omit the query, which can contain record IDs
  // inside the opaque paging cookie. Keep that cookie unchanged for requests.
  const endpoint = `${next.origin}${next.pathname}`.slice(0, 220)
  const reject = (reason: string): never => {
    throw new Error(`Invalid continuation link for ${entitySetName}: ${reason} (endpoint ${endpoint}; paging cookie omitted). Migration stopped rather than skipping records.`)
  }
  if (configured.protocol !== 'https:' || next.protocol !== 'https:' || next.username || next.password || next.hash) reject('HTTPS without credentials or a fragment is required')
  if (!sameOrganization(configured, next)) reject('host does not belong to the configured Dataverse organization')
  const path = next.pathname.match(/^\/api\/data\/v9\.(?:0|1|2)(?:\.0)?\/([^/]+)\/?$/)
  if (!path || path[1] !== entitySetName) reject('API version or table does not match the requested table')
  const tokens = next.searchParams.getAll('$skiptoken')
  if (tokens.length !== 1 || !tokens[0]) reject('exactly one non-empty continuation token is required')
  return next
}

// Comparing the opaque token also catches a repeated page whose hostname or
// API-version spelling changed. Non-URL cursors support alternate gateways.
export function continuationPageKey(link: string): string {
  try {
    const url = new URL(link, 'https://paging.invalid/')
    const next = url.searchParams.get('next')
    return (next ? new URL(next, 'https://paging.invalid/') : url).searchParams.get('$skiptoken') || link
  } catch { return link }
}
