// Step 3 of a new trip: where you'll stay (#/plan/<id>/stay).
//
// First we ask whether you've already booked somewhere.
//   Yes:     add the name and address, and click the map to put a pin where
//            it is. (Finding the address on the map by itself needs an
//            address-lookup service, which isn't connected yet.)
//   Not yet: we suggest areas to stay in, closest to your picks first, with
//            links that search for places to stay there on other sites.
//            "Show hotels and prices here" asks LiteAPI (through our own
//            server, see server/hotels-api.js) for hotels with rooms for
//            your dates. Only when you press it, so no needless calls.
//            Click a hotel to choose it: the itinerary then uses its address.
// Either way, the itinerary then starts and ends each day there.
import L from 'leaflet';
import { DESTINATIONS } from '../data/destinations.js';
import { getTrip, setWorking, chooseBooked, withStay, chooseHotel, PACES } from '../trips.js';
import { organiseTrip } from '../logic/organise.js';
import { rankAreas } from '../logic/stay.js';
import { datesBetween, parseDate } from '../logic/dates.js';
import { formatMinutes } from '../logic/transport.js';
import { distanceKm } from '../logic/geo.js';
import { esc } from '../ui/html.js';
import { createMap, destroyMap, getMap, icon } from '../ui/map.js';
import { renderTripHeader, renderSaveBar, handleSaveBarClick, warnBeforeLeaving } from '../ui/trip-header.js';
import { notFoundHtml } from './trip-details.js';

