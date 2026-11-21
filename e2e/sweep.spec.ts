import { expect, test } from '@playwright/test'

import { compare, openPair } from './typist/run'
import { show } from './typist/script'
import { rowsOf, sweeps } from './typist/sweeps'

const shards = Number(process.env['TYPIST_SHARDS'] ?? 8)
const beforeAMerge = process.env['NULLPAD_READY'] !== undefined

test.describe.configure({ mode: 'parallel' })

for (const sweep of sweeps) {
  const rows = rowsOf(sweep)

  test(`sweep: ${sweep.name}, holds ${sweep.scripts} scripts`, () => {
    expect(
      rows.length,
      `the grid changed size: set \`scripts\` to ${rows.length} if that is meant`,
    ).toBe(sweep.scripts)
  })

  for (let shard = 0; shard < shards; shard++) {
    const mine = rows.filter((_, index) => index % shards === shard)
    test(`sweep: ${sweep.name}, shard ${shard + 1} of ${shards}`, async ({
      browser,
      baseURL,
    }, testInfo) => {
      test.skip(
        sweep.runs === 'before a merge' && !beforeAMerge,
        'runs before a merge, pnpm test:ready',
      )
      test.setTimeout(60_000 + mine.length * 3_000)
      const pair = await openPair(browser, baseURL ?? '')
      const accepted = new Map<string, number>()
      const failures: Array<string> = []
      let threw = 0
      for (const row of mine) {
        const divergence = await compare(pair, row.script, row.from).catch(
          (error: unknown) => {
            threw += 1
            failures.push(
              `${row.document} | ${row.placement} | ${show(row.move)} | threw: ${String(error).split('\n')[0]}`,
            )
            return null
          },
        )
        if (divergence === null) {
          continue
        }
        if (divergence.accepted !== undefined) {
          accepted.set(
            divergence.accepted,
            (accepted.get(divergence.accepted) ?? 0) + 1,
          )
          continue
        }
        failures.push(
          `${row.document} | ${row.placement} | ${show(row.move)} | differs after step ${divergence.at + 1} of ${row.script.length} | nullpad ${divergence.nullpad.line}:${divergence.nullpad.column} textarea ${divergence.textarea.line}:${divergence.textarea.column} | text same: ${divergence.nullpad.text === divergence.textarea.text}`,
        )
      }
      await pair.close()
      const acceptedSummary = [...accepted]
        .map(([name, count]) => `${name}: ${count}`)
        .join(', ')
      const summary = `${mine.length} rows checked, ${failures.length - threw} differ, ${threw} threw, accepted differences: ${acceptedSummary || 'none'}`
      testInfo.annotations.push({ type: 'sweep', description: summary })
      console.log(
        `sweep "${sweep.name}" shard ${shard + 1} of ${shards}: ${summary}`,
      )
      expect(failures, failures.join('\n')).toEqual([])
    })
  }
}
