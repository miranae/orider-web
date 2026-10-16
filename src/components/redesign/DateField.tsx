import { createPortal } from "react-dom";
import { useEffect, useLayoutEffect, useId, useMemo, useRef, useState, type KeyboardEvent, type ReactNode } from "react";
import { useTranslation } from "react-i18next";
import { Button } from "../../theme/components";

interface DateFieldProps {
  value: string; // "YYYY-MM-DD"
  onChange: (next: string) => void;
  min?: string; // "YYYY-MM-DD"
  max?: string; // "YYYY-MM-DD"
  disabled?: boolean;
  placeholder?: string;
  id?: string;
  icon?: ReactNode;
  /** 빠른 프리셋 (오늘/+1주/+1개월/+3개월) 표시 */
  presets?: boolean;
  /** Opt in to escaping clipped page containers; existing callers remain inline. */
  portal?: boolean;
}

const WEEKDAY_KEYS = ["sun", "mon", "tue", "wed", "thu", "fri", "sat"] as const;

function pad2(n: number): string {
  return n < 10 ? `0${n}` : String(n);
}

function toISO(d: Date): string {
  return `${d.getFullYear()}-${pad2(d.getMonth() + 1)}-${pad2(d.getDate())}`;
}

function fromISO(s: string | undefined): Date | null {
  if (!s) return null;
  const [y, m, d] = s.split("-").map(Number);
  if (!y || !m || !d) return null;
  return new Date(y, m - 1, d);
}

function isSameDay(a: Date, b: Date): boolean {
  return a.getFullYear() === b.getFullYear() && a.getMonth() === b.getMonth() && a.getDate() === b.getDate();
}

function formatDate(s: string, weekdays: string[], t: (key: string, opts?: Record<string, unknown>) => string): string {
  const d = fromISO(s);
  if (!d) return "";
  return t("field.dateLabel", {
    year: d.getFullYear(),
    month: d.getMonth() + 1,
    day: d.getDate(),
    weekday: weekdays[d.getDay()],
  });
}

function addDays(d: Date, n: number): Date {
  const x = new Date(d);
  x.setDate(x.getDate() + n);
  return x;
}

function addMonths(d: Date, n: number): Date {
  const x = new Date(d);
  x.setMonth(x.getMonth() + n);
  return x;
}

/**
 * 다크 테마 친화적인 날짜 선택 필드.
 * - 네이티브 <input type="date"> 대체
 * - 클릭 시 팝오버 캘린더 + 한국어 요일 + 빠른 프리셋
 * - 키보드: Enter/Space로 열기, Escape로 닫기, 화살표 네비
 */
