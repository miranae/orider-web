import { forwardRef, type HTMLAttributes, type ReactNode } from 'react';
import { cn } from './cn';

export type ChipVariant = 'default' | 'accent' | 'success' | 'warning' | 'danger';

export interface ChipProps extends HTMLAttributes<HTMLSpanElement> {
  variant?: ChipVariant;
  /** 좌측 작은 점 (상태 표시용). */
  dot?: boolean;
  icon?: ReactNode;
}

export const Chip = forwardRef<HTMLSpanElement, ChipProps>(function Chip(
  { variant = 'default', dot, icon, className, children, ...rest },
  ref,
) {
  return (
    <span
      ref={ref}
      className={cn('ds-chip', variant !== 'default' && `ds-chip--${variant}`, className)}
      {...rest}
    >
      {dot && <span className="ds-chip__dot" />}
      {icon}
      {children}
    </span>
  );
});
