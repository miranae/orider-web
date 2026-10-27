import { act, render, screen, waitFor } from "@testing-library/react";
import { MemoryRouter } from "react-router-dom";
import { beforeEach, expect, it, vi } from "vitest";
import { ActivityPublicAccess } from "./ActivityPublicAccess";
import type { PublicActivityDetail } from "../../../services/publicActivityDetail";
const state = vi.hoisted(() => ({ user: { uid: "viewer" }, load: vi.fn() }));
vi.mock("../../../contexts/AuthContext", () => ({ useAuth: () => ({ user: state.user }) }));
vi.mock("../../../services/publicActivityDetail", () => ({ createPublicActivityClient: () => ({ load: state.load }), isPublicActivityAccessError: (error: {code?: string}) => error.code === "functions/permission-denied" }));
const detail = { activity: { id: "a", userId: "owner", source: "health_connect", groupId: "g", groupRideId: "ride", segmentEffortCount: 4, description: "기존 상세", summary: {}, activityRevision: "r1" }, viewerHasKudos: false, metrics: { schemaVersion: 3, status: "final", metrics: { version: 41, avgPower: 0 } }, content: { activityId: "a", status: "ready", comments: [] } } as unknown as PublicActivityDetail;
const options = { activityId: "a", retryKey: 0, onReady: () => {}, onError: () => {} };
function Probe() { return <MemoryRouter><ActivityPublicAccess {...options}>{({model}) => <output>{JSON.stringify({ source: model.activity?.source, group: model.activity?.groupRideId, count: model.activity?.segmentEffortCount, power: model.metrics.metrics?.avgPower })}</output>}</ActivityPublicAccess></MemoryRouter>; }
beforeEach(() => { state.user = { uid: "viewer" }; state.load.mockReset().mockResolvedValue(detail); });
it("retains the server's source, group, segment count and measured zero in the shared model", async () => {
  render(<Probe />);
  expect(await screen.findByText('{"source":"health_connect","group":"ride","count":4,"power":0}')).toBeVisible();
});
it("masks the previous detail immediately on same-UID session replacement", async () => {
  const view = render(<Probe />);
  await screen.findByText(/health_connect/);
  let resolve!: (value: PublicActivityDetail) => void;
  state.load.mockReturnValue(new Promise(yes => { resolve = yes; }));
  state.user = { uid: "viewer" }; view.rerender(<Probe />);
  expect(screen.queryByText(/health_connect/)).not.toBeInTheDocument();
  await act(async () => resolve(detail));
  expect(await screen.findByText(/health_connect/)).toBeVisible();
});
it("hides existing analysis during current-permission revalidation and removes it after denial", async () => {
  render(<Probe />); await screen.findByText(/health_connect/);
  state.load.mockRejectedValue({ code: "functions/permission-denied" });
  act(() => window.dispatchEvent(new Event("focus")));
  expect(screen.getByText(/health_connect/)).not.toBeVisible();
  await waitFor(() => expect(screen.queryByText(/health_connect/)).not.toBeInTheDocument());
});
