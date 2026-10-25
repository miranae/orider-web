import { mockCollectionData } from "../../__tests__/mocks/firebase";
import { act, fireEvent, screen, waitFor, within } from "@testing-library/react";
import { Route, Routes, useNavigate } from "react-router-dom";
import i18n from "i18next";
import enGroup from "../../i18n/resources/en/group.json";
import { beforeEach, describe, expect, it, vi } from "vitest";
import { setCollectionDocs, setDocData, setCallableImplementation, mockCallableInvocations, simulateLogout, simulateLogin, getCurrentUser } from "../../__tests__/mocks/firebase";
import { renderWithProviders } from "../../__tests__/utils/renderWithProviders";
import { ensureAppCheckReady } from "../../services/firebase";
import GroupRidePage from "./GroupRidePage";
import { useTheme } from "../../contexts/ThemeContext";
import { FUNCTIONAL_COLORS } from "../../theme/generated";
import { getComparisonSeriesColors } from "../../theme/charts/comparisonSeriesColors";

const { comparison, elevation, publicProfiles, streamsApi } = vi.hoisted(() => ({ comparison: vi.fn(), elevation: vi.fn(), publicProfiles: vi.fn(), streamsApi: vi.fn() }));
vi.mock("../../services/personalDataApi", () => ({ getActivityStreams: streamsApi }));
vi.mock("../../services/publicProfiles", () => ({ getPublicUserProfiles: publicProfiles }));
beforeEach(() => {
  publicProfiles.mockReset().mockResolvedValue(new Map());
  streamsApi.mockReset();
  vi.mocked(ensureAppCheckReady).mockReset().mockResolvedValue(undefined);
});
vi.mock("../../hooks/useGroup", () => ({ useGroup: () => ({ group: { toggles: { ridePhotos: false } } }) }));
vi.mock("../../components/ComparisonChart", () => ({ default: (props: unknown) => { comparison(props); return <div />; } }));
vi.mock("./GroupRidePerformanceChart", () => ({ default: (props: { beforePlot?: React.ReactNode }) => { elevation(props); return <>{props.beforePlot}</>; } }));
vi.mock("../../utils/mapbox", () => ({ getMapboxToken: () => "test-token", MAP_STYLE: "", applyKoreaCyclingStyle: vi.fn() }));
vi.mock("react-map-gl/mapbox", () => ({ default: ({ children }: { children: React.ReactNode }) => <div>{children}</div>, Source: ({ children, data }: { children: React.ReactNode; data: unknown }) => <div data-testid="route-source" data-geometry={JSON.stringify(data)}>{children}</div>, Layer: ({ id, paint }: { id: string; paint: Record<string, string> }) => <div data-testid={`layer-${id}`} data-color={paint["line-color"]} data-width={paint["line-width"]} data-opacity={paint["line-opacity"]} />, Marker: ({ longitude, latitude }: { longitude: number; latitude: number }) => <div data-testid="hover-marker" data-longitude={longitude} data-latitude={latitude} /> }));

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
    expect(screen.getByTestId("club-ride-detail-scope")).toHaveTextContent("회원 외 동행자와 본인의 연결 활동");
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
    expect(screen.getByTestId("ride-chart-inspection")).toBeInTheDocument();
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
    expect(within(screen.getByTestId("ride-chart-inspection")).getByText("참가자 1")).toBeInTheDocument();
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
    const requestUsers: Array<string | undefined> = [];
    setCallableImplementation("stravaGetActivityStreams", () => { requestUsers.push(getCurrentUser()?.uid); return { data: { distance: [0, 1000], altitude: [10, 20] } }; });
    vi.mocked(ensureAppCheckReady).mockReturnValue(new Promise(resolve => { resolveReady = resolve; }));
    mockCallableInvocations.length = 0;
    const view = renderWithProviders(<Routes><Route path="/:lang/club/:groupId/rides/:rideId" element={<GroupRidePage />} /></Routes>, { route: "/ko/club/club/rides/ride", authenticated: true });
    await waitFor(() => expect(ensureAppCheckReady).toHaveBeenCalledOnce());
    if (change === "unmount") view.unmount(); else simulateLogout();
    await act(async () => { resolveReady(); });
    expect(requestUsers).not.toContain("test-uid");
    expect(requestUsers).toHaveLength(change === "unmount" ? 0 : 1);
  });
  it("does not use another rider's GPS index when the elevation base has no GPS", async () => {
    setCollectionDocs("activities", ["base", "gps"].map(id => ({ ...activity(id, null, null), source: "orider" })));
    setDocData("activity_streams/base", { distance: [0, 1000], altitude: [10, 20] });
    setDocData("activity_streams/gps", { distance: [0, 500, 2000], altitude: [30, 40, 50], latlng: [[37, 127], [37.1, 127.1], [37.2, 127.2]] });
    elevation.mockClear();
    renderWithProviders(<Routes><Route path="/:lang/club/:groupId/rides/:rideId" element={<GroupRidePage />} /></Routes>, { route: "/ko/club/club/rides/ride", authenticated: true });
    await waitFor(() => expect(elevation.mock.lastCall?.[0].overlays?.filter((overlay: { yAxisID: string }) => overlay.yAxisID === "yElev").length).toBe(1));
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
    expect(await screen.findByRole("alert")).toHaveTextContent("개별 활동은 아래 표의 이름에서 확인할 수 있습니다.");
    expect(screen.getByTestId("ride-chart-inspection")).toBeInTheDocument();
    expect(screen.getByTestId("C2R-2")).toBeInTheDocument();
    fireEvent.click(screen.getByRole("button", { name: "다시 시도" }));
    await waitFor(() => expect(screen.queryByRole("alert")).not.toBeInTheDocument());
    expect(requests).toEqual(["good", "failed", "failed"]);
    expect(screen.getByTestId("ride-chart-inspection")).toBeInTheDocument();
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
  it.each(["Ride", "Run"])("keeps activity navigation without substituting summary values for missing %s streams", async type => {
    setCollectionDocs("activities", [activity("Fallback rider", null, 237, type), activity("Missing rider", null, null, type)]);
    renderWithProviders(<Routes><Route path="/:lang/club/:groupId/rides/:rideId" element={<GroupRidePage />} /></Routes>, { route: "/ko/club/club/rides/ride", authenticated: true });
    const panel = await screen.findByTestId("ride-chart-inspection");
    expect(within(panel).getByRole("link", { name: "Fallback rider" })).toHaveAttribute("href", "/ko/activity/Fallback rider");
    expect(panel).not.toHaveTextContent("237");
    expect(within(panel).getByRole("row", { name: /Missing rider/ })).toHaveTextContent("평균 —");
    expect(screen.getAllByRole("table")).toHaveLength(1);
    expect(screen.queryByTestId("C2R-3")).not.toBeInTheDocument();
  });
  it("applies the record selection to the only table and keeps its empty structure mounted", async () => {
    setCollectionDocs("activities", [activity("Zero rider", 0, 250), activity("Missing rider", null, null)]);
    renderWithProviders(<Routes><Route path="/:lang/club/:groupId/rides/:rideId" element={<GroupRidePage />} /></Routes>, { route: "/ko/club/club/rides/ride", authenticated: true });
    const panel = await screen.findByTestId("ride-chart-inspection");
    const table = within(panel).getByRole("table");
    for (const button of screen.getAllByTestId("C2R-0-1")) fireEvent.click(button);
    expect(screen.getByRole("status")).toHaveTextContent("표시할 기록을 선택하세요");
    expect(screen.queryByTestId("ride-range-context")).not.toBeInTheDocument();
    expect(panel).not.toHaveTextContent(i18n.t("group:ridePage.chart.selectSample"));
    expect(screen.queryByText(i18n.t("group:ridePage.chart.inspectHint"))).not.toBeInTheDocument();
    expect(within(panel).getByRole("table")).toHaveAccessibleName(i18n.t("group:ridePage.chart.pointTitle"));
    expect(within(table).getAllByRole("row")).toHaveLength(3);
    expect(within(table).getAllByRole("checkbox")).toHaveLength(2);
    for (const checkbox of within(table).getAllByRole("checkbox")) expect(checkbox).not.toBeChecked();
    fireEvent.click(within(table).getByRole("checkbox", { name: "Zero rider 표시" }));
    expect(within(table).getByRole("checkbox", { name: "Zero rider 표시" })).toBeChecked();
    expect(screen.getByRole("button", { name: "Zero rider 숨기기" })).toHaveAttribute("aria-pressed", "true");
    expect(within(panel).getByRole("table")).toBe(table);
  });
  it("distinguishes equal-distance records by the same rider everywhere", async () => {
    setCollectionDocs("activities", ["one", "two"].map(id => ({ ...activity(id, null, null), userId: "same", nickname: "Same rider" })));
    renderWithProviders(<Routes><Route path="/:lang/club/:groupId/rides/:rideId" element={<GroupRidePage />} /></Routes>, { route: "/ko/club/club/rides/ride", authenticated: true });
    expect(await screen.findByRole("button", { name: "Same rider · 10.0 km · 기록 1 숨기기" })).toBeInTheDocument();
    expect(screen.getByRole("link", { name: "Same rider · 10.0 km · 기록 2" })).toHaveAttribute("href", "/ko/activity/two");
  });

  it("skips empty or invalid elevation records when choosing the chart and map reference", async () => {
    setCollectionDocs("activities", ["empty", "invalid", "valid"].map(id => ({ ...activity(id, null, null), source: "orider" })));
    setDocData("activity_streams/empty", { distance: [0, 1000], altitude: [] });
    setDocData("activity_streams/invalid", { distance: [0, 1000], altitude: [NaN, Infinity] });
    setDocData("activity_streams/valid", { distance: [0, 1000], altitude: [0, 20], latlng: [[37, 127], [38, 128]] });
    elevation.mockClear();
    renderWithProviders(<Routes><Route path="/:lang/club/:groupId/rides/:rideId" element={<GroupRidePage />} /></Routes>, { route: "/ko/club/club/rides/ride", authenticated: true });
    await waitFor(() => expect(elevation.mock.lastCall?.[0].baseLabel).toBe("valid 고도"));
    expect(elevation.mock.lastCall?.[0].data).toEqual([{ distance: 0, elevation: 0 }, { distance: 1000, elevation: 20 }]);
    act(() => elevation.mock.lastCall?.[0].onHoverIndex(1));
    expect(screen.getByTestId("hover-marker")).toHaveAttribute("data-latitude", "38");
    expect(screen.getByTestId("hover-marker")).toHaveAttribute("data-longitude", "128");
  });
  it("omits incomplete elevation pairs without synthesizing zero and retains original GPS indices", async () => {
    setCollectionDocs("activities", [{ ...activity("sparse", null, null), source: "orider" }]);
    setDocData("activity_streams/sparse", { distance: [0, NaN, 1000, 2000, Infinity, 3000], altitude: [0, 99, 20], latlng: [[37, 127], [37.1, 127.1], [38, 128], [39, 129]] });
    elevation.mockClear();
    renderWithProviders(<Routes><Route path="/:lang/club/:groupId/rides/:rideId" element={<GroupRidePage />} /></Routes>, { route: "/ko/club/club/rides/ride", authenticated: true });
    await waitFor(() => expect(elevation.mock.lastCall?.[0].data).toEqual([{ distance: 0, elevation: 0 }, { distance: 1000, elevation: 20 }]));
    act(() => elevation.mock.lastCall?.[0].onHoverIndex(1));
    expect(screen.getByTestId("hover-marker")).toHaveAttribute("data-latitude", "38");
    expect(screen.getByTestId("hover-marker")).toHaveAttribute("data-longitude", "128");
    expect(screen.getByTestId("ride-chart-inspection")).toHaveTextContent("1.00");
  });
  it("keeps summaries and shows the missing-elevation state when no finite pair exists", async () => {
    setCollectionDocs("activities", [{ ...activity("empty", null, null), source: "orider" }]);
    setDocData("activity_streams/empty", { distance: [0, 1000], altitude: [] });
    renderWithProviders(<Routes><Route path="/:lang/club/:groupId/rides/:rideId" element={<GroupRidePage />} /></Routes>, { route: "/ko/club/club/rides/ride", authenticated: true });
    await screen.findByTestId("ride-chart-inspection");
    await waitFor(() => expect(screen.queryByRole("status")).not.toBeInTheDocument());
    expect(screen.queryByTestId("C2R-2")).not.toBeInTheDocument();
    expect(screen.getByText("선택한 기록에 거리와 고도가 함께 있는 흐름 데이터가 없습니다.")).toBeInTheDocument();
  });

  it.each(["ko", "en"])("distinguishes failed selected streams, genuine missing data and all-hidden state in %s", async lang => {
    i18n.addResourceBundle("en", "group", enGroup, true, true);
    await i18n.changeLanguage(lang);
    try {
      setCollectionDocs("activities", [{ ...activity("failed", null, null), source: "strava", stravaActivityId: "failed" }, activity("empty", null, null)]);
      setCallableImplementation("stravaGetActivityStreams", () => { throw new Error("offline"); });
      renderWithProviders(<Routes><Route path="/:lang/club/:groupId/rides/:rideId" element={<GroupRidePage />} /></Routes>, { route: `/${lang}/club/club/rides/ride`, authenticated: true });
      await screen.findByRole("alert");
      expect(screen.getByRole("button", { name: i18n.t("group:invite.retry") })).toBeEnabled();
      const noRoute = i18n.t("group:ridePage.noRoute");
      const noElevation = i18n.t("group:ridePage.noElevation");
      expect(screen.queryByText(noRoute)).not.toBeInTheDocument();
      expect(screen.queryByText(noElevation)).not.toBeInTheDocument();
      fireEvent.click(screen.getByRole("button", { name: i18n.t("group:ridePage.hideRider", { name: "failed" }) }));
      expect(screen.getByText(noRoute)).toBeInTheDocument();
      expect(screen.getByText(noElevation)).toBeInTheDocument();
      fireEvent.click(screen.getByRole("button", { name: i18n.t("group:ridePage.hideRider", { name: "empty" }) }));
      expect(screen.getByRole("status")).toHaveTextContent(i18n.t("group:ridePage.noneSelected"));
      expect(screen.getByTestId("ride-chart-inspection")).toBeInTheDocument();
    } finally {
      await i18n.changeLanguage("ko");
    }
  });

  it("loads GCS-backed records through the authenticated stream API using only returned channels", async () => {
    setCollectionDocs("activities", [{ ...activity("gcs", null, null), source: "orider" }]);
    setDocData("activity_streams/gcs", { storage: "gcs", gcsPath: "private/streams/gcs.json" });
    streamsApi.mockResolvedValue({ distance: [0, 1000], altitude: [0, 20] });
    elevation.mockClear();
    renderWithProviders(<Routes><Route path="/:lang/club/:groupId/rides/:rideId" element={<GroupRidePage />} /></Routes>, { route: "/ko/club/club/rides/ride", authenticated: true });
    await waitFor(() => expect(elevation.mock.lastCall?.[0].data).toEqual([{ distance: 0, elevation: 0 }, { distance: 1000, elevation: 20 }]));
    expect(streamsApi).toHaveBeenCalledExactlyOnceWith("gcs");
    expect(screen.queryByRole("button", { name: "운동파워" })).not.toBeInTheDocument();
    expect(screen.queryByRole("button", { name: "운동심박수" })).not.toBeInTheDocument();
    expect(screen.queryByRole("alert")).not.toBeInTheDocument();
  });
  it("surfaces GCS API failures and retries through the same API", async () => {
    setCollectionDocs("activities", [{ ...activity("gcs", null, null), source: "orider" }]);
    setDocData("activity_streams/gcs", { storage: "gcs", gcsPath: "private/streams/gcs.json" });
    streamsApi.mockRejectedValueOnce(new Error("SIGN_IN_REQUIRED")).mockResolvedValue({ distance: [0, 1000], altitude: [0, 20] });
    renderWithProviders(<Routes><Route path="/:lang/club/:groupId/rides/:rideId" element={<GroupRidePage />} /></Routes>, { route: "/ko/club/club/rides/ride", authenticated: true });
    await screen.findByRole("alert");
    expect(screen.queryByText("선택한 기록에 거리와 고도가 함께 있는 흐름 데이터가 없습니다.")).not.toBeInTheDocument();
    fireEvent.click(screen.getByRole("button", { name: "다시 시도" }));
    await screen.findByTestId("C2R-2");
    expect(screen.queryByRole("alert")).not.toBeInTheDocument();
    expect(streamsApi).toHaveBeenCalledTimes(2);
  });
  it.each(["raw", "json"])("preserves legacy %s stream documents without calling the GCS API", async format => {
    const stream = { distance: [0, 1000], altitude: [0, 20] };
    setCollectionDocs("activities", [{ ...activity("legacy", null, null), source: "orider" }]);
    setDocData("activity_streams/legacy", format === "json" ? { json: JSON.stringify(stream) } : stream);
    elevation.mockClear();
    renderWithProviders(<Routes><Route path="/:lang/club/:groupId/rides/:rideId" element={<GroupRidePage />} /></Routes>, { route: "/ko/club/club/rides/ride", authenticated: true });
    await waitFor(() => expect(elevation.mock.lastCall?.[0].data).toEqual([{ distance: 0, elevation: 0 }, { distance: 1000, elevation: 20 }]));
    expect(streamsApi).not.toHaveBeenCalled();
  });
  it.each(["missing", "unsupported"])("surfaces %s stream documents as failures rather than normal empty data", async shape => {
    setCollectionDocs("activities", [{ ...activity("broken", null, null), source: "orider" }]);
    if (shape === "unsupported") setDocData("activity_streams/broken", { storage: "unsupported" });
    renderWithProviders(<Routes><Route path="/:lang/club/:groupId/rides/:rideId" element={<GroupRidePage />} /></Routes>, { route: "/ko/club/club/rides/ride", authenticated: true });
    await screen.findByRole("alert");
    expect(screen.queryByText("선택한 기록에 거리와 고도가 함께 있는 흐름 데이터가 없습니다.")).not.toBeInTheDocument();
    expect(streamsApi).not.toHaveBeenCalled();
  });
  it("does not publish a delayed GCS response after leaving the page", async () => {
    setCollectionDocs("activities", [{ ...activity("gcs", null, null), source: "orider" }]);
    setDocData("activity_streams/gcs", { storage: "gcs", gcsPath: "private/streams/gcs.json" });
    let resolveStream!: (stream: object) => void;
    streamsApi.mockReturnValue(new Promise(resolve => { resolveStream = resolve; }));
    elevation.mockClear();
    const view = renderWithProviders(<Routes><Route path="/:lang/club/:groupId/rides/:rideId" element={<GroupRidePage />} /></Routes>, { route: "/ko/club/club/rides/ride", authenticated: true });
    await waitFor(() => expect(streamsApi).toHaveBeenCalledOnce());
    view.unmount();
    await act(async () => resolveStream({ distance: [0, 1000], altitude: [0, 20] }));
    expect(elevation).not.toHaveBeenCalled();
  });

  it("reschedules streams after anonymous-to-signed-in context changes without leaving loading stuck", async () => {
    setCollectionDocs("activities", [{ ...activity("gcs", null, null), source: "orider" }]);
    setDocData("activity_streams/gcs", { storage: "gcs", gcsPath: "private/streams/gcs.json" });
    streamsApi.mockRejectedValueOnce(new Error("SIGN_IN_REQUIRED")).mockResolvedValue({ distance: [0, 1000], altitude: [0, 20] });
    renderWithProviders(<Routes><Route path="/:lang/club/:groupId/rides/:rideId" element={<GroupRidePage />} /></Routes>, { route: "/ko/club/club/rides/ride", authenticated: false });
    await screen.findByRole("alert");
    await act(async () => simulateLogin({ uid: "signed-in" }));
    await screen.findByTestId("C2R-2");
    expect(screen.queryByRole("status")).not.toBeInTheDocument();
    expect(screen.queryByRole("alert")).not.toBeInTheDocument();
  });

  it("shows the missing-route explanation when all recorded GPS points are invalid", async () => {
    setCollectionDocs("activities", [{ ...activity("invalid-gps", null, null), source: "orider" }]);
    setDocData("activity_streams/invalid-gps", { distance: [0, 100], altitude: [10, 20], latlng: [[0, 0], [NaN, 127]] });
    renderWithProviders(<Routes><Route path="/:lang/club/:groupId/rides/:rideId" element={<GroupRidePage />} /></Routes>, { route: "/ko/club/club/rides/ride", authenticated: true });
    expect(await screen.findByText(i18n.t("group:ridePage.noRoute"))).toBeInTheDocument();
    expect(screen.queryByTestId("C2R-1")).not.toBeInTheDocument();
  });

});


