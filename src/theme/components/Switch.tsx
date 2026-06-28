import { forwardRef, type InputHTMLAttributes } from 'react';
import { cn } from './cn';

export interface SwitchProps extends Omit<InputHTMLAttributes<HTMLInputElement>, 'type'> {
  label?: string;
}

export const Switch = forwardRef<HTMLInputElement, SwitchProps>(function Switch(
  { className, label, ...rest },
  ref,
) {
  const input = (
    <label className={cn('ds-switch', className)}>
      <input ref={ref} type="checkbox" {...rest} />
      <span className="ds-switch__slider" />
    </label>
  );
  if (!label) return input;
  return (
    <div style={{ display: 'flex', alignItems: 'center', gap: "var(--space-3)" }}>
      {input}
      <span style={{ fontSize: "var(--fs-xs)", color: 'var(--ink-1)' }}>{label}</span>
    </div>
  );
});
