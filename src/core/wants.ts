// Wants: what a contestant is after while a situation lasts. DESIGN.md Part two, How contestants
// choose: wants and things to do.
//
// A want isn't a bar: it adds a pull to particular options (talking with someone, a workout, the
// mirror) while its situation lasts, sized by personality. The meter's want is the ratings pull
// (ratings.ts); the rest live here.
import type { ActionDef } from '../data/schema.js';
import { axis } from './booze.js';
import { log, timeOfDay, type Ctx } from './context.js';
import { axisFactor } from './needs.js';
import { traitFx } from './traits.js';
import type { Booking, Contestant } from './types.js';

type Scale = readonly { axis: Parameters<typeof axis>[2]; k: number }[];

/** Π (1 + k × (axis − 5) ÷ 5) over a want's scale. */
function scaled(ctx: Ctx, c: Contestant, scale: Scale): number {
  let m = 1;
  for (const s of scale) m *= axisFactor(s.k, axis(ctx, c, s.axis));
  return Math.max(0, m);
}

export interface Wants {
  partners: Map<string, number>; // partner or crush id -> strength
  rival: { id: string; avoid: number; confront: number } | null;
  troubled: Map<string, number>; // friend in trouble id -> strength
  match: { skill: 'fight' | 'dance'; k: number } | null;
  status: number;
}

/** Whether they're in trouble (wants.yaml friend): down, and the meter nearly out, or dumped, grieving, rebuffed. */
export function inTrouble(ctx: Ctx, o: Contestant): boolean {
  const f = ctx.data.wants.friend;
  if (o.mood >= f.moodBelow) return false;
  if (o.meter < f.meterBelow) return true;
  const th = ctx.data.thoughts.thoughts;
  let bad = 0;
  for (const x of o.thoughts) if (x.value < 0 && f.sources.includes(th[x.id]!.source)) bad += x.value;
  return bad <= f.thoughts;
}

/** The match they're booked into, if any: the Wheel's, or tomorrow's bill. */
export function bookedFor(ctx: Ctx, c: Contestant): Booking | null {
  const b = ctx.w.show.booked;
  return b && b.actors.includes(c.id) ? b : null;
}

/** Everything they're after right now. Computed once per choice. */
export function wantsOf(ctx: Ctx, c: Contestant): Wants {
  const k = ctx.data.wants;
  const partners = new Map<string, number>();
  const troubled = new Map<string, number>();
  let rival: Wants['rival'] = null;
  let crush: { id: string; at: number } | null = null;
  let worst = k.rival.below;
  const pk = scaled(ctx, c, k.partner.scale) * traitFx(ctx.data, c).partnerPull;
  const fk = scaled(ctx, c, k.friend.scale);
  for (const o of ctx.w.contestants) {
    const r = c.ledger[o.id];
    if (o === c || !r) continue;
    if (k.partner.labels.includes(r.label)) partners.set(o.id, pk);
    else if (r.attraction >= k.partner.crushAt && (!crush || r.attraction > crush.at)) crush = { id: o.id, at: r.attraction };
    if (r.affection <= worst) {
      worst = r.affection;
      rival = { id: o.id, avoid: 0, confront: 0 };
    }
    if (r.affection >= k.friend.friendAt && inTrouble(ctx, o)) troubled.set(o.id, fk);
  }
  // A crush counts only for someone without a partner.
  if (crush && partners.size === 0) partners.set(crush.id, pk * k.partner.crush);
  if (rival) {
    rival.avoid = k.rival.avoid.base * scaled(ctx, c, k.rival.avoid.scale);
    rival.confront = k.rival.confront.base * scaled(ctx, c, k.rival.confront.scale);
  }
  return { partners, rival, troubled, match: matchWant(ctx, c), status: statusWant(ctx, c) };
}

