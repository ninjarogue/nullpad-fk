import type { Page } from '@playwright/test'

import { expect, settle, test } from './nullpad'

const needsChromeNotice = (page: Page) =>
  page.getByText('nullpad needs Chrome or Edge')

test('a browser without EditContext says nullpad needs Chrome or Edge, and why', async ({
  page,
  pageErrors,
}) => {
  await page.addInitScript(() => {
    Reflect.deleteProperty(globalThis, 'EditContext')
  })
  await page.goto('/')
  await expect(needsChromeNotice(page)).toBeVisible()
  await expect(page.getByText(/Firefox and Safari/)).toBeVisible()
  await expect(
    page.locator('#caret'),
    'no dead cursor under the notice',
  ).toHaveCount(0)
  expect(pageErrors).toEqual([])
})

test('Chrome shows the editor and no browser notice', async ({ nullpad }) => {
  await nullpad.page.keyboard.type('hi')
  await settle(nullpad.page)
  expect((await nullpad.screen()).rows[0]?.text, 'typed text drawn').toBe('hi')
  await expect(needsChromeNotice(nullpad.page)).toHaveCount(0)
})
