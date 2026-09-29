import { stat } from 'node:fs/promises'
import { type Io, run } from './commands'

async function exists(path: string): Promise<'file' | 'dir' | null> {
  try {
    const info = await stat(path)
    return info.isDirectory() ? 'dir' : 'file'
  } catch {
    return null
  }
}

const io: Io = {
  cwd: process.cwd(),
  stdout: s => process.stdout.write(s),
  stderr: s => process.stderr.write(s),
  readStdin: () => Bun.stdin.text(),
  exists,
}

process.exit(await run(process.argv.slice(2), io))
