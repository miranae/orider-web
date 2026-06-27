import type { HTMLAttributes, ReactNode } from 'react';
import { cn } from './cn';

export type AlertVariant = 'info' | 'success' | 'warning' | 'danger';

export interface AlertProps extends Omit<HTMLAttributes<HTMLDivElement>, 'title'> {
  variant?: AlertVariant;
  title?: ReactNode;
  icon?: ReactNode;
  children?: ReactNode;
}

const DEFAULT_ICONS: Record<AlertVariant, ReactNode> = {
  info: (
    <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth={2}>
      <circle cx="12" cy="12" r="10" />
      <path d="M12 16v-4M12 8h.01" strokeLinecap="round" />
    </svg>
  ),
  success: (
    <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth={2}>
      <path d="M22 11.1V12a10 10 0 1 1-5.9-9.1" strokeLinecap="round" />
      <path d="M22 4 12 14l-3-3" strokeLinecap="round" strokeLinejoin="round" />
    </svg>
  ),
  warning: (
    <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth={2}>
      <path d="M10.3 3.9 1.8 18a2 2 0 0 0 1.7 3h17a2 2 0 0 0 1.7-3L13.7 3.9a2 2 0 0 0-3.4 0z" strokeLinejoin="round" />
      <path d="M12 9v4M12 17h.01" strokeLinecap="round" />
    </svg>
  ),
  danger: (
    <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth={2}>
      <circle cx="12" cy="12" r="10" />
      <path d="M15 9l-6 6M9 9l6 6" strokeLinecap="round" />
    </svg>
  ),
};

export function Alert({ variant = 'info', title, icon, children, className, ...rest }: AlertProps) {
  return (
    <div className={cn('ds-alert', `ds-alert--${variant}`, className)} role="alert" {...rest}>
      <span className="ds-alert__icon">{icon ?? DEFAULT_ICONS[variant]}</span>
      <div className="ds-alert__body">
        {title && <span className="ds-alert__title">{title}</span>}
        {children}
      </div>
    </div>
  );
}
