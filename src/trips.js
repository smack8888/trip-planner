// New trips: their details (destination, dates, pace) and the places you pick.
//
// A trip looks like:
//   { id, destinationId, startDate, endDate, pace, createdAt, savedAt, picked: [...], stay }
//
// stay is where you sleep:
//   null                                        not answered yet
//   { booked: true, name, address, lat, lng }   already booked; lat and lng
//                                               stay null until you place the pin
//   { booked: false, areaId, hotel }            not booked yet; areaId is the
//                                               area you plan around (or null);
//                                               hotel is one you chose from the
//                                               LiteAPI list (or null):
//     { id, name, address, lat, lng, price, checkin, checkout, fetchedAt }
//
// travel is how you get there and back: { arrival, departure }, each null or
//   { mode, place, number, pointId, time }
//     mode     'flight', 'train', 'coach', 'car' or 'other'
//     place    where you come from (arrival) or go to (departure), free text
//     number   flight or train number, optional
//     pointId  the airport or station in the destination (see arrivalPoints
//              in data/destinations.js), or '' to go straight to where you stay
//     time     'HH:MM' on the first day (arrival) or the last day (departure)
//
// DRAFTS AND SAVING
// Every trip you are looking at lives in a "working copy" kept in
// sessionStorage: it survives moving between pages and reloading, but
// disappears when you close the tab. Only pressing "Save trip" copies it
// into localStorage, the saved list shown on the home page. So a trip you
// only looked at never appears on the home page.
//
// The functions at the top are "pure" (no storage), which makes them easy
// to test. The ones at the bottom read and write the browser's storage.
import { DESTINATIONS } from './data/destinations.js';
import { datesBetween, parseDate } from './logic/dates.js';
import { TRAVEL_MODES, pointsFor } from './logic/travel.js';

const SAVED_KEY = 'trip-planner:trips:v2';
const WORKING_KEY = 'trip-planner:working:v2';
export const MAX_DAYS = 14;

// How much of each day the organiser may fill, travel included.
export const PACES = {
  packed: { label: 'Packed', startHour: 9, hours: 10, description: 'About 9:00 to 19:00 of sightseeing' },
  relaxed: { label: 'Relaxed', startHour: 10, hours: 7, description: 'About 10:00 to 17:00, with time to linger' },
};

// ---------- pure functions ----------

// Returns a message explaining what's wrong, or null if the details are fine.
export function checkDetails({ destinationId, startDate, endDate, pace }) {
  if (!DESTINATIONS[destinationId]) return 'Choose a destination.';
  if (!parseDate(startDate)) return 'Choose the first day of the trip.';
  if (!parseDate(endDate)) return 'Choose the last day of the trip.';
  const days = datesBetween(startDate, endDate).length;
  if (days === 0) return 'The last day must be on or after the first day.';
  if (days > MAX_DAYS) return `Trips can be up to ${MAX_DAYS} days for now.`;
  if (!PACES[pace]) return 'Choose a pace.';
  return null;
}

export function newTrip(details, now = new Date()) {
  const problem = checkDetails(details);
  if (problem) throw new Error(problem);
  return {
    id: `${details.destinationId}-${now.getTime().toString(36)}`,
    destinationId: details.destinationId,
    startDate: details.startDate,
    endDate: details.endDate,
    pace: details.pace,
    createdAt: now.toISOString(),
    savedAt: null,
    picked: [],
    stay: null,
    travel: { arrival: null, departure: null },
  };
}

// Change dates or pace (the destination stays the same).
export function withDetails(trip, { startDate, endDate, pace }) {
  return { ...trip, startDate, endDate, pace };
}

// Add the recommendation if it isn't picked yet, remove it if it is.
export function togglePick(trip, recommendationId) {
  const picked = trip.picked.includes(recommendationId)
    ? trip.picked.filter((id) => id !== recommendationId)
    : [...trip.picked, recommendationId];
  return { ...trip, picked };
}

// Answer "have you already booked somewhere to stay?". Switching answer
// starts that answer afresh; giving the same answer again keeps what you typed.
export function chooseBooked(trip, booked) {
  if (trip.stay?.booked === booked) return trip;
  const stay = booked
    ? { booked: true, name: '', address: '', lat: null, lng: null }
    : { booked: false, areaId: null, hotel: null };
  return { ...trip, stay };
}

// Change some stay details, e.g. withStay(trip, { address: '12 Rue X' }).
export function withStay(trip, changes) {
  return { ...trip, stay: { ...trip.stay, ...changes } };
}

