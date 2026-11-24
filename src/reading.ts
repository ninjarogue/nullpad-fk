import { Array, Effect, Match, Option, Queue, Stream } from 'effect'
import { Dom, Mount, Render } from 'foldkit'
import { type Html, type HtmlBuilder, createKeyedLazy } from 'foldkit/html'

import type * as Reading from './core/reading'
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

type BlockTag =
  | 'p'
  | 'div'
  | 'h1'
  | 'h2'
  | 'h3'
  | 'h4'
  | 'h5'
  | 'h6'
  | 'hr'
  | 'pre'
  | 'blockquote'
  | 'ul'
  | 'ol'

type Element = (
  tag: BlockTag,
  attributes: Attributes,
  children?: ReadonlyArray<Child>,
) => Html

const nested =
  (h: HtmlBuilder<Message>): Element =>
  (tag, attributes, children) =>
    tag === 'hr' ? h.hr(attributes) : h[tag](attributes, children)

const keyed =
  (key: string, h: HtmlBuilder<Message>): Element =>
  (tag, attributes, children) =>
    h.keyed(tag)(key, attributes, children)

const headingTags = {
  1: 'h1',
  2: 'h2',
  3: 'h3',
  4: 'h4',
  5: 'h5',
  6: 'h6',
} satisfies Record<number, BlockTag>

const blocksView = (
  blocks: ReadonlyArray<Reading.Block>,
  h: HtmlBuilder<Message>,
): ReadonlyArray<Html> =>
  Array.map(blocks, block => blockView(block, [], nested(h), h))

const itemsView = (
  items: ReadonlyArray<ReadonlyArray<Reading.Block>>,
  h: HtmlBuilder<Message>,
): ReadonlyArray<Html> =>
  Array.map(items, item => h.li([], blocksView(item, h)))

const blockView = (
  block: Reading.Block,
  attributes: Attributes,
  element: Element,
  h: HtmlBuilder<Message>,
): Html =>
  Match.typeTags<Reading.Block, Html>()({
    Paragraph: ({ inlines }) =>
      element('p', attributes, inlinesView(inlines, h)),
    Plain: ({ inlines }) =>
      element(
        'div',
        [h.Class('plain'), ...attributes],
        inlinesView(inlines, h),
      ),
    Heading: ({ level, inlines }) =>
      element(headingTags[level], attributes, inlinesView(inlines, h)),
    Rule: () => element('hr', attributes),
    Code: ({ info, text }) =>
      element(
        'pre',
        [
          h.Class('code'),
          ...(info === '' ? [] : [h.DataAttribute('info', info)]),
          ...attributes,
        ],
        [h.code([], [text])],
      ),
    Raw: ({ text }) => element('pre', [h.Class('raw'), ...attributes], [text]),
    Quote: ({ children }) =>
      element('blockquote', attributes, blocksView(children, h)),
    BulletList: ({ items }) => element('ul', attributes, itemsView(items, h)),
    OrderedList: ({ start, items }) =>
      element(
        'ol',
        [...(start === 1 ? [] : [h.Start(start)]), ...attributes],
        itemsView(items, h),
      ),
  })(block)

const shownView = (
  sourceLine: number,
  block: Reading.Block,
  h: HtmlBuilder<Message>,
): Html =>
  blockView(
    block,
    [h.DataAttribute('source-line', String(sourceLine))],
    keyed(String(sourceLine), h),
    h,
  )

const lazyShown = createKeyedLazy()

const spacer = (from: number, lines: number, h: HtmlBuilder<Message>): Html =>
  h.div([
    h.Class('spacer'),
    h.DataAttribute('from', String(from)),
    h.Style({ '--lines': String(lines) }),
  ])

const shownBlocks = (
  drawn: Reading.Drawn,
  h: HtmlBuilder<Message>,
): ReadonlyArray<Html> =>
  Array.match(drawn.shown, {
    onEmpty: () => [h.p([h.Class('blank')], ['nothing to read'])],
    onNonEmpty: shown => {
      const first = Array.headNonEmpty(shown)
      const last = Array.lastNonEmpty(shown)
      return [
        spacer(first.sourceLine - drawn.above, drawn.above, h),
        ...Array.map(shown, ({ sourceLine, block }) =>
          lazyShown(sourceLine, shownView, [sourceLine, block, h]),
        ),
        spacer(last.sourceLine + last.lineCount, drawn.below, h),
      ]
    },
  })

type ReadingMessage = typeof Message.ScrolledReading.Type

const topSourceLine = (read: HTMLElement): number => {
  const style = getComputedStyle(read)
  const row = pixels(style.lineHeight)
  const viewTop = read.getBoundingClientRect().top + pixels(style.paddingTop)
  const lineOf = (element: HTMLElement, name: string) =>
    Number(element.dataset[name])
  const blocks = Array.fromIterable(
    read.querySelectorAll<HTMLElement>('.doc > [data-source-line]'),
  )
  return Option.match(
    Array.findFirst(
      blocks,
      block => block.getBoundingClientRect().bottom > viewTop + 1,
    ),
    {
      onNone: () =>
        Option.match(
          Option.fromNullishOr(
            read.querySelector<HTMLElement>('.doc > .spacer:last-child'),
          ),
          {
            onNone: () => 1,
            onSome: below =>
              lineOf(below, 'from') +
              Math.max(
                0,
                Math.floor((viewTop - below.getBoundingClientRect().top) / row),
              ),
          },
        ),
      onSome: block => {
        const above = block.getBoundingClientRect().top - viewTop
        return above > 1
          ? lineOf(block, 'sourceLine') - Math.ceil(above / row)
          : lineOf(block, 'sourceLine')
      },
    },
  )
}

const observe = (read: HTMLElement): Stream.Stream<ReadingMessage> =>
  Stream.callback<ReadingMessage>(queue =>
    Effect.acquireRelease(
      Effect.sync(() => {
        const controller = new AbortController()
        const reported = { top: topSourceLine(read) }
        read.addEventListener(
          'scroll',
          () => {
            const top = topSourceLine(read)
            if (top !== reported.top) {
              reported.top = top
              Queue.offerUnsafe(queue, Message.ScrolledReading({ top }))
            }
          },
          { signal: controller.signal, passive: true },
        )
        return controller
      }),
      controller => Effect.sync(() => controller.abort()),
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
    [h.div([h.Class('doc')], shownBlocks(drawn, h))],
  )

export const readBounds = { control: '.read', selection: '.read' }

export const showSourceLine = (sourceLine: number): Effect.Effect<void> =>
  Dom.scrollIntoView(`.read [data-source-line="${sourceLine}"]`, {
    block: 'start',
  }).pipe(Effect.ignore)

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
  Render.afterCommit.pipe(
    Effect.map(() =>
      Option.map(
        Option.fromNullishOr(document.querySelector<HTMLElement>('.read')),
        read => read.scrollTo({ top: scrollTops(read)[to] }),
      ),
    ),
  )
