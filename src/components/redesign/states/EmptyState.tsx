import type { ReactNode, MouseEvent } from "react";
import { LocalizedLink as Link } from "../../LocalizedLink";
import { Card } from "../../../theme/components";
export interface EmptyStateAction {
  label: string;
  variant?: "primary" | "secondary";
  onClick?: (e: MouseEvent<HTMLButtonElement>) => void;
  href?: string;
}

interface EmptyStateProps {
  icon?: ReactNode;
  title: string;
  description?: ReactNode;
  actions?: EmptyStateAction[];
  compact?: boolean;
}

export default function EmptyState({ icon, title, description, actions, compact }: EmptyStateProps) {
  const pad = compact ? "var(--space-6)" : "var(--space-8)";
  return (
    <Card padding="none"
      role="status"
      style={{ padding: pad, textAlign: "center" }}
    >
      {icon != null && (
        <div
          aria-hidden="true"
          style={{ fontSize: compact ? "var(--fs-2xl)" : 32, marginBottom: "var(--space-3)", color: "var(--ink-3)" }}
        >
          {icon}
        </div>
      )}
      <div
        style={{
          fontSize: compact ? "var(--fs-md)" : "var(--fs-lg)",
          fontWeight: 600,
          color: "var(--ink-0)",
          marginBottom: description ? "var(--space-2)" : 0,
        }}
      >
        {title}
      </div>
      {description && (
        <div style={{ fontSize: "var(--fs-base)", color: "var(--ink-3)", lineHeight: 1.5 }}>{description}</div>
      )}
      {actions && actions.length > 0 && (
        <div
          className="flex items-center justify-center flex-wrap"
          style={{ gap: "var(--space-2)", marginTop: "var(--space-4)" }}
        >
          {actions.map((a, i) => {
            const cls = a.variant === "primary" ? "ds-btn ds-btn--md ds-btn--primary ds-btn--sm" : "ds-btn ds-btn--md ds-btn--ghost ds-btn--sm";
            if (a.href) {
              return a.href.startsWith("http") ? (
                <a key={i} href={a.href} className={cls} target="_blank" rel="noopener noreferrer">
                  {a.label}
                </a>
              ) : (
                <Link key={i} to={a.href} className={cls}>
                  {a.label}
                </Link>
              );
            }
            return (
              <button key={i} type="button" className={cls} onClick={a.onClick}>
                {a.label}
              </button>
            );
          })}
        </div>
      )}
    </Card>
  );
}
