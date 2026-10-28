import { defineConfig } from 'vitest/config';
import react from '@vitejs/plugin-react';

export default defineConfig({
  plugins: [react()],
  server: {
    host: '127.0.0.1',
    port: 5173,
    watch: {
      // DSH 的编辑工具会创建临时目录；避免文件监视器在 Windows 上碰到锁文件。
      ignored: ['**/.npm-cache/**', '**/*.tmpdir/**', '**/dist/**', '**/*.png'],
    },
  },
  test: {
    environment: 'node',
    include: ['src/tests/**/*.test.ts'],
  },
});
