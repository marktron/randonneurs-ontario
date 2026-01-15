/**
 * Returns data attributes for debugging database entities in development mode.
 * In production, returns an empty object so no attributes are added.
 *
 * Usage: <span {...devData('awards', award.id)} className="...">
 */
export function devData(table: string, id: string | number | undefined) {
  if (process.env.NODE_ENV !== 'development' || !id) return {}
  return {
    'data-dev-table': table,
    'data-dev-id': String(id),
  }
}
