// Checks for the "For you" step: answers, matching, and the place data.
// Run with:  npm test
import { describe, it, expect } from 'vitest';
import { QUESTIONS, cleanAnswers, answer, readyToSuggest, suggestions, zoneOf } from '../src/logic/personalise.js';
import { DESTINATIONS, allPlaces } from '../src/data/destinations.js';
import { newTrip, togglePick, withAnswer, cleanTrips } from '../src/trips.js';
import { CATEGORY_LABELS } from '../src/ui/html.js';

const paris = DESTINATIONS.paris;
const interestIds = QUESTIONS.find((q) => q.id === 'interests').options.map(([id]) => id);

describe('answers', () => {
  it('ticks up to three interests, and unticks', () => {
    let a = {};
    for (const i of ['nature', 'food', 'art', 'views']) a = answer(a, 'interests', i);
    expect(a.interests).toEqual(['nature', 'food', 'art']); // the fourth is ignored
    a = answer(a, 'interests', 'food');
    expect(a.interests).toEqual(['nature', 'art']);
  });

  it('single answers replace each other', () => {
    const a = answer(answer({}, 'crowds', 'avoid'), 'crowds', 'fine');
    expect(a.crowds).toBe('fine');
  });

  it('cleans nonsense', () => {
    expect(cleanAnswers({ interests: ['nature', 'skydiving'], crowds: 'maybe', reach: 'city' }))
      .toEqual({ interests: ['nature'], reach: 'city' });
    expect(cleanAnswers('yes')).toBeNull();
    expect(cleanAnswers({})).toBeNull();
  });

  it('needs at least one interest to suggest anything', () => {
    expect(readyToSuggest({ crowds: 'avoid' })).toBe(false);
    expect(suggestions(paris.discoveries, paris, { crowds: 'avoid' })).toEqual([]);
  });
});

describe('matching', () => {
  it('only suggests places that match an interest and are within reach', () => {
    const list = suggestions(paris.discoveries, paris, { interests: ['hiking'], reach: 'city' });
    expect(list.length).toBeGreaterThan(0);
    list.forEach(({ place }) => {
      expect(place.interests).toContain('hiking');
      expect(zoneOf(place, paris)).not.toBe('daytrip');
    });
    expect(list.map((s) => s.place.id)).not.toContain('fontainebleau');
  });

  it('day trips appear when you’re happy to go further', () => {
    const list = suggestions(paris.discoveries, paris, { interests: ['hiking'], reach: 'daytrip', energy: 'active' });
    const forest = list.find((s) => s.place.id === 'fontainebleau');
    expect(forest.reasons).toEqual(expect.arrayContaining(['Day trip', 'Active']));
  });

  it('avoiding crowds ranks quiet places higher and says why', () => {
    const list = suggestions(paris.discoveries, paris, { interests: ['food'], crowds: 'avoid', reach: 'daytrip' });
    expect(list[0].place.quiet).toBe(true);
    expect(list[0].reasons).toContain('Usually quiet');
    // Busy places still appear, just lower down.
    expect(list[list.length - 1].place.quiet).toBe(false);
  });

  it('more matching interests rank higher', () => {
    const list = suggestions(paris.discoveries, paris, { interests: ['art', 'history', 'architecture'], reach: 'city' });
    expect(list[0].place.id).toBe('nissim-camondo'); // matches all three
  });
});

describe('"For you" picks on a trip', () => {
  it('can be picked, saved and loaded, with the answers', () => {
    let trip = newTrip({ destinationId: 'paris', startDate: '2027-03-14', endDate: '2027-03-16', pace: 'packed' });
    trip = togglePick(trip, 'coulee-verte');
    trip = withAnswer(trip, 'interests', 'nature');
    const [loaded] = cleanTrips([trip]);
    expect(loaded.picked).toEqual(['coulee-verte']);
    expect(loaded.personal).toEqual({ interests: ['nature'] });
  });
});

describe('less obvious places data', () => {
  for (const dest of Object.values(DESTINATIONS)) {
    it(`${dest.name}: ids unique across all places, sensible locations and visits`, () => {
      const ids = allPlaces(dest).map((p) => p.id);
      expect(new Set(ids).size).toBe(ids.length);
      dest.discoveries.forEach((p) => {
        expect(CATEGORY_LABELS[p.category]).toBeDefined();
        expect(Math.abs(p.lat - dest.center[0])).toBeLessThan(1); // within about 100 km
        expect(Math.abs(p.lng - dest.center[1])).toBeLessThan(1);
        expect(p.visitHours).toBeGreaterThan(0);
        expect(p.visitHours).toBeLessThanOrEqual(6);
        expect(p.interests.length).toBeGreaterThan(0);
        p.interests.forEach((i) => expect(interestIds).toContain(i));
      });
    });

    it(`${dest.name}: every interest has at least one place`, () => {
      interestIds.forEach((i) => expect(dest.discoveries.some((p) => p.interests.includes(i))).toBe(true));
    });

    // Project rule: never invent opening hours, prices or reviews.
    it(`${dest.name}: holds no hours, prices, ratings or reviews`, () => {
      const allowed = ['id', 'name', 'area', 'category', 'why', 'lat', 'lng', 'visitHours', 'interests', 'quiet', 'active'].sort();
      dest.discoveries.forEach((p) => expect(Object.keys(p).sort()).toEqual(allowed));
    });
  }
});
