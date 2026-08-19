import { defineConfig } from 'tsdown'

/**
 * The desktop app ships one Electron main entry. Declarations come from
 * `tsc -b` (dts: false), matching apps/cli.
 */
export default defineConfig({
  entry: ['lib/types/main.js'],
  outDir: 'lib',
  format: ['esm'],
  platform: 'node',
  target: 'es2024',
  fixedExtension: false,
  dts: false,
  clean: false,
  external: ['electron'],
})
