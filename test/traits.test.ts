import { readFileSync } from 'node:fs';
import { describe, expect, it } from 'vitest';
import { begin, endActivity, sleepwalk } from '../src/core/actions.js';
import { breakLines, breakLevel } from '../src/core/breaks.js';
import { log } from '../src/core/context.js';
import { rollContestant } from '../src/core/generator.js';
import { createWorld, step } from '../src/core/index.js';
import { fadeLedger, meet, rel } from '../src/core/ledger.js';
import { createRng } from '../src/core/rng.js';
import { fightChance, interact } from '../src/core/social.js';
import { thoughtValue, trappedHere, updateMood } from '../src/core/thoughts.js';
import { excludes, mergeTraits, rollTraits, traitFx } from '../src/core/traits.js';
import type { Contestant } from '../src/core/types.js';
import { DataError, parseGameData } from '../src/data/load.js';
import type { GameData } from '../src/data/schema.js';
import { aboard, alone, data } from './helpers.js';

const flat = (x: number) => ({ outgoing: x, kind: x, honest: x, calm: x, loyal: x, brave: x, vain: x, playful: x });
const real = (name: string) => readFileSync(`./data/${name}.yaml`, 'utf8');

/** A plain contestant: middling sliders, no traits, nothing on their mind. */
function plain(c: Contestant, ...traits: string[]): Contestant {
  c.personality = flat(5);
  c.species = 'human';
  c.traits = traits;
  c.thoughts = [];
  c.intox = 0;
  return c;
}

/** The data with one trait's row changed. */
function withTrait(id: string, change: Record<string, unknown>): GameData {
  const t = data.traits.traits;
  return { ...data, traits: { ...data.traits, traits: { ...t, [id]: { ...t[id]!, ...change } } } };
}

describe('rolling traits', () => {
  it('gives one to three, never two that exclude each other, never one weighted 0', () => {
    const rng = createRng(7);
    const counts = [0, 0, 0, 0];
    for (let i = 0; i < 2000; i++) {
      const c = rollContestant(data, rng, `c${i}`, 0, new Set());
      counts[c.traits.length]!++;
      expect(c.traits.length).toBeGreaterThanOrEqual(1);
      expect(c.traits).not.toContain('gossip');
      for (const a of c.traits) for (const b of c.traits) if (a !== b) expect(excludes(data, a, b)).toBe(false);
    }
    // 50 / 35 / 15
    expect(counts[1]! / 2000).toBeCloseTo(0.5, 1);
    expect(counts[3]! / 2000).toBeCloseTo(0.15, 1);
  });

  it('leans on the sliders without deciding: the volatile roll Hothead far more often than the calm', () => {
    const rng = createRng(3);
    const share = (calm: number) => {
      let n = 0;
      for (let i = 0; i < 3000; i++) if (rollTraits(data, rng, { personality: { ...flat(5), calm }, modesty: 5, drinking: 5, monogamy: 5 }).includes('hothead')) n++;
      return n / 3000;
    };
    const volatile = share(0);
    const calm = share(10);
    expect(volatile).toBeGreaterThan(calm * 3);
    expect(calm).toBeGreaterThan(0); // tilted, not forbidden... unless k makes it 0 at the far end
  });

  it('Prude and Exhibitionist set modesty, whatever was rolled', () => {
    const rng = createRng(11);
    for (let i = 0; i < 500; i++) {
      const c = rollContestant(data, rng, `c${i}`, 0, new Set());
      if (c.traits.includes('prude')) expect(c.modesty).toBe(10);
      if (c.traits.includes('exhibitionist')) expect(c.modesty).toBe(0);
    }
  });

  it('merges rows: multipliers multiply, offsets add', () => {
    const t = data.traits.traits;
    const fx = mergeTraits([t.worrier!, t.ice_cold!, t.drama_queen!]);
    expect(fx.sources.fear).toBe(1.5);
    expect(fx.sources.grief).toBe(0.3);
    expect(fx.breakLine).toBe(10);
    expect(fx.interactions.kind_words).toBe(0);
  });
});

