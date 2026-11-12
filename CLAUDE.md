# Trip planner

Trip-planning web app for a small group travelling together. It stores everything about a trip (transport, stays, tickets, places), helps discover places that fit the travellers, and optimises each day's route. Inspired by Wanderlog.

Personal preferences (who travels, interests, pace) live in `CLAUDE.local.md`, which is not committed.

## Core ideas
- Trip > Days > Stops. Bookings (bus, flight, stay, ticket, reservation) belong to the trip.
- A stop can be a fixed slot (fixed day and time, e.g. a timed ticket). The optimiser never moves fixed stops; it reorders the rest around them.
- Each leg between stops has a transport mode (auto, walk, metro, bus, bike) with a time estimate.
- A trip can hold two plans to compare (what we did vs suggested).
- Test dataset: a sample Paris trip, 30 Oct to 2 Nov 2026.

## Prototype
- `Prototype/paris-trip-planner.html` is a working single-file prototype of the interface and logic (plans, fixed slots, transport modes, optimiser, bookings, ideas). Use it as the reference for features, data and behaviour.
- Its map is hand-drawn and schematic. The real app uses a real map with OpenStreetMap tiles.
- Its place coordinates are approximate and its ideas have unverified hours. The real app must get these from a places API.

## Routes
- Real walking and public transport routes come from Transitous (https://transitous.org), through the dev server (`server/transitous.js`).
- Follow its usage policy: the project stays open source and non-commercial; every request sends a User-Agent with the app name, version and contact (`TRANSITOUS_CONTACT` in .env); keep usage light (well under 720 route requests a day); show a link to https://transitous.org/sources/ and the OpenStreetMap credit.

## Rules
- Never invent opening hours, prices or reviews. Take them from a places API and show when they were fetched.
- API keys live in .env, which is gitignored. Never print or commit them.
- This repository is public: never commit personal data (real names, emails, addresses, booking codes, real trip details).
- The owner is new to coding: small steps, explain each change, run the app after each step.
