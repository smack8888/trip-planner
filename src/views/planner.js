// The full planner for our past Paris trip: map, day list, fixed slots,
// transport legs and the optimiser. (This was main.js in step 1.)
//
// The page is built once as a "shell" with empty slots. On every change we
// redraw the header and day list slots. The map is NOT redrawn from scratch
// (that would reset its zoom); it is updated in place.
import { state, actions, onChange } from '../state.js';
import { renderHeader } from '../ui/header.js';
import { renderDayFilter, renderDayList } from '../ui/day-list.js';
import { createMap, destroyMap, updateMap, highlightPlace, renderLegend } from '../ui/map.js';
import { formatMinutes } from '../logic/transport.js';
import { COORDS_NOTE } from '../data/paris-trip.js';
import { toast } from '../ui/toast.js';

export function plannerView(root) {
  root.innerHTML = `
    <a class="back" href="#/">← All trips</a>
    <div data-slot="header"></div>
    <div class="itin">
      <div class="mappane">
        <div data-slot="dayfilter"></div>
        <div class="map" data-slot="map"></div>
        <div>${renderLegend()}</div>
        <p class="mapnote">${COORDS_NOTE} The dark square marked H is the hotel. Square markers are fixed slots.</p>
      </div>
      <div data-slot="days"></div>
    </div>
    <footer class="foot">
      <p>Distances are straight-line estimates between stops. Travel times assume typical walking, rental bike,
        metro and bus speeds and include waiting time. Your changes are saved in this browser only.</p>
      <button class="mini" data-act="reset">Reset trip data</button>
    </footer>`;
  const slot = (name) => root.querySelector(`[data-slot="${name}"]`);

  function render() {
    const focusKey = rememberFocus(root);
    slot('header').innerHTML = renderHeader(state);
    slot('dayfilter').innerHTML = renderDayFilter(state);
    slot('days').innerHTML = renderDayList(state);
    updateMap(state);
    restoreFocus(root, focusKey);
  }

  // Hovering (or tabbing to) a stop in the list enlarges its marker on the map.
  function hover(e, on) {
    const li = e.target.closest?.('.stop');
    if (li) highlightPlace(li.dataset.place, on);
  }
  root.addEventListener('mouseover', (e) => hover(e, true));
  root.addEventListener('mouseout', (e) => hover(e, false));
  root.addEventListener('focusin', (e) => hover(e, true));
  root.addEventListener('focusout', (e) => hover(e, false));

  // ---------- clicks ----------
  root.addEventListener('click', (e) => {
    const el = e.target.closest('[data-act]');
    if (!el) return;
    const d = Number(el.dataset.d);
    const i = Number(el.dataset.i);

    switch (el.dataset.act) {
      case 'plan':
        actions.showPlan(el.dataset.plan);
        break;
      case 'day':
        actions.filterDay(el.dataset.day === 'all' ? 'all' : Number(el.dataset.day));
        break;
      case 'fixed':
        actions.toggleFixed(d, i);
        break;
      case 'up':
        actions.move(d, i, -1);
        break;
      case 'down':
        actions.move(d, i, +1);
        break;
      case 'remove':
        toast(`Removed ${actions.remove(d, i)} from Day ${d + 1}.`);
        break;
      case 'optimise':
        explainOptimise(d, actions.optimise(d));
        break;
      case 'reset':
        if (confirm('Reset both plans to the original Paris trip? Your changes will be lost.')) {
          actions.resetTrip();
          toast('Trip data reset.');
        }
        break;
    }
  });

  // ---------- dropdowns and text boxes ----------
  root.addEventListener('change', (e) => {
    const el = e.target;
    const d = Number(el.dataset.d);
    const i = Number(el.dataset.i);

    switch (el.dataset.field) {
      case 'mode':
        actions.setMode(d, i, el.value);
        break;
      case 'line':
        actions.setLine(d, i, el.value.trim());
        break;
      case 'time':
        actions.setTime(d, i, el.value.trim());
        break;
      case 'day':
        if (el.value !== '') {
          const to = Number(el.value);
          toast(`Moved ${actions.moveToDay(d, i, to)} to Day ${to + 1}.`);
        }
        break;
    }
  });

  createMap(slot('map'));
  const stopListening = onChange(render);
  render();

  // Cleanup when leaving this page. The router throws `root` away, which
  // removes the listeners above, so only the map and the state
  // subscription need explicit tidying.
  return () => {
    stopListening();
    destroyMap();
  };
}

function explainOptimise(d, result) {
  const day = `Day ${d + 1}`;
  const messages = {
    'too-few': `${day} has fewer than two unfixed stops, so there is nothing to reorder.`,
    'too-many': `${day} has too many unfixed stops to optimise at once. Fix some first.`,
    'already-best': `${day} is already in the quickest order.`,
    improved: `${day} reordered: about ${formatMinutes(result.beforeMinutes - result.afterMinutes)} less travelling. Fixed slots stayed put.`,
  };
  toast(messages[result.status]);
}

// Redrawing replaces the buttons, so keyboard focus would jump to the top
// of the page. We note which control had focus and put it back afterwards.
function rememberFocus(root) {
  const a = document.activeElement;
  if (!a || !a.dataset || !root.contains(a)) return null;
  const keys = ['act', 'field', 'plan', 'day', 'd', 'i'].filter((k) => a.dataset[k] !== undefined);
  if (!keys.length) return null;
  return keys.map((k) => `[data-${k}="${a.dataset[k]}"]`).join('');
}
function restoreFocus(root, selector) {
  if (!selector) return;
  const el = root.querySelector(selector);
  if (el && !el.disabled) el.focus({ preventScroll: true });
}
