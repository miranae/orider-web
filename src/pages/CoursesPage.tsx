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
import { Button, buttonClass } from "../theme/components";
import { CourseList } from "../features/courses/CourseList";
import { CoursesMap, isCourseInBounds } from "../features/courses/CoursesMap";
import { filterAndSortCourses, type SortMode, type SurfaceFilter } from "../features/courses/courseCatalog";
import type { CourseData } from "../features/courses/courseSnapshot";
import { useCourseCatalog } from "../features/courses/useCourseCatalog";

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
};

const COURSES_FILTER_GROUP_STYLE: React.CSSProperties = {
  display: "flex",
  alignItems: "center",
  gap: "var(--space-2)",
};

const COURSES_FILTER_BUTTON_STYLE: React.CSSProperties = {
  padding: "var(--space-1) var(--space-2)",
};

export default function CoursesPage() {
  const mapboxToken = getMapboxToken();
  const { t } = useTranslation("course");
  const { user } = useAuth();
  const navigate = useNavigate();
  const location = useLocation();
  const [searchParams, setSearchParams] = useSearchParams();
  const queryParam = searchParams.get("q")?.trim() ?? "";
  const isVisible = stripLangPrefix(location.pathname) === "/courses";
  const [hasRendered, setHasRendered] = useState(isVisible);

  useEffect(() => {
    if (isVisible) setHasRendered(true);
  }, [isVisible]);

  const [sortMode, setSortMode] = useState<SortMode>("latest");
  const {
    courses: allCourses,
    loading,
    loadingMore,
    hasMore,
    loadMore,
    polylineCache,
  } = useCourseCatalog(sortMode);
  const [surfaceFilter, setSurfaceFilter] = useState<SurfaceFilter>("");
  const [difficultyFilter, setDifficultyFilter] = useState<number | null>(null);
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
  const [mobileMapOpen, setMobileMapOpen] = useState(false);
  const cardRefs = useRef<Map<string, HTMLDivElement>>(new Map());
  const mapUnavailable = !mapboxToken || mapFailed;

  useEffect(() => {
    setSearchQuery(queryParam);
    setInputValue(queryParam);
    setSelectedId(null);
    setHoveredId(null);
  }, [queryParam]);

  const displayCourses = useMemo(() => {
    return filterAndSortCourses(allCourses, {
      searchQuery,
      sortMode,
      surfaceFilter,
      difficultyFilter,
      myLoc,
      radiusKm,
    });
  }, [allCourses, searchQuery, sortMode, surfaceFilter, difficultyFilter, myLoc, radiusKm]);

  const visibleOnMap = useMemo(() => {
    if (mapUnavailable) return displayCourses;
    if (!mapBounds) return displayCourses;
    return displayCourses.filter((c) => isCourseInBounds(c, mapBounds, polylineCache.current));
  }, [displayCourses, mapBounds, mapUnavailable, polylineCache]);

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

  const selectedCourse = useMemo(
    () => allCourses.find((course) => course.id === selectedId) ?? null,
    [allCourses, selectedId],
  );

  if (!hasRendered) return null;

  return (
    <div className="flex flex-col -mx-4 -my-6" style={{ height: "calc(100vh - 56px)" }}>
      {/* 컨트롤 바 */}
      <div className="flex-shrink-0" style={COURSES_CONTROL_STACK_STYLE}>
        <div className="flex items-center justify-between">
          <div>
            <h1 className="text-[length:var(--fs-2xl)] font-bold" style={{ color: "var(--ink-0)" }}>{t("title")}</h1>
            <p className="text-[length:var(--fs-sm)]" style={{ color: "var(--ink-3)", marginTop: "var(--space-1)" }}>
              {t("subtitle")}
            </p>
          </div>
          {user && (
            <Link to="/course/create" className={`${buttonClass({ variant: 'primary', className: 'whitespace-nowrap' })}`}>
              {t("button.create")}
            </Link>
          )}
        </div>

        <div className="flex flex-col sm:flex-row" style={{ gap: "var(--space-3)" }}>
          <div className="relative flex-1">
            <button
              onClick={handleSearch}
              className="absolute left-3 top-1/2 -translate-y-1/2 transition-colors"
              style={{ color: "var(--ink-3)" }}
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
              className="w-full rounded-[var(--r-lg)] text-[length:var(--fs-sm)] focus:outline-none"
              style={{ background: "var(--bg-2)", border: "1px solid var(--line)", color: "var(--ink-0)", padding: "var(--space-2) var(--space-4) var(--space-2) 2.5rem" }}
            />
          </div>
          <div className="flex" style={{ gap: "var(--space-1)" }}>
            {([
              { id: "latest" as SortMode, label: t("sort.latest") },
              { id: "popular" as SortMode, label: t("sort.popular") },
            ]).map((s) => (
              <Button
                key={s.id}
                onClick={() => setSortMode(s.id)} variant="secondary" className="whitespace-nowrap"
                style={sortMode === s.id ? { background: "var(--lime)", color: "var(--primary-fg)", borderColor: "var(--lime)", fontWeight: 600 } : undefined}
              >
                {s.label}
              </Button>
            ))}
          </div>
        </div>

        {/* 노면/난이도 다축 필터(#489) */}
        <div className="overflow-x-auto lg:flex-wrap lg:overflow-visible" style={COURSES_FILTER_ROW_STYLE}>
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
                <button key={o.v || "all"} type="button" onClick={() => setSurfaceFilter(o.v)}
                  className="text-[length:var(--fs-xs)] rounded-[var(--r-sm)] border transition-colors"
                  style={active ? { ...COURSES_FILTER_BUTTON_STYLE, background: "color-mix(in oklch, var(--lime) 12%, transparent)", borderColor: "var(--lime)", color: "var(--lime)" } : { ...COURSES_FILTER_BUTTON_STYLE, borderColor: "var(--line-soft)", color: "var(--ink-2)" }}>
                  {o.label}
                </button>
              );
            })}
          </div>
          <div className="flex shrink-0 items-center" style={COURSES_FILTER_GROUP_STYLE}>
            <span className="text-[length:var(--fs-xs)]" style={{ color: "var(--ink-3)" }}>{t("filter.nearMe")}</span>
            {([10, 20, 50] as const).map((km) => {
              const active = myLoc != null && radiusKm === km;
              return (
                <button key={km} type="button" disabled={locating}
                  onClick={() => {
                    if (active) { setRadiusKm(null); return; }
                    if (myLoc) { setRadiusKm(km); return; }
                    setLocating(true);
                    navigator.geolocation.getCurrentPosition(
                      (pos) => { setMyLoc({ lat: pos.coords.latitude, lng: pos.coords.longitude }); setRadiusKm(km); setLocating(false); },
                      (err) => { logClientError("CoursesPage.geolocation", err, {}); setLocating(false); },
                      { timeout: 8000, maximumAge: 300000 },
                    );
                  }}
                  className="text-[length:var(--fs-xs)] rounded-[var(--r-sm)] border transition-colors"
                  style={active ? { ...COURSES_FILTER_BUTTON_STYLE, background: "color-mix(in oklch, var(--lime) 12%, transparent)", borderColor: "var(--lime)", color: "var(--lime)" } : { ...COURSES_FILTER_BUTTON_STYLE, borderColor: "var(--line-soft)", color: "var(--ink-2)" }}>
                  {t("filter.radiusKm", { km })}
                </button>
              );
            })}
          </div>
          <div className="flex shrink-0 items-center" style={COURSES_FILTER_GROUP_STYLE}>
            <span className="text-[length:var(--fs-xs)]" style={{ color: "var(--ink-3)" }}>{t("difficulty")}</span>
            <button type="button" onClick={() => setDifficultyFilter(null)}
              className="text-[length:var(--fs-xs)] rounded-[var(--r-sm)] border transition-colors"
              style={difficultyFilter == null ? { ...COURSES_FILTER_BUTTON_STYLE, background: "color-mix(in oklch, var(--lime) 12%, transparent)", borderColor: "var(--lime)", color: "var(--lime)" } : { ...COURSES_FILTER_BUTTON_STYLE, borderColor: "var(--line-soft)", color: "var(--ink-2)" }}>
              {t("filter.all")}
            </button>
            {[1, 2, 3, 4, 5].map((n) => {
              const active = difficultyFilter === n;
              return (
                <button key={n} type="button" onClick={() => setDifficultyFilter(active ? null : n)}
                  className="w-7 h-7 text-[length:var(--fs-xs)] rounded-[var(--r-sm)] border font-semibold transition-colors"
                  style={active ? { background: "color-mix(in oklch, var(--lime) 12%, transparent)", borderColor: "var(--lime)", color: "var(--lime)" } : { borderColor: "var(--line-soft)", color: "var(--ink-2)" }}>
                  {n}
                </button>
              );
            })}
          </div>
        </div>
        {!mapUnavailable && (
          <div className="lg:hidden">
            <Button
              type="button"
              variant="secondary"
              size="sm"
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
      {loading ? (
        <div className="flex-1 flex items-center justify-center" style={{ background: "var(--bg-0)" }}>
          <div className="w-8 h-8 border-4 border-t-transparent rounded-full animate-spin" style={{ borderColor: "var(--lime) transparent var(--lime) var(--lime)" }} />
        </div>
      ) : (
        <div className={mapUnavailable ? "flex-1 flex flex-col min-h-0" : "flex-1 flex flex-col lg:flex-row min-h-0"} style={{ background: "var(--bg-0)" }}>
          {!mapUnavailable && (
            <CoursesMap
              allCourses={allCourses}
              visibleCourses={visibleOnMap}
              polylineCache={polylineCache.current}
              selectedId={selectedId}
              hoveredId={hoveredId}
              onBoundsChange={setMapBounds}
              onMapInteraction={handleMapInteraction}
              onHoverCourse={setHoveredId}
              onScrollToCourse={scrollToCard}
              onSelectCourse={handleMapSelectCourse}
              onClearSelection={handleClearSelection}
              onOpenCourse={handleOpenCourse}
              onMapFailed={() => setMapFailed(true)}
              className={mobileMapOpen ? "h-56 lg:h-auto lg:flex-[2] relative" : "hidden lg:block lg:h-auto lg:flex-[2] relative"}
            />
          )}

          <div className={mapUnavailable ? "flex-1 overflow-y-auto" : "flex-1 lg:flex-[1] lg:max-w-md overflow-y-auto"} style={{ borderTop: "1px solid var(--line-soft)", background: "var(--bg-0)" }}>
            <CourseList
              courses={listCourses}
              allCourseCount={allCourses.length}
              selectedCourse={selectedCourse}
              selectedId={selectedId}
              hoveredId={hoveredId}
              searchQuery={searchQuery}
              cardRefs={cardRefs}
              mapUnavailable={mapUnavailable}
              onHoverCourse={setHoveredId}
              onSelectCourse={handleSelectCourse}
              onOpenCourse={handleOpenCourse}
            />
            {hasMore && (
              <div style={{ padding: "0 var(--space-4) var(--space-4)" }}>
                <Button
                  type="button"
                  variant="secondary"
                  className="w-full justify-center"
                  disabled={loadingMore}
                  onClick={loadMore}
                >
                  {loadingMore ? t("button.loadingMore") : t("button.loadMore")}
                </Button>
              </div>
            )}
          </div>
        </div>
      )}
    </div>
  );
}
