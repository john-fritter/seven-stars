// Parsing data from YAML text, with no file access, so the debug view can use it in the browser.
import { parse as parseYaml } from 'yaml';
import type { z } from 'zod';
import { fileSchemas, type GameData } from './schema.js';

export class DataError extends Error {
  constructor(message: string) {
    super(message);
    this.name = 'DataError';
  }
}

function where(file: string, path: readonly PropertyKey[]): string {
  return path.length ? `${file}: ${path.map(String).join('.')}` : file;
}

/** Validates every data file. `read` returns a file's YAML text by name (e.g. "rooms"). */
export function parse(read: (name: string) => string, dir = 'data'): GameData {
  const out: Record<string, unknown> = {};
  for (const [name, schema] of Object.entries(fileSchemas)) {
    const file = `${dir}/${name}.yaml`;
    let text: string;
    try {
      text = read(name);
    } catch (e) {
      throw new DataError(`${file}: can't read it (${(e as Error).message})`);
    }
    let raw: unknown;
    try {
      raw = parseYaml(text);
    } catch (e) {
      throw new DataError(`${file}: invalid YAML (${(e as Error).message})`);
    }
    const result = (schema as z.ZodType).safeParse(raw);
    if (!result.success) {
      const lines = result.error.issues.map((i) => `  ${where(file, i.path)}: ${i.message}`);
      throw new DataError(`Bad data in ${file}:\n${lines.join('\n')}`);
    }
    out[name] = result.data;
  }
  const data = out as GameData;
  crossCheck(data, dir);
  return data;
}

