// Checks for new trips, picks and the recommendation data. Run with:  npm test
import { describe, it, expect } from 'vitest';
import {
  newTrip, togglePick, cleanTrips, checkDetails, withDetails, sameTrip, MAX_DAYS,
  chooseBooked, withStay, stayPlace,
} from '../src/trips.js';
import { DESTINATIONS } from '../src/data/destinations.js';
import { CATEGORY_LABELS } from '../src/ui/html.js';

const details = { destinationId: 'rome', startDate: '2027-03-14', endDate: '2027-03-17', pace: 'packed' };

describe('trip details', () => {
  it('accepts sensible details', () => {
    expect(checkDetails(details)).toBeNull();
  });

  it('explains what is wrong', () => {
    expect(checkDetails({ ...details, destinationId: 'atlantis' })).toMatch(/destination/);
    expect(checkDetails({ ...details, startDate: '' })).toMatch(/first day/);
    expect(checkDetails({ ...details, endDate: '2027-03-01' })).toMatch(/on or after/);
    expect(checkDetails({ ...details, endDate: '2027-05-01' })).toMatch(String(MAX_DAYS));
    expect(checkDetails({ ...details, pace: 'sprint' })).toMatch(/pace/);
  });
});

describe('new trips', () => {
  it('starts unsaved with no picks', () => {
    const trip = newTrip(details, new Date('2026-11-11T10:00:00Z'));
    expect(trip).toMatchObject({ destinationId: 'rome', startDate: '2027-03-14', savedAt: null, picked: [] });
    expect(trip.id.startsWith('rome-')).toBe(true);
  });

  it('refuses bad details', () => {
    expect(() => newTrip({ ...details, destinationId: 'atlantis' })).toThrow();
  });

  it('picks and un-picks without changing the original', () => {
    const trip = newTrip(details);
    const once = togglePick(trip, 'colosseum');
    expect(once.picked).toEqual(['colosseum']);
    expect(togglePick(once, 'colosseum').picked).toEqual([]);
    expect(trip.picked).toEqual([]);
  });

  it('changes dates and pace', () => {
    const trip = withDetails(newTrip(details), { startDate: '2027-04-01', endDate: '2027-04-02', pace: 'relaxed' });
    expect(trip).toMatchObject({ destinationId: 'rome', startDate: '2027-04-01', pace: 'relaxed' });
  });

  it('spots real changes but ignores when it was saved', () => {
    const trip = newTrip(details);
    expect(sameTrip(trip, { ...trip, savedAt: '2026-11-11T10:00:00Z' })).toBe(true);
    expect(sameTrip(trip, togglePick(trip, 'trevi'))).toBe(false);
  });

  it('cleans bad saved data', () => {
    const good = { ...newTrip(details), picked: ['colosseum', 'no-such-place'] };
    const cleaned = cleanTrips([good, { id: 'x', destinationId: 'atlantis' }, null]);
    expect(cleaned).toHaveLength(1);
    expect(cleaned[0].picked).toEqual(['colosseum']);
    expect(cleanTrips('nonsense')).toEqual([]);
  });
});

