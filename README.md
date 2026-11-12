# Trip planner

A personal trip planner for two travellers.

- **Home page** lists your saved trips and past trips.
- **Past trip: Paris** (30 Oct to 2 Nov 2026) opens the full planner: a real map,
  day by day, fixed-slot stops, a transport mode for every leg, and an
  "Optimise order" button for each day.
- **Plan a new trip** in five steps:
  1. **Details**: destination (Paris or Rome), first and last day, pace (packed or relaxed).
  2. **Places**: mark the recommended places that interest you.
  3. **Stay**: have you already booked somewhere?
     - **Yes**: add the name and address, and click the map to put a pin where it is.
     - **Not yet**: areas to stay in, ranked by how close they are to your picks.
       Choose one to plan around. **Show hotels and prices here** lists hotels
       with rooms for your dates (2 adults, one room), from LiteAPI, with when
       they were fetched. **Click a hotel to choose it**: the itinerary then
       uses its address. There are also links to search Booking.com or Google Maps.
  4. **Travel**: how you arrive on the first day and leave on the last: flight,
     train, coach, car or other; from or to where; flight or train number; which
     airport or station; and the time. It shows straight away what that leaves
     for sightseeing.
  5. **Itinerary**: a summary of where you stay (with the address) and your
     travel, then your picks organised into days that fit the time available,
     with a timetable and a map. Each day starts and ends where you
     stay. The first day starts after you've arrived and dropped your bags; the
     last day ends in time to collect them and make your flight or train.
     Anything that doesn't fit is listed.
     **With real routes on** (see Secrets), every leg between places is a real
     route from [Transitous](https://transitous.org): the walking distance along
     the streets, or the metro, bus or tram to take, with the line, its direction,
     the stop to get on and off at, and how many stops. The map follows them.
- **Saving is up to you.** A new trip is a draft until you press **Save trip**.
  Drafts never appear on the home page and disappear when you close the tab.
  Changes to a saved trip also wait for Save (or Discard).

## Run it

You need [Node.js](https://nodejs.org) (LTS version). Then, in this folder:

```bash
npm install
```

```bash
npm run dev
```

Open http://localhost:5173. Edit any file in `src/` and the page reloads by itself.

```bash
npm test
```

runs the automatic checks in `tests/`.

## Tech stack

| Piece | What it does |
|---|---|
| **Vite** | Dev server and build tool. `npm run dev` serves the app and reloads it on save. |
| **Plain JavaScript** (ES modules) | The app code. No framework. Each file `import`s what it needs. |
| **Leaflet** | The map library. |
| **OpenStreetMap tiles** | The map images. Free, no key; the credit must stay visible. |
| **Transitous** | Free walking and public transport routes for the itinerary, from OpenStreetMap streets and the cities' published timetables. Called by the dev server. |
| **Vitest** | Runs the tests. |
| **localStorage** | Saved trips and Paris planner edits, in this browser only. |
| **sessionStorage** | Unsaved drafts and changes; cleared when the tab closes. |
| **LiteAPI** | Hotel listings, prices and guest ratings. Called by the dev server, never by the page, so the key stays private. |

## Folders

```
index.html            The page; src/main.js draws everything into it
vite.config.js        Dev server settings: adds the /api/... addresses below
server/               Code that runs in the dev server, not in the browser
  hotels-api.js       /api/hotels: reads the key from .env and asks LiteAPI
  liteapi.js          Calls LiteAPI and turns its answer into a plain hotel list
  routes-api.js       /api/route (one real route) and /api/routes-config (are routes on?)
  transitous.js       Calls Transitous politely and turns its answer into walks and rides
src/
  main.js             Starts the router and lists which page lives at which address
  router.js           Shows a page based on the address after # (see main.js for the list)
  state.js            The Paris trip and every planner action (move, fix, set mode, optimise), plus saving
  trips.js            New trips: details, picks, drafts vs saved, save/discard/delete
  styles.css          Look and feel, with light and dark mode
  views/              One file per page
    home.js           Home: plan a new trip, saved trips, past trips
    trip-details.js   Step 1: destination, dates, pace (#/new and #/plan/<id>/details)
    recommendations.js  Step 2: popular places; mark the ones you like (#/plan/<id>)
    stay.js           Step 3: booked hotel (address + pin), or areas and hotels to choose from (#/plan/<id>/stay)
    travel.js         Step 4: getting there and back (#/plan/<id>/travel)
    itinerary.js      Step 5: picks organised into days, timetable, map (#/plan/<id>/itinerary)
    planner.js        Full planner for the past Paris trip (#/trip/paris-2026)
  data/
    paris-trip.js     Seed data: days, places, both plans, bookings
    destinations.js   Paris and Rome: hand-picked recommendations with approximate
                      locations and rough visit lengths, plus areas to stay in
                      and the airports and stations you can arrive at
  logic/              Pure calculations, no screen code (easy to test)
    geo.js            Distance between two points
    transport.js      Modes, speeds, leg time, "auto" mode choice
    optimise.js       Reorders a day's unfixed stops around fixed ones
    organise.js       Splits picked places into days that fit the time available
    stay.js           Ranks areas to stay in by travel to and from your days
    travel.js         Arrival and departure: what they leave of the first and last day
    routing.js        Real routes: timetable dates, city time zones, route shapes
    dates.js          Trip dates, day labels, clock times
  ui/
    header.js         Paris planner title and plan switcher with totals
    trip-header.js    New-trip title, step links and the save bar
    day-list.js       Day filter and the day-by-day list
    map.js            Leaflet (OpenStreetMap) map, markers, route lines, legend
    html.js           Small HTML helpers and day colours
    toast.js          Short status messages at the bottom of the screen
tests/                Automatic checks (npm test)
Prototype/            The original single-file prototype, kept as reference
```

## How it works

- **Trip > Days > Stops.** Each plan ("What we did", "Suggested") has one list of stops per day.
- **Fixed slot.** A fixed stop keeps its day and position. The optimiser only reorders the others.
- **Legs.** The mode between two stops is stored on the stop you leave from.
  "Auto" picks walking or the metro, whichever is quicker.
- **Optimiser.** Tries every order of a day's unfixed stops (up to 8) and keeps the quickest.
- **Organiser** (new trips). Each day has a time budget: packed is about 10 hours
  (9:00 to 19:00), relaxed about 7 hours (10:00 to 17:00), travel included.
  1. If the picks don't all fit, the least famous ones are left out and listed.
  2. Places are grouped by area: sorted by direction from the city centre, then
     cut into one slice per day, trying every starting point and keeping the
     grouping with the least travel.
  3. Each day is put in the quickest order with the optimiser.

  If you've told it where you stay (a pinned hotel, or an area you plan around),
  every day is a loop from there: the trip out in the morning and back in the
  evening count towards the day's time.
- **First and last day.** Each day has its own time budget. With an arrival
  time, the first day starts when you'd be at your hotel with bags dropped:
  arrival time, plus time to get out (about 45 min for a flight, 10 for a
  train), plus the usual airport transfer into the city (a rough guess per
  airport, e.g. 50 min from Fiumicino to Termini), plus the trip across town.
  With a departure time, the last day ends when you must leave the hotel with
  your bags: departure, minus time to be there early (2 h for a flight, 30 min
  for a train), minus the transfer and the trip across town. The organiser
  sizes each day's share of places to the time it has.
- **Areas to stay in** are ranked by the average travel per day from the area to
  each day's first stop and back from its last stop (using the days as they'd be
  organised without a hotel).

  The itinerary is worked out fresh from your picks, dates and pace, so it updates
  as soon as you change any of them.

## Known limits (for now)

- Place coordinates are approximate (copied from the prototype, or typed by hand
  for the recommendations). Visit lengths are rough planning guesses.
- The organiser doesn't know opening days or hours, so it may plan a museum on a
  day it's closed. That needs a places API.
- New-trip itineraries can't be edited by hand yet, and have no hotel or fixed slots.
- Without real routes on, distances are straight lines and travel times are rough
  estimates. With them, legs between places are real routes, but:
  - the organiser still groups places into days using the estimates, so a day can
    run a little over once real routes are in (the day's summary says so);
  - the trip in from the airport or station, and back, is still an estimate;
  - published timetables only cover the next few months, so for a trip more than
    about two months away it uses the next same weekday's timetable (the page says which);
  - Transitous is a free service run by volunteers, with no guarantee: if it's
    down, legs fall back to estimates.
- No opening hours, prices or reviews. Those will come from a places API, never made up.
- Recommendations are a hand-picked starter list in rough order of fame, not ranked
  by real popularity data yet. The page says so.
- Bookings are in the seed data but not shown yet.
- Typing a hotel address doesn't move the pin: that needs an address-lookup
  (geocoding) service. For now you click the map.
- Hotel listings only work with `npm run dev` (or `npm run preview`), because
  they go through the dev server. With a LiteAPI test (sandbox) key, prices may
  be test values; the page says so when LiteAPI marks the answer as sandbox.
- A chosen hotel isn't booked: book it yourself, then switch the Stay step to
  "Yes, it's booked" if you like. Its price is kept as it was when fetched.
- Arrival is always on the first day and departure on the last. If you arrive
  the evening before, make that the first day.
- Airport transfer times and the "be there early" allowances are rough fixed
  guesses, not timetables, and can't be changed in the app yet.

## Secrets

API keys go in `.env`, which Git ignores. `.env.example` lists the names with no values.

For hotel listings:
1. Make a free account at [liteapi.travel](https://www.liteapi.travel) and copy
   your sandbox key from the dashboard.
2. In `.env`, fill in `LITEAPI_KEY` and `LITEAPI_GUEST_NATIONALITY` (your
   passport country as two letters, e.g. `ES`; LiteAPI needs it because prices
   can depend on it). `LITEAPI_CURRENCY` is optional (EUR by default).
3. Restart `npm run dev`.

For real routes on the itinerary (optional; without them it uses estimates):
1. No account or key is needed. [Transitous](https://transitous.org/api/) is free
   for open-source, non-commercial projects, and asks each app to say how to
   reach its author.
2. In `.env`, set `TRANSITOUS_CONTACT` to your copy of the project's public web
   address (e.g. `https://github.com/<you>/trip-planner`). Please don't use
   someone else's: it tells Transitous who to contact.
3. Restart `npm run dev`.

The app sends at most 2 route requests at a time and remembers each answer for
a day, keeping well within Transitous's "light use" request.

## Credits and licence

- Map data and street routing: © [OpenStreetMap](https://www.openstreetmap.org/copyright) contributors.
- Routes: [Transitous](https://transitous.org), using public transport data from
  [these sources](https://transitous.org/sources/).
- Code: MIT licence (see `LICENSE`).
