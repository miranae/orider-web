import { isSportUiEnabled } from "../../config/sportFeatures";
import "./SportFilterTabs.css";
import { ToggleControls, ToggleButton } from "../../theme/components";
import { useTranslation } from "react-i18next";

interface SportFilterTabsProps {
  value: string;
  onChange: (v: string) => void;
  /** 피트니스처럼 all 키가 실제로 통합 뷰를 뜻할 때만 라벨을 오버라이드한다. */
  allLabelKey?: "label.all" | "discipline.tri";
}

const TABS = [
  { key: "all",  labelKey: "label.all" },
  { key: "bike", labelKey: "sportFilter.bike" },
  { key: "run",  labelKey: "sportFilter.run" },
  { key: "swim", labelKey: "sportFilter.swim" },
] as const;

/** 종목 필터 — DisciplineTabs 와 같은 HIG 세그먼트(한 줄, 텍스트 전용)로 그린다. */
export default function SportFilterTabs({ value, onChange, allLabelKey = "label.all" }: SportFilterTabsProps) {
  const { t } = useTranslation("common");
  return (
    <ToggleControls variant="axis" className="sport-filter-tabs" aria-label={t("discipline.selectAria")}>
      {TABS.filter(tab => isSportUiEnabled(tab.key)).map((f) => {
        const active = (isSportUiEnabled(value) ? value : "all") === f.key;
        return (
          <ToggleButton key={f.key} selected={active} onClick={() => onChange(f.key)}>
            {t(f.key === "all" ? allLabelKey : f.labelKey).replace(/^[🚴🏃🏊]️?\s*/u, "")}
          </ToggleButton>
        );
      })}
    </ToggleControls>
  );
}
