import { act, fireEvent, screen, waitFor } from "@testing-library/react";
import { renderWithProviders } from "../__tests__/utils/renderWithProviders";
import { Route, Routes } from "react-router-dom";
import CreatorHubPage from "./CreatorHubPage";
import type { WeeklyStat } from "../components/WeeklyChart";
import type { WeeklyLoadEvidence } from "../utils/weeklyLoadEvidence";
import i18n from "i18next";
import enDashboard from "../i18n/resources/en/dashboard.json";

vi.mock("../hooks/useCreatorRecipeEmail", async (importOriginal) => ({
  ...await importOriginal<typeof import("../hooks/useCreatorRecipeEmail")>(),
  useCreatorRecipeEmail: () => ({ emailQuota: null, emailSendingId: null, emailSentItemIds: new Set(), emailFailedItemIds: new Set(), handleEmailRecipe: vi.fn(), markEmailFailed: vi.fn(), markEmailSent: vi.fn(), quotaNow: 0 }),
}));
const state = vi.hoisted(() => ({ tss: null as number | null, estimated: false, unknown: 1, weeks: null as WeeklyStat[] | null, empty: false }));
vi.mock("../hooks/useActivities", () => ({ useWeeklyStats: () => ({ weeklyStats: state.empty ? [] : state.weeks ?? [
  { week: "W", distance: 12, time: 1.5, rides: 2, elevation: 50,
    tss: state.tss, tssEstimated: state.estimated, tssUnknownCount: state.unknown },
] }) }));

it.each([
  [100, false, 1, "TSS 100", "부분합계"],
  [0, false, 1, "TSS 0", "부분합계"],
  [null, false, 1, "TSS 미확인", "부분합계"],
  [42, true, 0, "TSS 42", "추정 포함"],
])("창작 카드 부하 %s의 부분합계/추정 상태와 정상 거리·시간을 보존한다", async (tss, estimated, unknown, label, qualifier) => {
  Object.assign(state, { tss, estimated, unknown });
  const writeText = vi.fn().mockResolvedValue(undefined);
  Object.defineProperty(navigator, "clipboard", { configurable: true, value: { writeText } });
  const { container } = renderWithProviders(<Routes><Route path="/records/studio/:section" element={<CreatorHubPage />} /></Routes>, { authenticated: true, route: "/records/studio/share" });
  await waitFor(() => expect(container.textContent).toContain(label));
  expect(container.textContent).toContain(qualifier);
  expect(container.textContent).toContain("12km");
  expect(container.textContent).toContain("1.5h");
  const bar = screen.getByTestId("creator-distance-bar");
  // A missing/zero training score must not change a known distance bar.
  expect(bar).toHaveStyle({ height: "132px" });
  fireEvent.click(bar.closest("button")!);
  expect(screen.getByRole("tooltip")).toHaveTextContent("12.0 km");
  expect(screen.getByRole("tooltip")).toHaveTextContent(label);
  expect(screen.getByRole("tooltip")).toHaveTextContent(qualifier);
  fireEvent.click(screen.getByRole("button", { name: "차트 카드 복사" }));
  await waitFor(() => expect(writeText).toHaveBeenCalled());
  expect(writeText.mock.calls[0]?.[0]).toContain(label);
  expect(writeText.mock.calls[0]?.[0]).toContain(qualifier);
  expect(writeText.mock.calls[0]?.[0]).toContain("12km");
  expect(writeText.mock.calls[0]?.[0]).toContain("1.5h");
});

// 라이더 화면에는 API key·Swagger·GitHub·n8n 같은 개발자 안내를 두지 않는다(#3956).
const developerOnly = /Swagger|OpenAPI|API key|n8n|오라이더 공개 저장소|Personal Data API/;

it("shows rider tasks under the new title with only rider detail links", async () => {
  renderWithProviders(<Routes><Route path="/ko/records/studio" element={<CreatorHubPage />} /></Routes>, { authenticated: true, route: "/ko/records/studio" });
  expect(await screen.findByRole("heading", { name: "이 기록으로 만들기" })).toBeInTheDocument();
  expect(screen.getByRole("button", { name: "AI 일기 생성" })).toBeInTheDocument();
  expect(screen.getByRole("link", { name: "게시글로 공유" })).toBeInTheDocument();
  expect(screen.queryByText("연결 방식과 데이터 권한")).toBeNull();
  expect(screen.getByRole("link", { name: /^만들 수 있는 것 일기/ })).toHaveAttribute("href", "/ko/records/studio/recipes");
  expect(screen.getByRole("link", { name: /^자랑 카드/ })).toHaveAttribute("href", "/ko/records/studio/share");
  expect(screen.queryByRole("link", { name: /내 도구에 직접 연결하기|활용 예시/ })).toBeNull();
  expect(document.body.textContent).not.toMatch(developerOnly);
});

it.each(["recipes", "share"])("hides developer content in the rider %s section", async section => {
  renderWithProviders(<Routes><Route path="/ko/records/studio/:section" element={<CreatorHubPage />} /></Routes>, { authenticated: true, route: `/ko/records/studio/${section}` });
  await screen.findByRole("link", { name: "이 기록으로 만들기" });
  expect(screen.queryByText("데이터 권한과 연결 방식")).toBeNull();
  expect(screen.queryByText("활용 흐름과 데이터 보호 원칙")).toBeNull();
  expect(screen.queryByRole("button", { name: "배치 방법 보기" })).toBeNull();
  expect(screen.queryByTestId("E6-3-1")).toBeNull();
  expect(screen.queryByTestId("E6-1-8")).toBeNull();
  expect(screen.getByTestId("E6-1-7")).toHaveAttribute("href", "/ko/community/board/write?type=inquiry&template=creator-recipe");
  expect(document.body.textContent).not.toMatch(developerOnly);
});

