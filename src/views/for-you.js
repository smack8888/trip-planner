// Optional step after Places: "For you" (#/plan/<id>/for-you).
//
// A few questions (what you enjoy, crowds, how far, how active), then less
// obvious places that suit the answers (see logic/personalise.js and
// data/discoveries.js). Places you mark "Interested" join your picks, and
// the itinerary organises them into days with the popular ones.
import { DESTINATIONS } from '../data/destinations.js';
import { DISCOVERIES_SOURCE } from '../data/discoveries.js';
import { getTrip, setWorking, togglePick, withAnswer } from '../trips.js';
import { QUESTIONS, suggestions, readyToSuggest } from '../logic/personalise.js';
import { formatMinutes } from '../logic/transport.js';
import { esc, CATEGORY_LABELS } from '../ui/html.js';
import { renderTripHeader, handleSaveBarClick, warnBeforeLeaving } from '../ui/trip-header.js';
import { notFoundHtml } from './trip-details.js';

export function forYouView(root, { id }) {
  if (!getTrip(id)) {
    root.innerHTML = notFoundHtml();
    return;
  }

  function render() {
    const trip = getTrip(id);
    const dest = DESTINATIONS[trip.destinationId];
    const answers = trip.personal ?? {};
    const focusKey = focusedKey();
    const base = `#/plan/${encodeURIComponent(id)}`;

    const questions = QUESTIONS.map((q) => {
      const chosen = (v) => (q.multi ? (answers[q.id] ?? []).includes(v) : answers[q.id] === v);
      const full = q.multi && (answers[q.id] ?? []).length >= q.max;
      const chips = q.options.map(([value, label]) => `
        <button class="chip all" data-q="${q.id}" data-v="${value}" aria-pressed="${chosen(value)}"
          ${full && !chosen(value) ? 'aria-disabled="true"' : ''}>${esc(label)}</button>`).join('');
      return `
        <fieldset class="question">
          <legend>${esc(q.text)}${q.hint ? ` <span class="muted small">${esc(q.hint)}</span>` : ''}</legend>
          <div class="chips" role="group">${chips}</div>
        </fieldset>`;
    }).join('');

    let results;
    if (!readyToSuggest(answers)) {
      results = '<p class="muted">Pick at least one thing you’d like to do, and suggestions will appear here.</p>';
    } else {
      const list = suggestions(dest.discoveries, dest, answers);
      results = list.length
        ? `<div class="grid">${list.map((s) => cardHtml(s, trip.picked.includes(s.place.id))).join('')}</div>`
        : '<p class="muted">Nothing matches all of that. Try another interest, or let us suggest places further out.</p>';
    }

    const mine = dest.discoveries.filter((p) => trip.picked.includes(p.id));
    const total = trip.picked.length;
    root.innerHTML = `
      ${renderTripHeader(trip, 'for-you')}
      <p class="lede">Optional: answer a few questions and we’ll suggest less obvious places in ${esc(dest.name)}
        that suit you. Mark the ones you like, and they’ll go into your itinerary with your other picks.</p>
      <section class="card quiz">${questions}</section>
      <h2 class="resultshead">Suggested for you</h2>
      <p class="source">${esc(DISCOVERIES_SOURCE)}</p>
      ${results}
      <div class="picksbar">
        <div class="picksinfo">
          <b>${total} picked</b>
          <span class="muted small">${mine.length ? `From here: ${mine.map((p) => esc(p.name)).join(', ')}` : 'Nothing picked from here yet.'}
            <a href="${base}">Popular places</a></span>
        </div>
        ${total ? `<a class="btn solid" href="${base}/stay">Next: where you’ll stay →</a>` : ''}
      </div>`;

    if (focusKey) root.querySelector(focusKey)?.focus({ preventScroll: true });
  }

  root.addEventListener('click', (e) => {
    if (handleSaveBarClick(e, id, render)) return;
    const chip = e.target.closest('[data-q]');
    const pick = e.target.closest('[data-rec]');
    if (chip) {
      setWorking(withAnswer(getTrip(id), chip.dataset.q, chip.dataset.v));
      render();
    } else if (pick) {
      setWorking(togglePick(getTrip(id), pick.dataset.rec));
      render();
    }
  });

  // Put keyboard focus back on the same button after redrawing.
  function focusedKey() {
    const el = document.activeElement;
    if (!root.contains(el)) return null;
    if (el.dataset.q) return `[data-q="${el.dataset.q}"][data-v="${el.dataset.v}"]`;
    if (el.dataset.rec) return `[data-rec="${el.dataset.rec}"]`;
    return null;
  }

  render();
  return warnBeforeLeaving(id);
}

// One suggested place, with why it suits you.
function cardHtml({ place, reasons }, picked) {
  return `
    <article class="card reccard" data-picked="${picked}">
      <div class="bkhead"><span class="tag">${CATEGORY_LABELS[place.category]}</span><span class="area">${esc(place.area)}</span></div>
      <h3>${esc(place.name)}</h3>
      <p>${esc(place.why)}</p>
      <p class="suits"><b>Suits you:</b> ${reasons.map(esc).join(' · ')}</p>
      <p class="muted small">About ${formatMinutes(place.visitHours * 60)} there</p>
      <div class="cardactions">
        <button class="pick" data-rec="${place.id}" aria-pressed="${picked}" aria-label="Interested in ${esc(place.name)}">
          ${picked ? '✓ Interested' : 'Interested'}
        </button>
      </div>
    </article>`;
}
