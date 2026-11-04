import { describe, expect, it } from "vitest";
import {
  embeddedClubDetailDestination,
  embeddedExplorePage,
  embeddedHubDestination,
  embeddedInternalDestination,
  EXPLORE_PAGES,
  searchResultForDestination,
} from "./hubNavigation";

describe("app explore tab sub-pages", () => {
  it("follows the web explore hub order and appends the board", () => {
    expect(EXPLORE_PAGES).toEqual(["courses", "segments", "events", "challenges", "athletes", "recipes", "board"]);
    expect(embeddedExplorePage("board")).toBe("board");
    // 게시판 페이지 번호 같은 값은 서브탭이 아니다.
    expect(embeddedExplorePage("2")).toBeNull();
    expect(embeddedExplorePage(null)).toBeNull();
  });
});

describe("hub embed destinations", () => {
  it.each(["ko", "en"])("keeps %s explore list links inside the explore embed with their filters", lang => {
    expect(embeddedHubDestination(`/${lang}/embed/explore`, `/${lang}/explore/events?type=race#list`))
      .toBe(`/${lang}/embed/explore?type=race&hubPage=events#list`);
    expect(embeddedHubDestination(`/${lang}/embed/explore`, "/community/board?type=inquiry&page=3"))
      .toBe(`/${lang}/embed/explore?type=inquiry&page=3&hubPage=board`);
    expect(embeddedHubDestination(`/${lang}/embed/explore`, "/explore/recipes/recipes"))
      .toBe(`/${lang}/embed/explore?hubPage=recipes&section=recipes`);
  });

  it("keeps club list links in the clubs embed", () => {
    expect(embeddedHubDestination("/ko/embed/clubs", "/ko/clubs?new=1")).toBe("/ko/embed/clubs?new=1");
  });

  it("leaves details, other hubs, external links and non-hub embeds to the app", () => {
    expect(embeddedHubDestination("/ko/embed/explore", "/ko/course/abc")).toBeNull();
    expect(embeddedHubDestination("/ko/embed/explore", "/ko/clubs")).toBeNull();
    expect(embeddedHubDestination("/ko/embed/clubs", "/ko/club/abc")).toBeNull();
    expect(embeddedHubDestination("/ko/embed/clubs", "/ko/explore/courses")).toBeNull();
    expect(embeddedHubDestination("/ko/embed/explore", "https://other.invalid/explore/events")).toBeNull();
    expect(embeddedHubDestination("/ko/embed/search", "/ko/explore/courses")).toBeNull();
    expect(embeddedHubDestination("/ko/explore/courses", "/ko/explore/events")).toBeNull();
  });

  it("combines coach and hub destinations", () => {
    expect(embeddedInternalDestination("/ko/embed/plan", "/coach/analysis")).toBe("/ko/embed/plan?page=analysis");
    expect(embeddedInternalDestination("/ko/embed/explore", "/explore/athletes?q=kim")).toBe("/ko/embed/explore?q=kim&hubPage=athletes");
    expect(embeddedInternalDestination("/ko/embed/explore", "/coach/analysis")).toBeNull();
  });
});

describe("search embed results", () => {
  it("maps the menu search destinations to in-place result lists with their query", () => {
    const clubs = searchResultForDestination("/ko/clubs?q=%ED%95%9C%EA%B0%95&sport=run");
    expect(clubs?.result).toBe("clubs");
    expect(clubs?.params.get("q")).toBe("한강");
    expect(clubs?.params.get("sport")).toBe("run");
    expect(searchResultForDestination("/ko/explore/courses?q=a")?.result).toBe("courses");
    expect(searchResultForDestination("/en/explore/segments")?.result).toBe("segments");
    expect(searchResultForDestination("/ko/explore/athletes?q=b")?.result).toBe("athletes");
    expect(searchResultForDestination("/ko/community/board?type=devlog")?.result).toBe("board");
  });

  it("leaves activity search (web home feed) and details to the app", () => {
    expect(searchResultForDestination("/ko/?q=ride&scope=all")).toBeNull();
    expect(searchResultForDestination("/ko/course/abc")).toBeNull();
    expect(searchResultForDestination("https://other.invalid/clubs")).toBeNull();
  });
});

