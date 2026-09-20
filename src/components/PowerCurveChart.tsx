import { useTranslation } from "react-i18next";
import type { PowerCurvePoint } from "../features/activity/detail/metricsPresentation";
import DurationCurveChart from "./DurationCurveChart";

interface PowerCurveChartProps {
  points: PowerCurvePoint[];
  ftp?: number;
  emptyTitle?: string;
  emptyDescription?: string;
}

/**
 * 파워 커브 — 창 길이별 최고값 곡선의 파워 축. 속도 커브와 같은 모양을 쓰도록
 * `DurationCurveChart` 에 위임한다(두 커브는 서버에서 같은 규약으로 계산된다).
 */
export default function PowerCurveChart({ points, ftp, emptyTitle, emptyDescription }: PowerCurveChartProps) {
  const { t } = useTranslation("dashboard");
  return (
    <DurationCurveChart
      points={points.map((p) => ({ durationSeconds: p.durationSeconds, value: p.maxPower }))}
      unit="W"
      color="#a855f7"
      datasetLabel={t("charts.powerCurve.datasetLabel")}
      reference={ftp ? { value: ftp, label: `FTP ${ftp}W` } : null}
      peakLabel={points.length > 0 ? t("charts.powerCurve.peakPower", { power: points[0]!.maxPower }) : undefined}
      emptyTitle={emptyTitle ?? t("charts.powerCurve.emptyTitle")}
      emptyDescription={emptyDescription ?? t("charts.powerCurve.emptyDescription")}
    />
  );
}
