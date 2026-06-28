import { useEffect, useRef, useState } from "react";
import { useTranslation } from "react-i18next";
import {
  collection,
  limit,
  onSnapshot,
  orderBy,
  query,
} from "firebase/firestore";
import { httpsCallable } from "firebase/functions";

import { firestore, functions } from "../../services/firebase";
import { logClientError } from "../../services/errorLogger";
import { useAuth } from "../../contexts/AuthContext";
import { useToast } from "../../contexts/ToastContext";
import type { ThresholdSuggestionDoc } from "@shared/types/threshold";

type Suggestion = ThresholdSuggestionDoc;

interface ThresholdSuggestionBannerProps {
  /** 수락 후 입력 폼 즉시 갱신을 위한 콜백 */
  onAccepted?: (applied: { ftp?: number; lthr?: number; maxHr?: number }) => void;
}

export function ThresholdSuggestionBanner({ onAccepted }: ThresholdSuggestionBannerProps) {
  const { t } = useTranslation("settings");
  const { user } = useAuth();
  const { showToast } = useToast();
  const [sugg, setSugg] = useState<Suggestion | null>(null);
  const [busy, setBusy] = useState(false);
  // busy 동안 새 onSnapshot 갱신을 잠시 큐잉 — accept/dismiss 클릭과 새 제안 도착이
  // 겹쳐 같은 자리에서 카드가 뒤바뀌는 UX race 방지.
  const busyRef = useRef(false);
  // pendingRef: undefined=대기 중인 갱신 없음, null=빈 갱신 대기, Suggestion=새 제안 대기
  const pendingRef = useRef<Suggestion | null | undefined>(undefined);

  useEffect(() => {
    if (!user) { setSugg(null); return; }
    const collRef = collection(firestore, "users", user.uid, "threshold_suggestions");
    // composite index 회피: 최근 N개 createdAt desc만 받고 accepted/dismissed는 클라 필터.
    const q = query(collRef, orderBy("createdAt", "desc"), limit(10));

    // onSnapshot으로 실시간 — 백엔드 트리거가 새 제안을 작성하면 즉시 노출
    const unsub = onSnapshot(
      q,
      (snap) => {
        const doc = snap.docs.find((d) => {
          const x = d.data() as Suggestion;
          return !x.accepted && !x.dismissed;
        });
        const next = doc ? ({ ...(doc.data() as Suggestion), activityId: doc.id }) : null;
        if (busyRef.current) {
          pendingRef.current = next;
          return;
        }
        setSugg(next);
      },
      (err) => {
        logClientError("ThresholdSuggestionBanner.onSnapshot", err);
        setSugg(null);
      },
    );
    return () => unsub();
  }, [user]);

  /** busy 종료 시 pending 갱신 흘려보내기 */
  const releaseBusy = () => {
    busyRef.current = false;
    setBusy(false);
    if (pendingRef.current !== undefined) {
      setSugg(pendingRef.current);
      pendingRef.current = undefined;
    }
  };

  if (!sugg) return null;

  const items: Array<{ key: "ftp" | "lthr" | "maxHr"; label: string; unit: string; cur: number | null; prop: number; sub: string }> = [];
  if (sugg.ftp) items.push({ key: "ftp", label: "FTP", unit: "W", cur: sugg.ftp.current, prop: sugg.ftp.proposed, sub: sugg.ftp.reason });
  if (sugg.lthr) items.push({ key: "lthr", label: "LTHR", unit: "bpm", cur: sugg.lthr.current, prop: sugg.lthr.proposed, sub: sugg.lthr.reason });
  if (sugg.maxHr) items.push({ key: "maxHr", label: t("threshold.maxHrLabel"), unit: "bpm", cur: sugg.maxHr.current, prop: sugg.maxHr.proposed, sub: sugg.maxHr.reason });

  if (items.length === 0) return null;

  const handleAccept = async () => {
    if (!sugg || busy) return;
    const activityId = sugg.activityId; // closure 캡처 — busy 동안 sugg 갱신 무시
    busyRef.current = true;
    setBusy(true);
    try {
      const fn = httpsCallable<unknown, { ok: boolean; applied: Record<string, number> }>(
        functions,
        "acceptThresholdSuggestion",
      );
      const result = await fn({
        activityId,
        fields: { ftp: !!sugg.ftp, lthr: !!sugg.lthr, maxHr: !!sugg.maxHr },
      });
      showToast(t("threshold.acceptSuccess"));
      onAccepted?.(result.data.applied);
    } catch (err) {
      logClientError("ThresholdSuggestionBanner.handleAccept", err, { activityId });
      showToast(t("threshold.acceptFailed"));
    } finally {
      releaseBusy();
    }
  };

  const handleDismiss = async () => {
    if (!sugg || busy) return;
    const activityId = sugg.activityId;
    busyRef.current = true;
    setBusy(true);
    try {
      const fn = httpsCallable(functions, "dismissThresholdSuggestion");
      await fn({ activityId });
    } catch (err) {
      logClientError("ThresholdSuggestionBanner.handleDismiss", err, { activityId });
    } finally {
      releaseBusy();
    }
  };

  return (
    <div
      style={{
        margin: "8px 0 16px",
        padding: "12px 14px",
        border: "1px solid color-mix(in oklch, var(--amber) 35%, transparent)",
        borderRadius: "var(--r-lg)",
        background: "color-mix(in oklch, var(--amber) 8%, transparent)",
        display: "flex",
        flexDirection: "column",
        gap: "var(--space-2)",
      }}
    >
      <div style={{ fontSize: "var(--fs-xs)", fontWeight: 600, color: "var(--ink-1)" }}>
        {t("threshold.suggestionTitle")}
      </div>
      <div style={{ display: "flex", flexDirection: "column", gap: "var(--space-1)" }}>
        {items.map((it) => (
          <div key={it.key} style={{ display: "flex", justifyContent: "space-between", alignItems: "baseline", fontSize: "var(--fs-xs)" }}>
            <span style={{ color: "var(--ink-2)" }}>
              {it.label}
              <span style={{ marginLeft: 'var(--space-2)', color: "var(--ink-3)", fontSize: "var(--fs-xs)" }}>{it.sub}</span>
            </span>
            <span style={{ fontFamily: "var(--font-mono)" }}>
              <span style={{ color: "var(--ink-3)" }}>{it.cur ?? "—"}</span>
              <span style={{ margin: "0 6px", color: "var(--ink-3)" }}>→</span>
              <span style={{ color: "var(--ink-0)", fontWeight: 600 }}>{it.prop} {it.unit}</span>
            </span>
          </div>
        ))}
      </div>
      <div style={{ display: "flex", gap: 'var(--space-2)', justifyContent: "flex-end" }}>
        <button
          type="button"
          onClick={handleDismiss}
          disabled={busy}
          style={{
            padding: "6px 12px",
            fontSize: "var(--fs-xs)",
            borderRadius: "var(--r-sm)",
            border: "1px solid var(--line-soft)",
            background: "transparent",
            cursor: busy ? "default" : "pointer",
            color: "var(--ink-2)",
          }}
        >
          {t("threshold.dismiss")}
        </button>
        <button
          type="button"
          onClick={handleAccept}
          disabled={busy}
          style={{
            padding: "6px 12px",
            fontSize: "var(--fs-xs)",
            borderRadius: "var(--r-sm)",
            border: "none",
            background: "var(--amber)",
            color: "white",
            fontWeight: 600,
            cursor: busy ? "default" : "pointer",
          }}
        >
          {t("threshold.acceptAll")}
        </button>
      </div>
    </div>
  );
}
