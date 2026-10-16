import { forwardRef, type HTMLAttributes, type ReactNode } from "react";
import { Text } from "./Text";
import { cn } from "./cn";
import "./TooltipContent.css";

interface TooltipContentProps extends Omit<HTMLAttributes<HTMLSpanElement>, "title"> {
  title: string;
  children: ReactNode;
}

/** Structured, readable term explanation. Placement and interaction belong to the trigger. */
export const TooltipContent = forwardRef<HTMLSpanElement, TooltipContentProps>(function TooltipContent(
  { title, children, className, ...props }, ref,
) {
  return (
    <span ref={ref} className={cn("ds-tooltip-content", className)} {...props}>
      <Text as="strong" variant="bodyMedium" weight={600} tone="primary" className="ds-tooltip-content__title">{title}</Text>
      <Text variant="bodySmall" tone="secondary" className="ds-tooltip-content__body">{children}</Text>
    </span>
  );
});
