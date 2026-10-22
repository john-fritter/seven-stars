// Playing for the cameras. DESIGN.md Part two, Personality, traits and mood: the next pass (The
// ratings pull; Surprise pays). No game plans: as the meter falls, whatever scores pulls harder,
// weighted by the contestant's own taste for it, and an act against their taste scores more.
//
//   desperation = max(0, 1 − meter ÷ from) ^ power        (0 at meter 50, 1 at 0)
//   action pull = actions × desperation × points ÷ 10 × taste          (added to the score)
//   interaction weight × 1 + interactions × desperation × points ÷ 10 × taste
//   starting one: outgoing counts as outgoing + (10 − outgoing) × shyness × desperation
//   surprise    = 1 + S × max(0, 1 − taste)                (on the actor's award)
//
// Points are what the act would pay them now: the actor's share in scoring.yaml, after the
// judge's boredom and their own repeats today. Taste is the multiplier their sliders and traits
// already give the act: the personality grid for an action's tags, the axis scale factors for an
// interaction (and, for a romance move while attached, the attached factor).
import type { ActionDef, GameData, InteractionDef } from '../data/schema.js';
import { dayOf, type Ctx } from './context.js';
import { personalityOf } from './derived.js';
import { axisFactor } from './needs.js';
import { attachedMult } from './romance.js';
import { traitFx } from './traits.js';
import type { Contestant, SimEvent } from './types.js';

const NOT_AXES = new Set(['affection', 'attraction', 'chemistry', 'privacy']);

/** 0 while the meter is comfortable, rising to 1 at zero. */
export function desperation(ctx: Ctx, c: Contestant): number {
  const r = ctx.data.scoring.ratings;
  const x = 1 - c.meter / r.from;
  return x > 0 ? x ** r.power : 0;
}

/** Times this contestant has scored this event type today, as an actor. */
export function ownRepeats(ctx: Ctx, c: Contestant, type: string): number {
  const show = ctx.w.show;
  return show.day === dayOf(ctx.w.t) ? (show.mine[c.id]?.[type] ?? 0) : 0;
}

/** What an event type would pay this contestant as its first actor right now. */
export function expectedPoints(ctx: Ctx, c: Contestant, type: string): number {
  const row = ctx.data.scoring.awards[type];
  if (!row) return 0;
  const base = (row.each ?? 0) + (row.actor ?? 0);
  if (!base) return 0;
  const m = ctx.data.scoring.modifiers;
  const show = ctx.w.show;
  const today = show.day === dayOf(ctx.w.t) ? (show.today[type] ?? 0) : 0;
  return base * (1 - m.boredom) ** today * m.ownRepeat ** ownRepeats(ctx, c, type) * (traitFx(ctx.data, c).scores[type] ?? 1);
}

/** Their taste for an interaction: its axis scale factors and their traits, not the relationship. */
export function interactionTaste(ctx: Ctx, c: Contestant, o: Contestant | undefined, def: InteractionDef): number {
  const [lo, hi] = ctx.data.social.factorRange;
  let t = traitFx(ctx.data, c).interactions[def.id] ?? 1;
  for (const s of def.scale) {
    if (NOT_AXES.has(s.by)) continue;
    const v = s.by === 'monogamy' ? c.monogamy : c.personality[s.by as keyof Contestant['personality']];
    t *= Math.min(hi, Math.max(lo, axisFactor(s.k ?? 1, v)));
  }
  // A romance move while attached to someone else goes against a loyal grain.
  if (o && def.move && def.move !== 'gift' && def.move !== 'breakup') t *= attachedMult(ctx, c, o);
  return t;
}

function pull(ctx: Ctx, c: Contestant, type: string | undefined, taste: number, k: number): number {
  if (!type || !k) return 0;
  const d = desperation(ctx, c);
  if (!d) return 0;
  return k * traitFx(ctx.data, c).ratingsPull * d * (expectedPoints(ctx, c, type) / 10) * taste;
}

/** The extra score an action gets for what it would pay: only actions that log a scoring event. */
export function actionPull(ctx: Ctx, c: Contestant, def: ActionDef): number {
  return pull(ctx, c, def.logs, personalityOf(ctx.data, c, def), ctx.data.scoring.ratings.actions);
}

/** The multiplier on an interaction type's weight for what it would pay. */
export function interactionBoost(ctx: Ctx, c: Contestant, o: Contestant, def: InteractionDef): number {
  if (ctx.data.scoring.ratings.ignore.includes(def.id)) return 1;
  const type = ctx.data.scoring.ratings.pays[def.id] ?? def.id;
  return 1 + pull(ctx, c, type, interactionTaste(ctx, c, o, def), ctx.data.scoring.ratings.interactions);
}

/** A desperate contestant does more: interaction chance × 1 + chance × desperation. */
export function chanceBoost(ctx: Ctx, c: Contestant): number {
  return 1 + ctx.data.scoring.ratings.chance * desperation(ctx, c);
}

/**
 * Desperation overcomes shyness: for how often they start an interaction, outgoing counts as
 * outgoing + (10 − outgoing) × shyness × desperation.
 */
export function boldness(ctx: Ctx, c: Contestant): number {
  const o = c.personality.outgoing;
  const k = ctx.data.scoring.ratings.shyness;
  return k ? o + (10 - o) * k * desperation(ctx, c) : o;
}

/**
 * Stage fright "unless desperate": a trait's tag multiplier eases toward its desperate value
 * (traits.yaml `desperate`) as desperation rises. Returns the factor on top of the usual one.
 */
export function desperateEase(ctx: Ctx, c: Contestant, def: ActionDef): number {
  const fx = traitFx(ctx.data, c);
  let m = 1;
  for (const tag of def.tags) {
    const to = fx.desperate[tag];
    if (to === undefined) continue;
    const from = fx.tags[tag] ?? 1;
    if (from > 0) m *= (from + (to - from) * desperation(ctx, c)) / from;
  }
  return m;
}

// Which act an event type comes from, for its taste: an interaction of the same id (or as aliased
// in scoring.yaml surprise.acts), or an action that logs it.
type Act = { interaction: InteractionDef } | { action: ActionDef } | null;
const acts = new WeakMap<GameData, Map<string, Act>>();

function actOf(ctx: Ctx, type: string): Act {
  let m = acts.get(ctx.data);
  if (!m) acts.set(ctx.data, (m = new Map()));
  let a = m.get(type);
  if (a === undefined) {
    const id = ctx.data.scoring.surprise.acts[type] ?? type;
    const inter = ctx.data.social.interactions.find((d) => d.id === id);
    const action = inter ? undefined : [...Object.values(ctx.data.objects.types).flatMap((o) => o.actions), ...ctx.data.objects.personal].find((d) => d.logs === type);
    a = inter ? { interaction: inter } : action ? { action } : null;
    m.set(type, a);
  }
  return a;
}

/** The actor's surprise multiplier for an event: 1 when it's in character or not an act. */
export function surpriseOf(ctx: Ctx, c: Contestant, e: SimEvent): number {
  const S = ctx.data.scoring.surprise.bonus;
  const a = S ? actOf(ctx, e.type) : null;
  if (!a) return 1;
  const o = e.actors[1] !== undefined ? ctx.w.contestants.find((x) => x.id === e.actors[1]) : undefined;
  const taste = 'interaction' in a ? interactionTaste(ctx, c, o, a.interaction) : personalityOf(ctx.data, c, a.action);
  return 1 + S * Math.max(0, 1 - taste);
}
