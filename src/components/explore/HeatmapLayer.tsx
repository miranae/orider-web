/**
 * HeatmapLayer — 발견 히트맵 Mapbox 레이어 (이슈 #493).
 *
 * 서버 cron(heatmap-cron)이 GCS heat/{global,recent30}.json 으로 사전집계한 공개 활동 밀도를
 * 받아 Mapbox heatmap 레이어로 렌더. 프라이버시(공개만·저밀도 마스킹)는 서버 집계 단계에서
 * 이미 적용됨 — 클라는 표시만. 정적 파일 fetch(서버 라운드트립 없음), CDN 캐시.
 *
 * mode="off" 면 아무것도 렌더 안 함. tile 미존재(cron 미배포)면 빈 레이어(graceful).
 */
import { useEffect, useMemo, useState } from "react";
import { Source, Layer } from "react-map-gl/mapbox";
import { logClientError } from "../../services/errorLogger";

const HEAT_BASE = import.meta.env.VITE_HEATMAP_BASE;

export type HeatMode = "off" | "global" | "recent30";

interface HeatPoint { lat: number; lng: number; weight: number }

export default function HeatmapLayer({ mode }: { mode: HeatMode }) {
  const [pointsByMode, setPointsByMode] = useState<Partial<Record<HeatMode, HeatPoint[]>>>({});

  useEffect(() => {
    if (mode === "off" || pointsByMode[mode]) return;
    let cancelled = false;
    const file = mode === "recent30" ? "recent30" : "global";
    fetch(`${HEAT_BASE}/${file}.json`)
      .then((r) => (r.ok ? r.json() : Promise.reject(new Error(`heat ${r.status}`))))
      .then((d: { points?: HeatPoint[] }) => {
        if (!cancelled) setPointsByMode((prev) => ({ ...prev, [mode]: d.points ?? [] }));
      })
      .catch((err) => {
        logClientError("HeatmapLayer.fetch", err, { mode });
        if (!cancelled) setPointsByMode((prev) => ({ ...prev, [mode]: [] }));
      });
    return () => { cancelled = true; };
  }, [mode, pointsByMode]);

  const geojson = useMemo(() => {
    const pts = mode !== "off" ? pointsByMode[mode] ?? [] : [];
    return {
      type: "FeatureCollection" as const,
      features: pts.map((p) => ({
        type: "Feature" as const,
        properties: { weight: p.weight },
        geometry: { type: "Point" as const, coordinates: [p.lng, p.lat] },
      })),
    };
  }, [mode, pointsByMode]);

  if (mode === "off") return null;

  return (
    <Source id="heatmap" type="geojson" data={geojson}>
      <Layer
        id="heatmap-layer"
        type="heatmap"
        paint={{
          // 가중치: 셀 고유 사용자 수(>=3) → 0.2~1.0.
          "heatmap-weight": ["interpolate", ["linear"], ["get", "weight"], 3, 0.25, 40, 1],
          "heatmap-intensity": ["interpolate", ["linear"], ["zoom"], 5, 1, 15, 3],
          "heatmap-radius": ["interpolate", ["linear"], ["zoom"], 5, 8, 12, 18, 16, 30],
          "heatmap-opacity": 0.65,
          "heatmap-color": [
            "interpolate", ["linear"], ["heatmap-density"],
            0, "rgba(0,0,0,0)",
            0.2, "#1d4ed8",
            0.45, "#06b6d4",
            0.7, "#A3E635",
            0.9, "#FDBA74",
            1, "#f97316",
          ],
        }}
      />
    </Source>
  );
}
