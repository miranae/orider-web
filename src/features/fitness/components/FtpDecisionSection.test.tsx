import { fireEvent, render, screen, waitFor } from "@testing-library/react";
import { MemoryRouter, useNavigate } from "react-router-dom";
import { describe, expect, it, vi } from "vitest";
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
