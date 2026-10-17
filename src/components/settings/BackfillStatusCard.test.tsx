import { render, screen, waitFor } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import { beforeEach, describe, expect, it, vi } from "vitest";
import { BackfillStatusCard } from "./BackfillStatusCard";
const mocks = vi.hoisted(() => ({ confirm: vi.fn(), call: vi.fn(), toast: vi.fn() }));
vi.mock("firebase/functions", () => ({ httpsCallable: () => mocks.call }));
vi.mock("../../services/firebase", () => ({ functions: {} }));
vi.mock("../../hooks/useBackfillJob", () => ({ useBackfillJob: () => null }));
vi.mock("../../contexts/DialogContext", () => ({ useDialog: () => ({ confirm: mocks.confirm }) }));
vi.mock("../../contexts/ToastContext", () => ({ useToast: () => ({ showToast: mocks.toast }) }));
describe("Backfill request confirmation", () => {
  beforeEach(() => { vi.clearAllMocks(); mocks.call.mockResolvedValue(undefined); });
  it("never starts a recomputation when confirmation is cancelled", async () => {
    mocks.confirm.mockResolvedValue(false);
    render(<BackfillStatusCard uid="owner" />);
    await userEvent.click(screen.getAllByRole("button")[1]!);
    expect(mocks.confirm).toHaveBeenCalledOnce();
    expect(mocks.call).not.toHaveBeenCalled();
  });
  it("preserves the explicit recompute mode after confirmation", async () => {
    mocks.confirm.mockResolvedValue(true);
    render(<BackfillStatusCard uid="owner" />);
    await userEvent.click(screen.getAllByRole("button")[1]!);
    await waitFor(() => expect(mocks.call).toHaveBeenCalledWith({ mode: "recalc-all" }));
  });
  it("reports failed submission and allows retry", async () => {
    mocks.confirm.mockResolvedValue(true); mocks.call.mockRejectedValueOnce(new Error("network"));
    render(<BackfillStatusCard uid="owner" />);
    await userEvent.click(screen.getAllByRole("button")[0]!);
    await waitFor(() => expect(mocks.toast).toHaveBeenCalledOnce());
    expect(screen.getAllByRole("button")[0]).not.toBeDisabled();
  });
});
