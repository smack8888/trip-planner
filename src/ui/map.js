// The real map, using Leaflet (the map library) and OpenStreetMap tiles
// (the map pictures). No account or key is needed. OpenStreetMap asks that
// every map shows the "© OpenStreetMap contributors" credit, and keeps
// usage light, which a personal app easily does.
import L from 'leaflet';
import 'leaflet/dist/leaflet.css';
import { distanceKm } from '../logic/geo.js';
import { MODES, effectiveMode } from '../logic/transport.js';
import { decodePolyline } from '../logic/routing.js';
import { esc, dayColourNumber, dayStyle } from './html.js';
import { visibleDays } from './day-list.js';

// How each mode's line looks. dash is Leaflet's dashArray (in pixels).
const LINE_STYLE = {
  walk: { dash: '1 9', weight: 5 },
  bike: { dash: '10 7', weight: 4 },
  metro: { dash: null, weight: 4.5 },
  bus: { dash: '16 6 3 6', weight: 4 },
};

let map;
let layer; // everything we draw on top of the tiles; cleared on each update
let lastViewKey = '';

// center: [lat, lng] to show before any stops are drawn (Paris by default).
// withRoutes: real routes from Transitous are shown, so credit it too.
export function createMap(element, center = [48.86, 2.33], withRoutes = false) {
  destroyMap();
  map = L.map(element, { zoomSnap: 0.5 }).setView(center, 13);
  const routesCredit = withRoutes ? ' · Routes: <a href="https://transitous.org/sources/">Transitous</a>' : '';
  L.tileLayer('https://tile.openstreetmap.org/{z}/{x}/{y}.png', {
    maxZoom: 19,
    attribution: `&copy; <a href="https://www.openstreetmap.org/copyright">OpenStreetMap</a> contributors${routesCredit}`,
  }).addTo(map);
  layer = L.layerGroup().addTo(map);
}

// The Leaflet map itself, for pages that draw their own markers (the Stay page).
export function getMap() {
  return map;
}

// Called when you leave the planner page, so Leaflet can tidy up.
export function destroyMap() {
  if (map) map.remove();
  map = null;
  layer = null;
  lastViewKey = '';
}

// Redraw markers and route lines for the current plan and day filter.
// With state.loopFromHotel, each day also gets a line out from the hotel to
// its first stop and back from its last stop.
// With state.legs ([{ d, a, b, route }], from the itinerary), exactly those
// legs are drawn instead, along the real route where there is one.
export function updateMap(state) {
  const { trip } = state;
  const days = visibleDays(state);
  const plan = trip.plans[state.planId];
  const css = getComputedStyle(document.documentElement);
  const colourOf = (d) => css.getPropertyValue(`--d${dayColourNumber(d)}`).trim();
  const hotel = trip.places[trip.hotelId];
  layer.clearLayers();
  const points = [];

  // 1. Route lines, one per leg, coloured by day and styled by mode.
  if (state.legs) {
    state.legs.forEach(({ d, a, b, route }) => {
      if (route) drawRoute(route, a, b, colourOf(d));
      else drawLeg(a, b, 'auto', colourOf(d));
    });
  } else {
    days.forEach((d) => {
      const colour = colourOf(d);
      const stops = plan.days[d];
      for (let i = 0; i < stops.length - 1; i++) {
        drawLeg(trip.places[stops[i].placeId], trip.places[stops[i + 1].placeId], stops[i].mode, colour);
      }
      if (state.loopFromHotel && hotel && stops.length) {
        drawLeg(hotel, trip.places[stops[0].placeId], 'auto', colour);
        drawLeg(trip.places[stops[stops.length - 1].placeId], hotel, 'auto', colour);
      }
    });
  }

  // 2. The hotel (if the trip has one yet), drawn as a dark "H" square.
  if (hotel) {
    L.marker([hotel.lat, hotel.lng], { icon: icon('<div class="pin hotel">H</div>', 22), zIndexOffset: -100 })
      .bindTooltip(esc(hotel.name))
      .addTo(layer);
    points.push([hotel.lat, hotel.lng]);
  }

  // 3. Numbered stop markers. Fixed slots get a square marker.
  days.forEach((d) => {
    plan.days[d].forEach((s, i) => {
      const p = trip.places[s.placeId];
      const html = `<div class="pin${s.fixed ? ' fixed' : ''}" data-place="${s.placeId}"
        style="${dayStyle(d)}">${i + 1}</div>`;
      L.marker([p.lat, p.lng], { icon: icon(html, 26) })
        .bindTooltip(`Day ${d + 1}, stop ${i + 1}: ${esc(p.name)}${s.fixed ? ' (fixed slot)' : ''}`)
        .addTo(layer);
      points.push([p.lat, p.lng]);
    });
  });

  // Re-centre only when the plan or day filter changes, so editing a stop
  // doesn't throw away your own zoom and pan.
  const viewKey = `${state.planId}|${state.dayFilter}`;
  if (viewKey !== lastViewKey && points.length) {
    // No animation: a page change mid-animation would make Leaflet crash.
    map.fitBounds(points, { padding: [40, 40], maxZoom: 15, animate: false });
    lastViewKey = viewKey;
  }
}