// Choose a hotel from the LiteAPI list (or null to un-choose it). Choosing a
// hotel also chooses its area. `listing` is one hotel from the list, and
// `search` says which dates it was priced for and when.
export function chooseHotel(trip, areaId, listing, search) {
  if (!listing) return withStay(trip, { hotel: null });
  const hotel = {
    id: listing.id,
    name: listing.name,
    address: listing.address ?? '',
    lat: listing.lat,
    lng: listing.lng,
    price: listing.price ?? null,
    checkin: search.checkin,
    checkout: search.checkout,
    fetchedAt: search.fetchedAt,
  };
  return withStay(trip, { areaId, hotel });
}

// Change the arrival or departure, e.g. withTravel(trip, 'arrival', { time: '11:30' }).
// Changing the mode clears an airport or station that doesn't suit it.
export function withTravel(trip, which, changes) {
  const before = trip.travel?.[which] ?? { mode: '', place: '', number: '', pointId: '', time: '' };
  const next = { ...before, ...changes };
  if (changes.mode && changes.mode !== before.mode) {
    const dest = DESTINATIONS[trip.destinationId];
    if (!pointsFor(dest, next.mode).some((p) => p.id === next.pointId)) next.pointId = '';
  }
  return { ...trip, travel: { arrival: null, departure: null, ...trip.travel, [which]: next } };
}

// Remove the arrival or departure details.
export function clearTravel(trip, which) {
  return { ...trip, travel: { arrival: null, departure: null, ...trip.travel, [which]: null } };
}

// Where each day starts and ends, as a place the organiser and the map
// understand, or null if we don't know yet.
//   kind     'hotel' (booked, or chosen from the list) or 'area' (an area you plan around)
//   label    for sentences: "Leave <label>", "your hotel" if it has no name
//   name     for the map's tooltip
//   address  the hotel's address, or ''
//   booked   true if you said it's booked
export function stayPlace(trip) {
  const stay = trip.stay;
  if (stay?.booked === true && stay.lat != null) {
    const given = stay.name.trim();
    return { id: 'stay', kind: 'hotel', booked: true, label: given || 'your hotel', name: given || 'Your hotel', address: stay.address.trim(), lat: stay.lat, lng: stay.lng, visitHours: 0 };
  }
  if (stay?.booked === false && stay.hotel?.lat != null) {
    const h = stay.hotel;
    return { id: 'stay', kind: 'hotel', booked: false, label: h.name, name: h.name, address: h.address, lat: h.lat, lng: h.lng, visitHours: 0 };
  }
  if (stay?.booked === false && stay.areaId) {
    const area = DESTINATIONS[trip.destinationId].areas.find((a) => a.id === stay.areaId);
    if (area) {
      return { id: 'stay', kind: 'area', booked: false, label: area.name, name: `${area.name} (where you stay)`, address: '', lat: area.lat, lng: area.lng, visitHours: 0 };
    }
  }
  return null;
}

// Same content? (Ignores the order of keys, and when it was saved.)
export function sameTrip(a, b) {
  return canonical({ ...a, savedAt: null }) === canonical({ ...b, savedAt: null });
}

// JSON text with keys sorted at every level, so key order never matters.
function canonical(value) {
  if (Array.isArray(value)) return `[${value.map(canonical).join(',')}]`;
  if (value && typeof value === 'object') {
    return `{${Object.keys(value).sort().map((k) => `${JSON.stringify(k)}:${canonical(value[k])}`).join(',')}}`;
  }
  return JSON.stringify(value ?? null);
}

// Keep only well-formed trips; drop picks that no longer match a recommendation.
export function cleanTrip(t) {
  if (!t || typeof t.id !== 'string') return null;
  if (checkDetails(t)) return null;
  const valid = new Set(DESTINATIONS[t.destinationId].recommendations.map((r) => r.id));
  return {
    id: t.id,
    destinationId: t.destinationId,
    startDate: t.startDate,
    endDate: t.endDate,
    pace: t.pace,
    createdAt: t.createdAt,
    savedAt: t.savedAt ?? null,
    picked: Array.isArray(t.picked) ? t.picked.filter((id) => valid.has(id)) : [],
    stay: cleanStay(t.stay, DESTINATIONS[t.destinationId]),
    travel: {
      arrival: cleanTravelLeg(t.travel?.arrival, DESTINATIONS[t.destinationId]),
      departure: cleanTravelLeg(t.travel?.departure, DESTINATIONS[t.destinationId]),
    },
  };
}

