import { createPortal } from "react-dom";
import { useLayoutEffect, useEffect, useMemo, useRef, useState, type KeyboardEvent, type ReactNode } from "react";
import { useTranslation } from "react-i18next";
import { Button, Text } from "../../theme/components";

interface TimeFieldProps {
  value: string; // "HH:MM" (24h)
  onChange: (next: string) => void;
  disabled?: boolean;
  placeholder?: string;
  id?: string;
  icon?: ReactNode;
  /** Same HH:MM value, displayed as elapsed hours/minutes rather than a clock time. */
  duration?: boolean;
  /** 분 간격 — 기본 5분 단위 */
  minuteStep?: number;
  /** 빠른 프리셋 (오전 6시·정오·오후 6시 등) 표시 */
  presets?: boolean;
  /** Opt in to escaping clipped page containers; existing callers remain inline. */
  portal?: boolean;
}

function pad2(n: number): string {
  return n < 10 ? `0${n}` : String(n);
}

function parseHM(s: string | undefined): { h: number; m: number } | null {
  if (!s) return null;
  const [hs, ms] = s.split(":");
  const h = Number(hs);
  const m = Number(ms);
  if (!Number.isFinite(h) || !Number.isFinite(m)) return null;
  if (h < 0 || h > 23 || m < 0 || m > 59) return null;
  return { h, m };
}

function formatKorean(s: string, am: string, pm: string): string {
  const hm = parseHM(s);
  if (!hm) return "";
  const isPM = hm.h >= 12;
  const h12 = hm.h % 12 || 12;
  return `${isPM ? pm : am} ${h12}:${pad2(hm.m)}`;
}

/**
 * 다크 테마 친화적인 시간 선택 필드.
 * - 네이티브 <input type="time"> 대체
 * - 시/분 열 리스트 + 빠른 프리셋
 */
