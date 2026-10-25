import { mockCollectionData } from "../../__tests__/mocks/firebase";
import { act, fireEvent, screen, waitFor, within } from "@testing-library/react";
import { Route, Routes } from "react-router-dom";
import { beforeEach, expect, it, vi } from "vitest";
import i18n from "i18next";
import enGroup from "../../i18n/resources/en/group.json";
import { setCollectionDocs, setDocData, mockCallableInvocations } from "../../__tests__/mocks/firebase";
import { renderWithProviders } from "../../__tests__/utils/renderWithProviders";
import GroupRidePage from "./GroupRidePage";

const { elevation } = vi.hoisted(() => ({ elevation: vi.fn() }));
vi.mock("../../hooks/useGroup", () => ({ useGroup: () => ({ group: { toggles: { ridePhotos: false } } }) }));
vi.mock("../../services/publicProfiles", () => ({ getPublicUserProfiles: async () => new Map() }));
vi.mock("../../components/ComparisonChart", () => ({ default: () => null }));
vi.mock("./GroupRidePerformanceChart", () => ({ default: (props: unknown) => { elevation(props); return null; } }));
vi.mock("../../utils/mapbox", () => ({ getMapboxToken: () => "", MAP_STYLE: "", applyKoreaCyclingStyle: vi.fn() }));
vi.mock("react-map-gl/mapbox", () => ({ default: () => null, Source: () => null, Layer: () => null, Marker: () => null }));

beforeEach(async () => {
  elevation.mockClear();
  i18n.addResourceBundle("en", "group", enGroup, true, true);
  await i18n.changeLanguage("ko");
  setCollectionDocs("activities", [
    { id: "base", userId: "base", nickname: "Base rider", type: "Ride", source: "orider", startTime: 1792105200000, summary: { distance: 2000, ridingTimeMillis: 3600000, averageSpeed: 10, averagePower: null, averageHeartRate: null, averageCadence: null } },
    { id: "runner", userId: "runner", nickname: "Runner", type: "Run", source: "orider", startTime: 1792105200000, summary: { distance: 1500, ridingTimeMillis: 3600000, averageSpeed: 10, averagePower: null, averageHeartRate: null, averageCadence: null } },
  ]);
  setDocData("activity_streams/base", { distance: [0, 1000, 2000], altitude: [10, 20, 30], watts: [100, 200, 300], velocity_smooth: [1, 2, 3] });
  setDocData("activity_streams/runner", { distance: [0, 400, 1500], altitude: [40, 50, 60], watts: [220, 250, 280] });
});

function enableOverlay(name: string) {
  const button = screen.getByRole("button", { name });
  if (button.getAttribute("aria-pressed") !== "true") fireEvent.click(button);
}

async function open(lang = "ko") {
  renderWithProviders(<Routes><Route path="/:lang/club/:groupId/rides/:rideId" element={<GroupRidePage />} /></Routes>, { route: `/${lang}/club/club/rides/ride`, authenticated: true });
  await screen.findByTestId("C2R-2");
  await waitFor(() => expect(elevation.mock.lastCall?.[0].overlays?.filter((overlay: { yAxisID: string }) => overlay.yAxisID === "yElev").length).toBe(1));
}

it("shows distance-aligned recorded values per rider with selected sensors and no extra reads", async () => {
  await open();
  enableOverlay("출력");
  enableOverlay("이동속도");
  const before = mockCallableInvocations.length;
  act(() => elevation.mock.lastCall?.[0].onHoverIndex(1));
  const panel = screen.getByTestId("ride-chart-inspection");
  expect(panel).toHaveTextContent("1.00");
  const base = within(panel).getByText("Base rider").closest("tr")!;
  const runner = within(panel).getByText("Runner").closest("tr")!;
  expect(within(base).getAllByRole("cell")[3]).toHaveTextContent(/^20$/);
  expect(within(base).getAllByRole("cell")[1]?.querySelector(".ds-chart-value__primary")).toHaveTextContent(/^200$/);
  expect(within(base).getAllByRole("cell")[2]?.querySelector(".ds-chart-value__primary")).toHaveTextContent(/^7\.2$/);
  expect(within(runner).getAllByRole("cell")[3]).toHaveTextContent(/^60$/);
  expect(within(runner).getAllByRole("cell")[1]?.querySelector(".ds-chart-value__primary")).toHaveTextContent(/^280$/);
  expect(runner).toHaveTextContent("—");
  expect(mockCallableInvocations).toHaveLength(before);
  act(() => elevation.mock.lastCall?.[0].onHoverIndex(2));
  expect(within(screen.getByTestId("ride-chart-inspection")).getByText("Runner").closest("tr")).toHaveTextContent("—");
  act(() => elevation.mock.lastCall?.[0].onHoverIndex(null));
  expect(screen.getByTestId("ride-chart-inspection")).toBeInTheDocument();
  fireEvent.pointerLeave(panel.parentElement!, { pointerType: "mouse" });
  expect(screen.getByTestId("ride-chart-inspection")).toBeInTheDocument();
});

