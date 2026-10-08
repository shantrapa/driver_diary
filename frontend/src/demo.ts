import { createTrip } from './api';
import type { Payment, Trip } from './types';

// Deterministic PRNG seeded by the date: the same day always yields the same trips,
// so pressing autofill again only produces duplicates (200), never new rows or 409s.
function rng(seed: string) {
  let h = 2166136261;
  for (const c of seed) h = Math.imul(h ^ c.charCodeAt(0), 16777619);
  return () => {
    h = Math.imul(h ^ (h >>> 15), 2246822507);
    h = Math.imul(h ^ (h >>> 13), 3266489909);
    return ((h ^= h >>> 16) >>> 0) / 2 ** 32;
  };
}

const pad = (n: number) => String(n).padStart(2, '0');
const at = (day: string, min: number) => `${day}T${pad(Math.floor(min / 60))}:${pad(min % 60)}:00+05:00`;

export function demoTripsForDay(day: string): Trip[] {
  const rand = rng(day);
  const int = (lo: number, hi: number) => lo + Math.floor(rand() * (hi - lo + 1));
  const trips: Trip[] = [];
  let t = int(7 * 60, 9 * 60); // shift starts 07:00–09:00
  const count = int(4, 9);
  for (let i = 1; i <= count && t < 22 * 60; i++) {
    const duration = int(10, 45);
    const amount = int(16, 100) * 50; // 800–5000 ₸
    trips.push({
      id: `demo-${day}-${pad(i)}`,
      start: at(day, t),
      end: at(day, t + duration),
      amount,
      payment: (rand() < 0.55 ? 'card' : 'cash') as Payment,
      commission: Math.round(amount * 0.15),
    });
    t += duration + int(10, 90);
  }
  return trips;
}

export function lastDays(endDay: string, n: number): string[] {
  const [y, m, d] = endDay.split('-').map(Number);
  return Array.from({ length: n }, (_, i) => new Date(Date.UTC(y, m - 1, d - i)).toISOString().slice(0, 10));
}

/** Posts demo trips one by one through the public API. Returns counts of created and already existing trips. */
export async function autofill(days: string[], onProgress: (done: number, total: number) => void) {
  const trips = days.flatMap(demoTripsForDay);
  let created = 0;
  let existing = 0;
  for (const [i, trip] of trips.entries()) {
    const { status } = await createTrip(trip);
    if (status === 201) created++;
    else existing++;
    onProgress(i + 1, trips.length);
  }
  return { created, existing };
}
