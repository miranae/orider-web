import { screen } from "@testing-library/react";
import { renderWithProviders } from "../__tests__/utils/renderWithProviders";
import AiCoachPolicyPage from "./AiCoachPolicyPage";
import { publicCoachPolicy } from "../features/coach/publicCoachPolicy";

it("lets a signed-out visitor read the policy without requesting personal consent", () => {
  renderWithProviders(<AiCoachPolicyPage />, { authenticated: false });
  expect(screen.getByRole("heading", { name: "AI 코치 개인 운동 데이터 이용 동의" })).toBeInTheDocument();
  expect(screen.getByText(publicCoachPolicy().retention)).toBeInTheDocument();
  expect(screen.getByRole("link", { name: "개인정보처리방침 보기" })).toHaveAttribute("href", "https://orider.co.kr/privacy");
  expect(publicCoachPolicy()).not.toHaveProperty("consent");
});
