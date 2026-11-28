import { lazy, useEffect } from "react";
import { useSearchParams } from "react-router-dom";
import { useTranslation } from "react-i18next";
import { EmbeddedExploreNavigation } from "../EmbeddedExploreNavigation";
import { DEFAULT_EXPLORE_PAGE, embeddedExplorePage, type EmbeddedExplorePage, type EmbeddedSearchResult } from "../hubNavigation";
import HubSurfaceFrame, { type HubSurfaceProps } from "./HubSurfaceFrame";

/** 탐색 서브탭 + 검색 임베드 결과(사람·게시글 목록)가 그리는 화면. */
export type ExploreContentPage = EmbeddedExplorePage | Exclude<EmbeddedSearchResult, "clubs">;

export const EXPLORE_PAGE_COMPONENTS = {
  courses: lazy(() => import("../../pages/CoursesPage")),
  segments: lazy(() => import("../../pages/ExplorePage")),
  events: lazy(() => import("../../pages/EventsPage")),
  challenges: lazy(() => import("../../pages/ChallengesPage")),
  community: lazy(() => import("../../pages/CommunityPage")),
  // 검색 임베드 결과 전용 — 탐색 서브탭은 커뮤니티로 합쳤다(#1929).
  athletes: lazy(() => import("../../pages/ExploreAthletesPage")),
  board: lazy(() => import("../../pages/BoardPage")),
} as const satisfies Record<ExploreContentPage, unknown>;

/** 탐색 허브의 한 서브탭 내용을 그린다(검색 결과에서도 재사용). */
export function ExplorePageContent({ page }: { page: ExploreContentPage }) {
  if (page === "courses" || page === "segments") {
    // 웹 Layout 은 지도 화면을 경로로 보였다 숨긴다 — 임베드에서는 항상 보인다.
    const MapPage = EXPLORE_PAGE_COMPONENTS[page];
    return <MapPage embedded />;
  }
  const Page = EXPLORE_PAGE_COMPONENTS[page];
  return <Page />;
}

/** 탐색 선택은 tab, 각 목록의 페이지 번호는 page로 독립해 이력·새로고침을 보존한다. */
export default function ExploreSurface(props: HubSurfaceProps) {
  const { t } = useTranslation("common");
  const [params, setParams] = useSearchParams();
  const rawHubPage = params.get("hubPage");
  const legacy = embeddedExplorePage(params.get("page"));
  const requested = embeddedExplorePage(rawHubPage);
  const selected = requested ?? legacy ?? DEFAULT_EXPLORE_PAGE;
  useEffect(() => {
    // 기존 앱의 ?page=board 링크도 계속 받되, 목록이 page를 쓰기 전에 정규화한다.
    if (!requested && legacy) {
      const next = new URLSearchParams(params);
      next.set("hubPage", legacy);
      next.delete("page");
      setParams(next, { replace: true });
    } else if (requested && rawHubPage !== requested) {
      // 옛 hubPage=athletes·board 는 community 로 바꿔 둔다 — 다른 쿼리(q·type·page)는 그대로.
      const next = new URLSearchParams(params);
      next.set("hubPage", requested);
      setParams(next, { replace: true });
    }
  }, [params, setParams, legacy, requested, rawHubPage]);
  const select = (page: EmbeddedExplorePage) => {
    setParams(new URLSearchParams({ hubPage: page }));
  };
  return (
    <HubSurfaceFrame {...props} title={t("nav.explore")} testId="embedded-explore" className="orider-embedded-explore"
      header={<EmbeddedExploreNavigation selected={selected} onSelect={select} />}>
      <ExplorePageContent key={selected} page={selected} />
    </HubSurfaceFrame>
  );
}
