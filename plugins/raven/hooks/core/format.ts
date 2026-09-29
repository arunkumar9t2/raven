/** `n` and a pluralized noun: `1 comment` / `2 comments`. */
export function countOf(n: number, singular: string, plural: string = `${singular}s`): string {
  return `${n} ${n === 1 ? singular : plural}`
}
