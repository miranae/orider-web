import { useId, type HTMLAttributes, type ReactNode } from 'react';
import { cn } from './cn';

export interface SectionProps extends Omit<HTMLAttributes<HTMLElement>, 'title'> {
  title: ReactNode;
  description?: ReactNode;
  actions?: ReactNode;
  headingLevel?: 2 | 3 | 4;
  headingId?: string;
}

/** 콘텐츠 계층을 정의한다. 표면이 필요한 독립 묶음에만 Card를 별도로 사용한다. */
export function Section({ title, description, actions, headingLevel = 2, headingId, className, children, 'aria-labelledby': labelledBy, 'aria-describedby': describedBy, ...props }: SectionProps) {
  const id = useId();
  const titleId = headingId ?? `${id}-title`;
  const Heading = `h${headingLevel}` as 'h2' | 'h3' | 'h4';
  return <section className={cn('ds-section', className)} aria-labelledby={labelledBy ?? titleId} aria-describedby={describedBy ?? (description ? `${id}-description` : undefined)} {...props}>
    <header className="ds-section__header"><div className="ds-section__heading">
      <Heading id={titleId} className={`ds-section__title ds-section__title--h${headingLevel}`}>{title}</Heading>
      {description && <div id={`${id}-description`} className="ds-section__description">{description}</div>}
    </div>{actions && <div className="ds-section__actions">{actions}</div>}</header>
    <div className="ds-section__content">{children}</div>
  </section>;
}
