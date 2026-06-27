export const MAPBOX_TOKEN = import.meta.env.VITE_MAPBOX_TOKEN;
// outdoors-v12 — 등고선·진녹·진청록 강한 톤. PR #80 가 일시적으로 streets-v12 fork
// (orider/cmp9...) 로 교체했으나 그 이유 (Mapbox Static Images API 의 한글 라벨
// 미지원) 가 PR #87 클라 캡처 전환으로 사라져 복원. OG 봇 endpoint 만 여전히
// 커스텀 스타일을 사용 (Static API + 한글 라벨이 동시에 필요한 유일한 경로).
export const MAP_STYLE = "mapbox://styles/mapbox/outdoors-v12";

/** 한국 중심 기본 뷰 */
export const DEFAULT_VIEW = { latitude: 36.5, longitude: 127.5, zoom: 7 };

/**
 * 지도 로드 후 한국어 라벨 + 자전거 경로 강조 적용.
 * <Map onLoad={(e) => applyKoreaCyclingStyle(e.target)} />
 */
export function applyKoreaCyclingStyle(map: { getStyle: () => any; setLayoutProperty: (...args: any[]) => void; setPaintProperty: (...args: any[]) => void; setLanguage?: (lang: string) => void }) {
  // Mapbox GL v3: 지도 전체 라벨을 한국어로 강제. setConfigProperty 기반이라
  // 아래 text-field 개별 설정보다 우선 적용되며, Mapbox Standard 스타일에서도 동작.
  try {
    map.setLanguage?.("ko");
  } catch {
    // 일부 스타일은 setLanguage 미지원 — 무시하고 아래 fallback 사용
  }

  const style = map.getStyle();
  if (!style?.layers) return;

  for (const layer of style.layers) {
    // 한국어 라벨 적용 — setLanguage 가 일부 레이어에 적용 안 되는 경우의 fallback.
    // text-field expression 이 있는 모든 라벨 레이어를 name_ko 우선으로 override.
    if (layer.layout?.["text-field"]) {
      try {
        map.setLayoutProperty(layer.id, "text-field", [
          "coalesce",
          ["get", "name_ko"],
          ["get", "name"],
        ]);
      } catch {
        // 일부 레이어는 expression 지원 안 함 — 무시
      }
    }

    // 자전거 경로 강조 (path, cycleway 레이어)
    if (layer.id.includes("path") || layer.id.includes("cycleway") || layer.id.includes("bike")) {
      try {
        if (layer.type === "line") {
          map.setPaintProperty(layer.id, "line-color", "#16A34A");
          map.setPaintProperty(layer.id, "line-opacity", 0.7);
          map.setPaintProperty(layer.id, "line-width", 2);
        }
      } catch {
        // 무시
      }
    }
  }
}
