import { useTranslation } from "react-i18next";

import type {
  BikeThresholdDecisionV2,
  FtpDeviceReceipt,
  FtpMutationReceipt,
} from "@shared/types/threshold";
import { Button, Chip, Text } from "../../../theme/components";

interface Props {
  decision: BikeThresholdDecisionV2 | null;
  receipt?: FtpMutationReceipt | null;
  deviceReceipts?: FtpDeviceReceipt[];
  busy?: boolean;
  onAccept: () => void;
}

export default function BikeFtpDecisionActionPanel({
  decision,
  receipt = null,
  deviceReceipts = [],
  busy = false,
  onAccept,
}: Props) {
  const { t } = useTranslation("fitness");
  if (!decision) return null;
  const actionable = decision.status === "actionable";
  const expired = decision.status === "actionable" && Date.now() >= decision.expiresAt;
  const canAccept = actionable && !expired;
  const unavailableKey = decision.blockReason === "activity_pdc_disagreement"
    ? "ftpDecision.blocked.activityPdcDisagreement"
    : decision.blockReason === "increase_over_15_percent"
      ? "ftpDecision.blocked.increaseOver15Percent"
      : "ftpDecision.unavailable";

  return (
    <section
      data-bike-ftp-decision={decision.decisionId}
      aria-label={t("ftpDecision.ariaLabel")}
      style={{ marginTop: "var(--space-4)", padding: "var(--space-4)", border: "1px solid var(--accent-soft-border)", borderRadius: "var(--r-md)", background: "var(--accent-soft-bg)" }}
    >
      <div style={{ display: "flex", alignItems: "center", justifyContent: "space-between", gap: "var(--space-2)" }}>
        <Text as="h3" variant="title" style={{ margin: 0 }}>{t("ftpDecision.title")}</Text>
        <Chip variant={canAccept ? "accent" : "default"}>{t(`ftpDecision.status.${expired ? "expired" : decision.status}`)}</Chip>
      </div>
      <div style={{ display: "grid", gridTemplateColumns: "repeat(2, minmax(0, 1fr))", gap: "var(--space-3)", marginTop: "var(--space-3)" }}>
        <Value label={t("ftpDecision.current")} value={decision.candidate.currentFtp} />
        <Value label={t("ftpDecision.candidate")} value={decision.candidate.ftp} accent />
      </div>
      <Text as="p" variant="bodySmall" tone="secondary" style={{ margin: "var(--space-3) 0 0" }}>
        {t("ftpDecision.evidence", {
          watts: decision.candidate.ftp,
          confidence: t(`ftpDecision.confidence.${decision.confidence.level}`),
        })}
      </Text>
      <Text as="p" variant="caption" tone="secondary" style={{ margin: "var(--space-2) 0 0" }}>
        {t("ftpDecision.impact", { scale: decision.impactPreview.workoutScalePct })}
      </Text>
      {canAccept && (
        <Button variant="primary" size="sm" block loading={busy} onClick={onAccept} style={{ marginTop: "var(--space-3)" }}>
          {t("ftpDecision.accept")}
        </Button>
      )}
      {(expired || decision.status === "blocked" || decision.status === "expired") && (
        <Text as="p" variant="caption" tone="secondary" style={{ margin: "var(--space-3) 0 0" }}>
          {t(expired ? "ftpDecision.expired" : unavailableKey)}
        </Text>
      )}
      {(decision.status === "accepted" || receipt) && (
        <ReceiptPanel receipt={receipt} deviceReceipts={deviceReceipts} />
      )}
    </section>
  );
}

function Value({ label, value, accent = false }: { label: string; value: number | null; accent?: boolean }) {
  return (
    <div>
      <Text as="div" variant="caption" tone="secondary">{label}</Text>
      <div style={{ display: "flex", alignItems: "baseline", gap: "var(--space-1)" }}>
        <Text variant="dataLarge" style={accent ? { color: "var(--aqua)" } : undefined}>{value ?? "—"}</Text>
        {value != null && <Text variant="unit">W</Text>}
      </div>
    </div>
  );
}

function ReceiptPanel({ receipt, deviceReceipts }: { receipt: FtpMutationReceipt | null; deviceReceipts: FtpDeviceReceipt[] }) {
  const { t } = useTranslation("fitness");
  return (
    <div data-ftp-receipt style={{ marginTop: "var(--space-4)", paddingTop: "var(--space-3)", borderTop: "1px solid var(--line-soft)" }}>
      <Text as="div" variant="eyebrow">{t("ftpDecision.receipt.title")}</Text>
      <Text as="p" variant="caption" tone="secondary" style={{ margin: "var(--space-1) 0 0" }}>
        {receipt
          ? t(`ftpDecision.receipt.status.${receipt.status}`, {
              applied: receipt.appliedCount,
              targeted: receipt.targetedDeviceCount,
              pending: receipt.pendingCount,
            })
          : t("ftpDecision.receipt.waiting")}
      </Text>
      {deviceReceipts.length > 0 && (
        <div style={{ display: "grid", gap: "var(--space-2)", marginTop: "var(--space-2)" }}>
          {deviceReceipts.map((item) => (
            <div key={item.deviceId} style={{ display: "flex", justifyContent: "space-between", gap: "var(--space-3)" }}>
              <Text variant="caption">{item.deviceId || t("ftpDecision.receipt.device")}</Text>
              <Text variant="caption" tone="secondary">{t(`ftpDecision.receipt.deviceState.${item.state}`)}</Text>
            </div>
          ))}
        </div>
      )}
    </div>
  );
}
