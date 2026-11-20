import { expect, test } from '@playwright/test'

import { type Divergence, type Snapshot, compare, openPair } from './typist/run'
import {
  type Script,
  hex,
  label,
  namedScripts,
  randomScript,
  sequenceSeed,
  show,
  shrink,
} from './typist/script'

const sequences = Number(process.env['TYPIST_SEQUENCES'] ?? 240)
const shards = Number(process.env['TYPIST_SHARDS'] ?? 8)
const runSeed = Number(process.env['TYPIST_SEED'])
const replaySeed = process.env['TYPIST_REPLAY']

test.describe.configure({ mode: 'parallel' })

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

test('typist: every named script matches a textarea', async ({
  browser,
  baseURL,
}) => {
  const pair = await openPair(browser, baseURL ?? '')
  const failures: Array<string> = []
  for (const { name, script } of namedScripts) {
    const divergence = await compare(pair, script)
    if (divergence !== null) {
      failures.push(`named script "${name}"\n${describe(divergence)}`)
    }
  }
  await pair.close()
  expect(failures, failures.join('\n\n')).toEqual([])
})

const runs: ReadonlyArray<
  Readonly<{ title: string; seeds: ReadonlyArray<number> }>
> =
  replaySeed === undefined
    ? Array.from({ length: shards }, (_, shard) => ({
        title: `typist: random scripts, shard ${shard + 1} of ${shards}, match a textarea`,
        seeds: Array.from({ length: sequences }, (_, index) => index)
          .filter(index => index % shards === shard)
          .map(index => sequenceSeed(runSeed, index)),
      }))
    : [
        {
          title: `typist: the random script of sequence seed ${replaySeed} matches a textarea`,
          seeds: [Number(replaySeed)],
        },
      ]

for (const [shard, { title, seeds }] of runs.entries()) {
  test(title, async ({ browser, baseURL }, testInfo) => {
    test.setTimeout(60_000 + seeds.length * 3_000)
    console.log(
      replaySeed === undefined
        ? `typist run seed ${runSeed}, ${sequences} sequences (replay the run: TYPIST_SEED=${runSeed} pnpm test:typist)`
        : `typist replay of sequence seed ${replaySeed}`,
    )
    const pair = await openPair(browser, baseURL ?? '')
    const accepted = new Map<string, number>()
    const failures: Array<string> = []
    for (const seed of seeds) {
      const script = randomScript(seed)
      const divergence = await compare(pair, script)
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
      const failing = script.slice(0, divergence.at + 1)
      const stillFails = async (candidate: Script) => {
        const result = await compare(pair, candidate)
        return result !== null && result.accepted === undefined
      }
      const reproduces = await stillFails(failing)
      const shortest = reproduces ? await shrink(failing, stillFails) : failing
      const last = reproduces ? await compare(pair, shortest) : divergence
      failures.push(
        [
          `sequence seed ${seed} (replay: TYPIST_REPLAY=${seed} pnpm test:typist)`,
          `  typed:    ${show(failing)}`,
          reproduces
            ? `  shortest: ${show(shortest)}\n  as a named script: ${JSON.stringify(shortest)}`
            : '  did not fail again on replay, so it was not shrunk',
          describe(last ?? divergence),
        ].join('\n'),
      )
    }
    const acceptedSummary = [...accepted]
      .map(([name, count]) => `${name}: ${count}`)
      .join(', ')
    testInfo.annotations.push({
      type: 'typist',
      description: `${seeds.length} sequences, ${failures.length} failing, accepted differences: ${acceptedSummary || 'none'}`,
    })
    console.log(
      `shard ${shard + 1}: ${seeds.length} sequences, ${failures.length} failing, accepted: ${acceptedSummary || 'none'}`,
    )
    await pair.close()
    expect(failures, failures.join('\n\n')).toEqual([])
  })
}
