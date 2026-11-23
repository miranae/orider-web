import { screen, waitFor } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import { limit, onSnapshot } from "firebase/firestore";
import { beforeEach, describe, expect, it, vi } from "vitest";
import { renderWithProviders } from "../../__tests__/utils/renderWithProviders";
import { mockCallableInvocations, setCallableImplementation, setCollectionDocs } from "../../__tests__/mocks/firebase";
import GroupRequestHistory from "./GroupRequestHistory";
const state = vi.hoisted(() => ({ confirm: vi.fn() }));
vi.mock("../../contexts/DialogContext", () => ({ useDialog: () => ({ confirm: state.confirm }) }));
vi.mock("../../services/publicProfiles", () => ({ getPublicUserProfiles: async () => new Map([["rider", { nickname: "Rider nickname" }]]) }));
beforeEach(() => { state.confirm.mockReset().mockResolvedValue(true); mockCallableInvocations.length = 0; });
describe("GroupRequestHistory", () => {
  it("omits the empty card and bounds history reads", async () => {
    renderWithProviders(<GroupRequestHistory userId="test-uid" />, { authenticated: true });
    await waitFor(() => expect(limit).toHaveBeenCalledWith(10));
    expect(screen.queryByTestId("C0-1-3")).not.toBeInTheDocument();
  });
  it("keeps history collapsed, confirms cancellation and retains rows on write failure", async () => {
    setCollectionDocs("users/test-uid/group_requests", [{ id: "request", userId: "test-uid", groupId: "club", groupName: "My club", status: "pending", requestedAt: 1 }]);
    setCallableImplementation("cancelGroupRequest", () => { throw new Error("unavailable"); });
    renderWithProviders(<GroupRequestHistory userId="test-uid" />, { authenticated: true });
    const card = await screen.findByTestId("C0-1-3");
    expect(card.querySelector("details")).not.toHaveAttribute("open");
    await userEvent.click(screen.getByText("가입 요청 이력"));
    await userEvent.click(screen.getByRole("button", { name: "요청 취소" }));
    await waitFor(() => expect(state.confirm).toHaveBeenCalledWith("이 가입 요청을 취소할까요?", { destructive: true }));
    expect(await screen.findByRole("alert")).toHaveTextContent("요청을 취소하지 못했어요");
    expect(screen.getByText(/My club/)).toBeInTheDocument();
    expect(screen.getByRole("button", { name: "요청 취소" })).toBeEnabled();
  });
  it("keeps the phone join-request row for past requests and hides it without any history", async () => {
    setCollectionDocs("users/test-uid/group_requests", [{ id: "old", userId: "test-uid", groupId: "club", groupName: "Past club", status: "approved", requestedAt: 1, resolvedAt: 2 }]);
    const view = renderWithProviders(<GroupRequestHistory userId="test-uid" row={{ label: "가입 신청" }} />, { authenticated: true });
    const row = await screen.findByTestId("C0-1-4");
    expect(row).toHaveTextContent(/^가입 신청$/);
    expect(row.closest("details")).not.toHaveAttribute("open");
    await userEvent.click(row);
    expect(row.closest("details")).toHaveAttribute("open");
    expect(screen.getByText(/Past club · 승인됨/)).toBeVisible();
    view.unmount();

    setCollectionDocs("users/test-uid/group_requests", []);
    renderWithProviders(<GroupRequestHistory userId="test-uid" row={{ label: "가입 신청" }} />, { authenticated: true });
    await waitFor(() => expect(limit).toHaveBeenCalledWith(10));
    expect(screen.queryByTestId("C0-1-4")).not.toBeInTheDocument();
  });
  it("shows the pending count on the phone row", async () => {
    setCollectionDocs("users/test-uid/group_requests", [{ id: "request", userId: "test-uid", groupId: "club", groupName: "My club", status: "pending", requestedAt: 1 }]);
    renderWithProviders(<GroupRequestHistory userId="test-uid" row={{ label: "가입 신청", count: "1건" }} />, { authenticated: true });
    expect(await screen.findByTestId("C0-1-4")).toHaveTextContent("가입 신청1건");
  });
  it("does not dispatch when confirmation is declined", async () => {
    state.confirm.mockResolvedValue(false);
    setCollectionDocs("users/test-uid/group_requests", [{ id: "request", groupId: "club", groupName: "My club", status: "pending", requestedAt: 1 }]);
    renderWithProviders(<GroupRequestHistory userId="test-uid" />, { authenticated: true });
    await userEvent.click(await screen.findByText("가입 요청 이력"));
    await userEvent.click(screen.getByRole("button", { name: "요청 취소" }));
    expect(mockCallableInvocations.filter(call => call.name === "cancelGroupRequest")).toHaveLength(0);
  });
  it("shows nicknames for manager history instead of raw request user IDs", async () => {
    setCollectionDocs("groups/club/joinRequests", [{ id: "request", userId: "rider", status: "approved", requestedAt: 1 }]);
    renderWithProviders(<GroupRequestHistory groupId="club" />, { authenticated: true });
    expect(await screen.findByText(/Rider nickname/)).toBeInTheDocument();
  });
  it("re-subscribes when the failed-load message itself is tapped, without adding a button", async () => {
    setCollectionDocs("users/test-uid/group_requests", [{ id: "request", groupId: "club", groupName: "My club", status: "approved", requestedAt: 1 }]);
    const original = vi.mocked(onSnapshot).getMockImplementation()!;
    let failing = true;
    vi.mocked(onSnapshot).mockImplementation(((...args: Parameters<typeof original>) => {
      if (!failing) return original(...args);
      (args[2] as (err: Error) => void)(new Error("unavailable"));
      return () => {};
    }) as never);
    try {
      renderWithProviders(<GroupRequestHistory userId="test-uid" />, { authenticated: true });
      await userEvent.click(await screen.findByText("가입 요청 이력"));
      const alert = screen.getByRole("alert");
      expect(screen.getAllByRole("button")).toHaveLength(1);
      failing = false;
      await userEvent.click(alert.querySelector("button")!);
      expect(await screen.findByText(/My club/)).toBeInTheDocument();
    } finally { vi.mocked(onSnapshot).mockImplementation(original); }
  });
});
