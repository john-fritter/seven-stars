// Fixes from the season logs (Oct 23): the ceremony isn't slept through, romance starts with a
// kiss, the cage doesn't rerun a feud, names aren't reused, and a killer who walks is remembered.
import { describe, expect, it } from 'vitest';
import { begin, CEREMONY, endActivity } from '../src/core/actions.js';
import { fadeLedger, meet, rel, relation } from '../src/core/ledger.js';
import { cagePair } from '../src/core/events.js';
import { cast } from '../src/core/generator.js';
import { company } from '../src/core/people.js';
import { createRng } from '../src/core/rng.js';
import { moveAllowed } from '../src/core/romance.js';
import { believe, holdTrials } from '../src/core/trials.js';
import { TRIAL } from '../src/core/actions.js';
import { dayOf } from '../src/core/context.js';
import { createWorld, step } from '../src/core/index.js';
import type { Contestant } from '../src/core/types.js';
import { aboard, alone, data } from './helpers.js';

const move = (id: string) => data.social.interactions.find((d) => d.id === id)!;

describe('romance starts with a kiss', () => {
  it('no proposition before a kiss', () => {
    const { w, ctx, cast } = aboard();
    const [a, b] = cast as [Contestant, Contestant];
    alone(w, a, b);
    meet(ctx, a, b);
    for (const c of [a, b]) Object.assign(c, { room: 'spa', activity: null });
    expect(moveAllowed(ctx, a, b, move('proposition'))).toBe(false);
    rel(a, b)!.kisses = data.romance.proposition.kissesFirst;
    expect(moveAllowed(ctx, a, b, move('proposition'))).toBe(true);
  });

  it('getting into bed with someone never kissed is a goodnight kiss, not lovin\'', () => {
    const { w, ctx, cast } = aboard();
    step(w, 1440 + 23 * 60 - w.t);
    const [a, b] = cast as [Contestant, Contestant];
    a.rank = 1;
    a.bed = data.ranks.ranks['1'].bed;
    alone(w, a, b);
    meet(ctx, a, b);
    for (const [x, y] of [[a, b], [b, a]] as const) {
      Object.assign(rel(x, y)!, { attraction: 10, affection: 100 });
      endActivity(ctx, x, 'interrupted');
      Object.assign(x, { room: 'suite', intox: 60, traits: ['hoards'], personality: { ...x.personality, kind: 10, loyal: 5 } });
    }
    b.guest = { room: 'suite', host: a.id, since: w.t };
    begin(ctx, b, { action: 'sleep', object: a.bed, room: 'suite' });
    begin(ctx, a, { action: 'sleep', object: a.bed, room: 'suite' });
    expect(ctx.events.some((e) => e.type === 'lovin')).toBe(false);
    expect(ctx.events.some((e) => e.type === 'kiss' || e.type === 'kiss_rebuff')).toBe(true);
  });
});

describe('the ceremony', () => {
  it('nobody invites or propositions anyone in the middle of it', () => {
    const { w, ctx, cast } = aboard();
    step(w, 21 * 60 + 10 - w.t);
    const [a, b] = cast as [Contestant, Contestant];
    meet(ctx, a, b);
    for (const [x, y] of [[a, b], [b, a]] as const) Object.assign(rel(x, y)!, { attraction: 10, affection: 100, kisses: 1 });
    a.bed = data.ranks.ranks['1'].bed;
    for (const c of [a, b]) c.activity = { action: CEREMONY, object: null, room: 'common', phase: 'do', startedAt: w.t, arriveAt: w.t, minutes: null, endAt: w.t + 20 };
    expect(moveAllowed(ctx, a, b, move('invite'))).toBe(false);
    b.activity = null;
    expect(moveAllowed(ctx, a, b, move('invite'))).toBe(false);
    a.activity = null;
    w.t += 120; // after the ceremony, getting on for bedtime
    expect(moveAllowed(ctx, a, b, move('invite'))).toBe(true);
  });
});

