import type { HTMLAttributes, ReactNode, SVGProps } from 'react';
import { cn } from './cn';

export interface ChartFrameProps extends HTMLAttributes<HTMLElement> {
  header?: ReactNode;
  variant?: 'card' | 'embedded';
  as?: 'div' | 'section';
}

export function ChartFrame({ header, variant = 'card', as: Component = 'div', className, children, ...rest }: ChartFrameProps) {
  return <Component className={cn('ds-chart', `ds-chart--${variant}`, className)} {...rest}>{header}<div className="ds-chart__plot">{children}</div></Component>;
}

export interface ChartHeaderProps extends Omit<HTMLAttributes<HTMLDivElement>, 'title'> {
  title: ReactNode;
  description?: ReactNode;
  actions?: ReactNode;
}

export function ChartHeader({ title, description, actions, className, ...rest }: ChartHeaderProps) {
  return <div className={cn('ds-chart__header', className)} {...rest}>
    <div className="ds-chart__heading"><div className="ds-chart__title">{title}</div>{description && <div className="ds-chart__description">{description}</div>}</div>
    {actions && <div className="ds-chart__actions">{actions}</div>}
  </div>;
}

export interface ChartLegendItem { label: ReactNode; color: string; dasharray?: string; seriesId?: string; strokeWidth?: number; strokeLinecap?: SVGProps<SVGLineElement>['strokeLinecap'] }
export interface ChartLegendProps extends HTMLAttributes<HTMLUListElement> { items: readonly ChartLegendItem[] }

export function ChartLegend({ items, className, ...rest }: ChartLegendProps) {
  return <ul className={cn('ds-chart__legend', className)} {...rest}>{items.map((item, index) => <li key={item.seriesId ?? index}>
    <svg viewBox="0 0 24 8" aria-hidden="true" data-series={item.seriesId}><line x1="1" x2="23" y1="4" y2="4" stroke={item.color} strokeWidth={item.strokeWidth ?? 2} strokeDasharray={item.dasharray} strokeLinecap={item.strokeLinecap ?? "round"} /></svg>
    <span>{item.label}</span>
  </li>)}</ul>;
}

export interface ChartTooltipProps extends HTMLAttributes<HTMLDivElement> { label: ReactNode }

export function ChartTooltip({ label, className, children, role = 'tooltip', ...rest }: ChartTooltipProps) {
  return <div className={cn('ds-chart__tooltip', className)} role={role} {...rest}><strong>{label}</strong>{children}</div>;
}

export function ChartGridLine({ className, ...props }: SVGProps<SVGLineElement>) {
  return <line className={cn('ds-chart__grid', className)} {...props} />;
}

export function ChartAxisLine({ className, ...props }: SVGProps<SVGLineElement>) {
  return <line className={cn('ds-chart__axis', className)} {...props} />;
}
