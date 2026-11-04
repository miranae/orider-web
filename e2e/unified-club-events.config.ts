import { fileURLToPath } from 'node:url';
import { defineConfig } from '@playwright/test';
export default defineConfig({testDir:'./tests',testMatch:'unified-club-events.spec.ts',workers:1,use:{baseURL:'http://127.0.0.1:18491'},projects:[{name:'mobile',use:{viewport:{width:390,height:844}}},{name:'desktop',use:{viewport:{width:1440,height:1000}}}],webServer:{cwd:fileURLToPath(new URL('..',import.meta.url)),command:'npx vite --config e2e/unified-club-events.vite.config.ts --host 127.0.0.1 --port 18491',url:'http://127.0.0.1:18491',reuseExistingServer:false}});
