import { useTranslation } from "react-i18next";
import type { LoadFocusBucket, LoadFocusResult } from "../../features/fitness/multisportPerformance";
import { Text } from "../../theme/components";

export interface CombinedLoadStatus {
  ctl: number;
  atl: number;
  tsb: number;
  contributions: Array<{ discipline: "bike" | "run" | "swim"; ctl: number }>;
}

const BUCKETS: Array<{ key: LoadFocusBucket; color: string }> = [
  { key: "baseAerobic", color: "var(--aqua)" },
  { key: "highAerobic", color: "var(--lime)" },
  { key: "highIntensity", color: "var(--rose)" },
  { key: "unclassified", color: "var(--ink-3)" },
];

const DISCIPLINE_COLORS = {
  bike: "var(--aqua)",
  run: "var(--amber)",
  swim: "var(--lime)",
} as const;

function pct(value: number, total: number) {
  return total > 0 ? value / total * 100 : 0;
}

export default function IntegratedLoadCard({
  combined,
  focus,
}: {
  combined: CombinedLoadStatus;
  focus: LoadFocusResult;
}) {
  const { t } = useTranslation("dashboard");
  if (![combined.ctl, combined.atl, combined.tsb].every((value) => Number.isFinite(value))) return null;
  const contributions = combined.contributions.filter((item) => Number.isFinite(item.ctl));
  const contributionTotal = contributions.reduce((sum, item) => sum + Math.max(0, item.ctl), 0);
  const confidence = t(`mobileFitness.integrated.confidence.${focus.confidence}`);

  return (
    <section
      aria-label={t("mobileFitness.integrated.cardAria")}
      style={{ background: "var(--bg-1)", borderTop: "1px solid var(--line-soft)", borderBottom: "1px solid var(--line-soft)", padding: "var(--space-3) var(--space-4)" }}
    >
      <Text variant="eyebrow">{t("mobileFitness.integrated.title")}</Text>
      <div style={{ fontSize: "var(--fs-xs)", color: "var(--ink-4)", marginTop: "var(--space-1)" }}>
        {t("mobileFitness.integrated.authoritativeSource")}
      </div>

      <div style={{ display: "grid", gridTemplateColumns: "repeat(3, 1fr)", gap: "var(--space-2)", marginTop: "var(--space-3)" }}>
        {(["ctl", "atl", "tsb"] as const).map((key) => {
          const value = combined[key];
          return (
            <div key={key}>
              <Text variant="eyebrow" as="div">{key.toUpperCase()}</Text>
              <Text variant="mono" as="div" style={{ color: "var(--ink-0)", marginTop: "var(--space-1)" }}>
                {key === "tsb" && value >= 0 ? "+" : ""}{value.toFixed(1)}
              </Text>
            </div>
          );
        })}
      </div>

      <div style={{ marginTop: "var(--space-3)" }}>
        <Text variant="eyebrow" as="div">{t("mobileFitness.integrated.contributionTitle")}</Text>
        {contributions.map((item) => {
          const share = pct(Math.max(0, item.ctl), contributionTotal);
          const label = t(`mobileFitness.integrated.discipline.${item.discipline}`);
          return (
            <div key={item.discipline} style={{ marginTop: "var(--space-2)" }}>
              <div style={{ display: "flex", justifyContent: "space-between", gap: "var(--space-2)", fontSize: "var(--fs-xs)" }}>
                <span>{label}</span><span style={{ fontFamily: "var(--font-mono)" }}>{item.ctl.toFixed(1)} · {Math.round(share)}%</span>
              </div>
              <div role="img" aria-label={t("mobileFitness.integrated.contributionAria", { sport: label, pct: Math.round(share) })} style={{ height: 6, background: "var(--bg-3)", borderRadius: "var(--r-sm)", overflow: "hidden", marginTop: "var(--space-1)" }}>
                <div style={{ width: `${share}%`, height: "100%", background: DISCIPLINE_COLORS[item.discipline] }} />
              </div>
            </div>
          );
        })}
      </div>

      <div style={{ marginTop: "var(--space-4)", paddingTop: "var(--space-3)", borderTop: "1px solid var(--line-soft)" }}>
        <Text variant="eyebrow" as="div">{t("mobileFitness.integrated.focusTitle", { days: focus.windowDays })}</Text>
        <div style={{ fontSize: "var(--fs-xs)", color: "var(--ink-4)", marginTop: "var(--space-1)" }}>
          {t("mobileFitness.integrated.focusBasis")}
        </div>
        {BUCKETS.map(({ key, color }) => {
          const value = focus.buckets[key];
          const share = pct(value, focus.totalLoad);
          const label = t(`mobileFitness.integrated.bucket.${key}`);
          return (
            <div key={key} style={{ marginTop: "var(--space-2)" }}>
              <div style={{ display: "flex", justifyContent: "space-between", gap: "var(--space-2)", fontSize: "var(--fs-xs)" }}>
                <span>{label}</span><span style={{ fontFamily: "var(--font-mono)" }}>{value.toFixed(1)} · {Math.round(share)}%</span>
              </div>
              <div role="img" aria-label={t("mobileFitness.integrated.focusAria", { band: label, load: value.toFixed(1), pct: Math.round(share) })} style={{ height: 7, background: "var(--bg-3)", borderRadius: "var(--r-sm)", overflow: "hidden", marginTop: "var(--space-1)" }}>
                <div style={{ width: `${share}%`, height: "100%", background: color }} />
              </div>
            </div>
          );
        })}
        <div style={{ fontSize: "var(--fs-xs)", color: "var(--ink-2)", marginTop: "var(--space-3)", fontWeight: 600 }}>
          {t("mobileFitness.integrated.coverage", { pct: Math.round(focus.coveragePct), confidence })}
        </div>
        <div style={{ fontSize: "var(--fs-xs)", color: "var(--ink-4)", marginTop: "var(--space-1)" }}>
          {t("mobileFitness.integrated.sources", {
            power: focus.sourceLoad.power.toFixed(1),
            hr: focus.sourceLoad.heartRate.toFixed(1),
            unclassified: focus.sourceLoad.unclassified.toFixed(1),
          })}
        </div>
        <div style={{ fontSize: "var(--fs-xs)", color: "var(--ink-4)", marginTop: "var(--space-1)" }}>
          {focus.hasAnaerobicBikeDetail
            ? t("mobileFitness.integrated.anaerobicBikeDetail")
            : t("mobileFitness.integrated.hrHighIntensityNote")}
        </div>
      </div>
    </section>
  );
}
