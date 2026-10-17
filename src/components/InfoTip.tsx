import { useState, useId, useRef, useLayoutEffect, useEffect, type ReactNode, type CSSProperties } from "react";
import { createPortal } from "react-dom";
import { Info } from "lucide-react";
import { splitGlossaryText } from "../utils/termGlossary";
import { useGlossaryScope } from "./common/GlossaryProvider";
import { TooltipContent } from "../theme/components/TooltipContent";

interface InfoTipProps {
  /** 용어와 간단한 설명 */
  content: string;
  /** Opt into the structured design-system explanation; omitted for legacy tooltips. */
  title?: string;
  /** 접근성 라벨 (생략 시 content 사용) */
  label?: string;
  /** Stable shared identifier; explicit IDs also disambiguate domain-specific acronyms. */
  termId?: string;
  /** Use the term itself as the trigger; omitted children preserve legacy icon-only callers. */
  children?: ReactNode;
  className?: string;
  style?: CSSProperties;
  /**
   * `inherit` (text triggers only): surrounding ink + dotted underline, no 24px minimum width so a short term
   * stays attached to the symbol after it ("Z4+"). The default keeps the accent trigger used elsewhere.
   */
  tone?: "default" | "inherit";
}

const TIP_WIDTH = 232;
const VIEWPORT_MARGIN = 8;

