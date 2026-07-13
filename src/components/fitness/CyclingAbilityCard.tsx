import { useTranslation } from "react-i18next";
import type { CyclingAbilityResult } from "../../features/fitness/multisportPerformance";
import { Card, Text } from "../../theme/components";

type CyclingAbilityCardProps = {
  cycling: CyclingAbilityResult | null;
  variant?: "mobile" | "desktop";
};

function CyclingAbilityContent({ cycling }: Pick<CyclingAbilityCardProps, "cycling">) {
  const { t } = useTranslation("dashboard");
  return (
    <>
      <Text variant="eyebrow">{t("mobileFitness.sport.bike.title")}</Text>
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
