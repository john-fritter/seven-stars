// The pure simulation core. No I/O, no clock, no global randomness.
export { createWorld, step, save, load, setData } from './world.js';
export { clockText, dayOf, timeOfDay, MINUTES_PER_DAY } from './context.js';
export { along, station } from './station.js';
export type { World, Contestant, SimEvent, Activity } from './types.js';
