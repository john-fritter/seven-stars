// Planned murders, known grudges, confiding and accomplices. DESIGN.md Part two, Planned murders.
// Numbers in data/plots.yaml.
//
// Once a day a grudge that won't heal, or a meter one bad day from zero, can become a hidden
// intention on one person, if their personality would let them act on it. Then they stew, keep an
// eye on the target, and wait for a moment the target is alone and unseen; at that moment their
// nerve holds or it doesn't. Someone who wants it done but hasn't the stomach can ask a partner who
// loves them. Who has it in for whom is something people see and gossip about, and that, not the
// ledger, is what the cast suspects on.
import { begin, CEREMONY, endActivity, EVENT, FIGHT, LOVIN, MEAL, PASSED_OUT, TRIAL } from './actions.js';
import { axis, stageOf } from './booze.js';
import { canEnter, isNightFor, log, timeOfDay, type Ctx } from './context.js';
import { attack } from './breaks.js';
import { confess, crimeOf, guiltShare, reopen } from './guilt.js';
import { feel } from './ledger.js';
import { chance, shuffle } from './rng.js';
import { canHear, canSee, walkMinutes } from './station.js';
import { think } from './thoughts.js';
import { believe, bestAccusation, expectedVotes, schedule } from './trials.js';
import type { Activity, Body, Case, Contestant, Plot } from './types.js';

const aboard = (ctx: Ctx, id: string | undefined) => (id ? ctx.w.contestants.find((x) => x.id === id) : undefined);
const has = (c: Contestant, ids: readonly string[]) => c.traits.some((t) => ids.includes(t));

// ---------------------------------------------------------------------------------------------
// Who would do it

/** How willing they'd be to kill in cold blood (plots.yaml willing), or null if they never would. */
export function willingness(ctx: Ctx, c: Contestant): number | null {
  const w = ctx.data.plots.willing;
  const p = c.personality;
  if (p.kind > w.kindMax || has(c, w.never)) return null;
  let v = w.kind * (5 - p.kind) + w.brave * (p.brave - 5) + w.calm * (p.calm - 5) - w.honest * (p.honest - 5) - w.loyal * (p.loyal - 5);
  for (const t of c.traits) v += w.traits[t] ?? 0;
  return v;
}

/** How strong a grudge-born intention on `o` would be: how far past the grudge line, and how much it still hurts. */
function grudgeStrength(ctx: Ctx, c: Contestant, o: string): number {
  const r = c.ledger[o];
  const line = ctx.data.plots.grudge.affection;
  if (!r) return 0;
  return Math.max(0, (line - r.affection) / -line) + Math.max(r.hurt, r.fear) / 100;
}

/** The daily checks a grudge has to hold before it becomes a motive (plots.yaml grudge). */
function broodDays(ctx: Ctx, c: Contestant): number {
  const g = ctx.data.plots.grudge;
  let d = g.days;
  for (const t of c.traits) d = Math.min(d, g.traitDays[t] ?? d);
  return d;
}

/** A motive, if they have one: the grudge that's held longest-and-worst, or desperation. */
function motiveOf(ctx: Ctx, c: Contestant): Omit<Plot, 'since' | 'losses' | 'calm'> | null {
  const pl = ctx.data.plots;
  let best: string | null = null;
  for (const [id, n] of Object.entries(c.brood ?? {})) {
    if (n < broodDays(ctx, c) || !aboard(ctx, id)) continue;
    if (!best || (c.ledger[id]?.affection ?? 0) < (c.ledger[best]?.affection ?? 0)) best = id;
  }
  if (best) return { target: best, motive: 'grudge', strength: grudgeStrength(ctx, c, best) };
  const d = pl.desperate;
  if (c.meter >= d.meter) return null;
  const others = ctx.w.contestants.filter((o) => o !== c && !o.confined && (c.ledger[o.id]?.affection ?? 0) < d.spare);
  if (!others.length) return null;
  const easiest = has(c, d.easiest);
  others.sort((a, b) => (easiest ? a.strength - b.strength : 0) || (c.ledger[a.id]?.affection ?? 0) - (c.ledger[b.id]?.affection ?? 0) || (a.id < b.id ? -1 : 1));
  return { target: others[0]!.id, motive: 'desperate', strength: pl.strength.desperate + (d.meter - c.meter) / d.meter };
}

