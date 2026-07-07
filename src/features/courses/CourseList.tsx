import React from "react";
import { useTranslation } from "react-i18next";
import { Button, Card, Chip, Text } from "../../theme/components";
import type { CourseData } from "./courseSnapshot";

export function climbCatLabel(cat: number): string {
  if (cat === 5) return "HC";
  return `Cat ${5 - cat}`;
}

export function climbBadgeStyle(cat: number): React.CSSProperties {
  switch (cat) {
    case 5: return { background: "var(--rose)", color: "#1a0005" };
    case 4: return { background: "var(--rose)", color: "#1a0005", opacity: 0.85 };
    case 3: return { background: "var(--amber)", color: "#1a0800" };
    case 2: return { background: "var(--amber)", color: "#1a0800", opacity: 0.75 };
    case 1: return { background: "var(--lime)", color: "var(--primary-fg)" };
    default: return { background: "var(--bg-3)", color: "var(--ink-3)" };
  }
}

function surfaceChipStyle(surface: string): React.CSSProperties {
  switch (surface) {
    case "paved": return { background: "color-mix(in oklch, var(--aqua) 16%, var(--bg-2))", color: "var(--aqua)" };
    case "gravel": return { background: "color-mix(in oklch, var(--amber) 16%, var(--bg-2))", color: "var(--amber)" };
    case "mixed": return { background: "var(--bg-3)", color: "var(--ink-2)" };
    default: return { background: "var(--bg-3)", color: "var(--ink-3)" };
  }
}

interface SelectedCoursePanelProps {
  course: CourseData;
  onOpenCourse: (courseId: string) => void;
}

function SelectedCoursePanel({ course, onOpenCourse }: SelectedCoursePanelProps) {
  const { t } = useTranslation("course");
  const distKm = (course.distance / 1000).toFixed(1);
  const elevM = Math.round(course.elevationGain);
  const mpk = course.distance > 0 ? (course.elevationGain / (course.distance / 1000)).toFixed(1) : "0";
  const maxCat = course.climbs.length > 0 ? Math.max(...course.climbs.map((c) => c.cat)) : 0;
  const catLabel = maxCat > 0 ? climbCatLabel(maxCat) : "-";

  return (
    <Card padding="none" className="mb-3" style={{ padding: 0, overflow: "hidden", borderRadius: "var(--r-md)" }}>
      <div style={{ padding: "14px 16px", borderBottom: "1px solid var(--line-soft)" }}>
        <div className="flex items-center gap-2 mb-1 flex-wrap">
          {course.regions.map((r) => (
            <Chip key={r} variant="accent" style={{ fontSize: "var(--fs-2xs)", padding: "2px 6px" }}>{r}</Chip>
          ))}
          {course.climbs.length > 0 && [...course.climbs].sort((a, b) => b.cat - a.cat).map((climb, i) => (
            <span key={i} className="px-1.5 py-0.5 text-[10px] font-medium rounded-[var(--r-sm)]" style={climbBadgeStyle(climb.cat)}>
              {climbCatLabel(climb.cat)}
            </span>
          ))}
        </div>
        <h2 className="text-[length:var(--fs-lg)] font-bold" style={{ color: "var(--ink-0)" }}>{course.name}</h2>
        <div className="text-[length:var(--fs-xs)] mt-1" style={{ color: "var(--ink-3)" }}>
          {course.likeCount > 0 && t("stats.likes", { count: course.likeCount })}
        </div>
      </div>
      <div style={{
        display: "grid", gridTemplateColumns: "repeat(5, 1fr)", gap: 1,
        background: "var(--line-soft)", borderBottom: "1px solid var(--line-soft)",
      }}>
        {([
          [t("distance"), distKm, "km"],
          [t("elevationGain"), String(elevM), "m"],
          [t("mode.gradient"), mpk, "m/km"],
          [t("difficulty"), catLabel, null],
          [t("button.share"), String(course.likeCount), null],
        ] as [string, string, string | null][]).map(([k, v, u]) => (
          <div key={k} style={{ padding: "10px 8px", background: "var(--bg-1)" }}>
            <Text as="div" variant="eyebrow" style={{ marginBottom: 'var(--space-1)', fontSize: "var(--fs-2xs)" }}>{k}</Text>
            <div>
              <Text variant="dataMedium" style={{ fontSize: "var(--fs-sm)" }}>{v}</Text>
              {u && <Text variant="unit">{u}</Text>}
            </div>
          </div>
        ))}
      </div>
      <div style={{ padding: "10px 16px", display: "flex", gap: 'var(--space-2)' }}>
        <Button
          onClick={() => onOpenCourse(course.id)} variant="primary" size="sm"
          style={{ flex: 1, justifyContent: "center" }}
        >
          {t("button.detailView")}
        </Button>
      </div>
    </Card>
  );
}

