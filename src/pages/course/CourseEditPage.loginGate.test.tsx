import { fireEvent, screen } from "@testing-library/react";
import { describe, expect, it, vi } from "vitest";
import { renderWithProviders } from "../../__tests__/utils/renderWithProviders";
import CourseEditPage from "./CourseEditPage";

vi.mock("react-router-dom", async importOriginal => ({
  ...await importOriginal<typeof import("react-router-dom")>(),
  useParams: () => ({ courseId: "course-1" }),
}));

describe("course edit login gate", () => {
  it("로그인 전 관문에서 로그인 버튼이 로그인 창을 연다", async () => {
    renderWithProviders(<CourseEditPage />, { route: "/ko/course/course-1/edit" });
    fireEvent.click(await screen.findByRole("button", { name: "로그인" }));
    expect(await screen.findByRole("dialog", { name: "로그인" })).toBeInTheDocument();
  });
});
