import { Array, Effect, Match, Option, Queue, Stream } from 'effect'
import { Mount, Render } from 'foldkit'
import { type Html, type HtmlBuilder, createKeyedLazy } from 'foldkit/html'

import * as Reading from './core/reading'
import { Message } from './message'

const pixels = (value: string): number => Number.parseFloat(value) || 0

type Attributes = Parameters<HtmlBuilder<Message>['div']>[0]

type Child = Html | string

const inlinesView = (
  inlines: ReadonlyArray<Reading.Inline>,
  h: HtmlBuilder<Message>,
): ReadonlyArray<Child> => Array.map(inlines, inline => inlineView(inline, h))

const titled = (
  title: Option.Option<string>,
  h: HtmlBuilder<Message>,
): Attributes =>
  Option.match(title, { onNone: () => [], onSome: text => [h.Title(text)] })

const inlineView = (inline: Reading.Inline, h: HtmlBuilder<Message>): Child =>
  Match.typeTags<Reading.Inline, Child>()({
    Text: ({ text }) => text,
    Raw: ({ text }) => h.span([h.Class('raw')], [text]),
    Code: ({ text }) => h.code([], [text]),
    SoftBreak: () => '\n',
    HardBreak: () => h.br([]),
    Emphasis: ({ children }) => h.em([], inlinesView(children, h)),
    Strong: ({ children }) => h.strong([], inlinesView(children, h)),
    Link: ({ href, title, children }) =>
      h.a(
        [
          h.Href(href),
          h.Target('_blank'),
          h.Rel('noopener noreferrer'),
          ...titled(title, h),
        ],
        inlinesView(children, h),
      ),
    Image: ({ src, alt, title }) =>
      h.img([h.Src(src), h.Alt(alt), h.Loading('lazy'), ...titled(title, h)]),
  })(inline)

const taskBox = (box: Reading.Box, h: HtmlBuilder<Message>): Html =>
  h.span(
    [
      h.Class('box'),
      h.Role('checkbox'),
      h.AriaChecked(box.checked),
      h.OnClick(Message.ClickedTask({ box })),
    ],
    [box.checked ? '[x]' : '[ ]'],
  )

const headingTags = {
  1: 'h1',
  2: 'h2',
  3: 'h3',
  4: 'h4',
  5: 'h5',
  6: 'h6',
} as const

const leadChildren = (
  box: Option.Option<Reading.Box>,
  inlines: ReadonlyArray<Reading.Inline>,
  h: HtmlBuilder<Message>,
): ReadonlyArray<Child> => [
  ...Option.match(box, {
    onNone: (): ReadonlyArray<Child> => [],
    onSome: drawnBox => [taskBox(drawnBox, h), ' '],
  }),
  ...inlinesView(inlines, h),
]

const leafView = (
  index: number,
  sourceLine: number,
  leaf: Reading.Leaf,
  h: HtmlBuilder<Message>,
): Html => {
  const key = String(index)
  const placed: Attributes = [
    h.DataAttribute('unit', key),
    h.DataAttribute('source-line', String(sourceLine)),
  ]
  return Match.typeTags<Reading.Leaf, Html>()({
    Paragraph: ({ box, inlines }) =>
      h.keyed('p')(key, placed, leadChildren(box, inlines, h)),
    Plain: ({ box, inlines }) =>
      h.keyed('div')(
        key,
        [h.Class('plain'), ...placed],
        leadChildren(box, inlines, h),
      ),
    Heading: ({ level, inlines }) =>
      h.keyed(headingTags[level])(key, placed, inlinesView(inlines, h)),
    Rule: () => h.keyed('hr')(key, placed),
    CodeLine: ({ text }) => h.keyed('div')(key, placed, [text]),
    RawLine: ({ text }) => h.keyed('div')(key, placed, [text]),
    Empty: () => h.keyed('div')(key, [h.Class('plain'), ...placed]),
  })(leaf)
}

