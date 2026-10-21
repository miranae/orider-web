import GlossaryText from "../common/GlossaryText";
/**
 * 주간 러닝 리캡 (설계 문서 §3.4c, 시안 5).
 *
 * 헤드라인은 숫자가 아니라 **변화**다: "4번 달려서 28.4km — 평균 페이스가 8초 단축됐어요."
 * 페이스는 낮을수록 빠르므로 개선 화살표는 ▼(단축)이다 (§7).
 */
import { useTranslation } from "react-i18next";
import { ArrowDown, ArrowUp } from "lucide-react";
import { Card, Text } from "../../theme/components";
import { formatPaceSec } from "../../utils/workoutPace";
import type { RunWeeklyRecap } from "../../utils/runWeeklyRecap";
import { ICON_SIZE } from "../../theme/tokens/icon";

export interface WeeklyRecapCardProps {
  recap: RunWeeklyRecap;
}

export default function WeeklyRecapCard({ recap }: WeeklyRecapCardProps) {
  const { t } = useTranslation("dashboard");
  const { lastWeek, prevWeek, trend, paceDeltaSec } = recap;

  // 지난주에 달린 적이 없으면 리캡할 것이 없다.
  if (lastWeek.count === 0) return null;

  const headline =
    trend === "faster"
      ? t("runRecap.headlineFaster", { count: lastWeek.count, km: lastWeek.distanceKm, sec: paceDeltaSec })
      : trend === "slower"
        ? t("runRecap.headlineSlower", { count: lastWeek.count, km: lastWeek.distanceKm })
        : t("runRecap.headlinePlain", { count: lastWeek.count, km: lastWeek.distanceKm });

  return (
    <Card style={{ borderColor: "var(--accent-soft-border)" }}>
      <Text as="div" variant="eyebrow" style={{ color: "var(--ink-1)", marginBottom: "var(--space-2)" }}>
        {t("runRecap.eyebrow")}
      </Text>

      <Text as="p" variant="bodyLarge" tone="primary" style={{ margin: 0, lineHeight: 1.55 }}>
        <GlossaryText>{headline}</GlossaryText>
      </Text>

      <div style={{ display: "grid", gridTemplateColumns: "repeat(auto-fit, minmax(min(100%, 6rem), 1fr))", gap: "var(--space-3)", marginTop: "var(--space-3)" }}>
        <Stat label={t("runRecap.runs")} value={String(lastWeek.count)} unit={t("runRecap.unitTimes")} />
        <Stat label={t("runRecap.distance")} value={String(lastWeek.distanceKm)} unit="km" />
        <Stat
          label={t("runRecap.avgPace")}
          value={lastWeek.avgPaceSecPerKm != null ? formatPaceSec(lastWeek.avgPaceSecPerKm) : "—"}
          unit="/km"
          delta={
            trend === "faster" || trend === "slower"
              ? { seconds: Math.abs(paceDeltaSec!), improved: trend === "faster" }
              : undefined
          }
        />
      </div>

      {prevWeek.count > 0 && (
        <Text as="div" variant="caption" style={{ marginTop: "var(--space-2)", color: "var(--ink-3)" }}>
          {t("runRecap.prevWeek", {
            count: prevWeek.count,
            km: prevWeek.distanceKm,
          })}
        </Text>
      )}
    </Card>
  );
}

function Stat({
  label,
  value,
  unit,
  delta,
}: {
  label: string;
  value: string;
  unit?: string;
  /** 페이스 전용: improved=true 면 단축(▼), false 면 지연(▲). */
  delta?: { seconds: number; improved: boolean };
}) {
  const { t } = useTranslation("dashboard");
  const color = "var(--ink-1)";
  const Arrow = delta?.improved ? ArrowDown : ArrowUp;
  return (
    <div style={{ minWidth: 0 }}>
      <div style={{ display: "flex", flexWrap: "wrap", alignItems: "baseline", gap: "var(--space-1)" }}>
        <span style={{ display: "inline-flex", alignItems: "baseline", gap: "var(--space-1)", whiteSpace: "nowrap" }}>
          <Text variant="dataMedium" mono>{value}</Text>
          {unit && <Text variant="unit">{unit}</Text>}
        </span>
        {delta && (
          <span
            style={{ display: "inline-flex", alignItems: "center", gap: "var(--space-1)", color, fontSize: "var(--fs-xs)", fontWeight: 600, whiteSpace: "nowrap" }}
            aria-label={
              delta.improved
                ? t("runRecap.deltaFasterA11y", { sec: delta.seconds })
                : t("runRecap.deltaSlowerA11y", { sec: delta.seconds })
            }
          >
            <Arrow size={ICON_SIZE.xs} aria-hidden="true" style={{ color: delta.improved ? "var(--lime)" : "var(--ink-2)" }} />
            {delta.seconds}
            {t("runRecap.unitSeconds")}
          </span>
        )}
      </div>
      <Text as="div" variant="caption" tone="tertiary"><GlossaryText>{label}</GlossaryText></Text>
    </div>
  );
}
