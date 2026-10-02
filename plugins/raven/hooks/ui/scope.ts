/**
 * A stable string of 1 to 64 characters for any `key` — the engine's `BoxHoverProps.scope` /
 * `TextHoverProps.scope` limit (types/claude-code.d.ts ≈715–724, ≈11814–11823: "One to 64
 * characters, no control characters"). A short key passes through unchanged; a long one (a real
 * file path joined with a git hunk header, easily past 64 chars) becomes a fixed prefix of the
 * key plus a deterministic hash, so distinct long keys still land in distinct, stable groups.
 *
 * No Node crypto (the mod sandbox has none) — FNV-1a's 32-bit variant, base36, is a few lines of
 * plain arithmetic and good enough for a hover group's identity (collisions only ever merge two
 * unrelated rows' hover lighting, never crash anything).
 */

const MAX_SCOPE_LENGTH = 64
/** `:` plus a `uint32` in base36, left-padded so every hash renders the same width. */
const HASH_SUFFIX_LENGTH = 8
const PREFIX_LENGTH = MAX_SCOPE_LENGTH - HASH_SUFFIX_LENGTH

function fnv1a32(key: string): number {
  let hash = 0x811c9dc5
  for (let i = 0; i < key.length; i++) {
    hash ^= key.charCodeAt(i)
    hash = Math.imul(hash, 0x01000193)
  }
  return hash >>> 0
}

/** `key.length <= 64` is returned as-is; otherwise a 56-char prefix of `key` plus `:<hash>`. */
export function scopeOf(key: string): string {
  if (key.length > 0 && key.length <= MAX_SCOPE_LENGTH) return key
  const hash = fnv1a32(key)
    .toString(36)
    .padStart(HASH_SUFFIX_LENGTH - 1, '0')
  const prefix = key.slice(0, PREFIX_LENGTH)
  return `${prefix}:${hash}`
}
