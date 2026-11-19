import { CLIENT_PROFILE_FIELDS, mapClientProfileSearchRows, type ClientProfileSearchPage } from './clientProfile'
import { createProgramSearchGateway, decodeProgramSearchCookie, xmlEscape, type ProgramSearchGateway } from './programTableSearch'
import { advancedFieldsFromMetadata, advancedSearchFetchXml, type AdvancedSearchCriterion } from './advancedSearch'

export function createClientAdvancedSearch(gateway: ProgramSearchGateway = createProgramSearchGateway()) {
  // Only cursors are cached, not client data. A new search always re-reads page one.
  const cursors = new Map<string, Map<number, string>>()
  return {
    clear() { cursors.clear() },
    async search(query: string, page: number, pageSize: number, criteria: AdvancedSearchCriterion[], signal: AbortSignal): Promise<ClientProfileSearchPage> {
      signal.throwIfAborted()
      if (!Number.isSafeInteger(page) || page < 1 || !Number.isSafeInteger(pageSize) || pageSize < 1 || pageSize > 100) throw new Error('Invalid client search page.')
      const clean = query.trim()
      if (clean.length > 250) throw new Error('Search text must be 250 characters or fewer.')
      const metadata = await gateway.metadata('client-profile', signal)
      const advanced = advancedSearchFetchXml(criteria, advancedFieldsFromMetadata(metadata, CLIENT_PROFILE_FIELDS, 'client-profile'))
      const readable = new Set(metadata.Attributes.filter((field) => field.IsValidForRead !== false).map((field) => field.LogicalName))
      if (!readable.has('cmps_isarchived')) throw new Error('Cannot verify the Client Profile archive filter.')
      const nameFields = ['cmps_name', 'cmps_middlename', 'cmps_lastname'].filter((field) => readable.has(field))
      const textFields = ['cmps_recordid', ...nameFields, 'cmps_hmisid'].filter((field) => readable.has(field))
      const escape = (value: string) => xmlEscape(value.replace(/\[/g, '[[]').replace(/%/g, '[%]').replace(/_/g, '[_]'))
      const contains = (field: string, value: string) => `<condition attribute="${field}" operator="like" value="%${escape(value)}%"/>`
      const conditions = clean ? textFields.map((field) => contains(field, clean)) : []
      const parts = clean.split(/\s+/).filter(Boolean)
      if (parts.length > 1 && nameFields.length) conditions.push(`<filter type="and">${parts.map((part) => `<filter type="or">${nameFields.map((field) => contains(field, part)).join('')}</filter>`).join('')}</filter>`)
      if (clean && !conditions.length) throw new Error('No readable client name or ID fields are available.')
      const quick = conditions.length ? `<filter type="or">${conditions.join('')}</filter>` : ''
      const identity = JSON.stringify([metadata.EntitySetName, clean, criteria, pageSize])
      if (page === 1 || !cursors.has(identity)) {
        if (cursors.size >= 16) cursors.delete(cursors.keys().next().value!)
        cursors.set(identity, new Map([[1, '']]))
      }
      const pages = cursors.get(identity)!
      let current = pages.has(page) ? page : Math.max(...[...pages.keys()].filter((key) => key <= page))
      const seen = new Set<string>()
      while (current <= page) {
        signal.throwIfAborted()
        const cookie = pages.get(current) || ''
        if (cookie) seen.add(cookie)
        const columns = [metadata.PrimaryIdAttribute, 'cmps_recordid', ...nameFields, 'cmps_hmisid', 'cmps_dateofbirth', 'cmps_primarylanguage', 'cmps_gender', 'cmps_alertlist', 'cmps_alertlistreason', 'cmps_isarchived'].filter((field) => field === metadata.PrimaryIdAttribute || readable.has(field))
        const fetchXml = `<fetch count="${pageSize}" page="${current}"${cookie ? ` paging-cookie="${xmlEscape(cookie)}"` : ''}><entity name="${metadata.LogicalName}">${[...new Set(columns)].map((field) => `<attribute name="${field}"/>`).join('')}<order attribute="${metadata.PrimaryIdAttribute}"/><filter type="and"><filter type="or"><condition attribute="cmps_isarchived" operator="ne" value="125570000"/><condition attribute="cmps_isarchived" operator="null"/></filter>${quick}${advanced}</filter></entity></fetch>`
        const payload = await gateway.query(metadata, fetchXml, signal)
        signal.throwIfAborted()
        const rows = Array.isArray(payload) ? payload : payload?.value
        if (!Array.isArray(rows)) throw new Error('Dataverse did not return a client search page.')
        const more = payload?.['@Microsoft.Dynamics.CRM.morerecords'] === true || payload?.['@Microsoft.Dynamics.CRM.morerecords'] === 'true'
        const nextCookie = more ? decodeProgramSearchCookie(payload?.['@Microsoft.Dynamics.CRM.fetchxmlpagingcookie']) : ''
        if (more && (!rows.length || seen.has(nextCookie))) throw new Error('Client search returned an invalid or repeated page.')
        if (more) pages.set(current + 1, nextCookie)
        const mapped = mapClientProfileSearchRows(rows.filter((row: any) => Number(row.cmps_isarchived) !== 125570000))
        const ids = new Set<string>()
        for (const row of mapped) {
          if (!/^[a-f\d]{8}(?:-[a-f\d]{4}){3}-[a-f\d]{12}$/i.test(row.id) || ids.has(row.id)) throw new Error('Client search returned invalid or duplicate records.')
          ids.add(row.id)
        }
        if (current === page) return { rows: mapped, hasNext: more }
        if (!more) return { rows: [], hasNext: false }
        current++
      }
      return { rows: [], hasNext: false }
    },
  }
}