it("does not attribute a later rider's plotted power to the base rider", async () => {
  setDocData("activity_streams/base", { distance: [0, 1000, 2000], altitude: [10, 20, 30] });
  await open();
  enableOverlay("출력");
  act(() => elevation.mock.lastCall?.[0].onHoverIndex(1));
  const panel = screen.getByTestId("ride-chart-inspection");
  expect(within(panel).getByText("Base rider").closest("tr")).toHaveTextContent("—");
  expect(within(within(panel).getByText("Runner").closest("tr")!).getAllByRole("cell")[1]?.querySelector(".ds-chart-value__primary")).toHaveTextContent(/^280$/);
  expect(elevation.mock.lastCall?.[0].overlays.at(-1).label).toContain("러닝 파워");
});

it("supports focused chart navigation, retained inspection and English labels", async () => {
  await i18n.changeLanguage("en");
  await open("en");
  const chart = screen.getByRole("group", { name: "Ride performance comparison" });
  fireEvent.focus(chart);
  fireEvent.keyDown(chart, { key: "End" });
  expect(screen.getByTestId("ride-chart-inspection")).toHaveTextContent("2.00");
  fireEvent.keyDown(chart, { key: "ArrowLeft" });
  expect(screen.getByTestId("ride-chart-inspection")).toHaveTextContent("1.00");
  act(() => elevation.mock.lastCall?.[0].onHoverIndex(null));
  expect(screen.getByTestId("ride-chart-inspection")).toBeInTheDocument();
  fireEvent.keyDown(chart, { key: "Home" });
  expect(screen.getByTestId("ride-chart-inspection")).toHaveTextContent("0.00");
  expect(screen.getByTestId("ride-chart-inspection")).toHaveTextContent("Elevation");
  fireEvent.blur(chart, { relatedTarget: document.body });
  expect(screen.getByTestId("ride-chart-inspection")).toBeInTheDocument();
  fireEvent.keyDown(chart, { key: "Escape" });
  expect(screen.getByTestId("ride-chart-inspection")).toHaveTextContent(i18n.t("group:ridePage.chart.selectSample"));
});


it("retains the overlay when moving from canvas to its panel and supports dismissal and reopening", async () => {
  await open();
  const chart = screen.getByRole("group", { name: "라이딩 성능 비교" });
  act(() => elevation.mock.lastCall?.[0].onHoverIndex(1));
  const panel = screen.getByTestId("ride-chart-inspection");
  expect(panel).not.toHaveClass("absolute");
  act(() => elevation.mock.lastCall?.[0].onHoverIndex(null));
  fireEvent.pointerEnter(panel);
  const tableScroll = within(panel).getByRole("region");
  act(() => tableScroll.focus());
  expect(tableScroll).toHaveFocus();
  fireEvent.scroll(panel, { target: { scrollTop: 100 } });
  expect(panel).toHaveTextContent("1.00");
  fireEvent.keyDown(panel, { key: "Escape" });
  expect(screen.getByTestId("ride-chart-inspection")).toHaveTextContent(i18n.t("group:ridePage.chart.selectSample"));
  expect(chart).toHaveFocus();
  fireEvent.keyDown(chart, { key: "ArrowRight" });
  expect(screen.getByTestId("ride-chart-inspection")).toBeInTheDocument();
  fireEvent.pointerLeave(chart, { pointerType: "mouse" });
  expect(screen.getByTestId("ride-chart-inspection")).toBeInTheDocument();
  act(() => elevation.mock.lastCall?.[0].onHoverIndex(1));
  expect(screen.getByTestId("ride-chart-inspection")).toBeInTheDocument();
});