describe('trait effects', () => {
  it('scale thoughts: a Worrier fears more, Ice cold barely feels a death, Survivors feel doom less', () => {
    const { ctx, cast } = aboard();
    const c = plain(cast[0]!);
    const died = thoughtValue(ctx, c, 'someone_died');
    const doom = thoughtValue(ctx, c, 'doomed', -10);
    c.traits = ['worrier'];
    expect(thoughtValue(ctx, c, 'someone_died')).toBeCloseTo(died * 1.5);
    c.traits = ['ice_cold'];
    expect(thoughtValue(ctx, c, 'someone_died')).toBeCloseTo(died * 0.3);
    c.traits = ['survivor'];
    expect(thoughtValue(ctx, c, 'doomed', -10)).toBeCloseTo(doom * 0.5);
  });

  it('a Hothead swings at a slight, and twice as readily at an insult', () => {
    const { w, ctx, cast } = aboard();
    const [a, b] = cast as [Contestant, Contestant];
    plain(a);
    plain(b);
    const base = fightChance(ctx, b, a);
    b.traits = ['hothead'];
    expect(fightChance(ctx, b, a)).toBeCloseTo(base * 2);
    alone(w, a, b);
    b.room = a.room;
    const slight = data.social.interactions.find((d) => d.id === 'slight')!;
    const sure = withTrait('hothead', { fight: 1000 });
    interact({ ...ctx, data: sure }, a, b, slight);
    expect(ctx.events.some((e) => e.type === 'fight')).toBe(true);
  });

  it('a Peacemaker in the room can stop the punch', () => {
    const { w, ctx, cast } = aboard();
    const [a, b, p] = cast as [Contestant, Contestant, Contestant];
    for (const c of [a, b, p]) plain(c);
    alone(w, a, b, p);
    b.room = a.room;
    p.room = a.room;
    b.traits = ['hothead'];
    p.traits = ['peacemaker'];
    const t = data.traits.traits;
    const d = { ...data, traits: { ...data.traits, traits: { ...t, peacemaker: { ...t.peacemaker!, peacemaker: 1 }, hothead: { ...t.hothead!, fight: 1000 } } } };
    const insult = data.social.interactions.find((x) => x.id === 'insult')!;
    interact({ ...ctx, data: d }, a, b, insult);
    expect(ctx.events.some((e) => e.type === 'fight')).toBe(false);
    expect(ctx.events.some((e) => e.type === 'broke_up_fight' && e.actors[0] === p.id)).toBe(true);
  });

  it('a Drama queen breaks down sooner, and her breaks pay more', () => {
    const { ctx, cast } = aboard();
    const c = plain(cast[0]!);
    const lines = breakLines(ctx, 5);
    expect(breakLines(ctx, 5, 10).minor).toBeCloseTo(lines.minor + 10);
    c.mood = lines.minor + 5;
    expect(breakLevel(ctx, c)).toBeNull();
    c.traits = ['drama_queen'];
    expect(breakLevel(ctx, c)).toBe('minor');
  });

  it('a Show-off scores more for karaoke and loves being watched', () => {
    const { w, ctx, cast } = aboard();
    const [a, b, fan] = cast as [Contestant, Contestant, Contestant];
    for (const c of [a, b, fan]) plain(c);
    alone(w, a, b, fan);
    for (const c of [a, b, fan]) Object.assign(c, { room: 'lounge', asleep: false });
    b.traits = ['show_off'];
    const plainPts = (log(ctx, 'karaoke', [a.id], 'lounge').data!.awards as Record<string, number>)[a.id]!;
    w.show.today = {}; // no boredom between the two
    const showPts = (log(ctx, 'karaoke', [b.id], 'lounge').data!.awards as Record<string, number>)[b.id]!;
    expect(showPts).toBeCloseTo(plainPts * 1.5, 1);
    expect(b.thoughts.map((t) => t.id)).toContain('everyone_watching');
    expect(a.thoughts.map((t) => t.id)).not.toContain('everyone_watching');
  });

  it('a Grudge-holder never lets dislike fade; the Forgiving let it go twice as fast', () => {
    const { ctx, cast } = aboard();
    const [a, b] = cast as [Contestant, Contestant];
    plain(a);
    meet(ctx, a, b);
    const r = rel(a, b)!;
    r.label = 'none';
    r.affection = -50;
    fadeLedger(ctx, a);
    const plainFade = -50 - r.affection;
    a.traits = ['grudge_holder'];
    r.affection = -50;
    fadeLedger(ctx, a);
    expect(r.affection).toBe(-50);
    a.traits = ['forgiving'];
    fadeLedger(ctx, a);
    expect(-50 - r.affection).toBeCloseTo(plainFade * 2);
  });

  it('a Teetotaler never drinks, and a bender becomes moping', () => {
    const w = createWorld(data, 4);
    step(w, 3 * 1440);
    for (const c of w.contestants) c.traits = ['teetotaler'];
    const dry = new Set(w.contestants.map((c) => c.id)); // not newcomers
    const events = step(w, 2 * 1440);
    expect(events.filter((e) => e.type === 'drink' && e.actors.length === 1 && dry.has(e.actors[0]!))).toHaveLength(0);
    expect(events.some((e) => e.type === 'break' && e.data!.kind === 'drink_binge' && dry.has(e.actors[0]!))).toBe(false);
  });

  it('a sleepwalker gets up and wanders to another room', () => {
    const { w, ctx, cast } = aboard();
    const c = plain(cast[0]!, 'sleepwalks');
    alone(w, c);
    endActivity(ctx, c, 'interrupted');
    c.room = 'common';
    begin(ctx, c, { action: 'sleep', object: 'common:couch:1', room: 'common' });
    expect(c.asleep).toBe(true);
    sleepwalk({ ...ctx, data: withTrait('sleepwalks', { sleepwalk: { perHour: 1, minutes: 20 } }) }, c);
    expect(c.asleep).toBe(false);
    expect(c.activity?.action).toBe('sleepwalk');
    expect(c.activity?.room).not.toBe('common');
    expect(ctx.events.some((e) => e.type === 'sleepwalk')).toBe(true);
  });

  it('Sunny and Gloomy carry their mood from the moment they arrive', () => {
    const w = createWorld(data, 9);
    const events = step(w, 8 * 60);
    for (const c of w.contestants) {
      expect(c.thoughts.some((t) => t.id === 'sunny')).toBe(c.traits.includes('sunny'));
      expect(c.thoughts.some((t) => t.id === 'gloomy')).toBe(c.traits.includes('gloomy'));
    }
    const arrive = events.find((e) => e.type === 'arrive')!;
    expect(Array.isArray(arrive.data!.traits)).toBe(true);
  });
});

