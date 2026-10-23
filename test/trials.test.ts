import { describe, expect, it } from 'vitest';
import { TRIAL } from '../src/core/actions.js';
import { dayOf } from '../src/core/context.js';
import { createWorld, step } from '../src/core/index.js';
import { meet, relation } from '../src/core/ledger.js';
import { kill } from '../src/core/show.js';
import { announceBodies, findBodies, holdTrials, suspicion, voteOf } from '../src/core/trials.js';
import type { Body, Contestant, Trial } from '../src/core/types.js';
import { aboard, alone, data } from './helpers.js';

/** Everyone meets everyone, so feelings start at zero both ways. */
function introduce(ctx: Parameters<typeof meet>[0], cast: Contestant[]): void {
  for (const a of cast) for (const b of cast) if (a !== b) meet(ctx, a, b);
}

describe('bodies', () => {
  it('a murder nobody saw leaves a body until someone walks in on it', () => {
    const { w, ctx, cast } = aboard();
    const [killer, victim, finder] = cast as [Contestant, Contestant, Contestant];
    alone(w);
    introduce(ctx, cast);
    relation(ctx, finder, victim).affection = 50; // a friend
    killer.room = 'spa';
    kill(ctx, victim, 'murder', 'spa', [], killer.id);
    expect(w.show.bodies.map((b) => b.id)).toEqual([victim.id]);
    // Nobody grieves yet: nobody knows.
    expect(finder.thoughts.some((x) => x.about === victim.id)).toBe(false);
    // The killer standing there doesn't count.
    Object.assign(killer, { asleep: false });
    findBodies(ctx);
    expect(w.show.bodies.length).toBe(1);
    Object.assign(finder, { room: 'spa', asleep: false });
    findBodies(ctx);
    expect(w.show.bodies.length).toBe(0);
    const found = ctx.events.find((e) => e.type === 'body_found')!;
    expect(found.actors).toEqual([finder.id]);
    expect(found.data!.victim).toBe(victim.id);
    expect(finder.thoughts.some((x) => x.id === 'found_body' && x.about === victim.id)).toBe(true);
    expect(finder.thoughts.some((x) => x.id === 'friend_died' && x.about === victim.id)).toBe(true);
  });

  it('the announcer declares an unfound body at the ceremony', () => {
    const { w, ctx, cast } = aboard();
    const [killer, victim] = cast as [Contestant, Contestant];
    alone(w);
    kill(ctx, victim, 'murder', 'spa', [], killer.id);
    expect(w.show.bodies.length).toBe(1);
    w.t = (dayOf(w.t) - 1) * 1440 + data.schedule.ceremony.at;
    for (const c of w.contestants) Object.assign(c, { room: 'garden', asleep: true });
    const events = step(w, data.schedule.ceremony.resolveAfter + 1);
    const found = events.find((e) => e.type === 'body_found')!;
    expect(found.data!.announced).toBe(true);
    expect(w.show.bodies.length).toBe(0);
  });
});

