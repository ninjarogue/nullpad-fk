export type AcceptedDifference = Readonly<{
  name: string
  covers: (markdown: string) => boolean
  example: Readonly<{ markdown: string; html: string }>
}>

const deepestNesting = 100

const nonBlanks =
  '\\u000b\\u000c\\u00a0\\u1680\\u2000-\\u200a\\u2028\\u2029\\u202f\\u205f\\u3000\\ufeff'

const blockMarkers =
  '(?:[ \\t]*(?:>|[-+*]|\\d{1,9}[.)]|#{1,6})(?=[ \\t]))*[ \\t]*'

const edgeOfALine = new RegExp(
  `(^|\\n)${blockMarkers}[${nonBlanks}]|[${nonBlanks}][ \\t]*(?:#+[ \\t]*)?(\\n|$)`,
)

const definitionLabels = (markdown: string): ReadonlyArray<string> =>
  [...markdown.matchAll(/^ {0,3}\[((?:[^\]\\\n]|\\.)+)\]:/gm)].map(
    ([, label]) => (label ?? '').trim().replace(/\s+/g, ' ').toLowerCase(),
  )

const codePointOfReference = (digits: string, hex: boolean): number =>
  Number.parseInt(digits, hex ? 16 : 10)

const referencesInTheC1Range = (markdown: string): boolean =>
  [...markdown.matchAll(/&#(?:[xX]([0-9a-fA-F]{1,6})|([0-9]{1,7}));/g)].some(
    ([, hex, decimal]) => {
      const value = codePointOfReference(
        hex ?? decimal ?? '',
        hex !== undefined,
      )
      return value >= 0x80 && value <= 0x9f
    },
  )

export const acceptedDifferences: ReadonlyArray<AcceptedDifference> = [
  {
    name: 'the nesting limit',
    covers: markdown =>
      (markdown.match(/[>[*_+\-.)]/g) ?? []).length > deepestNesting,
    example: {
      markdown: `${'>'.repeat(deepestNesting + 1)} a`,
      html: `${'<blockquote>\n'.repeat(deepestNesting)}<p>&gt; a</p>\n${'</blockquote>\n'.repeat(deepestNesting)}`,
    },
  },
  {
    name: 'a symbol or punctuation outside the BMP beside * or _',
    covers: markdown =>
      /[*_]/.test(markdown) &&
      /(?=[\p{P}\p{S}])[\u{10000}-\u{10ffff}]/u.test(markdown),
    example: { markdown: 'a*😀*b', html: '<p>a*😀*b</p>\n' },
  },
  {
    name: 'Unicode whitespace at the end of a paragraph or heading line',
    covers: markdown => edgeOfALine.test(markdown),
    example: { markdown: 'a ', html: '<p>a </p>\n' },
  },
  {
    name: 'a numeric reference from U+0080 to U+009F',
    covers: referencesInTheC1Range,
    example: { markdown: '&#128;', html: '<p>\u0080</p>\n' },
  },
  {
    name: 'a space written as &#32; before a line ending',
    covers: markdown => /&#(?:0*32|[xX]0*20);[ \t]*(?:\n|$)/.test(markdown),
    example: { markdown: 'a&#32;\nb', html: '<p>a \nb</p>\n' },
  },
  {
    name: 'a definition repeated before a setext heading',
    covers: markdown => {
      const labels = definitionLabels(markdown)
      return (
        new Set(labels).size < labels.length &&
        /^ {0,3}(?:=+|-+)[ \t]*$/m.test(markdown)
      )
    },
    example: {
      markdown: '[a]: /x\n\n[a]: /y\nfoo\n===\n\n[a]',
      html: '<h1>foo</h1>\n<p><a href="/x">a</a></p>\n',
    },
  },
  {
    name: 'a paragraph of only definitions that ends at a --- line',
    covers: markdown =>
      definitionLabels(markdown).length > 0 &&
      /^ {0,3}-+[ \t]*$/m.test(markdown),
    example: { markdown: '[a]: /u\n---', html: '<hr />\n' },
  },
]
