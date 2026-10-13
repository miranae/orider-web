import { fireEvent, render, screen } from "@testing-library/react";
import { describe, expect, it, vi } from "vitest";
import PowerCurveChart from "./PowerCurveChart";
vi.mock("react-i18next", () => ({ useTranslation: () => ({ t: (key: string, params?: Record<string, unknown>) => `${key}${params ? ` ${Object.values(params).join(" ")}` : ""}` }) }));
vi.mock("../../../components/LocalizedLink", () => ({ LocalizedLink: ({ to, children, ...props }: any) => <a href={to} {...props}>{children}</a> }));
describe("Fitness PowerCurveChart", () => {
  const current = [{ durationSeconds: 1, maxPower: 900, sourceActivityId: "sprint", startTime: 1000 },
    { durationSeconds: 300, maxPower: 300, sourceActivityId: "longer", startTime: 2000 }];
  const previous = [{ durationSeconds: 300, maxPower: 280, sourceActivityId: "previous", startTime: 500 }];
  it("exposes actual shared duration values and each source with native keyboard selection", () => {
    render(<PowerCurveChart current={current} previous={previous} />);
    expect(screen.getByRole("combobox", { name: "powerCurve.durationSelect" })).toHaveValue("300");
    expect(screen.getByText("300")).toBeInTheDocument(); expect(screen.getByText("280")).toBeInTheDocument();
    expect(screen.getAllByRole("link").map(link => link.getAttribute("href"))).toEqual(["/activity/longer", "/activity/previous"]);
    fireEvent.change(screen.getByRole("combobox"), { target: { value: "1" } });
    expect(screen.getByText("900")).toBeInTheDocument(); expect(screen.getByText("—")).toBeInTheDocument();
    expect(screen.getByRole("link")).toHaveAttribute("href", "/activity/sprint");
    expect(screen.getByText("powerCurve.windowNote")).toBeInTheDocument();
  });
  it("selects canonical duration by pointer and never assigns source links to a model", () => {
    const r = render(<PowerCurveChart current={current} previous={previous} expected={[{ durationSeconds: 300, maxPower: 400 }]} />);
    fireEvent.click(r.container.querySelectorAll('circle[fill="transparent"]')[0]!);
    expect(screen.getByRole("combobox")).toHaveValue("1");
    expect(screen.getAllByRole("link")).toHaveLength(1);
  });
});