const lazyLeaf = createKeyedLazy()

const nodesView = (
  nodes: ReadonlyArray<Reading.Node>,
  h: HtmlBuilder<Message>,
): ReadonlyArray<Html> => Array.map(nodes, node => nodeView(node, h))

const nodeView = (node: Reading.Node, h: HtmlBuilder<Message>): Html => {
  if (node._tag === 'Leaf') {
    return lazyLeaf(String(node.index), leafView, [
      node.index,
      node.sourceLine,
      node.leaf,
      h,
    ])
  }
  const { holder, isContinued, children } = node
  const inside = nodesView(children, h)
  const key = `${holder._tag}${holder.key}`
  return Match.typeTags<Reading.Holder, Html>()({
    Quote: () => h.keyed('blockquote')(key, [], inside),
    Bullets: () => h.keyed('ul')(key, [], inside),
    Numbers: ({ start }) => h.keyed('ol')(key, [h.Start(start)], inside),
    Item: () =>
      h.keyed('li')(key, isContinued ? [h.Class('continued')] : [], inside),
    Code: ({ info }) =>
      h.keyed('pre')(
        key,
        [
          h.Class('code'),
          ...(info === '' || isContinued
            ? []
            : [h.DataAttribute('info', info)]),
        ],
        [h.code([], inside)],
      ),
    Raw: () => h.keyed('pre')(key, [h.Class('raw')], inside),
  })(holder)
}

const spacer = (
  { from, rows }: Reading.Spacer,
  h: HtmlBuilder<Message>,
): Html =>
  h.div([
    h.Class('spacer'),
    h.DataAttribute('from', String(from)),
    h.Style({ '--lines': String(rows) }),
  ])

const drawnView = (
  drawn: Reading.Drawn,
  h: HtmlBuilder<Message>,
): ReadonlyArray<Html> =>
  drawn.nodes.length === 0
    ? [h.p([h.Class('blank')], ['nothing to read'])]
    : [
        spacer(drawn.above, h),
        ...nodesView(drawn.nodes, h),
        spacer(drawn.below, h),
      ]

type ReadingMessage = typeof Message.ScrolledReading.Type

type Place = Readonly<{ unit: number; offset: number }>

const topPlace: { place: Option.Option<Place> } = { place: Option.none() }

const viewTopOf = (read: HTMLElement): number =>
  read.getBoundingClientRect().top + pixels(getComputedStyle(read).paddingTop)

const spacerAt = (
  read: HTMLElement,
  viewTop: number,
): Option.Option<Reading.At> => {
  const row = pixels(getComputedStyle(read).lineHeight)
  return Option.map(
    Array.findFirst(
      Array.fromIterable(read.querySelectorAll<HTMLElement>('.doc > .spacer')),
      spacerElement => {
        const box = spacerElement.getBoundingClientRect()
        return box.top <= viewTop + 1 && box.bottom > viewTop + 1
      },
    ),
    spacerElement =>
      Reading.At.cases.InSpacer.make({
        from: Number(spacerElement.dataset['from']),
        rowsPast: Math.max(
          0,
          Math.floor(
            (viewTop - spacerElement.getBoundingClientRect().top) / row,
          ),
        ),
      }),
  )
}

const placeOf = (read: HTMLElement, viewTop: number): Option.Option<Place> => {
  const units = Array.fromIterable(
    read.querySelectorAll<HTMLElement>('[data-unit]'),
  )
  return Option.map(
    Option.orElse(
      Array.findFirst(
        units,
        unit => unit.getBoundingClientRect().bottom > viewTop + 1,
      ),
      () => Array.last(units),
    ),
    unit => ({
      unit: Number(unit.dataset['unit']),
      offset: unit.getBoundingClientRect().top - viewTop,
    }),
  )
}

