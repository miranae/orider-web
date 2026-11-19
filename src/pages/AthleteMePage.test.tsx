import { render, screen } from "@testing-library/react";
import AthleteMePage from "./AthleteMePage";

const session = vi.hoisted(() => ({ user: null as { uid: string } | null, loading: true, signIn: vi.fn() }));
vi.mock("../contexts/AuthContext", () => ({ useAuth: () => session }));
vi.mock("./AthletePage", () => ({ default: ({ meUserId }: { meUserId: string }) => <h1>프로필 {meUserId}</h1> }));

it("shows an auth placeholder before opening the current user's profile", () => {
  const view = render(<AthleteMePage />);
  expect(screen.getByRole("status", { name: "불러오는 중" })).toBeInTheDocument();
  expect(screen.queryByRole("heading")).not.toBeInTheDocument();
  session.user = { uid: "current-owner" };
  session.loading = false;
  view.rerender(<AthleteMePage />);
  expect(screen.getByRole("heading", { name: "프로필 current-owner" })).toBeInTheDocument();
  expect(screen.queryByRole("status")).not.toBeInTheDocument();
});
