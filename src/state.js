// App state and every action that changes it.
//
// The screen never edits data directly. Buttons call an action here,
// the action changes `state`, saves it, and tells the screen to redraw.
import { createParisTrip } from './data/paris-trip.js';
import { optimiseDay } from './logic/optimise.js';

// Bump the version if the saved data shape changes, so old saves are ignored.
const STORAGE_KEY = 'trip-planner:paris-2026:v1';

export const state = {
  trip: loadTrip(),
  planId: 'done', // which plan is showing: 'done' or 'sug'
  dayFilter: 'all', // 'all' or a day index (0, 1, 2, 3)
};

// ---------- redraw on change ----------
const listeners = [];
// Returns a function that stops listening (used when you leave the page).
export function onChange(fn) {
  listeners.push(fn);
  return () => listeners.splice(listeners.indexOf(fn), 1);
}
function changed() {
  saveTrip();
  listeners.forEach((fn) => fn(state));
}

// ---------- saving and loading (this browser only) ----------
function loadTrip() {
  const seed = createParisTrip();
  try {
    const saved = JSON.parse(localStorage.getItem(STORAGE_KEY));
    if (isValidSave(saved, seed)) {
      seed.plans.done.days = saved.plans.done;
      seed.plans.sug.days = saved.plans.sug;
    }
  } catch {
    // Nothing saved yet, or storage is blocked: use the seed data.
  }
  return seed;
}

function isValidSave(saved, seed) {
  if (!saved || !saved.plans) return false;
  return ['done', 'sug'].every((id) => {
    const days = saved.plans[id];
    return (
      Array.isArray(days) &&
      days.length === seed.days.length &&
      days.every((day) => Array.isArray(day) && day.every((s) => s && seed.places[s.placeId]))
    );
  });
}

function saveTrip() {
  try {
    const plans = { done: state.trip.plans.done.days, sug: state.trip.plans.sug.days };
    localStorage.setItem(STORAGE_KEY, JSON.stringify({ plans }));
  } catch {
    // Storage full or blocked. The app still works for this visit.
  }
}

// ---------- helpers ----------
function currentDays() {
  return state.trip.plans[state.planId].days;
}

// A leg's mode is stored on the stop it leaves from. When stops change
// position, the legs leaving these positions now go somewhere else,
// so a mode chosen for the old leg no longer makes sense.
function resetLegs(stops, positions) {
  positions.forEach((i) => {
    if (stops[i]) {
      stops[i].mode = 'auto';
      stops[i].line = '';
    }
  });
}

// ---------- actions ----------
export const actions = {
  showPlan(planId) {
    state.planId = planId;
    changed();
  },

  filterDay(day) {
    state.dayFilter = day;
    changed();
  },

  toggleFixed(d, i) {
    const s = currentDays()[d][i];
    s.fixed = !s.fixed;
    changed();
  },

  setTime(d, i, time) {
    currentDays()[d][i].time = time;
    saveTrip(); // no redraw needed while typing
  },

  setMode(d, i, mode) {
    currentDays()[d][i].mode = mode;
    if (mode !== 'metro' && mode !== 'bus') currentDays()[d][i].line = '';
    changed();
  },

  setLine(d, i, line) {
    currentDays()[d][i].line = line;
    saveTrip();
  },

  // Swap stop i with its neighbour (direction -1 = up, +1 = down).
  move(d, i, direction) {
    const stops = currentDays()[d];
    const j = i + direction;
    if (j < 0 || j >= stops.length) return;
    [stops[i], stops[j]] = [stops[j], stops[i]];
    const first = Math.min(i, j);
    resetLegs(stops, [first - 1, first, first + 1]);
    changed();
  },

  moveToDay(d, i, toDay) {
    const days = currentDays();
    const [s] = days[d].splice(i, 1);
    resetLegs(days[d], [i - 1]);
    resetLegs(days[toDay], [days[toDay].length - 1]);
    s.mode = 'auto';
    s.line = '';
    days[toDay].push(s);
    changed();
    return state.trip.places[s.placeId].name;
  },

  remove(d, i) {
    const stops = currentDays()[d];
    const [s] = stops.splice(i, 1);
    resetLegs(stops, [i - 1]);
    changed();
    return state.trip.places[s.placeId].name;
  },

  // Returns the optimiser's result so the screen can say what happened.
  optimise(d) {
    const days = currentDays();
    const result = optimiseDay(days[d], state.trip.places);
    if (result.status === 'improved') {
      days[d] = result.stops;
      changed();
    }
    return result;
  },

  resetTrip() {
    state.trip = createParisTrip();
    changed();
  },
};
