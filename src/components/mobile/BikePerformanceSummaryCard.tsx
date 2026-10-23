import { estimateVo2max } from "../../features/fitness/estimateVo2max";
import FitnessPdcProfile from "../../features/fitness/components/FitnessPdcProfile";
import GlossaryText from "../common/GlossaryText";
import { useId, useState } from "react";
import { useTranslation } from "react-i18next";
import type { BikeThresholdDecision } from "@shared/training/bikeThresholdDecision";
import type { EstimatedFtpPoint } from "@shared/training/ftpProgression";
import type { FtpHistoryEntry } from "@shared/training/ftpHistory";
import type { BikeThresholdDecisionV2, FtpDeviceReceipt, FtpMutationReceipt } from "@shared/types/threshold";
import { Button, Chip, Section, Stat, Text } from "../../theme/components";
import FtpProgressionCard from "../../features/fitness/components/FtpProgressionCard";
import BikeFtpDecisionActionPanel from "../../features/fitness/components/BikeFtpDecisionActionPanel";
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
  compact?: boolean;
  stableDetails?: boolean;
  part?: "all" | "condition" | "analysis";
  decision?: BikeThresholdDecision;
  pdc?: MobileFitnessPdcSummary | null;
  weightKg?: number;
  progression?: EstimatedFtpPoint[];
  ftpHistory?: FtpHistoryEntry[];
  ftpDecision?: BikeThresholdDecisionV2 | null;
  ftpReceipt?: FtpMutationReceipt | null;
  ftpDeviceReceipts?: FtpDeviceReceipt[];
  decisionBusy?: boolean;
  onAcceptDecision?: () => void;
}

const RIDER_TYPE_KEYS = new Set([
  "RoadSprinter", "TrackSprinter", "AllRounder", "Puncher", "Climber", "TimeTrialist", "Unclassified",
]);


