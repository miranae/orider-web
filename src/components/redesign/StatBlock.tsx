import { ArrowUp, ArrowDown } from "lucide-react";
import { Text } from "../../theme/components";

interface StatBlockProps {
  label: string;
  value: string;
  unit?: string | null;
  delta?: string | null;
  deltaKind?: 'up' | 'down' | 'neutral';
  sub?: string;
}

export default function StatBlock({
  label,
  value,
  unit,
  delta,
  deltaKind = 'neutral',
  sub,
}: StatBlockProps) {
  const deltaColor =
    deltaKind === 'up'
      ? 'var(--lime)'
      : deltaKind === 'down'
      ? 'var(--rose)'
      : 'var(--ink-2)';

  return (
    <div className="flex flex-col" style={{ gap: 'var(--space-2)' }}>
      {/* 레이블 */}
      <span style={{
        fontFamily: 'var(--font-mono)',
        fontSize: 'var(--fs-xs)',
        letterSpacing: '0.08em',
        textTransform: 'uppercase' as const,
        color: 'var(--ink-2)',
        fontWeight: 500,
      }}>
        {label}
      </span>

      {/* 값 + 단위 */}
      <div className="flex items-baseline" style={{ gap: 'var(--space-1)' }}>
        <Text variant="dataLarge" style={{ fontSize: 'var(--fs-3xl)' }}>{value}</Text>
        {unit != null && (
          <span style={{ fontFamily: 'var(--font-mono)', fontSize: 'var(--fs-base)', color: 'var(--ink-2)', fontWeight: 400 }}>
            {unit}
          </span>
        )}
      </div>

      {/* 델타 */}
      {delta != null && (
        <Text as="div" variant="mono" className="flex items-center"
          style={{ gap: "var(--space-0-5)", fontSize: 'var(--fs-base)', color: deltaColor, fontWeight: 500 }}
        >
          {deltaKind === 'up' && <ArrowUp size={12} strokeWidth={2.5} />}
          {deltaKind === 'down' && <ArrowDown size={12} strokeWidth={2.5} />}
          <span>{delta}</span>
        </Text>
      )}

      {/* 서브 텍스트 */}
      {sub && (
        <span style={{ fontSize: 'var(--fs-sm)', color: 'var(--ink-1)' }}>{sub}</span>
      )}
    </div>
  );
}
