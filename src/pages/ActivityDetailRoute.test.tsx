import { act, cleanup, render, screen } from "@testing-library/react";
import { MemoryRouter, Route, Routes } from "react-router-dom";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import ActivityDetailRoute from "./ActivityDetailRoute";
const mocks = vi.hoisted(() => ({ load: vi.fn(), getDocs: vi.fn(), uid: "viewer", enabled: true, auth: { currentUser: { uid: "viewer" } }, owner: vi.fn() }));
vi.mock("../services/runtimeConfig", () => ({ getRuntimeConfig: () => ({ publicActivityDetailEnabled: mocks.enabled }) }));
vi.mock("../contexts/AuthContext", () => ({ useAuth: () => ({ user: mocks.auth.currentUser, loading: false }) }));
vi.mock("../contexts/FirebaseServicesContext", () => ({ useFirebaseServices: () => services }));
const services = { auth: mocks.auth, firestore: {} };
vi.mock("../services/publicActivityDetail", () => ({ isPublicActivityAccessError: () => false, createPublicActivityClient: () => ({ load: mocks.load }) }));
vi.mock("firebase/firestore", () => ({ collection: vi.fn(), documentId: () => "__name__", getDocs: mocks.getDocs, query: vi.fn(), where: vi.fn(), limit: vi.fn() }));
vi.mock("./ActivityPage", () => ({ default: () => { mocks.owner(); return <div>owner analysis</div>; } }));
vi.mock("../embedded/surfaces/PublicActivitySurface", () => ({ default: () => <div>public detail</div> }));
function route() { return <MemoryRouter initialEntries={["/activity/native"]}><Routes><Route path="/activity/:activityId" element={<ActivityDetailRoute />} /></Routes></MemoryRouter>; }
afterEach(cleanup);
beforeEach(() => { vi.clearAllMocks(); mocks.enabled = true; mocks.uid = "viewer"; mocks.auth.currentUser.uid = "viewer"; mocks.getDocs.mockResolvedValue({ docs: [] }); });
describe("activity route public/owner boundary", () => {
  it("preserves the full existing activity page and avoids the new API while rollout is off", async () => {
    mocks.enabled = false;
    render(route());
    expect(await screen.findByText("owner analysis")).toBeInTheDocument();
    expect(mocks.load).not.toHaveBeenCalled();
  });
  it("never mounts owner data hooks for another person's activity", async () => {
    mocks.load.mockResolvedValue({ activity: { id: "native", userId: "owner" } });
    render(route());
    expect(await screen.findByText("public detail")).toBeInTheDocument();
    expect(mocks.owner).not.toHaveBeenCalled();
    expect(mocks.getDocs).not.toHaveBeenCalled();
  });
  it("preserves the existing owner analysis page", async () => {
    mocks.load.mockResolvedValue({ activity: { id: "native", userId: "viewer" } });
    render(route());
    expect(await screen.findByText("owner analysis")).toBeInTheDocument();
  });
  it("keeps owner analysis available before the new callable is deployed", async () => {
    mocks.load.mockRejectedValue(new Error("not deployed"));
    mocks.getDocs.mockResolvedValue({ docs: [{ id: "native", data: () => ({ userId: "viewer" }) }] });
    render(route());
    expect(await screen.findByText("owner analysis")).toBeInTheDocument();
  });
  it("fails closed when fallback cannot prove current ownership", async () => {
    mocks.load.mockRejectedValue(new Error("permission denied"));
    mocks.getDocs.mockResolvedValue({ docs: [{ id: "native", data: () => ({ userId: "owner" }) }] });
    render(route());
    await screen.findByRole("alert");
    expect(mocks.owner).not.toHaveBeenCalled();
  });
  it("does not mount an old owner result after account change", async () => {
    let resolve!: (data: unknown) => void;
    mocks.load.mockReturnValueOnce(new Promise(r => { resolve = r; })).mockRejectedValue(new Error("denied"));
    const view = render(route());
    mocks.uid = "next"; mocks.auth.currentUser.uid = "next";
    view.rerender(route());
    await act(async () => resolve({ activity: { id: "native", userId: "viewer" } }));
    expect(mocks.owner).not.toHaveBeenCalled();
  });
});

it("clears the previous owner surface immediately for a new session with the same uid", async () => {
  mocks.load.mockResolvedValueOnce({ activity: { id: "native", userId: "viewer" } }).mockReturnValueOnce(new Promise(() => {}));
  const view = render(route());
  expect(await screen.findByText("owner analysis")).toBeInTheDocument();
  mocks.auth.currentUser = { uid: "viewer" };
  view.rerender(route());
  expect(screen.queryByText("owner analysis")).not.toBeInTheDocument();
});
