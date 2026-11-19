import { parseRuntimeDataverseContinuation, continuationPageKey } from './dataverseContinuation'

type PageRequest = (parameters: Record<string, unknown>, url: string) => Promise<unknown>

// Keep reads scoped to their original lookup filter on every page. Never fall
// back to the first few hundred rows of a large, unrelated table.
export async function readDataverseRecordPages(
  organization: string,
  tableAlias: string,
  query: Record<string, unknown>,
  runtime: boolean,
  request: PageRequest,
): Promise<Array<Record<string, unknown>>> {
  const records: Array<Record<string, unknown>> = []
  const seen = new Set<string>()
  let nextLink = ''
  do {
    const parameters = { ...query }
    let url = ''
    if (nextLink) {
      const continuation = parseRuntimeDataverseContinuation(nextLink, organization, tableAlias)
      url = continuation.url.href
      if (runtime && continuation.kind === 'connector') {
        parameters.organization = continuation.organization
        parameters.next = continuation.next
      } else parameters['$skiptoken'] = continuation.url.searchParams.get('$skiptoken')
    }
    const payload: any = await request(parameters, url)
    const rows = Array.isArray(payload) ? payload : payload?.value
    if (!Array.isArray(rows)) throw new Error(`Dataverse did not return a record page for ${tableAlias}.`)
    nextLink = String(payload?.['@odata.nextLink'] || payload?.['odata.nextLink'] || '').trim()
    if (nextLink) {
      parseRuntimeDataverseContinuation(nextLink, organization, tableAlias)
      const key = continuationPageKey(nextLink)
      if (seen.has(key)) throw new Error(`Dataverse returned a repeated record page for ${tableAlias}.`)
      seen.add(key)
    }
    records.push(...rows)
  } while (nextLink)
  return records
}