export default function TimeField({
  value,
  onChange,
  disabled,
  placeholder,
  id,
  icon,
  duration = false,
  minuteStep = 5,
  presets = true,
  portal = false,
}: TimeFieldProps) {
  const { t, i18n } = useTranslation("common");
  const resolvedPlaceholder = placeholder ?? t("field.timePlaceholder");
  const [open, setOpen] = useState(false);
  const [openUp, setOpenUp] = useState(false);
  const containerRef = useRef<HTMLDivElement>(null);
  const triggerRef = useRef<HTMLButtonElement>(null);
  const popupRef = useRef<HTMLDivElement>(null);
  const [position, setPosition] = useState({ left: 0, top: 0 });
  const hourListRef = useRef<HTMLDivElement>(null);
  const minuteListRef = useRef<HTMLDivElement>(null);

  const parsed = useMemo(() => parseHM(value), [value]);
  const selectedHour = parsed?.h ?? null;
  const selectedMinute = parsed?.m ?? null;

  const hours = useMemo(() => Array.from({ length: 24 }, (_, i) => i), []);
  const minutes = useMemo(() => {
    const list: number[] = [];
    for (let m = 0; m < 60; m += minuteStep) list.push(m);
    return list;
  }, [minuteStep]);

  // 공간 부족 시 위로 열기
  useEffect(() => {
    if (!open || !triggerRef.current || portal) return;
    const rect = triggerRef.current.getBoundingClientRect();
    const spaceBelow = window.innerHeight - rect.bottom;
    setOpenUp(spaceBelow < 280 && rect.top > 280);
  }, [open, portal]);

  useLayoutEffect(() => {
    if (!open || !portal) return;
    const place = () => {
      if (!triggerRef.current || !popupRef.current) return;
      const trigger = triggerRef.current.getBoundingClientRect();
      const popup = popupRef.current.getBoundingClientRect();
      const margin = 12;
      const below = trigger.bottom + 4;
      const preferred = below + popup.height <= window.innerHeight - margin ? below : trigger.top - popup.height - 4;
      setPosition({
        left: Math.max(margin, Math.min(trigger.left, window.innerWidth - margin - popup.width)),
        top: Math.max(margin, Math.min(preferred, window.innerHeight - margin - popup.height)),
      });
    };
    place();
    window.addEventListener("resize", place);
    window.addEventListener("scroll", place, true);
    return () => { window.removeEventListener("resize", place); window.removeEventListener("scroll", place, true); };
  }, [open, portal]);

  // 외부 클릭 닫기
  useEffect(() => {
    if (!open) return;
    const handler = (e: MouseEvent) => {
      if (containerRef.current && !containerRef.current.contains(e.target as Node) && !popupRef.current?.contains(e.target as Node)) {
        setOpen(false);
      }
    };
    document.addEventListener("mousedown", handler);
    return () => document.removeEventListener("mousedown", handler);
  }, [open]);

  // Escape 닫기
  useEffect(() => {
    if (!open) return;
    const handler = (e: globalThis.KeyboardEvent) => { if (e.key === "Escape") { setOpen(false); if (portal) { e.preventDefault(); e.stopPropagation(); triggerRef.current?.focus(); } } };
    document.addEventListener("keydown", handler);
    return () => document.removeEventListener("keydown", handler);
  }, [open, portal]);

  // 팝오버가 열릴 때 선택된 항목을 중앙으로 스크롤
  useEffect(() => {
    if (!open) return;
    const scroll = (container: HTMLDivElement | null, selector: string) => {
      if (!container) return;
      const el = container.querySelector<HTMLElement>(selector);
      if (el) container.scrollTop = Math.max(0, el.offsetTop - container.clientHeight / 2 + el.clientHeight / 2);
    };
    scroll(hourListRef.current, "[data-selected=true]");
    scroll(minuteListRef.current, "[data-selected=true]");
  }, [open]);

  useEffect(() => {
    if (!open || !portal) return;
    (hourListRef.current?.querySelector<HTMLButtonElement>("[data-selected=true]")
      ?? hourListRef.current?.querySelector<HTMLButtonElement>("button"))?.focus();
  }, [open, portal]);

  const pick = (h: number, m: number) => {
    onChange(`${pad2(h)}:${pad2(m)}`);
  };

  const handleButtonKey = (e: KeyboardEvent<HTMLButtonElement>) => {
    if (e.key === "Enter" || e.key === " ") {
      e.preventDefault();
      setOpen((v) => !v);
    }
  };

  const handleListboxKey = (e: KeyboardEvent<HTMLDivElement>) => {
    if (e.key !== "ArrowUp" && e.key !== "ArrowDown" && e.key !== "Home" && e.key !== "End") return;
    const list = e.currentTarget;
    const items = Array.from(list.querySelectorAll<HTMLButtonElement>("button[role='option']"));
    if (items.length === 0) return;
    const current = document.activeElement instanceof HTMLElement ? document.activeElement : null;
    const idx = current ? items.indexOf(current as HTMLButtonElement) : -1;
    let next = idx;
    if (e.key === "ArrowDown") next = idx < 0 ? 0 : Math.min(idx + 1, items.length - 1);
    else if (e.key === "ArrowUp") next = idx < 0 ? items.length - 1 : Math.max(idx - 1, 0);
    else if (e.key === "Home") next = 0;
    else if (e.key === "End") next = items.length - 1;
    const target = items[next];
    if (next !== idx && target) {
      e.preventDefault();
      target.focus();
    }
  };

  const presetButtons: { label: string; hm: string }[] = presets
    ? [
        { label: "06:00", hm: "06:00" },
        { label: "09:00", hm: "09:00" },
        { label: "12:00", hm: "12:00" },
        { label: "18:00", hm: "18:00" },
      ]
    : [];

  const clockLabelText = value ? formatKorean(value, t("time.am"), t("time.pm")) : resolvedPlaceholder;
  const durationParts = duration ? parseHM(value) : null;
  const labelText = durationParts
    ? `${new Intl.NumberFormat(i18n?.language ?? "ko", { style: "unit", unit: "hour", unitDisplay: "long" }).format(durationParts.h)} ${new Intl.NumberFormat(i18n?.language ?? "ko", { style: "unit", unit: "minute", unitDisplay: "long" }).format(durationParts.m)}`
    : clockLabelText;

  const popup = open ? (
        <div
          ref={popupRef}
          role="dialog"
          aria-label={t("field.selectTimeAria")}
          style={{
            position: portal ? "fixed" : "absolute",
            top: portal ? position.top : openUp ? "auto" : "calc(100% + 4px)",
            bottom: !portal && openUp ? "calc(100% + 4px)" : "auto",
            left: portal ? position.left : 0,
            zIndex: portal ? 1000 : 50,
            ...(portal ? { maxWidth: "calc(100vw - 24px)", maxHeight: "calc(100dvh - 24px)", overflowY: "auto" as const, boxSizing: "border-box" as const } : {}),
            background: "var(--bg-1)",
            border: "1px solid var(--line)",
            borderRadius: "var(--r-md)",
            padding: 'var(--space-3)',
            boxShadow: "0 12px 32px color-mix(in srgb, var(--bg-0) 45%, transparent)",
            minWidth: 220,
          }}
        >
          <div className="flex" style={{ gap: "var(--space-2)" }}>
            {/* 시 열 */}
            <div className="flex-1">
              <Text as="div" variant="eyebrow" style={{ marginBottom: "var(--space-1-5)", textAlign: "center" }}>{t("time.hour")}</Text>
              <div
                ref={hourListRef}
                role="listbox"
                aria-label={t("time.hour")}
                onKeyDown={handleListboxKey}
                style={{
                  maxHeight: 180,
                  overflowY: "auto",
                  border: "1px solid var(--line-soft)",
                  borderRadius: "var(--r-sm)",
                  padding: "var(--space-0-5)",
                }}
              >
                {hours.map((h) => {
                  const isSelected = selectedHour === h;
                  return (
                    <button
                      key={h}
                      type="button"
                      role="option"
                      aria-selected={isSelected}
                      data-selected={isSelected}
                      onClick={() => pick(h, selectedMinute ?? 0)}
                      style={{
                        display: "block",
                        width: "100%",
                        padding: "6px 8px",
                        fontSize: "var(--fs-xs)",
                        fontFamily: "var(--font-mono)",
                        background: isSelected ? "var(--lime)" : "transparent",
                        color: isSelected ? "var(--primary-fg)" : "var(--ink-1)",
                        border: "none",
                        borderRadius: "var(--r-sm)",
                        cursor: "pointer",
                        textAlign: "center",
                        fontWeight: isSelected ? 700 : 400,
                      }}
                    >
                      {pad2(h)}
                    </button>
                  );
                })}
              </div>
            </div>

            {/* 분 열 */}
            <div className="flex-1">
              <Text as="div" variant="eyebrow" style={{ marginBottom: "var(--space-1-5)", textAlign: "center" }}>{t("time.minute")}</Text>
              <div
                ref={minuteListRef}
                role="listbox"
                aria-label={t("time.minute")}
                onKeyDown={handleListboxKey}
                style={{
                  maxHeight: 180,
                  overflowY: "auto",
                  border: "1px solid var(--line-soft)",
                  borderRadius: "var(--r-sm)",
                  padding: "var(--space-0-5)",
                }}
              >
                {minutes.map((m) => {
                  const isSelected = selectedMinute === m;
                  return (
                    <button
                      key={m}
                      type="button"
                      role="option"
                      aria-selected={isSelected}
                      data-selected={isSelected}
                      onClick={() => pick(selectedHour ?? 0, m)}
                      style={{
                        display: "block",
                        width: "100%",
                        padding: "6px 8px",
                        fontSize: "var(--fs-xs)",
                        fontFamily: "var(--font-mono)",
                        background: isSelected ? "var(--lime)" : "transparent",
                        color: isSelected ? "var(--primary-fg)" : "var(--ink-1)",
                        border: "none",
                        borderRadius: "var(--r-sm)",
                        cursor: "pointer",
                        textAlign: "center",
                        fontWeight: isSelected ? 700 : 400,
                      }}
                    >
                      {pad2(m)}
                    </button>
                  );
                })}
              </div>
            </div>
          </div>

          {presets && (
            <div
              className="flex items-center flex-wrap"
              style={{ gap: 'var(--space-1)', marginTop: "var(--space-2)", paddingTop: 10, borderTop: "1px solid var(--line-soft)" }}
            >
              {presetButtons.map((p) => (
                <Button
                  key={p.label}
                  type="button"
                  onClick={() => {
                    onChange(p.hm);
                    setOpen(false);
                    if (portal) triggerRef.current?.focus();
                  }} variant="ghost" size="sm"
                  style={{ fontSize: "var(--fs-xs)" }}
                >
                  {p.label}
                </Button>
              ))}
              <Button
                type="button"
                onClick={() => {
                  const now = new Date();
                  const step = minuteStep;
                  const m = Math.round(now.getMinutes() / step) * step % 60;
                  onChange(`${pad2(now.getHours())}:${pad2(m)}`);
                  setOpen(false);
                  if (portal) triggerRef.current?.focus();
                }} variant="ghost" size="sm"
                style={{ fontSize: "var(--fs-xs)" }}
              >
                {t("field.now")}
              </Button>
              {value && (
                <Button
                  type="button"
                  onClick={() => {
                    onChange("");
                    setOpen(false);
                    if (portal) triggerRef.current?.focus();
                  }} variant="ghost" size="sm"
                  style={{ fontSize: "var(--fs-xs)", marginLeft: "auto", color: "var(--ink-3)" }}
                >
                  {t("field.clear")}
                </Button>
              )}
            </div>
          )}
        </div>
  ) : null;

  return (
    <div ref={containerRef} style={{ position: "relative", width: "100%" }} onBlur={event => {
      if (portal && open && event.relatedTarget instanceof Node && !event.currentTarget.contains(event.relatedTarget) && !popupRef.current?.contains(event.relatedTarget)) setOpen(false);
    }}>
      <button
        id={id}
        ref={triggerRef}
        type="button"
        disabled={disabled}
        aria-haspopup="dialog"
        aria-expanded={open}
        onClick={() => setOpen((v) => !v)}
        onKeyDown={handleButtonKey}
        style={{
          width: "100%",
          padding: "10px 12px",
          background: "var(--bg-2)",
          border: "1px solid var(--line-soft)",
          borderRadius: "var(--r-md)",
          fontSize: "var(--fs-sm)",
          color: value ? "var(--ink-0)" : "var(--ink-3)",
          textAlign: "left",
          cursor: disabled ? "not-allowed" : "pointer",
          display: "flex",
          alignItems: "center",
          justifyContent: "space-between",
          gap: 'var(--space-2)',
          opacity: disabled ? 0.5 : 1,
        }}
      >
        <span>{labelText}</span>
        <span aria-hidden="true" style={{ color: "var(--ink-3)", fontSize: "var(--fs-xs)" }}>{icon ?? "🕐"}</span>
      </button>

      {portal && popup ? createPortal(popup, document.body) : popup}
    </div>
  );
}
