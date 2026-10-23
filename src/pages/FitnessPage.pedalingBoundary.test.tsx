import { screen, waitFor } from "@testing-library/react";
import type { ReactNode } from "react";
import { beforeEach, describe, expect, it, vi } from "vitest";
import { renderWithProviders } from "../__tests__/utils/renderWithProviders";
import { setCollectionDocs, setDocData } from "../__tests__/mocks/firebase";
import { useFitnessModel } from "../hooks/useFitnessModel";
import { FitnessView } from "./FitnessPage";
const pedaling = vi.hoisted(() => vi.fn());
vi.mock("../features/fitness/components/FitnessPedalingEvidence", () => ({ default: (props: unknown) => { pedaling(props); return <div data-testid="legacy-pedaling" />; } }));
vi.mock("../hooks/useMobile", () => ({ useMobile: () => true }));
vi.mock("../components/mobile/MobileFitnessPage", () => ({ default: ({ ridingEvidenceSlot }: { ridingEvidenceSlot?: ReactNode }) => <div data-testid="fitness-ready">{ridingEvidenceSlot}</div> }));
function Fixture({ embedded = false }: { embedded?: boolean }) { const model = useFitnessModel("bike"); return <><output data-testid="read-state" data-ready={String(model.freshLoaded && !model.loading)} /><FitnessView model={model} embedded={embedded} part="analysis" /></>; }
beforeEach(() => {
  pedaling.mockClear();
  setDocData("users/test-uid/fitness/activity_window", { version: 1, windowDays: 90, maxEntries: 768, generation: 1, updatedAt: Date.now(), truncated: false, entries: [] });
});
describe("coach activity-detail boundary", () => {
  it.each([0, 1, 1000])("does not mount the per-activity sensor chooser or its reader for %s normal web activities", async count => {
    setCollectionDocs("activities", Array.from({ length: count }, (_, i) => ({ id: `ride-${i}`, userId: "test-uid", type: "Ride", startTime: Date.now() - i * 60000, deletedAt: null, summary: { distance: 20000 } })));
    renderWithProviders(<Fixture />, { authenticated: true, route: "/ko/coach/analysis?sport=bike" });
    await waitFor(() => expect(screen.getByTestId("read-state")).toHaveAttribute("data-ready", "true"));
    expect(pedaling).not.toHaveBeenCalled();
    expect(screen.queryByTestId("legacy-pedaling")).not.toBeInTheDocument();
    expect(screen.queryByRole("combobox", { name: "분석할 라이딩" })).not.toBeInTheDocument();
  });
  it("keeps the embedded legacy pedaling contract", async () => {
    setCollectionDocs("activities", [{ id: "legacy", userId: "test-uid", type: "Ride", startTime: Date.now(), deletedAt: null, summary: { distance: 20000 } }]);
    renderWithProviders(<Fixture embedded />, { authenticated: true, route: "/ko/coach/analysis?sport=bike" });
    expect(await screen.findByTestId("legacy-pedaling")).toBeInTheDocument();
    expect(pedaling).toHaveBeenCalled();
  });
});
