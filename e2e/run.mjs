import { spawnSync } from 'node:child_process'
import {
  existsSync,
  mkdirSync,
  readFileSync,
  readdirSync,
  rmSync,
  symlinkSync,
} from 'node:fs'
import { createRequire } from 'node:module'
import { tmpdir } from 'node:os'
import { dirname, join } from 'node:path'

const require = createRequire(import.meta.url)
const { browsers } = JSON.parse(
  readFileSync(
    join(
      dirname(require.resolve('playwright-core/package.json')),
      'browsers.json',
    ),
    'utf8',
  ),
)
const builds = [
  ['chromium', 'chromium'],
  ['chromium-headless-shell', 'chromium_headless_shell'],
  ['ffmpeg', 'ffmpeg'],
].map(([name, folder]) => ({
  folder,
  revision: browsers.find(browser => browser.name === name).revision,
}))

const env = { ...process.env, E2E_TELEMETRY_DISABLED: '1' }
const cache = process.env.PLAYWRIGHT_BROWSERS_PATH

if (
  cache &&
  builds.some(
    ({ folder, revision }) => !existsSync(join(cache, `${folder}-${revision}`)),
  )
) {
  const links = join(tmpdir(), 'nullpad-fk-browsers')
  rmSync(links, { recursive: true, force: true })
  mkdirSync(links)
  for (const { folder, revision } of builds) {
    const installed = readdirSync(cache).find(entry =>
      entry.startsWith(`${folder}-`),
    )
    if (installed) {
      symlinkSync(join(cache, installed), join(links, `${folder}-${revision}`))
    }
  }
  env.PLAYWRIGHT_BROWSERS_PATH = links
}

rmSync('.e2e/report.json', { force: true })
const result = spawnSync(
  'npx',
  ['e2e', 'run', '--retries', '0', ...process.argv.slice(2)],
  { stdio: 'inherit', env },
)
process.exitCode = result.status ?? 1
