import { loadGameData } from '../src/data/load.js';
import type { Ctx } from '../src/core/context.js';
import { station } from '../src/core/station.js';
import type { World } from '../src/core/types.js';

export const data = loadGameData('./data');

export function ctxFor(w: World): Ctx {
  return { data, st: station(data), w, events: [] };
}
