/**
 * 러닝 해석 요약 카드 — 활동 상세 최상단 (설계 문서 §3.2, 시안 1 콜아웃 1).
 *
 * 서버 GAP 과 활동 전 4주 평균을 근거로 이번 활동의 페이스를 설명한다.
 *
 * 근거가 없으면 렌더하지 않는다(null) — GAP 도 기준선도 없는데 요약 문장을 지어내지 않는다.
 */
import { useMemo } from "react";
import { useTranslation } from "react-i18next";
import { Card, Text } from "../../theme/components";
import { interpretActivitySummary } from "../../utils/metricInterpretation";
import { formatPace } from "../../utils/units";
import type { RunBaseline } from "../../hooks/useRunBaselinePace";
import { useLocale } from "../../contexts/LocaleContext";

export interface RunInterpretationCardProps {
  /** 서버 `activity_metrics.runMetrics.gapAvgSec`. 웹은 GAP 을 스트림에서 다시 계산하지 않는다 (#2437). */
  gapSecPerKm: number | null;
  /** 활동 평균 속도 (km/h). */
  averageSpeedKmh: number;
  /** 활동 전 4주 거리 가중 평균 페이스 (sec/km). 없으면 변화 문장을 생략. */
  baselinePaceSecPerKm: number | null;
  comparison?: Pick<RunBaseline, "comparisonType" | "sampleCount" | "windowComplete">;
}

export default function RunInterpretationCard({
  gapSecPerKm,
  averageSpeedKmh,
  baselinePaceSecPerKm,
  comparison,
}: RunInterpretationCardProps) {
  const { t } = useTranslation("metricGlossary");
  const { units } = useLocale();


  const paceSecPerKm = averageSpeedKmh > 0 ? Math.round(3600 / averageSpeedKmh) : null;

  const interp = useMemo(
    () =>
      interpretActivitySummary({
        paceSecPerKm,
        gapSecPerKm,
        baselinePaceSecPerKm,
      }),
    [paceSecPerKm, gapSecPerKm, baselinePaceSecPerKm],
  );

  const showComparison = comparison?.comparisonType && comparison.windowComplete != null;
  if (!interp && !showComparison) return null;

  return (
    <Card style={{ borderLeft: "3px solid var(--accent)" }}>
      <Text as="div" variant="eyebrow" style={{ color: "var(--accent)", marginBottom: "var(--space-2)" }}>
        {t("sheet.interpLabel")}
      </Text>
      <Text as="p" variant="bodyLarge" tone="primary" style={{ margin: 0, lineHeight: 1.55 }}>
        {interp?.gap && gapSecPerKm != null && (
          <>
            {t(`gap.summary.${interp.gap.variant}`, {
              ...interp.gap.values,
              gapPace: formatPace(gapSecPerKm, units),
            })}{" "}
          </>
        )}
        {interp?.pace && <>{t(`pace.interp.${interp.pace.variant}`, { ...interp.pace.values, diffSec: units === "imperial" ? Math.round(Number(interp.pace.values.diffSec) * 1.609344) : interp.pace.values.diffSec })}</>}
      </Text>
      {showComparison && comparison && <Text as="p" variant="bodySmall" tone="tertiary" style={{ marginTop: "var(--space-2)" }} data-testid="run-comparison-basis">
        {t(comparison.windowComplete && comparison.sampleCount >= 3 ? "pace.comparison.basis" : "pace.comparison.observed", { type: t(`pace.comparison.${comparison.comparisonType}`), count: comparison.sampleCount })}
        {comparison.windowComplete === false ? ` ${t("pace.comparison.incomplete")}` : comparison.sampleCount < 3 ? ` ${t("pace.comparison.insufficient")}` : ""}
      </Text>}
    </Card>
  );
}