/** A partner who loves them and has the stomach they lack (plots.yaml proxy). */
function proxyFor(ctx: Ctx, c: Contestant, target: string): Contestant | null {
  const k = ctx.data.plots.proxy;
  const at = ctx.data.plots.willing.at;
  const friendAt = ctx.data.social.ledger.friendAt;
  let best: Contestant | null = null;
  for (const p of ctx.w.contestants) {
    if (p === c || p.id === target || p.plot) continue;
    const mine = c.ledger[p.id];
    const theirs = p.ledger[c.id];
    if (!mine || !theirs || !k.labels.includes(mine.label) || !k.labels.includes(theirs.label)) continue;
    if (theirs.affection < k.loveAt || (p.ledger[target]?.affection ?? 0) >= friendAt) continue;
    const w = willingness(ctx, p);
    if (w === null || w < at) continue;
    if (!best || theirs.affection > (best.ledger[c.id]?.affection ?? 0)) best = p;
  }
  return best;
}

/** Whether `c` still stands accused by `accuser`, the trial still to come. */
function facing(ctx: Ctx, c: Contestant, accuser: string): boolean {
  return ctx.w.show.trials.some((t) => t.accused === c.id && t.accuser === accuser);
}

/**
 * The last resort (plots.yaml lastResort): accused, and reading the room as against them, someone
 * who could kill in cold blood means to get the accuser before the trial.
 */
export function lastResort(ctx: Ctx, body: Pick<Body, 'id' | 'name' | 'killer' | 'feelings'>, accuser: Contestant, accused: Contestant, witnesses: string[], said: number): void {
  const lr = ctx.data.plots.lastResort;
  // Someone already set on killing another keeps to it; one already after the accuser makes it urgent.
  if (!lr || accused.plot?.motive === 'survival' || (accused.plot && accused.plot.target !== accuser.id)) return;
  const expect = expectedVotes(ctx, body, accuser, accused, witnesses, said);
  if (expect < lr.expect) return;
  const w = willingness(ctx, accused);
  if (w === null || w < ctx.data.plots.willing.at - lr.easier) return;
  accused.plot = { target: accuser.id, motive: 'survival', strength: lr.strength, since: ctx.w.t, losses: 0, calm: nextDark(ctx) };
  log(ctx, 'intent', [accused.id, accuser.id], accused.room, { motive: 'survival', strength: lr.strength, willing: round(w), expect: round(expect) });
}

