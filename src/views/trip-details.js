// Trip details form: destination, dates and pace.
//   #/new                 start a new trip (choose a destination too)
//   #/plan/<id>/details   change the dates or pace of a trip
import { DESTINATIONS } from '../data/destinations.js';
import { PACES, MAX_DAYS, checkDetails, newTrip, withDetails, getTrip, setWorking } from '../trips.js';
import { datesBetween } from '../logic/dates.js';
import { go } from '../router.js';
import { esc } from '../ui/html.js';
import { renderTripHeader, handleSaveBarClick, warnBeforeLeaving } from '../ui/trip-header.js';

export function tripDetailsView(root, params) {
  const editing = params.id ? getTrip(params.id) : null;
  if (params.id && !editing) {
    root.innerHTML = notFoundHtml();
    return;
  }
  const values = editing ?? { destinationId: '', startDate: '', endDate: '', pace: 'packed' };

  function render() {
    const trip = editing && getTrip(editing.id);
    const destinations = Object.values(DESTINATIONS).map((d) => `
      <label class="card destcard">
        <input type="radio" name="destinationId" value="${d.id}" aria-label="${esc(d.name)}, ${esc(d.country)}"${values.destinationId === d.id ? ' checked' : ''}>
        <span class="tag">${esc(d.country)}</span>
        <span class="destname">${esc(d.name)}</span>
        <span class="muted">${esc(d.blurb)}</span>
      </label>`).join('');

    const paces = Object.entries(PACES).map(([id, p]) => `
      <label class="choice">
        <input type="radio" name="pace" value="${id}"${values.pace === id ? ' checked' : ''}>
        <span><b>${p.label}</b><span class="muted small">${p.description}</span></span>
      </label>`).join('');

    root.innerHTML = `
      ${editing ? renderTripHeader(trip, 'details') : `
        <a class="back" href="#/">← All trips</a>
        <h1>New trip</h1>
        <p class="lede">Tell us where and when. Next you'll pick the places that interest you, and we'll organise them into days.</p>`}
      <form class="tripform" novalidate>
        ${editing ? '' : `
          <fieldset>
            <legend>Where to?</legend>
            <div class="grid">${destinations}</div>
          </fieldset>`}
        <fieldset>
          <legend>When?</legend>
          <div class="daterow">
            <label>First day<input type="date" name="startDate" value="${values.startDate}" required></label>
            <label>Last day<input type="date" name="endDate" value="${values.endDate}" required></label>
            <p class="muted small" data-daycount>${dayCountText()}</p>
          </div>
        </fieldset>
        <fieldset>
          <legend>Pace</legend>
          <div class="choices">${paces}</div>
        </fieldset>
        <p class="error" role="alert" data-error></p>
        <button class="btn solid big" type="submit">${editing ? 'Update itinerary' : 'Next: choose places'}</button>
      </form>`;
  }

  function dayCountText() {
    const n = datesBetween(values.startDate, values.endDate).length;
    return n ? `${n} day${n === 1 ? '' : 's'}` : `Up to ${MAX_DAYS} days.`;
  }

  // Keep `values` in step with the form as you type.
  root.addEventListener('input', (e) => {
    if (!e.target.name) return;
    values[e.target.name] = e.target.value;
    // If you pick a first day after the last day, move the last day along.
    if (e.target.name === 'startDate' && values.endDate && values.endDate < values.startDate) {
      values.endDate = values.startDate;
      root.querySelector('[name="endDate"]').value = values.endDate;
    }
    root.querySelector('[data-daycount]').textContent = dayCountText();
  });

  root.addEventListener('submit', (e) => {
    e.preventDefault();
    const problem = checkDetails(values);
    if (problem) {
      root.querySelector('[data-error]').textContent = problem;
      return;
    }
    if (editing) {
      setWorking(withDetails(getTrip(editing.id), values));
      go(`/plan/${encodeURIComponent(editing.id)}/itinerary`);
    } else {
      const trip = newTrip(values);
      setWorking(trip); // a draft: not on the home page until saved
      go(`/plan/${encodeURIComponent(trip.id)}`);
    }
  });

  root.addEventListener('click', (e) => {
    if (editing) handleSaveBarClick(e, editing.id, render);
  });

  render();
  return editing ? warnBeforeLeaving(editing.id) : undefined;
}

export function notFoundHtml() {
  return `
    <a class="back" href="#/">← All trips</a>
    <h1>Trip not found</h1>
    <p class="lede">It may have been deleted, or it was never saved and the browser tab it was in has been closed.</p>
    <a class="btn solid" href="#/new">Plan a new trip</a>`;
}
