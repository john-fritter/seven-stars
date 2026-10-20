// Deterministic scoring: slice one's stand-in for the judge. DESIGN.md Part two, The meter and
// scoring. Every logged event whose type has a row in scoring.yaml pays its actors, and the
// award goes to the meter (capped) and lifetime points together.
//
//   points = base × witnesses (1 + 0.15 each, up to ×2) × repeats (½ per repeat by the same pair
//            within three days) × boredom (−10% per time that type already scored today)
import { dayOf, log, MINUTES_PER_DAY, type Ctx } from './context.js';
import { think } from './thoughts.js';
import type { Contestant, SimEvent } from './types.js';

const round2 = (x: number) => Math.round(x * 100) / 100;

/** Awake contestants who saw an event: in its room, not taking part. */
export function witnessesOf(ctx: Ctx, e: SimEvent): string[] {
  const listed = e.data?.witnesses;
  if (Array.isArray(listed)) return listed as string[];
  return ctx.w.contestants.filter((c) => c.room === e.room && !c.asleep && !e.actors.includes(c.id)).map((c) => c.id);
}

/** The witness multiplier: 1 + witnessEach per witness, capped. */
export function witnessMultiplier(ctx: Ctx, n: number): number {
  const m = ctx.data.scoring.modifiers;
  return Math.min(m.witnessMax, 1 + m.witnessEach * n);
}

/** Scores an event that was just logged, writing `points` and per-contestant `awards` onto it. */
export function award(ctx: Ctx, e: SimEvent): void {
  const row = ctx.data.scoring.awards[e.type];
  if (!row) return;
  const d = e.data ?? {};
  if (row.only && !d[row.only]) return;
  const m = ctx.data.scoring.modifiers;
  const show = ctx.w.show;

  const base = new Map<string, number>();
  const give = (id: unknown, v: number | undefined) => {
    if (typeof id === 'string' && v) base.set(id, (base.get(id) ?? 0) + v);
  };
  for (const id of e.actors) give(id, row.each);
  give(e.actors[0], row.actor);
  give(e.actors[1], row.target);
  give(d.winner, row.winner);
  give(d.loser, row.loser);
  const witnesses = row.witnessed || row.witnesses ? witnessesOf(ctx, e) : [];
  for (const id of witnesses) give(id, row.witnesses);
  if (!base.size) return;

  let mult = row.witnessed ? witnessMultiplier(ctx, witnesses.length) : 1;
  if (e.actors.length === 2) {
    const [a, b] = [...e.actors].sort();
    const key = `${e.type}|${a}|${b}`;
    const since = e.t - m.repeatDays * MINUTES_PER_DAY;
    const recent = (show.pairs[key] ?? []).filter((t) => t > since);
    mult *= m.repeatFactor ** recent.length;
    recent.push(e.t);
    show.pairs[key] = recent;
  }
  rollDay(ctx);
  const seen = show.today[e.type] ?? 0;
  mult *= (1 - m.boredom) ** seen;
  show.today[e.type] = seen + 1;

  const awards: Record<string, number> = {};
  let total = 0;
  for (const [id, v] of base) {
    const c = ctx.w.contestants.find((x) => x.id === id);
    if (!c) continue;
    const pts = round2(v * mult);
    if (pts <= 0) continue;
    addMeter(ctx, c, pts);
    c.lifetime = round2(c.lifetime + pts);
    awards[id] = pts;
    total += pts;
  }
  if (!total) return;
  e.points = round2(total);
  e.data = { ...d, awards };
}

/** The judge's boredom recovers overnight; stale repeat records are dropped at the same time. */
function rollDay(ctx: Ctx): void {
  const show = ctx.w.show;
  const day = dayOf(ctx.w.t);
  if (show.day === day) return;
  show.day = day;
  show.today = {};
  const since = ctx.w.t - ctx.data.scoring.modifiers.repeatDays * MINUTES_PER_DAY;
  for (const [k, ts] of Object.entries(show.pairs)) {
    const keep = ts.filter((t) => t > since);
    if (keep.length) show.pairs[k] = keep;
    else delete show.pairs[k];
  }
}

/** Moves the meter, kept in range. Dropping to zero puts them on notice. */
export function addMeter(ctx: Ctx, c: Contestant, delta: number): void {
  const before = c.meter;
  c.meter = Math.min(ctx.data.meter.max, Math.max(0, before + delta));
  if (before > 0 && c.meter <= 0) log(ctx, 'on_notice', [c.id], c.room);
}

/** One minute of the meter's drain. */
export function drainMeter(ctx: Ctx, c: Contestant): void {
  if (c.meter > 0) addMeter(ctx, c, -ctx.data.meter.drainPerHour / 60);
}

/** "The show is going to kill me": refreshed hourly while the meter is low, worse the lower it is. */
export function fearTheMeter(ctx: Ctx, c: Contestant): void {
  const dm = ctx.data.meter.doomed;
  if (c.meter >= dm.below) return;
  const x = 1 - c.meter / dm.below; // 0 just under the line, 1 at zero
  think(ctx, c, dm.thought, null, dm.from + (dm.to - dm.from) * x);
}