/** Once a day (plots.yaml check): grudges brood, intentions form, fade or are let go. */
export function dailyPlots(ctx: Ctx): void {
  const pl = ctx.data.plots;
  const g = pl.grudge;
  const friendAt = ctx.data.social.ledger.friendAt;
  for (const c of ctx.w.contestants) {
    // How long each grudge has held.
    const brood: Record<string, number> = {};
    for (const o of ctx.w.contestants) {
      const r = c.ledger[o.id];
      if (o === c || !r) continue;
      if (r.affection <= g.affection && Math.max(r.hurt, r.fear) >= g.hurt) brood[o.id] = (c.brood?.[o.id] ?? 0) + 1;
    }
    c.brood = brood;

    const plot = c.plot;
    if (plot) {
      const target = aboard(ctx, plot.target);
      const why = !target
        ? 'gone'
        : ctx.w.t - plot.since > pl.letGo.days * 1440
          ? 'faded'
          : plot.motive === 'grudge' && (c.ledger[plot.target]?.affection ?? 0) > pl.letGo.affection
            ? 'softened'
            : plot.motive === 'desperate' && c.meter > pl.letGo.meter
              ? 'safe'
              : plot.motive === 'love' && (!aboard(ctx, plot.for) || (c.ledger[plot.for!]?.affection ?? 0) < friendAt)
                ? 'fell_out'
                : plot.motive === 'survival' && !facing(ctx, c, plot.target)
                  ? 'over'
                  : null;
      if (why) {
        c.plot = null;
        log(ctx, 'let_go', [c.id, plot.target], c.room, { motive: plot.motive, why, losses: plot.losses });
        continue;
      }
      if (plot.motive === 'grudge') plot.strength = Math.max(plot.strength - pl.nerve.loss * plot.losses, grudgeStrength(ctx, c, plot.target) - pl.nerve.loss * plot.losses);
      if (plot.via && !proxyOk(ctx, c, plot)) delete plot.via;
      continue;
    }

    const m = motiveOf(ctx, c);
    if (!m) continue;
    const w = willingness(ctx, c);
    if (w === null) continue;
    if (w >= pl.willing.at + (m.motive === 'desperate' ? pl.desperate.harder : 0)) {
      c.plot = { ...m, since: ctx.w.t, losses: 0, calm: nextDark(ctx) };
      log(ctx, 'intent', [c.id, m.target], c.room, { motive: m.motive, strength: round(m.strength), willing: round(w) });
      continue;
    }
    // Not the stomach for it themselves: a partner who loves them might.
    const p = proxyFor(ctx, c, m.target);
    if (p) {
      c.plot = { ...m, since: ctx.w.t, losses: 0, calm: 0, via: p.id };
      log(ctx, 'intent', [c.id, m.target, p.id], c.room, { motive: m.motive, strength: round(m.strength), willing: round(w), via: p.id });
    }
  }
}

function proxyOk(ctx: Ctx, c: Contestant, plot: Plot): boolean {
  const p = aboard(ctx, plot.via);
  const k = ctx.data.plots.proxy;
  return !!p && !p.plot && k.labels.includes(c.ledger[p.id]?.label ?? 'none') && (p.ledger[c.id]?.affection ?? 0) >= k.loveAt;
}

const round = (x: number) => Math.round(x * 100) / 100;

/** The next lights-dim: a fresh plan waits for dark. */
function nextDark(ctx: Ctx): number {
  return ctx.w.t + ((ctx.data.schedule.lightsDim - timeOfDay(ctx.w.t) + 1440) % 1440 || 1440);
}

// ---------------------------------------------------------------------------------------------
// The moment

/** Busy with something nobody walks away from: a gathering, a fight, lovin', out cold, a break. */
function tiedUp(c: Contestant): boolean {
  const a = c.activity?.action;
  return !!c.breakdown || !!c.confined || a === FIGHT || a === LOVIN || a === PASSED_OUT || a === MEAL || a === CEREMONY || a === EVENT || a === TRIAL;
}

/** Nobody but `a` and `b` is in `room`, and nobody else awake can see into it. */
function unseen(ctx: Ctx, room: string, a: Contestant, b: Contestant): boolean {
  for (const x of ctx.w.contestants) {
    if (x === a || x === b) continue;
    if (x.room === room || (x.activity?.room === room && x.activity.phase === 'walk')) return false;
    // Footsteps in the hall: anyone up and walking nearby could come through the door any second.
    const steps = ctx.data.plots.moment.footsteps;
    if (steps !== undefined && !x.asleep && x.activity?.phase === 'walk' && walkMinutes(ctx.st, x.room, room) <= steps) return false;
    if (!x.asleep && canSee(ctx.st, x.room, room)) return false;
  }
  return true;
}

/** While a body lies unfound or a trial is pending, nobody strikes (breaks.yaml passion.oneAtATime). */
function mysteryOpen(ctx: Ctx): boolean {
  return ctx.data.breaks.passion.oneAtATime && (ctx.w.show.bodies.length > 0 || ctx.w.show.trials.length > 0);
}

