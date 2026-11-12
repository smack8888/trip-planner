// Straight-line distance in kilometres between two points on Earth
// (the "haversine" formula). Each point needs { lat, lng }.
export function distanceKm(a, b) {
  const R = 6371; // Earth's radius in km
  const toRad = Math.PI / 180;
  const dLat = (b.lat - a.lat) * toRad;
  const dLng = (b.lng - a.lng) * toRad;
  const h =
    Math.sin(dLat / 2) ** 2 +
    Math.cos(a.lat * toRad) * Math.cos(b.lat * toRad) * Math.sin(dLng / 2) ** 2;
  return 2 * R * Math.asin(Math.sqrt(h));
}