describe('suspicion and accusations', () => {
  const body = (over: Partial<Body>): Body => ({ id: 'dead', name: 'Dead', room: 'spa', t: 0, killer: 'k', witnesses: [], near: [], feelings: {}, ...over });

  it('is certain for a witness, and goes on feelings, enemies and being seen near otherwise', () => {
    const { ctx, cast } = aboard();
    const [i, j, k] = cast as [Contestant, Contestant, Contestant];
    introduce(ctx, cast);
    const s = data.trials.suspicion;
    expect(suspicion(ctx, body({ killer: j.id, witnesses: [i.id] }), i, j)).toBe(s.witnessed);
    expect(suspicion(ctx, body({ killer: j.id, witnesses: [i.id] }), i, k)).toBe(0);
    expect(suspicion(ctx, body({ killer: k.id }), i, j)).toBe(0);
    relation(ctx, i, j).affection = -50;
    relation(ctx, i, j).fear = 40;
    expect(suspicion(ctx, body({ killer: k.id }), i, j)).toBeCloseTo(s.dislike * 50 + s.fear * 40);
    const full = body({ killer: k.id, near: [i.id, j.id], feelings: { [j.id]: { affection: -40, enemy: true } } });
    expect(suspicion(ctx, full, i, j)).toBeCloseTo(s.dislike * 50 + s.fear * 40 + s.enemy + s.near);
    // Only seen near if the suspector was there to see it.
    expect(suspicion(ctx, body({ killer: k.id, near: [j.id] }), i, j)).toBeCloseTo(s.dislike * 50 + s.fear * 40);
  });

  it('a witnessed murder is accused at once and tried the next morning', () => {
    const { w, ctx, cast } = aboard();
    const [killer, victim, witness] = cast as [Contestant, Contestant, Contestant];
    alone(w);
    introduce(ctx, cast);
    witness.personality.brave = 8;
    kill(ctx, victim, 'murder', 'spa', [witness.id], killer.id);
    const acc = ctx.events.find((e) => e.type === 'accusation')!;
    expect(acc.actors).toEqual([witness.id, killer.id]);
    expect(acc.data!.right).toBe(true);
    expect(w.show.trials[0]).toMatchObject({ accuser: witness.id, accused: killer.id, day: dayOf(w.t) + 1 });
    expect(killer.thoughts.some((x) => x.id === 'accused' && x.about === witness.id)).toBe(true);
  });

  it('nobody accuses without enough suspicion and nerve', () => {
    const { w, ctx, cast } = aboard();
    const [killer, victim] = cast as [Contestant, Contestant];
    alone(w);
    introduce(ctx, cast);
    kill(ctx, victim, 'murder', 'spa', [], killer.id); // nobody saw, nobody was near, nobody minds anyone
    announceBodies(ctx);
    expect(ctx.events.some((e) => e.type === 'no_accusation')).toBe(true);
    expect(w.show.trials).toEqual([]);
  });
});

