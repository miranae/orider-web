import { useState, useMemo, useEffect, useCallback, useRef, memo, type CSSProperties } from "react";
import { useLocation, useSearchParams } from "react-router-dom";
import { stripLangPrefix } from "../i18n/detector";
import { useTranslation } from "react-i18next";
import { useLocalizedNavigate as useNavigate } from "../hooks/useLocalizedNavigate";
import MapGL, { Source, Layer, Popup, useMap } from "react-map-gl/mapbox";
import HeatmapLayer, { type HeatMode } from "../components/explore/HeatmapLayer";
import type { LngLatBounds, MapMouseEvent } from "mapbox-gl";
import { logClientError } from "../services/errorLogger";
import { MAPBOX_TOKEN, MAP_STYLE, DEFAULT_VIEW, applyKoreaCyclingStyle } from "../utils/mapbox";
import { decodePolyline } from "../utils/polyline";
import { isImplausibleSegmentElevation } from "../utils/activitySanity";
import { Button, Card, Chip, Text } from "../theme/components";
import { useMobile } from "../hooks/useMobile";

interface SegmentData {
  id: string;
  name: string;
  distance: number;
  averageGrade: number;
  maximumGrade: number;
  elevationHigh: number;
  elevationLow: number;
  climbCategory: number;
  city?: string;
  state?: string;
  source?: string;
  polyline?: string | null;
  segmentLatlng?: string | null;
  startLatlng?: [number, number] | null;
  endLatlng?: [number, number] | null;
}

type Category = "all" | "climb" | "flat";
type LatLngTuple = [number, number];

const TILES_BASE = import.meta.env.VITE_SEGMENT_TILES_BASE;

interface TileOverview {
  v: number;
  ts: number;
  count: number;
  segments: {
    id: string;
    name: string;
    distance: number;
    averageGrade: number;
    maximumGrade: number;
    elevationHigh: number;
    elevationLow: number;
    climbCategory: number;
    city?: string;
    state?: string;
    startLatlng: [number, number] | null;
    sl?: [number, number][]; // simplified line for overview-level map
    gh: string;
  }[];
}

/**
 * v=1 (legacy): polylines = Record<id, [lat, lng][]>
 * v=2 (current): polylines = Record<id, encoded_polyline_string>
 * 서버가 v=2로 모든 region을 다시 쓰기까지 두 형식이 공존할 수 있어 union으로 둔다.
 */
interface TileRegion {
  v: number;
  ts: number;
  polylines: Record<string, string | [number, number][]>;
}

function encodeGeohash(lat: number, lng: number, precision: number): string {
  const base32 = '0123456789bcdefghjkmnpqrstuvwxyz';
  let minLat = -90, maxLat = 90, minLng = -180, maxLng = 180;
  let hash = '';
  let isLng = true;
  let bit = 0;
  let ch = 0;
  while (hash.length < precision) {
    if (isLng) {
      const mid = (minLng + maxLng) / 2;
      if (lng >= mid) { ch |= (1 << (4 - bit)); minLng = mid; }
      else { maxLng = mid; }
    } else {
      const mid = (minLat + maxLat) / 2;
      if (lat >= mid) { ch |= (1 << (4 - bit)); minLat = mid; }
      else { maxLat = mid; }
    }
    isLng = !isLng;
    bit++;
    if (bit === 5) { hash += base32[ch]; bit = 0; ch = 0; }
  }
  return hash;
}

function getVisibleGeohashes(bounds: LngLatBounds, precision: number = 3): string[] {
  const sw = bounds.getSouthWest();
  const ne = bounds.getNorthEast();
  const hashes = new Set<string>();
  const latStep = (ne.lat - sw.lat) / 5;
  const lngStep = (ne.lng - sw.lng) / 5;
  for (let lat = sw.lat; lat <= ne.lat; lat += latStep) {
    for (let lng = sw.lng; lng <= ne.lng; lng += lngStep) {
      hashes.add(encodeGeohash(lat, lng, precision));
    }
  }
  return Array.from(hashes);
}

const LIST_PAGE_SIZE = 50;

// CATEGORIES will be populated from translation in component

const CLIMB_LABELS: Record<number, string> = {
  5: "HC",
  4: "Cat 1",
  3: "Cat 2",
  2: "Cat 3",
  1: "Cat 4",
};

const CLIMB_COLORS: Record<number, string> = {
  5: "bg-red-600 text-[var(--ink-0)]",
  4: "bg-red-500 text-[var(--ink-0)]",
  3: "bg-[var(--amber)] text-[var(--bg-0)]",
  2: "bg-yellow-500 text-[var(--ink-0)]",
  1: "bg-green-500 text-[var(--ink-0)]",
};

const COLOR_CLIMB = "#EF4444";
const COLOR_FLAT = "#3B82F6";
const COLOR_HOVER = "#F97316";


function getSegmentCenter(segment: SegmentData, polylineCache: Map<string, LatLngTuple[]>): LatLngTuple | null {
  const pts = polylineCache.get(segment.id);
  if (pts && pts.length > 0) return pts[Math.floor(pts.length / 2)]!;
  if (segment.startLatlng) return segment.startLatlng as LatLngTuple;
  return null;
}

function isInBounds(segment: SegmentData, bounds: LngLatBounds, polylineCache: Map<string, LatLngTuple[]>): boolean {
  const center = getSegmentCenter(segment, polylineCache);
  if (!center) return false;
  return bounds.contains([center[1], center[0]]);
}

function segmentColor(segment: SegmentData): string {
  return segment.climbCategory > 0 ? COLOR_CLIMB : COLOR_FLAT;
}

