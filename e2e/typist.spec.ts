import { expect, test } from '@playwright/test'

import { type Divergence, type Snapshot, compare, openPair } from './typist/run'
import { hex, label, namedScripts } from './typist/script'

const rowsOf = (snapshot: Snapshot) =>
  snapshot.rows === undefined
    ? ''
    : `, rows start at ${JSON.stringify(snapshot.rows)}`

const describe = (divergence: Divergence): string =>
  [
    `after step ${divergence.at + 1} ${label(divergence.step)}`,
    `  nullpad  ${JSON.stringify(divergence.nullpad.text)} [${hex(divergence.nullpad.text)}] at ${divergence.nullpad.line}:${divergence.nullpad.column}${rowsOf(divergence.nullpad)}`,
    `  textarea ${JSON.stringify(divergence.textarea.text)} [${hex(divergence.textarea.text)}] at ${divergence.textarea.line}:${divergence.textarea.column}${rowsOf(divergence.textarea)}`,
  ].join('\n')

test('typist: every named script matches a textarea, with Backspace as an EditContext takes it, but for a known malformed sequence', async ({
  browser,
  baseURL,
}) => {
  const pair = await openPair(browser, baseURL ?? '')
  const failures: Array<string> = []
  for (const { name, script } of namedScripts) {
    const divergence = await compare(pair, script)
    if (divergence !== null && divergence.accepted === undefined) {
      failures.push(`named script "${name}"\n${describe(divergence)}`)
    }
  }
  await pair.close()
  expect(failures, failures.join('\n\n')).toEqual([])
})
