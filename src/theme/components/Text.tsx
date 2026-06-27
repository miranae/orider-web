import { createElement, forwardRef, type ElementType, type HTMLAttributes, type ReactNode } from 'react';
import { cn } from './cn';

/**
 * 의미 단위 타이포 프리미티브.
 *
 * `variant` 가 의미(title/subtitle/body/...) 위계를 결정 — 앱 `theme.typography.*` 와 정합.
 * `size` 는 임시 raw 사이즈 변경 (variant 가 맞지 않는 일회성 경우만).
 * `as` 로 의미 태그 변경 가능 (기본 span).
 *
 * 사용처에서 `className="text-xs"` 등 Tailwind 사이즈 클래스 직접 쓰지 말 것.
 */
export type TextVariant =
  | 'dataHero'
  | 'dataLarge'
  | 'dataMedium'
  | 'dataSmall'
  | 'title'
  | 'subtitle'
  | 'bodyLarge'
  | 'body'
  | 'bodyMedium'
  | 'bodySmall'
  | 'caption'
  | 'label'
  | 'eyebrow'
  | 'mono'
  // 옛 .num / .unit 유틸 흡수 — 인라인 수치 옆 단위 표시용
  | 'num'
  | 'unit';

export type TextSize = 'xs' | 'sm' | 'base' | 'md' | 'lg' | 'xl' | '2xl' | '3xl' | '4xl' | '5xl';
export type TextWeight = 400 | 500 | 600 | 700;
export type TextTone = 'primary' | 'secondary' | 'tertiary' | 'quaternary' | 'disabled' | 'accent' | 'success' | 'warning' | 'danger';

export interface TextProps extends HTMLAttributes<HTMLElement> {
  variant?: TextVariant;
  /** variant 가 아닌 raw 사이즈 한 단계만 변경. variant + size 동시 사용 가능. */
  size?: TextSize;
  weight?: TextWeight;
  /** 잉크 토큰 단계. 기본 secondary(--ink-1). */
  tone?: TextTone;
  /** 줄바꿈/말줄임. */
  truncate?: boolean;
  /** 수치(JetBrains Mono + tnum). */
  mono?: boolean;
  /** 의미 태그 (h1/h2/p/etc). 기본 span. */
  as?: ElementType;
  children?: ReactNode;
}

const VARIANT_CLASS: Record<TextVariant, string> = {
  dataHero: 'ds-text--data-hero',
  dataLarge: 'ds-text--data-large',
  dataMedium: 'ds-text--data-medium',
  dataSmall: 'ds-text--data-small',
  title: 'ds-text--title',
  subtitle: 'ds-text--subtitle',
  bodyLarge: 'ds-text--body-large',
  body: 'ds-text--body',
  bodyMedium: 'ds-text--body-medium',
  bodySmall: 'ds-text--body-small',
  caption: 'ds-text--caption',
  label: 'ds-text--label',
  eyebrow: 'ds-text--eyebrow',
  mono: 'ds-text--mono',
  num: 'ds-text--num',
  unit: 'ds-text--unit',
};

const TONE_CLASS: Record<TextTone, string> = {
  primary: 'ds-text--tone-0',
  secondary: 'ds-text--tone-1',
  tertiary: 'ds-text--tone-2',
  quaternary: 'ds-text--tone-3',
  disabled: 'ds-text--tone-4',
  accent: 'ds-text--tone-accent',
  success: 'ds-text--tone-success',
  warning: 'ds-text--tone-warning',
  danger: 'ds-text--tone-danger',
};

export const Text = forwardRef<HTMLElement, TextProps>(function Text(
  { variant, size, weight, tone, truncate, mono, as = 'span', className, children, style, ...rest },
  ref,
) {
  const merged = cn(
    'ds-text',
    variant && VARIANT_CLASS[variant],
    size && `ds-text--size-${size}`,
    tone && TONE_CLASS[tone],
    truncate && 'ds-text--truncate',
    (mono || variant === 'mono') && 'ds-text--mono',
    className,
  );
  return createElement(
    as,
    { ref, className: merged, style: weight ? { fontWeight: weight, ...style } : style, ...rest },
    children,
  );
});
