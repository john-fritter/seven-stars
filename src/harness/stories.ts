// Story sampling: reading the event log the way a viewer would. `sim stories` counts the things
// that make or break a season (how people die, what the ceremony reads out, how romances start,
// cage reruns, what happens after a murder), and `sim season` prints one season as a day-by-day
// log with names, for reading. Repeat both after any change that touches the show.
import type { GameData } from '../data/schema.js';
import { createWorld, MINUTES_PER_DAY, step, type SimEvent } from '../core/index.js';

/** Raw counts for one season. Plain data so workers can send it back. */
export interface StorySeed {
  seed: number;
  days: number;
  n: Record<string, number>; // counters, summed across seeds
  sneaks: Record<string, number>; // above-rank entries by "room action"
  skipped: Record<string, number>; // skipped-ceremony infractions by what they were doing
  sentenceKinds: Record<string, number>; // sentences by their infractions
  deathCauses: Record<string, number>;
  breakKinds: Record<string, number>;
  diary: Record<string, number>; // confessionals by what was said
  topSinger: number; // the season's busiest karaoke singer, their performances
  karaoke: number;
}

const HOSTILE = new Set(['insult', 'slight', 'glass_mock']);
const ROMANCE = new Set(['flirt', 'kiss', 'kiss_rebuff', 'lovin', 'proposition', 'turned_down', 'invite', 'exclusive', 'exclusive_refused']);
const JEALOUS_WINDOW = 2 * MINUTES_PER_DAY;
const pairKey = (a: string, b: string) => (a < b ? `${a}|${b}` : `${b}|${a}`);

function add(m: Record<string, number>, k: string, v = 1): void {
  m[k] = (m[k] ?? 0) + v;
}

