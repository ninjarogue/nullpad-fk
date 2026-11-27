import { type Row, sweeps } from './burst/sweeps'
import {
  type Frames,
  type Nullpad,
  expect,
  openFresh,
  settle,
  test,
} from './nullpad'

const shards = Number(process.env['BURST_SHARDS'] ?? 4)
const onDemand = process.env['NULLPAD_ALL'] !== undefined

test.describe.configure({ mode: 'parallel' })

const play = async (nullpad: Nullpad, step: Frames[number][number]) => {
  if ('press' in step) {
    await nullpad.press(step.press, step.times ?? 1)
  } else if ('type' in step) {
    await nullpad.type(step.type)
  } else if ('wheel' in step) {
    await nullpad.wheel(step.wheel)
  } else {
    throw new Error('a sweep row plays presses, typing and wheel turns')
  }
}

const shown = async (nullpad: Nullpad) => {
  await settle(nullpad.page)
  const screen = await nullpad.screen()
  const top = screen.rows[0]
  return {
    status: `${screen.status.line}:${screen.status.column} ${screen.status.lineCount}L`,
    top: top === undefined ? 'none' : `${top.number ?? '~'}@${top.start}`,
    cursorRow: screen.cursor?.row,
    cursorOnScreen: screen.cursor?.inside,
  }
}

for (const sweep of sweeps) {
  test(`sweep: ${sweep.name}, holds ${sweep.scripts} scripts`, () => {
    expect(
      sweep.rows.length,
      `the grid changed size: set \`scripts\` to ${sweep.rows.length} if that is meant`,
    ).toBe(sweep.scripts)
  })

  for (let shard = 0; shard < shards; shard++) {
    const mine: ReadonlyArray<Row> = sweep.rows.filter(
      (_, index) => index % shards === shard,
    )
    test(`sweep: ${sweep.name}, shard ${shard + 1} of ${shards}`, async ({
      nullpad,
    }, testInfo) => {
      test.skip(
        sweep.runs === 'on demand' && !onDemand,
        'runs on demand, pnpm test:all',
      )
      test.setTimeout(60_000 + mine.length * 15_000)
      const failures: Array<string> = []
      const prepare = async (row: Row) => {
        const document = sweep.documents[row.document]
        if (document === undefined) {
          throw new Error(`no document named ${row.document}`)
        }
        await nullpad.paste(document.note)
        if (document.vim) {
          await nullpad.press('Control+,')
        }
        for (const step of row.setup) {
          await play(nullpad, step)
        }
      }
      for (const row of mine) {
        await prepare(row)
        for (const frame of row.burst) {
          for (const step of frame) {
            await play(nullpad, step)
          }
        }
        const slow = await shown(nullpad)
        await openFresh(nullpad.page)
        await prepare(row)
        await nullpad.burst(row.burst)
        const fast = await shown(nullpad)
        if (JSON.stringify(slow) !== JSON.stringify(fast)) {
          failures.push(
            `${row.document} | ${row.frames} | slow ${JSON.stringify(slow)} | burst ${JSON.stringify(fast)}`,
          )
        }
        await openFresh(nullpad.page)
      }
      const summary = `${mine.length} rows checked, ${failures.length} differ`
      testInfo.annotations.push({ type: 'sweep', description: summary })
      console.log(
        `sweep "${sweep.name}" shard ${shard + 1} of ${shards}: ${summary}`,
      )
      expect(failures, failures.join('\n')).toEqual([])
    })
  }
}
