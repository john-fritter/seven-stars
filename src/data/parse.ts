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
  for (const [k, id] of Object.entries(r.spacing)) thought(id, `rules.yaml: spacing.${k}`);
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

  if (errors.length) throw new DataError(`Bad data:\n${errors.map((e) => `  ${e}`).join('\n')}`);
}
