import type { CSSProperties, HTMLAttributes, ReactNode } from 'react';
import { cn } from './cn';

export interface StackProps extends HTMLAttributes<HTMLDivElement> {
  /** 방향. 기본 'column'. */
  direction?: 'row' | 'column';
  /** gap 토큰 (px) — 기본 itemGap(8). */
  gap?: number | string;
  /** flex-wrap. */
  wrap?: boolean;
  align?: CSSProperties['alignItems'];
  justify?: CSSProperties['justifyContent'];
  children: ReactNode;
}

/**
 * 인라인 `style={{ display:'flex', gap:N }}` 패턴 대체.
 *
 * 토큰을 직접 우회하지 않도록 gap 은 `--dim-*` CSS 변수 문자열도 허용:
 * `<Stack gap="var(--dim-section-gap)" />`.
 */
export function Stack({
  direction = 'column',
  gap,
  wrap,
  align,
  justify,
  className,
  style,
  children,
  ...rest
}: StackProps) {
  const gapValue = typeof gap === 'number' ? `${gap}px` : gap;
  return (
    <div
      className={cn('ds-stack', direction === 'row' && 'ds-stack--row', wrap && 'ds-stack--wrap', className)}
      style={{
        ...(gapValue ? { ['--ds-stack-gap' as string]: gapValue } : null),
        ...(align ? { alignItems: align } : null),
        ...(justify ? { justifyContent: justify } : null),
        ...style,
      }}
      {...rest}
    >
      {children}
    </div>
  );
}
