import { useTranslation } from "react-i18next";

interface SportFilterTabsProps {
  value: string;
  onChange: (v: string) => void;
}

const TABS = [
  { key: "all",  labelKey: "label.all" },
  { key: "bike", labelKey: "sportFilter.bike", color: "var(--aqua)" },
  { key: "run",  labelKey: "sportFilter.run",  color: "var(--amber)" },
  { key: "swim", labelKey: "sportFilter.swim", color: "var(--lime)" },
] as const;

export default function SportFilterTabs({ value, onChange }: SportFilterTabsProps) {
  const { t } = useTranslation("common");
  return (
    <div className="flex gap-2" style={{ padding: "10px 16px" }}>
      {TABS.map((f) => {
        const active = value === f.key;
        const color = "color" in f ? f.color : undefined;
        return (
          <button key={f.key} onClick={() => onChange(f.key)}
            style={{
              flex: 1, padding: "12px 0", fontSize: 12, fontWeight: active ? 600 : 400,
              borderRadius: 20, cursor: "pointer",
              border: `1px solid ${active ? (color || "var(--ink-2)") : "var(--line-soft)"}`,
              background: active ? "var(--bg-3)" : "transparent",
              color: active ? (color || "var(--ink-0)") : "var(--ink-3)",
            }}>
            {t(f.labelKey)}
          </button>
        );
      })}
    </div>
  );
}
