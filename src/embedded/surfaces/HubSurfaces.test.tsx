import { act, fireEvent, render, screen } from "@testing-library/react";
import { MemoryRouter, Route, Routes, useLocation, useSearchParams, useNavigate } from "react-router-dom";
import { beforeEach, describe, expect, it, vi } from "vitest";
import { EmbeddedNavigationContext } from "../EmbeddedNavigationContext";

function listPage(name: string) {
  return {
    default: function MockListPage({ section }: { section?: string | null }) {
      const [params, setParams] = useSearchParams();
      return <div data-testid={`page-${name}`} data-query={params.toString()} data-section={section ?? ""}>
        <button type="button" onClick={() => setParams(current => { const next = new URLSearchParams(current); next.set("page", "2"); return next; })}>next page</button>
        {name === "recipes" && <button type="button" onClick={() => setParams(current => { const next = new URLSearchParams(current); next.delete("tab"); return next; })}>Featured tab</button>}
      </div>;
    },
  };
}
vi.mock("../../pages/CoursesPage", () => listPage("courses"));
vi.mock("../../pages/ExplorePage", () => listPage("segments"));
vi.mock("../../pages/EventsPage", () => listPage("events"));
vi.mock("../../pages/ChallengesPage", () => listPage("challenges"));
vi.mock("../../pages/ExploreAthletesPage", () => listPage("athletes"));
vi.mock("../../pages/CreatorHubPage", () => listPage("recipes"));
vi.mock("../../pages/BoardPage", () => listPage("board"));
vi.mock("../../pages/group/GroupsPage", () => listPage("clubs"));
vi.mock("../../components/redesign/MobileMenuSearch", async () => {
  const { useLocalizedNavigate } = await import("../../hooks/useLocalizedNavigate");
  return {
    default: function MockMenuSearch() {
      const navigate = useLocalizedNavigate();
      return <div>
        <button type="button" onClick={() => navigate("/clubs?q=river&sport=run")}>search clubs</button>
        <button type="button" onClick={() => navigate("/community/board?q=help")}>search posts</button>
        <button type="button" onClick={() => navigate("/?q=ride&scope=all")}>search activities</button>
      </div>;
    },
  };
});

import ExploreSurface from "./ExploreSurface";
import SearchSurface from "./SearchSurface";

function Location() {
  const location = useLocation();
  const navigate = useNavigate();
  return <><output data-testid="location">{`${location.pathname}${location.search}`}</output><button onClick={() => navigate(-1)}>history back</button></>;
}

function renderSurface(element: React.ReactNode, path: string, hostNavigate = vi.fn()) {
  render(
    <MemoryRouter initialEntries={[path]}>
      <EmbeddedNavigationContext.Provider value={hostNavigate}>
        <Routes>
          <Route path="/:lang/embed/:hub" element={<>{element}<Location /></>} />
        </Routes>
      </EmbeddedNavigationContext.Provider>
    </MemoryRouter>,
  );
  return hostNavigate;
}

describe("explore embed", () => {
  const props = { retryKey: 0, onReady: vi.fn(), onError: vi.fn() };
  beforeEach(() => { props.onReady.mockClear(); });

  it("defaults to courses, renders the sub-tabs in hub order and reports readiness once content mounts", async () => {
    renderSurface(<ExploreSurface {...props} />, "/ko/embed/explore");
    expect(await screen.findByTestId("page-courses")).toBeInTheDocument();
    const tabs = screen.getAllByRole("button").filter(button => button.hasAttribute("aria-pressed")).map(button => button.textContent);
    expect(tabs).toEqual(["코스", "세그먼트", "이벤트", "챌린지", "사람", "기록 활용", "게시판"]);
    expect(props.onReady).toHaveBeenCalledTimes(1);
  });

  it("opens the requested page, switches tabs without keeping the previous filters and keeps the board when it paginates", async () => {
    renderSurface(<ExploreSurface {...props} />, "/ko/embed/explore?page=athletes&q=kim");
    expect(await screen.findByTestId("page-athletes")).toHaveAttribute("data-query", "q=kim&hubPage=athletes");

    fireEvent.click(screen.getByRole("button", { name: "게시판" }));
    expect(await screen.findByTestId("page-board")).toBeInTheDocument();
    expect(screen.getByTestId("location")).toHaveTextContent("/ko/embed/explore?hubPage=board");

    // 게시판은 `page` 를 페이지 번호로 다시 쓴다 — 서브탭은 게시판에 머문다.
    fireEvent.click(screen.getByRole("button", { name: "next page" }));
    expect(screen.getByTestId("location")).toHaveTextContent("/ko/embed/explore?hubPage=board&page=2");
    expect(screen.getByTestId("page-board")).toBeInTheDocument();
    expect(screen.getByRole("button", { name: "게시판" })).toHaveAttribute("aria-pressed", "true");
  });

  it("fresh mount and Back restore board pagination independently of the hub tab", async () => {
    renderSurface(<ExploreSurface {...props} />, "/ko/embed/explore?hubPage=board&page=2");
    expect(await screen.findByTestId("page-board")).toHaveAttribute("data-query", "hubPage=board&page=2");
    fireEvent.click(screen.getByRole("button", { name: "사람" }));
    expect(await screen.findByTestId("page-athletes")).toBeInTheDocument();
    fireEvent.click(screen.getByRole("button", { name: "history back" }));
    expect(await screen.findByTestId("page-board")).toHaveAttribute("data-query", "hubPage=board&page=2");
  });

  it("keeps the outer selection when Creator Hub selects Featured and clears its own tab", async () => {
    renderSurface(<ExploreSurface {...props} />, "/ko/embed/explore?page=recipes&section=recipes&tab=saved");
    expect(await screen.findByTestId("page-recipes")).toHaveAttribute("data-query", "section=recipes&tab=saved&hubPage=recipes");
    fireEvent.click(screen.getByRole("button", { name: "Featured tab" }));
    expect(await screen.findByTestId("page-recipes")).toHaveAttribute("data-query", "section=recipes&hubPage=recipes");
  });

  it("passes the creator section from the query", async () => {
    renderSurface(<ExploreSurface {...props} />, "/ko/embed/explore?page=recipes&section=recipes");
    expect(await screen.findByTestId("page-recipes")).toHaveAttribute("data-section", "recipes");
  });
});

describe("search embed", () => {
  const props = { retryKey: 0, onReady: vi.fn(), onError: vi.fn() };

  it("shows list results in place with the submitted query instead of leaving the WebView", async () => {
    const host = renderSurface(<SearchSurface {...props} />, "/ko/embed/search");
    await act(async () => fireEvent.click(screen.getByRole("button", { name: "search clubs" })));
    expect(await screen.findByTestId("page-clubs")).toHaveAttribute("data-query", "q=river&sport=run");

    await act(async () => fireEvent.click(screen.getByRole("button", { name: "search posts" })));
    expect(await screen.findByTestId("page-board")).toHaveAttribute("data-query", "q=help");
    expect(screen.queryByTestId("page-clubs")).toBeNull();
    expect(host).not.toHaveBeenCalled();
  });

  it("hands activity search (web home feed) to the app", async () => {
    const host = renderSurface(<SearchSurface {...props} />, "/ko/embed/search");
    await act(async () => fireEvent.click(screen.getByRole("button", { name: "search activities" })));
    expect(host).toHaveBeenCalledWith("/ko/?q=ride&scope=all");
  });
});