/** Runs one season and counts what a viewer would notice. */
export function storySeed(data: GameData, seed: number, days: number): StorySeed {
  const s: StorySeed = { seed, days, n: {}, sneaks: {}, skipped: {}, sentenceKinds: {}, deathCauses: {}, breakKinds: {}, diary: {}, topSinger: 0, karaoke: 0 };
  const n = s.n;
  const world = createWorld(data, seed);
  const kissed = new Set<string>();
  const flirted = new Set<string>();
  const cagePairs = new Map<string, number>();
  const names = new Map<string, number>();
  const singers = new Map<string, number>();
  const sentenced = new Map<string, string[]>(); // tonight's sentences, by contestant
  const killers = new Map<string, number>(); // living killers -> when the murder happened
  const known = new Set<string>(); // killers someone believes did it
  let booked = false;
  const confronted = new Map<string, number>(); // pair -> when one last confronted the other
  const trained = new Set<string>(); // who trained for today's match
  // Jealousy (and betrayal) in the last two days: did the jealous one turn on the rival, or go after the partner?
  const jealousy: { a: string; b: string; c: string; t: number; rival: boolean; back: boolean; won: boolean }[] = [];
  const breakers = new Map<string, number>();
  for (let d = 0; d < days; d++) {
    const events: SimEvent[] = step(world, MINUTES_PER_DAY);
    const today = new Set<string>();
    for (const e of events) {
      const data = e.data ?? {};
      const [a, b] = e.actors;
      while (jealousy.length && jealousy[0]!.t < e.t - JEALOUS_WINDOW) jealousy.shift();
      for (const j of jealousy) {
        if (!j.won && (e.type === 'kiss' || e.type === 'lovin') && ((a === j.a && b === j.b) || (a === j.b && b === j.a))) {
          j.won = true;
          add(n, 'jealousWon');
        }
        if (a !== j.a) continue;
        const at = b === j.c ? 'rival' : b === j.b ? 'partner' : null;
        if (at === 'rival' && !j.rival && (HOSTILE.has(e.type) || e.type === 'fight' || e.type === 'cage_match' || e.type === 'break')) {
          j.rival = true;
          add(n, 'jealousRival');
          if (e.type === 'fight' || e.type === 'cage_match' || (e.type === 'break' && data.level === 'extreme')) add(n, 'jealousRivalViolent');
        }
        if (at === 'partner' && !j.back && ROMANCE.has(e.type)) {
          j.back = true;
          add(n, 'jealousBack');
        }
      }
      switch (e.type) {
        case 'arrive': {
          const name = data.name as string;
          names.set(name, (names.get(name) ?? 0) + 1);
          n.arrivals = (n.arrivals ?? 0) + 1;
          break;
        }
        case 'infraction':
          if (data.rule === 'above_rank') add(s.sneaks, `${e.room} ${data.doing}`);
          if (data.rule === 'skipped_ceremony') {
            add(n, 'skippedCeremony');
            if (data.asleep) add(n, 'skippedAsleep');
            add(s.skipped, String(data.doing));
          }
          break;
        case 'sentence': {
          const rules = data.infractions as string[];
          add(n, 'sentences');
          add(s.sentenceKinds, [...rules].sort().join('+'));
          sentenced.set(a!, rules);
          break;
        }
        case 'ceremony':
          add(n, 'ceremonies');
          sentenced.clear();
          break;
        case 'death': {
          const cause = data.cause as string;
          add(n, 'deaths');
          add(s.deathCauses, cause);
          today.add('death');
          const rules = sentenced.get(a!);
          if (cause === 'meter' && rules) {
            add(n, 'meterDeathsSentenced');
            if (rules.every((r) => r === 'above_rank' || r === 'skipped_ceremony' || r === 'skipped_event')) add(n, 'meterDeathsPetty');
            if (rules.includes('above_rank')) add(n, 'meterDeathsSneaking');
          }
          if (killers.has(a!)) {
            add(n, 'killerDays', (e.t - killers.get(a!)!) / MINUTES_PER_DAY);
            killers.delete(a!);
          }
          break;
        }
        case 'flirt':
          flirted.add(pairKey(a!, b!));
          break;
        case 'kiss': {
          const k = pairKey(a!, b!);
          if (!kissed.has(k)) {
            add(n, 'firstKisses');
            today.add('first kiss');
          }
          kissed.add(k);
          add(n, 'kisses');
          break;
        }
        case 'jealous':
          add(n, 'jealous');
          jealousy.push({ a: a!, b: b!, c: e.actors[2]!, t: e.t, rival: false, back: false, won: false });
          break;
        case 'betrayal':
          add(n, 'betrayals');
          today.add('caught');
          break;
        case 'lovin':
          add(n, 'hookups');
          if (data.first) {
            add(n, 'firstHookups');
            if (!kissed.has(pairKey(a!, b!))) add(n, 'firstHookupsUnkissed');
            if (!flirted.has(pairKey(a!, b!))) add(n, 'firstHookupsUnflirted');
          }
          break;
        case 'event_start':
          booked = e.actors.length > 0;
          break;
        case 'cage_match': {
          const k = pairKey(a!, b!);
          add(n, 'cageMatches');
          if (booked) add(n, 'cageBooked');
          if (cagePairs.has(k)) add(n, 'cageRepeats');
          cagePairs.set(k, (cagePairs.get(k) ?? 0) + 1);
          break;
        }
        case 'fight':
          if (e.room === 'cage') break;
          add(n, 'brawls');
          today.add('brawl');
          if (killers.has(b!) || killers.has(a!)) add(n, 'killerFights');
          break;
        case 'break':
          add(n, 'breaks');
          add(s.breakKinds, String(data.kind));
          breakers.set(a!, (breakers.get(a!) ?? 0) + 1);
          if (data.level === 'extreme') add(n, 'extremeBreaks');
          if (data.kind === 'catatonic') add(n, 'catatonic');
          if (b && known.has(b)) add(n, 'killerTargeted');
          break;
        case 'murder':
          add(n, 'murders');
          today.add('murder');
          killers.set(a!, e.t);
          break;
        case 'killer_known':
          add(n, 'killerKnown');
          add(n, 'killerBelievers', e.actors.length - 1);
          known.add(a!);
          break;
        case 'trial':
          add(n, 'trials');
          if (!data.right) add(n, 'wrongVerdicts');
          break;
        case 'immunity_spent':
          if (data.cause === 'trial') add(n, 'trialImmunities');
          break;
        case 'blab':
          add(n, 'blabs');
          if (data.venting) add(n, 'blabsVenting');
          if (data.juicy) add(n, 'blabsJuicy');
          break;
        case 'confession':
          add(n, 'confessions');
          break;
        case 'confessional':
          add(n, 'confessionals');
          add(s.diary, String(data.kind));
          if (data.summoned) add(n, 'confessionalsCalled');
          break;
        case 'playback':
          add(n, 'playbacks');
          add(n, 'playbackHeard', (data.heard as string[]).length);
          break;
        case 'scene':
          add(n, 'scenes');
          add(n, 'sceneHeard', (data.heard as string[]).length);
          break;
        case 'puke':
          add(n, 'pukes');
          break;
        case 'passed_out':
          add(n, 'passedOut');
          break;
        case 'hammered':
          add(n, 'hammered');
          break;
        case 'drink':
          add(n, 'drinks');
          if (e.t % MINUTES_PER_DAY < 12 * 60) add(n, 'drinksMorning');
          break;
        case 'karaoke':
          singers.set(a!, (singers.get(a!) ?? 0) + 1);
          s.karaoke++;
          break;
        case 'meal_empty':
          add(n, data.food === 'leftovers' ? 'emptyLast' : 'emptyOther');
          break;
        case 'meal':
          add(n, 'meals');
          if (data.food === 'leftovers') add(n, 'mealsLast');
          if (data.portion !== undefined) add(n, 'mealsShort');
          break;
        case 'seconds':
          add(n, 'seconds');
          if (data.greedy) add(n, 'secondsGreedy');
          break;
        case 'sold_out':
          add(n, 'soldOut');
          add(n, 'soldOutAt', e.t % MINUTES_PER_DAY);
          break;
        case 'swipe_snack':
          add(n, 'swipes');
          if (data.noticed) add(n, 'swipesNoticed');
          break;
        case 'share_snack':
          add(n, 'shares');
          break;
        case 'kept_up':
          add(n, 'keptUp');
          break;
        // Wants and things to do (wants.ts, cards.ts).
        case 'confront':
          add(n, 'confronts');
          if (data.with === 'insult') add(n, 'confrontInsults');
          confronted.set(pairKey(a!, b!), e.t);
          break;
        case 'talk':
          if (data.for === 'friend') add(n, 'comforting');
          if (data.for === 'partner') add(n, 'partnerTalks');
          break;
        case 'cards':
          add(n, 'hands');
          if (data.pot) add(n, 'handsForSnacks');
          break;
        case 'deal_in':
          add(n, 'dealIns');
          break;
        case 'caught_cheating':
          add(n, 'cheatsCaught');
          break;
        case 'bill':
          add(n, 'bills');
          break;
        case 'training':
          add(n, 'montages');
          trained.add(a!);
          break;
        case 'got_ready':
          add(n, 'readied');
          break;
      }
      // A confrontation that comes to blows within the half hour.
      if (e.type === 'fight' && e.room !== 'cage' && (confronted.get(pairKey(a!, b!)) ?? -Infinity) > e.t - 30) add(n, 'confrontFights');
      if (e.type === 'cage_match' && !data.forfeit) {
        const w = trained.has(data.winner as string);
        const l = trained.has(data.loser as string);
        if (w !== l) add(n, w ? 'trainedWon' : 'trainedLost');
      }
      if (e.type === 'cage_match' || e.type === 'dance_off' || e.type === 'event_cancelled') trained.clear();
      if (HOSTILE.has(e.type) && known.has(b!)) add(n, 'killerSnubbed');
      if (e.type === 'cage_match' && (known.has(a!) || known.has(b!))) add(n, 'killerCaged');
    }
    for (const id of killers.keys()) if (known.has(id)) add(n, 'knownKillerDays');
    if (today.has('death')) add(n, 'daysWithDeath');
    if (today.has('first kiss')) add(n, 'daysWithFirstKiss');
    if (today.has('caught')) add(n, 'daysWithCaught');
    if (today.has('brawl')) add(n, 'daysWithBrawl');
  }
  for (const id of killers.keys()) add(n, 'killerDays', (world.t - killers.get(id)!) / MINUTES_PER_DAY);
  for (const v of names.values()) if (v > 1) add(n, 'repeatNames', v - 1);
  const most = [...breakers.values()].sort((x, y) => y - x);
  add(n, 'breaksTop3', most.slice(0, 3).reduce((x, y) => x + y, 0));
  s.topSinger = Math.max(0, ...singers.values());
  return s;
}

