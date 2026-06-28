interface ChartEmptyStateProps {
  title: string;
  description: string;
  minHeight?: number;
}

export default function ChartEmptyState({ title, description, minHeight = 200 }: ChartEmptyStateProps) {
  return (
    <div
      className="flex items-center justify-center rounded-[var(--r-lg)] border border-dashed px-4 py-6 text-center"
      style={{
        minHeight,
        background: "var(--bg-1)",
        borderColor: "var(--line-soft)",
      }}
    >
      <div style={{ maxWidth: 360 }}>
        <div className="text-[length:var(--fs-sm)] font-semibold" style={{ color: "var(--ink-1)" }}>
          {title}
        </div>
        <div className="mt-1 text-[length:var(--fs-xs)] leading-relaxed" style={{ color: "var(--ink-3)" }}>
          {description}
        </div>
      </div>
    </div>
  );
}
