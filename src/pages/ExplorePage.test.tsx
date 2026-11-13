import { act, fireEvent, screen, waitFor } from "@testing-library/react";
import { useLocation, useNavigate } from "react-router-dom";
import userEvent from "@testing-library/user-event";
import { renderWithProviders } from "../__tests__/utils/renderWithProviders";

const { logClientError } = vi.hoisted(() => ({ logClientError: vi.fn() }));
vi.mock("../services/errorLogger", async (importOriginal) => ({
  ...await importOriginal<typeof import("../services/errorLogger")>(),
  logClientError,
}));

// ExplorePage는 더 이상 Firestore `segments` 컬렉션을 구독하지 않고
// 서버가 생성한 타일 overview.json 을 fetch 로 읽어 module-level 캐시에 채운다.
// 따라서 세그먼트 데이터는 fetch 모킹으로 주입한다.
//
// 또한 overview 결과가 module-level 캐시(moduleCache)에 남아 테스트 간 오염되므로,
// 매 테스트마다 vi.resetModules() 후 ExplorePage 를 새로 import 해 캐시를 초기화한다.
interface OverviewSeg {
  discipline?: string;
  id: string;
  name: string;
  distance: number;
  averageGrade: number;
  maximumGrade: number;
  elevationHigh: number;
  elevationLow: number;
  climbCategory: number;
  startLatlng: [number, number] | null;
  sl: [number, number][];
  gh: string;
}

function mockOverviewFetch(segments: OverviewSeg[]) {
  const overview = { v: 2, ts: 0, count: segments.length, segments };
  global.fetch = vi.fn(() =>
    Promise.resolve({
      ok: true,
      headers: { get: () => "application/json" },
      json: () => Promise.resolve(overview),
    } as Response),
  );
}

async function loadExplorePage() {
  vi.resetModules();
  const mod = await import("./ExplorePage");
  return mod.default;
}

const SEG_CLIMB: OverviewSeg = {
  id: "s1",
  name: "남산 업힐",
  distance: 2500,
  averageGrade: 7.2,
  maximumGrade: 12.0,
  elevationHigh: 260,
  elevationLow: 80,
  climbCategory: 3,
  startLatlng: [37.5, 127.0],
  sl: [
    [37.5, 127.0],
    [37.51, 127.01],
  ],
  gh: "wyd",
};

const SEG_FLAT: OverviewSeg = {
  id: "s2",
  name: "탄천 평지",
  distance: 5000,
  averageGrade: 0.1,
  maximumGrade: 1.0,
  elevationHigh: 30,
  elevationLow: 25,
  climbCategory: 0,
  startLatlng: [37.4, 127.1],
  sl: [
    [37.4, 127.1],
    [37.41, 127.11],
  ],
  gh: "wye",
};

