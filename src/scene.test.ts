import { expect, given, role, scene } from 'foldkit/scene'
import { describe, test } from 'vitest'

import { init, update, view } from './main'

describe('view', () => {
  test('the page shows nullpad as its heading', () => {
    scene(
      { update, view },
      given(init().model),
      expect(role('heading', { name: 'nullpad' })).toExist(),
    )
  })
})
