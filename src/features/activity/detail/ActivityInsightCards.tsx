import type { Activity } from "@shared/types";
import type { useActivityMetrics } from "../../../hooks/useActivityMetrics";
import { Card, Text } from "../../../theme/components";

export type SummarySensorMetric = { label: string; value: string; unit?: string; sub?: string };

export function ServerActivityInsightsCard({
  metrics,
  weather,
}: {
  metrics: NonNullable<ReturnType<typeof useActivityMetrics>["metrics"]> | null;
  weather?: Activity["weather"];
}) {
  const loadAxes = metrics?.loadAxes;
  const wPrimeDepletionPct =
    metrics?.wPrime && metrics.wPrime > 0 && metrics.wPrimeMinJ != null
      ? Math.round((1 - metrics.wPrimeMinJ / metrics.wPrime) * 100)
      : null;
  const prs = metrics?.newPrs?.slice(0, 3) ?? [];
  const insightRows = [
    loadAxes
      ? {
          label: "Load axes",
          value: [
            loadAxes.cardiovascular != null ? `C ${Math.round(loadAxes.cardiovascular)}` : null,
            loadAxes.muscular != null ? `M ${Math.round(loadAxes.muscular)}` : null,
            loadAxes.perceptual != null ? `RPE ${Math.round(loadAxes.perceptual)}` : null,
          ].filter(Boolean).join(" · "),
          sub: loadAxes.confidence != null ? `${Math.round(loadAxes.confidence * 100)}% confidence` : undefined,
        }
      : null,
    wPrimeDepletionPct != null
      ? {
          label: "W' tank",
          value: `${wPrimeDepletionPct}% used`,
          sub: `${Math.round((metrics?.wPrimeMinJ ?? 0) / 1000)} kJ remaining`,
        }
      : null,
    prs.length > 0
      ? {
          label: "PRs",
          value: prs
            .map((pr) => `${pr.duration ?? `${pr.durationSeconds ?? "?"}s`} #${pr.rank ?? 1}`)
            .join(" · "),
          sub: "Server-computed personal record matches",
        }
      : null,
    weather
      ? {
          label: "Weather",
          value: [
            typeof weather.temperature === "number" ? `${Math.round(weather.temperature)}°C` : null,
            typeof weather.windSpeed === "number" ? `${Math.round(weather.windSpeed)} m/s` : null,
            typeof weather.humidity === "number" ? `${Math.round(weather.humidity)}% RH` : null,
          ].filter(Boolean).join(" · "),
        }
      : null,
  ].filter((row): row is { label: string; value: string; sub?: string } => !!row && row.value.length > 0);

  if (insightRows.length === 0) return null;

  return (
    <Card padding="none" style={{ padding: "var(--space-4)" }}>
      <Text as="div" variant="eyebrow" style={{ marginBottom: "var(--space-3)" }}>
        Server insights
      </Text>
      <div className="grid gap-3 sm:grid-cols-2 lg:grid-cols-4">
        {insightRows.map((row) => (
          <div key={row.label} style={{ padding: "var(--space-3)", border: "1px solid var(--line-soft)", borderRadius: "var(--r-md)", background: "var(--bg-1)" }}>
            <Text as="div" variant="eyebrow" style={{ marginBottom: "var(--space-1)" }}>{row.label}</Text>
            <Text variant="dataMedium">{row.value}</Text>
            {row.sub && <div className="text-[length:var(--fs-xs)] mt-1" style={{ color: "var(--ink-3)" }}>{row.sub}</div>}
          </div>
        ))}
      </div>
    </Card>
  );
}

export function SummarySensorFallbackCard({
  title,
  description,
  metrics,
}: {
  title: string;
  description: string;
  metrics: SummarySensorMetric[];
}) {
  if (metrics.length === 0) return null;

  return (
    <Card padding="none" style={{ padding: 'var(--space-5)' }}>
      <div className="mb-4">
        <h3 className="text-[length:var(--fs-sm)] font-semibold" style={{ color: "var(--ink-0)" }}>{title}</h3>
        <p className="mt-1 text-[length:var(--fs-sm)] leading-6" style={{ color: "var(--ink-3)" }}>{description}</p>
      </div>
      <div className="grid grid-cols-2 gap-3 sm:grid-cols-3 lg:grid-cols-4">
        {metrics.map((metric) => (
          <div
            key={metric.label}
            className="rounded-[var(--r-md)] border p-4"
            style={{ borderColor: "var(--line-soft)", background: "var(--bg-1)" }}
          >
            <Text as="div" variant="eyebrow" style={{ marginBottom: "var(--space-2)" }}>
              {metric.label}
            </Text>
            <div className="flex items-baseline gap-1">
              <Text variant="dataMedium">{metric.value}</Text>
              {metric.unit && <Text variant="unit">{metric.unit}</Text>}
            </div>
            {metric.sub && (
              <div className="mt-1 text-[length:var(--fs-xs)]" style={{ color: "var(--ink-3)" }}>
                {metric.sub}
              </div>
            )}
          </div>
        ))}
      </div>
    </Card>
  );
}
