import { Array, Option, Order, Schema } from 'effect'

import * as Fuzzy from './fuzzy'
import { Input, type Modifiers, type NamedKey } from './input'
import * as Line from './line'
import * as Notes from './notes'

export const Mode = Schema.TaggedUnion({
  Find: {},
  Move: { id: Notes.NoteId, findPrompt: Schema.String },
})
export type Mode = typeof Mode.Type

export const Finder = Schema.Struct({
  prompt: Schema.String,
  caret: Schema.Int,
  preedit: Schema.String,
  scope: Schema.String,
  selected: Schema.Int,
  mode: Mode,
})
export type Finder = typeof Finder.Type

export const Row = Schema.TaggedUnion({
  Folder: { name: Schema.String, path: Schema.String, count: Schema.Int },
  Note: { note: Notes.Note, titleHits: Schema.Array(Schema.Int) },
  Create: { folder: Schema.String, text: Schema.String },
  Destination: { folder: Schema.String, isNew: Schema.Boolean },
})
export type Row = typeof Row.Type

export const Action = Schema.TaggedUnion({
  Stay: {},
  Close: {},
  Open: { id: Notes.NoteId },
  Create: { folder: Schema.String, text: Schema.String },
  Move: { id: Notes.NoteId, folder: Schema.String },
})
export type Action = typeof Action.Type

export type Outcome = Readonly<{ finder: Finder; action: Action }>

const pageRows = 10

export const open = (): Finder => ({
  prompt: '',
  caret: 0,
  preedit: '',
  scope: '',
  selected: 0,
  mode: Mode.cases.Find.make({}),
})

export const opensFinder = (input: Input): boolean =>
  input._tag === 'Chord' && input.char.toLowerCase() === 'p'

export const query = (finder: Finder): string => finder.prompt.trim()

export const surrounding = (
  finder: Finder,
): Readonly<{ text: string; caret: number }> => ({
  text: finder.prompt,
  caret: finder.caret,
})

const lastRanked: {
  notes: ReadonlyArray<Notes.Note>
  scope: string
  typed: string
  ranked: ReadonlyArray<Fuzzy.Ranked>
} = { notes: [], scope: '', typed: '', ranked: [] }

const rankInScope = (
  notes: ReadonlyArray<Notes.Note>,
  scope: string,
  typed: string,
): ReadonlyArray<Fuzzy.Ranked> => {
  const narrows =
    lastRanked.notes === notes &&
    lastRanked.scope === scope &&
    lastRanked.typed !== '' &&
    typed.startsWith(lastRanked.typed)
  const ranked = Fuzzy.rank(
    narrows
      ? Array.map(lastRanked.ranked, ({ note }) => note)
      : Notes.inScope(notes, scope),
    typed,
  )
  lastRanked.notes = notes
  lastRanked.scope = scope
  lastRanked.typed = typed
  lastRanked.ranked = ranked
  return ranked
}

const findRows = (
  finder: Finder,
  notes: ReadonlyArray<Notes.Note>,
): ReadonlyArray<Row> => {
  const typed = query(finder)
  const folders = Array.getSomes(
    Array.map(Notes.children(notes, finder.scope), folder =>
      typed === '' || Option.isSome(Fuzzy.match(folder.name, typed))
        ? Option.some(Row.cases.Folder.make(folder))
        : Option.none(),
    ),
  )
  const ranked = Array.map(
    rankInScope(notes, finder.scope, typed),
    ({ note, titleHits }) => Row.cases.Note.make({ note, titleHits }),
  )
  const create =
    typed === ''
      ? []
      : [Row.cases.Create.make({ folder: finder.scope, text: typed })]
  return [...folders, ...ranked, ...create]
}

const moveRows = (
  finder: Finder,
  notes: ReadonlyArray<Notes.Note>,
): ReadonlyArray<Row> => {
  const typed = Notes.normalizeFolder(finder.prompt)
  const existing = Notes.allFolders(notes)
  const others = Array.getSomes(
    Array.map(existing, folder =>
      folder === typed
        ? Option.none()
        : Option.map(Fuzzy.match(folder, typed), ({ score }) => ({
            folder,
            score,
          })),
    ),
  )
  const byScore = Order.flip(
    Order.mapInput(Order.Number, ({ score }: { score: number }) => score),
  )
  return [
    Row.cases.Destination.make({
      folder: typed,
      isNew: typed !== '' && !existing.includes(typed),
    }),
    ...Array.map(Array.sort(others, byScore), ({ folder }) =>
      Row.cases.Destination.make({ folder, isNew: false }),
    ),
  ]
}

const modeKey = (mode: Mode): string =>
  Mode.match(mode, { Find: () => 'Find', Move: ({ id }) => `Move ${id}` })

