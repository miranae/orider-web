import { fireEvent, screen } from "@testing-library/react";
import { describe, expect, it, vi } from "vitest";
import { renderWithProviders } from "../../__tests__/utils/renderWithProviders";
import CourseEditPage from "./CourseEditPage";

vi.mock("react-router-dom", async importOriginal => ({
  ...await importOriginal<typeof import("react-router-dom")>(),
  useParams: () => ({ courseId: "course-1" }),
}));

describe("course edit login gate", () => {
  it("로그인 전 관문 문구를 누르면 로그인 창을 열고, 새 버튼은 만들지 않는다", async () => {
    renderWithProviders(<CourseEditPage />, { route: "/ko/course/course-1/edit" });
    fireEvent.click(await screen.findByText("로그인이 필요합니다"));
    expect(screen.queryByRole("button", { name: "로그인" })).not.toBeInTheDocument();
    expect(await screen.findByRole("dialog", { name: "로그인" })).toBeInTheDocument();
  });
});
