import { fireEvent, render, screen, waitFor } from "@testing-library/react";
import { MemoryRouter, Route, Routes, useLocation } from "react-router-dom";
import { afterEach, describe, expect, it, vi } from "vitest";
import MenuPageSurface from "./MenuPageSurface";
import { EmbeddedNavigationContext } from "../EmbeddedNavigationContext";
vi.mock("../../pages/CommunityGuidelinesPage", () => ({ default: () => <p>가이드라인 정본</p> }));
vi.mock("../../pages/CreatePostPage", () => ({ default: () => <p>피드백 작성{useLocation().search}</p> }));
vi.mock("../../pages/activity/ActivityEditPage", () => ({ default: () => <p>활동 수정</p> }));
describe("앱 메뉴 임베드", () => {
  const show = (page: "about" | "community-guidelines" | "feedback" | "activity-edit") => {
    const onReady = vi.fn(), onError = vi.fn(), navigate = vi.fn();
    render(<MemoryRouter initialEntries={[`/en/embed/${page}`]}><Routes>
      <Route path="/:lang/embed/*" element={<EmbeddedNavigationContext.Provider value={navigate}>
        <MenuPageSurface page={page} retryKey={0} onReady={onReady} onError={onError} />
      </EmbeddedNavigationContext.Provider>} />
    </Routes></MemoryRouter>);
    return { onReady, onError, navigate };
  };
  it("피드백은 문의 작성 종류를 지정한 뒤 준비를 알린다", async () => {
    const x = show("feedback");
    expect(await screen.findByText("피드백 작성?type=inquiry")).toBeInTheDocument();
    await waitFor(() => expect(x.onReady).toHaveBeenCalledOnce());
  });
  afterEach(() => vi.unstubAllGlobals());
  it("소개 정본을 격리해 그리고 내부 링크는 호스트로 전달한다", async () => {
    const fetcher = vi.fn(async (url: string) => ({ ok: true, text: async () => url.endsWith(".css") ? ".campaign-page { color: black; }"
      : '<html><head><link rel="stylesheet" href="/about/campaign.css"></head><body class="campaign-page"><header><h1>소개 정본</h1></header><main><a href="/en/clubs">클럽</a><script>unsafe()</script></main></body></html>' }));
    vi.stubGlobal("fetch", fetcher);
    const x = show("about");
    await waitFor(() => expect(x.onReady).toHaveBeenCalledOnce());
    expect(fetcher).toHaveBeenCalledWith("/en/about/index.html", { credentials: "omit", redirect: "error" });
    const root = screen.getByTestId("embedded-about-document").shadowRoot!;
    expect(root.querySelector("h1")?.textContent).toBe("소개 정본");
    expect(root.querySelector("script")).toBeNull();
    expect(document.querySelector(".campaign-page")).toBeNull();
    fireEvent.click(root.querySelector("a")!);
    expect(x.navigate).toHaveBeenCalledWith("/en/clubs");
  });
  it("소개 정본이 없는 응답은 준비 완료로 숨기지 않는다", async () => {
    vi.stubGlobal("fetch", vi.fn(async () => ({ ok: true, text: async () => "<div>missing document</div>" })));
    const x = show("about");
    await waitFor(() => expect(x.onError).toHaveBeenCalledWith("surface_load_failed"));
    expect(x.onReady).not.toHaveBeenCalled();
  });
});