describe('trials', () => {
  function setup() {
    const { w, ctx, cast } = aboard();
    introduce(ctx, cast);
    const [accuser, accused, ...voters] = cast as [Contestant, Contestant, ...Contestant[]];
    for (const c of cast) Object.assign(c, { room: 'common', asleep: false, confined: null, breakdown: null, activity: { action: TRIAL, object: null, room: 'common', phase: 'do', startedAt: w.t, arriveAt: w.t, minutes: null, endAt: w.t + 30 } });
    const trial: Trial = { day: dayOf(w.t), victim: 'gone', name: 'Gone', killer: accused.id, accuser: accuser.id, accused: accused.id, witnesses: [], feelings: {} };
    w.show.trials = [trial];
    return { w, ctx, cast, accuser, accused, voters, trial };
  }

  it('witnesses vote the truth; everyone else condemns who they like less, nudged by fear', () => {
    const { ctx, accuser, accused, voters, trial } = setup();
    const [v] = voters as [Contestant];
    relation(ctx, v, accused).affection = 30;
    relation(ctx, v, accuser).affection = 10;
    expect(voteOf(ctx, trial, v, accuser, accused)).toBe(accuser);
    relation(ctx, v, accuser).fear = 0;
    relation(ctx, v, accused).fear = 60; // 30 − 30 = 0 < 10
    expect(voteOf(ctx, trial, v, accuser, accused)).toBe(accused);
    relation(ctx, v, accused).fear = 0;
    expect(voteOf(ctx, { ...trial, witnesses: [v.id] }, v, accuser, accused)).toBe(accused); // they saw it
  });

  it('an eyewitness accuser is believed as far as the voter trusts them', () => {
    const { ctx, accuser, accused, voters, trial } = setup();
    const [v] = voters as [Contestant];
    const seen = { ...trial, witnesses: [accuser.id] };
    relation(ctx, v, accused).affection = 30;
    relation(ctx, v, accuser).affection = 5; // 30 − 20 = 10 > 5: still sides with the accused
    expect(voteOf(ctx, seen, v, accuser, accused)).toBe(accuser);
    relation(ctx, v, accuser).trust = 40; // 30 − 20 − 20 = −10 < 5
    expect(voteOf(ctx, seen, v, accuser, accused)).toBe(accused);
    expect(voteOf(ctx, trial, v, accuser, accused)).toBe(accuser); // no eyewitness, no testimony
  });

  it('spaces the loser, pays the survivor and leaves the accuser and accused out of the vote', () => {
    const { w, ctx, accuser, accused, voters } = setup();
    for (const v of voters) relation(ctx, v, accused).affection = -40;
    holdTrials(ctx);
    const trial = ctx.events.find((e) => e.type === 'trial')!;
    expect(trial.data!.loser).toBe(accused.id);
    expect(trial.data!.right).toBe(true);
    expect(Object.keys(trial.data!.votes as object).sort()).toEqual(voters.map((v) => v.id).sort());
    expect(trial.data!.awards).toEqual({ [accuser.id]: 15 });
    expect(w.contestants.includes(accused)).toBe(false);
    expect(ctx.events.find((e) => e.type === 'death')!.data!.cause).toBe('trial');
    expect(w.show.trials).toEqual([]);
  });

  it('breaks a tied vote on the meter: the lower one loses', () => {
    const { w, ctx, cast, accuser, accused, voters } = setup();
    // Two voters each way.
    const [a, b, c, d, ...rest] = voters as [Contestant, Contestant, Contestant, Contestant, ...Contestant[]];
    for (const x of rest) Object.assign(x, { room: 'garden', activity: null, breakdown: { kind: 'mope', level: 'minor', source: 'fear', target: null, since: 0, follows: 0, next: 0 } });
    for (const v of [a, b]) relation(ctx, v, accused).affection = -40;
    for (const v of [c, d]) relation(ctx, v, accuser).affection = -40;
    accuser.meter = 10;
    accused.meter = 50;
    holdTrials(ctx);
    const trial = ctx.events.find((e) => e.type === 'trial')!;
    expect(trial.data!.against).toBe(2);
    expect(trial.data!.loser).toBe(accuser.id); // the killer walks free
    expect(trial.data!.right).toBe(false);
    expect(w.contestants.includes(accuser)).toBe(false);
    expect(cast.length).toBeGreaterThan(0);
  });

  it('is called off if the accuser or accused is already dead', () => {
    const { w, ctx, accused } = setup();
    w.contestants.splice(w.contestants.indexOf(accused), 1);
    holdTrials(ctx);
    expect(ctx.events.some((e) => e.type === 'trial_cancelled')).toBe(true);
    expect(ctx.events.some((e) => e.type === 'trial')).toBe(false);
  });

  it('is held at 07:45, after the morning arrivals', () => {
    const { w, ctx, cast } = aboard();
    const [killer, victim, witness] = cast as [Contestant, Contestant, Contestant];
    alone(w);
    introduce(ctx, cast);
    witness.personality.brave = 10;
    kill(ctx, victim, 'murder', 'spa', [witness.id], killer.id);
    w.t = dayOf(w.t) * 1440 + data.schedule.wakeChime.at; // tomorrow's wake chime
    for (const c of w.contestants) Object.assign(c, { asleep: false, activity: null, room: 'common' });
    const events = step(w, 61);
    const arrive = events.find((e) => e.type === 'arrive')!;
    const trial = events.find((e) => e.type === 'trial' || e.type === 'trial_cancelled')!;
    expect(trial).toBeDefined();
    expect(arrive.t).toBeLessThan(trial.t);
    expect(trial.t % 1440).toBe(data.schedule.trials.at + data.schedule.trials.resolveAfter);
    // The newcomer voted.
    if (trial.type === 'trial') expect(Object.keys(trial.data!.votes as object)).toContain(arrive.actors[0]);
  });
});

describe('casting', () => {
  it('refills empty slots every morning, and sends a whole new batch if everyone died', () => {
    const w = createWorld(data, 4);
    step(w, 8 * 60);
    expect(w.contestants.length).toBe(7);
    const first = new Set(w.contestants.map((c) => c.id));
    w.contestants = [];
    const events = step(w, 1440);
    const arrivals = events.filter((e) => e.type === 'arrive');
    expect(arrivals.length).toBe(7);
    expect(w.contestants.length).toBe(7);
    for (const c of w.contestants) expect(first.has(c.id)).toBe(false);
    expect(new Set(w.contestants.map((c) => c.name)).size).toBe(7);
  });
});