describe('where you stay', () => {
  it('starts unanswered, and the itinerary has no base yet', () => {
    const trip = newTrip(details);
    expect(trip.stay).toBeNull();
    expect(stayPlace(trip)).toBeNull();
  });

  it('booked: needs a pin before days can start there', () => {
    const booked = chooseBooked(newTrip(details), true);
    expect(booked.stay).toEqual({ booked: true, name: '', address: '', lat: null, lng: null });
    expect(stayPlace(booked)).toBeNull();
    const pinned = withStay(booked, { name: 'Hotel Example', lat: 41.9, lng: 12.48 });
    expect(stayPlace(pinned)).toMatchObject({ kind: 'hotel', label: 'Hotel Example', lat: 41.9, lng: 12.48 });
    expect(stayPlace(withStay(pinned, { name: ' ' })).label).toBe('your hotel');
  });

  it('not booked: an area you plan around becomes the base', () => {
    const looking = chooseBooked(newTrip(details), false);
    expect(looking.stay).toEqual({ booked: false, areaId: null, hotel: null });
    const area = DESTINATIONS.rome.areas[0];
    expect(stayPlace(withStay(looking, { areaId: area.id }))).toMatchObject({ kind: 'area', label: area.name, lat: area.lat });
  });

  it('keeps what you typed when you give the same answer again', () => {
    const trip = withStay(chooseBooked(newTrip(details), true), { address: 'Via Example 1' });
    expect(chooseBooked(trip, true).stay.address).toBe('Via Example 1');
    expect(chooseBooked(trip, false).stay).toEqual({ booked: false, areaId: null, hotel: null });
  });

  it('notices a change inside the stay details', () => {
    const trip = withStay(chooseBooked(newTrip(details), true), { address: 'A' });
    expect(sameTrip(trip, withStay(trip, { address: 'B' }))).toBe(false);
    expect(sameTrip(trip, { ...trip, stay: { ...trip.stay } })).toBe(true);
  });

  it('cleans bad stay data', () => {
    const trip = newTrip(details);
    const [a, b, c] = cleanTrips([
      { ...trip, stay: { booked: true, name: 7, address: 'X', lat: 'north', lng: 12 } },
      { ...trip, stay: { booked: false, areaId: 'atlantis' } },
      { ...trip, stay: 'yes' },
    ]);
    expect(a.stay).toEqual({ booked: true, name: '', address: 'X', lat: null, lng: null });
    expect(b.stay).toEqual({ booked: false, areaId: null, hotel: null });
    expect(c.stay).toBeNull();
  });
});

describe('recommendation data', () => {
  it('offers Paris and Rome', () => {
    expect(Object.keys(DESTINATIONS)).toEqual(['paris', 'rome']);
  });

  for (const dest of Object.values(DESTINATIONS)) {
    it(`${dest.name}: ids are unique, categories known, locations and visit lengths sensible`, () => {
      const ids = dest.recommendations.map((r) => r.id);
      expect(new Set(ids).size).toBe(ids.length);
      dest.recommendations.forEach((r) => {
        expect(CATEGORY_LABELS[r.category]).toBeDefined();
        // Within about 30 km of the city centre.
        expect(Math.abs(r.lat - dest.center[0])).toBeLessThan(0.3);
        expect(Math.abs(r.lng - dest.center[1])).toBeLessThan(0.4);
        expect(r.visitHours).toBeGreaterThan(0);
        expect(r.visitHours).toBeLessThanOrEqual(6);
      });
    });

    it(`${dest.name}: includes nature and food, not just sights`, () => {
      const cats = new Set(dest.recommendations.map((r) => r.category));
      expect(cats.has('nature')).toBe(true);
      expect(cats.has('food')).toBe(true);
    });

    // Project rule: never invent opening hours, prices or reviews.
    // Only these planning fields are allowed; anything else fails this test.
    it(`${dest.name}: holds no hours, prices, ratings or reviews`, () => {
      const allowed = ['id', 'name', 'area', 'category', 'why', 'lat', 'lng', 'visitHours'].sort();
      dest.recommendations.forEach((r) => expect(Object.keys(r).sort()).toEqual(allowed));
    });

    it(`${dest.name}: areas to stay are unique, nearby, and hold no prices or reviews`, () => {
      const ids = dest.areas.map((a) => a.id);
      expect(new Set(ids).size).toBe(ids.length);
      dest.areas.forEach((a) => {
        expect(Object.keys(a).sort()).toEqual(['id', 'lat', 'lng', 'name', 'why']);
        expect(Math.abs(a.lat - dest.center[0])).toBeLessThan(0.1);
        expect(Math.abs(a.lng - dest.center[1])).toBeLessThan(0.1);
      });
    });
  }
});
