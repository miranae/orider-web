import { fireEvent, screen, waitFor } from "@testing-library/react";
import { Route, Routes, useLocation } from "react-router-dom";
import { renderWithProviders } from "../__tests__/utils/renderWithProviders";
import { mockCallableInvocations, setCallableImplementation, setCallableResult } from "../__tests__/mocks/firebase";
import CreatorHubPage from "./CreatorHubPage";

vi.mock("../hooks/useActivities", () => ({ useWeeklyStats: () => ({ weeklyStats: [] }) }));
const policy = { version: "provider-model-bound-v2", processor: { name: "Fixture AI", country: "US", privacyPolicyUrl: "https://example.com/privacy" }, purpose: "최근 운동 집계로 개인 일기 생성", dataCategories: ["운동 횟수", "총 거리"], retention: "최신 초안만 저장", dailyLimit: 5 };
const result = { source: "generated", generatedAt: 1, quota: { limit: 5, remaining: 4, reset: 1 }, diary: { title: "PRIVATE TITLE", body: "PRIVATE FATIGUE NOTES", highlights: [], cautions: [] }, shareCard: { title: "공개 하이라이트", body: "4번의 라이딩으로 채운 한 주", footer: "위치 제외", redactions: ["location"] } };
function Destination() { return <pre data-testid="post-state">{JSON.stringify(useLocation().state)}</pre>; }

beforeEach(() => {
  HTMLDialogElement.prototype.showModal = function () { this.setAttribute("open", ""); };
  setCallableResult("getCreatorAiDiaryPolicy", { data: policy });
  setCallableResult("generateAiDiary", { data: result });
});

it("shows the current processor policy and requires explicit consent before generation; posts only the public highlight", async () => {
  renderWithProviders(<Routes><Route path="/explore/recipes/:section" element={<CreatorHubPage />} /><Route path="/ko/explore/recipes/:section" element={<CreatorHubPage />} /><Route path="/ko/community/board/write" element={<Destination />} /></Routes>, { authenticated: true, route: "/explore/recipes/share" });
  fireEvent.click(screen.getByTestId("E6-1-3"));
  expect(await screen.findByRole("dialog")).toHaveTextContent("Fixture AI");
  expect(screen.getByRole("dialog")).toHaveTextContent("최신 초안만 저장");
  expect(mockCallableInvocations.filter((call) => call.name === "generateAiDiary")).toHaveLength(0);
  fireEvent.click(screen.getByRole("button", { name: "동의하고 생성" }));
  await waitFor(() => expect(mockCallableInvocations).toContainEqual({ name: "generateAiDiary", data: { lang: "ko", period: "week", consentVersion: policy.version } }));
  expect(await screen.findByText("PRIVATE FATIGUE NOTES")).toBeInTheDocument();
  fireEvent.click(screen.getByRole("link", { name: "게시글로 공유" }));
  const state = await screen.findByTestId("post-state");
  expect(state).toHaveTextContent("공개 하이라이트");
  expect(state).toHaveTextContent("4번의 라이딩으로 채운 한 주");
  expect(state).not.toHaveTextContent("PRIVATE");
});

it("cancelling external AI consent performs no generation", async () => {
  renderWithProviders(<Routes><Route path="/creator/:section" element={<CreatorHubPage />} /></Routes>, { authenticated: true, route: "/creator/share" });
  fireEvent.click(screen.getByTestId("E6-1-3"));
  await screen.findByRole("dialog");
  fireEvent.click(screen.getByRole("button", { name: "취소" }));
  expect(screen.queryByRole("dialog")).not.toBeInTheDocument();
  expect(mockCallableInvocations.some((call) => call.name === "generateAiDiary")).toBe(false);
});


it("guides a rider with no eligible activity to record or import instead of waiting for quota reset", async () => {
  setCallableImplementation("generateAiDiary", () => { throw Object.assign(new Error("No rides"), { details: { reason: "no-activities" } }); });
  renderWithProviders(<Routes><Route path="/creator/:section" element={<CreatorHubPage />} /></Routes>, { authenticated: true, route: "/creator/share" });
  fireEvent.click(screen.getByTestId("E6-1-3"));
  await screen.findByRole("dialog");
  fireEvent.click(screen.getByRole("button", { name: "동의하고 생성" }));
  const message = await screen.findByRole("alert");
  expect(message).toHaveTextContent("활동을 기록하거나 가져온 뒤");
  expect(message).not.toHaveTextContent("초기화");
});