/** Every minute: planners watch for their moment; askers for a private word with their partner. */
export function plotMinute(ctx: Ctx): void {
  for (const c of ctx.w.contestants) {
    const plot = c.plot;
    if (!plot || plot.going || c.asleep || tiedUp(c)) continue;
    const target = aboard(ctx, plot.target);
    if (!target) continue;
    // The trial came and went: the last resort is over, one way or the other.
    if (plot.motive === 'survival' && !facing(ctx, c, plot.target)) {
      c.plot = null;
      log(ctx, 'let_go', [c.id, plot.target], c.room, { motive: plot.motive, why: 'over', losses: plot.losses });
      continue;
    }
    if (plot.via) {
      if (!plot.asked) askPartner(ctx, c, plot);
      continue;
    }
    if (ctx.w.t < plot.calm || (mysteryOpen(ctx) && plot.motive !== 'survival')) continue;
    const room = target.room;
    const ok =
      !target.confined &&
      target.activity?.phase !== 'walk' &&
      !ctx.st.room.get(room)?.glass &&
      walkMinutes(ctx.st, c.room, room) <= ctx.data.plots.moment.reach &&
      (canEnter(ctx, c, room) || c.personality.brave >= ctx.data.plots.moment.sneakBrave) &&
      unseen(ctx, room, c, target);
    if (!ok) {
      plot.window = false;
      continue;
    }
    if (plot.window) continue; // already rolled for this one
    plot.window = true;
    moment(ctx, c, plot, target, room);
  }
}

/** The target is alone and unseen: the nerve holds, or it doesn't. */
function moment(ctx: Ctx, c: Contestant, plot: Plot, target: Contestant, room: string): void {
  const pl = ctx.data.plots;
  const n = pl.nerve;
  const heard = ctx.w.contestants.some((x) => x !== c && x !== target && !x.asleep && canHear(ctx.st, x.room, room));
  const camera = ctx.st.room.get(room)?.camera ?? false;
  const spaced = ctx.w.show.killerSpaced !== undefined && ctx.w.t - ctx.w.show.killerSpaced <= n.spacedDays * 1440;
  const weapon = (ctx.data.breaks.passion.weapons[room] ?? 0) > 1;
  const others = ctx.w.contestants.filter((x) => x !== c && x !== target);
  const busy = others.length ? others.filter((x) => !x.asleep).length / others.length : 0;
  const w = willingness(ctx, c) ?? 0;
  const p = n.base + n.willing * (w - pl.willing.at) + n.strength * plot.strength - (heard ? n.heard : 0) - (camera ? n.camera : 0) - (spaced ? n.spaced : 0) - n.busy * busy + (weapon ? n.weapon : 0) + (target.asleep ? n.asleep : 0);
  const odds = Math.min(1, Math.max(0, p));
  if (odds < n.consider) return; // not good enough: they wait for a better one
  if (!chance(ctx.w.rng, odds)) {
    plot.losses++;
    plot.strength = Math.max(0, plot.strength - n.loss);
    plot.calm = ctx.w.t + n.cooldown;
    think(ctx, c, n.thought, target.id);
    const gaveUp = plot.losses >= n.losses;
    log(ctx, 'nerve_lost', [c.id, target.id], room, { odds: round(odds), losses: plot.losses, ...(gaveUp ? { gaveUp } : {}), ...(heard ? { heard } : {}), ...(camera ? { camera } : {}), ...(spaced ? { spaced } : {}), busy: round(busy) });
    if (gaveUp) c.plot = null;
    return;
  }
  // They go for it.
  endActivity(ctx, c, 'interrupted');
  plot.going = true;
  log(ctx, 'stalk', [c.id, target.id], room, { odds: round(odds), asleep: target.asleep, motive: plot.motive });
  begin(ctx, c, { action: pl.ambush.action, object: null, room, minutes: 1, partner: target.id });
}

