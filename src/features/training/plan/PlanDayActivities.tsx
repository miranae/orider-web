import type { KeyboardEvent, MouseEvent } from "react";
import { useTranslation } from "react-i18next";
import { LocalizedLink } from "../../../components/LocalizedLink";
import {
  dailyActivitiesUnavailable,
  type DailyActivity,
  type PlanDailyActivities,
} from "../../../hooks/usePlanDailyActivities";

interface PlanDayActivitiesProps {
  actual: PlanDailyActivities;
  dateKey: string;
}

function formatClock(epochMs: number | null, timeZone: string | null): string {
  if (epochMs == null || epochMs <= 0) return "";
  try {
    return new Intl.DateTimeFormat("en-GB", { hour: "2-digit", minute: "2-digit", hourCycle: "h23", ...(timeZone ? { timeZone } : {}) })
      .format(new Date(epochMs));
  } catch {
    return "";
  }
}

/** 수영은 m, 그 외는 km. 거리를 모르면 비운다. */
function formatDistance(activity: DailyActivity, swim: boolean): string {
  const meters = activity.distance;
  if (meters == null || meters <= 0) return "";
  return swim ? `${Math.round(meters)}m` : `${(meters / 1000).toFixed(1)}km`;
}

// 칸 전체가 운동 편집을 여는 버튼이라, 활동 링크의 클릭·키 입력이 칸으로 번지지 않게 막는다.
const stopClick = (event: MouseEvent) => event.stopPropagation();
const stopKey = (event: KeyboardEvent) => event.stopPropagation();

/**
 * 계획 날짜 칸에 그날 그 종목의 실제 활동(서버 일별 문서)과 그날 실제 TSS 를 보인다.
 * 값은 서버가 확정한 것을 그대로 쓰고, 계획 완료 판정과는 무관하다.
 */
export default function PlanDayActivities({ actual, dateKey }: PlanDayActivitiesProps) {
  const { t } = useTranslation("training");
  const day = actual.days.get(dateKey);
  if (!day || day.activities.length === 0) {
    return dailyActivitiesUnavailable(actual, dateKey)
      ? <span data-testid="K4-5-10" role="status" style={{ fontSize: "var(--fs-2xs)", color: "var(--ink-3)" }}>{t("page.activitiesUnavailable")}</span>
      : null;
  }
  const swim = actual.discipline === "swim";
  const estimatedLabel = t("page.tssEstimated");
  return (
    <div data-testid="K4-5-7" role="group" aria-label={t("page.actualActivities", { date: dateKey })}
      style={{ display: "flex", flexDirection: "column", gap: "var(--space-0-5)", minWidth: 0 }}>
      <span data-testid="K4-5-9" style={{ fontSize: "var(--fs-xs)", fontFamily: "var(--font-mono)", color: "var(--ink-1)", fontWeight: 600 }}>
        {t("page.actualDayTSS", { value: day.tss != null ? Math.round(day.tss) : "–" })}
        {day.tss != null && day.tssEstimated && <span style={{ marginLeft: "var(--space-0-5)", color: "var(--ink-3)", fontWeight: 400 }}>{estimatedLabel}</span>}
      </span>
      {day.activities.map((activity) => {
        const tss = activity.tss == null ? null : Math.round(activity.tss);
        const tssLabel = tss == null ? "" : `${tss} TSS${activity.estimated ? ` ${estimatedLabel}` : ""}`;
        const parts = [formatClock(activity.startTime, actual.timezone), formatDistance(activity, swim), tssLabel].filter(Boolean);
        const label = parts.join(" · ") || t(`discipline.${actual.discipline}`);
        return (
          <LocalizedLink key={activity.id} data-testid="K4-5-8" to={`/activity/${encodeURIComponent(activity.id)}`}
            onClick={stopClick} onKeyDown={stopKey}
            aria-label={`${t(`discipline.${actual.discipline}`)} · ${label}`}
            style={{ fontSize: "var(--fs-xs)", fontFamily: "var(--font-mono)", color: "var(--accent)", textDecoration: "none", overflowWrap: "anywhere", minWidth: 0 }}>
            {label}
          </LocalizedLink>
        );
      })}
    </div>
  );
}