export default function BikePerformanceSummaryCard({ part = "all", compact = false, stableDetails = false, decision, pdc, weightKg, progression = [], ftpHistory = [], ftpDecision = null, ftpReceipt = null, ftpDeviceReceipts = [], decisionBusy = false, onAcceptDecision = () => undefined }: BikePerformanceSummaryCardProps) {
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
  const definitive = (pdc?.version === 5 || pdc?.version === 6) && pdc.provenanceVersion === 2 && pdc.measuredPower
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
    part !== "condition" && pdc?.riderType ? { label: t("mobileFitness.performance.evidence.riderConfidence"), value: `${Math.round(pdc.riderType.confidence * 100)}%` } : null,
  ].filter((row): row is { label: string; value: string } => row != null);
  const metrics = [
    { key: "eftp", label: t("mobileFitness.performance.metrics.eftp"), value: decision?.latestMonthlyEstimate?.ftpW ?? null, unit: "W", status: decision?.latestMonthlyEstimate ? t("mobileFitness.performance.estimated") : t("mobileFitness.performance.insufficient") },
    { key: "cp", label: t("mobileFitness.performance.metrics.cp"), value: decision?.cpW ?? null, unit: "W", status: decision?.cpW != null ? t("mobileFitness.performance.estimated") : t("mobileFitness.performance.insufficient") },
    { key: "tte", label: t("mobileFitness.performance.metrics.tte"), value: decision?.tteMin ?? null, unit: t("fitness:thresholdDecision.minuteUnit"), status: decision?.tteMin != null ? t("mobileFitness.performance.estimated") : t("mobileFitness.performance.insufficient") },
    { key: "vo2max", label: "VO₂max", value: vo2max, unit: "ml/kg/min", status: vo2max != null ? t("mobileFitness.performance.estimated") : t("mobileFitness.performance.insufficient") },
  ];
  const displayedMetrics = metrics.filter(metric => metric.key !== "vo2max" || part !== "analysis" && (part !== "condition" || pdc?.vo2maxEst == null));
  const missingMetrics = displayedMetrics.filter(metric => metric.value == null);
  return (
    <Section className="mobile-fitness-performance" title={<GlossaryText>{t("mobileFitness.performance.title")}</GlossaryText>} aria-label={t("mobileFitness.performance.ariaLabel")}>
      {part !== "analysis" && <>
      <Text as="div" variant="eyebrow" tone="secondary" style={{ marginTop: "var(--space-3)" }}><GlossaryText>{t("fitness:thresholdDecision.activeLabel")}</GlossaryText></Text>
      <div className="mobile-fitness-performance__ftp">
        <Text as="span" variant="dataHero" style={{ color: "var(--lime)" }}>{activeFtp ?? "—"}</Text>
        {activeFtp != null && <Text as="span" variant="unit">W</Text>}
      </div>
      <div className="mobile-fitness-performance__profile">
        <Text as="span" variant="mono"><GlossaryText>{wkgSummary}</GlossaryText></Text>
        <Text as="span" variant="caption" tone="tertiary"><GlossaryText>{t("mobileFitness.performance.canonical")}</GlossaryText></Text>
      </div>

      </>}
      {part === "condition" ? <FitnessPdcProfile pdc={pdc} /> : <>
      <div style={{ display: "flex", flexWrap: "wrap", gap: "var(--space-2)", marginTop: "var(--space-3)" }}>
        {riderType ? <Chip variant="accent" dot>{riderType}</Chip> : <Text variant="bodySmall"><GlossaryText>{t("mobileFitness.performance.riderUnknown")}</GlossaryText></Text>}
      </div>
      <div style={{ marginTop: "var(--space-3)" }}>
        <Text as="div" variant="caption" tone="secondary" style={{ marginBottom: "var(--space-1)" }}><GlossaryText>{t("mobileFitness.performance.abilityLabel")}</GlossaryText></Text>
        {pdc?.abilityScore != null
          ? <AbilityScoreScale
              score={pdc.abilityScore}
              ariaLabel={t("mobileFitness.performance.abilityScoreAria")}
              accentColor="var(--lime)"
            />
          : <Text as="div" variant="body"><GlossaryText>{t("mobileFitness.performance.abilityUnknown")}</GlossaryText></Text>}
      </div>
      </>}
      <div className="mobile-fitness-performance__metrics">
        {displayedMetrics.filter(metric => !compact || metric.value != null).map((metric) => (
          <div key={metric.key} data-performance-metric={metric.key} className="mobile-fitness-performance__metric">
            <Stat compact label={<GlossaryText>{metric.label}</GlossaryText>} value={metric.value ?? "—"} unit={metric.value == null ? undefined : metric.unit} />
            <Text as="div" variant="caption" tone="tertiary" style={{ marginTop: "var(--space-1)" }}><GlossaryText>{metric.status}</GlossaryText></Text>
          </div>
        ))}
      </div>

      {compact && missingMetrics.length > 0 && <Text as="p" variant="bodySmall" tone="secondary" style={{ marginTop: "var(--space-3)" }}>
        <GlossaryText>{t("mobileFitness.performance.missingMetrics", { metrics: missingMetrics.map(metric => metric.label).join(" · ") })}</GlossaryText>
      </Text>}
      {part === "condition" && <div className="mobile-fitness-performance__candidate" style={{ marginTop: "var(--space-3)" }}>
        <Text as="h3" variant="subtitle">{t("fitness:thresholdDecision.candidateLabel")}</Text>
        {(!compact || decision?.automaticCandidateW != null) && <Text as="div" variant="dataMedium">{decision?.automaticCandidateW ?? "—"}{decision?.automaticCandidateW != null ? " W" : ""}</Text>}
        <Text as="p" variant="caption" tone="secondary">{decision?.automaticCandidateW != null ? t("fitness:thresholdDecision.candidateSub", { count: decision.activityCount }) : t("fitness:thresholdDecision.noCandidate")}</Text>
        <Text as="p" variant="caption" tone="secondary">{t("fitness:thresholdDecision.modelOnly")}</Text>
      </div>}
      {part !== "analysis" && <>
      <div className="mobile-fitness-performance__trend"><FtpProgressionCard points={progression} history={ftpHistory} currentFtpW={activeFtp} breakthrough={null} embedded compact stableSelection={stableDetails} showHistory={part === "condition" || stableDetails} /></div>

      <BikeFtpDecisionActionPanel
        decision={ftpDecision}
        receipt={ftpReceipt}
        deviceReceipts={ftpDeviceReceipts}
        busy={decisionBusy}
        onAccept={onAcceptDecision}
      />

      </>}
      {part !== "condition" && <Button variant="secondary" size="sm" aria-expanded={evidenceOpen} aria-controls={evidenceId} onClick={() => setEvidenceOpen((open) => !open)} style={{ width: "100%", marginTop: "var(--space-4)" }}>
        {t(evidenceOpen ? "mobileFitness.performance.evidenceClose" : "mobileFitness.performance.evidenceOpen")}
      </Button>}
      <div id={evidenceId} hidden={part !== "condition" && !evidenceOpen} style={{ marginTop: "var(--space-3)", display: evidenceOpen || part === "condition" ? "grid" : undefined, gap: "var(--space-2)" }}>
        {evidenceRows.length > 0
          ? evidenceRows.map((row) => <EvidenceRow key={row.label} label={row.label} value={row.value} />)
          : <Text as="p" variant="caption" tone="secondary"><GlossaryText>{t("mobileFitness.performance.insufficient")}</GlossaryText></Text>}
        <Text as="p" variant="caption" tone="secondary"><GlossaryText>{ftpEvidence}</GlossaryText></Text>
        {part !== "condition" && <Text as="p" variant="caption" tone="secondary"><GlossaryText>{t("mobileFitness.snapshot.riderSource")}</GlossaryText></Text>}
        <Text as="p" variant="caption" tone="secondary">
          <GlossaryText>{vo2Source === "pdc" ? t("mobileFitness.snapshot.vo2PdcSource", { count: pdc?.activityCount ?? 0 }) : vo2Source === "formula" ? t("mobileFitness.snapshot.vo2FormulaSource") : t("mobileFitness.snapshot.insufficient")}</GlossaryText>
        </Text>
        <Text as="p" variant="caption" tone="secondary"><GlossaryText>{t("mobileFitness.performance.modelEvidence")}</GlossaryText></Text>
        <a href="/web-manual/ch06-advanced.html#s6-3" style={{ color: "var(--aqua)", fontWeight: 600 }}>
          {t("mobileFitness.sport.bike.manualLink")}
        </a>
      </div>
    </Section>
  );
}

function EvidenceRow({ label, value }: { label: string; value: string }) {
  return (
    <div style={{ display: "flex", alignItems: "baseline", justifyContent: "space-between", gap: "var(--space-3)", paddingBottom: "var(--space-2)", borderBottom: "1px solid var(--line-soft)" }}>
      <Text variant="caption" tone="secondary"><GlossaryText>{label}</GlossaryText></Text>
      <Text variant="mono" style={{ textAlign: "right" }}><GlossaryText>{value}</GlossaryText></Text>
    </div>
  );
}
