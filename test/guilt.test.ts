import { describe, expect, it } from 'vitest';
import { TRIAL } from '../src/core/actions.js';
import { dayOf, type Ctx } from '../src/core/context.js';
import { blurt, confess, drunkConfession, guiltShare, haunt, remorse } from '../src/core/guilt.js';
import { meet, relation } from '../src/core/ledger.js';
import { kill } from '../src/core/show.js';
import { findBodies, holdTrials } from '../src/core/trials.js';
import type { Contestant } from '../src/core/types.js';
import { aboard, alone, data } from './helpers.js';

function introduce(ctx: Ctx, cast: Contestant[]): void {
  for (const a of cast) a.ledger = {};
  for (const a of cast) for (const b of cast) if (a !== b) meet(ctx, a, b);
}

const has = (c: Contestant, id: string, about?: string) => c.thoughts.find((x) => x.id === id && (about === undefined || x.about === about));
const traits = (c: Contestant, p: Partial<Contestant['personality']>) => {
  c.traits = [];
  Object.assign(c.personality, { kind: 5, honest: 5, calm: 5, loyal: 5, brave: 5, ...p });
};

describe('remorse at the kill', () => {
  it('depends on how they felt about the victim and on who they are', () => {
    const { ctx, cast } = aboard();
    const [k, friend, rival, hated] = cast as [Contestant, Contestant, Contestant, Contestant];
    traits(k, { kind: 8, honest: 8 });
    remorse(ctx, k, friend.id, 60);
    remorse(ctx, k, rival.id, -40);
    remorse(ctx, k, hated.id, -100);
    const f = has(k, 'killed_them', friend.id)!.value;
    const r = has(k, 'killed_them', rival.id)!.value;
    expect(f).toBeLessThan(r); // a friend hurts more than a rival
    expect(r).toBeLessThan(0);
    expect(has(k, 'killed_them', hated.id)).toBeUndefined(); // hated enough: nothing
    // A cruel liar feels far less over the same friend.
    const { ctx: c2, cast: cast2 } = aboard();
    const [k2, v2] = cast2 as [Contestant, Contestant];
    traits(k2, { kind: 1, honest: 1 });
    remorse(c2, k2, v2.id, 60);
    expect(has(k2, 'killed_them', v2.id)!.value).toBeGreaterThan(f * 0.25);
    expect(has(k2, 'killed_them', v2.id)!.value).toBeGreaterThan(f);
  });

  it('a killer grieves a friend they killed but is never shaken by it, and a cruel one gloats over a rival', () => {
    const { ctx, cast } = aboard();
    const [k, friend, rival, stranger] = cast as [Contestant, Contestant, Contestant, Contestant];
    traits(k, { kind: 2 });
    remorse(ctx, k, friend.id, 50);
    remorse(ctx, k, rival.id, -50);
    remorse(ctx, k, stranger.id, 0);
    expect(has(k, 'friend_died', friend.id)).toBeDefined();
    expect(has(k, 'rival_died', rival.id)).toBeDefined();
    expect(has(k, 'someone_died', stranger.id)).toBeUndefined();
  });

  it("nobody else's mourning touches the killer when the body is found", () => {
    const { w, ctx, cast } = aboard();
    const [killer, victim, finder] = cast as [Contestant, Contestant, Contestant];
    alone(w);
    introduce(ctx, cast);
    kill(ctx, victim, 'murder', 'spa', [], killer.id);
    remorse(ctx, killer, victim.id, 0);
    const before = killer.thoughts.length;
    Object.assign(finder, { room: 'spa', asleep: false });
    findBodies(ctx);
    expect(has(finder, 'someone_died', victim.id)).toBeDefined();
    expect(has(killer, 'someone_died', victim.id)).toBeUndefined();
    expect(killer.thoughts.length).toBeLessThanOrEqual(before + 1); // at most being accused
  });

  it('haunts them in the room where they did it, while the remorse lasts', () => {
    const { w, ctx, cast } = aboard();
    const [killer, victim] = cast as [Contestant, Contestant];
    alone(w, killer);
    traits(killer, { kind: 7, honest: 7 });
    kill(ctx, victim, 'murder', 'spa', [], killer.id);
    remorse(ctx, killer, victim.id, 20);
    Object.assign(killer, { room: 'spa', asleep: false });
    haunt(ctx, killer);
    expect(has(killer, 'haunted', victim.id)).toBeDefined();
    killer.room = 'cafe';
    haunt(ctx, killer);
    expect(has(killer, 'haunted')).toBeUndefined();
  });
});

