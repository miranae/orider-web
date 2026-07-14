import { useTranslation } from "react-i18next";
import type { LoadFocusBucket, LoadFocusResult } from "../../features/fitness/multisportPerformance";

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

const DISCIPLINES = ["bike", "run", "swim"] as const;
const DISCIPLINE_COLORS = {
  bike: "var(--aqua)",
  run: "var(--amber)",
  swim: "var(--lime)",
} as const;

function safeLoad(value: unknown): number {
  return typeof value === "number" && Number.isFinite(value) && value > 0 ? value : 0;
}

function safeSigned(value: unknown): number | null {
  return typeof value === "number" && Number.isFinite(value) ? value : null;
}

function safeAuthoritativeLoad(value: unknown): number | null {
  const finite = safeSigned(value);
  return finite === null ? null : Math.max(0, finite);
}

function percentage(value: number, total: number): number {
  return total > 0 ? value / total * 100 : 0;
}

function displayNumber(value: number): string {
  return value.toFixed(1);
}

export default function IntegratedLoadCard({
  combined,
  focus,
}: {
  combined: CombinedLoadStatus;
  focus: LoadFocusResult;
}) {
  const { t } = useTranslation("dashboard");
  const ctl = safeAuthoritativeLoad(combined.ctl);
  const atl = safeAuthoritativeLoad(combined.atl);
  const tsb = safeSigned(combined.tsb);
  if (ctl === null || atl === null || tsb === null) return null;

  const disciplineLoads = Object.fromEntries(DISCIPLINES.map((discipline) => [
    discipline,
    combined.contributions
      .filter((item) => item.discipline === discipline)
      .reduce((sum, item) => sum + safeLoad(item.ctl), 0),
  ])) as Record<(typeof DISCIPLINES)[number], number>;
  const contributionTotal = DISCIPLINES.reduce((sum, discipline) => sum + disciplineLoads[discipline], 0);

  const focusLoads = Object.fromEntries(BUCKETS.map(({ key }) => [key, safeLoad(focus.buckets?.[key])])) as Record<LoadFocusBucket, number>;
  const focusTotal = BUCKETS.reduce((sum, { key }) => sum + focusLoads[key], 0);
  const dominantBucket = focusTotal > 0
    ? BUCKETS.reduce((dominant, current) => focusLoads[current.key] > focusLoads[dominant.key] ? current : dominant)
    : null;
  const coverage = typeof focus.coveragePct === "number" && Number.isFinite(focus.coveragePct)
    ? Math.min(100, Math.max(0, focus.coveragePct))
    : 0;
  const confidenceKey = ["high", "medium", "low", "none"].includes(focus.confidence) ? focus.confidence : "none";
  const confidence = t(`mobileFitness.integrated.confidence.${confidenceKey}`);
  const windowDays = Number.isFinite(focus.windowDays) && focus.windowDays > 0 ? Math.round(focus.windowDays) : 28;
  const contributionAria = contributionTotal > 0
    ? DISCIPLINES.map((discipline) => t("mobileFitness.integrated.barPart", {
      label: t(`mobileFitness.integrated.discipline.${discipline}`),
      value: displayNumber(disciplineLoads[discipline]),
      pct: Math.round(percentage(disciplineLoads[discipline], contributionTotal)),
    })).join(", ")
    : t("mobileFitness.integrated.noContributionData");
  const focusAria = focusTotal > 0
    ? BUCKETS.map(({ key }) => t("mobileFitness.integrated.barPart", {
      label: t(`mobileFitness.integrated.bucket.${key}`),
      value: displayNumber(focusLoads[key]),
      pct: Math.round(percentage(focusLoads[key], focusTotal)),
    })).join(", ")
    : t("mobileFitness.integrated.noFocusData");

  return (
    <section
      aria-label={t("mobileFitness.integrated.cardAria")}
      style={{
        background: "var(--bg-1)",
        borderTop: "1px solid var(--line-soft)",
        borderBottom: "1px solid var(--line-soft)",
        padding: "var(--space-4)",
      }}
    >
      <div style={{ display: "flex", alignItems: "flex-start", justifyContent: "space-between", gap: "var(--space-2)", flexWrap: "wrap" }}>
        <div style={{ minWidth: 0, flex: "1 1 auto" }}>
          <div style={{ color: "var(--lime)", fontSize: "var(--fs-xs)", fontWeight: 700, letterSpacing: "var(--tracking-wide)", textTransform: "uppercase" }}>
            {t("mobileFitness.integrated.eyebrow")}
          </div>
          <h2 style={{ color: "var(--ink-0)", fontSize: "var(--fs-xl)", lineHeight: "var(--lh-tight)", margin: "var(--space-1) 0 0" }}>
            {t("mobileFitness.integrated.title")}
          </h2>
        </div>
        <span style={{ background: "var(--bg-3)", border: "1px solid var(--line-soft)", borderRadius: "var(--r-full)", color: "var(--ink-2)", fontSize: "var(--fs-xs)", fontWeight: 600, padding: "var(--space-1) var(--space-2)", whiteSpace: "nowrap" }}>
          {t("mobileFitness.integrated.coverageChip", { pct: Math.round(coverage), confidence })}
        </span>
      </div>

      <dl style={{ margin: "var(--space-4) 0 0", display: "grid", gridTemplateColumns: "minmax(0, 1.35fr) repeat(2, minmax(0, 1fr))", gap: "var(--space-2)" }}>
        <div style={{ background: "var(--bg-2)", border: "1px solid var(--line-soft)", borderRadius: "var(--r-md)", padding: "var(--space-3)" }}>
          <dt style={{ color: "var(--ink-3)", fontSize: "var(--fs-xs)", fontWeight: 600 }}>{t("mobileFitness.integrated.ctlLabel")}</dt>
          <dd style={{ color: "var(--ink-0)", fontFamily: "var(--font-mono)", fontSize: "var(--fs-3xl)", fontWeight: 700, lineHeight: "var(--lh-tight)", margin: "var(--space-1) 0 0" }}>{displayNumber(ctl)}</dd>
          <div style={{ color: "var(--ink-4)", fontSize: "var(--fs-xs)", marginTop: "var(--space-1)" }}>{t("mobileFitness.integrated.ctlHint")}</div>
        </div>
        {(["atl", "tsb"] as const).map((key) => {
          const value = key === "atl" ? atl : tsb;
          return (
            <div key={key} style={{ background: "var(--bg-2)", border: "1px solid var(--line-soft)", borderRadius: "var(--r-md)", padding: "var(--space-3)", minWidth: 0 }}>
              <dt style={{ color: "var(--ink-3)", fontSize: "var(--fs-xs)", fontWeight: 600 }}>{t(`mobileFitness.integrated.${key}Label`)}</dt>
              <dd style={{ color: "var(--ink-0)", fontFamily: "var(--font-mono)", fontSize: "var(--fs-xl)", fontWeight: 700, lineHeight: "var(--lh-tight)", margin: "var(--space-2) 0 0" }}>
                {key === "tsb" && value >= 0 ? "+" : ""}{displayNumber(value)}
              </dd>
              <div style={{ color: "var(--ink-4)", fontSize: "var(--fs-xs)", marginTop: "var(--space-1)" }}>{t(`mobileFitness.integrated.${key}Hint`)}</div>
            </div>
          );
        })}
      </dl>

      <div style={{ marginTop: "var(--space-4)" }}>
        <h3 style={{ color: "var(--ink-0)", fontSize: "var(--fs-sm)", margin: 0 }}>{t("mobileFitness.integrated.contributionTitle")}</h3>
        <div role="img" aria-label={t("mobileFitness.integrated.contributionBarAria", { values: contributionAria })} style={{ display: "flex", height: "var(--space-2)", background: "var(--bg-3)", borderRadius: "var(--r-full)", overflow: "hidden", marginTop: "var(--space-2)" }}>
          {DISCIPLINES.map((discipline) => (
            <span key={discipline} style={{ width: `${percentage(disciplineLoads[discipline], contributionTotal)}%`, background: DISCIPLINE_COLORS[discipline] }} />
          ))}
        </div>
        <div style={{ display: "grid", gridTemplateColumns: "repeat(3, minmax(0, 1fr))", gap: "var(--space-2)", marginTop: "var(--space-2)" }}>
          {DISCIPLINES.map((discipline) => (
            <div key={discipline} style={{ minWidth: 0 }}>
              <div style={{ display: "flex", alignItems: "center", gap: "var(--space-1)", color: "var(--ink-3)", fontSize: "var(--fs-xs)" }}>
                <span aria-hidden="true" style={{ width: "var(--space-1-5)", height: "var(--space-1-5)", borderRadius: "var(--r-full)", background: DISCIPLINE_COLORS[discipline], flex: "0 0 auto" }} />
                <span>{t(`mobileFitness.integrated.discipline.${discipline}`)}</span>
              </div>
              <div style={{ color: "var(--ink-1)", fontFamily: "var(--font-mono)", fontSize: "var(--fs-xs)", marginTop: "var(--space-1)" }}>
                {t("mobileFitness.integrated.contributionValue", {
                  value: displayNumber(disciplineLoads[discipline]),
                  pct: Math.round(percentage(disciplineLoads[discipline], contributionTotal)),
                })}
              </div>
            </div>
          ))}
        </div>
      </div>

      <div style={{ borderTop: "1px solid var(--line-soft)", marginTop: "var(--space-4)", paddingTop: "var(--space-4)" }}>
        <div style={{ display: "flex", justifyContent: "space-between", gap: "var(--space-2)", alignItems: "baseline", flexWrap: "wrap" }}>
          <h3 style={{ color: "var(--ink-0)", fontSize: "var(--fs-sm)", margin: 0 }}>{t("mobileFitness.integrated.focusTitle", { days: windowDays })}</h3>
          <span style={{ color: "var(--ink-2)", fontSize: "var(--fs-xs)", fontWeight: 600 }}>
            {dominantBucket
              ? t("mobileFitness.integrated.dominant", { label: t(`mobileFitness.integrated.bucket.${dominantBucket.key}`) })
              : t("mobileFitness.integrated.noFocusData")}
          </span>
        </div>
        <div role="img" aria-label={t("mobileFitness.integrated.focusBarAria", { days: windowDays, values: focusAria })} style={{ display: "flex", height: "var(--space-2)", background: "var(--bg-3)", borderRadius: "var(--r-full)", overflow: "hidden", marginTop: "var(--space-2)" }}>
          {BUCKETS.map(({ key, color }) => (
            <span key={key} style={{ width: `${percentage(focusLoads[key], focusTotal)}%`, background: color }} />
          ))}
        </div>
        <div style={{ display: "grid", gridTemplateColumns: "repeat(2, minmax(0, 1fr))", gap: "var(--space-2) var(--space-3)", marginTop: "var(--space-2)" }}>
          {BUCKETS.map(({ key, color }) => (
            <div key={key} style={{ display: "flex", justifyContent: "space-between", gap: "var(--space-1)", minWidth: 0, color: "var(--ink-3)", fontSize: "var(--fs-xs)" }}>
              <span style={{ display: "inline-flex", alignItems: "center", gap: "var(--space-1)", minWidth: 0 }}>
                <span aria-hidden="true" style={{ width: "var(--space-1-5)", height: "var(--space-1-5)", borderRadius: "var(--r-full)", background: color, flex: "0 0 auto" }} />
                <span>{t(`mobileFitness.integrated.bucket.${key}`)}</span>
              </span>
              <span style={{ color: "var(--ink-1)", fontFamily: "var(--font-mono)", whiteSpace: "nowrap" }}>{displayNumber(focusLoads[key])} · {Math.round(percentage(focusLoads[key], focusTotal))}%</span>
            </div>
          ))}
        </div>
        <div style={{ color: "var(--ink-3)", fontSize: "var(--fs-xs)", marginTop: "var(--space-3)" }}>
          {t("mobileFitness.integrated.coverage", { pct: Math.round(coverage), confidence })}
        </div>
      </div>

      <details style={{ borderTop: "1px solid var(--line-soft)", marginTop: "var(--space-4)" }}>
        <summary style={{ minHeight: 44, display: "flex", alignItems: "center", cursor: "pointer", color: "var(--ink-1)", fontSize: "var(--fs-sm)", fontWeight: 700 }}>
          {t("mobileFitness.integrated.detailsToggle")}
        </summary>
        <div style={{ color: "var(--ink-3)", fontSize: "var(--fs-xs)", lineHeight: "var(--lh-relaxed)", paddingBottom: "var(--space-1)" }}>
          <p style={{ margin: 0 }}>{t("mobileFitness.integrated.authoritativeSource")}</p>
          <p style={{ margin: "var(--space-2) 0 0" }}>{t("mobileFitness.integrated.focusBasis")}</p>
          <p style={{ margin: "var(--space-2) 0 0" }}>{t("mobileFitness.integrated.sources", {
            power: displayNumber(safeLoad(focus.sourceLoad?.power)),
            hr: displayNumber(safeLoad(focus.sourceLoad?.heartRate)),
            unclassified: displayNumber(safeLoad(focus.sourceLoad?.unclassified)),
          })}</p>
          <p style={{ margin: "var(--space-2) 0 0" }}>
            {focus.hasAnaerobicBikeDetail ? t("mobileFitness.integrated.anaerobicBikeDetail") : t("mobileFitness.integrated.hrHighIntensityNote")}
          </p>
        </div>
      </details>
    </section>
  );
}
