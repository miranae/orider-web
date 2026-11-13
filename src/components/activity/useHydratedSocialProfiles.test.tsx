import { act, render, screen, waitFor } from "@testing-library/react";
import { describe, expect, it, vi, beforeEach } from "vitest";
import { useHydratedSocialProfiles } from "./useHydratedSocialProfiles";
import { getPublicUserAvatarProfiles } from "../../services/publicProfiles";
import { logClientError } from "../../services/errorLogger";

const scope = vi.hoisted(() => ({ viewer: { uid: "viewer-a" } as { uid: string } | null,
  services: { firestore: {}, auth: {} } }));
vi.mock("../../contexts/AuthContext", () => ({ useAuth: () => ({ user: scope.viewer }) }));
vi.mock("../../contexts/FirebaseServicesContext", () => ({ useFirebaseServices: () => scope.services }));
vi.mock("../../services/publicProfiles", () => ({
  getPublicUserAvatarProfiles: vi.fn(),
}));

vi.mock("../../services/errorLogger", () => ({
  logClientError: vi.fn(),
}));

function Probe({ image = null }: { image?: string | null }) {
  const items = useHydratedSocialProfiles(
    [{ userId: "user-1", nickname: "경", profileImage: image }],
    "test",
  );
  return <div>{items[0]?.profileImage ?? "fallback"}</div>;
}

describe("useHydratedSocialProfiles", () => {
  beforeEach(() => {
    scope.viewer = { uid: "viewer-a" };
    vi.mocked(getPublicUserAvatarProfiles).mockReset();
    vi.mocked(logClientError).mockReset();
  });

  it("hydrates missing profile images", async () => {
    vi.mocked(getPublicUserAvatarProfiles).mockResolvedValue(
      new Map([["user-1", { id: "user-1", nickname: "경", photoURL: "https://example.com/a.jpg" }]]),
    );

    render(<Probe />);

    expect(await screen.findByText("https://example.com/a.jpg")).toBeInTheDocument();
  });

  it("silently falls back when public profile reads are denied", async () => {
    const err = new Error("Missing or insufficient permissions.");
    Object.assign(err, { code: "permission-denied" });
    vi.mocked(getPublicUserAvatarProfiles).mockRejectedValue(err);

    render(<Probe />);

    await waitFor(() => {
      expect(getPublicUserAvatarProfiles).toHaveBeenCalledWith(["user-1"], scope.services.firestore, scope.services.auth, scope.viewer, scope.services);
    });
    expect(screen.getByText("fallback")).toBeInTheDocument();
    expect(logClientError).not.toHaveBeenCalled();
  });

  it("logs unexpected hydration failures", async () => {
    const err = new Error("network down");
    vi.mocked(getPublicUserAvatarProfiles).mockRejectedValue(err);

    render(<Probe />);

    await waitFor(() => {
      expect(logClientError).toHaveBeenCalledExactlyOnceWith("useHydratedSocialProfiles", err, { context: "test", userCount: 1 }, scope.services);
    });
  });
  it("prefers a caller's fresh image and masks old owner/provider hydration immediately", async () => {
    vi.mocked(getPublicUserAvatarProfiles).mockResolvedValueOnce(new Map([["user-1", { id: "user-1", nickname: "n", photoURL: "old-image" }]]));
    const view = render(<Probe />);
    expect(await screen.findByText("old-image")).toBeInTheDocument();
    view.rerender(<Probe image="fresh-caller-image" />);
    expect(screen.getByText("fresh-caller-image")).toBeInTheDocument();
    scope.viewer = { uid: "viewer-b" };
    vi.mocked(getPublicUserAvatarProfiles).mockResolvedValue(new Map());
    view.rerender(<Probe />);
    expect(screen.getByText("fallback")).toBeInTheDocument();
    await waitFor(() => expect(getPublicUserAvatarProfiles).toHaveBeenLastCalledWith(["user-1"], scope.services.firestore, scope.services.auth, scope.viewer, scope.services));
    scope.services = { firestore: {}, auth: {} };
    view.rerender(<Probe />);
    expect(screen.getByText("fallback")).toBeInTheDocument();
    await waitFor(() => expect(getPublicUserAvatarProfiles).toHaveBeenLastCalledWith(["user-1"], scope.services.firestore, scope.services.auth, scope.viewer, scope.services));
  });

  it("ignores an old session's delayed response after switching accounts", async () => {
    let finishOld!: (value: Awaited<ReturnType<typeof getPublicUserAvatarProfiles>>) => void;
    vi.mocked(getPublicUserAvatarProfiles).mockImplementationOnce(() => new Promise(resolve => { finishOld = resolve; }));
    const view = render(<Probe />);
    scope.viewer = { uid: "viewer-b" };
    vi.mocked(getPublicUserAvatarProfiles).mockResolvedValue(new Map([["user-1", { id: "user-1", nickname: "n", photoURL: "new-session-image" }]]));
    view.rerender(<Probe />);
    expect(await screen.findByText("new-session-image")).toBeInTheDocument();
    await act(async () => { finishOld(new Map([["user-1", { id: "user-1", nickname: "n", photoURL: "old-session-image" }]])); });
    expect(screen.getByText("new-session-image")).toBeInTheDocument();
    expect(screen.queryByText("old-session-image")).not.toBeInTheDocument();
  });

});
