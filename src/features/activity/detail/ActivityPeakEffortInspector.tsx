import { useId, useState } from "react";
import { useTranslation } from "react-i18next";
import type { ActivityMetrics, RidePeakEffort } from "@shared/types/activity-metrics";
import { ChevronDown, ChevronUp } from "lucide-react";
import "./activity-personal-benchmark.css";
import { Button, Text } from "../../../theme/components";
import { useLocale } from "../../../contexts/LocaleContext";
import { visiblePeakEfforts } from "./activityPeakEfforts";

interface Props {
  activityId: string;
  metrics: ActivityMetrics | null;
  isOwner: boolean;
  invalidated?: boolean;
  onLocate?: (peak: RidePeakEffort | null) => void;
  locating?: boolean;
  locationUnavailable?: boolean;
  chartOnly?: boolean;
  suppressHeartRate?: boolean;
  suppressCadence?: boolean;
}

/** 활동·사용자가 바뀌면 key 경계 안의 열림/선택 상태도 함께 폐기한다. */
export default function ActivityPeakEffortInspector(props: Props) {
  const peaks = visiblePeakEfforts(props.metrics, props.isOwner, props.invalidated);
  if (!peaks.length) return null;
  return <PeakEffortContent key={`${props.activityId}:${props.metrics?.computedAt ?? ""}`} {...props} peaks={peaks} />;
}

function PeakEffortContent({ metrics, peaks, onLocate, locating, locationUnavailable, chartOnly, suppressHeartRate, suppressCadence }: Props & { peaks: RidePeakEffort[] }) {
  const { t } = useTranslation("activity");
  const { units } = useLocale();
  const [opened, setOpened] = useState(false);
  const id = useId();
  const [duration, setDuration] = useState(peaks[0]!.durationSec);
  const peak = peaks.find(value => value.durationSec === duration) ?? peaks[0]!;
  const number = (value: number | null | undefined, unit: string, factor = 1, digits = 0) =>
    value != null && Number.isFinite(value) && value >= 0 ? `${(value * factor).toFixed(digits)} ${unit}` : "—";
  const time = (seconds: number) => `${Math.floor(seconds / 60)}:${String(Math.floor(seconds % 60)).padStart(2, "0")}`;
  const speedUnit = units === "imperial" ? "mph" : "km/h";
  const speedFactor = units === "imperial" ? 1 / 1.609344 : 1;
  const route = metrics?.peakEfforts?.indexAxis === "route" && Number.isFinite(peak.fromKm)
    && Number.isFinite(peak.toKm) && peak.fromKm >= 0 && peak.toKm > peak.fromKm;
  const rows = [
    [t("peakInspector.power"), number(peak.avgPowerW, "W"), number(peak.maxPowerW, "W")],
    [t("peakInspector.heartRate"), number(suppressHeartRate ? null : peak.avgHr, "bpm"), number(suppressHeartRate ? null : peak.maxHr, "bpm")],
    [t("peakInspector.speed"), number(peak.avgSpeedKmh, speedUnit, speedFactor, 1), number(peak.maxSpeedKmh, speedUnit, speedFactor, 1)],
    [t("peakInspector.cadence"), number(suppressCadence ? null : peak.avgCadence, "rpm"), "—"],
  ];
  return <section className="space-y-4" aria-label={t("peakInspector.title")}>
    <Button variant="ghost" size="sm" aria-expanded={opened} aria-controls={id} onClick={() => {
      setOpened(value => !value);
      if (opened) onLocate?.(null);
    }}><Text variant="subtitle">{t("peakInspector.title")}</Text>{opened ? <ChevronUp aria-hidden="true" size={16} /> : <ChevronDown aria-hidden="true" size={16} />}</Button>
    {opened && <div id={id} className="activity-peak-reading space-y-4">
      <p className="text-[length:var(--fs-sm)]" style={{ color: "var(--ink-2)" }}>{t("peakInspector.description")}</p>
      <div className="flex flex-wrap gap-2" role="group" aria-label={t("peakInspector.duration")}>
        {peaks.map(value => <Button key={value.durationSec} variant={peak.durationSec === value.durationSec ? "primary" : "outline"}
          size="sm" aria-pressed={peak.durationSec === value.durationSec} onClick={() => {
            setDuration(value.durationSec); onLocate?.(null);
          }}>{t("peakInspector.minutes", { count: value.durationSec / 60 })}</Button>)}
      </div>
      <p className="text-[length:var(--fs-sm)] tabular-nums" style={{ color: "var(--ink-1)" }}>
        {t("peakInspector.window", { start: time(peak.startOffsetSec), end: time(peak.startOffsetSec + peak.durationSec) })}
        {route && <> · {number(peak.fromKm, units === "imperial" ? "mi" : "km", speedFactor, 2)}–{number(peak.toKm, units === "imperial" ? "mi" : "km", speedFactor, 2)}</>}
      </p>
      <table className="w-full text-[length:var(--fs-sm)] tabular-nums">
        <caption className="sr-only">{t("peakInspector.title")}</caption>
        <thead><tr style={{ color: "var(--ink-2)" }}><th className="text-left py-2">{t("peakInspector.metric")}</th>
          <th className="text-right py-2">{t("peakInspector.average")}</th><th className="text-right py-2">{t("peakInspector.maximum")}</th></tr></thead>
        <tbody>{rows.map(([label, average, maximum]) => <tr key={label} style={{ borderTop: "1px solid var(--line-soft)" }}>
          <th scope="row" className="text-left py-3 font-normal" style={{ color: "var(--ink-2)" }}>{label}</th>
          <td className="text-right py-3 whitespace-nowrap" style={{ color: "var(--ink-0)" }}>{average}</td>
          <td className="text-right py-3 whitespace-nowrap" style={{ color: "var(--ink-0)" }}>{maximum}</td>
        </tr>)}</tbody>
      </table>
      {route && onLocate && !locationUnavailable ? <Button variant="outline" size="sm" disabled={locating} onClick={() => onLocate(peak)}>
        {t(locating ? "peakInspector.loadingLocation" : chartOnly ? "peakInspector.chartLocation" : "peakInspector.location")}</Button>
        : <p className="text-[length:var(--fs-sm)]" style={{ color: "var(--ink-2)" }}>{t("peakInspector.noLocation")}</p>}
    </div>}
  </section>;
}
