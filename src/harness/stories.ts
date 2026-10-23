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
  topSinger: number; // the season's busiest karaoke singer, their performances
  karaoke: number;
}

const HOSTILE = new Set(['insult', 'slight', 'glass_mock']);
const pairKey = (a: string, b: string) => (a < b ? `${a}|${b}` : `${b}|${a}`);

function add(m: Record<string, number>, k: string, v = 1): void {
  m[k] = (m[k] ?? 0) + v;
}

/** Runs one season and counts what a viewer would notice. */
export function storySeed(data: GameData, seed: number, days: number): StorySeed {
  const s: StorySeed = { seed, days, n: {}, sneaks: {}, skipped: {}, sentenceKinds: {}, deathCauses: {}, topSinger: 0, karaoke: 0 };
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
  for (let d = 0; d < days; d++) {
    const events: SimEvent[] = step(world, MINUTES_PER_DAY);
    const today = new Set<string>();
    for (const e of events) {
      const data = e.data ?? {};
      const [a, b] = e.actors;
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
        case 'karaoke':
          singers.set(a!, (singers.get(a!) ?? 0) + 1);
          s.karaoke++;
          break;
      }
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
  line();
  line('Fights');
  const cm = n('cageMatches');
  line(`  cage matches: ${cm}, ${n('cageRepeats')} (${pct(n('cageRepeats'), cm)}) a pair who'd already met in the cage; ${pct(n('cageBooked'), cm)} booked by the Wheel`);
  line(`  brawls outside the cage ${per(n('brawls') * 7, days)} a week`);
  line();
  line('Breakdowns');
  line(`  ${per(n('breaks'), days)} a day, ${pct(n('extremeBreaks'), n('breaks'))} extreme, ${per(n('catatonic'), days)} catatonic spells a day`);
  line();
  line('Murders');
  const mu = n('murders');
  line(`  ${mu} murders (one every ${mu ? Math.round(days / mu) : '—'} days), ${n('trials')} trials, ${n('wrongVerdicts')} wrong verdicts, ${n('trialImmunities')} saved by an immunity`);
  line(`  killers lived on ${n('killerDays').toFixed(1)} days in all after their murders; ${n('knownKillerDays')} of those days somebody knew`);
  line(`  someone came to believe a killer did it ${n('killerKnown')} times (${n('killerBelievers')} believers)`);
  line(`  aimed at a known killer afterwards: ${n('killerSnubbed')} insults or slights, ${n('killerTargeted')} breaks, ${n('killerCaged')} cage matches, ${n('killerFights')} brawls`);
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

/** One season told day by day: the moments a viewer would notice, with names. */
export function seasonLog(data: GameData, seed: number, days: number): string[] {
  const world = createWorld(data, seed);
  const who = new Map<string, string>();
  const nm = (id: string | undefined) => (id ? (who.get(id) ?? id) : '?');
  const kissed = new Set<string>();
  const out: string[] = [];
  for (let d = 1; d <= days; d++) {
    out.push('', `Day ${d}`);
    let sentences: string[] = [];
    for (const e of step(world, MINUTES_PER_DAY)) {
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
        case 'fight':
          s = `${nm(x.winner as string)} beats ${nm(x.loser as string)} in a brawl${at}`;
          break;
        case 'cage_match':
          s = `cage match: ${nm(x.winner as string)} beats ${nm(x.loser as string)}${x.forfeit ? ' by forfeit' : ''}`;
          break;
        case 'dance_off':
          s = `dance-off${x.sudden ? ' (sudden death)' : ''}: ${nm(x.winner as string)} wins, ${nm(x.loser as string)} loses`;
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
    }
  }
  return out;
}
