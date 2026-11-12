// Step 5 of a new trip: your picks organised into days that fit the time
// available, with an estimated timetable and a map.
//   - If we know where you stay (step 3), every day starts and ends there.
//   - If we know how you arrive and leave (step 4), the first day starts
//     after you've arrived and dropped your bags, and the last day ends in
//     time to collect them and make your flight or train.
//
// The itinerary is worked out fresh from your picks, dates, pace, stay and
// travel each time the page is drawn, so it is always up to date when you
// change any of them. (Editing days by hand comes in a later step.)
//
// REAL ROUTES. When Transitous is set up in .env (see README), each leg
// between places gets a real route from Transitous: walking along the
// streets, or public transport with the line, direction and stops. The page
// is first drawn with estimates, then redrawn when the routes arrive, and the
// map follows the real streets and lines. Without it, legs are estimates.
import { DESTINATIONS } from '../data/destinations.js';
import { getTrip, PACES, stayPlace } from '../trips.js';
import { organiseTrip } from '../logic/organise.js';
import { dayFrames, clockText, TRAVEL_MODES } from '../logic/travel.js';
import { datesBetween, dayLabels } from '../logic/dates.js';
import { distanceKm } from '../logic/geo.js';
import { MODES, effectiveMode, legMinutes, formatMinutes } from '../logic/transport.js';
import { timetableDate, zonedIso, todayIn, legKey, formatDistance } from '../logic/routing.js';
import { esc, dayStyle, CATEGORY_LABELS } from '../ui/html.js';
import { renderDayFilter } from '../ui/day-list.js';
import { createMap, destroyMap, updateMap, highlightPlace, renderLegend } from '../ui/map.js';
import { renderTripHeader, handleSaveBarClick, warnBeforeLeaving } from '../ui/trip-header.js';
import { notFoundHtml } from './trip-details.js';

