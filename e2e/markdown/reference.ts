import { createRequire } from 'node:module'

type Reference = {
  Parser: new () => { parse: (markdown: string) => object }
  HtmlRenderer: new () => { render: (tree: object) => string }
}

const require = createRequire(import.meta.url)

const { HtmlRenderer, Parser } = require('commonmark') as Reference

export const referenceHtml = (markdown: string): string =>
  new HtmlRenderer().render(new Parser().parse(markdown))

export const entityTable = (): Readonly<Record<string, string>> =>
  require(
    require.resolve('entities/lib/maps/entities.json', {
      paths: [require.resolve('commonmark')],
    }),
  ) as Record<string, string>

export const entityNames = (): ReadonlyArray<string> =>
  Object.keys(entityTable())
