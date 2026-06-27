import type { HTMLAttributes } from 'react';
import { cn } from './cn';

export interface ProgressProps extends Omit<HTMLAttributes<HTMLDivElement>, 'role'> {
  /** 0..1 또는 0..100 자동 판정 (>1 이면 % 로 간주). */
  value: number;
  variant?: 'default' | 'success' | 'warning' | 'danger';
  size?: 'sm' | 'md' | 'lg';
}

export function Progress({ value, variant = 'default', size = 'md', className, ...rest }: ProgressProps) {
  const pct = Math.max(0, Math.min(100, value > 1 ? value : value * 100));
  return (
    <div
      className={cn(
        'ds-progress',
        variant !== 'default' && `ds-progress--${variant}`,
        size !== 'md' && `ds-progress--${size}`,
        className,
      )}
      role="progressbar"
      aria-valuenow={Math.round(pct)}
      aria-valuemin={0}
      aria-valuemax={100}
      {...rest}
    >
      <div className="ds-progress__fill" style={{ width: `${pct}%` }} />
    </div>
  );
}
