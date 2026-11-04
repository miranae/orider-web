import { useEffect, useRef } from "react";
import { useTranslation } from "react-i18next";
import TabNav from "../components/TabNav";
import { EXPLORE_PAGE_LABEL_KEYS, EXPLORE_PAGES, type EmbeddedExplorePage } from "./hubNavigation";

/**
 * 탐색 임베드 서브탭. 앱 코치 상단 탭(EmbeddedCoachNavigation)과 같은 밑줄 탭(TabNav)이고(2026-11-04),
 * 폰 폭에서는 칸이 넘쳐 가로 스크롤한다.
 */
export function EmbeddedExploreNavigation({ selected, onSelect }: {
  selected: EmbeddedExplorePage;
  onSelect: (page: EmbeddedExplorePage) => void;
}) {
  const { t } = useTranslation("common");
  const navRef = useRef<HTMLElement>(null);
  useEffect(() => {
    // 링크·이력으로 뒤쪽 탭(게시판 등)이 선택돼도 밑줄이 보이게 탭 줄만 가로로 옮긴다.
    // scrollIntoView 는 페이지 세로 스크롤까지 바꿀 수 있어 쓰지 않는다.
    const list = navRef.current?.querySelector<HTMLElement>('[role="tablist"]');
    const tab = list?.querySelector<HTMLElement>('[aria-selected="true"]');
    if (!list || !tab) return;
    const box = list.getBoundingClientRect();
    const item = tab.getBoundingClientRect();
    if (item.left < box.left) list.scrollLeft += item.left - box.left;
    else if (item.right > box.right) list.scrollLeft += item.right - box.right;
  }, [selected]);
  return <nav ref={navRef} className="site-shell embedded-explore-nav" aria-label={t("nav.explore")}>
    <TabNav tabs={EXPLORE_PAGES.map(page => ({ id: page, label: t(EXPLORE_PAGE_LABEL_KEYS[page]) }))} activeTab={selected}
      onChange={page => onSelect(page as EmbeddedExplorePage)} />
  </nav>;
}