export function stayView(root, { id }) {
  if (!getTrip(id)) {
    root.innerHTML = notFoundHtml();
    return;
  }
  let hotelMarker = null;
  // Hotel searches done on this page, by "areaId|checkin|checkout":
  // { status: 'loading' } | { status: 'done', hotels, sandbox, fetchedAt } | { status: 'error', message }
  const hotelResults = {};

  function render() {
    const trip = getTrip(id);
    const dest = DESTINATIONS[trip.destinationId];
    const stay = trip.stay;
    const focusKey = focusedKey();

    let section = '';
    if (stay?.booked === true) section = bookedHtml(stay);
    if (stay?.booked === false) section = optionsHtml(trip, dest, hotelResults);

    root.innerHTML = `
      ${renderTripHeader(trip, 'stay')}
      <p class="lede">Each day of the itinerary starts and ends where you stay, so it shapes the whole plan.</p>
      <fieldset class="staychoice">
        <legend>Have you already booked somewhere to stay?</legend>
        <div class="choices">
          ${choice('yes', 'Yes, it’s booked', 'Add the address and put it on the map.', stay?.booked === true)}
          ${choice('no', 'Not yet', 'See which areas suit your picks, and search for a place there.', stay?.booked === false)}
        </div>
      </fieldset>
      ${section}
      <div class="picksbar">
        <div class="picksinfo"><span class="muted small" data-nextinfo>${nextInfo(trip, dest)}</span></div>
        <a class="btn solid" href="#/plan/${encodeURIComponent(id)}/travel">Next: getting there →</a>
      </div>`;

    hotelMarker = null;
    if (stay?.booked === true) drawBookedMap(trip, dest);
    if (stay?.booked === false) drawAreasMap(trip, dest);
    if (focusKey) root.querySelector(focusKey)?.focus({ preventScroll: true });
  }

  // ---------- "Yes, it's booked" ----------
  function drawBookedMap(trip, dest) {
    const stay = trip.stay;
    createMap(root.querySelector('[data-slot="map"]'), dest.center);
    const map = getMap();
    drawPicks(map, trip, dest);
    if (stay.lat != null) {
      putHotelPin(map, [stay.lat, stay.lng]);
      map.setView([stay.lat, stay.lng], 15, { animate: false });
    }
    // Click anywhere to put the pin there.
    map.on('click', (e) => placeHotel(e.latlng));
  }

  function putHotelPin(map, latlng) {
    if (hotelMarker) {
      hotelMarker.setLatLng(latlng);
      return;
    }
    hotelMarker = L.marker(latlng, {
      icon: icon('<div class="pin hotel">H</div>', 22),
      draggable: true,
      keyboard: false,
      title: 'Your hotel',
    }).addTo(map);
    hotelMarker.on('dragend', () => placeHotel(hotelMarker.getLatLng()));
  }

  function placeHotel({ lat, lng }) {
    const round = (n) => Math.round(n * 1e5) / 1e5; // about 1 metre
    const trip = withStay(getTrip(id), { lat: round(lat), lng: round(lng) });
    setWorking(trip);
    putHotelPin(getMap(), [lat, lng]);
    root.querySelector('[data-pinstatus]').innerHTML = pinStatus(trip.stay);
    refreshInfo(trip);
  }

  // ---------- "Not yet" ----------
  function drawAreasMap(trip, dest) {
    createMap(root.querySelector('[data-slot="map"]'), dest.center);
    const map = getMap();
    const points = drawPicks(map, trip, dest);
    rankedAreas(trip, dest).forEach(({ area }, i) => {
      const chosen = trip.stay.areaId === area.id;
      L.marker([area.lat, area.lng], {
        icon: icon(`<div class="pin area${chosen ? ' chosen' : ''}">${i + 1}</div>`, 26),
        zIndexOffset: chosen ? 500 : 0,
      }).bindTooltip(`${i + 1}. ${esc(area.name)}`).addTo(map);
      points.push([area.lat, area.lng]);
    });
    const hotel = trip.stay.hotel;
    if (hotel) {
      L.marker([hotel.lat, hotel.lng], { icon: icon('<div class="pin hotel">H</div>', 22), zIndexOffset: 1000 })
        .bindTooltip(`Your choice: ${esc(hotel.name)}`)
        .addTo(map);
    }
    map.fitBounds(points, { padding: [30, 30], maxZoom: 14, animate: false });
  }

  // Small grey dots for your picks, so you can see where your days will be.
  function drawPicks(map, trip, dest) {
    const points = [];
    dest.recommendations
      .filter((r) => trip.picked.includes(r.id))
      .forEach((r) => {
        L.marker([r.lat, r.lng], { icon: icon('<div class="pin dot"></div>', 12), interactive: true })
          .bindTooltip(`Your pick: ${esc(r.name)}`)
          .addTo(map);
        points.push([r.lat, r.lng]);
      });
    return points;
  }

  // ---------- events ----------
  root.addEventListener('change', (e) => {
    if (e.target.name === 'booked') {
      setWorking(chooseBooked(getTrip(id), e.target.value === 'yes'));
      render();
    }
  });

  // Typing the name or address saves it into the working copy straight away.
  root.addEventListener('input', (e) => {
    const field = e.target.dataset.stayField;
    if (!field) return;
    const trip = withStay(getTrip(id), { [field]: e.target.value });
    setWorking(trip);
    if (field === 'address') root.querySelector('[data-lookup]').innerHTML = lookupLink(trip.stay.address);
    refreshInfo(trip);
  });

  // ---------- hotel listings (LiteAPI) ----------
  async function loadHotels(areaId) {
    const trip = getTrip(id);
    const area = DESTINATIONS[trip.destinationId].areas.find((a) => a.id === areaId);
    const [checkin, checkout] = stayDates(trip);
    const key = `${areaId}|${checkin}|${checkout}`;
    hotelResults[key] = { status: 'loading' };
    showHotels(area, trip);
    try {
      const query = new URLSearchParams({ lat: area.lat, lng: area.lng, checkin, checkout });
      const response = await fetch(`/api/hotels?${query}`);
      const body = await response.json();
      hotelResults[key] = response.ok
        ? { status: 'done', ...body }
        : { status: 'error', message: body.message || 'Something went wrong fetching hotels.' };
    } catch {
      hotelResults[key] = { status: 'error', message: 'Could not reach the app’s server. Is it still running?' };
    }
    showHotels(area, getTrip(id));
  }

  // Redraw just one area's hotel list (the page may have changed meanwhile).
  function showHotels(area, trip) {
    const box = root.querySelector(`[data-hotels="${area.id}"]`);
    if (box) box.innerHTML = hotelsInner(hotelResults[hotelKey(area, trip)], area, trip);
  }

  root.addEventListener('click', (e) => {
    if (handleSaveBarClick(e, id, render)) return;
    const more = e.target.closest('[data-hotels-for]');
    if (more) {
      loadHotels(more.dataset.hotelsFor);
      return;
    }
    // Click a hotel to choose it; click it again to un-choose it.
    const hotelButton = e.target.closest('[data-hotel]');
    if (hotelButton) {
      const trip = getTrip(id);
      const area = DESTINATIONS[trip.destinationId].areas.find((a) => a.id === hotelButton.dataset.hotelArea);
      const result = hotelResults[hotelKey(area, trip)];
      const listing = result?.hotels?.find((h) => h.id === hotelButton.dataset.hotel);
      if (!listing) return;
      const [checkin, checkout] = stayDates(trip);
      const already = trip.stay.hotel?.id === listing.id;
      setWorking(already
        ? chooseHotel(trip, area.id, null)
        : chooseHotel(trip, area.id, listing, { checkin, checkout, fetchedAt: result.fetchedAt }));
      render();
      return;
    }
    // Choosing (or un-choosing) an area forgets any hotel you'd chosen.
    const pick = e.target.closest('[data-area]');
    if (pick) {
      const trip = getTrip(id);
      const areaId = trip.stay.areaId === pick.dataset.area ? null : pick.dataset.area;
      setWorking(withStay(trip, { areaId, hotel: null }));
      render();
    }
  });

  // Update the save bar and the "next" line without redrawing the page
  // (so typing isn't interrupted).
  function refreshInfo(trip) {
    const bar = root.querySelector('.savebar');
    const fresh = renderSaveBar(trip);
    if (!fresh.includes(`data-status="${bar.dataset.status}"`)) bar.outerHTML = fresh;
    root.querySelector('[data-nextinfo]').textContent = nextInfo(trip, DESTINATIONS[trip.destinationId]);
  }

  // Which control had focus, so it can get it back after a redraw.
  function focusedKey() {
    const el = document.activeElement;
    if (!root.contains(el)) return null;
    if (el.name === 'booked') return `[name="booked"][value="${el.value}"]`;
    if (el.dataset.area) return `[data-area="${el.dataset.area}"]`;
    if (el.dataset.hotel) return `[data-hotel="${el.dataset.hotel}"]`;
    return null;
  }

  render();
  const stopWarning = warnBeforeLeaving(id);
  return () => {
    stopWarning();
    destroyMap();
  };
}