// Enlarge the markers for one place (used when hovering a stop in the list).
export function highlightPlace(placeId, on) {
  document
    .querySelectorAll(`.pin[data-place="${placeId}"]`)
    .forEach((el) => el.classList.toggle('hot', on));
}

export function renderLegend() {
  const items = Object.entries(MODES).map(([mode, label]) => {
    const s = LINE_STYLE[mode];
    const dash = s.dash ? ` stroke-dasharray="${s.dash}"` : '';
    return `<span><svg width="38" height="10" viewBox="0 0 38 10" aria-hidden="true">
      <line x1="4" y1="5" x2="34" y2="5" stroke="currentColor" stroke-width="${s.weight}" stroke-linecap="round"${dash}/>
    </svg>${label}</span>`;
  });
  return `<div class="legend" aria-label="Transport legend">${items.join('')}</div>`;
}

// One coloured line from place a to place b, dashed according to the mode.
function drawLeg(a, b, chosenMode, colour) {
  const mode = effectiveMode(distanceKm(a, b), chosenMode);
  const style = LINE_STYLE[mode];
  const line = [[a.lat, a.lng], [b.lat, b.lng]];
  // A white line underneath keeps the coloured line visible on busy tiles.
  L.polyline(line, { color: '#fff', weight: style.weight + 3, opacity: 0.8, interactive: false }).addTo(layer);
  L.polyline(line, { color: colour, weight: style.weight, dashArray: style.dash, lineCap: 'round' })
    .bindTooltip(`${MODES[mode]}: ${esc(a.name)} to ${esc(b.name)}`, { sticky: true })
    .addTo(layer);
}

// A real route: each part along its real shape. Walking is dotted, public
// transport solid (both in the day's colour, like the estimated lines).
function drawRoute(route, a, b, colour) {
  route.segments.forEach((s) => {
    const style = LINE_STYLE[s.kind === 'walk' ? 'walk' : 'metro'];
    const label = s.kind === 'walk'
      ? `Walk: ${esc(a.name)} to ${esc(b.label ?? b.name)}`
      : `${esc(s.vehicle)}${s.line ? ` ${esc(s.line)}` : ''}: ${esc(s.from.name)} to ${esc(s.to.name)}`;
    s.paths.forEach(({ points, precision }) => {
      const line = decodePolyline(points, precision);
      if (line.length < 2) return;
      L.polyline(line, { color: '#fff', weight: style.weight + 3, opacity: 0.8, interactive: false }).addTo(layer);
      L.polyline(line, { color: colour, weight: style.weight, dashArray: style.dash, lineCap: 'round' })
        .bindTooltip(label, { sticky: true })
        .addTo(layer);
    });
  });
}

export function icon(html, size) {
  return L.divIcon({ html, className: 'pin-wrap', iconSize: [size, size], iconAnchor: [size / 2, size / 2] });
}
