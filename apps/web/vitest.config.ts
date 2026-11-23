import { defineConfig } from 'vitest/config';
import path from 'path';
export default defineConfig({ test: { environment: 'jsdom', globals: true, include: ['test/**/*.test.{ts,tsx}'], setupFiles: ['./test/setup.ts'] }, esbuild: { jsx: 'automatic' }, resolve: { alias: { '@': path.resolve(__dirname, 'src') } } });
