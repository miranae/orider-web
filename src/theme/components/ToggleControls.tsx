import { forwardRef, type HTMLAttributes } from 'react';
import { Check } from 'lucide-react';
import { Button, type ButtonProps } from './Button';
import { cn } from './cn';

export interface ToggleControlsProps extends HTMLAttributes<HTMLDivElement> { variant?: 'metric' | 'axis' }
export function ToggleControls({ variant = 'metric', className, role = 'group', ...props }: ToggleControlsProps) {
  return <div role={role} className={cn('ds-toggle-controls', `ds-toggle-controls--${variant}`, className)} {...props} />;
}

export interface ToggleButtonProps extends Omit<ButtonProps, 'variant' | 'size' | 'dense' | 'className' | 'style' | 'aria-pressed' | 'aria-selected'> {
  selected: boolean;
  showCheck?: boolean;
}
export const ToggleButton = forwardRef<HTMLButtonElement, ToggleButtonProps>(function ToggleButton({ selected, showCheck = false, children, role, ...props }, ref) {
  return <Button ref={ref} variant="ghost" size="sm" className="ds-toggle-button" {...props} role={role} aria-pressed={role === 'tab' ? undefined : selected} aria-selected={role === 'tab' ? selected : undefined}>
    {showCheck && <Check className="ds-toggle-button__check" aria-hidden="true" style={{ visibility: selected ? 'visible' : 'hidden' }} />}{children}
  </Button>;
});

export function ToggleNote({ className, ...props }: HTMLAttributes<HTMLSpanElement>) {
  return <span className={cn('ds-toggle-note', className)} {...props} />;
}
