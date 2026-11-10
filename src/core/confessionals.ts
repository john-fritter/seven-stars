// Confessionals: the diary room. DESIGN.md, How contestants choose: the next pass (Confessionals).
//
// A stage with only a camera. Every visit vents (the worst bad thought on their mind eases), and
// they say the best thing they have: a grudge, a crush, a romance they know about, who they think
// the killer is, their own cheating. What's said is what pays, and a quiet one saying something
// loud pays most (scoring.yaml surprise.tags). The operator summons people after big moments, and a
// sentence can air someone's latest confessional at the next dinner (D-043), where everyone hears it.
//
//   pull = vent.k × |worst unvented bad thought| ÷ 10 + say.k × pay ÷ 10
//        + ratings × desperation × pay ÷ 10 × taste            (pay × cautious with a sentence coming)
import type { ActionDef, ConfessionalKind } from '../data/schema.js';
import { begin, CEREMONY, endActivity, EVENT, LOVIN, MEAL, onToilet, PASSED_OUT, TRIAL, type Plan } from './actions.js';
import { dayOf, log, timeOfDay, type Ctx } from './context.js';
import { personalityOf } from './derived.js';
import { feel } from './ledger.js';
import { desperation, expectedPoints, tagSurprise } from './ratings.js';
import { chance, weightedIndex } from './rng.js';
import { labelOf, tell } from './romance.js';
import { gathering } from './schedule.js';
import { canHear } from './station.js';
import { think, updateMood } from './thoughts.js';
import { traitFx } from './traits.js';
import type { Activity, Contestant, Thought } from './types.js';

/** Something they could say to the camera. */
export interface Topic {
  kind: ConfessionalKind;
  about: string[];
  key: string | null; // what they'll remember having told (null: not remembered)
}

const pairKey = (a: string, b: string) => (a < b ? `${a}:${b}` : `${b}:${a}`);

function alive(ctx: Ctx, id: string): Contestant | undefined {
  return ctx.w.contestants.find((x) => x.id === id);
}

/** Everything they have to reveal right now that they haven't told the camera lately. */
export function topics(ctx: Ctx, c: Contestant): Topic[] {
  const cf = ctx.data.confessionals;
  const since = ctx.w.t - cf.told.hours * 60;
  const out: Topic[] = [];
  const add = (kind: ConfessionalKind, about: string[], key: string) => {
    if ((c.told[key] ?? -Infinity) <= since) out.push({ kind, about, key });
  };
  for (const [id, r] of Object.entries(c.ledger)) {
    const o = alive(ctx, id);
    if (!o) continue;
    if (r.killer) add('suspicion', [id], `suspicion:${id}`);
    else if (r.affection <= cf.grudge.below) add('grudge', [id], `grudge:${id}`);
    const label = labelOf(c, o);
    if (r.attraction >= cf.crush.attraction && label !== 'dating' && label !== 'exclusive') add('crush', [id], `crush:${id}`);
  }
  const guilty = ctx.data.romance.guilty;
  for (const s of c.seen) {
    if (s.who !== c.id && s.with !== c.id) {
      if (alive(ctx, s.who) && alive(ctx, s.with)) add('spill', [s.who, s.with], `spill:${pairKey(s.who, s.with)}`);
      continue;
    }
    // Their own fling, behind the back of someone they feel guilty about.
    const other = s.who === c.id ? s.with : s.who;
    if (!alive(ctx, other)) continue;
    const partner = c.thoughts.find((x) => x.id === guilty && x.about !== null && x.about !== other && alive(ctx, x.about));
    if (partner) add('cheating', [other, partner.about!], `cheating:${other}`);
  }
  return out;
}

/** What saying this would pay them now: the case's award after the judge's boredom, their repeats and traits, × the surprise if it's loud. */
export function topicPoints(ctx: Ctx, c: Contestant, kind: ConfessionalKind): number {
  const cf = ctx.data.confessionals;
  const p = expectedPoints(ctx, c, cf.event, kind);
  const tags = ctx.data.scoring.surprise.tags[cf.event];
  return cf.topics[kind]?.loud && tags ? p * tagSurprise(ctx, c, tags) : p;
}

/** The worst bad thought on their mind that they haven't poured out yet, if it's bad enough to bother. */
function worstUnvented(ctx: Ctx, c: Contestant): Thought | null {
  let worst: Thought | null = null;
  for (const x of c.thoughts) if (!x.vented && x.value < 0 && (!worst || x.value < worst.value)) worst = x;
  return worst && -worst.value >= ctx.data.confessionals.vent.minBad ? worst : null;
}

