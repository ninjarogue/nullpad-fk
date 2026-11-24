import {
  Array,
  Effect,
  Match,
  Option,
  Queue,
  Record,
  Schema,
  Stream,
} from 'effect'
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
  h.span([
    h.Class('box'),
    h.Role('checkbox'),
    h.AriaChecked(box.checked),
    h.OnClick(Message.ClickedTask({ box })),
  ])

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
    onSome: drawnBox => [taskBox(drawnBox, h)],
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
  { from, height }: Reading.Spacer,
  h: HtmlBuilder<Message>,
): Html =>
  h.div([
    h.Class('spacer'),
    h.DataAttribute('from', String(from)),
    h.Style({ height: `${height}px` }),
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

const viewTopOf = (read: HTMLElement): number =>
  read.getBoundingClientRect().top + pixels(getComputedStyle(read).paddingTop)

const spacerAt = (
  read: HTMLElement,
  viewTop: number,
): Option.Option<Reading.At> =>
  Option.map(
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
        pixelsPast: Math.max(
          0,
          Math.floor(viewTop - spacerElement.getBoundingClientRect().top),
        ),
      }),
  )

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

type Top = Readonly<{
  at: Option.Option<Reading.At>
  place: Option.Option<Place>
}>

const topOf = (read: HTMLElement): Top => {
  const viewTop = viewTopOf(read)
  const inSpacer = spacerAt(read, viewTop)
  const place = Option.isSome(inSpacer) ? Option.none() : placeOf(read, viewTop)
  return {
    at: Option.orElse(inSpacer, () =>
      Option.map(place, ({ unit }) => Reading.At.cases.OnUnit.make({ unit })),
    ),
    place,
  }
}

const restorePlace = (read: HTMLElement, place: Option.Option<Place>): void => {
  Option.map(place, ({ unit, offset }) =>
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

const sameAt = Schema.toEquivalence(Reading.At)

const observe = (read: HTMLElement): Stream.Stream<ReadingMessage> =>
  Stream.callback<ReadingMessage>(queue =>
    Effect.acquireRelease(
      Effect.sync(() => {
        const controller = new AbortController()
        const seen: {
          reported: Option.Option<Reading.At>
          place: Option.Option<Place>
        } = { reported: Option.none(), place: Option.none() }
        const patches = new MutationObserver(() =>
          restorePlace(read, seen.place),
        )
        patches.observe(read, { childList: true, subtree: true })
        read.addEventListener(
          'scroll',
          () => {
            const top = topOf(read)
            seen.place = top.place
            Option.map(top.at, at => {
              if (!Option.exists(seen.reported, last => sameAt(last, at))) {
                seen.reported = Option.some(at)
                Queue.offerUnsafe(queue, Message.ScrolledReading({ at }))
              }
            })
          },
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

const { headings, ...sizes } = Reading.metrics

const kebab = (name: string): string =>
  name.replace(/[A-Z]/gu, letter => `-${letter.toLowerCase()}`)

const docMetrics: Readonly<Record<string, string>> = {
  ...Record.fromEntries(
    Array.map(Record.toEntries(sizes), ([name, value]) => [
      `--read-${kebab(name)}`,
      `${value}px`,
    ]),
  ),
  ...Record.fromEntries(
    Array.flatMap(Record.toEntries(headings), ([level, set]) =>
      Array.map(Record.toEntries(set), ([name, value]) => [
        `--read-h${level}-${name}`,
        `${value}px`,
      ]),
    ),
  ),
}

export const reading = (drawn: Reading.Drawn, h: HtmlBuilder<Message>): Html =>
  h.div(
    [h.Class('read'), h.OnMount(ReadingPort())],
    [h.div([h.Class('doc'), h.Style(docMetrics)], drawnView(drawn, h))],
  )

export const readBounds = { control: '.read', selection: '.read' }

const announceScroll = (read: HTMLElement): void => {
  read.dispatchEvent(new Event('scroll'))
}

const scrollRead = (scroll: (read: HTMLElement) => void): Effect.Effect<void> =>
  Render.afterCommit.pipe(
    Effect.map(() =>
      Option.map(
        Option.fromNullishOr(document.querySelector<HTMLElement>('.read')),
        read => {
          scroll(read)
          announceScroll(read)
        },
      ),
    ),
  )

const scrollTops = (
  read: HTMLElement,
): Readonly<Record<Reading.Scroll, number>> => {
  const row = Reading.metrics.leading
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

const scrollTo = (read: HTMLElement, to: Reading.Scroll): void =>
  read.scrollTo({ top: scrollTops(read)[to] })

export const scrollReading = (to: Reading.Scroll): Effect.Effect<void> =>
  scrollRead(read => scrollTo(read, to))

export const reveal = (target: Reading.Reveal): Effect.Effect<void> =>
  scrollRead(read =>
    Reading.Reveal.match(target, {
      Start: () => scrollTo(read, 'Start'),
      Unit: ({ unit }) =>
        read
          .querySelector(`[data-unit="${unit}"]`)
          ?.scrollIntoView({ block: 'start' }),
      End: () => scrollTo(read, 'End'),
    }),
  )
