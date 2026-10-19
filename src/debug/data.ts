// Reads the YAML data files into the browser. Vite bundles them as text and hot-reloads them
// when they change on disk; main.ts swaps the new data into the running world.
/// <reference types="vite/client" />
import { parse as parseGameData } from '../data/parse.js';
import type { GameData } from '../data/schema.js';

const files = import.meta.glob('../../data/*.yaml', { query: '?raw', import: 'default', eager: true }) as Record<string, string>;

export function readData(): GameData {
  return parseGameData((name) => {
    const text = files[`../../data/${name}.yaml`];
    if (text === undefined) throw new Error('no such file');
    return text;
  });
}
