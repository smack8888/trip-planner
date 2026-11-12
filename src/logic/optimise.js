// Route optimiser for one day.
//
// Rule: fixed stops keep their exact position in the day. Only the unfixed
// stops are reordered, into the empty positions around the fixed ones.
// We try every possible order of the unfixed stops and keep the quickest.
// That is exact, and fast enough for up to MAX_FREE_STOPS stops (8! = 40,320 orders).
import { dayMinutes } from './transport.js';

export const MAX_FREE_STOPS = 8;

// Returns { status, stops, beforeMinutes, afterMinutes }.
// status is one of:
//   'improved'      a quicker order was found; `stops` is the new order
//   'already-best'  the current order is already the quickest
//   'too-few'       fewer than 2 unfixed stops, nothing to reorder
//   'too-many'      more than MAX_FREE_STOPS unfixed stops
// The input array is never changed.
export function optimiseDay(stops, places) {
  const freePositions = [];
  stops.forEach((s, i) => {
    if (!s.fixed) freePositions.push(i);
  });

  const beforeMinutes = dayMinutes(stops, places, true);
  const result = (status, newStops = stops, afterMinutes = beforeMinutes) => ({
    status,
    stops: newStops,
    beforeMinutes,
    afterMinutes,
  });

  if (freePositions.length < 2) return result('too-few');
  if (freePositions.length > MAX_FREE_STOPS) return result('too-many');

  const freeStops = freePositions.map((i) => stops[i]);
  let best = null;
  let bestMinutes = Infinity;

  for (const order of permutations(freeStops)) {
    const candidate = stops.slice();
    freePositions.forEach((pos, j) => {
      candidate[pos] = order[j];
    });
    const minutes = dayMinutes(candidate, places, true);
    if (minutes < bestMinutes - 1e-9) {
      bestMinutes = minutes;
      best = candidate;
    }
  }

  // Only report a change if it saves at least a minute.
  if (bestMinutes >= beforeMinutes - 1) return result('already-best');

  // Legs now join different places, so chosen modes no longer apply.
  const newStops = best.map((s) => ({ ...s, mode: 'auto', line: '' }));
  return result('improved', newStops, bestMinutes);
}

// Every ordering of an array, e.g. [a,b] -> [a,b], [b,a].
function* permutations(items) {
  if (items.length <= 1) {
    yield items;
    return;
  }
  for (let i = 0; i < items.length; i++) {
    const rest = [...items.slice(0, i), ...items.slice(i + 1)];
    for (const p of permutations(rest)) yield [items[i], ...p];
  }
}
