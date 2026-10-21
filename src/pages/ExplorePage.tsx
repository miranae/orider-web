import { SEARCH_PAGE_SIZE } from "../constants/pagination";
import InfoTip from "../components/InfoTip";
import { segmentMetric } from "../features/segments/segmentMetric";
import { Map as MapIcon, Mountain, MoveRight } from "lucide-react";
import SegmentSurface from "../features/segments/SegmentSurface";
import SegmentClimbCategory from "../features/segments/SegmentClimbCategory";
import GlossaryText from "../components/common/GlossaryText";
import { useState, useMemo, useEffect, useCallback, useRef, memo, type CSSProperties } from "react";
import { useLocation, useSearchParams } from "react-router-dom";
import { stripLangPrefix } from "../i18n/detector";
import { useTranslation } from "react-i18next";
import { useLocalizedNavigate as useNavigate } from "../hooks/useLocalizedNavigate";
import MapGL, { Source, Layer, Popup, useMap } from "react-map-gl/mapbox";
import HeatmapLayer, { type HeatMode } from "../components/explore/HeatmapLayer";
import PersonalHeatmapLayer from "../components/explore/PersonalHeatmapLayer";
import ExplorationGridLayer from "../components/explore/ExplorationGridLayer";
import type { LngLatBounds, MapMouseEvent } from "mapbox-gl";
import { logClientError } from "../services/errorLogger";
import { getMapboxToken, MAP_STYLE, DEFAULT_VIEW, applyKoreaCyclingStyle } from "../utils/mapbox";
import { decodePolyline } from "../utils/polyline";
import { isImplausibleSegmentElevation } from "../utils/activitySanity";
import { fetchStaticJson } from "../utils/staticJson";
import { segmentTileUrl } from "../utils/segmentTiles";
import { formatSegmentRegion } from "../utils/regionName";
import { ErrorState } from "../components/redesign";
import { Button, Card, Chip, Text, buttonClass, Input } from "../theme/components";
import { useMobile } from "../hooks/useMobile";
import { useAuth } from "../contexts/AuthContext";
import { usePersonalHeatmap } from "../hooks/usePersonalHeatmap";
import LeaderboardPage from "./LeaderboardPage";
import { LocalizedLink } from "../components/LocalizedLink";
import { useExplorationGrid } from "../hooks/useExplorationGrid";
import { ICON_SIZE } from "../theme/tokens/icon";

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
  discipline?: string;
  sport?: string;
  polyline?: string | null;
  segmentLatlng?: string | null;
  startLatlng?: [number, number] | null;
  endLatlng?: [number, number] | null;
}

type Category = "all" | "climb" | "flat";
type LatLngTuple = [number, number];

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
    discipline?: string;
    sport?: string;
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

const LIST_PAGE_SIZE = SEARCH_PAGE_SIZE;

// CATEGORIES will be populated from translation in component

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
  return <SegmentSurface><ExploreSegmentsContent /></SegmentSurface>;
}

