/**
 * MetricExplainer — 지표 해설 바텀시트 (설계 문서 §3.2).
 *
 * 3단 구조: 정의(일상어) → 내 수치의 개인화 해석 → 더 알아보기.
 * 개인 임계값이 없으면 해석 단락을 통째로 생략한다 — 근거 없는 개인화 문장을 지어내지 않는다.
 *
 * 접근성:
 * - 탭 타깃은 `MetricExplainerTrigger` 로 감싼 **셀 전체**(최소 44px). ⓘ 아이콘은 시각 어포던스일 뿐
 *   단독 히트 영역이 아니다.
 * - 시트는 role="dialog" + aria-modal, 포커스 트랩, ESC 닫기, 닫을 때 트리거로 포커스 복귀.
 * - `prefers-reduced-motion` 이면 슬라이드 애니메이션을 생략한다.
 */
import { useCallback, useEffect, useId, useRef, useState, type ReactNode } from "react";
import { useTranslation } from "react-i18next";
import { Info, X } from "lucide-react";
import { Text } from "../../theme/components";
import { track } from "../../services/analytics";
import { interpretMetric, type InterpretationContext, type MetricKey } from "../../utils/metricInterpretation";

const GLOSSARY_NS = "metricGlossary";

/** 지표별 매뉴얼 챕터 — 없으면 "더 알아보기" 링크를 숨긴다. */
const MANUAL_LINKS: Partial<Record<MetricKey, string>> = {
  pace: "/web-manual/ch08-multisport.html",
  gap: "/web-manual/ch08-multisport.html",
  cadence: "/web-manual/ch08-multisport.html",
  rtss: "/web-manual/ch07-training.html",
  thresholdPace: "/web-manual/ch08-multisport.html",
  ctl: "/web-manual/ch07-training.html",
  atl: "/web-manual/ch07-training.html",
  tsb: "/web-manual/ch07-training.html",
  criticalPace: "/web-manual/ch08-multisport.html",
};

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

export interface MetricExplainerSheetProps {
  metric: MetricKey;
  context: InterpretationContext;
  /** 활동 상세이면 "이번 러닝에서는", 피트니스 등 전역 화면이면 "내 수치는". */
  scope?: "activity" | "global";
  onClose: () => void;
}