const atOf = (read: HTMLElement): Option.Option<Reading.At> => {
  const viewTop = viewTopOf(read)
  const inSpacer = spacerAt(read, viewTop)
  topPlace.place = Option.isSome(inSpacer)
    ? Option.none()
    : placeOf(read, viewTop)
  return Option.orElse(inSpacer, () =>
    Option.map(topPlace.place, ({ unit }) =>
      Reading.At.cases.OnUnit.make({ unit }),
    ),
  )
}

const restoreTopPlace = (read: HTMLElement): void => {
  Option.map(topPlace.place, ({ unit, offset }) =>
    Option.map(
      Option.fromNullishOr(
        read.querySelector<HTMLElement>(`[data-unit="${unit}"]`),
      ),
      element => {
        const moved =
          element.getBoundingClientRect().top - viewTopOf(read) - offset
        if (moved !== 0) {
          read.scrollTop += moved
        }
      },
    ),
  )
}

const sameAt = (a: Reading.At, b: Reading.At): boolean =>
  JSON.stringify(a) === JSON.stringify(b)

const observe = (read: HTMLElement): Stream.Stream<ReadingMessage> =>
  Stream.callback<ReadingMessage>(queue =>
    Effect.acquireRelease(
      Effect.sync(() => {
        const controller = new AbortController()
        const reported: { at: Option.Option<Reading.At> } = {
          at: Option.none(),
        }
        topPlace.place = Option.none()
        const patches = new MutationObserver(() => restoreTopPlace(read))
        patches.observe(read, { childList: true, subtree: true })
        read.addEventListener(
          'scroll',
          () =>
            Option.map(atOf(read), at => {
              if (!Option.exists(reported.at, last => sameAt(last, at))) {
                reported.at = Option.some(at)
                Queue.offerUnsafe(queue, Message.ScrolledReading({ at }))
              }
            }),
          { signal: controller.signal, passive: true },
        )
        return { controller, patches }
      }),
      ({ controller, patches }) =>
        Effect.sync(() => {
          controller.abort()
          patches.disconnect()
        }),
    ).pipe(Effect.andThen(Effect.never)),
  )

export const ReadingPort = Mount.defineStream('ReadingPort', {
  messages: [Message.ScrolledReading],
  execute: ({ element, viewStateChanges }) =>
    element instanceof HTMLElement
      ? viewStateChanges.pipe(
          Stream.switchMap(viewState =>
            viewState === 'Live' ? observe(element) : Stream.never,
          ),
        )
      : Stream.never,
})

export const reading = (drawn: Reading.Drawn, h: HtmlBuilder<Message>): Html =>
  h.div(
    [h.Class('read'), h.OnMount(ReadingPort())],
    [h.div([h.Class('doc')], drawnView(drawn, h))],
  )

export const readBounds = { control: '.read', selection: '.read' }

const scrollRead = (scroll: (read: HTMLElement) => void): Effect.Effect<void> =>
  Render.afterCommit.pipe(
    Effect.map(() =>
      Option.map(
        Option.fromNullishOr(document.querySelector<HTMLElement>('.read')),
        read => {
          scroll(read)
          topPlace.place = placeOf(read, viewTopOf(read))
        },
      ),
    ),
  )

export const showUnit = (unit: number): Effect.Effect<void> =>
  scrollRead(read =>
    read
      .querySelector(`[data-unit="${unit}"]`)
      ?.scrollIntoView({ block: 'start' }),
  )

const scrollTops = (
  read: HTMLElement,
): Readonly<Record<Reading.Scroll, number>> => {
  const row = pixels(getComputedStyle(read).lineHeight)
  const page = Math.max(row, read.clientHeight - row)
  return {
    LineUp: read.scrollTop - row,
    LineDown: read.scrollTop + row,
    PageUp: read.scrollTop - page,
    PageDown: read.scrollTop + page,
    Start: 0,
    End: read.scrollHeight,
  }
}

export const scrollReading = (to: Reading.Scroll): Effect.Effect<void> =>
  scrollRead(read => read.scrollTo({ top: scrollTops(read)[to] }))
