import { lazy, useEffect, useState } from "react";
import { useSearchParams } from "react-router-dom";
import { useTranslation } from "react-i18next";
import { EmbeddedExploreNavigation } from "../EmbeddedExploreNavigation";
import { DEFAULT_EXPLORE_PAGE, embeddedExplorePage, type EmbeddedExplorePage } from "../hubNavigation";
import HubSurfaceFrame, { type HubSurfaceProps } from "./HubSurfaceFrame";

export const EXPLORE_PAGE_COMPONENTS = {
  courses: lazy(() => import("../../pages/CoursesPage")),
  segments: lazy(() => import("../../pages/ExplorePage")),
  events: lazy(() => import("../../pages/EventsPage")),
  challenges: lazy(() => import("../../pages/ChallengesPage")),
  athletes: lazy(() => import("../../pages/ExploreAthletesPage")),
  recipes: lazy(() => import("../../pages/CreatorHubPage")),
  board: lazy(() => import("../../pages/BoardPage")),
} as const;

/** 탐색 허브의 한 서브탭 내용을 그린다(검색 결과에서도 재사용). */
export function ExplorePageContent({ page, section }: { page: EmbeddedExplorePage; section?: string | null }) {
  if (page === "courses" || page === "segments") {
    // 웹 Layout 은 지도 화면을 경로로 보였다 숨긴다 — 임베드에서는 항상 보인다.
    const MapPage = EXPLORE_PAGE_COMPONENTS[page];
    return <MapPage embedded />;
  }
  if (page === "recipes") {
    const Recipes = EXPLORE_PAGE_COMPONENTS.recipes;
    return <Recipes section={section} />;
  }
  const Page = EXPLORE_PAGE_COMPONENTS[page];
  return <Page />;
}

/**
 * 앱 탐색 탭: `?page=` 서브탭 + 웹 탐색 허브 페이지.
 * 선택한 서브탭은 상태로 들고 있는다 — 게시판이 `page` 를 페이지 번호로 다시 쓰거나 지워도
 * 서브탭이 바뀌지 않게 하고, URL 의 `page` 가 유효한 서브탭 값으로 바뀔 때만 따라간다.
 */
export default function ExploreSurface(props: HubSurfaceProps) {
  const { t } = useTranslation("common");
  const [params, setParams] = useSearchParams();
  const requested = embeddedExplorePage(params.get("page"));
  const [selected, setSelected] = useState<EmbeddedExplorePage>(requested ?? DEFAULT_EXPLORE_PAGE);
  useEffect(() => { if (requested) setSelected(requested); }, [requested]);
  const select = (page: EmbeddedExplorePage) => {
    setSelected(page);
    // 서브탭을 바꾸면 이전 화면의 검색·필터 조건은 버린다(웹 허브 서브탭 이동과 같다).
    setParams(new URLSearchParams({ page }));
  };
  return (
    <HubSurfaceFrame {...props} title={t("nav.explore")} testId="embedded-explore"
      header={<EmbeddedExploreNavigation selected={selected} onSelect={select} />}>
      <ExplorePageContent key={selected} page={selected} section={selected === "recipes" ? params.get("section") : null} />
    </HubSurfaceFrame>
  );
}
