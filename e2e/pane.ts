import { type Nullpad, test as base, expect } from './nullpad'

export { expect }

export type PaneKind = 'html' | 'outline'

export type Pane = Readonly<{
  nullpad: Nullpad
  paste: (markdown: string, kind?: PaneKind) => Promise<string>
}>

const lineCountOf = (text: string): number => text.split(/\r\n|\r|\n/).length

export const test = base.extend<{ pane: Pane }>({
  pane: async ({ nullpad }, use) => {
    const { page } = nullpad
    await use({
      nullpad,
      paste: async (markdown, kind = 'html') => {
        await page.goto(`/?pane=${kind}`)
        await page.locator('#caret').waitFor()
        await nullpad.paste(markdown)
        await expect(
          page.locator('.pos'),
          'the status line counts the pasted lines',
        ).toHaveText(new RegExp(` ${lineCountOf(markdown)}L$`))
        return (await page.locator('.pane').textContent()) ?? ''
      },
    })
  },
})