describe('fear, tuned down', () => {
  it('"trapped here" eases from −5 to −2 over the first week', () => {
    const { w, ctx, cast } = aboard();
    const c = plain(cast[0]!);
    c.arrivedAt = w.t;
    trappedHere(ctx, c);
    const tr = data.thoughts.trapped;
    expect(c.thoughts.find((t) => t.id === tr.thought)!.value).toBeCloseTo(tr.from);
    w.t += 3.5 * 1440;
    trappedHere(ctx, c);
    expect(c.thoughts.find((t) => t.id === tr.thought)!.value).toBeCloseTo((tr.from + tr.to) / 2);
    w.t += 30 * 1440;
    trappedHere(ctx, c);
    expect(c.thoughts.find((t) => t.id === tr.thought)!.value).toBeCloseTo(tr.to);
  });

  it('caps fear lower than other sources', () => {
    const { ctx, cast } = aboard();
    const c = plain(cast[0]!);
    const add = (id: string, value: number) => c.thoughts.push({ id, about: null, value, until: ctx.w.t + 600 });
    add('watched_execution', -15);
    add('watched_execution', -15);
    updateMood(ctx, c);
    expect(c.mood).toBeCloseTo(data.personality.mood.base - data.thoughts.caps.fear!);
  });

  it('every trait is wired: traitFx reads each one without error', () => {
    const { cast } = aboard();
    const c = cast[0]!;
    for (const id of Object.keys(data.traits.traits)) {
      c.traits = [id];
      expect(() => traitFx(data, c)).not.toThrow();
    }
  });
});

describe('trait data', () => {
  it('fails loudly on a trait that excludes one that does not exist', () => {
    const read = (name: string) => (name === 'traits' ? real(name).replace('excludes: [peacemaker]', 'excludes: [pacifist]') : real(name));
    expect(() => parseGameData(read)).toThrow(DataError);
    expect(() => parseGameData(read)).toThrow(/traits\.yaml: traits\.hothead\.excludes: no trait "pacifist"/);
  });

  it('fails loudly on a trait thought that does not exist', () => {
    const read = (name: string) => (name === 'traits' ? real(name).replace('thought: sunny', 'thought: beaming') : real(name));
    expect(() => parseGameData(read)).toThrow(/traits\.yaml: traits\.sunny\.thought: no thought "beaming"/);
  });
});
