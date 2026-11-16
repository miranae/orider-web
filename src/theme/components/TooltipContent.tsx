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
    return (
      <span ref={ref} className={cn("ds-help-panel", className)} {...props}>
        <span className="ds-help-panel__action">{headerAction}</span>
        <span className="ds-help-panel__scroll" tabIndex={0} aria-describedby={descriptionId}>
          <span id={descriptionId} role="tooltip" className={cn("ds-tooltip-content", "ds-tooltip-content--help-text", !title && "ds-tooltip-content--untitled")}>
            {title && <Text as="strong" variant="bodyMedium" weight={600} tone="primary" className="ds-tooltip-content__title">{title}</Text>}
            <Text variant="bodySmall" tone="secondary" className="ds-tooltip-content__body">{children}</Text>
          </span>
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
