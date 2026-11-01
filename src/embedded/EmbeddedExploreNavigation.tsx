import { useTranslation } from "react-i18next";
import { ToggleButton, ToggleControls } from "../theme/components";
import { EXPLORE_PAGE_LABEL_KEYS, EXPLORE_PAGES, type EmbeddedExplorePage } from "./hubNavigation";

/** 탐색 임베드 서브탭. 코치 임베드(EmbeddedCoachNavigation)와 같은 축 컨트롤이고, 7칸이라 가로 스크롤한다. */
export function EmbeddedExploreNavigation({ selected, onSelect }: {
  selected: EmbeddedExplorePage;
  onSelect: (page: EmbeddedExplorePage) => void;
}) {
  const { t } = useTranslation("common");
  return <nav className="site-shell" style={{ marginBottom: "var(--space-4)" }} aria-label={t("nav.explore")}>
    <ToggleControls variant="axis" aria-label={t("nav.explore")}>
      {EXPLORE_PAGES.map(page => <ToggleButton key={page} selected={selected === page} onClick={() => onSelect(page)}>
        {t(EXPLORE_PAGE_LABEL_KEYS[page])}
      </ToggleButton>)}
    </ToggleControls>
  </nav>;
}
