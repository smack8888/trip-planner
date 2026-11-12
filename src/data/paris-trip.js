// Seed data: a sample Paris trip, 30 Oct to 2 Nov 2026.
// Copied from Prototype/paris-trip-planner.html.
//
// Shape of the data (Trip > Days > Stops):
//   trip.days[]       one entry per calendar day
//   trip.places{}     every place a stop can point to, keyed by id
//   trip.plans{}      two plans to compare; each has one list of stops per day
//   trip.bookings[]   transport, stays and tickets that belong to the whole trip
//
// A stop is { placeId, fixed, time, mode, line }:
//   fixed  true = a fixed slot. The optimiser never moves it.
//   time   free text such as "10:30" or "Night".
//   mode   how we travel from this stop to the NEXT one:
//          'auto', 'walk', 'metro', 'bus' or 'bike'.
//   line   optional metro or bus line for that leg.
//
// IMPORTANT: coordinates are approximate (hand-placed in the prototype).
// A later step will replace them with data from a places API.

export const COORDS_NOTE =
  'Place locations are approximate until we connect a places API.';

function stop(placeId, options = {}) {
  return {
    placeId,
    fixed: options.fixed ?? false,
    time: options.time ?? '',
    mode: 'auto',
    line: '',
  };
}

export function createParisTrip() {
  return {
    id: 'paris-2026',
    name: 'Paris',
    summary:
      'Friday 30 October to Monday 2 November 2026. Two travellers, three nights at a sample hotel near the Étoile.',
    hotelId: 'hotel',

    days: [
      { date: '2026-10-30', short: 'Fri 30 Oct', long: 'Friday 30 October' },
      { date: '2026-10-31', short: 'Sat 31 Oct', long: 'Saturday 31 October' },
      { date: '2026-11-01', short: 'Sun 1 Nov', long: 'Sunday 1 November' },
      {
        date: '2026-11-02',
        short: 'Mon 2 Nov',
        long: 'Monday 2 November',
        endNote: 'Evening: flight home from Orly.',
      },
    ],

    places: {
      bercy: { name: 'Paris Bercy Seine (coach station)', category: 'transport', lat: 48.8355, lng: 2.3825, note: 'Arrival by overnight coach.' },
      hotel: { name: 'Sample hotel near the Étoile', category: 'stay', lat: 48.8745, lng: 2.293, note: 'Location is approximate. Add the exact address.' },
      grolet: { name: 'Cédric Grolet at Le Meurice', category: 'food', lat: 48.8654, lng: 2.3281 },
      tuileries: { name: 'Jardin des Tuileries', category: 'nature', lat: 48.8635, lng: 2.3275 },
      montmartre: { name: 'Montmartre and Sacré-Cœur', category: 'sight', lat: 48.8867, lng: 2.3431 },
      galeries: { name: 'Galeries Lafayette Haussmann', category: 'shop', lat: 48.8738, lng: 2.332 },
      cruise: { name: 'Seine cruise, Vedettes du Pont Neuf', category: 'sight', lat: 48.8572, lng: 2.3411 },
      trocadero: { name: 'Place du Trocadéro', category: 'sight', lat: 48.8616, lng: 2.2893 },
      champ: { name: 'Champ de Mars', category: 'nature', lat: 48.8556, lng: 2.2986 },
      latin: { name: 'Quartier Latin', category: 'sight', lat: 48.8503, lng: 2.347 },
      eiffel: { name: 'Eiffel Tower ascent', category: 'sight', lat: 48.8584, lng: 2.2945, note: 'A timed ticket: a fixed slot on Monday.' },
      arc: { name: 'Arc de Triomphe', category: 'sight', lat: 48.8738, lng: 2.295, note: 'Visited at night.' },
      marais: { name: 'Le Marais', category: 'sight', lat: 48.8575, lng: 2.362, note: 'Left out of the first plan.' },
    },

    plans: {
      done: {
        name: 'What we did',
        days: [
          [stop('bercy', { fixed: true, time: 'Morning' }), stop('grolet'), stop('tuileries'), stop('hotel')],
          [stop('montmartre'), stop('galeries'), stop('cruise')],
          [stop('trocadero'), stop('champ'), stop('galeries'), stop('latin'), stop('arc', { fixed: true, time: 'Night' })],
          [stop('eiffel', { fixed: true })],
        ],
      },
      sug: {
        name: 'Suggested',
        days: [
          [stop('bercy', { fixed: true, time: 'Morning' }), stop('grolet'), stop('tuileries'), stop('hotel')],
          [stop('montmartre'), stop('galeries'), stop('cruise')],
          [stop('marais'), stop('latin'), stop('arc', { fixed: true, time: 'Night' })],
          [stop('champ'), stop('eiffel', { fixed: true }), stop('trocadero')],
        ],
      },
    },

    // Not shown on screen yet (a Bookings view comes in a later step).
    bookings: [
      { id: 'b1', type: 'bus', title: 'Overnight coach to Paris Bercy Seine', when: 'Thu 29 Oct night, arriving Fri 30 Oct morning', details: '' },
      { id: 'b2', type: 'stay', title: 'Sample hotel near the Étoile', when: 'Fri 30 Oct to Mon 2 Nov, 3 nights', details: '' },
      { id: 'b3', type: 'ticket', title: 'Eiffel Tower ascent', when: 'Mon 2 Nov, time slot to add', details: '' },
      { id: 'b4', type: 'ticket', title: 'Seine cruise, Vedettes du Pont Neuf', when: 'Sat 31 Oct, time to add', details: '' },
      { id: 'b5', type: 'flight', title: 'Flight home from Paris Orly', when: 'Mon 2 Nov, evening', details: '' },
    ],
  };
}