export default function DateField({
  value,
  onChange,
  min,
  max,
  disabled,
  placeholder,
  id,
  icon,
  presets = true,
  portal = false,
}: DateFieldProps) {
  const { t } = useTranslation("common");
  const WEEKDAYS = WEEKDAY_KEYS.map((k) => t(`weekday.${k}`));
  const resolvedPlaceholder = placeholder ?? t("field.datePlaceholder");
  const [open, setOpen] = useState(false);
  const [position, setPosition] = useState({ left: 0, top: 0 });
  const [focusedDate, setFocusedDate] = useState(value);
  const pendingDateFocus = useRef(false);
  const popupRef = useRef<HTMLDivElement>(null);
  const dialogId = useId();
  const [viewMonth, setViewMonth] = useState<Date>(() => fromISO(value) ?? new Date());
  const containerRef = useRef<HTMLDivElement>(null);
  const triggerRef = useRef<HTMLButtonElement>(null);

  const minDate = useMemo(() => fromISO(min), [min]);
  const maxDate = useMemo(() => fromISO(max), [max]);
  const selected = useMemo(() => fromISO(value), [value]);
  // 매 렌더마다 오늘 재계산 — 자정 넘겨도 정확히 반영됨 (cheap).
  const now = new Date();
  const today = new Date(now.getFullYear(), now.getMonth(), now.getDate());

  // 선택된 값이 바뀌면 뷰 월을 맞춤
  useEffect(() => {
    const d = fromISO(value);
    if (d) setViewMonth(new Date(d.getFullYear(), d.getMonth(), 1));
  }, [value]);

  // 컨테이너가 화면 가장자리여도 캘린더 자체는 뷰포트 안에 둔다.
  useLayoutEffect(() => {
    if (!open) return;
    const positionPopup = () => {
      if (!triggerRef.current || !containerRef.current || !popupRef.current) return;
      const trigger = triggerRef.current.getBoundingClientRect();
      const container = containerRef.current.getBoundingClientRect();
      const popup = popupRef.current.getBoundingClientRect();
      const margin = 12;
      const left = Math.max(margin, Math.min(trigger.left, window.innerWidth - margin - popup.width));
      const below = trigger.bottom + 4;
      const preferred = below + popup.height <= window.innerHeight - margin ? below : trigger.top - popup.height - 4;
      const top = Math.max(margin, Math.min(preferred, window.innerHeight - margin - popup.height));
      setPosition({ left: portal ? left : left - container.left, top: portal ? top : top - container.top });
    };
    positionPopup();
    window.addEventListener('resize', positionPopup);
    window.addEventListener('scroll', positionPopup, true);
    return () => { window.removeEventListener('resize', positionPopup); window.removeEventListener('scroll', positionPopup, true); };
  }, [open, viewMonth, portal]);

  useEffect(() => {
    if (!open || !pendingDateFocus.current) return;
    const cell = popupRef.current?.querySelector<HTMLButtonElement>(`[data-calendar-date="${focusedDate}"]`);
    if (cell && !cell.disabled) { cell.focus(); pendingDateFocus.current = false; }
  }, [open, focusedDate, viewMonth]);

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

  // Escape 키로 닫기
  useEffect(() => {
    if (!open) return;
    const handler = (e: globalThis.KeyboardEvent) => {
      if (e.key === "Escape") { e.preventDefault(); e.stopPropagation(); setOpen(false); triggerRef.current?.focus(); }
    };
    document.addEventListener("keydown", handler);
    return () => document.removeEventListener("keydown", handler);
  }, [open]);

  const isDisabled = (d: Date): boolean => {
    if (minDate && d < minDate) return true;
    if (maxDate && d > maxDate) return true;
    return false;
  };

  const monthDays = useMemo(() => {
    const first = new Date(viewMonth.getFullYear(), viewMonth.getMonth(), 1);
    const startDow = first.getDay();
    const start = addDays(first, -startDow);
    const days: Date[] = [];
    for (let i = 0; i < 42; i++) days.push(addDays(start, i));
    return days;
  }, [viewMonth]);

  const pick = (d: Date) => {
    if (isDisabled(d)) return;
    onChange(toISO(d));
    setOpen(false);
    triggerRef.current?.focus();
  };

  const bounded = (date: Date) => minDate && date < minDate ? minDate : maxDate && date > maxDate ? maxDate : date;
  const toggleCalendar = () => {
    if (!open) {
      const focus = bounded(selected ?? today);
      setFocusedDate(toISO(focus));
      setViewMonth(new Date(focus.getFullYear(), focus.getMonth(), 1));
      pendingDateFocus.current = true;
    }
    setOpen((current) => !current);
  };
  const moveMonth = (direction: number) => {
    const next = addMonths(new Date(viewMonth.getFullYear(), viewMonth.getMonth(), 1), direction);
    setViewMonth(next);
    const currentDay = fromISO(focusedDate)?.getDate() ?? 1;
    const lastDay = new Date(next.getFullYear(), next.getMonth() + 1, 0).getDate();
    setFocusedDate(toISO(bounded(new Date(next.getFullYear(), next.getMonth(), Math.min(currentDay, lastDay)))));
  };
  const handleDateKey = (event: KeyboardEvent<HTMLButtonElement>, date: Date) => {
    let next: Date;
    if (event.key === 'ArrowLeft') next = addDays(date, -1);
    else if (event.key === 'ArrowRight') next = addDays(date, 1);
    else if (event.key === 'ArrowUp') next = addDays(date, -7);
    else if (event.key === 'ArrowDown') next = addDays(date, 7);
    else if (event.key === 'Home') next = addDays(date, -date.getDay());
    else if (event.key === 'End') next = addDays(date, 6 - date.getDay());
    else if (event.key === 'PageUp' || event.key === 'PageDown') {
      const month = date.getMonth() + (event.key === 'PageUp' ? -1 : 1);
      const last = new Date(date.getFullYear(), month + 1, 0).getDate();
      next = new Date(date.getFullYear(), month, Math.min(date.getDate(), last));
    } else return;
    event.preventDefault();
    next = bounded(next);
    pendingDateFocus.current = true;
    setFocusedDate(toISO(next));
    setViewMonth(new Date(next.getFullYear(), next.getMonth(), 1));
  };

  const handleButtonKey = (e: KeyboardEvent<HTMLButtonElement>) => {
    if (e.key === "Enter" || e.key === " ") {
      e.preventDefault();
      toggleCalendar();
    }
  };

  const presetButtons: { label: string; date: Date }[] = presets
    ? [
        { label: t("label.today"), date: today },
        { label: t("field.presetWeek"), date: addDays(today, 7) },
        { label: t("field.presetMonth"), date: addMonths(today, 1) },
        { label: t("field.preset3Months"), date: addMonths(today, 3) },
      ]
    : [];

  const labelText = value ? formatDate(value, WEEKDAYS, t) : resolvedPlaceholder;

  const popup = open ? (
        <div
          ref={popupRef} id={dialogId} role="dialog"
          aria-label={t("field.selectDateAria")}
          style={{
            position: portal ? "fixed" : "absolute",
            top: position.top,
            left: position.left,
            zIndex: portal ? 1000 : 50,
            background: "var(--bg-1)",
            border: "1px solid var(--line)",
            borderRadius: "var(--r-md)",
            padding: 'var(--space-3)',
            boxShadow: "0 12px 32px color-mix(in srgb, var(--bg-0) 45%, transparent)",
            width: "min(20rem, calc(100vw - var(--space-6)))",
            maxHeight: "calc(100dvh - var(--space-6))",
            overflowY: "auto",
            boxSizing: "border-box",
          }}
        >
          <div className="flex items-center justify-between" style={{ marginBottom: "var(--space-2)" }}>
            <Button
              type="button"
              aria-label={t("field.prevMonth")}
              onClick={() => moveMonth(-1)} variant="ghost" size="sm"
              style={{ padding: "4px 10px" }}
            >
              ◀
            </Button>
            <div className="font-semibold" aria-live="polite" style={{ color: "var(--ink-0)", fontSize: "var(--fs-xs)" }}>
              {t("field.yearMonth", { year: viewMonth.getFullYear(), month: viewMonth.getMonth() + 1 })}
            </div>
            <Button
              type="button"
              aria-label={t("field.nextMonth")}
              onClick={() => moveMonth(1)} variant="ghost" size="sm"
              style={{ padding: "4px 10px" }}
            >
              ▶
            </Button>
          </div>

          <div
            role="grid"
            style={{
              display: "grid",
              gridTemplateColumns: "repeat(7, 1fr)",
              gap: "var(--space-0-5)",
            }}
          >
            <div role="row" style={{ display: "contents" }}>
            {WEEKDAYS.map((w, i) => (
              <div
                key={w}
                role="columnheader"
                style={{
                  textAlign: "center",
                  fontSize: "var(--fs-2xs)",
                  color: i === 0 ? "var(--rose)" : i === 6 ? "var(--aqua)" : "var(--ink-3)",
                  padding: "4px 0",
                  fontFamily: "var(--font-mono)",
                  letterSpacing: "0.06em",
                }}
              >
                {w}
              </div>
            ))}
            </div>
            {Array.from({ length: 6 }, (_, week) => <div role="row" key={week} style={{ display: "contents" }}>
            {monthDays.slice(week * 7, (week + 1) * 7).map((d) => {
              const iso = toISO(d);
              const inMonth = d.getMonth() === viewMonth.getMonth();
              const isSelected = selected ? isSameDay(d, selected) : false;
              const isToday = isSameDay(d, today);
              const dim = isDisabled(d);
              const dow = d.getDay();
              return (
                <button
                  key={iso}
                  type="button"
                  role="gridcell"
                  aria-selected={isSelected}
                  aria-label={iso}
                  disabled={dim}
                  data-calendar-date={iso}
                  tabIndex={focusedDate === iso && !dim ? 0 : -1}
                  onFocus={() => setFocusedDate(iso)}
                  onKeyDown={(event) => handleDateKey(event, d)}
                  onClick={() => pick(d)}
                  style={{
                    padding: "6px 0",
                    fontSize: "var(--fs-xs)",
                    borderRadius: "var(--r-sm)",
                    border: isToday && !isSelected ? "1px solid var(--lime)" : "1px solid transparent",
                    background: isSelected ? "var(--lime)" : "transparent",
                    color: isSelected
                      ? "var(--primary-fg)"
                      : dim
                        ? "var(--ink-4)"
                        : !inMonth
                          ? "var(--ink-4)"
                          : dow === 0
                            ? "var(--rose)"
                            : dow === 6
                              ? "var(--aqua)"
                              : "var(--ink-1)",
                    fontWeight: isSelected ? 700 : isToday ? 600 : 400,
                    cursor: dim ? "not-allowed" : "pointer",
                    outline: focusedDate === iso ? "var(--space-0-5) solid var(--ink-0)" : undefined,
                    outlineOffset: "calc(-1 * var(--space-0-5))",
                    fontFamily: "var(--font-mono)",
                  }}
                >
                  {d.getDate()}
                </button>
              );
            })}</div>)}
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
                  onClick={() => pick(p.date)}
                  disabled={isDisabled(p.date)} variant="ghost" size="sm"
                  style={{ fontSize: "var(--fs-xs)" }}
                >
                  {p.label}
                </Button>
              ))}
              {value && (
                <Button
                  type="button"
                  onClick={() => {
                    onChange("");
                    setOpen(false);
                    triggerRef.current?.focus();
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
    <div ref={containerRef} style={{ position: "relative", width: "100%" }} onBlur={(event) => {
      if (open && event.relatedTarget instanceof Node && !event.currentTarget.contains(event.relatedTarget) && !popupRef.current?.contains(event.relatedTarget)) setOpen(false);
    }}>
      <button
        id={id}
        ref={triggerRef}
        type="button"
        disabled={disabled}
        aria-haspopup="dialog"
        aria-expanded={open}
        aria-controls={open ? dialogId : undefined}
        onClick={toggleCalendar}
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
        <span aria-hidden="true" style={{ color: "var(--ink-3)", fontSize: "var(--fs-xs)" }}>{icon ?? "📅"}</span>
      </button>

      {portal && popup ? createPortal(popup, document.body) : popup}
    </div>
  );
}
