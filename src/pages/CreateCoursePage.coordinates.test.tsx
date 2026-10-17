import { fireEvent, screen, within } from "@testing-library/react";
import { renderWithProviders } from "../__tests__/utils/renderWithProviders";
import CreateCoursePage from "./CreateCoursePage";
vi.mock("../components/course/RouteBuilderMap", () => ({ default: () => <div>Builder map</div> }));
vi.mock("../components/RouteMap", () => ({ default: () => null }));
vi.mock("../components/ElevationChart", () => ({ default: () => null }));
it("keeps coordinate names and valid ranges visible before values are entered", async () => {
  renderWithProviders(<CreateCoursePage />, { authenticated: true, route: "/ko/course/create?mode=builder" });
  const latitude = await screen.findByLabelText("위도");
  const longitude = screen.getByLabelText("경도");
  expect(latitude).toHaveValue("");
  expect(latitude).toHaveAttribute("placeholder", "37.5665");
  expect(longitude).toHaveAttribute("placeholder", "126.9780");
  expect(document.getElementById(latitude.getAttribute("aria-describedby")!)).toHaveTextContent("범위 −85~85°");
  expect(document.getElementById(longitude.getAttribute("aria-describedby")!)).toHaveTextContent("범위 −180~180°");
  expect(screen.getByText(/방문할 지점을 순서대로 선택해 자전거 경로를 계산/)).toBeInTheDocument();
});

it("uses roving radio keys for surface and difficulty without changing pointer deselection", async () => {
  const { container } = renderWithProviders(<CreateCoursePage />, { authenticated: true, route: "/ko/course/create?mode=gpx" });
  await screen.findByRole("button", { name: "GPX 업로드" });
  const file = new File(['<gpx><trk><trkseg><trkpt lat="37.5" lon="127"><ele>20</ele></trkpt><trkpt lat="37.51" lon="127.01"><ele>30</ele></trkpt></trkseg></trk></gpx>'], "route.gpx", { type: "application/gpx+xml" });
  fireEvent.change(container.querySelector('input[type="file"]')!, { target: { files: [file] } });
  const surface = await screen.findByRole("radiogroup", { name: "노면" });
  const surfaceRadios = within(surface).getAllByRole("radio");
  surfaceRadios[0]!.focus();
  expect(surfaceRadios[0]).toHaveAttribute("tabindex", "0");
  // Section-range shortcuts listen on window; handled radio keys must not reach them.
  const rangeShortcut = vi.fn();
  window.addEventListener("keydown", rangeShortcut);
  try {
    fireEvent.keyDown(surfaceRadios[0]!, { key: "ArrowRight" });
    expect(rangeShortcut).not.toHaveBeenCalled();
    fireEvent.keyDown(surfaceRadios[1]!, { key: "ArrowRight", shiftKey: true });
    expect(surfaceRadios[2]).toHaveAttribute("aria-checked", "true");
    expect(rangeShortcut).not.toHaveBeenCalled();
    fireEvent.keyDown(surfaceRadios[2]!, { key: "ArrowLeft" });
    fireEvent.keyDown(surfaceRadios[1]!, { key: "x" });
    expect(rangeShortcut).toHaveBeenCalledOnce();
  } finally {
    window.removeEventListener("keydown", rangeShortcut);
  }
  expect(surfaceRadios[1]).toHaveFocus();
  expect(surfaceRadios[1]).toHaveAttribute("aria-checked", "true");
  expect(surfaceRadios[0]).toHaveAttribute("tabindex", "-1");
  fireEvent.keyDown(surfaceRadios[1]!, { key: "End" });
  expect(surfaceRadios[3]).toHaveFocus();
  fireEvent.keyDown(surfaceRadios[3]!, { key: "ArrowDown" });
  expect(surfaceRadios[0]).toHaveFocus();
  const difficulty = screen.getAllByRole("radiogroup").find(group => group !== surface)!;
  const difficultyRadios = within(difficulty).getAllByRole("radio");
  expect(difficultyRadios[0]).toHaveAttribute("tabindex", "0");
  difficultyRadios[0]!.focus();
  fireEvent.keyDown(difficultyRadios[0]!, { key: "End" });
  expect(difficultyRadios[4]).toHaveFocus();
  expect(difficultyRadios[4]).toHaveAttribute("aria-checked", "true");
  fireEvent.keyDown(difficultyRadios[4]!, { key: "End" });
  expect(difficultyRadios[4]).toHaveAttribute("aria-checked", "true");
  fireEvent.keyDown(difficultyRadios[4]!, { key: "Home" });
  expect(difficultyRadios[0]).toHaveAttribute("aria-checked", "true");
  fireEvent.click(difficultyRadios[0]!);
  expect(difficultyRadios.every(radio => radio.getAttribute("aria-checked") === "false")).toBe(true);
  expect(difficultyRadios[0]).toHaveAttribute("tabindex", "0");
});
