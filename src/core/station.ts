// Indexes derived from the data: the floor plan, object instances, walking paths, sight lines and
// walls. Computed once per GameData object and cached, so the world itself never holds copies of
// static definitions.
import type { ActionDef, GameData, PlanDef, RoomDef } from '../data/schema.js';

export interface ObjectInstance {
  id: string; // room:type:n
  type: string;
  room: string;
  capacity: number;
  actions: ActionDef[];
}

export type Point = readonly [number, number];

/** A walk from one space to another: the points it passes, and the space between each pair. */
export interface Path {
  points: Point[]; // the start room's centre, each opening's midpoint, the end room's centre
  spaces: string[]; // spaces[i] lies between points[i] and points[i + 1]
  at: number[]; // cumulative distance at each point
  length: number;
}

export interface Station {
  rooms: RoomDef[]; // rooms.yaml's rooms, then the plan's corridors
  room: Map<string, RoomDef>;
  roomIndex: Map<string, number>;
  corridor: Set<string>;
  plan: PlanDef;
  rect: Map<string, readonly [number, number, number, number]>;
  walk: number[][]; // walking minutes between room indexes
  paths: (Path | null)[][];
  sees: boolean[][]; // [i][j]: someone in i can see what happens in j
  hears: boolean[][];
  walls: number[][]; // rooms that share a wall with each room, for noise (not corridors, not the soundproofed)
  objects: ObjectInstance[];
  object: Map<string, ObjectInstance>;
  objectsInRoom: Map<string, ObjectInstance[]>;
  personal: ActionDef[];
  warmth: number[]; // clothing warmth by rank (index 1..7)
}

const cache = new WeakMap<GameData, Station>();

export function station(data: GameData): Station {
  let s = cache.get(data);
  if (!s) {
    s = build(data);
    cache.set(data, s);
  }
  return s;
}

const dist = (a: Point, b: Point) => Math.hypot(a[0] - b[0], a[1] - b[1]);
const centre = ([x, y, w, h]: readonly number[]): Point => [x! + w! / 2, y! + h! / 2];
const mid = ([x1, y1, x2, y2]: readonly number[]): Point => [(x1! + x2!) / 2, (y1! + y2!) / 2];

