import { defineConfig } from '@playwright/test';
export default defineConfig({
  testDir: 'tests/browser',
  workers: 1,
  fullyParallel: false,
  timeout: 90000,
  expect: { timeout: 12000 },
  use: { trace: 'retain-on-failure' },
  reporter: 'list',
});
