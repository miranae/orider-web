import { describe, expect, it } from "vitest";
import {
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
      .toBe(`/${lang}/embed/explore?type=race&page=events#list`);
    expect(embeddedHubDestination(`/${lang}/embed/explore`, "/community/board?type=inquiry&page=3"))
      .toBe(`/${lang}/embed/explore?type=inquiry&page=board`);
    expect(embeddedHubDestination(`/${lang}/embed/explore`, "/explore/recipes/recipes"))
      .toBe(`/${lang}/embed/explore?page=recipes&section=recipes`);
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
    expect(embeddedInternalDestination("/ko/embed/explore", "/explore/athletes?q=kim")).toBe("/ko/embed/explore?q=kim&page=athletes");
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
