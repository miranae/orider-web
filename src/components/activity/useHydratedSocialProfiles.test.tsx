import { render, screen, waitFor } from "@testing-library/react";
import { describe, expect, it, vi, beforeEach } from "vitest";
import { useHydratedSocialProfiles } from "./useHydratedSocialProfiles";
import { getPublicUserProfiles } from "../../services/publicProfiles";
import { logClientError } from "../../services/errorLogger";

vi.mock("../../services/publicProfiles", () => ({
  getPublicUserProfiles: vi.fn(),
}));

vi.mock("../../services/errorLogger", () => ({
  logClientError: vi.fn(),
}));

function Probe() {
  const items = useHydratedSocialProfiles(
    [{ userId: "user-1", nickname: "경", profileImage: null }],
    "test",
  );
  return <div>{items[0]?.profileImage ?? "fallback"}</div>;
}

describe("useHydratedSocialProfiles", () => {
  beforeEach(() => {
    vi.mocked(getPublicUserProfiles).mockReset();
    vi.mocked(logClientError).mockReset();
  });

  it("hydrates missing profile images", async () => {
    vi.mocked(getPublicUserProfiles).mockResolvedValue(
      new Map([["user-1", { id: "user-1", nickname: "경", photoURL: "https://example.com/a.jpg" }]]),
    );

    render(<Probe />);

    expect(await screen.findByText("https://example.com/a.jpg")).toBeInTheDocument();
  });

  it("silently falls back when public profile reads are denied", async () => {
    const err = new Error("Missing or insufficient permissions.");
    Object.assign(err, { code: "permission-denied" });
    vi.mocked(getPublicUserProfiles).mockRejectedValue(err);

    render(<Probe />);

    await waitFor(() => {
      expect(getPublicUserProfiles).toHaveBeenCalledWith(["user-1"]);
    });
    expect(screen.getByText("fallback")).toBeInTheDocument();
    expect(logClientError).not.toHaveBeenCalled();
  });

  it("logs unexpected hydration failures", async () => {
    const err = new Error("network down");
    vi.mocked(getPublicUserProfiles).mockRejectedValue(err);

    render(<Probe />);

    await waitFor(() => {
      expect(logClientError).toHaveBeenCalledWith("useHydratedSocialProfiles", err, { context: "test", userCount: 1 });
    });
  });
});
