// The "For you" step: a few questions, then less obvious places that suit
// the answers. The places themselves are in data/discoveries.js. No screen
// code here.
import { distanceKm } from './geo.js';

// The questions. multi: tick several (up to max); otherwise pick one.
// Each option: [id, label, short label for "Suits you"].
export const QUESTIONS = [
  {
    id: 'interests',
    text: 'What would you most like to do?',
    hint: 'Pick up to three.',
    multi: true,
    max: 3,
    options: [
      ['nature', 'Parks, gardens and green walks', 'Green spaces'],
      ['hiking', 'Proper hikes, even outside the city', 'Hiking'],
      ['food', 'Markets and food streets', 'Food'],
      ['art', 'Small museums and art', 'Art'],
      ['history', 'History and ruins', 'History'],
      ['neighbourhoods', 'Local neighbourhoods off the tourist trail', 'Local life'],
      ['views', 'Viewpoints', 'Views'],
      ['architecture', 'Unusual architecture', 'Architecture'],
    ],
  },
  {
    id: 'crowds',
    text: 'How do you feel about crowds?',
    options: [
      ['avoid', 'We’d rather avoid them'],
      ['fine', 'We don’t mind them'],
    ],
  },
  {
    id: 'reach',
    text: 'How far are you happy to go?',
    options: [
      ['central', 'Stay central'],
      ['city', 'Anywhere in the city'],
      ['daytrip', 'Day trips outside the city too'],
    ],
  },
  {
    id: 'energy',
    text: 'How active do you want to be?',
    options: [
      ['easy', 'Easy-going'],
      ['active', 'Up for long walks and climbs'],
    ],
  },
];

const SHORT_LABELS = Object.fromEntries(QUESTIONS.flatMap((q) => q.options).map(([id, label, short]) => [id, short ?? label]));

// Answers as stored on a trip: { interests: [...], crowds, reach, energy }.
// Anything not answered (or not valid) is left out. Returns null if empty.
export function cleanAnswers(a) {
  if (!a || typeof a !== 'object') return null;
  const out = {};
  for (const q of QUESTIONS) {
    const valid = new Set(q.options.map(([id]) => id));
    if (q.multi) {
      const picked = Array.isArray(a[q.id]) ? [...new Set(a[q.id].filter((v) => valid.has(v)))].slice(0, q.max) : [];
      if (picked.length) out[q.id] = picked;
    } else if (valid.has(a[q.id])) {
      out[q.id] = a[q.id];
    }
  }
  return Object.keys(out).length ? out : null;
}

// Ticks or unticks a multi-choice answer, or sets a single one.
// Ticking more than allowed does nothing.
export function answer(answers, questionId, value) {
  const q = QUESTIONS.find((x) => x.id === questionId);
  const now = { ...(answers ?? {}) };
  if (!q) return now;
  if (q.multi) {
    const list = now[q.id] ?? [];
    if (list.includes(value)) now[q.id] = list.filter((v) => v !== value);
    else if (list.length < q.max) now[q.id] = [...list, value];
  } else {
    now[q.id] = value;
  }
  return cleanAnswers(now) ?? {};
}

// Enough answered to suggest places? (At least one interest.)
export function readyToSuggest(answers) {
  return Boolean(answers?.interests?.length);
}

// How far a place is from the centre, in words we can match to "reach".
//   central: up to 3 km; city: up to 15 km; daytrip: further.
export function zoneOf(place, dest) {
  const km = distanceKm({ lat: dest.center[0], lng: dest.center[1] }, place);
  return km <= 3 ? 'central' : km <= 15 ? 'city' : 'daytrip';
}
const REACH_ORDER = ['central', 'city', 'daytrip'];

// The places that suit the answers, best first:
//   [{ place, score, reasons: ['Green spaces', 'Usually quiet', ...] }]
// A place must match at least one interest and be within reach.
export function suggestions(places, dest, answers) {
  if (!readyToSuggest(answers)) return [];
  const reach = REACH_ORDER.indexOf(answers.reach ?? 'daytrip');
  const out = [];
  for (const place of places) {
    const zone = zoneOf(place, dest);
    if (REACH_ORDER.indexOf(zone) > reach) continue;
    const matched = place.interests.filter((i) => answers.interests.includes(i));
    if (!matched.length) continue;
    let score = matched.length * 3;
    const reasons = matched.map((i) => SHORT_LABELS[i]);
    if (answers.crowds === 'avoid') {
      score += place.quiet ? 2 : -2;
      if (place.quiet) reasons.push('Usually quiet');
    }
    if (answers.energy === 'easy' && place.active) score -= 2;
    if (answers.energy === 'active' && place.active) {
      score += 1;
      reasons.push('Active');
    }
    if (zone === 'daytrip') reasons.push('Day trip');
    out.push({ place, score, reasons });
  }
  // Best score first; ties keep the list's own order.
  return out.sort((a, b) => b.score - a.score);
}
