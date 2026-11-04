import { fileURLToPath } from 'node:url';
import { defineConfig } from 'vite';
import react from '@vitejs/plugin-react';
export default defineConfig({plugins:[react()],resolve:{alias:{"@shared":fileURLToPath(new URL("../shared",import.meta.url))}},optimizeDeps:{entries:['e2e/fixtures/unified-club-events.html']}});
