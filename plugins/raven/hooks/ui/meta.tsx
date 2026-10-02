/* @jsxRuntime classic */
/* @jsx h */
/* @jsxFrag Fragment */
import type { RenderElement } from 'claude-code'

import type { Kit } from '../core/view'

/** Dim `·`-joined metadata — a line number and an age, a source and a ref. Empty parts drop out. */
export function meta(kit: Kit, parts: readonly string[]): RenderElement {
  const { Text } = kit.ui
  return <Text dimColor>{parts.filter(part => part !== '').join(' · ')}</Text>
}
