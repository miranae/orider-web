/**
 * 신발 교체 임박 배지 (설계 문서 §3.6).
 *
 * 신규 기능이 아니라 **기존 데이터의 노출 확대**다 — 활동 상세에서만 보이던 신발 누적 거리를
 * 교체가 임박했을 때만 대시보드로 끌어올린다. 항상 띄우면 배너 피로가 된다.
 */
import { useTranslation } from "react-i18next";
import { Card, Text } from "../../theme/components";
import type { ShoeStatus } from "../../utils/shoeStatus";
import { Resolvable } from "../redesign/states/Resolvable";

export interface ShoeReplacementBadgeProps {
  status: ShoeStatus | null;
}

export default function ShoeReplacementBadge({ status }: ShoeReplacementBadgeProps) {
  const { t } = useTranslation("dashboard");
  if (!status?.replacementDue) return null;

  return (
    <Card style={{ display: "flex", alignItems: "center", gap: "var(--space-3)" }}>
      <span aria-hidden="true" style={{ fontSize: "var(--fs-lg)" }}>👟</span>
      <div style={{ flex: 1, minWidth: 0 }}>
        <Text as="div" variant="bodySmall" tone="primary" weight={500}>
          {/* 문구를 누르면 장비(신발) 화면으로 간다. */}
          <Resolvable resolve={{ to: "/athlete/me/gear" }}>{t("shoeBadge.title", { name: status.name })}</Resolvable>
        </Text>
        <Text as="div" variant="caption" tone="tertiary" mono>
          {t("shoeBadge.detail", { total: status.totalDistanceKm, remaining: status.remainingKm })}
        </Text>
      </div>
    </Card>
  );
}
