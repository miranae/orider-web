/**
 * Settings 시안(orider-web-setting.zip)의 공통 빌딩 블록.
 */
import type { CSSProperties, ReactNode } from "react";
import { useTranslation } from "react-i18next";
import { Card, Text } from "../../theme/components";

const inputBox: CSSProperties = {
  background: "var(--bg-2)",
  border: "1px solid var(--line)",
  borderRadius: 6,
  padding: "8px 10px",
  fontSize: 13,
  color: "var(--ink-0)",
  outline: "none",
};
export const fieldInputStyle: CSSProperties = { ...inputBox, width: "100%" };
export const monoInputStyle: CSSProperties = {
  ...inputBox,
  width: "100%",
  fontFamily: "var(--font-mono)",
  textAlign: "center",
};

interface SettingsCardProps {
  title?: ReactNode;
  action?: ReactNode;
  children: ReactNode;
  dense?: boolean;
  danger?: boolean;
}

/**
 * Settings 페이지 전용 카드 — title/action 헤더 + dense/danger 변형.
 * 일반 카드(`<Card>`)와 다른 의미: settings section 구조 prefab.
 * 후속 PR 에서 `<Section>` 프리미티브로 추출 검토.
 */
export function SettingsCard({ title, action, children, dense, danger }: SettingsCardProps) {
  return (
    <Card padding="none"
      style={{
        padding: dense ? "16px 20px" : "20px",
        marginBottom: 'var(--space-5)',
        borderColor: danger
          ? "color-mix(in oklch, var(--rose) 30%, var(--line-soft))"
          : undefined,
      }}
    >
      {(title || action) && (
        <header
          style={{
            display: "flex",
            alignItems: "flex-end",
            justifyContent: "space-between",
            borderBottom: "1px solid var(--line-soft)",
            paddingBottom: 'var(--space-3)',
            marginBottom: 'var(--space-4)',
            gap: 'var(--space-3)',
          }}
        >
          {title && (
            <h3
              style={{
                margin: 0,
                fontSize: 16,
                fontWeight: 600,
                color: "var(--ink-0)",
                letterSpacing: "-0.005em",
              }}
            >
              {title}
            </h3>
          )}
          {action && <div>{action}</div>}
        </header>
      )}
      {children}
    </Card>
  );
}

export function FieldGrid({ cols = 2, children }: { cols?: number; children: ReactNode }) {
  return (
    <div
      style={{
        display: "grid",
        gridTemplateColumns: `repeat(${cols}, 1fr)`,
        gap: 14,
      }}
    >
      {children}
    </div>
  );
}

export function Field({
  label,
  hint,
  full,
  children,
}: {
  label: string;
  hint?: string;
  full?: boolean;
  children: ReactNode;
}) {
  return (
    <label style={{ display: "block", gridColumn: full ? "1/-1" : undefined }}>
      <div
        style={{
          fontSize: 11,
          color: "var(--ink-3)",
          marginBottom: 5,
          textTransform: "uppercase",
          letterSpacing: "0.06em",
          fontFamily: "var(--font-mono)",
        }}
      >
        {label}
      </div>
      {children}
      {hint && (
        <div style={{ fontSize: 11, color: "var(--ink-3)", marginTop: 'var(--space-1)' }}>{hint}</div>
      )}
    </label>
  );
}

export function InlineRow({
  label,
  hint,
  children,
}: {
  label: ReactNode;
  hint?: ReactNode;
  children: ReactNode;
}) {
  return (
    <div
      style={{
        display: "flex",
        justifyContent: "space-between",
        alignItems: "center",
        padding: "12px 0",
        borderTop: "1px solid var(--line-soft)",
        gap: 'var(--space-4)',
      }}
    >
      <div style={{ flex: 1, minWidth: 0 }}>
        <div style={{ fontSize: 13, color: "var(--ink-0)" }}>{label}</div>
        {hint && (
          <div style={{ fontSize: 11, color: "var(--ink-3)", marginTop: 2 }}>{hint}</div>
        )}
      </div>
      <div>{children}</div>
    </div>
  );
}

export function Toggle({
  on,
  onChange,
  disabled,
}: {
  on: boolean;
  onChange: (v: boolean) => void;
  disabled?: boolean;
}) {
  return (
    <button
      type="button"
      role="switch"
      aria-checked={on}
      disabled={disabled}
      onClick={() => onChange(!on)}
      style={{
        width: 40,
        height: 22,
        borderRadius: 11,
        background: on ? "var(--lime)" : "var(--bg-3)",
        position: "relative",
        border: `1px solid ${on ? "var(--lime)" : "var(--line)"}`,
        transition: "background .15s",
        cursor: disabled ? "not-allowed" : "pointer",
        opacity: disabled ? 0.5 : 1,
        padding: 0,
      }}
    >
      <div
        style={{
          position: "absolute",
          top: 2,
          left: on ? 20 : 2,
          width: 16,
          height: 16,
          borderRadius: "50%",
          background: on ? "var(--primary-fg)" : "var(--ink-2)",
          transition: "left .15s",
        }}
      />
    </button>
  );
}

