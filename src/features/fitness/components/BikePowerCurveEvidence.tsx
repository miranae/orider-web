import type { ReactNode } from "react";
import { useTranslation } from "react-i18next";
import { Card, ChartFrame, ChartHeader, ChartLegend, Stat, Text } from "../../../theme";
import type { PowerCurvePoint } from "../fitnessPageUtils";
import PowerCurveChart from "./PowerCurveChart";

export function BikePowerCurveEvidence({ current, previous, expected, emptyContent }: {
  current: PowerCurvePoint[];
  previous: PowerCurvePoint[];
  expected?: PowerCurvePoint[];
  emptyContent?: ReactNode;
}) {
  const { t } = useTranslation("fitness");
  const keyDurations = [5, 60, 300, 1200];
  const keyLabels = ["sprint", "anaerobic", "vo2", "ftp"];
  const keyNames = ["5s", "1m", "5m", "20m"];
  return <Card className="bike-power-curve-evidence">
    <ChartHeader size="compact" title={<h3>{t("powerCurve.title")}</h3>} description={t("powerCurve.sub")} />
    <ChartLegend items={[
      { label: t("period.recent"), color: "var(--lime)" },
      ...(previous.length > 0 ? [{ label: t("powerCurve.prevSeason"), color: "var(--ink-4)", dasharray: "4 4" }] : []),
      ...(expected?.length ? [{ label: t("powerCurve.expectedLegend"), color: "var(--aqua)", dasharray: "2 3" }] : []),
    ]} />
    <ChartFrame variant="embedded">
    {current.length > 0 ? <div data-testid="K5-2-1"><PowerCurveChart current={current} previous={previous} expected={expected} /></div>
      : <div className="bike-power-curve-evidence__empty">{emptyContent ?? <Text as="p" variant="bodySmall" tone="secondary">{t("powerCurve.empty")}</Text>}</div>}
    </ChartFrame>
    <div data-testid="K5-2-2" className="bike-power-curve-evidence__keys">{keyDurations.map((duration, index) => {
      const value = current.find(point => point.durationSeconds === duration)?.maxPower;
      return <Stat compact key={duration} label={`${t(`powerCurve.duration.${keyNames[index]}`)} · ${t(`powerCurve.label.${keyLabels[index]}`)}`} value={value == null ? "—" : value.toLocaleString()} unit={value == null ? undefined : "W"} />;
    })}</div>
  </Card>;
}
