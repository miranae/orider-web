import { useTranslation } from "react-i18next";
import type { CyclingAbilityResult, RunEvidence, SwimEvidence } from "../../features/fitness/multisportPerformance";
import type { Discipline } from "../../utils/disciplineFilter";
import { buttonClass, Text } from "../../theme/components";
import CyclingAbilityCard from "../fitness/CyclingAbilityCard";

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
  const { t, i18n } = useTranslation("dashboard");
  const qualifiedRunRecords = run.records.filter(record => record.qualification === "source_qualified"
    && record.unit === "seconds" && Number.isFinite(record.seconds) && record.seconds > 0
    && typeof record.activityId === "string" && record.activityId.trim()
    && Number.isFinite(record.startTime));
  const unverifiedGroups: Array<{ activityId: string | null; records: NonNullable<RunEvidence["unverifiedRecords"]> }> = [];
  const groupsByActivity = new Map<string, (typeof unverifiedGroups)[number]>();
  for (const record of run.unverifiedRecords ?? []) {
    const activityId = typeof record.activityId === "string" && record.activityId.trim() ? record.activityId : null;
    const existing = activityId ? groupsByActivity.get(activityId) : undefined;
    if (existing) existing.records.push(record);
    else {
      const group = { activityId, records: [record] };
      unverifiedGroups.push(group);
      if (activityId) groupsByActivity.set(activityId, group);
    }
  }
  if (discipline === "tri") return null;
  if (discipline === "bike") return <CyclingAbilityCard cycling={cycling} />;

  return (
    <section aria-label={t(discipline === "run" ? "mobileFitness.sport.run.cardAria" : "mobileFitness.sport.cardAria")} style={{ background: "var(--bg-1)", borderTop: "1px solid var(--line-soft)", borderBottom: "1px solid var(--line-soft)", padding: "var(--space-3) var(--space-4)" }}>
      <Text variant={discipline === "run" ? "bodyMedium" : "eyebrow"} weight={600}>{t(`mobileFitness.sport.${discipline}.title`)}</Text>

      {discipline === "run" && (
        <>
          <Text as="p" variant="bodyMedium" tone="secondary" style={{ marginTop: "var(--space-1)" }}>{t("mobileFitness.sport.run.basis")}</Text>
          {run.thresholdPaceSec != null && <EvidenceRow label={t("mobileFitness.sport.run.threshold")} value={`${formatPace(run.thresholdPaceSec)}/km`} />}
          {qualifiedRunRecords.map((record) => <div key={record.distance}>
            <EvidenceRow label={t(`fitness:runRecords.dist.${record.distance}`)} value={`${formatDuration(record.seconds)} · ${record.date}`} />
            <a href={`/${i18n.language.startsWith("ko") ? "ko" : "en"}/activity/${encodeURIComponent(record.activityId)}`} className={buttonClass({ variant: "ghost" })} style={{ minHeight: "var(--space-8)", fontSize: "var(--fs-md)" }}>{t("fitness:runRecords.viewActivity")}</a>
          </div>)}
          {run.thresholdPaceSec == null && qualifiedRunRecords.length === 0 && <Text as="p" variant="bodyMedium" tone="secondary" style={{ marginTop: "var(--space-3)" }}>{t("mobileFitness.sport.run.noQualifiedEvidence")}</Text>}
          {!!run.unverifiedRecords?.length && <details style={{ marginTop: "var(--space-3)" }}>
            <summary style={{ minHeight: "var(--space-8)", cursor: "pointer", fontSize: "var(--fs-md)", fontWeight: 600, padding: "var(--space-3) 0" }}>{t("mobileFitness.sport.run.unverifiedTitle", { count: run.unverifiedRecords.length, activityCount: groupsByActivity.size })}</summary>
            <Text as="p" variant="bodyMedium" tone="secondary">{t("mobileFitness.sport.run.unverifiedBasis")}</Text>
            {unverifiedGroups.map((group, index) => <div key={group.activityId ?? `missing-${index}`} style={{ padding: "var(--space-3) 0", borderBottom: "1px solid var(--line-soft)" }}>
              <Text as="p" variant="bodyMedium" weight={600}>{[...new Set(group.records.map(record => record.distance))].map(distance => t(`fitness:runRecords.dist.${distance}`)).join(" · ")}</Text>
              {group.activityId ? <a href={`/${i18n.language.startsWith("ko") ? "ko" : "en"}/activity/${encodeURIComponent(group.activityId)}`} className={buttonClass({ variant: "ghost" })} style={{ minHeight: "var(--space-8)", fontSize: "var(--fs-md)" }}>
                {[...new Set(group.records.map(record => record.date).filter(Boolean))].join(" · ") || "—"} · {t("fitness:runRecords.viewActivity")}
              </a> : <Text as="p" variant="bodyMedium" tone="secondary">{group.records[0]?.date || "—"} · {t("mobileFitness.sport.run.sourceMissing")}</Text>}
            </div>)}
          </details>}
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
