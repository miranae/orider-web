import type { ReactNode } from "react";
import { useTranslation } from "react-i18next";
import { Button, Card } from "../../../theme/components";
import { Resolvable, type Resolve } from "./Resolvable";

interface ErrorStateProps {
  title?: string;
  description?: ReactNode;
  onRetry?: () => void;
  retryLabel?: string;
  /** 오류 문구(제목·설명)를 누르면 해소하는 곳으로 — 해결 화면 경로나 다시 불러오기. 버튼을 덧붙이지 않는다. */
  resolve?: Resolve;
  compact?: boolean;
}

export default function ErrorState({
  title,
  description,
  onRetry,
  retryLabel,
  resolve,
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
        style={{ fontSize: compact ? "var(--fs-2xl)" : "var(--fs-3xl)", marginBottom: "var(--space-3)", color: "var(--rose)" }}
      >
        !
      </div>
      <Resolvable resolve={resolve} style={{ display: "block", width: "100%", textAlign: "center" }}>
      <span
        style={{
          display: "block",
          fontSize: compact ? "var(--fs-md)" : "var(--fs-lg)",
          fontWeight: 600,
          color: "var(--ink-0)",
          marginBottom: resolvedDescription ? "var(--space-2)" : 0,
        }}
      >
        {resolvedTitle}
      </span>
      {resolvedDescription && (
        <span style={{ display: "block", fontSize: "var(--fs-base)", color: "var(--ink-3)", lineHeight: 1.5 }}>{resolvedDescription}</span>
      )}
      </Resolvable>
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
