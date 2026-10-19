import type { ActivityMetrics } from "@shared/types/activity-metrics";
import { useTranslation } from "react-i18next";
import { Card, ChartHeader, Progress, Text } from "../../../theme";
import "./FitnessZoneDistributions.css";

export interface FitnessZoneSeries {
  counts: number[] | null;
  total: number;
  recordCount: number;
  missingCount: number;
}
export interface FitnessZoneEvidence {
  windowDays: number;
  startTime: number;
  endTime: number;
  hr: FitnessZoneSeries & { boundaries: ActivityMetrics["hrZoneBoundaries"] | null };
  power: FitnessZoneSeries;
}

export function FitnessZoneDistributions({ evidence }: { evidence: FitnessZoneEvidence }) {
  const { t, i18n } = useTranslation("fitness");
  const date = (time: number) => new Date(time).toLocaleDateString(i18n.language);
  return <div className="fitness-zone-evidence">
    {(["hr", "power"] as const).map(kind => {
      const series = evidence[kind];
      const boundaries = kind === "hr" ? evidence.hr.boundaries : null;
      const names = kind === "hr" ? ["hrZone.recovery", "hrZone.endurance", "hrZone.tempo", "hrZone.threshold", "hrZone.vo2max"]
        : ["zone.recovery", "zone.endurance", "zone.tempo", "zone.threshold", "zone.vo2max", "zone.anaerobic", "zone.neuromuscular"];
      return <Card key={kind} className="fitness-zone-evidence__card">
        <ChartHeader size="compact" title={<h3>{t(`zoneEvidence.${kind}`)}</h3>} />
        <Text as="p" variant="body" tone="secondary">{t("zoneEvidence.period", { days: evidence.windowDays, start: date(evidence.startTime), end: date(evidence.endTime) })}</Text>
        <Text as="p" variant="body" tone="secondary">{t("zoneEvidence.records", { count: series.recordCount, missing: series.missingCount })}</Text>
        {boundaries && <Text as="p" variant="body">{t("zoneEvidence.hrBasis", { reference: boundaries.reference === "lthr" ? "LTHR" : "maxHR", value: boundaries.referenceBpm })}</Text>}
        {series.counts ? <ol className="fitness-zone-evidence__zones">
          {series.counts.map((seconds, index) => {
            const percent = series.total > 0 ? seconds / series.total * 100 : null;
            const bound = boundaries?.zones.find(zone => zone.zone === index + 1);
            return <li key={index}>
              <div className="fitness-zone-evidence__label"><strong>Z{index + 1} · {t(names[index]!)}</strong></div>
              {bound && <span className="fitness-zone-evidence__boundary">{bound.minBpm}–{bound.maxBpmExclusive == null ? "∞" : `<${bound.maxBpmExclusive}`} bpm · {bound.minPct}–{bound.maxPct ?? "∞"}% {boundaries!.reference === "lthr" ? "LTHR" : "maxHR"}</span>}
              <Progress value={(percent ?? 0) / 100} aria-label={`Z${index + 1} · ${t(names[index]!)}`} />
              <span className="fitness-zone-evidence__duration">{t("zoneEvidence.duration", { seconds: seconds.toLocaleString(i18n.language), percent: percent == null ? "—" : percent.toLocaleString(i18n.language, { maximumFractionDigits: 1 }) })}</span>
            </li>;
          })}
        </ol> : <Text as="p" variant="body">{t("zoneEvidence.unknown")}</Text>}
        <Text as="p" variant="body" tone="secondary" className="fitness-zone-evidence__basis">{t("zoneEvidence.recordBasis")}</Text>
      </Card>;
    })}
  </div>;
}
