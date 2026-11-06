import {defineConfig,mergeConfig} from 'vite';
import {fileURLToPath} from 'node:url';
import base from './unified-club-events.vite.config';
export default mergeConfig(base,defineConfig({optimizeDeps:{entries:['e2e/fixtures/club-week-resilience.html']},plugins:[{name:'synthetic-club-week-hooks',enforce:'pre',resolveId(source,importer){if(importer?.endsWith('/src/pages/group/GroupWeekPage.tsx')&&['../../contexts/AuthContext','../../hooks/useGroup','../../hooks/useGroupRides'].includes(source))return fileURLToPath(new URL('./fixtures/club-week-resilience-hooks.ts',import.meta.url));}}]}));