function sum(seeds: StorySeed[], k: string): number {
  return seeds.reduce((t, s) => t + (s.n[k] ?? 0), 0);
}

function merge(seeds: StorySeed[], f: (s: StorySeed) => Record<string, number>): [string, number][] {
  const m: Record<string, number> = {};
  for (const s of seeds) for (const [k, v] of Object.entries(f(s))) add(m, k, v);
  return Object.entries(m).sort((a, b) => b[1] - a[1]);
}

const pct = (x: number, of: number) => (of ? `${Math.round((x / of) * 100)}%` : '—');
const per = (x: number, of: number, d = 2) => (of ? (x / of).toFixed(d) : '—');

/** The story-health summary, as lines of text. */
export function storyReport(seeds: StorySeed[]): string[] {
  const days = seeds.reduce((t, s) => t + s.days, 0);
  const n = (k: string) => sum(seeds, k);
  const out: string[] = [];
  const line = (s = '') => out.push(s);
  const top = (rows: [string, number][], of: number, k = 6) => rows.slice(0, k).forEach(([key, v]) => line(`    ${key.padEnd(30)} ${String(v).padStart(5)}  ${pct(v, of)}`));

  line(`${seeds.length} seasons × ${seeds[0]?.days ?? 0} days (${days} station days)`);
  line();
  line('How people die');
  const deaths = n('deaths');
  line(`  ${deaths} deaths, ${per(deaths * 7, days)} a week`);
  top(merge(seeds, (s) => s.deathCauses), deaths);
  line(`  meter deaths the night they were sentenced: ${n('meterDeathsSentenced')} (${pct(n('meterDeathsSentenced'), deaths)} of all deaths)`);
  line(`    sentenced only for sneaking or skipping:   ${n('meterDeathsPetty')} (${pct(n('meterDeathsPetty'), deaths)})`);
  line(`    with sneaking into a room among the fines: ${n('meterDeathsSneaking')} (${pct(n('meterDeathsSneaking'), deaths)})`);
  line();
  line('The ceremony');
  const sentences = n('sentences');
  line(`  ${per(sentences, n('ceremonies'))} sentences a night`);
  top(merge(seeds, (s) => s.sentenceKinds), sentences);
  const sneaks = merge(seeds, (s) => s.sneaks);
  const sneakTotal = sneaks.reduce((t, [, v]) => t + v, 0);
  line(`  sneaking into a room above their rank, ${per(sneakTotal, days)} a day; what they went in for:`);
  top(sneaks, sneakTotal, 8);
  const skipped = n('skippedCeremony');
  line(`  skipped the ceremony: ${per(skipped, n('ceremonies'))} a night, ${pct(n('skippedAsleep'), skipped)} of them asleep; what they were doing:`);
  top(merge(seeds, (s) => s.skipped), skipped, 4);
  line();
  line('Romance');
  const fh = n('firstHookups');
  line(`  first hookups: ${fh}; ${n('firstHookupsUnkissed')} (${pct(n('firstHookupsUnkissed'), fh)}) before any kiss, ${n('firstHookupsUnflirted')} (${pct(n('firstHookupsUnflirted'), fh)}) before any flirt`);
  line(`  hookups ${per(n('hookups') * 7, days)} a week, first kisses ${per(n('firstKisses') * 7, days)} a week`);
  line(`  jealousy ${per(n('jealous'), n('kisses'))} per kiss; caught cheating ${per(n('betrayals') * 7, days)} a week`);
  const je = n('jealous');
  line(`  within two days of jealousy: ${pct(n('jealousRival'), je)} turned on the rival (${pct(n('jealousRivalViolent'), je)} with fists or an extreme break),`);
  line(`    ${pct(n('jealousBack'), je)} went after the partner, ${pct(n('jealousWon'), je)} got a kiss or more from them`);
  line();
  line('Fights');
  const cm = n('cageMatches');
  line(`  cage matches: ${cm}, ${n('cageRepeats')} (${pct(n('cageRepeats'), cm)}) a pair who'd already met in the cage; ${pct(n('cageBooked'), cm)} booked in advance (by the Wheel or tomorrow's bill)`);
  line(`  brawls outside the cage ${per(n('brawls') * 7, days)} a week`);
  line();
  line('Breakdowns');
  line(`  ${per(n('breaks'), days)} a day, ${pct(n('extremeBreaks'), n('breaks'))} extreme, ${per(n('catatonic'), days)} catatonic spells a day`);
  line(`  the three most-broken people in a season had ${pct(n('breaksTop3'), n('breaks'))} of its breaks`);
  top(merge(seeds, (s) => s.breakKinds), n('breaks'), 8);
  line();
  line('Food and sleep');
  line(`  ${per(n('meals'), days, 1)} meals a day; ${per(n('seconds'), days, 1)} second helpings (${pct(n('secondsGreedy'), n('seconds'))} by someone already full)`);
  line(`  rank 7's leftovers: ${pct(n('mealsShort'), n('mealsLast') + n('emptyLast'))} came up short, ${pct(n('emptyLast'), n('mealsLast') + n('emptyLast'))} nothing at all; empty tables for anyone else ${per(n('emptyOther') * 7, days)} a week`);
  line(`  the snack machine sold out on ${pct(n('soldOut'), days)} of days, around ${n('soldOut') ? clock(Math.round(n('soldOutAt') / n('soldOut'))) : '-'} on average`);
  line(`  stashed snacks: ${per(n('swipes') * 7, days)} swiped a week (${pct(n('swipesNoticed'), n('swipes'))} noticed), ${per(n('shares') * 7, days)} shared`);
  line(`  sleepers woken by noise ${per(n('keptUp') * 7, days)} a week`);
  line();
  line('Booze and gossip');
  line(`  ${per(n('drinks'), days, 1)} drinks a day, ${pct(n('drinksMorning'), n('drinks'))} before noon; ${per(n('hammered'), days)} hammered a day, ${per(n('pukes') * 7, days)} pukes and ${per(n('passedOut') * 7, days)} pass-outs a week`);
  line(`  ${per(n('blabs') * 7, days, 1)} secrets spilled a week (${pct(n('blabsJuicy'), n('blabs'))} to someone involved, ${pct(n('blabsVenting'), n('blabs'))} while venting), ${per(n('confessions') * 7, days)} drunken confessions a week`);
  line(`  ${per(n('scenes') * 7, days)} scenes a week that aired someone's secret, heard by ${per(n('sceneHeard'), n('scenes'), 1)} people each`);
  line();
  line('The diary room');
  line(`  ${per(n('confessionals'), days, 1)} confessionals a day (${pct(n('confessionalsCalled'), n('confessionals'))} summoned); ${per(n('playbacks') * 7, days)} played back at dinner a week, heard by ${per(n('playbackHeard'), n('playbacks'), 1)} people each`);
  top(merge(seeds, (s) => s.diary), n('confessionals'), 7);
  line();
  line('Murders');
  const mu = n('murders');
  line(`  ${mu} murders (one every ${mu ? Math.round(days / mu) : '—'} days), ${n('trials')} trials, ${n('wrongVerdicts')} wrong verdicts, ${n('trialImmunities')} saved by an immunity`);
  line(`  killers lived on ${n('killerDays').toFixed(1)} days in all after their murders; ${n('knownKillerDays')} of those days somebody knew`);
  line(`  someone came to believe a killer did it ${n('killerKnown')} times (${n('killerBelievers')} believers)`);
  line(`  aimed at a known killer afterwards: ${n('killerSnubbed')} insults or slights, ${n('killerTargeted')} breaks, ${n('killerCaged')} cage matches, ${n('killerFights')} brawls`);
  line();
  line('Wants and things to do');
  line(`  tomorrow's bill announced on ${pct(n('bills'), n('ceremonies'))} of nights; ${per(n('montages') * 7, days, 1)} training sessions a week for a booked match`);
  line(`    a cage match between one who trained and one who didn't: the trained one won ${pct(n('trainedWon'), n('trainedWon') + n('trainedLost'))} of ${n('trainedWon') + n('trainedLost')}`);
  line(`  confronting a rival ${per(n('confronts') * 7, days, 1)} a week (${pct(n('confrontInsults'), n('confronts'))} straight to an insult, ${pct(n('confrontFights'), n('confronts'))} came to blows)`);
  line(`  going to a friend in trouble ${per(n('comforting'), days, 1)} a day; seeking out a partner or crush ${per(n('partnerTalks'), days, 1)} a day`);
  line(`  cards: ${per(n('hands') * 7, days, 0)} hands a week (${pct(n('handsForSnacks'), n('hands'))} for snacks), ${per(n('dealIns') * 7, days, 1)} games started a week, ${per(n('cheatsCaught') * 7, days, 1)} cheats caught`);
  line(`  getting ready for the evening ${per(n('readied'), days, 1)} a day`);
  line();
  line('A daily check-in sees');
  line(`  a death ${pct(n('daysWithDeath'), days)} of days, a first kiss ${pct(n('daysWithFirstKiss'), days)}, someone caught cheating ${pct(n('daysWithCaught'), days)}, a brawl ${pct(n('daysWithBrawl'), days)}`);
  line();
  line('Smaller things');
  line(`  repeated names: ${per(n('repeatNames'), seeds.length)} a season (${n('arrivals')} arrivals)`);
  const k = seeds.reduce((t, s) => t + s.karaoke, 0);
  const tops = seeds.reduce((t, s) => t + s.topSinger, 0);
  line(`  karaoke: ${per(k, seeds.length, 0)} songs a season; the top singer sings ${pct(tops, k)} of them (${per(tops, seeds.length, 0)} on average, ${Math.max(0, ...seeds.map((s) => s.topSinger))} at most)`);
  return out;
}

