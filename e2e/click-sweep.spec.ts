import { expect, test } from './nullpad'

const note = [
  'short line',
  '',
  Array.from({ length: 30 }, (_, i) => `word${i}`).join(' '),
  'ab漢字cd漢 mixed',
  'x👍🏽y🇯🇵z👨‍👩‍👧 emoji',
  'é café marks',
  'a\tb tab',
  'trailing   ',
  '漢'.repeat(60),
  'last',
].join('\n')

/** A grapheme boundary as drawn: its x on screen and its UTF-16 offset in the row's text. */
type Boundary = Readonly<{ x: number; offset: number }>

type DrawnRow = Readonly<{
  lineId: string
  start: number
  top: number
  bottom: number
  text: string
  continues: boolean
  boundaries: ReadonlyArray<Boundary>
}>

const segmenter = new Intl.Segmenter(undefined, { granularity: 'grapheme' })
const graphemeCount = (text: string) => [...segmenter.segment(text)].length

const bands = 4

/**
 * Pixels around the middle of a character where either side is a fair landing. A wide glyph's ink
 * can be narrower than its two cells, so the browser's hit test splits it a little left of the cell middle.
 */
const tieZone = 4

test.describe.configure({ mode: 'parallel' })

for (let band = 0; band < bands; band++) {
  test(`click sweep, band ${band + 1} of ${bands}: every click lands the cursor on the nearest drawn boundary of the row under it`, async ({
    nullpad,
  }) => {
    test.setTimeout(120_000)
    await nullpad.paste(note)
    const screen = await nullpad.screen()
    const drawn: ReadonlyArray<DrawnRow> = await nullpad.page.evaluate(() => {
      const segmenter = new Intl.Segmenter(undefined, {
        granularity: 'grapheme',
      })
      const rows = [...document.querySelectorAll<HTMLElement>('[data-line-id]')]
      return rows.map((row, index) => {
        const texts: Array<{ node: Text; from: number }> = []
        let text = ''
        const walk = (node: Node) => {
          if (node instanceof HTMLElement && node.hasAttribute('data-ghost')) {
            return
          }
          if (node instanceof Text) {
            texts.push({ node, from: text.length })
            text += node.data
          }
          node.childNodes.forEach(walk)
        }
        row.childNodes.forEach(walk)
        const range = document.createRange()
        const at = (offset: number) => {
          const hit = texts.findLast(({ from }) => from <= offset) ?? texts[0]
          return hit === undefined
            ? null
            : { node: hit.node, offset: offset - hit.from }
        }
        const rect = row.getBoundingClientRect()
        const boundaries: Array<{ x: number; offset: number }> = []
        for (const { index: offset, segment } of segmenter.segment(text)) {
          const start = at(offset)
          if (start !== null) {
            range.setStart(start.node, start.offset)
            range.setEnd(
              start.node,
              Math.min(start.node.length, start.offset + segment.length),
            )
            boundaries.push({ x: range.getBoundingClientRect().left, offset })
          }
        }
        const lastText = texts.at(-1)
        const lastBox =
          lastText === undefined
            ? rect.left
            : lastText.node.parentElement !== row &&
                lastText.node.parentElement !== null
              ? lastText.node.parentElement.getBoundingClientRect().right
              : (() => {
                  range.selectNodeContents(lastText.node)
                  return range.getBoundingClientRect().right
                })()
        boundaries.push({
          x: text === '' ? rect.left : lastBox,
          offset: text.length,
        })
        return {
          lineId: row.dataset['lineId'] ?? '',
          start: Number(row.dataset['start']),
          top: rect.top,
          bottom: rect.bottom,
          text,
          continues:
            rows[index + 1]?.dataset['lineId'] === row.dataset['lineId'],
          boundaries,
        }
      })
    })
    const lineText = (lineId: string) =>
      drawn
        .filter(row => row.lineId === lineId)
        .map(row => row.text)
        .join('')
    const width = nullpad.page.viewportSize()?.width ?? 0
    const textLeft = drawn[0]?.boundaries[0]?.x ?? 0
    const xs = [
      ...Array.from({ length: Math.ceil(textLeft / 6) }, (_, i) => 2 + i * 6),
      ...Array.from(
        { length: 70 },
        (_, i) => textLeft + i * 1.15 * screen.cell,
      ),
      ...Array.from(
        { length: 8 },
        (_, i) =>
          textLeft +
          81 * screen.cell +
          (i * (width - textLeft - 81 * screen.cell)) / 8,
      ),
    ].filter(x => x < width - 1)
    const lastBottom = drawn.at(-1)?.bottom ?? 0
    const ys = [
      screen.area.top - 6,
      ...drawn.map(
        (row, index) =>
          row.top + ((index % 3) + 1) * 0.25 * (row.bottom - row.top),
      ),
      lastBottom + 3,
      lastBottom + 120,
      screen.area.bottom - 2,
    ].filter((_, index) => index % bands === band)
    const misses: Array<string> = []
    let clicks = 0
    for (const y of ys) {
      const rowIndex = Math.max(
        0,
        Math.min(
          drawn.length - 1,
          Math.floor((y - (drawn[0]?.top ?? 0)) / screen.rowHeight),
        ),
      )
      const row = drawn[rowIndex]
      if (row === undefined) {
        continue
      }
      const reachable = row.continues
        ? row.boundaries.slice(0, -1)
        : row.boundaries
      for (const x of xs) {
        const nearest = reachable.reduce((best, boundary) =>
          Math.abs(boundary.x - x) < Math.abs(best.x - x) ? boundary : best,
        )
        const tie = reachable.some(
          boundary =>
            boundary !== nearest &&
            Math.abs(Math.abs(boundary.x - x) - Math.abs(nearest.x - x)) <
              tieZone,
        )
        if (tie) {
          continue
        }
        await nullpad.click(x, y)
        clicks++
        const after = await nullpad.screen()
        const column =
          graphemeCount(
            lineText(row.lineId).slice(0, row.start + nearest.offset),
          ) + 1
        const got = {
          row: after.cursor?.row,
          left: Math.round(after.cursor?.left ?? -1),
          column: after.status.column,
        }
        const want = { row: rowIndex, left: Math.round(nearest.x), column }
        if (
          got.row !== want.row ||
          Math.abs(got.left - want.left) > 1 ||
          got.column !== want.column
        ) {
          misses.push(
            `click (${x.toFixed(1)}, ${y.toFixed(1)}) on row ${rowIndex} ${JSON.stringify(row.text.slice(0, 20))}: want ${JSON.stringify(want)}, got ${JSON.stringify(got)}`,
          )
        }
      }
    }
    console.log(`band ${band + 1}: ${clicks} clicks, ${misses.length} misses`)
    expect(clicks, 'clicks made').toBeGreaterThan(100)
    expect(
      misses.slice(0, 20),
      `${misses.length} of ${clicks} clicks missed`,
    ).toEqual([])
  })
}
