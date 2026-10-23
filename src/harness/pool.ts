// Runs seeds in parallel worker threads. Each worker loads the data itself and applies the same
// overrides, so results don't depend on how seeds were split.
import { availableParallelism } from 'node:os';
import { Worker } from 'node:worker_threads';
import type { GameData } from '../data/schema.js';
import { loadGameData } from '../data/load.js';
import { runSeed, type SeedStats } from './stats.js';
import { storySeed, type StorySeed } from './stories.js';

export interface Job {
  dataDir: string;
  overrides: Record<string, number>;
  seeds: number[];
  days: number;
  stories?: boolean; // story sampling (stories.ts) instead of the harness stats
}

/** Sets values like "needs.needs.hunger.drainPerHour" (the first part is the file). */
export function applyOverrides(data: GameData, overrides: Record<string, number>): GameData {
  if (!Object.keys(overrides).length) return data;
  const out = structuredClone(data) as unknown as Record<string, unknown>;
  for (const [path, value] of Object.entries(overrides)) {
    const parts = path.split('.');
    let o = out;
    for (const p of parts.slice(0, -1)) {
      if (typeof o[p] !== 'object' || o[p] === null) throw new Error(`--param ${path}: no "${p}" in the data`);
      o = o[p] as Record<string, unknown>;
    }
    const last = parts[parts.length - 1]!;
    if (typeof o[last] !== 'number') throw new Error(`--param ${path}: not a number in the data`);
    o[last] = value;
  }
  return out as unknown as GameData;
}

export function runJobInline(job: Job): SeedStats[] | StorySeed[] {
  const data = applyOverrides(loadGameData(job.dataDir), job.overrides);
  return job.stories ? job.seeds.map((seed) => storySeed(data, seed, job.days)) : job.seeds.map((seed) => runSeed(data, seed, job.days));
}

export async function runJob(job: Job & { stories?: false }, threads?: number): Promise<SeedStats[]>;
export async function runJob(job: Job & { stories: true }, threads?: number): Promise<StorySeed[]>;
export async function runJob(job: Job, threads = availableParallelism()): Promise<SeedStats[] | StorySeed[]> {
  const n = Math.max(1, Math.min(threads, job.seeds.length));
  if (n === 1) return runJobInline(job);
  const chunks: number[][] = Array.from({ length: n }, () => []);
  job.seeds.forEach((s, i) => chunks[i % n]!.push(s));
  const parts = await Promise.all(
    chunks.map(
      (seeds) =>
        new Promise<(SeedStats | StorySeed)[]>((resolve, reject) => {
          const w = new Worker(new URL('./worker-boot.mjs', import.meta.url), { workerData: { ...job, seeds } });
          w.once('message', resolve);
          w.once('error', reject);
        }),
    ),
  );
  return parts.flat().sort((a, b) => a.seed - b.seed) as unknown as SeedStats[] | StorySeed[];
}
