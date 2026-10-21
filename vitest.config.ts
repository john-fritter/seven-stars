// Tests run from the repo root; vite.config.ts is only for the debug view.
import { defineConfig } from 'vitest/config';

// The invariant runs step minute by minute for ten station days; give them room on slow machines.
export default defineConfig({ test: { testTimeout: 60_000 } });