export function itineraryView(root, { id }) {
  if (!getTrip(id)) {
    root.innerHTML = notFoundHtml();
    return;
  }
  let dayFilter = 'all';
  let alive = true; // false once you've left the page

  let routing = false; // real routes from Transitous? (asked below)
  // Routes for this visit, by legKey: { status: 'pending'|'done'|'failed', route, fetchedAt }
  const routes = new Map();
  let routeProblem = ''; // the explanation if some routes failed

  fetch('/api/routes-config')
    .then((r) => (r.ok ? r.json() : null))
    .catch(() => null) // no dev server: estimates only
    .then((config) => {
      routing = Boolean(config?.routes);
      if (alive && routing) render();
    });

  // Fetches the routes the last drawing asked for, then draws again.
  async function fetchRoutes(wanted) {
    await Promise.all(wanted.map(async ({ entry, a, b, departure }) => {
      try {
        const { route, fetchedAt } = await askRoute(a, b, departure);
        Object.assign(entry, route ? { status: 'done', route, fetchedAt } : { status: 'failed' });
      } catch (err) {
        routeProblem = err.message;
        entry.status = 'failed';
      }
    }));
    if (alive) render();
  }

  function render() {
    const trip = getTrip(id);
    const dest = DESTINATIONS[trip.destinationId];
    const pace = PACES[trip.pace];
    const dates = datesBetween(trip.startDate, trip.endDate);
    const places = Object.fromEntries(dest.recommendations.map((r) => [r.id, r]));
    // Priority = the recommendation list's order (most famous first).
    const picks = dest.recommendations.filter((r) => trip.picked.includes(r.id));
    const base = `#/plan/${encodeURIComponent(id)}`;
    const home = stayPlace(trip); // where each day starts and ends, or null

    if (!picks.length) {
      destroyMap();
      root.innerHTML = `
        ${renderTripHeader(trip, 'itinerary')}
        ${basicsHtml(trip, dest, home, base, dates)}
        <p class="lede">Pick some places first, and they'll be organised into days here.</p>
        <a class="btn solid" href="${base}">Choose places</a>`;
      return;
    }

    const frames = dayFrames({ dayCount: dates.length, pace, home, travel: trip.travel, dest });
    const plan = organiseTrip(picks, frames);
    if (dayFilter !== 'all' && dayFilter >= dates.length) dayFilter = 'all';
    const travelShapesDays = frames[0].arrival || frames[frames.length - 1].departure;

    // The map and day filter expect the same shape as the Paris planner's data.
    const mapState = {
      trip: {
        days: dates.map(dayLabels),
        places: home ? { ...places, stay: home } : places,
        hotelId: home ? 'stay' : null,
        plans: { main: { days: plan.days.map((ids) => ids.map((placeId) => ({ placeId, fixed: false, mode: 'auto', line: '' }))) } },
      },
      planId: 'main',
      dayFilter,
      loopFromHotel: true,
    };
    const shownDays = dayFilter === 'all' ? dates.map((_, d) => d) : [dayFilter];

    // Looks up the route for each leg as the timetable is drawn, and notes
    // the ones we still need to ask Transitous for.
    const today = todayIn(dest.timeZone);
    const router = {
      on: routing,
      wanted: [], // legs to ask about after drawing
      used: [], // the route entries shown on this drawing
      standIns: new Map(), // trip date -> timetable date used instead
      get(a, b, clock, date) {
        if (!routing) return null;
        const tt = timetableDate(date, today);
        if (tt.standIn) router.standIns.set(date, tt.date);
        const key = legKey(a, b, tt.date);
        let entry = routes.get(key);
        if (!entry) {
          entry = { status: 'pending' };
          routes.set(key, entry);
          router.wanted.push({ entry, a, b, departure: zonedIso(tt.date, clock, dest.timeZone) });
        }
        router.used.push(entry);
        return entry;
      },
    };
    const legs = []; // every leg drawn, for the map: { d, a, b, route }
    const daysHtml = shownDays.map((d) => dayHtml(d, dates[d], plan.days[d], places, frames[d], home, router, legs)).join('');

    root.innerHTML = `
      ${renderTripHeader(trip, 'itinerary')}
      ${basicsHtml(trip, dest, home, base, dates)}
      <p class="lede">Your ${picks.length} picks, grouped so each day stays in one part of the city,
        in the quickest order, within a ${pace.label.toLowerCase()} day of about ${pace.hours} hours${home
          ? `, starting and ending ${home.kind === 'hotel' ? 'at' : 'in'} ${esc(home.label)}`
          : ''}.${travelShapesDays ? ' The first and last days are fitted around your travel.' : ''}</p>
      ${unscheduledHtml(plan.unscheduled, places, base, trip.pace)}
      <div class="itin">
        <div class="mappane">
          ${renderDayFilter(mapState)}
          <div class="map" data-slot="map"></div>
          ${renderLegend()}
          <p class="mapnote">Locations are approximate until we connect a places API.</p>
        </div>
        <div>
          ${daysHtml}
          ${travelNoteHtml(router, routeProblem)}
        </div>
      </div>`;

    createMap(root.querySelector('[data-slot="map"]'), dest.center, routing);
    // With real routes on, the map draws exactly the timetable's legs, along
    // the real streets and lines where we have them.
    updateMap(routing ? { ...mapState, legs } : mapState);

    if (router.wanted.length) fetchRoutes(router.wanted);
  }

  root.addEventListener('click', (e) => {
    if (handleSaveBarClick(e, id, render)) return;
    const chip = e.target.closest('[data-act="day"]');
    if (chip) {
      dayFilter = chip.dataset.day === 'all' ? 'all' : Number(chip.dataset.day);
      render();
    }
  });

  // Hovering (or tabbing to) a stop enlarges its marker on the map.
  const hover = (on) => (e) => {
    const li = e.target.closest?.('.stop');
    if (li?.dataset.place) highlightPlace(li.dataset.place, on);
  };
  root.addEventListener('mouseover', hover(true));
  root.addEventListener('mouseout', hover(false));
  root.addEventListener('focusin', hover(true));
  root.addEventListener('focusout', hover(false));

  render();
  const stopWarning = warnBeforeLeaving(id);
  return () => {
    alive = false;
    stopWarning();
    destroyMap();
  };
}

