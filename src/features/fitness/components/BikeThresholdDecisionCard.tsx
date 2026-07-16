import { useState } from "react";
import { ChevronDown, ChevronUp } from "lucide-react";
import type { BikeThresholdDecision } from "@shared/training/bikeThresholdDecision";
import type { EstimatedFtpPoint } from "@shared/training/ftpProgression";
import type { FtpHistoryEntry } from "@shared/training/ftpHistory";
import { LocalizedLink } from "../../../components/LocalizedLink";
import { Card, Text, buttonClass } from "../../../theme/components";
import FtpProgressionCard from "./FtpProgressionCard";

type T = (key: string, values?: Record<string, unknown>) => string;

export default function BikeThresholdDecisionCard({
  decision,
  hasZoneData,
  applying,
  onApplyCandidate,
  progressionPoints = [],
  ftpHistory = [],
  defaultEvidenceOpen = false,
  t,
}: {
  decision: BikeThresholdDecision;
  hasZoneData: boolean;
  applying: boolean;
  onApplyCandidate: (watts: number) => void;
  progressionPoints?: EstimatedFtpPoint[];
  ftpHistory?: FtpHistoryEntry[];
  defaultEvidenceOpen?: boolean;
  t: T;
}) {
  const [evidenceOpen, setEvidenceOpen] = useState(defaultEvidenceOpen);
  const missingPdc = decision.automaticCandidateW == null && decision.cpW == null;
  const evidence = [
    { id: "cp", value: decision.cpW, label: t("thresholdDecision.evidence.cp"), sub: t("thresholdDecision.evidence.cpSub") },
    { id: "twenty", value: decision.recentTwentyMinuteW, label: t("thresholdDecision.evidence.twenty"), sub: t("thresholdDecision.evidence.twentySub") },
    { id: "monthly", value: decision.latestMonthlyEstimate?.ftpW ?? null, label: t("thresholdDecision.evidence.monthly"), sub: decision.latestMonthlyEstimate ? t("thresholdDecision.evidence.monthlySub", { period: decision.latestMonthlyEstimate.period }) : t("thresholdDecision.missing") },
    { id: "tte", value: decision.tteMin, label: t("thresholdDecision.evidence.tte"), sub: t("thresholdDecision.evidence.tteSub") },
  ];

  return (
    <Card padding="none" style={{ marginTop: "var(--space-4)", padding: "var(--space-5)" }}>
      <Text as="div" variant="eyebrow" style={{ color: "var(--aqua)" }}>{t("thresholdDecision.eyebrow")}</Text>
      <div style={{ display: "grid", gridTemplateColumns: "repeat(auto-fit, minmax(220px, 1fr))", gap: "var(--space-4)", marginTop: "var(--space-3)" }}>
        <div>
          <Text as="div" variant="caption" tone="secondary">{t("thresholdDecision.activeLabel")}</Text>
          <div style={{ display: "flex", alignItems: "baseline", gap: "var(--space-1)" }}>
            <Text variant="dataHero" style={{ color: "var(--lime)" }}>{decision.activeFtpW ?? "—"}</Text>
            {decision.activeFtpW != null && <Text variant="unit">W</Text>}
          </div>
          <Text as="p" variant="bodySmall" tone="secondary" style={{ margin: "var(--space-1) 0 0" }}>{t("thresholdDecision.activeSub")}</Text>
        </div>

        <div style={{ padding: "var(--space-3)", border: "1px solid var(--line-soft)", borderRadius: "var(--r-md)", background: "var(--bg-0)" }}>
          <Text as="div" variant="caption" tone="secondary">{t("thresholdDecision.candidateLabel")}</Text>
          <div style={{ display: "flex", alignItems: "baseline", gap: "var(--space-1)" }}>
            <Text variant="dataLarge" style={{ color: "var(--aqua)" }}>{decision.automaticCandidateW ?? "—"}</Text>
            {decision.automaticCandidateW != null && <Text variant="unit">W</Text>}
          </div>
          <Text as="p" variant="caption" tone="tertiary" style={{ margin: "var(--space-1) 0 var(--space-3)" }}>
            {decision.automaticCandidateW != null
              ? t("thresholdDecision.candidateSub", { count: decision.activityCount })
              : t("thresholdDecision.noCandidate")}
          </Text>
          {decision.automaticCandidateW != null && (
            <button
              type="button"
              className={buttonClass({ variant: "primary", size: "sm" })}
              style={{ minHeight: 44 }}
              disabled={applying}
              aria-label={t("thresholdDecision.applyAria", { value: decision.automaticCandidateW })}
              onClick={() => onApplyCandidate(decision.automaticCandidateW!)}
            >
              {t(applying ? "thresholdDecision.applying" : "thresholdDecision.apply")}
            </button>
          )}
        </div>
      </div>

      <button
        type="button"
        aria-expanded={evidenceOpen}
        aria-controls="bike-threshold-evidence"
        onClick={() => setEvidenceOpen((value) => !value)}
        style={{ minHeight: 44, width: "100%", marginTop: "var(--space-4)", display: "flex", alignItems: "center", justifyContent: "space-between", padding: "0 var(--space-3)", border: "1px solid var(--line-soft)", borderRadius: "var(--r-md)", background: "var(--bg-1)", color: "var(--ink-1)" }}
      >
        <Text as="span" variant="label">{t("thresholdDecision.evidenceToggle")}</Text>
        {evidenceOpen ? <ChevronUp size={18} aria-hidden /> : <ChevronDown size={18} aria-hidden />}
      </button>
      <div id="bike-threshold-evidence" hidden={!evidenceOpen} style={{ marginTop: "var(--space-2)" }}>
        {evidence.map((item) => (
          <div key={item.id} style={{ minHeight: 44, display: "grid", gridTemplateColumns: "minmax(120px, 1fr) auto", alignItems: "center", gap: "var(--space-3)", padding: "var(--space-2) var(--space-3)", borderBottom: "1px solid var(--line-soft)" }}>
            <div>
              <Text as="div" variant="label">{item.label}</Text>
              <Text as="div" variant="caption" tone="tertiary">{item.sub}</Text>
            </div>
            <Text variant="mono">{item.value != null ? `${item.value}${item.id === "tte" ? t("thresholdDecision.minuteUnit") : " W"}` : "—"}</Text>
          </div>
        ))}
        <FtpProgressionCard
          points={progressionPoints}
          history={ftpHistory}
          currentFtpW={decision.activeFtpW}
          breakthrough={null}
          embedded
        />
      </div>

      {(decision.activeFtpW == null || missingPdc || !hasZoneData) && (
        <div style={{ marginTop: "var(--space-4)", display: "grid", gap: "var(--space-2)" }}>
          <Text as="div" variant="eyebrow">{t("thresholdDecision.actionsTitle")}</Text>
          {decision.activeFtpW == null && <ActionLink to="/settings?section=training" label={t("thresholdDecision.action.setFtp")} />}
          {missingPdc && <ActionLink to="/log" label={t("thresholdDecision.action.addPowerRide")} />}
          {!hasZoneData && <ActionLink to="/log" label={t("thresholdDecision.action.addZoneData")} />}
        </div>
      )}
    </Card>
  );
}

function ActionLink({ to, label }: { to: string; label: string }) {
  return (
    <LocalizedLink to={to} className={buttonClass({ variant: "secondary", size: "sm" })} style={{ minHeight: 44, justifyContent: "flex-start" }}>
      {label}
    </LocalizedLink>
  );
}
