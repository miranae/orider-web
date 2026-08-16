/**
 * 경로 좌표를 GPX 로 굽는다.
 *
 * 좌표에 고도가 있으면 `<ele>` 로 함께 쓴다. 예전에는 고도를 쓰지 않아서, 제품이 안내하던
 * "GPX 로 내보내 다시 올리기" 경로가 고도를 전부 0 으로 만들었다 — 저장을 막아서 지키려던
 * 바로 그 오염을 우회로가 실행하고 있었다. 없는 고도를 지어내지는 않는다.
 */
export function routeToGpx(name: string, coordinates: Array<[number, number] | [number, number, number]>): string {
  if (coordinates.length < 2 || coordinates.some(([lng, lat, ele]) => !Number.isFinite(lat) || !Number.isFinite(lng) || Math.abs(lat) > 90 || Math.abs(lng) > 180 || (ele !== undefined && !Number.isFinite(ele)))) throw new Error("Invalid GPX route coordinates");
  const esc = (value: string) => value.replace(/&/g, "&amp;").replace(/</g, "&lt;").replace(/>/g, "&gt;").replace(/"/g, "&quot;");
  const points = coordinates.map(([lng, lat, ele]) => ele === undefined
    ? `<trkpt lat="${lat}" lon="${lng}"></trkpt>`
    : `<trkpt lat="${lat}" lon="${lng}"><ele>${ele}</ele></trkpt>`).join("");
  return `<?xml version="1.0" encoding="UTF-8"?><gpx xmlns="http://www.topografix.com/GPX/1/1" version="1.1" creator="O-Rider"><trk><name>${esc(name || "O-Rider route")}</name><trkseg>${points}</trkseg></trk></gpx>`;
}
export function downloadGpx(xml: string, filename = "orider-route.gpx"): void {
  const url = URL.createObjectURL(new Blob([xml], { type: "application/gpx+xml" }));
  const link = document.createElement("a"); link.href = url; link.download = filename; link.click(); URL.revokeObjectURL(url);
}
