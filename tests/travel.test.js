// Checks for getting there and back (logic/travel.js), the organiser with
// days of different lengths, and choosing a hotel. Run with:  npm test
import { describe, it, expect } from 'vitest';
import { dayFrames, arrivalPlan, departurePlan, pointsFor, toMinutes, clockText, cityLeg, TRAVEL_MODES } from '../src/logic/travel.js';
import { organiseTrip, dayLoadMinutes } from '../src/logic/organise.js';
import { newTrip, chooseBooked, chooseHotel, withTravel, clearTravel, stayPlace, cleanTrips, PACES } from '../src/trips.js';
import { DESTINATIONS } from '../src/data/destinations.js';

const rome = DESTINATIONS.rome;
const packed = PACES.packed; // 9:00 to 19:00
const hotel = { id: 'stay', name: 'Test hotel', lat: 41.8995, lng: 12.4730, visitHours: 0 }; // near the Pantheon
const flightIn = { mode: 'flight', place: 'Madrid', number: 'XX1', pointId: 'fco', time: '11:30' };
const flightOut = { mode: 'flight', place: 'Madrid', number: 'XX2', pointId: 'fco', time: '17:00' };
const termini = rome.arrivalPoints.find((p) => p.id === 'fco').hub;

describe('clock helpers', () => {
  it('reads and writes times', () => {
    expect(toMinutes('11:30')).toBe(690);
    expect(toMinutes('nonsense')).toBeNull();
    expect(clockText(690)).toBe('11:30');
    expect(clockText(1500)).toBe('01:00'); // past midnight
  });
});

describe('arriving', () => {
  it('lands, gets out, transfers, then crosses the city to the hotel', () => {
    const a = arrivalPlan(flightIn, hotel, rome);
    const toHotel = cityLeg(termini, hotel).minutes;
    expect(a.out).toBe(690 + 45);
    expect(a.atHub).toBe(690 + 45 + 50);
    expect(a.ready).toBeCloseTo(690 + 45 + 50 + toHotel);
    expect(a.startPlace).toBe(hotel);
  });

  it('starts from the city hub when we don’t know where you stay', () => {
    const a = arrivalPlan(flightIn, null, rome);
    expect(a.ready).toBe(690 + 45 + 50);
    expect(a.startPlace).toMatchObject({ name: 'Roma Termini' });
  });

  it('by car straight to the hotel: just a short allowance', () => {
    const a = arrivalPlan({ mode: 'car', place: '', number: '', pointId: '', time: '12:00' }, hotel, rome);
    expect(a.ready).toBe(720 + TRAVEL_MODES.car.arriveBuffer);
  });

  it('needs a time', () => {
    expect(arrivalPlan({ ...flightIn, time: '' }, hotel, rome)).toBeNull();
  });
});

describe('leaving', () => {
  it('works back from the flight: 2 hours before, transfer, trip from the hotel', () => {
    const d = departurePlan(flightOut, hotel, rome);
    const fromHotel = cityLeg(hotel, termini).minutes;
    expect(d.beAt).toBe(1020 - 120);
    expect(d.leaveHub).toBe(1020 - 120 - 50);
    expect(d.leaveBy).toBeCloseTo(1020 - 120 - 50 - fromHotel);
    expect(d.endPlace).toBe(hotel);
  });
});

describe('dayFrames', () => {
  it('gives normal days without travel details', () => {
    const frames = dayFrames({ dayCount: 3, pace: packed, home: hotel, travel: { arrival: null, departure: null }, dest: rome });
    frames.forEach((f) => expect(f).toMatchObject({ budget: 600, startClock: 540, start: hotel, end: hotel }));
  });

  it('shortens the first and last day around the flights', () => {
    const frames = dayFrames({ dayCount: 3, pace: packed, home: hotel, travel: { arrival: flightIn, departure: flightOut }, dest: rome });
    const [first, middle, last] = frames;
    const ready = arrivalPlan(flightIn, hotel, rome).ready;
    const leaveBy = departurePlan(flightOut, hotel, rome).leaveBy;
    expect(first.startClock).toBeCloseTo(ready);
    expect(first.budget).toBeCloseTo(19 * 60 - ready);
    expect(middle.budget).toBe(600);
    expect(last.endBy).toBeCloseTo(leaveBy);
    expect(last.budget).toBeCloseTo(leaveBy - 540);
  });

  it('never starts before the day’s start or ends after its end', () => {
    const early = { ...flightIn, time: '06:00' };
    const late = { ...flightOut, time: '23:30' };
    const [first, last] = dayFrames({ dayCount: 2, pace: packed, home: hotel, travel: { arrival: early, departure: late }, dest: rome });
    expect(first.startClock).toBe(540);
    expect(last.endBy).toBe(1140);
  });

  it('a late arrival leaves no time on the first day', () => {
    const [first] = dayFrames({ dayCount: 2, pace: packed, home: hotel, travel: { arrival: { ...flightIn, time: '20:00' }, departure: null }, dest: rome });
    expect(first.budget).toBe(0);
  });
});

