import { render, screen, within } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import TabNav from "./TabNav";

describe("TabNav", () => {
  const tabs = [
    { id: "overview", label: "개요" },
    { id: "segments", label: "세그먼트", count: 5 },
    { id: "photos", label: "사진", count: 0 },
  ];

  it("renders all tab labels", () => {
    render(<TabNav tabs={tabs} activeTab="overview" onChange={() => {}} />);
    expect(screen.getByText("개요")).toBeInTheDocument();
    expect(screen.getByText("세그먼트")).toBeInTheDocument();
    expect(screen.getByText("사진")).toBeInTheDocument();
  });

  it("shows count when present", () => {
    render(<TabNav tabs={tabs} activeTab="overview" onChange={() => {}} />);
    expect(screen.getByText("(5)")).toBeInTheDocument();
    expect(screen.getByText("(0)")).toBeInTheDocument();
  });

  it("highlights active tab with accent (teal) border", () => {
    render(<TabNav tabs={tabs} activeTab="segments" onChange={() => {}} />);
    const btn = screen.getByText("세그먼트").closest("button");
    expect(btn?.style.borderColor).toBe("var(--lime)");
    expect(btn?.style.color).toBe("var(--lime)");
  });

  it("exposes tab semantics and visible keyboard focus styles", () => {
    render(<TabNav tabs={tabs} activeTab="overview" onChange={() => {}} />);

    const tablist = screen.getByRole("tablist");
    const active = within(tablist).getByRole("tab", { name: "개요" });
    const inactive = within(tablist).getByRole("tab", { name: /세그먼트/ });

    expect(active).toHaveAttribute("aria-selected", "true");
    expect(inactive).toHaveAttribute("aria-selected", "false");
    expect(active.className).toContain("focus-visible:outline");
    expect(inactive.className).toContain("focus-visible:outline");
  });

  it("calls onChange with tab id when clicked", async () => {
    const user = userEvent.setup();
    const onChange = vi.fn();
    render(<TabNav tabs={tabs} activeTab="overview" onChange={onChange} />);

    await user.click(screen.getByText("세그먼트"));
    expect(onChange).toHaveBeenCalledWith("segments");
  });
});
