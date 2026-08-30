import { useState, type ReactNode } from "react";
import { useTranslation } from "react-i18next";
import type { Activity } from "@shared/types";
import type { ActivityImpactEntry, Fitness48HourForecast } from "../activityImpact";
import { Card, Chip, Text } from "../../../theme/components";

type ImpactMode = "marginal" | "actual";

interface FitnessCoachBriefingProps {
  impacts: ActivityImpactEntry[];
  selectedActivityId: string | null;
  onSelectActivity: (activityId: string) => void;
  forecast: Fitness48HourForecast | null;
  current: { ctl: number; atl: number; tsb: number };
  decisionSlot: ReactNode;
  locale: string;
  canonicalAvailable: boolean;
  pendingActivity?: Activity | null;
}

function signed(value: number): string {
  const rounded = value.toFixed(1);
  return value > 0 ? `+${rounded}` : rounded;
}

function activityTypeLabel(type: string, t: (key: string) => string): string {
  if (/ride|cycl/i.test(type)) return t("discipline.bike");
  if (/run/i.test(type)) return t("discipline.run");
  if (/swim/i.test(type)) return t("discipline.swim");
  return type;
}

function activityLabel(entry: ActivityImpactEntry, locale: string, t: (key: string) => string): string {
  const date = new Date(`${entry.date}T00:00:00.000Z`).toLocaleDateString(locale, {
    month: "short",
    day: "numeric",
    timeZone: "UTC",
  });
  const distanceKm = entry.activity.summary.distance / 1000;
  return `${date} · ${activityTypeLabel(entry.activity.type, t)}${distanceKm > 0 ? ` · ${distanceKm.toFixed(1)} km` : ""}`;
}

function pendingActivityLabel(activity: Activity, locale: string, t: (key: string) => string): string {
  const date = new Date(activity.startTime).toLocaleDateString(locale, { month: "short", day: "numeric" });
  const distanceKm = activity.summary.distance / 1000;
  return `${date} · ${activityTypeLabel(activity.type, t)}${distanceKm > 0 ? ` · ${distanceKm.toFixed(1)} km` : ""}`;
}

function MetricDelta({ label, value, color }: { label: string; value: number | null; color: string }) {
  return (
    <div>
      <Text as="div" variant="eyebrow" style={{ marginBottom: "var(--space-1)" }}>{label}</Text>
      <Text variant="dataLarge" style={{ color }}>{value == null ? "—" : signed(value)}</Text>
    </div>
  );
}

function coachConclusion(tsb: number): { key: "recover" | "easy" | "ready"; tone: "warning" | "accent" | "success" } {
  if (tsb <= -20) return {
    key: "recover",
    tone: "warning",
  };
  if (tsb <= -8) return {
    key: "easy",
    tone: "accent",
  };
  return {
    key: "ready",
    tone: "success",
  };
}

