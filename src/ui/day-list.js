// The day-by-day list: each day's stops, and between every two stops a
// "leg" row where you choose how to travel.
//
// Buttons carry data-act="..." plus data-d (day) and data-i (stop index).
// main.js listens for clicks and changes and calls the matching action.
import { distanceKm } from '../logic/geo.js';
import { MODES, effectiveMode, legMinutes, dayKm, dayMinutes, formatMinutes } from '../logic/transport.js';
import { esc, dayStyle, CATEGORY_LABELS } from './html.js';

export function visibleDays(state) {
  const count = state.trip.days.length;
  return state.dayFilter === 'all' ? [...Array(count).keys()] : [state.dayFilter];
}

export function renderDayFilter(state) {
  const chips = state.trip.days.map((day, d) => `
    <button class="chip" data-act="day" data-day="${d}" aria-pressed="${state.dayFilter === d}">
      <span class="roundel" style="${dayStyle(d)}">${d + 1}</span>${esc(day.short)}
    </button>`);
  return `
    <div class="chips" role="group" aria-label="Filter by day">
      <button class="chip all" data-act="day" data-day="all" aria-pressed="${state.dayFilter === 'all'}">All days</button>
      ${chips.join('')}
    </div>`;
}

export function renderDayList(state) {
  return visibleDays(state).map((d) => renderDay(state, d)).join('');
}

function renderDay(state, d) {
  const { trip } = state;
  const day = trip.days[d];
  const stops = trip.plans[state.planId].days[d];
  const rows = stops.map((s, i) => renderStop(state, d, i) + (i < stops.length - 1 ? renderLeg(state, d, i) : ''));

  return `
    <section class="day" style="${dayStyle(d)}">
      <header class="dayhead">
        <span class="roundel">${d + 1}</span>
        <h3>${esc(day.long)}</h3>
        <div class="daytools">
          <span class="km">${dayKm(stops, trip.places).toFixed(1)} km, ${formatMinutes(dayMinutes(stops, trip.places))}</span>
          <button class="btn" data-act="optimise" data-d="${d}">Optimise order</button>
        </div>
      </header>
      <ol class="stops">
        ${rows.join('') || '<li class="note">No stops on this day yet.</li>'}
      </ol>
      ${day.endNote ? `<p class="edge">${esc(day.endNote)}</p>` : ''}
    </section>`;
}

function renderStop(state, d, i) {
  const { trip } = state;
  const stops = trip.plans[state.planId].days[d];
  const s = stops[i];
  const place = trip.places[s.placeId];
  const name = esc(place.name);
  const otherDays = trip.days
    .map((day, x) => (x === d ? '' : `<option value="${x}">Day ${x + 1}, ${esc(day.short)}</option>`))
    .join('');

  return `
    <li class="stop${s.fixed ? ' fixed' : ''}" data-place="${s.placeId}">
      <span class="num">${i + 1}</span>
      <div>
        <div>
          <span class="sname">${name}</span>
          <span class="cat">${CATEGORY_LABELS[place.category] ?? ''}</span>
          ${s.fixed ? '<span class="fixedtag">Fixed</span>' : ''}
        </div>
        ${place.note ? `<p class="note">${esc(place.note)}</p>` : ''}
        <div class="sctl">
          <button class="mini" data-act="fixed" data-d="${d}" data-i="${i}" aria-pressed="${s.fixed}"
            title="A fixed slot keeps its day and position when you optimise">Fixed slot</button>
          ${s.fixed || s.time ? `<input class="timein" data-field="time" data-d="${d}" data-i="${i}" value="${esc(s.time)}"
            placeholder="Time, e.g. 10:30" aria-label="Time for ${name}">` : ''}
          <button class="mini" data-act="up" data-d="${d}" data-i="${i}" aria-label="Move ${name} up"${i === 0 ? ' disabled' : ''}>↑</button>
          <button class="mini" data-act="down" data-d="${d}" data-i="${i}" aria-label="Move ${name} down"${i === stops.length - 1 ? ' disabled' : ''}>↓</button>
          <select class="movesel" data-field="day" data-d="${d}" data-i="${i}" aria-label="Move ${name} to another day"
            ${s.fixed ? 'disabled title="Fixed stops stay on their day"' : ''}>
            <option value="">Move to…</option>${otherDays}
          </select>
          <button class="mini" data-act="remove" data-d="${d}" data-i="${i}" aria-label="Remove ${name}">Remove</button>
        </div>
      </div>
    </li>`;
}

function renderLeg(state, d, i) {
  const { trip } = state;
  const stops = trip.plans[state.planId].days[d];
  const from = trip.places[stops[i].placeId];
  const to = trip.places[stops[i + 1].placeId];
  const { mode, line } = stops[i];
  const km = distanceKm(from, to);
  const used = effectiveMode(km, mode);

  const options = [
    `<option value="auto"${mode === 'auto' ? ' selected' : ''}>Auto (${MODES[effectiveMode(km, 'auto')]})</option>`,
    ...Object.entries(MODES).map(([id, label]) => `<option value="${id}"${mode === id ? ' selected' : ''}>${label}</option>`),
  ];

  return `
    <li class="leg">
      <select class="modesel" data-field="mode" data-d="${d}" data-i="${i}"
        aria-label="Transport from ${esc(from.name)} to ${esc(to.name)}">${options.join('')}</select>
      <span>${km.toFixed(1)} km, about ${formatMinutes(legMinutes(km, mode))}</span>
      ${used === 'metro' || used === 'bus' ? `<input class="linein" data-field="line" data-d="${d}" data-i="${i}"
        value="${esc(line)}" placeholder="Line" aria-label="Line for this leg">` : ''}
    </li>`;
}
