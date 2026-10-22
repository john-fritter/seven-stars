import { describe, expect, it } from 'vitest';
import { log, type Ctx } from '../src/core/context.js';
import { createWorld, step } from '../src/core/index.js';
import { meet } from '../src/core/ledger.js';
import { addMeter, witnessMultiplier } from '../src/core/scoring.js';
import { caughtIn, confine, infraction, mourn, sentenceStep, sentencing, sneakCost, space, spacings } from '../src/core/show.js';
import { socialRound } from '../src/core/social.js';
import { station } from '../src/core/station.js';
import type { Contestant, World } from '../src/core/types.js';
import type { GameData } from '../src/data/schema.js';
import { data } from './helpers.js';

/** A world with the first cast aboard, everyone asleep in no room in particular so witnesses are controlled. */
function aboard(seed = 21, d: GameData = data) {
  const w = createWorld(d, seed);
  step(w, 8 * 60);
  const ctx: Ctx = { data: d, st: station(d), w, events: [] };
  return { w, ctx, cast: w.contestants };
}

/** Puts everyone but `keep` to sleep in the garden, so they don't count as witnesses. */
function alone(w: World, ...keep: Contestant[]) {
  for (const c of w.contestants) {
    if (keep.includes(c)) continue;
    c.room = 'garden';
    c.asleep = true;
  }
}

describe('scoring', () => {
  it('pays the table, to the meter and lifetime points together', () => {
    const { w, ctx, cast } = aboard();
    const [a, b] = cast as [Contestant, Contestant];
    alone(w, a, b);
    Object.assign(a, { room: 'cafe', meter: 50, lifetime: 0 });
    Object.assign(b, { room: 'cafe', meter: 50, lifetime: 0 });
    w.show.today = {};
    const e = log(ctx, 'insult', [a.id, b.id], 'cafe');
    expect(e.data?.awards).toEqual({ [a.id]: 4, [b.id]: 2 });
    expect(e.points).toBe(6);
    expect(a.meter).toBe(54);
    expect(a.lifetime).toBe(4);
  });

  it('multiplies by witnesses, up to ×2', () => {
    const { ctx } = aboard();
    expect(witnessMultiplier(ctx, 0)).toBe(1);
    expect(witnessMultiplier(ctx, 2)).toBeCloseTo(1.3);
    expect(witnessMultiplier(ctx, 9)).toBe(2);
  });

  it('halves repeats by the same pair and gets bored of a type within a day', () => {
    const { w, ctx, cast } = aboard();
    const [a, b, c] = cast as [Contestant, Contestant, Contestant];
    alone(w, a, b, c);
    for (const x of [a, b, c]) Object.assign(x, { room: 'cafe', meter: 50 });
    c.room = 'garden'; // not a witness
    w.show.today = {};
    w.show.pairs = {};
    const first = log(ctx, 'deep_talk', [a.id, b.id], 'cafe').data!.awards as Record<string, number>;
    const second = log(ctx, 'deep_talk', [b.id, a.id], 'cafe').data!.awards as Record<string, number>;
    const other = log(ctx, 'deep_talk', [a.id, c.id], 'cafe').data!.awards as Record<string, number>;
    expect(first[a.id]).toBe(2);
    expect(second[a.id]).toBeCloseTo(2 * 0.5 * 0.9); // a repeat, and the judge's second deep talk today
    expect(other[c.id]).toBeCloseTo(2 * 0.81 * 1.15); // a new pair, but the third deep talk today, and b watching
  });

  it('only scores fights outside the cage', () => {
    const { w, ctx, cast } = aboard();
    const [a, b] = cast as [Contestant, Contestant];
    alone(w, a, b);
    w.show.today = {};
    expect(log(ctx, 'fight', [a.id, b.id], 'cage', { winner: a.id, witnesses: [], outsideCage: false }).points).toBeUndefined();
    const e = log(ctx, 'fight', [a.id, b.id], 'cafe', { winner: a.id, witnesses: [], outsideCage: true });
    expect(e.data?.awards).toEqual({ [a.id]: 18, [b.id]: 12 }); // the cage fight didn't count toward boredom
  });

  it('caps the meter but not lifetime points, and puts zero on notice', () => {
    const { ctx, cast } = aboard();
    const a = cast[0]!;
    Object.assign(a, { meter: 99, lifetime: 0 });
    addMeter(ctx, a, 5);
    expect(a.meter).toBe(100);
    addMeter(ctx, a, -120);
    expect(a.meter).toBe(0);
    expect(ctx.events.filter((e) => e.type === 'on_notice')).toHaveLength(1);
  });

  it('drains the meter by the hourly drain', () => {
    const { w } = aboard();
    const before = w.contestants.map((c) => c.meter);
    const events = step(w, 60);
    const paid = new Map<string, number>();
    for (const e of events) for (const [id, p] of Object.entries((e.data?.awards ?? {}) as Record<string, number>)) paid.set(id, (paid.get(id) ?? 0) + p);
    w.contestants.forEach((c, i) => expect(c.meter).toBeCloseTo(before[i]! - data.meter.drainPerHour + (paid.get(c.id) ?? 0)));
  });
});

