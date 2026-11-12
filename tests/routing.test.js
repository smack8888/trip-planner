// Checks for real routes: reading Transitous's answer (server/transitous.js)
// and the page-side helpers (src/logic/routing.js). No real requests are
// sent: a fake answer stands in. Run with:  npm test
import { describe, it, expect } from 'vitest';
import { parsePlan, fetchPlan, createPlanner, checkRouteQuery, userAgent, RouteError } from '../server/transitous.js';
import { timetableDate, zonedIso, todayIn, legKey, formatDistance, decodePolyline } from '../src/logic/routing.js';

const now = new Date('2026-11-12T10:00:00Z');
const leave = '2026-11-15T09:00:00.000Z';

// Shaped like Transitous's answer: a 25-minute walk, or a metro ride with a walk at each end.
const answer = {
  direct: [{
    duration: 1500, startTime: '2026-11-15T09:00:00Z', endTime: '2026-11-15T09:25:00Z',
    legs: [{ mode: 'WALK', duration: 1500, distance: 1900, legGeometry: { points: 'walkshape', precision: 6, length: 20 } }],
  }],
  itineraries: [{
    duration: 840, startTime: '2026-11-15T09:03:00Z', endTime: '2026-11-15T09:17:00Z',
    legs: [
      { mode: 'WALK', duration: 240, distance: 300, legGeometry: { points: 'a', precision: 6 } },
      {
        mode: 'SUBWAY', duration: 360, routeShortName: 'A', routeLongName: 'Linea A', routeColor: 'F7941D', routeTextColor: 'FFFFFF',
        headsign: 'Anagnina', agencyName: 'ATAC',
        from: { name: 'Barberini', lat: 41.9036, lon: 12.4886 }, to: { name: 'Termini', lat: 41.9009, lon: 12.5013 },
        intermediateStops: [{ name: 'Repubblica' }],
        legGeometry: { points: 'b', precision: 6 },
      },
      { mode: 'WALK', duration: 120, distance: 150, legGeometry: { points: 'c', precision: 6 } },
    ],
  }],
};

describe('reading Transitous’s answer', () => {
  it('keeps the quicker option, counting the wait for the metro', () => {
    const { route, fetchedAt } = parsePlan(answer, leave, now);
    expect(fetchedAt).toBe('2026-11-12T10:00:00.000Z');
    // Metro: leave 09:00, arrive 09:17 -> 17 min (14 min trip + 3 min wait). Walking: 25 min.
    expect(route).toMatchObject({ mode: 'transit', minutes: 17, distanceM: 450 });
    expect(route.segments.map((s) => s.kind)).toEqual(['walk', 'transit', 'walk']);
    expect(route.segments[1]).toEqual({
      kind: 'transit', vehicle: 'Metro', line: 'A', lineName: 'Linea A', colour: '#F7941D', textColour: '#FFFFFF',
      headsign: 'Anagnina', agency: 'ATAC', from: { name: 'Barberini', lat: 41.9036, lng: 12.4886 },
      to: { name: 'Termini', lat: 41.9009, lng: 12.5013 }, stops: 2, minutes: 6, paths: [{ points: 'b', precision: 6 }],
    });
  });

  it('walks when walking is quicker', () => {
    const slowMetro = { ...answer, itineraries: [{ ...answer.itineraries[0], endTime: '2026-11-15T09:40:00Z' }] };
    expect(parsePlan(slowMetro, leave, now).route).toMatchObject({ mode: 'walk', minutes: 25, distanceM: 1900 });
  });

  it('names the direction by where the ride really ends, not an internal code', () => {
    const rer = { itineraries: [{ ...answer.itineraries[0], legs: [{
      ...answer.itineraries[0].legs[1], mode: 'REGIONAL_RAIL', routeShortName: 'B', headsign: 'SOSO', tripTo: { name: 'Laplace' },
    }] }] };
    expect(parsePlan(rer, leave, now).route.segments[0]).toMatchObject({ line: 'B', headsign: 'Laplace' });
  });

  it('passes on plain colours only', () => {
    const odd = { itineraries: [{ ...answer.itineraries[0], legs: [{ ...answer.itineraries[0].legs[1], routeColor: 'red;x' }] }] };
    expect(parsePlan(odd, leave, now).route.segments[0].colour).toBeNull();
  });

  it('no route at all', () => {
    expect(parsePlan({ direct: [], itineraries: [] }, leave, now).route).toBeNull();
  });
});

