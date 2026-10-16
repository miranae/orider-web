import { act, fireEvent, screen, waitFor, within } from "@testing-library/react";
import { Route, Routes, useNavigate } from "react-router-dom";
import { beforeEach, describe, expect, it, vi } from "vitest";
import { setCollectionDocs, setDocData, setCallableImplementation, mockCallableInvocations, simulateLogout } from "../../__tests__/mocks/firebase";
import { renderWithProviders } from "../../__tests__/utils/renderWithProviders";
import { ensureAppCheckReady } from "../../services/firebase";
import GroupRidePage from "./GroupRidePage";

const { comparison, elevation, publicProfiles } = vi.hoisted(() => ({ comparison: vi.fn(), elevation: vi.fn(), publicProfiles: vi.fn() }));
vi.mock("../../services/publicProfiles", () => ({ getPublicUserProfiles: publicProfiles }));
beforeEach(() => {
  publicProfiles.mockReset().mockResolvedValue(new Map());
  vi.mocked(ensureAppCheckReady).mockReset().mockResolvedValue(undefined);
});
vi.mock("../../hooks/useGroup", () => ({ useGroup: () => ({ group: { toggles: { ridePhotos: false } } }) }));
vi.mock("../../components/ComparisonChart", () => ({ default: (props: unknown) => { comparison(props); return <div />; } }));
vi.mock("../../components/ElevationChart", () => ({ default: (props: unknown) => { elevation(props); return null; } }));
vi.mock("../../utils/mapbox", () => ({ getMapboxToken: () => "test-token", MAP_STYLE: "", applyKoreaCyclingStyle: vi.fn() }));
vi.mock("react-map-gl/mapbox", () => ({ default: ({ children }: { children: React.ReactNode }) => <div>{children}</div>, Source: () => null, Layer: () => null, Marker: () => <div data-testid="hover-marker" /> }));

function RideWithExit() {
  const navigate = useNavigate();
  return <><button onClick={() => navigate("/ko/elsewhere")}>다른 화면</button><GroupRidePage /></>;
}

function activity(id: string, power: number | null, fallback: number | null, type: string = "Ride") {
  return { id, userId: id, nickname: id, type, source: "manual", startTime: 1792105200000, summary: { distance: 10000, ridingTimeMillis: 3600000, averageSpeed: 10, averagePower: power, averageHeartRate: null, averageCadence: null }, avgPower: fallback };
}

