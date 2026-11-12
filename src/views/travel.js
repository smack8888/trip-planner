// Step 4 of a new trip: getting there and back (#/plan/<id>/travel).
//
// Asks how you arrive on the first day and leave on the last day: flight,
// train, coach, car or other; from or to where; the flight or train number;
// which airport or station; and the time. The itinerary then fits the first
// and last day around it (see logic/travel.js). Everything here is optional.
import { DESTINATIONS } from '../data/destinations.js';
import { getTrip, setWorking, withTravel, clearTravel, stayPlace, PACES } from '../trips.js';
import { TRAVEL_MODES, pointsFor, dayFrames, clockText } from '../logic/travel.js';
import { datesBetween, dayLabels } from '../logic/dates.js';
import { formatMinutes } from '../logic/transport.js';
import { esc } from '../ui/html.js';
import { renderTripHeader, renderSaveBar, handleSaveBarClick, warnBeforeLeaving } from '../ui/trip-header.js';
import { notFoundHtml } from './trip-details.js';

export function travelView(root, { id }) {
  if (!getTrip(id)) {
    root.innerHTML = notFoundHtml();
    return;
  }

  function render() {
    const trip = getTrip(id);
    const dest = DESTINATIONS[trip.destinationId];
    const dates = datesBetween(trip.startDate, trip.endDate);
    const focusKey = focusedKey();

    root.innerHTML = `
      ${renderTripHeader(trip, 'travel')}
      <p class="lede">How are you getting to ${esc(dest.name)} and back? The first and last day of the itinerary
        are fitted around it. Skip anything you don’t know yet.</p>
      <div class="travelcards">
        ${legHtml('arrival', trip, dest, dayLabels(dates[0]).long)}
        ${legHtml('departure', trip, dest, dayLabels(dates[dates.length - 1]).long)}
      </div>
      <p class="muted small">Times to get out of airports and into the city are rough planning guesses
        (for example 45 minutes to leave an airport, and 2 hours at the airport before a flight), not timetables.</p>
      <div class="picksbar">
        <div class="picksinfo"><span class="muted small">Arriving the evening before? Make that the first day of the trip in Details.</span></div>
        <a class="btn solid" href="#/plan/${encodeURIComponent(id)}/itinerary">Organise into days →</a>
      </div>`;
    showEffects(trip);
    if (focusKey) root.querySelector(focusKey)?.focus({ preventScroll: true });
  }

  // The "what this means" lines under each card.
  function showEffects(trip) {
    const [arrival, departure] = effects(trip);
    root.querySelector('[data-effect="arrival"]').innerHTML = arrival;
    root.querySelector('[data-effect="departure"]').innerHTML = departure;
  }

  root.addEventListener('change', (e) => {
    const { which } = e.target.dataset;
    if (e.target.name === `${which}-mode`) {
      let trip = getTrip(id);
      const mode = e.target.value;
      if (!mode) {
        trip = clearTravel(trip, which);
      } else {
        trip = withTravel(trip, which, { mode });
        // Leaving the same way you came? Fill in the same place and airport.
        const arrival = trip.travel.arrival;
        if (which === 'departure' && arrival?.mode === mode && !trip.travel.departure.place) {
          trip = withTravel(trip, 'departure', { place: arrival.place, pointId: arrival.pointId });
        }
      }
      setWorking(trip);
      render();
    } else if (e.target.dataset.field) {
      update(e.target);
    }
  });

  // Typing saves straight away, without redrawing (so typing isn't interrupted).
  root.addEventListener('input', (e) => {
    if (e.target.dataset.field) update(e.target);
  });

  function update(el) {
    const trip = withTravel(getTrip(id), el.dataset.which, { [el.dataset.field]: el.value });
    setWorking(trip);
    showEffects(trip);
    const bar = root.querySelector('.savebar');
    const fresh = renderSaveBar(trip);
    if (!fresh.includes(`data-status="${bar.dataset.status}"`)) bar.outerHTML = fresh;
  }

  root.addEventListener('click', (e) => {
    handleSaveBarClick(e, id, render);
  });

  function focusedKey() {
    const el = document.activeElement;
    if (!root.contains(el) || !el.name) return null;
    return el.type === 'radio' ? `[name="${el.name}"][value="${el.value}"]` : `[name="${el.name}"]`;
  }

  render();
  return warnBeforeLeaving(id);
}