/** Hover, focus, or tap for a description. The portal escapes clipped card/chart containers. */
export default function InfoTip({ content, title, label, termId, children, className, style, tone = "default" }: InfoTipProps) {
  const [open, setOpen] = useState(false);
  const [position, setPosition] = useState({ left: VIEWPORT_MARGIN, top: VIEWPORT_MARGIN });
  const id = useId();
  const buttonRef = useRef<HTMLButtonElement>(null);
  const tipRef = useRef<HTMLSpanElement>(null);
  const pinned = useRef(false);
  const closeTimer = useRef<ReturnType<typeof setTimeout> | undefined>(undefined);
  const textTrigger = children !== undefined && children !== null;
  const termSource = label ?? (typeof children === "string" ? children : content);
  const sourceParts = splitGlossaryText(termSource);
  const namedTerms = sourceParts.filter(part => part.termId);
  const inferredTerm = namedTerms.length === 1 || sourceParts[0]?.termId
    ? namedTerms[0]?.termId : undefined;
  const identifiedTerm = termId ?? inferredTerm;
  const glossaryKey = identifiedTerm ?? `content:${content}`;
  const scopeKey = useGlossaryScope();
  const tipWidth = title ? 320 : TIP_WIDTH;
  const viewportMargin = title ? 12 : VIEWPORT_MARGIN;

  function cancelClose() {
    clearTimeout(closeTimer.current);
  }

  function close() {
    cancelClose();
    pinned.current = false;
    setOpen(false);
  }

  function leave() {
    cancelClose();
    if (!pinned.current && document.activeElement !== buttonRef.current) {
      closeTimer.current = setTimeout(() => setOpen(false), 120);
    }
  }

  useEffect(() => () => clearTimeout(closeTimer.current), []);
  useEffect(() => {
    pinned.current = false;
    setOpen(false);
  }, [scopeKey]);

  useLayoutEffect(() => {
    if (!open) return;
    function updatePosition() {
      if (!buttonRef.current || !tipRef.current) return;
      const button = buttonRef.current.getBoundingClientRect();
      const tip = tipRef.current.getBoundingClientRect();
      const width = Math.min(tipWidth, window.innerWidth - 2 * viewportMargin);
      const left = Math.max(viewportMargin, Math.min(button.left + button.width / 2 - width / 2,
        window.innerWidth - viewportMargin - width));
      const preferredTop = button.top - tip.height - viewportMargin;
      const top = Math.max(viewportMargin, Math.min(
        preferredTop >= viewportMargin ? preferredTop : button.bottom + viewportMargin,
        window.innerHeight - viewportMargin - tip.height,
      ));
      setPosition({ left, top });
    }
    updatePosition();
    window.addEventListener("resize", updatePosition);
    window.addEventListener("scroll", updatePosition, true);
    return () => {
      window.removeEventListener("resize", updatePosition);
      window.removeEventListener("scroll", updatePosition, true);
    };
  }, [open, content, title, tipWidth, viewportMargin]);

  useEffect(() => {
    if (!open) return;
    function onPointerDown(event: PointerEvent) {
      const target = event.target as Node;
      if (!buttonRef.current?.contains(target) && !tipRef.current?.contains(target)) {
        pinned.current = false;
        clearTimeout(closeTimer.current);
        setOpen(false);
      }
    }
    function onKeyDown(event: KeyboardEvent) {
      if (event.key === "Escape") {
        pinned.current = false;
        clearTimeout(closeTimer.current);
        setOpen(false);
      }
    }
    document.addEventListener("pointerdown", onPointerDown);
    document.addEventListener("keydown", onKeyDown);
    return () => {
      document.removeEventListener("pointerdown", onPointerDown);
      document.removeEventListener("keydown", onKeyDown);
    };
  }, [open]);

  const tooltipProps = {
    ref: tipRef,
    id,
    role: "tooltip",
    onMouseEnter: cancelClose,
    onMouseLeave: leave,
    style: {
      position: "fixed",
      left: position.left,
      top: position.top,
      zIndex: 150,
      width: `min(${tipWidth}px, calc(100vw - ${2 * viewportMargin}px))`,
      maxHeight: `calc(100dvh - ${2 * viewportMargin}px)`,
      overflowY: "auto",
    } satisfies CSSProperties,
  };

  return (
    <span data-glossary-key={glossaryKey} className={className} style={{
      display: textTrigger ? "inline" : "inline-flex",
      alignItems: "center",
      verticalAlign: textTrigger ? "baseline" : "middle",
      lineHeight: textTrigger ? "inherit" : 0,
      ...style,
    }}>
      <button
        ref={buttonRef}
        type="button"
        aria-label={label ?? content}
        aria-describedby={open ? id : undefined}
        onMouseEnter={() => { cancelClose(); setOpen(true); }}
        onMouseLeave={leave}
        onFocus={() => { cancelClose(); setOpen(true); }}
        onBlur={close}
        onClick={(event) => {
          event.stopPropagation();
          cancelClose();
          pinned.current = !pinned.current;
          setOpen(pinned.current);
        }}
        style={{
          display: "inline-flex",
          alignItems: "center",
          justifyContent: "center",
          minWidth: textTrigger && tone === "inherit" ? 0 : "var(--space-6)",
          minHeight: "var(--space-6)",
          padding: 0,
          margin: 0,
          border: "none",
          borderRadius: "var(--r-sm)",
          background: "transparent",
          color: textTrigger ? tone === "inherit" ? "inherit" : "var(--color-primary-dark)" : "var(--ink-3)",
          ...(textTrigger && tone === "inherit" ? { textDecoration: "underline dotted", textUnderlineOffset: "0.2em" } : {}),
          cursor: "help",
          font: "inherit",
          letterSpacing: "inherit",
          textTransform: "inherit",
          lineHeight: textTrigger ? "inherit" : 0,
        }}
      >
        {textTrigger ? children : <Info size={13} aria-hidden style={{ display: "block" }} />}
      </button>
      {open && createPortal(title ? (
        <TooltipContent {...tooltipProps} title={title}>{content}</TooltipContent>
      ) : (
        <span
          {...tooltipProps}
          style={{
            ...tooltipProps.style,
            padding: "var(--space-2) var(--space-3)",
            borderRadius: "var(--r-md)",
            background: "var(--bg-0)",
            border: "1px solid var(--line-soft)",
            color: "var(--ink-1)",
            fontSize: "var(--fs-xs)",
            lineHeight: 1.55,
            fontWeight: 400,
            boxShadow: "var(--shadow-md)",
            whiteSpace: "normal",
            wordBreak: "keep-all",
            overflowWrap: "anywhere",
            textAlign: "left",
          }}
        >
          {content}
        </span>
      ), document.body)}
    </span>
  );
}
