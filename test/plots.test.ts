import { describe, expect, it } from 'vitest';
import { meet, relation } from '../src/core/ledger.js';
import { aired, airClues, dailyPlots, keepersTurn, knowsGrudge, plotMinute, tellGrudge, willingness } from '../src/core/plots.js';
import { timeOfDay } from '../src/core/context.js';
import { kill } from '../src/core/show.js';
import type { Contestant, Plot } from '../src/core/types.js';
import type { GameData } from '../src/data/schema.js';
import { aboard, alone, data } from './helpers.js';

function introduce(ctx: Parameters<typeof meet>[0], cast: Contestant[]): void {
  for (const a of cast) a.ledger = {};
  for (const a of cast) for (const b of cast) if (a !== b) meet(ctx, a, b);
}

/** A cold, brave, cruel contestant with no softening traits. */
function killerish(c: Contestant): void {
  Object.assign(c.personality, { kind: 1, brave: 8, calm: 7, honest: 3, loyal: 4 });
  c.traits = [];
}

const plot = (target: string, over: Partial<Plot> = {}): Plot => ({ target, motive: 'grudge', since: 0, strength: 1, losses: 0, calm: 0, ...over });

describe('who would plan a murder', () => {
  it('scores willingness from the axes and traits, and rules out the kind and the hotheaded', () => {
    const { ctx, cast } = aboard();
    const c = cast[0]!;
    const w = data.plots.willing;
    Object.assign(c.personality, { kind: 2, brave: 7, calm: 6, honest: 4, loyal: 5 });
    c.traits = [];
    expect(willingness(ctx, c)).toBeCloseTo(w.kind * 3 + w.brave * 2 + w.calm * 1 - w.honest * -1);
    c.traits = ['ice_cold'];
    expect(willingness(ctx, c)).toBeCloseTo(w.kind * 3 + w.brave * 2 + w.calm * 1 + w.honest * 1 + w.traits.ice_cold!);
    c.traits = ['hothead'];
    expect(willingness(ctx, c)).toBeNull();
    c.traits = [];
    c.personality.kind = w.kindMax + 1;
    expect(willingness(ctx, c)).toBeNull();
  });

  it('a grudge has to hold for days before it becomes a plan, which waits for dark', () => {
    const { ctx, cast } = aboard();
    const [c, o] = cast as [Contestant, Contestant];
    introduce(ctx, cast);
    killerish(c);
    c.meter = 80;
    const r = relation(ctx, c, o);
    Object.assign(r, { affection: -80, hurt: 60 });
    for (let d = 1; d < data.plots.grudge.days; d++) {
      dailyPlots(ctx);
      expect(c.plot ?? null).toBeNull();
      r.affection = -80; // the ledger fades between checks; keep it raw
    }
    dailyPlots(ctx);
    expect(c.plot?.target).toBe(o.id);
    expect(c.plot?.motive).toBe('grudge');
    expect(timeOfDay(c.plot!.calm)).toBe(data.schedule.lightsDim);
    expect(ctx.events.some((e) => e.type === 'intent' && e.actors[0] === c.id)).toBe(true);
    // Feelings soften: they let it go.
    r.affection = 0;
    dailyPlots(ctx);
    expect(c.plot).toBeNull();
    expect(ctx.events.some((e) => e.type === 'let_go' && e.data!.why === 'softened')).toBe(true);
  });

  it('without the stomach for it, they mean to ask a partner who loves them', () => {
    const { ctx, cast } = aboard();
    const [c, p, o] = cast as [Contestant, Contestant, Contestant];
    introduce(ctx, cast);
    Object.assign(c.personality, { kind: 4, brave: 3, calm: 5, honest: 5, loyal: 5 });
    c.traits = [];
    killerish(p);
    c.meter = 80;
    Object.assign(relation(ctx, c, o), { affection: -90, hurt: 80 });
    Object.assign(relation(ctx, c, p), { label: 'exclusive', affection: 80 });
    Object.assign(relation(ctx, p, c), { label: 'exclusive', affection: 90 });
    c.brood = { [o.id]: data.plots.grudge.days - 1 }; // the grudge has held all but one check
    dailyPlots(ctx);
    expect(c.plot?.via).toBe(p.id);
  });
});

