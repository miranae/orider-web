import { lazy, useEffect } from "react";
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

/** 탐색 선택은 tab, 각 목록의 페이지 번호는 page로 독립해 이력·새로고침을 보존한다. */
export default function ExploreSurface(props: HubSurfaceProps) {
  const { t } = useTranslation("common");
  const [params, setParams] = useSearchParams();
  const legacy = embeddedExplorePage(params.get("page"));
  const requested = embeddedExplorePage(params.get("hubPage"));
  const selected = requested ?? legacy ?? DEFAULT_EXPLORE_PAGE;
  useEffect(() => {
    // 기존 앱의 ?page=board 링크도 계속 받되, 목록이 page를 쓰기 전에 정규화한다.
    if (!requested && legacy) {
      const next = new URLSearchParams(params);
      next.set("hubPage", legacy);
      next.delete("page");
      setParams(next, { replace: true });
    }
  }, [params, setParams, legacy, requested]);
  const select = (page: EmbeddedExplorePage) => {
    setParams(new URLSearchParams({ hubPage: page }));
  };
  return (
    <HubSurfaceFrame {...props} title={t("nav.explore")} testId="embedded-explore" className="orider-embedded-explore"
      header={<EmbeddedExploreNavigation selected={selected} onSelect={select} />}>
      <ExplorePageContent key={selected} page={selected} section={selected === "recipes" ? params.get("section") : null} />
    </HubSurfaceFrame>
  );
}
