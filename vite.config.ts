// The debug view: `npm run debug`, then open the printed URL. It reads ./data directly.
import { fileURLToPath } from 'node:url';
import { defineConfig } from 'vite';

const repo = fileURLToPath(new URL('.', import.meta.url));

export default defineConfig({
  root: 'src/debug',
  server: { fs: { allow: [repo] } },
  build: { outDir: '../../results/debug', emptyOutDir: true },
});
