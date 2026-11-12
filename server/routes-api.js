// Adds two addresses to the dev server:
//
//   GET /api/routes-config
//     Whether real routes are switched on (TRANSITOUS_CONTACT is set in .env).
//
//   GET /api/route?from=lat,lng&to=lat,lng&departure=ISO
//     One real route from Transitous (see transitous.js).
//
// Transitous asks every app to say who it is and how to reach its author,
// so nothing is sent to it until TRANSITOUS_CONTACT is filled in.
import { readFileSync } from 'node:fs';
import { checkRouteQuery, createPlanner, userAgent, RouteError } from './transitous.js';

// env: the values from .env (read in vite.config.js).
export function routesApi(env) {
  const contact = (env.TRANSITOUS_CONTACT ?? '').trim();
  const usable = /^(https:\/\/\S+|\S+@\S+\.\S+)$/.test(contact);
  const { version } = JSON.parse(readFileSync(new URL('../package.json', import.meta.url), 'utf8'));
  const plan = usable ? createPlanner({ userAgent: userAgent(version, contact) }) : null;

  const send = (res, status, body) => {
    res.statusCode = status;
    res.setHeader('Content-Type', 'application/json');
    res.end(JSON.stringify(body));
  };

  function config(req, res) {
    send(res, 200, { routes: usable });
  }

  async function route(req, res) {
    try {
      if (!plan) {
        return send(res, 503, {
          error: 'not-configured',
          message: 'Add TRANSITOUS_CONTACT to .env (your project’s web address), then restart the app.',
        });
      }
      const query = checkRouteQuery(new URL(req.url, 'http://localhost').searchParams);
      send(res, 200, await plan(query));
    } catch (err) {
      send(res, err instanceof RouteError ? err.status : 500, {
        error: 'failed',
        message: err instanceof RouteError ? err.message : 'Something went wrong fetching the route.',
      });
    }
  }

  const mount = (server) => {
    server.middlewares.use('/api/routes-config', config);
    server.middlewares.use('/api/route', route);
  };
  return { name: 'routes-api', configureServer: mount, configurePreviewServer: mount };
}
