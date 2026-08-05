import path from 'path'

import { defineConfig, mergeConfig } from 'vite'

import base from './vite.config'

const repoRoot = path.resolve(__dirname, '../..')

export default mergeConfig(base, defineConfig({
  define: {
    'import.meta.env.VITE_APP_SHELL': JSON.stringify('browser')
  },
  build: {
    outDir: path.resolve(repoRoot, 'work4you_cli/app_dist'),
    emptyOutDir: true
  },
  base: '/'
}))
