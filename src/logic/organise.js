// Turns a list of picked places into a day-by-day itinerary that fits the
// time available.
//
// How it works:
//   1. Places come in priority order (most famous first). If they can't all
//      fit, we leave out the lowest-priority ones and report them as
//      "didn't fit".
//   2. To group nearby places on the same day, we sort places by their
//      direction from the middle of the city (like a clock hand sweeping
//      round) and cut that circle into one slice per day, each slice sized
//      to that day's time. We try every starting point (both ways round)
//      and keep the grouping with the least total travel.
//   3. Each day's stops are then put in the quickest order using the same
//      optimiser as the planner.
//
// Time for a day = visit lengths + travel between stops (straight-line
// estimate, walking or metro, whichever is quicker). It must stay within
// the day's budget.
//
// DAYS CAN DIFFER. Each day is described by a "frame":
//   { budget, start, end }
//     budget  minutes available, travel included
//     start   where the day starts ({ lat, lng }), or null
//     end     where it ends, or null
// Usually start and end are where you stay (a loop out and back). The first
// day can be shorter and start at the airport or station you arrive at; the
// last day can be cut short by your departure. See logic/travel.js.
import { distanceKm } from './geo.js';
import { legMinutes } from './transport.js';
import { optimiseDay, MAX_FREE_STOPS } from './optimise.js';

// Rough travel time added per place while slicing the circle, before
// we know the real order. The real check afterwards uses actual legs.
const SLICE_TRAVEL_ALLOWANCE = 15;

// Same-sized days: `dayCount` days of `hoursPerDay`, each a loop from `base`.
export function evenFrames(dayCount, hoursPerDay, base = null) {
  return Array.from({ length: dayCount }, () => ({ budget: hoursPerDay * 60, start: base, end: base }));
}

// places: [{ id, lat, lng, visitHours }] in priority order
// Either organiseTrip(places, frames)
//     or organiseTrip(places, dayCount, hoursPerDay, base)   (all days the same)
// Returns { days: [[placeId, ...], ...], unscheduled: [placeId, ...] }
export function organiseTrip(places, framesOrCount, hoursPerDay, base = null) {
  const frames = Array.isArray(framesOrCount) ? framesOrCount : evenFrames(framesOrCount, hoursPerDay, base);
  const unscheduled = [];
  // A place that doesn't fit into any day on its own can never fit.
  let chosen = places.filter((p) => {
    if (frames.some((f) => dayLoadMinutes([p], f.start, f.end) <= f.budget)) return true;
    unscheduled.push(p.id);
    return false;
  });

  while (chosen.length) {
    const groups = bestSplit(chosen, frames);
    if (groups) {
      const days = groups.map((g, d) => finalOrder(g, frames[d]).map((p) => p.id));
      return { days, unscheduled: sortByPriority(unscheduled, places) };
    }
    // Doesn't fit: drop the lowest-priority place and try again.
    unscheduled.push(chosen[chosen.length - 1].id);
    chosen = chosen.slice(0, -1);
  }
  return { days: frames.map(() => []), unscheduled: sortByPriority(unscheduled, places) };
}

// Minutes a day takes: visits plus travel between consecutive stops, plus
// the trip from `start` to the first stop and from the last stop to `end`.
// dayLoadMinutes(ordered, base) is a loop from and back to base.
export function dayLoadMinutes(ordered, start = null, end = start) {
  return ordered.reduce((sum, p) => sum + p.visitHours * 60, 0) + travelMinutes(ordered, start, end);
}

// ---------- step 2: slice into days ----------
function bestSplit(places, frames) {
  const totalBudget = frames.reduce((s, f) => s + Math.max(0, f.budget), 0);
  if (totalBudget <= 0) return null;
  const need = places.reduce((s, p) => s + p.visitHours * 60 + SLICE_TRAVEL_ALLOWANCE, 0);
  // Each day's fair share, in proportion to the time it has.
  const targets = frames.map((f) => (need * Math.max(0, f.budget)) / totalBudget);
  const sorted = sortByDirection(places);
  let best = null;
  let bestTravel = Infinity;

  for (const circle of [sorted, [...sorted].reverse()]) {
    for (let start = 0; start < circle.length; start++) {
      const sequence = [...circle.slice(start), ...circle.slice(0, start)];
      const groups = slice(sequence, frames, targets);
      if (!groups) continue;
      const ordered = groups.map((g, d) => quickOrder(g, frames[d]));
      if (ordered.some((g, d) => dayLoadMinutes(g, frames[d].start, frames[d].end) > frames[d].budget)) continue;
      const travel = ordered.reduce((s, g, d) => s + travelMinutes(g, frames[d].start, frames[d].end), 0);
      if (travel < bestTravel) {
        bestTravel = travel;
        best = ordered;
      }
    }
  }
  return best;
}

