import type { ReactNode } from "react";
import { useTranslation } from "react-i18next";
import { Button, Card } from "../../../theme/components";

interface ErrorStateProps {
  title?: string;
  description?: ReactNode;
  onRetry?: () => void;
  retryLabel?: string;
  compact?: boolean;
}

export default function ErrorState({
  title,
  description,
  onRetry,
  retryLabel,
  compact,
}: ErrorStateProps) {
  const { t } = useTranslation("common");
  const resolvedTitle = title ?? t("error.title");
  const resolvedDescription = description ?? t("error.description");
  const resolvedRetryLabel = retryLabel ?? t("button.retry");
  const pad = compact ? "var(--space-6)" : "var(--space-8)";
  return (
    <Card padding="none"
      role="alert"
      style={{
        padding: pad,
        textAlign: "center",
        borderColor: "color-mix(in oklch, var(--rose) 30%, var(--line-soft))",
      }}
    >
      <div
        aria-hidden="true"
        style={{ fontSize: compact ? "var(--fs-2xl)" : 32, marginBottom: "var(--space-3)", color: "var(--rose)" }}
      >
        !
      </div>
      <div
        style={{
          fontSize: compact ? "var(--fs-md)" : "var(--fs-lg)",
          fontWeight: 600,
          color: "var(--ink-0)",
          marginBottom: resolvedDescription ? "var(--space-2)" : 0,
        }}
      >
        {resolvedTitle}
      </div>
      {resolvedDescription && (
        <div style={{ fontSize: "var(--fs-base)", color: "var(--ink-3)", lineHeight: 1.5 }}>{resolvedDescription}</div>
      )}
      {onRetry && (
        <div style={{ marginTop: "var(--space-4)" }}>
          <Button type="button" variant="ghost" size="sm" onClick={onRetry}>
            {resolvedRetryLabel}
          </Button>
        </div>
      )}
    </Card>
  );
}
