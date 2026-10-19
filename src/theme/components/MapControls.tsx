import { forwardRef, type HTMLAttributes } from 'react';
import { Button, type ButtonProps } from './Button';
import { cn } from './cn';

export interface MapResizeControlsProps {
  expanded: boolean;
  controlsId: string;
  expandLabel: string;
  collapseLabel: string;
  onToggle: () => void;
}
/** 지도 영역 크기만 전환한다. 카메라와 높이 상태는 호출자가 소유한다. */
export function MapResizeControls({ expanded, controlsId, expandLabel, collapseLabel, onToggle }: MapResizeControlsProps) {
  const label = expanded ? collapseLabel : expandLabel;
  return (['top-left', 'bottom-right'] as const).map(corner => <Button key={corner} variant="ghost" iconOnly dense
    className={`ds-map-resize ds-map-resize--${corner}`} aria-label={label} title={label}
    aria-controls={controlsId} aria-expanded={expanded} onClick={onToggle}>
    <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.5" aria-hidden="true"><path d="M7 19 19 7M13 19l6-6" /></svg>
  </Button>);
}

export interface MapNavigationProps extends HTMLAttributes<HTMLDivElement> { orientation?: 'vertical' | 'horizontal' }
export function MapNavigation({ orientation = 'vertical', className, role = 'group', ...props }: MapNavigationProps) {
  return <div role={role} className={cn('ds-map-navigation', `ds-map-navigation--${orientation}`, className)} {...props} />;
}

export interface MapControlButtonProps extends Omit<ButtonProps, 'variant' | 'size' | 'dense' | 'className' | 'style' | 'aria-label'> { 'aria-label': string }
export const MapControlButton = forwardRef<HTMLButtonElement, MapControlButtonProps>(function MapControlButton({ title, ...props }, ref) {
  return <Button ref={ref} variant="secondary" size="sm" dense title={title ?? props['aria-label']} className="ds-map-control-button" {...props} />;
});
