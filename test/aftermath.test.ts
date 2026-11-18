// Murders and their aftermath (Nov 18): the killer's rush and dread, partner grief, keeping a
// believed killer at arm's length, killer news as the fastest gossip, and summoned confessionals.
import { describe, expect, it } from 'vitest';
import type { Ctx } from '../src/core/context.js';
import { confide, playbackMinute } from '../src/core/confessionals.js';
import { alarm, dread, dreadOf, ease } from '../src/core/guilt.js';
import { meet, relation } from '../src/core/ledger.js';
import { hear } from '../src/core/news.js';
import { endBreak, startBreak } from '../src/core/breaks.js';
import { grieve, kill } from '../src/core/show.js';
import { interact, interactionWeight, talkOdds, wariness } from '../src/core/social.js';
import { expireThoughts, think } from '../src/core/thoughts.js';
import { believe, findBodies, schedule, suspicion } from '../src/core/trials.js';
import type { Activity, Contestant } from '../src/core/types.js';
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
const def = (id: string) => data.social.interactions.find((d) => d.id === id)!;

describe("the killer's feelings", () => {
  it('a break that ends in a kill ends with the rush, bigger for the cruel, not catharsis', () => {
    const { ctx, cast } = aboard();
    const [cruel, kind, v] = cast as [Contestant, Contestant, Contestant];
    traits(cruel, { kind: 1 });
    traits(kind, { kind: 9 });
    for (const k of [cruel, kind]) {
      k.thoughts = [];
      k.breakdown = { kind: 'attack', level: 'extreme', source: 'person', target: v.id, since: ctx.w.t, follows: 0, next: 0, killed: v.id };
      endBreak(ctx, k);
      expect(has(k, data.breaks.catharsis)).toBeUndefined();
    }
    expect(has(cruel, data.trials.guilt.rush, v.id)!.value).toBeGreaterThan(has(kind, data.trials.guilt.rush, v.id)!.value * 3);
  });

  it('fears being caught: heavy if seen, light if not, easing with time, back when accused', () => {
    const { w, ctx, cast } = aboard();
    const [killer, victim, other] = cast as [Contestant, Contestant, Contestant];
    alone(w, killer, victim);
    introduce(ctx, cast);
    traits(killer, {});
    kill(ctx, victim, 'murder', killer.room, [], killer.id);
    const k = w.show.cases.find((x) => x.killer === killer.id)!;
    const d = data.trials.guilt.dread;
    expect(k.dread).toBe(d.unseen);
    dread(ctx, killer);
    const unseen = has(killer, d.thought)!.value;
    expect(unseen).toBeLessThan(0);
    // Three days without suspicion: half as sure.
    w.t += d.halfLifeDays * 1440;
    expect(dreadOf(ctx, k)).toBeCloseTo(d.unseen / 2);
    // Accused: as sure as can be.
    schedule(ctx, { id: victim.id, name: victim.name, killer: killer.id, feelings: k.feelings }, other, killer, [], 50, false);
    expect(dreadOf(ctx, k)).toBeCloseTo(d.accused);
    expect(has(killer, d.thought)!.value).toBeLessThan(unseen * 2);
    // Someone else in the dock takes the heat off.
    ease(ctx, k, d.otherAccused);
    expect(dreadOf(ctx, k)).toBeCloseTo(d.accused * d.otherAccused);
  });

  it('the brave fear it less', () => {
    const { w, ctx, cast } = aboard();
    const [brave, coward, v1, v2] = cast as [Contestant, Contestant, Contestant, Contestant];
    alone(w);
    introduce(ctx, cast);
    traits(brave, { brave: 9 });
    traits(coward, { brave: 1 });
    kill(ctx, v1, 'murder', 'garden', ['x'], brave.id);
    kill(ctx, v2, 'murder', 'garden', ['x'], coward.id);
    alarm(ctx, brave.id, 1);
    alarm(ctx, coward.id, 1);
    expect(has(coward, data.trials.guilt.dread.thought)!.value).toBeLessThan(has(brave, data.trials.guilt.dread.thought)!.value);
  });
});

