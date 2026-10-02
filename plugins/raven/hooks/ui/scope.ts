/**
 * A stable string of 1 to 64 characters, with no control character, for any `key` — the
 * engine's `BoxHoverProps.scope` / `TextHoverProps.scope` limit (types/claude-code.d.ts
 * ≈715–724, ≈11814–11823: "One to 64 characters, no control characters"). A short, clean key
 * passes through unchanged; everything else (too long, or carrying a control character — a git
 * path can contain a tab or newline) becomes a fixed prefix of the key plus a deterministic
 * hash, so distinct long keys still land in distinct, stable groups.
 *
 * No Node crypto (the mod sandbox has none) — FNV-1a's 32-bit variant, base36, is a few lines of
 * plain arithmetic and good enough for a hover group's identity (collisions only ever merge two
 * unrelated rows' hover lighting, never crash anything).
 */

const MAX_SCOPE_LENGTH = 64
/** `:` plus a `uint32` in base36, left-padded so every hash renders the same width. */
const HASH_SUFFIX_LENGTH = 8
const PREFIX_LENGTH = MAX_SCOPE_LENGTH - HASH_SUFFIX_LENGTH

// Two regexes, not one shared global one: a global regex's `.test()` carries `lastIndex`
// between calls, so a single `/\p{Cc}/gu` reused for both `.test()` (in `scopeOf`, called once
// per key) and `.replace()` would silently skip control characters on a later call.
/** C0, DEL, and every other `\p{Cc}` control character — the engine's own "no control characters" rule. */
const HAS_CONTROL_CHAR = /\p{Cc}/u
const CONTROL_CHARS = /\p{Cc}/gu

function fnv1a32(key: string): number {
  let hash = 0x811c9dc5
  for (let i = 0; i < key.length; i++) {
    hash ^= key.charCodeAt(i)
    hash = Math.imul(hash, 0x01000193)
  }
  return hash >>> 0
}

/**
 * The first `maxUnits` UTF-16 units of `key`, cut on a code-point boundary: iterating by code
 * point (`for...of` on a string never splits a surrogate pair) and stopping before a code point
 * whose own units would push the result past `maxUnits`, so a pair that straddles the cut is
 * dropped whole rather than split into a lone surrogate.
 */
function codePointPrefix(key: string, maxUnits: number): string {
  let prefix = ''
  for (const codePoint of key) {
    if (prefix.length + codePoint.length > maxUnits) break
    prefix += codePoint
  }
  return prefix
}

/** `key.length <= 64` with no control character is returned as-is; otherwise a `maxUnits`-unit, control-char-free prefix of `key` plus `:<hash>`. */
export function scopeOf(key: string): string {
  if (key.length > 0 && key.length <= MAX_SCOPE_LENGTH && !HAS_CONTROL_CHAR.test(key)) return key
  const hash = fnv1a32(key)
    .toString(36)
    .padStart(HASH_SUFFIX_LENGTH - 1, '0')
  const prefix = codePointPrefix(key, PREFIX_LENGTH).replace(CONTROL_CHARS, '_')
  return `${prefix}:${hash}`
}
