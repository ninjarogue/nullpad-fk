import { expect } from 'e2e'

import { test } from '@e2e-dev/web'

test('the built app shows nullpad', async ({ app, screen }) => {
  await app.open('/')

  await expect(screen.getByRole('heading', 'nullpad')).toBeVisible()
})