/** 줌 레벨에 따른 최소 거리 (미터) — 짧은 세그먼트는 지도에서 숨김 */
function minDistanceForZoom(zoom: number): number {
  if (zoom >= 12) return 0;
  if (zoom >= 10) return 300;
  if (zoom >= 8) return 1000;
  return 3000;
}

/** 줌 레벨에 따른 그리드 셀 크기 (도 단위) — 인접 세그먼트 클러스터링용 */
function clusterCellSize(zoom: number): number {
  if (zoom >= 14) return 0;       // 클러스터링 안함
  if (zoom >= 12) return 0.005;   // ~500m
  if (zoom >= 11) return 0.015;   // ~1.5km
  if (zoom >= 10) return 0.03;    // ~3km
  if (zoom >= 9) return 0.06;     // ~6km
  return 0.2;                     // ~20km
}

/**
 * 정렬/스코어용 획득고도 — 비현실 세그먼트는 raw 대신 expectedGain(없으면 0)으로 치환해
 * corrupt 한 8623m 따위가 정렬 1위로 올라오지 않도록 한다.
 */
function rankingElevGain(seg: SegmentData): number {
  const rawGain = Math.max(0, seg.elevationHigh - seg.elevationLow);
  if (
    isImplausibleSegmentElevation({
      elevHigh: seg.elevationHigh,
      elevLow: seg.elevationLow,
      distanceM: seg.distance,
      avgGrade: seg.averageGrade,
    })
  ) {
    const expectedGain = (seg.distance * Math.abs(seg.averageGrade)) / 100;
    return Number.isFinite(expectedGain) && expectedGain > 0 ? expectedGain : 0;
  }
  return rawGain;
}

/** 세그먼트 중요도 점수 — 높을수록 대표로 선택 */
function segmentScore(seg: SegmentData): number {
  return seg.climbCategory * 10000 + rankingElevGain(seg) * 10 + seg.distance / 100;
}

/** 인접 세그먼트를 클러스터링하고 대표만 반환 (hoveredId는 항상 포함) */
function clusterSegments(
  segments: SegmentData[],
  polylineCache: Map<string, LatLngTuple[]>,
  zoom: number,
  hoveredId: string | null,
): Set<string> {
  const cell = clusterCellSize(zoom);
  if (cell === 0) return new Set(segments.map(s => s.id));

  const representatives = new Set<string>();
  const grid = new Map<string, SegmentData>();

  for (const seg of segments) {
    if (seg.id === hoveredId) {
      representatives.add(seg.id);
      continue;
    }
    const center = polylineCache.get(seg.id)?.[Math.floor((polylineCache.get(seg.id)?.length ?? 0) / 2)]
      ?? seg.startLatlng;
    if (!center) continue;

    const key = `${Math.floor(center[0] / cell)}_${Math.floor(center[1] / cell)}`;
    const existing = grid.get(key);
    if (!existing || segmentScore(seg) > segmentScore(existing)) {
      grid.set(key, seg);
    }
  }

  for (const seg of grid.values()) {
    representatives.add(seg.id);
  }
  return representatives;
}

/** 세그먼트들을 GeoJSON FeatureCollection으로 변환 (polyline 있는 것들) */
function buildLinesGeoJSON(
  segments: SegmentData[],
  polylineCache: Map<string, LatLngTuple[]>,
  hoveredId: string | null,
  zoom: number = 7,
): GeoJSON.FeatureCollection {
  const minDist = minDistanceForZoom(zoom);
  const features: GeoJSON.Feature[] = [];
  for (const seg of segments) {
    const pts = polylineCache.get(seg.id);
    if (!pts || pts.length < 2) continue;
    if (seg.distance < minDist && seg.id !== hoveredId) continue;
    features.push({
      type: "Feature",
      properties: {
        id: seg.id,
        color: hoveredId === seg.id ? COLOR_HOVER : segmentColor(seg),
        width: hoveredId === seg.id ? 5 : 3,
        opacity: hoveredId === seg.id ? 0.95 : 0.65,
        glowOpacity: hoveredId === seg.id ? 0.5 : 0,
        name: seg.name,
        distance: seg.distance,
        averageGrade: seg.averageGrade,
      },
      geometry: {
        type: "LineString",
        coordinates: pts.map(([lat, lng]) => [lng, lat]),
      },
    });
  }
  return { type: "FeatureCollection", features };
}

/** polyline 없는 세그먼트들을 circle GeoJSON으로 변환 */
function buildPointsGeoJSON(
  segments: SegmentData[],
  polylineCache: Map<string, LatLngTuple[]>,
  hoveredId: string | null,
  zoom: number = 7,
): GeoJSON.FeatureCollection {
  const minDist = minDistanceForZoom(zoom);
  const features: GeoJSON.Feature[] = [];
  for (const seg of segments) {
    if (polylineCache.has(seg.id)) continue;
    if (!seg.startLatlng) continue;
    if (seg.distance < minDist && seg.id !== hoveredId) continue;
    features.push({
      type: "Feature",
      properties: {
        id: seg.id,
        color: hoveredId === seg.id ? COLOR_HOVER : segmentColor(seg),
        radius: hoveredId === seg.id ? 8 : 5,
        name: seg.name,
        distance: seg.distance,
        averageGrade: seg.averageGrade,
      },
      geometry: {
        type: "Point",
        coordinates: [seg.startLatlng[1], seg.startLatlng[0]],
      },
    });
  }
  return { type: "FeatureCollection", features };
}

