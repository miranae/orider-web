import { useId, useState } from "react";
import { useTranslation } from "react-i18next";
import type { BikeThresholdDecision } from "@shared/training/bikeThresholdDecision";
import type { EstimatedFtpPoint } from "@shared/training/ftpProgression";
import type { FtpHistoryEntry } from "@shared/training/ftpHistory";
import { Button, Chip, Text } from "../../theme/components";
import FtpProgressionCard from "../../features/fitness/components/FtpProgressionCard";
import AbilityScoreScale from "../fitness/AbilityScoreScale";

export interface MobileFitnessPdcSummary {
  riderType: { type: string; confidence: number } | null;
  abilityScore: number | null;
  vo2maxEst: number | null;
  activityCount: number | null;
  weightKgSnapshot: number | null;
  version: number | null;
  provenanceVersion: number | null;
  measuredPower: boolean;
  sourceRevision?: string;
  asOf?: string;
}

interface BikePerformanceSummaryCardProps {
  decision?: BikeThresholdDecision;
  pdc?: MobileFitnessPdcSummary | null;
  weightKg?: number;
  progression?: EstimatedFtpPoint[];
  ftpHistory?: FtpHistoryEntry[];
  applying: boolean;
  onApplyCandidate?: (watts: number) => void;
}

const RIDER_TYPE_KEYS = new Set([
  "RoadSprinter", "TrackSprinter", "AllRounder", "Puncher", "Climber", "TimeTrialist", "Unclassified",
]);

function estimateVo2max(ftp: number | null, weightKg: number | undefined): number | null {
  if (!ftp || ftp <= 0 || !weightKg || weightKg <= 0) return null;
  return Math.round((ftp / weightKg) * 15.7 + 3.5);
}

