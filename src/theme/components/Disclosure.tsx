import { type ReactNode, type DetailsHTMLAttributes } from "react";
import { ChevronDown } from "lucide-react";
import { cn } from "./cn";

export interface DisclosureProps extends Omit<DetailsHTMLAttributes<HTMLDetailsElement>, "title"> {
  title: ReactNode;
  description?: ReactNode;
}

/** Supporting detail stays one keyboard/touch action away; the summary remains readable when closed. */
export function Disclosure({ title, description, className, children, ...props }: DisclosureProps) {
  return <details className={cn("ds-disclosure", className)} {...props}>
    <summary className="ds-disclosure__summary"><span className="ds-disclosure__heading"><span className="ds-disclosure__title">{title}</span>{description && <span className="ds-disclosure__description">{description}</span>}</span><ChevronDown aria-hidden="true" className="ds-disclosure__chevron" /></summary>
    <div className="ds-disclosure__content">{children}</div>
  </details>;
}
