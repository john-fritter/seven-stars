// Romance: kisses, lovin', labels, exclusivity, breakups and betrayal. DESIGN.md Part two,
// Social interactions and romance, and Part one, Attraction, relationships and lovin'.
//
// Labels are beliefs. Each contestant holds their own label for every relationship, and they
// only change through moves (a kiss, lovin', asking to be exclusive, a breakup). When someone
// sees their partner with someone else, their own label decides whether it's betrayal.
// Lovin' is always consensual and always offscreen: two people choose it, and the log says so.
import type { InteractionDef, Label } from '../data/schema.js';
import { begin, endActivity, LOVIN } from './actions.js';
import { log, type Ctx } from './context.js';
import { feel, rel, relation } from './ledger.js';
import { axisFactor } from './needs.js';
import { chance } from './rng.js';
import { interact } from './social.js';
import { think } from './thoughts.js';
import type { Contestant } from './types.js';

const clamp = (x: number, lo: number, hi: number) => Math.min(hi, Math.max(lo, x));
const round2 = (x: number) => Math.round(x * 100) / 100;

const ATTACHED: readonly Label[] = ['dating', 'exclusive'];
const JEALOUS: readonly Label[] = ['flirting', 'fling', 'dating', 'ex'];

export function labelOf(a: Contestant, b: Contestant): Label {
  return rel(a, b)?.label ?? 'none';
}

/** Romance moves toward anyone but whoever they're dating are rarer for the loyal. */
export function attachedMult(ctx: Ctx, c: Contestant, o: Contestant): number {
  const attached = Object.entries(c.ledger).some(([id, r]) => id !== o.id && ATTACHED.includes(r.label));
  return attached ? Math.max(0, 1 - (ctx.data.romance.attachedK * c.personality.loyal) / 10) : 1;
}

/** Gates on a move beyond the interaction's own `needs`: privacy for lovin', a reason to break up. */
export function moveAllowed(ctx: Ctx, c: Contestant, o: Contestant, def: InteractionDef): boolean {
  const ro = ctx.data.romance;
  switch (def.move) {
    case 'proposition':
      return ctx.st.room.get(c.room)!.privacy >= ro.proposition.privacy;
    case 'breakup': {
      const r = rel(c, o)!;
      return r.affection <= ro.breakup.affectionBelow || c.thoughts.some((x) => x.id === ro.betrayal.thought && x.about === o.id);
    }
    default:
      return true;
  }
}

/** Odds a kiss lands: their attraction back ÷ 10 × (1 + their affection ÷ 100). */
export function kissOdds(ctx: Ctx, target: Contestant, kisser: Contestant): number {
  const r = rel(target, kisser);
  if (!r) return 0;
  return clamp((r.attraction / 10) * (1 + r.affection / 100) * ctx.data.romance.kiss.successScale, 0, 1);
}

export function kiss(ctx: Ctx, c: Contestant, o: Contestant): void {
  const k = ctx.data.romance.kiss;
  const odds = kissOdds(ctx, o, c);
  if (!chance(ctx.w.rng, odds)) {
    think(ctx, c, k.rebuffed, o.id);
    log(ctx, 'kiss_rebuff', [c.id, o.id], c.room, { odds: round2(odds) });
    return;
  }
  for (const [a, b] of [[c, o], [o, c]] as const) {
    const r = relation(ctx, a, b);
    if (r.label === 'none') r.label = k.label;
    think(ctx, a, k.thought, b.id);
  }
  log(ctx, 'kiss', [c.id, o.id], c.room, { odds: round2(odds) });
  aftermath(ctx, c, o, 'kiss');
}

/** Whether the target says yes: they have to want it too. */
export function propositionOdds(ctx: Ctx, target: Contestant, asker: Contestant): number {
  const p = ctx.data.romance.proposition;
  const r = rel(target, asker);
  if (!r || r.attraction < p.attraction || r.affection < p.affection) return 0;
  return clamp((r.attraction / 10) * p.successScale * attachedMult(ctx, target, asker), 0, 1);
}

export function proposition(ctx: Ctx, c: Contestant, o: Contestant): void {
  const p = ctx.data.romance.proposition;
  const odds = propositionOdds(ctx, o, c);
  if (!chance(ctx.w.rng, odds)) {
    think(ctx, c, p.turnedDown, o.id);
    log(ctx, 'turned_down', [c.id, o.id], c.room, { odds: round2(odds) });
    return;
  }
  lovin(ctx, c, o);
}