describe('scapegoats and reopened murders', () => {
  /** Killer accuses an innocent; everyone at the trial; the room votes the innocent out. */
  function framed() {
    const { w, ctx, cast } = aboard();
    introduce(ctx, cast);
    const [killer, innocent, victim, witness, ...voters] = cast as [Contestant, Contestant, Contestant, Contestant, ...Contestant[]];
    alone(w, killer);
    traits(killer, { kind: 7, honest: 7 });
    kill(ctx, victim, 'murder', 'spa', [witness.id], killer.id);
    remorse(ctx, killer, victim.id, 0);
    traits(witness, { brave: 8 });
    // Swap the trial the witness started for the killer's frame-up, so the killer wins.
    const k = w.show.cases[0]!;
    w.show.trials = [{ day: dayOf(w.t), victim: victim.id, name: victim.name, killer: killer.id, accuser: killer.id, accused: innocent.id, witnesses: [], feelings: {} }];
    k.accusers = [killer.id];
    const present = [killer, innocent, witness, ...voters];
    for (const c of present) Object.assign(c, { room: 'common', asleep: false, confined: null, breakdown: null, activity: { action: TRIAL, object: null, room: 'common', phase: 'do', startedAt: w.t, arriveAt: w.t, minutes: null, endAt: w.t + 30 } });
    for (const v of [witness, ...voters]) relation(ctx, v, innocent).affection = -60;
    innocent.immunities = 0;
    return { w, ctx, killer, innocent, victim, witness };
  }

  it('an innocent spaced for their murder weighs on the killer, more if they accused them', () => {
    const { w, ctx, killer, innocent } = framed();
    holdTrials(ctx);
    expect(w.contestants.includes(innocent)).toBe(false);
    const sg = ctx.events.find((e) => e.type === 'scapegoat')!;
    expect(sg.data!.framed).toBe(true);
    const plain = data.thoughts.thoughts.scapegoat!.value;
    expect(has(killer, 'scapegoat', innocent.id)!.value).toBeLessThan(plain);
  });

  it('after a wrong verdict, someone who saw it accuses the killer again', () => {
    const { w, ctx, killer, witness } = framed();
    holdTrials(ctx);
    const again = ctx.events.find((e) => e.type === 'accusation' && e.data!.reopened);
    expect(again?.actors).toEqual([witness.id, killer.id]);
    expect(w.show.trials[0]!.reopened).toBe(true);
    expect(w.show.trials[0]!.witnesses).toContain(witness.id);
  });

  it('a murder dies with its killer', () => {
    const { w, ctx, killer } = framed();
    expect(w.show.cases.length).toBe(1);
    kill(ctx, killer, 'meter', 'common', []);
    expect(w.show.cases).toEqual([]);
  });
});

describe('confessions', () => {
  function setup() {
    const { w, ctx, cast } = aboard();
    introduce(ctx, cast);
    const [killer, victim, friend, other] = cast as [Contestant, Contestant, Contestant, Contestant];
    alone(w, killer);
    traits(killer, { kind: 8, honest: 8, calm: 3 });
    kill(ctx, victim, 'murder', 'spa', [], killer.id);
    w.show.bodies = []; // found and done with: nobody accused
    remorse(ctx, killer, victim.id, 40);
    return { w, ctx, killer, victim, friend, other };
  }

  it('the guiltier they feel, the readier they are to let it out', () => {
    const { ctx, killer } = setup();
    expect(guiltShare(ctx, killer)).toBeGreaterThan(0.5);
  });

  it('a confession makes believers and brings the murder back to trial', () => {
    const { w, ctx, killer, friend } = setup();
    traits(friend, { brave: 8 });
    Object.assign(friend, { room: killer.room, asleep: false });
    confess(ctx, killer, [friend], 'breakdown');
    expect(friend.ledger[killer.id]!.killer).toBeDefined();
    const t = w.show.trials[0]!;
    expect(t).toMatchObject({ accuser: friend.id, accused: killer.id, reopened: true });
    expect(t.witnesses).toContain(friend.id);
  });

  it('drunk, they confess to a friend; a loyal friend keeps the secret', () => {
    const { w, ctx, killer, friend, other } = setup();
    killer.intox = 90;
    relation(ctx, killer, friend).affection = 60;
    relation(ctx, friend, killer).affection = 60;
    traits(friend, { loyal: 9 });
    let tries = 0;
    while (!ctx.events.some((e) => e.type === 'murder_confession') && tries++ < 200) drunkConfession(ctx, killer, friend);
    const kept = ctx.events.find((e) => e.type === 'murder_confession')!;
    expect(kept.data!.kept).toBe(true);
    expect(has(friend, 'keeping_secret', killer.id)).toBeDefined();
    expect(friend.ledger[killer.id]!.killer).toBeUndefined();
    expect(drunkConfession(ctx, killer, friend)).toBe(false); // not twice to the same friend
    // A friend who isn't loyal believes it.
    relation(ctx, killer, other).affection = 60;
    traits(other, { loyal: 3 });
    tries = 0;
    while (!other.ledger[killer.id]?.killer && tries++ < 200) drunkConfession(ctx, killer, other);
    expect(other.ledger[killer.id]!.killer).toBe(w.show.cases[0]!.name);
  });

  it('a guilt break blurts it out to everyone in earshot', () => {
    const { ctx, killer, friend, other } = setup();
    for (const c of [friend, other]) Object.assign(c, { room: killer.room, asleep: false });
    blurt(ctx, killer);
    const e = ctx.events.find((x) => x.type === 'murder_confession')!;
    expect(e.data!.how).toBe('breakdown');
    expect(e.actors).toEqual(expect.arrayContaining([killer.id, friend.id, other.id]));
  });
});
