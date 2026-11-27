import { spawn } from 'node:child_process'
import { createHash } from 'node:crypto'
import {
  existsSync,
  mkdtempSync,
  readFileSync,
  rmSync,
  writeFileSync,
} from 'node:fs'
import { availableParallelism, tmpdir } from 'node:os'
import { join } from 'node:path'

import { type Checkpoint, type OracleRow, oracleRows } from './vim-rows/all.ts'
import { type VimDifference, vimDifferences } from './vim-rows/differences.ts'

const confirmedPath = 'e2e/vim-rows/confirmed.txt'
const clipboardStandIn = 'q'
const namedKey =
  /(<(?:Esc|CR|BS|Del|Tab|Space|Left|Right|Up|Down|Home|End|PageUp|PageDown|C-r|C-\[|C-v|C-c|C-a|C-x|C-e)>)/u

type Seen = Readonly<{
  text: string
  line: number
  column: number
  mode: string
}>

type Answer = Readonly<{ seen: ReadonlyArray<Seen>; error: string }>

type Verdict =
  | Readonly<{ kind: 'confirmed' }>
  | Readonly<{ kind: 'excused'; reason: VimDifference }>
  | Readonly<{ kind: 'differs'; answer: Answer; at: number }>
  | Readonly<{ kind: 'staleExcuse'; reason: VimDifference }>

const fingerprintOf = (row: OracleRow): string =>
  createHash('sha256')
    .update(
      JSON.stringify([
        row.text,
        row.at,
        row.clipboard ?? null,
        row.checkpoints,
        row.differs ?? null,
      ]),
    )
    .digest('hex')
    .slice(0, 16)

const segmenter = new Intl.Segmenter()

const lettersOf = (text: string): ReadonlyArray<string> =>
  Array.from(segmenter.segment(text), piece => piece.segment)

const byteColumnOf = (line: string, column: number): number =>
  Buffer.byteLength(
    lettersOf(line)
      .slice(0, column - 1)
      .join(''),
  ) + 1

const letterColumnOf = (line: string, byteColumn: number): number =>
  lettersOf(
    Buffer.from(line)
      .subarray(0, byteColumn - 1)
      .toString(),
  ).length + 1

const vimKeys = (keys: string): string => {
  if (keys.includes(`"${clipboardStandIn}`)) {
    throw new Error(
      `the keys ${keys} name register ${clipboardStandIn}, which stands in for the clipboard`,
    )
  }
  return keys
    .replaceAll(/"[+*]/gu, `"${clipboardStandIn}`)
    .split(namedKey)
    .map(part =>
      namedKey.test(part)
        ? `\\${part}`
        : part.replaceAll('\\', '\\\\').replaceAll('"', '\\"'),
    )
    .join('')
}

const vimString = (value: string): string => `'${value.replaceAll("'", "''")}'`

const visualModes: Readonly<Record<string, string>> = {
  v: 'VISUAL',
  V: 'V-LINE',
  '\u0016': 'V-BLOCK',
}

const modeName = (mode: string): string =>
  visualModes[mode] ?? (mode.startsWith('i') ? 'INSERT' : 'NORMAL')

const scriptOf = (row: OracleRow, out: string): string => {
  const [line, column] = row.at
  const firstLine = row.text.split('\n')[line - 1] ?? ''
  const feed = row.checkpoints
    .map(({ keys }) => `${vimKeys(keys)}\\<Cmd>call Snap()\\<CR>`)
    .join('')
  return [
    `call cursor(${line}, ${byteColumnOf(firstLine, column)})`,
    'let g:seen = []',
    'function! Snap()',
    "  call add(g:seen, {'lines': getline(1, '$'), 'line': line('.'), 'col': col('.'), 'mode': mode(1)})",
    'endfunction',
    'inoremap <Tab> <Space><Space>',
    ...(row.clipboard === undefined
      ? []
      : [
          `call setreg('${clipboardStandIn}', json_decode(${vimString(JSON.stringify(row.clipboard))}))`,
        ]),
    "let v:errmsg = ''",
    'try',
    `  call feedkeys("\\<Cmd>call wincol()\\<CR>${feed}", 'xt')`,
    'catch',
    '  let v:errmsg = v:exception',
    'endtry',
    `call writefile([json_encode({'seen': g:seen, 'error': v:errmsg})], ${vimString(out)})`,
    'qa!',
    '',
  ].join('\n')
}

const vimArguments = [
  '-u',
  'NONE',
  '-N',
  '-n',
  '-i',
  'NONE',
  '-es',
  '--cmd',
  'set noesckeys encoding=utf-8 fileencodings=utf-8 nomore backspace=indent,eol,start',
]

type Snapshot = Readonly<{
  lines: ReadonlyArray<string>
  line: number
  col: number
  mode: string
}>

const askVim = async (
  row: OracleRow,
  dir: string,
  index: number,
): Promise<Answer> => {
  const note = join(dir, `${index}.txt`)
  const script = join(dir, `${index}.vim`)
  const out = join(dir, `${index}.json`)
  writeFileSync(note, `${row.text}\n`)
  writeFileSync(script, scriptOf(row, out))
  await new Promise<void>((resolve, reject) => {
    spawn('vim', [...vimArguments, '-S', script, note], {
      stdio: 'ignore',
      timeout: 20_000,
    })
      .on('error', error =>
        reject(new Error(`could not run vim: ${error.message}`)),
      )
      .on('close', () => resolve())
  })
  if (!existsSync(out)) {
    throw new Error(`Vim wrote no answer for ${row.spec} ${row.id}`)
  }
  const raw: Readonly<{ seen: ReadonlyArray<Snapshot>; error: string }> =
    JSON.parse(readFileSync(out, 'utf8'))
  return {
    error: raw.error,
    seen: raw.seen.map(state => ({
      text: state.lines.join('\n'),
      line: state.line,
      column: letterColumnOf(state.lines[state.line - 1] ?? '', state.col),
      mode: modeName(state.mode),
    })),
  }
}

const agrees = (checkpoint: Checkpoint, seen: Seen | undefined): boolean =>
  seen !== undefined &&
  seen.text === checkpoint.text &&
  (checkpoint.cursor === undefined ||
    (seen.line === checkpoint.cursor.line &&
      seen.column === checkpoint.cursor.column)) &&
  (checkpoint.mode === undefined || seen.mode === checkpoint.mode)

const verdictOf = (row: OracleRow, answer: Answer): Verdict => {
  const at = row.checkpoints.findIndex(
    (checkpoint, index) => !agrees(checkpoint, answer.seen[index]),
  )
  if (at === -1) {
    return row.differs === undefined
      ? { kind: 'confirmed' }
      : { kind: 'staleExcuse', reason: row.differs }
  }
  return row.differs === undefined
    ? { kind: 'differs', answer, at }
    : { kind: 'excused', reason: row.differs }
}

const pool = async <T, R>(
  items: ReadonlyArray<T>,
  work: (item: T, index: number) => Promise<R>,
): Promise<ReadonlyArray<R>> => {
  const results: Array<R> = []
  let next = 0
  const worker = async () => {
    while (next < items.length) {
      const index = next++
      results[index] = await work(items[index] as T, index)
    }
  }
  await Promise.all(Array.from({ length: availableParallelism() }, worker))
  return results
}

const stateOf = (state: Readonly<{ text: string }> & Partial<Seen>): string =>
  [
    JSON.stringify(state.text),
    state.line === undefined ? '' : `${state.line}:${state.column}`,
    state.mode ?? '',
  ]
    .filter(Boolean)
    .join(' ')

const reportOf = (row: OracleRow, verdict: Verdict): string | null => {
  if (verdict.kind === 'staleExcuse') {
    return `AGREES BUT EXCUSED ${row.spec} ${row.id}: Vim gives the saved answer, so drop differs: '${verdict.reason}'`
  }
  if (verdict.kind !== 'differs') {
    return null
  }
  const { answer, at } = verdict
  const checkpoint = row.checkpoints[at]
  const seen = answer.seen[at]
  const keys = row.checkpoints
    .slice(0, at + 1)
    .map(({ keys }) => keys)
    .join(' then ')
  return [
    `DIFFERS ${row.spec} ${row.id}`,
    `  note  ${JSON.stringify(row.text)} at ${row.at.join(':')}`,
    `  keys  ${keys}${row.clipboard === undefined ? '' : ` with clipboard ${JSON.stringify(row.clipboard)}`}`,
    `  saved ${checkpoint === undefined ? '?' : stateOf({ ...checkpoint, ...checkpoint.cursor })}`,
    `  vim   ${seen === undefined ? 'no state, Vim stopped early' : stateOf(seen)}${answer.error === '' ? '' : ` (${answer.error})`}`,
  ].join('\n')
}

const all = process.argv.includes('--all')
const settled = new Set(
  existsSync(confirmedPath)
    ? readFileSync(confirmedPath, 'utf8').split('\n').filter(Boolean)
    : [],
)
const rows = oracleRows.map(row => ({ row, fingerprint: fingerprintOf(row) }))
const picked = rows.filter(
  ({ fingerprint }) => all || !settled.has(fingerprint),
)
const started = performance.now()
const dir = mkdtempSync(join(tmpdir(), 'vim-oracle-'))
const results = await pool(picked, async (item, index) => ({
  ...item,
  verdict: verdictOf(item.row, await askVim(item.row, dir, index)),
})).finally(() => rmSync(dir, { recursive: true, force: true }))
const elapsed = Math.round(performance.now() - started)

const nowSettled = new Set(
  results
    .filter(
      ({ verdict }) =>
        verdict.kind === 'confirmed' || verdict.kind === 'excused',
    )
    .map(({ fingerprint }) => fingerprint),
)
const kept = new Set(
  rows
    .map(({ fingerprint }) => fingerprint)
    .filter(
      fingerprint =>
        nowSettled.has(fingerprint) || (!all && settled.has(fingerprint)),
    ),
)
writeFileSync(
  confirmedPath,
  [...kept]
    .sort()
    .map(fingerprint => `${fingerprint}\n`)
    .join(''),
)

const count = (kind: Verdict['kind']) =>
  results.filter(({ verdict }) => verdict.kind === kind).length
const excused = Object.entries(vimDifferences).flatMap(([reason, about]) => {
  const n = results.filter(
    ({ verdict }) => verdict.kind === 'excused' && verdict.reason === reason,
  ).length
  return n === 0 ? [] : [`    ${n} ${reason}: ${about}`]
})
const unchecked = results.filter(({ row }) => row.selectionUnchecked).length
const failing = count('differs') + count('staleExcuse')

for (const { row, verdict } of results) {
  const report = reportOf(row, verdict)
  if (report !== null) {
    console.log(report)
  }
}
console.log(
  [
    `vim oracle: ${picked.length} of ${rows.length} rows checked${all ? ' (--all)' : ''} in ${elapsed} ms`,
    `  confirmed ${count('confirmed')}`,
    `  excused   ${count('excused')}`,
    ...excused,
    `  differing ${count('differs')}`,
    ...(count('staleExcuse') === 0
      ? []
      : [`  excused but agreeing ${count('staleExcuse')}`]),
    ...(unchecked === 0
      ? []
      : [
          `  ${unchecked} of these rows also assert a selection, which Vim is not asked for`,
        ]),
  ].join('\n'),
)
process.exitCode = failing === 0 ? 0 : 1