it("marks generated-diary fallback as an example in the rider recipes section", async () => {
  renderWithProviders(<Routes><Route path="/records/studio/:section" element={<CreatorHubPage />} /></Routes>, { authenticated: true, route: "/records/studio/recipes" });
  expect(await screen.findByText("예시 데이터: 총 182km, 상승고도 2,140m. 수요일 고강도 이후 금요일은 회복주로 전환했고, 주말 롱라이드에서 페이스가 안정적으로 돌아왔습니다.")).toBeInTheDocument();
});

it("serves the developer guides with API key, Swagger and repository links and back to developer settings", async () => {
  renderWithProviders(<Routes><Route path="/ko/settings/developer/:section" element={<CreatorHubPage mode="developer" />} /></Routes>, { authenticated: true, route: "/ko/settings/developer/deploy" });
  expect(await screen.findByRole("heading", { name: "내 도구에 직접 연결하기" })).toBeInTheDocument();
  expect(screen.getByRole("link", { name: "개발자 설정" })).toHaveAttribute("href", "/ko/settings/developer");
  expect(screen.getByRole("link", { name: "Swagger UI 열기" })).toBeInTheDocument();
  expect(screen.getByTestId("E6-3-1")).toHaveAttribute("href", "/ko/settings/developer");
  expect(screen.getByTestId("E6-1-8")).toHaveAttribute("href", "https://github.com/miranae/orider-web");
  expect(screen.getByRole("link", { name: /활용 예시 보기/ })).toHaveAttribute("href", "/ko/settings/developer/examples");
  expect(screen.getByText("활용 흐름과 데이터 보호 원칙").closest("details")).not.toHaveAttribute("open");
  // 라이더 섹션은 개발자 경로에서 그리지 않는다 — 모르는 섹션은 deploy.
  expect(screen.queryByTestId("E6-1")).toBeNull();
});

it("keeps full setup and copyable prompts available behind disclosures", () => {
  renderWithProviders(<Routes><Route path="/settings/developer/:section" element={<CreatorHubPage mode="developer" />} /></Routes>, { authenticated: true, route: "/settings/developer/examples" });
  expect(screen.getAllByText("준비와 따라하기")).toHaveLength(4);
  for (const summary of screen.getAllByText("AI 작업 지시와 복사")) expect(summary.closest("details")).not.toHaveAttribute("open");
  expect(screen.getAllByTestId("E6-4-1")).toHaveLength(4);
});


afterEach(() => { state.weeks = null; state.empty = false; void i18n.changeLanguage("ko"); });
it.each(["ko", "en"])("keeps all six distance bars, three complete mobile dates and explicit TSS component units in %s", async (language) => {
  state.weeks = ["8/31", "9/7", "9/14", "9/21", "9/28", "10/5"].map(week => ({
    week, distance: 188, time: 7.1, rides: 3, elevation: 2140, tss: 561, tssEstimated: false, tssUnknownCount: 0,
    loadEvidence: { basisTotals: { power: 347, heartRate: 0, time: 0, unknown: 214 } } as WeeklyLoadEvidence,
  }));
  i18n.addResourceBundle("en", "dashboard", enDashboard);
  const { container } = renderWithProviders(<Routes><Route path="/records/studio/:section" element={<CreatorHubPage />} /></Routes>, { authenticated: true, route: "/records/studio/share" });
  await screen.findAllByTestId("creator-distance-bar");
  await act(async () => { await i18n.changeLanguage(language); });
  const bars = screen.getAllByTestId("creator-distance-bar");
  expect(bars).toHaveLength(6);
  expect(Array.from(container.querySelectorAll('.creator-week-tick[data-mobile-tick="true"]')).map(tick => tick.textContent)).toEqual(["8/31", "9/14", "10/5"]);
  expect(Array.from(container.querySelectorAll(".creator-week-tick")).map(tick => tick.textContent)).toEqual(["8/31", "9/7", "9/14", "9/21", "9/28", "10/5"]);
  expect(bars[5]?.closest("button")).toHaveAccessibleName(/10\/5/);
  fireEvent.click(bars[5]!.closest("button")!);
  const body = screen.getByRole("tooltip").querySelector(".ds-tooltip-content__body");
  expect(body?.textContent?.split("\n")).toEqual(language === "ko" ? [
    "이동거리 188.0 km", "활동시간 7.1 h", "TSS 561점", "파워 기반 TSS 347점", "산출 기준 미상 TSS 214점",
  ] : ["Distance 188.0 km", "Activity time 7.1 h", "TSS 561 pts", "Power-based TSS 347 pts", "Unknown-basis TSS 214 pts"]);
});

it("shows an honest empty state for a signed-in rider without synthetic chart totals", async () => {
  state.empty = true;
  const { container } = renderWithProviders(<Routes><Route path="/records/studio/:section" element={<CreatorHubPage />} /></Routes>, { authenticated: true, route: "/records/studio/share" });
  await screen.findByText("아직 차트로 표시할 활동이 없습니다.");
  expect(container.textContent).not.toContain("데모 데이터");
  expect(screen.getByRole("button", { name: "차트 카드 복사" })).toBeDisabled();
  expect(screen.queryByTestId("creator-distance-bar")).not.toBeInTheDocument();
  state.empty = false;
});