/** 초기 1회 전체 세그먼트에 맞게 줌 */
function FitAllBounds({ segments, polylineCache }: {
  segments: SegmentData[];
  polylineCache: Map<string, LatLngTuple[]>;
}) {
  const { current: map } = useMap();
  const fitted = useRef(false);

  useEffect(() => {
    if (fitted.current || segments.length === 0 || !map) return;
    const lats: number[] = [];
    const lngs: number[] = [];
    for (const s of segments) {
      const center = getSegmentCenter(s, polylineCache);
      if (center) {
        lats.push(center[0]);
        lngs.push(center[1]);
      }
    }
    if (lats.length === 0) return;

    lats.sort((a, b) => a - b);
    lngs.sort((a, b) => a - b);

    const lo = Math.floor(lats.length * 0.1);
    const hi = Math.max(lo, Math.ceil(lats.length * 0.9) - 1);
    map.fitBounds(
      [[lngs[lo]!, lats[lo]!], [lngs[hi]!, lats[hi]!]],
      { padding: 40, duration: 0 },
    );
    fitted.current = true;
  }, [map, segments, polylineCache]);

  return null;
}

/** 선택된 세그먼트로 지도 이동 */
function FlyToSegment({ segmentId, polylineCache, segments }: {
  segmentId: string | null;
  polylineCache: Map<string, LatLngTuple[]>;
  segments: SegmentData[];
}) {
  const { current: map } = useMap();
  const prevId = useRef<string | null>(null);

  useEffect(() => {
    if (!segmentId || segmentId === prevId.current || !map) return;
    prevId.current = segmentId;

    const pts = polylineCache.get(segmentId);
    if (pts && pts.length >= 2) {
      let minLat = Infinity, maxLat = -Infinity, minLng = Infinity, maxLng = -Infinity;
      for (const pt of pts) {
        if (pt[0] < minLat) minLat = pt[0];
        if (pt[0] > maxLat) maxLat = pt[0];
        if (pt[1] < minLng) minLng = pt[1];
        if (pt[1] > maxLng) maxLng = pt[1];
      }
      map.fitBounds([[minLng, minLat], [maxLng, maxLat]], { padding: 80, maxZoom: 15 });
      return;
    }
    const seg = segments.find((s) => s.id === segmentId);
    if (seg?.startLatlng) {
      map.flyTo({ center: [seg.startLatlng[1], seg.startLatlng[0]], zoom: 14, duration: 500 });
    }
  }, [segmentId, map, polylineCache, segments]);

  return null;
}

// ── 모듈 레벨 캐시: 페이지 재진입 시 즉시 표시 ──
const moduleCache = {
  overview: null as TileOverview | null,
  segments: [] as SegmentData[],
  regionPolylines: new Map<string, Map<string, LatLngTuple[]>>(), // gh3 -> (segId -> points)
  loadedRegions: new Set<string>(),
  loading: false,
};

