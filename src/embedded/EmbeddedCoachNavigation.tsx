import { useEffect, useRef } from "react";
import { useSearchParams } from "react-router-dom";
import { useTranslation } from "react-i18next";
import TabNav from "../components/TabNav";
import { COACH_PAGES, coachTabForPage, embeddedCoachPage, type EmbeddedCoachPage } from "./coachNavigation";

export function EmbeddedCoachNavigation({ defaultPage, selectionKey }: { defaultPage: EmbeddedCoachPage; selectionKey: number }) {
  const [params, setParams] = useSearchParams();
  const { t } = useTranslation("common");
  const selected = coachTabForPage(embeddedCoachPage(params.get("page")) ?? defaultPage);
  const previousSelection = useRef(selectionKey);
  useEffect(() => {
    if (previousSelection.current === selectionKey) return;
    previousSelection.current = selectionKey;
    setParams(current => { const next = new URLSearchParams(current); next.delete("page"); return next; }, { replace: true });
  }, [selectionKey, setParams]);
  // 웹 코치 상단 탭과 같은 밑줄 탭(2026-11-03) — 알약형 토글보다 웹과 같은 모양을 앱에서도 쓴다.
  return <nav className="site-shell embedded-coach-nav" aria-label={t("nav.coach")}>
    <TabNav tabs={COACH_PAGES.map(page => ({ id: page, label: t(`coachPages.${page}`) }))} activeTab={selected} onChange={page => {
      setParams(current => { const next = new URLSearchParams(); const sport = current.get("sport"); if (sport) next.set("sport", sport); next.set("page", page); return next; });
    }} />
  </nav>;
}