/** Training for a booked match, growing as it nears (wants.yaml match). */
function matchWant(ctx: Ctx, c: Contestant): Wants['match'] {
  const b = bookedFor(ctx, c);
  const m = ctx.data.wants.match;
  const skill = b ? m.skills[b.format] : undefined;
  if (!b || !skill) return null;
  const left = (ctx.data.schedule.event.at - timeOfDay(ctx.w.t) + 1440) % 1440 / 60;
  const soon = 1 + m.soon * Math.max(0, 1 - left / m.hours);
  return { skill, k: m.base * soon * scaled(ctx, c, m.scale[b.format] ?? []) * (b.sudden ? m.sudden : 1) };
}

/** Being seen at their best, more as the meter falls (wants.yaml status). */
function statusWant(ctx: Ctx, c: Contestant): number {
  const s = ctx.data.wants.status;
  return s.base * scaled(ctx, c, s.scale) * (1 + s.meterK * (1 - c.meter / ctx.data.meter.max));
}

/** Who's awake in, or heading into, a room. */
function awakeIn(ctx: Ctx, id: string, room: string): boolean {
  const o = ctx.w.contestants.find((x) => x.id === id);
  return !!o && !o.asleep && (o.activity?.room ?? o.room) === room;
}

/**
 * The pull wants add to an option, and the want that pulled hardest (for the log). `withPeople`
 * and `chore` are as the scoring has them; `talkTo` is the person asked, for a conversation.
 */
export function wantPull(ctx: Ctx, c: Contestant, w: Wants, def: ActionDef, room: string, withPeople: boolean, chore: boolean, talkTo?: string): { pull: number; why?: string } {
  const k = ctx.data.wants;
  let pull = 0;
  let why: string | undefined;
  let top = 0;
  const add = (x: number, name: string) => {
    pull += x;
    if (x > top) [top, why] = [x, name];
  };
  if (talkTo) {
    const p = w.partners.get(talkTo);
    if (p) add(p * k.partner.talk, 'partner');
    const f = w.troubled.get(talkTo);
    if (f) add(f * k.friend.talk, 'friend');
  } else if (withPeople && !chore) {
    // A seat beside them.
    for (const [id, p] of w.partners) if (awakeIn(ctx, id, room)) add(p * k.partner.near, 'partner');
  }
  if (def.primps) {
    let p = 0;
    for (const x of w.partners.values()) p = Math.max(p, x);
    if (p) add(p * k.partner.ready, 'partner');
  }
  if (def.tags.includes('status')) add(w.status, 'status');
  if (w.match && def.trains === w.match.skill) add(w.match.k, 'match');
  if (w.rival && !chore && talkTo !== w.rival.id && awakeIn(ctx, w.rival.id, room)) pull -= w.rival.avoid;
  return { pull, why: top >= 0.3 ? why : undefined };
}

/**
 * A minute of training (activities.yaml training): the skill sharpens. It fades hourly.
 */
export function train(ctx: Ctx, c: Contestant, skill: 'fight' | 'dance'): void {
  c.trained[skill] = Math.min(1, (c.trained[skill] ?? 0) + ctx.data.activities.training.perHour / 60);
}

export function fadeTraining(ctx: Ctx, c: Contestant): void {
  const f = ctx.data.activities.training.fadePerHour;
  for (const s of ['fight', 'dance'] as const) {
    const v = (c.trained[s] ?? 0) - f;
    if (v <= 0) delete c.trained[s];
    else c.trained[s] = v;
  }
}

/** What training adds to a fight or a dance. */
export function trainedEdge(ctx: Ctx, c: Contestant, skill: 'fight' | 'dance'): number {
  return (c.trained[skill] ?? 0) * ctx.data.activities.training[skill];
}

/** Finished getting ready: they look their best until the night is out. */
export function primp(ctx: Ctx, c: Contestant): void {
  const r = ctx.data.activities.ready;
  const m = timeOfDay(ctx.w.t);
  c.primped = ctx.w.t + ((r.until - m + 1440) % 1440);
  log(ctx, 'got_ready', [c.id], c.room);
}
