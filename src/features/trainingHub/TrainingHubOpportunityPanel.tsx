import { useEffect, useMemo, useRef, useState } from "react";
import { LocalizedLink as Link } from "../../components/LocalizedLink";
import { Card, Text } from "../../theme/components";
import type { Goal, PlanWeek } from "@shared/types/goal";
import { buildFitnessWeeklyInsight, buildPlanAdjustmentInsight } from "./trainingHubInsights";
import { ChevronDown, ChevronUp } from "lucide-react";

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
  const rows = useMemo(() => [
    { id: "ftp", needed: !ftp, href: "/settings?section=training" },
    { id: "tte", needed: !hasPdcModel, href: "/plan" },
    { id: "zones", needed: !hasZoneData, href: "/log" },
    { id: "vo2", needed: !hasPdcModel, href: "/fitness?sport=bike" },
    { id: "recovery", needed: false, href: "/plan" },
    { id: "endurance", needed: false, href: "/plan" },
  ].sort((a, b) => Number(b.needed) - Number(a.needed)), [ftp, hasPdcModel, hasZoneData]);
  const primaryId = rows.find((row) => row.needed)?.id ?? rows[0]!.id;
  const [open, setOpen] = useState<string | null>(primaryId);
  const [showAll, setShowAll] = useState(false);
  const previousPrimaryRef = useRef(primaryId);
  const userSelectedRef = useRef(false);
  useEffect(() => {
    if (previousPrimaryRef.current !== primaryId) {
      if (!userSelectedRef.current) setOpen(primaryId);
      previousPrimaryRef.current = primaryId;
    }
  }, [primaryId]);
  const visibleRows = showAll ? rows : rows.slice(0, 1);

  return (
    <Card padding="none" style={{ padding: "var(--space-4)", marginTop: "var(--space-4)" }}>
      <Text as="div" variant="eyebrow" style={{ marginBottom: "var(--space-3)" }}>{t("hub.actions.title")}</Text>
      <div style={{ display: "grid", gap: "var(--space-2)" }}>
        {visibleRows.map((row) => (
          <div key={row.id} style={{ border: "1px solid var(--line-soft)", borderRadius: "var(--r-md)", overflow: "hidden" }}>
            <button
              id={`bike-action-toggle-${row.id}`}
              type="button"
              onClick={() => { userSelectedRef.current = true; setOpen(open === row.id ? null : row.id); }}
              aria-expanded={open === row.id}
              aria-controls={`bike-action-${row.id}`}
              style={{ width: "100%", padding: "12px 14px", display: "flex", alignItems: "center", justifyContent: "space-between", background: "var(--bg-1)", color: "var(--ink-0)", border: 0, textAlign: "left" }}
            >
              <span>
                <Text as="span" variant="label">{t(`hub.actions.${row.id}.title`)}</Text>
                {row.needed && <Text as="span" variant="caption" tone="warning" style={{ marginLeft: "var(--space-2)" }}>{t("hub.actions.needed")}</Text>}
              </span>
              <span aria-hidden>{open === row.id ? <ChevronUp size={18} /> : <ChevronDown size={18} />}</span>
            </button>
            <div
              id={`bike-action-${row.id}`}
              role="region"
              aria-labelledby={`bike-action-toggle-${row.id}`}
              hidden={open !== row.id}
              style={{ padding: "12px 14px", background: "var(--bg-0)", borderTop: "1px solid var(--line-soft)" }}
            >
                <Text as="p" variant="bodySmall" tone="secondary" style={{ margin: 0 }}>{t(`hub.actions.${row.id}.desc`)}</Text>
                <Link to={row.href} className="text-[length:var(--fs-sm)] font-semibold hover:underline" style={{ color: "var(--lime)", display: "inline-block", marginTop: "var(--space-2)" }}>
                  {t(`hub.actions.${row.id}.cta`)}
                </Link>
            </div>
          </div>
        ))}
        <button
          type="button"
          aria-expanded={showAll}
          onClick={() => setShowAll((value) => !value)}
          style={{ minHeight: 44, display: "inline-flex", alignItems: "center", justifyContent: "center", gap: "var(--space-1)", border: "1px solid var(--line-soft)", borderRadius: "var(--r-md)", background: "var(--bg-1)", color: "var(--ink-2)", fontSize: "var(--fs-sm)", cursor: "pointer" }}
        >
          {showAll ? <ChevronUp size={18} aria-hidden="true" /> : <ChevronDown size={18} aria-hidden="true" />}
          {t(showAll ? "hub.actions.showLess" : "hub.actions.showMore", { count: rows.length - 1 })}
        </button>
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