export function MetricExplainerSheet({ metric, context, scope = "activity", onClose }: MetricExplainerSheetProps) {
  const { t } = useTranslation(GLOSSARY_NS);
  const reducedMotion = usePrefersReducedMotion();
  const sheetRef = useRef<HTMLDivElement>(null);
  const titleId = useId();
  const interp = interpretMetric(metric, context);
  const manualHref = MANUAL_LINKS[metric];

  // 포커스 트랩 + ESC. 열릴 때 시트로 포커스를 옮기고, 닫히면 호출부가 트리거로 되돌린다.
  useEffect(() => {
    const node = sheetRef.current;
    if (!node) return;
    const first = node.querySelector<HTMLElement>(FOCUSABLE);
    first?.focus();

    const onKeyDown = (e: KeyboardEvent) => {
      if (e.key === "Escape") {
        e.stopPropagation();
        onClose();
        return;
      }
      if (e.key !== "Tab") return;
      const items = Array.from(node.querySelectorAll<HTMLElement>(FOCUSABLE));
      if (items.length === 0) return;
      const firstItem = items[0]!;
      const lastItem = items[items.length - 1]!;
      const active = document.activeElement;
      if (e.shiftKey && active === firstItem) {
        e.preventDefault();
        lastItem.focus();
      } else if (!e.shiftKey && active === lastItem) {
        e.preventDefault();
        firstItem.focus();
      }
    };
    document.addEventListener("keydown", onKeyDown, true);
    return () => document.removeEventListener("keydown", onKeyDown, true);
  }, [onClose]);

  return (
    <div
      // 스크림은 두 테마 모두에서 배경을 어둡게 해야 한다 — bg-0 기반 색은 라이트 테마에서
      // 흰 스크림이 되어 아무것도 가리지 못한다. 프로젝트 관례(`bg-black/50`)를 따른다.
      className="fixed inset-0 z-50 flex items-end justify-center bg-black/50"
      onClick={onClose}
    >
      <div
        ref={sheetRef}
        role="dialog"
        aria-modal="true"
        aria-labelledby={titleId}
        onClick={(e) => e.stopPropagation()}
        style={{
          width: "100%",
          maxWidth: 480,
          background: "var(--bg-1)",
          border: "1px solid var(--line-soft)",
          borderBottom: "none",
          borderRadius: "var(--r-lg) var(--r-lg) 0 0",
          padding: "var(--space-3) var(--space-5) var(--space-6)",
          animation: reducedMotion ? undefined : "metric-explainer-in 220ms ease-out",
        }}
      >
        <style>{"@keyframes metric-explainer-in{from{transform:translateY(16px);opacity:0}to{transform:none;opacity:1}}"}</style>

        <div style={{ display: "flex", alignItems: "center", marginBottom: "var(--space-3)" }}>
          <div style={{ width: 36, height: 4, borderRadius: "var(--r-sm)", background: "var(--line-soft)", margin: "0 auto" }} />
        </div>

        <div style={{ display: "flex", alignItems: "flex-start", gap: "var(--space-2)" }}>
          <Text as="h2" id={titleId} variant="subtitle" tone="primary" style={{ margin: 0, flex: 1 }}>
            {t(`${metric}.title`)}
          </Text>
          <button
            type="button"
            onClick={onClose}
            aria-label={t("sheet.close")}
            style={{
              background: "transparent",
              border: 0,
              padding: "var(--space-1)",
              color: "var(--ink-3)",
              cursor: "pointer",
              lineHeight: 0,
            }}
          >
            <X size={18} />
          </button>
        </div>

        <Text as="p" variant="body" tone="secondary" style={{ margin: "var(--space-2) 0 var(--space-4)" }}>
          {t(`${metric}.definition`)}
        </Text>

        {interp && (
          <div
            style={{
              background: "var(--accent-soft-bg)",
              border: "1px solid var(--accent-soft-border)",
              borderRadius: "var(--r-md)",
              padding: "var(--space-3) var(--space-4)",
            }}
          >
            <Text as="div" variant="eyebrow" style={{ color: "var(--accent)", marginBottom: "var(--space-1)" }}>
              {scope === "activity" ? t("sheet.interpLabel") : t("sheet.interpLabelGeneric")}
            </Text>
            <Text as="p" variant="body" tone="primary" style={{ margin: 0 }}>
              {t(`${metric}.interp.${interp.variant}`, interp.values)}
            </Text>
          </div>
        )}

        {manualHref && (
          <a
            href={manualHref}
            style={{
              display: "inline-block",
              marginTop: "var(--space-4)",
              color: "var(--accent)",
              fontSize: "var(--fs-sm)",
              fontWeight: 600,
              textDecoration: "none",
            }}
          >
            {t("sheet.learnMore")} →
          </a>
        )}
      </div>
    </div>
  );
}

export interface MetricExplainerTriggerProps {
  metric: MetricKey;
  context: InterpretationContext;
  scope?: "activity" | "global";
  /** 분석 이벤트에 실을 종목 (bike/run/swim). */
  sport?: string;
  /** 트리거가 감쌀 내용 — 스탯 셀 전체. */
  children: ReactNode;
  className?: string;
  style?: React.CSSProperties;
}

/**
 * 지표 셀 전체를 탭 타깃으로 감싸는 트리거. ⓘ 아이콘을 우상단에 겹쳐 표시한다.
 * 12px 아이콘 자체를 히트 영역으로 쓰지 않는다(WCAG 2.5.8 최소 24px).
 */
export function MetricExplainerTrigger({
  metric,
  context,
  scope = "activity",
  sport,
  children,
  className,
  style,
}: MetricExplainerTriggerProps) {
  const { t } = useTranslation(GLOSSARY_NS);
  const [open, setOpen] = useState(false);
  const triggerRef = useRef<HTMLButtonElement>(null);

  const handleOpen = useCallback(() => {
    setOpen(true);
    track("or_metric_explainer_open", { metric, sport: sport ?? null });
  }, [metric, sport]);

  const handleClose = useCallback(() => {
    setOpen(false);
    triggerRef.current?.focus();
  }, []);

  return (
    <>
      <button
        ref={triggerRef}
        type="button"
        onClick={handleOpen}
        aria-haspopup="dialog"
        aria-label={`${t(`${metric}.title`)} — ${t("sheet.openHint")}`}
        className={className}
        style={{
          position: "relative",
          display: "block",
          width: "100%",
          minHeight: 44,
          textAlign: "left",
          background: "transparent",
          border: 0,
          padding: 0,
          font: "inherit",
          color: "inherit",
          cursor: "pointer",
          ...style,
        }}
      >
        {children}
        <Info
          size={12}
          aria-hidden="true"
          style={{ position: "absolute", top: 0, right: 0, color: "var(--ink-3)" }}
        />
      </button>
      {open && (
        <MetricExplainerSheet metric={metric} context={context} scope={scope} onClose={handleClose} />
      )}
    </>
  );
}
