/**
 * 자동 적응 배너 — PlanPage 상단에 노출.
 *
 * goal.adaptationFlag.severity 가 warn / critical 이고 snoozedUntil 이 만료된 경우에만 렌더링.
 * 액션: "지금 재생성" (rerollPlan onCall), "1주 동안 보지 않기" (snoozedUntil 7일 후로 설정)
 */
import { useState } from "react";
import { useTranslation } from "react-i18next";
import { doc, updateDoc } from "firebase/firestore";
import { httpsCallable } from "firebase/functions";
import { firestore, functions } from "../../services/firebase";
import type { AdaptationFlag } from "@shared/types/goal";
import { Button } from "../../theme/components";

interface Props {
  goalId: string;
  flag: AdaptationFlag;
  onChange: () => void; // 스누즈/리롤 후 재로드 트리거
}

const STYLES: Record<"warn" | "critical", { bg: string; border: string; ink: string }> = {
  warn: {
    bg: "color-mix(in srgb, var(--amber) 12%, transparent)",
    border: "color-mix(in srgb, var(--amber) 40%, transparent)",
    ink: "var(--amber)",
  },
  critical: {
    bg: "color-mix(in srgb, var(--rose) 12%, transparent)",
    border: "color-mix(in srgb, var(--rose) 40%, transparent)",
    ink: "var(--rose)",
  },
};

export default function AdaptationBanner({ goalId, flag, onChange }: Props) {
  const { t } = useTranslation("training");
  const [busy, setBusy] = useState(false);
  // optimistic: 사용자가 스누즈 누른 직후 onChange 리로드가 끝나기 전까지 즉시 숨김
  const [locallySnoozedUntil, setLocallySnoozedUntil] = useState<number | null>(null);

  // 스누즈 만료 또는 info → 미표시
  const now = Date.now();
  if (flag.severity === "info") return null;
  if (!flag.shouldRerollSuggested) return null;
  if (flag.snoozedUntil != null && flag.snoozedUntil > now) return null;
  if (locallySnoozedUntil != null && locallySnoozedUntil > now) return null;

  const style = STYLES[flag.severity];

  async function onReroll() {
    if (busy) return;
    if (!window.confirm(t("confirmations.rerollConfirm"))) return;
    setBusy(true);
    try {
      const reroll = httpsCallable(functions, "rerollPlan");
      await reroll({ goalId });
      onChange();
    } catch (err) {
      console.error(t("errors.rerollFailed"), err);
      alert(t("errors.rerollError"));
    } finally {
      setBusy(false);
    }
  }

  async function onSnooze() {
    if (busy) return;
    setBusy(true);
    try {
      const snoozedUntil = Date.now() + 7 * 24 * 60 * 60 * 1000;
      await updateDoc(doc(firestore, "goals", goalId), {
        "adaptationFlag.snoozedUntil": snoozedUntil,
      });
      // 즉시 숨김: 부모 reload가 끝나기 전 깜빡임 방지
      setLocallySnoozedUntil(snoozedUntil);
      onChange();
    } catch (err) {
      console.error("[adaptation] snooze failed:", err);
      alert(t("adaptation.snoozeError"));
    } finally {
      setBusy(false);
    }
  }

  return (
    <div
      role="alert"
      style={{
        margin: "16px 0 8px",
        padding: "var(--space-3) var(--space-4)",
        background: style.bg,
        border: `1px solid ${style.border}`,
        borderRadius: 8,
        display: "flex",
        alignItems: "center",
        gap: 'var(--space-3)',
        flexWrap: "wrap",
      }}
    >
      <div
        aria-hidden
        style={{
          width: 8,
          height: 8,
          borderRadius: "50%",
          background: style.ink,
          flexShrink: 0,
        }}
      />
      <div style={{ flex: 1, minWidth: 200 }}>
        <div style={{ fontSize: 13, fontWeight: 600, color: style.ink, marginBottom: 2 }}>
          {flag.severity === "critical" ? "⚠ " : ""}
          {flag.reason}
        </div>
        {flag.recent4wRatio != null && (
          <div style={{ fontSize: 11, color: "var(--ink-3)" }}>
            {t("adaptation.metricsLine", { pct: Math.round(flag.recent4wRatio * 100) })}
            {flag.streakWeeksOff != null && flag.streakWeeksOff > 0
              ? t("adaptation.streakSuffix", { count: flag.streakWeeksOff })
              : ""}
          </div>
        )}
      </div>
      <div style={{ display: "flex", gap: 'var(--space-2)', flexShrink: 0 }}>
        <Button
          type="button" variant="secondary" size="sm"
          onClick={onSnooze}
          disabled={busy}
        >
          {t("adaptation.snooze")}
        </Button>
        <Button
          type="button" variant="secondary" size="sm"
          onClick={onReroll}
          disabled={busy}
          style={{ color: style.ink, borderColor: style.border }}
        >
          {t("adaptation.rerollNow")}
        </Button>
      </div>
    </div>
  );
}
