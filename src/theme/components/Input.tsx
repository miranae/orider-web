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
}
export const Input = forwardRef<HTMLInputElement, InputProps>(function Input(
  { invalid, mono, className, ...rest },
  ref,
) {
  return (
    <input
      ref={ref}
      className={cn('ds-input', invalid && 'ds-input--invalid', mono && 'ds-input--mono', className)}
      {...rest}
    />
  );
});

/* ===== Textarea ===== */
export interface TextareaProps extends TextareaHTMLAttributes<HTMLTextAreaElement> {
  invalid?: boolean;
}
export const Textarea = forwardRef<HTMLTextAreaElement, TextareaProps>(function Textarea(
  { invalid, className, ...rest },
  ref,
) {
  return (
    <textarea ref={ref} className={cn('ds-input', invalid && 'ds-input--invalid', className)} {...rest} />
  );
});

/* ===== Select ===== */
export interface SelectProps extends SelectHTMLAttributes<HTMLSelectElement> {
  invalid?: boolean;
}
export const Select = forwardRef<HTMLSelectElement, SelectProps>(function Select(
  { invalid, className, children, ...rest },
  ref,
) {
  return (
    <select ref={ref} className={cn('ds-input', invalid && 'ds-input--invalid', className)} {...rest}>
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