describe('asking Transitous', () => {
  const query = { from: { lat: 41.9, lng: 12.48 }, to: { lat: 41.89, lng: 12.49 }, departure: leave };
  const ua = userAgent('0.1.0', 'https://github.com/example/trip-planner');

  it('says who it is, and asks for walking and transport at the right time', async () => {
    let seen;
    const fetchImpl = async (url, init) => {
      seen = { url: new URL(url), init };
      return { ok: true, json: async () => answer };
    };
    await fetchPlan(query, { userAgent: ua, fetchImpl, now });
    expect(seen.init.headers['User-Agent']).toBe('TripPlanner/0.1.0 (+https://github.com/example/trip-planner)');
    expect(seen.url.origin).toBe('https://api.transitous.org');
    expect(Object.fromEntries(seen.url.searchParams)).toMatchObject({
      fromPlace: '41.9,12.48', toPlace: '41.89,12.49', time: leave, directModes: 'WALK',
    });
  });

  it('explains failures', async () => {
    const fetchImpl = async () => ({ ok: false, status: 429, json: async () => ({ error: 'too many requests' }) });
    await expect(fetchPlan(query, { userAgent: ua, fetchImpl, now })).rejects.toThrow(/429.*too many/);
  });

  it('never asks for the same leg twice in a day, and sends at most 2 at once', async () => {
    let calls = 0;
    let running = 0;
    let most = 0;
    const fetchImpl = async () => {
      calls++;
      most = Math.max(most, ++running);
      await new Promise((r) => setTimeout(r, 5));
      running--;
      return { ok: true, json: async () => answer };
    };
    const plan = createPlanner({ userAgent: ua, fetchImpl, now: () => now });
    await plan(query);
    await plan(query);
    expect(calls).toBe(1);
    const others = [1, 2, 3, 4, 5].map((i) => ({ ...query, to: { lat: 41.89, lng: 12.49 + i / 1000 } }));
    await Promise.all(others.map(plan));
    expect(calls).toBe(6);
    expect(most).toBeLessThanOrEqual(2);
  });
});

describe('checking what the page asks for', () => {
  const ask = (q) => checkRouteQuery(new URLSearchParams(q));

  it('accepts a sensible question', () => {
    expect(ask('from=41.9,12.48&to=41.89,12.49&departure=2026-11-15T09:00:00Z')).toEqual({
      from: { lat: 41.9, lng: 12.48 }, to: { lat: 41.89, lng: 12.49 }, departure: leave,
    });
  });

  it('refuses nonsense', () => {
    expect(() => ask('from=north&to=41.89,12.49&departure=2026-11-15T09:00:00Z')).toThrow(RouteError);
    expect(() => ask('from=41.9,12.48&to=41.89,12.49')).toThrow(/departure/);
  });
});

describe('page helpers', () => {
  it('uses the real day when its timetable is likely published, otherwise the next same weekday', () => {
    expect(timetableDate('2026-12-01', '2026-11-12')).toEqual({ date: '2026-12-01', standIn: false });
    // 14 March 2027 is a Sunday; the next Sunday after Thursday 12 Nov 2026 is the 15th.
    expect(timetableDate('2027-03-14', '2026-11-12')).toEqual({ date: '2026-11-15', standIn: true });
    // Past trip (Fri 30 Oct 2026) -> next Friday.
    expect(timetableDate('2026-10-30', '2026-11-12')).toEqual({ date: '2026-11-13', standIn: true });
    // Same weekday as today -> a week ahead, not today (today's times may have passed).
    expect(timetableDate('2027-03-18', '2026-11-12')).toEqual({ date: '2026-11-19', standIn: true });
  });

  it('turns city clock times into exact moments, winter and summer', () => {
    expect(zonedIso('2026-11-15', 600, 'Europe/Rome')).toBe('2026-11-15T09:00:00.000Z');
    expect(zonedIso('2027-07-01', 600, 'Europe/Paris')).toBe('2027-07-01T08:00:00.000Z');
  });

  it('knows today’s date in the city', () => {
    expect(todayIn('Europe/Rome', new Date('2026-11-12T23:30:00Z'))).toBe('2026-11-13');
  });

  it('decodes route shapes', () => {
    // Google's documented example, at precision 5.
    const pts = decodePolyline('_p~iF~ps|U_ulLnnqC_mqNvxq`@', 5);
    expect(pts).toEqual([[38.5, -120.2], [40.7, -120.95], [43.252, -126.453]]);
  });

  it('small helpers', () => {
    expect(legKey({ lat: 41.9, lng: 12.48 }, { lat: 41.89, lng: 12.49 }, '2026-11-15')).toBe('41.90000,12.48000>41.89000,12.49000@2026-11-15');
    expect(formatDistance(1430)).toBe('1.4 km');
    expect(formatDistance(347)).toBe('350 m');
  });
});
