import { forwardRef, type HTMLAttributes, type ReactNode } from 'react';
import { cn } from './cn';

export type ChipVariant = 'default' | 'accent' | 'success' | 'warning' | 'danger';

export interface ChipProps extends HTMLAttributes<HTMLSpanElement> {
  variant?: ChipVariant;
  selectable?: boolean;
  /** 필터 칩 선택 상태 — `aria-pressed` 로 노출되어 HIG 필터 칩(청록 채움)으로 그려진다. */
  selected?: boolean;
  /** 좌측 작은 점 (상태 표시용). */
  dot?: boolean;
  icon?: ReactNode;
}

export const Chip = forwardRef<HTMLSpanElement, ChipProps>(function Chip(
  { variant = 'default', selectable, selected, dot, icon, className, children, ...rest },
  ref,
) {
  const isInteractive = selectable || typeof rest.onClick === 'function';
  return (
    <span
      ref={ref}
      {...rest}
      role={rest.role ?? (isInteractive ? 'button' : undefined)}
      aria-pressed={rest['aria-pressed'] ?? (selected === undefined ? undefined : selected)}
      tabIndex={rest.tabIndex ?? (isInteractive ? 0 : undefined)}
      className={cn('ds-chip', variant !== 'default' && `ds-chip--${variant}`, (selectable || selected !== undefined) ? 'ds-chip--selectable' : isInteractive && 'ds-chip--clickable', className)}
      onKeyDown={(event) => {
        rest.onKeyDown?.(event);
        if (event.defaultPrevented || typeof rest.onClick !== 'function') return;
        if (event.key === 'Enter' || event.key === ' ') {
          event.preventDefault();
          rest.onClick(event as unknown as React.MouseEvent<HTMLSpanElement>);
        }
      }}
    >
      {dot && <span className="ds-chip__dot" />}
      {icon}
      {children}
    </span>
  );
});
