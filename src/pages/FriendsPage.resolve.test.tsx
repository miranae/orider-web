import { fireEvent, screen, waitFor } from "@testing-library/react";
import { onSnapshot } from "firebase/firestore";
import FriendsPage from "./FriendsPage";
import { renderWithProviders } from "../__tests__/utils/renderWithProviders";
import { simulateLogin } from "../__tests__/mocks/firebase";
import * as errorLogger from "../services/errorLogger";

// 경고·알림 문구 자체를 누르면 해소한다 — 「다시 시도」 버튼을 새로 두지 않는다.
describe("친구 화면 경고 문구를 누르면 해결로", () => {
  it("친구 정보 읽기 실패 문구를 누르면 구독을 다시 열고, 실패는 기록한다", async () => {
    const logged = vi.spyOn(errorLogger, "logClientError");
    const original = vi.mocked(onSnapshot).getMockImplementation()!;
    let friendReads = 0;
    vi.mocked(onSnapshot).mockImplementation(((ref: { path: string }, next: unknown, error: (failure: Error) => void) => {
      // 실제 Firestore 처럼 오류는 구독 뒤 비동기로 온다.
      if (ref.path === "friends/test-uid/users" && ++friendReads === 1) { setTimeout(() => error(new Error("offline")), 0); return () => {}; }
      return (original as (...args: unknown[]) => () => void)(ref, next, error);
    }) as never);
    renderWithProviders(<FriendsPage />, { authenticated: true });
    const failure = await screen.findByRole("button", { name: "친구 정보를 읽지 못했어요. 다시 시도해주세요." });
    expect(screen.queryByRole("button", { name: "다시 시도" })).toBeNull();
    expect(logged).toHaveBeenCalledWith("useFriends.friends", expect.any(Error), expect.anything());
    fireEvent.click(failure);
    await waitFor(() => expect(screen.queryByTestId("P3.error")).toBeNull());
    expect(friendReads).toBe(2);
    vi.mocked(onSnapshot).mockImplementation(original);
    logged.mockRestore();
  });

  it("친구 코드 복사 실패 알림은 사실대로 말하고, 누르면 같은 계정에서만 다시 복사한다", async () => {
    const writeText = vi.fn().mockRejectedValueOnce(new Error("denied")).mockResolvedValue(undefined);
    Object.defineProperty(navigator, "clipboard", { value: { writeText }, configurable: true });
    renderWithProviders(<FriendsPage />, { authenticated: true, profile: { friendCode: "ABC123" } });
    await screen.findByText("ABC123");
    fireEvent.click(screen.getByRole("button", { name: "복사" }));
    const toast = await screen.findByRole("button", { name: "공유하거나 복사하지 못했어요" });
    fireEvent.click(toast);
    await waitFor(() => expect(writeText).toHaveBeenCalledTimes(2));
    expect(writeText).toHaveBeenLastCalledWith("ABC123");
  });

  it("다른 계정으로 바뀐 뒤에는 남은 복사 실패 알림을 눌러도 이전 계정의 코드를 복사하지 않는다", async () => {
    const writeText = vi.fn().mockRejectedValue(new Error("denied"));
    Object.defineProperty(navigator, "clipboard", { value: { writeText }, configurable: true });
    renderWithProviders(<FriendsPage />, { authenticated: true, profile: { friendCode: "ABC123" } });
    await screen.findByText("ABC123");
    fireEvent.click(screen.getByRole("button", { name: "복사" }));
    const toast = await screen.findByRole("button", { name: "공유하거나 복사하지 못했어요" });
    simulateLogin({ uid: "someone-else" });
    fireEvent.click(toast);
    await new Promise(resolve => setTimeout(resolve, 0));
    expect(writeText).toHaveBeenCalledTimes(1);
  });
});
