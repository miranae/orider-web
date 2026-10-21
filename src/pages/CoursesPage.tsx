import { SEARCH_PAGE_SIZE, usePagedSearch } from "../hooks/usePagedSearch";
import "../features/courses/course-review.css";
import React, { useState, useEffect, useMemo, useRef, useCallback } from "react";
import { useLocation, useSearchParams } from "react-router-dom";
import { stripLangPrefix } from "../i18n/detector";
import { useTranslation } from "react-i18next";
import { LocalizedLink as Link } from "../components/LocalizedLink";
import { useLocalizedNavigate as useNavigate } from "../hooks/useLocalizedNavigate";
import type { LngLatBounds } from "mapbox-gl";
import { logClientError } from "../services/errorLogger";
import { useAuth } from "../contexts/AuthContext";
import { getMapboxToken } from "../utils/mapbox";
import { ChevronDown } from "lucide-react";
import { ErrorState, LoadingSkeleton } from "../components/redesign";
import { Button, buttonClass, Chip, Text, Input } from "../theme/components";
import { ICON_SIZE } from "../theme/tokens/icon";
import { CourseList } from "../features/courses/CourseList";
import { CoursesMap, isCourseInBounds } from "../features/courses/CoursesMap";
import { filterAndSortCourses, type SortMode, type SurfaceFilter } from "../features/courses/courseCatalog";
import type { CourseData, LatLngTuple } from "../features/courses/courseSnapshot";
import ChallengeFeed from "../components/discover/ChallengeFeed";
import CourseSegmentSearch from "../components/discover/CourseSegmentSearch";
import { searchVisibleCoursesPage, useCourseCatalog } from "../features/courses/useCourseCatalog";

const COURSES_CONTROL_STACK_STYLE: React.CSSProperties = {
  display: "flex",
  flexDirection: "column",
  gap: "var(--space-4)",
  padding: "var(--space-6) var(--space-4) var(--space-4)",
  background: "var(--bg-0)",
  borderBottom: "1px solid var(--line-soft)",
};

const COURSES_FILTER_ROW_STYLE: React.CSSProperties = {
  display: "flex",
  alignItems: "center",
  columnGap: "var(--space-4)",
  rowGap: "var(--space-2)",
  marginTop: "var(--space-2)",
  paddingInlineEnd: "var(--space-8)",
  scrollPaddingInline: "var(--space-4)",
};

const COURSES_FILTER_GROUP_STYLE: React.CSSProperties = {
  display: "flex",
  alignItems: "center",
  gap: "var(--space-2)",
};

const DISTANCE_FILTER_MAX_KM = 200;
const ELEVATION_FILTER_MAX_M = 3000;

