// Room temperatures and how they feel. DESIGN.md Part two, Temperature.
import { accessRank, log, type Ctx } from './context.js';
import { derived } from './derived.js';
import { feel } from './ledger.js';
import type { Contestant } from './types.js';

export function clampTemp(ctx: Ctx, f: number): number {
  const [lo, hi] = ctx.data.temperature.clamp;
  return Math.min(hi, Math.max(lo, f));
}

/** Rooms drift toward their setting every ten minutes. */
export function driftRooms(ctx: Ctx): void {
  const step = ctx.data.temperature.driftPerTenMinutes;
  for (const r of ctx.st.rooms) {
    const s = ctx.w.rooms[r.id]!;
    if (s.temp < s.setting) s.temp = Math.min(s.setting, s.temp + step);
    else if (s.temp > s.setting) s.temp = Math.max(s.setting, s.temp - step);
  }
}

export function clothingWarmth(ctx: Ctx, c: Contestant): number {
  return ctx.st.warmth[accessRank(ctx, c)]!;
}

/** Degrees felt outside the contestant's comfort range at a room temperature. */
export function discomfortAt(ctx: Ctx, c: Contestant, temp: number): number {
  const felt = temp + clothingWarmth(ctx, c);
  const d = derived(ctx.data, c);
  return Math.max(0, d.comfortLo - felt, felt - d.comfortHi);
}

/** Comfort of a situation: the room's or the action's, minus temperature discomfort. */
export function situationComfort(ctx: Ctx, c: Contestant, roomId: string, actionComfort?: number): number {
  const base = actionComfort ?? ctx.st.room.get(roomId)!.comfort;
  const pain = discomfortAt(ctx, c, ctx.w.rooms[roomId]!.temp) * ctx.data.temperature.comfortPerDegree;
  return Math.min(100, Math.max(0, base - pain));
}

/** The setting this contestant would choose: the middle of their range, allowing for clothes. */
export function preferredSetting(ctx: Ctx, c: Contestant): number {
  const [lo, hi] = ctx.data.species.species[c.species]!.comfort;
  return clampTemp(ctx, Math.round((lo + hi) / 2 - clothingWarmth(ctx, c)));
}

/** Changes a bedroom's thermostat. Anyone present who ends up less comfortable holds it against them. */
export function setThermostat(ctx: Ctx, c: Contestant, roomId: string): void {
  const state = ctx.w.rooms[roomId]!;
  const from = state.setting;
  const to = preferredSetting(ctx, c);
  if (from === to) return;
  const bothered = ctx.w.contestants
    .filter((o) => o !== c && o.room === roomId && discomfortAt(ctx, o, to) > discomfortAt(ctx, o, from))
    .map((o) => o.id);
  state.setting = to;
  for (const o of ctx.w.contestants) if (bothered.includes(o.id)) feel(ctx, o, c, 'affection', ctx.data.temperature.botheredAffection, 'thermostat');
  log(ctx, 'thermostat', [c.id], roomId, { from, to, bothered });
}
