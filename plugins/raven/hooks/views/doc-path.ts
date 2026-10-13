import { widthOf } from '../ui/wrap'

/** Cells the Doc view's title and heading rows keep free at the pane's right edge. */
export const TITLE_EDGE_CELLS = 1
/** Cells between the title and its dimmed path. */
const TITLE_GAP = 2

const ELLIPSIS = '…'
/** The least a shortened path can usefully say: `….md`. Below this the path is dropped. */
const MIN_PATH_CELLS = 4

/** The last characters of `text` that fit in `cells` display cells. */
function tailOf(text: string, cells: number): string {
  const chars = Array.from(text)
  let used = 0
  let start = chars.length
  while (start > 0) {
    const cost = widthOf(chars[start - 1] as string)
    if (used + cost > cells) break
    used += cost
    start -= 1
  }
  return chars.slice(start).join('')
}

/**
 * `path` cut from the left to fit `width` cells: whole leading segments go behind a `…/`
 * (`…/scratchpad/raven-ui-decisions.md`); when even the last segment does not fit, the segment's
 * end follows a bare `…`. A path that fits is unchanged. Under 4 cells the result is `''`.
 */
export function shortenPath(path: string, width: number): string {
  if (width < MIN_PATH_CELLS) return ''
  if (widthOf(path) <= width) return path
  const segments = path.split('/').filter(each => each !== '')
  let tail = ''
  for (let i = segments.length - 1; i >= 0; i--) {
    const next = tail === '' ? (segments[i] as string) : `${segments[i]}/${tail}`
    if (widthOf(`${ELLIPSIS}/${next}`) > width) break
    tail = next
  }
  if (tail !== '') return `${ELLIPSIS}/${tail}`
  return `${ELLIPSIS}${tailOf(segments[segments.length - 1] ?? path, width - 1)}`
}

/**
 * The path the title row draws: `label` shortened to what is left of `columns` after the title's
 * own `leftCells`, the gap before the path and the reserved edge cell.
 */
export function titlePathOf(label: string, columns: number, leftCells: number): string {
  return shortenPath(label, columns - TITLE_EDGE_CELLS - leftCells - TITLE_GAP)
}