function build(data: GameData): Station {
  const plan = data.plans.plans[data.plans.use]!;
  const cor = data.plans.corridor;
  const corridors: RoomDef[] = plan.corridors.map((c) => ({ id: c.id, name: c.name, access: 'all', privacy: cor.privacy, temperature: cor.temperature, comfort: cor.comfort, objects: {} }));
  const rooms = [...data.rooms.rooms, ...corridors];
  const roomIndex = new Map(rooms.map((r, i) => [r.id, i]));
  const rect = new Map<string, readonly [number, number, number, number]>([...Object.entries(plan.rooms), ...plan.corridors.map((c) => [c.id, c.rect] as const)]);
  const n = rooms.length;
  const corridor = new Set(plan.corridors.map((c) => c.id));
  const through = new Set([...plan.through, ...corridor]);

  // Walking: shortest paths along the openings, crossing only corridors and the `through` rooms
  // (other public rooms at a detour cost; never anywhere private).
  const walkable = plan.openings.filter((o) => o.kind !== 'glass');
  const crossCost = (id: string): number => {
    if (through.has(id)) return 1;
    const r = rooms[roomIndex.get(id)!]!;
    return r.access === 'all' || r.access === 'ranks' ? data.plans.detour : Infinity;
  };
  // A glass cell has no door of its own: walks start and end as if from the room round it.
  const hasDoor = new Set(walkable.flatMap((o) => [o.a, o.b]));
  const host = (id: string) => (hasDoor.has(id) ? id : (rooms[roomIndex.get(id)!]!.glass ?? id));
  function findPath(from: string, to: string): Path | null {
    const [fa, ta] = [host(from), host(to)];
    if (fa === ta) {
      const [a, b] = [centre(rect.get(from)!), centre(rect.get(to)!)];
      return { points: [a, b], spaces: [to], at: [0, dist(a, b)], length: dist(a, b) };
    }
    const p = search(fa, ta);
    if (!p) return null;
    p.points[0] = centre(rect.get(from)!);
    p.points[p.points.length - 1] = centre(rect.get(to)!);
    p.spaces[p.spaces.length - 1] = to;
    for (let i = 1; i < p.points.length; i++) p.at[i] = p.at[i - 1]! + dist(p.points[i - 1]!, p.points[i]!);
    p.length = p.at[p.at.length - 1]!;
    return p;
  }
  function search(from: string, to: string): Path | null {
    // States are (opening, the space on its far side). Dijkstra on the detour-weighted cost.
    type State = { o: number; space: string; cost: number; prev: State | null; via: string };
    const best = new Map<string, number>();
    const open: State[] = [];
    const start = centre(rect.get(from)!);
    walkable.forEach((o, i) => {
      if (o.a !== from && o.b !== from) return;
      open.push({ o: i, space: o.a === from ? o.b : o.a, cost: dist(start, mid(o.at)), prev: null, via: from });
    });
    let done: { state: State; cost: number } | null = null;
    while (open.length) {
      open.sort((x, y) => x.cost - y.cost);
      const s = open.shift()!;
      const key = `${s.o}|${s.space}`;
      if ((best.get(key) ?? Infinity) <= s.cost) continue;
      best.set(key, s.cost);
      if (done && s.cost >= done.cost) break;
      const p = mid(walkable[s.o]!.at);
      if (s.space === to) {
        const c = s.cost + dist(p, centre(rect.get(to)!));
        if (!done || c < done.cost) done = { state: s, cost: c };
        continue;
      }
      const k = crossCost(s.space);
      if (k === Infinity) continue;
      walkable.forEach((o, i) => {
        if (i === s.o || (o.a !== s.space && o.b !== s.space)) return;
        open.push({ o: i, space: o.a === s.space ? o.b : o.a, cost: s.cost + dist(p, mid(o.at)) * k, prev: s, via: s.space });
      });
    }
    if (!done) return null;
    const chain: State[] = [];
    for (let s: State | null = done.state; s; s = s.prev) chain.unshift(s);
    const points: Point[] = [start, ...chain.map((s) => mid(walkable[s.o]!.at)), centre(rect.get(to)!)];
    const spaces = [...chain.map((s) => s.via), to];
    const at = [0];
    for (let i = 1; i < points.length; i++) at.push(at[i - 1]! + dist(points[i - 1]!, points[i]!));
    return { points, spaces, at, length: at[at.length - 1]! };
  }
  const paths: (Path | null)[][] = rooms.map((from) => rooms.map((to) => (from === to ? null : findPath(from.id, to.id))));
  const walk = paths.map((row, i) =>
    row.map((p, j) => (i === j ? 0 : p ? Math.max(1, Math.round(p.length / data.plans.walkSpeed)) : Infinity)),
  );

  // Sight and sound: your own space, plus whatever an arch (both) or glass (sight) opens onto.
  const grid = (v: (i: number, j: number) => boolean) => rooms.map((_, i) => rooms.map((_, j) => v(i, j)));
  const sees = grid((i, j) => i === j);
  const hears = grid((i, j) => i === j);
  const join = (a: string, b: string, m: boolean[][]) => {
    const i = roomIndex.get(a)!;
    const j = roomIndex.get(b)!;
    m[i]![j] = m[j]![i] = true;
  };
  for (const o of plan.openings) {
    if (o.kind === 'arch' || o.kind === 'glass') join(o.a, o.b, sees);
    if (o.kind === 'arch') join(o.a, o.b, hears);
  }
  for (const r of rooms) if (r.glass) join(r.id, r.glass, sees); // a glass cell and the room round it

  // Walls: rooms whose rectangles share a stretch of edge at least a tile long.
  const quiet = new Set(data.plans.soundproof);
  const walls: number[][] = rooms.map(() => []);
  for (let i = 0; i < n; i++)
    for (let j = i + 1; j < n; j++) {
      const [a, b] = [rooms[i]!, rooms[j]!];
      if (quiet.has(a.id) || quiet.has(b.id) || corridor.has(a.id) || corridor.has(b.id) || a.glass === b.id || b.glass === a.id) continue;
      if (shared(rect.get(a.id)!, rect.get(b.id)!) >= 1) {
        walls[i]!.push(j);
        walls[j]!.push(i);
      }
    }

  const objects: ObjectInstance[] = [];
  const objectsInRoom = new Map<string, ObjectInstance[]>();
  for (const r of rooms) {
    const list: ObjectInstance[] = [];
    for (const [type, count] of Object.entries(r.objects)) {
      const def = data.objects.types[type]!;
      for (let k = 1; k <= count; k++) {
        const o = { id: `${r.id}:${type}:${k}`, type, room: r.id, capacity: def.capacity, actions: def.actions };
        list.push(o);
        objects.push(o);
      }
    }
    objectsInRoom.set(r.id, list);
  }

  return {
    rooms,
    room: new Map(rooms.map((r) => [r.id, r])),
    roomIndex,
    corridor,
    plan,
    rect,
    walk,
    paths,
    sees,
    hears,
    walls,
    objects,
    object: new Map(objects.map((o) => [o.id, o])),
    objectsInRoom,
    personal: data.objects.personal,
    warmth: [0, 1, 2, 3, 4, 5, 6, 7].map((r) => data.clothing.byRank[String(r) as '1']?.warmth ?? 0),
  };
}

