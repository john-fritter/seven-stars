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
});
