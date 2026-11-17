import { defineConfig } from 'vite';
import react from '@vitejs/plugin-react';
import tailwindcss from '@tailwindcss/vite';
import { realpathSync } from 'node:fs';
import { resolve } from 'node:path';
export default defineConfig({ plugins: [react(), tailwindcss()], resolve: { alias: { '@shared': resolve('shared') } }, server: { fs: { allow: [process.cwd(), realpathSync('node_modules')] } } });