it("updates map, elevation, sensor series and table colors together on theme changes without changing data", async () => {
  function ThemeSwitch() {
    const { setTheme } = useTheme();
    return <><button onClick={() => setTheme("light")}>Light fixture</button><button onClick={() => setTheme("dark")}>Dark fixture</button></>;
  }
  elevation.mockClear();
  setCollectionDocs("activities", ["first", "second"].map(id => ({ ...activity(id, null, null), source: "orider" })));
  for (const id of ["first", "second"]) setDocData(`activity_streams/${id}`, { distance: [0, 1000], altitude: [10, 20], watts: [0, 200], latlng: [[37, 127], [38, 128]] });
  renderWithProviders(<Routes><Route path="/:lang/club/:groupId/rides/:rideId" element={<><ThemeSwitch /><GroupRidePage /></>} /></Routes>, { route: "/ko/club/club/rides/ride", authenticated: true });
  fireEvent.click(screen.getByRole("button", { name: "Light fixture" }));
  await screen.findByTestId("C2R-2");
  const points = elevation.mock.lastCall?.[0].data;
  const checkColors = (mode: "light" | "dark") => {
    const colors = getComparisonSeriesColors(mode);
    expect(screen.getByTestId("layer-route-main-first")).toHaveAttribute("data-color", colors[0]);
    expect(screen.getByTestId("layer-route-main-second")).toHaveAttribute("data-color", colors[1]);
    expect(elevation.mock.lastCall?.[0].baseColor).toBe(colors[0]);
    expect(elevation.mock.lastCall?.[0].overlays.find((overlay: { yAxisID: string }) => overlay.yAxisID === "yElev").color).toBe(colors[1]);
    const powers = elevation.mock.lastCall?.[0].overlays.filter((overlay: { yAxisID: string }) => overlay.yAxisID === "yPower");
    expect(powers.map((overlay: { color: string }) => overlay.color)).toEqual([colors[0], colors[1]]);
    for (const [index, name] of ["first", "second"].entries()) {
      const row = within(screen.getByTestId("ride-chart-inspection")).getByRole("link", { name });
      expect(within(row.closest("tr")!).getByRole("checkbox")).toHaveStyle({ "--ds-checkbox-color": colors[index] });
    }
    expect(elevation.mock.lastCall?.[0].data).toEqual(points);
    for (const id of ["first", "second"]) {
      const casing = screen.queryByTestId(`layer-route-casing-${id}`);
      expect(casing).toHaveAttribute("data-opacity", mode === "light" ? "0" : "0.85");
      {
        expect(casing).toHaveAttribute("data-color", FUNCTIONAL_COLORS.map.routeCasing);
        expect(casing).toHaveAttribute("data-width", "5");
        expect(casing!.compareDocumentPosition(screen.getByTestId(`layer-route-main-${id}`)) & Node.DOCUMENT_POSITION_FOLLOWING).toBeTruthy();
      }
    }
  };
  checkColors("light");
  const stableCasing = screen.getByTestId("layer-route-casing-first");
  fireEvent.click(screen.getByRole("button", { name: "Dark fixture" }));
  await waitFor(() => checkColors("dark"));
  expect(screen.getByTestId("layer-route-casing-first")).toBe(stableCasing);
  act(() => elevation.mock.lastCall?.[0].onViewportChange([0, 0.5], [0, 1]));
  const rangeCasing = await screen.findByTestId("layer-range-casing-first");
  expect(rangeCasing).toHaveAttribute("data-color", FUNCTIONAL_COLORS.map.routeCasing);
  expect(rangeCasing).toHaveAttribute("data-width", "7");
  expect(rangeCasing.compareDocumentPosition(screen.getByTestId("layer-range-main-first")) & Node.DOCUMENT_POSITION_FOLLOWING).toBeTruthy();
  expect(screen.getByTestId("layer-route-casing-first")).toHaveAttribute("data-opacity", "0.2");
  fireEvent.click(screen.getByRole("button", { name: "Light fixture" }));
  await waitFor(() => checkColors("light"));
  expect(screen.getByTestId("layer-route-casing-first")).toBe(stableCasing);
  expect(screen.getByTestId("layer-range-casing-first")).toBe(rangeCasing);
  expect(rangeCasing).toHaveAttribute("data-opacity", "0");
});