describe('sentences', () => {
  it('start from the worst infraction and climb a step per extra one', () => {
    const { ctx } = aboard();
    expect(sentenceStep(ctx, ['above_rank'])).toBe(1);
    expect(sentenceStep(ctx, ['above_rank', 'skipped_ceremony'])).toBe(2);
    expect(sentenceStep(ctx, ['fighting', 'above_rank'])).toBe(3);
    expect(sentenceStep(ctx, ['cameras', 'fighting'])).toBe(4); // the top of the ladder
  });

  it('apply the meter penalty after the sentencing award, and waive the gloriously entertaining', () => {
    const always = structuredClone(data);
    always.rules.waiver.chance = 1;
    const { ctx, cast } = aboard(21, always);
    const [a, b] = cast as [Contestant, Contestant];
    Object.assign(a, { meter: 50 });
    infraction(ctx, a, 'above_rank', 'suite');
    infraction(ctx, b, 'fighting', 'cafe', 14); // the fight scored 14 for them: rule of cool
    const before = { a: a.meter, b: b.meter };
    ctx.w.show.today = {};
    sentencing(ctx);
    expect(ctx.events.some((e) => e.type === 'waived' && e.actors[0] === b.id)).toBe(true);
    expect(b.meter).toBe(before.b);
    expect(a.meter).toBeCloseTo(before.a + 6 + data.rules.sentences[0]!.meter!);
    expect(a.thoughts.some((t) => t.id === 'sentenced')).toBe(true);
    expect(ctx.w.show.pending).toHaveLength(0);
  });

  it('send the worst offenders to the fishbowl, where it is cold, wet and public, until 07:00', () => {
    const { w, ctx, cast } = aboard();
    step(w, 13 * 60 + 25); // just after the day-1 ceremony
    const a = cast[0]!;
    a.needs.hygiene = 0;
    confine(ctx, a, 'night');
    expect(a.room).toBe('fishbowl');
    const until = a.confined!.until;
    expect(until % 1440).toBe(7 * 60);
    step(w, 61);
    expect(a.room).toBe('fishbowl');
    expect(a.needs.hygiene).toBeGreaterThan(0); // doused
    const events = step(w, until - w.t + 1);
    expect(a.confined).toBeNull();
    expect(a.room).toBe('common');
    expect(events.find((e) => e.type === 'fishbowl_night')?.actors).toEqual([a.id]);
  });
});

