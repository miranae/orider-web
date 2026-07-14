import { useTranslation } from "react-i18next";
import type { CyclingAbilityResult, RunEvidence, SwimEvidence } from "../../features/fitness/multisportPerformance";
import type { Discipline } from "../../utils/disciplineFilter";
import { Text } from "../../theme/components";
import CyclingAbilityCard from "../fitness/CyclingAbilityCard";
import type { CohortDistributions } from "../../hooks/useCohortPercentiles";

function formatDuration(seconds: number) {
  const roundedSeconds = Math.round(seconds);
  const hours = Math.floor(roundedSeconds / 3600);
  const minutes = Math.floor((roundedSeconds % 3600) / 60);
  const secs = roundedSeconds % 60;
  return hours > 0
    ? `${hours}:${String(minutes).padStart(2, "0")}:${String(secs).padStart(2, "0")}`
    : `${minutes}:${String(secs).padStart(2, "0")}`;
}

function formatPace(seconds: number) {
  const roundedSeconds = Math.round(seconds);
  const minutes = Math.floor(roundedSeconds / 60);
  return `${minutes}:${String(roundedSeconds % 60).padStart(2, "0")}`;
}

export default function SportPerformanceCard({
  discipline,
  cycling,
  run,
  swim,
  distributions,
  cohortComputedAt,
}: {
  discipline: Discipline;
  cycling: CyclingAbilityResult | null;
  run: RunEvidence;
  swim: SwimEvidence;
  distributions?: CohortDistributions | null;
  cohortComputedAt?: number | null;
}) {
  const { t } = useTranslation("dashboard");
  if (discipline === "tri") return null;
  if (discipline === "bike") return <CyclingAbilityCard cycling={cycling} distributions={distributions} cohortComputedAt={cohortComputedAt} />;

  return (
    <section aria-label={t("mobileFitness.sport.cardAria")} style={{ background: "var(--bg-1)", borderTop: "1px solid var(--line-soft)", borderBottom: "1px solid var(--line-soft)", padding: "var(--space-3) var(--space-4)" }}>
      <Text variant="eyebrow">{t(`mobileFitness.sport.${discipline}.title`)}</Text>

      {discipline === "run" && (
        <>
          <div style={{ fontSize: "var(--fs-xs)", color: "var(--ink-4)", marginTop: "var(--space-1)" }}>{t("mobileFitness.sport.run.basis")}</div>
          {run.thresholdPaceSec != null && <EvidenceRow label={t("mobileFitness.sport.run.threshold")} value={`${formatPace(run.thresholdPaceSec)}/km`} />}
          {run.records.map((record) => <EvidenceRow key={record.distance} label={t(`fitness:runRecords.dist.${record.distance}`)} value={`${formatDuration(record.seconds)} · ${record.date}`} />)}
          {run.thresholdPaceSec == null && run.records.length === 0 && <EmptyEvidence text={t("mobileFitness.sport.insufficient")} />}
        </>
      )}

      {discipline === "swim" && (
        <>
          <div style={{ fontSize: "var(--fs-xs)", color: "var(--ink-4)", marginTop: "var(--space-1)" }}>{t("mobileFitness.sport.swim.basis", { days: swim.windowDays })}</div>
          {swim.cssSecPer100m != null && <EvidenceRow label="CSS" value={`${formatPace(swim.cssSecPer100m)}/100m`} />}
          {swim.swolfAvg != null && <EvidenceRow label="SWOLF" value={swim.swolfAvg.toFixed(1)} />}
          {swim.distancePerStrokeM != null && <EvidenceRow label={t("mobileFitness.sport.swim.distancePerStroke")} value={`${swim.distancePerStrokeM.toFixed(2)} m`} />}
          {swim.cssSecPer100m == null && swim.swolfAvg == null && swim.distancePerStrokeM == null && <EmptyEvidence text={t("mobileFitness.sport.insufficient")} />}
        </>
      )}
    </section>
  );
}

function EmptyEvidence({ text }: { text: string }) {
  return <div style={{ marginTop: "var(--space-3)", fontSize: "var(--fs-sm)", color: "var(--ink-3)" }}>{text}</div>;
}

function EvidenceRow({ label, value }: { label: string; value: string }) {
  return (
    <div style={{ display: "flex", justifyContent: "space-between", gap: "var(--space-3)", padding: "var(--space-3) 0", borderBottom: "1px solid var(--line-soft)" }}>
      <span style={{ fontSize: "var(--fs-sm)" }}>{label}</span>
      <span style={{ fontFamily: "var(--font-mono)", fontSize: "var(--fs-sm)", textAlign: "right" }}>{value}</span>
    </div>
  );
}