it("distinguishes multiple recorded activities by the same rider in the overlay", async () => {
  setCollectionDocs("activities", ["base", "runner"].map((id, index) => ({
    id, userId: "same-rider", nickname: "Same rider", type: "Ride", source: "orider", startTime: 1792105200000,
    summary: { distance: index === 0 ? 2000 : 1500, ridingTimeMillis: 3600000, averageSpeed: 10, averagePower: null, averageHeartRate: null, averageCadence: null },
  })));
  await open();
  act(() => elevation.mock.lastCall?.[0].onHoverIndex(1));
  const panel = screen.getByTestId("ride-chart-inspection");
  expect(panel).toHaveTextContent("Same rider · 2.0 km");
  expect(panel).toHaveTextContent("Same rider · 1.5 km");
});


it("offers a touch-visible close action without immediate reopening and permits a new chart sample", async () => {
  await open();
  const chart = screen.getByRole("group", { name: "라이딩 성능 비교" });
  act(() => elevation.mock.lastCall?.[0].onHoverIndex(1));
  const close = within(screen.getByTestId("ride-chart-inspection")).getByRole("button", { name: "닫기" });
  act(() => close.focus());
  fireEvent.click(close);
  expect(screen.getByTestId("ride-chart-inspection")).toHaveTextContent(i18n.t("group:ridePage.chart.selectSample"));
  expect(chart).toHaveFocus();
  act(() => elevation.mock.lastCall?.[0].onHoverIndex(2));
  expect(screen.getByTestId("ride-chart-inspection")).toHaveTextContent("2.00");
});


it("plots every selected record's sensors against its own distance with shared metric axes", async () => {
  await open();
  enableOverlay("출력");
  enableOverlay("이동속도");
  const overlays = elevation.mock.lastCall?.[0].overlays;
  const power = overlays.filter((overlay: { yAxisID: string }) => overlay.yAxisID === "yPower");
  expect(power).toHaveLength(2);
  expect(power[0]).toMatchObject({ label: "Base rider · 파워 (W)", distance: [0, 1000, 2000], data: [100, 200, 300] });
  expect(power[1]).toMatchObject({ label: "Runner · 러닝 파워 (W)", distance: [0, 400, 1500], data: [220, 250, 280] });
  expect(power[0].color).not.toBe(power[1].color);
  expect(power[0].borderDash).toEqual(power[1].borderDash);
  expect(overlays.find((overlay: { yAxisID: string }) => overlay.yAxisID === "ySpeed").borderDash).not.toEqual(power[0].borderDash);
  fireEvent.click(screen.getByRole("button", { name: "Runner 숨기기" }));
  expect(elevation.mock.lastCall?.[0].overlays.filter((overlay: { yAxisID: string }) => overlay.yAxisID === "yPower")).toHaveLength(1);
});


it("aligns different recorded clocks rather than distances and displays each nearest sample time", async () => {
  const epoch = 1792105200000;
  setDocData("activity_streams/base", { distance: [0, 1000, 2000], altitude: [10, 20, 30], time: [epoch, epoch + 60000, epoch + 120000], watts: [100, 200, 300] });
  setDocData("activity_streams/runner", { distance: [0, 400, 1500], altitude: [40, 50, 60], time: [epoch / 1000 + 30, epoch / 1000 + 90, epoch / 1000 + 150], watts: [220, 250, 280] });
  await open();
  enableOverlay("출력");
  fireEvent.click(screen.getByRole("button", { name: "시간 (실제 시각)" }));
  const props = elevation.mock.lastCall?.[0];
  expect(props.xAxis).toBe("elapsed");
  expect(props.elapsedAxisSec).toEqual([0, 60, 120]);
  expect(props.overlays.find((overlay: { key: string }) => overlay.key === "elevation:runner").elapsedAxisSec).toEqual([30, 90, 150]);
  expect(props.overlays.find((overlay: { key: string }) => overlay.key === "power:runner").elapsedAxisSec).toEqual([30, 90, 150]);
  act(() => props.onHoverIndex(1));
  const panel = screen.getByTestId("ride-chart-inspection");
  expect(within(within(panel).getByText("Runner").closest("tr")!).getAllByRole("cell")[3]).toHaveTextContent(/^40$/);
  expect(within(panel).getByRole("columnheader", { name: "표본 시각" })).toBeInTheDocument();
  fireEvent.click(screen.getByRole("button", { name: "이동거리", exact: true }));
  act(() => elevation.mock.lastCall?.[0].onHoverIndex(1));
  expect(within(within(screen.getByTestId("ride-chart-inspection")).getByText("Runner").closest("tr")!).getAllByRole("cell")[3]).toHaveTextContent(/^60$/);
});

