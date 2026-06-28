import { useTranslation } from "react-i18next";
import type { CSSProperties, ReactNode } from "react";

import { Card, Chip } from "../../../theme/components";

export const fieldStyle: CSSProperties = {
  width: "100%",
  padding: "9px 12px",
  fontSize: "var(--fs-sm)",
  background: "var(--bg-2)",
  border: "1px solid var(--line-soft)",
  borderRadius: "var(--r-sm)",
  color: "var(--ink-0)",
  fontFamily: "inherit",
};

export function Field({
  label,
  required,
  sub,
  hint,
  warn,
  children,
}: {
  label: string;
  required?: boolean;
  sub?: string;
  hint?: string;
  warn?: boolean;
  children: ReactNode;
}) {
  const { t } = useTranslation("event");
  return (
    <div style={{ marginBottom: 18 }}>
      <label className="flex items-center" style={{ gap: 6, marginBottom: 6 }}>
        <span style={{ fontSize: "var(--fs-xs)", fontWeight: 500, color: "var(--ink-1)" }}>{label}</span>
        {required && <span style={{ color: "var(--rose)", fontSize: "var(--fs-xs)" }}>*</span>}
        {warn && (
          <Chip
            style={{
              fontSize: "var(--fs-xs)",
              color: "var(--amber)",
              borderColor: "color-mix(in oklch, var(--amber) 40%, transparent)",
            }}
          >
            {t("warn.participantNotice")}
          </Chip>
        )}
        {sub && <span style={{ fontSize: "var(--fs-xs)", color: "var(--ink-3)", marginLeft: "auto" }}>{sub}</span>}
      </label>
      {children}
      {hint && <div style={{ fontSize: "var(--fs-xs)", color: "var(--ink-3)", marginTop: "var(--space-1)" }}>{hint}</div>}
    </div>
  );
}

export function Section({ id, title, desc, children }: { id: string; title: string; desc?: string; children: ReactNode }) {
  return (
    <Card
      id={id}
      padding="none"
      style={{ padding: "var(--space-6)", marginBottom: "var(--space-4)", scrollMarginTop: 80 }}
    >
      <div style={{ marginBottom: 18, paddingBottom: 14, borderBottom: "1px solid var(--line-soft)" }}>
        <div style={{ fontSize: "var(--fs-sm)", fontWeight: 600, color: "var(--ink-0)", marginBottom: "var(--space-1)" }}>{title}</div>
        {desc && <div style={{ fontSize: "var(--fs-xs)", color: "var(--ink-3)" }}>{desc}</div>}
      </div>
      {children}
    </Card>
  );
}

export function Toggle({ on, onChange }: { on: boolean; onChange: (value: boolean) => void }) {
  return (
    <button
      type="button"
      onClick={() => onChange(!on)}
      aria-pressed={on}
      style={{
        width: 32,
        height: 18,
        borderRadius: "var(--r-xl)",
        position: "relative",
        flexShrink: 0,
        cursor: "pointer",
        background: on ? "var(--lime)" : "var(--bg-3)",
        border: on ? "none" : "1px solid var(--line-soft)",
        padding: 0,
      }}
    >
      <span
        aria-hidden="true"
        style={{
          position: "absolute",
          top: 2,
          left: on ? 16 : 2,
          width: 12,
          height: 12,
          borderRadius: "50%",
          background: on ? "var(--primary-fg)" : "var(--ink-2)",
          transition: "left 120ms",
        }}
      />
    </button>
  );
}