interface StatItem {
  label: string;
  value: string;
  unit?: string;
  highlight?: boolean;
  muted?: boolean;
}

export function StatGrid({ items }: { items: StatItem[] }) {
  return (
    <Card
      padding="none"
      style={{
        marginBottom: 'var(--space-5)',
        overflow: "hidden",
        display: "grid",
        gridTemplateColumns: `repeat(${items.length}, 1fr)`,
      }}
    >
      {items.map((s, i) => (
        <div
          key={s.label}
          style={{
            padding: 'var(--space-5)',
            borderRight: i < items.length - 1 ? "1px solid var(--line-soft)" : "none",
            background: s.highlight
              ? "color-mix(in oklch, var(--lime) 8%, var(--bg-1))"
              : "var(--bg-1)",
            display: "flex",
            flexDirection: "column",
            gap: 'var(--space-2)',
          }}
        >
          <Text variant="eyebrow">{s.label}</Text>
          <div style={{ display: "flex", alignItems: "baseline", gap: 'var(--space-1)' }}>
            <Text variant="dataLarge"
              style={{ color: s.muted ? "var(--ink-3)" : "var(--ink-0)" }}
            >
              {s.value}
            </Text>
            {s.unit && <Text variant="unit">{s.unit}</Text>}
          </div>
        </div>
      ))}
    </Card>
  );
}

export interface DisplayZone {
  name: string;
  label: string;
  minPct: number;
  maxPct: number | null;
  color: string;
}

export const RD_HR_ZONES: DisplayZone[] = [
  { name: "Z1", label: "recovery", minPct: 0, maxPct: 60, color: "oklch(0.70 0.10 200)" },
  { name: "Z2", label: "endurance", minPct: 60, maxPct: 70, color: "oklch(0.75 0.12 160)" },
  { name: "Z3", label: "tempo", minPct: 70, maxPct: 80, color: "oklch(0.80 0.14 120)" },
  { name: "Z4", label: "threshold", minPct: 80, maxPct: 90, color: "oklch(0.78 0.15 60)" },
  { name: "Z5", label: "vo2", minPct: 90, maxPct: 100, color: "oklch(0.72 0.16 30)" },
];

export function ZoneBar({ refValue, zones }: { refValue: number; zones: DisplayZone[] }) {
  const { t } = useTranslation("settings");
  return (
    <div>
      <div
        style={{
          display: "flex",
          height: 36,
          borderRadius: 6,
          overflow: "hidden",
          border: "1px solid var(--line-soft)",
        }}
      >
        {zones.map((z) => {
          const max = z.maxPct ?? 110;
          const w = max - z.minPct;
          const label = t(`hrZone.${z.label}`, { defaultValue: z.label });
          return (
            <div
              key={z.name}
              style={{
                flex: w,
                background: z.color,
                display: "grid",
                placeItems: "center",
                color: "white",
                fontSize: 11,
                fontWeight: 600,
                fontFamily: "var(--font-mono)",
                letterSpacing: "0.04em",
              }}
              title={`${z.name} ${label}`}
            >
              {z.name}
            </div>
          );
        })}
      </div>
      <div
        style={{
          display: "grid",
          gridTemplateColumns: `repeat(${zones.length}, 1fr)`,
          marginTop: 6,
          gap: 'var(--space-1)',
        }}
      >
        {zones.map((z) => {
          const lo = Math.round((refValue * z.minPct) / 100);
          const hi = z.maxPct === null ? null : Math.round((refValue * z.maxPct) / 100);
          const label = t(`hrZone.${z.label}`, { defaultValue: z.label });
          return (
            <div
              key={z.name}
              style={{ fontSize: 10, color: "var(--ink-3)", textAlign: "center" }}
            >
              <div
                style={{
                  color: "var(--ink-1)",
                  fontFamily: "var(--font-mono)",
                  fontSize: 11,
                }}
              >
                {hi === null ? `${lo}+` : z.minPct === 0 ? `<${hi}` : `${lo}–${hi}`}
              </div>
              <div>{label}</div>
            </div>
          );
        })}
      </div>
    </div>
  );
}