/** Lumps under the covers. Both stop what they're doing; anyone asleep nearby is kept up. */
export function lovin(ctx: Ctx, c: Contestant, o: Contestant): void {
  const p = ctx.data.romance.proposition;
  const room = c.room;
  const first = relation(ctx, c, o).lovin === 0;
  for (const [a, b] of [[c, o], [o, c]] as const) {
    const r = relation(ctx, a, b);
    r.lovin++;
    if (r.label === 'none' || r.label === 'flirting' || r.label === 'ex') r.label = a.monogamy >= p.datingAt ? 'dating' : 'fling';
    feel(ctx, a, b, 'affection', p.bond, 'lovin');
    think(ctx, a, p.thought, b.id);
    endActivity(ctx, a, 'interrupted');
  }
  for (const [a, b] of [[c, o], [o, c]] as const) begin(ctx, a, { action: LOVIN, object: null, room, minutes: p.minutes, partner: b.id });
  for (const x of ctx.w.contestants) if (x !== c && x !== o && x.room === room && x.asleep) think(ctx, x, p.disturbed);
  log(ctx, 'lovin', [c.id, o.id], room, { first });
  aftermath(ctx, c, o, 'lovin');
}

/** After a kiss or lovin': guilt for anyone cheating, and evidence for anyone who saw. */
function aftermath(ctx: Ctx, b: Contestant, c: Contestant, what: string): void {
  const ro = ctx.data.romance;
  for (const [x, partner] of [[b, c], [c, b]] as const) {
    for (const [id, r] of Object.entries(x.ledger)) if (id !== partner.id && r.label === 'exclusive') think(ctx, x, ro.guilty, id);
  }
  for (const a of ctx.w.contestants) {
    if (a === b || a === c || a.room !== b.room || a.asleep) continue;
    evidence(ctx, a, b, c, what);
    evidence(ctx, a, c, b, what);
  }
}

/** A sees B with C. A's label for B decides: betrayal if A believed they were exclusive, else jealousy. */
export function evidence(ctx: Ctx, a: Contestant, b: Contestant, c: Contestant, what: string): void {
  const ro = ctx.data.romance;
  const label = labelOf(a, b);
  if (label === 'exclusive') {
    feel(ctx, a, b, 'affection', ro.betrayal.affection, 'betrayal');
    think(ctx, a, ro.betrayal.thought, b.id);
    log(ctx, 'betrayal', [a.id, b.id, c.id], a.room, { what });
    const sm = ctx.data.social.interactions.find((d) => d.id === 'insult');
    if (sm && a.room === b.room && !b.asleep && chance(ctx.w.rng, ro.betrayal.confront)) interact(ctx, a, b, sm);
  } else if (JEALOUS.includes(label)) {
    feel(ctx, a, b, 'affection', ro.jealousy.affection, 'jealousy');
    think(ctx, a, ro.jealousy.thought, b.id);
    log(ctx, 'jealous', [a.id, b.id, c.id], a.room, { what, label });
  }
}

/** Odds of a yes to exclusivity: their attraction, monogamy and loyalty. */
export function exclusiveOdds(ctx: Ctx, target: Contestant, asker: Contestant): number {
  const r = rel(target, asker);
  if (!r) return 0;
  return clamp((r.attraction / 10) * (0.5 + target.monogamy / 10) * axisFactor(ctx.data.romance.exclusive.loyalK, target.personality.loyal), 0, 1);
}

/** The chance a yes is privately a fling: (10 − honest) × (10 − monogamy) ÷ 100. */
export function secretFlingOdds(target: Contestant): number {
  return ((10 - target.personality.honest) * (10 - target.monogamy)) / 100;
}

export function askExclusive(ctx: Ctx, c: Contestant, o: Contestant): void {
  const ex = ctx.data.romance.exclusive;
  const odds = exclusiveOdds(ctx, o, c);
  if (!chance(ctx.w.rng, odds)) {
    think(ctx, c, ex.refused, o.id);
    log(ctx, 'exclusive_refused', [c.id, o.id], c.room, { odds: round2(odds) });
    return;
  }
  const secretly = chance(ctx.w.rng, secretFlingOdds(o));
  relation(ctx, c, o).label = 'exclusive';
  relation(ctx, o, c).label = secretly ? 'fling' : 'exclusive';
  think(ctx, c, ex.thought, o.id);
  if (!secretly) think(ctx, o, ex.thought, c.id);
  log(ctx, 'exclusive', [c.id, o.id], c.room, { odds: round2(odds), secretly });
}

export function breakUp(ctx: Ctx, c: Contestant, o: Contestant): void {
  const from = labelOf(c, o);
  relation(ctx, c, o).label = 'ex';
  relation(ctx, o, c).label = 'ex';
  think(ctx, o, ctx.data.romance.breakup.dumped, c.id);
  log(ctx, 'breakup', [c.id, o.id], c.room, { from });
}
