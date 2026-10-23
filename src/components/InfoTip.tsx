import { useState, useId, useRef, useLayoutEffect, useEffect, type ReactNode, type CSSProperties } from "react";
import { createPortal } from "react-dom";
import { useTranslation } from "react-i18next";
import { IconButton } from "../theme/components/IconButton";
import { Info, X } from "lucide-react";
import { splitGlossaryText } from "../utils/termGlossary";
import { useGlossaryScope } from "./common/GlossaryProvider";
import { TooltipContent } from "../theme/components/TooltipContent";
import { ICON_SIZE } from "../theme/tokens/icon";

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
  /** `accent`: theme-aware semantic accent text, without an underline. */
  tone?: "default" | "inherit" | "accent";
  /** Compatibility for callers explicitly requesting the shared click behavior. */
  activation?: "click";
}

const TIP_WIDTH = 232;
const VIEWPORT_MARGIN = 8;

/** Explicit click, tap, Enter or Space opens a description. The portal escapes clipped card/chart containers. */
export default function InfoTip({ content, title, label, termId, children, className, style, tone = "default" }: InfoTipProps) {
  const { t } = useTranslation("common");
  const [open, setOpen] = useState(false);
  const [position, setPosition] = useState({ left: VIEWPORT_MARGIN, top: VIEWPORT_MARGIN });
  const id = useId();
  const closeRef = useRef<HTMLButtonElement>(null);
  const buttonRef = useRef<HTMLButtonElement>(null);
  const tipRef = useRef<HTMLSpanElement>(null);
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

  function close() { setOpen(false); }

  function show() {
    document.dispatchEvent(new CustomEvent("orider-help-open", { detail: id }));
    setOpen(true);
  }

  function dismissAndRestore() {
    close();
    buttonRef.current?.focus({ preventScroll: true });
  }

  useEffect(() => {
    const otherHelp = (event: Event) => { if ((event as CustomEvent<string>).detail !== id) close(); };
    const navigation = () => close();
    document.addEventListener("orider-help-open", otherHelp);
    window.addEventListener("popstate", navigation);
    window.addEventListener("hashchange", navigation);
    return () => {
      document.removeEventListener("orider-help-open", otherHelp);
      window.removeEventListener("popstate", navigation);
      window.removeEventListener("hashchange", navigation);
    };
  }, [id]);
  useEffect(() => {
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
    const onScroll = (event: Event) => {
      if (event.target instanceof Node && tipRef.current?.contains(event.target)) return;
      close();
    };
    window.addEventListener("scroll", onScroll, true);
    return () => {
      window.removeEventListener("resize", updatePosition);
      window.removeEventListener("scroll", onScroll, true);
    };
  }, [open, content, title, tipWidth, viewportMargin]);

  useEffect(() => {
    if (!open) return;
    function onPointerDown(event: PointerEvent) {
      const target = event.target as Node;
      if (!buttonRef.current?.contains(target) && !tipRef.current?.contains(target)) {
        setOpen(false);
      }
    }
    function onKeyDown(event: KeyboardEvent) {
      if (event.key === "Escape") {
        event.stopPropagation();
        dismissAndRestore();
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
    style: {
      position: "fixed",
      left: position.left,
      top: position.top,
      zIndex: 150,
      width: `min(${tipWidth}px, calc(100vw - ${2 * viewportMargin}px))`,
      maxHeight: `calc(100dvh - ${2 * viewportMargin}px)`,
      overflowY: "auto",
      display: "block",
      background: "var(--bg-1)",
      borderRadius: "var(--r-lg)",
      boxShadow: "var(--shadow-md)",
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
        aria-expanded={open}
        aria-controls={open ? `${id}-popover` : undefined}
        onKeyDown={event => {
          if (event.key === "Tab" && !event.shiftKey && open) {
            event.preventDefault();
            closeRef.current?.focus({ preventScroll: true });
          }
        }}
        onBlur={event => { if (!tipRef.current?.contains(event.relatedTarget as Node)) close(); }}
        onClick={(event) => {
          event.stopPropagation();
          if (open) close(); else show();
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
          color: textTrigger ? tone === "inherit" ? "inherit" : tone === "accent" ? "var(--accent-text)" : "var(--color-primary-dark)" : "var(--ink-3)",
          ...(textTrigger && tone === "inherit" ? { textDecoration: "underline dotted", textUnderlineOffset: "0.2em" } : {}),
          cursor: "help",
          font: "inherit",
          letterSpacing: "inherit",
          textTransform: "inherit",
          lineHeight: textTrigger ? "inherit" : 0,
        }}
      >
        {textTrigger ? children : <Info size={ICON_SIZE.xs} aria-hidden style={{ display: "block" }} />}
      </button>
      {open && createPortal(<span {...tooltipProps} className="ds-help-popover" id={`${id}-popover`} role="group" aria-label={title ?? label ?? content}
        onBlur={event => { if (!event.currentTarget.contains(event.relatedTarget as Node) && event.relatedTarget !== buttonRef.current) close(); }}>
        <IconButton className="ds-help-popover__close" ref={closeRef} aria-label={t("button.close")} variant="ghost" size="sm" onClick={event => { event.stopPropagation(); dismissAndRestore(); }} icon={<X size={ICON_SIZE.xs} aria-hidden />} />
        {title ? (
        <TooltipContent id={id} role="tooltip" title={title}>{content}</TooltipContent>
      ) : (
        <span
          id={id} role="tooltip"
          style={{
            display: "block",
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
      )}</span>, document.body)}
    </span>
  );
}