function ExploreSegmentsContent() {
  const mapboxToken = getMapboxToken();
  const [mapFailed, setMapFailed] = useState(false);
  const { t } = useTranslation("segment");
  const navigate = useNavigate();
  const isMobile = useMobile();
  const location = useLocation();
  const isVisible = stripLangPrefix(location.pathname) === "/explore/segments";
  const [hasRendered, setHasRendered] = useState(isVisible);

  const CATEGORIES: { id: Category; label: string; icon: typeof MapIcon }[] = [
    { id: "all", label: t("category.all"), icon: MapIcon },
    { id: "climb", label: t("category.climb"), icon: Mountain },
    { id: "flat", label: t("category.flat"), icon: MoveRight },
  ];

  useEffect(() => {
    if (isVisible) setHasRendered(true);
  }, [isVisible]);

  const [allSegments, setAllSegments] = useState<SegmentData[]>(moduleCache.segments);
  const [loading, setLoading] = useState(moduleCache.segments.length === 0);
  const [overviewError, setOverviewError] = useState<unknown>(null);
  const [overviewReloadKey, setOverviewReloadKey] = useState(0);
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
  const { user } = useAuth();
  const personalHeatmap = usePersonalHeatmap(user?.uid, heatMode === "mine");
  useEffect(() => {
    if (!user && heatMode === "mine") setHeatMode("off");
  }, [heatMode, user]);
  // 탐험 그리드 토글(#363) — 히트맵 모드와 독립적으로 켜고 끌 수 있음
  const [showExplorationGrid, setShowExplorationGrid] = useState(false);
  const explorationGrid = useExplorationGrid(user?.uid, showExplorationGrid);
  useEffect(() => {
    if (!user && showExplorationGrid) setShowExplorationGrid(false);
  }, [showExplorationGrid, user]);
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
      setOverviewError(null);
      setLoading(false);
      return;
    }
    if (moduleCache.loading) return;
    moduleCache.loading = true;
    setOverviewError(null);

    fetchStaticJson<TileOverview>(segmentTileUrl(`overview.json?v=${Date.now()}`))
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
          discipline: s.discipline ?? s.sport ?? "bike",
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
        setOverviewError(err);
        setLoading(false);
      })
      .finally(() => {
        moduleCache.loading = false;
      });
     
  }, [overviewReloadKey]);

  // 지역 폴리라인 lazy 로드 (zoom >= 10)
  useEffect(() => {
    if (!mapBounds || mapZoom < 10) return;

    const visibleHashes = getVisibleGeohashes(mapBounds, 3);
    const toLoad = visibleHashes.filter(gh => !moduleCache.loadedRegions.has(gh));

    if (toLoad.length === 0) return;

    toLoad.forEach(gh => moduleCache.loadedRegions.add(gh));

    Promise.all(
      toLoad.map(gh =>
        fetchStaticJson<TileRegion>(segmentTileUrl(`regions/${gh}.json`))
          .catch(() => null)
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

  const [listTab, setListTab] = useState<"bounds" | "notable" | "challenged">("bounds");
  const [discipline, setDiscipline] = useState<"bike" | "run">("bike");

  const displaySegments = useMemo(() => {
    let filtered = allSegments.filter((s) => (s.discipline ?? s.sport ?? "bike") === discipline);

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
  }, [allSegments, category, searchQuery, discipline]);

  const visibleOnMap = useMemo(() => {
    if (!mapBounds || !mapboxToken || mapFailed) return displaySegments;
    return displaySegments.filter((s) => isInBounds(s, mapBounds, polylineCache.current));
  }, [displaySegments, mapBounds, mapboxToken, mapFailed]);

  // 리스트는 항상 현재 지도 뷰를 반영(#488) — 선택 시 frozen 시키던 동작 제거(드래그 후 새로
  // 보이는 세그먼트가 리스트에 안 뜨던 문제 해소). 검색 중엔 뷰 무관 전체 결과.
  const listSource = listTab === "notable" ? displaySegments.filter((s) => s.climbCategory >= 1).sort((a, b) => b.climbCategory - a.climbCategory || b.distance - a.distance || a.id.localeCompare(b.id)).slice(0, 4) : searchQuery ? displaySegments : visibleOnMap;
  const listSegments = useMemo(
    () => listSource.slice(0, listLimit),
    [listSource, listLimit],
  );
  const hasMoreList = listLimit < listSource.length;

  useEffect(() => {
    setListLimit(LIST_PAGE_SIZE);
  }, [category, searchQuery, mapBounds, listTab, discipline]);

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

  // 메뉴 검색과 브라우저 이동으로 바뀐 URL 조건도 반영한다.
  const serializedFiltersRef = useRef<string | null>(null);
  const urlQuery = sp.get("q") ?? "";
  const urlCategory = sp.get("cat") ?? "all";
  const urlSport = sp.get("sport") === "run" ? "run" : "bike";
  useEffect(() => {
    const filtersKey = JSON.stringify([urlQuery, urlCategory, urlSport]);
    if (serializedFiltersRef.current === filtersKey) {
      serializedFiltersRef.current = null;
      return;
    }
    serializedFiltersRef.current = null;
    setInputValue(urlQuery);
    setSearchQuery(urlQuery);
    setCategory(urlCategory === "climb" || urlCategory === "flat" ? urlCategory : "all");
    setDiscipline(urlSport);
    urlReadyRef.current = true;
  }, [urlQuery, urlCategory, urlSport]);

  // URL 상태 직렬화(#488) — 변경 시 디바운스로 q/cat/c/z 기록(replace, 히스토리 오염 방지).
  useEffect(() => {
    if (!urlReadyRef.current) return;
    const id = setTimeout(() => {
      serializedFiltersRef.current = JSON.stringify([searchQuery, category, discipline]);
      setSp(previous => {
        const next = new URLSearchParams(previous);
        if (searchQuery) next.set("q", searchQuery); else next.delete("q");
        if (category !== "all") next.set("cat", category); else next.delete("cat");
        next.set("sport", discipline);
        if (mapCenter) next.set("c", `${mapCenter.lng.toFixed(4)},${mapCenter.lat.toFixed(4)}`);
        if (mapZoom) next.set("z", mapZoom.toFixed(1));
        return next;
      }, { replace: true });
    }, 400);
    return () => clearTimeout(id);
  }, [searchQuery, category, discipline, mapCenter, mapZoom, setSp, urlQuery, urlCategory, urlSport]);

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

  if (!loading && overviewError) {
    return (
      <div className="flex flex-col -mx-4 -my-6 lg:h-[calc(100dvh-56px)]">
        <div className="flex-shrink-0 px-4 pb-4 space-y-4 bg-[var(--bg-1)] border-b border-[var(--line-soft)]">
          <div className="flex items-center justify-between pt-3 md:pt-6">
            <Text as="h1" variant="pageTitle" data-testid="E2-0">{t("title")}</Text>
          </div>
        </div>
        <div className="flex-1 flex items-center justify-center p-6">
          <ErrorState
            title={t("error.overviewLoadFailed")}
            description={t("error.overviewLoadFailedDesc")}
            onRetry={() => setOverviewReloadKey((key) => key + 1)}
          />
        </div>
      </div>
    );
  }

  return (
    // 모바일: 고정 높이 없이 자연 스크롤(짧은 지도 + 목록이 아래로 흐름) — 지도가 화면을 다 덮어
    // 순위/기록을 못 보던 문제 해결. 데스크톱(lg)만 풀 높이 분할 화면 유지.
    <div className="flex flex-col -mx-4 -my-6 lg:h-[calc(100dvh-56px)]">
      {/* 컨트롤 바 */}
      <div className="flex-shrink-0 px-4 pb-4 space-y-4 bg-[var(--bg-1)] border-b border-[var(--line-soft)]">
        <div className="flex items-center justify-between pt-3 md:pt-6">
          <div className="min-w-0">
            <Text as="h1" variant="pageTitle"><GlossaryText>{t("title")}</GlossaryText></Text>
            <p className="text-[var(--ink-2)] text-[length:var(--ft-body-size)] mt-1">
              {t("subtitle")}
            </p>
          </div>
          {user && <LocalizedLink data-testid="E2-0-1" className={buttonClass({ variant: "primary", size: "sm" })} to="/segment/create">{t("leaderboardPage.create")}</LocalizedLink>}
        </div>

        <div className="flex gap-2">{(["bike", "run"] as const).map((sport) => <Button key={sport} size="sm" variant={discipline === sport ? "primary" : "secondary"} className={discipline === sport ? "font-bold" : undefined} aria-pressed={discipline === sport} onClick={() => setDiscipline(sport)}>{t(`leaderboardPage.filter.${sport}`)}</Button>)}</div>
        <div className="flex flex-col sm:flex-row gap-3">
          <div className="relative flex-1">
            <button
              onClick={handleSearch}
              aria-label={t("search.action")}
              className={buttonClass({ variant: "ghost", className: "segment-search-action text-[var(--ink-3)] hover:text-[var(--lime)] transition-colors" })}
            >
              <svg className="w-4 h-4" fill="none" viewBox="0 0 24 24" stroke="currentColor">
                <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M21 21l-6-6m2-5a7 7 0 11-14 0 7 7 0 0114 0z" />
              </svg>
            </button>
            <Input data-testid="E2-2-1"
              type="text"
              aria-label={t("search.label")}
              placeholder={t("search.placeholder")}
              value={inputValue}
              onChange={(e) => setInputValue(e.target.value)}
              onKeyDown={handleKeyDown}
              className="segment-search-input w-full"
            />
          </div>
          <div className="flex flex-wrap gap-1">
            {CATEGORIES.map((cat) => (
              <button
                key={cat.id}
                onClick={() => setCategory(cat.id)}
                aria-pressed={category === cat.id}
                className={buttonClass({ variant: category === cat.id ? "primary" : "secondary", className: "inline-flex items-center justify-center gap-2 px-3 py-2 text-[length:var(--ft-body-size)] rounded-[var(--r-lg)] font-medium transition-colors whitespace-nowrap" })}
              >
                <cat.icon size={ICON_SIZE.md} aria-hidden="true" /> {cat.label}
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
          <div data-testid="E2-1" className="h-[55vh] lg:h-auto lg:flex-[2] relative">
            {/* 히트맵 토글 (#493) */}
            <div className="segment-map-tools absolute top-2 right-2 z-10 flex flex-col items-end gap-1">
              <div className="segment-heatmap-options flex gap-1">
              {(["off", "global", "recent30", ...(user ? ["mine" as const] : [])] as HeatMode[]).map((m) => (
                <button data-testid="E2-1-2"
                  key={m}
                  onClick={() => setHeatMode(m)}
                  aria-pressed={heatMode === m}
                  className={buttonClass({ variant: "ghost", className: "segment-map-option px-2 py-1 text-[length:var(--ft-body-size)] rounded-[var(--r-sm)] font-medium transition-colors" })}
                >
                  {t(`heat.${m}`)}
                </button>
              ))}
              </div>
              {heatMode === "mine" && user && (
                <div className="segment-map-note max-w-64 rounded-[var(--r-sm)] px-2 py-1 text-right text-[length:var(--ft-body-size)]">
                  {personalHeatmap.loading
                    ? t("heat.mineLoading")
                    : personalHeatmap.error
                      ? t("heat.mineError")
                      : t("heat.mineSummary", { count: personalHeatmap.points.length })}
                  <div className="text-[var(--ink-2)]">{t("heat.minePrivacy")}</div>
                </div>
              )}
              {/* 탐험 그리드 토글(#363) — 로그인 사용자만 노출 */}
              {user && (
                <button data-testid="E2-1-3"
                  onClick={() => setShowExplorationGrid((prev) => !prev)}
                  aria-pressed={showExplorationGrid}
                  className={buttonClass({ variant: "ghost", className: "segment-map-option px-2 py-1 text-[length:var(--ft-body-size)] rounded-[var(--r-sm)] font-medium transition-colors" })}
                >
                  {t("exploration.toggle")}
                </button>
              )}
              {showExplorationGrid && user && (
                <div className="segment-map-note max-w-64 rounded-[var(--r-sm)] px-2 py-1 text-right text-[length:var(--ft-body-size)]">
                  {explorationGrid.loading
                    ? t("exploration.loading")
                    : explorationGrid.error
                      ? t("exploration.error")
                      : (
                        <>
                          <div><InfoTip title={t("exploration.tileTitle")} content={t("exploration.tileExplanation")} label={t("exploration.tileCount", { count: explorationGrid.result.tileCount })}>{t("exploration.tileCount", { count: explorationGrid.result.tileCount })}</InfoTip></div>
                          <div><InfoTip title={t("exploration.squareTitle")} content={t("exploration.squareExplanation")} label={t("exploration.maxSquare", { size: explorationGrid.result.maxSquare })}>{t("exploration.maxSquare", { size: explorationGrid.result.maxSquare })}</InfoTip></div>
                        </>
                      )}
                  <div className="text-[var(--ink-2)]">{t("heat.minePrivacy")}</div>
                </div>
              )}
            </div>
            {!mapboxToken || mapFailed ? <ErrorState title={t("explore.mapUnavailable")} onRetry={mapboxToken ? () => setMapFailed(false) : undefined} /> : <div data-testid="E2-1-1" className="h-full"><MapGL
              mapboxAccessToken={mapboxToken}
              mapStyle={MAP_STYLE}
              initialViewState={initialView}
              onLoad={(e) => { applyKoreaCyclingStyle(e.target); handleMoveEnd(e); }}
              onError={(event) => { logClientError("ExplorePage.map", event.error); setMapFailed(true); }}
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
              <FlyToSegment segmentId={selectedId} polylineCache={polylineCache.current} segments={allSegments} />

              {/* 발견 히트맵 — 세그먼트 아래 렌더(#493) */}
              <HeatmapLayer mode={heatMode} />
              {heatMode === "mine" && user && <PersonalHeatmapLayer points={personalHeatmap.points} />}
              {showExplorationGrid && user && <ExplorationGridLayer tiles={explorationGrid.result.tiles} />}

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
                  <div style={{ color: "var(--ink-0)", fontSize: "var(--fs-xs)" }}>
                    <div style={{ fontWeight: 600 }}>{tooltipInfo.name}</div>
                    <div style={{ color: "var(--ink-3)" }}>
                      {t("distance")} {segmentMetric(tooltipInfo.distance, 2, 1000)} km · {t("averageGrade")} {segmentMetric(tooltipInfo.grade, 1)} %
                    </div>
                  </div>
                </Popup>
              )}
            </MapGL></div>}
          </div>

          {/* 목록 */}
          <div data-testid="E2-2" className="flex-1 lg:flex-[1] lg:max-w-md overflow-y-auto border-t lg:border-t-0 lg:border-l border-[var(--line-soft)] bg-[var(--bg-0)]">
            {/* 모바일: 좌우 패딩 제거해 카드를 화면 전폭으로. lg에서는 p-3 유지 */}
            <div data-testid={listTab === "bounds" ? undefined : "E2-3"} className={isMobile ? "pt-3 pb-3" : "p-3"}>
              <div className="flex flex-wrap gap-2 mb-3">{(["bounds", "notable", "challenged"] as const).map((tab) => <Button key={tab} variant={listTab === tab ? "primary" : "secondary"} size="sm" className={listTab === tab ? "font-bold" : undefined} aria-pressed={listTab === tab} onClick={() => setListTab(tab)}>{t(`explore.listTab.${tab}`)}</Button>)}</div>
              {listTab === "challenged" ? <LeaderboardPage search={searchQuery} discipline={discipline} category={category} /> : <>
              {/* 선택된 세그먼트 상세 패널 */}
              {selectedId && (() => {
                const sel = allSegments.find((s) => s.id === selectedId);
                if (!sel) return null;
                const distKm = segmentMetric(sel.distance, 2, 1000);
                const elevGainRawSel = Math.max(0, sel.elevationHigh - sel.elevationLow);
                const elevImplausibleSel = isImplausibleSegmentElevation({
                  elevHigh: sel.elevationHigh,
                  elevLow: sel.elevationLow,
                  distanceM: sel.distance,
                  avgGrade: sel.averageGrade,
                });
                const elevGain = elevImplausibleSel ? null : elevGainRawSel;
                // 모바일: 전폭 카드 (외부 컨테이너 패딩 없으므로 추가 음수마진 불필요)
                const selectedCardStyle: CSSProperties = isMobile
                  ? { padding: 0, overflow: "hidden", borderRadius: 0, borderLeft: "none", borderRight: "none", marginBottom: "var(--space-3)" }
                  : { padding: 0, overflow: "hidden", borderRadius: "var(--r-md)", marginBottom: "var(--space-3)" };
                return (
                  <Card padding="none" className="mb-3" style={selectedCardStyle}>
                    <div style={{ padding: "14px 16px", borderBottom: "1px solid var(--line-soft)" }}>
                      <div className="flex items-center gap-2 mb-1 flex-wrap">
                        <SegmentClimbCategory category={sel.climbCategory} />
                        <Chip style={{ fontSize: "var(--ft-body-size)", padding: "var(--space-1) var(--space-2)" }}>{distKm} km</Chip>
                        <Chip style={{ fontSize: "var(--ft-body-size)", padding: "var(--space-1) var(--space-2)" }}>{t("explore.avgGradeChip", { grade: segmentMetric(sel.averageGrade, 1) })}</Chip>
                      </div>
                      <h2 className="text-[length:var(--fs-lg)] font-bold" style={{ color: "var(--ink-0)" }}>{sel.name}</h2>
                      {(sel.city || sel.state) && (
                        <div className="text-[length:var(--ft-body-size)] mt-1" style={{ color: "var(--ink-3)" }}>
                          {[sel.city, sel.state].filter(Boolean).join(", ")}
                        </div>
                      )}
                    </div>
                    <div className="grid grid-cols-2 sm:grid-cols-4" style={{
                      gap: 1,
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
                        [t("averageGrade"), segmentMetric(sel.averageGrade, 1), "%", undefined],
                        [t("maxGrade"), segmentMetric(sel.maximumGrade, 1), "%", undefined],
                      ] as [string, string, string, string | undefined][]).map(([k, v, u, title]) => (
                        <div key={k} title={title} style={{ padding: "10px 8px", background: "var(--bg-1)" }}>
                          <Text as="div" variant="eyebrow" style={{ marginBottom: 'var(--space-1)', fontSize: "var(--ft-body-size)" }}><GlossaryText>{k}</GlossaryText></Text>
                          <div>
                            <Text variant="dataMedium" style={{ fontSize: "var(--ft-body-size)" }}>{v}</Text>
                            <Text variant="unit">{u}</Text>
                          </div>
                        </div>
                      ))}
                    </div>
                    <div style={{ padding: "10px 16px", display: "flex", gap: 'var(--space-2)' }}>
                      <Button
                        data-testid="E2-2-2" onClick={() => navigate(`/segment/${sel.id}`)} variant="primary" size="sm"
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
                <div className="text-center py-12 text-[length:var(--ft-body-size)]" style={{ color: "var(--ink-3)" }}>
                  {searchQuery
                    ? t("empty.noResults")
                    : allSegments.length === 0
                      ? t("empty.noSegments")
                      : t("empty.noSegmentsInArea")}
                </div>
              ) : (
                <div data-testid="E2-3-1" className={isMobile ? "space-y-0" : "space-y-2"}>
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
                        className={buttonClass({ variant: "ghost", className: "px-6 py-2.5 bg-[var(--bg-2)] border border-[var(--line)] rounded-[var(--r-lg)] text-[length:var(--ft-body-size)] font-medium text-[var(--ink-1)] hover:bg-[var(--bg-3)] transition-colors" })}
                      >
                        {t("explore.loadMore", { remaining: listSource.length - listLimit })}
                      </button>
                    </div>
                  )}
                </div>
              )}
            </>}
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
  const { t, i18n } = useTranslation("segment");
  const elevGainRaw = Math.max(0, segment.elevationHigh - segment.elevationLow);
  // 비현실 획득고도 가드 (activitySanity 공통 헬퍼). corrupt 한 8623m 등을 "—" 로 가린다.
  const elevImplausible = isImplausibleSegmentElevation({
    elevHigh: segment.elevationHigh,
    elevLow: segment.elevationLow,
    distanceM: segment.distance,
    avgGrade: segment.averageGrade,
  });
  const elevGain = elevImplausible ? null : elevGainRaw;
  const highlighted = isHovered || isSelected;
  const regionLabel = formatSegmentRegion(segment.city, segment.state, i18n.language);

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
      data-testid="E2-2-2" onClick={() => onSelect(segment.id)}
      onDoubleClick={() => onNavigate(`/segment/${segment.id}`)}
      onMouseEnter={() => onHover(segment.id)}
      onMouseLeave={() => onHover(null)}
    >
      <div className="flex items-center gap-2">
        <SegmentClimbCategory category={segment.climbCategory} />
        <h3 className="font-semibold text-[length:var(--ft-body-size)] truncate flex-1" style={{ color: "var(--ink-0)" }}>
          <button type="button" className={buttonClass({ variant: "ghost", className: "w-full truncate text-left rounded-[var(--r-sm)] focus-visible:outline focus-visible:outline-2 focus-visible:outline-[var(--lime)]" })} aria-pressed={isSelected}
            onClick={event => { event.stopPropagation(); onSelect(segment.id); }}>{segment.name}</button>
        </h3>
      </div>
      {regionLabel && (
        <div className="text-[length:var(--ft-body-size)] mt-0.5" style={{ color: "var(--ink-3)" }}>
          {regionLabel}
        </div>
      )}
      <dl className="segment-list-metrics">
        <div><dt>{t("distance")}</dt><dd>{Number.isFinite(segment.distance) ? `${segmentMetric(segment.distance, 2, 1000)} km` : "—"}</dd></div>
        <div><dt><GlossaryText>{t("averageGrade")}</GlossaryText></dt><dd>{Number.isFinite(segment.averageGrade) ? `${segmentMetric(segment.averageGrade, 1)} %` : "—"}</dd></div>
        <div><dt><GlossaryText>{t("elevationGain")}</GlossaryText></dt><dd>{elevGain != null && Number.isFinite(elevGain) ? `${Math.round(elevGain)} m` : "—"}</dd></div>
      </dl>
    </div>
  );
});
