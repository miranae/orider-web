import { useTranslation } from "react-i18next";
import type { ConsistencyStreakSummary } from "../../utils/consistencyStreak";
import { Card, Text } from "../../theme/components";

interface ConsistencyStreakCardProps {
  summary: ConsistencyStreakSummary | null;
  compact?: boolean;
}

export default function ConsistencyStreakCard({ summary, compact = false }: ConsistencyStreakCardProps) {
  const { t } = useTranslation("dashboard");
  if (!summary) return null;

  const maintained = summary.needsThisWeek === 0;
  return (
    <Card padding="none" style={{ padding: compact ? "var(--space-3)" : "var(--space-4) var(--space-5)" }}>
      <div className="flex items-center justify-between gap-4">
        <div>
          <Text variant="eyebrow" tone="secondary">{t("streak.eyebrow")}</Text>
          <Text as="h2" variant={compact ? "body" : "subtitle"} weight={700} style={{ display: "block", marginTop: "var(--space-1)", color: "var(--ink-0)" }}>
            {t("streak.title", { count: summary.streakWeeks })}
          </Text>
          <Text variant="bodySmall" tone="tertiary" style={{ display: "block", marginTop: "var(--space-1)" }}>
            {maintained
              ? t("streak.maintained", { count: summary.thisWeekCount })
              : t("streak.needOne")}
          </Text>
        </div>
        <div style={{ textAlign: "right", flexShrink: 0 }}>
          <Text as="div" variant="dataMedium" style={{ color: "var(--lime)" }}>{summary.score90d}</Text>
          <Text as="div" variant="eyebrow" tone="tertiary">{t("streak.score")}</Text>
        </div>
      </div>
    </Card>
  );
}