// One card: arriving or leaving.
function legHtml(which, trip, dest, dayText) {
  const leg = trip.travel[which];
  const arriving = which === 'arrival';
  const modes = [['', 'Not sure yet'], ...Object.entries(TRAVEL_MODES).map(([k, m]) => [k, m.label])]
    .map(([value, label]) => `
      <label class="modechip">
        <input type="radio" name="${which}-mode" data-which="${which}" value="${value}"${(leg?.mode ?? '') === value ? ' checked' : ''}>
        <span>${value ? `${TRAVEL_MODES[value].icon} ` : ''}${label}</span>
      </label>`).join('');

  let fields = '';
  if (leg) {
    const mode = TRAVEL_MODES[leg.mode];
    const points = pointsFor(dest, leg.mode);
    const field = (name, label, input) => `<label><span>${label}</span>${input}</label>`;
    const text = (name, placeholder) =>
      `<input name="${which}-${name}" data-which="${which}" data-field="${name}" value="${esc(leg[name])}" autocomplete="off" placeholder="${placeholder}">`;
    const options = [['', arriving ? 'Straight to where we stay' : 'Straight from where we stay'], ...points.map((p) => [p.id, p.name])]
      .map(([value, label]) => `<option value="${value}"${leg.pointId === value ? ' selected' : ''}>${esc(label)}</option>`).join('');
    const pointLabel = { airport: 'airport', station: 'station', coach: 'coach station' }[mode.pointKind];
    fields = `
      <div class="travelfields">
        ${field('place', arriving ? 'From' : 'To', text('place', 'City or airport'))}
        ${mode.numberLabel ? field('number', `${mode.numberLabel} <span class="small">(optional)</span>`, text('number', '')) : ''}
        ${points.length ? field('pointId', `${arriving ? 'Arriving at' : 'Leaving from'} (${pointLabel})`,
          `<select name="${which}-pointId" data-which="${which}" data-field="pointId">${options}</select>`) : ''}
        ${field('time', arriving ? `Arrives at (${dayText})` : `Leaves at (${dayText})`,
          `<input type="time" name="${which}-time" data-which="${which}" data-field="time" value="${leg.time}">`)}
      </div>`;
  }

  return `
    <section class="card travelcard">
      <h2>${arriving ? `Getting there` : `Getting back`}</h2>
      <p class="muted small">${arriving ? 'Arriving' : 'Leaving'} on ${esc(dayText)}, the ${arriving ? 'first' : 'last'} day of the trip.</p>
      <fieldset class="modes">
        <legend class="visually-hidden">${arriving ? 'How are you arriving?' : 'How are you leaving?'}</legend>
        ${modes}
      </fieldset>
      ${fields}
      <p class="traveleffect" data-effect="${which}" aria-live="polite"></p>
    </section>`;
}

// What the arrival and departure mean for the first and last day, in words.
function effects(trip) {
  const dest = DESTINATIONS[trip.destinationId];
  const pace = PACES[trip.pace];
  const dates = datesBetween(trip.startDate, trip.endDate);
  const home = stayPlace(trip);
  const frames = dayFrames({ dayCount: dates.length, pace, home, travel: trip.travel, dest });
  const first = frames[0];
  const last = frames[frames.length - 1];
  const where = home ? `at ${esc(home.label)}` : null;
  const leftover = (f, day) => (f.budget > 0
    ? `That leaves about <b>${formatMinutes(f.budget)}</b> for sightseeing on ${day}.`
    : `That’s outside a ${pace.label.toLowerCase()} day (${clockText(pace.startHour * 60)} to ${clockText((pace.startHour + pace.hours) * 60)}), so ${day} is just for travelling.`);

  let arrival = '';
  const a = first.arrival;
  if (trip.travel.arrival && !a) arrival = 'Add the time, and the first day will be planned around it.';
  if (a) {
    const steps = [];
    if (a.point?.transferMinutes) {
      steps.push(`about ${formatMinutes(a.mode.arriveBuffer)} to get out of the airport, then about ${formatMinutes(a.point.transferMinutes)} into the city (${esc(a.point.transfer)})`);
    }
    if (a.toHome) steps.push(`about ${formatMinutes(a.toHome.minutes)} from ${esc(a.hub.name)} to where you stay`);
    const reach = where
      ? `You should be ${where}, bags dropped, about <b>${clockText(a.ready)}</b>`
      : a.hub ? `You should be at ${esc(a.hub.name)} about <b>${clockText(a.ready)}</b>` : `You should be in the city about <b>${clockText(a.ready)}</b>`;
    arrival = `${reach}.${steps.length ? ` On the way: ${steps.join(', ')}.` : ''} ${leftover(first, 'the first day')}
      ${home ? '' : ' Choose where you stay to plan this more precisely.'}`;
  }

  let departure = '';
  const d = last.departure;
  if (trip.travel.departure && !d) departure = 'Add the time, and the last day will be planned around it.';
  if (d) {
    const steps = [];
    if (d.mode.departBuffer) steps.push(`to be there ${formatMinutes(d.mode.departBuffer)} before`);
    if (d.fromHome) steps.push(`about ${formatMinutes(d.fromHome.minutes)} to ${esc(d.hub.name)}`);
    if (d.point?.transferMinutes) steps.push(`about ${formatMinutes(d.point.transferMinutes)} out to the airport`);
    const lead = where
      ? `Leave ${esc(home.label)} with your bags by about <b>${clockText(d.leaveBy)}</b>`
      : d.hub ? `Head for ${esc(d.hub.name)} by about <b>${clockText(d.leaveBy)}</b>` : `Set off by about <b>${clockText(d.leaveBy)}</b>`;
    departure = `${lead}.${steps.length ? ` That allows ${steps.join(', ')}.` : ''} ${leftover(last, 'the last day')}`;
  }
  return [arrival, departure];
}
