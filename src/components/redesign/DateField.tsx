import { useEffect, useMemo, useRef, useState, type KeyboardEvent } from "react";
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
  /** 빠른 프리셋 (오늘/+1주/+1개월/+3개월) 표시 */
  presets?: boolean;
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
  presets = true,
}: DateFieldProps) {
  const { t } = useTranslation("common");
  const WEEKDAYS = WEEKDAY_KEYS.map((k) => t(`weekday.${k}`));
  const resolvedPlaceholder = placeholder ?? t("field.datePlaceholder");
  const [open, setOpen] = useState(false);
  const [openUp, setOpenUp] = useState(false);
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

  // 팝오버 열릴 때 아래 공간 부족하면 위로 열기
  useEffect(() => {
    if (!open || !triggerRef.current) return;
    const rect = triggerRef.current.getBoundingClientRect();
    const spaceBelow = window.innerHeight - rect.bottom;
    setOpenUp(spaceBelow < 380 && rect.top > 380);
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

  // Escape 키로 닫기
  useEffect(() => {
    if (!open) return;
    const handler = (e: globalThis.KeyboardEvent) => { if (e.key === "Escape") setOpen(false); };
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
  };

  const handleButtonKey = (e: KeyboardEvent<HTMLButtonElement>) => {
    if (e.key === "Enter" || e.key === " ") {
      e.preventDefault();
      setOpen((v) => !v);
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
        <span aria-hidden="true" style={{ color: "var(--ink-3)", fontSize: "var(--fs-xs)" }}>📅</span>
      </button>

      {open && (
        <div
          role="dialog"
          aria-label={t("field.selectDateAria")}
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
            minWidth: 280,
          }}
        >
          <div className="flex items-center justify-between" style={{ marginBottom: "var(--space-2)" }}>
            <Button
              type="button"
              aria-label={t("field.prevMonth")}
              onClick={() => setViewMonth((v) => addMonths(v, -1))} variant="ghost" size="sm"
              style={{ padding: "4px 10px" }}
            >
              ◀
            </Button>
            <div className="font-semibold" style={{ color: "var(--ink-0)", fontSize: "var(--fs-xs)" }}>
              {t("field.yearMonth", { year: viewMonth.getFullYear(), month: viewMonth.getMonth() + 1 })}
            </div>
            <Button
              type="button"
              aria-label={t("field.nextMonth")}
              onClick={() => setViewMonth((v) => addMonths(v, 1))} variant="ghost" size="sm"
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
            {monthDays.map((d) => {
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
                    fontFamily: "var(--font-mono)",
                  }}
                >
                  {d.getDate()}
                </button>
              );
            })}
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