const lastRows: {
  notes: ReadonlyArray<Notes.Note>
  key: string
  rows: ReadonlyArray<Row>
} = { notes: [], key: '', rows: [] }

export const rows = (
  finder: Finder,
  notes: ReadonlyArray<Notes.Note>,
): ReadonlyArray<Row> => {
  const key = `${modeKey(finder.mode)}\n${finder.scope}\n${finder.prompt}`
  if (lastRows.notes === notes && lastRows.key === key) {
    return lastRows.rows
  }
  const found = Mode.match(finder.mode, {
    Find: () => findRows(finder, notes),
    Move: () => moveRows(finder, notes),
  })
  lastRows.notes = notes
  lastRows.key = key
  lastRows.rows = found
  return found
}

export const highlighted = (finder: Finder, rowCount: number): number =>
  Math.max(0, Math.min(finder.selected, rowCount - 1))

export const movingNote = (
  finder: Finder,
  notes: ReadonlyArray<Notes.Note>,
): Option.Option<Notes.Note> =>
  Mode.match(finder.mode, {
    Find: () => Option.none(),
    Move: ({ id }) => Array.findFirst(notes, note => note.id === id),
  })

const stay = (finder: Finder): Outcome => ({
  finder,
  action: Action.cases.Stay.make({}),
})

const withScope = (finder: Finder, scope: string): Finder => ({
  ...finder,
  scope,
  prompt: '',
  caret: 0,
  preedit: '',
  selected: 0,
})

export const enterScope = (finder: Finder, scope: string): Finder =>
  withScope({ ...finder, mode: Mode.cases.Find.make({}) }, scope)

const backToFind = (finder: Finder): Finder => enterScope(finder, finder.scope)

const cancelMove = (
  finder: Finder,
  notes: ReadonlyArray<Notes.Note>,
  id: Notes.NoteId,
  findPrompt: string,
): Finder => {
  const restored: Finder = {
    ...finder,
    mode: Mode.cases.Find.make({}),
    prompt: findPrompt,
    caret: findPrompt.length,
    preedit: '',
    selected: 0,
  }
  return {
    ...restored,
    selected: Option.getOrElse(
      Array.findFirstIndex(
        rows(restored, notes),
        row => row._tag === 'Note' && row.note.id === id,
      ),
      () => 0,
    ),
  }
}

const drillInto = (
  finder: Finder,
  notes: ReadonlyArray<Notes.Note>,
): Finder => {
  const { prompt } = finder
  const typed = prompt.slice(0, -1).trim()
  if (finder.mode._tag === 'Move' || !prompt.endsWith('/') || typed === '') {
    return finder
  }
  return Option.match(
    Notes.uniquePrefixMatch(
      Array.map(Notes.children(notes, finder.scope), ({ name }) => name),
      typed,
    ),
    {
      onNone: () => finder,
      onSome: name => withScope(finder, Notes.joinFolder(finder.scope, name)),
    },
  )
}

const edited = (
  finder: Finder,
  notes: ReadonlyArray<Notes.Note>,
  prompt: string,
  caret: number,
): Outcome => stay(drillInto({ ...finder, prompt, caret, selected: 0 }, notes))

const lineOf = ({ prompt, caret, preedit }: Finder): Line.Line => ({
  text: prompt,
  caret,
  preedit,
})

const editedLine = (
  finder: Finder,
  notes: ReadonlyArray<Notes.Note>,
  line: Option.Option<Line.Line>,
): Outcome =>
  Option.match(line, {
    onNone: () => stay(finder),
    onSome: ({ text, caret }) => edited(finder, notes, text, caret),
  })

const typeText = (
  finder: Finder,
  notes: ReadonlyArray<Notes.Note>,
  text: string,
): Outcome =>
  editedLine(
    finder,
    notes,
    Line.typeText(lineOf(finder), text.replace(/\r?\n/gu, ' ')),
  )

const erase = (
  finder: Finder,
  notes: ReadonlyArray<Notes.Note>,
  fromCaret: number,
  toCaret: number,
): Outcome =>
  editedLine(finder, notes, Line.erase(lineOf(finder), fromCaret, toCaret))

const moveHighlight = (
  finder: Finder,
  notes: ReadonlyArray<Notes.Note>,
  by: number,
): Outcome => {
  const count = rows(finder, notes).length
  return stay({
    ...finder,
    selected: Math.max(0, Math.min(count - 1, highlighted(finder, count) + by)),
  })
}

const moveCaret = (finder: Finder, caret: number): Outcome =>
  stay({ ...finder, caret })

const cycleTopFolder = (
  finder: Finder,
  notes: ReadonlyArray<Notes.Note>,
  by: number,
): Outcome => {
  const scopes = ['', ...Array.map(Notes.topFolders(notes), ({ name }) => name)]
  const current = Math.max(0, scopes.indexOf(Notes.topFolderOf(finder.scope)))
  const next = scopes[(current + by + scopes.length) % scopes.length] ?? ''
  return stay({ ...finder, scope: next, selected: 0 })
}

