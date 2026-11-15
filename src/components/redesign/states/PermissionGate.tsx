import type { ReactNode } from "react";
import { useTranslation } from "react-i18next";
import { Button, Card } from "../../../theme/components";
import { Resolvable, type Resolve } from "./Resolvable";

interface PermissionGateProps {
  title?: string;
  description?: ReactNode;
  actionLabel?: string;
  onAction?: () => void;
  /** 안내 문구를 누르면 갈 곳(권한 없는 화면이면 상세로 돌아가기 등). 버튼·설명을 덧붙이지 않는다. */
  resolve?: Resolve;
  compact?: boolean;
}

export default function PermissionGate({
  title,
  description,
  actionLabel,
  onAction,
  resolve,
  compact,
}: PermissionGateProps) {
  const { t } = useTranslation("common");
  const resolvedTitle = title ?? t("auth.loginRequiredTitle");
  // 기본 설명("로그인이 필요해요")은 로그인 관문에만 붙인다 — 제목만 넘긴 권한 없음 관문에 붙으면
  // 이미 로그인한 사람에게 로그인하라고 잘못 안내한다(이벤트 운영 화면 사례).
  const isLoginGate = title === undefined || onAction !== undefined;
  const resolvedDescription = description ?? (isLoginGate ? t("auth.loginRequiredDescription") : undefined);
  const resolvedActionLabel = actionLabel ?? t("button.login");
  const pad = compact ? "var(--space-6)" : "var(--space-8)";
  return (
    <Card padding="none" role="status" style={{ padding: pad, textAlign: "center" }}>
      <div aria-hidden="true" style={{ fontSize: compact ? "var(--fs-2xl)" : "var(--fs-3xl)", marginBottom: "var(--space-3)", color: "var(--ink-3)" }}>
        🔒
      </div>
      <Resolvable resolve={resolve} style={{ display: "block", width: "100%", textAlign: "center" }}>
      <span style={{ display: "block", fontSize: compact ? "var(--fs-md)" : "var(--fs-lg)", fontWeight: 600, color: "var(--ink-0)", marginBottom: resolvedDescription ? "var(--space-2)" : 0 }}>
        {resolvedTitle}
      </span>
      {resolvedDescription && (
        <span style={{ display: "block", fontSize: "var(--fs-base)", color: "var(--ink-3)", lineHeight: 1.5 }}>{resolvedDescription}</span>
      )}
      </Resolvable>
      {onAction && (
        <div style={{ marginTop: "var(--space-4)" }}>
          <Button type="button" variant="primary" size="sm" onClick={onAction}>
            {resolvedActionLabel}
          </Button>
        </div>
      )}
    </Card>
  );
}