/** How long a stretch of edge two rectangles share. */
function shared([x, y, w, h]: readonly number[], [X, Y, W, H]: readonly number[]): number {
  const span = (a0: number, a1: number, b0: number, b1: number) => Math.max(0, Math.min(a1, b1) - Math.max(a0, b0));
  if (x! + w! === X || X! + W! === x) return span(y!, y! + h!, Y!, Y! + H!);
  if (y! + h! === Y || Y! + H! === y) return span(x!, x! + w!, X!, X! + W!);
  return 0;
}

export function walkMinutes(s: Station, from: string, to: string): number {
  return s.walk[s.roomIndex.get(from)!]![s.roomIndex.get(to)!]!;
}

/** Where along the walk from `from` to `to` someone is, `f` of the way (0..1): the space, and the point. */
export function along(s: Station, from: string, to: string, f: number): { space: string; at: Point } | null {
  const p = s.paths[s.roomIndex.get(from)!]![s.roomIndex.get(to)!];
  if (!p) return null;
  const d = Math.max(0, Math.min(1, f)) * p.length;
  let i = 0;
  while (i < p.spaces.length - 1 && p.at[i + 1]! < d) i++;
  const seg = p.at[i + 1]! - p.at[i]!;
  const k = seg > 0 ? (d - p.at[i]!) / seg : 0;
  const [a, b] = [p.points[i]!, p.points[i + 1]!];
  return { space: p.spaces[i]!, at: [a[0] + (b[0] - a[0]) * k, a[1] + (b[1] - a[1]) * k] };
}

/** Someone in room `from` can see what happens in room `to`. */
export function canSee(s: Station, from: string, to: string): boolean {
  return from === to || s.sees[s.roomIndex.get(from)!]![s.roomIndex.get(to)!]!;
}

/** Someone in room `from` can hear what's said in room `to`. */
export function canHear(s: Station, from: string, to: string): boolean {
  return from === to || s.hears[s.roomIndex.get(from)!]![s.roomIndex.get(to)!]!;
}

/** The rooms through the wall from `room`. */
export function nextDoor(s: Station, room: string): string[] {
  return s.walls[s.roomIndex.get(room)!]!.map((j) => s.rooms[j]!.id);
}
