import { cpSync, existsSync, mkdirSync, rmSync } from 'node:fs';
import { resolve } from 'node:path';
import type { Plugin } from 'vite';

const SRC = 'src/i18n/resources';
const DEST = 'public/locales';

function copyAll(root: string) {
  const src = resolve(root, SRC);
  const dest = resolve(root, DEST);
  if (existsSync(dest)) rmSync(dest, { recursive: true, force: true });
  mkdirSync(dest, { recursive: true });
  cpSync(src, dest, { recursive: true });
}

export function copyLocales(): Plugin {
  return {
    name: 'copy-locales',
    configResolved(config) {
      copyAll(config.root);
    },
    handleHotUpdate({ file, server }) {
      if (file.includes('/i18n/resources/')) {
        copyAll(server.config.root);
        server.ws.send({ type: 'full-reload' });
      }
    },
  };
}
