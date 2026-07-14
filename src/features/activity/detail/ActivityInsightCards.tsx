import { Card, Text } from "../../../theme/components";

export type SummarySensorMetric = { label: string; value: string; unit?: string; sub?: string };

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
