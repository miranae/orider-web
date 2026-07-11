/**
 * 마일스톤 축하 모달 (설계 문서 §3.4b) — celebrated:false 인 신규 달성에만 노출.
 *
 * 소급분(배포 전 달성)은 서버가 celebrated:true 로 조용히 기록하므로 여기 오지 않는다.
 * 모달을 띄우면 호출부가 celebrated:true 로 갱신(rules 가 이 필드만 허용).
 *
 * 접근성: role="dialog" + aria-modal, 포커스 트랩, ESC, prefers-reduced-motion.
 */
import { useEffect, useId, useRef, useState } from "react";
import { useTranslation } from "react-i18next";
import { Trophy } from "lucide-react";
import { buttonClass, Text } from "../../theme/components";
import type { MilestoneId } from "@shared/types/milestone";

const FOCUSABLE = 'a[href], button:not([disabled]), [tabindex]:not([tabindex="-1"])';

const MEDAL: Record<MilestoneId, string> = {
  first_5km: "🏅",
  first_10km: "🎖️",
  first_half: "🥈",
  first_full: "🏆",
  cumulative_100km: "💯",
  cumulative_500km: "🔥",
  cumulative_1000km: "👑",
};

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

export interface MilestoneCelebrationProps {
  milestoneId: MilestoneId;
  onClose: () => void;
}

export default function MilestoneCelebration({ milestoneId, onClose }: MilestoneCelebrationProps) {
  const { t } = useTranslation("fitness");
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
    <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/50 p-4" onClick={onClose}>
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
          animation: reducedMotion ? undefined : "milestone-in 260ms ease-out",
        }}
      >
        <style>{"@keyframes milestone-in{from{transform:scale(.94);opacity:0}to{transform:none;opacity:1}}"}</style>

        <div style={{ display: "flex", alignItems: "center", justifyContent: "center", gap: "var(--space-2)" }}>
          <Trophy size={28} aria-hidden="true" style={{ color: "var(--accent)" }} />
          <Text as="span" variant="dataMedium" aria-hidden="true">{MEDAL[milestoneId]}</Text>
        </div>

        <Text as="h2" id={titleId} variant="subtitle" tone="primary" style={{ margin: "var(--space-3) 0 var(--space-2)" }}>
          {t(`milestones.celebrate.${milestoneId}.title`)}
        </Text>
        <Text as="p" variant="bodySmall" tone="secondary" style={{ margin: "0 0 var(--space-5)" }}>
          {t(`milestones.celebrate.${milestoneId}.body`)}
        </Text>

        <button
          type="button"
          onClick={onClose}
          className={buttonClass({ variant: "primary", size: "md", block: true })}
          style={{ minHeight: 44 }}
        >
          {t("milestones.celebrate.cta")}
        </button>
      </div>
    </div>
  );
}
