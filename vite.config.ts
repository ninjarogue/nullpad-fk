import { type Plugin, defineConfig } from 'vite'

import { foldkit } from '@foldkit/vite-plugin'
import tailwindcss from '@tailwindcss/vite'

import { buildStamp } from './scripts/build-stamp'

/**
 * Foldkit wraps every function return in brandViewResult, which walks any returned array.
 * The core returns no views, and it returns the note's whole line array on every edit.
 */
const skipCore = (plugin: Plugin): Plugin => {
  const { transform } = plugin
  return plugin.name === 'foldkit:view-identity' &&
    typeof transform === 'function'
    ? {
        ...plugin,
        transform(code, id, options) {
          return id.includes('/src/core/')
            ? null
            : transform.call(this, code, id, options)
        },
      }
    : plugin
}

export default defineConfig({
  plugins: [tailwindcss(), foldkit().map(skipCore), buildStamp()],
  optimizeDeps: {
    entries: ['src/entry.ts'],
  },
})
