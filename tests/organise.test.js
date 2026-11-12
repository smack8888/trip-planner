// Checks for the itinerary organiser and date helpers. Run with:  npm test
import { describe, it, expect } from 'vitest';
import { organiseTrip, dayLoadMinutes } from '../src/logic/organise.js';
import { rankAreas } from '../src/logic/stay.js';
import { datesBetween, dayLabels, formatRange, formatClock, parseDate } from '../src/logic/dates.js';
import { DESTINATIONS } from '../src/data/destinations.js';

const rome = DESTINATIONS.rome.recommendations;
const paris = DESTINATIONS.paris.recommendations;
const byId = Object.fromEntries([...rome, ...paris].map((p) => [p.id, p]));
const allIds = (result) => [...result.days.flat(), ...result.unscheduled];

describe('organiseTrip', () => {
  it('fits a few places into the days, each exactly once', () => {
    const picks = rome.slice(0, 6);
    const result = organiseTrip(picks, 3, 10);
    expect(result.days).toHaveLength(3);
    expect(result.unscheduled).toEqual([]);
    expect(allIds(result).sort()).toEqual(picks.map((p) => p.id).sort());
  });

  it('never plans a day longer than the time available', () => {
    for (const hours of [7, 10]) {
      for (const days of [1, 2, 3, 5]) {
        const result = organiseTrip(rome, days, hours);
        result.days.forEach((day) => {
          expect(dayLoadMinutes(day.map((id) => byId[id]))).toBeLessThanOrEqual(hours * 60);
        });
        expect(allIds(result).sort()).toEqual(rome.map((p) => p.id).sort());
      }
    }
  });

  it('leaves out the least famous places when time runs short', () => {
    const result = organiseTrip(rome, 1, 7);
    expect(result.unscheduled.length).toBeGreaterThan(0);
    // The most famous place is kept.
    expect(result.days[0]).toContain('colosseum');
    // Left-out places are listed in fame order.
    const ranks = result.unscheduled.map((id) => rome.findIndex((p) => p.id === id));
    expect(ranks).toEqual([...ranks].sort((a, b) => a - b));
  });

  it('keeps nearby places together', () => {
    // Two Vatican places and two near the Colosseum, over two days.
    const picks = ['colosseum', 'vatican-museums', 'forum', 'st-peters'].map((id) => byId[id]);
    const result = organiseTrip(picks, 2, 10);
    const dayOf = (id) => result.days.findIndex((d) => d.includes(id));
    expect(dayOf('vatican-museums')).toBe(dayOf('st-peters'));
    expect(dayOf('colosseum')).toBe(dayOf('forum'));
  });

  it('gives a long day trip room of its own', () => {
    const picks = ['eiffel', 'louvre', 'versailles', 'orsay'].map((id) => byId[id]);
    const result = organiseTrip(picks, 2, 10);
    const versaillesDay = result.days.find((d) => d.includes('versailles'));
    expect(versaillesDay.length).toBeLessThanOrEqual(2);
  });

  it('returns empty days when nothing is picked', () => {
    expect(organiseTrip([], 2, 10)).toEqual({ days: [[], []], unscheduled: [] });
  });
});

describe('organiseTrip from a hotel', () => {
  const monti = { lat: 41.895, lng: 12.492 }; // near the Colosseum
  const farAway = { lat: 42.4, lng: 12.1 }; // about 65 km north of Rome

  it('counts the trip out and back within the day’s time', () => {
    for (const days of [1, 2, 3]) {
      const result = organiseTrip(rome, days, 10, monti);
      result.days.forEach((day) => {
        expect(dayLoadMinutes(day.map((id) => byId[id]), monti)).toBeLessThanOrEqual(10 * 60);
      });
      expect(allIds(result).sort()).toEqual(rome.map((p) => p.id).sort());
    }
  });

  it('fits less in when the hotel is far away', () => {
    const near = organiseTrip(rome, 2, 10, monti);
    const far = organiseTrip(rome, 2, 10, farAway);
    expect(far.unscheduled.length).toBeGreaterThan(near.unscheduled.length);
  });

  it('orders a day as a loop from the hotel', () => {
    // Stay next to the Colosseum: a day with the Colosseum should begin or end there.
    const picks = ['colosseum', 'pantheon', 'trevi', 'forum'].map((id) => byId[id]).filter(Boolean);
    const result = organiseTrip(picks, 1, 10, monti);
    const [day] = result.days;
    const ends = [day[0], day[day.length - 1]];
    expect(ends.some((id) => id === 'colosseum' || id === 'forum')).toBe(true);
  });
});

describe('rankAreas', () => {
  const areas = DESTINATIONS.rome.areas;

  it('puts the area closest to your days first', () => {
    const vaticanDay = ['vatican-museums', 'st-peters'].map((id) => byId[id]);
    const ranked = rankAreas(areas, [vaticanDay, []]);
    expect(ranked[0].area.id).toBe('prati');
    expect(ranked.map((r) => r.minutesPerDay)).toEqual([...ranked.map((r) => r.minutesPerDay)].sort((a, b) => a - b));
  });

  it('keeps the list order when nothing is planned yet', () => {
    const ranked = rankAreas(areas, [[], []]);
    expect(ranked.map((r) => r.area.id)).toEqual(areas.map((a) => a.id));
    expect(ranked[0].minutesPerDay).toBeNull();
  });
});

describe('dates', () => {
  it('lists every day of the trip', () => {
    expect(datesBetween('2027-03-30', '2027-04-02')).toEqual(['2027-03-30', '2027-03-31', '2027-04-01', '2027-04-02']);
    expect(datesBetween('2027-04-02', '2027-03-30')).toEqual([]);
  });

  it('rejects dates that do not exist', () => {
    expect(parseDate('2027-02-30')).toBeNull();
    expect(parseDate('hello')).toBeNull();
  });

  it('labels days', () => {
    expect(dayLabels('2026-10-30')).toEqual({ short: 'Fri 30 Oct', long: 'Friday 30 October' });
    expect(formatRange('2026-10-30', '2026-11-02')).toBe('Fri 30 Oct to Mon 2 Nov 2026');
    expect(formatClock(9 * 60 + 5)).toBe('09:05');
  });
});
