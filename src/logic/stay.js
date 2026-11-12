// Helpers for choosing where to stay.
import { distanceKm } from './geo.js';
import { legMinutes } from './transport.js';

// Ranks areas by how far they are from your days: for each day, the trip
// from the area to its first stop plus the trip back from its last stop.
//   areas: [{ id, lat, lng, ... }]
//   days:  [[place, ...], ...] the organised days (empty days are skipped)
// Returns [{ area, minutesPerDay }] quickest first. minutesPerDay is null
// when there are no planned days to compare against (areas keep their order).
export function rankAreas(areas, days) {
  const planned = days.filter((d) => d.length);
  if (!planned.length) return areas.map((area) => ({ area, minutesPerDay: null }));
  return areas
    .map((area) => {
      const total = planned.reduce((sum, d) => sum + commute(area, d[0]) + commute(d[d.length - 1], area), 0);
      return { area, minutesPerDay: total / planned.length };
    })
    .sort((a, b) => a.minutesPerDay - b.minutesPerDay);
}

function commute(a, b) {
  return legMinutes(distanceKm(a, b), 'auto');
}
