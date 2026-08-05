import { defineConfig, mergeConfig } from 'vitest/config'

import viteConfig from './vite.config'

// Renderer unit tests. Merged onto the real vite config so the `@/` aliases,
// the React plugin, and the react/react-dom dedupe all behave as in the app.
export default mergeConfig(
  viteConfig,
  defineConfig({
    test: {
      environment: 'jsdom',
      setupFiles: ['./src/test/setup.ts'],
      // `electron/` and `scripts/` ship `node --test` suites (run by
      // `test:desktop:platforms`); vitest must not collect them.
      include: ['src/**/*.test.{ts,tsx}'],
      // React Testing Library renders whole settings pages here; 5s is not
      // enough once several files render in parallel on a loaded machine.
      testTimeout: 20_000
    }
  })
)