export default function BikePerformanceSummaryCard({ decision, pdc, weightKg, progression = [], ftpHistory = [], applying, onApplyCandidate }: BikePerformanceSummaryCardProps) {
  const { t } = useTranslation("dashboard");
  const [evidenceOpen, setEvidenceOpen] = useState(false);
  const evidenceId = useId();
  const activeFtp = decision?.activeFtpW ?? null;
  const wkg = activeFtp != null && weightKg && weightKg > 0 ? activeFtp / weightKg : null;
  const wkgSummary = activeFtp == null
    ? t("mobileFitness.performance.ftpMissing")
    : wkg != null ? `${wkg.toFixed(2)} W/kg` : t("mobileFitness.performance.weightMissing");
  const ftpEvidence = activeFtp == null
    ? t("mobileFitness.performance.ftpMissingEvidence")
    : wkg != null ? t("mobileFitness.snapshot.ftpSource") : t("mobileFitness.snapshot.ftpWeightMissing");
  const definitive = pdc?.version === 5 && pdc.provenanceVersion === 2 && pdc.measuredPower
    && (pdc.activityCount ?? 0) >= 5 && pdc.weightKgSnapshot != null
    && pdc.riderType != null && pdc.riderType.confidence >= 0.75 && RIDER_TYPE_KEYS.has(pdc.riderType.type)
    && pdc.riderType.type !== "Unclassified";
  const riderType = definitive && pdc?.riderType
    ? t(`fitness:riderType.type.${pdc.riderType.type}.label`)
    : null;
  const vo2max = pdc?.vo2maxEst != null ? Math.round(pdc.vo2maxEst) : estimateVo2max(activeFtp, weightKg);
  const vo2Source = pdc?.vo2maxEst != null ? "pdc" : vo2max != null ? "formula" : null;
  const latestEstimate = decision?.latestMonthlyEstimate ?? null;
  const activeToEstimateDelta = activeFtp != null && latestEstimate != null ? latestEstimate.ftpW - activeFtp : null;
  const evidenceRows = [
    decision?.recentTwentyMinuteW != null ? { label: t("mobileFitness.performance.evidence.twentyMinute"), value: `${decision.recentTwentyMinuteW} W` } : null,
    latestEstimate ? { label: t("mobileFitness.performance.evidence.latestPeriod"), value: latestEstimate.period } : null,
    decision && decision.activityCount > 0 ? { label: t("mobileFitness.performance.evidence.activityCount"), value: t("mobileFitness.performance.evidence.activityCountValue", { count: decision.activityCount }) } : null,
    activeToEstimateDelta != null ? { label: t("mobileFitness.performance.evidence.activeDelta"), value: `${activeToEstimateDelta >= 0 ? "+" : ""}${activeToEstimateDelta} W` } : null,
    pdc?.riderType ? { label: t("mobileFitness.performance.evidence.riderConfidence"), value: `${Math.round(pdc.riderType.confidence * 100)}%` } : null,
  ].filter((row): row is { label: string; value: string } => row != null);
  const metrics = [
    { key: "eftp", label: t("mobileFitness.performance.metrics.eftp"), value: decision?.latestMonthlyEstimate?.ftpW ?? null, unit: "W", status: decision?.latestMonthlyEstimate ? t("mobileFitness.performance.estimated") : t("mobileFitness.performance.insufficient") },
    { key: "cp", label: t("mobileFitness.performance.metrics.cp"), value: decision?.cpW ?? null, unit: "W", status: decision?.cpW != null ? t("mobileFitness.performance.estimated") : t("mobileFitness.performance.insufficient") },
    { key: "tte", label: t("mobileFitness.performance.metrics.tte"), value: decision?.tteMin ?? null, unit: t("fitness:thresholdDecision.minuteUnit"), status: decision?.tteMin != null ? t("mobileFitness.performance.estimated") : t("mobileFitness.performance.insufficient") },
    { key: "vo2max", label: "VO₂max", value: vo2max, unit: "ml/kg/min", status: vo2max != null ? t("mobileFitness.performance.estimated") : t("mobileFitness.performance.insufficient") },
  ];
  return (
    <section aria-label={t("mobileFitness.performance.ariaLabel")} style={{ marginBottom: "var(--space-3)", padding: "var(--space-5) var(--space-4)", background: "var(--bg-1)", borderTop: "1px solid var(--line-soft)", borderBottom: "1px solid var(--line-soft)" }}>
      <Text as="h2" variant="title" style={{ margin: 0 }}>{t("mobileFitness.performance.title")}</Text>
      <Text as="div" variant="eyebrow" tone="secondary" style={{ marginTop: "var(--space-4)" }}>{t("fitness:thresholdDecision.activeLabel")}</Text>
      <div style={{ display: "flex", alignItems: "baseline", gap: "var(--space-2)", marginTop: "var(--space-1)" }}>
        <Text as="span" variant="dataHero" style={{ color: "var(--lime)" }}>{activeFtp ?? "—"}</Text>
        {activeFtp != null && <Text as="span" variant="unit">W</Text>}
      </div>
      <div style={{ display: "flex", alignItems: "center", justifyContent: "space-between", gap: "var(--space-3)", marginTop: "var(--space-2)" }}>
        <Text as="span" variant="mono">{wkgSummary}</Text>
        <Text as="span" variant="caption" tone="tertiary">{t("mobileFitness.performance.canonical")}</Text>
      </div>

      <div style={{ display: "flex", flexWrap: "wrap", gap: "var(--space-2)", marginTop: "var(--space-4)" }}>
        <Chip variant={riderType ? "accent" : "default"} dot={!!riderType}>{riderType ?? t("mobileFitness.performance.riderUnknown")}</Chip>
      </div>
      <div style={{ marginTop: "var(--space-3)" }}>
        <Text as="div" variant="caption" tone="secondary" style={{ marginBottom: "var(--space-1)" }}>{t("mobileFitness.performance.abilityLabel")}</Text>
        {pdc?.abilityScore != null
          ? <AbilityScoreScale
              score={pdc.abilityScore}
              ariaLabel={t("mobileFitness.performance.abilityScoreAria")}
              accentColor="var(--lime)"
            />
          : <Text as="div" variant="label">{t("mobileFitness.performance.abilityUnknown")}</Text>}
      </div>
      <div style={{ display: "grid", gridTemplateColumns: "repeat(2, minmax(0, 1fr))", gap: "var(--space-2)", marginTop: "var(--space-4)" }}>
        {metrics.map((metric) => (
          <div key={metric.key} data-performance-metric={metric.key} style={{ minWidth: 0, padding: "var(--space-3)", borderRadius: "var(--r-md)", background: "var(--bg-2)", border: "1px solid var(--line-soft)" }}>
            <Text as="div" variant="caption" tone="secondary">{metric.label}</Text>
            <div style={{ display: "flex", flexWrap: "wrap", alignItems: "baseline", gap: "var(--space-1)", marginTop: "var(--space-1)" }}>
              <Text as="span" variant="dataLarge" style={{ whiteSpace: "nowrap" }}>{metric.value ?? "—"}</Text>
              {metric.value != null && <Text as="span" variant="unit" style={{ whiteSpace: "nowrap" }}>{metric.unit}</Text>}
            </div>
            <Text as="div" variant="caption" tone="tertiary" style={{ marginTop: "var(--space-1)" }}>{metric.status}</Text>
          </div>
        ))}
      </div>

      <FtpProgressionCard points={progression} history={ftpHistory} currentFtpW={activeFtp} breakthrough={null} embedded compact />

      {decision?.automaticCandidateW != null && onApplyCandidate && (
        <div style={{ marginTop: "var(--space-4)", padding: "var(--space-4)", borderRadius: "var(--r-md)", background: "var(--accent-soft-bg)", border: "1px solid var(--accent-soft-border)" }}>
          <Text as="div" variant="eyebrow" style={{ color: "var(--aqua)" }}>{t("fitness:thresholdDecision.candidateLabel")}</Text>
          <div style={{ display: "flex", alignItems: "baseline", gap: "var(--space-1)", margin: "var(--space-1) 0 var(--space-3)" }}>
            <Text variant="dataLarge">{decision.automaticCandidateW}</Text><Text variant="unit">W</Text>
          </div>
          <Button variant="primary" size="sm" disabled={applying} onClick={() => onApplyCandidate(decision.automaticCandidateW!)} style={{ width: "100%" }}>
            {t(applying ? "fitness:thresholdDecision.applying" : "fitness:thresholdDecision.apply")}
          </Button>
        </div>
      )}

      <Button variant="secondary" size="sm" aria-expanded={evidenceOpen} aria-controls={evidenceId} onClick={() => setEvidenceOpen((open) => !open)} style={{ width: "100%", marginTop: "var(--space-4)" }}>
        {t(evidenceOpen ? "mobileFitness.performance.evidenceClose" : "mobileFitness.performance.evidenceOpen")}
      </Button>
      <div id={evidenceId} hidden={!evidenceOpen} style={{ marginTop: "var(--space-3)", display: evidenceOpen ? "grid" : undefined, gap: "var(--space-2)" }}>
        {evidenceRows.length > 0
          ? evidenceRows.map((row) => <EvidenceRow key={row.label} label={row.label} value={row.value} />)
          : <Text as="p" variant="caption" tone="secondary">{t("mobileFitness.performance.insufficient")}</Text>}
        <Text as="p" variant="caption" tone="secondary">{ftpEvidence}</Text>
        <Text as="p" variant="caption" tone="secondary">{t("mobileFitness.snapshot.riderSource")}</Text>
        <Text as="p" variant="caption" tone="secondary">
          {vo2Source === "pdc" ? t("mobileFitness.snapshot.vo2PdcSource", { count: pdc?.activityCount ?? 0 }) : vo2Source === "formula" ? t("mobileFitness.snapshot.vo2FormulaSource") : t("mobileFitness.snapshot.insufficient")}
        </Text>
        <Text as="p" variant="caption" tone="secondary">{t("mobileFitness.performance.modelEvidence")}</Text>
        <a href="/web-manual/ch06-advanced.html#s6-3" style={{ color: "var(--aqua)", fontWeight: 600 }}>
          {t("mobileFitness.sport.bike.manualLink")}
        </a>
      </div>
    </section>
  );
}

function EvidenceRow({ label, value }: { label: string; value: string }) {
  return (
    <div style={{ display: "flex", alignItems: "baseline", justifyContent: "space-between", gap: "var(--space-3)", paddingBottom: "var(--space-2)", borderBottom: "1px solid var(--line-soft)" }}>
      <Text variant="caption" tone="secondary">{label}</Text>
      <Text variant="mono" style={{ textAlign: "right" }}>{value}</Text>
    </div>
  );
}
