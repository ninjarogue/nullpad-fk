import { examples } from './examples'
import { comment, isolated } from './grids'
import { entityTable } from './reference'

export type Place = Readonly<{ line: number; column: number }>

export type Row = Readonly<{
  index: number
  tag: string
  from: Place
  to: Place
  text: string | undefined
  parent: number | undefined
}>

const rowPattern =
  /^( *)([A-Za-z]+) (\d+):(\d+)-(\d+):(\d+)(?: ("(?:[^"\\]|\\.)*"))?$/

export const readOutline = (shown: string): ReadonlyArray<Row> => {
  if (shown === '') {
    return []
  }
  const rows: Array<Row> = []
  const open: Array<number> = []
  for (const [index, written] of shown.split('\n').entries()) {
    const found = rowPattern.exec(written)
    if (found === null || (found[1] ?? '').length % 2 !== 0) {
      throw new Error(
        `row ${index + 1} is not in the outline format: ${JSON.stringify(written)}`,
      )
    }
    const [
      ,
      indent = '',
      tag = '',
      fromLine,
      fromColumn,
      toLine,
      toColumn,
      text,
    ] = found
    const depth = indent.length / 2
    open.length = depth
    rows.push({
      index,
      tag,
      from: { line: Number(fromLine), column: Number(fromColumn) },
      to: { line: Number(toLine), column: Number(toColumn) },
      text: text === undefined ? undefined : (JSON.parse(text) as string),
      parent: depth === 0 ? undefined : open[depth - 1],
    })
    open[depth] = index
  }
  return rows
}

const blockTags = new Set([
  'Paragraph',
  'Heading',
  'ThematicBreak',
  'CodeBlock',
  'HtmlBlock',
  'Definition',
  'Quote',
  'List',
])

const inlineTags = new Set([
  'Text',
  'Escape',
  'Entity',
  'SoftBreak',
  'HardBreak',
  'Code',
  'Emphasis',
  'Strong',
  'Link',
  'Image',
  'Autolink',
  'Html',
])

const holds = (parent: string, child: string): boolean =>
  parent === 'List'
    ? child === 'Item'
    : parent === 'Quote' || parent === 'Item'
      ? blockTags.has(child)
      : [
            'Paragraph',
            'Heading',
            'Emphasis',
            'Strong',
            'Link',
            'Image',
          ].includes(parent)
        ? inlineTags.has(child)
        : false

const unlistedCharacters: Readonly<Record<string, string>> = {
  Paragraph: ' \t>',
  Heading: '# \t>=-',
  Emphasis: '*_ \t>',
  Strong: '*_ \t>',
}

type Context = Readonly<{
  row: Row
  source: string
  kids: ReadonlyArray<Row>
  singleLine: boolean
  offset: (place: Place) => number
  from: number
  to: number
}>

type Finding = Readonly<{ rule: string; detail: string }> | undefined

const fail = (rule: string, detail: string): Finding => ({ rule, detail })

const decoded = (reference: string): string | undefined => {
  const name = reference.slice(1, -1)
  if (!name.startsWith('#')) {
    return entityTable()[name]
  }
  const hex = /^#[xX]/.test(name)
  const value = Number.parseInt(name.slice(hex ? 2 : 1), hex ? 16 : 10)
  return value === 0 || value > 0x10ffff || (value >= 0xd800 && value <= 0xdfff)
    ? '�'
    : String.fromCodePoint(value)
}

const delimited =
  (width: number) =>
  ({ row, source, kids, offset, from, to }: Context): Finding => {
    const delimiter = source.charAt(0).repeat(width)
    if (
      !/^[*_]/.test(source) ||
      !source.startsWith(delimiter) ||
      !source.endsWith(delimiter) ||
      source.length < 2 * width + 1
    ) {
      return fail(
        `${row.tag} starts and ends with ${width === 1 ? 'one' : 'two'} of the same * or _`,
        JSON.stringify(source),
      )
    }
    const first = kids[0]
    const last = kids[kids.length - 1]
    return first !== undefined &&
      last !== undefined &&
      (offset(first.from) < from + width || offset(last.to) > to - width)
      ? fail(
          `the children of ${row.tag} lie between its delimiters`,
          JSON.stringify(source),
        )
      : undefined
  }

