import { lazy, useCallback, useState } from "react";
import { useSearchParams } from "react-router-dom";
import { useTranslation } from "react-i18next";
import MobileMenuSearch from "../../components/redesign/MobileMenuSearch";
import "../../components/redesign/TopNav.css";
import { GlossaryProvider } from "../../components/common/GlossaryProvider";
import { EmbeddedNavigationContext, useEmbeddedNavigation } from "../EmbeddedNavigationContext";
import { searchResultForDestination, type EmbeddedSearchResult } from "../hubNavigation";
import HubSurfaceFrame, { type HubSurfaceProps } from "./HubSurfaceFrame";
import { ExplorePageContent } from "./ExploreSurface";

const GroupsPage = lazy(() => import("../../pages/group/GroupsPage"));

/**
 * 앱 검색: 웹 햄버거 메뉴의 MobileMenuSearch 를 그대로 쓰고, 결과(사람·클럽·코스·세그먼트·
 * 게시글)는 같은 WebView 안 폼 아래에 해당 웹 목록 화면으로 그린다. 활동 검색 결과(웹 홈
 * 피드)와 결과 안의 상세 링크는 기존처럼 `navigation.openNative` 로 앱에 넘긴다.
 */
export default function SearchSurface(props: HubSurfaceProps) {
  const { t } = useTranslation("common");
  const hostNavigate = useEmbeddedNavigation();
  const [, setParams] = useSearchParams();
  const [result, setResult] = useState<EmbeddedSearchResult | null>(null);
  const [searchKey, setSearchKey] = useState(0);
  const navigateFromSearch = useCallback((destination: string) => {
    const next = searchResultForDestination(destination);
    if (!next) { hostNavigate?.(destination); return; }
    setResult(next.result);
    setSearchKey(key => key + 1);
    // 결과 목록 페이지는 웹과 같은 이름의 쿼리(q·sport·type …)를 URL 에서 읽는다.
    setParams(next.params, { replace: true });
  }, [hostNavigate, setParams]);
  return (
    <HubSurfaceFrame {...props} title={t("topnav.menuSearch.placeholder")} testId="embedded-search"
      header={(
        <EmbeddedNavigationContext.Provider value={navigateFromSearch}>
          <MobileMenuSearch onNavigate={() => {}} />
        </EmbeddedNavigationContext.Provider>
      )}>
      {result === "clubs" ? <GlossaryProvider key={searchKey}><GroupsPage /></GlossaryProvider>
        : result ? <ExplorePageContent key={`${result}:${searchKey}`} page={result} /> : null}
    </HubSurfaceFrame>
  );
}
