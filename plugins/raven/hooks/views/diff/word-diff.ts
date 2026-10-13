/** A run of a line: its text, and whether the other line lacks it. */
export type Seg = { text: string; changed: boolean }

/** A line with more word, space and punctuation tokens than this is changed whole (keeps the LCS table small). */
export const WORD_DIFF_MAX_TOKENS = 120

const TOKEN_RE = /\s+|\w+|[^\s\w]/gu

const tokensOf = (line: string): string[] => line.match(TOKEN_RE) ?? []

function pushSeg(segs: Seg[], text: string, changed: boolean): void {
  const last = segs.at(-1)
  if (last && last.changed === changed) last.text += text
  else segs.push({ text, changed })
}

const wholeOf = (line: string): Seg[] => (line === '' ? [] : [{ text: line, changed: true }])

/**
 * Marks which words of `oldLine` and `newLine` differ: a longest-common-subsequence over word,
 * space and single-punctuation tokens. Falls back to the whole line changed when either line is
 * over `WORD_DIFF_MAX_TOKENS` tokens, or when the two share no word (a shared space alone would
 * only speckle the line). The segments of a side always join back to that side's line.
 */
export function wordDiffOf(oldLine: string, newLine: string): { left: Seg[]; right: Seg[] } {
  if (oldLine === newLine) {
    const same: Seg[] = oldLine === '' ? [] : [{ text: oldLine, changed: false }]
    return { left: same, right: same.map(seg => ({ ...seg })) }
  }
  const a = tokensOf(oldLine)
  const b = tokensOf(newLine)
  const whole = { left: wholeOf(oldLine), right: wholeOf(newLine) }
  if (a.length > WORD_DIFF_MAX_TOKENS || b.length > WORD_DIFF_MAX_TOKENS) return whole

  const width = b.length + 1
  const table = new Array<number>((a.length + 1) * width).fill(0)
  const at = (i: number, j: number): number => table[i * width + j] ?? 0
  for (let i = a.length - 1; i >= 0; i--) {
    for (let j = b.length - 1; j >= 0; j--) {
      table[i * width + j] =
        a[i] === b[j] ? at(i + 1, j + 1) + 1 : Math.max(at(i + 1, j), at(i, j + 1))
    }
  }

  const left: Seg[] = []
  const right: Seg[] = []
  let sharesWord = false
  let i = 0
  let j = 0
  while (i < a.length && j < b.length) {
    const x = a[i] ?? ''
    const y = b[j] ?? ''
    if (x === y) {
      pushSeg(left, x, false)
      pushSeg(right, y, false)
      if (x.trim() !== '') sharesWord = true
      i += 1
      j += 1
    } else if (at(i + 1, j) >= at(i, j + 1)) {
      pushSeg(left, x, true)
      i += 1
    } else {
      pushSeg(right, y, true)
      j += 1
    }
  }
  for (; i < a.length; i++) pushSeg(left, a[i] ?? '', true)
  for (; j < b.length; j++) pushSeg(right, b[j] ?? '', true)

  return sharesWord ? { left, right } : whole
}