describe("club detail embed destinations", () => {
  it.each(["ko", "en"])("keeps the same club's %s detail and sub pages inside the club detail embed", lang => {
    const current = `/${lang}/embed/clubs/club-1/rides`;
    expect(embeddedClubDetailDestination(current, `/${lang}/club/club-1`)).toBe(`/${lang}/embed/clubs/club-1`);
    expect(embeddedClubDetailDestination(current, "/club/club-1/members?sort=role#top")).toBe(`/${lang}/embed/clubs/club-1/members?sort=role#top`);
    expect(embeddedClubDetailDestination(current, "/club/club-1/meetings/m-1/live")).toBe(`/${lang}/embed/clubs/club-1/meetings/m-1/live`);
    expect(embeddedClubDetailDestination(current, "/club/club-1/meetings/m-1/edit")).toBe(`/${lang}/embed/clubs/club-1/meetings/m-1/edit`);
    expect(embeddedClubDetailDestination(current, "/club/club-1/rides/r-1/")).toBe(`/${lang}/embed/clubs/club-1/rides/r-1`);
    // LocalizedLink 가 이미 임베드 경로로 바꾼 href 도 그대로 임베드 안에서 연다.
    expect(embeddedClubDetailDestination(current, `/${lang}/embed/clubs/club-1/week`)).toBe(`/${lang}/embed/clubs/club-1/week`);
    expect(embeddedInternalDestination(current, "/club/club-1/events")).toBe(`/${lang}/embed/clubs/club-1/events`);
  });

  it("leaves other clubs, unknown club pages, other routes and non-detail embeds to the app", () => {
    const current = "/ko/embed/clubs/club-1";
    expect(embeddedClubDetailDestination(current, "/ko/club/club-2")).toBeNull();
    expect(embeddedClubDetailDestination(current, "/ko/club/club-1/unknown")).toBeNull();
    expect(embeddedClubDetailDestination(current, "/ko/club/join/abc")).toBeNull();
    expect(embeddedClubDetailDestination(current, "/ko/athlete/user-1")).toBeNull();
    expect(embeddedClubDetailDestination(current, "https://other.invalid/ko/club/club-1")).toBeNull();
    expect(embeddedClubDetailDestination("/ko/embed/clubs", "/ko/club/club-1")).toBeNull();
    expect(embeddedClubDetailDestination("/ko/club/club-1", "/ko/club/club-1/members")).toBeNull();
  });
});


describe("이벤트 상세 임베드 이동", () => {
  it.each(["ko", "en"])("%s 이벤트 하위 화면은 같은 웹뷰 안에서 연다", lang => {
    const current = `/${lang}/embed/event/event-1`;
    for (const section of ["", "/register", "/results", "/host", "/host/edit", "/host/participants"]) {
      expect(embeddedInternalDestination(current, `/event/event-1${section}?a=1#top`))
        .toBe(`${current}${section}?a=1#top`);
    }
    expect(embeddedInternalDestination(current, `${current}/meeting/group-1/event-1`)).toBe(`${current}/meeting/group-1/event-1`);
    expect(embeddedInternalDestination(current, `${current}/meeting/group-1/event-2`)).toBeNull();
    expect(embeddedInternalDestination(current, "/club/group-1/meetings/event-1/live")).toBe(`${current}/meeting/group-1/event-1/live`);
    expect(embeddedInternalDestination(current, "/club/group-1/meetings/event-1")).toBe(`${current}/meeting/group-1/event-1`);
    expect(embeddedInternalDestination(current, `${current}/results`)).toBe(`${current}/results`);
    for (const path of ["/event/event-2", "/event/event-1/unknown", "https://other.invalid/event/event-1", "/club/club-1"]) {
      expect(embeddedInternalDestination(current, path)).toBeNull();
    }
  });
});
