// Worker threads don't inherit tsx's loader, so register it before loading the TypeScript worker.
import { register } from 'tsx/esm/api';

register();
await import('./worker.ts');
