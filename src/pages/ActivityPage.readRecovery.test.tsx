import { fireEvent, screen, waitFor } from "@testing-library/react";
import { expect, it, vi } from "vitest";
import { getDoc } from "firebase/firestore";
import { auth } from "../services/firebase";
import { getCurrentUser, setCallableImplementation, setCallableResult, mockCallableInvocations } from "../__tests__/mocks/firebase";
import { createMockActivity } from "../__tests__/fixtures/mockData";
import { renderWithProviders } from "../__tests__/utils/renderWithProviders";
import ActivityPage from "./ActivityPage";
import { resetRuntimeConfigForTests } from "../services/runtimeConfig";
vi.mock("../components/AnalysisTab", () => ({ default: ({ serverMetrics }: { serverMetrics: { metrics: { avgPower: number } | null } }) => <p>saved watts {serverMetrics.metrics?.avgPower}</p>, AnalysisLapTable: () => null }));
vi.mock("../hooks/useFitnessTimeseries", () => ({ useFitnessTimeseries: () => ({ timeseries: null, loaded: true }) }));
vi.mock("../hooks/usePdc", () => ({ usePdc: () => ({ status: "missing", pdc: null }) }));
vi.mock("../components/RouteMap", () => ({ default: () => <div /> }));
vi.mock("../components/ElevationChart", () => ({ default: () => <div /> }));
vi.mock("../components/activity/AiRideAnalysisCard", () => ({ default: () => <div /> }));
vi.mock("chart.js", async () => (await import("../__tests__/fixtures/activityChartRegistryMock")).activityChartRegistryMock);
vi.mock("react-router-dom", async importOriginal => ({ ...await importOriginal<typeof import("react-router-dom")>(), useParams: () => ({ activityId: "test-activity" }) }));
  it("recovers transient raw activity failure through the ACL detail without rereading raw activity", async () => {
    resetRuntimeConfigForTests({ publicActivityDetailEnabled: false });
    const original = vi.mocked(getDoc).getMockImplementation()!;
    vi.mocked(getDoc).mockImplementation((...args) => {
      if ((args[0] as { path?: string }).path === "activities/test-activity") return Promise.reject({ code: "unavailable" });
      return original(...args);
    });
    const activity = createMockActivity({ id: "test-activity", userId: "test-uid", description: "보존된 대체 조회 활동" });
    setCallableResult("getActivityPublicDetail", { data: { activity, viewerHasKudos: false, metrics: { version: 1, avgPower: 222 }, content: { activityId: activity.id, status: "ready", comments: [], photos: [] } } });
    try {
      renderWithProviders(<ActivityPage />, { authenticated: true });
      // The global SDK mock clones auth observer users; this case models real Firebase identity.
      Object.assign(auth, { currentUser: getCurrentUser() });
      await waitFor(() => expect(mockCallableInvocations.filter(call => call.name === "getActivityPublicDetail")).toHaveLength(1));
      await screen.findByRole("tab", { name: "분석" });
      expect(screen.getByText("보존된 대체 조회 활동")).toBeInTheDocument();
      fireEvent.click(screen.getByRole("tab", { name: "분석" }));
      expect(screen.getByRole("button", { name: "분석 상태 확인" })).toBeInTheDocument();
      expect(screen.getByText("saved watts 222")).toBeInTheDocument();
      const revisionId = "a".repeat(64);
      setCallableImplementation("getActivityAnalysisHistory", input => ({ data: { items: [{ revisionId, calculatedAt: 1000, calculatorVersion: 1 }], nextCursor: null,
        selected: (input as { revisionId?: string }).revisionId ? { revisionId, metrics: { version: 1, avgPower: 111 } } : null } }));
      fireEvent.click(screen.getByRole("button", { name: "이전 분석 보기" }));
      fireEvent.click(await screen.findByRole("button", { name: /버전 1 ·/ }));
      await screen.findByText("saved watts 111");
      fireEvent.click(screen.getByRole("button", { name: "현재 분석으로 돌아가기" }));
      await screen.findByText("saved watts 222");
      expect(mockCallableInvocations.filter(call => call.name === "getActivityPublicDetail")).toHaveLength(1);
      expect(mockCallableInvocations.filter(call => /requestActivityReanalysis|refreshActivity/.test(call.name))).toHaveLength(0);
    } finally { vi.mocked(getDoc).mockImplementation(original); Object.assign(auth, { currentUser: undefined }); }
  });

