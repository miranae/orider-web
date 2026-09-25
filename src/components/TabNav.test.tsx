import { fireEvent, render, screen, within } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import { MemoryRouter } from "react-router-dom";
import TabNav, { RouteTabNav } from "./TabNav";

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

describe("RouteTabNav narrow overflow", () => {
  it("offers a next-tabs control when routes overflow", () => {
    const { container } = render(<MemoryRouter><RouteTabNav tabs={[
      { to: "/board", label: "게시판" },
      { to: "/events", label: "이벤트" },
      { to: "/friends", label: "친구" },
    ]} /></MemoryRouter>);
    const scroller = container.querySelector<HTMLElement>(".route-tab-nav__scroller")!;
    Object.defineProperty(scroller, "scrollWidth", { configurable: true, value: 600 });
    Object.defineProperty(scroller, "clientWidth", { configurable: true, value: 200 });
    fireEvent(window, new Event("resize"));
    const more = screen.getByRole("button", { name: /다음 탭 보기|More tabs|button.nextTabs/ });
    fireEvent.click(more);
    expect(scroller.scrollLeft).toBeGreaterThan(0);
    fireEvent.scroll(scroller);
    const previous = screen.getByRole("button", { name: /이전 탭 보기|Previous tabs|button.previousTabs/ });
    fireEvent.click(previous);
    expect(scroller.scrollLeft).toBe(0);
  });
});
