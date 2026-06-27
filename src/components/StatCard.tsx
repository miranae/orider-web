interface StatCardProps {
  label: string;
  value: string;
  icon?: string;
  color?: string;
  subValue?: string;
}

export default function StatCard({
  label,
  value,
  icon,
  color,
  subValue,
}: StatCardProps) {
  return (
    <div className="rounded-[var(--r-lg)] p-4" style={{ background: 'var(--bg-2)', border: '1px solid var(--line-soft)' }}>
      <div className="flex items-center gap-2">
        {icon && <span className="text-[length:var(--fs-lg)]">{icon}</span>}
        <span className="text-[length:var(--fs-xs)] font-medium" style={{ color: 'var(--ink-3)' }}>{label}</span>
      </div>
      <div className={`text-[length:var(--fs-xl)] font-bold mt-1${color ? ` ${color}` : ''}`} style={color ? undefined : { color: 'var(--ink-0)' }}>{value}</div>
      {subValue && (
        <div className="text-[length:var(--fs-xs)] mt-0.5" style={{ color: 'var(--ink-3)' }}>{subValue}</div>
      )}
    </div>
  );
}
