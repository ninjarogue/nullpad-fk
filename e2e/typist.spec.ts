import { type Browser, type TestInfo, expect, test } from '@playwright/test'

import { type Divergence, type Snapshot, compare, openPair } from './typist/run'
import { scoutScript } from './typist/scout'
import {
  type Script,
  hex,
  label,
  namedScripts,
  sequenceSeed,
  show,
  shrink,
} from './typist/script'

const scoutMinutes = Number(process.env['TYPIST_SCOUT_MINUTES'] ?? 0)
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

const play = async (
  browser: Browser,
  baseURL: string | undefined,
  testInfo: TestInfo,
  seeds: Iterable<number>,
) => {
  const pair = await openPair(browser, baseURL ?? '')
  const accepted = new Map<string, number>()
  const failures: Array<string> = []
  let played = 0
  for (const seed of seeds) {
    played += 1
    const script = scoutScript(seed)
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
  const summary = `${played} scripts played, ${failures.length} failing, accepted differences: ${acceptedSummary || 'none'}`
  testInfo.annotations.push({ type: 'typist', description: summary })
  console.log(`${testInfo.title}: ${summary}`)
  await pair.close()
  expect(failures, failures.join('\n\n')).toEqual([])
}

/** Sequence indexes `shard`, `shard + shards`, and so on, until `minutes` pass from the first one asked for. */
function* sequencesUntil(shard: number, minutes: number) {
  const deadline = Date.now() + minutes * 60_000
  for (let index = shard; Date.now() < deadline; index += shards) {
    yield sequenceSeed(runSeed, index)
  }
}

if (replaySeed !== undefined) {
  test(`typist: the scout script of sequence seed ${replaySeed} matches a textarea`, async ({
    browser,
    baseURL,
  }, testInfo) => {
    test.setTimeout(300_000)
    console.log(`typist replay of sequence seed ${replaySeed}`)
    await play(browser, baseURL, testInfo, [Number(replaySeed)])
  })
} else if (scoutMinutes > 0) {
  for (let shard = 0; shard < shards; shard++) {
    test(`typist: scout scripts, shard ${shard + 1} of ${shards}, match a textarea`, async ({
      browser,
      baseURL,
    }, testInfo) => {
      test.setTimeout((scoutMinutes + 5) * 60_000)
      console.log(
        `typist scout run seed ${runSeed}, ${scoutMinutes} minutes (replay one script: TYPIST_REPLAY=<its sequence seed> pnpm test:typist)`,
      )
      await play(
        browser,
        baseURL,
        testInfo,
        sequencesUntil(shard, scoutMinutes),
      )
    })
  }
}
