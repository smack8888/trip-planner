// A tiny "router": it decides which page (view) to show from the part of
// the address after #. For example:
//   #/                     home page
//   #/new                  choose a destination for a new trip
//   #/plan/<tripId>        pick recommendations for a new trip
//   #/trip/paris-2026      the full planner for our past Paris trip
// Using # means the browser's Back and Forward buttons work, and Vite
// needs no extra setup.
//
// Each view is a function mount(root, params) that draws into `root` and
// may return a cleanup function, called when you leave the page.

let cleanup = null;

export function startRouter(root, routes, notFound) {
  function show() {
    if (cleanup) cleanup();
    cleanup = null;
    // Each page gets a brand-new container. Throwing the old one away also
    // throws away its click listeners, so pages can't interfere.
    const page = document.createElement('div');
    root.replaceChildren(page);
    window.scrollTo(0, 0);

    const path = location.hash.replace(/^#/, '') || '/';
    for (const [pattern, view] of routes) {
      const params = match(pattern, path);
      if (params) {
        cleanup = view(page, params) || null;
        return;
      }
    }
    cleanup = notFound(page) || null;
  }
  window.addEventListener('hashchange', show);
  show();
}

export function go(path) {
  location.hash = path;
}

// match('/plan/:id', '/plan/abc') -> { id: 'abc' }; no match -> null
function match(pattern, path) {
  const p = pattern.split('/');
  const parts = path.split('/');
  if (p.length !== parts.length) return null;
  const params = {};
  for (let i = 0; i < p.length; i++) {
    if (p[i].startsWith(':')) params[p[i].slice(1)] = decodeURIComponent(parts[i]);
    else if (p[i] !== parts[i]) return null;
  }
  return params;
}
