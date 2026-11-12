// Real routes between two places, from Transitous (https://transitous.org),
// a free public transport route planner run by volunteers on the open-source
// MOTIS software. Walking routes follow OpenStreetMap streets; public
// transport uses the cities' published timetables (GTFS).
//
// This file runs in the dev server (Node), not in the browser.
//
// Transitous usage policy (https://transitous.org/api/), which we follow:
//   - open-source, non-commercial projects only;
//   - every request says who we are: app name, version and a contact
//     (User-Agent header; the contact comes from TRANSITOUS_CONTACT in .env);
//   - keep it light: they ask to be contacted above about 720 route
//     requests a day. We send at most 2 at a time and remember answers
//     for a day, so the same leg is never asked for twice;
//   - show a link to https://transitous.org/sources/ and the
//     OpenStreetMap credit (done on the itinerary page).

const ENDPOINT = 'https://api.transitous.org/api/v6/plan';
const MAX_AT_ONCE = 2;
const REMEMBER_MS = 24 * 60 * 60 * 1000; // one day
const MAX_WALK_SECONDS = 60 * 60; // offer walking routes up to an hour

export class RouteError extends Error {
  constructor(message, status = 502) {
    super(message);
    this.status = status;
  }
}

// Checks what the page asked for:  ?from=lat,lng&to=lat,lng&departure=ISO
export function checkRouteQuery(params) {
  const from = latLng(params.get('from'));
  const to = latLng(params.get('to'));
  if (!from || !to) throw new RouteError('Missing or invalid from/to location.', 400);
  const text = params.get('departure') ?? '';
  if (!/^\d{4}-\d{2}-\d{2}T\d{2}:\d{2}(:\d{2}(\.\d+)?)?Z$/.test(text) || Number.isNaN(Date.parse(text))) {
    throw new RouteError('Missing or invalid departure time.', 400);
  }
  return { from, to, departure: new Date(text).toISOString() };
}

function latLng(text) {
  const parts = (text ?? '').split(',').map(Number);
  if (parts.length !== 2 || !parts.every(Number.isFinite)) return null;
  const [lat, lng] = parts;
  return Math.abs(lat) <= 90 && Math.abs(lng) <= 180 ? { lat, lng } : null;
}

// 'TripPlanner/0.1.0 (+https://github.com/someone/trip-planner)'
export function userAgent(version, contact) {
  return `TripPlanner/${version} (+${contact})`;
}

// A planner with its own memory and its own "2 at a time" queue.
//   settings: { userAgent, fetchImpl, now }
export function createPlanner(settings) {
  const { fetchImpl = fetch, now = () => new Date() } = settings;
  const remembered = new Map(); // key -> { at, result }
  let running = 0;
  const waiting = [];

  async function turn(job) {
    if (running >= MAX_AT_ONCE) await new Promise((go) => waiting.push(go));
    running++;
    try {
      return await job();
    } finally {
      running--;
      waiting.shift()?.();
    }
  }

  return async function plan(query) {
    const key = `${query.from.lat},${query.from.lng}>${query.to.lat},${query.to.lng}@${query.departure}`;
    const kept = remembered.get(key);
    if (kept && now() - kept.at < REMEMBER_MS) return kept.result;
    const result = await turn(() => fetchPlan(query, { ...settings, fetchImpl, now: now() }));
    remembered.set(key, { at: now(), result });
    return result;
  };
}

// Asks Transitous for routes from a to b leaving at a time.
// One request gives both the walking route and public transport options.
export async function fetchPlan({ from, to, departure }, { userAgent: ua, fetchImpl = fetch, now = new Date() }) {
  const query = new URLSearchParams({
    fromPlace: `${from.lat},${from.lng}`,
    toPlace: `${to.lat},${to.lng}`,
    time: departure,
    timetableView: 'false', // just the next departures after our time
    directModes: 'WALK',
    maxDirectTime: String(MAX_WALK_SECONDS),
    detailedLegs: 'true', // the shape of each leg, for the map
    language: 'en',
  });

  let response;
  try {
    response = await fetchImpl(`${ENDPOINT}?${query}`, {
      headers: { 'User-Agent': ua, Accept: 'application/json' },
    });
  } catch {
    throw new RouteError('Could not reach Transitous. Check your internet connection.');
  }
  let json = null;
  try {
    json = await response.json();
  } catch {
    // handled below
  }
  if (!response.ok) {
    const detail = typeof json?.error === 'string' ? ` It says: ${json.error}` : '';
    throw new RouteError(`Transitous could not give a route (error ${response.status}).${detail}`);
  }
  return parsePlan(json ?? {}, departure, now);
}

