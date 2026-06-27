import { forwardRef, type ButtonHTMLAttributes, type ReactNode } from 'react';
import { cn } from './cn';
import type { ButtonSize, ButtonVariant } from './Button';

/**
 * 아이콘 only 버튼 — 정사각, aria-label 필수.
 *
 * Button.iconOnly 와 동일 결과지만 사용 의도를 명확히 하고
 * TypeScript 가 aria-label 누락을 잡을 수 있도록 별도 컴포넌트.
 */
export interface IconButtonProps extends Omit<ButtonHTMLAttributes<HTMLButtonElement>, 'type' | 'aria-label' | 'children'> {
  /** 접근성 — 스크린리더용 라벨. 필수. */
  'aria-label': string;
  variant?: ButtonVariant;
  size?: ButtonSize;
  icon: ReactNode;
  type?: 'button' | 'submit' | 'reset';
}

export const IconButton = forwardRef<HTMLButtonElement, IconButtonProps>(function IconButton(
  { variant = 'ghost', size = 'md', icon, type = 'button', className, ...rest },
  ref,
) {
  return (
    <button
      ref={ref}
      type={type}
      className={cn('ds-btn', `ds-btn--${variant}`, `ds-btn--${size}`, 'ds-btn--icon-only', className)}
      {...rest}
    >
      <span className="ds-btn__icon" aria-hidden>{icon}</span>
    </button>
  );
});