const text = (v) => (typeof v === 'string' ? v.slice(0, 300) : '');

function cleanStay(s, dest) {
  if (!s || typeof s !== 'object') return null;
  if (s.booked === true) {
    const placed = Number.isFinite(s.lat) && Number.isFinite(s.lng);
    return { booked: true, name: text(s.name), address: text(s.address), lat: placed ? s.lat : null, lng: placed ? s.lng : null };
  }
  if (s.booked === false) {
    const areaId = dest.areas.some((a) => a.id === s.areaId) ? s.areaId : null;
    return { booked: false, areaId, hotel: areaId ? cleanHotel(s.hotel) : null };
  }
  return null;
}

function cleanHotel(h) {
  if (!h || typeof h !== 'object' || !text(h.id) || !text(h.name)) return null;
  if (!Number.isFinite(h.lat) || !Number.isFinite(h.lng)) return null;
  const price = Number.isFinite(h.price?.amount) && /^[A-Z]{3}$/.test(h.price?.currency ?? '')
    ? { amount: h.price.amount, currency: h.price.currency }
    : null;
  return {
    id: text(h.id),
    name: text(h.name),
    address: text(h.address),
    lat: h.lat,
    lng: h.lng,
    price,
    checkin: parseDate(h.checkin) ? h.checkin : null,
    checkout: parseDate(h.checkout) ? h.checkout : null,
    fetchedAt: typeof h.fetchedAt === 'string' && !Number.isNaN(Date.parse(h.fetchedAt)) ? h.fetchedAt : null,
  };
}

function cleanTravelLeg(leg, dest) {
  if (!leg || typeof leg !== 'object' || !TRAVEL_MODES[leg.mode]) return null;
  return {
    mode: leg.mode,
    place: text(leg.place),
    number: text(leg.number).slice(0, 20),
    pointId: pointsFor(dest, leg.mode).some((p) => p.id === leg.pointId) ? leg.pointId : '',
    time: /^([01]\d|2[0-3]):[0-5]\d$/.test(leg.time ?? '') ? leg.time : '',
  };
}

export function cleanTrips(raw) {
  return Array.isArray(raw) ? raw.map(cleanTrip).filter(Boolean) : [];
}

// ---------- storage ----------
function read(storage, key, fallback) {
  try {
    return JSON.parse(storage.getItem(key)) ?? fallback;
  } catch {
    return fallback;
  }
}
function write(storage, key, value) {
  try {
    storage.setItem(key, JSON.stringify(value));
  } catch {
    // Storage full or blocked. Changes last until the page is closed.
  }
}

// Saved trips, newest first. These are the ones the home page lists.
export function listSavedTrips() {
  return cleanTrips(read(localStorage, SAVED_KEY, []));
}

function savedTrip(id) {
  return listSavedTrips().find((t) => t.id === id) ?? null;
}

function workingCopies() {
  const all = read(sessionStorage, WORKING_KEY, {});
  return all && typeof all === 'object' ? all : {};
}

// The version you're looking at: your working copy if there is one,
// otherwise the saved version.
export function getTrip(id) {
  return cleanTrip(workingCopies()[id]) ?? savedTrip(id);
}

// Record a change. It is NOT saved until saveTrip() is called.
export function setWorking(trip) {
  write(sessionStorage, WORKING_KEY, { ...workingCopies(), [trip.id]: trip });
}

// 'draft'   never saved: not on the home page
// 'changed' saved before, but has changes that aren't saved yet
// 'saved'   everything is saved
export function saveStatus(id) {
  const saved = savedTrip(id);
  if (!saved) return 'draft';
  const working = cleanTrip(workingCopies()[id]);
  return working && !sameTrip(working, saved) ? 'changed' : 'saved';
}

export function saveTrip(id) {
  const trip = getTrip(id);
  if (!trip) return null;
  const stored = { ...trip, savedAt: new Date().toISOString() };
  const others = listSavedTrips().filter((t) => t.id !== id);
  write(localStorage, SAVED_KEY, [stored, ...others]);
  forgetWorking(id);
  return stored;
}

// Throw away unsaved changes and go back to the saved version.
export function discardChanges(id) {
  forgetWorking(id);
}

export function deleteTrip(id) {
  write(localStorage, SAVED_KEY, listSavedTrips().filter((t) => t.id !== id));
  forgetWorking(id);
}

function forgetWorking(id) {
  const all = workingCopies();
  delete all[id];
  write(sessionStorage, WORKING_KEY, all);
}
