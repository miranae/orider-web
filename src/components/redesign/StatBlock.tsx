import GlossaryText from "../common/GlossaryText";
import { ArrowUp, ArrowDown } from "lucide-react";
import { Chip, Text } from "../../theme/components";
import { ICON_SIZE } from "../../theme/tokens/icon";

interface StatBlockProps {
  label: string;
  value: string;
  unit?: string | null;
  delta?: string | null;
  deltaKind?: 'up' | 'down' | 'neutral';
  sub?: string;
  /** 값 옆에 붙는 짧은 표식. 서버 값이 낡았을 때("이전 집계") 쓴다. */
  chip?: string | null;
}

export default function StatBlock({
  label,
  value,
  unit,
  delta,
  deltaKind = 'neutral',
  sub,
  chip,
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
        fontSize: 'var(--fs-xs)',
        color: 'var(--ink-2)',
      }}>
        <GlossaryText>{label}</GlossaryText>
      </span>

      {/* 값 + 단위 */}
      <div className="flex items-baseline" style={{ gap: 'var(--space-1)' }}>
        <Text variant="dataLarge" style={{ fontSize: 'var(--fs-3xl)' }}>{value}</Text>
        {unit != null && (
          <span style={{ fontFamily: 'var(--font-mono)', fontSize: 'var(--fs-base)', color: 'var(--ink-2)', fontWeight: 400 }}>
            <GlossaryText>{unit}</GlossaryText>
          </span>
        )}
        {/* 낡은 값 표식 — 값을 숨기지 않되 최신인 척하지도 않는다 (TrainingStatusCard 와 같은 규칙). */}
        {chip != null && chip !== "" && (
          <Chip variant="default" style={{ flexShrink: 0 }}>{chip}</Chip>
        )}
      </div>

      {/* 델타 */}
      {delta != null && (
        <Text as="div" variant="mono" className="flex items-center"
          style={{ gap: "var(--space-0-5)", fontSize: 'var(--fs-base)', color: deltaColor, fontWeight: 500 }}
        >
          {deltaKind === 'up' && <ArrowUp size={ICON_SIZE.xs} strokeWidth={2.5} />}
          {deltaKind === 'down' && <ArrowDown size={ICON_SIZE.xs} strokeWidth={2.5} />}
          <span>{delta}</span>
        </Text>
      )}

      {/* 서브 텍스트 */}
      {sub && (
        <span style={{ fontSize: 'var(--fs-sm)', color: 'var(--ink-1)' }}><GlossaryText>{sub}</GlossaryText></span>
      )}
    </div>
  );
}
