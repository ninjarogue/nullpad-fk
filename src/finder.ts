import { Array, Option } from 'effect'
import type { Html, HtmlBuilder } from 'foldkit/html'

import * as Finder from './core/finder'
import * as Notes from './core/notes'
import { Message } from './message'

export const finderBounds = {
  control: '.finder .prompt',
  selection: '.finder .fcur',
}

const previewLines = 40

const segmenter = new Intl.Segmenter(undefined, { granularity: 'grapheme' })

const graphemes = (text: string): ReadonlyArray<string> =>
  Array.map(
    Array.fromIterable(segmenter.segment(text)),
    ({ segment }) => segment,
  )

const minute = 60_000
const hour = 60 * minute
const day = 24 * hour

const ago = (elapsed: number): string => {
  if (elapsed < minute) {
    return 'now'
  }
  if (elapsed < hour) {
    return `${Math.floor(elapsed / minute)}m`
  }
  if (elapsed < day) {
    return `${Math.floor(elapsed / hour)}h`
  }
  if (elapsed < 30 * day) {
    return `${Math.floor(elapsed / day)}d`
  }
  if (elapsed < 365 * day) {
    return `${Math.floor(elapsed / (30 * day))}mo`
  }
  return `${Math.floor(elapsed / (365 * day))}y`
}

const fade = (elapsed: number): number =>
  Math.max(0.3, 1 - Math.log10(1 + Math.max(0, elapsed) / day) * 0.33)

const head = (text: string): string =>
  Array.join(text.split('\n').slice(0, previewLines), '\n')

const relativeFolder = (folder: string, scope: string): string =>
  scope === '' ? folder : folder.slice(scope.length + 1)

const promptLine = (finder: Finder.Finder, h: HtmlBuilder<Message>): Html => {
  const before = finder.prompt.slice(0, finder.caret)
  const after = graphemes(finder.prompt.slice(finder.caret))
  const placeholder =
    finder.prompt === '' && finder.preedit === ''
      ? [
          h.span(
            [h.Class('placeholder')],
            [
              finder.mode._tag === 'Find'
                ? 'filter or new note name'
                : 'folder path, empty for the top level',
            ],
          ),
        ]
      : []
  return h.span(
    [h.Class('query')],
    [
      before,
      ...(finder.preedit === ''
        ? []
        : [
            h.span(
              [h.Class('pre'), h.DataAttribute('ghost', '')],
              [finder.preedit],
            ),
          ]),
      h.span([h.Class('fcur')], [after[0] ?? ' ']),
      Array.join(after.slice(1), ''),
      ...placeholder,
    ],
  )
}

const folderRow = (
  finder: Finder.Finder,
  notes: ReadonlyArray<Notes.Note>,
  h: HtmlBuilder<Message>,
): Html => {
  const button = (
    label: string,
    scope: string,
    isOn: boolean,
    count: Option.Option<number>,
  ) =>
    h.button(
      [
        h.Type('button'),
        h.Tabindex(-1),
        h.Class(isOn ? 'on' : ''),
        h.OnClick(Message.ClickedFinderScope({ scope })),
      ],
      [
        label,
        ...Option.match(count, {
          onNone: () => [],
          onSome: n => [h.span([h.Class('n')], [String(n)])],
        }),
      ],
    )
  const children = Array.map(
    Notes.children(notes, finder.scope),
    ({ name, path, count }) =>
      button(
        finder.scope === '' ? name : `${name}/`,
        path,
        false,
        Option.some(count),
      ),
  )
  if (finder.scope === '') {
    return h.div(
      [h.Class('folders')],
      [button('all', '', true, Option.some(notes.length)), ...children],
    )
  }
  const parts = finder.scope.split('/')
  return h.div(
    [h.Class('folders')],
    [
      button('all', '', false, Option.none()),
      ...Array.flatMap(parts, (part, index) => [
        h.span([h.Class('sep')], ['›']),
        button(
          part,
          Array.join(parts.slice(0, index + 1), '/'),
          index === parts.length - 1,
          Option.none(),
        ),
      ]),
      ...children,
    ],
  )
}

const marked = (
  text: string,
  hits: ReadonlyArray<number>,
  h: HtmlBuilder<Message>,
): ReadonlyArray<Html | string> =>
  Array.map(graphemes(text.normalize('NFC')), (grapheme, index) =>
    hits.includes(index) ? h.b([], [grapheme]) : grapheme,
  )

const rowView = (
  row: Finder.Row,
  index: number,
  isSelected: boolean,
  finder: Finder.Finder,
  now: number,
  h: HtmlBuilder<Message>,
): Html => {
  const attributes = (kind: string) => [
    h.Class(`row ${kind}${isSelected ? ' sel' : ''}`),
    h.OnClick(Message.ClickedFinderRow({ index })),
  ]
  return Finder.Row.match(row, {
    Folder: ({ name, path, count }) => {
      return h.keyed('div')(`folder:${path}`, attributes('sub'), [
        h.span([h.Class('t')], [`▸ ${name}/`]),
        h.span([h.Class('a')], [String(count)]),
      ])
    },
    Note: ({ note, titleHits }) => {
      const folder = relativeFolder(note.folder, finder.scope)
      return h.keyed('div')(
        `note:${note.id}`,
        [
          ...attributes('note'),
          h.Style({
            opacity: isSelected ? '1' : String(fade(now - note.modified)),
          }),
        ],
        [
          h.span([h.Class('t')], marked(Notes.title(note.text), titleHits, h)),
          h.span(
            [h.Class('fd')],
            [h.bdi([], [folder === '' ? '' : `${folder}/`])],
          ),
          h.span([h.Class('a')], [ago(now - note.modified)]),
        ],
      )
    },
    Create: ({ folder, text }) => {
      return h.keyed('div')('create', attributes('new'), [
        h.span(
          [h.Class('t')],
          [
            `+ new note "${text}" in ${folder === '' ? 'the top level' : `${folder}/`}`,
          ],
        ),
      ])
    },
    Destination: ({ folder, isNew }) => {
      return h.keyed('div')(
        `destination:${folder}`,
        attributes(isNew ? 'new' : 'sub'),
        [
          h.span(
            [h.Class('t')],
            [
              folder === ''
                ? 'the top level'
                : isNew
                  ? `+ new folder ${folder}/`
                  : `${folder}/`,
            ],
          ),
        ],
      )
    },
  })
}

