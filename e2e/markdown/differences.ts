export type AcceptedDifference = Readonly<{
  name: string
  covers: (markdown: string) => boolean
  example: Readonly<{ markdown: string; html: string }>
}>

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
    name: 'a numeric reference from U+0080 to U+009F',
    covers: referencesInTheC1Range,
    example: { markdown: '&#128;', html: '<p>\u0080</p>\n' },
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