export default function ExplorePage() {
  const { t } = useTranslation("segment");
  const navigate = useNavigate();
  const isMobile = useMobile();
  const location = useLocation();
  const isVisible = stripLangPrefix(location.pathname) === "/explore";
  const [hasRendered, setHasRendered] = useState(isVisible);

  const CATEGORIES: { id: Category; label: string; icon: string }[] = [
    { id: "all", label: t("category.all"), icon: "🗺" },
    { id: "climb", label: t("category.climb"), icon: "⛰" },
    { id: "flat", label: t("category.flat"), icon: "➡️" },
  ];

  useEffect(() => {
    if (isVisible) setHasRendered(true);
  }, [isVisible]);

  const [allSegments, setAllSegments] = useState<SegmentData[]>(moduleCache.segments);
  const [loading, setLoading] = useState(moduleCache.segments.length === 0);
  const [category, setCategory] = useState<Category>("all");
  const [searchQuery, setSearchQuery] = useState("");
  const [inputValue, setInputValue] = useState("");
  const [hoveredId, setHoveredId] = useState<string | null>(null);
  const [selectedId, setSelectedId] = useState<string | null>(null);
  const [mapBounds, setMapBounds] = useState<LngLatBounds | null>(null);
  // URL 상태(#488): 맵 중심/줌·카테고리·검색어를 URL 에 직렬화 → 공유·새로고침 복원.
  const [sp, setSp] = useSearchParams();
  const [mapCenter, setMapCenter] = useState<{ lng: number; lat: number } | null>(null);
  const urlReadyRef = useRef(false);
  // 초기 뷰: URL c/z 우선, 없으면 DEFAULT_VIEW (lazy init — 1회).
  const [initialView] = useState(() => {
    const c = sp.get("c");
    const z = Number(sp.get("z"));
    if (c) {
      const [lng, lat] = c.split(",").map(Number);
      if (Number.isFinite(lng) && Number.isFinite(lat)) {
        return { longitude: lng, latitude: lat, zoom: Number.isFinite(z) && z > 0 ? z : (DEFAULT_VIEW.zoom ?? 7) };
      }
    }
    return DEFAULT_VIEW;
  });
  const [mapZoom, setMapZoom] = useState(initialView.zoom ?? 7);
  const [listLimit, setListLimit] = useState(LIST_PAGE_SIZE);
  const [heatMode, setHeatMode] = useState<HeatMode>("off");
  const [tooltipInfo, setTooltipInfo] = useState<{ lng: number; lat: number; name: string; distance: number; grade: number } | null>(null);
  const cardRefs = useRef<Map<string, HTMLDivElement>>(new Map());
  const polylineCache = useRef<Map<string, LatLngTuple[]>>(new Map());

  const handleMoveEnd = useCallback((e: any) => {
    const b = e.target.getBounds();
    if (b) setMapBounds(b);
    setMapZoom(e.target.getZoom());
    const c = e.target.getCenter();
    setMapCenter({ lng: c.lng, lat: c.lat });
    if (e.originalEvent) {
      setSelectedId(null);
      setHoveredId(null);
    }
  }, []);

  // overview.json 로드 (최초 1회)
  useEffect(() => {
    if (moduleCache.overview && moduleCache.segments.length > 0) {
      setAllSegments(moduleCache.segments);
      setLoading(false);
      return;
    }
    if (moduleCache.loading) return;
    moduleCache.loading = true;

    fetch(`${TILES_BASE}/overview.json?v=${Date.now()}`)
      .then(res => res.json())
      .then((data: TileOverview) => {
        moduleCache.overview = data;
        // Populate polylineCache with simplified lines from overview
        const pc = polylineCache.current;
        for (const s of data.segments) {
          if (s.sl && s.sl.length >= 2) {
            pc.set(s.id, s.sl as LatLngTuple[]);
          }
        }
        moduleCache.segments = data.segments.map(s => ({
          id: s.id,
          name: s.name,
          distance: s.distance,
          averageGrade: s.averageGrade,
          maximumGrade: s.maximumGrade,
          elevationHigh: s.elevationHigh,
          elevationLow: s.elevationLow,
          climbCategory: s.climbCategory,
          city: s.city,
          state: s.state,
          startLatlng: s.startLatlng,
          polyline: null,
          segmentLatlng: null,
          endLatlng: null,
        }));
        setAllSegments(moduleCache.segments);
        setLoading(false);
      })
      .catch(err => {
        logClientError("ExplorePage.loadSegmentOverview", err);
        setLoading(false);
      })
      .finally(() => {
        moduleCache.loading = false;
      });
     
  }, []);

  // 지역 폴리라인 lazy 로드 (zoom >= 10)
  useEffect(() => {
    if (!mapBounds || mapZoom < 10) return;

    const visibleHashes = getVisibleGeohashes(mapBounds, 3);
    const toLoad = visibleHashes.filter(gh => !moduleCache.loadedRegions.has(gh));

    if (toLoad.length === 0) return;

    toLoad.forEach(gh => moduleCache.loadedRegions.add(gh));

    Promise.all(
      toLoad.map(gh =>
        fetch(`${TILES_BASE}/regions/${gh}.json`)
          .then(res => {
            if (!res.ok) return null;
            return res.json() as Promise<TileRegion>;
          })
          .then(data => {
            if (!data) return;
            const regionMap = new Map<string, LatLngTuple[]>();
            // v=2 (encoded string) / v=1 (array) 모두 처리. typeof로 분기.
            for (const [segId, polyOrPoints] of Object.entries(data.polylines)) {
              const points = typeof polyOrPoints === "string"
                ? (decodePolyline(polyOrPoints) as LatLngTuple[])
                : (polyOrPoints as LatLngTuple[]);
              regionMap.set(segId, points);
            }
            moduleCache.regionPolylines.set(gh, regionMap);
          })
          .catch((err) => logClientError("ExplorePage.bg", err, {}))
      )
    ).then(() => {
      const pc = polylineCache.current;
      for (const regionMap of moduleCache.regionPolylines.values()) {
        for (const [segId, points] of regionMap) {
          if (!pc.has(segId)) {
            pc.set(segId, points);
          }
        }
      }
      setAllSegments([...moduleCache.segments]);
    });
  }, [mapBounds, mapZoom]);

  const displaySegments = useMemo(() => {
    let filtered = allSegments;

    if (category === "climb") {
      filtered = filtered.filter((s) => s.climbCategory > 0);
    } else if (category === "flat") {
      filtered = filtered.filter((s) => s.climbCategory === 0);
    }

    if (searchQuery) {
      const tokens = searchQuery.toLowerCase().split(/[^\p{L}\p{N}]+/gu).filter(Boolean);
      filtered = filtered.filter((s) => {
        const text = `${s.name} ${s.city ?? ""} ${s.state ?? ""}`.toLowerCase();
        return tokens.every((t) => text.includes(t));
      });
    }

    // 비현실 획득고도 세그먼트가 상위로 노출되지 않도록 sanitized gain 으로 정렬.
    return [...filtered].sort((a, b) => rankingElevGain(b) - rankingElevGain(a));
  }, [allSegments, category, searchQuery]);

  const visibleOnMap = useMemo(() => {
    if (!mapBounds) return displaySegments;
    return displaySegments.filter((s) => isInBounds(s, mapBounds, polylineCache.current));
  }, [displaySegments, mapBounds]);

  // 리스트는 항상 현재 지도 뷰를 반영(#488) — 선택 시 frozen 시키던 동작 제거(드래그 후 새로
  // 보이는 세그먼트가 리스트에 안 뜨던 문제 해소). 검색 중엔 뷰 무관 전체 결과.
  const listSource = searchQuery ? displaySegments : visibleOnMap;
  const listSegments = useMemo(
    () => listSource.slice(0, listLimit),
    [listSource, listLimit],
  );
  const hasMoreList = listLimit < listSource.length;

  useEffect(() => {
    setListLimit(LIST_PAGE_SIZE);
  }, [category, searchQuery, mapBounds]);

  const handleSelectSegment = useCallback((id: string) => {
    setSelectedId((prev) => (prev === id ? null : id));
    setHoveredId(id);
  }, []);

  const handleSearch = () => setSearchQuery(inputValue.trim());
  const handleKeyDown = (e: React.KeyboardEvent) => {
    if (e.key === "Enter") handleSearch();
  };
  // 실시간 검색(#488) — 입력 디바운스 250ms 로 검색어 반영(Enter/버튼은 즉시).
  useEffect(() => {
    const id = setTimeout(() => setSearchQuery(inputValue.trim()), 250);
    return () => clearTimeout(id);
  }, [inputValue]);

  // URL 상태 복원(#488) — 마운트 1회: q/cat 을 입력·필터에 반영(맵 c/z 는 initialView 가 처리).
  useEffect(() => {
    const q = sp.get("q");
    if (q) { setInputValue(q); setSearchQuery(q); }
    const cat = sp.get("cat");
    if (cat === "all" || cat === "climb" || cat === "flat") setCategory(cat);
    urlReadyRef.current = true;
  }, []);

  // URL 상태 직렬화(#488) — 변경 시 디바운스로 q/cat/c/z 기록(replace, 히스토리 오염 방지).
  useEffect(() => {
    if (!urlReadyRef.current) return;
    const id = setTimeout(() => {
      const next: Record<string, string> = {};
      if (searchQuery) next.q = searchQuery;
      if (category !== "all") next.cat = category;
      if (mapCenter) next.c = `${mapCenter.lng.toFixed(4)},${mapCenter.lat.toFixed(4)}`;
      if (mapZoom) next.z = mapZoom.toFixed(1);
      setSp(next, { replace: true });
    }, 400);
    return () => clearTimeout(id);
  }, [searchQuery, category, mapCenter, mapZoom, setSp]);

  const scrollToCard = useCallback((id: string) => {
    const idx = displaySegments.findIndex((s) => s.id === id);
    if (idx >= 0 && idx >= listLimit) {
      setListLimit(idx + LIST_PAGE_SIZE);
    }
    setHoveredId(id);
    requestAnimationFrame(() => {
      requestAnimationFrame(() => {
        const el = cardRefs.current.get(id);
        if (el) {
          el.scrollIntoView({ behavior: "smooth", block: "nearest" });
        }
      });
    });
  }, [displaySegments, listLimit]);

  // 인접 세그먼트 클러스터링 — 대표만 지도에 표시
  const mapRepresentatives = useMemo(
    () => clusterSegments(visibleOnMap, polylineCache.current, mapZoom, hoveredId),
    [visibleOnMap, mapZoom, hoveredId],
  );

  const mapSegments = useMemo(
    () => visibleOnMap.filter(s => mapRepresentatives.has(s.id)),
    [visibleOnMap, mapRepresentatives],
  );

  // GeoJSON data for map layers
  const linesGeoJSON = useMemo(
    () => buildLinesGeoJSON(mapSegments, polylineCache.current, hoveredId, mapZoom),
    [mapSegments, hoveredId, mapZoom],
  );

  const pointsGeoJSON = useMemo(
    () => buildPointsGeoJSON(mapSegments, polylineCache.current, hoveredId, mapZoom),
    [mapSegments, hoveredId, mapZoom],
  );

  const handleMapClick = useCallback((e: MapMouseEvent) => {
    const map = e.target;
    const features = map.queryRenderedFeatures(e.point, { layers: ["segment-lines-hit", "segment-points"] });
    if (features && features.length > 0) {
      const id = features[0]!.properties?.id;
      if (id) scrollToCard(id);
    }
  }, [scrollToCard]);

  const handleMapDblClick = useCallback((e: MapMouseEvent) => {
    const map = e.target;
    const features = map.queryRenderedFeatures(e.point, { layers: ["segment-lines-hit", "segment-points"] });
    if (features && features.length > 0) {
      const id = features[0]!.properties?.id;
      if (id) {
        e.preventDefault();
        navigate(`/segment/${id}`);
      }
    }
  }, [navigate]);

  const handleMapMouseMove = useCallback((e: MapMouseEvent) => {
    const map = e.target;
    const features = map.queryRenderedFeatures(e.point, { layers: ["segment-lines-hit", "segment-points"] });
    if (features && features.length > 0) {
      const props = features[0]!.properties!;
      map.getCanvas().style.cursor = "pointer";
      setHoveredId(props.id);
      const segId = String(props.id);
      const seg = moduleCache.segments.find(s => s.id === segId);
      setTooltipInfo({
        lng: e.lngLat.lng,
        lat: e.lngLat.lat,
        name: seg?.name || props.name || "",
        distance: props.distance,
        grade: props.averageGrade,
      });
    } else {
      map.getCanvas().style.cursor = "";
      setHoveredId(null);
      setTooltipInfo(null);
    }
  }, []);

  const handleMapMouseLeave = useCallback(() => {
    setTooltipInfo(null);
  }, []);

  if (!hasRendered) return null;

  return (
    // 모바일: 고정 높이 없이 자연 스크롤(짧은 지도 + 목록이 아래로 흐름) — 지도가 화면을 다 덮어
    // 순위/기록을 못 보던 문제 해결. 데스크톱(lg)만 풀 높이 분할 화면 유지.
    <div className="flex flex-col -mx-4 -my-6 lg:h-[calc(100vh-56px)]">
      {/* 컨트롤 바 */}
      <div className="flex-shrink-0 px-4 pb-4 space-y-4 bg-[var(--bg-1)] border-b border-[var(--line-soft)]">
        <div className="flex items-center justify-between pt-3 md:pt-6">
          <div className="hidden md:block">
            <h1 className="text-[length:var(--fs-2xl)] font-bold">{t("leaderboard")}</h1>
            <p className="text-[var(--ink-2)] text-[length:var(--fs-sm)] mt-1">
              {t("subtitle")}
            </p>
          </div>
          <div className="flex gap-2" />
        </div>

        <div className="flex flex-col sm:flex-row gap-3">
          <div className="relative flex-1">
            <button
              onClick={handleSearch}
              className="absolute left-3 top-1/2 -translate-y-1/2 text-[var(--ink-3)] hover:text-[var(--lime)] transition-colors"
            >
              <svg className="w-4 h-4" fill="none" viewBox="0 0 24 24" stroke="currentColor">
                <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M21 21l-6-6m2-5a7 7 0 11-14 0 7 7 0 0114 0z" />
              </svg>
            </button>
            <input
              type="text"
              placeholder={t("search.placeholder")}
              value={inputValue}
              onChange={(e) => setInputValue(e.target.value)}
              onKeyDown={handleKeyDown}
              className="w-full pl-10 pr-4 py-2.5 bg-[var(--bg-2)] border border-[var(--line)] rounded-[var(--r-lg)] text-[length:var(--fs-sm)] text-[var(--ink-0)] focus:outline-none focus:ring-2 focus:ring-[var(--lime)] focus:border-transparent"
            />
          </div>
          <div className="flex gap-1">
            {CATEGORIES.map((cat) => (
              <button
                key={cat.id}
                onClick={() => setCategory(cat.id)}
                className={`px-3 py-2 text-[length:var(--fs-sm)] rounded-[var(--r-lg)] font-medium transition-colors whitespace-nowrap ${
                  category === cat.id
                    ? "bg-[var(--lime)] text-[var(--bg-0)]"
                    : "bg-[var(--bg-2)] border border-[var(--line)] text-[var(--ink-1)] hover:bg-[var(--bg-3)]"
                }`}
              >
                {cat.icon} {cat.label}
              </button>
            ))}
          </div>
        </div>
      </div>

      {/* 메인: 지도 + 목록 */}
      {loading ? (
        <div className="flex-1 flex items-center justify-center">
          <div className="w-8 h-8 border-4 border-[var(--lime)] border-t-transparent rounded-full animate-spin" />
        </div>
      ) : (
        <div className="flex-1 flex flex-col lg:flex-row min-h-0">
          {/* 지도 — 모바일은 짧게(목록에 공간 양보), 데스크톱은 좌측 분할 영역 채움 */}
          <div className="h-[55vh] lg:h-auto lg:flex-[2] relative">
            {/* 줌 레벨 표시 */}
            <div className="absolute top-2 left-2 z-10 px-2 py-1 bg-black/50 text-[var(--ink-0)] text-[length:var(--fs-xs)] rounded-[var(--r-sm)] font-mono">
              z{Math.round(mapZoom)}
            </div>
            {/* 히트맵 토글 (#493) */}
            <div className="absolute top-2 right-2 z-10 flex gap-1">
              {(["off", "global", "recent30"] as HeatMode[]).map((m) => (
                <button
                  key={m}
                  onClick={() => setHeatMode(m)}
                  aria-pressed={heatMode === m}
                  className={`px-2 py-1 text-[length:var(--fs-xs)] rounded-[var(--r-sm)] font-medium transition-colors ${
                    heatMode === m
                      ? "bg-[var(--lime)] text-[var(--bg-0)]"
                      : "bg-black/50 text-[var(--ink-0)] hover:bg-black/70"
                  }`}
                >
                  {t(`heat.${m}`)}
                </button>
              ))}
            </div>
            <MapGL
              mapboxAccessToken={MAPBOX_TOKEN}
              mapStyle={MAP_STYLE}
              initialViewState={initialView}
              onLoad={(e) => applyKoreaCyclingStyle(e.target)}
              onMoveEnd={handleMoveEnd}
              onClick={handleMapClick}
              onDblClick={handleMapDblClick}
              onMouseMove={handleMapMouseMove}
              onMouseLeave={handleMapMouseLeave}
              attributionControl={false}
              dragRotate={false}
              style={{ width: "100%", height: "100%" }}
              interactiveLayerIds={["segment-lines-hit", "segment-points"]}
            >
              <FitAllBounds segments={allSegments} polylineCache={polylineCache.current} />
              <FlyToSegment segmentId={selectedId} polylineCache={polylineCache.current} segments={allSegments} />

              {/* 발견 히트맵 — 세그먼트 아래 렌더(#493) */}
              <HeatmapLayer mode={heatMode} />

              {/* Segment polylines */}
              <Source id="segment-lines" type="geojson" data={linesGeoJSON}>
                {/* Glow layer */}
                <Layer id="segment-lines-glow" type="line" paint={{
                  "line-color": "#FDBA74",
                  "line-width": 10,
                  "line-opacity": ["get", "glowOpacity"],
                }} layout={{ "line-cap": "round", "line-join": "round" }} />
                {/* Visible line */}
                <Layer id="segment-lines-visible" type="line" paint={{
                  "line-color": ["get", "color"],
                  "line-width": ["get", "width"],
                  "line-opacity": ["get", "opacity"],
                }} layout={{ "line-cap": "round", "line-join": "round" }} />
                {/* Hit area (transparent, wider) */}
                <Layer id="segment-lines-hit" type="line" paint={{
                  "line-color": "#000000",
                  "line-width": 20,
                  "line-opacity": 0,
                }} layout={{ "line-cap": "round", "line-join": "round" }} />
              </Source>

              {/* Segment points (no polyline) */}
              <Source id="segment-points" type="geojson" data={pointsGeoJSON}>
                <Layer id="segment-points" type="circle" paint={{
                  "circle-radius": ["get", "radius"],
                  "circle-color": ["get", "color"],
                  "circle-opacity": 0.7,
                  "circle-stroke-width": 2,
                  "circle-stroke-color": ["get", "color"],
                }} />
              </Source>

              {/* Tooltip popup on hover */}
              {tooltipInfo && (
                <Popup
                  longitude={tooltipInfo.lng}
                  latitude={tooltipInfo.lat}
                  anchor="bottom"
                  closeButton={false}
                  closeOnClick={false}
                  offset={12}
                  className="segment-tooltip"
                >
                  <div style={{ color: "var(--ink-0)", fontSize: 13 }}>
                    <div style={{ fontWeight: 600 }}>{tooltipInfo.name}</div>
                    <div style={{ color: "var(--ink-3)" }}>
                      {(tooltipInfo.distance / 1000).toFixed(2)} km · {tooltipInfo.grade.toFixed(1)}%
                    </div>
                  </div>
                </Popup>
              )}
            </MapGL>
          </div>

          {/* 목록 */}
          <div className="flex-1 lg:flex-[1] lg:max-w-md overflow-y-auto border-t lg:border-t-0 lg:border-l border-[var(--line-soft)] bg-[var(--bg-0)]">
            {/* 모바일: 좌우 패딩 제거해 카드를 화면 전폭으로. lg에서는 p-3 유지 */}
            <div className={isMobile ? "pt-3 pb-3" : "p-3"}>
              {/* 선택된 세그먼트 상세 패널 */}
              {selectedId && (() => {
                const sel = allSegments.find((s) => s.id === selectedId);
                if (!sel) return null;
                const distKm = (sel.distance / 1000).toFixed(2);
                const elevGainRawSel = Math.max(0, sel.elevationHigh - sel.elevationLow);
                const elevImplausibleSel = isImplausibleSegmentElevation({
                  elevHigh: sel.elevationHigh,
                  elevLow: sel.elevationLow,
                  distanceM: sel.distance,
                  avgGrade: sel.averageGrade,
                });
                const elevGain = elevImplausibleSel ? null : elevGainRawSel;
                const climbLabel = CLIMB_LABELS[sel.climbCategory];
                // 모바일: 전폭 카드 (외부 컨테이너 패딩 없으므로 추가 음수마진 불필요)
                const selectedCardStyle: CSSProperties = isMobile
                  ? { padding: 0, overflow: "hidden", borderRadius: 0, borderLeft: "none", borderRight: "none", marginBottom: 12 }
                  : { padding: 0, overflow: "hidden", borderRadius: 8, marginBottom: 12 };
                return (
                  <Card padding="none" className="mb-3" style={selectedCardStyle}>
                    <div style={{ padding: "14px 16px", borderBottom: "1px solid var(--line-soft)" }}>
                      <div className="flex items-center gap-2 mb-1 flex-wrap">
                        {climbLabel && (
                          <span className={`px-2 py-0.5 text-[length:var(--fs-xs)] font-bold rounded-[var(--r-sm)] ${CLIMB_COLORS[sel.climbCategory]}`}>
                            {climbLabel}
                          </span>
                        )}
                        <Chip style={{ fontSize: 9, padding: "2px 6px" }}>{distKm} km</Chip>
                        <Chip style={{ fontSize: 9, padding: "2px 6px" }}>{t("explore.avgGradeChip", { grade: sel.averageGrade.toFixed(1) })}</Chip>
                      </div>
                      <h2 className="text-[length:var(--fs-lg)] font-bold" style={{ color: "var(--ink-0)" }}>{sel.name}</h2>
                      {(sel.city || sel.state) && (
                        <div className="text-[length:var(--fs-xs)] mt-1" style={{ color: "var(--ink-3)" }}>
                          {[sel.city, sel.state].filter(Boolean).join(", ")}
                        </div>
                      )}
                    </div>
                    <div style={{
                      display: "grid", gridTemplateColumns: "repeat(4, 1fr)", gap: 1,
                      background: "var(--line-soft)", borderBottom: "1px solid var(--line-soft)",
                    }}>
                      {([
                        [t("distance"), distKm, "km", undefined],
                        [
                          t("explore.elevDiff"),
                          elevGain != null ? String(Math.round(elevGain)) : "—",
                          "m",
                          elevImplausibleSel
                            ? t("explore.elevImplausible", { raw: Math.round(elevGainRawSel) })
                            : undefined,
                        ],
                        [t("averageGrade"), sel.averageGrade.toFixed(1), "%", undefined],
                        [t("maxGrade"), sel.maximumGrade.toFixed(1), "%", undefined],
                      ] as [string, string, string, string | undefined][]).map(([k, v, u, title]) => (
                        <div key={k} title={title} style={{ padding: "10px 8px", background: "var(--bg-1)" }}>
                          <Text as="div" variant="eyebrow" style={{ marginBottom: 'var(--space-1)', fontSize: 9 }}>{k}</Text>
                          <div>
                            <Text variant="dataMedium" style={{ fontSize: 15 }}>{v}</Text>
                            <Text variant="unit">{u}</Text>
                          </div>
                        </div>
                      ))}
                    </div>
                    <div style={{ padding: "10px 16px", display: "flex", gap: 'var(--space-2)' }}>
                      <Button
                        onClick={() => navigate(`/segment/${sel.id}`)} variant="primary" size="sm"
                        style={{ flex: 1, justifyContent: "center" }}
                      >
                        {t("button.detailView")}
                      </Button>
                    </div>
                  </Card>
                );
              })()}

              <Text as="div" variant="eyebrow" className="mb-2">
                {searchQuery
                  ? t("stats.resultCount", { count: listSource.length })
                  : t("stats.areaCount", { count: listSource.length })}
              </Text>
              {listSource.length === 0 ? (
                <div className="text-center py-12 text-[length:var(--fs-sm)]" style={{ color: "var(--ink-3)" }}>
                  {searchQuery
                    ? t("empty.noResults")
                    : allSegments.length === 0
                      ? t("empty.noSegments")
                      : t("empty.noSegmentsInArea")}
                </div>
              ) : (
                <div className={isMobile ? "space-y-0" : "space-y-2"}>
                  {listSegments.map((segment) => (
                    <MemoSegmentCard
                      key={segment.id}
                      segment={segment}
                      isHovered={hoveredId === segment.id}
                      isSelected={selectedId === segment.id}
                      onHover={setHoveredId}
                      onSelect={handleSelectSegment}
                      onNavigate={navigate}
                      cardRefs={cardRefs}
                      isFullBleed={isMobile}
                    />
                  ))}

                  {hasMoreList && (
                    <div className="flex justify-center mt-4">
                      <button
                        onClick={() => setListLimit((prev) => prev + LIST_PAGE_SIZE)}
                        className="px-6 py-2.5 bg-[var(--bg-2)] border border-[var(--line)] rounded-[var(--r-lg)] text-[length:var(--fs-sm)] font-medium text-[var(--ink-1)] hover:bg-[var(--bg-3)] transition-colors"
                      >
                        {t("explore.loadMore", { remaining: listSource.length - listLimit })}
                      </button>
                    </div>
                  )}
                </div>
              )}
            </div>
          </div>
        </div>
      )}
    </div>
  );
}