// ---------------------------------------------------------------------------------------------
// One season, day by day

const clock = (t: number) => {
  const m = t % MINUTES_PER_DAY;
  return `${String(Math.floor(m / 60)).padStart(2, '0')}:${String(m % 60).padStart(2, '0')}`;
};

/**
 * Turns events into the lines a viewer would notice, with names. Keeps the state a reader needs
 * across calls (names, first kisses, tonight's sentences), so feed it every event in order.
 */
function narrator(): { line: (e: SimEvent) => string[]; nm: (id: string | undefined) => string } {
  const who = new Map<string, string>();
  const nm = (id: string | undefined) => (id ? (who.get(id) ?? id) : '?');
  const kissed = new Set<string>();
  let sentences: string[] = [];
  const line = (e: SimEvent): string[] => {
    const out: string[] = [];
    const x = e.data ?? {};
    const [a, b, c] = e.actors;
    const at = e.room ? ` (${e.room})` : '';
    let s: string | null = null;
    switch (e.type) {
      case 'arrive':
        who.set(a!, x.name as string);
        s = `${x.name} arrives: ${x.species}, ${x.pronouns}${(x.traits as string[]).length ? `, ${(x.traits as string[]).join(', ')}` : ''}`;
        break;
      case 'kiss': {
        const k = pairKey(a!, b!);
        s = kissed.has(k) ? null : `${nm(a)} and ${nm(b)} kiss for the first time${at}`;
        kissed.add(k);
        break;
      }
      case 'lovin':
        s = `${nm(a)} and ${nm(b)} hook up${x.first ? ' for the first time' : ''}${kissed.has(pairKey(a!, b!)) ? '' : ', never having kissed'}${x.where === 'public' ? ', in public' : ''}${at}`;
        break;
      case 'exclusive':
        s = `${nm(a)} and ${nm(b)} go exclusive${x.secretly ? ` (${nm(b)} secretly thinks it's a fling)` : ''}`;
        break;
      case 'breakup':
        s = `${nm(a)} breaks up with ${nm(b)}`;
        break;
      case 'betrayal':
        s = `${nm(a)} catches ${nm(b)} with ${nm(c)} (${x.what})${at}`;
        break;
      case 'jealous':
        s = `${nm(a)} is jealous: ${nm(b)} with ${nm(c)} (${x.what})${at}`;
        break;
      case 'blab':
        s = `${nm(a)} tells ${nm(b)} about ${nm(c)} and ${nm(e.actors[3])}${x.venting ? ' (venting)' : ` (${x.stage})`}${at}`;
        break;
      case 'confession':
        s = `${nm(a)} confesses to ${nm(b)}: they were with ${nm(c)} (${x.stage})${at}`;
        break;
      case 'confessional': {
        const about = ((x.about as string[] | undefined) ?? []).map(nm);
        const said: Record<string, string> = {
          take: `gives the camera their side of it${about.length ? ` with ${about[0]}` : ''}`,
          grudge: `trashes ${about[0]} to the camera`,
          crush: `admits to the camera they fancy ${about[0]}`,
          spill: `tells the camera about ${about[0]} and ${about[1]}`,
          suspicion: `tells the camera ${about[0]} is the killer`,
          cheating: `confesses to the camera they've been with ${about[0]} behind ${about[1]}'s back`,
        };
        s = said[x.kind as string] ? `Diary room: ${nm(a)} ${said[x.kind as string]}${x.summoned ? ' (summoned)' : ''}` : null;
        break;
      }
      case 'playback':
        s = `At dinner the announcer plays ${nm(a)}'s confessional (${x.kind}) to ${(x.heard as string[]).length} people`;
        break;
      case 'scene':
        s = `${nm(a)} makes a scene about ${nm(b)} and ${nm(c)}${(x.heard as string[]).length ? ` in front of ${(x.heard as string[]).map(nm).join(', ')}` : ''}${at}`;
        break;
      case 'puke':
        s = `${nm(a)} throws up${at}`;
        break;
      case 'meal_empty':
        s = `${nm(a)} turns up for ${x.meal === 'leftovers' ? 'the leftovers' : x.meal} and there's nothing left${at}`;
        break;
      case 'swipe_snack':
        s = `${nm(a)} swipes ${nm(b)}'s snack${x.noticed ? ' and gets caught' : ''}${at}`;
        break;
      case 'share_snack':
        s = `${nm(a)} shares a snack with a hungry ${nm(b)}${at}`;
        break;
      case 'sold_out':
        s = `The snack machine is empty (${nm(a)} took the last one)`;
        break;
      case 'passed_out':
        s = `${nm(a)} passes out${at}`;
        break;
      case 'fight':
        s = `${nm(x.winner as string)} beats ${nm(x.loser as string)} in a brawl${at}`;
        break;
      case 'cage_match':
        s = `cage match: ${nm(x.winner as string)} beats ${nm(x.loser as string)}${x.forfeit ? ' by forfeit' : ''}`;
        break;
      case 'dance_off':
        s = `dance-off${x.sudden ? ' (sudden death)' : ''}: ${nm(x.winner as string)} wins, ${nm(x.loser as string)} loses`;
        break;
      case 'bill':
        s = `tomorrow's bill: ${x.format === 'button' ? 'the Button' : `${x.format === 'cage_match' ? 'cage match' : 'dance-off'}, ${e.actors.map(nm).join(' vs ')}`}`;
        break;
      case 'confront':
        s = `${nm(a)} goes to have it out with ${nm(b)} (${x.with})${at}`;
        break;
      case 'caught_cheating':
        s = `${nm(a)} catches ${nm(b)} cheating at cards${at}`;
        break;
      case 'button':
        s = `the Button: ${(x.pressers as string[]).map(nm).join(', ') || 'nobody'} pressed`;
        break;
      case 'break':
        s = x.level === 'extreme' || x.kind === 'steal_food' ? `${nm(a)} breaks (${x.level} ${x.kind}, over ${x.source})${b ? ` at ${nm(b)}` : ''}${at}` : null;
        break;
      case 'murder':
        s = `MURDER: ${nm(a)} kills ${nm(b)}${at}, ${(x.witnesses as string[]).length ? `seen by ${(x.witnesses as string[]).map(nm).join(', ')}` : 'unseen'}`;
        break;
      case 'body_found':
        s = x.announced ? `the announcer declares ${x.name}'s body` : `${nm(a)} finds ${x.name}'s body${at}`;
        break;
      case 'accusation':
        s = `${nm(a)} accuses ${nm(b)} of killing ${x.name}`;
        break;
      case 'trial':
        s = `trial for ${x.name}: ${nm(x.loser as string)} loses ${x.against}-${Object.keys(x.votes as object).length - (x.against as number)}${x.right ? ' (the killer)' : ' (innocent)'}`;
        break;
      case 'killer_known':
        s = `${e.actors.slice(1).map(nm).join(', ')} now ${e.actors.length > 2 ? 'believe' : 'believes'} ${nm(a)} killed ${x.name} (${x.how})`;
        break;
      case 'immunity_spent':
        s = `${nm(a)} hands over an immunity (${x.cause})`;
        break;
      case 'sentence':
        sentences.push(`${nm(a)} ${(x.infractions as string[]).join('+')}${x.meter ? ` ${x.meter}` : ''}${x.fishbowl ? ` fishbowl ${x.fishbowl}` : ''}`);
        break;
      case 'wheel':
        s = `${nm(a)} spins the Wheel: ${x.segment}`;
        break;
      case 'death':
        s = `${x.name} is spaced (${x.cause}${x.cause === 'meter' && sentences.some((l) => l.startsWith(`${x.name} `)) ? ', after a fine' : ''})`;
        break;
      case 'ceremony':
        if (sentences.length) out.push(`  ${clock(e.t)} sentences: ${sentences.join('; ')}`);
        sentences = [];
        s = `ranks: ${(x.ranks as string[]).map(nm).join(', ')}`;
        break;
    }
    if (s) out.push(`  ${clock(e.t)} ${s}`);
    return out;
  };
  return { line, nm };
}

/** One season told day by day: the moments a viewer would notice, with names. */
export function seasonLog(data: GameData, seed: number, days: number): string[] {
  const world = createWorld(data, seed);
  const { line } = narrator();
  const out: string[] = [];
  for (let d = 1; d <= days; d++) {
    out.push('', `Day ${d}`);
    for (const e of step(world, MINUTES_PER_DAY)) out.push(...line(e));
  }
  return out;
}

// ---------------------------------------------------------------------------------------------
// One contestant's day, every choice

/**
 * Everything each contestant (or the one named) does on one day: every action they start, with
 * their needs, mood, meter and rank at the moment they chose it, and what happened during it.
 * For spotting nonsense in a single life (`sim day`).
 */
export function dayTrace(data: GameData, seed: number, day: number, who?: string): string[] {
  const world = createWorld(data, seed);
  const names = new Map<string, string>();
  const nm = (id: string) => names.get(id) ?? id;
  const sheet = new Map<string, string>();
  const rows = new Map<string, { head: string; notes: string[]; chats: Set<string> }[]>();
  const start = (day - 1) * MINUTES_PER_DAY;
  for (let t = 0; t < day * MINUTES_PER_DAY; t++) {
    const events = step(world, 1);
    for (const e of events) if (e.type === 'arrive') names.set(e.actors[0]!, e.data!.name as string);
    if (t < start) continue;
    for (const e of events) {
      for (const id of new Set(e.actors)) {
        if (who && nm(id) !== who) continue;
        const c = world.contestants.find((x) => x.id === id);
        if (c && !sheet.has(id)) sheet.set(id, `${c.species}, ${c.pronouns}; ${c.traits.join(', ') || 'no traits'}; ${Object.entries(c.personality).map(([k, v]) => `${k} ${v.toFixed(1)}`).join(', ')}; company point ${c.companyPoint.toFixed(0)}`);
        const r = rows.get(id) ?? (rows.set(id, []), rows.get(id)!);
        const x = e.data ?? {};
        if (e.type === 'act.start') {
          let s = `${clock(e.t)} ${String(x.action)}${x.object ? ` (${String(x.object).split(':')[1]})` : ''} in ${e.room}${x.walk ? `, walk ${x.walk}` : ''}`;
          if (c) {
            const n = c.needs;
            s = `${s.padEnd(44)} hunger ${n.hunger.toFixed(0)} rest ${n.rest.toFixed(0)} hygiene ${n.hygiene.toFixed(0)} bladder ${n.bladder.toFixed(0)} social ${n.social.toFixed(0)} fun ${n.fun.toFixed(0)} comfort ${n.comfort.toFixed(0)} | company ${c.company.toFixed(0)} mood ${c.mood.toFixed(0)} meter ${c.meter.toFixed(0)}${c.intox > 0.5 ? ` intox ${c.intox.toFixed(0)}` : ''} rank ${c.rank ?? '-'}`;
          }
          r.push({ head: s, notes: [], chats: new Set() });
          continue;
        }
        if (e.type === 'meet') continue;
        if (e.type === 'act.end') {
          if (x.how !== 'done' && r.length) r[r.length - 1]!.notes.push(`${clock(e.t)} (${x.how} after ${x.minutes}m)`);
          continue;
        }
        if (!r.length) r.push({ head: `${clock(e.t)} (asleep or already busy)`, notes: [], chats: new Set() });
        const cur = r[r.length - 1]!;
        const others = e.actors.filter((a) => a !== id).map(nm);
        if (e.type === 'chitchat') {
          for (const o of others) cur.chats.add(o);
          continue;
        }
        const d = Object.entries(x)
          .filter(([k]) => k !== 'awards')
          .map(([k, v]) => `${k}=${typeof v === 'object' ? JSON.stringify(v).slice(0, 60) : v}`)
          .join(' ');
        cur.notes.push(`${clock(e.t)} ${e.type}${e.actors[0] !== id ? ` (by ${nm(e.actors[0]!)})` : ''}${others.length ? ` ${others.join(', ')}` : ''}${d ? ` {${d}}` : ''}${e.points ? ` +${e.points.toFixed(1)}` : ''}`);
      }
    }
  }
  const out: string[] = [];
  for (const [id, r] of rows) {
    out.push('', `${nm(id)}: ${sheet.get(id) ?? '(gone)'}`);
    for (const row of r) {
      out.push(row.head + (row.chats.size ? `  · chats with ${[...row.chats].join(', ')}` : ''));
      for (const n of row.notes) out.push(`      ${n}`);
    }
  }
  return out;
}

// ---------------------------------------------------------------------------------------------
// Tuning in: what a new viewer would see at one moment

/**
 * A snapshot for a viewer tuning in at one moment (`sim tunein`): the last few hours of the
 * season log, who's aboard and how they're doing, and the relationships worth knowing about.
 * Read-only: it steps a fresh world to that minute and looks.
 */
export function tuneIn(data: GameData, seed: number, day: number, at: number, hours: number): string[] {
  const world = createWorld(data, seed);
  const { line, nm } = narrator();
  const when = (day - 1) * MINUTES_PER_DAY + at;
  const from = when - hours * 60;
  const recent: string[] = [];
  let lastDay = 0;
  while (world.t < when) {
    for (const e of step(world, Math.min(MINUTES_PER_DAY, when - world.t))) {
      const lines = line(e);
      if (e.t < from || !lines.length) continue;
      const d = Math.floor(e.t / MINUTES_PER_DAY) + 1;
      if (d !== lastDay) recent.push(`Day ${d}`);
      lastDay = d;
      recent.push(...lines);
    }
  }
  const out = [`Seed ${seed}, tuning in on day ${day} at ${clock(when)}`, '', `The last ${hours} hours`, ...recent, '', 'Aboard now'];
  const alive = [...world.contestants].sort((a, b) => (a.rank ?? 99) - (b.rank ?? 99));
  for (const c of alive) {
    const days = ((world.t - c.arrivedAt) / MINUTES_PER_DAY).toFixed(1);
    const doing = c.activity ? `${c.activity.action}${c.activity.phase === 'walk' ? ' (on the way)' : ''}` : c.asleep ? 'asleep' : 'idle';
    out.push(`  ${String(c.rank ?? '-').padStart(2)} ${c.name.padEnd(9)} ${days.padStart(4)} days aboard, meter ${c.meter.toFixed(0).padStart(3)}, mood ${c.mood.toFixed(0).padStart(3)}, ${doing} in ${c.room}${c.confined ? ', in the fishbowl' : ''}${c.intox > 0.5 ? `, intox ${c.intox.toFixed(0)}` : ''}; ${c.traits.join(', ') || 'no traits'}`);
    const thoughts = [...c.thoughts].sort((a, b) => Math.abs(b.value) - Math.abs(a.value)).slice(0, 4);
    if (thoughts.length) out.push(`       thinking: ${thoughts.map((t) => `${t.id}${t.about ? ` (${nm(t.about)})` : ''} ${t.value > 0 ? '+' : ''}${t.value.toFixed(0)}`).join(', ')}`);
  }
  out.push('', 'Between them (labels, strong feelings either way, beliefs about killers)');
  for (const c of alive) {
    for (const [id, r] of Object.entries(c.ledger)) {
      if (!alive.some((o) => o.id === id)) continue;
      const bits: string[] = [];
      if (r.label !== 'none') bits.push(r.label);
      if (r.affection >= 40 || r.affection <= -30) bits.push(`affection ${r.affection.toFixed(0)}`);
      if (r.fear >= 40) bits.push(`fear ${r.fear.toFixed(0)}`);
      if (r.lovin) bits.push(`lovin' ×${r.lovin}`);
      if (r.killer) bits.push(`believes they killed ${r.killer}`);
      if (!bits.length) continue;
      const why = [...r.reasons].sort((a, b) => Math.abs(b.amount) - Math.abs(a.amount)).slice(0, 2).map((x) => x.why);
      out.push(`  ${c.name} → ${nm(id)}: ${bits.join(', ')}${why.length ? `  (${why.join('; ')})` : ''}`);
    }
  }
  return out;
}