/** The pull toward the diary chair on their own (added to its score in actions.ts). */
export function confessionalPull(ctx: Ctx, c: Contestant, def: ActionDef): number {
  const cf = ctx.data.confessionals;
  if (def.id !== cf.action) return 0;
  const worst = worstUnvented(ctx, c);
  let pay = topicPoints(ctx, c, 'vent');
  for (const t of topics(ctx, c)) pay = Math.max(pay, topicPoints(ctx, c, t.kind));
  if (ctx.w.show.pending.some((x) => x.who === c.id)) pay *= cf.cautious;
  const vent = worst ? (cf.vent.k * -worst.value) / 10 : 0;
  const ratings = cf.ratings * traitFx(ctx.data, c).ratingsPull * desperation(ctx, c) * (pay / 10) * personalityOf(ctx.data, c, def);
  return vent + (cf.say.k * pay) / 10 + ratings;
}

/**
 * The visit is over: they pour out the worst of it and say the best thing they have, picked at
 * random by what it would pay. Logged (and scored) as a confessional, and kept on tape.
 */
export function confide(ctx: Ctx, c: Contestant, a: Activity): void {
  const cf = ctx.data.confessionals;
  const worst = worstUnvented(ctx, c);
  if (worst) {
    worst.value *= cf.vent.share;
    worst.vented = true;
    updateMood(ctx, c);
  }
  const options = topics(ctx, c);
  if (a.summoned) options.push({ kind: 'take', about: a.about && alive(ctx, a.about) ? [a.about] : [], key: null });
  let said: Topic = { kind: 'vent', about: [], key: null };
  if (options.length) said = options[weightedIndex(ctx.w.rng, options.map((t) => Math.max(0.01, topicPoints(ctx, c, t.kind))))]!;
  const since = ctx.w.t - cf.told.hours * 60;
  for (const k of Object.keys(c.told)) if (c.told[k]! <= since) delete c.told[k];
  if (said.key) c.told[said.key] = ctx.w.t;
  ctx.w.show.tapes[c.id] = { t: ctx.w.t, kind: said.kind, about: said.about };
  log(ctx, cf.event, [c.id], a.room, {
    kind: said.kind,
    loud: cf.topics[said.kind]?.loud ?? false,
    ...(said.about.length ? { about: said.about } : {}),
    ...(worst ? { vented: ctx.data.thoughts.thoughts[worst.id] ? worst.id : null } : {}),
    ...(a.summoned ? { summoned: a.summoned } : {}),
  });
}

// ---------------------------------------------------------------------------------------------
// The operator's summons

/** After a big moment, its actors are queued for the diary room (confessionals.yaml summons). */
export function watchMoments(ctx: Ctx, from: number): void {
  const s = ctx.data.confessionals.summons;
  const show = ctx.w.show;
  for (let i = from; i < ctx.events.length; i++) {
    const e = ctx.events[i]!;
    if (e.type === ctx.data.confessionals.event || e.type === 'playback') continue;
    if (!s.events.includes(e.type) && (e.points ?? 0) < s.minPoints) continue;
    for (const id of e.actors.slice(0, 2)) {
      if (!alive(ctx, id) || show.summons.some((x) => x.who === id)) continue;
      const other = e.actors.find((x, j) => j < 2 && x !== id) ?? null;
      show.summons.push({ who: id, moment: e.type, about: other, t: e.t });
    }
  }
}

/** Free to be called: awake, and not at a meal or gathering, mid-lovin', out cold, broken down or locked up. */
function free(ctx: Ctx, c: Contestant): boolean {
  const a = c.activity;
  const busy = [MEAL, CEREMONY, EVENT, TRIAL, LOVIN, PASSED_OUT, ctx.data.confessionals.action];
  return !c.asleep && !c.confined && !c.breakdown && !onToilet(ctx, c) && !(a && busy.includes(a.action));
}

