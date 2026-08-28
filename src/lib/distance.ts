const EARTH_RADIUS_KM = 6371;

function toRadians(value: number): number {
  return (value * Math.PI) / 180;
}

/** Great-circle distance between two WGS84 coordinates. */
export function distanceKm(
  from: { lat: number; lng: number },
  to: { lat: number; lng: number },
): number {
  const latDelta = toRadians(to.lat - from.lat);
  const lngDelta = toRadians(to.lng - from.lng);
  const fromLat = toRadians(from.lat);
  const toLat = toRadians(to.lat);

  const a =
    Math.sin(latDelta / 2) ** 2 +
    Math.cos(fromLat) * Math.cos(toLat) * Math.sin(lngDelta / 2) ** 2;
  return 2 * EARTH_RADIUS_KM * Math.asin(Math.sqrt(a));
}

export const DISTANCE_OPTIONS_KM = [1, 3, 5, 10, 20, 50] as const;

export function parseDistanceKm(value: string | undefined): number {
  const parsed = Number(value);
  return DISTANCE_OPTIONS_KM.includes(parsed as (typeof DISTANCE_OPTIONS_KM)[number])
    ? parsed
    : 10;
}
