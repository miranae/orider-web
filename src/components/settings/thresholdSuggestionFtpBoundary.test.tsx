import { fireEvent, screen, waitFor } from "@testing-library/react";
import type { ReactNode } from "react";
import { beforeEach, describe, expect, it, vi } from "vitest";

import { renderWithProviders } from "../../__tests__/utils/renderWithProviders";
import { ThresholdSuggestionBanner } from "./ThresholdSuggestionBanner";

const mocks = vi.hoisted(() => ({
  callable: vi.fn(),
  decision: null as null | { evidence: { activityId: string } },
  legacy: {
    ftp: { proposed: 265, current: 250, deltaPct: 6, reason: "20분 파워" },
    createdAt: 100,
  },
  user: { uid: "uid-1" },
}));

vi.mock("firebase/firestore", () => ({
  collection: vi.fn(() => ({})),
  doc: vi.fn(() => ({})),
  limit: vi.fn(() => ({})),
  orderBy: vi.fn(() => ({})),
  query: vi.fn(() => ({})),
  setDoc: vi.fn(),
  onSnapshot: vi.fn((_query, next) => {
    next({ docs: [{ id: "activity-1", data: () => mocks.legacy }] });
    return vi.fn();
  }),
}));
vi.mock("firebase/functions", () => ({ httpsCallable: vi.fn(() => mocks.callable) }));
vi.mock("../../services/firebase", () => ({ firestore: {}, functions: {} }));
vi.mock("../../contexts/AuthContext", () => ({
  AuthProvider: ({ children }: { children: ReactNode }) => children,
  useAuth: () => ({ user: mocks.user }),
}));
vi.mock("../../contexts/ToastContext", () => ({
  ToastProvider: ({ children }: { children: ReactNode }) => children,
  useToast: () => ({ showToast: vi.fn() }),
}));
vi.mock("../../hooks/useBikeFtpDecision", () => ({
  useBikeFtpDecision: () => ({ decision: mocks.decision, loading: false }),
}));

describe("Settings FTP suggestion producer compatibility", () => {
  beforeEach(() => {
    mocks.decision = null;
    mocks.callable.mockReset();
    mocks.callable.mockResolvedValue({ data: { ok: true, applied: { ftp: 265 } } });
  });

  it("keeps legacy FTP acceptance when the v2 producer is OFF", async () => {
    renderWithProviders(<ThresholdSuggestionBanner />);
    expect(screen.queryByRole("link", { name: "FTP는 Fitness에서 검토" })).not.toBeInTheDocument();
    fireEvent.click(screen.getByRole("button", { name: "전부 적용" }));
    await waitFor(() => expect(mocks.callable).toHaveBeenCalledWith({
      activityId: "activity-1",
      fields: { ftp: true, lthr: false, maxHr: false },
    }));
  });

  it("replaces legacy FTP acceptance only after a matching v2 decision is confirmed", () => {
    mocks.decision = { evidence: { activityId: "activity-1" } };
    renderWithProviders(<ThresholdSuggestionBanner />);
    expect(screen.getByRole("link", { name: "FTP는 Fitness에서 검토" }))
      .toHaveAttribute("href", "/ko/fitness?sport=bike");
    expect(screen.queryByRole("button", { name: "전부 적용" })).not.toBeInTheDocument();
  });
});
