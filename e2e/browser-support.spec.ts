import type { Page } from '@playwright/test'

import { expect, settle, test } from './nullpad'

const needsChromeNotice = (page: Page) =>
  page.getByText('nullpad needs Chrome or Edge')

const browsersWithoutEditContext = [
  {
    name: 'has no EditContext',
    hide: () => {
      Reflect.deleteProperty(globalThis, 'EditContext')
    },
  },
  {
    name: 'has an EditContext that cannot be made',
    hide: () => {
      Reflect.set(globalThis, 'EditContext', function EditContext() {
        throw new Error('EditContext is turned off')
      })
    },
  },
]

for (const browser of browsersWithoutEditContext) {
  test(`a browser that ${browser.name} says nullpad needs Chrome or Edge, and why`, async ({
    page,
    pageErrors,
  }) => {
    await page.addInitScript(browser.hide)
    await page.goto('/')
    await expect(needsChromeNotice(page)).toBeVisible()
    await expect(page.getByText(/Firefox/)).toBeVisible()
    await expect(
      page.locator('#caret'),
      'no dead cursor under the notice',
    ).toHaveCount(0)
    await page.keyboard.press('Tab')
    await expect(
      page.getByRole('textbox'),
      'no text box to tab into that takes no typing',
    ).toHaveCount(0)
    expect(pageErrors).toEqual([])
  })
}

test('Chrome shows the editor and no browser notice', async ({ nullpad }) => {
  await nullpad.page.keyboard.type('hi')
  await settle(nullpad.page)
  expect((await nullpad.screen()).rows[0]?.text, 'typed text drawn').toBe('hi')
  await expect(needsChromeNotice(nullpad.page)).toHaveCount(0)
})
