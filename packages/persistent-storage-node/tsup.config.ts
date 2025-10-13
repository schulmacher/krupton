import { defineConfig } from 'tsup';
import baseConfig from '@krupton/config/tsup.config.js';

export default defineConfig({
  ...baseConfig,
  entry: ['src/index.ts'],
  outDir: 'dist',
  // Ensure source maps are generated with inline source content
  sourcemap: true,
  // Use TypeScript compiler for declarations to get declaration maps
  dts: true,
});