describe("club ride metric presentation", () => {
  it("counts distinct valid riders separately from records and distinguishes one rider's activities", async () => {
    setCollectionDocs("activities", [
      { ...activity("one", null, null), userId: "same-private-id", nickname: "같은 사람", summary: { ...activity("one", null, null).summary, distance: 69700 } },
      { ...activity("two", null, null), userId: "same-private-id", nickname: "같은 사람", summary: { ...activity("two", null, null).summary, distance: 52400 } },
      { ...activity("three", null, null), userId: "second-private-id", nickname: "다른 사람" },
      { ...activity("four", null, null), userId: "third-private-id", nickname: "또 다른 사람" },
    ]);
    renderWithProviders(<Routes><Route path="/:lang/club/:groupId/rides/:rideId" element={<GroupRidePage />} /></Routes>, { route: "/ko/club/club/rides/ride", authenticated: true });
    expect(await screen.findByText("활동 기록 4개 · 참가자 3명")).toBeInTheDocument();
    expect(screen.getByRole("button", { name: "같은 사람 · 69.7 km 숨기기" })).toBeInTheDocument();
    fireEvent.click(screen.getByRole("button", { name: "같은 사람 · 52.4 km 숨기기" }));
    expect(screen.getByRole("button", { name: "같은 사람 · 52.4 km 표시" })).toBeInTheDocument();
    expect(screen.getByText("활동 기록 4개 · 참가자 3명")).toBeInTheDocument();
    expect(screen.queryByText("same-private-id")).not.toBeInTheDocument();
  });
  it("does not count a missing user ID as an additional participant", async () => {
    setCollectionDocs("activities", [{ ...activity("known", null, null), nickname: "알려진 사람" }, { ...activity("unknown", null, null), userId: " ", nickname: "기록 보유자" }]);
    renderWithProviders(<Routes><Route path="/:lang/club/:groupId/rides/:rideId" element={<GroupRidePage />} /></Routes>, { route: "/ko/club/club/rides/ride", authenticated: true });
    expect(await screen.findByText("활동 기록 2개 · 참가자 1명")).toBeInTheDocument();
  });
  it("shows a fallback immediately and hydrates missing public names without cancelling pending streams", async () => {
    setCollectionDocs("activities", [{ ...activity("missing", null, null), nickname: " ", source: "strava", stravaActivityId: "missing" }]);
    let resolveProfiles!: (value: Map<string, { nickname: string }>) => void;
    publicProfiles.mockReturnValue(new Promise(resolve => { resolveProfiles = resolve; }));
    let resolveReady!: () => void;
    vi.mocked(ensureAppCheckReady).mockReturnValue(new Promise(resolve => { resolveReady = resolve; }));
    setCallableImplementation("stravaGetActivityStreams", () => ({ data: { distance: [0, 1000], altitude: [10, 20] } }));
    mockCallableInvocations.length = 0;
    renderWithProviders(<Routes><Route path="/:lang/club/:groupId/rides/:rideId" element={<GroupRidePage />} /></Routes>, { route: "/ko/club/club/rides/ride", authenticated: true });
    expect(await screen.findByRole("button", { name: "참가자 1 숨기기" })).toBeInTheDocument();
    expect(screen.getByTestId("C2R-3")).toBeInTheDocument();
    expect(mockCallableInvocations.filter(call => call.name === "stravaGetActivityStreams")).toHaveLength(0);
    await act(async () => { resolveProfiles(new Map([["missing", { nickname: "공개 이름" }]])); });
    expect(screen.getByRole("button", { name: "공개 이름 숨기기" })).toBeInTheDocument();
    expect(publicProfiles).toHaveBeenCalledExactlyOnceWith(["missing"]);
    await act(async () => { resolveReady(); });
    expect(await screen.findByTestId("C2R-2")).toBeInTheDocument();
    expect(mockCallableInvocations.filter(call => call.name === "stravaGetActivityStreams")).toHaveLength(1);
  });
  it("keeps participant names nonblank and summaries available when profiles fail", async () => {
    setCollectionDocs("activities", [{ ...activity("missing", null, null), nickname: "" }]);
    publicProfiles.mockRejectedValue(Object.assign(new Error("denied"), { code: "permission-denied" }));
    renderWithProviders(<Routes><Route path="/:lang/club/:groupId/rides/:rideId" element={<GroupRidePage />} /></Routes>, { route: "/ko/club/club/rides/ride", authenticated: true });
    expect(await screen.findByRole("button", { name: "참가자 1 숨기기" })).toBeInTheDocument();
    expect(within(screen.getByTestId("C2R-3")).getByText("참가자 1")).toBeInTheDocument();
  });
  it("does not dispatch a pending Strava stream after leaving its route", async () => {
    setCollectionDocs("activities", [{ ...activity("stream", null, null), source: "strava", stravaActivityId: "stream" }]);
    let resolveReady!: () => void;
    vi.mocked(ensureAppCheckReady).mockReturnValue(new Promise(resolve => { resolveReady = resolve; }));
    mockCallableInvocations.length = 0;
    renderWithProviders(<Routes><Route path="/:lang/club/:groupId/rides/:rideId" element={<RideWithExit />} /><Route path="/:lang/elsewhere" element={<div>다음 화면</div>} /></Routes>, { route: "/ko/club/club/rides/ride", authenticated: true });
    await waitFor(() => expect(ensureAppCheckReady).toHaveBeenCalledOnce());
    fireEvent.click(screen.getByRole("button", { name: "다른 화면" }));
    await act(async () => { resolveReady(); });
    expect(screen.getByText("다음 화면")).toBeInTheDocument();
    expect(mockCallableInvocations.filter(call => call.name === "stravaGetActivityStreams")).toHaveLength(0);
  });
  it.each(["unmount", "account"])("does not dispatch a pending Strava stream after %s changes", async change => {
    setCollectionDocs("activities", [{ ...activity("stream", null, null), source: "strava", stravaActivityId: "stream" }]);
    let resolveReady!: () => void;
    vi.mocked(ensureAppCheckReady).mockReturnValue(new Promise(resolve => { resolveReady = resolve; }));
    mockCallableInvocations.length = 0;
    const view = renderWithProviders(<Routes><Route path="/:lang/club/:groupId/rides/:rideId" element={<GroupRidePage />} /></Routes>, { route: "/ko/club/club/rides/ride", authenticated: true });
    await waitFor(() => expect(ensureAppCheckReady).toHaveBeenCalledOnce());
    if (change === "unmount") view.unmount(); else simulateLogout();
    await act(async () => { resolveReady(); });
    expect(mockCallableInvocations.filter(call => call.name === "stravaGetActivityStreams")).toHaveLength(0);
  });
  it("does not use another rider's GPS index when the elevation base has no GPS", async () => {
    setCollectionDocs("activities", ["base", "gps"].map(id => ({ ...activity(id, null, null), source: "orider" })));
    setDocData("activity_streams/base", { distance: [0, 1000], altitude: [10, 20] });
    setDocData("activity_streams/gps", { distance: [0, 500, 2000], altitude: [30, 40, 50], latlng: [[37, 127], [37.1, 127.1], [37.2, 127.2]] });
    elevation.mockClear();
    renderWithProviders(<Routes><Route path="/:lang/club/:groupId/rides/:rideId" element={<GroupRidePage />} /></Routes>, { route: "/ko/club/club/rides/ride", authenticated: true });
    await waitFor(() => expect(elevation.mock.lastCall?.[0].overlays?.length).toBe(1));
    act(() => elevation.mock.lastCall?.[0].onHoverIndex(1));
    expect(screen.queryByTestId("hover-marker")).not.toBeInTheDocument();
  });
  it("omits another rider's sensor channel when that stream has no distance axis", async () => {
    setCollectionDocs("activities", ["base", "sensor"].map(id => ({ ...activity(id, null, null), source: "orider" })));
    setDocData("activity_streams/base", { distance: [0, 1000], altitude: [10, 20] });
    setDocData("activity_streams/sensor", { watts: [100, 200], altitude: [10, 20] });
    renderWithProviders(<Routes><Route path="/:lang/club/:groupId/rides/:rideId" element={<GroupRidePage />} /></Routes>, { route: "/ko/club/club/rides/ride", authenticated: true });
    await screen.findByTestId("C2R-2");
    await waitFor(() => expect(screen.queryByRole("status")).not.toBeInTheDocument());
    expect(screen.queryByRole("button", { name: "운동파워" })).not.toBeInTheDocument();
  });
  it("retains summaries and successful streams while explicitly retrying only failed streams", async () => {
    const requests: string[] = [];
    setCollectionDocs("activities", ["good", "failed"].map(id => ({ ...activity(id, null, null), source: "strava", stravaActivityId: id })));
    setCallableImplementation("stravaGetActivityStreams", request => {
      const id = (request as { stravaActivityId: string }).stravaActivityId;
      requests.push(id);
      if (id === "failed" && requests.filter(value => value === id).length === 1) throw new Error("offline");
      return { data: { distance: [0, 1000], altitude: [10, 20] } };
    });
    renderWithProviders(<Routes><Route path="/:lang/club/:groupId/rides/:rideId" element={<GroupRidePage />} /></Routes>, { route: "/ko/club/club/rides/ride", authenticated: true });
    expect(await screen.findByRole("alert")).toHaveTextContent("활동 요약은 계속 볼 수 있습니다.");
    expect(screen.getByTestId("C2R-3")).toBeInTheDocument();
    expect(screen.getByTestId("C2R-2")).toBeInTheDocument();
    fireEvent.click(screen.getByRole("button", { name: "다시 시도" }));
    await waitFor(() => expect(screen.queryByRole("alert")).not.toBeInTheDocument());
    expect(requests).toEqual(["good", "failed", "failed"]);
    expect(screen.getByTestId("C2R-3")).toBeInTheDocument();
  });
  it("passes each rider's own elevation distances without truncating different sample counts", async () => {
    setCollectionDocs("activities", ["first", "second"].map(id => ({ ...activity(id, null, null), source: "orider" })));
    setDocData("activity_streams/first", { distance: [0, 1000], altitude: [10, 20] });
    setDocData("activity_streams/second", { distance: [0, 500, 2000], altitude: [30, 40, 50] });
    elevation.mockClear();
    renderWithProviders(<Routes><Route path="/:lang/club/:groupId/rides/:rideId" element={<GroupRidePage />} /></Routes>, { route: "/ko/club/club/rides/ride", authenticated: true });
    await waitFor(() => expect(elevation.mock.calls.map(call => call[0]).some(props =>
      props.overlays?.some((overlay: { distance?: number[] }) => overlay.distance?.join() === "0,500,2000"))).toBe(true));
  });
  it.each(["Ride", "Run"])("uses the same summary/fallback power in %s charts and comparison tables", async type => {
    setCollectionDocs("activities", [activity("Fallback rider", null, 237, type), activity("Missing rider", null, null, type)]);
    comparison.mockClear();
    renderWithProviders(<Routes><Route path="/:lang/club/:groupId/rides/:rideId" element={<GroupRidePage />} /></Routes>, { route: "/ko/club/club/rides/ride", authenticated: true });
    const table = await screen.findByTestId("C2R-3-1");
    const row = within(table).getByRole("row", { name: /Fallback rider/ });
    expect(within(row).getByText("237")).toBeInTheDocument();
    expect(within(table).getByRole("columnheader", { name: type === "Run" ? "러닝 파워 (W)" : "평균파워 (W)" })).toBeInTheDocument();
    await waitFor(() => {
      const power = comparison.mock.calls.map(call => call[0]).find(props => props.unit === " W");
      expect(power.datasets[0].data).toEqual([237]);
      expect(power.datasets[1].data).toEqual([null]);
      expect(power.labels).toEqual([type === "Run" ? "러닝 파워" : "평균파워"]);
    });
    expect(screen.getByRole("columnheader", { name: "평균속도 (km/h)" })).toBeInTheDocument();
    expect(within(table).getByRole("columnheader", { name: "평균심박수 (bpm)" })).toBeInTheDocument();
  });
});
