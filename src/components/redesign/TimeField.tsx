import { useEffect, useMemo, useRef, useState, type KeyboardEvent } from "react";
import { useTranslation } from "react-i18next";
import { Button, Text } from "../../theme/components";

interface TimeFieldProps {
  value: string; // "HH:MM" (24h)
  onChange: (next: string) => void;
  disabled?: boolean;
  placeholder?: string;
  id?: string;
  /** 분 간격 — 기본 5분 단위 */
  minuteStep?: number;
  /** 빠른 프리셋 (오전 6시·정오·오후 6시 등) 표시 */
  presets?: boolean;
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
  minuteStep = 5,
  presets = true,
}: TimeFieldProps) {
  const { t } = useTranslation("common");
  const resolvedPlaceholder = placeholder ?? t("field.timePlaceholder");
  const [open, setOpen] = useState(false);
  const [openUp, setOpenUp] = useState(false);
  const containerRef = useRef<HTMLDivElement>(null);
  const triggerRef = useRef<HTMLButtonElement>(null);
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
    if (!open || !triggerRef.current) return;
    const rect = triggerRef.current.getBoundingClientRect();
    const spaceBelow = window.innerHeight - rect.bottom;
    setOpenUp(spaceBelow < 280 && rect.top > 280);
  }, [open]);

  // 외부 클릭 닫기
  useEffect(() => {
    if (!open) return;
    const handler = (e: MouseEvent) => {
      if (containerRef.current && !containerRef.current.contains(e.target as Node)) {
        setOpen(false);
      }
    };
    document.addEventListener("mousedown", handler);
    return () => document.removeEventListener("mousedown", handler);
  }, [open]);

  // Escape 닫기
  useEffect(() => {
    if (!open) return;
    const handler = (e: globalThis.KeyboardEvent) => { if (e.key === "Escape") setOpen(false); };
    document.addEventListener("keydown", handler);
    return () => document.removeEventListener("keydown", handler);
  }, [open]);

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

  const labelText = value ? formatKorean(value, t("time.am"), t("time.pm")) : resolvedPlaceholder;

  return (
    <div ref={containerRef} style={{ position: "relative", width: "100%" }}>
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
        <span aria-hidden="true" style={{ color: "var(--ink-3)", fontSize: "var(--fs-xs)" }}>🕐</span>
      </button>

      {open && (
        <div
          role="dialog"
          aria-label={t("field.selectTimeAria")}
          style={{
            position: "absolute",
            top: openUp ? "auto" : "calc(100% + 4px)",
            bottom: openUp ? "calc(100% + 4px)" : "auto",
            left: 0,
            zIndex: 50,
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
                  }} variant="ghost" size="sm"
                  style={{ fontSize: "var(--fs-xs)", marginLeft: "auto", color: "var(--ink-3)" }}
                >
                  {t("field.clear")}
                </Button>
              )}
            </div>
          )}
        </div>
      )}
    </div>
  );
}
