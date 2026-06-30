/**
 * Decode a track string to [lat, lng] array.
 * Supports both "lat,lon;lat,lon;..." (Orider) and Google Encoded Polyline (Strava).
 */
export function decodeTrack(str: string): [number, number][] {
  if (!str || str.length === 0) return [];

  // Orider format: "lat,lon;lat,lon;..."
  if (str.includes(";") && str.includes(",")) {
    const points: [number, number][] = [];
    for (const pair of str.split(";")) {
      const parts = pair.split(",");
      if (parts.length === 2 && parts[0] && parts[1]) {
        const lat = parseFloat(parts[0]);
        const lng = parseFloat(parts[1]);
        if (!isNaN(lat) && !isNaN(lng)) {
          points.push([lat, lng]);
        }
      }
    }
    if (points.length > 0) return points;
  }

  // Fallback: Google Encoded Polyline
  return decodePolyline(str);
}

/**
 * Encode [lat, lng] array to Google Encoded Polyline.
 */
export function encodePolyline(points: [number, number][]): string {
  let prevLat = 0;
  let prevLng = 0;
  let result = "";

  for (const [lat, lng] of points) {
    const dLat = Math.round(lat * 1e5) - prevLat;
    const dLng = Math.round(lng * 1e5) - prevLng;
    prevLat += dLat;
    prevLng += dLng;
    result += encodeValue(dLat) + encodeValue(dLng);
  }
  return result;
}

function encodeValue(value: number): string {
  let v = value < 0 ? ~(value << 1) : value << 1;
  let result = "";
  while (v >= 0x20) {
    result += String.fromCharCode((0x20 | (v & 0x1f)) + 63);
    v >>= 5;
  }
  result += String.fromCharCode(v + 63);
  return result;
}

/**
 * Decode Google Encoded Polyline to [lat, lng] array.
 * https://developers.google.com/maps/documentation/utilities/polylinealgorithm
 */
export function decodePolyline(encoded: string): [number, number][] {
  const points: [number, number][] = [];
  let index = 0;
  let lat = 0;
  let lng = 0;

  while (index < encoded.length) {
    let shift = 0;
    let result = 0;
    let byte: number;

    do {
      byte = encoded.charCodeAt(index++) - 63;
      result |= (byte & 0x1f) << shift;
      shift += 5;
    } while (byte >= 0x20);

    lat += result & 1 ? ~(result >> 1) : result >> 1;

    shift = 0;
    result = 0;

    do {
      byte = encoded.charCodeAt(index++) - 63;
      result |= (byte & 0x1f) << shift;
      shift += 5;
    } while (byte >= 0x20);

    lng += result & 1 ? ~(result >> 1) : result >> 1;

    points.push([lat / 1e5, lng / 1e5]);
  }

  return points;
}
