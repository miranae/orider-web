import { render, screen } from "@testing-library/react";
import StatCard from "./StatCard";

describe("StatCard", () => {
  it("renders label and value", () => {
    render(<StatCard label="거리" value="42 km" />);
    expect(screen.getByText("거리")).toBeInTheDocument();
    expect(screen.getByText("42 km")).toBeInTheDocument();
  });

  it("renders icon when provided", () => {
    render(<StatCard label="라이딩" value="5회" icon="🚴" />);
    expect(screen.getByText("🚴")).toBeInTheDocument();
  });

  it("renders subValue when provided", () => {
    render(<StatCard label="거리" value="42 km" subValue="주간 평균" />);
    expect(screen.getByText("주간 평균")).toBeInTheDocument();
  });

  it("does not render subValue when not provided", () => {
    const { container } = render(<StatCard label="거리" value="42 km" />);
    const subValueEl = container.querySelector(".text-xs.text-gray-400");
    expect(subValueEl).not.toBeInTheDocument();
  });

  it("applies custom color class", () => {
    render(<StatCard label="거리" value="42 km" color="text-orange-600" />);
    const valueEl = screen.getByText("42 km");
    expect(valueEl.className).toContain("text-orange-600");
  });
});
