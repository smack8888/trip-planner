// Vite settings. The only additions are our small APIs in server/:
//   - hotels-api.js: hotel listings (LiteAPI key)
//   - routes-api.js: real routes from Transitous (needs TRANSITOUS_CONTACT)
//
// loadEnv(..., '') reads every value in .env, but only into this server
// process. Vite only ever sends values starting with VITE_ to the browser,
// and we use none, so nothing in .env reaches the web page.
import { defineConfig, loadEnv } from 'vite';
import { hotelsApi } from './server/hotels-api.js';
import { routesApi } from './server/routes-api.js';

export default defineConfig(({ mode }) => {
  const env = loadEnv(mode, process.cwd(), '');
  return {
    plugins: [hotelsApi(env), routesApi(env)],
  };
});
