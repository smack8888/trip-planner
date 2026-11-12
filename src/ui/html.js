// Makes text safe to put inside HTML, so a place name like "A & B"
// or a typed "<" can't break the page.
export function esc(value) {
  return String(value).replace(/[&<>"']/g, (c) => ({
    '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;',
  })[c]);
}

// Each day has its own colour (--d1 ... --d7 in styles.css). Longer trips
// reuse the colours: day 8 looks like day 1.
export function dayColourNumber(d) {
  return (d % 7) + 1;
}
export function dayStyle(d) {
  const n = dayColourNumber(d);
  return `--dc:var(--d${n});--dci:var(--d${n}i)`;
}

export const CATEGORY_LABELS = {
  stay: 'Stay', food: 'Food', nature: 'Nature', sight: 'Sight', shop: 'Shopping', transport: 'Transport',
};
