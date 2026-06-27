import React, { forwardRef, type HTMLAttributes, type ReactNode } from 'react';
import { cn } from './cn';

export type CardVariant = 'default' | 'flat' | 'inset' | 'bare';
export type CardPadding = 'card' | 'compact' | 'none' | number;

export interface CardProps extends Omit<HTMLAttributes<HTMLDivElement>, 'title'> {
  variant?: CardVariant;
  /**
   * 내부 padding.
   * - `card` (기본) — 16px (`--dim-card-padding`)
   * - `compact` — 12px
   * - `none` — 0 (이전 `rd-card` 와 동일, children 이 자체 padding 갖는 경우)
   * - number — 임의 px
   */
  padding?: CardPadding;
  /** 호버 효과 + cursor pointer. onClick 사용 시 권장. */
  clickable?: boolean;
  /** 헤더 영역 — title/sub/actions 묶음. */
  header?: ReactNode;
  title?: ReactNode;
  /** 우측 sub label (보통 mono uppercase). */
  sub?: ReactNode;
  /** 헤더 우측 액션. */
  actions?: ReactNode;
}

export const Card = forwardRef<HTMLDivElement, CardProps>(function Card(
  { variant = 'default', padding = 'card', clickable, header, title, sub, actions, className, style, children, ...rest },
  ref,
) {
  const paddingStyle: React.CSSProperties = padding === 'card'
    ? {} // CSS 기본값 사용
    : padding === 'none'
    ? { padding: 0 }
    : padding === 'compact'
    ? { padding: 12 }
    : { padding };
  const hasHeader = header || title || sub || actions;
  return (
    <div
      ref={ref}
      className={cn(
        'ds-card',
        variant !== 'default' && `ds-card--${variant}`,
        clickable && 'ds-card--clickable',
        className,
      )}
      style={{ ...paddingStyle, ...style }}
      {...rest}
    >
      {hasHeader && (
        <div className="ds-card__header">
          {header ?? (
            <>
              {title && <h3 className="ds-card__title">{title}</h3>}
              {(sub || actions) && (
                <div style={{ display: 'flex', alignItems: 'center', gap: 8 }}>
                  {sub && <span className="ds-card__sub">{sub}</span>}
                  {actions}
                </div>
              )}
            </>
          )}
        </div>
      )}
      {children}
    </div>
  );
});
