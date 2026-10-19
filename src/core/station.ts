// Indexes derived from the data: object instances, walking times, lookups. Computed once per
// GameData object and cached, so the world itself never holds copies of static definitions.
import type { ActionDef, GameData, RoomDef } from '../data/schema.js';

export interface ObjectInstance {
  id: string; // room:type:n
  type: string;
  room: string;
  capacity: number;
  actions: ActionDef[];
}

export interface Station {
  rooms: RoomDef[];
  room: Map<string, RoomDef>;
  roomIndex: Map<string, number>;
  walk: number[][]; // shortest walking minutes between room indexes
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

function build(data: GameData): Station {
  const rooms = data.rooms.rooms;
  const roomIndex = new Map(rooms.map((r, i) => [r.id, i]));
  const n = rooms.length;
  const walk = Array.from({ length: n }, (_, i) => Array.from({ length: n }, (_, j) => (i === j ? 0 : Infinity)));
  for (const [a, b, m] of data.rooms.links) {
    const i = roomIndex.get(a)!;
    const j = roomIndex.get(b)!;
    walk[i]![j] = Math.min(walk[i]![j]!, m);
    walk[j]![i] = Math.min(walk[j]![i]!, m);
  }
  for (let k = 0; k < n; k++)
    for (let i = 0; i < n; i++)
      for (let j = 0; j < n; j++) {
        const via = walk[i]![k]! + walk[k]![j]!;
        if (via < walk[i]![j]!) walk[i]![j] = via;
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
    walk,
    objects,
    object: new Map(objects.map((o) => [o.id, o])),
    objectsInRoom,
    personal: data.objects.personal,
    warmth: [0, 1, 2, 3, 4, 5, 6, 7].map((r) => data.clothing.byRank[String(r) as '1']?.warmth ?? 0),
  };
}

export function walkMinutes(s: Station, from: string, to: string): number {
  return s.walk[s.roomIndex.get(from)!]![s.roomIndex.get(to)!]!;
}
