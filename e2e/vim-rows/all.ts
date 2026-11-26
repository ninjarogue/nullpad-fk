import { type VimDifference } from './differences.ts'
import * as dot from './dot.ts'
import * as registers from './registers.ts'
import * as undo from './undo.ts'
import * as vimFind from './vim-find.ts'
import * as vimReplace from './vim-replace.ts'
import * as vim from './vim.ts'
import * as visualBlockStay from './visual-block-stay.ts'
import * as visualBlock from './visual-block.ts'
import * as visual from './visual.ts'

export type Checkpoint = Readonly<{
  keys: string
  text: string
  cursor?: Readonly<{ line: number; column: number }>
  mode?: string
}>

export type OracleRow = Readonly<{
  spec: string
  id: string
  text: string
  at: readonly [number, number]
  clipboard?: string
  checkpoints: ReadonlyArray<Checkpoint>
  selectionUnchecked: boolean
  differs?: VimDifference
}>

type State = Readonly<{
  text: string
  line: number
  column: number
  mode: string
}>

const checkpoint = (keys: string, state: State): Checkpoint => ({
  keys,
  text: state.text,
  cursor: { line: state.line, column: state.column },
  mode: state.mode,
})

type Plain = Readonly<{
  at: readonly [number, number]
  keys: string
  after: string
  line: number
  column: number
  differs?: VimDifference
}>

const plain = (
  spec: string,
  id: string,
  text: string,
  row: Plain,
): OracleRow => ({
  spec,
  id,
  text,
  at: row.at,
  checkpoints: [
    checkpoint(row.keys, { ...row, text: row.after, mode: 'NORMAL' }),
  ],
  selectionUnchecked: false,
  ...(row.differs === undefined ? {} : { differs: row.differs }),
})

const grouped = <R>(
  groups: ReadonlyArray<Readonly<{ name: string; rows: ReadonlyArray<R> }>>,
): ReadonlyArray<readonly [string, R]> =>
  groups.flatMap(group =>
    group.rows.map(
      (row, index) => [`${group.name} #${index + 1}`, row] as const,
    ),
  )

export const oracleRows: ReadonlyArray<OracleRow> = [
  ...vim.tables.flatMap(([, rows]) =>
    rows.map(row => plain('vim', row.name, row.text, row)),
  ),
  ...grouped(dot.groups).map(([id, row]) =>
    plain('dot', id, dot.texts[row.text], row),
  ),
  ...grouped(registers.groups).map(([id, row]) => ({
    ...plain('registers', id, registers.texts[row.text], row),
    ...(row.clip === undefined ? {} : { clipboard: row.clip }),
  })),
  ...undo.vimRows.map((row, index) =>
    plain('undo', `#${index + 1}`, undo.texts[row.text], row),
  ),
  ...grouped(visual.groups).map(([id, row]) =>
    plain('visual', id, visual.texts[row.text], row),
  ),
  ...grouped(vimFind.groups).map(
    ([
      ,
      [
        id,
        why,
        text,
        at,
        keys,
        after,
        line,
        column,
        mode,
        selection,
        afterP,
        differs,
      ],
    ]): OracleRow => ({
      spec: 'vim-find',
      id: `row ${id} (${why})`,
      text,
      at,
      checkpoints: [
        { keys, text: after ?? text, cursor: { line, column }, mode },
        ...(afterP === null ? [] : [{ keys: 'P', text: afterP }]),
      ],
      selectionUnchecked: selection !== null,
      ...(differs === undefined ? {} : { differs }),
    }),
  ),
  ...grouped(vimReplace.groups).map(([, row]): OracleRow => ({
    spec: 'vim-replace',
    id: `row ${row.id} (${row.why})`,
    text: vimReplace.notes[row.note],
    at: row.at,
    checkpoints: [checkpoint(row.keys, row)],
    selectionUnchecked: row.selection !== undefined,
    ...(row.differs === undefined ? {} : { differs: row.differs }),
  })),
  ...grouped(visualBlock.groups).map(([id, row]): OracleRow => ({
    spec: 'visual-block',
    id,
    text: visualBlock.notes[row.note],
    at: row.at,
    checkpoints: [
      checkpoint(row.keys, row.state),
      ...(row.readback === undefined
        ? []
        : [checkpoint(row.readback.keys, row.readback.state)]),
    ],
    selectionUnchecked:
      row.state.selection !== undefined ||
      row.readback?.state.selection !== undefined,
    ...(row.differs === undefined ? {} : { differs: row.differs }),
  })),
  ...visualBlockStay.stayRows.map((row, index): OracleRow => ({
    spec: 'visual-block-stay',
    id: `#${index + 1}`,
    text: visualBlockStay.stayNotes[row.note],
    at: row.at,
    checkpoints: [checkpoint(row.keys, row.state)],
    selectionUnchecked: false,
    ...(row.differs === undefined ? {} : { differs: row.differs }),
  })),
]
