import { useEffect, useRef } from "react";
import { useSearchParams } from "react-router-dom";
import { useTranslation } from "react-i18next";
import { ToggleButton, ToggleControls } from "../theme/components";
import { COACH_PAGES, embeddedCoachPage, type EmbeddedCoachPage } from "./coachNavigation";

export function EmbeddedCoachNavigation({ defaultPage, selectionKey }: { defaultPage: EmbeddedCoachPage; selectionKey: number }) {
  const [params, setParams] = useSearchParams();
  const { t } = useTranslation("common");
  const selected = embeddedCoachPage(params.get("page")) ?? defaultPage;
  const previousSelection = useRef(selectionKey);
  useEffect(() => {
    if (previousSelection.current === selectionKey) return;
    previousSelection.current = selectionKey;
    setParams(current => { const next = new URLSearchParams(current); next.delete("page"); return next; }, { replace: true });
  }, [selectionKey, setParams]);
  return <nav className="site-shell" style={{ marginBottom: "var(--space-4)" }} aria-label={t("nav.coach")}>
    <ToggleControls variant="axis" stretch aria-label={t("nav.coach")}>
      {COACH_PAGES.map(page => <ToggleButton key={page} selected={selected === page} onClick={() => {
        setParams(current => { const next = new URLSearchParams(); const sport = current.get("sport"); if (sport) next.set("sport", sport); next.set("page", page); return next; });
      }}>{t(`coachPages.${page}`)}</ToggleButton>)}
    </ToggleControls>
  </nav>;
}