// Asks our dev server for one route. -> { route, fetchedAt }, or throws with the explanation.
async function askRoute(a, b, departure) {
  const query = new URLSearchParams({ from: `${a.lat},${a.lng}`, to: `${b.lat},${b.lng}`, departure });
  const response = await fetch(`/api/route?${query}`);
  const body = await response.json().catch(() => null);
  if (!response.ok) throw new Error(body?.message ?? `The route couldn't be fetched (error ${response.status}).`);
  return body;
}

// The small print under the days: where travel times come from.
function travelNoteHtml(router, routeProblem) {
  const hours = `<b>Opening days and hours are not checked yet</b>, so a place could be closed on
    the day it's planned. That will come from a places API.`;
  if (!router.on) {
    return `<p class="muted small">Times and visit lengths are rough estimates for planning. Travel is a straight-line
      estimate by foot or metro, and airport transfers are rough guesses, not timetables. ${hours}</p>`;
  }

  const done = router.used.filter((e) => e.status === 'done');
  const pending = router.used.some((e) => e.status === 'pending');
  const failed = router.used.some((e) => e.status === 'failed');
  const fetched = done.map((e) => e.fetchedAt).sort()[0];
  const when = fetched ? new Date(fetched).toLocaleString('en-GB', { weekday: 'short', hour: '2-digit', minute: '2-digit' }) : '';

  let standIn = '';
  const pairs = [...router.standIns];
  if (pairs.length) {
    const [tripDate, ttDate] = pairs[0];
    standIn = `Published timetables only cover the next few months, so public transport uses the timetable
      of the next same weekday (for example ${esc(dayLabels(ttDate).long)} for ${esc(dayLabels(tripDate).long)}).
      Lines and stops rarely change, but check times nearer the trip.`;
  }

  // Transitous asks for a visible link to its data sources; the street data is OpenStreetMap's.
  return `
    <p class="muted small">
      ${pending ? 'Fetching real routes… ' : ''}
      ${done.length ? `Travel between places is from <a href="https://transitous.org" target="_blank" rel="noopener">Transitous</a>${when ? `,
        fetched ${esc(when)}` : ''}: walking along the streets, or public transport with the line and stops,
        from the cities’ published timetables (<a href="https://transitous.org/sources/" target="_blank" rel="noopener">data sources</a>)
        and <a href="https://www.openstreetmap.org/copyright" target="_blank" rel="noopener">© OpenStreetMap</a> contributors. ${standIn}` : ''}
      ${failed ? `Some routes couldn’t be fetched, so those legs show an estimate${routeProblem ? ` (${esc(routeProblem)})` : ''}.` : ''}
      Visit lengths are rough guesses, and airport transfers are rough guesses, not timetables. ${hours}</p>`;
}

