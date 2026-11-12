// Checks for the LiteAPI connection (server/liteapi.js). Run with:  npm test
// No real calls: a pretend `fetch` answers with sample data shaped like LiteAPI's.
import { describe, it, expect } from 'vitest';
import { parseRates, fetchHotelRates, checkHotelQuery, HotelsError } from '../server/liteapi.js';

const now = new Date('2026-11-12T10:00:00Z');

// Shaped like a LiteAPI /hotels/rates answer (made-up values, test only).
const sample = {
  data: [
    { hotelId: 'h1', roomTypes: [{ offerRetailRate: { amount: 410, currency: 'EUR' } }, { offerRetailRate: { amount: 380, currency: 'EUR' } }] },
    {
      hotelId: 'h2',
      roomTypes: [{
        rates: [{
          boardName: 'Breakfast Included',
          cancellationPolicies: { refundableTag: 'NRFN' },
          retailRate: {
            total: [{ amount: 250.5, currency: 'EUR' }],
            taxesAndFees: [
              { included: true, description: 'tax', amount: 20, currency: 'EUR' },
              { included: false, description: 'city tax', amount: 12, currency: 'EUR' },
            ],
          },
        }],
      }],
    },
    { hotelId: 'h3', roomTypes: [] }, // no price: left out
    { hotelId: 'h4', roomTypes: [{ offerRetailRate: { amount: 99, currency: 'EUR' } }] }, // no name: left out
  ],
  hotels: [
    { id: 'h1', name: 'Sample Hotel One', address: '1 Test Street', stars: 4, rating: 8.6, reviewCount: 1200, main_photo: 'https://example.test/1.jpg', latitude: 41.9, longitude: 12.47 },
    { id: 'h2', name: 'Sample Hotel Two', main_photo: 'http://insecure.test/2.jpg' },
  ],
  sandbox: true,
};

describe('parseRates', () => {
  it('keeps named hotels with a price, cheapest room each, cheapest hotel first', () => {
    const { hotels, sandbox, fetchedAt } = parseRates(sample, now);
    expect(hotels.map((h) => h.id)).toEqual(['h2', 'h1']);
    expect(hotels[1]).toMatchObject({ name: 'Sample Hotel One', stars: 4, rating: 8.6, reviewCount: 1200, lat: 41.9, price: { amount: 380, currency: 'EUR' } });
    expect(hotels[0].price).toEqual({ amount: 250.5, currency: 'EUR' });
    expect(sandbox).toBe(true);
    expect(fetchedAt).toBe('2026-11-12T10:00:00.000Z');
  });

  it('reads breakfast, refunds and taxes that are not included', () => {
    const [two, one] = parseRates(sample, now).hotels;
    expect(two).toMatchObject({ board: 'Breakfast Included', refundable: false, extraFees: { amount: 12, currency: 'EUR' } });
    expect(one).toMatchObject({ board: '', refundable: null, extraFees: null });
  });

  it('reads review_count as LiteAPI actually sends it', () => {
    const json = { data: [sample.data[0]], hotels: [{ id: 'h1', name: 'X', review_count: 1900, rating: 9.2 }] };
    expect(parseRates(json, now).hotels[0]).toMatchObject({ reviewCount: 1900, rating: 9.2 });
  });

  it('only accepts https photos and leaves missing ratings empty', () => {
    const [two] = parseRates(sample, now).hotels;
    expect(two.photo).toBeNull();
    expect(two.rating).toBeNull();
  });

  it('copes with an empty or odd answer', () => {
    expect(parseRates(null, now).hotels).toEqual([]);
    expect(parseRates({ data: 'x' }, now).hotels).toEqual([]);
  });
});

describe('fetchHotelRates', () => {
  const query = { lat: 41.9, lng: 12.47, checkin: '2027-03-14', checkout: '2027-03-16' };
  const reply = (status, body) => async () => ({ status, ok: status < 300, json: async () => body });

  it('sends the key in a header and the trip in the body', async () => {
    let sent;
    const fetchImpl = async (url, options) => {
      sent = { url, options };
      return { status: 200, ok: true, json: async () => sample };
    };
    await fetchHotelRates(query, { key: 'test-key', nationality: 'ES', currency: 'EUR', fetchImpl, now });
    expect(sent.url).toBe('https://api.liteapi.travel/v3.0/hotels/rates');
    expect(sent.options.headers['X-API-Key']).toBe('test-key');
    const body = JSON.parse(sent.options.body);
    expect(body).toMatchObject({ latitude: 41.9, longitude: 12.47, checkin: '2027-03-14', checkout: '2027-03-16', guestNationality: 'ES', currency: 'EUR', occupancies: [{ adults: 2 }] });
    expect(JSON.stringify(body)).not.toContain('test-key');
  });

  it('treats "nothing available" as an empty list', async () => {
    const result = await fetchHotelRates(query, { key: 'k', nationality: 'ES', currency: 'EUR', fetchImpl: reply(200, { error: { code: 2001, message: 'no availability' } }), now });
    expect(result.hotels).toEqual([]);
  });

  it('explains a refused key without repeating it', async () => {
    const attempt = fetchHotelRates(query, { key: 'secret-123', nationality: 'ES', currency: 'EUR', fetchImpl: reply(401, { error: { code: 401, message: 'unauthorized' } }), now });
    await expect(attempt).rejects.toThrow(/LITEAPI_KEY/);
    await expect(attempt).rejects.not.toThrow(/secret-123/);
  });

  it('reports when LiteAPI cannot be reached', async () => {
    const fetchImpl = async () => { throw new Error('offline'); };
    await expect(fetchHotelRates(query, { key: 'k', nationality: 'ES', currency: 'EUR', fetchImpl, now })).rejects.toThrow(HotelsError);
  });
});

describe('checkHotelQuery', () => {
  const params = (o) => new URLSearchParams(o);
  it('accepts a sensible search', () => {
    expect(checkHotelQuery(params({ lat: '41.9', lng: '12.47', checkin: '2027-03-14', checkout: '2027-03-16' })))
      .toEqual({ lat: 41.9, lng: 12.47, checkin: '2027-03-14', checkout: '2027-03-16' });
  });
  it('refuses bad locations or dates', () => {
    expect(() => checkHotelQuery(params({ lat: 'x', lng: '12', checkin: '2027-03-14', checkout: '2027-03-16' }))).toThrow(/location/);
    expect(() => checkHotelQuery(params({ lat: '41', lng: '12', checkin: '2027-03-16', checkout: '2027-03-14' }))).toThrow(/dates/);
  });
});
