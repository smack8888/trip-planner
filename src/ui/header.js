// Trip title and the two plan buttons, each with its totals.
import { dayKm, dayMinutes, formatMinutes } from '../logic/transport.js';
import { esc } from './html.js';

function planTotals(plan, places) {
  let km = 0;
  let minutes = 0;
  let stops = 0;
  plan.days.forEach((day) => {
    km += dayKm(day, places);
    minutes += dayMinutes(day, places);
    stops += day.length;
  });
  return { km, minutes, stops };
}

export function renderHeader(state) {
  const { trip, planId } = state;
  const buttons = Object.entries(trip.plans).map(([id, plan]) => {
    const t = planTotals(plan, trip.places);
    return `
      <button class="plan" data-act="plan" data-plan="${id}" aria-pressed="${planId === id}">
        <b>${esc(plan.name)}</b>
        <span class="big">${t.km.toFixed(1)} km</span>
        <span class="sub">${t.stops} stops, about ${formatMinutes(t.minutes)} travelling</span>
      </button>`;
  });

  return `
    <header class="masthead">
      <div>
        <h1>${esc(trip.name)}</h1>
        <p class="trip">${esc(trip.summary)}</p>
      </div>
      <div class="plans" role="group" aria-label="Choose a plan">${buttons.join('')}</div>
    </header>`;
}