describe('grief for a partner', () => {
  it('a partner grieves deeper than a friend, and their romance with the dead ends', () => {
    const { ctx, cast } = aboard();
    const [partner, friend, dead] = cast as [Contestant, Contestant, Contestant];
    introduce(ctx, cast);
    traits(partner, {});
    traits(friend, {});
    think(ctx, partner, 'lovin', dead.id);
    think(ctx, partner, 'kissed', dead.id);
    grieve(ctx, partner, dead.id, 60, false, 'exclusive');
    grieve(ctx, friend, dead.id, 60, false, 'none');
    const sp = data.rules.spacing;
    expect(has(partner, sp.partner.thought, dead.id)!.value).toBeLessThan(has(friend, sp.friend, dead.id)!.value);
    expect(has(partner, 'lovin', dead.id)).toBeUndefined();
    expect(has(partner, 'kissed', dead.id)).toBeUndefined();
  });

  it('a cold, disloyal partner still grieves, just less', () => {
    const { ctx, cast } = aboard();
    const [loyal, cold, dead] = cast as [Contestant, Contestant, Contestant];
    traits(loyal, { loyal: 9, kind: 7 });
    traits(cold, { loyal: 1, kind: 2 });
    grieve(ctx, loyal, dead.id, 60, false, 'dating');
    grieve(ctx, cold, dead.id, 60, false, 'dating');
    const t = data.rules.spacing.partner.thought;
    expect(has(cold, t, dead.id)!.value).toBeLessThan(0);
    expect(has(cold, t, dead.id)!.value).toBeGreaterThan(has(loyal, t, dead.id)!.value);
  });
});

describe('keeping a killer at arm’s length', () => {
  function setup() {
    const { w, ctx, cast } = aboard();
    const [killer, lover, bystander, victim] = cast as [Contestant, Contestant, Contestant, Contestant];
    alone(w, killer, lover, bystander);
    introduce(ctx, cast);
    for (const c of [killer, lover, bystander]) c.room = 'common';
    const feelings = { [lover.id]: { affection: 80, enemy: false }, [bystander.id]: { affection: 0, enemy: false } };
    return { w, ctx, killer, lover, bystander, victim, feelings };
  }

  it("someone who loved the victim never says yes to the killer's warmth, and never starts it", () => {
    const { ctx, killer, lover, victim, feelings } = setup();
    believe(ctx, killer, [lover.id], { id: victim.id, name: victim.name, feelings }, 'witnessed');
    expect(wariness(ctx, lover, killer)).toBe(1);
    expect(talkOdds(ctx, lover, killer)).toBe(0);
    expect(interactionWeight(ctx, lover, killer, def('deep_talk'))).toBe(0);
    relation(ctx, lover, killer).attraction = 10;
    relation(ctx, lover, killer).flirts = 3;
    for (let i = 0; i < 20; i++) interact(ctx, killer, lover, def('kiss'));
    expect(ctx.events.filter((e) => e.type === 'kiss').length).toBe(0);
    expect(ctx.events.filter((e) => e.type === data.trials.wary.snub).length).toBe(20);
  });

  it('a bystander is wary by how much they fear the killer, and can still insult them', () => {
    const { ctx, killer, bystander, victim, feelings } = setup();
    traits(bystander, {});
    believe(ctx, killer, [bystander.id], { id: victim.id, name: victim.name, feelings }, 'witnessed');
    const before = wariness(ctx, bystander, killer);
    expect(before).toBeGreaterThan(0);
    expect(before).toBeLessThan(1);
    relation(ctx, bystander, killer).fear += 40;
    expect(wariness(ctx, bystander, killer)).toBeGreaterThan(before);
    expect(interactionWeight(ctx, bystander, killer, def('insult'))).toBeGreaterThan(0);
  });

  it('a snub makes the killer surer they will be caught', () => {
    const { w, ctx, killer, lover, victim, feelings } = setup();
    kill(ctx, victim, 'murder', 'garden', [], killer.id);
    const k = w.show.cases.find((x) => x.killer === killer.id)!;
    believe(ctx, killer, [lover.id], { id: victim.id, name: victim.name, feelings }, 'witnessed');
    interact(ctx, killer, lover, def('chitchat'));
    expect(dreadOf(ctx, k)).toBeGreaterThanOrEqual(data.trials.guilt.dread.snubbed);
  });
});

