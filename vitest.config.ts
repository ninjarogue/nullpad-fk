import { defineConfig } from 'vitest/config'

export default defineConfig({
  test: {
    projects: [
      {
        test: {
          name: 'app',
          include: ['src/**/*.test.ts'],
          environment: 'happy-dom',
          setupFiles: ['./src/vitest-setup.ts'],
          server: {
            deps: {
              inline: ['foldkit', '@foldkit/ui', '@foldkit/devtools'],
            },
          },
        },
      },
      {
        test: {
          name: 'checks',
          include: ['checks/**/*.test.ts'],
          environment: 'node',
          testTimeout: 60_000,
        },
      },
    ],
  },
})
