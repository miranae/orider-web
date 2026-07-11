/**
 * 러닝 해석 요약 카드 — 활동 상세 최상단 (설계 문서 §3.2, 시안 1 콜아웃 1).
 *
 * 이 화면의 첫 시선은 숫자가 아니라 문장이다: "오르막을 감안하면 평지 기준 5'40"/km로 달린
 * 셈이에요. 지난 4주 평균보다 8초 빨라졌어요."
 *
 * 근거가 없으면 렌더하지 않는다(null) — GAP 도 기준선도 없는데 요약 문장을 지어내지 않는다.
 */
import { useMemo } from "react";
import { useTranslation } from "react-i18next";
import type { ActivityStreams } from "@shared/types";
import { Card, Text } from "../../theme/components";
import { calculateOverallGap } from "../../utils/runMetrics";
import { interpretActivitySummary } from "../../utils/metricInterpretation";
import { formatPaceSec } from "../../utils/workoutPace";

export interface RunInterpretationCardProps {
  streams: ActivityStreams | null | undefined;
  /** 활동 평균 속도 (km/h). */
  averageSpeedKmh: number;
  /** 최근 4주 거리 가중 평균 페이스 (sec/km). 없으면 변화 문장을 생략. */
  baselinePaceSecPerKm: number | null;
}

export default function RunInterpretationCard({
  streams,
  averageSpeedKmh,
  baselinePaceSecPerKm,
}: RunInterpretationCardProps) {
  const { t } = useTranslation("metricGlossary");

  const gapSecPerKm = useMemo(
    () => (streams ? calculateOverallGap(streams) : null),
    [streams],
  );

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

  if (!interp) return null;

  return (
    <Card style={{ borderLeft: "3px solid var(--accent)" }}>
      <Text as="div" variant="eyebrow" style={{ color: "var(--accent)", marginBottom: "var(--space-2)" }}>
        {t("sheet.interpLabel")}
      </Text>
      <Text as="p" variant="bodyLarge" tone="primary" style={{ margin: 0, lineHeight: 1.55 }}>
        {interp.gap && gapSecPerKm != null && (
          <>
            {t(`gap.summary.${interp.gap.variant}`, {
              ...interp.gap.values,
              gapPace: formatPaceSec(gapSecPerKm),
            })}{" "}
          </>
        )}
        {interp.pace && <>{t(`pace.interp.${interp.pace.variant}`, interp.pace.values)}</>}
      </Text>
    </Card>
  );
}
