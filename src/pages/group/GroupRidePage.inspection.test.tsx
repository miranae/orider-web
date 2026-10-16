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
vi.mock("../../components/ElevationChart", () => ({ default: (props: unknown) => { elevation(props); return null; } }));
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

async function open(lang = "ko") {
  renderWithProviders(<Routes><Route path="/:lang/club/:groupId/rides/:rideId" element={<GroupRidePage />} /></Routes>, { route: `/${lang}/club/club/rides/ride`, authenticated: true });
  await screen.findByTestId("C2R-2");
  await waitFor(() => expect(elevation.mock.lastCall?.[0].overlays?.length).toBe(1));
}

it("shows distance-aligned recorded values per rider with selected sensors and no extra reads", async () => {
  await open();
  fireEvent.click(screen.getByRole("button", { name: "운동출력" }));
  fireEvent.click(screen.getByRole("button", { name: "이동속도" }));
  const before = mockCallableInvocations.length;
  act(() => elevation.mock.lastCall?.[0].onHoverIndex(1));
  const panel = screen.getByTestId("ride-chart-inspection");
  expect(panel).toHaveTextContent("1.00");
  const base = within(panel).getByText("Base rider").parentElement!;
  const runner = within(panel).getByText("Runner").parentElement!;
  expect(base).toHaveTextContent("해발고도20 m");
  expect(base).toHaveTextContent("운동파워200 W");
  expect(base).toHaveTextContent("이동속도7.2 km/h");
  expect(runner).toHaveTextContent("해발고도60 m");
  expect(runner).toHaveTextContent("러닝 파워280 W");
  expect(runner).toHaveTextContent("이동속도—");
  expect(mockCallableInvocations).toHaveLength(before);
  act(() => elevation.mock.lastCall?.[0].onHoverIndex(2));
  expect(within(screen.getByTestId("ride-chart-inspection")).getByText("Runner").parentElement).toHaveTextContent("해발고도—");
  act(() => elevation.mock.lastCall?.[0].onHoverIndex(null));
  expect(screen.getByTestId("ride-chart-inspection")).toBeInTheDocument();
  fireEvent.pointerLeave(panel.parentElement!, { pointerType: "mouse" });
  expect(screen.queryByTestId("ride-chart-inspection")).not.toBeInTheDocument();
});

it("does not attribute a later rider's plotted power to the base rider", async () => {
  setDocData("activity_streams/base", { distance: [0, 1000, 2000], altitude: [10, 20, 30] });
  await open();
  fireEvent.click(screen.getByRole("button", { name: "운동출력" }));
  act(() => elevation.mock.lastCall?.[0].onHoverIndex(1));
  const panel = screen.getByTestId("ride-chart-inspection");
  expect(within(panel).getByText("Base rider").parentElement).toHaveTextContent("운동파워—");
  expect(within(panel).getByText("Runner").parentElement).toHaveTextContent("러닝 파워280 W");
  expect(elevation.mock.lastCall?.[0].overlays.at(-1).label).toContain("러닝 파워");
});

it("supports focused chart navigation, retained inspection and English labels", async () => {
  await i18n.changeLanguage("en");
  await open("en");
  const chart = screen.getByRole("group", { name: "Elevation & Performance Analysis" });
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
  expect(screen.queryByTestId("ride-chart-inspection")).not.toBeInTheDocument();
});


it("retains the overlay when moving from canvas to its panel and supports dismissal and reopening", async () => {
  await open();
  const chart = screen.getByRole("group", { name: "고도 & 성능 분석" });
  act(() => elevation.mock.lastCall?.[0].onHoverIndex(1));
  const panel = screen.getByTestId("ride-chart-inspection");
  expect(panel).toHaveClass("absolute");
  act(() => elevation.mock.lastCall?.[0].onHoverIndex(null));
  fireEvent.pointerEnter(panel);
  act(() => panel.focus());
  expect(panel).toHaveFocus();
  fireEvent.scroll(panel, { target: { scrollTop: 100 } });
  expect(panel).toHaveTextContent("1.00");
  fireEvent.keyDown(panel, { key: "Escape" });
  expect(screen.queryByTestId("ride-chart-inspection")).not.toBeInTheDocument();
  expect(chart).toHaveFocus();
  fireEvent.keyDown(chart, { key: "ArrowRight" });
  expect(screen.getByTestId("ride-chart-inspection")).toBeInTheDocument();
  fireEvent.pointerLeave(chart, { pointerType: "mouse" });
  expect(screen.queryByTestId("ride-chart-inspection")).not.toBeInTheDocument();
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
  const chart = screen.getByRole("group", { name: "고도 & 성능 분석" });
  act(() => elevation.mock.lastCall?.[0].onHoverIndex(1));
  const close = within(screen.getByTestId("ride-chart-inspection")).getByRole("button", { name: "닫기" });
  act(() => close.focus());
  fireEvent.click(close);
  expect(screen.queryByTestId("ride-chart-inspection")).not.toBeInTheDocument();
  expect(chart).toHaveFocus();
  act(() => elevation.mock.lastCall?.[0].onHoverIndex(2));
  expect(screen.getByTestId("ride-chart-inspection")).toHaveTextContent("2.00");
});