// Walk round the circle filling the days in order. Move on to the next day
// when the current one reaches its fair share (or would go over budget).
// A day too short for the next place is skipped and left free.
function slice(sequence, frames, targets) {
  const groups = frames.map(() => []);
  let d = 0;
  let load = 0;
  for (const p of sequence) {
    const cost = p.visitHours * 60 + SLICE_TRAVEL_ALLOWANCE;
    for (;;) {
      const isLast = d === frames.length - 1;
      const fits = load + cost <= frames[d].budget;
      const wantsIt = groups[d].length === 0 || load + cost / 2 <= targets[d];
      if (fits && (wantsIt || isLast)) {
        groups[d].push(p);
        load += cost;
        break;
      }
      if (isLast) return null; // out of days
      d += 1;
      load = 0;
    }
  }
  return groups;
}

function sortByDirection(places) {
  const lat = places.reduce((s, p) => s + p.lat, 0) / places.length;
  const lng = places.reduce((s, p) => s + p.lng, 0) / places.length;
  const squash = Math.cos((lat * Math.PI) / 180); // longitude degrees are shorter away from the equator
  const angle = (p) => Math.atan2(p.lat - lat, (p.lng - lng) * squash);
  return [...places].sort((a, b) => angle(a) - angle(b));
}

// ---------- step 3: order each day ----------
// Fast "nearest next place" order, used while comparing groupings.
// Tries each place as the start and keeps the shortest route.
function quickOrder(group, frame) {
  if (group.length < 2) return group;
  let best = group;
  let bestTravel = Infinity;
  for (const first of group) {
    const route = [first];
    const left = group.filter((p) => p !== first);
    while (left.length) {
      const last = route[route.length - 1];
      let k = 0;
      for (let j = 1; j < left.length; j++) {
        if (distanceKm(last, left[j]) < distanceKm(last, left[k])) k = j;
      }
      route.push(left.splice(k, 1)[0]);
    }
    const t = travelMinutes(route, frame.start, frame.end);
    if (t < bestTravel) {
      bestTravel = t;
      best = route;
    }
  }
  return best;
}

// Exact quickest order with the planner's optimiser, when the day is small
// enough. The day's start and end are added as fixed first and last stops,
// so the optimiser finds the quickest route between them.
function finalOrder(group, frame) {
  if (group.length < 2 || group.length > MAX_FREE_STOPS) return group;
  const START = '__start__';
  const END = '__end__';
  const byId = Object.fromEntries(group.map((p) => [p.id, p]));
  const stop = (placeId, fixed) => ({ placeId, fixed, time: '', mode: 'auto', line: '' });
  let stops = group.map((p) => stop(p.id, false));
  if (frame.start) {
    byId[START] = frame.start;
    stops = [stop(START, true), ...stops];
  }
  if (frame.end) {
    byId[END] = frame.end;
    stops = [...stops, stop(END, true)];
  }
  const result = optimiseDay(stops, byId);
  return result.stops.filter((s) => s.placeId !== START && s.placeId !== END).map((s) => byId[s.placeId]);
}

function travelMinutes(ordered, start = null, end = null) {
  if (!ordered.length) return 0;
  const route = [...(start ? [start] : []), ...ordered, ...(end ? [end] : [])];
  let total = 0;
  for (let i = 1; i < route.length; i++) {
    total += legMinutes(distanceKm(route[i - 1], route[i]), 'auto');
  }
  return total;
}

function sortByPriority(ids, places) {
  const rank = new Map(places.map((p, i) => [p.id, i]));
  return [...ids].sort((a, b) => rank.get(a) - rank.get(b));
}
