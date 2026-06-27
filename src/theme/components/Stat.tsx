import type { HTMLAttributes, ReactNode } from 'react';
import { cn } from './cn';

export type StatDelta = { value: ReactNode; direction?: 'up' | 'down' | 'neutral' };

export interface StatProps extends HTMLAttributes<HTMLDivElement> {
  label: ReactNode;
  value: ReactNode;
  unit?: ReactNode;
  delta?: StatDelta;
  /** 카드 배경/테두리 포함. */
  card?: boolean;
  compact?: boolean;
}

/**
 * 라벨 + 큰 수치 + (선택) 단위 + (선택) 변화량.
 *
 * 대시보드 통계, Activity 카드, 분석 탭 어디서나 동일 위계 강제.
 * 기존 인라인 `<div style={{font-family:mono,fontSize:28...}}>` 패턴 대체.
 */
export function Stat({
  label,
  value,
  unit,
  delta,
  card,
  compact,
  className,
  ...rest
}: StatProps) {
  return (
    <div
      className={cn('ds-stat', card && 'ds-stat--card', compact && 'ds-stat--compact', className)}
      {...rest}
    >
      <div className="ds-stat__label">{label}</div>
      <div className="ds-stat__value">
        {value}
        {unit && <span className="ds-stat__value-unit">{unit}</span>}
      </div>
      {delta && (
        <span className={cn('ds-stat__delta', `ds-stat__delta--${delta.direction ?? 'neutral'}`)}>
          {delta.direction === 'up' ? '▲' : delta.direction === 'down' ? '▼' : '—'} {delta.value}
        </span>
      )}
    </div>
  );
}