const titlesIn = (
  notes: ReadonlyArray<Notes.Note>,
  isIn: (folder: string) => boolean,
): string =>
  Array.join(
    Array.map(
      Array.sort(
        Array.filter(notes, note => isIn(note.folder)),
        Notes.newestFirst,
      ).slice(0, previewLines),
      note => Notes.title(note.text),
    ),
    '\n',
  )

const preview = (
  maybeRow: Option.Option<Finder.Row>,
  notes: ReadonlyArray<Notes.Note>,
  now: number,
  h: HtmlBuilder<Message>,
): ReadonlyArray<Html> =>
  Option.match(maybeRow, {
    onNone: () => [],
    onSome: Finder.Row.match({
      Folder: ({ name, path }) => [
        h.div(
          [h.Class('path')],
          [path.slice(0, path.length - name.length), h.b([], [`${name}/`])],
        ),
        h.div([h.Class('meta')], [`folder · enter or type ${name}/ to go in`]),
        h.pre([], [titlesIn(notes, folder => Notes.isUnder(folder, path))]),
      ],
      Note: ({ note }) => [
        h.div(
          [h.Class('path')],
          [
            note.folder === '' ? '' : `${note.folder}/`,
            h.b([], [Notes.title(note.text)]),
          ],
        ),
        h.div(
          [h.Class('meta')],
          [
            `edited ${ago(now - note.modified)}${now - note.modified < minute ? '' : ' ago'}`,
          ],
        ),
        h.pre([], [head(note.text)]),
      ],
      Create: ({ folder, text }) => [
        h.div(
          [h.Class('meta')],
          [`new note in ${folder === '' ? 'the top level' : `${folder}/`}`],
        ),
        h.pre([], [text]),
      ],
      Destination: ({ folder, isNew }) => [
        h.div(
          [h.Class('path')],
          [h.b([], [folder === '' ? '/' : `${folder}/`])],
        ),
        h.div(
          [h.Class('meta')],
          [isNew ? 'new folder' : 'move here with enter'],
        ),
        h.pre([], [titlesIn(notes, other => other === folder)]),
      ],
    }),
  })

const promptTitle = (finder: Finder.Finder, h: HtmlBuilder<Message>): Html =>
  h.span(
    [h.Class('bt')],
    finder.mode._tag === 'Move'
      ? ['move to folder']
      : [
          'notes',
          ...(finder.scope === ''
            ? []
            : Array.flatMap(finder.scope.split('/'), part => [
                ' › ',
                h.b([], [part]),
              ])),
        ],
  )

const resultsTitle = (
  finder: Finder.Finder,
  notes: ReadonlyArray<Notes.Note>,
  h: HtmlBuilder<Message>,
): Html =>
  h.span(
    [h.Class('bt')],
    Option.match(Finder.movingNote(finder, notes), {
      onSome: note => ['move ', h.b([], [Notes.title(note.text)]), ' to…'],
      onNone: () => [
        `${finder.scope === '' ? 'all folders' : `${finder.scope}/`} · ${
          Finder.query(finder) === '' ? 'newest first' : 'best match'
        }`,
      ],
    }),
  )

export const finder = (
  model: Finder.Finder,
  notes: ReadonlyArray<Notes.Note>,
  now: number,
  h: HtmlBuilder<Message>,
): Html => {
  const rows = Finder.rows(model, notes)
  const selected = Finder.highlighted(model, rows.length)
  const isFind = model.mode._tag === 'Find'
  const noteCount = Array.filter(rows, Finder.Row.guards.Note).length
  return h.div(
    [h.Class('finder')],
    [
      h.div([h.Class('backdrop'), h.OnClick(Message.ClickedFinderBackdrop())]),
      h.div(
        [h.Class('win')],
        [
          h.div(
            [h.Class('box prompt')],
            [
              promptTitle(model, h),
              h.div(
                [h.Class('pl')],
                [
                  h.span([h.Class('p')], [isFind ? '❯' : '→']),
                  promptLine(model, h),
                  h.span(
                    [h.Class('cnt')],
                    [
                      isFind
                        ? `${noteCount}/${Notes.inScope(notes, model.scope).length}`
                        : '',
                    ],
                  ),
                ],
              ),
              isFind ? folderRow(model, notes, h) : h.empty,
            ],
          ),
          h.div(
            [h.Class('box results')],
            [
              resultsTitle(model, notes, h),
              h.div(
                [h.Class('rl')],
                Array.map(rows, (row, index) =>
                  rowView(row, index, index === selected, model, now, h),
                ),
              ),
            ],
          ),
          h.div(
            [h.Class('box preview')],
            [
              h.span([h.Class('bt')], ['preview']),
              h.div(
                [h.Class('pvb')],
                preview(Array.get(rows, selected), notes, now, h),
              ),
            ],
          ),
          h.div(
            [h.Class('keys')],
            [
              isFind
                ? 'type name/ to go in · backspace goes up · tab top folders · ctrl-g move · esc close'
                : 'enter move · esc cancel',
            ],
          ),
        ],
      ),
    ],
  )
}