export function PickerRow<T extends string>({
  value,
  onChange,
  options,
}: {
  value: T;
  onChange: (value: T) => void;
  options: Array<{ value: T; label: string }>;
}) {
  return (
    <div
      style={{
        display: "grid",
        gridTemplateColumns: `repeat(${options.length}, 1fr)`,
        gap: 6,
      }}
    >
      {options.map((option) => {
        const active = value === option.value;
        return (
          <button
            key={option.value}
            type="button"
            onClick={() => onChange(option.value)}
            aria-pressed={active}
            style={{
              padding: "10px 10px",
              fontSize: "var(--fs-xs)",
              borderRadius: "var(--r-sm)",
              background: active ? "color-mix(in oklch, var(--lime) 8%, var(--bg-2))" : "var(--bg-2)",
              color: active ? "var(--ink-0)" : "var(--ink-2)",
              border: `1px solid ${active ? "var(--lime)" : "var(--line-soft)"}`,
              cursor: "pointer",
            }}
          >
            {option.label}
          </button>
        );
      })}
    </div>
  );
}

export function SegmentedPicker<T extends string>({
  options,
  value,
  onChange,
  columns,
}: {
  options: Array<{ value: T; label: string; sub?: string }>;
  value: T;
  onChange: (value: T) => void;
  columns?: number;
}) {
  return (
    <div
      style={{
        display: "grid",
        gridTemplateColumns: `repeat(${columns ?? options.length}, 1fr)`,
        gap: 6,
      }}
    >
      {options.map((option) => {
        const active = value === option.value;
        return (
          <button
            key={option.value}
            type="button"
            onClick={() => onChange(option.value)}
            aria-pressed={active}
            style={{
              padding: "12px 10px",
              fontSize: "var(--fs-xs)",
              borderRadius: "var(--r-sm)",
              textAlign: "center",
              lineHeight: 1.4,
              background: active ? "color-mix(in oklch, var(--lime) 8%, var(--bg-2))" : "var(--bg-2)",
              color: active ? "var(--ink-0)" : "var(--ink-2)",
              border: `1px solid ${active ? "var(--lime)" : "var(--line-soft)"}`,
              cursor: "pointer",
            }}
          >
            <div style={{ fontWeight: 500 }}>{option.label}</div>
            {option.sub && <div style={{ fontSize: "var(--fs-xs)", color: "var(--ink-3)", marginTop: 3 }}>{option.sub}</div>}
          </button>
        );
      })}
    </div>
  );
}

export function StepBar({
  step,
  setStep,
  maxStep,
  stepKeys,
}: {
  step: number;
  setStep: (step: number) => void;
  maxStep: number;
  stepKeys: readonly string[];
}) {
  const { t } = useTranslation("event");
  return (
    <div className="flex" style={{ gap: 0, marginBottom: 28 }}>
      {stepKeys.map((labelKey, i) => {
        const done = step > i;
        const cur = step === i;
        const navigable = done || i <= maxStep;
        return (
          <div key={labelKey} className="flex items-center" style={{ gap: 10, flex: 1 }}>
            <button
              type="button"
              onClick={() => navigable && setStep(i)}
              disabled={!navigable}
              aria-current={cur ? "step" : undefined}
              style={{
                width: 26,
                height: 26,
                borderRadius: "50%",
                background: cur
                  ? "var(--lime)"
                  : done
                    ? "color-mix(in oklch, var(--lime) 20%, var(--bg-2))"
                    : "var(--bg-2)",
                color: cur ? "var(--primary-fg)" : done ? "var(--lime)" : "var(--ink-3)",
                display: "grid",
                placeItems: "center",
                fontSize: "var(--fs-xs)",
                fontFamily: "var(--font-mono)",
                fontWeight: 600,
                border: !cur && !done ? "1px solid var(--line-soft)" : "none",
                flexShrink: 0,
                cursor: navigable ? "pointer" : "default",
              }}
            >
              {done ? "✓" : i + 1}
            </button>
            <span
              style={{
                fontSize: "var(--fs-xs)",
                color: cur ? "var(--ink-0)" : "var(--ink-3)",
                fontWeight: cur ? 500 : 400,
              }}
            >
              {t(labelKey)}
            </span>
            {i < stepKeys.length - 1 && (
              <div
                style={{
                  flex: 1,
                  height: 1,
                  background: done
                    ? "color-mix(in oklch, var(--lime) 30%, transparent)"
                    : "var(--line-soft)",
                }}
              />
            )}
          </div>
        );
      })}
    </div>
  );
}
