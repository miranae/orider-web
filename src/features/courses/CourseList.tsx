import React from "react";
import { useTranslation } from "react-i18next";
import { Button, Card, Chip, Text } from "../../theme/components";
import type { CourseData } from "./courseSnapshot";
import { courseTagLabel, primaryCourseTags } from "./courseTags";

export function climbCatLabel(cat: number): string {
  if (cat === 5) return "HC";
  return `Cat ${5 - cat}`;
}

export function climbBadgeStyle(cat: number): React.CSSProperties {
  switch (cat) {
    case 5: return { background: "var(--rose)", color: "var(--primary-fg)" };
    case 4: return { background: "var(--rose)", color: "var(--primary-fg)", opacity: 0.85 };
    case 3: return { background: "var(--amber)", color: "var(--primary-fg)" };
    case 2: return { background: "var(--amber)", color: "var(--primary-fg)", opacity: 0.75 };
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

const COURSE_LIST_STACK_STYLE: React.CSSProperties = {
  display: "flex",
  flexDirection: "column",
  gap: "var(--space-2)",
};

const COURSE_LIST_INLINE_STYLE: React.CSSProperties = {
  display: "flex",
  alignItems: "center",
  flexWrap: "wrap",
  gap: "var(--space-2)",
};

const COURSE_LIST_CHIP_STYLE: React.CSSProperties = {
  fontSize: 10,
  lineHeight: 1.2,
  padding: "var(--space-1)",
  letterSpacing: 0,
};

const COURSE_LIST_BADGE_STYLE: React.CSSProperties = {
  ...COURSE_LIST_CHIP_STYLE,
  display: "inline-flex",
  alignItems: "center",
  borderRadius: "var(--r-sm)",
};

function OfficialCourseChip() {
  const { t } = useTranslation("course");
  return (
    <Chip variant="accent" style={COURSE_LIST_CHIP_STYLE}>
      {t("badge.official")}
    </Chip>
  );
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
    <Card padding="none" style={{ padding: 0, overflow: "hidden", borderRadius: "var(--r-md)", marginBottom: "var(--space-3)" }}>
      <div style={{ padding: "var(--space-3) var(--space-4)", borderBottom: "1px solid var(--line-soft)" }}>
        <div style={{ ...COURSE_LIST_INLINE_STYLE, marginBottom: "var(--space-1)" }}>
          {course.curated && <OfficialCourseChip />}
          {course.regions.map((r) => (
            <Chip key={r} variant="accent" style={COURSE_LIST_CHIP_STYLE}>{r}</Chip>
          ))}
          {course.climbs.length > 0 && [...course.climbs].sort((a, b) => b.cat - a.cat).map((climb, i) => (
            <span key={i} className="font-medium" style={{ ...COURSE_LIST_BADGE_STYLE, ...climbBadgeStyle(climb.cat) }}>
              {climbCatLabel(climb.cat)}
            </span>
          ))}
        </div>
        <h2 className="text-[length:var(--fs-lg)] font-bold" style={{ color: "var(--ink-0)" }}>{course.name}</h2>
        <div className="text-[length:var(--fs-xs)]" style={{ color: "var(--ink-3)", marginTop: "var(--space-1)" }}>
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
          <div key={k} style={{ padding: "var(--space-2)", background: "var(--bg-1)" }}>
            <Text as="div" variant="eyebrow" style={{ marginBottom: 'var(--space-1)', fontSize: "var(--fs-2xs)" }}>{k}</Text>
            <div>
              <Text variant="dataMedium" style={{ fontSize: "var(--fs-sm)" }}>{v}</Text>
              {u && <Text variant="unit">{u}</Text>}
            </div>
          </div>
        ))}
      </div>
      <div style={{ padding: "var(--space-2) var(--space-4)", display: "flex", gap: 'var(--space-2)' }}>
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
    <div style={{ padding: "var(--space-3)" }}>
      {mapUnavailable && (
        <div className="rounded-[var(--r-lg)]" role="status" style={{ background: "var(--bg-1)", border: "1px solid var(--line-soft)", marginBottom: "var(--space-3)", padding: "var(--space-3) var(--space-4)" }}>
          <div className="text-[length:var(--fs-sm)] font-semibold" style={{ color: "var(--ink-0)" }}>{t("map.unavailableTitle")}</div>
          <div className="text-[length:var(--fs-xs)]" style={{ color: "var(--ink-3)", marginTop: "var(--space-1)" }}>{t("map.listPriorityDescription")}</div>
        </div>
      )}

      {selectedCourse && (
        <SelectedCoursePanel course={selectedCourse} onOpenCourse={onOpenCourse} />
      )}

      <Text as="div" variant="eyebrow" style={{ marginBottom: "var(--space-2)" }}>
        {searchQuery
          ? t("stats.resultCount", { count: courses.length })
          : t("stats.areaCount", { count: courses.length })}
      </Text>
      {courses.length === 0 ? (
        <div className="text-center text-[length:var(--fs-sm)]" style={{ color: "var(--ink-3)", paddingBlock: "var(--space-8)" }}>
          {searchQuery
            ? t("empty.noResults")
            : allCourseCount === 0
              ? t("empty.noCourses")
              : t("empty.noCoursesInArea")}
        </div>
      ) : (
        <div style={COURSE_LIST_STACK_STYLE}>
          {courses.map((course) => {
            const highlighted = hoveredId === course.id || selectedId === course.id;
            const distKm = (course.distance / 1000).toFixed(1);
            const elevM = Math.round(course.elevationGain);
            const mpk = course.distance > 0 ? (course.elevationGain / (course.distance / 1000)).toFixed(1) : "0";
            const tags = primaryCourseTags(course, 5);
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
                className="cursor-pointer rounded-[var(--r-lg)] transition-colors"
                style={{
                  background: highlighted ? "color-mix(in oklch, var(--lime) 6%, var(--bg-2))" : "var(--bg-1)",
                  border: highlighted ? "1px solid var(--lime)" : "1px solid var(--line-soft)",
                  borderLeft: highlighted ? "2px solid var(--lime)" : "2px solid transparent",
                  padding: "var(--space-3)",
                }}
              >
                <div style={COURSE_LIST_INLINE_STYLE}>
                  <Text as="h3" variant="bodyMedium" truncate className="flex-1" tone="primary" style={{ margin: 0 }}>{course.name}</Text>
                  {course.curated && <OfficialCourseChip />}
                  {course.surface && (
                    <span className="font-medium" style={{ ...COURSE_LIST_BADGE_STYLE, ...surfaceChipStyle(course.surface) }}>
                      {t(`edit.surface.${course.surface}`)}
                    </span>
                  )}
                  {course.climbs.length > 0 && (
                    <span className="font-medium" style={{ ...COURSE_LIST_BADGE_STYLE, ...climbBadgeStyle(Math.max(...course.climbs.map((c) => c.cat))) }}>
                      {climbCatLabel(Math.max(...course.climbs.map((c) => c.cat)))}
                    </span>
                  )}
                </div>
                {course.regions.length > 0 && (
                  <div className="text-[length:var(--fs-xs)]" style={{ color: "var(--ink-3)", marginTop: "var(--space-1)" }}>{course.regions.join(" · ")}</div>
                )}
                {tags.length > 0 && (
                  <div className="flex items-center overflow-hidden" style={{ gap: "var(--space-1)", marginTop: "var(--space-2)" }}>
                    {tags.map((tag) => (
                      <Chip key={tag} variant="default" style={{ ...COURSE_LIST_CHIP_STYLE, maxWidth: 128 }}>
                        <span className="truncate">{courseTagLabel(tag)}</span>
                      </Chip>
                    ))}
                  </div>
                )}
                <div className="flex text-[length:var(--fs-xs)]" style={{ fontFamily: "var(--font-mono)", color: "var(--ink-2)", gap: "var(--space-3)", marginTop: "var(--space-2)" }}>
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
