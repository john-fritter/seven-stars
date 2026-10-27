import { readFileSync } from 'node:fs';
import { describe, expect, it } from 'vitest';
import { DataError, parseGameData } from '../src/data/load.js';

const real = (name: string) => readFileSync(`./data/${name}.yaml`, 'utf8');

describe('data loading', () => {
  it('loads the real data', () => {
    expect(() => parseGameData(real)).not.toThrow();
  });

  it('names the file and field when a value is wrong', () => {
    const read = (name: string) => (name === 'needs' ? real(name).replace('drainPerHour: 6,', 'drainPerHour: "six",') : real(name));
    expect(() => parseGameData(read)).toThrow(DataError);
    expect(() => parseGameData(read)).toThrow(/data\/needs\.yaml: needs\.hunger\.drainPerHour/);
  });

  it('catches references to things that do not exist', () => {
    const read = (name: string) => (name === 'ranks' ? real(name).replace('"dorm:bed_dorm:3"', '"dorm:bed_dorm:9"') : real(name));
    expect(() => parseGameData(read)).toThrow(/ranks\.yaml: ranks\.6\.bed/);
  });

  it('checks the floor plans: openings on shared walls, no overlaps, every room reachable', () => {
    const swap = (from: string, to: string) => (name: string) => (name === 'plans' ? real(name).replace(from, to) : real(name));
    expect(() => parseGameData(swap('at: [20, 12, 30, 12]', 'at: [20, 11, 30, 11]'))).toThrow(/plans\.ring\.openings\.0: .* isn't on a wall "lounge" and "ring_n" share/);
    expect(() => parseGameData(swap('garden: [0, 0, 12, 22]', 'garden: [0, 0, 16, 22]'))).toThrow(/"lounge" and "garden" overlap/);
    expect(() => parseGameData(swap('      - { a: dorm, b: ring_s, kind: door, at: [40, 40, 42.5, 40] }\n', ''))).toThrow(/plans\.ring: nobody can walk to "dorm"/);
    expect(() => parseGameData(swap('use: ring', 'use: maze'))).toThrow(/use: no plan "maze"/);
  });
});
