import { isSportUiEnabled } from "../../config/sportFeatures";
import "./SportFilterTabs.css";
import SportIcon from "../common/SportIcon";
import { Chip } from "../../theme/components";
import { useTranslation } from "react-i18next";
import { ICON_SIZE } from "../../theme/tokens/icon";

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

export default function SportFilterTabs({ value, onChange, allLabelKey = "label.all" }: SportFilterTabsProps) {
  const { t } = useTranslation("common");
  return (
    <div className="sport-filter-tabs" role="group" aria-label={t("discipline.selectAria")}>
      {TABS.filter(tab => isSportUiEnabled(tab.key)).map((f) => {
        const active = (isSportUiEnabled(value) ? value : "all") === f.key;
        return (
          <Chip key={f.key} selectable selected={active} icon={f.key === "all" ? undefined : <SportIcon sport={f.key} size={ICON_SIZE.md} />} onClick={() => onChange(f.key)}>
            {t(f.key === "all" ? allLabelKey : f.labelKey).replace(/^[🚴🏃🏊]\uFE0F?\s*/u, "")}
          </Chip>
        );
      })}
    </div>
  );
}