// ---------- HTML pieces ----------
function choice(value, title, text, checked) {
  return `
    <label class="choice">
      <input type="radio" name="booked" value="${value}"${checked ? ' checked' : ''}>
      <span><b>${title}</b><span class="muted small">${text}</span></span>
    </label>`;
}

function bookedHtml(stay) {
  return `
    <div class="itin">
      <div class="stayform">
        <h2>Your hotel</h2>
        <label><span>Name <span class="small">(optional)</span></span>
          <input data-stay-field="name" value="${esc(stay.name)}" autocomplete="off" placeholder="Name of the hotel or flat">
        </label>
        <label>Address
          <textarea data-stay-field="address" rows="2" autocomplete="off" placeholder="Street, number, postcode">${esc(stay.address)}</textarea>
        </label>
        <p class="pinstatus" data-pinstatus>${pinStatus(stay)}</p>
        <p class="muted small" data-lookup>${lookupLink(stay.address)}</p>
        <p class="muted small">The map can’t find an address by itself yet: that needs an address-lookup
          service, which isn’t connected. For now, the pin is what the itinerary uses.</p>
      </div>
      <div class="mappane">
        <div class="map" data-slot="map"></div>
        <p class="mapnote">Click the map where your hotel is. Grey dots are your picks.</p>
      </div>
    </div>`;
}

function pinStatus(stay) {
  return stay.lat == null
    ? '<b>Next:</b> click the map where it is.'
    : '<b>✓ Pin placed.</b> Drag it, or click somewhere else on the map, to move it.';
}

// A link that opens OpenStreetMap's own search in a new tab, to help you
// find the spot. Nothing is sent anywhere unless you click it.
function lookupLink(address) {
  if (!address.trim()) return '';
  const url = `https://www.openstreetmap.org/search?query=${encodeURIComponent(address.trim())}`;
  return `Not sure where it is? <a href="${url}" target="_blank" rel="noopener noreferrer">Look the address up on
    OpenStreetMap ↗</a> (opens a new tab), then click the same spot here.`;
}

