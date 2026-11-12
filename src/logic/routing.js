// Helpers for real routes (the routes themselves come from Transitous,
// through our dev server: see server/transitous.js). No screen code here.
import { parseDate } from './dates.js';

const DAY_MS = 24 * 60 * 60 * 1000;
// Published timetables usually cover the next few months. For days further
// away we use a stand-in day (see timetableDate).
const TIMETABLE_DAYS_AHEAD = 60;

// A route's shape, written in Google's "encoded polyline" format (which
// Transitous also uses), -> [[lat, lng], ...] for the map.
// precision: decimal places in the encoding (Transitous says which, usually 6 or 7).
export function decodePolyline(points, precision = 6) {
  const factor = 10 ** precision;
  const out = [];
  let index = 0;
  let lat = 0;
  let lng = 0;
  const next = () => {
    let result = 0;
    let shift = 0;
    let byte;
    do {
      byte = points.charCodeAt(index++) - 63;
      result |= (byte & 0x1f) << shift;
      shift += 5;
    } while (byte >= 0x20 && index < points.length + 1);
    return result & 1 ? ~(result >> 1) : result >> 1;
  };
  while (index < points.length) {
    lat += next();
    lng += next();
    out.push([lat / factor, lng / factor]);
  }
  return out;
}

// Which date's timetable to use for a trip day.
// Timetables only exist a few months ahead, so for a day further away (or
// already past) we use the next same weekday from today: a Sunday trip
// day gets a Sunday timetable, with Sunday services.
//   -> { date: 'YYYY-MM-DD', standIn: true if it isn't the real day }
export function timetableDate(tripIso, todayIso) {
  const trip = parseDate(tripIso);
  const today = parseDate(todayIso);
  const ahead = (trip - today) / DAY_MS;
  if (ahead >= 0 && ahead <= TIMETABLE_DAYS_AHEAD) return { date: tripIso, standIn: false };
  const shift = ((trip.getUTCDay() - today.getUTCDay() + 7) % 7) || 7; // 1 to 7 days from today
  return { date: new Date(today.getTime() + shift * DAY_MS).toISOString().slice(0, 10), standIn: true };
}

// A local clock time in a city -> the exact moment, as Google wants it.
//   zonedIso('2026-11-15', 600, 'Europe/Rome') -> '2026-11-15T09:00:00.000Z' (10:00 in Rome, winter time)
export function zonedIso(dateIso, minutes, timeZone) {
  const [y, mo, d] = dateIso.split('-').map(Number);
  const wanted = Date.UTC(y, mo - 1, d, 0, Math.round(minutes));
  // Guess, see what clock time that is in the city, and correct. Twice, in
  // case the guess crossed a summer/winter time change.
  let guess = wanted;
  for (let i = 0; i < 2; i++) guess += wanted - localClock(guess, timeZone);
  return new Date(guess).toISOString();
}

// The city's wall-clock time at a moment, written as if it were UTC.
function localClock(ms, timeZone) {
  const parts = Object.fromEntries(
    new Intl.DateTimeFormat('en-GB', {
      timeZone, hourCycle: 'h23', year: 'numeric', month: '2-digit', day: '2-digit', hour: '2-digit', minute: '2-digit',
    }).formatToParts(new Date(ms)).map((p) => [p.type, p.value]),
  );
  return Date.UTC(Number(parts.year), Number(parts.month) - 1, Number(parts.day), Number(parts.hour), Number(parts.minute));
}

// Today's date in the given time zone, 'YYYY-MM-DD'.
export function todayIn(timeZone, now = new Date()) {
  return new Date(localClock(now.getTime(), timeZone)).toISOString().slice(0, 10);
}

// A name for a leg's route, so the same leg isn't asked for twice on one page.
export function legKey(a, b, date) {
  const p = (x) => `${x.lat.toFixed(5)},${x.lng.toFixed(5)}`;
  return `${p(a)}>${p(b)}@${date}`;
}

// '1.4 km' or '350 m'
export function formatDistance(metres) {
  return metres >= 1000 ? `${(metres / 1000).toFixed(1)} km` : `${Math.max(10, Math.round(metres / 10) * 10)} m`;
}