/** Arriving for the strike: still alone, still unseen? Then it's an ambush. */
export function ambushArrive(ctx: Ctx, c: Contestant, a: Activity): void {
  const plot = c.plot;
  const target = aboard(ctx, a.partner);
  if (!plot || !target) return;
  plot.going = false;
  if (target.room !== c.room || target.confined || !unseen(ctx, c.room, c, target) || (mysteryOpen(ctx) && plot.motive !== 'survival')) {
    log(ctx, 'ambush_foiled', [c.id, target.id], c.room, {});
    return;
  }
  const pl = ctx.data.plots;
  const asleep = target.asleep;
  const motive = plot.motive;
  const accomplice = plot.for;
  c.plot = null;
  const killed = attack(ctx, c, target, { firstBlow: pl.ambush.firstBlow + (asleep ? pl.ambush.asleep : 0), planned: true, armed: pl.ambush.armed, lastResort: motive === 'survival' });
  log(ctx, 'ambush', [c.id, target.id], c.room, { killed, asleep, motive, ...(accomplice ? { for: accomplice } : {}) });
  if (killed) {
    const k = ctx.w.show.cases.find((x) => x.victim === target.id && x.killer === c.id);
    if (k) {
      k.planned = true;
      const asker = aboard(ctx, accomplice);
      if (asker) {
        k.accomplice = asker.id;
        if (!k.kept.includes(asker.id)) k.kept.push(asker.id);
        think(ctx, asker, pl.proxy.granted, target.id);
      }
    }
    return;
  }
  // They lived: they know exactly who tried.
  const p = ctx.data.breaks.passion;
  feel(ctx, target, c, 'fear', p.witnessFear, 'tried to kill me');
  feel(ctx, target, c, 'affection', -p.witnessFear, 'tried to kill me');
  learnGrudge(ctx, target, c, target);
}

/** Hourly: a planner asleep in their night may stir and lie awake, watching for the moment. */
function stir(ctx: Ctx, c: Contestant): void {
  const plot = c.plot;
  if (!plot || plot.via || plot.going || !c.asleep || ctx.w.t < plot.calm || !isNightFor(ctx, c, ctx.w.t) || (mysteryOpen(ctx) && plot.motive !== 'survival')) return;
  if (!chance(ctx.w.rng, Math.min(1, ctx.data.plots.moment.stir * plot.strength))) return;
  endActivity(ctx, c, 'woke');
  log(ctx, 'lies_awake', [c.id, plot.target], c.room, { plotting: true });
}

/** Hourly: the target may feel eyes on them (plots.yaml notice); a sleeping planner may stir. */
export function noticeHour(ctx: Ctx, c: Contestant): void {
  stir(ctx, c);
  const plot = c.plot;
  if (!plot || plot.via || plot.noticed || c.asleep) return;
  const o = aboard(ctx, plot.target);
  if (!o || o.asleep || !canSee(ctx.st, o.room, c.room)) return;
  const k = ctx.data.plots.notice;
  let odds = k.chance;
  for (const t of c.traits) odds *= k.hide[t] ?? 1;
  if (!chance(ctx.w.rng, odds)) return;
  plot.noticed = true;
  think(ctx, o, k.thought, c.id);
  feel(ctx, o, c, 'fear', k.fear, 'keeps staring at me');
  learnGrudge(ctx, o, c, o);
  log(ctx, 'creeped_out', [o.id, c.id], o.room, {});
}

/** Whether `c` is uneasy (plots.yaml notice): they keep company while it lasts. */
export function uneasy(ctx: Ctx, c: Contestant): number {
  const k = ctx.data.plots.notice;
  return c.thoughts.some((x) => x.id === k.thought) ? k.alone : 0;
}

/** The asker and their partner alone together: the question (plots.yaml proxy). */
function askPartner(ctx: Ctx, c: Contestant, plot: Plot): void {
  const p = aboard(ctx, plot.via);
  if (!p || p.asleep || p.room !== c.room || tiedUp(p) || p.plot || !unseen(ctx, c.room, c, p)) return;
  const k = ctx.data.plots.proxy;
  plot.asked = true;
  const aff = p.ledger[c.id]?.affection ?? 0;
  const yes = chance(ctx.w.rng, Math.min(1, Math.max(0, k.odds.base + ((aff - k.loveAt) / 100) * k.odds.affection)));
  log(ctx, 'asked_to_kill', [c.id, p.id, plot.target], c.room, { yes, motive: plot.motive });
  if (!yes) {
    feel(ctx, p, c, 'affection', k.refused, 'asked me to kill for them');
    learnGrudge(ctx, p, c, aboard(ctx, plot.target)!);
    return;
  }
  const strength = ctx.data.plots.strength.love + (aff - k.loveAt) / 40;
  p.plot = { target: plot.target, motive: 'love', for: c.id, since: ctx.w.t, strength, losses: 0, calm: nextDark(ctx) };
  c.plot = null;
  log(ctx, 'intent', [p.id, plot.target, c.id], p.room, { motive: 'love', strength: round(strength), for: c.id });
}