// ---------- one day's timetable ----------
// router: looks up real routes (see itineraryView); legs: collects the legs for the map.
function dayHtml(d, date, ids, places, frame, home, router, legs) {
  const labels = dayLabels(date);
  let clock = frame.startClock;
  const rows = [];
  const hasStops = ids.length > 0;
  const homeName = home ? esc(home.label) : '';
  const homeWithAddress = home ? `${homeName}${home.address ? ` <span class="muted">(${esc(home.address)})</span>` : ''}` : '';
  const atHome = home?.kind === 'hotel' ? 'at' : 'in';
  // With real routes on, legs we don't have a route for say so.
  const tag = router.on ? 'estimate' : null;

  // A trip between two places. Moves the clock on. With a real route:
  // "Metro, about 19 min, 500 m on foot" plus the walk, line and stops.
  // Otherwise the straight-line estimate: "Metro, 2.1 km, about 18 min".
  const leg = (a, b) => {
    const entry = router.get(a, b, clock, date);
    if (entry?.route) {
      clock += entry.route.minutes;
      legs.push({ d, a, b, route: entry.route });
      return routeRow(entry.route, b);
    }
    const km = distanceKm(a, b);
    const minutes = legMinutes(km, 'auto');
    clock += minutes;
    legs.push({ d, a, b, route: null });
    return legRow(km, minutes, null, null, entry?.status === 'pending' ? 'checking the route…' : tag);
  };

  // ----- start of the day -----
  if (frame.arrival) {
    rows.push(...arrivalRows(frame.arrival, home, homeWithAddress, tag));
    if (hasStops && frame.startClock > frame.arrival.ready) {
      rows.push(noteRow(`Start sightseeing about ${clockText(frame.startClock)}`));
    }
  } else if (home && hasStops) {
    rows.push(homeRow(`Leave ${homeWithAddress} about ${clockText(clock)}`));
  }
  if (hasStops && frame.start) rows.push(leg(frame.start, places[ids[0]]));

  // ----- the places -----
  ids.forEach((placeId, i) => {
    const p = places[placeId];
    const arrive = clock;
    const leave = arrive + p.visitHours * 60;
    rows.push(`
      <li class="stop" data-place="${placeId}">
        <span class="num">${i + 1}</span>
        <div>
          <div><span class="sname">${esc(p.name)}</span><span class="cat">${CATEGORY_LABELS[p.category]}</span></div>
          <p class="note">About ${clockText(arrive)} to ${clockText(leave)} · ${formatMinutes(p.visitHours * 60)} visit</p>
        </div>
      </li>`);
    clock = leave;
    if (i < ids.length - 1) rows.push(leg(p, places[ids[i + 1]]));
  });

  // ----- end of the day -----
  if (hasStops && frame.end) rows.push(leg(places[ids[ids.length - 1]], frame.end));
  const doneAt = clock;
  if (frame.departure) {
    rows.push(...departureRows(frame.departure, home, homeName, hasStops ? clock : null, tag));
  } else if (home && hasStops) {
    rows.push(homeRow(`Back ${atHome} ${homeName} about ${clockText(clock)}`));
  }

  const travelDay = frame.arrival || frame.departure;
  // Real routes can take longer than the estimates the days were planned with.
  const over = doneAt - frame.startClock - frame.budget;
  const summary = hasStops
    ? `${ids.length} place${ids.length === 1 ? '' : 's'} · ${formatMinutes(doneAt - frame.startClock)} of ${formatMinutes(frame.budget)} · done about ${clockText(doneAt)}${over >= 5 ? ` · about ${formatMinutes(over)} over` : ''}`
    : travelDay ? 'Travel day' : 'Free day';
  const empty = travelDay
    ? (frame.budget > 0 ? '<li class="note">No time left for sightseeing today, or nothing else fits.</li>' : '<li class="note">No time left for sightseeing today.</li>')
    : '<li class="note">Nothing planned. Room for more places, or a rest.</li>';

  return `
    <section class="day" style="${dayStyle(d)}">
      <header class="dayhead">
        <span class="roundel">${d + 1}</span>
        <h3>${esc(labels.long)}</h3>
        <div class="daytools"><span class="km">${summary}</span></div>
      </header>
      <ol class="stops">${rows.join('')}${hasStops ? '' : empty}</ol>
    </section>`;
}

// Arriving: land, get into the city, drop your bags.
// tag: shown after estimated legs when real routes are on.
function arrivalRows(a, home, homeWithAddress, tag) {
  const rows = [];
  const what = travelWhat(a.leg, a.mode, 'from');
  const where = a.point ? ` at ${esc(a.point.name)}` : '';
  rows.push(travelRow(a.mode, `${a.mode === TRAVEL_MODES.flight ? 'Land' : 'Arrive'}${where} about ${clockText(a.arrives)}${what}`));
  if (a.point?.transferMinutes) {
    rows.push(legRow(null, a.mode.arriveBuffer + a.point.transferMinutes,
      `Out of the airport, then into the city to ${esc(a.hub.name)} (${esc(a.point.transfer)}): about ${formatMinutes(a.mode.arriveBuffer + a.point.transferMinutes)}`));
  }
  if (home) {
    if (a.toHome) rows.push(legRow(a.toHome.km, a.toHome.minutes, null, null, tag));
    rows.push(homeRow(`${home.kind === 'hotel' ? 'At' : 'In'} ${homeWithAddress} about ${clockText(a.ready)}${home.kind === 'hotel' ? ': drop your bags' : ''}`));
  } else if (a.hub) {
    rows.push(noteRow(`In the city at ${esc(a.hub.name)} about ${clockText(a.ready)}`));
  }
  return rows;
}