describe('the cage', () => {
  it('a pair who already fought there makes way for a milder feud', () => {
    const { ctx, cast } = aboard();
    const [a, b, c, d] = cast as [Contestant, Contestant, Contestant, Contestant];
    const here = [a, b, c, d];
    for (const x of here) for (const y of here) if (x !== y) meet(ctx, x, y);
    for (const x of here) for (const y of here) if (x !== y) relation(ctx, x, y).affection = 0;
    relation(ctx, a, b).affection = relation(ctx, b, a).affection = -30;
    relation(ctx, c, d).affection = relation(ctx, d, c).affection = -10;
    ctx.w.show.event = { format: 'cage_match', actors: [], sudden: false, prize: false, day: 1, room: 'cage' };
    expect(cagePair(ctx, here).map((x) => x.id).sort()).toEqual([a.id, b.id].sort());
    ctx.w.show.cage[[a.id, b.id].sort().join('|')] = 1; // −60 + rematch
    expect(cagePair(ctx, here).map((x) => x.id).sort()).toEqual([c.id, d.id].sort());
  });
});

describe('casting', () => {
  it('doesn\'t reuse a name from earlier in the season until the list runs out', () => {
    const rng = createRng(3);
    const names = data.generator.names;
    for (let i = 0; i < 20; i++) expect(cast(data, rng, [], `c${i}`, 0, names.slice(1)).name).toBe(names[0]);
    expect(names).toContain(cast(data, rng, [], 'cx', 0, names).name);
  });

  it('a season has no repeated names', () => {
    const w = createWorld(data, 10);
    const seen: string[] = [];
    for (const e of step(w, 20 * 1440)) if (e.type === 'arrive') seen.push(e.data!.name as string);
    expect(new Set(seen).size).toBe(seen.length);
  });
});

describe('a killer who walks', () => {
  function trial() {
    const { w, ctx, cast } = aboard();
    for (const a of cast) for (const b of cast) if (a !== b) meet(ctx, a, b);
    const [accuser, accused, ...voters] = cast as [Contestant, Contestant, ...Contestant[]];
    for (const c of cast) Object.assign(c, { room: 'common', asleep: false, confined: null, breakdown: null, activity: { action: TRIAL, object: null, room: 'common', phase: 'do', startedAt: w.t, arriveAt: w.t, minutes: null, endAt: w.t + 30 } });
    w.show.trials = [{ day: dayOf(w.t), victim: 'gone', name: 'Gone', killer: accused.id, accuser: accuser.id, accused: accused.id, witnesses: [], feelings: { [voters[0]!.id]: { affection: 50, enemy: false } } }];
    return { w, ctx, accuser, accused, voters };
  }

  it('is remembered by everyone who voted to space them, and the accuser', () => {
    const { ctx, accuser, accused, voters } = trial();
    for (const v of voters) relation(ctx, v, accused).affection = -10;
    accused.immunities = 1;
    holdTrials(ctx);
    expect(ctx.events.some((e) => e.type === 'immunity_spent')).toBe(true);
    const known = ctx.events.find((e) => e.type === 'killer_known')!;
    expect(known.actors[0]).toBe(accused.id);
    expect(known.actors.slice(1).sort()).toEqual([accuser.id, ...voters.map((v) => v.id)].sort());
    const m = data.trials.memory;
    const [friend, other] = voters as [Contestant, Contestant];
    expect(rel(other, accused)!.affection).toBe(Math.min(-10 + m.affection, m.floor));
    expect(rel(friend, accused)!.affection).toBe(-10 + m.affection + m.friend); // the victim's friend
    expect(rel(other, accused)!.killer).toBe('Gone');
    expect(other.thoughts.some((t) => t.id === m.thought && t.about === accused.id)).toBe(true);
  });

  it('stays a rival: the dislike fades no further than the floor, and their company weighs', () => {
    const { ctx, accused, voters } = trial();
    const [v] = voters as [Contestant];
    believe(ctx, accused, [v.id], { id: 'gone', name: 'Gone', feelings: {} }, 'witnessed');
    for (let d = 0; d < 60; d++) fadeLedger(ctx, v);
    expect(rel(v, accused)!.affection).toBeCloseTo(data.trials.memory.floor);
    company(ctx, v);
    expect(v.thoughts.some((t) => t.id === data.trials.memory.near && t.about === accused.id)).toBe(true);
    // Believing it once is enough: no second hit.
    const before = rel(v, accused)!.affection;
    believe(ctx, accused, [v.id], { id: 'gone2', name: 'Gone again', feelings: {} }, 'witnessed');
    expect(rel(v, accused)!.affection).toBe(before);
  });
});
