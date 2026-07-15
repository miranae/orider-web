import { useTranslation } from "react-i18next";
import type { CyclingAbilityResult } from "../../features/fitness/multisportPerformance";
import { Card, Text } from "../../theme/components";
import AbilityScoreScale from "./AbilityScoreScale";

type CyclingAbilityCardProps = {
  cycling: CyclingAbilityResult | null;
  variant?: "mobile" | "desktop";
};

const AXIS_ACCENTS = {
  anaerobic: "var(--violet)",
  aerobic: "var(--amber)",
  endurance: "var(--aqua)",
} as const;

function uniqueStrongestAxis(cycling: CyclingAbilityResult | null): CyclingAbilityResult["axes"][number]["key"] | null {
  const scored = cycling?.axes.flatMap((axis) => axis.score == null ? [] : [{ key: axis.key, score: axis.score }]) ?? [];
  if (scored.length === 0) return null;
  const highest = Math.max(...scored.map((axis) => axis.score));
  const strongest = scored.filter((axis) => axis.score === highest);
  return strongest.length === 1 ? strongest[0]?.key ?? null : null;
}

function CyclingAbilityContent({ cycling }: Pick<CyclingAbilityCardProps, "cycling">) {
  const { t } = useTranslation("dashboard");
  const strongestAxis = uniqueStrongestAxis(cycling);
  return (
    <>
      <Text variant="eyebrow">{t("mobileFitness.sport.bike.title")}</Text>
      <div style={{ fontSize: "var(--fs-xs)", color: "var(--ink-4)", marginTop: "var(--space-1)" }}>
        {t("mobileFitness.sport.bike.basis", { count: cycling?.activityCount ?? 0 })}
      </div>
      <div style={{ fontSize: "var(--fs-xs)", color: "var(--ink-3)", marginTop: "var(--space-2)" }}>
        {t("mobileFitness.sport.scoreGuide")}
      </div>
      {strongestAxis && (
        <Text as="div" variant="label" style={{ marginTop: "var(--space-3)", color: AXIS_ACCENTS[strongestAxis] }}>
          {t("mobileFitness.sport.bike.strongestAxis", { axis: t(`mobileFitness.sport.bike.axis.${strongestAxis}`) })}
        </Text>
      )}
      {cycling?.axes.map((axis) => {
        const status = axis.score == null ? t("mobileFitness.sport.insufficient") : null;
        const label = t(`mobileFitness.sport.bike.axis.${axis.key}`);
        return (
          <div key={axis.key} style={{ padding: "var(--space-3) 0", borderBottom: "1px solid var(--line-soft)" }}>
            <div style={{ display: "flex", justifyContent: "space-between", gap: "var(--space-3)" }}>
              <span style={{ display: "inline-flex", alignItems: "center", gap: "var(--space-2)", fontSize: "var(--fs-sm)" }}>
                <span aria-hidden style={{ width: "var(--space-2)", height: "var(--space-2)", borderRadius: "var(--r-pill)", background: AXIS_ACCENTS[axis.key], flexShrink: 0 }} />
                {label}
              </span>
              {status && <span style={{ fontSize: "var(--fs-xs)", color: "var(--ink-2)", fontWeight: 600 }}>{status}</span>}
            </div>
            {axis.score != null && (
              <div style={{ marginTop: "var(--space-2)" }}>
                <AbilityScoreScale
                  score={axis.score}
                  ariaLabel={t("mobileFitness.sport.axisScoreAria", { metric: label })}
                  accentColor={AXIS_ACCENTS[axis.key]}
                />
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
      <div style={{ fontSize: "var(--fs-xs)", color: "var(--ink-4)", marginTop: "var(--space-2)" }}>
        {t("mobileFitness.sport.bike.notGarmin")}{" "}
        <a href="/web-manual/ch06-advanced.html#s6-3" style={{ color: "var(--aqua)", fontWeight: 600 }}>
          {t("mobileFitness.sport.bike.manualLink")}
        </a>
      </div>
    </>
  );
}

export default function CyclingAbilityCard({ cycling, variant = "mobile" }: CyclingAbilityCardProps) {
  const { t } = useTranslation("dashboard");
  if (variant === "desktop") {
    return (
      <Card padding="none" aria-label={t("mobileFitness.sport.cardAria")} style={{ marginTop: "var(--space-4)", padding: "var(--space-4) var(--space-6)" }}>
        <CyclingAbilityContent cycling={cycling} />
      </Card>
    );
  }
  return (
    <section aria-label={t("mobileFitness.sport.cardAria")} style={{ background: "var(--bg-1)", borderTop: "1px solid var(--line-soft)", borderBottom: "1px solid var(--line-soft)", padding: "var(--space-3) var(--space-4)" }}>
      <CyclingAbilityContent cycling={cycling} />
    </section>
  );
}