it("keeps hidden records selectable in the table and caps only the visible legend, not chart series", async () => {
  setCollectionDocs("activities", Array.from({ length: 6 }, (_, index) => ({ ...activity(`Record ${index + 1}`, null, null), source: "orider" })));
  for (let index = 1; index <= 6; index++) setDocData(`activity_streams/Record ${index}`, { distance: [0, 1000], altitude: [10, 20], watts: [0, 200], latlng: [[37, 127], [38, 128]] });
  renderWithProviders(<Routes><Route path="/:lang/club/:groupId/rides/:rideId" element={<GroupRidePage />} /></Routes>, { route: "/ko/club/club/rides/ride", authenticated: true });
  await screen.findByTestId("C2R-2");
  await waitFor(() => expect(elevation.mock.lastCall?.[0].overlays.filter((overlay: { yAxisID: string }) => overlay.yAxisID === "yPower")).toHaveLength(6));
  const table = within(screen.getByTestId("ride-chart-inspection")).getByRole("table");
  const legend = screen.getByRole("list", { name: i18n.t("group:ridePage.selectionTitle") });
  expect(within(legend).getAllByRole("listitem")).toHaveLength(5);
  expect(within(legend).getByLabelText("+2개 선택 기록")).toHaveTextContent("…");
  expect(legend).not.toHaveTextContent("Record 5");
  act(() => elevation.mock.lastCall?.[0].onHoverCoordinate(1));
  fireEvent.click(within(table).getByRole("checkbox", { name: "Record 1 표시" }));
  const hidden = within(table).getByRole("row", { name: /Record 1/ });
  expect(hidden).toHaveTextContent("숨김");
  for (const cell of within(hidden).getAllByRole("cell")) expect(cell).not.toHaveTextContent("200");
  expect(screen.getByRole("button", { name: "Record 1 표시" })).toHaveAttribute("aria-pressed", "false");
  expect(legend).not.toHaveTextContent("Record 1");
  expect(within(legend).getByLabelText("+1개 선택 기록")).toBeInTheDocument();
  expect(elevation.mock.lastCall?.[0].overlays.filter((overlay: { yAxisID: string }) => overlay.yAxisID === "yPower")).toHaveLength(5);
  expect(within(table).getAllByRole("checkbox")).toHaveLength(6);
  fireEvent.click(within(table).getByRole("checkbox", { name: "Record 1 표시" }));
  expect(within(table).getByRole("checkbox", { name: "Record 1 표시" })).toBeChecked();
  expect(screen.getByRole("button", { name: "Record 1 숨기기" })).toHaveAttribute("aria-pressed", "true");
  expect(elevation.mock.lastCall?.[0].overlays.filter((overlay: { yAxisID: string }) => overlay.yAxisID === "yPower")).toHaveLength(6);
});

