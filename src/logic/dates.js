// Date helpers. Trip dates are stored as plain 'YYYY-MM-DD' strings and
// handled in UTC, so a day never shifts because of time zones.

const WEEKDAYS = ['Sunday', 'Monday', 'Tuesday', 'Wednesday', 'Thursday', 'Friday', 'Saturday'];
const MONTHS = ['January', 'February', 'March', 'April', 'May', 'June', 'July',
  'August', 'September', 'October', 'November', 'December'];

const ISO = /^\d{4}-\d{2}-\d{2}$/;

// '2027-03-14' -> Date, or null if it isn't a real date.
export function parseDate(iso) {
  if (typeof iso !== 'string' || !ISO.test(iso)) return null;
  const d = new Date(`${iso}T00:00:00Z`);
  return Number.isNaN(d.getTime()) || d.toISOString().slice(0, 10) !== iso ? null : d;
}

// Every date from start to end, inclusive: ['2027-03-14', '2027-03-15', ...]
export function datesBetween(startIso, endIso) {
  const start = parseDate(startIso);
  const end = parseDate(endIso);
  if (!start || !end || end < start) return [];
  const out = [];
  for (let d = new Date(start); d <= end; d.setUTCDate(d.getUTCDate() + 1)) {
    out.push(d.toISOString().slice(0, 10));
  }
  return out;
}

// '2027-03-14' -> { short: 'Sun 14 Mar', long: 'Sunday 14 March' }
export function dayLabels(iso) {
  const d = parseDate(iso);
  const weekday = WEEKDAYS[d.getUTCDay()];
  const month = MONTHS[d.getUTCMonth()];
  return {
    short: `${weekday.slice(0, 3)} ${d.getUTCDate()} ${month.slice(0, 3)}`,
    long: `${weekday} ${d.getUTCDate()} ${month}`,
  };
}

// 'Sun 14 Mar to Wed 17 Mar 2027'
export function formatRange(startIso, endIso) {
  const year = parseDate(endIso).getUTCFullYear();
  if (startIso === endIso) return `${dayLabels(startIso).short} ${year}`;
  return `${dayLabels(startIso).short} to ${dayLabels(endIso).short} ${year}`;
}

// Minutes after midnight -> '09:05'
export function formatClock(minutes) {
  const m = Math.round(minutes);
  return `${String(Math.floor(m / 60)).padStart(2, '0')}:${String(m % 60).padStart(2, '0')}`;
}
