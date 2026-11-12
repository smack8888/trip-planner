// Adds one address to the dev server:  GET /api/hotels?lat=&lng=&checkin=&checkout=
// The page calls it; it calls LiteAPI with the key from .env and answers with
// a plain list of hotels (see liteapi.js). The key itself is never sent to
// the page, and never printed.
import { checkHotelQuery, fetchHotelRates, HotelsError } from './liteapi.js';

// env: the values from .env (read in vite.config.js).
export function hotelsApi(env) {
  async function handle(req, res) {
    const send = (status, body) => {
      res.statusCode = status;
      res.setHeader('Content-Type', 'application/json');
      res.end(JSON.stringify(body));
    };
    try {
      if (!env.LITEAPI_KEY) {
        return send(503, { error: 'not-configured', message: 'Add LITEAPI_KEY to .env, then restart the app.' });
      }
      if (!/^[A-Z]{2}$/.test(env.LITEAPI_GUEST_NATIONALITY ?? '')) {
        return send(503, { error: 'not-configured', message: 'Add LITEAPI_GUEST_NATIONALITY to .env (a two-letter country code, e.g. ES), then restart the app.' });
      }
      const query = checkHotelQuery(new URL(req.url, 'http://localhost').searchParams);
      const result = await fetchHotelRates(query, {
        key: env.LITEAPI_KEY,
        nationality: env.LITEAPI_GUEST_NATIONALITY,
        currency: /^[A-Z]{3}$/.test(env.LITEAPI_CURRENCY ?? '') ? env.LITEAPI_CURRENCY : 'EUR',
      });
      send(200, result);
    } catch (err) {
      send(err instanceof HotelsError ? err.status : 500, {
        error: 'failed',
        message: err instanceof HotelsError ? err.message : 'Something went wrong fetching hotels.',
      });
    }
  }

  return {
    name: 'hotels-api',
    configureServer(server) {
      server.middlewares.use('/api/hotels', handle);
    },
    configurePreviewServer(server) {
      server.middlewares.use('/api/hotels', handle);
    },
  };
}
