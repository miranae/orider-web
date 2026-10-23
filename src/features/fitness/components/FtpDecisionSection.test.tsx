import { fireEvent, render, screen, waitFor } from "@testing-library/react";
import { MemoryRouter, useLocation, useNavigate } from "react-router-dom";
import { describe, expect, it, vi } from "vitest";
import { renderWithProviders } from "../../../__tests__/utils/renderWithProviders";
import FtpDecisionSection from "./FtpDecisionSection";
function AnchorLink() { const navigate = useNavigate(); return <button onClick={() => navigate("/coach/condition#ftp-decision")}>Open FTP</button>; }
describe("FTP decision section", () => {
  it.each(["#ftp-decision", "?decisionId=decision-1"])("opens and scrolls the requested decision %s", async suffix => {
    const scroll = vi.fn();
    HTMLElement.prototype.scrollIntoView = scroll;
    render(<MemoryRouter initialEntries={[`/coach/condition${suffix}`]}><FtpDecisionSection title="FTP" anchorEnabled><button>Accept decision</button></FtpDecisionSection></MemoryRouter>);
    await waitFor(() => expect(document.getElementById("ftp-decision")).toHaveProperty("tagName", "SECTION"));
    expect(screen.getByRole("button", { name: "Accept decision" })).toBeVisible();
    expect(scroll).toHaveBeenCalled();
  });
  it("stays visible and scrolls on same-page navigation", async () => {
    render(<MemoryRouter initialEntries={["/coach/condition"]}><AnchorLink /><FtpDecisionSection title="FTP" anchorEnabled><button>Accept decision</button></FtpDecisionSection></MemoryRouter>);
    const details = document.getElementById("ftp-decision")!;
    expect(details.tagName).toBe("SECTION");
    fireEvent.click(screen.getByText("Open FTP"));
    await waitFor(() => expect(details).toBeVisible());
    fireEvent.click(screen.getByText("Open FTP"));
    await waitFor(() => expect(details).toBeVisible());
  });
  it("preserves the legacy expanded mobile/embedded view without an anchor", () => {
    const { container } = render(<MemoryRouter initialEntries={["/embed?decisionId=decision-1"]}><FtpDecisionSection title="FTP" anchorEnabled={false} preserveExpanded><button>Legacy content</button></FtpDecisionSection></MemoryRouter>);
    expect(container.querySelector("details")).toBeNull();
    expect(container.querySelector("#ftp-decision")).toBeNull();
    expect(screen.getByRole("button", { name: "Legacy content" })).toBeVisible();
  });
});

function ResponsiveDecision({ mobile, ready = true }: { mobile: boolean; ready?: boolean }) {
  const location = useLocation();
  return <><output data-testid="url">{location.search}{location.hash}</output><button>Background control</button>{ready && <FtpDecisionSection title="FTP details" anchorEnabled compact={mobile} collapsible={!mobile}><p>Decision evidence</p></FtpDecisionSection>}</>;
}

it("preserves an open URL detail across mobile → desktop → mobile and releases modal isolation", async () => {
  const view = renderWithProviders(<ResponsiveDecision mobile />, { route: "/ko/coach/analysis?sport=bike&detail=ftp-decision" });
  expect(screen.getByRole("dialog", { name: "FTP details" })).toBeVisible();
  expect(screen.getByRole("button", { name: "Background control", hidden: true }).closest("body > div")).toHaveProperty("inert", true);
  view.rerender(<ResponsiveDecision mobile={false} />);
  expect(screen.queryByRole("dialog")).not.toBeInTheDocument();
  const desktop = document.getElementById("ftp-decision")!;
  await waitFor(() => expect(desktop).toHaveProperty("open", true));
  expect(Boolean((screen.getByRole("button", { name: "Background control" }).closest("body > div") as HTMLElement).inert)).toBe(false);
  expect(document.body.style.overflow).not.toBe("hidden");
  view.rerender(<ResponsiveDecision mobile />);
  expect(screen.getByRole("dialog", { name: "FTP details" })).toBeVisible();
  fireEvent.keyDown(screen.getByRole("dialog"), { key: "Escape" });
  await waitFor(() => expect(screen.queryByRole("dialog")).not.toBeInTheDocument());
  expect(screen.getByTestId("url")).toHaveTextContent("sport=bike&detail=closed");
});

it.each(["#ftp-decision", "?decisionId=late-decision"])("reveals a directly requested detail when its section mounts late: %s", async suffix => {
  const view = renderWithProviders(<ResponsiveDecision mobile ready={false} />, { route: `/ko/coach/analysis${suffix}` });
  expect(screen.queryByRole("dialog")).not.toBeInTheDocument();
  view.rerender(<ResponsiveDecision mobile />);
  expect(await screen.findByRole("dialog", { name: "FTP details" })).toBeVisible();
  fireEvent.keyDown(screen.getByRole("dialog"), { key: "Escape" });
  await waitFor(() => expect(screen.queryByRole("dialog")).not.toBeInTheDocument());
  view.rerender(<ResponsiveDecision mobile={false} />);
  expect(document.getElementById("ftp-decision")).toHaveProperty("open", false);
  view.rerender(<ResponsiveDecision mobile />);
  expect(screen.queryByRole("dialog")).not.toBeInTheDocument();
});
