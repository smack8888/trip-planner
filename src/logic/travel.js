// Getting to the city and back, and what that means for the first and last day.
//
// FIRST DAY: you arrive (say a flight landing at 11:30), get out of the
// airport, take the usual transfer into the city, and go to where you stay
// to drop your bags. Sightseeing starts from there, not before the day's
// normal start (e.g. 9:00 at a packed pace).
//
// LAST DAY: you need to be at the airport or station some time before you
// leave (2 hours for a flight), so you must collect your bags and leave
// where you stay early enough to make the transfer. Sightseeing stops then.
//
// All the allowances below are ROUGH planning guesses, not timetables.
import { distanceKm } from './geo.js';
import { legMinutes, effectiveMode } from './transport.js';

// pointKind: which arrival points suit the mode (see arrivalPoints in data/destinations.js)
// arriveBuffer: minutes from arriving to being out (bags, passport control, finding the exit)
// departBuffer: minutes to be there before leaving
export const TRAVEL_MODES = {
  flight: { label: 'Flight', icon: '✈', pointKind: 'airport', arriveBuffer: 45, departBuffer: 120, numberLabel: 'Flight number' },
  train: { label: 'Train', icon: '🚆', pointKind: 'station', arriveBuffer: 10, departBuffer: 30, numberLabel: 'Train number' },
  coach: { label: 'Coach', icon: '🚌', pointKind: 'coach', arriveBuffer: 10, departBuffer: 30, numberLabel: 'Coach number' },
  car: { label: 'Car', icon: '🚗', pointKind: null, arriveBuffer: 20, departBuffer: 0, numberLabel: '' },
  other: { label: 'Other', icon: '➜', pointKind: null, arriveBuffer: 10, departBuffer: 30, numberLabel: '' },
};

// The airports or stations that suit a mode, e.g. airports for a flight.
export function pointsFor(dest, mode) {
  const kind = TRAVEL_MODES[mode]?.pointKind;
  return kind ? dest.arrivalPoints.filter((p) => p.kind === kind) : [];
}

// '11:30' -> 690 minutes after midnight, or null.
export function toMinutes(time) {
  const m = /^(\d{2}):(\d{2})$/.exec(time ?? '');
  return m ? Number(m[1]) * 60 + Number(m[2]) : null;
}

// Clock text that stays sensible past midnight or before it.
export function clockText(minutes) {
  const m = ((Math.round(minutes) % 1440) + 1440) % 1440;
  return `${String(Math.floor(m / 60)).padStart(2, '0')}:${String(m % 60).padStart(2, '0')}`;
}

// A trip across the city: { km, minutes, mode }.
export function cityLeg(a, b) {
  const km = distanceKm(a, b);
  return { km, minutes: legMinutes(km, 'auto'), mode: effectiveMode(km, 'auto') };
}

// One frame per day for the organiser (see logic/organise.js), plus what
// the timetable needs to show the arrival and departure:
//   { budget, start, end, startClock, endBy, arrival, departure }
// dayCount: days in the trip; pace: { startHour, hours }; home: where you stay or null;
// travel: { arrival, departure } from the trip; dest: the destination data;
// routes: optional real routes for the transfers, { arrival, departure } (see
// transferRoute), used instead of the rough guesses.
export function dayFrames({ dayCount, pace, home, travel, dest, routes = {} }) {
  const dayStart = pace.startHour * 60;
  const dayEnd = dayStart + pace.hours * 60;
  const frames = Array.from({ length: dayCount }, () => ({
    start: home, end: home, startClock: dayStart, endBy: dayEnd, arrival: null, departure: null,
  }));
  if (!frames.length) return frames;

  const arrival = arrivalPlan(travel?.arrival, home, dest, routes.arrival);
  if (arrival) {
    const first = frames[0];
    first.arrival = arrival;
    first.start = arrival.startPlace;
    first.startClock = Math.max(dayStart, arrival.ready);
  }
  const departure = departurePlan(travel?.departure, home, dest, routes.departure);
  if (departure) {
    const last = frames[frames.length - 1];
    last.departure = departure;
    last.end = departure.endPlace;
    last.endBy = Math.min(dayEnd, departure.leaveBy);
  }
  frames.forEach((f) => {
    f.budget = Math.max(0, f.endBy - f.startClock);
  });
  return frames;
}