describe("ExplorePage", () => {
  beforeEach(() => {
    // 세그먼트 없음(empty) 기본값. 개별 테스트에서 필요 시 재설정.
    mockOverviewFetch([]);
    logClientError.mockClear();
  });

  it.each(["segments", "empty"] as const)("finishes a shared %s overview after auth ownership remounts the retained page", async (result) => {
    let resolveFetch!: (response: Response) => void;
    global.fetch = vi.fn(() => new Promise<Response>((resolve) => { resolveFetch = resolve; }));
    const ExplorePage = await loadExplorePage();
    const { RetainedHubPages } = await import("../components/RetainedHubPages");
    function RetainedSegments({ owner }: { owner: string | null }) {
      return <RetainedHubPages path="/explore/segments" hub="explore" owner={owner}><ExplorePage /></RetainedHubPages>;
    }
    const view = renderWithProviders(<RetainedSegments owner={null} />, { route: "/explore/segments" });
    await waitFor(() => expect(fetch).toHaveBeenCalledTimes(1));
    // Layout의 인증 복원과 같은 owner 변경으로, 공용 조회가 진행 중인 비로그인 화면을 교체한다.
    view.rerender(<RetainedSegments owner="restored-user" />);
    const segments = result === "segments" ? [SEG_CLIMB] : [];
    await act(async () => {
      resolveFetch({ ok: true, headers: { get: () => "application/json" }, json: async () => ({ v: 2, count: segments.length, segments }) } as Response);
    });
    if (result === "segments") {
      expect(screen.getByRole("link", { name: SEG_CLIMB.name, exact: true })).toBeVisible();
    } else {
      expect(screen.getByText(/^세그먼트가 없습니다\./)).toBeVisible();
    }
    expect(fetch).toHaveBeenCalledTimes(1);
    view.rerender(<RetainedSegments owner="another-user" />);
    await waitFor(() => expect(fetch).toHaveBeenCalledTimes(1));
    if (result === "segments") {
      expect(screen.getByRole("link", { name: SEG_CLIMB.name, exact: true })).toBeVisible();
    } else {
      expect(screen.getByText(/^세그먼트가 없습니다\./)).toBeVisible();
    }
  });

  it("logs a shared overview failure once after all owner-page subscribers unmount", async () => {
    let rejectFetch!: (error: Error) => void;
    global.fetch = vi.fn(() => new Promise<Response>((_resolve, reject) => { rejectFetch = reject; }));
    const ExplorePage = await loadExplorePage();
    const { RetainedHubPages } = await import("../components/RetainedHubPages");
    function RetainedSegments({ owner }: { owner: string | null }) {
      return <RetainedHubPages path="/explore/segments" hub="explore" owner={owner}><ExplorePage /></RetainedHubPages>;
    }
    const view = renderWithProviders(<RetainedSegments owner={null} />, { route: "/explore/segments" });
    await waitFor(() => expect(fetch).toHaveBeenCalledTimes(1));
    view.rerender(<RetainedSegments owner="restored-user" />);
    view.unmount();
    const error = new Error("overview failed after navigation");
    await act(async () => { rejectFetch(error); });
    expect(logClientError).toHaveBeenCalledExactlyOnceWith("ExplorePage.loadSegmentOverview", error);
  });

  it("shows the pending overview failure to the replacement owner and lets it retry", async () => {
    let rejectFetch!: (error: Error) => void;
    const fetchMock = vi.fn(() => new Promise<Response>((_resolve, reject) => { rejectFetch = reject; }));
    global.fetch = fetchMock;
    const ExplorePage = await loadExplorePage();
    const { RetainedHubPages } = await import("../components/RetainedHubPages");
    function RetainedSegments({ owner }: { owner: string | null }) {
      return <RetainedHubPages path="/explore/segments" hub="explore" owner={owner}><ExplorePage /></RetainedHubPages>;
    }
    const view = renderWithProviders(<RetainedSegments owner={null} />, { route: "/explore/segments" });
    await waitFor(() => expect(fetchMock).toHaveBeenCalledTimes(1));
    view.rerender(<RetainedSegments owner="restored-user" />);
    await act(async () => { rejectFetch(new Error("overview unavailable")); });
    const retry = screen.getByRole("button", { name: "다시 시도" });
    expect(logClientError).toHaveBeenCalledTimes(1);
    fetchMock.mockResolvedValueOnce({ ok: true, headers: { get: () => "application/json" }, json: async () => ({ v: 2, count: 1, segments: [SEG_CLIMB] }) } as Response);
    fireEvent.click(retry);
    expect(await screen.findByRole("link", { name: SEG_CLIMB.name, exact: true })).toBeVisible();
    expect(fetchMock).toHaveBeenCalledTimes(2);
  });

  it("applies menu sport and terrain to actual results and preserves them through serialization and history", async () => {
    mockOverviewFetch([SEG_CLIMB, SEG_FLAT, { ...SEG_FLAT, id: "run", name: "러닝 평지", discipline: "run" }]);
    const ExplorePage = await loadExplorePage();
    function RouteControls() {
      const navigate = useNavigate();
      const location = useLocation();
      return <>
        <output data-testid="route">{location.search}</output>
        <button onClick={() => navigate("/explore/segments?sport=bike&cat=climb")}>Menu segment filters</button>
        <button onClick={() => navigate("/explore/segments")}>Clear menu segment filters</button>
        <button onClick={() => navigate(-1)}>Back</button>
      </>;
    }
    renderWithProviders(<><RouteControls /><ExplorePage /></>, { route: "/explore/segments?sport=run&cat=flat" });
    expect(await screen.findByText("러닝 평지")).toBeInTheDocument();
    expect(screen.queryByText("탄천 평지")).not.toBeInTheDocument();
    await waitFor(() => expect(screen.getByTestId("route").textContent).toContain("z="));
    expect(new URLSearchParams(screen.getByTestId("route").textContent ?? "").get("sport")).toBe("run");
    fireEvent.click(screen.getByRole("button", { name: "Menu segment filters" }));
    expect(await screen.findByText("남산 업힐")).toBeInTheDocument();
    expect(screen.queryByText("탄천 평지")).not.toBeInTheDocument();
    expect(screen.queryByText("러닝 평지")).not.toBeInTheDocument();
    fireEvent.click(screen.getByRole("button", { name: "Clear menu segment filters" }));
    expect(await screen.findByText("탄천 평지")).toBeInTheDocument();
    expect(screen.getByText("남산 업힐")).toBeInTheDocument();
    fireEvent.click(screen.getByRole("button", { name: "Back" }));
    await waitFor(() => expect(screen.queryByText("탄천 평지")).not.toBeInTheDocument());
    expect(screen.getByText("남산 업힐")).toBeInTheDocument();
  });

  it("keeps newer search draft while serializing the preceding result filters", async () => {
    mockOverviewFetch([SEG_CLIMB]);
    const ExplorePage = await loadExplorePage();
    renderWithProviders(<ExplorePage />, { route: "/explore/segments?sport=bike" });
    await screen.findByText("남산 업힐");
    const input = screen.getByRole("textbox", { name: "세그먼트 이름 또는 지역" });
    vi.useFakeTimers();
    try {
      fireEvent.change(input, { target: { value: "남" } });
      await act(async () => { vi.advanceTimersByTime(250); });
      await act(async () => { vi.advanceTimersByTime(300); });
      fireEvent.change(input, { target: { value: "남산" } });
      await act(async () => { vi.advanceTimersByTime(100); });
      expect(input).toHaveValue("남산");
      await act(async () => { vi.advanceTimersByTime(550); });
      expect(input).toHaveValue("남산");
      expect(screen.getByText("남산 업힐")).toBeInTheDocument();
    } finally {
      vi.useRealTimers();
    }
  });

  // ExplorePage는 라우트가 정확히 /explore/segments (또는 /{lang}/explore/segments) 일 때만 렌더한다
  // (Layout 직접 렌더 최적화). 따라서 모든 테스트는 route:"/explore/segments" 로 마운트한다.

  it("opens the segment detail from a single tap on a list card or its title link", async () => {
    mockOverviewFetch([SEG_CLIMB, SEG_FLAT]);
    const user = userEvent.setup();
    const ExplorePage = await loadExplorePage();
    function PathProbe() {
      return <output data-testid="path">{useLocation().pathname}</output>;
    }
    renderWithProviders(<><PathProbe /><ExplorePage /></>, { route: "/explore/segments" });
    // 제목은 키보드로도 갈 수 있는 실제 링크다.
    const title = await screen.findByRole("link", { name: "남산 업힐", exact: true });
    expect(title).toHaveAttribute("href", "/ko/segment/s1");
    title.focus();
    await user.keyboard("{Enter}");
    await waitFor(() => expect(screen.getByTestId("path").textContent).toBe("/ko/segment/s1"));
  });

  it("navigates on a card tap outside the title without a double click", async () => {
    mockOverviewFetch([SEG_CLIMB]);
    const ExplorePage = await loadExplorePage();
    function PathProbe() {
      return <output data-testid="path">{useLocation().pathname}</output>;
    }
    renderWithProviders(<><PathProbe /><ExplorePage /></>, { route: "/explore/segments" });
    await screen.findByRole("link", { name: "남산 업힐", exact: true });
    const card = screen.getAllByTestId("E2-2-2").find(element => element.tagName === "DIV")!;
    fireEvent.click(card);
    expect(screen.getByTestId("path").textContent).toBe("/ko/segment/s1");
  });

  it("hands a card tap in the app explore embed to the host instead of opening a browser page", async () => {
    mockOverviewFetch([SEG_CLIMB]);
    const ExplorePage = await loadExplorePage();
    const { EmbeddedNavigationContext } = await import("../embedded/EmbeddedNavigationContext");
    const hostNavigate = vi.fn();
    renderWithProviders(
      <EmbeddedNavigationContext.Provider value={hostNavigate}><ExplorePage embedded /></EmbeddedNavigationContext.Provider>,
      { route: "/ko/embed/explore" },
    );
    await screen.findByRole("link", { name: "남산 업힐", exact: true });
    fireEvent.click(screen.getAllByTestId("E2-2-2").find(element => element.tagName === "DIV")!);
    // 앱은 `segment-detail-embed-v1` 을 보고 이 경로를 세그먼트 상세 임베드로 연다(코스와 같다).
    expect(hostNavigate).toHaveBeenCalledWith("/ko/segment/s1");
  });

  it("visually distinguishes the selected sport and list mode", async () => {
    mockOverviewFetch([SEG_CLIMB]);
    const user = userEvent.setup();
    const ExplorePage = await loadExplorePage();
    renderWithProviders(<ExplorePage />, { route: "/explore/segments" });
    const cycling = await screen.findByRole("button", { name: "사이클", exact: true });
    const running = screen.getByRole("button", { name: "러닝", exact: true });
    expect(cycling).toHaveClass("ds-btn--primary", "font-bold");
    await user.click(running);
    expect(running).toHaveAttribute("aria-pressed", "true");
    expect(running).toHaveClass("ds-btn--primary", "font-bold");
    expect(cycling).toHaveClass("ds-btn--secondary");
    const notable = screen.getByRole("button", { name: "주목", exact: true });
    await user.click(notable);
    expect(notable).toHaveClass("ds-btn--primary", "font-bold");
    expect(screen.getByRole("button", { name: "범위 내", exact: true })).toHaveClass("ds-btn--secondary");
  });

  it("renders explore page heading", async () => {
    const ExplorePage = await loadExplorePage();
    renderWithProviders(<ExplorePage />, { route: "/explore/segments" });
    await waitFor(() => {
      const content = document.body.textContent ?? "";
      expect(
        content.includes("리더보드") ||
          content.includes("세그먼트") ||
          content.includes("전체"),
      ).toBeTruthy();
    });
  });

  it("shows category filter buttons", async () => {
    const ExplorePage = await loadExplorePage();
    renderWithProviders(<ExplorePage />, { route: "/explore/segments" });
    await waitFor(() => {
      expect(screen.getByText(/전체/)).toBeInTheDocument();
      expect(screen.getByText(/힐클라임/)).toBeInTheDocument();
      expect(screen.getByText(/평지/)).toBeInTheDocument();
    });
  });

  it("shows empty state when no segments", async () => {
    const ExplorePage = await loadExplorePage();
    renderWithProviders(<ExplorePage />, { route: "/explore/segments" });
    await waitFor(() => {
      const content = document.body.textContent ?? "";
      expect(
        content.includes("세그먼트") || content.includes("없습니다"),
      ).toBeTruthy();
    });
  });

  it("renders segments from overview tiles", async () => {
    mockOverviewFetch([SEG_CLIMB]);
    const ExplorePage = await loadExplorePage();
    renderWithProviders(<ExplorePage />, { route: "/explore/segments" });
    await waitFor(() => {
      expect(screen.getByText("남산 업힐")).toBeInTheDocument();
    });
  });

  it("filters segments by category", async () => {
    mockOverviewFetch([SEG_CLIMB, SEG_FLAT]);
    const ExplorePage = await loadExplorePage();
    const user = userEvent.setup();

    renderWithProviders(<ExplorePage />, { route: "/explore/segments" });
    await waitFor(() => {
      expect(screen.getByText("남산 업힐")).toBeInTheDocument();
      expect(screen.getByText("탄천 평지")).toBeInTheDocument();
    });

    await user.click(screen.getByRole("button", { name: /힐클라임/ }));
    await waitFor(() => {
      expect(screen.getByText("남산 업힐")).toBeInTheDocument();
      expect(screen.queryByText("탄천 평지")).not.toBeInTheDocument();
    });
  });
});
