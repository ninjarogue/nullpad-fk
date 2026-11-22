import { Array, Option } from 'effect'

import * as Stack from './stack'
import {
  type Block,
  type Document,
  type Inline,
  type Item,
  type List,
  type Phrasing,
  type Placed,
  type Point,
  positionOf,
} from './tree'

type Written = Stack.Stack<string>

const references: Readonly<Record<string, string>> = {
  '&': '&amp;',
  '<': '&lt;',
  '>': '&gt;',
  '"': '&quot;',
}

const special = /[&<>"]/g

const escaped = (text: string): string =>
  text.replace(special, character => references[character] ?? character)

const lineEnd = (written: Written): Written =>
  written._tag === 'Empty' || written.top === '\n'
    ? written
    : Stack.push(written, '\n')

const titleOf = (title: Option.Option<string>): Option.Option<string> =>
  Option.filter(title, text => text !== '')

const writeInlines = (
  written: Written,
  inlines: ReadonlyArray<Inline>,
  tagged: boolean,
): Written =>
  Array.reduce(inlines, written, (out, inline) =>
    writeInline(out, inline, tagged),
  )

const wrapped = (
  written: Written,
  open: string,
  children: ReadonlyArray<Inline>,
  close: string,
  tagged: boolean,
): Written =>
  tagged
    ? Stack.push(writeInlines(Stack.push(written, open), children, true), close)
    : writeInlines(written, children, false)

const writeInline = (
  written: Written,
  inline: Inline,
  tagged: boolean,
): Written => {
  if (
    inline._tag === 'Text' ||
    inline._tag === 'Escape' ||
    inline._tag === 'Entity'
  ) {
    return Stack.push(written, escaped(inline.text))
  }
  if (inline._tag === 'SoftBreak') {
    return Stack.push(written, '\n')
  }
  if (inline._tag === 'HardBreak') {
    return lineEnd(tagged ? Stack.push(written, '<br />') : written)
  }
  if (inline._tag === 'Code') {
    return Stack.push(
      written,
      tagged ? `<code>${escaped(inline.text)}</code>` : escaped(inline.text),
    )
  }
  if (inline._tag === 'Html') {
    return Stack.push(written, inline.text)
  }
  if (inline._tag === 'Autolink') {
    return Stack.push(
      written,
      tagged
        ? `<a href="${escaped(inline.destination)}">${escaped(inline.text)}</a>`
        : escaped(inline.text),
    )
  }
  if (inline._tag === 'Emphasis') {
    return wrapped(written, '<em>', inline.children, '</em>', tagged)
  }
  if (inline._tag === 'Strong') {
    return wrapped(written, '<strong>', inline.children, '</strong>', tagged)
  }
  const title = titleOf(inline.title)
  if (inline._tag === 'Link') {
    return wrapped(
      written,
      `<a href="${escaped(inline.destination)}"${Option.match(title, {
        onNone: () => '',
        onSome: text => ` title="${escaped(text)}"`,
      })}>`,
      inline.children,
      '</a>',
      tagged,
    )
  }
  const alt = writeInlines(
    tagged
      ? Stack.push(written, `<img src="${escaped(inline.destination)}" alt="`)
      : written,
    inline.children,
    false,
  )
  return tagged
    ? Stack.push(
        alt,
        `${Option.match(title, {
          onNone: () => '',
          onSome: text => `" title="${escaped(text)}`,
        })}" />`,
      )
    : alt
}

const languageOf = (info: string): Option.Option<string> =>
  Option.filter(Array.head(info.split(/\s+/)), word => word !== '')

const codeOpening = (info: string): string =>
  Option.match(languageOf(info), {
    onNone: () => '<pre><code>',
    onSome: language =>
      `<pre><code class="${escaped(language).startsWith('language-') ? '' : 'language-'}${escaped(language)}">`,
  })

const listTags = ({ kind }: List<unknown>): readonly [string, string] => {
  if (kind._tag === 'Bullet') {
    return ['<ul>', '</ul>']
  }
  return [kind.start === 1 ? '<ol>' : `<ol start="${kind.start}">`, '</ol>']
}

const onOwnLine = (written: Written, text: string): Written =>
  lineEnd(Stack.push(lineEnd(written), text))

const writeItem =
  (tight: boolean) =>
  (written: Written, item: Item<Phrasing>): Written =>
    lineEnd(
      Stack.push(
        Array.reduce(
          item.children,
          Stack.push(written, '<li>'),
          writeBlock(tight),
        ),
        '</li>',
      ),
    )

const writeBlock =
  (tight: boolean) =>
  (written: Written, block: Block): Written => {
    if (block._tag === 'Paragraph') {
      return tight
        ? writeInlines(written, block.content.inlines, true)
        : lineEnd(
            Stack.push(
              writeInlines(
                Stack.push(lineEnd(written), '<p>'),
                block.content.inlines,
                true,
              ),
              '</p>',
            ),
          )
    }
    if (block._tag === 'Heading') {
      return lineEnd(
        Stack.push(
          writeInlines(
            Stack.push(lineEnd(written), `<h${block.level}>`),
            block.content.inlines,
            true,
          ),
          `</h${block.level}>`,
        ),
      )
    }
    if (block._tag === 'ThematicBreak') {
      return onOwnLine(written, '<hr />')
    }
    if (block._tag === 'CodeBlock') {
      return onOwnLine(
        written,
        `${codeOpening(block.style._tag === 'Fenced' ? block.style.info : '')}${escaped(block.text)}</code></pre>`,
      )
    }
    if (block._tag === 'HtmlBlock') {
      return onOwnLine(written, block.text)
    }
    if (block._tag === 'Definition') {
      return written
    }
    if (block._tag === 'Quote') {
      return onOwnLine(
        Array.reduce(
          block.children,
          onOwnLine(written, '<blockquote>'),
          writeBlock(false),
        ),
        '</blockquote>',
      )
    }
    const [open, close] = listTags(block)
    return onOwnLine(
      Array.reduce(
        block.items,
        onOwnLine(written, open),
        writeItem(block.tight),
      ),
      close,
    )
  }

export const toHtml = (document: Document): string =>
  Array.join(
    Stack.toArray(
      Array.reduce(document.sections, Stack.empty, (written: Written, placed) =>
        Array.reduce(placed.section.blocks, written, writeBlock(false)),
      ),
    ),
    '',
  )

type Node = Block | Item<Phrasing> | Inline

const shownOf = (node: Node): Option.Option<string> => {
  if (
    node._tag === 'Link' ||
    node._tag === 'Image' ||
    node._tag === 'Definition'
  ) {
    return Option.some(node.destination)
  }
  return 'text' in node ? Option.some(node.text) : Option.none()
}

const childrenOf = (node: Node): ReadonlyArray<Node> => {
  if (node._tag === 'Paragraph' || node._tag === 'Heading') {
    return node.content.inlines
  }
  if (node._tag === 'List') {
    return node.items
  }
  return 'children' in node ? node.children : []
}

const placeOf = (placed: Placed, point: Point): string => {
  const { line, column } = positionOf(placed, point)
  return `${line + 1}:${column}`
}

const rowOf = (placed: Placed, depth: number, node: Node): string =>
  `${'  '.repeat(depth)}${node._tag} ${placeOf(placed, node.span.from)}-${placeOf(placed, node.span.to)}${Option.match(
    shownOf(node),
    { onNone: () => '', onSome: shown => ` ${JSON.stringify(shown)}` },
  )}`

const rowsOf =
  (placed: Placed, depth: number) =>
  (rows: Stack.Stack<string>, node: Node): Stack.Stack<string> =>
    Array.reduce(
      childrenOf(node),
      Stack.push(rows, rowOf(placed, depth, node)),
      rowsOf(placed, depth + 1),
    )

export const outline = (document: Document): string =>
  Array.join(
    Stack.toArray(
      Array.reduce(
        document.sections,
        Stack.empty,
        (rows: Stack.Stack<string>, placed) =>
          Array.reduce(placed.section.blocks, rows, rowsOf(placed, 0)),
      ),
    ),
    '\n',
  )
