import "./SportFilterTabs.css";
import SportIcon from "../common/SportIcon";
import { Button } from "../../theme/components";
import { useTranslation } from "react-i18next";

interface SportFilterTabsProps {
  value: string;
  onChange: (v: string) => void;
  /** 피트니스처럼 all 키가 실제로 통합 뷰를 뜻할 때만 라벨을 오버라이드한다. */
  allLabelKey?: "label.all" | "discipline.tri";
}

const TABS = [
  { key: "all",  labelKey: "label.all" },
  { key: "bike", labelKey: "sportFilter.bike", color: "var(--aqua)" },
  { key: "run",  labelKey: "sportFilter.run",  color: "var(--amber)" },
  { key: "swim", labelKey: "sportFilter.swim", color: "var(--lime)" },
] as const;

export default function SportFilterTabs({ value, onChange, allLabelKey = "label.all" }: SportFilterTabsProps) {
  const { t } = useTranslation("common");
  return (
    <div className="sport-filter-tabs" role="group" aria-label={t("discipline.selectAria")}>
      {TABS.map((f) => {
        const active = value === f.key;
        const color = "color" in f ? f.color : undefined;
        return (
          <Button key={f.key} variant={active ? "secondary" : "outline"} leadingIcon={f.key === "all" ? undefined : <SportIcon sport={f.key} size={16} />} aria-pressed={active} onClick={() => onChange(f.key)}
            style={{
              flex: 1, minWidth: 0, paddingInline: "var(--space-2)", fontSize: "var(--fs-xs)", fontWeight: active ? 600 : 400,
              borderRadius: "var(--r-xl)", cursor: "pointer",
              border: `1px solid ${active ? (color || "var(--ink-2)") : "var(--line-soft)"}`,
              background: active ? "var(--bg-3)" : "transparent",
              color: active ? (color || "var(--ink-0)") : "var(--ink-3)",
            }}>
            {t(f.key === "all" ? allLabelKey : f.labelKey).replace(/^[🚴🏃🏊]\uFE0F?\s*/u, "")}
          </Button>
        );
      })}
    </div>
  );
}