// Leaving: back for your bags, then to the airport or station.
// backAt: when you're back from sightseeing (null if no sightseeing that day).
function departureRows(dep, home, homeName, backAt, tag) {
  const rows = [];
  if (home) {
    const back = backAt != null ? `Back ${home.kind === 'hotel' ? 'at' : 'in'} ${homeName} about ${clockText(backAt)}. ` : '';
    rows.push(homeRow(`${back}Leave ${homeName}${home.kind === 'hotel' ? ' with your bags' : ''} by about ${clockText(dep.leaveBy)}`));
    if (dep.fromHome) rows.push(legRow(dep.fromHome.km, dep.fromHome.minutes, null, dep.hub.name, tag));
  } else if (dep.hub && backAt != null) {
    rows.push(noteRow(`At ${esc(dep.hub.name)} about ${clockText(backAt)}`));
  }
  if (dep.point?.transferMinutes) {
    rows.push(legRow(null, dep.point.transferMinutes, `Out to the airport (${esc(dep.point.transfer)}): about ${formatMinutes(dep.point.transferMinutes)}`));
  }
  const what = travelWhat(dep.leg, dep.mode, 'to');
  const text = dep.mode.departBuffer
    ? `Be at ${dep.point ? esc(dep.point.name) : 'the departure point'} by about ${clockText(dep.beAt)} for your ${clockText(dep.departs)} ${dep.mode.label.toLowerCase()}${what}`
    : `Set off about ${clockText(dep.departs)}${what}`;
  rows.push(travelRow(dep.mode, text));
  return rows;
}

// " (flight IB123 from Madrid)"
function travelWhat(leg, mode, fromTo) {
  const bits = [
    leg.number ? `${mode.label.toLowerCase()} ${esc(leg.number)}` : '',
    leg.place ? `${fromTo} ${esc(leg.place)}` : '',
  ].filter(Boolean);
  return bits.length ? ` (${bits.join(' ')})` : '';
}

function homeRow(text) {
  return `<li class="stop home"><span class="num">H</span><div><p class="note">${text}</p></div></li>`;
}
function travelRow(mode, text) {
  return `<li class="stop travelrow"><span class="num" aria-hidden="true">${mode.icon}</span><div><p class="note">${text}</p></div></li>`;
}
function noteRow(text) {
  return `<li class="stop noterow"><span class="num" aria-hidden="true">•</span><div><p class="note">${text}</p></div></li>`;
}
// An estimated leg. km is null for trips we only know the time of (airport transfers).
// tag: a note after it, e.g. "estimate".
function legRow(km, minutes, text = null, to = null, tag = null) {
  if (text) return `<li class="leg"><span>${text}</span></li>`;
  if (km < 0.1) return '<li class="leg"><span>A few steps</span></li>';
  return `<li class="leg"><span>${MODES[effectiveMode(km, 'auto')]}, ${km.toFixed(1)} km, about ${formatMinutes(minutes)}${to ? ` to ${esc(to)}` : ''}${tag ? ` <span class="legtag">(${tag})</span>` : ''}</span></li>`;
}

// A leg with a real route from Transitous. to: where it ends (a place or where you stay).
//   Walk, 1.4 km, about 18 min
//   Metro, about 19 min, 500 m on foot
//     1. Walk 350 m to Barberini, about 4 min
//     2. [A] Metro towards Anagnina: get on at Barberini, get off at Termini (2 stops), about 6 min
//     3. Walk 150 m to Hotel X, about 2 min
function routeRow(route, to) {
  if (route.mode === 'walk') {
    return `<li class="leg"><span>Walk, ${formatDistance(route.distanceM)}, about ${formatMinutes(route.minutes)}</span></li>`;
  }
  // distanceM counts the walking parts only (the timetable doesn't give ride distances).
  const total = `about ${formatMinutes(route.minutes)}${route.distanceM >= 20 ? `, ${formatDistance(route.distanceM)} on foot` : ''}`;

  const segments = route.segments.filter((s) => s.kind === 'transit' || s.distanceM >= 20); // skip a few steps' walk
  const rides = segments.filter((s) => s.kind === 'transit');
  const kinds = [...new Set(rides.map((s) => s.vehicle))].join(' and ');
  const steps = segments.map((s, i) => {
    if (s.kind === 'walk') {
      const next = segments[i + 1];
      const target = next ? next.from.name : (to.label ?? to.name);
      return `<li>Walk ${formatDistance(s.distanceM)}${target ? ` to ${esc(target)}` : ''}, about ${formatMinutes(s.minutes)}</li>`;
    }
    const stops = s.stops ? ` (${s.stops} stop${s.stops === 1 ? '' : 's'})` : '';
    return `<li>${lineBadge(s)}${esc(s.vehicle)}${s.headsign ? ` towards ${esc(s.headsign)}` : ''}:
      get on at <b>${esc(s.from.name)}</b>, get off at <b>${esc(s.to.name)}</b>${stops}, about ${formatMinutes(s.minutes)}</li>`;
  }).join('');
  return `<li class="leg route"><span>${esc(kinds)}, ${total}</span><ol class="legsteps">${steps}</ol></li>`;
}