// ---------------------------------------------------------------------------------------------
// Known grudges

/** `x` learns that `who` has it in for `at`. */
export function learnGrudge(ctx: Ctx, x: Contestant, who: Contestant, at: Contestant, t = ctx.w.t): boolean {
  if (x === who) return false;
  const list = (x.grudges ??= []);
  const known = list.find((g) => g.who === who.id && g.at === at.id);
  if (known) {
    known.t = Math.max(known.t, t);
    return false;
  }
  const forget = ctx.data.plots.grudges.forgetDays * 1440;
  x.grudges = list.filter((g) => ctx.w.t - g.t <= forget);
  x.grudges.push({ who: who.id, at: at.id, t });
  return true;
}

/** Whether `x` knows of bad blood between `a` and `b`, either way. */
export function knowsGrudge(ctx: Ctx, x: Contestant, a: string, b: string): boolean {
  const forget = ctx.data.plots.grudges.forgetDays * 1440;
  return (x.grudges ?? []).some((g) => ((g.who === a && g.at === b) || (g.who === b && g.at === a)) && ctx.w.t - g.t <= forget);
}

/** It's out in the open: everyone awake who can see `room` learns `who` has it in for `at`. */
export function aired(ctx: Ctx, who: Contestant, at: Contestant, room: string): void {
  for (const x of ctx.w.contestants) if (x !== who && (x === at || (!x.asleep && canSee(ctx.st, x.room, room)))) learnGrudge(ctx, x, who, at);
}

/** Gossip after a chat: a fresh grudge the listener doesn't know, not about either of them. */
export function tellGrudge(ctx: Ctx, c: Contestant, o: Contestant): boolean {
  const k = ctx.data.plots.grudges;
  const drunk = stageOf(ctx, c) ? 2 : 1;
  if (!c.grudges?.length || !chance(ctx.w.rng, Math.min(1, k.tell * drunk))) return false;
  const fresh = k.freshDays * 1440;
  for (const g of [...c.grudges].reverse()) {
    if (ctx.w.t - g.t > fresh || g.who === o.id || g.at === o.id || knowsGrudge(ctx, o, g.who, g.at)) continue;
    const who = aboard(ctx, g.who);
    const at = aboard(ctx, g.at) ?? (ctx.w.show.cases.some((x) => x.victim === g.at) ? { id: g.at } : undefined);
    if (!who || !at) continue;
    (o.grudges ??= []).push({ who: g.who, at: g.at, t: g.t });
    log(ctx, 'grudge_told', [c.id, o.id, g.who, g.at], c.room, { about: g.at === c.id ? 'me' : 'them' });
    return true;
  }
  return false;
}

// ---------------------------------------------------------------------------------------------
// Secrets

/** Sober, after a deep talk with a close friend: a guilty killer may unburden themselves (plots.yaml confide). */
export function confideMurder(ctx: Ctx, c: Contestant, o: Contestant): boolean {
  const k = crimeOf(ctx, c);
  const cf = ctx.data.plots.confide;
  if (!k || stageOf(ctx, c) || k.kept.includes(o.id) || k.knew.includes(o.id) || k.accomplice === o.id) return false;
  const r = c.ledger[o.id];
  if (!r || r.affection < cf.closeAt || r.trust < cf.trustAt) return false;
  if (!chance(ctx.w.rng, cf.chance * guiltShare(ctx, c))) return false;
  const keep = ctx.data.trials.guilt.keep;
  if (o.personality.loyal >= keep.loyal && (o.ledger[c.id]?.affection ?? 0) >= ctx.data.social.ledger.friendAt) {
    k.kept.push(o.id);
    think(ctx, o, keep.thought, c.id);
    log(ctx, 'murder_confession', [c.id, o.id], c.room, { victim: k.victim, name: k.name, how: 'confided', kept: true });
    return true;
  }
  return confess(ctx, c, [o], 'confided');
}

