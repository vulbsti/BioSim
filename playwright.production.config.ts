import {defineConfig} from '@playwright/test';
import base from './playwright.config';

// Serve a fixed build so development reloads cannot invalidate motion/replay checks.
export default defineConfig({
  ...base,
  use:{...base.use,baseURL:'http://127.0.0.1:4317'},
  workers:1,
  webServer:{
    command:'npm run build && npx vite preview --host 127.0.0.1 --port 4317 --strictPort',
    url:'http://127.0.0.1:4317',reuseExistingServer:false,
  },
});
