import { fnv1a } from './hash';

/**
 * Notifications bloom as flowers on the hanging plant: one unread
 * notification, one flower. These are the places on the vines and leaves
 * where a flower can sit, in scene units (see `SCENE_WIDTH`). They are at
 * least 25 units apart so neighbouring flowers stay separate click targets,
 * and they keep clear of the pin board label below the plant.
 */
export const FLOWER_SLOTS: readonly {
  readonly x: number;
  readonly y: number;
}[] = [
  { x: 191, y: 128 },
  { x: 186, y: 157 },
  { x: 218, y: 162 },
  { x: 245, y: 181 },
  { x: 161, y: 191 },
  { x: 206, y: 205 },
  { x: 252, y: 225 },
  { x: 155, y: 237 },
  { x: 205, y: 231 },
  { x: 251, y: 251 },
  { x: 202, y: 257 },
  { x: 157, y: 286 },
];

/** drawn diameter of a flower in scene units */
export const FLOWER_SIZE = 22;

export type FlowerHue = 'terra' | 'gold' | 'cream';

export interface FlowerLook {
  readonly hue: FlowerHue;
  readonly petals: 5 | 6;
  /** degrees, so no two neighbours point the same way */
  readonly turn: number;
}

/**
 * The colour says what kind of notification it is: terracotta for people
 * speaking to you (mentions, comments), gold for invitations and requests,
 * cream for anything else.
 */
export function flowerHue(type: string): FlowerHue {
  const t = type.toLowerCase();
  if (t.includes('mention') || t.includes('comment')) return 'terra';
  if (t.includes('invitation')) return 'gold';
  return 'cream';
}

export function flowerLook(id: string, type: string): FlowerLook {
  const h = fnv1a(id);
  return {
    hue: flowerHue(type),
    petals: (h & 1) === 1 ? 5 : 6,
    turn: (h >>> 1) % 72,
  };
}

/**
 * Gives every unread notification a slot.
 *
 * A flower that is already on the plant keeps its slot, so reading one never
 * makes the others jump. A new notification goes to the slot its id hashes
 * to, or the next free one. `ids` come newest first, so when there are more
 * notifications than slots the oldest wait without a flower until one is
 * read and a slot frees up.
 */
export function assignSlots(
  ids: readonly string[],
  previous: ReadonlyMap<string, number>,
  capacity: number = FLOWER_SLOTS.length
): Map<string, number> {
  const slots = new Map<string, number>();
  const taken = new Set<number>();
  const unique = [...new Set(ids)];
  for (const id of unique) {
    const slot = previous.get(id);
    if (
      slot !== undefined &&
      slot >= 0 &&
      slot < capacity &&
      !taken.has(slot)
    ) {
      slots.set(id, slot);
      taken.add(slot);
    }
  }
  for (const id of unique) {
    if (slots.has(id) || taken.size >= capacity) continue;
    let slot = fnv1a(id) % capacity;
    while (taken.has(slot)) slot = (slot + 1) % capacity;
    slots.set(id, slot);
    taken.add(slot);
  }
  return slots;
}