vi.mock("../../services/activityDiscovery", () => ({ loadActivityDiscovery: vi.fn(async () => ({ items: mockCollectionData.get("activities") ?? [], nextCursor: null, scannedCount: 0, exhausted: true, totalCount: null })) }));

it("loads authorized stored provider streams by public activity identity without a provider id", async () => {
  setCollectionDocs("activities", [{ ...activity("provider-record", null, null), source: "strava" }]);
  streamsApi.mockResolvedValue({ distance: [0, 1000], altitude: [10, 20] });
  renderWithProviders(<Routes><Route path="/:lang/club/:groupId/rides/:rideId" element={<GroupRidePage />} /></Routes>, { route: "/ko/club/club/rides/ride", authenticated: true });
  expect(await screen.findByTestId("C2R-2")).toBeInTheDocument();
  expect(streamsApi).toHaveBeenCalledWith("provider-record");
  expect(mockCallableInvocations.some(call => call.name === "stravaGetActivityStreams")).toBe(false);
});

it("renders a safe preview independently of unrelated same-length sensor clocks", async () => {
  elevation.mockClear();
  setCollectionDocs("activities", [{ ...activity("preview", null, null), source: "strava", thumbnailTrack: "37,127;37,127.002;37,127.004" }]);
  const epoch = 1792105200000;
  streamsApi.mockResolvedValue({ time: [epoch, epoch + 1000, epoch + 2000], distance: [0, 10, 20], altitude: [10, 11, 12] });
  renderWithProviders(<Routes><Route path="/:lang/club/:groupId/rides/:rideId" element={<GroupRidePage />} /></Routes>, { route: "/ko/club/club/rides/ride", authenticated: true });
  await waitFor(() => expect(streamsApi).toHaveBeenCalledWith("preview"));
  await waitFor(() => expect(elevation.mock.lastCall?.[0].data).toHaveLength(3));
  await screen.findByTestId("C2R-2");
  await waitFor(() => {
    const source = screen.getAllByTestId("route-source")[0]!;
    expect(JSON.parse(source.getAttribute("data-geometry")!).geometry.coordinates).toEqual([[[127, 37], [127.002, 37], [127.004, 37]]]);
  });
  expect(screen.queryByTestId("hover-marker")).not.toBeInTheDocument();
});