function optionsHtml(trip, dest, hotelResults) {
  const ranked = rankedAreas(trip, dest);
  const hasTimes = ranked[0]?.minutesPerDay != null;
  const [checkin, checkout] = stayDates(trip);
  const cards = ranked.map(({ area, minutesPerDay }, i) => {
    const chosen = trip.stay.areaId === area.id;
    const where = `${area.name}, ${dest.name}`;
    const booking = `https://www.booking.com/searchresults.html?ss=${encodeURIComponent(where)}&checkin=${checkin}&checkout=${checkout}&group_adults=2&no_rooms=1&group_children=0`;
    const maps = `https://www.google.com/maps/search/?api=1&query=${encodeURIComponent(`hotels in ${where}`)}`;
    const link = (href, label) => `<a href="${href}" target="_blank" rel="noopener noreferrer">${label} ↗</a>`;
    return `
      <article class="card areacard" data-chosen="${chosen}">
        <div class="bkhead">
          <span class="tag">${i + 1}${i === 0 && hasTimes ? ' · Closest to your picks' : ''}</span>
          ${hasTimes ? `<span class="area">About ${formatMinutes(minutesPerDay)} a day getting to and from your plans</span>` : ''}
        </div>
        <h3>${esc(area.name)}</h3>
        <p>${esc(area.why)}</p>
        <div class="cardactions">
          <button class="pick" data-area="${area.id}" aria-pressed="${chosen}">
            ${chosen ? '✓ Planning around this area' : 'Plan around this area'}
          </button>
        </div>
        ${chosen && trip.stay.hotel ? chosenHotelHtml(trip.stay.hotel, trip, dest) : ''}
        <div class="hotels" data-hotels="${area.id}" aria-live="polite">${hotelsInner(hotelResults[hotelKey(area, trip)], area, trip)}</div>
        <p class="searchlinks small">Or search for places to stay here: ${link(booking, 'Booking.com')} · ${link(maps, 'Google Maps')}</p>
      </article>`;
  }).join('');

  return `
    <div class="itin">
      <div>
        <h2>Where to stay in ${esc(dest.name)}</h2>
        <p class="source">${hasTimes
          ? 'Areas are ranked by the travel from each one to where your days start and end.'
          : 'Pick some places first, and these areas will be ranked by how close they are to them.'}
          It’s a hand-picked list of areas with approximate locations. Hotels, prices and guest ratings come
          from LiteAPI when you ask for them, for your dates, 2 adults in one room. The search links open
          another site in a new tab.</p>
        <div class="areas">${cards}</div>
      </div>
      <div class="mappane">
        <div class="map" data-slot="map"></div>
        <p class="mapnote">Numbers match the list. Grey dots are your picks. Locations are approximate.</p>
      </div>
    </div>`;
}

function hotelKey(area, trip) {
  const [checkin, checkout] = stayDates(trip);
  return `${area.id}|${checkin}|${checkout}`;
}

// What goes in an area card's hotel box, for each stage of a search.
function hotelsInner(result, area, trip) {
  const button = (label, cls = 'btn') => `<button class="${cls}" data-hotels-for="${area.id}">${label}</button>`;
  if (!result) return button('Show hotels and prices here');
  if (result.status === 'loading') return '<p class="muted small">Looking for hotels with rooms for your dates…</p>';
  if (result.status === 'error') return `<p class="hotelerror small">${esc(result.message)}</p>${button('Try again', 'mini')}`;

  const [checkin, checkout] = stayDates(trip);
  const nights = datesBetween(checkin, checkout).length - 1;
  const fetched = new Date(result.fetchedAt).toLocaleString('en-GB', { day: 'numeric', month: 'short', year: 'numeric', hour: '2-digit', minute: '2-digit' });
  const source = `Cheapest first. Click a hotel to choose it. Hotels, prices and ratings from LiteAPI, fetched ${esc(fetched)}. Prices change; check them before you book.
    ${result.sandbox ? '<b>Test account:</b> these may be test prices, not real ones.' : ''}`;
  if (!result.hotels.length) {
    return `<p class="muted small">LiteAPI found no hotels with rooms within 1.5 km for your dates.</p>
      <p class="hotelsource">${source}</p>${button('Search again', 'mini')}`;
  }

  const rows = result.hotels.map((h) => {
    const km = h.lat != null ? distanceKm(area, h) : null;
    const details = [
      h.stars ? `${h.stars}-star` : '',
      km != null ? `${km.toFixed(1)} km from the area’s centre` : '',
    ].filter(Boolean).join(' · ');
    const rating = h.rating != null
      ? `Guest rating ${h.rating.toFixed(1)} out of 10${h.reviewCount ? ` from ${h.reviewCount.toLocaleString('en-GB')} reviews` : ''}`
      : 'No guest rating';
    const terms = [
      h.board ? sentenceCase(h.board) : '',
      h.refundable === true ? 'Refundable' : h.refundable === false ? 'Non-refundable' : '',
    ].filter(Boolean).join(' · ');
    // A hotel without a location can't be used to plan the days, so it can't be chosen.
    const choosable = h.lat != null && h.lng != null;
    const chosen = trip.stay.hotel?.id === h.id;
    const inner = `
        ${h.photo ? `<img src="${esc(h.photo)}" alt="" loading="lazy" width="72" height="72">` : '<span class="nophoto" aria-hidden="true"></span>'}
        <span class="hotelinfo">
          <b>${chosen ? '✓ ' : ''}${esc(h.name)}</b>
          ${details ? `<span class="muted small">${details}</span>` : ''}
          ${h.address ? `<span class="muted small">${esc(h.address)}</span>` : ''}
          <span class="small">${rating}</span>
          ${terms ? `<span class="small">${esc(terms)}</span>` : ''}
          ${chosen ? '<span class="small chosenlabel">Your choice. Click again to un-choose.</span>' : ''}
          ${choosable ? '' : '<span class="muted small">Location unknown, so it can’t be chosen.</span>'}
        </span>
        <span class="hotelprice">
          <b>${formatPrice(h.price)}</b>
          <span class="muted small">${nights} night${nights === 1 ? '' : 's'}, cheapest room</span>
          ${h.extraFees ? `<span class="muted small">plus ${formatPrice(h.extraFees)} city tax or fees, not included</span>` : ''}
        </span>`;
    return `
      <li>
        ${choosable
          ? `<button type="button" class="hotel" data-hotel="${esc(h.id)}" data-hotel-area="${area.id}" aria-pressed="${chosen}">${inner}</button>`
          : `<div class="hotel">${inner}</div>`}
      </li>`;
  }).join('');
  return `<ul class="hotellist">${rows}</ul><p class="hotelsource">${source}</p>`;
}

