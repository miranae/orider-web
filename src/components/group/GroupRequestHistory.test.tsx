import { screen, waitFor } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import { limit } from "firebase/firestore";
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
});