export default function FitnessCoachBriefing({
  impacts,
  selectedActivityId,
  onSelectActivity,
  forecast,
  current,
  decisionSlot,
  locale,
  canonicalAvailable,
  pendingActivity,
}: FitnessCoachBriefingProps) {
  const { t } = useTranslation("fitness");
  const [mode, setMode] = useState<ImpactMode>("marginal");
  const selectedPending = pendingActivity?.id === selectedActivityId ? pendingActivity : null;
  const selected = selectedPending
    ? null
    : impacts.find((entry) => entry.activity.id === selectedActivityId) ?? impacts[0] ?? null;
  const conclusion = coachConclusion(current.tsb);
  const delta = selected
    ? mode === "marginal"
      ? selected.marginalImpact
      : selected.actualDayChange
    : null;

  return (
    <section aria-labelledby="fitness-coach-title">
      <Card padding="none" style={{ padding: "var(--space-5)", marginBottom: "var(--space-4)" }}>
        <div style={{ display: "flex", gap: "var(--space-3)", alignItems: "flex-start", flexWrap: "wrap" }}>
          <div style={{ flex: "1 1 30rem" }}>
            <Chip variant={conclusion.tone} dot>{t("coach.eyebrow")}</Chip>
            <Text as="h2" variant="title" id="fitness-coach-title" style={{ margin: "var(--space-3) 0 var(--space-2)" }}>
              {t(`coach.conclusion.${conclusion.key}.title`)}
            </Text>
            <Text as="p" variant="body" tone="secondary" style={{ margin: 0, maxWidth: "48rem" }}>
              {t(`coach.conclusion.${conclusion.key}.body`)}
            </Text>
          </div>
          <div style={{ display: "grid", gridTemplateColumns: "repeat(3, minmax(5rem, 1fr))", gap: "var(--space-4)" }}>
            <div><Text as="div" variant="eyebrow">{t("coach.metric.ctl")}</Text><Text variant="dataMedium" style={{ color: "var(--lime)" }}>{current.ctl.toFixed(1)}</Text></div>
            <div><Text as="div" variant="eyebrow">{t("coach.metric.atl")}</Text><Text variant="dataMedium" style={{ color: "var(--rose)" }}>{current.atl.toFixed(1)}</Text></div>
            <div><Text as="div" variant="eyebrow">{t("coach.metric.tsb")}</Text><Text variant="dataMedium" style={{ color: "var(--amber)" }}>{signed(current.tsb)}</Text></div>
          </div>
        </div>
      </Card>

      <div style={{ display: "grid", gridTemplateColumns: "minmax(0, 1.3fr) minmax(18rem, 0.7fr)", gap: "var(--space-4)", alignItems: "stretch" }}>
        <Card padding="none" style={{ padding: "var(--space-5)" }}>
          <div style={{ display: "flex", justifyContent: "space-between", gap: "var(--space-3)", alignItems: "flex-start", flexWrap: "wrap" }}>
            <div>
              <Text as="div" variant="eyebrow">{t("coach.impact.eyebrow")}</Text>
              <Text as="h3" variant="title" style={{ margin: "var(--space-2) 0 var(--space-1)" }}>
                {selected
                  ? activityLabel(selected, locale, t)
                  : selectedPending
                    ? pendingActivityLabel(selectedPending, locale, t)
                    : canonicalAvailable ? t("coach.impact.empty") : t("coach.impact.unavailable")}
              </Text>
              {selected && <Text variant="caption" tone="tertiary">{t("coach.impact.load", { load: selected.attributedLoad.toFixed(0) })}</Text>}
            </div>
            <div role="group" aria-label={t("coach.impact.modeLabel")} style={{ display: "flex", gap: "var(--space-1)", padding: "var(--space-1)", background: "var(--bg-2)", borderRadius: "var(--r-md)" }}>
              <button type="button" onClick={() => setMode("marginal")} aria-pressed={mode === "marginal"} style={{ border: 0, borderRadius: "var(--r-sm)", padding: "var(--space-2) var(--space-3)", background: mode === "marginal" ? "var(--bg-3)" : "transparent", color: mode === "marginal" ? "var(--ink-0)" : "var(--ink-3)", cursor: "pointer" }}>{t("coach.impact.modeMarginal")}</button>
              <button type="button" onClick={() => setMode("actual")} aria-pressed={mode === "actual"} style={{ border: 0, borderRadius: "var(--r-sm)", padding: "var(--space-2) var(--space-3)", background: mode === "actual" ? "var(--bg-3)" : "transparent", color: mode === "actual" ? "var(--ink-0)" : "var(--ink-3)", cursor: "pointer" }}>{t("coach.impact.modeActual")}</button>
            </div>
          </div>

          <div style={{ display: "grid", gridTemplateColumns: "repeat(3, 1fr)", gap: "var(--space-4)", marginTop: "var(--space-5)", padding: "var(--space-4)", background: "var(--bg-2)", borderRadius: "var(--r-lg)" }}>
            <MetricDelta label={t("coach.metric.ctl")} value={delta?.ctl ?? null} color="var(--lime)" />
            <MetricDelta label={t("coach.metric.atl")} value={delta?.atl ?? null} color="var(--rose)" />
            <MetricDelta label={t("coach.metric.tsb")} value={delta?.tsb ?? null} color="var(--amber)" />
          </div>
          <Text as="p" variant="caption" tone="tertiary" style={{ margin: "var(--space-3) 0 0" }}>
            {selectedPending ? t("coach.impact.pending") : mode === "marginal"
              ? t("coach.impact.marginalHelp")
              : t("coach.impact.actualHelp")}
          </Text>
        </Card>

        <Card padding="none" style={{ padding: "var(--space-5)" }}>
          <Text as="div" variant="eyebrow">{t("coach.range.eyebrow")}</Text>
          <Text as="h3" variant="title" style={{ margin: "var(--space-2) 0" }}>{t("coach.range.title")}</Text>
          <Text as="p" variant="bodySmall" tone="secondary" style={{ margin: "0 0 var(--space-4)" }}>
            {t("coach.range.body")}
          </Text>
          {decisionSlot}
        </Card>
      </div>

      {(pendingActivity || impacts.length > 0) && (
        <Card padding="none" style={{ padding: "var(--space-5)", marginTop: "var(--space-4)" }}>
          <Text as="div" variant="eyebrow" style={{ marginBottom: "var(--space-3)" }}>{t("coach.recent.title")}</Text>
          <div style={{ display: "grid", gridTemplateColumns: "repeat(auto-fit, minmax(12rem, 1fr))", gap: "var(--space-2)" }}>
            {pendingActivity && (
              <button
                type="button"
                onClick={() => onSelectActivity(pendingActivity.id)}
                aria-pressed={pendingActivity.id === selectedActivityId}
                style={{ textAlign: "left", padding: "var(--space-3)", borderRadius: "var(--r-md)", border: `1px solid ${pendingActivity.id === selectedActivityId ? "var(--amber)" : "var(--line-soft)"}`, background: "var(--bg-1)", color: "var(--ink-0)", cursor: "pointer" }}
              >
                <Text as="div" variant="label">{pendingActivityLabel(pendingActivity, locale, t)}</Text>
                <Text as="div" variant="caption" tone="warning" style={{ marginTop: "var(--space-2)" }}>{t("coach.impact.pending")}</Text>
              </button>
            )}
            {impacts.map((entry) => {
              const selectedEntry = entry.activity.id === selected?.activity.id;
              return (
                <button
                  key={entry.activity.id}
                  type="button"
                  onClick={() => onSelectActivity(entry.activity.id)}
                  aria-pressed={selectedEntry}
                  style={{ textAlign: "left", padding: "var(--space-3)", borderRadius: "var(--r-md)", border: `1px solid ${selectedEntry ? "var(--lime)" : "var(--line-soft)"}`, background: selectedEntry ? "color-mix(in oklch, var(--lime) 7%, var(--bg-1))" : "var(--bg-1)", color: "var(--ink-0)", cursor: "pointer" }}
                >
                  <Text as="div" variant="label">{activityLabel(entry, locale, t)}</Text>
                  <Text as="div" variant="mono" style={{ marginTop: "var(--space-2)", color: "var(--ink-2)" }}>
                    CTL {signed(entry.marginalImpact.ctl)} · ATL {signed(entry.marginalImpact.atl)}
                  </Text>
                  <Text as="div" variant="caption" tone="tertiary" style={{ marginTop: "var(--space-1)" }}>
                    {entry.confidence === "canonical-single" ? t("coach.recent.canonical") : t("coach.recent.estimated")}
                  </Text>
                </button>
              );
            })}
          </div>
        </Card>
      )}

      {forecast && (
        <Card padding="none" style={{ padding: "var(--space-5)", marginTop: "var(--space-4)" }}>
          <Text as="div" variant="eyebrow">{t("coach.forecast.title")}</Text>
          <Text as="p" variant="bodySmall" tone="secondary" style={{ margin: "var(--space-2) 0 var(--space-4)" }}>
            {t("coach.forecast.body")}
          </Text>
          <div style={{ display: "grid", gridTemplateColumns: "repeat(2, minmax(0, 1fr))", gap: "var(--space-3)" }}>
            {([
              [t("coach.forecast.rest"), forecast.rest[1]],
              [forecast.easy ? t("coach.forecast.easyLoad", { load: forecast.easy[0].dailyLoad.toFixed(0) }) : t("coach.forecast.easy"), forecast.easy?.[1]],
            ] as const).map(([label, point]) => point && (
              <div key={label} style={{ padding: "var(--space-4)", background: "var(--bg-2)", borderRadius: "var(--r-lg)" }}>
                <Text as="div" variant="label" style={{ marginBottom: "var(--space-3)" }}>{label}</Text>
                <div style={{ display: "flex", gap: "var(--space-5)", flexWrap: "wrap" }}>
                  <Text variant="mono">CTL {point.ctl.toFixed(1)}</Text>
                  <Text variant="mono">ATL {point.atl.toFixed(1)}</Text>
                  <Text variant="mono" style={{ color: "var(--amber)" }}>TSB {signed(point.tsb)}</Text>
                </div>
              </div>
            ))}
          </div>
        </Card>
      )}
    </section>
  );
}