// Transitous's answer -> { route, fetchedAt }: the quicker of walking and
// public transport, counted from when we want to leave (so waiting for the
// next metro counts). route is null if there's neither.
//   route: { mode: 'walk'|'transit', distanceM, minutes, segments }
//   segment (walking):   { kind: 'walk', distanceM, minutes, paths }
//   segment (transport): { kind: 'transit', vehicle, line, lineName, colour, textColour,
//                          headsign, agency, from, to, stops, minutes, paths }
//   paths: [{ points, precision }]: the route's shape (Google's polyline encoding).
export function parsePlan(json, departure, now = new Date()) {
  const fetchedAt = now.toISOString();
  const leave = Date.parse(departure);
  const options = [];

  for (const it of json.direct ?? []) {
    const route = toRoute(it);
    if (route) options.push({ route, minutes: route.minutes });
  }
  for (const it of json.itineraries ?? []) {
    const route = toRoute(it);
    const end = Date.parse(it.endTime);
    if (!route || !Number.isFinite(end)) continue;
    // From when we want to leave until we arrive, including any wait.
    route.minutes = Math.max(route.minutes, (end - leave) / 60000);
    options.push({ route, minutes: route.minutes });
  }
  // Quickest first; walking wins a tie (it's listed first).
  options.sort((a, b) => a.minutes - b.minutes);
  return { route: options[0]?.route ?? null, fetchedAt };
}

function toRoute(itinerary) {
  const segments = [];
  for (const leg of itinerary.legs ?? []) {
    const minutes = (Number(leg.duration) || 0) / 60;
    const path = leg.legGeometry?.points ? [{ points: leg.legGeometry.points, precision: leg.legGeometry.precision ?? 6 }] : [];
    if (leg.mode === 'WALK') {
      const last = segments[segments.length - 1];
      if (last?.kind === 'walk') {
        last.distanceM += Number(leg.distance) || 0;
        last.minutes += minutes;
        last.paths.push(...path);
      } else {
        segments.push({ kind: 'walk', distanceM: Number(leg.distance) || 0, minutes, paths: path });
      }
    } else {
      segments.push({
        kind: 'transit',
        vehicle: VEHICLES[leg.mode] ?? 'Public transport',
        line: leg.routeShortName || leg.routeLongName || '',
        lineName: leg.routeLongName ?? '',
        colour: hexColour(leg.routeColor),
        textColour: hexColour(leg.routeTextColor),
        // Where the train or bus ends: what the platform signs show. (The
        // headsign field is sometimes an internal code, like "SOSO" on the RER.)
        headsign: leg.tripTo?.name || leg.headsign || '',
        agency: leg.agencyName ?? '',
        from: stop(leg.from),
        to: stop(leg.to),
        stops: Array.isArray(leg.intermediateStops) ? leg.intermediateStops.length + 1 : null,
        minutes,
        paths: path,
      });
    }
  }
  if (!segments.length) return null;
  return {
    mode: segments.some((s) => s.kind === 'transit') ? 'transit' : 'walk',
    distanceM: segments.reduce((sum, s) => sum + (s.distanceM ?? 0), 0),
    minutes: (Number(itinerary.duration) || 0) / 60 || segments.reduce((sum, s) => sum + s.minutes, 0),
    segments,
  };
}

// Transitous's transport kinds, in everyday words.
const VEHICLES = {
  SUBWAY: 'Metro', METRO: 'Metro', TRAM: 'Tram', BUS: 'Bus', COACH: 'Coach', FERRY: 'Boat',
  SUBURBAN: 'Suburban train', RAIL: 'Train', REGIONAL_RAIL: 'Regional train', REGIONAL_FAST_RAIL: 'Regional train',
  HIGHSPEED_RAIL: 'High-speed train', LONG_DISTANCE: 'Train', NIGHT_RAIL: 'Night train',
  FUNICULAR: 'Funicular', AERIAL_LIFT: 'Cable car', CABLE_CAR: 'Cable car',
};

function stop(p) {
  return { name: p?.name ?? '', lat: p?.lat ?? null, lng: p?.lon ?? null };
}

// Colours arrive as 'FF0000' or '#FF0000'. Only plain colours are passed on.
function hexColour(c) {
  const m = /^#?([0-9a-f]{6})$/i.exec(c ?? '');
  return m ? `#${m[1]}` : null;
}