describe('killer news', () => {
  it('believing someone is a killer is news, and hearing it is a softer belief', () => {
    const { w, ctx, cast } = aboard();
    const [killer, witness, listener, victim] = cast as [Contestant, Contestant, Contestant, Contestant];
    alone(w);
    introduce(ctx, cast);
    traits(listener, { loyal: 3 });
    believe(ctx, killer, [witness.id], { id: victim.id, name: victim.name, feelings: {} }, 'witnessed');
    const n = witness.news.find((x) => x.who === killer.id && x.what === data.news.killer.what)!;
    expect(n.victim).toBe(victim.id);
    const aff = relation(ctx, listener, killer).affection;
    expect(hear(ctx, listener, n, 'gossip', witness)).toBe(true);
    const r = relation(ctx, listener, killer);
    expect(r.killer).toBe(victim.name);
    expect(r.hearsay).toBe(true);
    expect(wariness(ctx, listener, killer)).toBeLessThan(wariness(ctx, witness, killer));
    expect(r.affection).toBeLessThan(aff);
    // Seeing it for themselves later still lands.
    const fear = r.fear;
    believe(ctx, killer, [listener.id], { id: victim.id, name: victim.name, feelings: {} }, 'witnessed');
    expect(r.hearsay).toBeUndefined();
    expect(r.fear).toBeGreaterThan(fear);
  });

  it("a loyal friend of the accused doesn't believe it", () => {
    const { w, ctx, cast } = aboard();
    const [killer, witness, friend, victim] = cast as [Contestant, Contestant, Contestant, Contestant];
    alone(w);
    introduce(ctx, cast);
    traits(friend, { loyal: 9 });
    relation(ctx, friend, killer).affection = 80;
    believe(ctx, killer, [witness.id], { id: victim.id, name: victim.name, feelings: {} }, 'witnessed');
    const n = witness.news.find((x) => x.what === data.news.killer.what)!;
    expect(hear(ctx, friend, n, 'gossip', witness)).toBe(false);
    expect(relation(ctx, friend, killer).killer).toBeUndefined();
  });
});

describe('summoned confessionals', () => {
  it('talk about the moment they were summoned for', () => {
    const { w, ctx, cast } = aboard();
    const [c, other, crush] = cast as [Contestant, Contestant, Contestant];
    alone(w, c);
    introduce(ctx, cast);
    relation(ctx, c, crush).attraction = 10; // a crush to talk about, but not what they were called in for
    for (let i = 0; i < 30; i++) {
      c.told = {};
      const a: Activity = { action: 'confess', object: null, room: 'confessional', phase: 'do', startedAt: w.t, arriveAt: w.t, minutes: 10, endAt: w.t, summoned: 'accusation', about: other.id };
      confide(ctx, c, a);
    }
    const said = ctx.events.filter((e) => e.type === 'confessional');
    expect(said.length).toBe(30);
    for (const e of said) expect(e.data!.about ?? [other.id]).toContain(other.id);
  });
});

