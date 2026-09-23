import { useTranslation } from "react-i18next";
import type { SpeedCurvePoint } from "../features/activity/detail/metricsPresentation";
import DurationCurveChart from "./DurationCurveChart";

interface SpeedCurveChartProps {
  points: SpeedCurvePoint[];
  emptyTitle?: string;
  emptyDescription?: string;
}

/**
 * 속도 커브 — 파워계가 없는 라이더에게는 노력을 읽는 유일한 축이고, 있는 라이더에게는
 * 파워 커브와 나란히 두어 "밟아서 빨랐나 / 내려가서 빨랐나" 를 가른다. 기준선은 두지
 * 않는다 — 속도에는 FTP 같은 개인 임계가 없다.
 */
export default function SpeedCurveChart({ points, emptyTitle, emptyDescription }: SpeedCurveChartProps) {
  const { t } = useTranslation(["dashboard", "activity"]);
  return (
    <DurationCurveChart
      points={points.map((p) => ({ durationSeconds: p.durationSeconds, value: p.speedKmh }))}
      unit="km/h"
      fractionDigits={1}
      color="var(--chart-speed)"
      datasetLabel={t("dashboard:charts.speedCurve.datasetLabel")}
      peakLabel={points.length > 0
        ? t("dashboard:charts.speedCurve.peakSpeed", { speed: points[0]!.speedKmh })
        : undefined}
      emptyTitle={emptyTitle ?? t("activity:analysis.empty.speedCurveTitle")}
      emptyDescription={emptyDescription ?? t("activity:analysis.empty.speedCurveDesc")}
    />
  );
}