/** Every minute: "Sola to the confessional, please", once the chair's free and so are they. */
export function callSummons(ctx: Ctx): void {
  const show = ctx.w.show;
  if (!show.summons.length) return;
  const cf = ctx.data.confessionals;
  const day = dayOf(ctx.w.t);
  if (show.called.day !== day) show.called = { day, ids: [] };
  const expire = ctx.w.t - cf.summons.expireHours * 60;
  show.summons = show.summons.filter((x) => x.t > expire && alive(ctx, x.who) && !show.called.ids.includes(x.who));
  if (show.called.ids.length >= cf.summons.perDay) {
    show.summons = [];
    return;
  }
  if (!show.summons.length || gathering(ctx)) return;
  const chair = ctx.st.objects.find((o) => o.actions.some((d) => d.id === cf.action));
  if (!chair || ctx.w.objects[chair.id]!.length >= chair.capacity) return;
  const i = show.summons.findIndex((x) => free(ctx, alive(ctx, x.who)!));
  if (i < 0) return;
  const s = show.summons.splice(i, 1)[0]!;
  const c = alive(ctx, s.who)!;
  show.called.ids.push(c.id);
  const def = chair.actions.find((d) => d.id === cf.action)!;
  endActivity(ctx, c, 'interrupted');
  log(ctx, 'summoned', [c.id], chair.room, { moment: s.moment, ...(s.about ? { about: s.about } : {}) });
  const plan: Plan = { action: def.id, object: chair.id, room: chair.room, minutes: def.minutes, summoned: s.moment };
  if (s.about) plan.about = s.about;
  begin(ctx, c, plan);
}

// ---------------------------------------------------------------------------------------------
// Exposure: playback at dinner

/** At sentencing: their latest confessional may air at tomorrow's dinner. Returns whether it will. */
export function exposure(ctx: Ctx, c: Contestant): boolean {
  const p = ctx.data.confessionals.playback;
  const tape = ctx.w.show.tapes[c.id];
  if (!tape || tape.t < ctx.w.t - p.days * 1440 || ctx.w.show.playback.some((x) => x.who === c.id)) return false;
  if (!chance(ctx.w.rng, p.chance)) return false;
  ctx.w.show.playback.push({ who: c.id, day: dayOf(ctx.w.t) + 1 });
  return true;
}

/** Every minute: at the playback time, today's tapes air. */
export function playbackMinute(ctx: Ctx): void {
  const show = ctx.w.show;
  if (!show.playback.length || timeOfDay(ctx.w.t) !== ctx.data.confessionals.playback.at) return;
  const day = dayOf(ctx.w.t);
  const due = show.playback.filter((x) => x.day <= day);
  show.playback = show.playback.filter((x) => x.day > day);
  for (const x of due) air(ctx, x.who);
}

/** The announcer plays their confessional at dinner: they're humiliated, and what they said lands. */
function air(ctx: Ctx, who: string): void {
  const p = ctx.data.confessionals.playback;
  const c = alive(ctx, who);
  const tape = ctx.w.show.tapes[who];
  if (!c || !tape) return;
  delete ctx.w.show.tapes[who];
  const heard = ctx.w.contestants.filter((x) => x !== c && !x.asleep && canHear(ctx.st, x.room, p.room));
  const about = tape.about.map((id) => alive(ctx, id)).filter((x) => x !== undefined);
  log(ctx, 'playback', [c.id], p.room, { kind: tape.kind, about: tape.about, heard: heard.map((x) => x.id), said: tape.t });
  think(ctx, c, p.speaker);
  const trashed = (x: Contestant) => {
    feel(ctx, x, c, 'affection', p.about.affection, 'trashed me on air');
    think(ctx, x, p.about.thought, c.id);
  };
  switch (tape.kind) {
    case 'grudge':
    case 'take':
      for (const x of about) trashed(x);
      break;
    case 'suspicion':
      for (const x of about) {
        trashed(x);
        for (const h of heard) if (h !== x) feel(ctx, h, x, 'fear', p.killer.fear, 'named a killer on air');
      }
      break;
    case 'crush':
      for (const x of about) {
        if ((x.ledger[c.id]?.affection ?? 0) < 0) continue;
        feel(ctx, x, c, 'affection', p.crush.affection, 'fancies me');
        think(ctx, x, p.crush.thought, c.id);
      }
      break;
    case 'spill': {
      const [a, b] = about;
      if (!a || !b) break;
      trashed(a);
      trashed(b);
      for (const h of heard) if (h !== a && h !== b) tell(ctx, h, a, b, 'playback');
      break;
    }
    case 'cheating': {
      const [other, partner] = about;
      if (!other) break;
      const listeners = new Set(heard);
      if (partner) listeners.add(partner); // it's about them: they'll hear
      for (const h of listeners) if (h !== other) tell(ctx, h, c, other, 'playback');
      break;
    }
  }
}
