import { fireEvent, screen, waitFor } from "@testing-library/react";
import { renderWithProviders } from "../__tests__/utils/renderWithProviders";
import { Route, Routes } from "react-router-dom";
import CreatorHubPage from "./CreatorHubPage";

const state = vi.hoisted(() => ({ tss: null as number | null, estimated: false, unknown: 1 }));
vi.mock("../hooks/useActivities", () => ({ useWeeklyStats: () => ({ weeklyStats: [
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
  const { container } = renderWithProviders(<Routes><Route path="/creator/:section" element={<CreatorHubPage />} /></Routes>, { authenticated: true, route: "/creator/share" });
  await waitFor(() => expect(container.textContent).toContain(label));
  expect(container.textContent).toContain(qualifier);
  expect(container.textContent).toContain("12km");
  expect(container.textContent).toContain("1.5h");
  const bar = screen.getByTestId(tss === null ? "creator-tss-unknown" : "creator-tss-bar");
  expect(bar.parentElement?.parentElement?.title).toContain(label);
  expect(bar.parentElement?.parentElement?.title).toContain(qualifier);
  if (tss === null) expect(bar).toHaveStyle({ opacity: "0.35", height: "132px" });
  if (tss === 0) expect(bar).toHaveStyle({ height: "0px" });
  fireEvent.click(screen.getByRole("button", { name: "차트 카드 복사" }));
  await waitFor(() => expect(writeText).toHaveBeenCalled());
  expect(writeText.mock.calls[0]?.[0]).toContain(label);
  expect(writeText.mock.calls[0]?.[0]).toContain(qualifier);
  expect(writeText.mock.calls[0]?.[0]).toContain("12km");
  expect(writeText.mock.calls[0]?.[0]).toContain("1.5h");
});