const linked =
  (opening: string) =>
  ({ row, source, kids, offset, from }: Context): Finding => {
    if (!source.startsWith(opening) || !/[)\]]$/.test(source)) {
      return fail(
        `${row.tag} starts with ${opening} and ends with ) or ]`,
        JSON.stringify(source),
      )
    }
    const first = kids[0]
    return first !== undefined && offset(first.from) < from + opening.length
      ? fail(
          `the children of ${row.tag} lie after ${opening}`,
          JSON.stringify(source),
        )
      : undefined
  }

const tagRules: Readonly<Record<string, (context: Context) => Finding>> = {
  Text: ({ source, row, singleLine }) =>
    singleLine && source === row.text
      ? undefined
      : fail('the source under a Text is its text', JSON.stringify(source)),
  Escape: ({ source, row }) =>
    source === `\\${row.text}` && /^[!-/:-@[-`{-~]$/.test(row.text ?? '')
      ? undefined
      : fail(
          'an Escape is a backslash and its text, one ASCII punctuation character',
          JSON.stringify(source),
        ),
  Entity: ({ source, row }) =>
    source.startsWith('&') &&
    source.endsWith(';') &&
    decoded(source) === row.text
      ? undefined
      : fail(
          'an Entity starts with & and ends with ;, and its text is what the reference decodes',
          JSON.stringify(source),
        ),
  SoftBreak: ({ source }) =>
    /^ ?$/.test(source)
      ? undefined
      : fail(
          'a SoftBreak is empty or the one space that ends a line',
          JSON.stringify(source),
        ),
  HardBreak: ({ source }) =>
    /^(?: {2,}|\\)$/.test(source)
      ? undefined
      : fail(
          'a HardBreak is a backslash or two or more spaces',
          JSON.stringify(source),
        ),
  Emphasis: delimited(1),
  Strong: delimited(2),
  Code: ({ source, row, singleLine }) => {
    const opening = /^`+/.exec(source)?.[0] ?? ''
    const closing = /`+$/.exec(source)?.[0] ?? ''
    if (
      opening.length === 0 ||
      opening.length !== closing.length ||
      source.length < opening.length * 2 + 1
    ) {
      return fail(
        'Code starts and ends with backtick runs of one length',
        JSON.stringify(source),
      )
    }
    if (!singleLine) {
      return undefined
    }
    const inner = source.slice(opening.length, source.length - closing.length)
    const stripped =
      inner.startsWith(' ') && inner.endsWith(' ') && inner.trim() !== ''
        ? inner.slice(1, -1)
        : inner
    return stripped === row.text
      ? undefined
      : fail(
          'the text of a Code is its source less the backtick runs, and one space at each end when both have one',
          JSON.stringify(source),
        )
  },
  Link: linked('['),
  Image: linked('!['),
  Autolink: ({ source, row, singleLine }) =>
    source.startsWith('<') &&
    source.endsWith('>') &&
    (!singleLine || source.slice(1, -1) === row.text)
      ? undefined
      : fail(
          'an Autolink starts with < and ends with >, and its text is what lies between',
          JSON.stringify(source),
        ),
  Html: ({ source, row, singleLine }) =>
    source.startsWith('<') &&
    source.endsWith('>') &&
    (!singleLine || source === row.text)
      ? undefined
      : fail(
          'an Html starts with < and ends with >, and its text is its source',
          JSON.stringify(source),
        ),
  Quote: ({ source }) =>
    source.startsWith('>')
      ? undefined
      : fail('a Quote starts with >', JSON.stringify(source.slice(0, 20))),
  Paragraph: ({ kids, from, to, offset, source }) => {
    const first = kids[0]
    const last = kids[kids.length - 1]
    return first !== undefined &&
      last !== undefined &&
      offset(first.from) === from &&
      offset(last.to) === to
      ? undefined
      : fail(
          'the first child of a Paragraph starts where it starts and the last ends where it ends',
          JSON.stringify(source),
        )
  },
  Heading: ({ source, singleLine }) =>
    singleLine
      ? source.startsWith('#')
        ? undefined
        : fail('an ATX Heading starts with #', JSON.stringify(source))
      : /(?:=+|-+)[ \t]*$/.test(source)
        ? undefined
        : fail(
            'a setext Heading ends at its underline',
            JSON.stringify(source),
          ),
  ThematicBreak: ({ source }) =>
    /^([-*_])(?:[ \t]*\1){2,}[ \t]*$/.test(source.trim())
      ? undefined
      : fail(
          'a ThematicBreak is three or more of one of - * _ and spaces',
          JSON.stringify(source),
        ),
  Item: ({ source }) =>
    /^(?:[-+*]|\d{1,9}[.)])(?:[ \t\n]|$)/.test(source)
      ? undefined
      : fail(
          'an Item starts with its marker',
          JSON.stringify(source.slice(0, 20)),
        ),
  Definition: ({ source }) =>
    source.startsWith('[')
      ? undefined
      : fail('a Definition starts with [', JSON.stringify(source)),
  HtmlBlock: ({ source }) =>
    /^ {0,3}</.test(source)
      ? undefined
      : fail(
          'an HtmlBlock starts with <, after up to three spaces that belong to it',
          JSON.stringify(source),
        ),
  CodeBlock: ({ row }) =>
    row.text === '' || row.text?.endsWith('\n')
      ? undefined
      : fail(
          'the text of a CodeBlock ends in a line feed',
          JSON.stringify(row.text),
        ),
}

export const brokenRules = (
  markdown: string,
  rows: ReadonlyArray<Row>,
): ReadonlyArray<string> => {
  const lines = markdown.split(/\r\n|\r|\n/)
  const note = lines.join('\n')
  const starts: Array<number> = [0]
  for (const line of lines) {
    starts.push((starts[starts.length - 1] ?? 0) + line.length + 1)
  }
  const offset = (place: Place): number =>
    (starts[place.line - 1] ?? 0) + place.column
  const inside = (place: Place): boolean =>
    place.line >= 1 &&
    place.line <= lines.length &&
    place.column <= (lines[place.line - 1] ?? '').length
  const found: Array<string> = []
  const say = (rule: string, row: Row, detail: string): void => {
    found.push(
      `${rule} | ${row.tag} ${row.from.line}:${row.from.column}-${row.to.line}:${row.to.column} ${JSON.stringify(row.text)} | ${detail}`,
    )
  }
  const children = new Map<number | undefined, Array<Row>>()
  for (const row of rows) {
    const siblings = children.get(row.parent) ?? []
    siblings.push(row)
    children.set(row.parent, siblings)
  }

  for (const row of rows) {
    const from = offset(row.from)
    const to = offset(row.to)
    if (!inside(row.from) || !inside(row.to) || from > to) {
      say(
        'a place lies in the note and the start is not after the end',
        row,
        'outside',
      )
      continue
    }
    const source = note.slice(from, to)
    const kids = children.get(row.index) ?? []
    const parent = row.parent === undefined ? undefined : rows[row.parent]

    if (from === to && row.tag !== 'SoftBreak') {
      say('only a SoftBreak is empty', row, 'empty')
    }
    if (parent === undefined) {
      if (!blockTags.has(row.tag)) {
        say('a top-level node is a block', row, 'not a block')
      }
    } else {
      if (from < offset(parent.from) || to > offset(parent.to)) {
        say(
          'a child lies inside its parent',
          row,
          `${parent.tag} ${parent.from.line}:${parent.from.column}-${parent.to.line}:${parent.to.column}`,
        )
      }
      if (!holds(parent.tag, row.tag)) {
        say(
          'a node sits under a parent that can hold it',
          row,
          `under ${parent.tag}`,
        )
      }
    }
    kids.forEach((kid, position) => {
      const before = kids[position - 1]
      if (before !== undefined && offset(kid.from) < offset(before.to)) {
        say(
          'siblings are in order and do not overlap',
          kid,
          `${before.tag} before it ends at ${before.to.line}:${before.to.column}`,
        )
      }
    })

    const markers = unlistedCharacters[row.tag]
    if (markers !== undefined) {
      const covered = kids.map(
        kid => [offset(kid.from), offset(kid.to)] as const,
      )
      const lost = [...source].findIndex(
        (character, at) =>
          character !== '\n' &&
          !markers.includes(character) &&
          !covered.some(
            ([start, end]) => from + at >= start && from + at < end,
          ),
      )
      if (lost >= 0) {
        say(
          'every character of a paragraph, a heading, emphasis or strong emphasis is under a child or is a marker or a space',
          row,
          `${JSON.stringify(source[lost])} at ${lost} of ${JSON.stringify(source)}`,
        )
      }
    }

    if (row.tag === 'List') {
      const kinds = kids.map(
        kid =>
          /^(?:([-+*])|\d{1,9}([.)]))/.exec(
            note.slice(offset(kid.from), offset(kid.to)),
          )?.[1] ??
          /^(?:([-+*])|\d{1,9}([.)]))/.exec(
            note.slice(offset(kid.from), offset(kid.to)),
          )?.[2],
      )
      if (kids.length === 0 || new Set(kinds).size !== 1) {
        say(
          'the items of a List share one bullet or one number delimiter',
          row,
          JSON.stringify(kinds),
        )
      }
    }

    const finding = tagRules[row.tag]?.({
      row,
      source,
      kids,
      singleLine: row.from.line === row.to.line,
      offset,
      from,
      to,
    })
    if (finding !== undefined) {
      say(finding.rule, row, finding.detail)
    }
  }

  const blocksOf = children.get(undefined) ?? []
  let next = 0
  for (const [index, text] of lines.entries()) {
    while ((blocksOf[next]?.to.line ?? Infinity) < index + 1) {
      next += 1
    }
    const block = blocksOf[next]
    if (
      text.trim() !== '' &&
      (block === undefined || block.from.line > index + 1)
    ) {
      found.push(
        `a line with text lies in a top-level block | line ${index + 1} | ${JSON.stringify(text)}`,
      )
    }
  }
  return found
}

export type PlaceNote = Readonly<{ label: string; markdown: string }>

const examplesPerNote = 40

const joinedBy = (markdown: ReadonlyArray<string>): string =>
  markdown.join(`\n\n${comment.markdown}\n\n`)

const sharing = (
  notes: ReadonlyArray<string>,
): Readonly<{
  shared: ReadonlyArray<string>
  alone: ReadonlyArray<string>
}> => ({
  shared: notes.filter(isolated(comment)),
  alone: notes.filter(note => !isolated(comment)(note)),
})

const chunked = <A>(
  items: ReadonlyArray<A>,
  size: number,
): ReadonlyArray<ReadonlyArray<A>> =>
  Array.from({ length: Math.ceil(items.length / size) }, (_, index) =>
    items.slice(index * size, (index + 1) * size),
  )

export const placeNotes = (): ReadonlyArray<PlaceNote> => {
  const fromExamples = sharing(examples().map(example => example.markdown))
  return [
    ...chunked(fromExamples.shared, examplesPerNote).map((part, index) => ({
      label: `spec examples, part ${index + 1}`,
      markdown: joinedBy(part),
    })),
    ...fromExamples.alone.map((markdown, index) => ({
      label: `spec example that cannot share a note, ${index + 1}`,
      markdown,
    })),
  ]
}
