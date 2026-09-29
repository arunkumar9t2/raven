const FRAGMENT = /#.*$/
const HTTP = /^https?:/i
const FILE_SCHEME = /^file:\/\//i

/**
 * Where a Markdown link in a doc shown at `docPath` opens in the Doc view: a relative or `file:`
 * link to a file, resolved against `docPath`'s directory; null for a link the pane leaves alone
 * (an `http(s):` link, or a bare `#fragment`).
 */
export function resolveDocLink(docPath: string, href: string): string | null {
  const target = href.replace(FRAGMENT, '')
  if (target === '' || HTTP.test(target)) return null
  const raw = FILE_SCHEME.test(target) ? target.replace(FILE_SCHEME, '') : target
  if (raw.startsWith('/')) return normalize(raw)
  const dir = docPath.slice(0, docPath.lastIndexOf('/') + 1)
  return normalize(dir + raw)
}

function normalize(path: string): string {
  const stack: string[] = []
  for (const part of path.split('/')) {
    if (part === '' || part === '.') continue
    if (part === '..') stack.pop()
    else stack.push(part)
  }
  return `/${stack.join('/')}`
}

/** The `href`s of Markdown links in `markdown` that `resolveDocLink` would open in the Doc view. */
export function docLinksOf(docPath: string, markdown: string): string[] {
  const hrefs = new Set<string>()
  for (const match of markdown.matchAll(/]\(([^)]+)\)/g)) {
    const href = match[1]
    if (href && resolveDocLink(docPath, href) !== null) hrefs.add(href)
  }
  return [...hrefs]
}
