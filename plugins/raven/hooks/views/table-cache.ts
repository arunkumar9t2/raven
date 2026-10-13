import type { Style } from '../ui/style'
import { type DrawnLine, drawnRowsOf, layoutTable } from '../ui/table-layout'
import type { TableBlock } from './markdown-chunks'

/** The two `Style` fields a table draws by. */
export type TableLook = Pick<Style, 'table' | 'tableCorners'>

export type TableCache = {
  /** A table's drawn rows at `width` (at least 1) in `look`, laid out once per width and look. */
  rowsOf: (block: TableBlock, width: number, look: TableLook) => DrawnLine[]
}

/**
 * A table's layout costs more than drawing it, so each block keeps its last result; the key is
 * the width and the look (mode and corners), so a changed pane width or `cardStyle` lays it out
 * again rather than drawing stale rows.
 */
export function createTableCache(): TableCache {
  const cache = new WeakMap<TableBlock, { key: string; rows: DrawnLine[] }>()
  return {
    rowsOf(block, width, look) {
      const key = `${width}:${look.table}:${look.tableCorners}`
      const hit = cache.get(block)
      if (hit && hit.key === key) return hit.rows
      const rows = drawnRowsOf(
        layoutTable(block, Math.max(1, width), look.table),
        look.tableCorners,
      )
      cache.set(block, { key, rows })
      return rows
    },
  }
}
