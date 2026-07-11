/**
 * 첫 동기화 축하 (설계 문서 §3.0.3) — "기록이 해석으로 바뀌는 순간".
 *
 * 이 설계가 스스로 "결정적 순간"이라 부른 경험이다. 클라이언트 발화이므로 백엔드 일정과
 * 무관하게 aha moment 와 같은 릴리스에 나간다 (판정 근거는 `utils/firstSync.ts` 참조).
 *
 * 접근성: role="dialog" + aria-modal, 포커스 트랩, ESC 닫기,
 * `prefers-reduced-motion` 이면 등장 애니메이션을 생략한다.
 */
import { useEffect, useId, useRef, useState } from "react";
import { useTranslation } from "react-i18next";
import { PartyPopper } from "lucide-react";
import { buttonClass, Text } from "../../theme/components";
import { LocalizedLink } from "../LocalizedLink";

const FOCUSABLE = 'a[href], button:not([disabled]), [tabindex]:not([tabindex="-1"])';

function usePrefersReducedMotion(): boolean {
  const [reduced, setReduced] = useState(false);
  useEffect(() => {
    if (typeof window === "undefined" || !window.matchMedia) return;
    const mq = window.matchMedia("(prefers-reduced-motion: reduce)");
    setReduced(mq.matches);
    const onChange = (e: MediaQueryListEvent) => setReduced(e.matches);
    mq.addEventListener("change", onChange);
    return () => mq.removeEventListener("change", onChange);
  }, []);
  return reduced;
}

export interface FirstSyncCelebrationProps {
  /** 첫 러닝 활동 id — "해석 보러 가기" 링크 대상. */
  activityId: string | null;
  onClose: () => void;
}

export default function FirstSyncCelebration({ activityId, onClose }: FirstSyncCelebrationProps) {
  const { t } = useTranslation("dashboard");
  const reducedMotion = usePrefersReducedMotion();
  const panelRef = useRef<HTMLDivElement>(null);
  const titleId = useId();

  useEffect(() => {
    const node = panelRef.current;
    if (!node) return;
    node.querySelector<HTMLElement>(FOCUSABLE)?.focus();

    const onKeyDown = (e: KeyboardEvent) => {
      if (e.key === "Escape") {
        e.stopPropagation();
        onClose();
        return;
      }
      if (e.key !== "Tab") return;
      const items = Array.from(node.querySelectorAll<HTMLElement>(FOCUSABLE));
      if (items.length === 0) return;
      const first = items[0]!;
      const last = items[items.length - 1]!;
      if (e.shiftKey && document.activeElement === first) {
        e.preventDefault();
        last.focus();
      } else if (!e.shiftKey && document.activeElement === last) {
        e.preventDefault();
        first.focus();
      }
    };
    document.addEventListener("keydown", onKeyDown, true);
    return () => document.removeEventListener("keydown", onKeyDown, true);
  }, [onClose]);

  return (
    <div
      className="fixed inset-0 z-50 flex items-center justify-center bg-black/50 p-4"
      onClick={onClose}
    >
      <div
        ref={panelRef}
        role="dialog"
        aria-modal="true"
        aria-labelledby={titleId}
        onClick={(e) => e.stopPropagation()}
        style={{
          width: "100%",
          maxWidth: 380,
          background: "var(--bg-1)",
          border: "1px solid var(--line-soft)",
          borderRadius: "var(--r-lg)",
          padding: "var(--space-6) var(--space-5)",
          textAlign: "center",
          animation: reducedMotion ? undefined : "first-sync-in 260ms ease-out",
        }}
      >
        <style>{"@keyframes first-sync-in{from{transform:scale(.96);opacity:0}to{transform:none;opacity:1}}"}</style>

        <PartyPopper size={36} aria-hidden="true" style={{ color: "var(--accent)" }} />

        <Text as="h2" id={titleId} variant="subtitle" tone="primary" style={{ margin: "var(--space-3) 0 var(--space-2)" }}>
          {t("firstSync.title")}
        </Text>
        <Text as="p" variant="bodySmall" tone="secondary" style={{ margin: "0 0 var(--space-5)" }}>
          {t("firstSync.body")}
        </Text>

        <div style={{ display: "flex", flexDirection: "column", gap: "var(--space-2)" }}>
          {activityId && (
            <LocalizedLink
              to={`/activity/${activityId}`}
              className={buttonClass({ variant: "primary", size: "md", block: true })}
              style={{ minHeight: 44, display: "flex", alignItems: "center", justifyContent: "center" }}
              onClick={onClose}
            >
              {t("firstSync.viewCta")}
            </LocalizedLink>
          )}
          <button
            type="button"
            onClick={onClose}
            className={buttonClass({ variant: "ghost", size: "md", block: true })}
            style={{ minHeight: 44 }}
          >
            {t("firstSync.later")}
          </button>
        </div>
      </div>
    </div>
  );
}
