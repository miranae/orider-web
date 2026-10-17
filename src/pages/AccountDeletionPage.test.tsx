import { act, fireEvent, render, screen, waitFor } from "@testing-library/react";
import { MemoryRouter } from "react-router-dom";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import AccountDeletionPage from "./AccountDeletionPage";

const mocks = vi.hoisted(() => ({
  user: { uid: "u1", email: "review@example.test" } as { uid: string; email: string } | null,
  status: vi.fn(), request: vi.fn(), reauth: vi.fn(), signIn: vi.fn(), readReceipt: vi.fn(), saveReceipt: vi.fn(),
}));
vi.mock("../contexts/AuthContext", () => ({ useAuth: () => ({ user: mocks.user, loading: false, signInWithGoogle: mocks.signIn }) }));
vi.mock("react-i18next", () => ({ useTranslation: () => ({ t: (key: string) => key }) }));
vi.mock("../services/accountDeletion", () => ({
  getAccountDeletionStatus: mocks.status,
  readAccountDeletionReceipt: mocks.readReceipt,
  saveAccountDeletionReceipt: mocks.saveReceipt,
  requestAccountDeletion: mocks.request,
  reauthenticateAccountDeletion: mocks.reauth,
  requiresDeletionOwnerLogin: (error: { details?: { reason?: string } }) => error.details?.reason === "requires-owner-login",
  requiresDeletionReauthentication: (error: { details?: { reason?: string } }) => error.details?.reason === "requires-recent-login",
}));

function renderPage() { return render(<MemoryRouter><AccountDeletionPage /></MemoryRouter>); }
async function confirmAndSubmit() {
  await screen.findByLabelText("accountDeletion.confirm");
  fireEvent.change(screen.getByLabelText("accountDeletion.confirm"), { target: { value: "DELETE" } });
  fireEvent.click(screen.getByRole("button", { name: "accountDeletion.submit" }));
}

