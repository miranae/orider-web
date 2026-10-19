import {
  forwardRef,
  type InputHTMLAttributes,
  type SelectHTMLAttributes,
  type TextareaHTMLAttributes,
  type ReactNode,
} from 'react';
import { cn } from './cn';

/* ===== Input ===== */
export interface InputProps extends InputHTMLAttributes<HTMLInputElement> {
  invalid?: boolean;
  /** 수치 입력 — JetBrains Mono. */
  mono?: boolean;
  /** Trailing action inside the input surface; provide an accessible button label. */
  endAction?: ReactNode;
}
export const Input = forwardRef<HTMLInputElement, InputProps>(function Input(
  { invalid, mono, endAction, className, 'aria-invalid': ariaInvalid, ...rest },
  ref,
) {
  const input = (
    <input
      ref={ref}
      aria-invalid={ariaInvalid ?? (invalid ? true : undefined)}
      className={cn('ds-input', invalid && 'ds-input--invalid', mono && 'ds-input--mono', endAction != null && 'ds-input--with-action', className)}
      {...rest}
    />
  );
  return endAction == null ? input : <span className="ds-input-action">{input}<span className="ds-input-action__end">{endAction}</span></span>;
});

/* ===== Textarea ===== */
export interface TextareaProps extends TextareaHTMLAttributes<HTMLTextAreaElement> {
  invalid?: boolean;
}
export const Textarea = forwardRef<HTMLTextAreaElement, TextareaProps>(function Textarea(
  { invalid, className, 'aria-invalid': ariaInvalid, ...rest },
  ref,
) {
  return (
    <textarea ref={ref} aria-invalid={ariaInvalid ?? (invalid ? true : undefined)} className={cn('ds-input', invalid && 'ds-input--invalid', className)} {...rest} />
  );
});

/* ===== Select ===== */
export interface SelectProps extends SelectHTMLAttributes<HTMLSelectElement> {
  invalid?: boolean;
  /** Native picker with a compact, neutral filter surface. */
  variant?: 'default' | 'filter';
}
export const Select = forwardRef<HTMLSelectElement, SelectProps>(function Select(
  { invalid, variant = 'default', className, children, 'aria-invalid': ariaInvalid, ...rest },
  ref,
) {
  return (
    <select ref={ref} aria-invalid={ariaInvalid ?? (invalid ? true : undefined)} className={cn('ds-input', variant === 'filter' && 'ds-select--filter', invalid && 'ds-input--invalid', className)} {...rest}>
      {children}
    </select>
  );
});

/* ===== Field (label + control + hint/error) ===== */
export interface FieldProps {
  label?: ReactNode;
  hint?: ReactNode;
  error?: ReactNode;
  htmlFor?: string;
  className?: string;
  children: ReactNode;
}
export function Field({ label, hint, error, htmlFor, className, children }: FieldProps) {
  return (
    <div className={cn('ds-field', className)}>
      {label && (
        <label className="ds-field__label" htmlFor={htmlFor}>
          {label}
        </label>
      )}
      {children}
      {error ? <span className="ds-field__error">{error}</span> : hint ? <span className="ds-field__hint">{hint}</span> : null}
    </div>
  );
}
