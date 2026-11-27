import { resolve } from 'node:path';
import { defineConfig } from 'vitest/config';

// 与 apps/web/vite.config.ts 的别名保持一致，测试里可以直接 import @core/*。
const alias = (dir: string) => resolve(import.meta.dirname, dir);

export default defineConfig({
  resolve: {
    alias: {
      '@core': alias('apps/web/src/core'),
      '@web': alias('apps/web/src/web'),
      '@assets': alias('apps/web/src/assets'),
    },
  },
});
