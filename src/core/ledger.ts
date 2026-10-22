// The relationship ledger and attraction. DESIGN.md Part one, Attraction, relationships and
// lovin', and Part two, Social interactions and romance.
//
// Each contestant holds their own Relation toward each other one: affection, trust, fear and
// attraction, plus the dated reasons behind them. Nothing here is shared or symmetric.
import { AXES, type Dim } from '../data/schema.js';
import { accessRank, log, type Ctx } from './context.js';
import { axisFactor } from './needs.js';
import { normal } from './rng.js';
import { traitFx } from './traits.js';
import type { Contestant, Relation } from './types.js';

const RANGE: Record<Dim, [number, number]> = {
  affection: [-100, 100],
  trust: [0, 100],
  fear: [0, 100],
  attraction: [0, 10],
};

const clamp = (x: number, lo: number, hi: number) => Math.min(hi, Math.max(lo, x));

/** a's relation toward b, if they've met. */
export function rel(a: Contestant, b: Contestant): Relation | undefined {
  return a.ledger[b.id];
}

/** Introduces two contestants: rolls their shared chemistry and each one's first impression. */
export function meet(ctx: Ctx, a: Contestant, b: Contestant): void {
  if (a.ledger[b.id]) return;
  const chemistry = normal(ctx.w.rng, 0, ctx.data.social.attraction.chemistrySd);
  const fresh = (): Relation => ({ affection: 0, trust: 0, fear: 0, attraction: 0, knows: 0, chemistry, met: ctx.w.t, seen: ctx.w.t, reasons: [], label: 'none', flirts: 0, kisses: 0, lovin: 0 });
  a.ledger[b.id] = fresh();
  b.ledger[a.id] = fresh();
  const first = ctx.data.social.attraction.firstImpression;
  a.ledger[b.id]!.attraction = first * attractionTarget(ctx, a, b);
  b.ledger[a.id]!.attraction = first * attractionTarget(ctx, b, a);
  log(ctx, 'meet', [a.id, b.id], a.room);
}

/** The relation a holds toward b, meeting them first if needed. */
export function relation(ctx: Ctx, a: Contestant, b: Contestant): Relation {
  if (!a.ledger[b.id]) meet(ctx, a, b);
  return a.ledger[b.id]!;
}

/** Records a dated reason in a's ledger about b and moves that dimension. */
export function feel(ctx: Ctx, a: Contestant, b: Contestant, dim: Dim, amount: number, why: string): void {
  if (amount === 0) return;
  const r = relation(ctx, a, b);
  const [lo, hi] = RANGE[dim];
  r[dim] = clamp(r[dim] + amount, lo, hi);
  const last = r.reasons[r.reasons.length - 1];
  if (last && last.why === why && last.dim === dim) {
    last.amount += amount;
    last.times++;
    last.t = ctx.w.t;
  } else {
    r.reasons.push({ t: ctx.w.t, why, dim, amount, times: 1 });
    if (r.reasons.length > ctx.data.social.ledger.keepReasons) r.reasons.shift();
  }
}

/**
 * Once a day, feelings fade a little toward neutral. Loyal people's affection fades slower, and
 * so does affection for someone they believe they're dating or exclusive with. Grudges stick:
 * dislike fades slower, slower still for the volatile, and at the rate their traits say (never
 * for a Grudge-holder, twice as fast for the Forgiving).
 */
export function fadeLedger(ctx: Ctx, c: Contestant): void {
  const l = ctx.data.social.ledger;
  const aff = l.fadePerDay.affection * axisFactor(l.loyalK, c.personality.loyal);
  const grudge = traitFx(ctx.data, c).dislikeFade * l.dislikeFade * axisFactor(l.dislikeCalmK, c.personality.calm);
  for (const r of Object.values(c.ledger)) {
    const rate = aff * (r.label === 'dating' || r.label === 'exclusive' ? l.loverFade : 1) * (r.affection < 0 ? grudge : 1);
    r.affection *= 1 - Math.min(1, rate);
    r.trust *= 1 - l.fadePerDay.trust;
    r.fear *= 1 - l.fadePerDay.fear;
  }
}

// ---------------------------------------------------------------------------------------------
// Attraction

/** How strongly a's two attraction axes pull toward where b sits on the gender axis, 0..1. */
export function genderFit(a: Contestant, b: Contestant): number {
  return (a.drawnToFeminine * (10 - b.gender) + a.drawnToMasculine * b.gender) / 100;
}

/** Beauty as others see it, 0..1, clothing included. */
export function looks(ctx: Ctx, b: Contestant): number {
  const clothes = ctx.data.clothing.byRank[String(accessRank(ctx, b)) as '1']!.beauty;
  return clamp((b.beauty + clothes) / 10, 0, 1);
}

/** How close b's personality is to a's ideal, 0..1. */
export function personalityFit(ctx: Ctx, a: Contestant, b: Contestant): number {
  let d = 0;
  for (const k of AXES) d += Math.abs(a.ideal[k] - b.personality[k]);
  return clamp(1 - d / AXES.length / ctx.data.social.attraction.fitScale, 0, 1);
}

/** The fit b shows: a deceptive person can fake being anyone's type. */
export function shownFit(ctx: Ctx, a: Contestant, b: Contestant): number {
  const fit = personalityFit(ctx, a, b);
  return fit + (1 - fit) * ctx.data.social.attraction.deception * ((10 - b.personality.honest) / 10);
}

/** What a believes the fit is: first impressions run on looks, then the shown fit takes over. */
export function perceivedFit(ctx: Ctx, a: Contestant, b: Contestant, knows: number): number {
  return (1 - knows) * looks(ctx, b) + knows * shownFit(ctx, a, b);
}

/**
 * Where a's attraction to b is heading, 0..10:
 * scale × genderFit × (looks × beauty + personality × perceived fit + chemistry), capped at 10.
 */
export function attractionTarget(ctx: Ctx, a: Contestant, b: Contestant): number {
  const at = ctx.data.social.attraction;
  const r = a.ledger[b.id];
  const inner = at.looks * looks(ctx, b) + at.personality * perceivedFit(ctx, a, b, r?.knows ?? 0) + (r?.chemistry ?? 0);
  return clamp(at.scale * genderFit(a, b) * inner, 0, 10);
}

/** Time together moves attraction part of the way toward its target (faster for a Romantic). */
export function warm(ctx: Ctx, a: Contestant, b: Contestant): void {
  const r = relation(ctx, a, b);
  const step = Math.min(1, ctx.data.social.attraction.approach * traitFx(ctx.data, a).attraction);
  r.attraction = clamp(r.attraction + (attractionTarget(ctx, a, b) - r.attraction) * step, 0, 10);
}