export interface CourseListProps {
  courses: CourseData[];
  allCourseCount: number;
  selectedCourse: CourseData | null;
  selectedId: string | null;
  hoveredId: string | null;
  searchQuery: string;
  cardRefs: React.MutableRefObject<Map<string, HTMLDivElement>>;
  mapUnavailable: boolean;
  onHoverCourse: (courseId: string | null) => void;
  onSelectCourse: (courseId: string) => void;
  onOpenCourse: (courseId: string) => void;
}

export function CourseList({
  courses,
  allCourseCount,
  selectedCourse,
  selectedId,
  hoveredId,
  searchQuery,
  cardRefs,
  mapUnavailable,
  onHoverCourse,
  onSelectCourse,
  onOpenCourse,
}: CourseListProps) {
  const { t } = useTranslation("course");

  return (
    <div className="p-3">
      {mapUnavailable && (
        <div className="mb-3 rounded-[var(--r-lg)] px-4 py-3" role="status" style={{ background: "var(--bg-1)", border: "1px solid var(--line-soft)" }}>
          <div className="text-[length:var(--fs-sm)] font-semibold" style={{ color: "var(--ink-0)" }}>{t("map.unavailableTitle")}</div>
          <div className="mt-1 text-[length:var(--fs-xs)]" style={{ color: "var(--ink-3)" }}>{t("map.listPriorityDescription")}</div>
        </div>
      )}

      {selectedCourse && (
        <SelectedCoursePanel course={selectedCourse} onOpenCourse={onOpenCourse} />
      )}

      <Text as="div" variant="eyebrow" className="mb-2">
        {searchQuery
          ? t("stats.resultCount", { count: courses.length })
          : t("stats.areaCount", { count: courses.length })}
      </Text>
      {courses.length === 0 ? (
        <div className="text-center py-12 text-[length:var(--fs-sm)]" style={{ color: "var(--ink-3)" }}>
          {searchQuery
            ? t("empty.noResults")
            : allCourseCount === 0
              ? t("empty.noCourses")
              : t("empty.noCoursesInArea")}
        </div>
      ) : (
        <div className="space-y-2">
          {courses.map((course) => {
            const highlighted = hoveredId === course.id || selectedId === course.id;
            const distKm = (course.distance / 1000).toFixed(1);
            const elevM = Math.round(course.elevationGain);
            const mpk = course.distance > 0 ? (course.elevationGain / (course.distance / 1000)).toFixed(1) : "0";
            return (
              <div
                key={course.id}
                ref={(el) => {
                  if (el) cardRefs.current.set(course.id, el);
                  else cardRefs.current.delete(course.id);
                }}
                onMouseEnter={() => onHoverCourse(course.id)}
                onMouseLeave={() => onHoverCourse(null)}
                onClick={() => onSelectCourse(course.id)}
                onDoubleClick={() => onOpenCourse(course.id)}
                className="cursor-pointer rounded-[var(--r-lg)] p-3 transition-colors"
                style={{
                  background: highlighted ? "color-mix(in oklch, var(--lime) 6%, var(--bg-2))" : "var(--bg-1)",
                  border: highlighted ? "1px solid var(--lime)" : "1px solid var(--line-soft)",
                  borderLeft: highlighted ? "2px solid var(--lime)" : "2px solid transparent",
                }}
              >
                <div className="flex items-center gap-2">
                  <h3 className="font-semibold text-[length:var(--fs-sm)] truncate flex-1" style={{ color: "var(--ink-0)" }}>{course.name}</h3>
                  {course.surface && (
                    <span className="px-1.5 py-0.5 text-[10px] font-medium rounded-[var(--r-sm)]" style={surfaceChipStyle(course.surface)}>
                      {t(`edit.surface.${course.surface}`)}
                    </span>
                  )}
                  {course.climbs.length > 0 && (
                    <span className="px-1.5 py-0.5 text-[10px] font-medium rounded-[var(--r-sm)]" style={climbBadgeStyle(Math.max(...course.climbs.map((c) => c.cat)))}>
                      {climbCatLabel(Math.max(...course.climbs.map((c) => c.cat)))}
                    </span>
                  )}
                </div>
                {course.regions.length > 0 && (
                  <div className="text-[length:var(--fs-xs)] mt-0.5" style={{ color: "var(--ink-3)" }}>{course.regions.join(" · ")}</div>
                )}
                <div className="flex gap-3 mt-1.5 text-[length:var(--fs-xs)]" style={{ fontFamily: "var(--font-mono)", color: "var(--ink-2)" }}>
                  <span>{distKm} km</span>
                  <span>↑ {elevM}m</span>
                  <span style={{ color: Number(mpk) > 15 ? "var(--amber)" : Number(mpk) > 5 ? "var(--ink-2)" : "var(--lime)" }}>
                    {mpk} m/km
                  </span>
                  {course.likeCount > 0 && (
                    <span style={{ marginLeft: "auto", color: "var(--ink-3)" }}>♥ {course.likeCount}</span>
                  )}
                </div>
              </div>
            );
          })}
        </div>
      )}
    </div>
  );
}
