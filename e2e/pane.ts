import { type Nullpad, test as base, expect, openFresh } from './nullpad'

export { expect }

export type PaneKind = 'html' | 'outline'

export type Pane = Readonly<{
  nullpad: Nullpad
  paste: (markdown: string, kind?: PaneKind) => Promise<string>
  timedPaste: (
    markdown: string,
    kind?: PaneKind | 'none',
  ) => Promise<Readonly<{ milliseconds: number; shown: string }>>
}>

const lineCountOf = (text: string): number => text.split(/\r\n|\r|\n/).length

export const test = base.extend<{ pane: Pane }>({
  pane: async ({ nullpad }, use) => {
    const { page } = nullpad
    await use({
      nullpad,
      paste: async (markdown, kind = 'html') => {
        await openFresh(page, `/?pane=${kind}`)
        await nullpad.paste(markdown)
        await expect(
          page.locator('.pos'),
          'the status line counts the pasted lines',
        ).toHaveText(new RegExp(` ${lineCountOf(markdown)}L$`))
        return (await page.locator('.pane').textContent()) ?? ''
      },
      timedPaste: async (markdown, kind = 'html') => {
        await openFresh(page, kind === 'none' ? '/' : `/?pane=${kind}`)
        const started = performance.now()
        await nullpad.paste(markdown)
        await page.waitForFunction(
          lines =>
            document.querySelector('.pos')?.textContent?.endsWith(` ${lines}L`),
          lineCountOf(markdown),
          { polling: 'raf', timeout: 120_000 },
        )
        const milliseconds = performance.now() - started
        return {
          milliseconds,
          shown:
            kind === 'none'
              ? ''
              : ((await page.locator('.pane').textContent()) ?? ''),
        }
      },
    })
  },
})
