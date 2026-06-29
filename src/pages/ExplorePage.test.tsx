import { screen, waitFor } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import { renderWithProviders } from "../__tests__/utils/renderWithProviders";

// ExplorePage는 더 이상 Firestore `segments` 컬렉션을 구독하지 않고
// 서버가 생성한 타일 overview.json 을 fetch 로 읽어 module-level 캐시에 채운다.
// 따라서 세그먼트 데이터는 fetch 모킹으로 주입한다.
//
// 또한 overview 결과가 module-level 캐시(moduleCache)에 남아 테스트 간 오염되므로,
// 매 테스트마다 vi.resetModules() 후 ExplorePage 를 새로 import 해 캐시를 초기화한다.
interface OverviewSeg {
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

  // ExplorePage는 라우트가 정확히 /explore (또는 /{lang}/explore) 일 때만 렌더한다
  // (Layout 직접 렌더 최적화). 따라서 모든 테스트는 route:"/explore" 로 마운트한다.

  it("renders explore page heading", async () => {
    const ExplorePage = await loadExplorePage();
    renderWithProviders(<ExplorePage />, { route: "/explore" });
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
    renderWithProviders(<ExplorePage />, { route: "/explore" });
    await waitFor(() => {
      expect(screen.getByText(/전체/)).toBeInTheDocument();
      expect(screen.getByText(/힐클라임/)).toBeInTheDocument();
      expect(screen.getByText(/평지/)).toBeInTheDocument();
    });
  });

  it("shows empty state when no segments", async () => {
    const ExplorePage = await loadExplorePage();
    renderWithProviders(<ExplorePage />, { route: "/explore" });
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
    renderWithProviders(<ExplorePage />, { route: "/explore" });
    await waitFor(() => {
      expect(screen.getByText("남산 업힐")).toBeInTheDocument();
    });
  });

  it("filters segments by category", async () => {
    mockOverviewFetch([SEG_CLIMB, SEG_FLAT]);
    const ExplorePage = await loadExplorePage();
    const user = userEvent.setup();

    renderWithProviders(<ExplorePage />, { route: "/explore" });
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