// The line's name in its own colours, like the signs: [A], [14], [RER B].
function lineBadge(s) {
  if (!s.line) return '';
  const hex = (c) => (/^#[0-9a-f]{6}$/i.test(c ?? '') ? c : null);
  const bg = hex(s.colour);
  const style = bg ? ` style="background:${bg};color:${hex(s.textColour) ?? '#fff'}"` : '';
  return `<span class="linebadge"${style} title="${esc(s.lineName || s.line)}${s.agency ? `, ${esc(s.agency)}` : ''}">${esc(s.line)}</span> `;
}

// ---------- the summary card at the top ----------
function basicsHtml(trip, dest, home, base, dates) {
  const stay = trip.stay;
  let stayText = '<span class="muted">Not set yet</span>';
  if (home?.kind === 'hotel') {
    const status = home.booked ? 'Booked' : 'Chosen, not booked yet';
    stayText = `<b>${esc(home.label)}</b>${home.address ? `<span>${esc(home.address)}</span>` : ''}<span class="muted small">${status}</span>`;
  } else if (home?.kind === 'area') {
    stayText = `<b>Around ${esc(home.label)}</b><span class="muted small">No hotel chosen yet</span>`;
  } else if (stay?.booked) {
    stayText = '<span class="muted">Booked, but not on the map yet</span>';
  }

  const legText = (leg, date, fromTo) => {
    if (!leg) return '<span class="muted">Not set yet</span>';
    const mode = TRAVEL_MODES[leg.mode];
    const point = dest.arrivalPoints.find((p) => p.id === leg.pointId);
    return `
      <b>${mode.icon} ${mode.label}${leg.place ? ` ${fromTo} ${esc(leg.place)}` : ''}${leg.number ? ` (${esc(leg.number)})` : ''}</b>
      <span>${esc(dayLabels(date).short)}${leg.time ? `, ${leg.time}` : ', time not set'}${point ? ` · ${esc(point.name)}` : ''}</span>`;
  };

  return `
    <section class="card basics">
      <div><span class="basicslabel">Where you stay</span>${stayText}<a class="small" href="${base}/stay">Change</a></div>
      <div><span class="basicslabel">Arriving</span>${legText(trip.travel.arrival, dates[0], 'from')}<a class="small" href="${base}/travel">Change</a></div>
      <div><span class="basicslabel">Leaving</span>${legText(trip.travel.departure, dates[dates.length - 1], 'to')}<a class="small" href="${base}/travel">Change</a></div>
    </section>`;
}

function unscheduledHtml(ids, places, base, pace) {
  if (!ids.length) return '';
  const moreTime = pace === 'packed' ? 'add days' : 'add days or switch to a packed pace';
  const names = ids.map((pid) => `<li>${esc(places[pid].name)} <span class="muted small">(${formatMinutes(places[pid].visitHours * 60)})</span></li>`).join('');
  return `
    <section class="card unfit">
      <h3>Didn't fit: ${ids.length} place${ids.length === 1 ? '' : 's'}</h3>
      <p class="muted">There isn't enough time for everything, so the less famous picks were left out.
        To fit them, <a href="${base}/details">${moreTime}</a>, or
        <a href="${base}">unpick something</a>.</p>
      <ul>${names}</ul>
    </section>`;
}