/** Checks references between files: rooms, object types, beds, species, food. */
function crossCheck(d: GameData, dir: string): void {
  const errors: string[] = [];
  const rooms = new Set(d.rooms.rooms.map((r) => r.id));
  const species = new Set(Object.keys(d.species.species));
  const types = d.objects.types;

  d.rooms.rooms.forEach((r, i) => {
    if (r.access === 'ranks' && !r.ranks) errors.push(`${dir}/rooms.yaml: rooms.${i}.ranks: needed when access is "ranks"`);
    for (const t of Object.keys(r.objects)) {
      if (!types[t]) errors.push(`${dir}/rooms.yaml: rooms.${i}.objects.${t}: no such object type in objects.yaml`);
    }
  });
  d.rooms.links.forEach(([a, b], i) => {
    for (const id of [a, b]) if (!rooms.has(id)) errors.push(`${dir}/rooms.yaml: links.${i}: no room "${id}"`);
  });

  const checkAction = (a: GameData['objects']['personal'][number], at: string) => {
    for (const s of [...Object.keys(a.speciesGains), ...Object.keys(a.speciesCost), ...(a.onlySpecies ?? []), ...(a.notSpecies ?? [])]) {
      if (!species.has(s)) errors.push(`${dir}/objects.yaml: ${at}: no species "${s}"`);
    }
    if (a.kind !== 'sleep' && a.minutes === undefined) errors.push(`${dir}/objects.yaml: ${at}.minutes: required for ${a.kind} actions`);
    if (a.kind === 'sleep' && a.quality === undefined) errors.push(`${dir}/objects.yaml: ${at}.quality: required for sleep actions`);
    if (a.recreation && !d.generator.recreation.includes(a.recreation)) {
      errors.push(`${dir}/objects.yaml: ${at}.recreation: "${a.recreation}" isn't in generator.yaml recreation`);
    }
  };
  for (const [t, def] of Object.entries(types)) def.actions.forEach((a, i) => checkAction(a, `types.${t}.actions.${i}`));
  d.objects.personal.forEach((a, i) => checkAction(a, `personal.${i}`));

  d.schedule.meals.forEach((m, i) => {
    if (!rooms.has(m.room)) errors.push(`${dir}/schedule.yaml: meals.${i}.room: no room "${m.room}"`);
  });
  if (!rooms.has(d.schedule.ceremony.room)) errors.push(`${dir}/schedule.yaml: ceremony.room: no room "${d.schedule.ceremony.room}"`);

  for (const r of ['1', '2', '3', '4', '5', '6', '7'] as const) {
    const rank = d.ranks.ranks[r];
    if (!rank) {
      errors.push(`${dir}/ranks.yaml: ranks.${r}: missing`);
      continue;
    }
    const [room, type, n] = rank.bed.split(':');
    const count = d.rooms.rooms.find((x) => x.id === room)?.objects[type ?? ''] ?? 0;
    if (!(Number(n) >= 1 && Number(n) <= count)) errors.push(`${dir}/ranks.yaml: ranks.${r}.bed: no object "${rank.bed}"`);
    if (!d.ranks.food[rank.food]) errors.push(`${dir}/ranks.yaml: ranks.${r}.food: no food "${rank.food}"`);
    if (!d.clothing.byRank[r]) errors.push(`${dir}/clothing.yaml: byRank.${r}: missing`);
  }

  const thoughts = d.thoughts.thoughts;
  const thought = (id: string | undefined, at: string) => {
    if (id !== undefined && !thoughts[id]) errors.push(`${dir}/${at}: no thought "${id}" in thoughts.yaml`);
  };
  d.social.interactions.forEach((x, i) => thought(x.thought, `social.yaml: interactions.${i}.thought`));
  thought(d.social.flirt.rebuffed, 'social.yaml: flirt.rebuffed');
  thought(d.social.flirt.awkward, 'social.yaml: flirt.awkward');
  thought(d.social.fight.won, 'social.yaml: fight.won');
  thought(d.social.fight.lost, 'social.yaml: fight.lost');
  thought(d.social.knock.turnedAway, 'social.yaml: knock.turnedAway');
  if (!rooms.has(d.social.fight.cageRoom)) errors.push(`${dir}/social.yaml: fight.cageRoom: no room "${d.social.fight.cageRoom}"`);
  for (const s of Object.keys(d.thoughts.species)) if (!species.has(s)) errors.push(`${dir}/thoughts.yaml: species.${s}: no such species`);
  for (const [id, t] of Object.entries(thoughts)) {
    for (const s of Object.keys(t.species)) if (!species.has(s)) errors.push(`${dir}/thoughts.yaml: thoughts.${id}.species.${s}: no such species`);
  }

  // The show
  d.rooms.rooms.forEach((r, i) => {
    if (r.glass !== undefined && !rooms.has(r.glass)) errors.push(`${dir}/rooms.yaml: rooms.${i}.glass: no room "${r.glass}"`);
  });
  thought(d.meter.doomed.thought, 'meter.yaml: doomed.thought');
  thought(d.ranks.thoughts.up, 'ranks.yaml: thoughts.up');
  thought(d.ranks.thoughts.down, 'ranks.yaml: thoughts.down');
  const r = d.rules;
  thought(r.sentencedThought, 'rules.yaml: sentencedThought');
  thought(r.fishbowl.thought, 'rules.yaml: fishbowl.thought');
  for (const k of ['watched', 'died', 'friend', 'rival', 'disliked'] as const) thought(r.spacing[k], `rules.yaml: spacing.${k}`);
  if (!rooms.has(r.fishbowl.room)) errors.push(`${dir}/rules.yaml: fishbowl.room: no room "${r.fishbowl.room}"`);
  else if (!d.rooms.rooms.find((x) => x.id === r.fishbowl.room)!.glass) errors.push(`${dir}/rooms.yaml: the fishbowl room "${r.fishbowl.room}" needs a glass: room`);
  for (const s of Object.keys(r.fishbowl.douseSpecies)) if (!species.has(s)) errors.push(`${dir}/rules.yaml: fishbowl.douseSpecies.${s}: no such species`);
  // The rules the simulation itself logs.
  for (const rule of ['above_rank', 'skipped_ceremony', 'fighting']) {
    if (!r.infractions[rule]) errors.push(`${dir}/rules.yaml: infractions.${rule}: missing`);
  }
  for (const [id, x] of Object.entries(r.infractions)) {
    if (x.step > r.sentences.length) errors.push(`${dir}/rules.yaml: infractions.${id}.step: the ladder only has ${r.sentences.length} sentences`);
  }

  // Thoughts, breaks, booze and romance
  const th = d.thoughts;
  thought(th.trapped.thought, 'thoughts.yaml: trapped.thought');
  for (const k of ['friend', 'partner', 'enemy', 'worry', 'missing', 'envy'] as const) thought(d.social.people[k].thought, `social.yaml: people.${k}.thought`);
  th.needs.forEach((n, i) => thought(n.thought, `thoughts.yaml: needs.${i}.thought`));
  const mo = th.moments;
  for (const k of ['helped', 'risky', 'guilt', 'watched', 'breakdown'] as const) thought(mo[k].thought, `thoughts.yaml: moments.${k}.thought`);
  const interactionIds = new Set(d.social.interactions.map((x) => x.id));
  for (const id of mo.helped.interactions) if (!interactionIds.has(id)) errors.push(`${dir}/thoughts.yaml: moments.helped.interactions: no interaction "${id}" in social.yaml`);
  for (const k of ['risky', 'guilt'] as const) for (const id of mo[k].infractions) if (!r.infractions[id]) errors.push(`${dir}/thoughts.yaml: moments.${k}.infractions: no rule "${id}" in rules.yaml`);
  thought(th.temperature.cold, 'thoughts.yaml: temperature.cold');
  thought(th.temperature.hot, 'thoughts.yaml: temperature.hot');
  for (const [t, def] of Object.entries(types)) def.actions.forEach((a, i) => thought(a.thought, `objects.yaml: types.${t}.actions.${i}.thought`));
  for (const [id, f] of Object.entries(d.ranks.food)) thought(f.thought, `ranks.yaml: food.${id}.thought`);
  for (const [r, c] of Object.entries(d.clothing.byRank)) thought(c.thought, `clothing.yaml: byRank.${r}.thought`);
  d.social.interactions.forEach((x, i) => thought(x.witnessThought, `social.yaml: interactions.${i}.witnessThought`));
  thought(d.social.fight.witnessThought, 'social.yaml: fight.witnessThought');

  const bz = d.booze;
  for (const q of bz.order) if (!bz.qualities[q]) errors.push(`${dir}/booze.yaml: order: no quality "${q}" in qualities`);
  for (const [r, q] of Object.entries(bz.byRank)) if (!bz.qualities[q]) errors.push(`${dir}/booze.yaml: byRank.${r}: no quality "${q}"`);
  for (const [id, q] of Object.entries(bz.qualities)) thought(q.thought, `booze.yaml: qualities.${id}.thought`);
  thought(bz.hangover.thought, 'booze.yaml: hangover.thought');
  thought(bz.gift.thought, 'booze.yaml: gift.thought');
  if (!bz.stages.some((s) => s.id === 'hammered')) errors.push(`${dir}/booze.yaml: stages: needs a "hammered" stage`);
  for (const [t, def] of Object.entries(types)) {
    def.actions.forEach((a, i) => {
      if (a.kind === 'drink' && (!a.booze || !bz.qualities[a.booze])) errors.push(`${dir}/objects.yaml: types.${t}.actions.${i}.booze: drinks need a quality from booze.yaml`);
    });
  }

  const br = d.breaks;
  const kind = (id: string, at: string) => {
    if (!br.kinds[id]) errors.push(`${dir}/breaks.yaml: ${at}: no break kind "${id}"`);
  };
  for (const [src, row] of Object.entries(br.sources)) for (const [lvl, id] of Object.entries(row)) kind(id, `sources.${src}.${lvl}`);
  kind(br.fallback, 'fallback');
  kind(br.passion.otherwise, 'passion.otherwise');
  thought(br.catharsis, 'breaks.yaml: catharsis');
  thought(br.passion.witnessThought, 'breaks.yaml: passion.witnessThought');
  for (const [id, k] of Object.entries(br.kinds)) {
    if (k.infraction && !r.infractions[k.infraction]) errors.push(`${dir}/breaks.yaml: kinds.${id}.infraction: no rule "${k.infraction}" in rules.yaml`);
    if (k.wreck) thought(k.wreck.thought, `breaks.yaml: kinds.${id}.wreck.thought`);
    if (!['here', 'bed', 'target', 'target_bed', 'bar'].includes(k.room) && !rooms.has(k.room)) errors.push(`${dir}/breaks.yaml: kinds.${id}.room: no room "${k.room}"`);
    if ((k.room === 'target' || k.room === 'target_bed' || k.attack) && !k.target) errors.push(`${dir}/breaks.yaml: kinds.${id}.target: needed for this room or an attack`);
  }
  if (br.kinds[br.fallback]?.room !== 'here') errors.push(`${dir}/breaks.yaml: fallback: the fallback break has to happen "here"`);

  const ro = d.romance;
  thought(ro.kiss.thought, 'romance.yaml: kiss.thought');
  thought(ro.kiss.rebuffed, 'romance.yaml: kiss.rebuffed');
  thought(ro.proposition.turnedDown, 'romance.yaml: proposition.turnedDown');
  thought(ro.proposition.thought, 'romance.yaml: proposition.thought');
  thought(ro.proposition.disturbed, 'romance.yaml: proposition.disturbed');
  thought(ro.proposition.here.witnessThought, 'romance.yaml: proposition.here.witnessThought');
  if (ro.proposition.minutes[0] > ro.proposition.minutes[1]) errors.push(`${dir}/romance.yaml: proposition.minutes: the shortest comes first`);
  const sl = d.needs.sleep;
  thought(sl.share.refused, 'needs.yaml: sleep.share.refused');
  thought(sl.share.good, 'needs.yaml: sleep.share.good');
  thought(sl.share.bad, 'needs.yaml: sleep.share.bad');
  thought(sl.noise.thought, 'needs.yaml: sleep.noise.thought');
  thought(d.actions.modestyThought, 'actions.yaml: modestyThought');
  thought(ro.exclusive.thought, 'romance.yaml: exclusive.thought');
  thought(ro.exclusive.refused, 'romance.yaml: exclusive.refused');
  thought(ro.breakup.dumped, 'romance.yaml: breakup.dumped');
  thought(ro.betrayal.thought, 'romance.yaml: betrayal.thought');
  thought(ro.jealousy.thought, 'romance.yaml: jealousy.thought');
  thought(ro.guilty, 'romance.yaml: guilty');
  if (!d.social.interactions.some((x) => x.id === 'insult')) errors.push(`${dir}/social.yaml: interactions: an "insult" is needed (fights, sprees, confrontations)`);

  // The Wheel, the daily event and trials
  const wh = d.wheel;
  const effect = (id: string, at: string) => {
    if (!wh.effects[id]) errors.push(`${dir}/${at}: no station effect "${id}" in wheel.yaml effects`);
  };
  thought(wh.thought, 'wheel.yaml: thought');
  wh.segments.forEach((s, i) => {
    const at = `wheel.yaml: segments.${i}`;
    thought(s.thought, `${at}.thought`);
    for (const id of s.station) effect(id, `${at}.station`);
    if (s.effect === 'meter' && s.to === undefined) errors.push(`${dir}/${at}.to: needed for a meter segment`);
    if (s.effect === 'event' && (!s.event || !(d.events.rotation as string[]).includes(s.event))) errors.push(`${dir}/${at}.event: needs a format from events.yaml rotation`);
    if (s.effect === 'event' && !s.against) errors.push(`${dir}/${at}.against: needed for an event segment`);
    if (s.effect === 'fishbowl' && !s.fishbowl) errors.push(`${dir}/${at}.fishbowl: night or day`);
    if (s.effect === 'pick_two' && s.amount === undefined) errors.push(`${dir}/${at}.amount: needed for pick_two`);
  });
  for (const [id, e] of Object.entries(wh.effects)) {
    for (const m of e.meals) if (!d.schedule.meals.some((x) => x.id === m)) errors.push(`${dir}/wheel.yaml: effects.${id}.meals: no meal "${m}"`);
    if (e.booze && !bz.qualities[e.booze]) errors.push(`${dir}/wheel.yaml: effects.${id}.booze: no quality "${e.booze}"`);
  }
  for (const [id, x] of Object.entries(r.infractions)) for (const e of x.collective) effect(e, `rules.yaml: infractions.${id}.collective`);
  for (const [t, def] of Object.entries(types)) {
    def.actions.forEach((a, i) => {
      if (a.when) effect(a.when, `objects.yaml: types.${t}.actions.${i}.when`);
      if (a.unless) effect(a.unless, `objects.yaml: types.${t}.actions.${i}.unless`);
    });
  }
  if (!r.infractions.skipped_event) errors.push(`${dir}/rules.yaml: infractions.skipped_event: missing`);
  const ev = d.events;
  for (const f of ['cage_match', 'dance_off', 'button'] as const) {
    if (!rooms.has(ev[f].room)) errors.push(`${dir}/events.yaml: ${f}.room: no room "${ev[f].room}"`);
  }
  if (ev.dance_off.dancers[0] > ev.dance_off.dancers[1]) errors.push(`${dir}/events.yaml: dance_off.dancers: the smaller number goes first`);
  thought(ev.dance_off.won, 'events.yaml: dance_off.won');
  thought(ev.dance_off.lost, 'events.yaml: dance_off.lost');
  const tr = d.trials;
  thought(tr.foundThought, 'trials.yaml: foundThought');
  thought(tr.accused.thought, 'trials.yaml: accused.thought');
  thought(tr.survivedThought, 'trials.yaml: survivedThought');
  if (!rooms.has(d.schedule.trials.room)) errors.push(`${dir}/schedule.yaml: trials.room: no room "${d.schedule.trials.room}"`);

  // Traits
  const ts = d.traits;
  const interactions = new Set(d.social.interactions.map((x) => x.id));
  if (!bz.stages.some((s) => s.id === ts.drunkFrom)) errors.push(`${dir}/traits.yaml: drunkFrom: no stage "${ts.drunkFrom}" in booze.yaml`);
  for (const [id, t] of Object.entries(ts.traits)) {
    const at = `traits.yaml: traits.${id}`;
    for (const x of t.excludes) if (!ts.traits[x]) errors.push(`${dir}/${at}.excludes: no trait "${x}"`);
    for (const x of [...Object.keys(t.interactions), ...Object.keys(t.nearby), ...t.fightOn]) {
      if (!interactions.has(x)) errors.push(`${dir}/${at}: no interaction "${x}" in social.yaml`);
    }
    for (const x of Object.keys(t.thoughts)) thought(x, `${at}.thoughts`);
    for (const x of Object.keys(t.scores)) if (!d.scoring.awards[x]) errors.push(`${dir}/${at}.scores: no award "${x}" in scoring.yaml`);
    for (const x of t.watched?.events ?? []) if (!d.scoring.awards[x]) errors.push(`${dir}/${at}.watched.events: no award "${x}" in scoring.yaml`);
    thought(t.thought, `${at}.thought`);
    thought(t.crowd?.thought, `${at}.crowd.thought`);
    thought(t.watched?.thought, `${at}.watched.thought`);
    thought(t.exposedThought, `${at}.exposedThought`);
  }

  if (errors.length) throw new DataError(`Bad data:\n${errors.map((e) => `  ${e}`).join('\n')}`);
}
