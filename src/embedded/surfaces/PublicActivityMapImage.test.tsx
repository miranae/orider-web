import { cleanup, fireEvent, render, screen } from "@testing-library/react";
import { afterEach, describe, expect, it } from "vitest";
import PublicActivityMapImage from "./PublicActivityMapImage";

afterEach(cleanup);
describe("public static route image", () => {
  it("replaces a broken image with an alert and retries the unchanged URL", () => {
    const src = "https://maps.example.test/preview?signature=unchanged";
    render(<PublicActivityMapImage src={src} />);
    const initial = screen.getByRole("img", { name: "라이딩 경로" });
    fireEvent.error(initial);
    expect(screen.queryByRole("img")).not.toBeInTheDocument();
    expect(screen.getByRole("alert")).toHaveTextContent("경로 지도를 불러오지 못했습니다.");
    fireEvent.click(screen.getByRole("button", { name: "다시 시도" }));
    const retried = screen.getByRole("img", { name: "라이딩 경로" });
    expect(retried).not.toBe(initial);
    expect(retried).toHaveAttribute("src", src);
    fireEvent.load(retried);
    expect(screen.queryByRole("alert")).not.toBeInTheDocument();
    fireEvent.error(retried);
    expect(screen.getByRole("button", { name: "다시 시도" })).toBeEnabled();
  });
  it("does not carry a previous URL failure into a replacement preview", () => {
    const view = render(<PublicActivityMapImage src="https://maps.example.test/old" />);
    fireEvent.error(screen.getByRole("img"));
    view.rerender(<PublicActivityMapImage src="https://maps.example.test/new" />);
    expect(screen.getByRole("img")).toHaveAttribute("src", "https://maps.example.test/new");
    expect(screen.queryByRole("alert")).not.toBeInTheDocument();
  });
});
