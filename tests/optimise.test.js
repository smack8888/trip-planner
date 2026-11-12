// Automatic checks for the route logic. Run with:  npm test
import { describe, it, expect } from 'vitest';
import { optimiseDay, MAX_FREE_STOPS } from '../src/logic/optimise.js';
import { distanceKm } from '../src/logic/geo.js';
import { effectiveMode, legMinutes, dayMinutes, formatMinutes } from '../src/logic/transport.js';
import { createParisTrip } from '../src/data/paris-trip.js';

// Four places in a straight east-west line, about 1 km apart.
const places = {
  a: { lat: 48.86, lng: 2.30 },
  b: { lat: 48.86, lng: 2.3137 },
  c: { lat: 48.86, lng: 2.3274 },
  d: { lat: 48.86, lng: 2.3411 },
};
const stop = (placeId, fixed = false) => ({ placeId, fixed, time: '', mode: 'auto', line: '' });
const order = (stops) => stops.map((s) => s.placeId).join('');

describe('distance and travel time', () => {
  it('measures about 1 km between neighbouring test places', () => {
    expect(distanceKm(places.a, places.b)).toBeCloseTo(1.0, 1);
  });

  it('auto walks short legs and takes the metro for long ones', () => {
    expect(effectiveMode(0.3, 'auto')).toBe('walk');
    expect(effectiveMode(5, 'auto')).toBe('metro');
  });

  it('long trips out of the city are estimated at regional train speed', () => {
    expect(legMinutes(5, 'metro')).toBeCloseTo(10 + 5 * 3.9);
    // About 56 km (Paris to Fontainebleau): 10 + 39 + 69 = 118 min, not 228.
    expect(legMinutes(56, 'metro')).toBeCloseTo(10 + 39 + 46 * 1.5);
  });

  it('uses the chosen mode when one is set', () => {
    expect(effectiveMode(5, 'bike')).toBe('bike');
    expect(legMinutes(2, 'walk')).toBeCloseTo(32.5);
  });

  it('formats minutes', () => {
    expect(formatMinutes(45)).toBe('45 min');
    expect(formatMinutes(125)).toBe('2 h 05 min');
    expect(formatMinutes(120)).toBe('2 h');
  });
});

describe('optimiseDay', () => {
  it('puts unfixed stops in the quickest order', () => {
    const result = optimiseDay([stop('a'), stop('c'), stop('b'), stop('d')], places);
    expect(result.status).toBe('improved');
    expect(order(result.stops)).toBe('abcd');
    expect(result.afterMinutes).toBeLessThan(result.beforeMinutes);
  });

  it('never moves a fixed stop', () => {
    // 'd' is fixed in position 2, even though the end would be quicker.
    const result = optimiseDay([stop('c'), stop('a'), stop('d', true), stop('b')], places);
    expect(result.stops[2].placeId).toBe('d');
    expect(result.stops[2].fixed).toBe(true);
  });

  it('keeps every fixed stop in place on the real Paris data', () => {
    const trip = createParisTrip();
    for (const plan of Object.values(trip.plans)) {
      plan.days.forEach((day) => {
        const result = optimiseDay(day, trip.places);
        day.forEach((s, i) => {
          if (s.fixed) expect(result.stops[i]).toEqual(s);
        });
        // It never makes a day slower.
        expect(dayMinutes(result.stops, trip.places, true)).toBeLessThanOrEqual(result.beforeMinutes + 1e-9);
      });
    }
  });

  it('says when the order is already the quickest', () => {
    expect(optimiseDay([stop('a'), stop('b'), stop('c'), stop('d')], places).status).toBe('already-best');
  });

  it('needs at least two unfixed stops', () => {
    expect(optimiseDay([stop('a', true), stop('b')], places).status).toBe('too-few');
  });

  it('refuses very long days instead of freezing', () => {
    const many = Array.from({ length: MAX_FREE_STOPS + 1 }, () => stop('a'));
    expect(optimiseDay(many, places).status).toBe('too-many');
  });

  it('resets leg modes after reordering, and does not change the input', () => {
    const input = [stop('a'), stop('c'), stop('b')];
    input[0].mode = 'bike';
    const result = optimiseDay(input, places);
    expect(result.stops.every((s) => s.mode === 'auto')).toBe(true);
    expect(order(input)).toBe('acb');
    expect(input[0].mode).toBe('bike');
  });
});