it("keeps the latest sample visible outside the plot until explicitly closed and ignores the same dismissed hover", async () => {
  await open();
  const chart = screen.getByRole("group", { name: "라이딩 성능 비교" });
  act(() => elevation.mock.lastCall?.[0].onHoverIndex(1));
  fireEvent.pointerLeave(chart, { pointerType: "mouse" });
  const panel = screen.getByTestId("ride-chart-inspection");
  expect(panel).not.toHaveClass("absolute");
  fireEvent.click(within(panel).getByRole("button", { name: "닫기" }));
  act(() => elevation.mock.lastCall?.[0].onHoverIndex(1));
  expect(screen.getByTestId("ride-chart-inspection")).toHaveTextContent(i18n.t("group:ridePage.chart.selectSample"));
  act(() => elevation.mock.lastCall?.[0].onHoverIndex(2));
  expect(screen.getByTestId("ride-chart-inspection")).toHaveTextContent("2.00");
});


it("keeps comparison rows mounted through invalid hover, explicit clear and axis changes", async () => {
  const epoch = 1792105200000;
  setDocData("activity_streams/base", { distance: [0, 1000, 2000], altitude: [10, 20, 30], time: [epoch, epoch + 1000, epoch + 2000] });
  setDocData("activity_streams/runner", { distance: [0, 1000, 3000], altitude: [40, 50, 60], time: [epoch, epoch + 1000, epoch + 2000] });
  await open();
  const panel = screen.getByTestId("ride-chart-inspection");
  expect(panel).toHaveTextContent(i18n.t("group:ridePage.chart.selectSample"));
  const rows = panel.querySelectorAll("tbody tr");
  act(() => elevation.mock.lastCall?.[0].onHoverIndex(1));
  act(() => { elevation.mock.lastCall?.[0].onHoverIndex(99); elevation.mock.lastCall?.[0].onHoverIndex(null); });
  expect(screen.getByTestId("ride-chart-inspection")).toBe(panel);
  expect(panel).toHaveTextContent("1.00");
  fireEvent.click(within(panel).getByRole("button", { name: "닫기" }));
  expect(screen.getByTestId("ride-chart-inspection")).toBe(panel);
  expect(panel.querySelectorAll("tbody tr")[0]).toBe(rows[0]);
  expect(panel).toHaveTextContent(i18n.t("group:ridePage.chart.selectSample"));
  fireEvent.click(screen.getByRole("button", { name: "시간 (실제 시각)" }));
  expect(screen.getByTestId("ride-chart-inspection")).toBe(panel);
});

it("inspects the full pointer coordinate beyond the base record without clamping other records", async () => {
  setDocData("activity_streams/runner", { distance: [0, 1000, 3000], altitude: [40, 50, 60] });
  await open();
  act(() => elevation.mock.lastCall?.[0].onHoverCoordinate(2.5));
  const panel = screen.getByTestId("ride-chart-inspection");
  expect(panel).toHaveTextContent("2.50");
  expect(within(panel).getByText("Base rider").closest("tr")).toHaveTextContent("—");
  expect(within(within(panel).getByText("Runner").closest("tr")!).getAllByRole("cell")[3]).toHaveTextContent(/^60$/);
});

it("shows verified time-only sensors without invented GPS or altitude and preserves power/speed zero", async () => {
  const epoch = 1792105200000;
  setCollectionDocs("activities", [{ id: "sensor", userId: "sensor", nickname: "Sensor rider", source: "orider", type: "Ride", startTime: epoch, summary: { distance: 1000, ridingTimeMillis: 2000, averageSpeed: 10 } }]);
  setDocData("activity_streams/sensor", { time: [epoch, epoch + 1000, epoch + 2000], heartrate: [0, 140, 150], watts: [0, 200, 250], velocity_smooth: [0, null, 2] });
  renderWithProviders(<Routes><Route path="/:lang/club/:groupId/rides/:rideId" element={<GroupRidePage />} /></Routes>, { route: "/ko/club/club/rides/ride", authenticated: true });
  await screen.findByTestId("ride-chart-inspection");
  await waitFor(() => expect(screen.queryByRole("status")).not.toBeInTheDocument());
  fireEvent.click(screen.getByRole("button", { name: "시간 (실제 시각)" }));
  await screen.findByTestId("C2R-2");
  const props = elevation.mock.lastCall?.[0];
  expect(props.overlays.find((overlay: { yAxisID: string }) => overlay.yAxisID === "ySpeed").data).toEqual([0, null, 7.2]);
  act(() => props.onHoverCoordinate(0));
  const panel = screen.getByTestId("ride-chart-inspection");
  expect(within(within(panel).getByRole("row", { name: /Sensor rider/ })).getAllByRole("cell")[0]).toHaveTextContent("—");
  expect(within(within(panel).getByRole("row", { name: /Sensor rider/ })).getAllByRole("cell")[1]?.querySelector(".ds-chart-value__primary")).toHaveTextContent(/^0$/);
  expect(within(within(panel).getByRole("row", { name: /Sensor rider/ })).getAllByRole("cell")[2]?.querySelector(".ds-chart-value__primary")).toHaveTextContent(/^0\.0$/);
  expect(panel).toHaveTextContent("—");
});


