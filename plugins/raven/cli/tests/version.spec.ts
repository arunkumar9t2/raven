import { expect, test } from 'bun:test'
import { VERSION } from '../src/names'

const root = new URL('../../../../', import.meta.url)
const versionIn = async (path: string): Promise<string> =>
  ((await Bun.file(new URL(path, root)).json()) as { version: string }).version

test('the CLI, the plugin manifest and package.json carry one version', async () => {
  expect(await versionIn('plugins/raven/.claude-plugin/plugin.json')).toBe(VERSION)
  expect(await versionIn('package.json')).toBe(VERSION)
})
