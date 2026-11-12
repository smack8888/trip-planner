// Home page: start a new trip, open a saved one, or look at a past trip.
// Only trips you pressed "Save trip" on are listed here.
import { state } from '../state.js';
import { DESTINATIONS } from '../data/destinations.js';
import { listSavedTrips, deleteTrip, saveStatus } from '../trips.js';
import { datesBetween, formatRange } from '../logic/dates.js';
import { esc } from '../ui/html.js';
import { toast } from '../ui/toast.js';

export function homeView(root) {
  function render() {
    const saved = listSavedTrips();
    root.innerHTML = `
      <header class="hometop">
        <h1>Trips</h1>
        <a class="btn solid big" href="#/new">Plan a new trip</a>
      </header>

      ${saved.length ? `
        <section class="homesec">
          <h2>Your trips</h2>
          <div class="grid">${saved.map(savedCard).join('')}</div>
        </section>` : ''}

      <section class="homesec">
        <h2>Past trips</h2>
        <div class="grid">${pastParisCard()}</div>
      </section>`;
  }

  root.addEventListener('click', (e) => {
    const el = e.target.closest('[data-act="delete-trip"]');
    if (!el) return;
    const name = DESTINATIONS[el.dataset.dest].name;
    if (confirm(`Delete this ${name} trip? This can't be undone.`)) {
      deleteTrip(el.dataset.id);
      render();
      toast(`${name} trip deleted.`);
    }
  });

  render();
}

function savedCard(trip) {
  const dest = DESTINATIONS[trip.destinationId];
  const days = datesBetween(trip.startDate, trip.endDate).length;
  const n = trip.picked.length;
  const base = `#/plan/${encodeURIComponent(trip.id)}`;
  return `
    <article class="card tripcard">
      <div class="bkhead">
        <span class="tag">${saveStatus(trip.id) === 'changed' ? 'Unsaved changes' : 'Planning'}</span>
        <span class="area">${days} day${days === 1 ? '' : 's'}, ${n} place${n === 1 ? '' : 's'}</span>
      </div>
      <h3>${esc(dest.name)}</h3>
      <p class="muted">${formatRange(trip.startDate, trip.endDate)}</p>
      <div class="cardactions">
        <a class="btn solid" href="${n ? `${base}/itinerary` : base}">Open</a>
        <button class="mini" data-act="delete-trip" data-id="${esc(trip.id)}" data-dest="${trip.destinationId}">Delete</button>
      </div>
    </article>`;
}

function pastParisCard() {
  const { trip } = state;
  const stops = trip.plans.done.days.reduce((sum, day) => sum + day.length, 0);
  return `
    <article class="card tripcard">
      <div class="bkhead"><span class="tag">Past trip</span><span class="area">${trip.days.length} days, ${stops} stops</span></div>
      <h3>${esc(trip.name)}</h3>
      <p class="muted">${esc(trip.summary)}</p>
      <div class="cardactions"><a class="btn solid" href="#/trip/${trip.id}">Open</a></div>
    </article>`;
}
