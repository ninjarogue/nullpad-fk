import {
  type PlaceNote,
  brokenRules,
  placeNotes,
  readOutline,
} from './markdown/places'
import { expect, test } from './pane'

const shards = Number(process.env['MARKDOWN_SHARDS'] ?? 4)
const longestReport = 12

test.describe.configure({ mode: 'parallel' })

let notes: ReadonlyArray<PlaceNote> | undefined

for (let shard = 0; shard < shards; shard++) {
  test(`outline places: every node keeps the place rules, notes ${shard + 1} of ${shards}`, async ({
    pane,
  }, testInfo) => {
    notes ??= placeNotes()
    const mine = notes.filter((_, index) => index % shards === shard)
    test.setTimeout(60_000 + mine.length * 10_000)
    const broken = new Map<string, Array<string>>()
    let checked = 0
    for (const note of mine) {
      const rows = readOutline(await pane.paste(note.markdown, 'outline'))
      checked += rows.length
      for (const message of brokenRules(note.markdown, rows)) {
        const rule = message.split(' | ')[0] ?? message
        broken.set(rule, [
          ...(broken.get(rule) ?? []),
          `${note.label} | ${message.slice(rule.length + 3)}`,
        ])
      }
    }
    const summary = `${mine.length} notes, ${checked} rows checked, ${broken.size} rules broken`
    testInfo.annotations.push({ type: 'outline places', description: summary })
    console.log(`outline places, notes ${shard + 1} of ${shards}: ${summary}`)
    expect(
      broken.size,
      `${summary}\n${[...broken]
        .map(
          ([rule, found]) =>
            `${rule}: ${found.length}\n  ${found.slice(0, 3).join('\n  ')}`,
        )
        .join('\n')
        .split('\n')
        .slice(0, longestReport * 4)
        .join('\n')}\n`,
    ).toBe(0)
  })
}
