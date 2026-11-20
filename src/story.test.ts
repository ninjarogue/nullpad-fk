import { given, model, story } from 'foldkit/story'
import { describe, expect, test } from 'vitest'

import { init, update } from './main'

describe('update', () => {
  test('the app starts named nullpad', () => {
    story(
      update,
      given(init().model),
      model(model => {
        expect(model.name).toBe('nullpad')
      }),
    )
  })
})
