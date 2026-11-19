import { defineConfig, mergeConfig } from 'vite';
import { fileURLToPath } from 'node:url';
import base from './club-meeting-entry.vite.config';
const hooks = fileURLToPath(new URL('./fixtures/mobile-keyboard-hooks.ts', import.meta.url));
export default mergeConfig(base, defineConfig({
  optimizeDeps: { entries: ['e2e/fixtures/mobile-keyboard.html'] },
  plugins: [{ name: 'synthetic-keyboard-fitness-inputs', enforce: 'pre', resolveId(source, importer) {
    if (importer?.includes('/src/') && source.endsWith('/useGoalFitnessInputs')) return hooks;
  } }],
}));
