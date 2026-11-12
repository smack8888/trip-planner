// Shared top part of every new-trip page: title, dates, step links
// (Details, Places, For you (optional), Stay, Travel, Itinerary) and the save bar.
import { DESTINATIONS } from '../data/destinations.js';
import { PACES, saveStatus, saveTrip, discardChanges } from '../trips.js';
import { datesBetween, formatRange } from '../logic/dates.js';
import { esc } from './html.js';
import { toast } from './toast.js';

export function renderTripHeader(trip, step) {
  const dest = DESTINATIONS[trip.destinationId];
  const days = datesBetween(trip.startDate, trip.endDate).length;
  const base = `#/plan/${encodeURIComponent(trip.id)}`;
  const steps = [
    ['details', 'Details', `${base}/details`],
    ['places', 'Places', base],
    ['for-you', 'For you', `${base}/for-you`, 'optional'],
    ['stay', 'Stay', `${base}/stay`],
    ['travel', 'Travel', `${base}/travel`],
    ['itinerary', 'Itinerary', `${base}/itinerary`],
  ];
  // Optional steps get a ★ instead of a number, so the others keep 1 to 5.
  let n = 0;
  const nav = steps.map(([id, label, href, optional]) => `
    <a class="step${optional ? ' optional' : ''}" href="${href}"${id === step ? ' aria-current="page"' : ''}
      ${optional ? 'title="Optional"' : ''}>
      <span class="stepnum"${optional ? ' aria-label="Optional"' : ''}>${optional ? '★' : ++n}</span>${label}
    </a>`).join('');

  return `
    <a class="back" href="#/">← All trips</a>
    <header class="triphead">
      <div>
        <h1>${esc(dest.name)}</h1>
        <p class="trip">${formatRange(trip.startDate, trip.endDate)} · ${days} day${days === 1 ? '' : 's'} · ${PACES[trip.pace].label} pace</p>
      </div>
      <nav class="steps" aria-label="Trip steps">${nav}</nav>
    </header>
    ${renderSaveBar(trip)}`;
}

// Exported so a page can refresh just the save bar (e.g. while you type).
export function renderSaveBar(trip) {
  const status = saveStatus(trip.id);
  const text = {
    draft: 'Not saved. This trip won’t appear on your home page until you save it.',
    changed: 'You have unsaved changes.',
    saved: 'Saved. This trip is on your home page.',
  }[status];
  return `
    <div class="savebar" data-status="${status}" role="status">
      <span>${text}</span>
      ${status === 'changed' ? '<button class="mini" data-act="discard">Discard changes</button>' : ''}
      ${status !== 'saved' ? '<button class="btn solid" data-act="save-trip">Save trip</button>' : ''}
    </div>`;
}

// Call from a page's click handler. Returns true if it handled the click.
// `refresh` redraws the page after saving or discarding.
export function handleSaveBarClick(e, tripId, refresh) {
  const el = e.target.closest('[data-act="save-trip"], [data-act="discard"]');
  if (!el) return false;
  if (el.dataset.act === 'save-trip') {
    saveTrip(tripId);
    toast('Trip saved. You’ll find it on your home page.');
  } else if (confirm('Discard your unsaved changes and go back to the saved version?')) {
    discardChanges(tripId);
    toast('Changes discarded.');
  }
  refresh();
  return true;
}

// Warn before closing the tab or reloading if a saved trip has unsaved
// changes. (Drafts don't warn: closing the tab is how you drop a trip you
// only looked at.) Returns a function that removes the warning.
export function warnBeforeLeaving(tripId) {
  const handler = (e) => {
    if (saveStatus(tripId) === 'changed') e.preventDefault();
  };
  window.addEventListener('beforeunload', handler);
  return () => window.removeEventListener('beforeunload', handler);
}
