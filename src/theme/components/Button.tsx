import { forwardRef, type ButtonHTMLAttributes, type ReactNode } from 'react';
import { cn } from './cn';

/**
 * 디자인 시스템 버튼 프리미티브.
 *
 * 앱 `RideTheme` 의 버튼 스타일 정합 — 토큰만 소비, 외부에서 색/사이즈 직지정 불가.
 * 레거시 `rd-btn`, `rd2-btn`, Tailwind 조립을 통합.
 *
 * @example
 * <Button variant="primary" size="lg">시작</Button>
 * <Button variant="ghost" leadingIcon={<Icon/>}>설정</Button>
 * <Button loading>업로드 중</Button>
 */
export type ButtonVariant = 'primary' | 'secondary' | 'ghost' | 'outline' | 'danger';
export type ButtonSize = 'sm' | 'md' | 'lg';

export interface ButtonProps extends Omit<ButtonHTMLAttributes<HTMLButtonElement>, 'type'> {
  variant?: ButtonVariant;
  size?: ButtonSize;
  /** 로딩 스피너 표시 + disabled. */
  loading?: boolean;
  /** 전체 폭 점유. */
  block?: boolean;
  /** 아이콘 only — 정사각 padding. */
  iconOnly?: boolean;
  leadingIcon?: ReactNode;
  trailingIcon?: ReactNode;
  /** HTML type — 기본 'button' (form submit 사고 방지). */
  type?: 'button' | 'submit' | 'reset';
}

/**
 * 버튼 스타일 className 생성 헬퍼.
 *
 * `<button>` 가 아닌 요소(예: `<Link>`, `<a>`) 에 동일 비주얼을 입혀야 할 때 사용.
 * 가능하면 `<Button>` 컴포넌트를 직접 쓰고, 라우터 호환이 필요한 경우만 헬퍼 사용.
 *
 * @example
 * <Link to="/x" className={buttonClass({ variant: 'primary', size: 'sm' })}>이동</Link>
 */
export function buttonClass(opts: { variant?: ButtonVariant; size?: ButtonSize; iconOnly?: boolean; block?: boolean; className?: string } = {}): string {
  const { variant = 'secondary', size = 'md', iconOnly, block, className } = opts;
  return [
    'ds-btn',
    `ds-btn--${variant}`,
    `ds-btn--${size}`,
    iconOnly && 'ds-btn--icon-only',
    block && 'ds-btn--block',
    className,
  ].filter(Boolean).join(' ');
}

export const Button = forwardRef<HTMLButtonElement, ButtonProps>(function Button(
  {
    variant = 'secondary',
    size = 'md',
    loading,
    block,
    iconOnly,
    leadingIcon,
    trailingIcon,
    disabled,
    type = 'button',
    className,
    children,
    ...rest
  },
  ref,
) {
  return (
    <button
      ref={ref}
      type={type}
      disabled={disabled || loading}
      data-loading={loading || undefined}
      className={cn(
        'ds-btn',
        `ds-btn--${variant}`,
        `ds-btn--${size}`,
        block && 'ds-btn--block',
        iconOnly && 'ds-btn--icon-only',
        loading && 'ds-btn--loading',
        className,
      )}
      {...rest}
    >
      {loading && <span className="ds-btn__spinner" aria-hidden />}
      {!loading && leadingIcon && <span className="ds-btn__icon" aria-hidden>{leadingIcon}</span>}
      {children && <span className="ds-btn__label">{children}</span>}
      {!loading && trailingIcon && <span className="ds-btn__icon" aria-hidden>{trailingIcon}</span>}
    </button>
  );
});
