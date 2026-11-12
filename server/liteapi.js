// Hotel listings and prices from LiteAPI (https://www.liteapi.travel).
//
// This file runs in the dev server (Node), NOT in the browser. That way the
// API key in .env never reaches the web page: the page asks our own server
// for /api/hotels, and only the server talks to LiteAPI with the key.
//
// LiteAPI's answer is turned into a small, plain list here (parseRates), so
// the page doesn't depend on LiteAPI's exact format.

const BASE = 'https://api.liteapi.travel/v3.0';
const SEARCH_RADIUS_M = 1500; // hotels within 1.5 km of the area's centre
const MAX_HOTELS = 20;
const ISO_DATE = /^\d{4}-\d{2}-\d{2}$/;

export class HotelsError extends Error {
  constructor(message, status = 502) {
    super(message);
    this.status = status;
  }
}

// Checks the search the page asked for. Returns clean values or throws.
export function checkHotelQuery(params) {
  const lat = Number(params.get('lat'));
  const lng = Number(params.get('lng'));
  const checkin = params.get('checkin') ?? '';
  const checkout = params.get('checkout') ?? '';
  if (!Number.isFinite(lat) || Math.abs(lat) > 90 || !Number.isFinite(lng) || Math.abs(lng) > 180) {
    throw new HotelsError('Missing or invalid location.', 400);
  }
  if (!ISO_DATE.test(checkin) || !ISO_DATE.test(checkout) || checkout <= checkin) {
    throw new HotelsError('Missing or invalid dates.', 400);
  }
  return { lat, lng, checkin, checkout };
}

// Asks LiteAPI for hotels near a point with their cheapest room for the dates.
//   settings: { key, nationality, currency, fetchImpl, now }
export async function fetchHotelRates({ lat, lng, checkin, checkout }, settings) {
  const { key, nationality, currency, fetchImpl = fetch, now = new Date() } = settings;
  const body = {
    latitude: lat,
    longitude: lng,
    radius: SEARCH_RADIUS_M,
    checkin,
    checkout,
    occupancies: [{ adults: 2 }], // two travellers, one room
    currency,
    guestNationality: nationality,
    maxRatesPerHotel: 1, // just the cheapest room per hotel
    includeHotelData: true, // names, addresses, photos, ratings
    limit: MAX_HOTELS,
    timeout: 10,
  };

  let response;
  try {
    response = await fetchImpl(`${BASE}/hotels/rates`, {
      method: 'POST',
      headers: { 'X-API-Key': key, 'Content-Type': 'application/json', Accept: 'application/json' },
      body: JSON.stringify(body),
    });
  } catch {
    throw new HotelsError('Could not reach LiteAPI. Check your internet connection.');
  }

  const json = await response.json().catch(() => null);
  // LiteAPI can answer "200 OK" with an error inside; 2001 means nothing available.
  if (json?.error) {
    if (json.error.code === 2001) return parseRates({ data: [] }, now);
    if (response.status === 401) throw new HotelsError('LiteAPI refused the key. Check LITEAPI_KEY in .env.');
    throw new HotelsError(`LiteAPI error: ${json.error.message || json.error.description || json.error.code}`);
  }
  if (!response.ok || !json) throw new HotelsError(`LiteAPI answered with status ${response.status}.`);
  return parseRates(json, now);
}

// LiteAPI's answer -> { hotels: [...], sandbox, fetchedAt }, cheapest first.
// Each hotel: { id, name, address, stars, rating (out of 10), reviewCount,
//               photo, lat, lng, price, extraFees, board, refundable }
//   price      { amount, currency } for the whole stay, cheapest room
//   extraFees  { amount, currency } not included in the price (e.g. city tax,
//              usually paid at the hotel), or null
//   board      e.g. 'Breakfast Included' or 'Room Only', or ''
//   refundable true, false, or null if LiteAPI doesn't say
// Hotels without a name or a price are left out.
export function parseRates(json, now = new Date()) {
  const info = new Map((Array.isArray(json?.hotels) ? json.hotels : []).map((h) => [h?.id, h]));
  const hotels = (Array.isArray(json?.data) ? json.data : [])
    .map((entry) => {
      const h = info.get(entry?.hotelId) ?? {};
      const offer = cheapest(entry?.roomTypes);
      return {
        id: String(entry?.hotelId ?? ''),
        name: text(h.name),
        address: text(h.address),
        stars: number(h.stars),
        rating: number(h.rating),
        reviewCount: number(h.reviewCount ?? h.review_count),
        photo: httpsUrl(h.main_photo ?? h.thumbnail ?? h.photos?.[0]?.url ?? h.photos?.[0]),
        lat: number(h.latitude ?? h.location?.latitude),
        lng: number(h.longitude ?? h.location?.longitude),
        price: offer?.price ?? null,
        extraFees: offer?.extraFees ?? null,
        board: offer?.board ?? '',
        refundable: offer?.refundable ?? null,
      };
    })
    .filter((h) => h.id && h.name && h.price)
    .sort((a, b) => a.price.amount - b.price.amount);
  return { hotels, sandbox: json?.sandbox === true, fetchedAt: now.toISOString() };
}

// The cheapest room type, with the details we show about it.
function cheapest(roomTypes) {
  const offers = (Array.isArray(roomTypes) ? roomTypes : [])
    .map((rt) => {
      const price = roomPrice(rt);
      if (!price) return null;
      const rate = Array.isArray(rt.rates) ? rt.rates[0] : null;
      const tag = rate?.cancellationPolicies?.refundableTag;
      return {
        price,
        extraFees: extraFees(rate, price.currency),
        board: text(rate?.boardName),
        refundable: tag === 'RFN' ? true : tag === 'NRFN' ? false : null,
      };
    })
    .filter(Boolean);
  if (!offers.length) return null;
  return offers.reduce((a, b) => (b.price.amount < a.price.amount ? b : a));
}

// Taxes and fees LiteAPI marks as NOT included in the price (e.g. city tax).
function extraFees(rate, currency) {
  const fees = (Array.isArray(rate?.retailRate?.taxesAndFees) ? rate.retailRate.taxesAndFees : [])
    .filter((f) => f?.included === false && Number.isFinite(f.amount) && f.currency === currency);
  if (!fees.length) return null;
  return { amount: fees.reduce((sum, f) => sum + f.amount, 0), currency };
}

// The price of one room type: offerRetailRate (checked against a real answer,
// Nov 2026), or else the total of its rates' retailRate, which matched it.
function roomPrice(rt) {
  const offer = rt?.offerRetailRate;
  if (Number.isFinite(offer?.amount) && typeof offer.currency === 'string') {
    return { amount: offer.amount, currency: offer.currency };
  }
  const totals = (Array.isArray(rt?.rates) ? rt.rates : []).map((r) => r?.retailRate?.total?.[0]);
  if (!totals.length || totals.some((t) => !Number.isFinite(t?.amount) || typeof t.currency !== 'string')) return null;
  return { amount: totals.reduce((sum, t) => sum + t.amount, 0), currency: totals[0].currency };
}

function text(v) {
  return typeof v === 'string' ? v.trim().slice(0, 300) : '';
}
function number(v) {
  const n = typeof v === 'string' ? Number(v) : v;
  return Number.isFinite(n) ? n : null;
}
function httpsUrl(v) {
  return typeof v === 'string' && v.startsWith('https://') ? v : null;
}