describe('organiseTrip with travel days', () => {
  const picks = rome.recommendations.slice(0, 10);

  it('keeps every day within its own time, from and back to the right places', () => {
    const frames = dayFrames({ dayCount: 3, pace: packed, home: hotel, travel: { arrival: flightIn, departure: flightOut }, dest: rome });
    const byId = Object.fromEntries(picks.map((p) => [p.id, p]));
    const result = organiseTrip(picks, frames);
    result.days.forEach((ids, d) => {
      const load = dayLoadMinutes(ids.map((pid) => byId[pid]), frames[d].start, frames[d].end);
      expect(load).toBeLessThanOrEqual(frames[d].budget + 1e-9);
    });
    // Every place is either planned or listed as not fitting.
    expect([...result.days.flat(), ...result.unscheduled].sort()).toEqual(picks.map((p) => p.id).sort());
  });

  it('plans nothing on a day with no time', () => {
    const frames = dayFrames({ dayCount: 2, pace: packed, home: hotel, travel: { arrival: { ...flightIn, time: '20:00' }, departure: null }, dest: rome });
    const result = organiseTrip(picks.slice(0, 4), frames);
    expect(result.days[0]).toEqual([]);
    expect(result.days[1].length).toBeGreaterThan(0);
  });
});

describe('choosing a hotel from the list', () => {
  const trip = chooseBooked(newTrip({ destinationId: 'rome', startDate: '2027-03-14', endDate: '2027-03-16', pace: 'packed' }), false);
  const listing = { id: 'lp1', name: 'Sample Hotel', address: 'Via Example 1', lat: 41.9, lng: 12.47, price: { amount: 330, currency: 'EUR' } };
  const search = { checkin: '2027-03-14', checkout: '2027-03-16', fetchedAt: '2026-11-12T10:21:00.000Z' };

  it('remembers the hotel, its address and price, and its area', () => {
    const chosen = chooseHotel(trip, 'centro-storico', listing, search);
    expect(chosen.stay).toMatchObject({ booked: false, areaId: 'centro-storico', hotel: { name: 'Sample Hotel', address: 'Via Example 1', checkin: '2027-03-14' } });
    expect(stayPlace(chosen)).toMatchObject({ kind: 'hotel', booked: false, label: 'Sample Hotel', address: 'Via Example 1', lat: 41.9 });
  });

  it('un-choosing keeps the area', () => {
    const chosen = chooseHotel(trip, 'centro-storico', listing, search);
    const undone = chooseHotel(chosen, 'centro-storico', null);
    expect(undone.stay).toMatchObject({ areaId: 'centro-storico', hotel: null });
    expect(stayPlace(undone)).toMatchObject({ kind: 'area' });
  });

  it('survives saving and loading, and drops a hotel with no location', () => {
    const chosen = chooseHotel(trip, 'centro-storico', listing, search);
    expect(cleanTrips([chosen])[0].stay.hotel).toEqual(chosen.stay.hotel);
    const broken = { ...chosen, stay: { ...chosen.stay, hotel: { ...chosen.stay.hotel, lat: null } } };
    expect(cleanTrips([broken])[0].stay.hotel).toBeNull();
  });
});

describe('travel details on a trip', () => {
  const trip = newTrip({ destinationId: 'rome', startDate: '2027-03-14', endDate: '2027-03-16', pace: 'packed' });

  it('starts empty', () => {
    expect(trip.travel).toEqual({ arrival: null, departure: null });
  });

  it('switching from flight to train forgets the airport', () => {
    const flying = withTravel(trip, 'arrival', { mode: 'flight', pointId: 'fco', time: '11:30' });
    expect(flying.travel.arrival.pointId).toBe('fco');
    const byTrain = withTravel(flying, 'arrival', { mode: 'train' });
    expect(byTrain.travel.arrival).toMatchObject({ mode: 'train', pointId: '', time: '11:30' });
    expect(clearTravel(byTrain, 'arrival').travel.arrival).toBeNull();
  });

  it('cleans bad travel data', () => {
    const bad = { ...trip, travel: {
      arrival: { mode: 'flight', place: 'X', number: 'Y', pointId: 'termini', time: '25:99' }, // a station is not an airport
      departure: { mode: 'rocket' },
    } };
    const [clean] = cleanTrips([bad]);
    expect(clean.travel.arrival).toEqual({ mode: 'flight', place: 'X', number: 'Y', pointId: '', time: '' });
    expect(clean.travel.departure).toBeNull();
  });
});

describe('arrival points data', () => {
  for (const dest of Object.values(DESTINATIONS)) {
    it(`${dest.name}: airports and stations are sensible`, () => {
      const ids = dest.arrivalPoints.map((p) => p.id);
      expect(new Set(ids).size).toBe(ids.length);
      dest.arrivalPoints.forEach((p) => {
        expect(['airport', 'station', 'coach']).toContain(p.kind);
        expect(Math.abs(p.lat - dest.center[0])).toBeLessThan(0.7); // within about 70 km
        expect(Math.abs(p.lng - dest.center[1])).toBeLessThan(0.7);
        if (p.kind === 'airport') {
          expect(p.hub).toMatchObject({ name: expect.any(String) });
          expect(p.transferMinutes).toBeGreaterThan(0);
        }
      });
      expect(pointsFor(dest, 'flight').length).toBeGreaterThan(0);
      expect(pointsFor(dest, 'train').length).toBeGreaterThan(0);
      expect(pointsFor(dest, 'car')).toEqual([]);
    });
  }
});
