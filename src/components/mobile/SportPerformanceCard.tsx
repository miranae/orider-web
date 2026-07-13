import { useTranslation } from "react-i18next";
import type { CyclingAbilityResult, RunEvidence, SwimEvidence } from "../../features/fitness/multisportPerformance";
import type { Discipline } from "../../utils/disciplineFilter";
import { Text } from "../../theme/components";

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
}: {
  discipline: Discipline;
  cycling: CyclingAbilityResult | null;
  run: RunEvidence;
  swim: SwimEvidence;
}) {
  const { t } = useTranslation("dashboard");
  if (discipline === "tri") return null;

  return (
    <section aria-label={t("mobileFitness.sport.cardAria")} style={{ background: "var(--bg-1)", borderTop: "1px solid var(--line-soft)", borderBottom: "1px solid var(--line-soft)", padding: "var(--space-3) var(--space-4)" }}>
      <Text variant="eyebrow">{t(`mobileFitness.sport.${discipline}.title`)}</Text>

      {discipline === "bike" && (
        <>
          <div style={{ fontSize: "var(--fs-xs)", color: "var(--ink-4)", marginTop: "var(--space-1)" }}>
            {t("mobileFitness.sport.bike.basis", { count: cycling?.activityCount ?? 0 })}
          </div>
          {cycling?.axes.map((axis) => {
            const status = axis.score == null
              ? t("mobileFitness.sport.insufficient")
              : t("mobileFitness.sport.percentileStatus", { score: Math.round(axis.score) });
            const label = t(`mobileFitness.sport.bike.axis.${axis.key}`);
            return (
              <div key={axis.key} style={{ padding: "var(--space-3) 0", borderBottom: "1px solid var(--line-soft)" }}>
                <div style={{ display: "flex", justifyContent: "space-between", gap: "var(--space-3)" }}>
                  <span style={{ fontSize: "var(--fs-sm)" }}>{label}</span>
                  <span style={{ fontSize: "var(--fs-xs)", color: "var(--ink-2)", fontWeight: 600 }}>{status}</span>
                </div>
                {axis.score != null && (
                  <div role="img" aria-label={t("mobileFitness.sport.bandAria", { metric: label, status })} style={{ height: 7, background: "var(--bg-3)", borderRadius: "var(--r-sm)", overflow: "hidden", marginTop: "var(--space-2)" }}>
                    <div style={{ width: `${Math.max(0, Math.min(100, axis.score))}%`, height: "100%", background: "var(--aqua)" }} />
                  </div>
                )}
                <div style={{ fontSize: "var(--fs-xs)", color: "var(--ink-4)", marginTop: "var(--space-1)" }}>
                  {axis.evidence.length > 0
                    ? axis.evidence.map((item) => `${item.duration} ${item.watts != null ? `${Math.round(item.watts)}W` : "—"}${item.wPerKg != null ? ` · ${item.wPerKg.toFixed(2)}W/kg` : ""}`).join(" · ")
                    : t("mobileFitness.sport.noMeasuredEvidence")}
                  {` · ${t(`mobileFitness.integrated.confidence.${axis.confidence}`)}`}
                </div>
              </div>
            );
          }) ?? <div style={{ marginTop: "var(--space-3)", fontSize: "var(--fs-sm)", color: "var(--ink-3)" }}>{t("mobileFitness.sport.insufficient")}</div>}
          <div style={{ fontSize: "var(--fs-xs)", color: "var(--ink-4)", marginTop: "var(--space-2)" }}>{t("mobileFitness.sport.bike.notGarmin")}</div>
        </>
      )}

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
          <div style={{ fontSize: "var(--fs-xs)", color: "var(--ink-4)", marginTop: "var(--space-1)" }}>{t("mobileFitness.sport.swim.basis")}</div>
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
