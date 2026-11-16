import { forwardRef, type HTMLAttributes, type ReactNode } from "react";
import { Text } from "./Text";
import { cn } from "./cn";
import "./TooltipContent.css";

interface TooltipContentProps extends Omit<HTMLAttributes<HTMLSpanElement>, "title"> {
  title?: string;
  children: ReactNode;
  /** A dismissible help panel keeps its action outside the text-only tooltip. */
  headerAction?: ReactNode;
  descriptionId?: string;
}

/** Structured, readable term explanation. Placement and interaction belong to the trigger. */
export const TooltipContent = forwardRef<HTMLSpanElement, TooltipContentProps>(function TooltipContent(
  { title, children, headerAction, descriptionId, className, ...props }, ref,
) {
  if (headerAction) {
    const titleId = title && descriptionId ? `${descriptionId}-title` : undefined;
    return (
      <span ref={ref} className={cn("ds-tooltip-content", "ds-tooltip-content--help", !title && "ds-tooltip-content--untitled", className)} {...props}>
        {title ? (
          <span className="ds-tooltip-content__header">
            <Text as="strong" id={titleId} variant="bodyMedium" weight={600} tone="primary" className="ds-tooltip-content__title">{title}</Text>
            {headerAction}
          </span>
        ) : <span className="ds-tooltip-content__action">{headerAction}</span>}
        <span className="ds-tooltip-content__scroll" tabIndex={0} aria-describedby={descriptionId}>
          <Text id={descriptionId} role="tooltip" aria-labelledby={titleId} variant="bodySmall" tone="secondary" className="ds-tooltip-content__body">{children}</Text>
        </span>
      </span>
    );
  }
  return (
    <span ref={ref} className={cn("ds-tooltip-content", className)} {...props}>
      <Text as="strong" variant="bodyMedium" weight={600} tone="primary" className="ds-tooltip-content__title">{title}</Text>
      <Text variant="bodySmall" tone="secondary" className="ds-tooltip-content__body">{children}</Text>
    </span>
  );
});