it.each(["ko", "en"])("shows instantaneous values above observed averages in one persistent table in %s", async lang => {
  await i18n.changeLanguage(lang);
  const epoch = 1792105200000;
  setDocData("activity_streams/base", { distance: [0, 1000, 2000], altitude: [10, 20, 30], time: [epoch, epoch + 1000, epoch + 2000], watts: [0, 100, 200], heartrate: [0, 120, 140], velocity_smooth: [0, 2, 4] });
  await open(lang);
  fireEvent.click(screen.getByRole("button", { name: i18n.t("group:ridePage.chart.timeMode") }));
  const panel = screen.getByTestId("ride-chart-inspection");
  const table = within(panel).getByRole("table");
  act(() => elevation.mock.lastCall?.[0].onViewportChange(null, [0, 2 / 60]));
  const powerCell = () => within(within(table).getByRole("row", { name: /Base rider/ })).getAllByRole("cell")[1]!;
  expect(powerCell().querySelector(".ds-chart-value__primary")).toHaveTextContent(/^—$/);
  expect(powerCell().querySelector(".ds-chart-value__secondary")).toHaveTextContent(i18n.t("group:ridePage.range.inlineAverage", { value: "50.0" }));
  act(() => elevation.mock.lastCall?.[0].onViewportChange([0, 1.5 / 60], [0, 2 / 60]));
  expect(powerCell().querySelector(".ds-chart-value__secondary")).toHaveTextContent("33.3");
  act(() => elevation.mock.lastCall?.[0].onHoverCoordinate(0));
  expect(powerCell().querySelector(".ds-chart-value__primary")).toHaveTextContent(/^0$/);
  expect(powerCell().querySelector(".ds-chart-value__secondary")).toHaveTextContent("33.3");
  fireEvent.click(within(panel).getByRole("button", { name: i18n.t("common:button.close") }));
  expect(powerCell().querySelector(".ds-chart-value__secondary")).toHaveTextContent("33.3");
  expect(within(panel).getByRole("table")).toBe(table);
  act(() => elevation.mock.lastCall?.[0].onViewportChange(null, [0, 2 / 60]));
  expect(powerCell().querySelector(".ds-chart-value__secondary")).toHaveTextContent("50.0");
  expect(screen.getAllByRole("table")).toHaveLength(1);
  expect(screen.queryByTestId("C2R-3")).not.toBeInTheDocument();
  expect(within(table).getByRole("link", { name: "Base rider" })).toHaveAttribute("href", `/${lang}/activity/base`);
  expect(within(panel).queryByRole("button", { name: /^(구간 평균|Range averages)$/ })).not.toBeInTheDocument();
});

it("keeps exact range and formatted coverage accessible without adding visible coverage rows", async () => {
  const epoch = 1792105200000;
  const length = 3601;
  setDocData("activity_streams/base", { time: Array.from({ length }, (_, index) => epoch + index * 1000), distance: Array.from({ length }, (_, index) => index * 10), altitude: Array(length).fill(20), watts: Array(length).fill(100), heartrate: Array(length).fill(140), velocity_smooth: Array(length).fill(3) });
  await open();
  fireEvent.click(screen.getByRole("button", { name: "시간 (실제 시각)" }));
  act(() => elevation.mock.lastCall?.[0].onViewportChange([0, 3532 / 60], [0, 60]));
  expect(screen.getByTestId("ride-range-context")).toHaveTextContent("58:52");
  const panel = screen.getByTestId("ride-chart-inspection");
  fireEvent.click(within(panel).getByRole("button", { name: /구간 평균 산출 기준/ }));
  expect(await screen.findByRole("tooltip")).toHaveTextContent("관측 58:52");
  expect(panel).not.toHaveTextContent("3532.0");
});

vi.mock("../../services/activityDiscovery", () => ({ loadActivityDiscovery: vi.fn(async () => ({ items: mockCollectionData.get("activities") ?? [], nextCursor: null, scannedCount: 0, exhausted: true, totalCount: null })) }));
