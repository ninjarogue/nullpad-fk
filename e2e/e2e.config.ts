import type { E2EConfig } from 'e2e'

import { web } from '@e2e-dev/web'

export default {
  targets: [
    {
      engine: web(),
      app: {
        url: 'http://127.0.0.1:0',
        command: {
          executable: 'node',
          args: ['serve.mjs', '{port}'],
          startupTimeout: 120_000,
          log: '.e2e/logs/app.log',
        },
      },
    },
  ],
} satisfies E2EConfig