describe('the fishbowl and the diary room', () => {
  it('an attack on a prisoner rages at them through the glass instead of walking into the cell', () => {
    const { w, ctx, cast } = aboard();
    const [attacker, prisoner] = cast as [Contestant, Contestant];
    alone(w, attacker, prisoner);
    introduce(ctx, cast);
    traits(attacker, { kind: 1, calm: 1 });
    attacker.room = 'garden';
    prisoner.room = 'fishbowl';
    prisoner.confined = { room: 'fishbowl', since: w.t, until: w.t + 1440 };
    startBreak(ctx, attacker, 'extreme', 'person', 'attack', prisoner.id);
    expect(attacker.breakdown!.kind).toBe(data.breaks.passion.glass);
    expect(attacker.activity!.room).toBe(ctx.st.room.get('fishbowl')!.glass);
  });

  it('a murder in the diary room is on tape: the killer knows, and it airs at dinner', () => {
    const { w, ctx, cast } = aboard();
    const [killer, victim] = cast as [Contestant, Contestant];
    alone(w);
    introduce(ctx, cast);
    kill(ctx, victim, 'murder', 'confessional', [], killer.id);
    expect(w.show.tapes[killer.id]).toMatchObject({ kind: 'murder', caught: true });
    expect(w.show.playback[0]!.who).toBe(killer.id);
    expect(w.show.cases.find((k) => k.killer === killer.id)!.dread).toBe(data.trials.guilt.dread.seen);
    // Whatever they say to the camera afterwards, the footage is what airs.
    confide(ctx, killer, { action: 'confess', object: null, room: 'confessional', phase: 'do', startedAt: w.t, arriveAt: w.t, minutes: 10, endAt: w.t });
    expect(w.show.tapes[killer.id]!.caught).toBe(true);
    w.t += ((19 * 60 + 30 - (w.t % 1440)) + 1440) % 1440;
    playbackMinute(ctx);
    expect(ctx.events.some((e) => e.type === 'murder_confession' && e.data!.how === 'footage')).toBe(true);
  });

  it('a body behind glass is found by whoever can see it, and a cellmate is the obvious suspect', () => {
    const { w, ctx, cast } = aboard();
    const [killer, victim, passerby] = cast as [Contestant, Contestant, Contestant];
    alone(w, killer, victim);
    introduce(ctx, cast);
    for (const c of [killer, victim]) {
      c.room = 'fishbowl';
      c.confined = { room: 'fishbowl', since: w.t, until: w.t + 1440 };
    }
    kill(ctx, victim, 'murder', 'fishbowl', [], killer.id);
    const body = w.show.bodies[0]!;
    expect(body.locked).toEqual([killer.id]);
    expect(suspicion(ctx, body, passerby, killer)).toBeGreaterThanOrEqual(data.trials.suspicion.locked);
    Object.assign(passerby, { room: ctx.st.room.get('fishbowl')!.glass, asleep: false, activity: { action: 'idle', object: null, room: 'common', phase: 'do', startedAt: w.t, arriveAt: w.t, minutes: 10, endAt: w.t + 10 } });
    findBodies(ctx);
    expect(ctx.events.some((e) => e.type === 'body_found' && e.actors[0] === passerby.id)).toBe(true);
  });
});

describe('yesterday carries into the morning', () => {
  it("kind words don't run out while asleep; grudges still fade", () => {
    const { w, ctx, cast } = aboard();
    const [a, b] = cast as [Contestant, Contestant];
    a.thoughts = [];
    think(ctx, a, 'kind_words', b.id);
    think(ctx, a, 'brushed_off', b.id);
    const kind = has(a, 'kind_words')!.until;
    const hurt = has(a, 'brushed_off')!.until;
    a.asleep = true;
    w.t += 10;
    expireThoughts(ctx, a, 10);
    expect(has(a, 'kind_words')!.until).toBe(kind + 10);
    expect(has(a, 'brushed_off')!.until).toBe(hurt);
    a.asleep = false;
    expireThoughts(ctx, a, 10);
    expect(has(a, 'kind_words')!.until).toBe(kind + 10);
  });
});
