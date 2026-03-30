import { defineConfig } from 'tsup';

export default defineConfig({
  entry: ['index.ts'],
  format: ['cjs'],
  outDir: 'cjs-dist',
  splitting: false,
  minify: false,
  target: 'node20',
  noExternal: [/.*/],
});