const MemoSegmentCard = memo(function SegmentCard({ segment, isHovered, isSelected, onHover, onSelect, onNavigate, cardRefs, isFullBleed }: {
  segment: SegmentData;
  isHovered: boolean;
  isSelected: boolean;
  onHover: (id: string | null) => void;
  onSelect: (id: string) => void;
  onNavigate: (path: string) => void;
  cardRefs: React.MutableRefObject<Map<string, HTMLDivElement>>;
  isFullBleed?: boolean;
}) {
  const { t } = useTranslation("segment");
  const elevGainRaw = Math.max(0, segment.elevationHigh - segment.elevationLow);
  // 비현실 획득고도 가드 (activitySanity 공통 헬퍼). corrupt 한 8623m 등을 "—" 로 가린다.
  const elevImplausible = isImplausibleSegmentElevation({
    elevHigh: segment.elevationHigh,
    elevLow: segment.elevationLow,
    distanceM: segment.distance,
    avgGrade: segment.averageGrade,
  });
  const elevGain = elevImplausible ? null : elevGainRaw;
  const climbLabel = CLIMB_LABELS[segment.climbCategory];
  const climbColor = CLIMB_COLORS[segment.climbCategory];
  const highlighted = isHovered || isSelected;

  return (
    <div
      ref={(el) => {
        if (el) cardRefs.current.set(segment.id, el);
        else cardRefs.current.delete(segment.id);
      }}
      className={isFullBleed ? "cursor-pointer p-3 transition-colors" : "cursor-pointer rounded-[var(--r-lg)] p-3 transition-colors"}
      style={isFullBleed ? {
        // 전폭 섹션 스타일: 좌우 border·radius 제거, 상하 구분선만
        background: highlighted ? "color-mix(in oklch, var(--lime) 6%, var(--bg-2))" : "var(--bg-1)",
        borderTop: "none",
        borderBottom: highlighted ? "1px solid var(--lime)" : "1px solid var(--line-soft)",
        borderLeft: highlighted ? "2px solid var(--lime)" : "none",
        borderRight: "none",
      } : {
        background: highlighted ? "color-mix(in oklch, var(--lime) 6%, var(--bg-2))" : "var(--bg-1)",
        border: highlighted ? "1px solid var(--lime)" : "1px solid var(--line-soft)",
        borderLeft: highlighted ? "2px solid var(--lime)" : "2px solid transparent",
      }}
      onClick={() => onSelect(segment.id)}
      onDoubleClick={() => onNavigate(`/segment/${segment.id}`)}
      onMouseEnter={() => onHover(segment.id)}
      onMouseLeave={() => onHover(null)}
    >
      <div className="flex items-center gap-2">
        {climbLabel && climbColor && (
          <span className={`px-1.5 py-0.5 text-[10px] font-bold rounded-[var(--r-sm)] ${climbColor}`}>
            {climbLabel}
          </span>
        )}
        <h3 className="font-semibold text-[length:var(--fs-sm)] truncate flex-1" style={{ color: "var(--ink-0)" }}>{segment.name}</h3>
      </div>
      {(segment.city || segment.state) && (
        <div className="text-[length:var(--fs-xs)] mt-0.5" style={{ color: "var(--ink-3)" }}>
          {[segment.city, segment.state].filter(Boolean).join(", ")}
        </div>
      )}
      <div className="flex gap-3 mt-1.5 text-[length:var(--fs-xs)]" style={{ fontFamily: "var(--font-mono)", color: "var(--ink-2)" }}>
        <span>{(segment.distance / 1000).toFixed(2)} km</span>
        <span>{segment.averageGrade.toFixed(1)}%</span>
        <span title={elevImplausible ? t("explore.elevImplausible", { raw: Math.round(elevGainRaw) }) : undefined}>
          ▲ {elevGain != null ? `${Math.round(elevGain)}m` : "—"}
        </span>
      </div>
    </div>
  );
});
