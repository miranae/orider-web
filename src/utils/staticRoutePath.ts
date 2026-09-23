/** Scale a latitude/longitude track to the lightweight route-preview viewport. */
export function buildStaticRoutePath(positions: [number, number][]): string | null {
  if (positions.length < 2) return null;
  const lats = positions.map(([lat]) => lat);
  const lngs = positions.map(([, lng]) => lng);
  const minLat = Math.min(...lats);
  const maxLat = Math.max(...lats);
  const minLng = Math.min(...lngs);
  const maxLng = Math.max(...lngs);
  const latSpan = Math.max(maxLat - minLat, 0.000001);
  const lngSpan = Math.max(maxLng - minLng, 0.000001);
  const pad = 16;
  const width = 320;
  const height = 160;

  return positions
    .map(([lat, lng], index) => {
      const x = pad + ((lng - minLng) / lngSpan) * (width - pad * 2);
      const y = pad + (1 - (lat - minLat) / latSpan) * (height - pad * 2);
      return `${index === 0 ? "M" : "L"} ${x.toFixed(1)} ${y.toFixed(1)}`;
    })
    .join(" ");
}
