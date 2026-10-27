// Deterministic scoring: slice one's stand-in for the judge. DESIGN.md Part two, The meter and
// scoring. Every logged event whose type has a row in scoring.yaml pays its actors, and the
// award goes to the meter (capped) and lifetime points together.
//
//   points = base × witnesses (1 + 0.15 each, up to ×2) × repeats (½ per repeat by the same pair
//            within three days) × boredom (−10% per time that type already scored today)
//            × their traits (a Show-off's karaoke, a Drama queen's breaks)
//            × their own repeats (× 0.7 per time they already scored that type today, as an actor)
//            × surprise for the first actor (1 + S × max(0, 1 − taste): an act against type, ratings.ts)
import { dayOf, log, MINUTES_PER_DAY, type Ctx } from './context.js';
import { surpriseOf } from './ratings.js';
import { think } from './thoughts.js';
import { traitFx } from './traits.js';
import type { Contestant, SimEvent } from './types.js';
import { canSee } from './station.js';

const round2 = (x: number) => Math.round(x * 100) / 100;

/** Awake contestants who saw an event: in its room or with a line of sight into it, not taking part. */
export function witnessesOf(ctx: Ctx, e: SimEvent): string[] {
  const listed = e.data?.witnesses;
  if (Array.isArray(listed)) return listed as string[];
  return ctx.w.contestants.filter((c) => e.room !== undefined && canSee(ctx.st, c.room, e.room) && !c.asleep && !e.actors.includes(c.id)).map((c) => c.id);
}

/** The witness multiplier: 1 + witnessEach per witness, capped. */
export function witnessMultiplier(ctx: Ctx, n: number): number {
  const m = ctx.data.scoring.modifiers;
  return Math.min(m.witnessMax, 1 + m.witnessEach * n);
}

/** Scores an event that was just logged, writing `points` and per-contestant `awards` onto it. */
export function award(ctx: Ctx, e: SimEvent): void {
  const base0 = ctx.data.scoring.awards[e.type];
  if (!base0) return;
  const d = e.data ?? {};
  if (base0.only && !d[base0.only]) return;
  // A case picked by a data field replaces the row's amounts (lovin' the first time, break levels).
  const picked = base0.by !== undefined ? base0.cases[String(d[base0.by])] : undefined;
  const row = picked ? { ...base0, each: undefined, actor: undefined, target: undefined, winner: undefined, loser: undefined, witnesses: undefined, ...picked } : base0;
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
  let surprise = 1;
  for (const [id, v] of base) {
    const c = ctx.w.contestants.find((x) => x.id === id);
    if (!c) continue;
    let own = 1;
    if (e.actors.includes(id)) {
      const mine = (show.mine[id] ??= {});
      own = m.ownRepeat ** (mine[e.type] ?? 0);
      mine[e.type] = (mine[e.type] ?? 0) + 1;
    }
    if (id === e.actors[0]) surprise = surpriseOf(ctx, c, e);
    const pts = round2(v * mult * own * (id === e.actors[0] ? surprise : 1) * (traitFx(ctx.data, c).scores[e.type] ?? 1));
    if (pts <= 0) continue;
    addMeter(ctx, c, pts);
    if (!row.meterOnly) c.lifetime = round2(c.lifetime + pts);
    awards[id] = pts;
    total += pts;
  }
  // Performing to an audience: the vain love it (thoughts.yaml moments), Show-offs even more
  // (traits.yaml `watched`). Events everyone watches count as watched.
  if (witnesses.length || !row.witnessed) {
    const watched = ctx.data.thoughts.moments.watched;
    for (const id of e.actors) {
      const c = ctx.w.contestants.find((x) => x.id === id);
      if (!c || !awards[id]) continue;
      if (watched.events.includes(e.type)) think(ctx, c, watched.thought);
      for (const w of traitFx(ctx.data, c).watched) if (w.events.includes(e.type)) think(ctx, c, w.thought);
    }
  }
  // Hidden lifetime points go to the first actor, kept secret until they die.
  const actor = row.secret ? ctx.w.contestants.find((x) => x.id === e.actors[0]) : undefined;
  if (actor) actor.secret = round2(actor.secret + row.secret!);
  if (!total) return;
  e.points = round2(total);
  e.data = { ...d, awards, ...(surprise > 1 ? { surprise: round2(surprise) } : {}) };
}

/** The judge's boredom recovers overnight; stale repeat records are dropped at the same time. */
function rollDay(ctx: Ctx): void {
  const show = ctx.w.show;
  const day = dayOf(ctx.w.t);
  if (show.day === day) return;
  show.day = day;
  show.today = {};
  show.mine = {};
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
