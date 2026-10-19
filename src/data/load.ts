// Loading and validating the YAML data files. Bad data fails loudly, naming the file and field.
import { readFileSync } from 'node:fs';
import { join } from 'node:path';
import { parse } from './parse.js';
import type { GameData } from './schema.js';

export { parse as parseGameData, DataError } from './parse.js';

/** Reads every data file from a folder and validates it. */
export function loadGameData(dir: string): GameData {
  return parse((name) => readFileSync(join(dir, `${name}.yaml`), 'utf8'), dir);
}
