import { defineConfig } from 'tsup';
import baseConfig from '@krupton/config/tsup.config.js';

export default defineConfig({
  ...baseConfig,
  entry: ['src/index.ts'],
  outDir: 'dist',
});


