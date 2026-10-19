import { forwardRef, type CSSProperties, type HTMLAttributes, type ReactNode, type SVGProps } from 'react';
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
  size?: 'default' | 'compact';
}

export function ChartHeader({ title, description, actions, size = 'default', className, ...rest }: ChartHeaderProps) {
  return <div className={cn('ds-chart__header', size === 'compact' && 'ds-chart__header--compact', className)} {...rest}>
    <div className="ds-chart__heading"><div className="ds-chart__title">{title}</div>{description && <div className="ds-chart__description">{description}</div>}</div>
    {actions && <div className="ds-chart__actions">{actions}</div>}
  </div>;
}

export interface ChartLegendItem { label: ReactNode; color: string; dasharray?: string; seriesId?: string; strokeWidth?: number; strokeLinecap?: SVGProps<SVGLineElement>['strokeLinecap'] }
export interface ChartLegendProps extends HTMLAttributes<HTMLUListElement> { items: readonly ChartLegendItem[]; marker?: 'line' | 'dot' | 'underline'; align?: 'start' | 'end' }

export function ChartLegend({ items, marker = 'line', align = 'start', className, ...rest }: ChartLegendProps) {
  return <ul className={cn('ds-chart__legend', align === 'end' && 'ds-chart__legend--end', marker === 'dot' && 'ds-chart__legend--dots', marker === 'underline' && 'ds-chart__legend--labels', className)} {...rest}>{items.map((item, index) => <li key={item.seriesId ?? index}>
    {marker === 'underline' ? <SeriesLabel color={item.color}>{item.label}</SeriesLabel> : <>{marker === 'dot' ? <span className="ds-chart__legend-dot" style={{ background: item.color }} aria-hidden="true" /> : <svg viewBox="0 0 24 8" aria-hidden="true" data-series={item.seriesId}><line x1="1" x2="23" y1="4" y2="4" stroke={item.color} strokeWidth={item.strokeWidth ?? 2} strokeDasharray={item.dasharray} strokeLinecap={item.strokeLinecap ?? "round"} /></svg>}
    <span>{item.label}</span></>}
  </li>)}</ul>;
}

export interface SeriesLabelProps { color: string; children: ReactNode }
/** 텍스트 잉크를 바꾸지 않고 이름 아래의 색으로 기록을 식별한다. */
export function SeriesLabel({ color, children }: SeriesLabelProps) {
  return <span className="ds-chart-series-label" style={{ '--ds-series-color': color } as CSSProperties}>{children}</span>;
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

export { CHART_PRESENTATION, CHART_PRESENTATION_DENSITY } from '../charts/chartPresentation';

export interface ChartLaneProps extends Omit<HTMLAttributes<HTMLElement>, 'title'> {
  title: ReactNode;
  unit?: ReactNode;
  subdued?: boolean;
}
export function ChartLane({ title, unit, subdued = false, className, children, ...props }: ChartLaneProps) {
  return <section className={cn('ds-chart-lane', className)} data-subdued={subdued || undefined} {...props}>
    <h3>{title}{unit && <> <span>{unit}</span></>}</h3>{children}
  </section>;
}

export interface ChartPlotProps extends Omit<HTMLAttributes<HTMLDivElement>, 'style'> {
  tone?: 'metric' | 'background';
  gesture?: 'pan-y' | 'none';
  empty?: ReactNode;
}
export const ChartPlot = forwardRef<HTMLDivElement, ChartPlotProps>(function ChartPlot({ tone = 'metric', gesture = 'pan-y', empty, children, className, ...props }, ref) {
  return <div ref={ref} className={cn('ds-chart-lane__plot', `ds-chart-lane__plot--${tone}`, className)} data-gesture={gesture} {...props}>{children}{empty != null && <p className="ds-chart-lane__empty">{empty}</p>}</div>;
});

export function ChartRangeCaption({ className, 'aria-live': live = 'polite', ...props }: HTMLAttributes<HTMLParagraphElement>) {
  return <p className={cn('ds-chart-range-caption', className)} aria-live={live} {...props} />;
}

export interface ChartValueProps extends HTMLAttributes<HTMLSpanElement> { primary: ReactNode; secondary?: ReactNode }
export function ChartValue({ primary, secondary, className, ...props }: ChartValueProps) {
  return <span className={cn('ds-chart-value', className)} {...props}><span className="ds-chart-value__primary">{primary}</span>{secondary != null && <span className="ds-chart-value__secondary">{secondary}</span>}</span>;
}
