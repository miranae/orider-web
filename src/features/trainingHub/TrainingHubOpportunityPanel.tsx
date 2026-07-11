import { useMemo, useState } from "react";
import { LocalizedLink as Link } from "../../components/LocalizedLink";
import { Card, Text } from "../../theme/components";
import type { Goal, PlanWeek } from "@shared/types/goal";
import { buildFitnessWeeklyInsight, buildPlanAdjustmentInsight } from "./trainingHubInsights";

type T = (key: string, values?: Record<string, unknown>) => string;

export function FitnessWeeklyInsight({
  ctlDelta,
  ctl,
  atl,
  tsb,
  dailyData,
  t,
}: {
  ctlDelta: number;
  ctl: number;
  atl: number;
  tsb: number;
  dailyData: Array<{ totalLoad: number }>;
  t: T;
}) {
  const insight = buildFitnessWeeklyInsight({ ctlDelta, ctl, atl, tsb, dailyData });
  const fatigueText = insight.fatiguePct == null
    ? t("hub.weekly.fatigueUnknown", { tss: insight.thisWeek })
    : t(insight.fatiguePct >= 0 ? "hub.weekly.fatigueUp" : "hub.weekly.fatigueDown", { pct: Math.abs(insight.fatiguePct), tss: insight.thisWeek });

  return (
    <Card padding="none" style={{ padding: "var(--space-4)", marginBottom: "var(--space-4)" }}>
      <Text as="div" variant="eyebrow" style={{ marginBottom: "var(--space-2)" }}>{t("hub.weekly.title")}</Text>
      <Text as="p" variant="bodyMedium" style={{ margin: 0 }}>
        {fatigueText} {t(`hub.weekly.recommend.${insight.recommendation}`)}
      </Text>
    </Card>
  );
}

export function BikeActionAccordion({
  ftp,
  hasPdcModel,
  hasZoneData,
  t,
}: {
  ftp?: number | null;
  hasPdcModel: boolean;
  hasZoneData: boolean;
  t: T;
}) {
  const [open, setOpen] = useState<string | null>("ftp");
  const rows = useMemo(() => [
    { id: "ftp", needed: !ftp, href: "/settings?section=training" },
    { id: "tte", needed: !hasPdcModel, href: "/plan" },
    { id: "zones", needed: !hasZoneData, href: "/log" },
    { id: "vo2", needed: !hasPdcModel, href: "/fitness?sport=bike" },
    { id: "recovery", needed: false, href: "/plan" },
    { id: "endurance", needed: false, href: "/plan" },
  ], [ftp, hasPdcModel, hasZoneData]);

  return (
    <Card padding="none" style={{ padding: "var(--space-4)", marginTop: "var(--space-4)" }}>
      <Text as="div" variant="eyebrow" style={{ marginBottom: "var(--space-3)" }}>{t("hub.actions.title")}</Text>
      <div style={{ display: "grid", gap: "var(--space-2)" }}>
        {rows.map((row) => (
          <div key={row.id} style={{ border: "1px solid var(--line-soft)", borderRadius: "var(--r-md)", overflow: "hidden" }}>
            <button
              type="button"
              onClick={() => setOpen(open === row.id ? null : row.id)}
              style={{ width: "100%", padding: "12px 14px", display: "flex", alignItems: "center", justifyContent: "space-between", background: "var(--bg-1)", color: "var(--ink-0)", border: 0, textAlign: "left" }}
            >
              <span>
                <Text as="span" variant="label">{t(`hub.actions.${row.id}.title`)}</Text>
                {row.needed && <Text as="span" variant="caption" tone="warning" style={{ marginLeft: "var(--space-2)" }}>{t("hub.actions.needed")}</Text>}
              </span>
              <span aria-hidden>{open === row.id ? "-" : "+"}</span>
            </button>
            {open === row.id && (
              <div style={{ padding: "12px 14px", background: "var(--bg-0)", borderTop: "1px solid var(--line-soft)" }}>
                <Text as="p" variant="bodySmall" tone="secondary" style={{ margin: 0 }}>{t(`hub.actions.${row.id}.desc`)}</Text>
                <Link to={row.href} className="text-[length:var(--fs-sm)] font-semibold hover:underline" style={{ color: "var(--lime)", display: "inline-block", marginTop: "var(--space-2)" }}>
                  {t(`hub.actions.${row.id}.cta`)}
                </Link>
              </div>
            )}
          </div>
        ))}
      </div>
    </Card>
  );
}

export function PlanAdjustmentNarrative({
  goal,
  weeks,
  t,
}: {
  goal: Goal | null;
  weeks: PlanWeek[];
  t: T;
}) {
  const insight = buildPlanAdjustmentInsight(goal, weeks);
  if (!insight) return null;

  const key = insight.direction === "recovery"
    ? "adaptation.narrative.recovery"
    : insight.direction === "down"
      ? "adaptation.narrative.down"
      : "adaptation.narrative.up";

  return (
    <Card padding="none" style={{ padding: "var(--space-4)", marginBottom: "var(--space-4)", borderColor: "color-mix(in srgb, var(--amber) 35%, var(--line-soft))" }}>
      <Text as="div" variant="eyebrow" style={{ marginBottom: "var(--space-2)" }}>{t("adaptation.narrative.title")}</Text>
      <Text as="p" variant="bodyMedium" style={{ margin: 0 }}>
        {t(key, {
          compliance: insight.compliancePct ?? 0,
          pct: insight.changePct ?? 0,
        })}
      </Text>
    </Card>
  );
}
