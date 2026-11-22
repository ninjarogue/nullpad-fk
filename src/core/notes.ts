import { Array, Option, Order, Schema, String } from 'effect'

export const NoteId = Schema.String.pipe(Schema.brand('NoteId'))
export type NoteId = typeof NoteId.Type

export const Note = Schema.Struct({
  id: NoteId,
  folder: Schema.String,
  text: Schema.String,
  revision: Schema.Int,
  modified: Schema.Finite,
})
export type Note = typeof Note.Type

export type Folder = Readonly<{ name: string; path: string; count: number }>

const segmenter = new Intl.Segmenter(undefined, { granularity: 'grapheme' })

const titleLength = 60

const leadingMarkers =
  /^(?:\s*(?:#{1,6}(?=\s|$)|>|[-*+](?=\s)|\d+[.)](?=\s)|\[[ xX]\](?=\s|$)))+/

const firstFilledLine = (text: string): Option.Option<string> =>
  Option.map(Option.fromNullishOr(/^.*\S.*$/m.exec(text)), ([line]) => line)

const cutToLength = (text: string): string => {
  const graphemes = Array.fromIterable(segmenter.segment(text))
  return graphemes.length <= titleLength
    ? text
    : `${Array.join(
        Array.map(
          graphemes.slice(0, titleLength - 1),
          ({ segment }) => segment,
        ),
        '',
      ).trimEnd()}…`
}

export const title = (text: string): string =>
  Option.match(firstFilledLine(text), {
    onNone: () => 'Untitled',
    onSome: line => {
      const bare = line.replace(leadingMarkers, '').trim()
      return bare === '' ? 'Untitled' : cutToLength(bare)
    },
  })

export const conflictCopy = (text: string): string =>
  text.replace(/^(.*\S.*)$/m, '$1 (conflict copy)')

export const normalizeFolder = (path: string): string =>
  Array.join(
    Array.filter(Array.map(path.split('/'), String.trim), String.isNonEmpty),
    '/',
  )

export const joinFolder = (scope: string, name: string): string =>
  scope === '' ? name : `${scope}/${name}`

export const parentFolder = (scope: string): string =>
  scope.includes('/') ? scope.slice(0, scope.lastIndexOf('/')) : ''

export const topFolderOf = (folder: string): string =>
  folder.split('/')[0] ?? ''

export const isUnder = (folder: string, scope: string): boolean =>
  scope === '' || folder === scope || folder.startsWith(`${scope}/`)

export const fileName = (title: string): string =>
  `${
    title
      .toLowerCase()
      .replace(/[^\p{L}\p{N}]+/gu, '-')
      .replace(/^-|-$/gu, '') || 'untitled'
  }.md`

const titles = new WeakMap<Note, string>()

export const noteTitle = (note: Note): string => {
  const known = titles.get(note)
  if (known !== undefined) {
    return known
  }
  const found = title(note.text)
  titles.set(note, found)
  return found
}

export const pathOf = (note: Note): string =>
  joinFolder(note.folder, noteTitle(note))

export const inScope = (
  notes: ReadonlyArray<Note>,
  scope: string,
): ReadonlyArray<Note> =>
  Array.filter(notes, note => isUnder(note.folder, scope))

export const children = (
  notes: ReadonlyArray<Note>,
  scope: string,
): ReadonlyArray<Folder> => {
  const below = Array.getSomes(
    Array.map(notes, ({ folder }) =>
      folder !== scope && isUnder(folder, scope)
        ? Option.fromUndefinedOr(
            (scope === '' ? folder : folder.slice(scope.length + 1)).split(
              '/',
            )[0],
          )
        : Option.none(),
    ),
  )
  const counts = new Map<string, number>()
  Array.forEach(below, name => counts.set(name, (counts.get(name) ?? 0) + 1))
  return Array.map(Array.sort(counts.keys(), Order.String), name => ({
    name,
    path: joinFolder(scope, name),
    count: counts.get(name) ?? 0,
  }))
}

export const topFolders = (notes: ReadonlyArray<Note>): ReadonlyArray<Folder> =>
  children(notes, '')

export const allFolders = (notes: ReadonlyArray<Note>): ReadonlyArray<string> =>
  Array.sort(
    new Set(
      Array.flatMap(notes, ({ folder }) =>
        folder === ''
          ? []
          : Array.map(folder.split('/'), (_, index) =>
              Array.join(folder.split('/').slice(0, index + 1), '/'),
            ),
      ),
    ),
    Order.String,
  )

export const uniquePrefixMatch = (
  names: ReadonlyArray<string>,
  typed: string,
): Option.Option<string> => {
  const wanted = typed.toLowerCase()
  return Option.orElse(
    Array.findFirst(names, name => name.toLowerCase() === wanted),
    () => {
      const candidates = Array.filter(names, name =>
        name.toLowerCase().startsWith(wanted),
      )
      return candidates.length === 1 ? Array.head(candidates) : Option.none()
    },
  )
}

export const newestFirst: Order.Order<Note> = Order.flip(
  Order.mapInput(Order.Number, (note: Note) => note.modified),
)

export const newest = (notes: ReadonlyArray<Note>): Option.Option<Note> =>
  Array.head(Array.sort(notes, newestFirst))

export const upsert = (
  notes: ReadonlyArray<Note>,
  note: Note,
): ReadonlyArray<Note> =>
  Option.match(
    Array.findFirstIndex(notes, ({ id }) => id === note.id),
    {
      onNone: () => [...notes, note],
      onSome: index =>
        (notes[index]?.revision ?? 0) > note.revision
          ? notes
          : Array.map(notes, (other, at) => (at === index ? note : other)),
    },
  )

export const without = (
  notes: ReadonlyArray<Note>,
  id: NoteId,
): ReadonlyArray<Note> => Array.filter(notes, note => note.id !== id)
