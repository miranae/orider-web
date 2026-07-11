export function routeToGpx(name: string, coordinates: [number, number][]): string {
  if (coordinates.length < 2 || coordinates.some(([lng, lat]) => !Number.isFinite(lat) || !Number.isFinite(lng) || Math.abs(lat) > 90 || Math.abs(lng) > 180)) throw new Error("Invalid GPX route coordinates");
  const esc = (value: string) => value.replace(/&/g, "&amp;").replace(/</g, "&lt;").replace(/>/g, "&gt;").replace(/"/g, "&quot;");
  const points = coordinates.map(([lng, lat]) => `<trkpt lat="${lat}" lon="${lng}"></trkpt>`).join("");
  return `<?xml version="1.0" encoding="UTF-8"?><gpx xmlns="http://www.topografix.com/GPX/1/1" version="1.1" creator="O-Rider"><trk><name>${esc(name || "O-Rider route")}</name><trkseg>${points}</trkseg></trk></gpx>`;
}
export function downloadGpx(xml: string, filename = "orider-route.gpx"): void {
  const url = URL.createObjectURL(new Blob([xml], { type: "application/gpx+xml" }));
  const link = document.createElement("a"); link.href = url; link.download = filename; link.click(); URL.revokeObjectURL(url);
}