export default function CoursesPage() {
  const mapboxToken = getMapboxToken();
  const { t } = useTranslation("course");
  const { user } = useAuth();
  const navigate = useNavigate();
  const location = useLocation();
  const [searchParams, setSearchParams] = useSearchParams();
  const queryParam = searchParams.get("q")?.trim() ?? "";
  const surfaceParam = searchParams.get("surface") ?? "";
  const difficultyParam = searchParams.get("difficulty") ?? "";
  const isVisible = stripLangPrefix(location.pathname) === "/explore/courses";
  const [hasRendered, setHasRendered] = useState(isVisible);

  useEffect(() => {
    if (isVisible) setHasRendered(true);
  }, [isVisible]);

  const mineOnly = !!user && searchParams.get("mine") === "1";
  const [mobileFiltersOpen, setMobileFiltersOpen] = useState(false);
  const [sortMode, setSortMode] = useState<SortMode>("latest");
  const {
    courses: allCourses,
    loading,
    loadingMore,
    error: loadError,
    hasMore,
    loadMore,
    retry,
    polylineCache,
  } = useCourseCatalog(sortMode, mineOnly ? user?.uid : undefined, SEARCH_PAGE_SIZE, !queryParam);
  const [surfaceFilter, setSurfaceFilter] = useState<SurfaceFilter>("");
  const [difficultyFilter, setDifficultyFilter] = useState<number | null>(null);
  const [distanceMinKm, setDistanceMinKm] = useState(0);
  const [distanceMaxKm, setDistanceMaxKm] = useState(DISTANCE_FILTER_MAX_KM);
  const [elevationMinM, setElevationMinM] = useState(0);
  const [elevationMaxM, setElevationMaxM] = useState(ELEVATION_FILTER_MAX_M);
  const [regionFilter, setRegionFilter] = useState("");
  // 위치+반경 필터(#495) — 내 주변 코스. geolocation 1회 취득 후 km 반경 클라 필터.
  const [myLoc, setMyLoc] = useState<{ lat: number; lng: number } | null>(null);
  const [radiusKm, setRadiusKm] = useState<number | null>(null);
  const [locating, setLocating] = useState(false);
  const [searchQuery, setSearchQuery] = useState(queryParam);
  const [inputValue, setInputValue] = useState(queryParam);
  const [hoveredId, setHoveredId] = useState<string | null>(null);
  const [selectedId, setSelectedId] = useState<string | null>(null);
  const [mapBounds, setMapBounds] = useState<LngLatBounds | null>(null);
  const [mapFailed, setMapFailed] = useState(false);
  const [locationError, setLocationError] = useState("");
  const [mobileMapOpen, setMobileMapOpen] = useState(false);
  const cardRefs = useRef<Map<string, HTMLDivElement>>(new Map());
  const searchPolylineCache = useRef<Map<string, LatLngTuple[]>>(new Map());
  const searchPolylineValueCache = useRef<Map<string, string>>(new Map());
  const mapUnavailable = !mapboxToken || mapFailed;

  useEffect(() => {
    setSearchQuery(queryParam);
    setInputValue(queryParam);
    setSelectedId(null);
    setHoveredId(null);
  }, [queryParam]);
  useEffect(() => {
    setSurfaceFilter(["paved", "gravel", "mixed"].includes(surfaceParam) ? surfaceParam as SurfaceFilter : "");
  }, [surfaceParam]);
  useEffect(() => {
    setDifficultyFilter(/^[1-5]$/.test(difficultyParam) ? Number(difficultyParam) : null);
  }, [difficultyParam]);

  const updateRouteFilter = (key: string, value: string) => {
    const next = new URLSearchParams(searchParams);
    if (value) next.set(key, value); else next.delete(key);
    setSearchParams(next, { replace: true });
  };

  const serverSearch = usePagedSearch(
    searchQuery.trim() ? JSON.stringify([searchQuery.trim(), mineOnly, user?.uid]) : null,
    (cursor: import("firebase/firestore").QueryDocumentSnapshot<import("firebase/firestore").DocumentData> | null) =>
      searchVisibleCoursesPage(searchQuery, SEARCH_PAGE_SIZE, searchPolylineCache.current, searchPolylineValueCache.current, mineOnly ? user?.uid : undefined, cursor),
  );
  const { items: serverSearchCourses, loading: serverSearchLoading, error: serverSearchError } = serverSearch;

  const activeCourses = searchQuery ? serverSearchCourses : allCourses;
  const activePolylineCache = searchQuery ? searchPolylineCache : polylineCache;

  const displayCourses = useMemo(() => {
    return filterAndSortCourses(activeCourses, {
      searchQuery,
      sortMode,
      surfaceFilter,
      difficultyFilter,
      distanceMinKm: distanceMinKm > 0 ? distanceMinKm : null,
      distanceMaxKm: distanceMaxKm < DISTANCE_FILTER_MAX_KM ? distanceMaxKm : null,
      elevationMinM: elevationMinM > 0 ? elevationMinM : null,
      elevationMaxM: elevationMaxM < ELEVATION_FILTER_MAX_M ? elevationMaxM : null,
      regionFilter,
      myLoc,
      radiusKm,
    });
  }, [activeCourses, searchQuery, sortMode, surfaceFilter, difficultyFilter, distanceMinKm, distanceMaxKm, elevationMinM, elevationMaxM, regionFilter, myLoc, radiusKm]);

  const regionOptions = useMemo(() => {
    return Array.from(new Set(activeCourses.flatMap((course) => course.regions))).filter(Boolean).sort((a, b) => a.localeCompare(b));
  }, [activeCourses]);

  const activeFilterCount = [
    surfaceFilter !== "", difficultyFilter !== null,
    distanceMinKm > 0 || distanceMaxKm < DISTANCE_FILTER_MAX_KM,
    elevationMinM > 0 || elevationMaxM < ELEVATION_FILTER_MAX_M,
    regionFilter !== "", myLoc != null && radiusKm != null,
  ].filter(Boolean).length;
  const resetFilters = () => {
    setSurfaceFilter(""); setDifficultyFilter(null);
    const next = new URLSearchParams(searchParams);
    next.delete("surface"); next.delete("difficulty");
    setSearchParams(next, { replace: true });
    setDistanceMinKm(0); setDistanceMaxKm(DISTANCE_FILTER_MAX_KM);
    setElevationMinM(0); setElevationMaxM(ELEVATION_FILTER_MAX_M);
    setRegionFilter(""); setRadiusKm(null);
  };

  const visibleOnMap = useMemo(() => {
    if (mapUnavailable) return displayCourses;
    if (!mapBounds) return displayCourses;
    return displayCourses.filter((c) => isCourseInBounds(c, mapBounds, activePolylineCache.current));
  }, [activePolylineCache, displayCourses, mapBounds, mapUnavailable]);

  const [frozenList, setFrozenList] = useState<CourseData[] | null>(null);

  useEffect(() => {
    if (selectedId) {
      if (!frozenList) setFrozenList(visibleOnMap);
    } else {
      setFrozenList(null);
    }
  }, [selectedId, visibleOnMap, frozenList]);

  const listCourses = searchQuery ? displayCourses : (frozenList || visibleOnMap);

  const handleSelectCourse = useCallback((id: string) => {
    setSelectedId((prev) => (prev === id ? null : id));
    setHoveredId(id);
  }, []);

  const handleMapSelectCourse = useCallback((id: string) => {
    setSelectedId(id);
    setHoveredId(id);
  }, []);

  const handleClearSelection = useCallback(() => {
    setSelectedId(null);
    setHoveredId(null);
  }, []);

  const handleSearch = () => {
    const nextQuery = inputValue.trim();
    setSearchQuery(nextQuery);
    setSelectedId(null);
    setHoveredId(null);

    const nextParams = new URLSearchParams(searchParams);
    if (nextQuery) nextParams.set("q", nextQuery);
    else nextParams.delete("q");
    setSearchParams(nextParams, { replace: true });
  };
  useEffect(() => {
    if (inputValue.trim() === queryParam) return;
    const timer = setTimeout(() => {
      const next = new URLSearchParams(searchParams);
      const q = inputValue.trim();
      if (q) next.set("q", q); else next.delete("q");
      setSearchParams(next, { replace: true });
    }, 250);
    return () => clearTimeout(timer);
  }, [inputValue, queryParam, searchParams, setSearchParams]);
  const handleKeyDown = (e: React.KeyboardEvent) => {
    if (e.key === "Enter") handleSearch();
  };

  const scrollToCard = useCallback((id: string) => {
    const el = cardRefs.current.get(id);
    if (el) {
      el.scrollIntoView({ behavior: "smooth", block: "nearest" });
      setHoveredId(id);
    }
  }, []);

  const handleOpenCourse = useCallback((id: string) => {
    navigate(`/course/${id}`);
  }, [navigate]);

  const handleMapInteraction = useCallback(() => {
    setSelectedId(null);
    setHoveredId(null);
  }, []);

  const handleMapFailed = useCallback((error: unknown, context?: Record<string, unknown>) => {
    logClientError("CoursesPage.map", error, context);
    setMapFailed(true);
  }, []);

  const handleRetryMap = useCallback(() => {
    setMapFailed(false);
    setMapBounds(null);
  }, []);

  const selectedCourse = useMemo(
    () => activeCourses.find((course) => course.id === selectedId) ?? null,
    [activeCourses, selectedId],
  );
  const activeLoadError = searchQuery ? serverSearchError : loadError;
  const activeLoading = searchQuery ? serverSearchLoading : loading;

  if (!hasRendered) return null;

  return (
    <div className="course-catalog flex flex-col -mx-4 -my-6" style={{ height: "calc(100dvh - 56px)" }}>
      {/* 컨트롤 바 */}
      <div className="flex-shrink-0" style={COURSES_CONTROL_STACK_STYLE}>
        <div className="flex flex-wrap items-center justify-between gap-3">
          <div className="min-w-0">
            <Text data-testid="E1-0" as="h1" variant="pageTitle">{t("title")}</Text>
            <p className="text-[length:var(--fs-sm)]" style={{ color: "var(--ink-3)", marginTop: "var(--space-1)" }}>
              {t("subtitle")}
            </p>
          </div>
          {user ? (
            <span data-testid="E1-5"><Link data-testid="E1-5-1" to="/course/create" className={`${buttonClass({ variant: 'primary', className: 'whitespace-nowrap' })}`}>
              {t("button.create")}
            </Link></span>
          ) : (
            <Link data-testid="E1-5-2" to="/tools/virtual-power" className={`${buttonClass({ variant: 'secondary', className: 'whitespace-nowrap' })}`}>
              {t("guest.compareCta", { defaultValue: "이 코스 내 기록과 비교하기" })}
            </Link>
          )}
        </div>

        <div className="course-catalog-search flex flex-col sm:flex-row" style={{ gap: "var(--space-3)" }}>
          <div data-testid="E1-1" className="relative flex-1">
            <button
              aria-label={t("search.submit")}
              onClick={handleSearch}
              className={buttonClass({ variant: "ghost", className: "course-search-action transition-colors" })}
              style={{ color: "var(--ink-3)" }}
            >
              <svg width={ICON_SIZE.md} height={ICON_SIZE.md} fill="none" viewBox="0 0 24 24" stroke="currentColor">
                <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M21 21l-6-6m2-5a7 7 0 11-14 0 7 7 0 0114 0z" />
              </svg>
            </button>
            <Input data-testid="E1-1-1"
              type="text"
              aria-label={t("search.placeholder")}
              placeholder={t("search.placeholder")}
              value={inputValue}
              onChange={(e) => setInputValue(e.target.value)}
              onKeyDown={handleKeyDown}
              className="course-search-input w-full"

            />
          </div>
          <div className="course-catalog-actions flex" style={{ gap: "var(--space-2)" }}>
            {/* 정렬·범위는 HIG 필터 칩(G2) — 동작 버튼(새 코스·지도 보기)과 모양을 구분한다 */}
            {user && <Chip data-testid="E1-3-7" selectable selected={mineOnly} className="whitespace-nowrap" onClick={() => { const next = new URLSearchParams(searchParams); if (mineOnly) next.delete("mine"); else next.set("mine", "1"); setSearchParams(next); }}>{t("myCourses")}</Chip>}

            {([
              { id: "latest" as SortMode, label: t("sort.latest") },
              { id: "popular" as SortMode, label: t("sort.popular") },
            ]).map((s) => (
              <Chip data-testid="E1-3-5"
                key={s.id}
                selectable selected={sortMode === s.id} onClick={() => setSortMode(s.id)} className="whitespace-nowrap"
              >
                {s.label}
              </Chip>
            ))}
          </div>
        </div>

        {/* 노면/난이도 다축 필터(#489) + 거리/고도/지역 탐색 필터(#243) */}
        <div className="course-catalog-filter-toolbar">
          <Chip selectable aria-expanded={mobileFiltersOpen} aria-controls="course-catalog-filter-controls" onClick={() => setMobileFiltersOpen(open => !open)}>{t("filter.conditions", { count: activeFilterCount })}<ChevronDown aria-hidden="true" size={ICON_SIZE.sm} /></Chip>
          {activeFilterCount > 0 && <Button data-testid="course-mobile-reset" variant="secondary" size="sm" onClick={resetFilters}>{t("filter.reset")}</Button>}
        </div>
        <div id="course-catalog-filter-controls" data-collapsed={!mobileFiltersOpen} data-testid="E1-3" className="course-catalog-filters" style={COURSES_FILTER_ROW_STYLE}>
          <div className="flex shrink-0 items-center" style={COURSES_FILTER_GROUP_STYLE}>
            <span className="text-[length:var(--fs-xs)]" style={{ color: "var(--ink-3)" }}>{t("edit.surface")}</span>
            {([
              { v: "" as const, label: t("filter.all") },
              { v: "paved" as const, label: t("edit.surface.paved") },
              { v: "gravel" as const, label: t("edit.surface.gravel") },
              { v: "mixed" as const, label: t("edit.surface.mixed") },
            ]).map((o) => {
              const active = surfaceFilter === o.v;
              return (
                <Chip data-testid="E1-3-1" key={o.v || "all"} selectable selected={active} onClick={() => updateRouteFilter("surface", o.v)}>
                  {o.label}
                </Chip>
              );
            })}
          </div>
          <div className="flex shrink-0 items-center" style={COURSES_FILTER_GROUP_STYLE}>
            <span className="text-[length:var(--fs-xs)]" style={{ color: "var(--ink-3)" }}>{t("filter.distance")}</span>
            <label className="flex items-center" style={{ gap: "var(--space-1)" }}>
              <span className="text-[length:var(--fs-xs)]" style={{ color: "var(--ink-3)" }}>{t("filter.min")}</span>
              <input data-testid="E1-3-2"
                type="range"
                min={0}
                max={DISTANCE_FILTER_MAX_KM}
                step={5}
                value={distanceMinKm}
                onChange={(e) => setDistanceMinKm(Math.min(Number(e.target.value), distanceMaxKm))}
                aria-label={t("filter.distanceMin")}
              />
              <span className="text-[length:var(--fs-xs)] tabular-nums" style={{ color: "var(--ink-2)", minWidth: "3.5rem" }}>
                {t("filter.kmValue", { value: distanceMinKm })}
              </span>
            </label>
            <label className="flex items-center" style={{ gap: "var(--space-1)" }}>
              <span className="text-[length:var(--fs-xs)]" style={{ color: "var(--ink-3)" }}>{t("filter.max")}</span>
              <input
                type="range"
                min={0}
                max={DISTANCE_FILTER_MAX_KM}
                step={5}
                value={distanceMaxKm}
                onChange={(e) => setDistanceMaxKm(Math.max(Number(e.target.value), distanceMinKm))}
                aria-label={t("filter.distanceMax")}
              />
              <span className="text-[length:var(--fs-xs)] tabular-nums" style={{ color: "var(--ink-2)", minWidth: "3.5rem" }}>
                {distanceMaxKm >= DISTANCE_FILTER_MAX_KM ? t("filter.kmValuePlus", { value: DISTANCE_FILTER_MAX_KM }) : t("filter.kmValue", { value: distanceMaxKm })}
              </span>
            </label>
          </div>
          <div className="flex shrink-0 items-center" style={COURSES_FILTER_GROUP_STYLE}>
            <span className="text-[length:var(--fs-xs)]" style={{ color: "var(--ink-3)" }}>{t("filter.elevation")}</span>
            <label className="flex items-center" style={{ gap: "var(--space-1)" }}>
              <span className="text-[length:var(--fs-xs)]" style={{ color: "var(--ink-3)" }}>{t("filter.min")}</span>
              <input
                type="range"
                min={0}
                max={ELEVATION_FILTER_MAX_M}
                step={100}
                value={elevationMinM}
                onChange={(e) => setElevationMinM(Math.min(Number(e.target.value), elevationMaxM))}
                aria-label={t("filter.elevationMin")}
              />
              <span className="text-[length:var(--fs-xs)] tabular-nums" style={{ color: "var(--ink-2)", minWidth: "3.75rem" }}>
                {t("filter.mValue", { value: elevationMinM })}
              </span>
            </label>
            <label className="flex items-center" style={{ gap: "var(--space-1)" }}>
              <span className="text-[length:var(--fs-xs)]" style={{ color: "var(--ink-3)" }}>{t("filter.max")}</span>
              <input
                type="range"
                min={0}
                max={ELEVATION_FILTER_MAX_M}
                step={100}
                value={elevationMaxM}
                onChange={(e) => setElevationMaxM(Math.max(Number(e.target.value), elevationMinM))}
                aria-label={t("filter.elevationMax")}
              />
              <span className="text-[length:var(--fs-xs)] tabular-nums" style={{ color: "var(--ink-2)", minWidth: "3.75rem" }}>
                {elevationMaxM >= ELEVATION_FILTER_MAX_M ? t("filter.mValuePlus", { value: ELEVATION_FILTER_MAX_M }) : t("filter.mValue", { value: elevationMaxM })}
              </span>
            </label>
          </div>
          {regionOptions.length > 0 && (
            <div className="flex shrink-0 items-center" style={COURSES_FILTER_GROUP_STYLE}>
              <span className="text-[length:var(--fs-xs)]" style={{ color: "var(--ink-3)" }}>{t("filter.region")}</span>
              <Chip data-testid="E1-3-3" onClick={() => setRegionFilter("")} selectable selected={!regionFilter}>
                {t("filter.all")}
              </Chip>
              {regionOptions.slice(0, 12).map((region) => {
                const active = regionFilter === region;
                return (
                  <Chip key={region} onClick={() => setRegionFilter(active ? "" : region)} selectable selected={active}>
                    {region}
                  </Chip>
                );
              })}
            </div>
          )}
          {activeFilterCount > 0 && (
            <Button data-testid="E1-3-6"
              type="button"
              variant="secondary"
              size="sm"
              onClick={resetFilters}
              className="course-filter-reset-desktop shrink-0"
            >
              {t("filter.reset")}
            </Button>
          )}
          <div className="flex shrink-0 items-center" style={COURSES_FILTER_GROUP_STYLE}>
            <span className="text-[length:var(--fs-xs)]" style={{ color: "var(--ink-3)" }}>{t("filter.nearMe")}</span>
            {([10, 20, 50] as const).map((km) => {
              const active = myLoc != null && radiusKm === km;
              return (
                <Chip data-testid="E1-3-4" key={km} aria-disabled={locating}
                  onClick={() => {
                    if (locating) return; // 위치 확인 중 — 권한 창 응답 전 중복 요청 방지
                    if (active) { setRadiusKm(null); return; }
                    if (myLoc) { setRadiusKm(km); return; }
                    setLocating(true);
                    setLocationError("");
                    navigator.geolocation.getCurrentPosition(
                      (pos) => { setMyLoc({ lat: pos.coords.latitude, lng: pos.coords.longitude }); setRadiusKm(km); setLocating(false); },
                      (err) => {
                        logClientError("CoursesPage.geolocation", err, {});
                        setLocationError(t("error.locationFailed"));
                        setLocating(false);
                      },
                      { timeout: 8000, maximumAge: 300000 },
                    );
                  }} selectable selected={active}>
                  {t("filter.radiusKm", { km })}
                </Chip>
              );
            })}
          </div>
          <div className="flex shrink-0 items-center" style={COURSES_FILTER_GROUP_STYLE}>
            <span className="text-[length:var(--fs-xs)]" style={{ color: "var(--ink-3)" }}>{t("difficulty")}</span>
            <Chip onClick={() => updateRouteFilter("difficulty", "")} selectable selected={difficultyFilter == null}>
              {t("filter.all")}
            </Chip>
            {[1, 2, 3, 4, 5].map((n) => {
              const active = difficultyFilter === n;
              return (
                <Chip key={n} onClick={() => updateRouteFilter("difficulty", active ? "" : String(n))} selectable selected={active}>
                  {n}
                </Chip>
              );
            })}
          </div>
        </div>
        {locationError && (
          <div className="text-[length:var(--fs-xs)]" role="status" style={{ color: "var(--rose)" }}>
            {locationError}
          </div>
        )}
        {!mapUnavailable && (
          <div className="lg:hidden">
            <Button data-testid="E1-4-1"
              type="button"
              variant="secondary"
              onClick={() => setMobileMapOpen((open) => !open)}
              className="w-full justify-center"
              aria-expanded={mobileMapOpen}
            >
              {mobileMapOpen ? t("map.hideMobileMap") : t("map.showMobileMap")}
            </Button>
          </div>
        )}
      </div>

      {/* 메인: 지도 + 목록 */}
      {activeLoadError ? (
        <div className="flex-1 flex items-center justify-center" style={{ background: "var(--bg-0)", padding: "var(--space-6)" }}>
          <ErrorState title={t("error.loadFailed")} onRetry={searchQuery ? serverSearch.retry : retry} />
        </div>
      ) : activeLoading ? (
        // 스피너만 있는 빈 화면 대신 목록 모양 스켈레톤(E4)
        <div className="flex-1 overflow-hidden" style={{ background: "var(--bg-0)", padding: "var(--space-4)" }}>
          <LoadingSkeleton kind="list" />
        </div>
      ) : (
        <div data-testid="E1-4" className={mapUnavailable ? "flex-1 flex flex-col min-h-0" : "flex-1 flex flex-col lg:flex-row min-h-0"} style={{ background: "var(--bg-0)" }}>
          {!mapUnavailable && (
            <CoursesMap
              allCourses={activeCourses}
              visibleCourses={visibleOnMap}
              polylineCache={activePolylineCache.current}
              selectedId={selectedId}
              hoveredId={hoveredId}
              onBoundsChange={setMapBounds}
              onMapInteraction={handleMapInteraction}
              onHoverCourse={setHoveredId}
              onScrollToCourse={scrollToCard}
              onSelectCourse={handleMapSelectCourse}
              onClearSelection={handleClearSelection}
              onOpenCourse={handleOpenCourse}
              onMapFailed={handleMapFailed}
              className={mobileMapOpen ? "h-56 lg:h-auto lg:flex-[2] relative" : "hidden lg:block lg:h-auto lg:flex-[2] relative"}
            />
          )}

          <div className={mapUnavailable ? "flex-1 overflow-y-auto" : "flex-1 lg:flex-[1] lg:max-w-md overflow-y-auto"} style={{ borderTop: "1px solid var(--line-soft)", background: "var(--bg-0)" }}>
            {searchQuery ? <CourseSegmentSearch query={searchQuery} /> : !mineOnly && <details className="course-popular p-3"><summary>{t("recommendations")}</summary><ChallengeFeed part="courses" /></details>}
            <CourseList
              courses={listCourses}
              allCourseCount={activeCourses.length}
              filtersActive={activeFilterCount > 0}
              onResetFilters={resetFilters}
              selectedCourse={selectedCourse}
              selectedId={selectedId}
              hoveredId={hoveredId}
              searchQuery={searchQuery}
              cardRefs={cardRefs}
              mapUnavailable={mapUnavailable}
              onRetryMap={mapFailed ? handleRetryMap : undefined}
              onHoverCourse={setHoveredId}
              onSelectCourse={handleSelectCourse}
              onOpenCourse={handleOpenCourse}
            />
            {(searchQuery ? serverSearch.hasMore : hasMore) && (
              <div style={{ padding: "0 var(--space-4) var(--space-4)" }}>
                <Button data-testid="E1-4-3"
                  type="button"
                  variant="secondary"
                  className="w-full justify-center"
                  disabled={searchQuery ? serverSearch.loadingMore : loadingMore}
                  onClick={searchQuery ? serverSearch.loadMore : loadMore}
                >
                  {(searchQuery ? serverSearch.loadingMore : loadingMore) ? t("button.loadingMore") : t("button.loadMore")}
                </Button>
              </div>
            )}
          </div>
        </div>
      )}
    </div>
  );
}
