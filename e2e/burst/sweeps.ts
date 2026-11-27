import { type Frames, numberedLines } from '../nullpad'

type Step = Frames[number][number]

export type Document = Readonly<{ note: string; vim: boolean }>

export type Row = Readonly<{
  document: string
  frames: string
  setup: ReadonlyArray<Step>
  burst: Frames
}>

export type Sweep = Readonly<{
  name: string
  scripts: number
  runs: 'every push' | 'on demand'
  documents: Readonly<Record<string, Document>>
  rows: ReadonlyArray<Row>
}>

const wordLines = (lines: number, every: number, words: number): string =>
  Array.from({ length: lines }, (_, i) =>
    i % every === every - 1
      ? `line ${i + 1} ${'word '.repeat(words)}`
      : `line ${i + 1}`,
  ).join('\n')

const wrappedThirds = Array.from({ length: 200 }, (_, i) =>
  i % 3 === 0 ? `${i + 1} ${'word '.repeat(40)}` : `${i + 1} short`,
).join('\n')

const documents = {
  '30 short lines': { note: numberedLines(30), vim: false },
  '30 short lines, vim': { note: numberedLines(30), vim: true },
  '40 short lines, vim': { note: numberedLines(40), vim: true },
  '200 short lines': { note: numberedLines(200), vim: false },
  '200 lines, every third wrapped over 3 rows': {
    note: wrappedThirds,
    vim: false,
  },
  '200 lines, every fourth wrapped over 6 rows, vim': {
    note: wordLines(200, 4, 60),
    vim: true,
  },
  '3,000 lines, every fourth wrapped over 6 rows': {
    note: wordLines(3000, 4, 60),
    vim: false,
  },
} as const satisfies Readonly<Record<string, Document>>

type DocumentName = keyof typeof documents

const row = (
  document: DocumentName,
  frames: string,
  setup: ReadonlyArray<Step>,
  burst: Frames,
): Row => ({ document, frames, setup, burst })

const toStart: ReadonlyArray<Step> = [{ press: 'Control+Home' }]
const toEnd: ReadonlyArray<Step> = [{ press: 'Control+End' }]

export const sweeps: ReadonlyArray<Sweep> = [
  {
    name: 'keys sent in one frame leave the screen where the same keys sent slowly leave it: the status line, the top line and the cursor’s row',
    scripts: 19,
    runs: 'on demand',
    documents,
    rows: [
      row('200 short lines', 'Delete, PageDown, x', toStart, [
        [{ press: 'Delete' }, { press: 'PageDown' }, { type: 'x' }],
      ]),
      row('200 short lines', 'PageDown, x', toStart, [
        [{ press: 'PageDown' }, { type: 'x' }],
      ]),
      row('200 short lines', 'PageDown, Enter', toStart, [
        [{ press: 'PageDown' }, { press: 'Enter' }],
      ]),
      row('200 short lines', 'PageDown, ArrowDown', toStart, [
        [{ press: 'PageDown' }, { press: 'ArrowDown' }],
      ]),
      row('200 short lines', 'PageDown, PageDown', toStart, [
        [{ press: 'PageDown' }, { press: 'PageDown' }],
      ]),
      row('200 short lines', 'PageUp, x from the end', toEnd, [
        [{ press: 'PageUp' }, { type: 'x' }],
      ]),
      row('30 short lines', '8 Backspace, then Ctrl+Home', toEnd, [
        [{ press: 'Backspace', times: 8 }],
        [{ press: 'Control+Home' }],
      ]),
      row('30 short lines', '8 Backspace, then PageUp', toEnd, [
        [{ press: 'Backspace', times: 8 }],
        [{ press: 'PageUp' }],
      ]),
      row('30 short lines', '8 Backspace, then 20 ArrowUp', toEnd, [
        [{ press: 'Backspace', times: 8 }],
        [{ press: 'ArrowUp', times: 20 }],
      ]),
      row('30 short lines, vim', 'dd, then gg', toEnd, [
        [{ type: 'dd' }],
        [{ type: 'gg' }],
      ]),
      row(
        '40 short lines, vim',
        '5dd, then gg, from 4k off the end',
        [...toEnd, { type: '4k' }],
        [[{ type: '5dd' }], [{ type: 'gg' }]],
      ),
      row(
        '30 short lines',
        'Ctrl+Z, then Ctrl+Home, after two typed lines at the end',
        [
          ...toEnd,
          { press: 'Enter' },
          { type: 'abc' },
          { press: 'Enter' },
          { type: 'def' },
        ],
        [[{ press: 'Control+z' }], [{ press: 'Control+Home' }]],
      ),
      row(
        '200 lines, every third wrapped over 3 rows',
        'wheel to the end, then Ctrl+Home',
        toStart,
        [[{ wheel: 200000 }], [{ press: 'Control+Home' }]],
      ),
      row(
        '200 lines, every third wrapped over 3 rows',
        'wheel to the end and ArrowDown',
        toStart,
        [[{ wheel: 200000 }, { press: 'ArrowDown' }]],
      ),
      row(
        '200 lines, every third wrapped over 3 rows',
        '10 Backspace, then Ctrl+Home, from the end',
        toEnd,
        [[{ press: 'Backspace', times: 10 }], [{ press: 'Control+Home' }]],
      ),
      row(
        '30 short lines',
        '2 Delete joining at the end, then Ctrl+Home',
        [...toEnd, { press: 'ArrowUp' }, { press: 'End' }],
        [
          [{ press: 'Delete' }, { press: 'Delete' }],
          [{ press: 'Control+Home' }],
        ],
      ),
      row(
        '3,000 lines, every fourth wrapped over 6 rows',
        'PageDown, PageDown, PageUp, x',
        toStart,
        [
          [
            { press: 'PageDown' },
            { press: 'PageDown' },
            { press: 'PageUp' },
            { type: 'x' },
          ],
        ],
      ),
      row(
        '3,000 lines, every fourth wrapped over 6 rows',
        'PageDown, PageDown, PageUp, ArrowDown',
        toStart,
        [
          [
            { press: 'PageDown' },
            { press: 'PageDown' },
            { press: 'PageUp' },
            { press: 'ArrowDown' },
          ],
        ],
      ),
      row(
        '200 lines, every fourth wrapped over 6 rows, vim',
        'Ctrl+End twice, x, Home, x, then Home, y',
        [...toStart, { press: 'PageDown', times: 3 }],
        [
          [
            { press: 'Control+End' },
            { press: 'Control+End' },
            { type: 'x' },
            { press: 'Home' },
            { type: 'x' },
          ],
          [{ press: 'Home' }, { type: 'y' }],
        ],
      ),
    ],
  },
]
