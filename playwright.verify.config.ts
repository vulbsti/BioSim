import {defineConfig} from '@playwright/test';
// Visual verification gates (see verify/README.md). Point BIOSIM_URL at a running dev server, or one is started.
// BIOSIM_GL=egl uses the GPU through ANGLE on Linux (uxserver); without it Chromium may render in software, which is slow.
const url = process.env.BIOSIM_URL ?? 'http://localhost:3016';
export default defineConfig({
  testDir: './verify',
  testMatch: '*.spec.ts',
  timeout: 600000,
  workers: 1,
  reporter: [['list']],
  use: {
    baseURL: url,
    channel: 'chromium',
    headless: true,
    viewport: {width: 1440, height: 900},
    deviceScaleFactor: 1,
    launchOptions: {args: process.env.BIOSIM_GL === 'egl' ? ['--use-angle=gl-egl', '--ignore-gpu-blocklist'] : []},
  },
  webServer: process.env.BIOSIM_URL ? undefined : {command: 'npm run dev', url, reuseExistingServer: true},
});