export const pick = (
  finder: Finder,
  notes: ReadonlyArray<Notes.Note>,
  index: number,
): Outcome =>
  Option.match(Array.get(rows(finder, notes), index), {
    onNone: () => stay(finder),
    onSome: Row.match({
      Folder: ({ path }) => stay(withScope(finder, path)),
      Note: ({ note }) => ({
        finder,
        action: Action.cases.Open.make({ id: note.id }),
      }),
      Create: ({ folder, text }) => ({
        finder,
        action: Action.cases.Create.make({ folder, text }),
      }),
      Destination: ({ folder }) =>
        Mode.match(finder.mode, {
          Find: () => stay(finder),
          Move: ({ id }) => ({
            finder: backToFind(finder),
            action: Action.cases.Move.make({ id, folder }),
          }),
        }),
    }),
  })

const enterMove = (
  finder: Finder,
  notes: ReadonlyArray<Notes.Note>,
): Outcome => {
  const found = rows(finder, notes)
  return Option.match(
    Option.filter(
      Array.get(found, highlighted(finder, found.length)),
      Row.guards.Note,
    ),
    {
      onNone: () => stay(finder),
      onSome: ({ note }) =>
        stay({
          ...finder,
          mode: Mode.cases.Move.make({
            id: note.id,
            findPrompt: finder.prompt,
          }),
          prompt: note.folder,
          caret: note.folder.length,
          preedit: '',
          selected: 0,
        }),
    },
  )
}

const keys: Readonly<
  Record<
    NamedKey,
    (
      finder: Finder,
      notes: ReadonlyArray<Notes.Note>,
      modifiers: Modifiers,
    ) => Outcome
  >
> = {
  Escape: (finder, notes) =>
    Mode.match(finder.mode, {
      Find: () => ({ finder, action: Action.cases.Close.make({}) }),
      Move: ({ id, findPrompt }) =>
        stay(cancelMove(finder, notes, id, findPrompt)),
    }),
  Enter: (finder, notes) =>
    pick(finder, notes, highlighted(finder, rows(finder, notes).length)),
  Tab: (finder, notes, { shift }) =>
    finder.mode._tag === 'Find'
      ? cycleTopFolder(finder, notes, shift ? -1 : 1)
      : stay(finder),
  Backspace: (finder, notes) =>
    finder.prompt === ''
      ? finder.mode._tag === 'Find' && finder.scope !== ''
        ? stay(withScope(finder, Notes.parentFolder(finder.scope)))
        : stay(finder)
      : editedLine(finder, notes, Line.backspace(lineOf(finder))),
  Delete: (finder, notes) =>
    editedLine(finder, notes, Line.deleteAfter(lineOf(finder))),
  ArrowLeft: finder => moveCaret(finder, Line.left(lineOf(finder)).caret),
  ArrowRight: finder => moveCaret(finder, Line.right(lineOf(finder)).caret),
  ArrowUp: (finder, notes) => moveHighlight(finder, notes, -1),
  ArrowDown: (finder, notes) => moveHighlight(finder, notes, 1),
  Home: finder => moveCaret(finder, Line.home(lineOf(finder)).caret),
  End: finder => moveCaret(finder, Line.end(lineOf(finder)).caret),
  PageUp: (finder, notes) => moveHighlight(finder, notes, -pageRows),
  PageDown: (finder, notes) => moveHighlight(finder, notes, pageRows),
}

const chords: Readonly<
  Record<string, (finder: Finder, notes: ReadonlyArray<Notes.Note>) => Outcome>
> = {
  p: (finder, notes) => moveHighlight(finder, notes, -1),
  n: (finder, notes) => moveHighlight(finder, notes, 1),
  g: (finder, notes) =>
    finder.mode._tag === 'Find' ? enterMove(finder, notes) : stay(finder),
}

export const feed = (
  finder: Finder,
  notes: ReadonlyArray<Notes.Note>,
  input: Input,
): Outcome =>
  Input.match(input, {
    Key: ({ key, modifiers }) => keys[key](finder, notes, modifiers),
    Chord: ({ char }) =>
      Option.match(Option.fromUndefinedOr(chords[char.toLowerCase()]), {
        onNone: () => stay(finder),
        onSome: chord => chord(finder, notes),
      }),
    Text: ({ text }) => typeText(finder, notes, text),
    Paste: ({ text }) => typeText(finder, notes, text),
    Commit: ({ text }) => typeText({ ...finder, preedit: '' }, notes, text),
    Preedit: ({ text }) => stay({ ...finder, preedit: text }),
    Erase: ({ fromCaret, toCaret }) => erase(finder, notes, fromCaret, toCaret),
  })
