import { act, fireEvent, screen, waitFor } from "@testing-library/react";
import { useLocation, useNavigate } from "react-router-dom";
import userEvent from "@testing-library/user-event";
import { renderWithProviders } from "../__tests__/utils/renderWithProviders";

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

  it("selects a segment through its keyboard title button and preserves explicit detail entry", async () => {
    mockOverviewFetch([SEG_CLIMB]);
    const user = userEvent.setup();
    const ExplorePage = await loadExplorePage();
    renderWithProviders(<ExplorePage />, { route: "/explore/segments" });
    const title = await screen.findByRole("button", { name: "남산 업힐", exact: true });
    expect(title).toHaveAttribute("aria-pressed", "false");
    title.focus();
    await user.keyboard("{Enter}");
    expect(title).toHaveAttribute("aria-pressed", "true");
    expect(await screen.findByRole("button", { name: "상세 보기" })).toBeInTheDocument();
    await user.keyboard(" ");
    expect(title).toHaveAttribute("aria-pressed", "false");
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