describe("account deletion request", () => {
  beforeEach(() => {
    mocks.user = { uid: "u1", email: "review@example.test" };
    mocks.readReceipt.mockReset().mockReturnValue(null);
    mocks.saveReceipt.mockReset();
    mocks.status.mockReset().mockResolvedValue(null);
    mocks.request.mockReset().mockResolvedValue({ state: "pending", requestedAtMs: 1 });
    mocks.reauth.mockReset().mockResolvedValue(undefined);
  });
  afterEach(() => { vi.useRealTimers(); });

  it("explains deletion publicly without requiring app installation or login", () => {
    mocks.user = null;
    renderPage();
    expect(screen.getByText("accountDeletion.scope")).toBeInTheDocument();
    expect(screen.getByRole("button", { name: "accountDeletion.signIn" })).toBeInTheDocument();
    expect(mocks.status).not.toHaveBeenCalled();
  });

  it("requires typed confirmation and never calls deletion on initial render", async () => {
    renderPage();
    await screen.findByLabelText("accountDeletion.confirm");
    expect(screen.getByRole("button", { name: "accountDeletion.submit" })).toBeDisabled();
    expect(mocks.request).not.toHaveBeenCalled();
  });

  it("does not claim completion when a request fails", async () => {
    mocks.request.mockRejectedValue(new Error("network"));
    renderPage();
    await confirmAndSubmit();
    expect(await screen.findByRole("alert")).toHaveTextContent("accountDeletion.requestFailed");
    expect(screen.queryByText("accountDeletion.state.complete")).not.toBeInTheDocument();
  });

  it("shows pending and polls until explicit server completion", async () => {
    mocks.status.mockResolvedValueOnce(null).mockResolvedValueOnce({ state: "processing", requestedAtMs: 1 }).mockResolvedValueOnce({ state: "complete", requestedAtMs: 1, completedAtMs: 2 });
    renderPage();
    await confirmAndSubmit();
    await screen.findByText("accountDeletion.state.processing");
    expect(screen.queryByText("accountDeletion.state.complete")).not.toBeInTheDocument();
    await waitFor(() => expect(screen.getByText("accountDeletion.state.complete")).toBeInTheDocument(), { timeout: 6500 });
    expect(mocks.request).toHaveBeenCalledTimes(1);
  }, 8000);

  it("never treats loss of authentication as deletion completion", async () => {
    mocks.status.mockResolvedValue({ state: "retrying", requestedAtMs: 1 });
    const { rerender } = renderPage();
    await screen.findByText("accountDeletion.state.retrying");
    mocks.user = null;
    await act(async () => rerender(<MemoryRouter><AccountDeletionPage /></MemoryRouter>));
    expect(screen.queryByText("accountDeletion.state.complete")).not.toBeInTheDocument();
  });

  it("reauthenticates only on an explicit action and requires a new deletion submission", async () => {
    mocks.request.mockRejectedValue({ details: { reason: "requires-recent-login" } });
    renderPage();
    await confirmAndSubmit();
    await screen.findByText("accountDeletion.reauthRequired");
    expect(mocks.reauth).not.toHaveBeenCalled();
    fireEvent.click(screen.getByRole("button", { name: "accountDeletion.reauthenticate" }));
    await waitFor(() => expect(mocks.reauth).toHaveBeenCalledTimes(1));
    expect(mocks.request).toHaveBeenCalledTimes(1);
    expect(screen.queryByText("accountDeletion.state.complete")).not.toBeInTheDocument();
  });

  it("does not enable a deletion request when existing status is unavailable", async () => {
    mocks.status.mockRejectedValue(new Error("unavailable"));
    renderPage();
    expect(await screen.findByRole("alert")).toHaveTextContent("accountDeletion.statusFailed");
    expect(screen.queryByRole("button", { name: "accountDeletion.submit" })).not.toBeInTheDocument();
  });
  it("keeps polling with a browser receipt after authentication is lost", async () => {
    const receipt = "a".repeat(32) + "." + "b".repeat(64);
    mocks.readReceipt.mockReturnValue({ owner: "u1", receipt });
    mocks.status.mockResolvedValueOnce({ state: "processing", requestedAtMs: 1 }).mockResolvedValueOnce({ state: "complete", requestedAtMs: 1, completedAtMs: 2 });
    const { rerender } = renderPage();
    await screen.findByText("accountDeletion.state.processing");
    mocks.user = null;
    rerender(<MemoryRouter><AccountDeletionPage /></MemoryRouter>);
    await screen.findByText("accountDeletion.state.complete");
    expect(mocks.status).toHaveBeenLastCalledWith(receipt);
    expect(screen.queryByRole("button", { name: "accountDeletion.signIn" })).not.toBeInTheDocument();
  });

  it("does not show the previous account's deletion state to another signed-in user", async () => {
    mocks.status.mockResolvedValueOnce({ state: "processing", requestedAtMs: 1 });
    const { rerender } = renderPage();
    await screen.findByText("accountDeletion.state.processing");
    mocks.status.mockResolvedValue(null);
    mocks.user = { uid: "u2", email: "other@example.test" };
    rerender(<MemoryRouter><AccountDeletionPage /></MemoryRouter>);
    await screen.findByLabelText("accountDeletion.confirm");
    expect(screen.queryByText("accountDeletion.state.processing")).not.toBeInTheDocument();
  });
  it("keeps the accepted state and explains memory-only progress when storage is blocked", async () => {
    mocks.saveReceipt.mockReturnValue(false);
    mocks.status.mockResolvedValueOnce(null).mockResolvedValue({ state: "processing", requestedAtMs: 1 });
    renderPage();
    await confirmAndSubmit();
    await screen.findByText("accountDeletion.state.processing");
    expect(screen.getByText("accountDeletion.sessionUnavailable")).toBeInTheDocument();
    expect(screen.queryByText("accountDeletion.requestFailed")).not.toBeInTheDocument();
  });
  it("distinguishes active first-party completion from provider processing", async () => {
    mocks.status.mockResolvedValue({ state: "complete", requestedAtMs: 1, completedAtMs: 2, providerDeletionRequested: true });
    renderPage();
    await screen.findByText("accountDeletion.state.complete");
    expect(screen.getByText("accountDeletion.providerProcessing")).toBeInTheDocument();
    expect(screen.getByText("accountDeletion.backupRetention")).toBeInTheDocument();
    expect(screen.getByRole("link", { name: "accountDeletion.providerPolicy" })).toHaveAttribute("href", "https://firebase.google.com/support/privacy");
  });

  it("explains why delegated or guest sessions need original-owner verification", async () => {
    mocks.request.mockRejectedValue({ details: { reason: "requires-owner-login" } });
    renderPage();
    await confirmAndSubmit();
    await screen.findByText("accountDeletion.ownerLoginRequired");
    expect(screen.getByRole("button", { name: "accountDeletion.submit" })).toBeDisabled();
    expect(mocks.reauth).not.toHaveBeenCalled();
    expect(screen.queryByText("accountDeletion.state.complete")).not.toBeInTheDocument();
  });
  it("discards an old request response after another account signed in and out", async () => {
    let resolve!: (value: unknown) => void;
    mocks.request.mockReturnValue(new Promise(value => { resolve = value; }));
    const { rerender } = renderPage();
    await confirmAndSubmit();
    mocks.user = { uid: "u2", email: "other@example.test" };
    rerender(<MemoryRouter><AccountDeletionPage /></MemoryRouter>);
    mocks.user = null;
    rerender(<MemoryRouter><AccountDeletionPage /></MemoryRouter>);
    await act(async () => { resolve({ state: "pending", requestedAtMs: 1, receipt: "a".repeat(32) + "." + "b".repeat(64) }); });
    expect(mocks.saveReceipt).not.toHaveBeenCalled();
    expect(screen.queryByText("accountDeletion.state.pending")).not.toBeInTheDocument();
  });
});
