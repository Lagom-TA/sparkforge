import { defineConfig } from '@playwright/test';

export default defineConfig({
  testDir: './tests',
  workers: 1,
  webServer: {
    command: 'node node_modules/vite/bin/vite.js --host 127.0.0.1 --port 4317',
    url: 'http://127.0.0.1:4317',
    reuseExistingServer: !process.env.CI,
  },
});