// The hotel you chose, shown in its area's card (even before you search again).
function chosenHotelHtml(hotel, trip, dest) {
  const [checkin, checkout] = stayDates(trip);
  const sameDates = hotel.checkin === checkin && hotel.checkout === checkout;
  const checked = hotel.fetchedAt
    ? new Date(hotel.fetchedAt).toLocaleDateString('en-GB', { day: 'numeric', month: 'short', year: 'numeric' })
    : '';
  const price = hotel.price && sameDates
    ? `${formatPrice(hotel.price)} for your dates when checked on ${esc(checked)} (LiteAPI).`
    : hotel.price ? 'The price you saw was for other dates; search again for your current dates.' : '';
  const find = `https://www.google.com/maps/search/?api=1&query=${encodeURIComponent(`${hotel.name}, ${hotel.address}, ${dest.name}`)}`;
  return `
    <div class="chosenhotel">
      <span class="small chosenlabel">Your choice. Not booked yet.</span>
      <b>${esc(hotel.name)}</b>
      ${hotel.address ? `<span class="muted small">${esc(hotel.address)}</span>` : ''}
      ${price ? `<span class="small">${price}</span>` : ''}
      <a class="small" href="${find}" target="_blank" rel="noopener noreferrer">Find it on Google Maps ↗</a>
    </div>`;
}

// 'BREAKFAST INCLUDED' or 'Breakfast Included' -> 'Breakfast included'
function sentenceCase(s) {
  const lower = s.toLowerCase();
  return lower.charAt(0).toUpperCase() + lower.slice(1);
}

function formatPrice({ amount, currency }) {
  try {
    return new Intl.NumberFormat('en-GB', { style: 'currency', currency, maximumFractionDigits: 0 }).format(amount);
  } catch {
    return `${Math.round(amount)} ${esc(currency)}`;
  }
}

// Areas ranked against the days as they'd be organised without a base.
function rankedAreas(trip, dest) {
  const byId = Object.fromEntries(dest.recommendations.map((r) => [r.id, r]));
  const picks = dest.recommendations.filter((r) => trip.picked.includes(r.id));
  const dayCount = datesBetween(trip.startDate, trip.endDate).length;
  const { days } = organiseTrip(picks, dayCount, PACES[trip.pace].hours);
  return rankAreas(dest.areas, days.map((ids) => ids.map((pid) => byId[pid])));
}

// Check in on the first day, check out on the last day (or the next morning
// for a one-day trip).
function stayDates(trip) {
  let checkout = trip.endDate;
  if (checkout <= trip.startDate) {
    const next = parseDate(trip.startDate);
    next.setUTCDate(next.getUTCDate() + 1);
    checkout = next.toISOString().slice(0, 10);
  }
  return [trip.startDate, checkout];
}

function nextInfo(trip, dest) {
  const stay = trip.stay;
  if (!stay) return 'Answer the question above, or skip it for now: the itinerary works without it.';
  if (stay.booked) {
    return stay.lat == null
      ? 'Put a pin on the map, and each day will start and end at your hotel.'
      : `Each day will start and end at ${stay.name.trim() || 'your hotel'}.`;
  }
  if (stay.hotel) return `Each day will start and end at ${stay.hotel.name}.`;
  const area = dest.areas.find((a) => a.id === stay.areaId);
  return area
    ? `Each day will start and end in ${area.name}. Choose a hotel below to plan from its address.`
    : 'Choose an area to plan around, or skip it for now.';
}
