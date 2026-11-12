// Entry point: loads the styles and starts the router, which picks the
// page to show from the address (see router.js).
import './styles.css';
import { startRouter } from './router.js';
import { homeView } from './views/home.js';
import { plannerView } from './views/planner.js';
import { tripDetailsView } from './views/trip-details.js';
import { recommendationsView } from './views/recommendations.js';
import { stayView } from './views/stay.js';
import { travelView } from './views/travel.js';
import { forYouView } from './views/for-you.js';
import { itineraryView } from './views/itinerary.js';

// Address (after the #) -> page. ":id" matches any trip id.
const routes = [
  ['/', homeView],
  ['/new', tripDetailsView], // step 1 for a new trip: destination, dates, pace
  ['/plan/:id/details', tripDetailsView], // change dates or pace later
  ['/plan/:id', recommendationsView], // step 2: pick places
  ['/plan/:id/for-you', forYouView], // optional step: questions, then less obvious places
  ['/plan/:id/stay', stayView], // step 3: where you'll stay
  ['/plan/:id/travel', travelView], // step 4: getting there and back
  ['/plan/:id/itinerary', itineraryView], // step 5: organised days
  ['/trip/paris-2026', plannerView], // the past Paris trip
];

function notFound(root) {
  root.innerHTML = `
    <a class="back" href="#/">← All trips</a>
    <h1>Not found</h1>
    <p class="lede">This page doesn't exist.</p>`;
}

startRouter(document.getElementById('app'), routes, notFound);
