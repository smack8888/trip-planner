// Step 2 of a new trip: popular places at the destination.
// Mark the ones you like as "Interested", then organise them into days.
import { DESTINATIONS, RECOMMENDATIONS_SOURCE, allPlaces } from '../data/destinations.js';
import { getTrip, setWorking, togglePick } from '../trips.js';
import { esc, CATEGORY_LABELS } from '../ui/html.js';
import { renderTripHeader, handleSaveBarClick, warnBeforeLeaving } from '../ui/trip-header.js';
import { notFoundHtml } from './trip-details.js';

const FILTERS = [
  ['all', 'All'],
  ['sight', 'Sights'],
  ['nature', 'Nature and walks'],
  ['food', 'Food and markets'],
  ['picked', 'Your picks'],
];

export function recommendationsView(root, { id }) {
  if (!getTrip(id)) {
    root.innerHTML = notFoundHtml();
    return;
  }
  let filter = 'all';

  function render() {
    const trip = getTrip(id);
    const dest = DESTINATIONS[trip.destinationId];
    const focusKey = document.activeElement?.dataset?.rec || document.activeElement?.dataset?.filter;
    // "Your picks" also shows places you picked in the "For you" step.
    const shown = filter === 'picked'
      ? allPlaces(dest).filter((r) => trip.picked.includes(r.id))
      : dest.recommendations.filter((r) => filter === 'all' || r.category === filter);

    const chips = FILTERS.map(([value, label]) => `
      <button class="chip all" data-filter="${value}" aria-pressed="${filter === value}">
        ${label}${value === 'picked' ? ` (${trip.picked.length})` : ''}
      </button>`).join('');

    const cards = shown.map((r) => {
      const picked = trip.picked.includes(r.id);
      return `
        <article class="card reccard" data-picked="${picked}">
          <div class="bkhead"><span class="tag">${CATEGORY_LABELS[r.category]}</span><span class="area">${esc(r.area)}</span></div>
          <h3>${esc(r.name)}</h3>
          <p>${esc(r.why)}</p>
          <div class="cardactions">
            <button class="pick" data-rec="${r.id}" aria-pressed="${picked}" aria-label="Interested in ${esc(r.name)}">
              ${picked ? '✓ Interested' : 'Interested'}
            </button>
          </div>
        </article>`;
    }).join('');

    const n = trip.picked.length;
    const pickedNames = allPlaces(dest).filter((r) => trip.picked.includes(r.id)).map((r) => esc(r.name));
    const base = `#/plan/${encodeURIComponent(id)}`;

    root.innerHTML = `
      ${renderTripHeader(trip, 'places')}
      <p class="lede">Popular places in ${esc(dest.name)}. Mark the ones you find interesting, then we'll organise them into days.</p>
      <p class="source">${esc(RECOMMENDATIONS_SOURCE)}</p>
      <div class="chips" role="group" aria-label="Filter places">${chips}</div>
      <div class="grid">${cards || '<p class="muted">Nothing here yet. Mark places as interesting to see them in this list.</p>'}</div>
      <section class="card foryoulink">
        <h3>★ Looking for something less obvious?</h3>
        <p class="muted">Optional: answer four quick questions and we’ll suggest places that suit you, away from the usual sights.</p>
        <a class="btn" href="${base}/for-you">Find places for us →</a>
      </section>
      <div class="picksbar">
        <div class="picksinfo">
          <b>${n} picked</b>
          <span class="muted small">${n ? pickedNames.join(', ') : 'Nothing picked yet.'}</span>
        </div>
        ${n ? `<a class="btn solid" href="${base}/stay">Next: where you’ll stay →</a>` : ''}
      </div>`;

    if (focusKey) root.querySelector(`[data-rec="${focusKey}"], [data-filter="${focusKey}"]`)?.focus({ preventScroll: true });
  }

  root.addEventListener('click', (e) => {
    if (handleSaveBarClick(e, id, render)) return;
    const pick = e.target.closest('[data-rec]');
    const chip = e.target.closest('[data-filter]');
    if (pick) {
      setWorking(togglePick(getTrip(id), pick.dataset.rec));
      render();
    } else if (chip) {
      filter = chip.dataset.filter;
      render();
    }
  });

  render();
  return warnBeforeLeaving(id);
}
