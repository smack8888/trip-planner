// Transport modes and travel-time estimates for each leg between stops.
// These are rough rules of thumb (straight-line distance, typical speeds,
// plus waiting time), the same as in the prototype. A routing API can
// replace them later.
import { distanceKm } from './geo.js';

export const MODES = {
  walk: 'Walk',
  metro: 'Metro',
  bus: 'Bus',
  bike: 'Rental bike',
};

// Minutes for a leg of `km` kilometres in each mode.
const MINUTES = {
  walk: (km) => km * 16.25, // about 3.7 km/h along real streets
  bike: (km) => 4 + km * 5.57, // 4 min to pick up and drop the bike
  // 10 min to walk to the station and wait. Beyond 10 km you'd take a
  // regional train, which covers each extra km much faster.
  metro: (km) => 10 + Math.min(km, 10) * 3.9 + Math.max(0, km - 10) * 1.5,
  bus: (km) => 8 + km * 6.5, // 8 min waiting, slower in traffic
};

// 'auto' picks walking or the metro, whichever is quicker.
export function effectiveMode(km, mode) {
  if (MINUTES[mode]) return mode;
  return MINUTES.walk(km) <= MINUTES.metro(km) ? 'walk' : 'metro';
}

export function legMinutes(km, mode) {
  return MINUTES[effectiveMode(km, mode)](km);
}

// Total straight-line km for a day's stops, in order.
export function dayKm(stops, places) {
  let total = 0;
  for (let i = 1; i < stops.length; i++) {
    total += distanceKm(places[stops[i - 1].placeId], places[stops[i].placeId]);
  }
  return total;
}

// Total travel minutes for a day. The leg from stop i to stop i+1 uses
// stop i's mode. With ignoreChosenModes, every leg uses 'auto'
// (the optimiser does this so it compares orders fairly).
export function dayMinutes(stops, places, ignoreChosenModes = false) {
  let total = 0;
  for (let i = 1; i < stops.length; i++) {
    const km = distanceKm(places[stops[i - 1].placeId], places[stops[i].placeId]);
    total += legMinutes(km, ignoreChosenModes ? 'auto' : stops[i - 1].mode);
  }
  return total;
}

export function formatMinutes(n) {
  n = Math.round(n);
  if (n < 60) return `${n} min`;
  const h = Math.floor(n / 60);
  const m = n % 60;
  return m ? `${h} h ${String(m).padStart(2, '0')} min` : `${h} h`;
}
