import { isSportUiEnabled } from "../../config/sportFeatures";
import { useState } from "react";
import { useTranslation } from "react-i18next";
import "./IntegratedLoadCard.css";
import { Card, Chip, Section, Stat, Text, SegmentTimeline } from "../../theme/components";
import type { LoadFocusBucket, LoadFocusResult } from "../../features/fitness/multisportPerformance";
import { DISCIPLINE_CHART_COLORS, LOAD_FOCUS_COLORS } from "../../features/fitness/chartPalette";

export interface CombinedLoadStatus {
  ctl: number;
  atl: number;
  tsb: number;
  contributions: Array<{ discipline: "bike" | "run" | "swim"; ctl: number }>;
}

const BUCKETS: Array<{ key: LoadFocusBucket; color: string }> = [
  { key: "baseAerobic", color: LOAD_FOCUS_COLORS.baseAerobic },
  { key: "highAerobic", color: LOAD_FOCUS_COLORS.highAerobic },
  { key: "highIntensity", color: LOAD_FOCUS_COLORS.highIntensity },
  { key: "unclassified", color: LOAD_FOCUS_COLORS.unclassified },
];

const DISCIPLINES = ["bike", "run", "swim"] as const;
const DISCIPLINE_COLORS = DISCIPLINE_CHART_COLORS;

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
  condition = false,
}: {
  combined: CombinedLoadStatus;
  focus: LoadFocusResult | null;
  condition?: boolean;
}) {
  const { t } = useTranslation("dashboard");
  const [selectedPart, setSelectedPart] = useState<string | null>(null);
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
  const knownContributions = new Set(combined.contributions.filter(item => safeSigned(item.ctl) !== null && item.ctl >= 0).map(item => item.discipline));
  const contributionTotal = DISCIPLINES.reduce((sum, discipline) => sum + disciplineLoads[discipline], 0);

  const focusLoads = Object.fromEntries(BUCKETS.map(({ key }) => [key, safeLoad(focus?.buckets?.[key])])) as Record<LoadFocusBucket, number>;
  const focusTotal = BUCKETS.reduce((sum, { key }) => sum + focusLoads[key], 0);
  const dominantBucket = focusTotal > 0
    ? BUCKETS.reduce((dominant, current) => focusLoads[current.key] > focusLoads[dominant.key] ? current : dominant)
    : null;
  const coverage = typeof focus?.coveragePct === "number" && Number.isFinite(focus.coveragePct)
    ? Math.min(100, Math.max(0, focus.coveragePct))
    : 0;
  const confidenceKey = focus && ["high", "medium", "low", "none"].includes(focus.confidence) ? focus.confidence : "none";
  const confidence = t(`mobileFitness.integrated.confidence.${confidenceKey}`);
  const windowDays = focus && Number.isFinite(focus.windowDays) && focus.windowDays > 0 ? Math.round(focus.windowDays) : 28;
  const contributionAria = contributionTotal > 0
    ? DISCIPLINES.filter(isSportUiEnabled).map((discipline) => !knownContributions.has(discipline) ? `${t(`mobileFitness.integrated.discipline.${discipline}`)} —` : t("mobileFitness.integrated.barPart", {
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

  const focusEvidence = focus ? (
        <div style={{ color: "var(--ink-3)", fontSize: "var(--fs-xs)", lineHeight: "var(--lh-relaxed)", paddingBottom: "var(--space-1)" }}>
          <p style={{ margin: 0 }}>{t(condition ? "mobileFitness.integrated.conditionSource" : "mobileFitness.integrated.authoritativeSource")}</p>
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
  ) : null;

  return (
    <Section actionsLayout="responsive" title={t("mobileFitness.integrated.title")} description={t("mobileFitness.integrated.eyebrow")} actions={focus ? <Chip>{t("mobileFitness.integrated.coverageChip", { pct: Math.round(coverage), confidence })}</Chip> : undefined} onKeyDown={(event) => { if (event.key === "Escape") setSelectedPart(null); }} aria-label={t("mobileFitness.integrated.cardAria")} aria-labelledby="" className={condition ? "integrated-load--condition" : undefined}>
      <div className="integrated-load__metrics">
        <div><Stat label={t("mobileFitness.integrated.ctlLabel")} value={displayNumber(ctl)} /><Text as="p" variant="bodySmall" tone="secondary">{t("mobileFitness.integrated.ctlHint")}</Text></div>
        {(["atl", "tsb"] as const).map(key => { const value = key === "atl" ? atl : tsb; return <div key={key}><Stat compact label={t(`mobileFitness.integrated.${key}Label`)} value={`${key === "tsb" && value >= 0 ? "+" : ""}${displayNumber(value)}`} /><Text as="p" variant="bodySmall" tone="secondary">{t(`mobileFitness.integrated.${key}Hint`)}</Text></div>; })}
      </div>
      <div className={condition ? "integrated-load__story-evidence" : undefined}>
      <div style={{ marginTop: "var(--space-4)" }}>
        <Text as="h3" variant="subtitle">{t("mobileFitness.integrated.contributionTitle")}</Text>
        <p style={{ color: "var(--ink-3)", fontSize: "var(--fs-xs)", lineHeight: "var(--lh-relaxed)" }}>{t("mobileFitness.integrated.contributionBasis")}</p>
        <SegmentTimeline presentation="distribution" aria-label={t("mobileFitness.integrated.contributionBarAria", { values: contributionAria })} rows={[{ id: "contribution", label: t("mobileFitness.integrated.contributionTitle"), buckets: DISCIPLINES.map(discipline => ({ id: discipline, label: `${isSportUiEnabled(discipline) ? t(`mobileFitness.integrated.discipline.${discipline}`) : t("common:discipline.other")} · ${knownContributions.has(discipline) ? t("mobileFitness.integrated.contributionValue", { value: displayNumber(disciplineLoads[discipline]), pct: Math.round(percentage(disciplineLoads[discipline], contributionTotal)) }) : "—"}`, weight: disciplineLoads[discipline], segments: [{ weight: 1, color: isSportUiEnabled(discipline) ? DISCIPLINE_COLORS[discipline] : "var(--line-soft)" }] })) }]} />
        <div style={{ display: "grid", gridTemplateColumns: `repeat(${DISCIPLINES.filter(isSportUiEnabled).length}, minmax(0, 1fr))`, gap: "var(--space-2)", marginTop: "var(--space-2)" }}>
          {DISCIPLINES.filter(isSportUiEnabled).map((discipline) => (
            <Card key={discipline} variant="flat" padding="compact"
              aria-pressed={selectedPart === discipline}
              onPointerEnter={(event) => { if (event.pointerType !== "touch") setSelectedPart(discipline); }}
              onPointerLeave={(event) => { if (event.pointerType !== "touch") setSelectedPart(null); }}
              onFocus={() => setSelectedPart(discipline)} onBlur={() => setSelectedPart(null)}
              onClick={() => setSelectedPart(discipline)} style={{ minWidth: 0 }}>
              <div style={{ display: "flex", alignItems: "center", gap: "var(--space-1)", color: "var(--ink-3)", fontSize: "var(--fs-xs)" }}>
                <span aria-hidden="true" style={{ width: "var(--space-1-5)", height: "var(--space-1-5)", borderRadius: "var(--r-full)", background: DISCIPLINE_COLORS[discipline], flex: "0 0 auto" }} />
                <span>{t(`mobileFitness.integrated.discipline.${discipline}`)}</span>
              </div>
              <div style={{ color: "var(--ink-1)", fontFamily: "var(--font-mono)", fontSize: "var(--fs-xs)", marginTop: "var(--space-1)" }}>
                {knownContributions.has(discipline) ? t("mobileFitness.integrated.contributionValue", {
                  value: displayNumber(disciplineLoads[discipline]),
                  pct: Math.round(percentage(disciplineLoads[discipline], contributionTotal)),
                }) : "—"}
              </div>
            </Card>
          ))}
        </div>
        {selectedPart && DISCIPLINES.some(key => key === selectedPart) && <p role="status" className="integrated-load__readout">
          {t("mobileFitness.integrated.contributionTitle")} · {t(`mobileFitness.integrated.discipline.${selectedPart}`)}: {knownContributions.has(selectedPart as (typeof DISCIPLINES)[number]) ? t("mobileFitness.integrated.contributionValue", { value: displayNumber(disciplineLoads[selectedPart as (typeof DISCIPLINES)[number]]), pct: Math.round(percentage(disciplineLoads[selectedPart as (typeof DISCIPLINES)[number]], contributionTotal)) }) : "—"}. {t(condition ? "mobileFitness.integrated.conditionSource" : "mobileFitness.integrated.authoritativeSource")}
        </p>}
      </div>

      <div style={{ borderTop: "1px solid var(--line-soft)", marginTop: "var(--space-4)", paddingTop: "var(--space-4)" }}>
        {!focus ? (
          <>
            <Text as="h3" variant="subtitle">{t("mobileFitness.integrated.focusTitle", { days: windowDays })}</Text>
            <p role="status" style={{ color: "var(--ink-3)", fontSize: "var(--fs-xs)", lineHeight: "var(--lh-relaxed)", margin: "var(--space-2) 0 0" }}>
              {t("mobileFitness.integrated.focusUnavailable")}
            </p>
          </>
        ) : (
          <>
        <div style={{ display: "flex", justifyContent: "space-between", gap: "var(--space-2)", alignItems: "baseline", flexWrap: "wrap" }}>
          <Text as="h3" variant="subtitle">{t("mobileFitness.integrated.focusTitle", { days: windowDays })}</Text>
          <span style={{ color: "var(--ink-2)", fontSize: "var(--fs-xs)", fontWeight: 600 }}>
            {dominantBucket
              ? t("mobileFitness.integrated.dominant", { label: t(`mobileFitness.integrated.bucket.${dominantBucket.key}`) })
              : t("mobileFitness.integrated.noFocusData")}
          </span>
        </div>
        <SegmentTimeline presentation="distribution" aria-label={t("mobileFitness.integrated.focusBarAria", { days: windowDays, values: focusAria })} rows={[{ id: "focus", label: t("mobileFitness.integrated.focusTitle", { days: windowDays }), buckets: BUCKETS.map(({key,color}) => ({ id: key, label: `${t(`mobileFitness.integrated.bucket.${key}`)} · ${displayNumber(focusLoads[key])} TSS · ${Math.round(percentage(focusLoads[key],focusTotal))}%`, weight: focusLoads[key], segments: [{ weight: 1, color }] })) }]} />
        <div style={{ display: "grid", gridTemplateColumns: "repeat(2, minmax(0, 1fr))", gap: "var(--space-2) var(--space-3)", marginTop: "var(--space-2)" }}>
          {BUCKETS.map(({ key, color }) => (
            <Card key={key} variant="flat" padding="compact"
              aria-pressed={selectedPart === key}
              onPointerEnter={(event) => { if (event.pointerType !== "touch") setSelectedPart(key); }}
              onPointerLeave={(event) => { if (event.pointerType !== "touch") setSelectedPart(null); }}
              onFocus={() => setSelectedPart(key)} onBlur={() => setSelectedPart(null)} onClick={() => setSelectedPart(key)}
              style={{ display: "grid", gap: "var(--space-2)", minWidth: 0 }}>
              <span style={{ display: "inline-flex", alignItems: "center", gap: "var(--space-1)", minWidth: 0 }}>
                <span aria-hidden="true" style={{ width: "var(--space-1-5)", height: "var(--space-1-5)", borderRadius: "var(--r-full)", background: color, flex: "0 0 auto" }} />
                <span>{t(`mobileFitness.integrated.bucket.${key}`)}</span>
              </span>
              <span style={{ color: "var(--ink-1)", fontFamily: "var(--font-mono)", whiteSpace: "nowrap" }}>{displayNumber(focusLoads[key])} · {Math.round(percentage(focusLoads[key], focusTotal))}%</span>
            </Card>
          ))}
        </div>
        {selectedPart && BUCKETS.some(({ key }) => key === selectedPart) && <p role="status" className="integrated-load__readout">
          {t("mobileFitness.integrated.focusTitle", { days: windowDays })} · {t(`mobileFitness.integrated.bucket.${selectedPart}`)}: {displayNumber(focusLoads[selectedPart as LoadFocusBucket])} TSS · {Math.round(percentage(focusLoads[selectedPart as LoadFocusBucket], focusTotal))}%. {t("mobileFitness.integrated.focusBasis")}
        </p>}
        <div style={{ color: "var(--ink-3)", fontSize: "var(--fs-xs)", marginTop: "var(--space-3)" }}>
          {t("mobileFitness.integrated.coverage", { pct: Math.round(coverage), confidence })}
        </div>
          </>
        )}
      </div>

      </div>
      {focus && (condition ? <section className="integrated-load__evidence" aria-label={t("mobileFitness.integrated.detailsToggle")}>
        <Text as="h3" variant="subtitle">{t("mobileFitness.integrated.detailsToggle")}</Text>
        {focusEvidence}
      </section> : <details style={{ borderTop: "1px solid var(--line-soft)", marginTop: "var(--space-4)" }}>
        <summary style={{ minHeight: 44, display: "flex", alignItems: "center", cursor: "pointer", color: "var(--ink-1)", fontSize: "var(--fs-sm)", fontWeight: 700 }}>
          {t("mobileFitness.integrated.detailsToggle")}
        </summary>
        {focusEvidence}
      </details>)}

    </Section>
  );
}
