import { act, fireEvent, render, screen, waitFor } from "@testing-library/react";
import { NotificationPreferencesCard } from "./NotificationPreferencesCard";
const mock = vi.hoisted(() => ({ user: { uid: "viewer", isAnonymous: false } as { uid: string; isAnonymous: boolean } | null, get: vi.fn(), set: vi.fn(), signIn: vi.fn() }));
vi.mock("../../contexts/AuthContext", () => ({ useAuth: () => ({ user: mock.user, signIn: mock.signIn }) }));
vi.mock("../../services/webNotifications", () => ({ createWebNotificationClient: () => ({ getPreferences: mock.get, setPreferences: mock.set }) }));
const defaults = { push: true, kudos: true, comment: true, weeklyDigestEmail: false };
beforeEach(() => { vi.clearAllMocks(); mock.user = { uid: "viewer", isAnonymous: false }; mock.get.mockResolvedValue(defaults); });
it("keeps inbox independent, saves only the changed field and does not optimistically enable email", async () => {
  let finish!: (value: unknown) => void; mock.set.mockReturnValue(new Promise(resolve => { finish = resolve; }));
  render(<NotificationPreferencesCard />);
  const email = await screen.findByRole("switch", { name: "주간 활동 요약 이메일" }); expect(email).not.toBeChecked();
  fireEvent.click(email); expect(mock.set).toHaveBeenCalledWith({ weeklyDigestEmail: true }); expect(email).not.toBeChecked(); expect(email).toBeDisabled();
  await act(async () => finish({ ...defaults, weeklyDigestEmail: true })); expect(email).toBeChecked();
  expect(screen.getByText("푸시를 꺼도 받은 알림 목록은 유지됩니다.")).toBeInTheDocument();
});
it("preserves confirmed values after a failed save and permits retry", async () => {
  mock.set.mockRejectedValueOnce(new Error("offline")); render(<NotificationPreferencesCard />);
  const push = await screen.findByRole("switch", { name: "일반 푸시 알림" }); fireEvent.click(push);
  await screen.findByRole("alert"); expect(push).toBeChecked(); expect(push).not.toBeDisabled();
  mock.set.mockResolvedValue({ ...defaults, push: false }); fireEvent.click(push);
  await waitFor(() => expect(push).not.toBeChecked()); expect(screen.getByRole("switch", { name: "댓글·답글 푸시" })).toBeChecked();
});
it("drops old settings and late writes when the same UID receives a replacement User object", async () => {
  let finish!: (value: unknown) => void; mock.set.mockReturnValue(new Promise(resolve => { finish = resolve; }));
  const view = render(<NotificationPreferencesCard />); fireEvent.click(await screen.findByRole("switch", { name: "일반 푸시 알림" }));
  mock.user = { uid: "viewer", isAnonymous: false }; mock.get.mockResolvedValue({ ...defaults, comment: false }); view.rerender(<NotificationPreferencesCard />);
  await waitFor(() => expect(screen.getByRole("switch", { name: "댓글·답글 푸시" })).not.toBeChecked());
  await act(async () => finish({ ...defaults, push: false })); expect(screen.getByRole("switch", { name: "일반 푸시 알림" })).toBeChecked();
});

it("shows a failed initial load without a retry button", async () => {
  mock.get.mockRejectedValueOnce(new Error("offline")); render(<NotificationPreferencesCard />);
  // 계정 화면에는 "다시 불러오기" 버튼을 두지 않는다.
  expect(await screen.findByRole("alert")).toBeInTheDocument();
  expect(screen.queryByRole("button", { name: "다시 불러오기" })).not.toBeInTheDocument();
});
it("clears settings on permission denial", async () => {
  render(<NotificationPreferencesCard />);
  const push = await screen.findByRole("switch", { name: "일반 푸시 알림" });
  mock.set.mockRejectedValueOnce({ code: "functions/permission-denied" }); fireEvent.click(push);
  await waitFor(() => expect(screen.queryByRole("switch")).not.toBeInTheDocument());
  expect(screen.getByRole("alert")).toBeInTheDocument();
});

it("tapping the load failure message reloads without adding a button", async () => {
  mock.get.mockRejectedValueOnce(new Error("offline")); render(<NotificationPreferencesCard />);
  const message = await screen.findByRole("button", { name: "알림 설정을 불러오지 못했습니다." });
  expect(screen.getAllByRole("button")).toHaveLength(1);
  fireEvent.click(message);
  expect(await screen.findByRole("switch", { name: "일반 푸시 알림" })).toBeChecked();
  expect(mock.get).toHaveBeenCalledTimes(2);
  expect(screen.queryByRole("alert")).not.toBeInTheDocument();
});
it("tapping the message after a permission denial reloads the settings", async () => {
  render(<NotificationPreferencesCard />);
  const push = await screen.findByRole("switch", { name: "일반 푸시 알림" });
  mock.set.mockRejectedValueOnce({ code: "functions/permission-denied" }); fireEvent.click(push);
  await waitFor(() => expect(screen.queryByRole("switch")).not.toBeInTheDocument());
  fireEvent.click(screen.getByRole("button", { name: "알림 설정을 불러오지 못했습니다." }));
  expect(await screen.findByRole("switch", { name: "일반 푸시 알림" })).toBeInTheDocument();
  expect(mock.get).toHaveBeenCalledTimes(2);
});

it("tapping the sign-in required message opens sign-in without adding a button", () => {
  mock.user = null; render(<NotificationPreferencesCard />);
  const message = screen.getByRole("button", { name: "로그인이 필요합니다." });
  expect(screen.getAllByRole("button")).toHaveLength(1);
  fireEvent.click(message);
  expect(mock.signIn).toHaveBeenCalledTimes(1);
  expect(mock.get).not.toHaveBeenCalled();
});