// The first day's arrival, step by step (all times in minutes after midnight):
//   arrives  the flight lands / train arrives
//   out      out of the airport or station
//   atHub    in the city (airports only: after the transfer)
//   toHome   the trip from there to where you stay, { km, minutes, mode }
//   ready    at where you stay with bags dropped, or in the city if we don't know where you stay
//   route    the real route from the airport or station to where you stay, if
//            we have one (then atHub and toHome are null: no guesses needed)
export function arrivalPlan(leg, home, dest, route = null) {
  const arrives = toMinutes(leg?.time);
  if (arrives == null || !TRAVEL_MODES[leg.mode]) return null;
  const mode = TRAVEL_MODES[leg.mode];
  const point = dest.arrivalPoints.find((p) => p.id === leg.pointId) ?? null;
  const hub = point ? point.hub ?? point : null;
  const out = arrives + mode.arriveBuffer;
  const startPlace = home ?? (hub ? { name: hub.name, lat: hub.lat, lng: hub.lng } : null);
  if (route && point && home) {
    return { leg, mode, point, hub, arrives, out, atHub: null, toHome: null, route, ready: out + route.minutes, startPlace };
  }
  const atHub = point ? out + (point.transferMinutes ?? 0) : null;
  const toHome = home && hub ? cityLeg(hub, home) : null;
  const ready = (atHub ?? out) + (toHome?.minutes ?? 0);
  return { leg, mode, point, hub, arrives, out, atHub, toHome, route: null, ready, startPlace };
}

// The last day's departure, step by step:
//   departs   the flight / train leaves
//   beAt      be at the airport or station by then
//   leaveHub  leave the city for the airport (airports only)
//   fromHome  the trip from where you stay to the station or hub, { km, minutes, mode }
//   leaveBy   leave where you stay (with your bags) by then; sightseeing ends before
//   route     the real route from where you stay to the airport or station,
//             arriving by beAt, if we have one (then leaveHub and fromHome are null)
export function departurePlan(leg, home, dest, route = null) {
  const departs = toMinutes(leg?.time);
  if (departs == null || !TRAVEL_MODES[leg.mode]) return null;
  const mode = TRAVEL_MODES[leg.mode];
  const point = dest.arrivalPoints.find((p) => p.id === leg.pointId) ?? null;
  const hub = point ? point.hub ?? point : null;
  const beAt = departs - mode.departBuffer;
  const endPlace = home ?? (hub ? { name: hub.name, lat: hub.lat, lng: hub.lng } : null);
  if (route && point && home) {
    return { leg, mode, point, hub, departs, beAt, leaveHub: null, fromHome: null, route, leaveBy: beAt - route.minutes, endPlace };
  }
  const leaveHub = point ? beAt - (point.transferMinutes ?? 0) : null;
  const fromHome = home && hub ? cityLeg(home, hub) : null;
  const leaveBy = (leaveHub ?? beAt) - (fromHome?.minutes ?? 0);
  return { leg, mode, point, hub, departs, beAt, leaveHub, fromHome, route: null, leaveBy, endPlace };
}

// Which real route a transfer needs, or null if it can't have one (no
// airport or station chosen, or we don't know where you stay).
//   arriving: from the airport/station to where you stay, leaving when you're out
//   leaving:  from where you stay to the airport/station, arriving by beAt
// plan: from arrivalPlan or departurePlan; home: where you stay, or null.
// -> { from, to, clock, arriveBy }
export function transferRoute(plan, which, home) {
  if (!plan?.point || !home || plan.point.lat == null) return null;
  return which === 'arrival'
    ? { from: plan.point, to: home, clock: plan.out, arriveBy: false }
    : { from: home, to: plan.point, clock: plan.beAt, arriveBy: true };
}