describe('the moment', () => {
  /** Data where nerve always holds and an attack always kills a weaker target. */
  function sure(): GameData {
    const d = structuredClone(data);
    d.plots.nerve.base = 5;
    d.breaks.passion.base = 1;
    return d;
  }

  it('alone and unseen, a planner strikes, and a planned murder is logged', () => {
    const { w, ctx, cast } = aboard(21, sure());
    const [c, o] = cast as [Contestant, Contestant];
    alone(w, c, o);
    introduce(ctx, cast);
    killerish(c);
    c.strength = 100;
    for (const x of [c, o]) Object.assign(x, { room: 'spa', asleep: false, activity: null, breakdown: null, confined: null });
    c.plot = plot(o.id);
    plotMinute(ctx);
    expect(ctx.events.some((e) => e.type === 'stalk')).toBe(true);
    const m = ctx.events.find((e) => e.type === 'murder');
    expect(m?.data!.planned).toBe(true);
    expect(w.contestants.includes(o)).toBe(false);
    expect(w.show.cases.find((k) => k.victim === o.id)?.planned).toBe(true);
    expect(c.plot).toBeNull();
    // The killer feels the rush, not catharsis.
    expect(c.thoughts.some((x) => x.id === data.trials.guilt.rush && x.about === o.id)).toBe(true);
  });

  it('no moment while anyone else can see, before dark, or while another murder is open', () => {
    const { w, ctx, cast } = aboard(21, sure());
    const [c, o, x] = cast as [Contestant, Contestant, Contestant];
    alone(w, c, o, x);
    introduce(ctx, cast);
    killerish(c);
    for (const y of [c, o, x]) Object.assign(y, { room: 'spa', asleep: false, activity: null, breakdown: null, confined: null });
    c.plot = plot(o.id);
    plotMinute(ctx);
    expect(ctx.events.some((e) => e.type === 'stalk')).toBe(false);
    x.room = 'garden';
    x.asleep = true;
    c.plot = plot(o.id, { calm: w.t + 60 });
    plotMinute(ctx);
    expect(ctx.events.some((e) => e.type === 'stalk')).toBe(false);
    c.plot = plot(o.id);
    w.show.bodies.push({ id: 'z', name: 'Z', room: 'cage', t: 0, killer: x.id, witnesses: [], near: [], feelings: {} });
    plotMinute(ctx);
    expect(ctx.events.some((e) => e.type === 'stalk')).toBe(false);
    w.show.bodies = [];
    plotMinute(ctx);
    expect(ctx.events.some((e) => e.type === 'stalk')).toBe(true);
  });

  it('a hopeless moment passes without costing them their nerve', () => {
    const d = structuredClone(data);
    d.plots.nerve.base = -5;
    const { w, ctx, cast } = aboard(21, d);
    const [c, o] = cast as [Contestant, Contestant];
    alone(w, c, o);
    introduce(ctx, cast);
    killerish(c);
    for (const x of [c, o]) Object.assign(x, { room: 'spa', asleep: false, activity: null, breakdown: null, confined: null });
    c.plot = plot(o.id);
    plotMinute(ctx);
    expect(c.plot?.losses).toBe(0);
    expect(ctx.events.some((e) => e.type === 'nerve_lost' || e.type === 'stalk')).toBe(false);
  });
});

describe('known grudges', () => {
  it('are learned by seeing them aired, spread in gossip, and are what suspicion goes on', () => {
    const { w, ctx, cast } = aboard();
    const [a, b, seer, blind, listener] = cast as [Contestant, Contestant, Contestant, Contestant, Contestant];
    alone(w, a, b, seer, blind, listener);
    introduce(ctx, cast);
    for (const x of [a, b, seer]) Object.assign(x, { room: 'lounge', asleep: false });
    Object.assign(blind, { room: 'garden', asleep: false });
    Object.assign(listener, { room: 'garden', asleep: false });
    aired(ctx, a, b, 'lounge');
    expect(knowsGrudge(ctx, seer, a.id, b.id)).toBe(true);
    expect(knowsGrudge(ctx, seer, b.id, a.id)).toBe(true); // either way
    expect(knowsGrudge(ctx, b, a.id, b.id)).toBe(true);
    expect(knowsGrudge(ctx, blind, a.id, b.id)).toBe(false);
    const d = structuredClone(data);
    d.plots.grudges.tell = 1;
    expect(tellGrudge({ ...ctx, data: d }, seer, listener)).toBe(true);
    expect(knowsGrudge(ctx, listener, a.id, b.id)).toBe(true);
  });
});

describe('secrets and the cameras', () => {
  it('a keeper who stops liking the killer turns, and knows it for certain', () => {
    const { w, ctx, cast } = aboard();
    const [killer, victim, keeper] = cast as [Contestant, Contestant, Contestant];
    alone(w);
    introduce(ctx, cast);
    kill(ctx, victim, 'murder', 'spa', [], killer.id);
    w.show.bodies = [];
    const k = w.show.cases.find((x) => x.victim === victim.id)!;
    k.kept.push(keeper.id);
    relation(ctx, keeper, killer).affection = 60;
    keepersTurn(ctx);
    expect(k.kept).toContain(keeper.id);
    relation(ctx, keeper, killer).affection = -10;
    keepersTurn(ctx);
    expect(k.kept).not.toContain(keeper.id);
    expect(k.knew).toContain(keeper.id);
    expect(keeper.ledger[killer.id]?.killer).toBe(victim.name);
  });

  it('an unsolved murder from before today gets one teaser naming a few, the killer among them', () => {
    const { w, ctx, cast } = aboard();
    const [killer, victim] = cast as [Contestant, Contestant];
    alone(w);
    introduce(ctx, cast);
    for (const c of w.contestants) c.personality.brave = 0; // nobody dares accuse
    kill(ctx, victim, 'murder', 'spa', [], killer.id);
    w.show.bodies = [];
    w.t += 1440;
    airClues(ctx);
    const k = w.show.cases.find((x) => x.victim === victim.id)!;
    expect(k.clued).toHaveLength(data.plots.clue.size);
    expect(k.clued).toContain(killer.id);
    const before = ctx.events.filter((e) => e.type === 'clue').length;
    airClues(ctx);
    expect(ctx.events.filter((e) => e.type === 'clue').length).toBe(before); // once per murder
  });
});
