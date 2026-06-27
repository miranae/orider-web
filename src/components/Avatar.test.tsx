import { render, screen } from "@testing-library/react";
import { MemoryRouter } from "react-router-dom";
import Avatar from "./Avatar";

function renderAvatar(props: React.ComponentProps<typeof Avatar>) {
  return render(
    <MemoryRouter>
      <Avatar {...props} />
    </MemoryRouter>,
  );
}

describe("Avatar", () => {
  it("renders image when imageUrl is provided", () => {
    renderAvatar({ name: "Rider", imageUrl: "https://example.com/photo.jpg" });
    const img = screen.getByRole("img");
    expect(img).toHaveAttribute("src", "https://example.com/photo.jpg");
    expect(img).toHaveAttribute("alt", "Rider");
  });

  it("renders initial when no imageUrl", () => {
    renderAvatar({ name: "테스트" });
    expect(screen.getByText("테")).toBeInTheDocument();
  });

  it("wraps in link when userId is provided", () => {
    renderAvatar({ name: "Rider", userId: "user-1" });
    const link = screen.getByRole("link");
    // LocalizedLink 가 /ko locale prefix 를 붙인다.
    expect(link).toHaveAttribute("href", "/ko/athlete/user-1");
  });

  it("does not render link when no userId", () => {
    renderAvatar({ name: "Rider" });
    expect(screen.queryByRole("link")).not.toBeInTheDocument();
  });

  it("applies sm size class", () => {
    const { container } = renderAvatar({ name: "A", size: "sm" });
    const el = container.querySelector(".w-7");
    expect(el).toBeInTheDocument();
  });

  it("applies xl size class", () => {
    const { container } = renderAvatar({ name: "A", size: "xl" });
    const el = container.querySelector(".w-20");
    expect(el).toBeInTheDocument();
  });

  it("assigns deterministic color based on name", () => {
    const { container: c1 } = renderAvatar({ name: "Alpha" });
    const { container: c2 } = renderAvatar({ name: "Alpha" });
    const cls1 = c1.querySelector("[class*=bg-]")?.className;
    const cls2 = c2.querySelector("[class*=bg-]")?.className;
    expect(cls1).toBe(cls2);
  });
});