describe('spacing', () => {
  it('takes anyone at zero to the airlock, unless an immunity is spent', () => {
    const { w, ctx, cast } = aboard();
    const [a, b, c] = cast as [Contestant, Contestant, Contestant];
    for (const x of cast) Object.assign(x, { meter: 50, room: 'common', asleep: false });
    a.meter = 0;
    b.meter = 0;
    b.immunities = 1;
    meet(ctx, a, c);
    c.ledger[a.id]!.affection = 50;
    spacings(ctx);
    expect(w.contestants).not.toContain(a);
    expect(w.contestants).toContain(b);
    expect(b.immunities).toBe(0);
    const death = ctx.events.find((e) => e.type === 'death')!;
    expect(death.data).toMatchObject({ cause: 'meter', name: a.name });
    expect(c.thoughts.map((t) => t.id)).toEqual(expect.arrayContaining(['friend_died', 'watched_execution']));
    expect((death.data!.awards as Record<string, number>)[c.id]).toBe(3);
    for (const x of w.contestants) expect(x.ledger[a.id]).toBeUndefined();
  });

  it('feels a death by how they felt about them, and the kind don\'t gloat', () => {
    const { ctx, cast } = aboard();
    const [dead, ...rest] = cast as [Contestant, ...Contestant[]];
    const feelings: Record<string, { affection: number; enemy: boolean }> = {};
    const plan = [50, 20, 0, -20, -50, -50] as const;
    rest.forEach((o, i) => {
      o.thoughts = [];
      o.intox = 0;
      Object.assign(o.personality, { calm: 5, brave: 5, loyal: 5, kind: i === 5 ? 9 : 2 });
      feelings[o.id] = { affection: plan[i]!, enemy: plan[i]! <= -30 };
    });
    mourn(ctx, dead.id, feelings);
    const got = rest.map((o) => o.thoughts.find((t) => t.about === dead.id)!);
    expect(got.map((t) => t.id)).toEqual(['friend_died', 'someone_died', 'someone_died', 'relieved_died', 'rival_died', 'someone_died']);
    const sd = data.thoughts.thoughts.someone_died!.value;
    const fear = 1; // brave 5
    expect(got[1]!.value).toBeCloseTo((sd + 20 * data.rules.spacing.diedPerAffection) * fear);
    expect(got[2]!.value).toBeCloseTo(sd * fear);
    expect(got[1]!.value).toBeLessThan(got[2]!.value); // liked them: worse
    expect(got[3]!.value).toBeGreaterThan(0);
    expect(got[4]!.value).toBeGreaterThan(data.thoughts.thoughts.rival_died!.value); // unkind: gloats more
    expect(got[5]!.value).toBeLessThan(0); // kind: sorry anyway
  });

  it('shows a dead host\'s guest out', () => {
    const { w, ctx, cast } = aboard();
    const [host, guest] = cast as [Contestant, Contestant];
    host.bed = 'good:bed_good:1';
    guest.guest = { room: 'good', host: host.id, since: w.t };
    guest.room = 'good';
    guest.activity = null;
    space(ctx, host, 'meter');
    expect(guest.guest).toBeNull();
    expect(guest.room).toBe('common');
  });
});

describe('infractions in play', () => {
  it('sneaking costs more for honest, timid people', () => {
    const { ctx, cast } = aboard();
    const a = cast[0]!;
    Object.assign(a.personality, { honest: 5, brave: 5 });
    expect(sneakCost(ctx, a)).toBeCloseTo(data.rules.sneak.cost);
    Object.assign(a.personality, { honest: 10, brave: 0 });
    expect(sneakCost(ctx, a)).toBeCloseTo(data.rules.sneak.cost * 1.5 * 1.5);
  });

  it('are logged the moment someone walks in above their rank, once per room', () => {
    let found = false;
    for (let seed = 1; seed <= 10 && !found; seed++) {
      const w = createWorld(data, seed);
      const events = step(w, 4 * 1440);
      const caught = events.filter((e) => e.type === 'infraction' && e.data?.rule === 'above_rank');
      if (!caught.length) continue;
      found = true;
      const first = caught[0]!;
      const arrived = events.find((e) => e.t === first.t && e.type === 'act.start' && e.actors[0] === first.actors[0]);
      expect(arrived === undefined || arrived.room === first.room).toBe(true);
      // Between two ceremonies, the same contestant is never logged twice for the same room.
      const seen = new Set<string>();
      for (const e of events) {
        if (e.type === 'ceremony') seen.clear();
        if (e.type !== 'infraction' || e.data?.rule !== 'above_rank') continue;
        const key = `${e.actors[0]}|${e.room}`;
        expect(seen.has(key)).toBe(false);
        seen.add(key);
      }
    }
    expect(found).toBe(true);
  });

  it('the fishbowl talks only through the glass', () => {
    const { w, ctx, cast } = aboard();
    const [inside, outside] = cast as [Contestant, Contestant];
    alone(w, inside, outside);
    confine(ctx, inside, 'day');
    for (const c of [inside, outside]) c.activity = { action: 'idle', object: null, room: c.room, phase: 'do', startedAt: w.t, arriveAt: w.t, minutes: null, endAt: null };
    outside.room = 'common';
    outside.activity!.room = 'common';
    Object.assign(inside.personality, { outgoing: 10 });
    Object.assign(outside.personality, { outgoing: 10 });
    const glass = new Set(data.social.interactions.filter((d) => d.glass).map((d) => d.id));
    let through = 0;
    for (let i = 0; i < 300; i++) {
      socialRound(ctx);
      inside.needs.social = outside.needs.social = 0;
    }
    for (const e of ctx.events) {
      if (!data.social.interactions.some((d) => d.id === e.type)) continue;
      expect(glass.has(e.type)).toBe(true);
      if (e.actors[0] === inside.id) expect(e.type).toBe('glass_talk'); // mocking and feeding come from outside
      through++;
    }
    expect(through).toBeGreaterThan(0);
  });
});