/** Drunk, a keeper of someone's secret may let it slip, on their word (plots.yaml secrets). */
export function slipSecret(ctx: Ctx, c: Contestant, o: Contestant): boolean {
  const st = stageOf(ctx, c);
  if (!st?.lips) return false;
  for (const k of ctx.w.show.cases) {
    if (!k.kept.includes(c.id) || k.killer === o.id || k.knew.includes(o.id) || o.ledger[k.killer]?.killer) continue;
    const killer = aboard(ctx, k.killer);
    if (!killer || !chance(ctx.w.rng, st.lips * ctx.data.plots.secrets.slip)) continue;
    log(ctx, 'secret_slipped', [c.id, o.id, killer.id], c.room, { victim: k.victim, name: k.name, stage: st.id });
    believe(ctx, killer, [o.id], { id: k.victim, name: k.name, feelings: k.feelings }, 'gossip', c);
    return true;
  }
  return false;
}

/** Hourly: a keeper who no longer likes the killer turns, and knows it for certain. */
export function keepersTurn(ctx: Ctx): void {
  const friendAt = ctx.data.social.ledger.friendAt;
  for (const k of ctx.w.show.cases) {
    const killer = aboard(ctx, k.killer);
    if (!killer || !k.kept.length) continue;
    for (const id of [...k.kept]) {
      const x = aboard(ctx, id);
      if (!x || (x.ledger[killer.id]?.affection ?? 0) >= friendAt) continue;
      k.kept = k.kept.filter((y) => y !== id);
      if (!k.knew.includes(id)) k.knew.push(id);
      log(ctx, 'secret_turned', [id, killer.id], x.room, { victim: k.victim, name: k.name, ...(k.accomplice === id ? { accomplice: true } : {}) });
      believe(ctx, killer, [id], { id: k.victim, name: k.name, feelings: k.feelings }, 'turned');
      if (!ctx.w.show.trials.some((t) => t.victim === k.victim)) reopen(ctx, k);
    }
  }
}

// ---------------------------------------------------------------------------------------------
// The cameras

/**
 * At the ceremony: each unsolved murder from before today (nobody has accused anyone over it) gets
 * one teaser from the cameras, which narrows it to a few, and someone may now dare to accuse.
 */
export function airClues(ctx: Ctx): void {
  const k = ctx.data.plots.clue;
  const show = ctx.w.show;
  for (const c of show.cases) {
    if (c.clued || c.accusers.length || ctx.w.t - c.t < timeOfDay(ctx.w.t) || show.bodies.some((b) => b.id === c.victim) || show.trials.some((t) => t.victim === c.victim)) continue;
    const killer = aboard(ctx, c.killer);
    if (!killer) continue;
    const near = shuffle(ctx.w.rng, (c.near ?? []).filter((id) => id !== c.killer && aboard(ctx, id)));
    const rest = shuffle(ctx.w.rng, ctx.w.contestants.filter((x) => x !== killer && !near.includes(x.id)).map((x) => x.id));
    const set = shuffle(ctx.w.rng, [c.killer, ...[...near, ...rest].slice(0, k.size - 1)]);
    c.clued = set;
    log(ctx, 'clue', set, c.room, { victim: c.victim, name: c.name });
    const body: Body = { id: c.victim, name: c.name, room: c.room, t: c.t, killer: c.killer, witnesses: c.knew.filter((id) => aboard(ctx, id)), near: c.near ?? [], feelings: c.feelings };
    accuseOver(ctx, body, c);
  }
}

/** Like the accusation when a body is found (trials.ts), with the teaser in everyone's mind. */
function accuseOver(ctx: Ctx, body: Body, c: Case): void {
  const best = bestAccusation(ctx, body);
  if (best) schedule(ctx, body, best.accuser, best.accused, body.witnesses, best.suspicion, false);
  else log(ctx, 'clue_unanswered', [], c.room, { victim: c.victim, name: c.name });
}
