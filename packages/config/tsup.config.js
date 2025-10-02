import { defineConfig } from 'tsup';

export default defineConfig({
  clean: true,
  dts: true,
  sourcemap: true,
  target: 'node18',
  format: ['esm'],
  splitting: false,
  minify: false,
});
