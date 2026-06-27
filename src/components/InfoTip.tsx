import { useState, useId, useRef, useLayoutEffect } from "react";
import { Info } from "lucide-react";

interface InfoTipProps {
  /** 툴팁 본문 — 한글 용어 + 간단 설명 */
  content: string;
  /** 접근성 라벨 (생략 시 content 사용) */
  label?: string;
}

const TIP_WIDTH = 232;
const VIEWPORT_MARGIN = 8;

/**
 * 영문 약어 옆에 붙는 작은 ⓘ 아이콘. hover/focus 시 한글 용어·설명을 툴팁으로 표시.
 * 분석 탭 지표 라벨처럼 좁은 공간에 본문을 늘리지 않고 용어를 병기하기 위한 용도.
 */
export default function InfoTip({ content, label }: InfoTipProps) {
  const [open, setOpen] = useState(false);
  const id = useId();
  const wrapRef = useRef<HTMLSpanElement>(null);
  // 그리드 좌우 끝 카드에서 가운데 정렬 툴팁이 뷰포트를 벗어나 글자가 잘리지 않도록
  // 아이콘 기준 이상적 위치를 뷰포트 안으로 clamp 한 수평 보정치(px).
  const [shiftX, setShiftX] = useState(0);

  useLayoutEffect(() => {
    if (!open || !wrapRef.current) return;
    const r = wrapRef.current.getBoundingClientRect();
    const iconCenter = r.left + r.width / 2;
    const idealLeft = iconCenter - TIP_WIDTH / 2;
    const maxLeft = window.innerWidth - VIEWPORT_MARGIN - TIP_WIDTH;
    const clampedLeft = Math.max(VIEWPORT_MARGIN, Math.min(idealLeft, maxLeft));
    setShiftX(clampedLeft - idealLeft);
  }, [open]);

  return (
    <span
      ref={wrapRef}
      style={{ position: "relative", display: "inline-flex", alignItems: "center", verticalAlign: "middle", lineHeight: 0 }}
    >
      <button
        type="button"
        aria-label={label ?? content}
        aria-describedby={open ? id : undefined}
        onMouseEnter={() => setOpen(true)}
        onMouseLeave={() => setOpen(false)}
        onFocus={() => setOpen(true)}
        onBlur={() => setOpen(false)}
        onClick={(e) => {
          e.stopPropagation();
          setOpen((v) => !v);
        }}
        style={{
          display: "inline-flex",
          alignItems: "center",
          justifyContent: "center",
          padding: 0,
          margin: 0,
          border: "none",
          background: "transparent",
          color: "var(--ink-4)",
          cursor: "help",
          lineHeight: 0,
          // eyebrow 라벨의 line-height(13.5px) 때문에 글리프가 박스 위쪽에 앉아
          // 박스 중심 정렬 시 아이콘이 ~1px 아래로 보인다. 광학 보정으로 살짝 올림.
          position: "relative",
          top: "-1px",
        }}
      >
        <Info size={11} aria-hidden style={{ display: "block" }} />
      </button>
      {open && (
        <span
          id={id}
          role="tooltip"
          style={{
            position: "absolute",
            bottom: "calc(100% + 6px)",
            left: "50%",
            transform: `translateX(calc(-50% + ${shiftX}px))`,
            zIndex: 50,
            width: TIP_WIDTH,
            padding: "9px 11px",
            borderRadius: "var(--r-md)",
            background: "var(--bg-0)",
            border: "1px solid var(--line-soft)",
            color: "var(--ink-1)",
            fontSize: 11.5,
            lineHeight: 1.55,
            fontWeight: 400,
            boxShadow: "0 4px 16px color-mix(in oklch, var(--ink-0) 18%, transparent)",
            whiteSpace: "normal",
            // 한국어는 글자 단위로 끊지 말고 어절(공백) 단위로만 줄바꿈 → 자연스러운 가독성
            wordBreak: "keep-all",
            overflowWrap: "anywhere",
            textAlign: "left",
            pointerEvents: "none",
          }}
        >
          {content}
        </span>
      )}
    </span>
  );
}
